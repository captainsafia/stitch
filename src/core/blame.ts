import type { BlameLine, StitchDoc, StitchId } from "./model.ts";
import { blameFile, getCommitsInRange } from "./git.ts";
import { listStitches } from "./store.ts";

/**
 * Build a mapping from commit SHA to stitch IDs
 */
async function buildCommitToStitchMap(
  repoRoot: string,
  stitches: StitchDoc[]
): Promise<Map<string, StitchId[]>> {
  const map = new Map<string, StitchId[]>();

  for (const doc of stitches) {
    const links = doc.frontmatter.git?.links ?? [];

    for (const link of links) {
      if (link.kind === "commit") {
        const existing = map.get(link.sha) ?? [];
        if (!existing.includes(doc.frontmatter.id)) {
          map.set(link.sha, [...existing, doc.frontmatter.id]);
        }
      } else if (link.kind === "range") {
        // Expand range to commits
        const commits = await getCommitsInRange(link.range, repoRoot);
        for (const sha of commits) {
          const existing = map.get(sha) ?? [];
          if (!existing.includes(doc.frontmatter.id)) {
            map.set(sha, [...existing, doc.frontmatter.id]);
          }
        }
      }
    }
  }

  return map;
}

/**
 * Perform stitch blame on a file
 */
export async function stitchBlame(
  repoRoot: string,
  filePath: string
): Promise<BlameLine[]> {
  // Get git blame entries
  const blameEntries = await blameFile(filePath, repoRoot);

  // Load all stitches
  const stitches = await listStitches(repoRoot);

  // Build commit -> stitch mapping
  const commitMap = await buildCommitToStitchMap(repoRoot, stitches);

  // Map blame entries to BlameLine results
  const result: BlameLine[] = blameEntries.map((entry) => ({
    line: entry.lineNumber,
    sha: entry.sha,
    stitchIds: commitMap.get(entry.sha) ?? [],
    text: entry.lineText,
  }));

  return result;
}

/**
 * Get unique stitch IDs from blame results
 */
export function getUniqueStitchIds(blameLines: BlameLine[]): StitchId[] {
  const ids = new Set<StitchId>();
  for (const line of blameLines) {
    for (const id of line.stitchIds) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Calculate blame statistics
 */
export function getBlameStats(blameLines: BlameLine[]): {
  total: number;
  stitched: number;
  unstitched: number;
  byStitch: Map<StitchId, number>;
} {
  const byStitch = new Map<StitchId, number>();
  let stitched = 0;
  let unstitched = 0;

  for (const line of blameLines) {
    if (line.stitchIds.length > 0) {
      stitched++;
      for (const id of line.stitchIds) {
        byStitch.set(id, (byStitch.get(id) ?? 0) + 1);
      }
    } else {
      unstitched++;
    }
  }

  return {
    total: blameLines.length,
    stitched,
    unstitched,
    byStitch,
  };
}
