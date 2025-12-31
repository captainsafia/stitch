/**
 * Finish stitch logic - transitions stitches to terminal statuses
 * with auto-detection, cascade behavior, and atomic operations.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { StitchDoc, StitchId, StitchStatus, StitchFrontmatter } from "./model.ts";
import { loadStitch, isInitialized } from "./store.ts";
import { getDescendants } from "./indexing.ts";
import { updateTimestamp } from "./frontmatter.ts";
import {
  NotInitializedError,
  StitchError,
  StitchNotFoundError,
  FinishForceRequiredError,
  InvalidSupersededByError,
} from "./errors.ts";

// Re-export error types for consumers
export { FinishForceRequiredError, InvalidSupersededByError };

/**
 * Terminal statuses that a stitch can be finished to
 */
export type TerminalStatus = "closed" | "superseded" | "abandoned";

/**
 * Options for finishing a stitch
 */
export interface FinishOptions {
  /** Target status (default: "closed", may be auto-detected to "abandoned") */
  status?: TerminalStatus;
  /** For superseded status, the ID of the replacing stitch */
  supersededBy?: StitchId;
  /** Override auto-abandoned detection */
  force?: boolean;
  /** Skip confirmation for cascade closes (for non-interactive mode) */
  skipConfirmation?: boolean;
}

/**
 * Result of a finish operation
 */
export interface FinishResult {
  /** All stitches that were finished */
  finished: FinishedStitch[];
  /** Warnings generated during the operation */
  warnings: string[];
  /** Whether auto-detection changed the status from the requested one */
  autoDetectedStatus: boolean;
  /** The final status applied */
  finalStatus: TerminalStatus;
}

/**
 * Information about a single finished stitch
 */
export interface FinishedStitch {
  id: StitchId;
  title: string;
  previousStatus: StitchStatus;
  newStatus: TerminalStatus;
}

/**
 * Information needed before confirming a finish operation
 */
export interface FinishPreview {
  /** The target stitch */
  target: StitchDoc;
  /** All stitches that will be affected (target + descendants) */
  affected: StitchDoc[];
  /** The final status that will be applied */
  finalStatus: TerminalStatus;
  /** Whether status was auto-detected */
  autoDetected: boolean;
  /** Warnings to show the user */
  warnings: string[];
  /** Whether confirmation is required (cascade affects 2+ stitches) */
  requiresConfirmation: boolean;
  /** Error if the operation cannot proceed without --force */
  forceRequired?: string;
}

/**
 * Check if a stitch has any linked commits (git.links array)
 */
function hasLinkedCommits(doc: StitchDoc): boolean {
  const links = doc.frontmatter.git?.links;
  return links !== undefined && links.length > 0;
}

/**
 * Detect if auto-abandoned status should be applied
 */
async function shouldAutoAbandon(
  doc: StitchDoc,
  descendants: StitchDoc[]
): Promise<{ autoAbandon: boolean; reason?: string }> {
  // Check for no linked commits
  if (!hasLinkedCommits(doc)) {
    return { autoAbandon: true, reason: "No linked commits" };
  }

  // Check for open children
  const openDescendants = descendants.filter((d) => d.frontmatter.status === "open");
  if (openDescendants.length > 0) {
    return { autoAbandon: true, reason: `Has ${openDescendants.length} open children` };
  }

  return { autoAbandon: false };
}

/**
 * Prepare a finish operation without executing it.
 * Returns information needed to confirm or abort the operation.
 */
