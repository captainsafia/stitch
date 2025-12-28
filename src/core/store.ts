import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { StitchDoc, StitchFrontmatter, StitchId, ListFilter } from "./model.ts";
import {
  NotInitializedError,
  NoCurrentStitchError,
  StitchNotFoundError,
} from "./errors.ts";
import { parseStitchFile, serializeStitchFile, updateTimestamp } from "./frontmatter.ts";
import { generateStitchId } from "./ids.ts";
import { DEFAULT_STITCH_BODY } from "./model.ts";

const STITCH_DIR = ".stitch";
const STITCHES_SUBDIR = "stitches";
const CURRENT_FILE = "current";

/**
 * Get the path to the .stitch directory
 */
export function getStitchDir(repoRoot: string): string {
  return join(repoRoot, STITCH_DIR);
}

/**
 * Get the path to the stitches subdirectory
 */
export function getStitchesDir(repoRoot: string): string {
  return join(repoRoot, STITCH_DIR, STITCHES_SUBDIR);
}

/**
 * Get the path to the current file
 */
export function getCurrentFilePath(repoRoot: string): string {
  return join(repoRoot, STITCH_DIR, CURRENT_FILE);
}

/**
 * Check if stitch is initialized in the repository
 */
export function isInitialized(repoRoot: string): boolean {
  return existsSync(getStitchDir(repoRoot));
}

/**
 * Initialize stitch in the repository
 */
export async function initializeStitch(repoRoot: string): Promise<void> {
  const stitchesDir = getStitchesDir(repoRoot);
  const currentPath = getCurrentFilePath(repoRoot);

  await mkdir(stitchesDir, { recursive: true });

  if (!existsSync(currentPath)) {
    await writeFile(currentPath, "", "utf-8");
  }
}

/**
 * Get the current stitch ID
 */
export async function getCurrentStitchId(
  repoRoot: string
): Promise<StitchId | null> {
  if (!isInitialized(repoRoot)) {
    throw new NotInitializedError();
  }

  const currentPath = getCurrentFilePath(repoRoot);
  const content = await readFile(currentPath, "utf-8");
  const trimmed = content.trim();
  return trimmed || null;
}

/**
 * Set the current stitch ID
 */
export async function setCurrentStitchId(
  repoRoot: string,
  id: StitchId | null
): Promise<void> {
  if (!isInitialized(repoRoot)) {
    throw new NotInitializedError();
  }

  const currentPath = getCurrentFilePath(repoRoot);
  await writeFile(currentPath, id ?? "", "utf-8");
}

/**
 * Get the file path for a stitch ID
 */
export function getStitchFilePath(repoRoot: string, id: StitchId): string {
  return join(getStitchesDir(repoRoot), `${id}.md`);
}

/**
 * Create a new stitch document
 */
export async function createStitch(
  repoRoot: string,
  title: string,
  parentId?: StitchId
): Promise<StitchDoc> {
  if (!isInitialized(repoRoot)) {
    throw new NotInitializedError();
  }

  const id = generateStitchId();
  const now = new Date().toISOString();

  const frontmatter: StitchFrontmatter = {
    id,
    title,
    status: "open",
    created_at: now,
    updated_at: now,
    provenance: "human",
    confidence: "medium",
  };

  if (parentId) {
    frontmatter.relations = { parent: parentId };
  }

  const filePath = getStitchFilePath(repoRoot, id);
  const content = serializeStitchFile(frontmatter, DEFAULT_STITCH_BODY);

  await writeFile(filePath, content, "utf-8");

  return {
    frontmatter,
    body: DEFAULT_STITCH_BODY,
    filePath,
  };
}

/**
 * Load a stitch document by ID
 */
export async function loadStitch(
  repoRoot: string,
  id: StitchId
): Promise<StitchDoc> {
  if (!isInitialized(repoRoot)) {
    throw new NotInitializedError();
  }

  const filePath = getStitchFilePath(repoRoot, id);

  if (!existsSync(filePath)) {
    throw new StitchNotFoundError(id);
  }

  const content = await readFile(filePath, "utf-8");
  const { frontmatter, body } = parseStitchFile(content);

  return { frontmatter, body, filePath };
}

/**
 * Save a stitch document
 */
export async function saveStitch(
  repoRoot: string,
  doc: StitchDoc
): Promise<StitchDoc> {
  if (!isInitialized(repoRoot)) {
    throw new NotInitializedError();
  }

  const updatedFrontmatter = updateTimestamp(doc.frontmatter);
  const content = serializeStitchFile(updatedFrontmatter, doc.body);

  await writeFile(doc.filePath, content, "utf-8");

  return {
    ...doc,
    frontmatter: updatedFrontmatter,
  };
}

/**
 * List all stitch documents
 */
export async function listStitches(
  repoRoot: string,
  filter?: ListFilter
): Promise<StitchDoc[]> {
  if (!isInitialized(repoRoot)) {
    throw new NotInitializedError();
  }

  const stitchesDir = getStitchesDir(repoRoot);

  if (!existsSync(stitchesDir)) {
    return [];
  }

  const files = await readdir(stitchesDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  const docs: StitchDoc[] = [];

  for (const file of mdFiles) {
    const filePath = join(stitchesDir, file);
    try {
      const content = await readFile(filePath, "utf-8");
      const { frontmatter, body } = parseStitchFile(content);

      if (filter?.status && frontmatter.status !== filter.status) {
        continue;
      }

      docs.push({ frontmatter, body, filePath });
    } catch {
      // Skip malformed files
      continue;
    }
  }

  // Sort by updated_at descending (newest first)
  docs.sort(
    (a, b) =>
      new Date(b.frontmatter.updated_at).getTime() -
      new Date(a.frontmatter.updated_at).getTime()
  );

  return docs;
}

/**
 * Get the lineage (ancestor chain) for a stitch
 */
export async function getLineage(
  repoRoot: string,
  id: StitchId
): Promise<StitchId[]> {
  const lineage: StitchId[] = [];
  let currentId: StitchId | undefined = id;

  const visited = new Set<StitchId>();

  while (currentId) {
    if (visited.has(currentId)) {
      // Cycle detected, stop
      break;
    }
    visited.add(currentId);

    try {
      const doc = await loadStitch(repoRoot, currentId);
      lineage.push(currentId);
      currentId = doc.frontmatter.relations?.parent;
    } catch {
      // Parent not found, stop
      break;
    }
  }

  return lineage;
}

/**
 * Require the current stitch ID (throws if none)
 */
export async function requireCurrentStitchId(
  repoRoot: string
): Promise<StitchId> {
  const current = await getCurrentStitchId(repoRoot);
  if (!current) {
    throw new NoCurrentStitchError();
  }
  return current;
}
