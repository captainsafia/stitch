export class StitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StitchError";
  }
}

export class RepoNotFoundError extends StitchError {
  constructor(path?: string) {
    super(
      path
        ? `Not a git repository: ${path}`
        : "Not a git repository (or any parent up to mount point)"
    );
    this.name = "RepoNotFoundError";
  }
}

export class NotInitializedError extends StitchError {
  constructor() {
    super(
      "Stitch is not initialized in this repository. Run 'stitch init' first."
    );
    this.name = "NotInitializedError";
  }
}

export class NoCurrentStitchError extends StitchError {
  constructor() {
    super(
      "No current stitch. Start a new stitch with 'stitch start <title>' or switch to an existing one with 'stitch switch <id>'."
    );
    this.name = "NoCurrentStitchError";
  }
}

export class StitchNotFoundError extends StitchError {
  constructor(id: string) {
    super(`Stitch not found: ${id}`);
    this.name = "StitchNotFoundError";
  }
}

export class GitError extends StitchError {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number
  ) {
    super(`Git error: ${message}`);
    this.name = "GitError";
  }
}

export class ValidationError extends StitchError {
  constructor(message: string) {
    super(`Validation error: ${message}`);
    this.name = "ValidationError";
  }
}
