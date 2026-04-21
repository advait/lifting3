import { spawnSync } from "node:child_process";

export type D1Namespace = "local" | "dev" | "prod";

export function parseD1Namespace(value: string | undefined): D1Namespace {
  if (value === "local" || value === "dev" || value === "prod") {
    return value;
  }

  throw new Error("Pass --namespace local, dev, or prod.");
}

export function getD1NamespaceLabel(namespace: D1Namespace) {
  switch (namespace) {
    case "local":
      return "local namespace";
    case "dev":
      return "dev preview namespace";
    case "prod":
      return "prod namespace";
  }
}

export function getWranglerTargetFlags(namespace: D1Namespace) {
  switch (namespace) {
    case "local":
      return ["--local"];
    case "dev":
      return ["--remote", "--preview"];
    case "prod":
      return ["--remote"];
  }
}

function getPackageManagerExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export function runWranglerCommand(args: readonly string[], options?: { captureStdout?: boolean }) {
  const result = spawnSync(getPackageManagerExecutable(), ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options?.captureStdout === true ? ["inherit", "pipe", "inherit"] : "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Wrangler failed with exit code ${result.status ?? "unknown"}.`);
  }

  return result.stdout ?? "";
}

export function runWranglerSqlFile(namespace: D1Namespace, sqlFilePath: string) {
  runWranglerCommand([
    "d1",
    "execute",
    "DB",
    ...getWranglerTargetFlags(namespace),
    "--yes",
    "--file",
    sqlFilePath,
  ]);
}

export function runWranglerJsonQuery(namespace: D1Namespace, query: string) {
  const stdout = runWranglerCommand(
    ["d1", "execute", "DB", ...getWranglerTargetFlags(namespace), "--json", "--command", query],
    { captureStdout: true },
  );

  const parsed = JSON.parse(stdout) as Array<{
    readonly results?: ReadonlyArray<Record<string, unknown>>;
  }>;

  return parsed.flatMap((entry) => entry.results ?? []);
}

export function getD1TableColumnNames(namespace: D1Namespace, tableName: string) {
  const rows = runWranglerJsonQuery(namespace, `PRAGMA table_info('${tableName}');`);

  return rows.map((row) => row.name).filter((name): name is string => typeof name === "string");
}
