import * as Prompt from "effect/unstable/ai/Prompt";
import * as Schema from "effect/Schema";
import { z } from "zod";

import {
  CommandIdempotencyKey,
  EDACommand,
  StopTurnCommand,
  SubmitMessageCommand,
} from "effect-durable-agent/types/commands";
import { SessionId } from "effect-durable-agent/types/core";
import { makeRootEDATraceMetadata } from "effect-durable-agent/types/tracing";
import type { CommittedDurableEvent } from "effect-durable-agent/services/session-store";
import type {
  EDASessionCommandRpcInput,
  EDASessionSubmitBatchRpcInput,
} from "effect-durable-agent/host/durable-object";

import { parseCoachInstanceName, type CoachTarget } from "~/features/coach/contracts";
import { formatCoachSessionId } from "~/features/coach/session-id";
import { normalizeCoachError } from "../coach/errors";
import type { EDACoachAgent } from "./agent";
import { makeCoachThreadAttachedEvent } from "./events";

const COACH_API_PATH = /^\/api\/coach\/threads\/([^/]+)\/(events|messages|session|stop)\/?$/;
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
  const stub: DurableObjectStub<EDACoachAgent> = env.CoachAgent.getByName(sessionId);
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

const destroySession = async (env: Env, target: CoachTarget): Promise<Response> => {
  const { sessionId, stub } = await getSession(env, target);
  await stub.destroySession({ sessionId, trace: makeRootEDATraceMetadata() });
  return new Response(null, { status: 204 });
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
    if (resource === "session" && request.method === "DELETE") {
      return await destroySession(env, target);
    }
    return json({ message: "Method not allowed." }, 405);
  } catch (error) {
    return json({ message: normalizeCoachError(error) }, 400);
  }
};