export async function prepareFinish(
  repoRoot: string,
  id: StitchId,
  options: FinishOptions = {}
): Promise<FinishPreview> {
  if (!isInitialized(repoRoot)) {
    throw new NotInitializedError();
  }

  const { status = "closed", supersededBy, force = false } = options;
  const warnings: string[] = [];

  // Validate --by usage
  if (supersededBy && status !== "superseded") {
    throw new InvalidSupersededByError();
  }

  // Validate supersededBy stitch exists if provided
  if (supersededBy) {
    try {
      await loadStitch(repoRoot, supersededBy);
    } catch (error) {
      if (error instanceof StitchNotFoundError) {
        throw new StitchError(`Superseding stitch '${supersededBy}' not found`);
      }
      throw error;
    }
  }

  // Load target stitch
  const target = await loadStitch(repoRoot, id);

  // Get all descendants
  const descendantIds = await getDescendants(repoRoot, id);
  const descendants: StitchDoc[] = [];

  for (const descId of descendantIds) {
    try {
      const doc = await loadStitch(repoRoot, descId);
      descendants.push(doc);
    } catch {
      // Skip missing descendants
      warnings.push(`Warning: Could not load descendant '${descId}'`);
    }
  }

  // Determine final status with auto-detection
  let finalStatus: TerminalStatus = status;
  let autoDetected = false;
  let forceRequired: string | undefined;

  const autoAbandonCheck = await shouldAutoAbandon(target, descendants);

  if (autoAbandonCheck.autoAbandon) {
    if (status !== "abandoned") {
      // User requested non-abandoned status but auto-detection suggests abandoned
      if (force) {
        // Force flag overrides auto-detection
        warnings.push(
          `Warning: ${autoAbandonCheck.reason}. Forcing status to '${status}' as requested.`
        );
      } else {
        // Require force flag
        finalStatus = "abandoned";
        autoDetected = true;
        forceRequired = `Cannot set status to '${status}' when ${autoAbandonCheck.reason?.toLowerCase()}. Use --force to override, or --status=abandoned.`;
        warnings.push(
          `Warning: ${autoAbandonCheck.reason}. Marking as abandoned. Use --status=superseded if this work was replaced.`
        );
      }
    }
  }

  // All affected stitches (target + descendants with different status)
  const affected: StitchDoc[] = [target];
  for (const desc of descendants) {
    if (desc.frontmatter.status !== finalStatus) {
      affected.push(desc);
    }
  }

  // Determine if confirmation is required
  const requiresConfirmation = affected.length >= 2;

  return {
    target,
    affected,
    finalStatus,
    autoDetected,
    warnings,
    requiresConfirmation,
    forceRequired: force ? undefined : forceRequired,
  };
}

/**
 * Execute a finish operation.
 * This is atomic - all changes succeed or all are rolled back.
 */
export async function executeFinish(
  preview: FinishPreview,
  options: FinishOptions = {}
): Promise<FinishResult> {
  const { supersededBy } = options;

  // Check if force is required but not provided
  if (preview.forceRequired) {
    throw new FinishForceRequiredError(preview.forceRequired);
  }

  // Prepare all changes
  const updates: Array<{ doc: StitchDoc; originalContent: string; newContent: string }> = [];
  const finished: FinishedStitch[] = [];

  for (const doc of preview.affected) {
    // Read original content for rollback
    const originalContent = await readFile(doc.filePath, "utf-8");

    // Prepare updated frontmatter
    let updatedFrontmatter: StitchFrontmatter = {
      ...doc.frontmatter,
      status: preview.finalStatus,
    };

    // Add supersededBy to depends_on if provided and this is the target stitch
    if (supersededBy && doc.frontmatter.id === preview.target.frontmatter.id) {
      const existingDependsOn = updatedFrontmatter.relations?.depends_on ?? [];
      if (!existingDependsOn.includes(supersededBy)) {
        updatedFrontmatter = {
          ...updatedFrontmatter,
          relations: {
            ...updatedFrontmatter.relations,
            depends_on: [...existingDependsOn, supersededBy],
          },
        };
      }
    }

    // Update timestamp
    updatedFrontmatter = updateTimestamp(updatedFrontmatter);

    // Create updated doc
    const updatedDoc: StitchDoc = {
      ...doc,
      frontmatter: updatedFrontmatter,
    };

    // Serialize to get new content (reuse saveStitch logic pattern)
    const { serializeStitchFile } = await import("./frontmatter.ts");
    const newContent = serializeStitchFile(updatedFrontmatter, doc.body);

    updates.push({ doc: updatedDoc, originalContent, newContent });
    finished.push({
      id: doc.frontmatter.id,
      title: doc.frontmatter.title,
      previousStatus: doc.frontmatter.status,
      newStatus: preview.finalStatus,
    });
  }

  // Execute all writes atomically
  const writtenPaths: string[] = [];

  try {
    for (const update of updates) {
      await writeFile(update.doc.filePath, update.newContent, "utf-8");
      writtenPaths.push(update.doc.filePath);
    }
  } catch (error) {
    // Rollback all written files
    for (let i = 0; i < writtenPaths.length; i++) {
      try {
        const path = writtenPaths[i]!;
        const update = updates[i]!;
        await writeFile(path, update.originalContent, "utf-8");
      } catch {
        // Best effort rollback
      }
    }
    throw error;
  }

  return {
    finished,
    warnings: preview.warnings,
    autoDetectedStatus: preview.autoDetected,
    finalStatus: preview.finalStatus,
  };
}

/**
 * High-level finish function that prepares and executes in one call.
 * Use prepareFinish + executeFinish separately when confirmation is needed.
 */
export async function finishStitch(
  repoRoot: string,
  id: StitchId,
  options: FinishOptions = {}
): Promise<FinishResult> {
  const preview = await prepareFinish(repoRoot, id, options);
  return executeFinish(preview, options);
}
