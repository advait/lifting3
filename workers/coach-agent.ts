import { Think } from "@cloudflare/think";

import { createAppDatabase } from "~/lib/.server/db";

import { normalizeCoachError } from "./coach/errors";
import { createCoachLanguageModel } from "./coach/model";
import { DEFAULT_COACH_SYSTEM_PROMPT } from "./coach/prompt";
import { parseCoachThread } from "./coach/thread";
import { createCoachTools } from "./coach/tools";
import { resolveCoachTurn } from "./coach/turn";

export class CoachAgent extends Think<Env> {
  override chatRecovery = false;
  override maxSteps = 5;
  override messageConcurrency = "queue" as const;

  override getModel() {
    return createCoachLanguageModel(this.env);
  }

  override getSystemPrompt() {
    return DEFAULT_COACH_SYSTEM_PROMPT;
  }

  override getTools() {
    return createCoachTools({
      db: createAppDatabase(this.env),
      thread: parseCoachThread(this.name),
    });
  }

  override async beforeTurn() {
    return resolveCoachTurn({
      db: createAppDatabase(this.env),
      thread: parseCoachThread(this.name),
    });
  }

  override onChatError(error: unknown) {
    return new Error(normalizeCoachError(error));
  }
}
