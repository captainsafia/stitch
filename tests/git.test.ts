import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import {
  getRepoRoot,
  commitExists,
  resolveRef,
  parseBlameOutput,
  hashDiff,
} from "../src/core/git.ts";
import { RepoNotFoundError } from "../src/core/errors.ts";

describe("Git", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `stitch-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("getRepoRoot", () => {
    test("returns repo root for git directory", async () => {
      await $`git init`.cwd(testDir).quiet();

      const root = await getRepoRoot(testDir);

      expect(root).toBe(testDir);
    });

    test("throws for non-git directory", async () => {
      await expect(getRepoRoot(testDir)).rejects.toThrow(RepoNotFoundError);
    });
  });

  describe("commitExists", () => {
    test("returns true for existing commit", async () => {
      await $`git init`.cwd(testDir).quiet();
      await $`git config user.email "test@test.com"`.cwd(testDir).quiet();
      await $`git config user.name "Test User"`.cwd(testDir).quiet();
      await writeFile(join(testDir, "test.txt"), "content");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Initial commit"`.cwd(testDir).quiet();

      const sha = (await $`git rev-parse HEAD`.cwd(testDir).quiet().text()).trim();
      const exists = await commitExists(sha, testDir);

      expect(exists).toBe(true);
    });

    test("returns false for non-existing commit", async () => {
      await $`git init`.cwd(testDir).quiet();

      const exists = await commitExists("deadbeef" + "0".repeat(32), testDir);

      expect(exists).toBe(false);
    });
  });

  describe("resolveRef", () => {
    test("resolves HEAD to commit SHA", async () => {
      await $`git init`.cwd(testDir).quiet();
      await $`git config user.email "test@test.com"`.cwd(testDir).quiet();
      await $`git config user.name "Test User"`.cwd(testDir).quiet();
      await writeFile(join(testDir, "test.txt"), "content");
      await $`git add .`.cwd(testDir).quiet();
      await $`git commit -m "Initial commit"`.cwd(testDir).quiet();

      const sha = await resolveRef("HEAD", testDir);

      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe("hashDiff", () => {
    test("produces consistent hash", async () => {
      const diff = "diff content here";

      const hash1 = await hashDiff(diff);
      const hash2 = await hashDiff(diff);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    test("different content produces different hash", async () => {
      const hash1 = await hashDiff("content 1");
      const hash2 = await hashDiff("content 2");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("parseBlameOutput", () => {
    test("parses line-porcelain output", () => {
      const output = `deadbeef1234567890abcdef1234567890abcdef 1 1 1
author Test User
author-mail <test@example.com>
author-time 1735344000
author-tz +0000
committer Test User
committer-mail <test@example.com>
committer-time 1735344000
committer-tz +0000
summary Initial commit
filename test.txt
\tLine 1 content
cafebabe1234567890abcdef1234567890abcdef 2 2 1
author Test User
author-mail <test@example.com>
author-time 1735344000
author-tz +0000
committer Test User
committer-mail <test@example.com>
committer-time 1735344000
committer-tz +0000
summary Second commit
filename test.txt
\tLine 2 content`;

      const entries = parseBlameOutput(output);

      expect(entries).toHaveLength(2);
      expect(entries[0]?.sha).toBe("deadbeef1234567890abcdef1234567890abcdef");
      expect(entries[0]?.lineNumber).toBe(1);
      expect(entries[0]?.lineText).toBe("Line 1 content");
      expect(entries[1]?.sha).toBe("cafebabe1234567890abcdef1234567890abcdef");
      expect(entries[1]?.lineNumber).toBe(2);
      expect(entries[1]?.lineText).toBe("Line 2 content");
    });

    test("handles empty output", () => {
      const entries = parseBlameOutput("");
      expect(entries).toEqual([]);
    });
  });
});
