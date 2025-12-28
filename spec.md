## Project: `stitch`

A local-first CLI (and optional TS library) for recording **intent** (“stitches”) and binding it to **git commits/diffs**, forming an **intent DAG** that can’t be represented by git’s linear history.

### Core goals

* Create and manage stitch entries stored **in-repo** in `.stitch/stitches/`
* TOML frontmatter + Markdown body for each stitch
* Maintain a “current stitch” intent session (human + agent friendly)
* Link stitches to git commits/ranges and optionally staged diffs (fingerprints)
* Provide “stitch blame”: map lines in a file to stitches via `git blame` and stored links
* Support DAG relationships: **containment** (`parent`) + **dependency** (`depends_on`)

---

## Directory structure (aligned to your template)

```
stitch/
├── src/
│   ├── api.ts
│   ├── cli.ts
│   ├── core/
│   │   ├── index.ts
│   │   ├── errors.ts
│   │   ├── ids.ts
│   │   ├── model.ts
│   │   ├── frontmatter.ts
│   │   ├── store.ts
│   │   ├── git.ts
│   │   ├── link.ts
│   │   ├── blame.ts
│   │   └── render.ts
│   └── platform/
│       ├── index.ts
│       └── paths.ts
├── tests/
│   ├── api.test.ts
│   ├── integration.test.ts
│   └── *.test.ts
└── (rest of template files)
```

* `src/api.ts`: public `StitchClient` library API (CLI calls this only) 
* `src/cli.ts`: Commander.js entrypoint (thin wrapper) 
* `src/core/*`: business logic
* `src/platform/paths.ts`: find repo root; locate `.stitch/` directory; ensure cross-platform behavior

---

## On-disk data model

### Repo-local working directory

`.stitch/`

* `current` — text file containing the current stitch ID (or empty)
* `stitches/` — one file per stitch

### Stitch file format (Markdown + TOML frontmatter)

Path: `.stitch/stitches/S-YYYYMMDD-xxxx.md`

Example:

```markdown
+++
id = "S-20251228-3f2a"
title = "Introduce local triage state"
status = "open" # open|closed|superseded|abandoned
created_at = "2025-12-28T22:41:00-08:00"
updated_at = "2025-12-28T22:41:00-08:00"
provenance = "mixed" # human|agent|mixed|retroactive
confidence = "medium" # low|medium|high
tags = ["triage", "storage"]

[scope]
paths = ["src/triage/**", "src/db/**"]

[relations]
parent = "S-20251228-aaaa"
depends_on = ["S-20251228-bbbb"]

[git]
links = [
  { kind = "commit", sha = "deadbeef" },
  { kind = "range", range = "origin/main..HEAD" },
]
fingerprints = [
  { algo = "sha256", kind = "staged-diff", value = "3b7c...9a2e" },
]
+++

## Intent
...

## Constraints
- ...

## Alternatives
- ...

## Notes
...
```

Notes:

* v1 can treat most fields as optional except: `id`, `title`, `status`, `created_at`, `updated_at`.
* `fingerprints` can ship in v1 even if used only for display/status (future-proofing). “Blame” can be commit-based first.

---

## Minimum CLI commands (v1)

This is the smallest set that models sessions, links, DAG, and blame.

### Session + DAG creation

1. `stitch start [title]`

* Creates a stitch file, sets current.

2. `stitch child [title]`

* Creates a stitch file with `relations.parent = <current>`, sets current.

3. `stitch switch <id>`

* Sets current.

4. `stitch status`

* Prints current stitch and ancestor chain.

### Editing and listing

5. `stitch edit [id?]`

* Opens `$EDITOR` for the stitch file (default: current).

6. `stitch list [--status open|closed|...]`

* Lists stitches (id, title, status, updated_at).

7. `stitch show <id>`

* Prints the stitch (or path + summary; v1 can just cat it).

### Linking to git

8. `stitch link --commit <sha>`

* Adds `{kind:"commit", sha}` to current (or `--id` support).

9. `stitch link --range <revRange>`

* Adds `{kind:"range", range}`.

10. `stitch link --staged`

* Computes `git diff --staged` + hashes it; adds fingerprint entry.

### Blame

11. `stitch blame <path> [--format plain|json]`

* Uses `git blame --line-porcelain` to get commit-per-line
* Maps commit → stitches via stored links (commit links and/or range expansion in-memory)
* Emits per-line stitch attribution; unknown lines shown as `unstitched`

That’s enough to be useful without requiring a DB or complex inference.

---

## Library API (minimum)

Per your “API-first design,” CLI uses the same public API. 

### `StitchClient` (public)

