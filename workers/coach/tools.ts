import { tool } from "ai";

import { createSettingsService } from "~/features/settings/d1-service.server";
import { setUserProfileToolInputSchema } from "~/features/settings/agent-tools";
import type { AppDatabase } from "~/lib/.server/db";
import {
  createWorkoutToolInputSchema,
  patchWorkoutToolInputSchema,
  queryHistoryToolInputSchema,
} from "~/features/workouts/agent-tools";
import { createWorkoutAgentToolService } from "~/features/workouts/d1-service.server";

import { describePatchWorkoutTool } from "./prompt";
import type { CoachThread } from "./thread";

export const ACTIVE_COACH_TOOL_NAMES = [
  "create_workout",
  "patch_workout",
  "query_history",
  "set_user_profile",
] as const;

function buildWorkoutScopeError(currentWorkoutId: string, requestedWorkoutId: string) {
  return {
    code: "WRONG_WORKOUT_THREAD",
    message: `This coach thread is bound to ${currentWorkoutId}, not ${requestedWorkoutId}.`,
    ok: false as const,
    workoutId: requestedWorkoutId,
  };
}

export function createCoachTools({ db, thread }: { db: AppDatabase; thread: CoachThread }) {
  const workoutToolService = createWorkoutAgentToolService(db);
  const settingsService = createSettingsService(db);
  const currentWorkoutId = thread.kind === "workout" ? thread.workoutId : undefined;

  return {
    create_workout: tool({
      description:
        "Create a new planned workout. Use this when the user asks for a new session or a day adapted from a prior workout. Use historical workouts to pre-fill weights, reps, and sets based on estimated strength.",
      execute: async (input) => workoutToolService.createWorkout(input),
      inputSchema: createWorkoutToolInputSchema,
    }),
    patch_workout: tool({
      description: describePatchWorkoutTool(),
      execute: async (input) => {
        if (currentWorkoutId && input.workoutId !== currentWorkoutId) {
          return buildWorkoutScopeError(currentWorkoutId, input.workoutId);
        }

        return workoutToolService.patchWorkout(input);
      },
      inputSchema: patchWorkoutToolInputSchema,
    }),
    query_history: tool({
      description:
        "Query workout history and exercise performance using structured filters instead of freeform SQL.",
      execute: async (input) => workoutToolService.queryHistory(input),
      inputSchema: queryHistoryToolInputSchema,
    }),
    set_user_profile: tool({
      description:
        "Save or replace the persistent user profile used in future chats. Use this for durable goals, constraints, injuries, schedule, equipment, preferences, or other standing context. Pass null to clear the saved profile.",
      execute: async (input) => settingsService.setUserProfile(input.userProfile),
      inputSchema: setUserProfileToolInputSchema,
    }),
  };
}
