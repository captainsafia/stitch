/**
 * Binary installation and replacement
 */
import { rename, unlink, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { $ } from "bun";
import {
  downloadBinary,
  downloadPRArtifact,
  getDownloadUrl,
  detectPlatform,
  detectInstallMethod,
} from "./download.ts";
import type { UpdateResult, InstallMethod } from "./types.ts";

/**
 * Get the path to the current executable
 */
export function getCurrentExecutablePath(): string {
  // For compiled binaries, process.execPath points to the stitch binary
  return process.execPath;
}

/**
 * Clean up old binary files from previous updates
 */
async function cleanupOldBinaries(execPath: string): Promise<void> {
  const dir = dirname(execPath);
  const baseName = execPath.endsWith(".exe") ? "stitch" : "stitch";
  const oldPath = join(dir, `${baseName}.old`);
  const oldPathExe = join(dir, `${baseName}.old.exe`);

  for (const path of [oldPath, oldPathExe]) {
    if (existsSync(path)) {
      try {
        await unlink(path);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Install update for binary installation
 */
async function installBinaryUpdate(
  targetVersion: string,
  currentVersion: string,
  onProgress?: (message: string) => void,
  prNumber?: string
): Promise<UpdateResult> {
  const platform = detectPlatform();
  const execPath = getCurrentExecutablePath();
  const dir = dirname(execPath);
  const isWindows = platform === "windows-x64";

  const newBinaryPath = join(dir, isWindows ? "stitch.new.exe" : "stitch.new");
  const oldBinaryPath = join(dir, isWindows ? "stitch.old.exe" : "stitch.old");

  try {
    // Clean up any leftover files from previous updates
    await cleanupOldBinaries(execPath);

    // Download new binary
    if (prNumber) {
      // Download from PR artifact
      onProgress?.(`Downloading from PR #${prNumber}...`);
      await downloadPRArtifact(prNumber, newBinaryPath, onProgress);
    } else {
      // Download from release
      const downloadUrl = getDownloadUrl(targetVersion, platform);
      onProgress?.(`Downloading stitch v${targetVersion}...`);
      let lastPercent = 0;
      await downloadBinary(downloadUrl, newBinaryPath, (downloaded, total) => {
        if (total) {
          const percent = Math.round((downloaded / total) * 100);
          if (percent !== lastPercent && percent % 10 === 0) {
            onProgress?.(`Downloading: ${percent}%`);
            lastPercent = percent;
          }
        }
      });
    }

    // Make executable (non-Windows)
    if (!isWindows) {
      await chmod(newBinaryPath, 0o755);
    }

    // Rename current binary to old
    onProgress?.("Installing...");
    await rename(execPath, oldBinaryPath);

    // Rename new binary to current
    await rename(newBinaryPath, execPath);

    // Try to delete old binary (may fail on Windows)
    try {
      await unlink(oldBinaryPath);
    } catch {
      // Will be cleaned up on next run
    }

    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: targetVersion,
    };
  } catch (error) {
    // Attempt rollback if new binary exists but rename failed
    if (existsSync(oldBinaryPath) && !existsSync(execPath)) {
      try {
        await rename(oldBinaryPath, execPath);
      } catch {
        // Rollback failed - user may need manual intervention
      }
    }

    // Clean up new binary if download completed
    if (existsSync(newBinaryPath)) {
      try {
        await unlink(newBinaryPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      success: false,
      previousVersion: currentVersion,
      newVersion: targetVersion,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Install update using npm
 */
async function installNpmUpdate(
  targetVersion: string,
  currentVersion: string,
  onProgress?: (message: string) => void
): Promise<UpdateResult> {
  try {
    onProgress?.(`Updating via npm to v${targetVersion}...`);

    const versionSpec =
      targetVersion === "latest"
        ? "@captainsafia/stitch@latest"
        : `@captainsafia/stitch@${targetVersion}`;

    const result = await $`npm install -g ${versionSpec}`.quiet();

    if (result.exitCode !== 0) {
      return {
        success: false,
        previousVersion: currentVersion,
        newVersion: targetVersion,
        error: `npm install failed: ${result.stderr.toString()}`,
      };
    }

    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: targetVersion,
    };
  } catch (error) {
    return {
      success: false,
      previousVersion: currentVersion,
      newVersion: targetVersion,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Install update using bun
 */
async function installBunUpdate(
  targetVersion: string,
  currentVersion: string,
  onProgress?: (message: string) => void
): Promise<UpdateResult> {
  try {
    onProgress?.(`Updating via bun to v${targetVersion}...`);

    const versionSpec =
      targetVersion === "latest"
        ? "@captainsafia/stitch@latest"
        : `@captainsafia/stitch@${targetVersion}`;

    const result = await $`bun install -g ${versionSpec}`.quiet();

    if (result.exitCode !== 0) {
      return {
        success: false,
        previousVersion: currentVersion,
        newVersion: targetVersion,
        error: `bun install failed: ${result.stderr.toString()}`,
      };
    }

    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: targetVersion,
    };
  } catch (error) {
    return {
      success: false,
      previousVersion: currentVersion,
      newVersion: targetVersion,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Install a new version of the CLI
 */
export async function installUpdate(
  targetVersion: string,
  currentVersion: string,
  onProgress?: (message: string) => void,
  prNumber?: string
): Promise<UpdateResult> {
  const installMethod = detectInstallMethod();

  switch (installMethod) {
    case "binary":
      return installBinaryUpdate(targetVersion, currentVersion, onProgress, prNumber);

    case "npm":
      if (prNumber) {
        return {
          success: false,
          previousVersion: currentVersion,
          newVersion: targetVersion,
          error: "PR updates are only available for standalone binary installations.",
        };
      }
      return installNpmUpdate(targetVersion, currentVersion, onProgress);

    case "bun":
      if (prNumber) {
        return {
          success: false,
          previousVersion: currentVersion,
          newVersion: targetVersion,
          error: "PR updates are only available for standalone binary installations.",
        };
      }
      return installBunUpdate(targetVersion, currentVersion, onProgress);

    case "dev":
      return {
        success: false,
        previousVersion: currentVersion,
        newVersion: targetVersion,
        error:
          "Cannot update in development mode. Use git pull or the appropriate package manager.",
      };
  }
}

/**
 * Get a human-readable description of the install method
 */
export function getInstallMethodDescription(method: InstallMethod): string {
  switch (method) {
    case "binary":
      return "standalone binary";
    case "npm":
      return "npm global package";
    case "bun":
      return "bun global package";
    case "dev":
      return "development mode";
  }
}
