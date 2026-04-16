import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

import { EXERCISE_SCHEMAS } from "~/features/exercises/schema";

export const HARDCODED_AI_GATEWAY_MODEL_ID = "openai/gpt-5.4";
export const DEFAULT_AI_GATEWAY_ID = "default";

export function getLatestUserText(messages: readonly UIMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") {
      continue;
    }

    const text = message.parts
      .flatMap((part) => (part.type === "text" ? [part.text.trim()] : []))
      .filter((partText) => partText.length > 0)
      .join("\n");

    if (text.length > 0) {
      return text;
    }
  }

  return null;
}

export function createStaticChatResponse(messages: readonly UIMessage[], responseText: string) {
  const textPartId = crypto.randomUUID();
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
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
    },
    originalMessages: [...messages],
  });

  return createUIMessageStreamResponse({ stream });
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
