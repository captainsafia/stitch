import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the platform-specific config directory for stitch
 * Following XDG Base Directory specification on Unix
 */
export function getConfigDir(): string {
  const platform = process.platform;

  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "stitch");
  }

  if (platform === "win32") {
    const appData = process.env["APPDATA"];
    if (appData) {
      return join(appData, "stitch");
    }
    return join(homedir(), "AppData", "Roaming", "stitch");
  }

  // Linux and other Unix-like systems: follow XDG
  const xdgConfig = process.env["XDG_CONFIG_HOME"];
  if (xdgConfig) {
    return join(xdgConfig, "stitch");
  }
  return join(homedir(), ".config", "stitch");
}

/**
 * Get the platform-specific data directory for stitch
 */
export function getDataDir(): string {
  const platform = process.platform;

  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "stitch");
  }

  if (platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) {
      return join(localAppData, "stitch");
    }
    return join(homedir(), "AppData", "Local", "stitch");
  }

  // Linux and other Unix-like systems: follow XDG
  const xdgData = process.env["XDG_DATA_HOME"];
  if (xdgData) {
    return join(xdgData, "stitch");
  }
  return join(homedir(), ".local", "share", "stitch");
}

/**
 * Get the user's preferred editor
 */
export function getEditor(): string {
  return (
    process.env["VISUAL"] ??
    process.env["EDITOR"] ??
    (process.platform === "win32" ? "notepad" : "vi")
  );
}
