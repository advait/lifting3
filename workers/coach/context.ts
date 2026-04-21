import { createSettingsService } from "~/features/settings/d1-service.server";
import type { AppDatabase } from "~/lib/.server/db";
import {
  type WorkoutDetailLoaderData,
  type WorkoutListItem,
  workoutListSearchSchema,
} from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";

const RECENT_WORKOUT_LIMIT = 8;

export type RecentWorkoutSummary = Pick<
  WorkoutListItem,
  "date" | "id" | "status" | "title" | "version"
>;

export interface GeneralCoachContext {
  readonly recentWorkouts: ReadonlyArray<RecentWorkoutSummary>;
  readonly userProfile: string | null;
}

export interface WorkoutCoachContext {
  readonly userProfile: string | null;
  readonly workoutDetail: WorkoutDetailLoaderData;
}

export async function loadGeneralCoachContext(db: AppDatabase): Promise<GeneralCoachContext> {
  const settingsService = createSettingsService(db);
  const workoutRouteService = createWorkoutRouteService(db);
  const [recentWorkouts, userProfile] = await Promise.all([
    workoutRouteService.loadWorkoutList(workoutListSearchSchema.parse({})),
    settingsService.loadUserProfile(),
  ]);

  return {
    recentWorkouts: recentWorkouts.items.slice(0, RECENT_WORKOUT_LIMIT),
    userProfile,
  };
}

export async function loadWorkoutCoachContext(
  db: AppDatabase,
  workoutId: string,
): Promise<WorkoutCoachContext> {
  const settingsService = createSettingsService(db);
  const workoutRouteService = createWorkoutRouteService(db);
  const [workoutDetail, userProfile] = await Promise.all([
    workoutRouteService.loadWorkoutDetail({ workoutId }),
    settingsService.loadUserProfile(),
  ]);

  return {
    userProfile,
    workoutDetail,
  };
}
