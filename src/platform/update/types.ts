/**
 * Type definitions for the update system
 */

/**
 * Cache structure for storing version check results
 */
export type UpdateCheckCache = {
  lastChecked: number; // Unix timestamp
  latestVersion: string; // e.g., "1.2.0"
  latestPreviewVersion?: string; // e.g., "1.2.0-preview.abc1234"
};

/**
 * Supported platform identifiers matching release binary naming
 */
export type Platform =
  | "linux-x64"
  | "linux-arm64"
  | "darwin-x64"
  | "darwin-arm64"
  | "windows-x64";

/**
 * Result of an update operation
 */
export type UpdateResult = {
  success: boolean;
  previousVersion: string;
  newVersion: string;
  error?: string;
};

/**
 * Installation method for the CLI
 */
export type InstallMethod = "binary" | "npm" | "bun" | "dev";
