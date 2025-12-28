/**
 * Core type definitions for stitch documents
 */

export type StitchId = string;

export type StitchStatus = "open" | "closed" | "superseded" | "abandoned";

export type Provenance = "human" | "agent" | "mixed" | "retroactive";

export type Confidence = "low" | "medium" | "high";

export type GitLinkCommit = {
  kind: "commit";
  sha: string;
};

export type GitLinkRange = {
  kind: "range";
  range: string;
};

export type GitLink = GitLinkCommit | GitLinkRange;

export type DiffFingerprint = {
  algo: "sha256";
  kind: "staged-diff" | "unified-diff";
  value: string;
};

export type StitchScope = {
  paths?: string[];
};

export type StitchRelations = {
  parent?: StitchId;
  depends_on?: StitchId[];
};

export type StitchGit = {
  links?: GitLink[];
  fingerprints?: DiffFingerprint[];
};

export type StitchFrontmatter = {
  id: StitchId;
  title: string;
  status: StitchStatus;
  created_at: string;
  updated_at: string;
  provenance?: Provenance;
  confidence?: Confidence;
  tags?: string[];
  scope?: StitchScope;
  relations?: StitchRelations;
  git?: StitchGit;
};

export type StitchDoc = {
  frontmatter: StitchFrontmatter;
  body: string;
  filePath: string;
};

export type BlameLine = {
  line: number;
  sha: string;
  stitchIds: StitchId[];
  text: string;
};

export type ClientOptions = {
  repoRoot?: string;
};

export type StatusResult = {
  current?: StitchId;
  lineage: StitchId[];
};

export type ListFilter = {
  status?: StitchStatus;
};

/**
 * Default body template for new stitches
 */
export const DEFAULT_STITCH_BODY = `## Intent

[Describe the goal or purpose of this change]

## Constraints

- [List any constraints or requirements]

## Alternatives

- [Document alternative approaches considered]

## Notes

[Additional context or information]
`;

/**
 * Validate stitch status value
 */
export function isValidStatus(status: string): status is StitchStatus {
  return ["open", "closed", "superseded", "abandoned"].includes(status);
}

/**
 * Validate provenance value
 */
export function isValidProvenance(provenance: string): provenance is Provenance {
  return ["human", "agent", "mixed", "retroactive"].includes(provenance);
}

/**
 * Validate confidence value
 */
export function isValidConfidence(confidence: string): confidence is Confidence {
  return ["low", "medium", "high"].includes(confidence);
}
