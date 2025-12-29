/**
 * Binary download functionality
 */
import type { Platform, InstallMethod } from "./types.ts";

const DOWNLOAD_BASE_URL =
  "https://github.com/captainsafia/stitch/releases/download";

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
