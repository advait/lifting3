import * as Prompt from "effect/unstable/ai/Prompt";
import * as Schema from "effect/Schema";
import { z } from "zod";

import type { EDASessionSnapshot } from "effect-durable-agent/services/session-query";
import {
  CommandId,
  EventId,
  InferenceId,
  MessageId,
  RunId,
  SessionId,
  ToolCallId,
  TurnId,
} from "effect-durable-agent/types/core";
import {
  AssistantMessageCommittedEvent,
  ToolCallCompletedEvent,
  ToolCallCreatedEvent,
  ToolCallFailedEvent,
  ToolCallPromptPart,
  ToolFailurePromptPart,
  ToolSuccessPromptPart,
  UnixEpochMillis,
  UserMessageCommittedEvent,
  ProviderPartId,
  ToolName,
  assistantMessageCommittedEventType,
  effectDurableAgentNamespace,
  makeRootEDAEventTrace,
  schemaV1,
  toolCallCompletedEventType,
  toolCallCreatedEventType,
  toolCallFailedEventType,
  userMessageCommittedEventType,
  type DurableEventEnvelope,
  type FailurePayload,
} from "effect-durable-agent/types/events";

const LEGACY_MIGRATION_TIME_MS = Date.UTC(2026, 0, 1);
const legacyMessageSchema = z.object({
  id: z.string().trim().min(1),
  parts: z.array(z.record(z.string(), z.unknown())),
  role: z.enum(["user", "assistant"]),
});
const legacyMessagesSchema = z.array(legacyMessageSchema);

type LegacyMessage = z.infer<typeof legacyMessageSchema>;
type JsonRecord = Record<string, unknown>;

export interface ExpectedMigratedMessage {
  readonly messageId: string;
  readonly parts: ReadonlyArray<unknown>;
  readonly role: "user" | "assistant";
}

export interface ExpectedMigratedToolCall {
  readonly input: unknown;
  readonly name: string;
  readonly outcome:
    | { readonly status: "completed"; readonly result: unknown }
    | { readonly status: "failed"; readonly error: FailurePayload };
  readonly providerPartId: string;
  readonly toolCallId: string;
}

export interface LegacyCoachMigrationPlan {
  readonly events: ReadonlyArray<DurableEventEnvelope>;
  readonly expectedMessages: ReadonlyArray<ExpectedMigratedMessage>;
  readonly expectedToolCalls: ReadonlyArray<ExpectedMigratedToolCall>;
  readonly legacyMessageCount: number;
}

interface MigratedToolCall {
  readonly events: ReadonlyArray<DurableEventEnvelope>;
  readonly expected: ExpectedMigratedToolCall;
  readonly promptPart: Prompt.ToolCallPart;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (record: JsonRecord, key: string, context: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} requires a non-empty ${key}.`);
  }
  return value;
};

const requireText = (record: JsonRecord, key: string, context: string): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${context} requires string ${key}.`);
  }
  return value;
};

const formatUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

