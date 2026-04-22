import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

function getDefaultOutputPath(inputPath: string) {
  const extension = extname(inputPath);
  const baseName = basename(inputPath, extension);

  return join(dirname(inputPath), `${baseName}.fixed${extension || ".json"}`);
}

function stripSingleQuoteWrapper(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.startsWith("'") && trimmedValue.endsWith("'")) {
    return trimmedValue.slice(1, -1);
  }

  return value;
}

function normalizeRawDataStrings(value: string) {
  return value.replace(
    /"rawData":\s*"(.*?)",\s*"relativeMs":/gs,
    (_match: string, rawDataValue: string) =>
      `"rawData": ${JSON.stringify(rawDataValue)},\n      "relativeMs":`,
  );
}

function normalizeCoachCapture(value: string) {
  return normalizeRawDataStrings(stripSingleQuoteWrapper(value));
}

function parseArgs(argv: readonly string[]) {
  const [inputPath, outputPath] = argv;

  if (!inputPath) {
    throw new Error(
      "Usage: node --experimental-strip-types scripts/normalize-coach-capture.ts <input.json> [output.json]",
    );
  }

  return {
    inputPath,
    outputPath: outputPath ?? getDefaultOutputPath(inputPath),
  };
}

function main() {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  const inputText = readFileSync(inputPath, "utf8");
  const normalizedText = normalizeCoachCapture(inputText);
  const parsedCapture = JSON.parse(normalizedText);

  writeFileSync(outputPath, JSON.stringify(parsedCapture));
  console.log(outputPath);
}

main();
