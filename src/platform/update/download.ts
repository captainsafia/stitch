/**
 * Binary download functionality
 */
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Platform, InstallMethod } from "./types.ts";

const DOWNLOAD_BASE_URL =
  "https://github.com/captainsafia/stitch/releases/download";
const REPO = "captainsafia/stitch";

/**
 * Detect current platform
 */
export function detectPlatform(): Platform {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "win32" && arch === "x64") return "windows-x64";

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

/**
 * Detect how stitch was installed
 */
export function detectInstallMethod(): InstallMethod {
  const execPath = process.execPath;
  const scriptPath = process.argv[1] ?? "";

  // Compiled binary: execPath points to the stitch binary itself
  if (
    execPath.endsWith("/stitch") ||
    execPath.endsWith("\\stitch.exe") ||
    execPath.includes("stitch-")
  ) {
    return "binary";
  }

  // Running via bun
  if (execPath.includes("bun")) {
    // Check if we're in a global node_modules (bun global install)
    if (scriptPath.includes("node_modules")) {
      return "bun";
    }
    // Development mode (bun run src/cli.ts)
    return "dev";
  }

  // Running via node (npm global install)
  if (execPath.includes("node")) {
    return "npm";
  }

  // Default to binary for compiled executables
  return "binary";
}

/**
 * Get download URL for a specific version and platform
 */
export function getDownloadUrl(version: string, platform: Platform): string {
  const suffix = platform === "windows-x64" ? ".exe" : "";
  return `${DOWNLOAD_BASE_URL}/v${version}/stitch-${platform}${suffix}`;
}

/**
 * Download binary to a file
 */
export async function downloadBinary(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number | null) => void
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "stitch-cli",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Binary not found at ${url}. This version may not be available for your platform.`
      );
    }
    if (response.status === 403) {
      throw new Error(
        "Rate limited by GitHub. Please try again in a few minutes."
      );
    }
    throw new Error(
      `Download failed with status ${response.status}: ${response.statusText}`
    );
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : null;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to read response body");
  }

  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    downloaded += value.length;

    if (onProgress) {
      onProgress(downloaded, total);
    }
  }

  // Combine chunks
  const binary = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    binary.set(chunk, offset);
    offset += chunk.length;
  }

  // Write to file using Bun's file API
  await Bun.write(destPath, binary);
}

/**
 * Download binary from PR artifacts using GitHub CLI
 */
export async function downloadPRArtifact(
  prNumber: string,
  destPath: string,
  onProgress?: (message: string) => void
): Promise<void> {
  // Check if gh CLI is installed
  const ghCheck = await $`which gh`.nothrow().quiet();
  if (ghCheck.exitCode !== 0) {
    throw new Error(
      "GitHub CLI (gh) is required to download PR artifacts. Install it from https://cli.github.com/"
    );
  }

  const platform = detectPlatform();
  const artifactName = `stitch-pr-${prNumber}-${platform}`;

  onProgress?.(`Downloading PR #${prNumber} artifact: ${artifactName}...`);

  // First, list workflow runs for the PR to find the latest successful run
  const runsResult = await $`gh run list --repo ${REPO} --workflow pr-publish.yml --json databaseId,status,conclusion,headBranch --limit 50`.nothrow().quiet();
  
  if (runsResult.exitCode !== 0) {
    throw new Error(`Failed to list workflow runs: ${runsResult.stderr.toString()}`);
  }

  const runs = JSON.parse(runsResult.stdout.toString());
  
  // Create a secure temporary directory using tmpdir
  const { tmpdir } = await import("node:os");
  const { mkdtemp } = await import("node:fs/promises");
  const tmpDir = await mkdtemp(join(tmpdir(), `stitch-pr-${prNumber}-`));

  try {
    // Find the run that corresponds to this PR
    // We need to check if the run has the artifact we're looking for
    let foundRun = null;
    for (const run of runs) {
      if (run.status === "completed" && run.conclusion === "success") {
        // Try to download from this run
        const downloadResult = await $`gh run download ${run.databaseId} --repo ${REPO} --name ${artifactName} --dir ${tmpDir}`.nothrow().quiet();
        if (downloadResult.exitCode === 0) {
          foundRun = run;
          break;
        }
      }
    }

    if (!foundRun) {
      throw new Error(
        `Failed to find artifact for PR #${prNumber}. Make sure the PR exists and has completed successfully.`
      );
    }

    // The artifact is extracted to a directory, we need to find the binary file
    const binaryName = platform === "windows-x64" ? `stitch-${platform}.exe` : `stitch-${platform}`;
    const tmpBinaryPath = join(tmpDir, binaryName);

    if (!existsSync(tmpBinaryPath)) {
      throw new Error(`Downloaded artifact does not contain expected binary: ${binaryName}`);
    }

    // Copy to destination
    const binaryData = await Bun.file(tmpBinaryPath).arrayBuffer();
    await Bun.write(destPath, binaryData);

    onProgress?.("Download complete");
  } finally {
    // Cleanup using fs methods
    try {
      const { rm } = await import("node:fs/promises");
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
