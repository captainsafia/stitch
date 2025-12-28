import { describe, expect, test } from "bun:test";
import {
  generateStitchId,
  isValidStitchId,
  extractDateFromId,
} from "../src/core/ids.ts";

describe("generateStitchId", () => {
  test("generates valid stitch ID format", () => {
    const id = generateStitchId();
    expect(isValidStitchId(id)).toBe(true);
  });

  test("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateStitchId());
    }
    expect(ids.size).toBe(100);
  });

  test("ID contains current date", () => {
    const id = generateStitchId();
    const today = new Date();
    const expectedDateStr =
      String(today.getFullYear()) +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    expect(id).toContain(`S-${expectedDateStr}-`);
  });
});

describe("isValidStitchId", () => {
  test("accepts valid IDs", () => {
    expect(isValidStitchId("S-20251228-abcd")).toBe(true);
    expect(isValidStitchId("S-20250101-0000")).toBe(true);
    expect(isValidStitchId("S-20251231-ffff")).toBe(true);
  });

  test("rejects invalid IDs", () => {
    expect(isValidStitchId("")).toBe(false);
    expect(isValidStitchId("S-2025-abcd")).toBe(false);
    expect(isValidStitchId("S-20251228-abc")).toBe(false);
    expect(isValidStitchId("S-20251228-abcde")).toBe(false);
    expect(isValidStitchId("S-20251228-ABCD")).toBe(false);
    expect(isValidStitchId("X-20251228-abcd")).toBe(false);
    expect(isValidStitchId("20251228-abcd")).toBe(false);
  });
});

describe("extractDateFromId", () => {
  test("extracts date from valid ID", () => {
    const date = extractDateFromId("S-20251228-abcd");
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2025);
    expect(date!.getMonth()).toBe(11); // December is 11
    expect(date!.getDate()).toBe(28);
  });

  test("returns null for invalid ID", () => {
    expect(extractDateFromId("invalid")).toBeNull();
    expect(extractDateFromId("")).toBeNull();
  });
});
