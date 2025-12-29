/**
 * Version comparison and parsing utilities
 */

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  isPreview: boolean;
};

/**
 * Parse a version string into components
 * Handles: "1.2.3", "1.2.3-preview.abc1234"
 */
export function parseVersion(version: string): ParsedVersion {
  const previewMatch = version.match(
    /^(\d+)\.(\d+)\.(\d+)(-preview\.([a-f0-9]+))?$/
  );

  if (!previewMatch) {
    throw new Error(`Invalid version format: ${version}`);
  }

  return {
    major: parseInt(previewMatch[1]!, 10),
    minor: parseInt(previewMatch[2]!, 10),
    patch: parseInt(previewMatch[3]!, 10),
    prerelease: previewMatch[5],
    isPreview: !!previewMatch[4],
  };
}

/**
 * Compare two versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  // Compare major.minor.patch
  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }

  // Stable > preview for same base version
  if (!parsedA.isPreview && parsedB.isPreview) return 1;
  if (parsedA.isPreview && !parsedB.isPreview) return -1;

  // Both previews: compare by SHA (lexicographic)
  if (parsedA.prerelease && parsedB.prerelease) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease);
  }

  return 0;
}

/**
 * Check if an update is available
 */
export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0;
}
