import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export const DEFAULT_AI_GATEWAY_ID = "default";
export const DEFAULT_COACH_MODEL_ID = "openai/gpt-5.4";

export function createCoachLanguageModel(env: Env): LanguageModel {
  const workersai = createWorkersAI({
    binding: env.AI,
    gateway: {
      id: DEFAULT_AI_GATEWAY_ID,
    },
  });

  return workersai(DEFAULT_COACH_MODEL_ID);
}
