import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

describe("CLI Integration", () => {
  let testDir: string;
  const cliPath = join(import.meta.dir, "..", "src", "cli.ts");

  beforeEach(async () => {
    testDir = join(tmpdir(), `stitch-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    await $`git init`.cwd(testDir).quiet();
    await $`git config user.email "test@test.com"`.cwd(testDir).quiet();
    await $`git config user.name "Test User"`.cwd(testDir).quiet();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("stitch init creates .stitch directory", async () => {
    const result = await $`bun ${cliPath} init`.cwd(testDir).text();

    expect(result).toContain("initialized");
    expect(await Bun.file(join(testDir, ".stitch", "current")).exists()).toBe(true);
  });

  test("stitch start creates new stitch", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();

    const result = await $`bun ${cliPath} start Test stitch title`.cwd(testDir).text();

    expect(result).toContain("Created stitch");
    expect(result).toContain("Test stitch title");
  });

  test("stitch status shows current stitch", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    await $`bun ${cliPath} start My stitch`.cwd(testDir).quiet();

    const result = await $`bun ${cliPath} status`.cwd(testDir).text();

    expect(result).toContain("Current stitch:");
    expect(result).toMatch(/S-\d{8}-[a-f0-9]{4}/);
  });

  test("stitch list shows all stitches", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    await $`bun ${cliPath} start First stitch`.cwd(testDir).quiet();
    await $`bun ${cliPath} start Second stitch`.cwd(testDir).quiet();

    const result = await $`bun ${cliPath} list`.cwd(testDir).text();

    expect(result).toContain("First stitch");
    expect(result).toContain("Second stitch");
  });

  test("stitch child creates child stitch", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    await $`bun ${cliPath} start Parent`.cwd(testDir).quiet();

    const result = await $`bun ${cliPath} child Child stitch`.cwd(testDir).text();

    expect(result).toContain("Created child stitch");
    expect(result).toContain("Parent:");
  });

  test("stitch link --commit links a commit", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    await $`bun ${cliPath} start Test`.cwd(testDir).quiet();

    // Create a commit
    await writeFile(join(testDir, "test.txt"), "content");
    await $`git add .`.cwd(testDir).quiet();
    await $`git commit -m "Test commit"`.cwd(testDir).quiet();

    const result = await $`bun ${cliPath} link --commit HEAD`.cwd(testDir).text();

    expect(result).toContain("Linked commit");
  });

  test("stitch link --range links a range", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    await $`bun ${cliPath} start Test`.cwd(testDir).quiet();

    const result = await $`bun ${cliPath} link --range origin/main..HEAD`.cwd(testDir).text();

    expect(result).toContain("Linked range");
  });

  test("full workflow: init, start, commit, link, blame", async () => {
    // Initialize
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    await $`bun ${cliPath} start Implement feature X`.cwd(testDir).quiet();

    // Create file and commit
    await writeFile(join(testDir, "feature.txt"), "line 1\nline 2\nline 3\n");
    await $`git add .`.cwd(testDir).quiet();
    await $`git commit -m "Add feature"`.cwd(testDir).quiet();

    // Link the commit
    await $`bun ${cliPath} link --commit HEAD`.cwd(testDir).quiet();

    // Run blame
    const blameResult = await $`bun ${cliPath} blame feature.txt`.cwd(testDir).text();

    // Verify blame output contains the stitch ID
    expect(blameResult).toMatch(/S-\d{8}-[a-f0-9]{4}/);
    expect(blameResult).toContain("line 1");
    expect(blameResult).toContain("line 2");
    expect(blameResult).toContain("line 3");
  });

  test("stitch blame --format json outputs JSON", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    await $`bun ${cliPath} start Test`.cwd(testDir).quiet();

    await writeFile(join(testDir, "test.txt"), "content\n");
    await $`git add .`.cwd(testDir).quiet();
    await $`git commit -m "Add file"`.cwd(testDir).quiet();
    await $`bun ${cliPath} link --commit HEAD`.cwd(testDir).quiet();

    const result = await $`bun ${cliPath} blame test.txt --format json`.cwd(testDir).text();

    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("line");
    expect(parsed[0]).toHaveProperty("sha");
    expect(parsed[0]).toHaveProperty("stitchIds");
    expect(parsed[0]).toHaveProperty("text");
  });

  test("stitch switch changes current stitch", async () => {
    await $`bun ${cliPath} init`.cwd(testDir).quiet();
    const firstResult = await $`bun ${cliPath} start First`.cwd(testDir).text();
    const firstId = firstResult.match(/S-\d{8}-[a-f0-9]{4}/)?.[0];

    await $`bun ${cliPath} start Second`.cwd(testDir).quiet();
    await $`bun ${cliPath} switch ${firstId}`.cwd(testDir).quiet();

    const status = await $`bun ${cliPath} status`.cwd(testDir).text();
    expect(status).toContain(firstId!);
  });

  test("exits with error for uninitialized repo", async () => {
    const proc = Bun.spawn(["bun", cliPath, "status"], {
      cwd: testDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("not initialized");
  });

  test("stitch update rejects positional arguments", async () => {
    const proc = Bun.spawn(["bun", cliPath, "update", "v1.0.0-preview.00492d9"], {
      cwd: testDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("too many arguments");
  });
});
