import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { MessageRecord, ReducedState } from "effect-durable-agent/domain/reduced-state";
import { EDAPromptProjector } from "effect-durable-agent/services/prompt-projector";
import { getEDAReducerState } from "effect-durable-agent/services/reducer-registry";
import { SystemPromptText } from "effect-durable-agent/types/events";

import type { AppDatabase } from "~/lib/.server/db";
import { loadGeneralCoachContext, loadWorkoutCoachContext } from "../coach/context";
import { renderGeneralCoachPrompt, renderWorkoutCoachPrompt } from "../coach/prompt";
import { coachThreadReducer } from "./reducer";

const replaceSystemPrompt = (state: ReducedState, prompt: string): ReducedState => {
  const messages = new Map(state.messages);

  for (const [messageId, message] of messages) {
    if (message._tag !== "System") {
      continue;
    }

    messages.set(messageId, {
      ...message,
      content: SystemPromptText.make(prompt),
    } satisfies MessageRecord);
    return { ...state, messages };
  }

  throw new Error("EDA coach prompt projection requires a committed system message.");
};

const loadCoachPrompt = async (
  db: AppDatabase,
  target: NonNullable<ReturnType<typeof getCoachTarget>>,
): Promise<string> => {
  if (target.kind === "general") {
    return renderGeneralCoachPrompt(await loadGeneralCoachContext(db));
  }

  return renderWorkoutCoachPrompt(await loadWorkoutCoachContext(db, target.workoutId));
};

const getCoachTarget = (reducerStates: Parameters<typeof getEDAReducerState>[0]) =>
  getEDAReducerState(reducerStates, coachThreadReducer).target;

/** Refreshes workout/profile context for every EDA turn, matching the legacy beforeTurn behavior. */
export const makeCoachPromptProjectorLayer = (db: AppDatabase) =>
  Layer.succeed(EDAPromptProjector, {
    projectState: (input) => {
      const target = getCoachTarget(input.reducerStates);

      if (target === null) {
        return Effect.die(new Error("EDA coach session is missing its durable thread binding."));
      }

      return Effect.tryPromise({
        try: async () => replaceSystemPrompt(input.state, await loadCoachPrompt(db, target)),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("Unable to load current coach context."),
      }).pipe(Effect.orDie);
    },
    projectUserMessageContent: (_input, message) => Effect.succeed(message.content),
  });
