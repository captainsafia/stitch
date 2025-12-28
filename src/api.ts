import { spawn } from "node:child_process";
import type {
  StitchId,
  StitchDoc,
  StatusResult,
  ListFilter,
  DiffFingerprint,
  BlameLine,
  ClientOptions,
} from "./core/model.ts";
import {
  initializeStitch,
  isInitialized,
  createStitch,
  loadStitch,
  listStitches,
  getCurrentStitchId,
  setCurrentStitchId,
  requireCurrentStitchId,
  getLineage,
  getStitchFilePath,
} from "./core/store.ts";
import { getRepoRoot } from "./core/git.ts";
import { addCommitLink, addRangeLink, addStagedDiffFingerprint } from "./core/link.ts";
import { stitchBlame } from "./core/blame.ts";
import { getEditor } from "./platform/paths.ts";
import { NotInitializedError } from "./core/errors.ts";

// Re-export types for library consumers
export type {
  StitchId,
  StitchDoc,
  StitchStatus,
  StatusResult,
  ListFilter,
  DiffFingerprint,
  BlameLine,
  ClientOptions,
  StitchFrontmatter,
  GitLink,
  Provenance,
  Confidence,
} from "./core/model.ts";

export {
  StitchError,
  RepoNotFoundError,
  NotInitializedError,
  NoCurrentStitchError,
  StitchNotFoundError,
  GitError,
  ValidationError,
} from "./core/errors.ts";

/**
 * StitchClient is the main public API for interacting with stitch.
 * CLI commands should use this class to perform all operations.
 */
export class StitchClient {
  private repoRoot: string | null = null;
  private repoRootOverride: string | undefined;

  constructor(options?: ClientOptions) {
    this.repoRootOverride = options?.repoRoot;
  }

  /**
   * Get the repository root, resolving it if needed
   */
  private async getRepoRoot(): Promise<string> {
    if (this.repoRoot) {
      return this.repoRoot;
    }

    if (this.repoRootOverride) {
      this.repoRoot = this.repoRootOverride;
    } else {
      this.repoRoot = await getRepoRoot();
    }

    return this.repoRoot;
  }

  /**
   * Initialize stitch in the current repository
   */
  async init(): Promise<void> {
    const root = await this.getRepoRoot();
    await initializeStitch(root);
  }

  /**
   * Check if stitch is initialized
   */
  async isInitialized(): Promise<boolean> {
    const root = await this.getRepoRoot();
    return isInitialized(root);
  }

  /**
   * Start a new stitch session
   */
  async start(title: string): Promise<StitchDoc> {
    const root = await this.getRepoRoot();
    const doc = await createStitch(root, title);
    await setCurrentStitchId(root, doc.frontmatter.id);
    return doc;
  }

  /**
   * Create a child stitch under the current stitch
   */
  async child(title: string): Promise<StitchDoc> {
    const root = await this.getRepoRoot();
    const parentId = await requireCurrentStitchId(root);
    const doc = await createStitch(root, title, parentId);
    await setCurrentStitchId(root, doc.frontmatter.id);
    return doc;
  }

  /**
   * Switch to a different stitch
   */
  async switch(id: StitchId): Promise<void> {
    const root = await this.getRepoRoot();
    // Verify the stitch exists
    await loadStitch(root, id);
    await setCurrentStitchId(root, id);
  }

  /**
   * Get the current stitch status and lineage
   */
  async status(): Promise<StatusResult> {
    const root = await this.getRepoRoot();

    if (!isInitialized(root)) {
      throw new NotInitializedError();
    }

    const current = await getCurrentStitchId(root);

    if (!current) {
      return { lineage: [] };
    }

    const lineage = await getLineage(root, current);
    return { current, lineage };
  }

  /**
   * List all stitches
   */
  async list(filter?: ListFilter): Promise<StitchDoc[]> {
    const root = await this.getRepoRoot();
    return listStitches(root, filter);
  }

  /**
   * Get a stitch by ID
   */
  async get(id: StitchId): Promise<StitchDoc> {
    const root = await this.getRepoRoot();
    return loadStitch(root, id);
  }

  /**
   * Open a stitch in the user's editor
   */
  async openInEditor(id?: StitchId): Promise<void> {
    const root = await this.getRepoRoot();
    const stitchId = id ?? (await requireCurrentStitchId(root));
    const filePath = getStitchFilePath(root, stitchId);
    const editor = getEditor();

    return new Promise((resolve, reject) => {
      const child = spawn(editor, [filePath], {
        stdio: "inherit",
        shell: true,
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });

      child.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Link a commit to a stitch
   */
  async linkCommit(sha: string, id?: StitchId): Promise<void> {
    const root = await this.getRepoRoot();
    const stitchId = id ?? (await requireCurrentStitchId(root));
    const doc = await loadStitch(root, stitchId);
    await addCommitLink(root, doc, sha);
  }

  /**
   * Link a commit range to a stitch
   */
  async linkRange(range: string, id?: StitchId): Promise<void> {
    const root = await this.getRepoRoot();
    const stitchId = id ?? (await requireCurrentStitchId(root));
    const doc = await loadStitch(root, stitchId);
    await addRangeLink(root, doc, range);
  }

  /**
   * Link staged diff fingerprint to a stitch
   */
  async linkStagedDiff(id?: StitchId): Promise<DiffFingerprint> {
    const root = await this.getRepoRoot();
    const stitchId = id ?? (await requireCurrentStitchId(root));
    const doc = await loadStitch(root, stitchId);
    const { fingerprint } = await addStagedDiffFingerprint(root, doc);
    return fingerprint;
  }

  /**
   * Get stitch blame for a file
   */
  async blame(path: string): Promise<BlameLine[]> {
    const root = await this.getRepoRoot();
    return stitchBlame(root, path);
  }

  /**
   * Dispose of the client (for using with `using` keyword)
   */
  [Symbol.dispose](): void {
    this.close();
  }

  /**
   * Close the client and release resources
   */
  close(): void {
    // Currently no resources to release
    this.repoRoot = null;
  }
}
