import type { StitchDoc, GitLink, DiffFingerprint } from "./model.ts";
import { saveStitch } from "./store.ts";
import { getStagedDiff, hashDiff, commitExists, resolveRef } from "./git.ts";
import { ValidationError } from "./errors.ts";

/**
 * Add a commit link to a stitch
 */
export async function addCommitLink(
  repoRoot: string,
  doc: StitchDoc,
  sha: string
): Promise<StitchDoc> {
  // Validate commit exists
  const exists = await commitExists(sha, repoRoot);
  if (!exists) {
    throw new ValidationError(`Commit not found: ${sha}`);
  }

  // Resolve to full SHA
  const fullSha = await resolveRef(sha, repoRoot);

  const link: GitLink = { kind: "commit", sha: fullSha };
  return addLink(repoRoot, doc, link);
}

/**
 * Add a range link to a stitch
 */
export async function addRangeLink(
  repoRoot: string,
  doc: StitchDoc,
  range: string
): Promise<StitchDoc> {
  const link: GitLink = { kind: "range", range };
  return addLink(repoRoot, doc, link);
}

/**
 * Add a staged diff fingerprint to a stitch
 */
export async function addStagedDiffFingerprint(
  repoRoot: string,
  doc: StitchDoc
): Promise<{ doc: StitchDoc; fingerprint: DiffFingerprint }> {
  const diff = await getStagedDiff(repoRoot);

  if (!diff.trim()) {
    throw new ValidationError("No staged changes to fingerprint");
  }

  const hash = await hashDiff(diff);

  const fingerprint: DiffFingerprint = {
    algo: "sha256",
    kind: "staged-diff",
    value: hash,
  };

  const updatedDoc = addFingerprint(doc, fingerprint);
  const savedDoc = await saveStitch(repoRoot, updatedDoc);

  return { doc: savedDoc, fingerprint };
}

/**
 * Add a git link to a stitch document (with deduplication)
 */
function addLink(
  repoRoot: string,
  doc: StitchDoc,
  link: GitLink
): Promise<StitchDoc> {
  const git = doc.frontmatter.git ?? {};
  const links = git.links ?? [];

  // Check for duplicates
  const isDuplicate = links.some((existing) => {
    if (existing.kind !== link.kind) return false;
    if (existing.kind === "commit" && link.kind === "commit") {
      return existing.sha === link.sha;
    }
    if (existing.kind === "range" && link.kind === "range") {
      return existing.range === link.range;
    }
    return false;
  });

  if (isDuplicate) {
    return Promise.resolve(doc); // Already exists, no change needed
  }

  const updatedDoc: StitchDoc = {
    ...doc,
    frontmatter: {
      ...doc.frontmatter,
      git: {
        ...git,
        links: [...links, link],
      },
    },
  };

  return saveStitch(repoRoot, updatedDoc);
}

/**
 * Add a fingerprint to a stitch document (with deduplication)
 */
function addFingerprint(doc: StitchDoc, fingerprint: DiffFingerprint): StitchDoc {
  const git = doc.frontmatter.git ?? {};
  const fingerprints = git.fingerprints ?? [];

  // Check for duplicates
  const isDuplicate = fingerprints.some(
    (existing) =>
      existing.algo === fingerprint.algo &&
      existing.kind === fingerprint.kind &&
      existing.value === fingerprint.value
  );

  if (isDuplicate) {
    return doc;
  }

  return {
    ...doc,
    frontmatter: {
      ...doc.frontmatter,
      git: {
        ...git,
        fingerprints: [...fingerprints, fingerprint],
      },
    },
  };
}
