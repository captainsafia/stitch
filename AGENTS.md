# AGENTS.md - Instructions for AI Coding Agents

This document provides guidance for AI agents working on the stitch codebase.

## Required: Use Stitch MCP for Intent Logging

**Agents must use stitch to record their intent when making changes to this repository.**

### Preferred: Use the Stitch MCP Server

If you have access to MCP tools, use the stitch MCP server for all stitch operations. The MCP server is registered for this project and provides these tools:

| Tool | Description |
|------|-------------|
| `stitch_create` | Create a new stitch document |
| `stitch_get` | Get a stitch by ID |
| `stitch_list` | List stitches with optional filters |
| `stitch_update_frontmatter` | Update stitch metadata |
| `stitch_update_body` | Update stitch markdown body |
| `stitch_link_commit` | Link a commit to a stitch |
| `stitch_link_range` | Link a commit range to a stitch |
| `stitch_link_staged_diff` | Link staged diff fingerprint |
| `stitch_blame` | Get stitch attribution for file lines |

All MCP tools require explicit `repoRoot` parameter (use the absolute path to this repository).

**MCP Workflow:**
1. `stitch_create` with title describing your task - Before starting work
2. Make your code changes
3. `git add . && git commit -m "..."` - Commit your changes
4. `stitch_link_commit` with the stitch ID and commit SHA - Link the commit
5. Repeat steps 2-4 as needed
6. `stitch_update_body` to add notes, constraints, or alternatives considered

### Alternative: Use the CLI

If MCP tools are not available, use the development version of the CLI:

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

**CLI Workflow summary:**
1. `bun src/cli.ts start "<task>"` - Before starting work
2. Make your code changes
3. `git add . && git commit -m "..."` - Commit your changes
4. `bun src/cli.ts link --commit HEAD` - Link the commit to your stitch
5. Repeat steps 2-4 as needed
6. Edit your stitch file to add notes, constraints, or alternatives considered

### Important

This ensures all changes to the stitch codebase are self-documented with intent metadata. The stitch files in `.stitch/stitches/` should be committed alongside your code changes.

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
