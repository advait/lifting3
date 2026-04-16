import type {
  WorkoutDetailLoaderData,
  WorkoutDetailParams,
  WorkoutListLoaderData,
  WorkoutListSearch,
  WorkoutMutationInput,
  WorkoutMutationResult,
} from "./contracts.ts";

/**
 * Defines the route-facing workout service boundary so fixture-backed loaders
 * and future D1-backed loaders can satisfy the same RR7 contracts.
 */
export interface WorkoutRouteService {
  loadWorkoutDetail(
    params: WorkoutDetailParams
  ): Promise<WorkoutDetailLoaderData>;
  loadWorkoutList(search: WorkoutListSearch): Promise<WorkoutListLoaderData>;
  mutateWorkout(input: WorkoutMutationInput): Promise<WorkoutMutationResult>;
}
