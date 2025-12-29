/**
 * Version checking with caching
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../paths.ts";
import type { UpdateCheckCache } from "./types.ts";

const CACHE_FILE = "update-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GITHUB_API_URL =
  "https://api.github.com/repos/captainsafia/stitch/releases";

/**
 * Get the cache file path
 */
export function getCacheFilePath(): string {
  return join(getConfigDir(), CACHE_FILE);
}

/**
 * Read cached version check data
 */
async function readCache(): Promise<UpdateCheckCache | null> {
  const cachePath = getCacheFilePath();

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = await readFile(cachePath, "utf-8");
    return JSON.parse(content) as UpdateCheckCache;
  } catch {
    return null;
  }
}

/**
 * Write cache data
 */
async function writeCache(cache: UpdateCheckCache): Promise<void> {
  const configDir = getConfigDir();

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  const cachePath = getCacheFilePath();
  await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Check if cache is still valid (within check interval)
 */
function isCacheValid(cache: UpdateCheckCache): boolean {
  const now = Date.now();
  return now - cache.lastChecked < CHECK_INTERVAL_MS;
}

/**
 * Fetch latest stable release info from GitHub API
 */
async function fetchLatestRelease(): Promise<string | null> {
  try {
    const response = await fetch(`${GITHUB_API_URL}/latest`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "stitch-cli",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag_name: string };
    return data.tag_name.replace(/^v/, "");
  } catch {
    return null;
  }
}

/**
 * Fetch latest preview release from GitHub API
 */
async function fetchLatestPreviewRelease(): Promise<string | null> {
  try {
    const response = await fetch(`${GITHUB_API_URL}?per_page=20`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "stitch-cli",
      },
    });

    if (!response.ok) {
      return null;
    }

    const releases = (await response.json()) as Array<{ tag_name: string }>;

    // Find the latest preview release
    for (const release of releases) {
      const version = release.tag_name.replace(/^v/, "");
      if (version.includes("-preview.")) {
        return version;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get latest version (uses cache if valid)
 * This is the main function called on CLI startup
 */
export async function getLatestVersion(
  forceRefresh = false
): Promise<{ stable: string | null; preview: string | null }> {
  // Try to use cache first
  if (!forceRefresh) {
    const cache = await readCache();
    if (cache && isCacheValid(cache)) {
      return {
        stable: cache.latestVersion,
        preview: cache.latestPreviewVersion ?? null,
      };
    }
  }

  // Fetch fresh data
  const [stableVersion, previewVersion] = await Promise.all([
    fetchLatestRelease(),
    fetchLatestPreviewRelease(),
  ]);

  // Update cache
  if (stableVersion) {
    const cache: UpdateCheckCache = {
      lastChecked: Date.now(),
      latestVersion: stableVersion,
      latestPreviewVersion: previewVersion ?? undefined,
    };

    // Write cache asynchronously, don't await
    writeCache(cache).catch(() => {
      // Ignore cache write errors
    });
  }

  return {
    stable: stableVersion,
    preview: previewVersion,
  };
}
