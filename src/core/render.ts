import type { StitchDoc, BlameLine, StatusResult } from "./model.ts";
import type { FinishResult, FinishPreview } from "./finish.ts";

/**
 * Render a list of stitches as a table
 */
export function renderStitchList(stitches: StitchDoc[]): string {
  if (stitches.length === 0) {
    return "No stitches found.";
  }

  const lines: string[] = [];

  // Header
  lines.push("ID                  STATUS      TITLE");
  lines.push("─".repeat(60));

  for (const doc of stitches) {
    const fm = doc.frontmatter;
    const id = fm.id.padEnd(18);
    const status = fm.status.padEnd(10);
    const title = truncate(fm.title, 30);
    lines.push(`${id}  ${status}  ${title}`);
  }

  return lines.join("\n");
}

/**
 * Render status information
 */
export function renderStatus(status: StatusResult): string {
  const lines: string[] = [];

  if (status.current) {
    lines.push(`Current stitch: ${status.current}`);

    if (status.lineage.length > 1) {
      lines.push("");
      lines.push("Lineage:");
      for (let i = 0; i < status.lineage.length; i++) {
        const prefix = i === 0 ? "→ " : "  ";
        const indent = "  ".repeat(i);
        lines.push(`${indent}${prefix}${status.lineage[i]}`);
      }
    }
  } else {
    lines.push("No current stitch.");
    lines.push("");
    lines.push("Start a new stitch with: stitch start <title>");
    lines.push("Or switch to an existing one: stitch switch <id>");
  }

  return lines.join("\n");
}

/**
 * Render a stitch document for display
 */
export function renderStitchDoc(doc: StitchDoc): string {
  const fm = doc.frontmatter;
  const lines: string[] = [];

  lines.push(`# ${fm.title}`);
  lines.push("");
  lines.push(`ID: ${fm.id}`);
  lines.push(`Status: ${fm.status}`);
  lines.push(`Created: ${formatDate(fm.created_at)}`);
  lines.push(`Updated: ${formatDate(fm.updated_at)}`);

  if (fm.provenance) {
    lines.push(`Provenance: ${fm.provenance}`);
  }
  if (fm.confidence) {
    lines.push(`Confidence: ${fm.confidence}`);
  }
  if (fm.tags && fm.tags.length > 0) {
    lines.push(`Tags: ${fm.tags.join(", ")}`);
  }

  if (fm.relations?.parent) {
    lines.push(`Parent: ${fm.relations.parent}`);
  }
  if (fm.relations?.depends_on && fm.relations.depends_on.length > 0) {
    lines.push(`Depends on: ${fm.relations.depends_on.join(", ")}`);
  }

  if (fm.git?.links && fm.git.links.length > 0) {
    lines.push("");
    lines.push("Git links:");
    for (const link of fm.git.links) {
      if (link.kind === "commit") {
        lines.push(`  - commit: ${link.sha.slice(0, 8)}`);
      } else {
        lines.push(`  - range: ${link.range}`);
      }
    }
  }

  if (doc.body.trim()) {
    lines.push("");
    lines.push("─".repeat(40));
    lines.push("");
    lines.push(doc.body.trim());
  }

  return lines.join("\n");
}

/**
 * Render blame output in plain text format
 */
export function renderBlamePlain(blameLines: BlameLine[]): string {
  if (blameLines.length === 0) {
    return "No blame information available.";
  }

  const lines: string[] = [];
  const maxLineNum = Math.max(...blameLines.map((b) => b.line));
  const lineNumWidth = String(maxLineNum).length;

  for (const bl of blameLines) {
    const lineNum = String(bl.line).padStart(lineNumWidth);
    const sha = bl.sha.slice(0, 8);
    const stitch =
      bl.stitchIds.length > 0 ? bl.stitchIds[0] : "unstitched";
    const stitchPadded = (stitch ?? "unstitched").padEnd(18);

    lines.push(`${lineNum} │ ${sha} │ ${stitchPadded} │ ${bl.text}`);
  }

  return lines.join("\n");
}

/**
 * Render blame output as JSON
 */
export function renderBlameJson(blameLines: BlameLine[]): string {
  return JSON.stringify(blameLines, null, 2);
}

/**
 * Render a list of stitches as JSON
 */
export function renderStitchListJson(stitches: StitchDoc[]): string {
  const items = stitches.map((doc) => ({
    id: doc.frontmatter.id,
    title: doc.frontmatter.title,
    status: doc.frontmatter.status,
    created_at: doc.frontmatter.created_at,
    updated_at: doc.frontmatter.updated_at,
    provenance: doc.frontmatter.provenance,
    confidence: doc.frontmatter.confidence,
    tags: doc.frontmatter.tags,
    parent: doc.frontmatter.relations?.parent,
    filePath: doc.filePath,
  }));
  return JSON.stringify(items, null, 2);
}

/**
 * Render status information as JSON
 */
export function renderStatusJson(status: StatusResult): string {
  return JSON.stringify(status, null, 2);
}

/**
 * Format an ISO date string for display
 */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

/**
 * Truncate a string to a maximum length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Render a success message
 */
export function renderSuccess(message: string): string {
  return `✓ ${message}`;
}

/**
 * Render an info message
 */
export function renderInfo(message: string): string {
  return message;
}

/**
 * Render a warning message
 */
export function renderWarning(message: string): string {
  return `⚠ ${message}`;
}

/**
 * Render finish preview for confirmation prompt
 */
export function renderFinishPreview(preview: FinishPreview): string {
  const lines: string[] = [];

  lines.push(`This will finish ${preview.affected.length} stitch${preview.affected.length > 1 ? "es" : ""}:`);
  lines.push("");

  for (const doc of preview.affected) {
    const isTarget = doc.frontmatter.id === preview.target.frontmatter.id;
    const prefix = isTarget ? "  → " : "    ";
    const statusChange = doc.frontmatter.status !== preview.finalStatus
      ? ` (${doc.frontmatter.status} → ${preview.finalStatus})`
      : ` (already ${preview.finalStatus})`;
    lines.push(`${prefix}${doc.frontmatter.id}: ${truncate(doc.frontmatter.title, 40)}${statusChange}`);
  }

  if (preview.warnings.length > 0) {
    lines.push("");
    for (const warning of preview.warnings) {
      lines.push(renderWarning(warning));
    }
  }

  return lines.join("\n");
}

/**
 * Render finish result
 */
export function renderFinishResult(result: FinishResult): string {
  const lines: string[] = [];

  if (result.finished.length === 0) {
    return "No stitches were finished.";
  }

  const targetStitch = result.finished[0]!;
  const childCount = result.finished.length - 1;

  lines.push(
    renderSuccess(
      `Finished stitch ${targetStitch.id} (status: ${result.finalStatus})`
    )
  );
  lines.push(`  Title: ${targetStitch.title}`);

  if (result.autoDetectedStatus) {
    lines.push(`  Reason: Auto-detected based on stitch state`);
  }

  if (childCount > 0) {
    lines.push(`  Children finished: ${childCount}`);
    for (let i = 1; i < result.finished.length; i++) {
      const child = result.finished[i]!;
      lines.push(`    - ${child.id}: ${truncate(child.title, 30)}`);
    }
  }

  // Show warnings at the end
  if (result.warnings.length > 0) {
    lines.push("");
    for (const warning of result.warnings) {
      if (!warning.startsWith("Warning:")) {
        lines.push(renderWarning(warning));
      } else {
        lines.push(`⚠ ${warning}`);
      }
    }
  }

  return lines.join("\n");
}
