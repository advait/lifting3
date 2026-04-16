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
  readonly currentVersion: number;
  readonly expectedVersion: number;
  readonly workoutId: string;

  constructor(workoutId: string, expectedVersion: number, currentVersion: number) {
    super(`Version mismatch for ${workoutId}: expected ${expectedVersion}, got ${currentVersion}`);
    this.currentVersion = currentVersion;
    this.expectedVersion = expectedVersion;
    this.workoutId = workoutId;
  }
}

export class WorkoutMutationError extends Error {}
