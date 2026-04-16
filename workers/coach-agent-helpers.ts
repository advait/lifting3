import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type UIMessageChunk,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

import { EXERCISE_SCHEMAS } from "~/features/exercises/schema";

export const HARDCODED_AI_GATEWAY_MODEL_ID = "openai/gpt-5.4";
export const DEFAULT_AI_GATEWAY_ID = "default";
const COACH_ERROR_PREFIX_PATTERN = /^(?:AI_APICallError|Error|InferenceUpstreamError):\s*/i;
const DEFAULT_COACH_ERROR_MESSAGE = "The coach could not complete this request.";
const XML_TEXT_ESCAPE_PATTERN = /[&<>]/g;
const XML_TEXT_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
} as const;

function writeStaticAssistantText(
  writer: {
    write: (part: UIMessageChunk) => void;
  },
  responseText: string,
) {
  const textPartId = crypto.randomUUID();

  writer.write({
    type: "text-start",
    id: textPartId,
  });
  writer.write({
    type: "text-delta",
    id: textPartId,
    delta: responseText,
  });
  writer.write({
    type: "text-end",
    id: textPartId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractCoachErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (isRecord(error)) {
    if (typeof error.error === "string") {
      return error.error;
    }

    if (typeof error.message === "string") {
      return error.message;
    }
  }

  return null;
}

function maybeParseStructuredErrorMessage(message: string) {
  if (
    !(
      (message.startsWith("{") && message.endsWith("}")) ||
      (message.startsWith("[") && message.endsWith("]"))
    )
  ) {
    return message;
  }

  try {
    const parsed = JSON.parse(message);

    if (isRecord(parsed)) {
      if (typeof parsed.error === "string") {
        return parsed.error;
      }

      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    }
  } catch {
    return message;
  }

  return message;
}

export function normalizeCoachError(error: unknown) {
  const extractedMessage = extractCoachErrorMessage(error)?.trim();

  if (!extractedMessage) {
    return DEFAULT_COACH_ERROR_MESSAGE;
  }

  const prefixStrippedMessage = extractedMessage.replace(COACH_ERROR_PREFIX_PATTERN, "").trim();
  const parsedMessage = maybeParseStructuredErrorMessage(prefixStrippedMessage).trim();

  if (parsedMessage.length === 0) {
    return DEFAULT_COACH_ERROR_MESSAGE;
  }

  if (parsedMessage.toLowerCase().includes("insufficient balance")) {
    return `AI Gateway "${DEFAULT_AI_GATEWAY_ID}" has insufficient balance. Add funds to the gateway or switch to BYOK.`;
  }

  return parsedMessage;
}

export function createStaticChatResponse(messages: readonly UIMessage[], responseText: string) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writeStaticAssistantText(writer, responseText);
    },
    originalMessages: [...messages],
  });

  return createUIMessageStreamResponse({ stream });
}

export function createErrorChatResponse({
  error,
  logPrefix,
  messages,
}: {
  error: unknown;
  logPrefix: string;
  messages: readonly UIMessage[];
}) {
  console.error(logPrefix, error);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({
        errorText: normalizeCoachError(error),
        type: "error",
      });
    },
    originalMessages: [...messages],
  });

  return createUIMessageStreamResponse({ stream });
}

export function createErrorAwareChatResponse({
  logPrefix,
  messages,
  stream,
}: {
  logPrefix: string;
  messages: readonly UIMessage[];
  stream: ReadableStream<UIMessageChunk>;
}) {
  const responseStream = createUIMessageStream({
    execute: async ({ writer }) => {
      const reader = stream.getReader();
      let shouldCancelStream = false;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (value.type === "error") {
            console.error(logPrefix, value.errorText);

            writer.write({
              errorText: normalizeCoachError(value.errorText),
              type: "error",
            });
            shouldCancelStream = true;
            break;
          }

          writer.write(value);
        }
      } catch (error) {
        console.error(logPrefix, error);

        writer.write({
          errorText: normalizeCoachError(error),
          type: "error",
        });
      } finally {
        if (shouldCancelStream) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancellation failures from already-closed streams.
          }
        }

        reader.releaseLock();
      }
    },
    originalMessages: [...messages],
  });

  return createUIMessageStreamResponse({ stream: responseStream });
}

export function createCoachLanguageModel(env: Env): LanguageModel {
  const workersai = createWorkersAI({
    binding: env.AI,
    gateway: {
      id: DEFAULT_AI_GATEWAY_ID,
    },
  });

  return workersai(HARDCODED_AI_GATEWAY_MODEL_ID);
}

export function buildExerciseCatalogPrompt() {
  return EXERCISE_SCHEMAS.map((exercise) => {
    const equipment = exercise.equipment.join(", ");

    return `- ${exercise.id}: ${exercise.displayName} (${exercise.classification}; ${equipment}; load=${exercise.logging.loadTracking})`;
  }).join("\n");
}

function escapeXmlText(value: string) {
  return value.replaceAll(XML_TEXT_ESCAPE_PATTERN, (character) => {
    if (character in XML_TEXT_ESCAPES) {
      return XML_TEXT_ESCAPES[character as keyof typeof XML_TEXT_ESCAPES];
    }

    return character;
  });
}

export function buildUserProfilePrompt(userProfile: string | null) {
  const profileText = userProfile ? escapeXmlText(userProfile) : "No saved user profile.";

  return [
    "Persistent user context is provided below inside <UserProfile> XML.",
    "This profile should contain the user's durable goals, constraints, injuries or limitations, schedule, equipment access, preferences, dislikes, unit conventions, and other standing context that should carry across chats.",
    "Use it when relevant, do not invent missing facts, and call set_user_profile when the user provides new durable profile information that should persist for future chats.",
    "<UserProfile>",
    profileText,
    "</UserProfile>",
  ].join("\n");
}
