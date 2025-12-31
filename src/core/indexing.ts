/**
 * Parent-children index management for efficient stitch lookups.
 * Maintains a persistent index file at .stitch/index.json
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { StitchId } from "./model.ts";
import { getStitchDir, listStitches, isInitialized } from "./store.ts";
import { NotInitializedError } from "./errors.ts";

const INDEX_FILE = "index.json";
const INDEX_VERSION = 1;

/**
 * Index structure stored in .stitch/index.json
 */
export type StitchIndex = {
  version: number;
  /** Map of parent stitch ID to array of child stitch IDs */
  children: Record<StitchId, StitchId[]>;
  updated_at: string;
};

/**
 * Get the path to the index file
 */
export function getIndexFilePath(repoRoot: string): string {
  if (!isInitialized(repoRoot)) {
      throw new NotInitializedError();
    }

  return join(getStitchDir(repoRoot), INDEX_FILE);
}

/**
 * Create an empty index
 */
function createEmptyIndex(): StitchIndex {
  return {
    version: INDEX_VERSION,
    children: {},
    updated_at: new Date().toISOString(),
  };
}

/**
 * Load the index from disk, returning null if it doesn't exist or is invalid
 */
export async function loadIndex(repoRoot: string): Promise<StitchIndex | null> {
  const indexPath = getIndexFilePath(repoRoot);

  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    const content = await readFile(indexPath, "utf-8");
    const parsed = JSON.parse(content) as StitchIndex;

    // Validate version
    if (parsed.version !== INDEX_VERSION) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save the index to disk
 */
export async function saveIndex(repoRoot: string, index: StitchIndex): Promise<void> {
  const indexPath = getIndexFilePath(repoRoot);
  const content = JSON.stringify(index, null, 2);
  await writeFile(indexPath, content, "utf-8");
}

/**
 * Rebuild the index by scanning all stitch files
 */
export async function rebuildIndex(repoRoot: string): Promise<StitchIndex> {
  const stitches = await listStitches(repoRoot);
  const index = createEmptyIndex();

  for (const doc of stitches) {
    const parentId = doc.frontmatter.relations?.parent;
    if (parentId) {
      if (!index.children[parentId]) {
        index.children[parentId] = [];
      }
      index.children[parentId].push(doc.frontmatter.id);
    }
  }

  await saveIndex(repoRoot, index);
  return index;
}

/**
 * Get or rebuild the index
 */
export async function getIndex(repoRoot: string): Promise<StitchIndex> {
  let index = await loadIndex(repoRoot);

  if (!index) {
    index = await rebuildIndex(repoRoot);
  }

  return index;
}

/**
 * Get direct children of a stitch
 */
export async function getChildren(repoRoot: string, id: StitchId): Promise<StitchId[]> {
  const index = await getIndex(repoRoot);
  return index.children[id] ?? [];
}

/**
 * Get all descendants (children, grandchildren, etc.) of a stitch
 */
export async function getDescendants(repoRoot: string, id: StitchId): Promise<StitchId[]> {
  const index = await getIndex(repoRoot);
  const descendants: StitchId[] = [];
  const queue: StitchId[] = [id];
  const visited = new Set<StitchId>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    const children = index.children[currentId] ?? [];
    for (const childId of children) {
      descendants.push(childId);
      queue.push(childId);
    }
  }

  return descendants;
}

/**
 * Add a child to the index
 */
export async function addChildToIndex(
  repoRoot: string,
  parentId: StitchId,
  childId: StitchId
): Promise<void> {
  const index = await getIndex(repoRoot);

  if (!index.children[parentId]) {
    index.children[parentId] = [];
  }

  // Avoid duplicates
  if (!index.children[parentId].includes(childId)) {
    index.children[parentId].push(childId);
    index.updated_at = new Date().toISOString();
    await saveIndex(repoRoot, index);
  }
}

/**
 * Remove a child from the index
 */
export async function removeChildFromIndex(
  repoRoot: string,
  parentId: StitchId,
  childId: StitchId
): Promise<void> {
  const index = await getIndex(repoRoot);

  if (index.children[parentId]) {
    index.children[parentId] = index.children[parentId].filter((id) => id !== childId);
    if (index.children[parentId].length === 0) {
      delete index.children[parentId];
    }
    index.updated_at = new Date().toISOString();
    await saveIndex(repoRoot, index);
  }
}

/**
 * Check if the index file exists
 */
export function indexExists(repoRoot: string): boolean {
  return existsSync(getIndexFilePath(repoRoot));
}
