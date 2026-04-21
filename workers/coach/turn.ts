import type { AppDatabase } from "~/lib/.server/db";
import { WorkoutNotFoundError } from "~/features/workouts/service";

import { loadGeneralCoachContext, loadWorkoutCoachContext } from "./context";
import { renderGeneralCoachPrompt, renderWorkoutCoachPrompt } from "./prompt";
import type { CoachThread } from "./thread";
import { ACTIVE_COACH_TOOL_NAMES } from "./tools";

export async function resolveCoachTurn({ db, thread }: { db: AppDatabase; thread: CoachThread }) {
  if (thread.kind === "general") {
    return {
      activeTools: [...ACTIVE_COACH_TOOL_NAMES],
      system: renderGeneralCoachPrompt(await loadGeneralCoachContext(db)),
    };
  }

  try {
    return {
      activeTools: [...ACTIVE_COACH_TOOL_NAMES],
      system: renderWorkoutCoachPrompt(await loadWorkoutCoachContext(db, thread.workoutId)),
    };
  } catch (error) {
    if (error instanceof WorkoutNotFoundError) {
      throw new Error(`I could not find workout "${thread.workoutId}".`);
    }

    throw error;
  }
}
