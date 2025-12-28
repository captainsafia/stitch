import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { StitchFrontmatter, GitLink, DiffFingerprint } from "./model.ts";
import { ValidationError } from "./errors.ts";

const FRONTMATTER_DELIMITER = "+++";

/**
 * Parse a stitch file content into frontmatter and body
 */
export function parseStitchFile(content: string): {
  frontmatter: StitchFrontmatter;
  body: string;
} {
  const lines = content.split("\n");

  if (lines[0] !== FRONTMATTER_DELIMITER) {
    throw new ValidationError("Invalid stitch file: missing frontmatter start");
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FRONTMATTER_DELIMITER) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new ValidationError("Invalid stitch file: missing frontmatter end");
  }

  const frontmatterContent = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").trim();

  const parsed = parseToml(frontmatterContent);
  const frontmatter = toStitchFrontmatter(parsed);

  return { frontmatter, body };
}

/**
 * Convert parsed TOML to StitchFrontmatter with validation
 */
function toStitchFrontmatter(obj: Record<string, unknown>): StitchFrontmatter {
  if (typeof obj["id"] !== "string") {
    throw new ValidationError("Missing or invalid 'id' field");
  }
  if (typeof obj["title"] !== "string") {
    throw new ValidationError("Missing or invalid 'title' field");
  }
  if (typeof obj["status"] !== "string") {
    throw new ValidationError("Missing or invalid 'status' field");
  }
  if (typeof obj["created_at"] !== "string") {
    throw new ValidationError("Missing or invalid 'created_at' field");
  }
  if (typeof obj["updated_at"] !== "string") {
    throw new ValidationError("Missing or invalid 'updated_at' field");
  }

  const frontmatter: StitchFrontmatter = {
    id: obj["id"],
    title: obj["title"],
    status: obj["status"] as StitchFrontmatter["status"],
    created_at: obj["created_at"],
    updated_at: obj["updated_at"],
  };

  if (typeof obj["provenance"] === "string") {
    frontmatter.provenance = obj["provenance"] as StitchFrontmatter["provenance"];
  }
  if (typeof obj["confidence"] === "string") {
    frontmatter.confidence = obj["confidence"] as StitchFrontmatter["confidence"];
  }
  if (Array.isArray(obj["tags"])) {
    frontmatter.tags = obj["tags"] as string[];
  }

  const scope = obj["scope"];
  if (scope && typeof scope === "object" && !Array.isArray(scope)) {
    const scopeObj = scope as Record<string, unknown>;
    frontmatter.scope = {};
    if (Array.isArray(scopeObj["paths"])) {
      frontmatter.scope.paths = scopeObj["paths"] as string[];
    }
  }

  const relations = obj["relations"];
  if (relations && typeof relations === "object" && !Array.isArray(relations)) {
    const relObj = relations as Record<string, unknown>;
    frontmatter.relations = {};
    if (typeof relObj["parent"] === "string") {
      frontmatter.relations.parent = relObj["parent"];
    }
    if (Array.isArray(relObj["depends_on"])) {
      frontmatter.relations.depends_on = relObj["depends_on"] as string[];
    }
  }

  const git = obj["git"];
  if (git && typeof git === "object" && !Array.isArray(git)) {
    const gitObj = git as Record<string, unknown>;
    frontmatter.git = {};
    if (Array.isArray(gitObj["links"])) {
      frontmatter.git.links = (gitObj["links"] as Record<string, unknown>[]).map(
        parseGitLink
      );
    }
    if (Array.isArray(gitObj["fingerprints"])) {
      frontmatter.git.fingerprints = (
        gitObj["fingerprints"] as Record<string, unknown>[]
      ).map(parseFingerprint);
    }
  }

  return frontmatter;
}

function parseGitLink(obj: Record<string, unknown>): GitLink {
  if (obj["kind"] === "commit" && typeof obj["sha"] === "string") {
    return { kind: "commit", sha: obj["sha"] };
  }
  if (obj["kind"] === "range" && typeof obj["range"] === "string") {
    return { kind: "range", range: obj["range"] };
  }
  throw new ValidationError(`Invalid git link: ${JSON.stringify(obj)}`);
}

function parseFingerprint(obj: Record<string, unknown>): DiffFingerprint {
  if (
    obj["algo"] === "sha256" &&
    (obj["kind"] === "staged-diff" || obj["kind"] === "unified-diff") &&
    typeof obj["value"] === "string"
  ) {
    return {
      algo: obj["algo"],
      kind: obj["kind"],
      value: obj["value"],
    };
  }
  throw new ValidationError(`Invalid fingerprint: ${JSON.stringify(obj)}`);
}

/**
 * Serialize frontmatter and body to stitch file content
 */
export function serializeStitchFile(
  frontmatter: StitchFrontmatter,
  body: string
): string {
  const tomlObj = frontmatterToToml(frontmatter);
  const tomlStr = stringifyToml(tomlObj);

  return `${FRONTMATTER_DELIMITER}\n${tomlStr}${FRONTMATTER_DELIMITER}\n\n${body}\n`;
}

/**
 * Convert StitchFrontmatter to a TOML-serializable object with stable key order
 */
function frontmatterToToml(fm: StitchFrontmatter): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    created_at: fm.created_at,
    updated_at: fm.updated_at,
  };

  if (fm.provenance) obj["provenance"] = fm.provenance;
  if (fm.confidence) obj["confidence"] = fm.confidence;
  if (fm.tags && fm.tags.length > 0) obj["tags"] = fm.tags;

  if (fm.scope && Object.keys(fm.scope).length > 0) {
    obj["scope"] = fm.scope;
  }

  if (fm.relations) {
    const relations: Record<string, unknown> = {};
    if (fm.relations.parent) relations["parent"] = fm.relations.parent;
    if (fm.relations.depends_on && fm.relations.depends_on.length > 0) {
      relations["depends_on"] = fm.relations.depends_on;
    }
    if (Object.keys(relations).length > 0) {
      obj["relations"] = relations;
    }
  }

  if (fm.git) {
    const git: Record<string, unknown> = {};
    if (fm.git.links && fm.git.links.length > 0) {
      git["links"] = fm.git.links;
    }
    if (fm.git.fingerprints && fm.git.fingerprints.length > 0) {
      git["fingerprints"] = fm.git.fingerprints;
    }
    if (Object.keys(git).length > 0) {
      obj["git"] = git;
    }
  }

  return obj;
}

/**
 * Update the updated_at timestamp in frontmatter
 */
export function updateTimestamp(frontmatter: StitchFrontmatter): StitchFrontmatter {
  return {
    ...frontmatter,
    updated_at: new Date().toISOString(),
  };
}
