# Contributing to stitch

Thank you for your interest in contributing to stitch! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) (latest version)
- Git

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/captainsafia/stitch.git
   cd stitch
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Run the tests to make sure everything works:
   ```bash
   bun test
   ```

## Development Workflow

### Running the CLI During Development

```bash
bun src/cli.ts <command>
```

### Type Checking

```bash
bun run typecheck
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/store.test.ts

# Run tests in watch mode
bun test --watch
```

### Building

```bash
# Build for npm distribution
bun run build

# Compile standalone binary
bun run compile
```

## Project Structure

```
stitch/
├── src/
│   ├── api.ts           # Public API (StitchClient)
│   ├── cli.ts           # CLI entry point
│   ├── core/            # Core business logic
│   │   ├── errors.ts    # Custom error types
│   │   ├── ids.ts       # ID generation
│   │   ├── model.ts     # Type definitions
│   │   ├── frontmatter.ts # TOML parsing/serialization
│   │   ├── store.ts     # File operations
│   │   ├── git.ts       # Git operations
│   │   ├── link.ts      # Git linking
│   │   ├── blame.ts     # Stitch blame
│   │   └── render.ts    # Output formatting
│   └── platform/        # Platform-specific utilities
│       └── paths.ts     # Path handling
├── tests/               # Test files
└── scripts/             # Build and install scripts
```

## Coding Standards

### TypeScript

- Use strict TypeScript (strict mode is enabled)
- Prefer explicit types over `any`
- Use `type` for type aliases and interfaces

### Code Style

- Use meaningful variable and function names
- Keep functions focused and small
- Add JSDoc comments for public APIs
- Follow existing patterns in the codebase

### Error Handling

- Use custom error classes from `src/core/errors.ts`
- Provide helpful error messages
- Handle errors at appropriate levels

### Testing

- Write tests for new functionality
- Test both success and error cases
- Use descriptive test names
- Keep tests focused and independent

## Pull Request Process

1. **Fork and Branch**: Create a fork and work on a feature branch
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**: Implement your changes with tests

3. **Test**: Ensure all tests pass
   ```bash
   bun run typecheck
   bun test
   ```

4. **Commit**: Use conventional commit messages
   ```
   feat: add new command
   fix: resolve issue with blame output
   docs: update README
   test: add tests for store module
   ```

5. **Push and PR**: Push your branch and create a pull request

6. **Review**: Address any feedback from reviewers

## Commit Message Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring

Examples:
```
feat: add stitch graph visualization command
fix: handle missing parent in lineage calculation
docs: add library usage examples to README
test: add integration tests for blame command
```

## Reporting Issues

When reporting issues, please include:

1. **Description**: Clear description of the issue
2. **Steps to Reproduce**: Minimal steps to reproduce
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **Environment**: OS, Bun version, stitch version

## Feature Requests

For feature requests, please:

1. Check existing issues to avoid duplicates
2. Describe the use case and motivation
3. Provide examples of how it would work

## Questions?

Feel free to open an issue for questions or discussions about the project.
