import * as Prompt from "effect/unstable/ai/Prompt";
import * as Schema from "effect/Schema";
import { z } from "zod";

import {
  CommandIdempotencyKey,
  EDACommand,
  StopTurnCommand,
  SubmitMessageCommand,
} from "effect-durable-agent/types/commands";
import { EventId, SessionId } from "effect-durable-agent/types/core";
import { makeRootEDATraceMetadata } from "effect-durable-agent/types/tracing";
import type { CommittedDurableEvent } from "effect-durable-agent/services/session-store";
import { getEDAReducerState } from "effect-durable-agent/services/reducer-registry";
import type { EDASessionSnapshot } from "effect-durable-agent/services/session-query";
import type {
  EDASessionCommandRpcInput,
  EDASessionScopedRpcInput,
  EDASessionSubmitBatchRpcInput,
} from "effect-durable-agent/host/durable-object";

import { parseCoachInstanceName, type CoachTarget } from "~/features/coach/contracts";
import { formatCoachSessionId } from "~/features/coach/session-id";
import { makeEdaEventId } from "~/lib/.server/eda-event-id";
import { normalizeCoachError } from "../coach/errors";
import type { CoachAgent } from "./agent";
import { makeCoachConversationStartedEvent, makeCoachThreadAttachedEvent } from "./events";
import { workoutActivityReducer } from "./workout-activity-reducer";

const COACH_API_PATH =
  /^\/api\/coach\/threads\/([^/]+)\/(conversation|events|messages|snapshot|stop)\/?$/;
const submitMessageBodySchema = z.strictObject({
  idempotencyKey: z.string().trim().min(1),
  text: z.string().trim().min(1),
});
const stopBodySchema = z.strictObject({
  idempotencyKey: z.string().trim().min(1),
});

const json = (body: unknown, status = 200): Response => Response.json(body, { status });

const parseTarget = (encodedThread: string): CoachTarget | null => {
  try {
    return parseCoachInstanceName(decodeURIComponent(encodedThread));
  } catch {
    return null;
  }
};

const parseJson = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Expected an application/json request body.");
  }
  return await request.json();
};

const getSession = async (env: Env, target: CoachTarget) => {
  const sessionId = SessionId.make(await formatCoachSessionId(target));
  const stub: DurableObjectStub<CoachAgent> = env.CoachAgent.getByName(sessionId);
  await stub.bindThread(target);
  return { sessionId, stub };
};

const submitMessage = async (
  request: Request,
  env: Env,
  target: CoachTarget,
): Promise<Response> => {
  const body = submitMessageBodySchema.parse(await parseJson(request));
  const { sessionId, stub } = await getSession(env, target);
  const command = new SubmitMessageCommand({
    content: [Prompt.textPart({ text: body.text })],
    disposition: "queue",
    idempotencyKey: CommandIdempotencyKey.make(body.idempotencyKey),
  });
  const submitBatch: (
    input: EDASessionSubmitBatchRpcInput,
  ) => Promise<readonly CommittedDurableEvent[]> = stub.submitBatch.bind(stub);
  const committed = await submitBatch({
    items: [
      makeCoachThreadAttachedEvent({ sessionId, target }),
      Schema.encodeSync(EDACommand)(command),
    ],
    sessionId,
    trace: makeRootEDATraceMetadata(),
  });

  return json({ admitted: committed.at(-1) }, 202);
};

const stopSession = async (request: Request, env: Env, target: CoachTarget): Promise<Response> => {
  const body = stopBodySchema.parse(await parseJson(request));
  const { sessionId, stub } = await getSession(env, target);
  const submit: (input: EDASessionCommandRpcInput) => Promise<CommittedDurableEvent> =
    stub.submit.bind(stub);
  const admitted = await submit({
    command: Schema.encodeSync(EDACommand)(
      new StopTurnCommand({
        idempotencyKey: CommandIdempotencyKey.make(body.idempotencyKey),
      }),
    ),
    sessionId,
    trace: makeRootEDATraceMetadata(),
  });

  return json({ admitted }, 202);
};

const streamEvents = async (request: Request, env: Env, target: CoachTarget): Promise<Response> => {
  const { sessionId, stub } = await getSession(env, target);
  const url = new URL(request.url);
  url.searchParams.set("sessionId", sessionId);

  return await stub.fetch(new Request(url, request));
};

