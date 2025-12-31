# Specification: `stitch finish` Command

## Overview

The `stitch finish` command transitions stitches from `open` to a terminal status (`closed`, `superseded`, or `abandoned`). It includes intelligent auto-detection, cascading behavior for children, and atomic operations.

## Command Signature

```
stitch finish [id] [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `id` | No | Stitch ID to finish. Defaults to current stitch. |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--status <status>` | `closed` \| `superseded` \| `abandoned` | `closed` | Target terminal status |
| `--by <id>` | string | - | Superseding stitch ID (only valid with `--status=superseded`) |
| `--force` | boolean | `false` | Override auto-abandoned detection |
| `--yes` | boolean | `false` | Skip confirmation prompt for cascade closes |

## Behavior

### 1. Target Resolution

1. If `[id]` is provided, use that stitch
2. If no `[id]`, use current stitch
3. If no current stitch and no `[id]`, **error**: "No current stitch. Use `stitch finish <id>` or `stitch start` first."

### 2. Auto-Abandoned Detection

The command automatically selects `abandoned` status instead of `closed` when **any** of these conditions are true:

- **No linked commits**: `git.links` array is empty or undefined (fingerprints do not count)
- **Has open children**: Any direct or transitive children have `status: "open"`

When auto-detection triggers:
- A warning is logged: `"Warning: No linked commits found. Marking as abandoned. Use --status=superseded if this work was replaced."`
- If user explicitly passed `--status=closed` (or other non-abandoned status), the command **errors** unless `--force` is provided

### 3. Cascade Close

When finishing a stitch with children:

1. Find all descendants (children, grandchildren, etc.) using the parent-children index
2. All descendants are updated to match the parent's **final** status (after auto-detection)
3. Children already in a terminal status are updated **if their status differs** from the target
4. Children inherit the parent's status unconditionally (no per-child evaluation)

### 4. Confirmation Prompt

When cascade close affects **2 or more stitches** (parent + children):

```
This will finish 5 stitches:
  - abc123 (parent)
  - def456
  - ghi789
  - ...

Continue? [y/N]
```

- Pass `--yes` to skip the prompt
- Prompt reads from stdin; non-interactive environments should use `--yes`

### 5. Atomicity

The operation is **atomic**:

1. Validate all target stitches can be modified (exist, writable)
2. Prepare all changes in memory
3. Write all changes
4. If any write fails, **rollback** all previously written changes to their original state

### 6. Current Pointer

After successfully finishing a stitch:

- The `.stitch/current` file is **cleared** (set to empty string)
- User must explicitly `stitch start` or `stitch switch` to set a new current stitch

### 7. Status Transitions

| From | To (allowed) |
|------|--------------|
| `open` | `closed`, `superseded`, `abandoned` |
| `closed` | `superseded`, `abandoned` |
| `superseded` | `closed`, `abandoned` |
| `abandoned` | `closed`, `superseded` |

All terminal-to-terminal transitions are allowed (enables correcting mistakes).

### 8. Superseded Relationship Storage

When `--by=<id>` is provided with `--status=superseded`:

- The superseding stitch ID is stored in `relations.depends_on` array
- This reuses the existing field rather than adding a new schema field
- The `--by` flag is optional; superseded status can be set without specifying the replacement

## Output

### Success (Verbose Default)

```
Finished stitch abc123 (status: closed)
  Title: Implement user authentication
  Children: 2 stitches also finished
```

With cascade:
```
Finished stitch abc123 (status: abandoned)
  Title: Implement user authentication
  Reason: No linked commits
  Children finished:
    - def456: Add login form
    - ghi789: Add logout button
```

### Warnings

```
Warning: No linked commits found. Marking as abandoned.
         Use --status=superseded if this work was replaced.
```

```
Warning: Stitch has 3 open children that will be cascade-finished.
```

### Errors

```
Error: No current stitch. Use `stitch finish <id>` or `stitch start` first.
```

```
Error: Cannot set status to 'closed' when no commits are linked.
       Use --force to override, or --status=abandoned.
```

