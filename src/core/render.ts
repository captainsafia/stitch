import type { StitchDoc, BlameLine, StatusResult } from "./model.ts";

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