const startConversation = async (env: Env, target: CoachTarget): Promise<Response> => {
  const { sessionId, stub } = await getSession(env, target);
  const readSnapshot: (input: EDASessionScopedRpcInput) => Promise<EDASessionSnapshot> =
    stub.snapshot.bind(stub);
  const snapshot = await readSnapshot({ sessionId, trace: makeRootEDATraceMetadata() });
  const hasInFlightCommand = [...snapshot.state.commands.values()].some(
    (command) => command.terminal === undefined,
  );
  if (hasInFlightCommand) {
    return json(
      { message: "Stop or wait for the active coach request before starting a new conversation." },
      409,
    );
  }
  const eventId = EventId.make(await makeEdaEventId());
  const submitBatch: (
    input: EDASessionSubmitBatchRpcInput,
  ) => Promise<readonly CommittedDurableEvent[]> = stub.submitBatch.bind(stub);
  const committed = await submitBatch({
    items: [
      makeCoachThreadAttachedEvent({ sessionId, target }),
      makeCoachConversationStartedEvent({ eventId, sessionId }),
    ],
    sessionId,
    trace: makeRootEDATraceMetadata(),
  });
  return json({ committed: committed.at(-1) }, 202);
};

const snapshotTools = (snapshot: EDASessionSnapshot, afterSeq: number) =>
  [...snapshot.state.toolCalls.values()].flatMap((record) => {
    const decision = record.decision;
    if (decision === undefined || Number(decision.seq) <= afterSeq) {
      return [];
    }

    const terminal = record.terminal;
    const state =
      terminal === undefined
        ? record.startedSeq === undefined
          ? "loading"
          : "streaming"
        : terminal._tag === "Completed"
          ? "complete"
          : "error";
    return [
      {
        ...(terminal?._tag === "Failed" ? { error: terminal.error.message } : {}),
        inferenceId: decision.inferenceId,
        input: decision._tag === "Created" ? decision.params : {},
        ...(terminal?._tag === "Completed" ? { output: terminal.result } : {}),
        seq: Number(decision.seq),
        state,
        toolCallId: record.toolCallId,
        toolName: decision.toolName,
        type: "tool",
      },
    ];
  });

const getSnapshot = async (env: Env, target: CoachTarget): Promise<Response> => {
  const { sessionId, stub } = await getSession(env, target);
  const readSnapshot: (input: EDASessionScopedRpcInput) => Promise<EDASessionSnapshot> =
    stub.snapshot.bind(stub);
  const snapshot = await readSnapshot({ sessionId, trace: makeRootEDATraceMetadata() });
  const activity = getEDAReducerState(snapshot.reducerStates, workoutActivityReducer);
  const activeInference = [...snapshot.state.inferences.values()]
    .filter((inference) => inference.terminal === undefined)
    .sort((left, right) => Number(right.startedSeq) - Number(left.startedSeq))[0];
  return json({
    activeInferenceId: activeInference?.inferenceId ?? null,
    activeRunIds: [...snapshot.state.runs.values()]
      .filter((run) => run.terminal === undefined)
      .map((run) => run.runId),
    activities: activity.entries,
    lastSeq: Number(snapshot.state.lastSeq),
    messages: snapshot.messages.filter(
      (message) => Number(message.seq) > activity.conversationStartedSeq,
    ),
    tools: snapshotTools(snapshot, activity.conversationStartedSeq),
  });
};

/** Handles the EDA coach HTTP facade before React Router receives the request. */
export const handleCoachApiRequest = async (
  request: Request,
  env: Env,
): Promise<Response | null> => {
  const match = COACH_API_PATH.exec(new URL(request.url).pathname);
  if (!match) {
    return null;
  }

  const target = parseTarget(match[1] ?? "");
  const resource = match[2];
  if (!target) {
    return json({ message: "Unknown coach thread." }, 404);
  }

  try {
    if (resource === "events" && request.method === "GET") {
      return await streamEvents(request, env, target);
    }
    if (resource === "messages" && request.method === "POST") {
      return await submitMessage(request, env, target);
    }
    if (resource === "stop" && request.method === "POST") {
      return await stopSession(request, env, target);
    }
    if (resource === "conversation" && request.method === "POST") {
      return await startConversation(env, target);
    }
    if (resource === "snapshot" && request.method === "GET") {
      return await getSnapshot(env, target);
    }
    return json({ message: "Method not allowed." }, 405);
  } catch (error) {
    return json({ message: normalizeCoachError(error) }, 400);
  }
};
