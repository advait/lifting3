import { z } from "zod";

import type {
  EDASessionScopedRpcInput,
  EDASessionSubmitBatchRpcInput,
} from "effect-durable-agent/host/durable-object";
import type { EDASessionSnapshot } from "effect-durable-agent/services/session-query";
import { SessionId } from "effect-durable-agent/types/core";
import { makeRootEDATraceMetadata } from "effect-durable-agent/types/tracing";

import { parseCoachInstanceName, formatCoachInstanceName } from "../app/features/coach/contracts";
import { formatCoachSessionId } from "../app/features/coach/session-id";
import type { CoachAgent } from "../workers/coach-agent";
import type { EDACoachAgent } from "../workers/eda-coach/agent";
import { makeCoachThreadAttachedEvent } from "../workers/eda-coach/events";
import { planLegacyCoachMigration, verifyLegacyCoachMigration } from "./legacy-coach-migration";

interface MigrationEnv {
  readonly DB: D1Database;
  readonly EDA_COACH: DurableObjectNamespace<EDACoachAgent>;
  readonly LEGACY_COACH: DurableObjectNamespace<CoachAgent>;
  readonly MIGRATION_TOKEN: string;
}

const requestSchema = z.strictObject({
  apply: z.boolean(),
  threads: z.array(z.string().trim().min(1)).default([]),
});

interface SessionMigrationResult {
  readonly legacyMessageCount?: number;
  readonly message?: string;
  readonly status: "deleted" | "failed" | "planned" | "skipped-empty";
  readonly thread: string;
  readonly toolCallCount?: number;
}

const discoverThreadNames = async (
  db: D1Database,
  explicitThreads: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> => {
  const query = await db.prepare("SELECT id FROM workouts ORDER BY id").all<{ id: string }>();
  const threadNames = new Set(["general", ...query.results.map(({ id }) => `workout:${id}`)]);
  for (const thread of explicitThreads) {
    threadNames.add(thread);
  }
  return Array.from(threadNames).sort();
};

const readLegacyMessages = async (stub: DurableObjectStub<CoachAgent>): Promise<unknown> => {
  const response = await stub.fetch(new Request("https://legacy-coach.internal/get-messages"));
  if (!response.ok) {
    throw new Error(`Legacy agent returned HTTP ${response.status}.`);
  }
  return await response.json();
};

const migrateSession = async (input: {
  readonly apply: boolean;
  readonly env: MigrationEnv;
  readonly threadName: string;
}): Promise<SessionMigrationResult> => {
  const target = parseCoachInstanceName(input.threadName);
  if (target === null) {
    return { message: "Invalid coach thread name.", status: "failed", thread: input.threadName };
  }
  const normalizedThread = formatCoachInstanceName(target);
  const legacyStub: DurableObjectStub<CoachAgent> =
    input.env.LEGACY_COACH.getByName(normalizedThread);
  try {
    const legacyMessages = await readLegacyMessages(legacyStub);
    const sessionId = SessionId.make(await formatCoachSessionId(target));
    const plan = await planLegacyCoachMigration({
      legacyMessages,
      sessionId,
      threadName: normalizedThread,
    });
    if (plan.legacyMessageCount === 0) {
      return { legacyMessageCount: 0, status: "skipped-empty", thread: normalizedThread };
    }
    if (!input.apply) {
      return {
        legacyMessageCount: plan.legacyMessageCount,
        status: "planned",
        thread: normalizedThread,
        toolCallCount: plan.expectedToolCalls.length,
      };
    }

    const edaStub: DurableObjectStub<EDACoachAgent> = input.env.EDA_COACH.getByName(sessionId);
    await edaStub.bindThread(target);
    const submitBatch: (
      rpcInput: EDASessionSubmitBatchRpcInput,
    ) => Promise<ReadonlyArray<unknown>> = edaStub.submitBatch.bind(edaStub);
    await submitBatch({
      items: [makeCoachThreadAttachedEvent({ sessionId, target }), ...plan.events],
      sessionId,
      trace: makeRootEDATraceMetadata(),
    });
    const snapshotRpc: (rpcInput: EDASessionScopedRpcInput) => Promise<EDASessionSnapshot> =
      edaStub.snapshot.bind(edaStub);
    const snapshot = await snapshotRpc({ sessionId, trace: makeRootEDATraceMetadata() });
    const verificationErrors = verifyLegacyCoachMigration(plan, snapshot);
    if (verificationErrors.length > 0) {
      return {
        legacyMessageCount: plan.legacyMessageCount,
        message: verificationErrors.join(" "),
        status: "failed",
        thread: normalizedThread,
        toolCallCount: plan.expectedToolCalls.length,
      };
    }
    await legacyStub.destroy();
    return {
      legacyMessageCount: plan.legacyMessageCount,
      status: "deleted",
      thread: normalizedThread,
      toolCallCount: plan.expectedToolCalls.length,
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      status: "failed",
      thread: normalizedThread,
    };
  }
};

export default {
  async fetch(request: Request, env: MigrationEnv): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/migrate") {
      return Response.json({ message: "Not found." }, { status: 404 });
    }
    if (request.headers.get("Authorization") !== `Bearer ${env.MIGRATION_TOKEN}`) {
      return Response.json({ message: "Unauthorized." }, { status: 401 });
    }
    try {
      const body = requestSchema.parse(await request.json());
      const threadNames = await discoverThreadNames(env.DB, body.threads);
      const results: SessionMigrationResult[] = [];
      for (const threadName of threadNames) {
        results.push(await migrateSession({ apply: body.apply, env, threadName }));
      }
      const failed = results.filter(({ status }) => status === "failed").length;
      return Response.json(
        { apply: body.apply, failed, results },
        { status: failed === 0 ? 200 : 409 },
      );
    } catch (error) {
      return Response.json(
        { message: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }
  },
} satisfies ExportedHandler<MigrationEnv>;
