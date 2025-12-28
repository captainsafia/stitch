## Project Overview

Create a TypeScript CLI tool using the Bun runtime with the following characteristics:

- **Runtime**: Bun (prefer Bun APIs over Node.js equivalents)
- **Language**: TypeScript with strict mode enabled
- **Distribution**: Single-file compiled binaries for Linux, macOS, and Windows
- **Package**: Publishable to npm as both a CLI and library (where library APIs are applicable)

## Directory Structure

```
project-name/
├── .github/
│   └── workflows/
│       ├── ci.yml              # PR/push quality checks
│       ├── pr-publish.yml      # PR artifact builds with comments
│       └── release.yml         # Tagged releases + npm publishing
├── scripts/
│   └── install.sh              # Curl-friendly installer script
├── src/
│   ├── api.ts                  # Public API (optional - for library consumers)
│   ├── cli.ts                  # CLI entry point using Commander.js
│   ├── core/                   # Core business logic modules
│   │   └── index.ts            # Re-exports from core modules
│   ├── platform/               # OS-specific utilities (optional - if needed)
│   │   └── index.ts
│   └── storage/                # Data persistence layer (optional - if needed)
│       └── index.ts
├── tests/
│   ├── api.test.ts             # API integration tests
│   ├── *.test.ts               # Unit tests for each module
│   └── integration.test.ts     # End-to-end CLI tests
├── AGENTS.md                   # Instructions for AI coding agents
├── CONTRIBUTING.md             # Contribution guidelines
├── LICENSE                     # MIT License
├── package.json
├── README.md
└── tsconfig.json
```

## Key Architecture Principles

### 1. Module Organization

- **`src/core/`**: Business logic and core functionality
- **`src/cli.ts`**: CLI entry point using Commander.js
- **`src/api.ts`** (optional): Public API for library consumers
- **`src/platform/`** (optional): OS-specific logic if needed (e.g., XDG config on Unix, APPDATA on Windows)
- **`src/storage/`** (optional): Data persistence layer if your tool requires state management

### 2. API-First Design (For Library-Compatible CLIs)

If your CLI will also be published as a library, follow an API-first approach:

```typescript
// src/api.ts - Public API class with JSDoc documentation
export class ProjectClient {
  constructor(options?: ClientOptions) {}
  
  async someMethod(): Promise<Result> {}
  
  // Implement Symbol.dispose for automatic cleanup
  [Symbol.dispose](): void {}
  
  close(): void {}
}
```

The CLI should call the same public API that library consumers use. Never access storage or internal modules directly from CLI code.

### 3. Standalone CLI Design (For CLI-Only Tools)

For simpler CLIs that don't need library exports, you can implement logic directly in `src/cli.ts` or organize into modules within `src/core/` that are called by the CLI

### 4. TypeScript Configuration

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

### 5. Package.json Structure

**For CLI + Library:**

```json
{
  "name": "@scope/project-name",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/api.js",
  "types": "dist/api.d.ts",
  "bin": {
    "project-name": "dist/cli.js"
  },
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/api.d.ts",
      "import": "./dist/api.js"
    }
  },
  "scripts": {
    "build": "bun build src/api.ts --outdir dist --target node && dts-bundle-generator -o dist/api.d.ts src/api.ts",
    "compile": "bun build src/cli.ts --compile --outfile project-name",
    "compile:linux-x64": "bun build src/cli.ts --compile --target=bun-linux-x64 --outfile project-name-linux-x64",
    "compile:linux-arm64": "bun build src/cli.ts --compile --target=bun-linux-arm64 --outfile project-name-linux-arm64",
    "compile:darwin-x64": "bun build src/cli.ts --compile --target=bun-darwin-x64 --outfile project-name-darwin-x64",
    "compile:darwin-arm64": "bun build src/cli.ts --compile --target=bun-darwin-arm64 --outfile project-name-darwin-arm64",
    "compile:windows-x64": "bun build src/cli.ts --compile --target=bun-windows-x64 --outfile project-name-windows-x64.exe",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "dts-bundle-generator": "^9.5.1",
    "typescript": "^5"
  },
  "dependencies": {
    "commander": "^12.0.0"
  }
}
```

