import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Tool from "effect/unstable/ai/Tool";
import { z } from "zod";

import type {
  EDAModelToolkit,
  EDAToolRegistryShape,
} from "effect-durable-agent/services/tool-registry";

import { createSettingsService } from "~/features/settings/d1-service.server";
import { setUserProfileToolInputSchema } from "~/features/settings/agent-tools";
import type { AppDatabase } from "~/lib/.server/db";
import {
  createWorkoutToolInputSchema,
  patchWorkoutToolInputSchema,
  queryHistoryToolInputSchema,
} from "~/features/workouts/agent-tools";
import {
  createWorkoutAgentToolService,
  loadPendingWorkoutActionRecords,
  markWorkoutActionDelivered,
} from "~/features/workouts/d1-service.server";
import { coachTargetSchema, type CoachTarget } from "~/features/coach/contracts";
import { describePatchWorkoutTool } from "../coach/prompt";
import { makeWorkoutActionCommittedEvent } from "./events";
import { drainWorkoutEventOutbox } from "./workout-outbox";

export const COACH_THREAD_STORAGE_KEY = "lifting3:coach-thread";

const createWorkoutToolDefinition = Tool.dynamic("create_workout", {
  description:
    "Create a new planned workout. Use this when the user asks for a new session or a day adapted from a prior workout. Use historical workouts to pre-fill weights, reps, and sets based on estimated strength.",
  parameters: z.toJSONSchema(createWorkoutToolInputSchema),
});

const patchWorkoutToolDefinition = Tool.dynamic("patch_workout", {
  description: describePatchWorkoutTool(),
  parameters: z.toJSONSchema(patchWorkoutToolInputSchema),
});

const queryHistoryToolDefinition = Tool.dynamic("query_history", {
  description:
    "Query workout history and exercise performance using structured filters instead of freeform SQL.",
  parameters: z.toJSONSchema(queryHistoryToolInputSchema),
});

const setUserProfileToolDefinition = Tool.dynamic("set_user_profile", {
  description:
    "Save or replace the persistent user profile used in future chats. Use this for durable goals, constraints, injuries, schedule, equipment, preferences, or other standing context. Pass null to clear the saved profile.",
  parameters: z.toJSONSchema(setUserProfileToolInputSchema),
});

const coachModelToolkit: EDAModelToolkit = {
  tools: {
    create_workout: createWorkoutToolDefinition,
    patch_workout: patchWorkoutToolDefinition,
    query_history: queryHistoryToolDefinition,
    set_user_profile: setUserProfileToolDefinition,
  },
  handle: ((name: string) =>
    Effect.die(
      new Error(`EDA coach tool ${name} must execute through its tool registry.`),
    )) as EDAModelToolkit["handle"],
};

const asToolEffect = <Result>(operation: () => Promise<Result>): Effect.Effect<Result, Error> =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => (cause instanceof Error ? cause : new Error("Coach tool execution failed.")),
  });

const loadCoachTarget = (storage: DurableObjectStorage): Effect.Effect<CoachTarget, Error> =>
  Effect.tryPromise({
    try: async () => coachTargetSchema.parse(await storage.get(COACH_THREAD_STORAGE_KEY)),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error("EDA coach thread binding is unavailable."),
  });

const buildWorkoutScopeError = (currentWorkoutId: string, requestedWorkoutId: string) => ({
  code: "WRONG_WORKOUT_THREAD",
  message: `This coach thread is bound to ${currentWorkoutId}, not ${requestedWorkoutId}.`,
  ok: false as const,
  workoutId: requestedWorkoutId,
});

/** EDA-native registry that reuses lifting3's existing Zod contracts and D1 services. */
export const makeCoachToolRegistry = (input: {
  readonly db: AppDatabase;
  readonly env: Env;
  readonly storage: DurableObjectStorage;
}): EDAToolRegistryShape => {
  const workoutTools = createWorkoutAgentToolService(input.db);
  const settings = createSettingsService(input.db);

  return {
    getModelToolkit: () => Effect.succeed(coachModelToolkit),
    getParamsSchema: () => Effect.succeed(Schema.Unknown),
    execute: (toolName, params, context) => {
      switch (String(toolName)) {
        case "create_workout":
          return Effect.gen(function* () {
            const parsed = createWorkoutToolInputSchema.parse(params);
            const result = yield* asToolEffect(() => workoutTools.createWorkout(parsed));

            if (result.ok) {
              yield* asToolEffect(() =>
                drainWorkoutEventOutbox(input.db, input.env, {
                  workoutId: result.workoutId,
                }),
              );
            }

            return result;
          });
        case "patch_workout":
          return Effect.gen(function* () {
            const parsed = patchWorkoutToolInputSchema.parse(params);
            const target = yield* loadCoachTarget(input.storage);

            if (target.kind === "workout" && parsed.workoutId !== target.workoutId) {
              return buildWorkoutScopeError(target.workoutId, parsed.workoutId);
            }

            const result = yield* asToolEffect(() => workoutTools.patchWorkout(parsed));

            if (result.ok) {
              if (target.kind === "workout" && target.workoutId === result.workoutId) {
                const pending = yield* asToolEffect(() =>
                  loadPendingWorkoutActionRecords(input.db, { workoutId: result.workoutId }),
                );
                for (const action of pending) {
                  yield* context.emitDurable(
                    makeWorkoutActionCommittedEvent({
                      action,
                      sessionId: context.sessionId,
                    }),
                  );
                  yield* asToolEffect(() => markWorkoutActionDelivered(input.db, action.eventId));
                }
              } else {
                yield* asToolEffect(() =>
                  drainWorkoutEventOutbox(input.db, input.env, {
                    workoutId: result.workoutId,
                  }),
                );
              }
            }

            return result;
          });
        case "query_history":
          return asToolEffect(() =>
            workoutTools.queryHistory(queryHistoryToolInputSchema.parse(params)),
          );
        case "set_user_profile":
          return asToolEffect(() => {
            const parsed = setUserProfileToolInputSchema.parse(params);
            return settings.setUserProfile(parsed.userProfile);
          });
        default:
          return Effect.fail(new Error(`Unknown EDA coach tool: ${toolName}`));
      }
    },
  };
};