```
Error: Stitch 'xyz789' not found.
```

## Parent-Children Index

### Design

A new persistent index file at `.stitch/index.json`:

```json
{
  "version": 1,
  "children": {
    "abc123": ["def456", "ghi789"],
    "def456": ["jkl012"]
  },
  "updated_at": "2025-01-15T10:30:00.000Z"
}
```

### Maintenance

The index is updated by these operations:
- `stitch start` (new stitch, no parent entry needed)
- `stitch child` (add child to parent's entry)
- `stitch finish` (no index changes needed - relationships preserved for history)

### Rebuild

If index is missing or corrupted:
1. Scan all `.stitch/stitches/*.md` files
2. Build parent->children map from `relations.parent` fields
3. Write new index file

Add internal function: `rebuildIndex(repoRoot: string): Promise<void>`

## MCP Server Integration

Add new MCP tool: `stitch_finish`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repoRoot` | string | Yes | Absolute path to repository root |
| `stitchId` | string | No | Stitch ID to finish (defaults to current) |
| `status` | string | No | Target status (default: "closed") |
| `supersededBy` | string | No | Superseding stitch ID |
| `force` | boolean | No | Override auto-detection |
| `skipConfirmation` | boolean | No | Skip cascade confirmation (equivalent to --yes) |

### Return Value

```typescript
{
  finishedStitches: Array<{
    id: string;
    title: string;
    previousStatus: string;
    newStatus: string;
  }>;
  warnings: string[];
}
```

## API Layer Changes

### New Method: `StitchClient.finish()`

```typescript
interface FinishOptions {
  status?: 'closed' | 'superseded' | 'abandoned';
  supersededBy?: StitchId;
  force?: boolean;
  skipConfirmation?: boolean;
}

interface FinishResult {
  finished: StitchDoc[];
  warnings: string[];
  autoDetectedStatus: boolean;
}

async finish(id?: StitchId, options?: FinishOptions): Promise<FinishResult>
```

### New Method: `StitchClient.getChildren()`

```typescript
async getChildren(id: StitchId): Promise<StitchId[]>
```

### New Method: `StitchClient.getDescendants()`

```typescript
async getDescendants(id: StitchId): Promise<StitchId[]>
```

## Implementation Tasks

1. **Core: Add index infrastructure**
   - Create `src/core/index.ts` for index management
   - Add `Index` type to `model.ts`
   - Implement `loadIndex`, `saveIndex`, `rebuildIndex`
   - Update `createStitch` to maintain index on child creation

2. **Core: Add finish logic**
   - Add `finishStitch` function to `store.ts` or new `src/core/finish.ts`
   - Implement auto-detection logic
   - Implement cascade logic with atomicity

3. **API: Extend StitchClient**
   - Add `finish()`, `getChildren()`, `getDescendants()` methods

4. **CLI: Add finish command**
   - Add command to `cli.ts`
   - Implement confirmation prompt
   - Add render functions for finish output

5. **MCP: Add stitch_finish tool**
   - Add tool definition to `mcp.ts`
   - Wire to StitchClient.finish()

6. **Tests**
   - Unit tests for index management
   - Unit tests for auto-detection logic
   - Integration tests for cascade behavior
   - Integration tests for atomicity/rollback

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Finish stitch with no children | Direct finish, no cascade prompt |
| Finish stitch with only closed children | Update children if status differs |
| Finish already-finished stitch | Allow status transition |
| `--by` without `--status=superseded` | Error: "--by requires --status=superseded" |
| `--by` with non-existent stitch ID | Error: "Superseding stitch 'xyz' not found" |
| Index file missing | Rebuild index before operation |
| Index file corrupted | Rebuild index before operation |
| Circular parent references | Detect and error (existing lineage logic handles this) |

## Future Considerations (Out of Scope)

- `stitch reopen` command for reversing finish
- `--message` flag to append closing notes
- Auto-linking unlinked commits before finish
- JSON output mode (`--json` flag)
- Bulk finish by tag or filter
