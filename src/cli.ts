#!/usr/bin/env bun

import { Command, Option } from "commander";
import { StitchClient } from "./api.ts";
import {
  renderStitchList,
  renderStitchListJson,
  renderStatus,
  renderStatusJson,
  renderStitchDoc,
  renderBlamePlain,
  renderBlameJson,
  renderSuccess,
} from "./core/render.ts";
import {
  StitchError,
  NotInitializedError,
  NoCurrentStitchError,
} from "./core/errors.ts";
import {
  getLatestVersion,
  isUpdateAvailable,
  installUpdate,
  detectPlatform,
  detectInstallMethod,
  getInstallMethodDescription,
} from "./platform/update/index.ts";

const packageJson = await import("../package.json");

const program = new Command();

program
  .name("stitch")
  .description(packageJson.description)
  .version(packageJson.version);

/**
 * Check for updates in the background (non-blocking)
 * Only runs for commands that aren't update or help
 */
async function checkForUpdates(): Promise<void> {
  try {
    const versions = await getLatestVersion();
    const current = packageJson.version;

    if (versions.stable && isUpdateAvailable(current, versions.stable)) {
      console.error("");
      console.error(
        `A new version of stitch is available: ${versions.stable} (current: ${current})`
      );
      console.error("Run 'stitch update' to update.");
      console.error("");
    }
  } catch {
    // Silently ignore version check errors
  }
}

// Run update check in background for non-update, non-help commands
const args = process.argv.slice(2);
const skipCheckCommands = ["update", "--help", "-h", "--version", "-V"];
if (!args.some((arg) => skipCheckCommands.includes(arg))) {
  // Fire and forget - don't await
  checkForUpdates();
}

// stitch init
program
  .command("init")
  .description("Initialize stitch in the current repository")
  .action(async () => {
    using client = new StitchClient();

    try {
      const initialized = await client.isInitialized();
      if (initialized) {
        console.log("Stitch is already initialized in this repository.");
        return;
      }

      await client.init();
      console.log(renderSuccess("Stitch initialized."));
      console.log("");
      console.log("Next steps:");
      console.log("  stitch start <title>  - Start a new stitch");
    } catch (error) {
      handleError(error);
    }
  });

// stitch start <title...>
program
  .command("start")
  .description("Start a new stitch session")
  .argument("<title...>", "Title for the new stitch")
  .action(async (titleParts: string[]) => {
    using client = new StitchClient();

    try {
      const title = titleParts.join(" ");
      const doc = await client.start(title);
      console.log(renderSuccess(`Created stitch: ${doc.frontmatter.id}`));
      console.log(`Title: ${doc.frontmatter.title}`);
      console.log(`File: ${doc.filePath}`);
    } catch (error) {
      handleError(error);
    }
  });

// stitch child <title...>
program
  .command("child")
  .description("Create a child stitch under the current stitch")
  .argument("<title...>", "Title for the child stitch")
  .action(async (titleParts: string[]) => {
    using client = new StitchClient();

    try {
      const title = titleParts.join(" ");
      const doc = await client.child(title);
      console.log(renderSuccess(`Created child stitch: ${doc.frontmatter.id}`));
      console.log(`Title: ${doc.frontmatter.title}`);
      console.log(`Parent: ${doc.frontmatter.relations?.parent}`);
      console.log(`File: ${doc.filePath}`);
    } catch (error) {
      handleError(error);
    }
  });

// stitch switch <id>
program
  .command("switch")
  .description("Switch to a different stitch")
  .argument("<id>", "Stitch ID to switch to")
  .action(async (id: string) => {
    using client = new StitchClient();

    try {
      await client.switch(id);
      console.log(renderSuccess(`Switched to stitch: ${id}`));
    } catch (error) {
      handleError(error);
    }
  });

// stitch status [--json]
program
  .command("status")
  .description("Show current stitch status and lineage")
  .option("-j, --json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    using client = new StitchClient();

    try {
      const status = await client.status();
      if (options.json) {
        console.log(renderStatusJson(status));
      } else {
        console.log(renderStatus(status));
      }
    } catch (error) {
      handleError(error);
    }
  });

// stitch edit [id]
program
  .command("edit")
  .description("Open a stitch in your editor")
  .argument("[id]", "Stitch ID to edit (defaults to current)")
  .action(async (id?: string) => {
    using client = new StitchClient();

    try {
      await client.openInEditor(id);
    } catch (error) {
      handleError(error);
    }
  });

// stitch list [--status <status>] [--json]
program
  .command("list")
  .description("List all stitches")
  .addOption(
    new Option("-s, --status <status>", "Filter by status").choices([
      "open",
      "closed",
      "superseded",
      "abandoned",
    ])
  )
  .option("-j, --json", "Output as JSON")
  .action(async (options: { status?: string; json?: boolean }) => {
    using client = new StitchClient();

    try {
      const filter = options.status
        ? { status: options.status as "open" | "closed" | "superseded" | "abandoned" }
        : undefined;
      const stitches = await client.list(filter);
      if (options.json) {
        console.log(renderStitchListJson(stitches));
      } else {
        console.log(renderStitchList(stitches));
      }
    } catch (error) {
      handleError(error);
    }
  });

