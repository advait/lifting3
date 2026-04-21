import { readFile } from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import {
  APP_STATE_FILE_FORMAT,
  parseImportableFile,
  type AppStateFile,
} from "../app/features/import-export/file.ts";
import {
  buildAppStateImportSql,
  summarizeAppState,
  type AppStateSummary,
} from "../app/features/import-export/app-state.ts";

export { buildAppStateImportSql, summarizeAppState, type AppStateSummary };

export class AppStateFileLoadError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause: unknown) {
    super(`Validation failed for ${filePath}`, { cause });
    this.filePath = filePath;
    this.name = "AppStateFileLoadError";
  }
}

export async function loadValidatedAppStateFile(targetPath: string): Promise<{
  readonly file: AppStateFile;
  readonly filePath: string;
}> {
  const filePath = path.resolve(process.cwd(), targetPath);

  try {
    const contents = await readFile(filePath, "utf8");
    const parsedJson = JSON.parse(contents) as unknown;
    const parsedFile = parseImportableFile(parsedJson);

    if (parsedFile.format !== APP_STATE_FILE_FORMAT) {
      throw new Error("This is a workout export. Use pnpm import:workout-json for workout files.");
    }

    return { file: parsedFile, filePath };
  } catch (error) {
    throw new AppStateFileLoadError(filePath, error);
  }
}

export function formatAppStateFileError(error: unknown) {
  if (error instanceof AppStateFileLoadError) {
    const details = error.cause;

    if (details instanceof SyntaxError) {
      return `${error.message}\n  - <json>: ${details.message}`;
    }

    if (details instanceof ZodError) {
      return `${error.message}\n${details.issues
        .map((issue) => {
          const issuePath = issue.path.length > 0 ? issue.path.join(".") : "<root>";

          return `  - ${issuePath}: ${issue.message}`;
        })
        .join("\n")}`;
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

export function formatAppStateSummary(summary: AppStateSummary) {
  return [
    `Workouts: ${summary.workoutCount}`,
    `Exercises: ${summary.exerciseCount}`,
    `Sets: ${summary.setCount}`,
    `User profile: ${summary.hasUserProfile ? "present" : "absent"}`,
  ].join("\n");
}
