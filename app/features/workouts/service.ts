import type {
  WorkoutDetailLoaderData,
  WorkoutDetailParams,
  WorkoutListLoaderData,
  WorkoutListSearch,
} from "./contracts.ts";
import type { WorkoutMutationInput, WorkoutMutationResult } from "./actions.ts";

/**
 * Defines the route-facing workout service boundary so route modules can stay
 * stable while the backing store evolves.
 */
export interface WorkoutRouteService {
  loadWorkoutDetail(params: WorkoutDetailParams): Promise<WorkoutDetailLoaderData>;
  loadWorkoutList(search: WorkoutListSearch): Promise<WorkoutListLoaderData>;
  mutateWorkout(input: WorkoutMutationInput): Promise<WorkoutMutationResult>;
}

export class WorkoutNotFoundError extends Error {
  constructor(workoutId: string) {
    super(`Unknown workout: ${workoutId}`);
  }
}

export class WorkoutConflictError extends Error {
  constructor(workoutId: string, expectedVersion: number, currentVersion: number) {
    super(`Version mismatch for ${workoutId}: expected ${expectedVersion}, got ${currentVersion}`);
  }
}

export class WorkoutMutationError extends Error {}