// stitch show <id>
program
  .command("show")
  .description("Show details of a stitch")
  .argument("<id>", "Stitch ID to show")
  .action(async (id: string) => {
    using client = new StitchClient();

    try {
      const doc = await client.get(id);
      console.log(renderStitchDoc(doc));
    } catch (error) {
      handleError(error);
    }
  });

// stitch link (--commit <sha> | --range <range> | --staged) [--id <id>]
program
  .command("link")
  .description("Link git commits or diffs to a stitch")
  .option("-c, --commit <sha>", "Link a specific commit")
  .option("-r, --range <range>", "Link a commit range (e.g., origin/main..HEAD)")
  .option("-s, --staged", "Link the current staged diff fingerprint")
  .option("-i, --id <id>", "Stitch ID to link to (defaults to current)")
  .action(
    async (options: {
      commit?: string;
      range?: string;
      staged?: boolean;
      id?: string;
    }) => {
      using client = new StitchClient();

      try {
        const optionCount = [options.commit, options.range, options.staged].filter(
          Boolean
        ).length;

        if (optionCount === 0) {
          console.error(
            "Error: Must specify one of --commit, --range, or --staged"
          );
          process.exit(1);
        }

        if (optionCount > 1) {
          console.error(
            "Error: Cannot specify more than one of --commit, --range, or --staged"
          );
          process.exit(1);
        }

        if (options.commit) {
          await client.linkCommit(options.commit, options.id);
          console.log(renderSuccess(`Linked commit: ${options.commit}`));
        } else if (options.range) {
          await client.linkRange(options.range, options.id);
          console.log(renderSuccess(`Linked range: ${options.range}`));
        } else if (options.staged) {
          const fingerprint = await client.linkStagedDiff(options.id);
          console.log(renderSuccess(`Linked staged diff`));
          console.log(`Fingerprint: ${fingerprint.value.slice(0, 16)}...`);
        }
      } catch (error) {
        handleError(error);
      }
    }
  );

// stitch blame <path> [--format plain|json]
program
  .command("blame")
  .description("Show stitch attribution for each line in a file")
  .argument("<path>", "File path to blame")
  .addOption(
    new Option("-f, --format <format>", "Output format")
      .choices(["plain", "json"])
      .default("plain")
  )
  .action(async (path: string, options: { format: string }) => {
    using client = new StitchClient();

    try {
      const blameLines = await client.blame(path);

      if (options.format === "json") {
        console.log(renderBlameJson(blameLines));
      } else {
        console.log(renderBlamePlain(blameLines));
      }
    } catch (error) {
      handleError(error);
    }
  });

// stitch update [--version <ver>] [--preview] [--yes]
program
  .command("update")
  .description("Update stitch to the latest version")
  .option("-t, --target <version>", "Install a specific version")
  .option("-p, --preview", "Install the latest preview version")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(
    async (options: { target?: string; preview?: boolean; yes?: boolean }) => {
      try {
        const current = packageJson.version;
        const installMethod = detectInstallMethod();
        let targetVersion: string;

        // Determine target version
        if (options.target) {
          targetVersion = options.target;
        } else if (options.preview) {
          console.log("Checking for latest preview version...");
          const versions = await getLatestVersion(true);
          if (!versions.preview) {
            console.error("Error: No preview version available.");
            process.exit(1);
          }
          targetVersion = versions.preview;
        } else {
          console.log("Checking for latest version...");
          const versions = await getLatestVersion(true);
          if (!versions.stable) {
            console.error(
              "Error: Could not fetch latest version. Check your network connection."
            );
            process.exit(1);
          }
          targetVersion = versions.stable;
        }

        // Check if update is needed
        if (current === targetVersion) {
          console.log(`Already running stitch v${current}`);
          return;
        }

        // Show update info
        console.log("");
        console.log(`Current version:  ${current}`);
        console.log(`Target version:   ${targetVersion}`);
        console.log(
          `Install method:   ${getInstallMethodDescription(installMethod)}`
        );
        if (installMethod === "binary") {
          console.log(`Platform:         ${detectPlatform()}`);
        }
        console.log("");

        // Confirmation prompt
        if (!options.yes) {
          const answer = prompt("Proceed with update? [y/N]");

          if (
            answer?.toLowerCase() !== "y" &&
            answer?.toLowerCase() !== "yes"
          ) {
            console.log("Update cancelled.");
            return;
          }
        }

        // Perform update
        const result = await installUpdate(
          targetVersion,
          current,
          (message) => {
            console.log(message);
          }
        );

        if (result.success) {
          console.log("");
          console.log(
            renderSuccess(`Updated stitch from v${current} to v${targetVersion}`)
          );
          if (installMethod === "binary") {
            console.log(
              "Please restart your terminal for changes to take effect."
            );
          }
        } else {
          console.error("");
          console.error(`Error: Update failed: ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        handleError(error);
      }
    }
  );

/**
 * Handle errors with appropriate exit codes and messages
 */
function handleError(error: unknown): never {
  if (error instanceof NotInitializedError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  if (error instanceof NoCurrentStitchError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  if (error instanceof StitchError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    if (process.env["DEBUG"] === "1") {
      console.error(error.stack);
    }
    process.exit(1);
  }

  console.error("An unexpected error occurred");
  process.exit(1);
}

// Handle SIGINT gracefully
process.on("SIGINT", () => {
  console.log("\nInterrupted.");
  process.exit(130);
});

program.parse();