**For CLI-Only:**

```json
{
  "name": "@scope/project-name",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "project-name": "dist/cli.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/cli.ts --outdir dist --target node",
    "compile": "bun build src/cli.ts --compile --outfile project-name",
    "compile:linux-x64": "bun build src/cli.ts --compile --target=bun-linux-x64 --outfile project-name-linux-x64",
    "compile:linux-arm64": "bun build src/cli.ts --compile --target=bun-linux-arm64 --outfile project-name-linux-arm64",
    "compile:darwin-x64": "bun build src/cli.ts --compile --target=bun-darwin-x64 --outfile project-name-darwin-x64",
    "compile:darwin-arm64": "bun build src/cli.ts --compile --target=bun-darwin-arm64 --outfile project-name-darwin-arm64",
    "compile:windows-x64": "bun build src/cli.ts --compile --target=bun-windows-x64 --outfile project-name-windows-x64.exe",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  },
  "dependencies": {
    "commander": "^12.0.0"
  }
}
```

## CLI Pattern with Commander.js

**For CLI + Library (API-First):**

```typescript
#!/usr/bin/env bun

import { Command, Option } from "commander";
import { ProjectClient } from "./api.ts";

const packageJson = await import("../package.json");

const program = new Command();

program
  .name("project-name")
  .description("Description of the CLI")
  .version(packageJson.version);

program
  .command("action")
  .description("Perform an action")
  .argument("<arg>", "Required argument")
  .option("-o, --option <value>", "Optional flag")
  .addOption(new Option("-f, --format <format>", "Output format").choices(["json", "plain"]).default("plain"))
  .action(async (arg: string, options: { option?: string; format: string }) => {
    using client = new ProjectClient();
    
    try {
      const result = await client.someMethod(arg, options);
      
      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
```

**For Standalone CLI:**

```typescript
#!/usr/bin/env bun

import { Command, Option } from "commander";
import { performAction } from "./core/index.ts";

const packageJson = await import("../package.json");

const program = new Command();

program
  .name("project-name")
  .description("Description of the CLI")
  .version(packageJson.version);

program
  .command("action")
  .description("Perform an action")
  .argument("<arg>", "Required argument")
  .option("-o, --option <value>", "Optional flag")
  .addOption(new Option("-f, --format <format>", "Output format").choices(["json", "plain"]).default("plain"))
  .action(async (arg: string, options: { option?: string; format: string }) => {
    try {
      const result = await performAction(arg, options);
      
      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
```

## Testing Conventions

Use Bun's native test runner with isolated test environments.

**For API-based projects:**

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectClient } from "../src/api.ts";

