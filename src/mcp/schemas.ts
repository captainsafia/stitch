import { z } from "zod";
import type { StitchFrontmatter, StitchDoc, BlameLine, DiffFingerprint } from "../core/model.ts";

/**
 * Input schemas for MCP tools
 */
export const StitchCreateInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  title: z.string().describe("Title for the new stitch"),
  parent: z.string().optional().describe("Parent stitch ID for hierarchy"),
  dependsOn: z.array(z.string()).optional().describe("Array of stitch IDs this depends on"),
  kind: z.string().optional().describe("Optional kind for future-proofing"),
});

export const StitchGetInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  stitchId: z.string().describe("The stitch ID to retrieve"),
});

export const StitchListInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  status: z.enum(["open", "closed", "superseded", "abandoned"]).optional().describe("Filter by status"),
  tag: z.string().optional().describe("Filter by tag"),
});

export const StitchUpdateFrontmatterInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  stitchId: z.string().describe("The stitch ID to update"),
  patch: z.record(z.string(), z.unknown()).describe("Partial frontmatter fields to update"),
});

export const StitchUpdateBodyInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  stitchId: z.string().describe("The stitch ID to update"),
  bodyMarkdown: z.string().describe("The new markdown body content"),
});

export const StitchLinkCommitInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  stitchId: z.string().describe("The stitch ID to link to"),
  sha: z.string().describe("Git commit SHA to link"),
});

export const StitchLinkRangeInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  stitchId: z.string().describe("The stitch ID to link to"),
  range: z.string().describe("Git commit range (e.g., origin/main..HEAD)"),
});

export const StitchLinkStagedDiffInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  stitchId: z.string().describe("The stitch ID to link to"),
});

export const StitchBlameInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  path: z.string().describe("File path to blame (relative to repo root)"),
  lineStart: z.number().int().positive().optional().describe("Start line (1-indexed)"),
  lineEnd: z.number().int().positive().optional().describe("End line (1-indexed, inclusive)"),
});

export const StitchFinishInputSchema = z.object({
  repoRoot: z.string().describe("Absolute path to the git repository root"),
  stitchId: z.string().optional().describe("Stitch ID to finish (defaults to current)"),
  status: z.enum(["closed", "superseded", "abandoned"]).optional().describe("Target status (default: closed)"),
  supersededBy: z.string().optional().describe("Superseding stitch ID (requires status=superseded)"),
  force: z.boolean().optional().describe("Override auto-abandoned detection"),
  skipConfirmation: z.boolean().optional().describe("Skip cascade confirmation (equivalent to --yes)"),
});

/**
 * Type definitions derived from schemas
 */
export type StitchCreateInput = z.infer<typeof StitchCreateInputSchema>;
export type StitchGetInput = z.infer<typeof StitchGetInputSchema>;
export type StitchListInput = z.infer<typeof StitchListInputSchema>;
export type StitchUpdateFrontmatterInput = z.infer<typeof StitchUpdateFrontmatterInputSchema>;
export type StitchUpdateBodyInput = z.infer<typeof StitchUpdateBodyInputSchema>;
export type StitchLinkCommitInput = z.infer<typeof StitchLinkCommitInputSchema>;
export type StitchLinkRangeInput = z.infer<typeof StitchLinkRangeInputSchema>;
export type StitchLinkStagedDiffInput = z.infer<typeof StitchLinkStagedDiffInputSchema>;
export type StitchBlameInput = z.infer<typeof StitchBlameInputSchema>;
export type StitchFinishInput = z.infer<typeof StitchFinishInputSchema>;

/**
 * Output types for MCP tools
 */
export type StitchCreateOutput = {
  stitchId: string;
  filePath: string;
  frontmatter: StitchFrontmatter;
};

export type StitchGetOutput = {
  stitchId: string;
  filePath: string;
  frontmatter: StitchFrontmatter;
  body: string;
};

export type StitchListSummary = {
  stitchId: string;
  title: string;
  status: string;
  updatedAt: string;
  tags?: string[];
  filePath: string;
};

export type StitchListOutput = StitchListSummary[];

export type StitchUpdateFrontmatterOutput = {
  frontmatter: StitchFrontmatter;
};

export type StitchUpdateBodyOutput = {
  ok: true;
};

export type StitchLinkCommitOutput = {
  ok: true;
};

export type StitchLinkRangeOutput = {
  ok: true;
};

export type StitchLinkStagedDiffOutput = {
  fingerprint: DiffFingerprint;
};

export type StitchBlameLineOutput = {
  line: number;
  sha: string;
  stitchIds: string[];
  text: string;
};

export type StitchBlameOutput = {
  path: string;
  lines: StitchBlameLineOutput[];
};

export type StitchFinishOutput = {
  finishedStitches: Array<{
    id: string;
    title: string;
    previousStatus: string;
    newStatus: string;
  }>;
  warnings: string[];
  finalStatus: string;
  autoDetectedStatus: boolean;
};

/**
 * Convert StitchDoc to create output
 */
export function docToCreateOutput(doc: StitchDoc): StitchCreateOutput {
  return {
    stitchId: doc.frontmatter.id,
    filePath: doc.filePath,
    frontmatter: doc.frontmatter,
  };
}

/**
 * Convert StitchDoc to get output
 */
export function docToGetOutput(doc: StitchDoc): StitchGetOutput {
  return {
    stitchId: doc.frontmatter.id,
    filePath: doc.filePath,
    frontmatter: doc.frontmatter,
    body: doc.body,
  };
}

/**
 * Convert StitchDoc to list summary
 */
export function docToListSummary(doc: StitchDoc): StitchListSummary {
  return {
    stitchId: doc.frontmatter.id,
    title: doc.frontmatter.title,
    status: doc.frontmatter.status,
    updatedAt: doc.frontmatter.updated_at,
    tags: doc.frontmatter.tags,
    filePath: doc.filePath,
  };
}

/**
 * Convert BlameLine array to blame output
 */
export function blameToOutput(path: string, lines: BlameLine[]): StitchBlameOutput {
  return {
    path,
    lines: lines.map((l) => ({
      line: l.line,
      sha: l.sha,
      stitchIds: l.stitchIds,
      text: l.text,
    })),
  };
}
