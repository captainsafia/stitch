import { Mutex } from "async-mutex";
import type { StitchDoc, StitchFrontmatter, ListFilter } from "../core/model.ts";
import {
  initializeStitch,
  isInitialized,
  createStitch,
  loadStitch,
  listStitches,
  saveStitch,
  getCurrentStitchId,
  setCurrentStitchId,
  requireCurrentStitchId,
} from "../core/store.ts";
import { addCommitLink, addRangeLink, addStagedDiffFingerprint } from "../core/link.ts";
import { stitchBlame } from "../core/blame.ts";
import { getRepoRoot } from "../core/git.ts";
import { updateTimestamp } from "../core/frontmatter.ts";
import { RepoNotFoundError } from "../core/errors.ts";
import { prepareFinish, executeFinish, type TerminalStatus } from "../core/finish.ts";
import {
  type StitchCreateInput,
  type StitchGetInput,
  type StitchListInput,
  type StitchUpdateFrontmatterInput,
  type StitchUpdateBodyInput,
  type StitchLinkCommitInput,
  type StitchLinkRangeInput,
  type StitchLinkStagedDiffInput,
  type StitchBlameInput,
  type StitchFinishInput,
  type StitchCreateOutput,
  type StitchGetOutput,
  type StitchListOutput,
  type StitchUpdateFrontmatterOutput,
  type StitchUpdateBodyOutput,
  type StitchLinkCommitOutput,
  type StitchLinkRangeOutput,
  type StitchLinkStagedDiffOutput,
  type StitchBlameOutput,
  type StitchFinishOutput,
  docToCreateOutput,
  docToGetOutput,
  docToListSummary,
  blameToOutput,
} from "./schemas.ts";

/**
 * Keyed mutex map for concurrent write protection.
 * Each stitch ID gets its own mutex to prevent concurrent writes to the same file.
 * Uses reference counting to clean up mutexes when no longer in use.
 */
const mutexMap = new Map<string, { mutex: Mutex; refCount: number }>();

/**
 * Get or create a mutex for the given stitch ID, incrementing the reference count
 */
function acquireMutexRef(stitchId: string): Mutex {
  let entry = mutexMap.get(stitchId);
  if (!entry) {
    entry = { mutex: new Mutex(), refCount: 0 };
    mutexMap.set(stitchId, entry);
  }
  entry.refCount++;
  return entry.mutex;
}

/**
 * Release a mutex reference, cleaning up if no longer in use
 */
function releaseMutexRef(stitchId: string): void {
  const entry = mutexMap.get(stitchId);
  if (entry) {
    entry.refCount--;
    if (entry.refCount === 0) {
      mutexMap.delete(stitchId);
    }
  }
}

/**
 * Execute a function with a mutex held for the given stitch ID
 */
async function withStitchLock<T>(stitchId: string, fn: () => Promise<T>): Promise<T> {
  const mutex = acquireMutexRef(stitchId);
  try {
    return await mutex.runExclusive(fn);
  } finally {
    releaseMutexRef(stitchId);
  }
}

/**
 * Validate that the path is a valid git repository
 */
async function validateRepoRoot(repoRoot: string): Promise<void> {
  try {
    await getRepoRoot(repoRoot);
  } catch {
    throw new RepoNotFoundError(repoRoot);
  }
}

/**
 * Ensure stitch is initialized (auto-init if needed for create)
 */
async function ensureInitialized(repoRoot: string): Promise<void> {
  if (!isInitialized(repoRoot)) {
    await initializeStitch(repoRoot);
  }
}

/**
 * Create a new stitch
 */
export async function handleStitchCreate(
  input: StitchCreateInput
): Promise<StitchCreateOutput> {
  await validateRepoRoot(input.repoRoot);
  await ensureInitialized(input.repoRoot);

  const doc = await createStitch(input.repoRoot, input.title, input.parent);

  // Handle dependsOn if provided
  if (input.dependsOn && input.dependsOn.length > 0) {
    const updatedDoc: StitchDoc = {
      ...doc,
      frontmatter: {
        ...doc.frontmatter,
        relations: {
          ...doc.frontmatter.relations,
          depends_on: input.dependsOn,
        },
      },
    };
    await saveStitch(input.repoRoot, updatedDoc);
    return docToCreateOutput(updatedDoc);
  }

  return docToCreateOutput(doc);
}

/**
 * Get a stitch by ID
 */
export async function handleStitchGet(
  input: StitchGetInput
): Promise<StitchGetOutput> {
  await validateRepoRoot(input.repoRoot);
  const doc = await loadStitch(input.repoRoot, input.stitchId);
  return docToGetOutput(doc);
}

/**
 * List stitches with optional filters
 */
export async function handleStitchList(
  input: StitchListInput
): Promise<StitchListOutput> {
  await validateRepoRoot(input.repoRoot);

  const filter: ListFilter | undefined = input.status
    ? { status: input.status }
    : undefined;

  let docs = await listStitches(input.repoRoot, filter);

  // Filter by tag if specified
  if (input.tag) {
    docs = docs.filter((doc) =>
      doc.frontmatter.tags?.includes(input.tag!)
    );
  }

  return docs.map(docToListSummary);
}

/**
 * Update stitch frontmatter with a patch
 */
