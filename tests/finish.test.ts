import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import {
  initializeStitch,
  createStitch,
  loadStitch,
} from "../src/core/store.ts";
import {
  prepareFinish,
  executeFinish,
  finishStitch,
  FinishForceRequiredError,
  InvalidSupersededByError,
} from "../src/core/finish.ts";
import { getChildren, getDescendants, rebuildIndex } from "../src/core/indexing.ts";
import { addCommitLink } from "../src/core/link.ts";

describe("Finish", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `stitch-finish-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    // Initialize as a git repo
    await $`git init`.cwd(testDir).quiet();
    await $`git config user.email "test@test.com"`.cwd(testDir).quiet();
    await $`git config user.name "Test User"`.cwd(testDir).quiet();
    // Create an initial commit
    await writeFile(join(testDir, "README.md"), "# Test");
    await $`git add .`.cwd(testDir).quiet();
    await $`git commit -m "Initial commit"`.cwd(testDir).quiet();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("prepareFinish", () => {
    test("prepares basic finish", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      // Link a commit so it doesn't auto-detect as abandoned
      const gitLog = await $`git log -1 --format=%H`.cwd(testDir).text();
      const commitSha = gitLog.trim();
      await addCommitLink(testDir, doc, commitSha);

      const preview = await prepareFinish(testDir, doc.frontmatter.id);

      expect(preview.target.frontmatter.id).toBe(doc.frontmatter.id);
      expect(preview.finalStatus).toBe("closed");
      expect(preview.autoDetected).toBe(false);
      expect(preview.affected).toHaveLength(1);
      expect(preview.requiresConfirmation).toBe(false);
    });

    test("auto-detects abandoned when no commits linked", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      const preview = await prepareFinish(testDir, doc.frontmatter.id);

      expect(preview.finalStatus).toBe("abandoned");
      expect(preview.autoDetected).toBe(true);
      expect(preview.warnings.some(w => w.includes("No linked commits"))).toBe(true);
    });

    test("requires force when status conflicts with auto-detection", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      const preview = await prepareFinish(testDir, doc.frontmatter.id, {
        status: "closed",
      });

      expect(preview.forceRequired).toBeDefined();
      expect(preview.forceRequired).toContain("--force");
    });

    test("force overrides auto-detection", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      const preview = await prepareFinish(testDir, doc.frontmatter.id, {
        status: "closed",
        force: true,
      });

      expect(preview.finalStatus).toBe("closed");
      expect(preview.forceRequired).toBeUndefined();
    });

    test("requires confirmation for cascade close", async () => {
      await initializeStitch(testDir);
      const parent = await createStitch(testDir, "Parent");

      // Link a commit to the parent
      const gitLog = await $`git log -1 --format=%H`.cwd(testDir).text();
      const commitSha = gitLog.trim();
      await addCommitLink(testDir, await loadStitch(testDir, parent.frontmatter.id), commitSha);

      await createStitch(testDir, "Child", parent.frontmatter.id);

      const preview = await prepareFinish(testDir, parent.frontmatter.id);

      expect(preview.affected.length).toBeGreaterThanOrEqual(2);
      expect(preview.requiresConfirmation).toBe(true);
    });

    test("throws for invalid --by usage", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      await expect(
        prepareFinish(testDir, doc.frontmatter.id, {
          status: "closed",
          supersededBy: "S-12345678-abcd",
        })
      ).rejects.toThrow(InvalidSupersededByError);
    });
  });

  describe("executeFinish", () => {
    test("finishes stitch and updates status", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      // Link a commit
      const gitLog = await $`git log -1 --format=%H`.cwd(testDir).text();
      const commitSha = gitLog.trim();
      await addCommitLink(testDir, doc, commitSha);

      const preview = await prepareFinish(testDir, doc.frontmatter.id);
      const result = await executeFinish(preview);

      expect(result.finished).toHaveLength(1);
      expect(result.finished[0]!.newStatus).toBe("closed");

      // Verify status was actually updated
      const updated = await loadStitch(testDir, doc.frontmatter.id);
      expect(updated.frontmatter.status).toBe("closed");
    });

    test("finishes with superseded status and stores supersededBy", async () => {
      await initializeStitch(testDir);
      const original = await createStitch(testDir, "Original");
      const replacement = await createStitch(testDir, "Replacement");

      const preview = await prepareFinish(testDir, original.frontmatter.id, {
        status: "superseded",
        supersededBy: replacement.frontmatter.id,
        force: true,
      });
      await executeFinish(preview, {
        status: "superseded",
        supersededBy: replacement.frontmatter.id,
      });

      const updated = await loadStitch(testDir, original.frontmatter.id);
      expect(updated.frontmatter.status).toBe("superseded");
      expect(updated.frontmatter.relations?.depends_on).toContain(replacement.frontmatter.id);
    });

    test("cascade closes children with parent status", async () => {
      await initializeStitch(testDir);
      const parent = await createStitch(testDir, "Parent");

      // Link a commit to the parent
      const gitLog = await $`git log -1 --format=%H`.cwd(testDir).text();
      const commitSha = gitLog.trim();
      await addCommitLink(testDir, await loadStitch(testDir, parent.frontmatter.id), commitSha);

      const child = await createStitch(testDir, "Child", parent.frontmatter.id);

      // Force closed status since there are open children (which triggers auto-abandoned)
      const preview = await prepareFinish(testDir, parent.frontmatter.id, { force: true });
      const result = await executeFinish(preview);

      expect(result.finished.length).toBeGreaterThanOrEqual(2);

      // Both should have closed status
      const updatedParent = await loadStitch(testDir, parent.frontmatter.id);
      const updatedChild = await loadStitch(testDir, child.frontmatter.id);

      expect(updatedParent.frontmatter.status).toBe("closed");
      expect(updatedChild.frontmatter.status).toBe("closed");
    });

    test("throws when force required but not provided", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      const preview = await prepareFinish(testDir, doc.frontmatter.id, {
        status: "closed",
      });

      await expect(executeFinish(preview)).rejects.toThrow(
        FinishForceRequiredError
      );
    });
  });

  describe("finishStitch (high-level)", () => {
    test("finishes stitch with explicitly abandoned status", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      // Explicitly use abandoned since there are no commits
      const result = await finishStitch(testDir, doc.frontmatter.id, {
        status: "abandoned",
      });

      expect(result.finished).toHaveLength(1);
      expect(result.finalStatus).toBe("abandoned");
    });

    test("finishes stitch with force when auto-detection conflicts", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      // Force closed status even though no commits (auto-detection would say abandoned)
      const result = await finishStitch(testDir, doc.frontmatter.id, {
        status: "closed",
        force: true,
      });

      expect(result.finished).toHaveLength(1);
      expect(result.finalStatus).toBe("closed");
    });

    test("allows transition between terminal statuses", async () => {
      await initializeStitch(testDir);
      const doc = await createStitch(testDir, "Test stitch");

      // First, finish as abandoned (explicitly, since no commits)
      await finishStitch(testDir, doc.frontmatter.id, {
        status: "abandoned",
      });
      let updated = await loadStitch(testDir, doc.frontmatter.id);
      expect(updated.frontmatter.status).toBe("abandoned");

      // Then transition to superseded (force needed to override)
      await finishStitch(testDir, doc.frontmatter.id, {
        status: "superseded",
        force: true,
      });
      updated = await loadStitch(testDir, doc.frontmatter.id);
      expect(updated.frontmatter.status).toBe("superseded");
    });
  });

  describe("Index management", () => {
    test("getChildren returns direct children", async () => {
      await initializeStitch(testDir);
      const parent = await createStitch(testDir, "Parent");
      const child1 = await createStitch(testDir, "Child 1", parent.frontmatter.id);
      const child2 = await createStitch(testDir, "Child 2", parent.frontmatter.id);

      const children = await getChildren(testDir, parent.frontmatter.id);

      expect(children).toContain(child1.frontmatter.id);
      expect(children).toContain(child2.frontmatter.id);
      expect(children).toHaveLength(2);
    });

    test("getDescendants returns all descendants", async () => {
      await initializeStitch(testDir);
      const root = await createStitch(testDir, "Root");
      const child = await createStitch(testDir, "Child", root.frontmatter.id);
      const grandchild = await createStitch(testDir, "Grandchild", child.frontmatter.id);

      const descendants = await getDescendants(testDir, root.frontmatter.id);

      expect(descendants).toContain(child.frontmatter.id);
      expect(descendants).toContain(grandchild.frontmatter.id);
      expect(descendants).toHaveLength(2);
    });

    test("rebuildIndex reconstructs from stitch files", async () => {
      await initializeStitch(testDir);
      const parent = await createStitch(testDir, "Parent");
      const child = await createStitch(testDir, "Child", parent.frontmatter.id);

      // Force rebuild
      const index = await rebuildIndex(testDir);

      expect(index.children[parent.frontmatter.id]).toContain(child.frontmatter.id);
    });
  });

  describe("Atomicity", () => {
    test("rolls back parent when child write fails", async () => {
      await initializeStitch(testDir);
      const parent = await createStitch(testDir, "Parent");
      const child = await createStitch(testDir, "Child", parent.frontmatter.id);

      // Make child file read-only to cause write failure
      await chmod(child.filePath, 0o444);

      try {
        // Prepare finish with force (to bypass auto-detection)
        const preview = await prepareFinish(testDir, parent.frontmatter.id, { force: true });

        // Execute should fail when trying to write the read-only child
        await expect(executeFinish(preview)).rejects.toThrow();

        // Parent should still be "open" (rolled back)
        const parentAfter = await loadStitch(testDir, parent.frontmatter.id);
        expect(parentAfter.frontmatter.status).toBe("open");
      } finally {
        // Restore permissions for cleanup
        await chmod(child.filePath, 0o644);
      }
    });
  });
});
