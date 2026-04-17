import { formatWorkoutFileError, loadValidatedWorkoutFiles } from "./workout-json-helpers.ts";

async function main() {
  const inputPaths = process.argv.slice(2).filter((argument) => argument !== "--");

  if (inputPaths.length === 0) {
    console.error(
      "Usage: pnpm validate:workout-json -- <path-to-json-or-directory> [more-paths...]",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const files = await loadValidatedWorkoutFiles(inputPaths);

    if (files.length === 0) {
      console.error(`No JSON files found in ${inputPaths.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Validated ${files.length} workout JSON file(s).`);
  } catch (error) {
    console.error(formatWorkoutFileError(error));
    process.exitCode = 1;
  }
}

await main();
