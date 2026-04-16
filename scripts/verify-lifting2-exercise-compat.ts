import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXERCISE_SCHEMAS,
  resolveExerciseSchemaByName,
} from "../app/features/exercises/schema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultWorkoutsDir = path.resolve(
  __dirname,
  "../../lifting2/entries/workouts"
);
const EXERCISE_BLOCK_PATTERN =
  /\[\[exercises\]\](.*?)(?=\n\[\[exercises\]\]|$)/gs;
const EXERCISE_NAME_PATTERN = /^name\s*=\s*"([^"]+)"/m;

function extractExerciseNames(contents: string) {
  const names: string[] = [];

  for (const match of contents.matchAll(EXERCISE_BLOCK_PATTERN)) {
    const exerciseBlock = match[1];
    const nameMatch = exerciseBlock.match(EXERCISE_NAME_PATTERN);

    if (nameMatch) {
      names.push(nameMatch[1]);
    }
  }

  return names;
}

async function main() {
  const workoutsDir = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : defaultWorkoutsDir;
  const entries = await readdir(workoutsDir, { withFileTypes: true });
  const uniqueNames = new Set<string>();

  for (const entry of entries) {
    if (!(entry.isFile() && entry.name.endsWith(".toml"))) {
      continue;
    }

    const filePath = path.join(workoutsDir, entry.name);
    const contents = await readFile(filePath, "utf8");

    for (const name of extractExerciseNames(contents)) {
      uniqueNames.add(name);
    }
  }

  const unresolved: string[] = [];

  for (const name of [...uniqueNames].sort()) {
    if (!resolveExerciseSchemaByName(name)) {
      unresolved.push(name);
    }
  }

  if (unresolved.length > 0) {
    console.error("Missing exercise schema coverage for:");

    for (const name of unresolved) {
      console.error(`- ${name}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    `Verified ${uniqueNames.size} lifting2 exercise names against ${EXERCISE_SCHEMAS.length} schemas.`
  );
}

await main();
