import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import { StitchClient } from "../src/api.ts";
import { NotInitializedError, NoCurrentStitchError } from "../src/core/errors.ts";

describe("StitchClient", () => {
  let testDir: string;
  let client: StitchClient;

  beforeEach(async () => {
    testDir = join(tmpdir(), `stitch-api-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    await $`git init`.cwd(testDir).quiet();
    await $`git config user.email "test@test.com"`.cwd(testDir).quiet();
    await $`git config user.name "Test User"`.cwd(testDir).quiet();
    client = new StitchClient({ repoRoot: testDir });
  });

  afterEach(async () => {
    client.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe("init", () => {
    test("initializes stitch in repository", async () => {
      expect(await client.isInitialized()).toBe(false);

      await client.init();

      expect(await client.isInitialized()).toBe(true);
    });
  });

  describe("start", () => {
    test("creates and sets current stitch", async () => {
      await client.init();

      const doc = await client.start("My first stitch");

      expect(doc.frontmatter.title).toBe("My first stitch");
      expect(doc.frontmatter.status).toBe("open");

      const status = await client.status();
      expect(status.current).toBe(doc.frontmatter.id);
    });

    test("throws when not initialized", async () => {
      await expect(client.start("Test")).rejects.toThrow(NotInitializedError);
    });
  });

  describe("child", () => {
    test("creates child stitch with parent relation", async () => {
      await client.init();
      const parent = await client.start("Parent stitch");

      const child = await client.child("Child stitch");

      expect(child.frontmatter.relations?.parent).toBe(parent.frontmatter.id);

      const status = await client.status();
      expect(status.current).toBe(child.frontmatter.id);
    });

    test("throws when no current stitch", async () => {
      await client.init();

      await expect(client.child("Child")).rejects.toThrow(NoCurrentStitchError);
    });
  });

  describe("switch", () => {
    test("switches current stitch", async () => {
      await client.init();
      const first = await client.start("First");
      await client.start("Second");

      await client.switch(first.frontmatter.id);

      const status = await client.status();
      expect(status.current).toBe(first.frontmatter.id);
    });
  });

  describe("status", () => {
    test("returns status with lineage", async () => {
      await client.init();
      const root = await client.start("Root");
      const middle = await client.child("Middle");
      const leaf = await client.child("Leaf");

      const status = await client.status();

      expect(status.current).toBe(leaf.frontmatter.id);
      expect(status.lineage).toHaveLength(3);
      expect(status.lineage[0]).toBe(leaf.frontmatter.id);
      expect(status.lineage[1]).toBe(middle.frontmatter.id);
      expect(status.lineage[2]).toBe(root.frontmatter.id);
    });

    test("returns empty lineage when no current", async () => {
      await client.init();

      const status = await client.status();

      expect(status.current).toBeUndefined();
      expect(status.lineage).toEqual([]);
    });
  });

  describe("list", () => {
    test("lists all stitches", async () => {
      await client.init();
      await client.start("First");
      await client.start("Second");
      await client.start("Third");

      const stitches = await client.list();

      expect(stitches).toHaveLength(3);
    });

    test("filters by status", async () => {
      await client.init();
      await client.start("Open");

      const openList = await client.list({ status: "open" });
      const closedList = await client.list({ status: "closed" });

      expect(openList).toHaveLength(1);
      expect(closedList).toHaveLength(0);
    });
  });

  describe("get", () => {
    test("gets stitch by ID", async () => {
      await client.init();
      const created = await client.start("Test stitch");

      const retrieved = await client.get(created.frontmatter.id);

      expect(retrieved.frontmatter.id).toBe(created.frontmatter.id);
      expect(retrieved.frontmatter.title).toBe("Test stitch");
    });
  });

  describe("linkCommit", () => {
    test("links commit to current stitch", async () => {
      await client.init();
      await client.start("Test stitch");

      // Create a commit to link
      await writeFile(join(testDir, "test.txt"), "content");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Test commit"`.cwd(testDir).quiet();
      const sha = (await $`git rev-parse HEAD`.cwd(testDir).quiet().text()).trim();

      await client.linkCommit(sha);

      const status = await client.status();
      const doc = await client.get(status.current!);
      expect(doc.frontmatter.git?.links).toHaveLength(1);
      expect(doc.frontmatter.git?.links?.[0]?.kind).toBe("commit");
    });
  });

  describe("linkRange", () => {
    test("links range to current stitch", async () => {
      await client.init();
      await client.start("Test stitch");

      await client.linkRange("origin/main..HEAD");

      const status = await client.status();
      const doc = await client.get(status.current!);
      expect(doc.frontmatter.git?.links).toHaveLength(1);
      expect(doc.frontmatter.git?.links?.[0]).toEqual({
        kind: "range",
        range: "origin/main..HEAD",
      });
    });
  });

  describe("Symbol.dispose", () => {
    test("can be used with using keyword", async () => {
      await client.init();

      {
        using scopedClient = new StitchClient({ repoRoot: testDir });
        await scopedClient.start("Test");
      }

      // Client should be disposed, but we can create a new one
      const newClient = new StitchClient({ repoRoot: testDir });
      const stitches = await newClient.list();
      expect(stitches).toHaveLength(1);
      newClient.close();
    });
  });
});
