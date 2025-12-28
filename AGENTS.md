# AGENTS.md - Instructions for AI Coding Agents

This document provides guidance for AI agents working on the stitch codebase.

## Required: Log Your Intent with Stitch

**Agents must use stitch to record their intent when making changes to this repository.**

Before starting any coding task, use the development version of the CLI to create or update a stitch:

```bash
# Initialize stitch if not already done
bun src/cli.ts init

# Start a new stitch for your task
bun src/cli.ts start "Brief description of what you're implementing"

# For sub-tasks, create child stitches
bun src/cli.ts child "Sub-task description"

# After committing, link your commits to the current stitch
bun src/cli.ts link --commit HEAD
```

This ensures all changes to the stitch codebase are self-documented with intent metadata. The stitch files in `.stitch/stitches/` should be committed alongside your code changes.

**Workflow summary:**
1. `bun src/cli.ts start "<task>"` - Before starting work
2. Make your code changes
3. `git add . && git commit -m "..."` - Commit your changes
4. `bun src/cli.ts link --commit HEAD` - Link the commit to your stitch
5. Repeat steps 2-4 as needed
6. Edit your stitch file to add notes, constraints, or alternatives considered

**After completing a task, agents must ensure that updated stitches are committed to source with a `chore` commit.**

## Project Overview

Stitch is a local-first CLI tool for recording developer intent and binding it to git commits/diffs. It creates an "intent DAG" that adds semantic meaning to git history.

## Architecture

### Core Principles

1. **API-First Design**: The CLI is a thin wrapper around `StitchClient` in `src/api.ts`. All business logic goes through the public API.

2. **Local-First Storage**: Data is stored in `.stitch/` within the repository. No external databases or services.

3. **Git Integration**: Heavy reliance on git for commit tracking, blame, and repository context.

### Key Modules

- `src/api.ts` - Public `StitchClient` class. CLI commands should only use this.
- `src/cli.ts` - Commander.js CLI. Keep this thin.
- `src/core/store.ts` - File operations for stitch documents
- `src/core/git.ts` - Git command wrappers
- `src/core/frontmatter.ts` - TOML frontmatter parsing/serialization
- `src/core/blame.ts` - Stitch blame logic
- `src/core/link.ts` - Git linking operations

### Data Model

Stitch documents are Markdown files with TOML frontmatter:

```markdown
+++
id = "S-YYYYMMDD-xxxx"
title = "..."
status = "open|closed|superseded|abandoned"
created_at = "ISO8601"
updated_at = "ISO8601"
# ... more fields
+++

## Intent
...
```

## Common Tasks

### Adding a New CLI Command

1. Add the command in `src/cli.ts` using Commander.js
2. Implement the logic in `StitchClient` (`src/api.ts`)
3. Add core functionality in appropriate `src/core/` modules
4. Add tests in `tests/`

### Modifying Frontmatter Schema

1. Update types in `src/core/model.ts`
2. Update parsing in `src/core/frontmatter.ts`
3. Update serialization in `src/core/frontmatter.ts`
4. Add roundtrip tests in `tests/frontmatter.test.ts`

### Adding Git Operations

1. Add wrapper functions in `src/core/git.ts`
2. Use Bun's `$` shell for command execution
3. Handle errors with `GitError` class
4. Add tests using temporary git repos

## Testing Guidelines

- Use `bun:test` for all tests
- Create temporary directories for file/git operations
- Clean up with `afterEach` hooks
- Test both success and error cases

Example test structure:
```typescript
describe("Feature", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `stitch-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await $`git init`.cwd(testDir).quiet();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("does something", async () => {
    // Test implementation
  });
});
```

## Error Handling

Use custom error classes from `src/core/errors.ts`:

- `StitchError` - Base class
- `RepoNotFoundError` - Not in a git repo
- `NotInitializedError` - `.stitch/` doesn't exist
- `NoCurrentStitchError` - No current stitch set
- `StitchNotFoundError` - Stitch ID doesn't exist
- `GitError` - Git command failed
- `ValidationError` - Invalid input/data

## Code Style

- TypeScript strict mode
- Use explicit types
- Prefer `async/await` over callbacks
- Use Bun APIs where available (e.g., `Bun.file()`, `$` shell)
- Keep functions small and focused

## Running Commands

```bash
# Development
bun src/cli.ts <command>

# Tests
bun test
bun test tests/specific.test.ts

# Type check
bun run typecheck

# Build
bun run compile
```

## Common Pitfalls

1. **Always check initialization**: Most operations require `.stitch/` to exist
2. **Handle missing current stitch**: Many commands operate on the current stitch
3. **Git repo required**: All operations expect to be in a git repository
4. **TOML parsing**: Use smol-toml library, not manual parsing
5. **Path handling**: Use `node:path` for cross-platform compatibility

## Future Considerations

The following are out of scope for v1 but may be added later:

- Automatic git hooks
- Fuzzy diff fingerprint matching
- SQLite indexing
- Graph visualization commands
- Topological analysis commands
