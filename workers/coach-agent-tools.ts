import { tool } from "ai";

import type { AppDatabase } from "~/lib/.server/db";
import {
  createWorkoutToolInputSchema,
  patchWorkoutToolInputSchema,
  queryHistoryToolInputSchema,
} from "~/features/workouts/agent-tools";
import { createWorkoutAgentToolService } from "~/features/workouts/d1-service.server";

function buildWorkoutScopeError(currentWorkoutId: string, requestedWorkoutId: string) {
  return {
    code: "WRONG_WORKOUT_THREAD",
    message: `This workout coach thread is bound to ${currentWorkoutId}, not ${requestedWorkoutId}.`,
    ok: false as const,
    workoutId: requestedWorkoutId,
  };
}

export function createQueryHistoryTool(db: AppDatabase) {
  const workoutToolService = createWorkoutAgentToolService(db);

  return tool({
    description:
      "Query workout history and exercise performance using structured filters instead of freeform SQL.",
    execute: async (input) => workoutToolService.queryHistory(input),
    inputSchema: queryHistoryToolInputSchema,
  });
}

export function createPatchWorkoutTool(db: AppDatabase, currentWorkoutId?: string) {
  const workoutToolService = createWorkoutAgentToolService(db);

  return tool({
    description:
      "Apply one guarded workout patch using the current expected version. Use this for adds, swaps, reorders, remaining-set skips, and notes.",
    execute: async (input) => {
      if (currentWorkoutId && input.workoutId !== currentWorkoutId) {
        return buildWorkoutScopeError(currentWorkoutId, input.workoutId);
      }

      return workoutToolService.patchWorkout(input);
    },
    inputSchema: patchWorkoutToolInputSchema,
  });
}

export function createCreateWorkoutTool(db: AppDatabase) {
  const workoutToolService = createWorkoutAgentToolService(db);

  return tool({
    description:
      "Create a new planned workout. Use this from the general coach when the user asks for a new session or a day adapted from a prior workout.",
    execute: async (input) => workoutToolService.createWorkout(input),
    inputSchema: createWorkoutToolInputSchema,
  });
}
