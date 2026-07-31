import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";

import { getScriptArgs } from "./cli-args.ts";

const APPLY_CONFIRMATION = "DELETE_LEGACY_COACH_SESSIONS";
const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

interface CliOptions {
  readonly apply: boolean;
  readonly json: boolean;
  readonly threads: ReadonlyArray<string>;
  readonly verbose: boolean;
}

interface MigrationResponse {
  readonly apply: boolean;
  readonly failed: number;
  readonly results: ReadonlyArray<{
    readonly legacyMessageCount?: number;
    readonly message?: string;
    readonly status: string;
    readonly thread: string;
    readonly toolCallCount?: number;
  }>;
}

const HELP = `Migrate persisted Think coach sessions into effect-durable-agent.

Usage:
  pnpm migrate:legacy-coach-sessions [options]

Options:
  --apply                         Import, verify, then delete each legacy session.
  --confirm=${APPLY_CONFIRMATION}  Required with --apply.
  --thread <name>                 Include an orphaned thread (repeatable).
  --json                          Emit the final report as JSON.
  --verbose                       Show Wrangler startup output.
  --help                          Show this help.

The default is a read-only dry run over "general" and every workout currently
present in D1. Durable Object namespaces cannot enumerate instances, so use
--thread workout:<deleted-id> for sessions whose workout row no longer exists.
`;

const usageError = (message: string): never => {
  process.stderr.write(`${message}\n\n${HELP}`);
  process.exitCode = 2;
  throw new Error("__USAGE__");
};

const parseOptions = (args: ReadonlyArray<string>): CliOptions | null => {
  let apply = false;
  let confirmation: string | undefined;
  let json = false;
  let verbose = false;
  const threads: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP);
      return null;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--verbose") {
      verbose = true;
      continue;
    }
    if (arg === "--thread") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return usageError("--thread requires a coach thread name.");
      }
      threads.push(value);
      index += 1;
      continue;
    }
    if (arg?.startsWith("--thread=")) {
      threads.push(arg.slice("--thread=".length));
      continue;
    }
    if (arg?.startsWith("--confirm=")) {
      confirmation = arg.slice("--confirm=".length);
      continue;
    }
    return usageError(`Unknown option: ${String(arg)}`);
  }
  if (threads.some((thread) => thread.trim().length === 0)) {
    return usageError("--thread requires a non-empty coach thread name.");
  }
  if (apply && confirmation !== APPLY_CONFIRMATION) {
    return usageError(`--apply requires --confirm=${APPLY_CONFIRMATION}.`);
  }
  if (!apply && confirmation !== undefined) {
    return usageError("--confirm is only valid with --apply.");
  }
  return { apply, json, threads, verbose };
};

const findAvailablePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const waitForWorker = async (url: string, child: ChildProcess): Promise<void> => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Wrangler exited before startup with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.status === 404 || response.status === 401) {
        return;
      }
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for the remote migration Worker to start.");
};

const stopChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(fallback);
      resolve();
    });
  });
};

const runMigration = async (options: CliOptions): Promise<MigrationResponse> => {
  const port = await findAvailablePort();
  const token = randomUUID();
  const workerUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--remote",
      "--config",
      "scripts/migrate-legacy-coach-sessions.wrangler.jsonc",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--var",
      `MIGRATION_TOKEN:${token}`,
    ],
    {
      cwd: process.cwd(),
      stdio: options.verbose ? "inherit" : "ignore",
    },
  );
  try {
    await waitForWorker(workerUrl, child);
    const response = await fetch(`${workerUrl}/migrate`, {
      body: JSON.stringify({ apply: options.apply, threads: options.threads }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const body = (await response.json()) as MigrationResponse | { message?: string };
    if (!("results" in body)) {
      throw new Error(body.message ?? `Migration Worker returned HTTP ${response.status}.`);
    }
    return body;
  } finally {
    await stopChild(child);
  }
};

const printReport = (report: MigrationResponse, options: CliOptions): void => {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    options.apply ? "Legacy coach session migration\n" : "Dry-run migration plan\n",
  );
  for (const result of report.results) {
    const counts =
      result.legacyMessageCount === undefined
        ? ""
        : ` (${result.legacyMessageCount} messages, ${result.toolCallCount ?? 0} tool calls)`;
    const detail = result.message === undefined ? "" : `: ${result.message}`;
    process.stdout.write(`- ${result.thread}: ${result.status}${counts}${detail}\n`);
  }
  process.stdout.write(`Failures: ${report.failed}\n`);
};

const main = async (): Promise<void> => {
  let options: CliOptions | null;
  try {
    options = parseOptions(getScriptArgs());
  } catch (error) {
    if (error instanceof Error && error.message === "__USAGE__") {
      return;
    }
    throw error;
  }
  if (options === null) {
    return;
  }
  const report = await runMigration(options);
  printReport(report, options);
  if (report.failed > 0) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