describe("ProjectClient", () => {
  let testDir: string;
  let client: ProjectClient;

  beforeEach(async () => {
    testDir = join(tmpdir(), `project-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    client = new ProjectClient({ configDir: testDir });
  });

  afterEach(async () => {
    client.close();
    await rm(testDir, { recursive: true, force: true });
  });

  test("does something", async () => {
    const result = await client.someMethod();
    expect(result).toBeDefined();
  });
});
```

**For standalone CLIs:**

```typescript
import { describe, expect, test } from "bun:test";
import { performAction } from "../src/core/index.ts";

describe("Core functionality", () => {
  test("performs action correctly", async () => {
    const result = await performAction("input", { option: "value" });
    expect(result).toBeDefined();
  });
});
```

For end-to-end CLI testing, use Bun's process spawning:

```typescript
import { describe, expect, test } from "bun:test";
import { $ } from "bun";

describe("CLI integration", () => {
  test("runs command successfully", async () => {
    const result = await $("bun run src/cli.ts action input").text();
    expect(result).toContain("expected output");
  });
});
```

## GitHub Actions Workflows

### CI Workflow (ci.yml)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun run typecheck
      - run: bun test
      - run: bun run compile
```

### PR Build Workflow (pr-publish.yml)

Builds all platform binaries on PRs with artifacts named `project-pr-{PR_NUMBER}-{platform}`:

```yaml
name: PR Build

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  build-linux-windows:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run typecheck
      - run: bun test
      
      # Build Linux and Windows platforms
      - run: bun build src/cli.ts --compile --minify --target=bun-linux-x64 --outfile project-linux-x64
      - run: bun build src/cli.ts --compile --minify --target=bun-linux-arm64 --outfile project-linux-arm64
      - run: bun build src/cli.ts --compile --minify --target=bun-windows-x64 --outfile project-windows-x64.exe
      
      # Upload artifacts
      - uses: actions/upload-artifact@v4
        with:
          name: project-pr-${{ github.event.pull_request.number }}-linux-x64
          path: project-linux-x64
          retention-days: 30
      - uses: actions/upload-artifact@v4
        with:
          name: project-pr-${{ github.event.pull_request.number }}-linux-arm64
          path: project-linux-arm64
          retention-days: 30
      - uses: actions/upload-artifact@v4
        with:
          name: project-pr-${{ github.event.pull_request.number }}-windows-x64
          path: project-windows-x64.exe
          retention-days: 30

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      
      # Build macOS binaries
      - run: bun build src/cli.ts --compile --minify --target=bun-darwin-x64 --outfile project-darwin-x64
      - run: bun build src/cli.ts --compile --minify --target=bun-darwin-arm64 --outfile project-darwin-arm64
      
      # Sign macOS binaries (optional - only if secrets are available)
      - name: Sign macOS binaries
        if: ${{ secrets.MACOS_CERTIFICATE != '' }}
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          # Create temporary keychain
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          
          # Import certificate
          echo "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12
          security import certificate.p12 -k build.keychain -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" build.keychain
          
          # Sign binaries
          codesign --force --sign "Developer ID Application" --timestamp project-darwin-x64
          codesign --force --sign "Developer ID Application" --timestamp project-darwin-arm64
          
          # Verify signatures
          codesign --verify --verbose project-darwin-x64
          codesign --verify --verbose project-darwin-arm64
          
          # Clean up
          rm certificate.p12
          security delete-keychain build.keychain
      
      # Upload artifacts
      - uses: actions/upload-artifact@v4
        with:
          name: project-pr-${{ github.event.pull_request.number }}-darwin-x64
          path: project-darwin-x64
          retention-days: 30
      - uses: actions/upload-artifact@v4
        with:
          name: project-pr-${{ github.event.pull_request.number }}-darwin-arm64
          path: project-darwin-arm64
          retention-days: 30
```

### Release Workflow (release.yml)

Triggers on version tags (`v*.*.*`) and main branch pushes:

- Builds all platform binaries
- Signs macOS binaries with Developer ID (uses same signing approach as PR workflow)
- Creates GitHub releases with assets
- Publishes to npm with preview tags for main branch
- Uses semantic versioning with preview suffixes for non-tagged builds

**Required GitHub Secrets for macOS Signing:**
- `MACOS_CERTIFICATE`: Base64-encoded .p12 certificate file
- `MACOS_CERTIFICATE_PASSWORD`: Password for the .p12 file
- `KEYCHAIN_PASSWORD`: Temporary keychain password (can be any secure string)

The release workflow should follow the same pattern as the PR workflow, with separate jobs for Linux/Windows and macOS builds. The macOS job runs on `macos-latest` and includes the code signing steps before creating releases

## Install Script Pattern

The `scripts/install.sh` script should:

1. Detect OS and architecture
2. Support version flags: `--preview`, `--pr <number>`, or specific version
3. Download from GitHub releases or PR artifacts
4. Install to `~/.project-name/bin`
5. Provide shell-specific PATH instructions

Key features:
- Use `curl` for downloads (widely available)
- Require `gh` CLI for PR artifact downloads
- Detect user's shell for appropriate PATH export syntax
- Include PR number in artifact names for easy API lookup

The install script should be accessible via a short URL for easy installation:
```bash
curl -fsSL https://raw.githubusercontent.com/user/project-name/main/scripts/install.sh | bash
```

## README Structure

The README.md is the **source of truth** for all project documentation. Every CLI project must include a comprehensive README.md with the following sections:

### 1. Project Name and Description
- Clear project name as the main heading
- Short description (3-5 sentences) explaining:
  - What the tool does
  - Who it's for
  - Key features or benefits
  - When to use it

### 2. Installation Instructions
- Multiple installation methods:
  - Binary installation via curl script
  - npm/npx installation
  - Building from source
- Platform-specific notes if applicable

### 3. Usage Instructions
- Quick start example showing the most common use case
- Command reference with examples for each command
- Configuration options and environment variables
- Common workflows or recipes

### 4. Contributing
- Link to CONTRIBUTING.md or inline guidelines
- Development setup instructions
- Testing commands
- Pull request process

**Example README structure:**

```markdown
# project-name

A fast, lightweight CLI tool for [purpose]. Built with TypeScript and Bun, 
it provides [key feature] with [key benefit]. Perfect for developers who 
need to [use case]. Works seamlessly across macOS, Linux, and Windows.

## Installation

### Binary (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/user/project-name/main/scripts/install.sh | bash
```

### npm

```bash
npm install -g @scope/project-name
```

### Building from Source

```bash
git clone https://github.com/user/project-name.git
cd project-name
bun install
bun run build
```

## Usage

### Quick Start

```bash
# Quick start
project-name action <arg> --option value

# With JSON output
project-name action <arg> --format json
```

### Commands

#### `project-name action <arg>`

Description of what this command does.

**Options:**
- `-o, --option <value>` - Description of option
- `-f, --format <format>` - Output format (json, plain)

**Examples:**

```bash
project-name action example --option value
project-name action example --format json
```

### Configuration

Configuration files are stored in:
- macOS: `~/Library/Application Support/project-name/`
- Linux: `~/.config/project-name/`
- Windows: `%APPDATA%\project-name\`

**Environment Variables:**
- `PROJECT_NAME_CONFIG` - Override config file path
- `PROJECT_NAME_API_KEY` - API key for authentication

## Development

### Setup

```bash
git clone https://github.com/user/project-name.git
cd project-name
bun install
```

### Testing

```bash
bun test           # Run tests
bun run typecheck  # Type checking
```

### Building

```bash
bun run build      # Build for npm distribution
bun run compile    # Compile standalone binary
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) 
for development setup and guidelines.

## License

MIT © [year] [author]
```

## Development Requirements

Before committing, always run:

```bash
bun run typecheck  # Verify TypeScript compliance
bun test           # Ensure all tests pass
```

## Error Handling Best Practices

Follow [Better CLI error handling guidelines](https://bettercli.org/) for robust error management:

### Error Messages
- Write clear, actionable error messages that tell users what went wrong and how to fix it
- Include context: what operation failed, why it failed, what the user can do
- Use stderr for all error output
- Exit with appropriate non-zero exit codes

```typescript
// Good error handling example
try {
  const result = await performOperation();
} catch (error) {
  if (error instanceof NetworkError) {
    console.error(`Error: Failed to connect to ${error.host}`);
    console.error(`Please check your internet connection and try again.`);
    process.exit(1);
  } else if (error instanceof ValidationError) {
    console.error(`Error: Invalid input - ${error.message}`);
    console.error(`Run 'project-name --help' for usage information.`);
    process.exit(1);
  } else {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
```

### Error Types
- Define custom error classes for different failure scenarios
- Include relevant context in error objects
- Map errors to appropriate exit codes

```typescript
class ConfigurationError extends Error {
  constructor(message: string, public configPath: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

class NetworkError extends Error {
  constructor(message: string, public host: string, public statusCode?: number) {
    super(message);
    this.name = 'NetworkError';
  }
}
```

### Graceful Degradation
- Handle SIGINT (Ctrl+C) gracefully
- Clean up resources before exiting
- Provide feedback when interrupting long operations

```typescript
process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');
  // Clean up resources
  await cleanup();
  process.exit(130); // Standard exit code for SIGINT
});
```

### Debug Mode
- Support `--debug` or `DEBUG` environment variable for verbose error output
- Include stack traces only in debug mode
- Log additional context for troubleshooting

```typescript
const isDebug = process.env.DEBUG === '1' || options.debug;

if (isDebug) {
  console.error('Stack trace:', error.stack);
  console.error('Context:', JSON.stringify(context, null, 2));
}
```

## Better CLI Standards Compliance

The CLI should follow best practices from [Better CLI](https://bettercli.org/), a comprehensive guide for CLI design:

### Help Pages
- Implement `-h` and `--help` flags for all commands
- Provide clear, concise command descriptions
- Include usage examples in help text
- Document all options and arguments with descriptions

### Exit Codes
- Use exit code `0` for success
- Use non-zero exit codes for errors (typically `1` for general errors)
- Consider specific exit codes for different error types if beneficial

### Output and Messaging
- Send normal output to `stdout`
- Send errors and warnings to `stderr`
- Support `--quiet` flag to suppress non-essential output
- Support `--verbose` flag for detailed output (if applicable)
- Provide machine-readable output formats (e.g., JSON) via `--format json`

### Configuration
- Follow OS conventions for config locations:
  - Unix/Linux: `~/.config/project-name/` (XDG Base Directory)
  - macOS: `~/Library/Application Support/project-name/`
  - Windows: `%APPDATA%\project-name\`
- Support environment variables for configuration
- Allow config file path override via `--config` flag

### Performance
- Show progress indicators for long-running operations
- Implement timeouts for network operations
- Consider caching strategies where appropriate

### Versioning
- Always implement `--version` flag
- Use semantic versioning (major.minor.patch)
- Include version in help output and error messages

### User Experience
- Use colors sparingly and purposefully
- Respect `NO_COLOR` environment variable
- Provide confirmation prompts for destructive operations
- Support `--yes` flag to skip confirmations (for automation)

### Security
- Never log or display sensitive information (tokens, passwords)
- Store credentials securely (use OS keychain when possible)
- Validate all user input

### Distribution
- Provide multiple installation methods (binary, npm, curl script)
- Document installation in README
- Consider shell completion scripts (see Better CLI guide)

## Commit Standards

Follow Conventional Commits format:
- Types: `feat`, `fix`, `chore`, `test`, `docs` (lowercase)
- Imperative mood verbs
- Subject lines under 72 characters

Examples:
```
feat: add export command with shell auto-detection
fix: handle symlinks in path resolution
docs: update README with library usage examples
```

---

## License

All CLI tools should use the **MIT License** for maximum compatibility and adoption.

Create a `LICENSE` file in the project root:

```
MIT License

Copyright (c) [year] [author]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Include in `package.json`:
```json
{
  "license": "MIT"
}
```

## Quick Start for New Projects

1. Initialize with `bun init`
2. Set up the directory structure above (omit optional directories as needed)
3. Create `LICENSE` file with MIT License
4. Configure `tsconfig.json` with strict settings
5. Add Commander.js: `bun add commander`
6. Add dev dependencies: `bun add -d @types/bun typescript`
   - If building as a library too: `bun add -d dts-bundle-generator`
7. Choose your approach:
   - **CLI + Library**: Create API class with `Symbol.dispose` support, then thin CLI wrapper
   - **Standalone CLI**: Implement logic in `src/cli.ts` or `src/core/` modules
8. Write comprehensive README.md following the structure above
9. Set up GitHub Actions workflows
10. Create the install script in `scripts/install.sh`
