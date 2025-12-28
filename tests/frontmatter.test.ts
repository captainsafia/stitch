import { describe, expect, test } from "bun:test";
import {
  parseStitchFile,
  serializeStitchFile,
  updateTimestamp,
} from "../src/core/frontmatter.ts";
import type { StitchFrontmatter } from "../src/core/model.ts";
import { ValidationError } from "../src/core/errors.ts";

describe("parseStitchFile", () => {
  test("parses valid stitch file", () => {
    const content = `+++
id = "S-20251228-abcd"
title = "Test stitch"
status = "open"
created_at = "2025-12-28T12:00:00Z"
updated_at = "2025-12-28T12:00:00Z"
+++

## Intent

Test body content.
`;

    const result = parseStitchFile(content);

    expect(result.frontmatter.id).toBe("S-20251228-abcd");
    expect(result.frontmatter.title).toBe("Test stitch");
    expect(result.frontmatter.status).toBe("open");
    expect(result.body).toContain("Test body content.");
  });

  test("parses optional fields", () => {
    const content = `+++
id = "S-20251228-abcd"
title = "Test stitch"
status = "open"
created_at = "2025-12-28T12:00:00Z"
updated_at = "2025-12-28T12:00:00Z"
provenance = "human"
confidence = "high"
tags = ["test", "example"]

[scope]
paths = ["src/**"]

[relations]
parent = "S-20251228-0000"
depends_on = ["S-20251228-1111"]

[git]
links = [
  { kind = "commit", sha = "deadbeef1234567890abcdef1234567890abcdef" }
]
+++

Body
`;

    const result = parseStitchFile(content);

    expect(result.frontmatter.provenance).toBe("human");
    expect(result.frontmatter.confidence).toBe("high");
    expect(result.frontmatter.tags).toEqual(["test", "example"]);
    expect(result.frontmatter.scope?.paths).toEqual(["src/**"]);
    expect(result.frontmatter.relations?.parent).toBe("S-20251228-0000");
    expect(result.frontmatter.relations?.depends_on).toEqual(["S-20251228-1111"]);
    expect(result.frontmatter.git?.links).toHaveLength(1);
    expect(result.frontmatter.git?.links?.[0]?.kind).toBe("commit");
  });

  test("throws on missing frontmatter start", () => {
    const content = `id = "S-20251228-abcd"
title = "Test"
+++`;

    expect(() => parseStitchFile(content)).toThrow(ValidationError);
  });

  test("throws on missing frontmatter end", () => {
    const content = `+++
id = "S-20251228-abcd"
title = "Test"`;

    expect(() => parseStitchFile(content)).toThrow(ValidationError);
  });

  test("throws on missing required fields", () => {
    const content = `+++
title = "Test"
status = "open"
created_at = "2025-12-28T12:00:00Z"
updated_at = "2025-12-28T12:00:00Z"
+++

Body
`;

    expect(() => parseStitchFile(content)).toThrow(ValidationError);
  });
});

describe("serializeStitchFile", () => {
  test("serializes frontmatter and body", () => {
    const frontmatter: StitchFrontmatter = {
      id: "S-20251228-abcd",
      title: "Test stitch",
      status: "open",
      created_at: "2025-12-28T12:00:00Z",
      updated_at: "2025-12-28T12:00:00Z",
    };

    const body = "## Intent\n\nTest content.";

    const result = serializeStitchFile(frontmatter, body);

    expect(result).toContain("+++");
    expect(result).toContain('id = "S-20251228-abcd"');
    expect(result).toContain('title = "Test stitch"');
    expect(result).toContain("## Intent");
    expect(result).toContain("Test content.");
  });

  test("roundtrip preserves data", () => {
    const originalFrontmatter: StitchFrontmatter = {
      id: "S-20251228-abcd",
      title: "Roundtrip test",
      status: "open",
      created_at: "2025-12-28T12:00:00Z",
      updated_at: "2025-12-28T12:00:00Z",
      provenance: "agent",
      confidence: "medium",
      tags: ["a", "b"],
      relations: {
        parent: "S-20251228-0000",
        depends_on: ["S-20251228-1111"],
      },
    };

    const originalBody = "Test body content";

    const serialized = serializeStitchFile(originalFrontmatter, originalBody);
    const parsed = parseStitchFile(serialized);

    expect(parsed.frontmatter.id).toBe(originalFrontmatter.id);
    expect(parsed.frontmatter.title).toBe(originalFrontmatter.title);
    expect(parsed.frontmatter.status).toBe(originalFrontmatter.status);
    expect(parsed.frontmatter.provenance).toBe(originalFrontmatter.provenance);
    expect(parsed.frontmatter.confidence).toBe(originalFrontmatter.confidence);
    expect(parsed.frontmatter.tags).toEqual(originalFrontmatter.tags);
    expect(parsed.frontmatter.relations).toEqual(originalFrontmatter.relations);
    expect(parsed.body).toContain(originalBody);
  });
});

describe("updateTimestamp", () => {
  test("updates updated_at field", () => {
    const before = new Date().toISOString();

    const frontmatter: StitchFrontmatter = {
      id: "S-20251228-abcd",
      title: "Test",
      status: "open",
      created_at: "2025-12-28T12:00:00Z",
      updated_at: "2025-12-28T12:00:00Z",
    };

    const updated = updateTimestamp(frontmatter);

    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime()
    );
    expect(updated.created_at).toBe(frontmatter.created_at);
  });
});
