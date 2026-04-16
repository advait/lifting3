import { data } from "react-router";

import type { AppDatabase } from "../../lib/.server/db/index.ts";
import { createWorkoutRouteService } from "./d1-service.server.ts";
import {
  formatWorkoutMutationParseError,
  safeParseWorkoutMutationFormData,
} from "./mutation-form.server.ts";
import { WorkoutConflictError, WorkoutMutationError, WorkoutNotFoundError } from "./service.ts";

interface HandleWorkoutPostActionInput {
  readonly db: AppDatabase;
  readonly request: Request;
}

/**
 * Handles the RR7 workout POST boundary: parse form data, invoke the domain
 * service, and translate expected domain failures into HTTP responses.
 */
export async function handleWorkoutPostAction({ db, request }: HandleWorkoutPostActionInput) {
  const formData = await request.formData();
  const parsedMutation = safeParseWorkoutMutationFormData(formData);

  if (!parsedMutation.success) {
    throw data({ message: formatWorkoutMutationParseError(parsedMutation.error) }, { status: 400 });
  }

  try {
    const service = createWorkoutRouteService(db);

    return await service.mutateWorkout(parsedMutation.data);
  } catch (error) {
    if (error instanceof WorkoutNotFoundError) {
      throw data({ message: error.message }, { status: 404 });
    }

    if (error instanceof WorkoutConflictError) {
      throw data({ message: error.message }, { status: 409 });
    }

    if (error instanceof WorkoutMutationError) {
      throw data({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
