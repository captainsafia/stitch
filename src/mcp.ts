#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  StitchCreateInputSchema,
  StitchGetInputSchema,
  StitchListInputSchema,
  StitchUpdateFrontmatterInputSchema,
  StitchUpdateBodyInputSchema,
  StitchLinkCommitInputSchema,
  StitchLinkRangeInputSchema,
  StitchLinkStagedDiffInputSchema,
  StitchBlameInputSchema,
} from "./mcp/schemas.ts";
import {
  handleStitchCreate,
  handleStitchGet,
  handleStitchList,
  handleStitchUpdateFrontmatter,
  handleStitchUpdateBody,
  handleStitchLinkCommit,
  handleStitchLinkRange,
  handleStitchLinkStagedDiff,
  handleStitchBlame,
} from "./mcp/handlers.ts";
import { StitchError } from "./core/errors.ts";

const packageJson = await import("../package.json");

/**
 * Format error for MCP response
 */
function formatError(error: unknown): { type: "text"; text: string }[] {
  if (error instanceof StitchError) {
    return [{ type: "text", text: JSON.stringify({ error: error.name, message: error.message }) }];
  }
  if (error instanceof z.ZodError) {
    return [{ type: "text", text: JSON.stringify({ error: "ValidationError", message: error.message, issues: error.issues }) }];
  }
  if (error instanceof Error) {
    return [{ type: "text", text: JSON.stringify({ error: "Error", message: error.message }) }];
  }
  return [{ type: "text", text: JSON.stringify({ error: "UnknownError", message: String(error) }) }];
}

/**
 * Log to stderr (stdout is reserved for MCP protocol)
 */
function log(message: string): void {
  console.error(`[stitch-mcp] ${message}`);
}

/**
 * Create and configure the MCP server
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: "stitch-mcp",
    version: packageJson.version,
  });

  // stitch_create
  server.registerTool(
    "stitch_create",
    {
      description: "Create a new stitch document for recording developer intent. Auto-initializes .stitch/ if needed.",
      inputSchema: StitchCreateInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchCreate(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_get
  server.registerTool(
    "stitch_get",
    {
      description: "Get a stitch document by ID, including its frontmatter and body.",
      inputSchema: StitchGetInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchGet(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_list
  server.registerTool(
    "stitch_list",
    {
      description: "List all stitch documents with optional filtering by status or tag.",
      inputSchema: StitchListInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchList(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_update_frontmatter
  server.registerTool(
    "stitch_update_frontmatter",
    {
      description: "Update stitch frontmatter fields. Automatically bumps updated_at timestamp.",
      inputSchema: StitchUpdateFrontmatterInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchUpdateFrontmatter(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_update_body
  server.registerTool(
    "stitch_update_body",
    {
      description: "Replace the markdown body of a stitch document.",
      inputSchema: StitchUpdateBodyInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchUpdateBody(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_link_commit
  server.registerTool(
    "stitch_link_commit",
    {
      description: "Link a git commit SHA to a stitch. Validates commit exists and deduplicates.",
      inputSchema: StitchLinkCommitInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchLinkCommit(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_link_range
  server.registerTool(
    "stitch_link_range",
    {
      description: "Link a git commit range to a stitch (e.g., origin/main..HEAD).",
      inputSchema: StitchLinkRangeInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchLinkRange(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_link_staged_diff
  server.registerTool(
    "stitch_link_staged_diff",
    {
      description: "Create and link a fingerprint of the current staged git diff to a stitch.",
      inputSchema: StitchLinkStagedDiffInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchLinkStagedDiff(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  // stitch_blame
  server.registerTool(
    "stitch_blame",
    {
      description: "Get stitch attribution for lines in a file. Maps git blame to stitch IDs.",
      inputSchema: StitchBlameInputSchema,
    },
    async (args) => {
      try {
        const result = await handleStitchBlame(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: formatError(error), isError: true };
      }
    }
  );

  return server;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  log(`Starting stitch-mcp server v${packageJson.version}`);

  const server = createServer();
  const transport = new StdioServerTransport();

  // Set up graceful shutdown handlers
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    log(`Received ${signal}, shutting down gracefully...`);

    try {
      await server.close();
      log("Server closed successfully");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle stdin close (parent process disconnected)
  process.stdin.on("close", () => {
    log("stdin closed, shutting down...");
    shutdown("stdin close");
  });

  await server.connect(transport);

  log("Server connected via stdio transport");
}

// Run the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
