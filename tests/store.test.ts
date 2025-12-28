import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import {
  initializeStitch,
  isInitialized,
  createStitch,
  loadStitch,
  listStitches,
  getCurrentStitchId,
  setCurrentStitchId,
  getLineage,
} from "../src/core/store.ts";
import { NotInitializedError, StitchNotFoundError } from "../src/core/errors.ts";

describe("Store", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `stitch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    // Initialize as a git repo
    await $`git init`.cwd(testDir).quiet();
    await $`git config user.email "test@test.com"`.cwd(testDir).quiet();
    await $`git config user.name "Test User"`.cwd(testDir).quiet();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("initializeStitch", () => {
    test("creates .stitch directory structure", async () => {
      expect(isInitialized(testDir)).toBe(false);

      await initializeStitch(testDir);

      expect(isInitialized(testDir)).toBe(true);
    });

    test("idempotent initialization", async () => {
      await initializeStitch(testDir);
      await initializeStitch(testDir);

      expect(isInitialized(testDir)).toBe(true);
    });
  });

  describe("getCurrentStitchId / setCurrentStitchId", () => {
    test("returns null when no current stitch", async () => {
      await initializeStitch(testDir);

      const current = await getCurrentStitchId(testDir);
      expect(current).toBeNull();
    });

    test("sets and gets current stitch", async () => {
      await initializeStitch(testDir);

      await setCurrentStitchId(testDir, "S-20251228-abcd");
      const current = await getCurrentStitchId(testDir);

      expect(current).toBe("S-20251228-abcd");
    });

    test("throws when not initialized", async () => {
      await expect(getCurrentStitchId(testDir)).rejects.toThrow(
        NotInitializedError
      );
    });
  });

  describe("createStitch", () => {
    test("creates stitch file with frontmatter", async () => {
      await initializeStitch(testDir);

      const doc = await createStitch(testDir, "Test stitch");

      expect(doc.frontmatter.title).toBe("Test stitch");
      expect(doc.frontmatter.status).toBe("open");
      expect(doc.frontmatter.id).toMatch(/^S-\d{8}-[a-f0-9]{4}$/);
    });

    test("creates child stitch with parent relation", async () => {
      await initializeStitch(testDir);

      const parent = await createStitch(testDir, "Parent");
      const child = await createStitch(testDir, "Child", parent.frontmatter.id);

      expect(child.frontmatter.relations?.parent).toBe(parent.frontmatter.id);
    });

    test("throws when not initialized", async () => {
      await expect(createStitch(testDir, "Test")).rejects.toThrow(
        NotInitializedError
      );
    });
  });

  describe("loadStitch", () => {
    test("loads existing stitch", async () => {
      await initializeStitch(testDir);
      const created = await createStitch(testDir, "Test stitch");

      const loaded = await loadStitch(testDir, created.frontmatter.id);

      expect(loaded.frontmatter.id).toBe(created.frontmatter.id);
      expect(loaded.frontmatter.title).toBe("Test stitch");
    });

    test("throws for non-existent stitch", async () => {
      await initializeStitch(testDir);

      await expect(loadStitch(testDir, "S-20251228-0000")).rejects.toThrow(
        StitchNotFoundError
      );
    });
  });

  describe("listStitches", () => {
    test("lists all stitches", async () => {
      await initializeStitch(testDir);
      await createStitch(testDir, "First");
      await createStitch(testDir, "Second");
      await createStitch(testDir, "Third");

      const stitches = await listStitches(testDir);

      expect(stitches).toHaveLength(3);
    });

    test("filters by status", async () => {
      await initializeStitch(testDir);
      const doc1 = await createStitch(testDir, "Open one");
      await createStitch(testDir, "Open two");

      // Manually change one to closed
      const content = await Bun.file(doc1.filePath).text();
      const updated = content.replace('status = "open"', 'status = "closed"');
      await writeFile(doc1.filePath, updated);

      const openStitches = await listStitches(testDir, { status: "open" });
      const closedStitches = await listStitches(testDir, { status: "closed" });

      expect(openStitches).toHaveLength(1);
      expect(closedStitches).toHaveLength(1);
    });

    test("returns empty array when no stitches", async () => {
      await initializeStitch(testDir);

      const stitches = await listStitches(testDir);

      expect(stitches).toEqual([]);
    });
  });

  describe("getLineage", () => {
    test("returns lineage chain", async () => {
      await initializeStitch(testDir);
      const root = await createStitch(testDir, "Root");
      const middle = await createStitch(testDir, "Middle", root.frontmatter.id);
      const leaf = await createStitch(testDir, "Leaf", middle.frontmatter.id);

      const lineage = await getLineage(testDir, leaf.frontmatter.id);

      expect(lineage).toHaveLength(3);
      expect(lineage[0]).toBe(leaf.frontmatter.id);
      expect(lineage[1]).toBe(middle.frontmatter.id);
      expect(lineage[2]).toBe(root.frontmatter.id);
    });

    test("returns single-element lineage for root stitch", async () => {
      await initializeStitch(testDir);
      const root = await createStitch(testDir, "Root");

      const lineage = await getLineage(testDir, root.frontmatter.id);

      expect(lineage).toHaveLength(1);
      expect(lineage[0]).toBe(root.frontmatter.id);
    });
  });
});