/** Generates retry-stable UUIDv7-shaped identities from legacy semantic identity. */
export const deterministicMigrationUuidV7 = async (seed: string): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lifting3-eda-import:${seed}`)),
  );
  const bytes = digest.slice(0, 16);
  const timestamp = BigInt(LEGACY_MIGRATION_TIME_MS);
  for (let index = 0; index < 6; index += 1) {
    const shift = BigInt((5 - index) * 8);
    bytes[index] = Number((timestamp >> shift) & 0xffn);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(bytes);
};

const makeEventMetadata = async (input: {
  readonly createdAtMs: number;
  readonly eventSeed: string;
  readonly sessionId: SessionId;
}) => ({
  createdAtMs: UnixEpochMillis.make(input.createdAtMs),
  durability: "durable" as const,
  eventId: EventId.make(await deterministicMigrationUuidV7(input.eventSeed)),
  namespace: effectDurableAgentNamespace,
  schemaVersion: schemaV1,
  sessionId: input.sessionId,
  trace: makeRootEDAEventTrace(),
});

const normalizedPromptPart = (part: unknown): unknown => {
  if (!isRecord(part) || typeof part.type !== "string") {
    throw new Error("EDA snapshot contains an invalid prompt part.");
  }
  switch (part.type) {
    case "text":
    case "reasoning":
      return { text: part.text, type: part.type };
    case "file":
      return {
        data: part.data instanceof URL ? part.data.toString() : part.data,
        ...(typeof part.fileName === "string" ? { fileName: part.fileName } : {}),
        mediaType: part.mediaType,
        type: part.type,
      };
    case "tool-call":
      return {
        id: part.id,
        name: part.name,
        params: part.params,
        providerExecuted: part.providerExecuted,
        type: part.type,
      };
    default:
      throw new Error(`EDA snapshot contains unsupported prompt part ${part.type}.`);
  }
};

const normalizedPromptParts = (parts: ReadonlyArray<unknown>): ReadonlyArray<unknown> =>
  parts.map(normalizedPromptPart);

const makeFilePart = (part: JsonRecord, context: string): Prompt.FilePart => {
  const mediaType = requireString(part, "mediaType", context);
  const url = requireString(part, "url", context);
  const filename = part.filename;
  if (filename !== undefined && typeof filename !== "string") {
    throw new Error(`${context} has an invalid filename.`);
  }
  return Prompt.filePart({
    data: url,
    ...(filename === undefined ? {} : { fileName: filename }),
    mediaType,
  });
};

const migrateUserParts = (
  message: LegacyMessage,
  context: string,
): ReadonlyArray<Prompt.UserMessagePart> => {
  const parts = message.parts.flatMap((part, partIndex): ReadonlyArray<Prompt.UserMessagePart> => {
    const partContext = `${context} part ${partIndex + 1}`;
    switch (part.type) {
      case "text":
        return [Prompt.textPart({ text: requireText(part, "text", partContext) })];
      case "file":
        return [makeFilePart(part, partContext)];
      default:
        throw new Error(`${partContext} has unsupported user part type ${String(part.type)}.`);
    }
  });
  if (parts.length === 0) {
    throw new Error(`${context} has no migratable content.`);
  }
  return parts;
};

const toolNameFromPart = (part: JsonRecord, context: string): string => {
  if (part.type === "dynamic-tool") {
    return requireString(part, "toolName", context);
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-") && part.type.length > 5) {
    return part.type.slice(5);
  }
  throw new Error(`${context} has an invalid tool part type.`);
};

const migrateToolCall = async (input: {
  readonly context: string;
  readonly createdAtMs: number;
  readonly inferenceId: InferenceId;
  readonly messageSeed: string;
  readonly part: JsonRecord;
  readonly partIndex: number;
  readonly runId: RunId;
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
}): Promise<MigratedToolCall> => {
  const { context, part } = input;
  const providerPartId = ProviderPartId.make(requireString(part, "toolCallId", context));
  const name = ToolName.make(toolNameFromPart(part, context));
  const state = requireString(part, "state", context);
  if (state !== "output-available" && state !== "output-error" && state !== "output-denied") {
    throw new Error(`${context} is unfinished (${state}); refusing a lossy migration.`);
  }
  if (!("input" in part)) {
    throw new Error(`${context} requires tool input.`);
  }
  const inputValue = part.input;
  const toolSeed = `${input.messageSeed}:tool:${input.partIndex}:${providerPartId}`;
  const toolCallId = ToolCallId.make(await deterministicMigrationUuidV7(`${toolSeed}:id`));
  const promptPart = Schema.decodeUnknownSync(ToolCallPromptPart)({
    id: providerPartId,
    name,
    params: inputValue,
    providerExecuted: part.providerExecuted === true,
    type: "tool-call",
  });
  const created = ToolCallCreatedEvent.make({
    ...(await makeEventMetadata({
      createdAtMs: input.createdAtMs,
      eventSeed: `${toolSeed}:created`,
      sessionId: input.sessionId,
    })),
    payload: {
      inferenceId: input.inferenceId,
      promptPart,
      runId: input.runId,
      toolCallId,
      turnId: input.turnId,
    },
    type: toolCallCreatedEventType,
  });

  if (state === "output-available") {
    if (!("output" in part)) {
      throw new Error(`${context} requires tool output.`);
    }
    const result = part.output;
    const resultPromptPart = Schema.decodeUnknownSync(ToolSuccessPromptPart)({
      id: providerPartId,
      isFailure: false,
      name,
      result,
      type: "tool-result",
    });
    const completed = ToolCallCompletedEvent.make({
      ...(await makeEventMetadata({
        createdAtMs: input.createdAtMs + 1,
        eventSeed: `${toolSeed}:completed`,
        sessionId: input.sessionId,
      })),
      payload: {
        promptPart: resultPromptPart,
        toolCallId,
      },
      type: toolCallCompletedEventType,
    });
    return {
      events: [created, completed],
      expected: {
        input: inputValue,
        name,
        outcome: { result, status: "completed" },
        providerPartId,
        toolCallId,
      },
      promptPart,
    };
  }

  const error: FailurePayload = {
    ...(state === "output-denied"
      ? { code: "legacy-tool-denied", details: { reason: part.approval } }
      : {}),
    message:
      state === "output-error"
        ? requireString(part, "errorText", context)
        : "Legacy tool call was denied by the user.",
  };
  const errorPromptPart = Schema.decodeUnknownSync(ToolFailurePromptPart)({
    id: providerPartId,
    isFailure: true,
    name,
    result: error,
    type: "tool-result",
  });
  const failed = ToolCallFailedEvent.make({
    ...(await makeEventMetadata({
      createdAtMs: input.createdAtMs + 1,
      eventSeed: `${toolSeed}:failed`,
      sessionId: input.sessionId,
    })),
    payload: {
      error,
      promptPart: errorPromptPart,
      toolCallId,
    },
    type: toolCallFailedEventType,
  });
  return {
    events: [created, failed],
    expected: {
      input: inputValue,
      name,
      outcome: { error, status: "failed" },
      providerPartId,
      toolCallId,
    },
    promptPart,
  };
};

/** Converts persisted Think UI messages into idempotent EDA durable events. */
export const planLegacyCoachMigration = async (input: {
  readonly legacyMessages: unknown;
  readonly sessionId: SessionId;
  readonly threadName: string;
}): Promise<LegacyCoachMigrationPlan> => {
  const legacyMessages = legacyMessagesSchema.parse(input.legacyMessages);
  const events: DurableEventEnvelope[] = [];
  const expectedMessages: ExpectedMigratedMessage[] = [];
  const expectedToolCalls: ExpectedMigratedToolCall[] = [];

  for (const [messageIndex, message] of legacyMessages.entries()) {
    const context = `Legacy message ${messageIndex + 1} (${message.id})`;
    const messageSeed = `${input.threadName}:message:${messageIndex}:${message.id}`;
    const createdAtMs = LEGACY_MIGRATION_TIME_MS + messageIndex * 100;
    const messageId = MessageId.make(await deterministicMigrationUuidV7(`${messageSeed}:id`));

    if (message.role === "user") {
      const content = migrateUserParts(message, context);
      const [firstContentPart, ...remainingContentParts] = content;
      if (firstContentPart === undefined) {
        throw new Error(`${context} has no migratable content.`);
      }
      const nonEmptyContent = [firstContentPart, ...remainingContentParts] as const;
      const commandId = CommandId.make(
        await deterministicMigrationUuidV7(`${messageSeed}:command`),
      );
      events.push(
        UserMessageCommittedEvent.make({
          ...(await makeEventMetadata({
            createdAtMs,
            eventSeed: `${messageSeed}:committed`,
            sessionId: input.sessionId,
          })),
          payload: { commandId, content: nonEmptyContent, messageId },
          type: userMessageCommittedEventType,
        }),
      );
      expectedMessages.push({
        messageId,
        parts: normalizedPromptParts(nonEmptyContent),
        role: "user",
      });
      continue;
    }

    const runId = RunId.make(await deterministicMigrationUuidV7(`${messageSeed}:run`));
    const turnId = TurnId.make(await deterministicMigrationUuidV7(`${messageSeed}:turn`));
    const inferenceId = InferenceId.make(
      await deterministicMigrationUuidV7(`${messageSeed}:inference`),
    );
    const assistantParts: Prompt.AssistantMessagePart[] = [];
    const toolEvents: DurableEventEnvelope[] = [];
    for (const [partIndex, part] of message.parts.entries()) {
      const partContext = `${context} part ${partIndex + 1}`;
      switch (part.type) {
        case "text":
          assistantParts.push(Prompt.textPart({ text: requireText(part, "text", partContext) }));
          break;
        case "reasoning":
          assistantParts.push(
            Prompt.reasoningPart({ text: requireText(part, "text", partContext) }),
          );
          break;
        case "file":
          assistantParts.push(makeFilePart(part, partContext));
          break;
        case "step-start":
          break;
        default: {
          const migrated = await migrateToolCall({
            context: partContext,
            createdAtMs: createdAtMs + partIndex * 2 + 1,
            inferenceId,
            messageSeed,
            part,
            partIndex,
            runId,
            sessionId: input.sessionId,
            turnId,
          });
          assistantParts.push(migrated.promptPart);
          toolEvents.push(...migrated.events);
          expectedToolCalls.push(migrated.expected);
        }
      }
    }
    const [firstPart, ...remainingParts] = assistantParts;
    if (firstPart === undefined) {
      throw new Error(`${context} has no migratable content.`);
    }
    const promptParts = [firstPart, ...remainingParts] as const;
    events.push(
      AssistantMessageCommittedEvent.make({
        ...(await makeEventMetadata({
          createdAtMs,
          eventSeed: `${messageSeed}:committed`,
          sessionId: input.sessionId,
        })),
        payload: { inferenceId, messageId, promptParts, runId, turnId },
        type: assistantMessageCommittedEventType,
      }),
      ...toolEvents,
    );
    expectedMessages.push({
      messageId,
      parts: normalizedPromptParts(promptParts),
      role: "assistant",
    });
  }

  return {
    events,
    expectedMessages,
    expectedToolCalls,
    legacyMessageCount: legacyMessages.length,
  };
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
};

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

/** Returns verification errors; an empty list is the only deletion-safe result. */
export const verifyLegacyCoachMigration = (
  plan: LegacyCoachMigrationPlan,
  snapshot: EDASessionSnapshot,
): ReadonlyArray<string> => {
  const errors: string[] = [];
  if (snapshot.messages.length !== plan.expectedMessages.length) {
    errors.push(
      `Expected ${plan.expectedMessages.length} transcript messages, found ${snapshot.messages.length}.`,
    );
  }
  for (const [index, expected] of plan.expectedMessages.entries()) {
    const actual = snapshot.messages[index];
    if (actual === undefined) {
      continue;
    }
    if (actual._tag !== "User" && actual._tag !== "Assistant") {
      errors.push(`Transcript message ${index + 1} has unexpected type ${actual._tag}.`);
      continue;
    }
    const actualRole = actual._tag === "User" ? "user" : "assistant";
    const actualParts = actual._tag === "User" ? actual.content : actual.promptParts;
    if (actualRole !== expected.role || actual.messageId !== expected.messageId) {
      errors.push(`Transcript message ${index + 1} identity or role does not match.`);
      continue;
    }
    if (
      actualParts === undefined ||
      !sameValue(normalizedPromptParts(actualParts), expected.parts)
    ) {
      errors.push(`Transcript message ${index + 1} content does not match.`);
    }
  }

  if (snapshot.state.toolCalls.size !== plan.expectedToolCalls.length) {
    errors.push(
      `Expected ${plan.expectedToolCalls.length} tool calls, found ${snapshot.state.toolCalls.size}.`,
    );
  }
  for (const expected of plan.expectedToolCalls) {
    const actual = snapshot.state.toolCalls.get(ToolCallId.make(expected.toolCallId));
    if (actual?.decision?._tag !== "Created") {
      errors.push(`Tool call ${expected.providerPartId} is missing its created decision.`);
      continue;
    }
    if (
      actual.decision.providerPartId !== expected.providerPartId ||
      actual.decision.toolName !== expected.name ||
      !sameValue(actual.decision.params, expected.input)
    ) {
      errors.push(`Tool call ${expected.providerPartId} input does not match.`);
    }
    if (expected.outcome.status === "completed") {
      if (
        actual.terminal?._tag !== "Completed" ||
        !sameValue(actual.terminal.result, expected.outcome.result)
      ) {
        errors.push(`Tool call ${expected.providerPartId} result does not match.`);
      }
    } else if (
      actual.terminal?._tag !== "Failed" ||
      !sameValue(actual.terminal.error, expected.outcome.error)
    ) {
      errors.push(`Tool call ${expected.providerPartId} failure does not match.`);
    }
  }
  return errors;
};