```ts
export type StitchId = string;

export type StitchStatus = "open" | "closed" | "superseded" | "abandoned";
export type Provenance = "human" | "agent" | "mixed" | "retroactive";
export type Confidence = "low" | "medium" | "high";

export type GitLink =
  | { kind: "commit"; sha: string }
  | { kind: "range"; range: string };

export type DiffFingerprint = {
  algo: "sha256";
  kind: "staged-diff" | "unified-diff";
  value: string;
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
  scope?: { paths?: string[] };
  relations?: { parent?: StitchId; depends_on?: StitchId[] };
  git?: { links?: GitLink[]; fingerprints?: DiffFingerprint[] };
};

export type StitchDoc = {
  frontmatter: StitchFrontmatter;
  body: string;
  filePath: string;
};

export type BlameLine = {
  line: number;
  sha: string;
  stitchIds: StitchId[]; // usually 0..1 in v1; keep array for future
  text: string;
};

export type ClientOptions = {
  repoRoot?: string;   // override for tests
};

export class StitchClient {
  constructor(options?: ClientOptions) {}

  init(): Promise<void>;

  // session
  start(title: string): Promise<StitchDoc>;
  child(title: string): Promise<StitchDoc>;
  switch(id: StitchId): Promise<void>;
  status(): Promise<{ current?: StitchId; lineage: StitchId[] }>;

  // reading
  list(filter?: { status?: StitchStatus }): Promise<StitchDoc[]>;
  get(id: StitchId): Promise<StitchDoc>;
  openInEditor(id?: StitchId): Promise<void>;

  // linking
  linkCommit(sha: string, id?: StitchId): Promise<void>;
  linkRange(range: string, id?: StitchId): Promise<void>;
  linkStagedDiff(id?: StitchId): Promise<DiffFingerprint>;

  // blame
  blame(path: string): Promise<BlameLine[]>;

  [Symbol.dispose](): void;
  close(): void;
}
```

Implementation notes:

* `init()` ensures `.stitch/`, `.stitch/stitches/`, and `.stitch/current` exist.
* `repoRoot` discovery: `git rev-parse --show-toplevel`.
* TOML parse/serialize: use a small TOML library (or implement minimal TOML writer/reader if you want full control). In Bun, third-party TOML libs generally work; v1 can parse only what you write.
* Validation: simple schema checks in code; optional JSON Schema later.

---

## Implementation details by module (v1)

### `core/store.ts`

* Read/write `.stitch/current`
* List stitch files; load by id; save updates
* Create new stitch file with stub content

### `core/ids.ts`

* Generate IDs: `S-${YYYYMMDD}-${base32orhex4}`
* Keep deterministic-ish formatting (good for sorting)

### `core/frontmatter.ts`

* Parse TOML frontmatter between `+++` fences
* Serialize frontmatter with stable key order (makes diffs nicer)
* Update `updated_at` on write

### `core/git.ts`

Minimal wrappers around:

* `git rev-parse --show-toplevel`
* `git blame --line-porcelain <path>`
* `git diff --staged`
* (optional) validate commit exists: `git cat-file -e <sha>^{commit}`

### `core/link.ts`

* Append link entries, dedupe
* For `--range`, store range string; v1 blame resolution can expand ranges lazily if needed

### `core/blame.ts`

* Parse `git blame --line-porcelain`
* Map each blamed sha → stitch ids:

  * direct match: stitches with `{kind:"commit", sha}`
  * optional v1 extension: for each `{kind:"range"}`, expand to commits once per run and map them
* Tie-break: if multiple, prefer direct commit link over range; then newest `updated_at`

### `core/render.ts`

* Pretty printing for list/status/blame
* JSON output for blame if `--format json`

### `core/errors.ts`

* `RepoNotFoundError`, `NotInitializedError`, `NoCurrentStitchError`, `StitchNotFoundError`, `GitError`

---

## Commander.js CLI mapping (thin wrapper)

Commands:

* `stitch init`
* `stitch start <title...>`
* `stitch child <title...>`
* `stitch switch <id>`
* `stitch status`
* `stitch edit [id]`
* `stitch list [--status <status>]`
* `stitch show <id>`
* `stitch link (--commit <sha> | --range <revRange> | --staged) [--id <id>]`
* `stitch blame <path> [--format plain|json]`

Follow your Better CLI guidance: clear errors to stderr, non-zero exit codes, `--format json` where it matters. 

---

## Tests (minimum)

### Unit

* Frontmatter parse/serialize roundtrip
* ID generation format
* Store create/list/get/current

### Integration (tmp git repo)

* Initialize a temporary git repo, make commits, run:

  * `stitch init`
  * `stitch start`
  * edit file + commit
  * `stitch link --commit HEAD`
  * `stitch blame file` returns stitch id for modified lines

Use Bun’s test runner + tmp dirs per your template. 

---

## v1 constraints (explicitly out of scope)

* Automatic git hooks / commit trailers
* Fuzzy diff fingerprint matching for blame
* SQLite indexing (scan files in v1)
* Topological graph commands (`graph`, `topo`, `impacted-by`) — later
