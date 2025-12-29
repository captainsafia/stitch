import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { $ } from "bun";
import {
  handleStitchCreate,
  handleStitchGet,
  handleStitchList,
  handleStitchUpdateFrontmatter,
  handleStitchUpdateBody,
  handleStitchLinkCommit,
  handleStitchLinkRange,
  handleStitchBlame,
} from "../src/mcp/handlers.ts";
import { parseStitchFile } from "../src/core/frontmatter.ts";

describe("MCP Handlers", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `stitch-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    await $`git init`.cwd(testDir).quiet();
    await $`git config user.email "test@test.com"`.cwd(testDir).quiet();
    await $`git config user.name "Test User"`.cwd(testDir).quiet();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("stitch_create", () => {
    test("creates stitch and auto-initializes", async () => {
      const result = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test Stitch",
      });

      expect(result.stitchId).toMatch(/^S-\d{8}-[a-z0-9]{4}$/);
      expect(result.frontmatter.title).toBe("Test Stitch");
      expect(result.frontmatter.status).toBe("open");
      expect(result.filePath).toContain(".stitch/stitches/");
    });

    test("creates stitch with parent", async () => {
      const parent = await handleStitchCreate({
        repoRoot: testDir,
        title: "Parent Stitch",
      });

      const child = await handleStitchCreate({
        repoRoot: testDir,
        title: "Child Stitch",
        parent: parent.stitchId,
      });

      expect(child.frontmatter.relations?.parent).toBe(parent.stitchId);
    });

    test("creates stitch with dependsOn", async () => {
      const dep1 = await handleStitchCreate({
        repoRoot: testDir,
        title: "Dependency 1",
      });

      const dep2 = await handleStitchCreate({
        repoRoot: testDir,
        title: "Dependency 2",
      });

      const stitch = await handleStitchCreate({
        repoRoot: testDir,
        title: "Main Stitch",
        dependsOn: [dep1.stitchId, dep2.stitchId],
      });

      expect(stitch.frontmatter.relations?.depends_on).toEqual([
        dep1.stitchId,
        dep2.stitchId,
      ]);
    });
  });

  describe("stitch_get", () => {
    test("retrieves stitch by ID", async () => {
      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test Stitch",
      });

      const result = await handleStitchGet({
        repoRoot: testDir,
        stitchId: created.stitchId,
      });

      expect(result.stitchId).toBe(created.stitchId);
      expect(result.frontmatter.title).toBe("Test Stitch");
      expect(result.body).toContain("## Intent");
    });

    test("throws for non-existent stitch", async () => {
      await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      await expect(
        handleStitchGet({
          repoRoot: testDir,
          stitchId: "S-20240101-xxxx",
        })
      ).rejects.toThrow("Stitch not found");
    });
  });

  describe("stitch_list", () => {
    test("lists all stitches", async () => {
      await handleStitchCreate({ repoRoot: testDir, title: "Stitch 1" });
      await handleStitchCreate({ repoRoot: testDir, title: "Stitch 2" });
      await handleStitchCreate({ repoRoot: testDir, title: "Stitch 3" });

      const result = await handleStitchList({ repoRoot: testDir });

      expect(result).toHaveLength(3);
      expect(result.map((s) => s.title)).toContain("Stitch 1");
      expect(result.map((s) => s.title)).toContain("Stitch 2");
      expect(result.map((s) => s.title)).toContain("Stitch 3");
    });

    test("filters by status", async () => {
      const stitch1 = await handleStitchCreate({
        repoRoot: testDir,
        title: "Open Stitch",
      });
      await handleStitchCreate({ repoRoot: testDir, title: "Another Open" });

      await handleStitchUpdateFrontmatter({
        repoRoot: testDir,
        stitchId: stitch1.stitchId,
        patch: { status: "closed" },
      });

      const openList = await handleStitchList({
        repoRoot: testDir,
        status: "open",
      });
      const closedList = await handleStitchList({
        repoRoot: testDir,
        status: "closed",
      });

      expect(openList).toHaveLength(1);
      expect(closedList).toHaveLength(1);
      expect(closedList[0]!.title).toBe("Open Stitch");
    });

    test("filters by tag", async () => {
      const stitch1 = await handleStitchCreate({
        repoRoot: testDir,
        title: "Tagged Stitch",
      });
      await handleStitchCreate({ repoRoot: testDir, title: "Untagged Stitch" });

      await handleStitchUpdateFrontmatter({
        repoRoot: testDir,
        stitchId: stitch1.stitchId,
        patch: { tags: ["feature", "important"] },
      });

      const result = await handleStitchList({
        repoRoot: testDir,
        tag: "feature",
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe("Tagged Stitch");
    });
  });

  describe("stitch_update_frontmatter", () => {
    test("updates frontmatter fields", async () => {
      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Original Title",
      });

      const result = await handleStitchUpdateFrontmatter({
        repoRoot: testDir,
        stitchId: created.stitchId,
        patch: {
          title: "Updated Title",
          status: "closed",
          tags: ["done"],
        },
      });

      expect(result.frontmatter.title).toBe("Updated Title");
      expect(result.frontmatter.status).toBe("closed");
      expect(result.frontmatter.tags).toEqual(["done"]);
    });

    test("bumps updated_at timestamp", async () => {
      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      const originalUpdatedAt = created.frontmatter.updated_at;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await handleStitchUpdateFrontmatter({
        repoRoot: testDir,
        stitchId: created.stitchId,
        patch: { title: "Updated" },
      });

      expect(result.frontmatter.updated_at).not.toBe(originalUpdatedAt);
      expect(
        new Date(result.frontmatter.updated_at).getTime()
      ).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
    });

    test("cannot change stitch ID", async () => {
      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      const result = await handleStitchUpdateFrontmatter({
        repoRoot: testDir,
        stitchId: created.stitchId,
        patch: { id: "S-20240101-fake" },
      });

      expect(result.frontmatter.id).toBe(created.stitchId);
    });
  });

  describe("stitch_update_body", () => {
    test("replaces body content", async () => {
      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      await handleStitchUpdateBody({
        repoRoot: testDir,
        stitchId: created.stitchId,
        bodyMarkdown: "# New Body\n\nThis is the new content.",
      });

      const fetched = await handleStitchGet({
        repoRoot: testDir,
        stitchId: created.stitchId,
      });

      expect(fetched.body).toBe("# New Body\n\nThis is the new content.");
    });
  });

  describe("stitch_link_commit", () => {
    test("links commit to stitch", async () => {
      // Create initial commit
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "initial content");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Initial commit"`.cwd(testDir).quiet();
      const sha = (await $`git rev-parse HEAD`.cwd(testDir).quiet().text()).trim();

      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      const result = await handleStitchLinkCommit({
        repoRoot: testDir,
        stitchId: created.stitchId,
        sha,
      });

      expect(result.ok).toBe(true);

      const fetched = await handleStitchGet({
        repoRoot: testDir,
        stitchId: created.stitchId,
      });

      expect(fetched.frontmatter.git?.links).toContainEqual({
        kind: "commit",
        sha,
      });
    });

    test("deduplicates commit links", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "initial content");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Initial commit"`.cwd(testDir).quiet();
      const sha = (await $`git rev-parse HEAD`.cwd(testDir).quiet().text()).trim();

      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      // Link same commit twice
      await handleStitchLinkCommit({
        repoRoot: testDir,
        stitchId: created.stitchId,
        sha,
      });
      await handleStitchLinkCommit({
        repoRoot: testDir,
        stitchId: created.stitchId,
        sha,
      });

      const fetched = await handleStitchGet({
        repoRoot: testDir,
        stitchId: created.stitchId,
      });

      expect(fetched.frontmatter.git?.links).toHaveLength(1);
    });
  });

  describe("stitch_link_range", () => {
    test("links range to stitch", async () => {
      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      const result = await handleStitchLinkRange({
        repoRoot: testDir,
        stitchId: created.stitchId,
        range: "origin/main..HEAD",
      });

      expect(result.ok).toBe(true);

      const fetched = await handleStitchGet({
        repoRoot: testDir,
        stitchId: created.stitchId,
      });

      expect(fetched.frontmatter.git?.links).toContainEqual({
        kind: "range",
        range: "origin/main..HEAD",
      });
    });
  });

  describe("stitch_blame", () => {
    test("returns blame with stitch attribution", async () => {
      // Create initial commit
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "line 1\nline 2\nline 3");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Initial commit"`.cwd(testDir).quiet();
      const sha = (await $`git rev-parse HEAD`.cwd(testDir).quiet().text()).trim();

      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      await handleStitchLinkCommit({
        repoRoot: testDir,
        stitchId: created.stitchId,
        sha,
      });

      const result = await handleStitchBlame({
        repoRoot: testDir,
        path: "test.txt",
      });

      expect(result.path).toBe("test.txt");
      expect(result.lines).toHaveLength(3);
      expect(result.lines[0]!.line).toBe(1);
      expect(result.lines[0]!.sha).toBe(sha);
      expect(result.lines[0]!.stitchIds).toContain(created.stitchId);
    });

    test("filters by line range", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "line 1\nline 2\nline 3\nline 4\nline 5");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Initial commit"`.cwd(testDir).quiet();

      await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      const result = await handleStitchBlame({
        repoRoot: testDir,
        path: "test.txt",
        lineStart: 2,
        lineEnd: 4,
      });

      expect(result.lines).toHaveLength(3);
      expect(result.lines[0]!.line).toBe(2);
      expect(result.lines[2]!.line).toBe(4);
    });
  });

  describe("concurrency", () => {
    test("concurrent link operations produce valid file", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Initial"`.cwd(testDir).quiet();

      // Create multiple commits
      const shas: string[] = [];
      for (let i = 0; i < 5; i++) {
        await writeFile(filePath, `content ${i}`);
        await $`git add .`.cwd(testDir).quiet();
        await $`git commit -m "Commit ${i}"`.cwd(testDir).quiet();
        shas.push((await $`git rev-parse HEAD`.cwd(testDir).quiet().text()).trim());
      }

      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      // Link all commits concurrently
      await Promise.all(
        shas.map((sha) =>
          handleStitchLinkCommit({
            repoRoot: testDir,
            stitchId: created.stitchId,
            sha,
          })
        )
      );

      // Verify file is still valid TOML frontmatter
      const content = await readFile(created.filePath, "utf-8");
      const parsed = parseStitchFile(content);

      expect(parsed.frontmatter.id).toBe(created.stitchId);
      expect(parsed.frontmatter.git?.links?.length).toBe(5);
    });
  });

  describe("stateless design", () => {
    test("does not read or write .stitch/current", async () => {
      const created = await handleStitchCreate({
        repoRoot: testDir,
        title: "Test",
      });

      // Read the current file
      const currentPath = join(testDir, ".stitch", "current");
      const currentContent = await readFile(currentPath, "utf-8");

      // It should be empty - MCP handlers never set current stitch
      expect(currentContent.trim()).toBe("");

      // Operations work without current stitch
      await handleStitchGet({
        repoRoot: testDir,
        stitchId: created.stitchId,
      });

      await handleStitchUpdateFrontmatter({
        repoRoot: testDir,
        stitchId: created.stitchId,
        patch: { title: "Updated" },
      });

      // Current is still empty
      const currentContentAfter = await readFile(currentPath, "utf-8");
      expect(currentContentAfter.trim()).toBe("");
    });
  });
});