export async function handleStitchUpdateFrontmatter(
  input: StitchUpdateFrontmatterInput
): Promise<StitchUpdateFrontmatterOutput> {
  await validateRepoRoot(input.repoRoot);

  return withStitchLock(input.stitchId, async () => {
    const doc = await loadStitch(input.repoRoot, input.stitchId);

    // Apply patch to frontmatter (shallow merge, with special handling for nested objects)
    const patchedFrontmatter: StitchFrontmatter = {
      ...doc.frontmatter,
    };

    for (const [key, value] of Object.entries(input.patch)) {
      // Don't allow changing id
      if (key === "id") continue;

      // Handle nested objects
      if (key === "relations" && typeof value === "object" && value !== null) {
        patchedFrontmatter.relations = {
          ...patchedFrontmatter.relations,
          ...(value as Record<string, unknown>),
        } as StitchFrontmatter["relations"];
      } else if (key === "git" && typeof value === "object" && value !== null) {
        patchedFrontmatter.git = {
          ...patchedFrontmatter.git,
          ...(value as Record<string, unknown>),
        } as StitchFrontmatter["git"];
      } else if (key === "scope" && typeof value === "object" && value !== null) {
        patchedFrontmatter.scope = {
          ...patchedFrontmatter.scope,
          ...(value as Record<string, unknown>),
        } as StitchFrontmatter["scope"];
      } else {
        (patchedFrontmatter as Record<string, unknown>)[key] = value;
      }
    }

    const updatedDoc: StitchDoc = {
      ...doc,
      frontmatter: updateTimestamp(patchedFrontmatter),
    };

    await saveStitch(input.repoRoot, updatedDoc);

    return { frontmatter: updatedDoc.frontmatter };
  });
}

/**
 * Update stitch body
 */
export async function handleStitchUpdateBody(
  input: StitchUpdateBodyInput
): Promise<StitchUpdateBodyOutput> {
  await validateRepoRoot(input.repoRoot);

  return withStitchLock(input.stitchId, async () => {
    const doc = await loadStitch(input.repoRoot, input.stitchId);

    const updatedDoc: StitchDoc = {
      ...doc,
      body: input.bodyMarkdown,
      frontmatter: updateTimestamp(doc.frontmatter),
    };

    await saveStitch(input.repoRoot, updatedDoc);

    return { ok: true };
  });
}

/**
 * Link a commit to a stitch
 */
export async function handleStitchLinkCommit(
  input: StitchLinkCommitInput
): Promise<StitchLinkCommitOutput> {
  await validateRepoRoot(input.repoRoot);

  return withStitchLock(input.stitchId, async () => {
    const doc = await loadStitch(input.repoRoot, input.stitchId);
    await addCommitLink(input.repoRoot, doc, input.sha);
    return { ok: true };
  });
}

/**
 * Link a commit range to a stitch
 */
export async function handleStitchLinkRange(
  input: StitchLinkRangeInput
): Promise<StitchLinkRangeOutput> {
  await validateRepoRoot(input.repoRoot);

  return withStitchLock(input.stitchId, async () => {
    const doc = await loadStitch(input.repoRoot, input.stitchId);
    await addRangeLink(input.repoRoot, doc, input.range);
    return { ok: true };
  });
}

/**
 * Link staged diff fingerprint to a stitch
 */
export async function handleStitchLinkStagedDiff(
  input: StitchLinkStagedDiffInput
): Promise<StitchLinkStagedDiffOutput> {
  await validateRepoRoot(input.repoRoot);

  return withStitchLock(input.stitchId, async () => {
    const doc = await loadStitch(input.repoRoot, input.stitchId);
    const { fingerprint } = await addStagedDiffFingerprint(input.repoRoot, doc);
    return { fingerprint };
  });
}

/**
 * Get stitch blame for a file
 */
export async function handleStitchBlame(
  input: StitchBlameInput
): Promise<StitchBlameOutput> {
  await validateRepoRoot(input.repoRoot);

  let blameLines = await stitchBlame(input.repoRoot, input.path);

  // Apply line range filter if specified
  if (input.lineStart !== undefined || input.lineEnd !== undefined) {
    const start = input.lineStart ?? 1;
    const end = input.lineEnd ?? Number.MAX_SAFE_INTEGER;

    blameLines = blameLines.filter(
      (line) => line.line >= start && line.line <= end
    );
  }

  return blameToOutput(input.path, blameLines);
}

/**
 * Finish a stitch (transition to terminal status)
 */
export async function handleStitchFinish(
  input: StitchFinishInput
): Promise<StitchFinishOutput> {
  await validateRepoRoot(input.repoRoot);

  // Get the stitch ID (use current if not specified)
  const stitchId = input.stitchId ?? (await requireCurrentStitchId(input.repoRoot));

  const finishOptions = {
    status: input.status as TerminalStatus | undefined,
    supersededBy: input.supersededBy,
    force: input.force ?? false,
    skipConfirmation: input.skipConfirmation ?? true, // Default to true for MCP (non-interactive)
  };

  // Prepare and execute finish
  const preview = await prepareFinish(input.repoRoot, stitchId, finishOptions);
  const result = await executeFinish(preview, finishOptions);

  // Clear current pointer if the finished stitch was current
  const currentId = await getCurrentStitchId(input.repoRoot);
  if (currentId && result.finished.some((f) => f.id === currentId)) {
    await setCurrentStitchId(input.repoRoot, null);
  }

  return {
    finishedStitches: result.finished.map((f) => ({
      id: f.id,
      title: f.title,
      previousStatus: f.previousStatus,
      newStatus: f.newStatus,
    })),
    warnings: result.warnings,
    finalStatus: result.finalStatus,
    autoDetectedStatus: result.autoDetectedStatus,
  };
}
