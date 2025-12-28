import { $ } from "bun";
import { GitError, RepoNotFoundError } from "./errors.ts";

/**
 * Get the git repository root directory
 */
export async function getRepoRoot(cwd?: string): Promise<string> {
  try {
    const result = await $`git rev-parse --show-toplevel`
      .cwd(cwd ?? process.cwd())
      .quiet()
      .text();
    return result.trim();
  } catch {
    throw new RepoNotFoundError(cwd);
  }
}

/**
 * Check if a commit SHA exists in the repository
 */
export async function commitExists(
  sha: string,
  repoRoot: string
): Promise<boolean> {
  try {
    await $`git cat-file -e ${sha}^{commit}`.cwd(repoRoot).quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full SHA for a commit reference
 */
export async function resolveRef(
  ref: string,
  repoRoot: string
): Promise<string> {
  try {
    const result = await $`git rev-parse ${ref}`.cwd(repoRoot).quiet().text();
    return result.trim();
  } catch (error) {
    throw new GitError(
      `Failed to resolve ref: ${ref}`,
      `git rev-parse ${ref}`,
      1
    );
  }
}

/**
 * Get the staged diff
 */
export async function getStagedDiff(repoRoot: string): Promise<string> {
  try {
    const result = await $`git diff --staged`.cwd(repoRoot).quiet().text();
    return result;
  } catch (error) {
    throw new GitError("Failed to get staged diff", "git diff --staged", 1);
  }
}

/**
 * Compute SHA256 hash of a string
 */
export async function hashDiff(diff: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(diff);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Parsed blame line from git blame --line-porcelain
 */
export type BlameEntry = {
  sha: string;
  lineNumber: number;
  lineText: string;
};

/**
 * Parse git blame --line-porcelain output
 */
export function parseBlameOutput(output: string): BlameEntry[] {
  const entries: BlameEntry[] = [];
  const lines = output.split("\n");

  let currentSha: string | null = null;
  let currentLineNumber: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // SHA line: 40 hex chars followed by line numbers
    const shaMatch = line.match(/^([a-f0-9]{40})\s+\d+\s+(\d+)/);
    if (shaMatch) {
      currentSha = shaMatch[1]!;
      currentLineNumber = parseInt(shaMatch[2]!, 10);
      continue;
    }

    // The actual line content starts with a tab
    if (line.startsWith("\t") && currentSha && currentLineNumber) {
      entries.push({
        sha: currentSha,
        lineNumber: currentLineNumber,
        lineText: line.slice(1), // Remove the leading tab
      });
      currentSha = null;
      currentLineNumber = null;
    }
  }

  return entries;
}

/**
 * Run git blame on a file
 */
export async function blameFile(
  filePath: string,
  repoRoot: string
): Promise<BlameEntry[]> {
  try {
    const result = await $`git blame --line-porcelain ${filePath}`
      .cwd(repoRoot)
      .quiet()
      .text();
    return parseBlameOutput(result);
  } catch (error) {
    throw new GitError(
      `Failed to blame file: ${filePath}`,
      `git blame --line-porcelain ${filePath}`,
      1
    );
  }
}

/**
 * Get commits in a range
 */
export async function getCommitsInRange(
  range: string,
  repoRoot: string
): Promise<string[]> {
  try {
    const result = await $`git rev-list ${range}`.cwd(repoRoot).quiet().text();
    return result
      .trim()
      .split("\n")
      .filter((s) => s.length > 0);
  } catch {
    // Range might be invalid or empty
    return [];
  }
}
