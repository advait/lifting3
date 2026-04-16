import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import { parseWorkoutInterchangeFile } from "../app/features/workouts/interchange.ts";

async function collectJsonFiles(targetPath: string) {
  const targetStats = await stat(targetPath).catch(() => null);

  if (!targetStats?.isDirectory()) {
    return [targetPath];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(targetPath, entry.name))
    .sort();
}

function formatZodError(error: ZodError) {
  return error.issues
    .map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "<root>";

      return `  - ${issuePath}: ${issue.message}`;
    })
    .join("\n");
}

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const inputPath = args[0];

  if (!inputPath) {
    console.error(
      "Usage: pnpm validate:workout-interchange -- <path-to-json-or-directory>"
    );
    process.exitCode = 1;
    return;
  }

  const resolvedInputPath = path.resolve(process.cwd(), inputPath);
  const files = await collectJsonFiles(resolvedInputPath);

  if (files.length === 0) {
    console.error(`No JSON files found in ${resolvedInputPath}`);
    process.exitCode = 1;
    return;
  }

  let validatedCount = 0;

  for (const filePath of files) {
    try {
      const contents = await readFile(filePath, "utf8");
      const parsedJson = JSON.parse(contents);
      parseWorkoutInterchangeFile(parsedJson);
      validatedCount += 1;
    } catch (error) {
      console.error(`Validation failed for ${filePath}`);

      if (error instanceof SyntaxError) {
        console.error(`  - <json>: ${error.message}`);
      } else if (error instanceof ZodError) {
        console.error(formatZodError(error));
      } else if (error instanceof Error) {
        console.error(`  - <runtime>: ${error.message}`);
      } else {
        console.error("  - <runtime>: Unknown validation error");
      }

      process.exitCode = 1;
      return;
    }
  }

  console.log(`Validated ${validatedCount} workout interchange file(s).`);
}

await main();
