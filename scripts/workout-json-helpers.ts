import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import {
  assertUniqueWorkoutIds,
  buildExistingWorkoutIdsQuery,
  buildImportedWorkoutRecord,
  buildWorkoutImportSql,
  createImportedWorkoutRows,
  summarizeWorkoutImport,
  toImportedWorkoutRows,
  type ImportedWorkoutRecord,
  type ImportedWorkoutRows,
  type ValidatedWorkoutFile,
  type WorkoutImportSummary,
} from "../app/features/workouts/importer.ts";
import { parseWorkoutFile } from "../app/features/workouts/file.ts";

export {
  buildExistingWorkoutIdsQuery,
  buildImportedWorkoutRecord,
  buildWorkoutImportSql,
  createImportedWorkoutRows,
  summarizeWorkoutImport,
  toImportedWorkoutRows,
  type ImportedWorkoutRecord,
  type ImportedWorkoutRows,
  type ValidatedWorkoutFile,
  type WorkoutImportSummary,
};

export class WorkoutFileLoadError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause: unknown) {
    super(`Validation failed for ${filePath}`, { cause });
    this.filePath = filePath;
    this.name = "WorkoutFileLoadError";
  }
}

async function collectJsonFiles(targetPath: string) {
  const targetStats = await stat(targetPath).catch(() => null);

  if (targetStats == null) {
    throw new Error(`Path not found: ${targetPath}`);
  }

  if (!targetStats.isDirectory()) {
    return [targetPath];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(targetPath, entry.name))
    .sort();
}

export async function collectWorkoutJsonFiles(targetPaths: readonly string[]) {
  const jsonFiles = new Set<string>();

  for (const targetPath of targetPaths) {
    const resolvedPath = path.resolve(process.cwd(), targetPath);

    for (const filePath of await collectJsonFiles(resolvedPath)) {
      jsonFiles.add(filePath);
    }
  }

  return [...jsonFiles].sort();
}

export async function loadValidatedWorkoutFiles(targetPaths: readonly string[]) {
  const filePaths = await collectWorkoutJsonFiles(targetPaths);

  const files = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const contents = await readFile(filePath, "utf8");
        const parsedJson = JSON.parse(contents);

        return {
          file: parseWorkoutFile(parsedJson),
          filePath,
        } satisfies ValidatedWorkoutFile;
      } catch (error) {
        throw new WorkoutFileLoadError(filePath, error);
      }
    }),
  );

  assertUniqueWorkoutIds(files);

  return files;
}

export function formatZodError(error: ZodError) {
  return error.issues
    .map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "<root>";

      return `  - ${issuePath}: ${issue.message}`;
    })
    .join("\n");
}

export function formatWorkoutFileError(error: unknown) {
  if (error instanceof WorkoutFileLoadError) {
    const details = error.cause;

    if (details instanceof SyntaxError) {
      return `${error.message}\n  - <json>: ${details.message}`;
    }

    if (details instanceof ZodError) {
      return `${error.message}\n${formatZodError(details)}`;
    }

    if (details instanceof Error) {
      return `${error.message}\n  - <runtime>: ${details.message}`;
    }

    return `${error.message}\n  - <runtime>: Unknown validation error`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
