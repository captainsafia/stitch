import { describe, expect, test } from "bun:test";
import {
  parseVersion,
  compareVersions,
  isUpdateAvailable,
} from "../src/platform/update/version.ts";

describe("parseVersion", () => {
  test("parses stable versions", () => {
    const parsed = parseVersion("1.2.3");
    expect(parsed.major).toBe(1);
    expect(parsed.minor).toBe(2);
    expect(parsed.patch).toBe(3);
    expect(parsed.isPreview).toBe(false);
    expect(parsed.prerelease).toBeUndefined();
  });

  test("parses preview versions", () => {
    const parsed = parseVersion("1.2.3-preview.abc1234");
    expect(parsed.major).toBe(1);
    expect(parsed.minor).toBe(2);
    expect(parsed.patch).toBe(3);
    expect(parsed.isPreview).toBe(true);
    expect(parsed.prerelease).toBe("abc1234");
  });

  test("throws on invalid version format", () => {
    expect(() => parseVersion("invalid")).toThrow("Invalid version format");
    expect(() => parseVersion("1.2")).toThrow("Invalid version format");
    expect(() => parseVersion("v1.2.3")).toThrow("Invalid version format");
    expect(() => parseVersion("1.2.3-beta")).toThrow("Invalid version format");
  });
});

describe("compareVersions", () => {
  test("compares major versions", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  test("compares minor versions", () => {
    expect(compareVersions("1.1.0", "1.2.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.1.0")).toBe(1);
    expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
  });

  test("compares patch versions", () => {
    expect(compareVersions("1.0.1", "1.0.2")).toBe(-1);
    expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
    expect(compareVersions("1.0.1", "1.0.1")).toBe(0);
  });

  test("stable versions are greater than previews of same base", () => {
    expect(compareVersions("1.0.0", "1.0.0-preview.abc")).toBe(1);
    expect(compareVersions("1.0.0-preview.abc", "1.0.0")).toBe(-1);
  });

  test("compares preview versions by SHA", () => {
    expect(compareVersions("1.0.0-preview.aaa", "1.0.0-preview.bbb")).toBe(-1);
    expect(compareVersions("1.0.0-preview.bbb", "1.0.0-preview.aaa")).toBe(1);
    expect(compareVersions("1.0.0-preview.abc", "1.0.0-preview.abc")).toBe(0);
  });

  test("newer base version wins regardless of preview status", () => {
    expect(compareVersions("1.0.0", "1.0.1-preview.abc")).toBe(-1);
    expect(compareVersions("1.0.1-preview.abc", "1.0.0")).toBe(1);
  });
});

describe("isUpdateAvailable", () => {
  test("returns true when update is available", () => {
    expect(isUpdateAvailable("1.0.0", "1.0.1")).toBe(true);
    expect(isUpdateAvailable("1.0.0", "1.1.0")).toBe(true);
    expect(isUpdateAvailable("1.0.0", "2.0.0")).toBe(true);
  });

  test("returns false when already on latest", () => {
    expect(isUpdateAvailable("1.0.0", "1.0.0")).toBe(false);
  });

  test("returns false when on newer version", () => {
    expect(isUpdateAvailable("2.0.0", "1.0.0")).toBe(false);
    expect(isUpdateAvailable("1.1.0", "1.0.0")).toBe(false);
    expect(isUpdateAvailable("1.0.1", "1.0.0")).toBe(false);
  });

  test("handles preview versions correctly", () => {
    // Stable is newer than same-version preview
    expect(isUpdateAvailable("1.0.0-preview.abc", "1.0.0")).toBe(true);
    // Already on stable, no update to preview of same version
    expect(isUpdateAvailable("1.0.0", "1.0.0-preview.abc")).toBe(false);
    // Update to newer preview
    expect(isUpdateAvailable("1.0.0-preview.aaa", "1.0.0-preview.bbb")).toBe(
      true
    );
  });
});
