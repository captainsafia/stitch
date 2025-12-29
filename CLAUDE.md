# CLAUDE.md - Claude Code Instructions

This file provides guidance for Claude Code when working on this repository.

## Primary Instructions

See [AGENTS.md](./AGENTS.md) for complete instructions on:

- **Required stitch usage** - All changes must be logged with stitch
- **Project architecture** - API-first design, local-first storage, git integration
- **Code style** - TypeScript strict mode, Bun APIs, async/await patterns
- **Testing guidelines** - bun:test, temporary directories, cleanup hooks
- **Error handling** - Custom error classes from `src/core/errors.ts`

## Quick Reference

### Stitch MCP Tools (Preferred)

Use the stitch MCP server tools for intent logging:

- `stitch_create` - Start a new task
- `stitch_link_commit` - Link commits after committing
- `stitch_update_body` - Add notes and context

All tools require `repoRoot` set to this repository's absolute path.

### Key Commands

```bash
bun test                    # Run tests
bun run typecheck           # Type check
bun src/cli.ts <command>    # Run CLI in development
```

### Project Structure

- `src/api.ts` - Public StitchClient API (business logic goes here)
- `src/cli.ts` - CLI wrapper (keep thin)
- `src/mcp.ts` - MCP server entry point
- `src/core/` - Core modules (store, git, frontmatter, etc.)
- `tests/` - Test files
