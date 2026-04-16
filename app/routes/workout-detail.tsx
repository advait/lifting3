import { data, type ShouldRevalidateFunctionArgs } from "react-router";

import { defineAppEventRouteHandle } from "~/features/app-events/client";
import {
  createExerciseInvalidateKey,
  createWorkoutInvalidateKey,
} from "~/features/app-events/schema";
import {
  workoutMutationResultSchema,
} from "~/features/workouts/actions";
import {
  workoutDetailLoaderDataSchema,
  workoutDetailParamsSchema,
} from "~/features/workouts/contracts";
import {
  createWorkoutRouteService,
} from "~/features/workouts/d1-service.server";
import {
  formatWorkoutMutationParseError,
  safeParseWorkoutMutationFormData,
} from "~/features/workouts/mutation-form.server";
import {
  WorkoutConflictError,
  WorkoutMutationError,
  WorkoutNotFoundError,
} from "~/features/workouts/service";
import { WorkoutDetailView } from "~/features/workouts/workout-detail-view";
import { getAppDatabase } from "~/lib/.server/router-context";

import type { Route } from "./+types/workout-detail";

export const handle = defineAppEventRouteHandle({
  invalidateKeys: ({ loaderData, params }) => {
    if (!params.workoutId) {
      return [];
    }

    const parsedLoaderData = workoutDetailLoaderDataSchema.safeParse(loaderData);
    const exerciseInvalidateKeys = parsedLoaderData.success
      ? parsedLoaderData.data.exercises.map((exercise) =>
          createExerciseInvalidateKey(exercise.exerciseSchemaId),
        )
      : [];

    return [createWorkoutInvalidateKey(params.workoutId), ...exerciseInvalidateKeys];
  },
  pageTitle: ({ loaderData }) => {
    const parsedLoaderData = workoutDetailLoaderDataSchema.safeParse(loaderData);

    return parsedLoaderData.success ? parsedLoaderData.data.workout.title : "Workout";
  },
  topBarAction: ({ loaderData, params }) => {
    const parsedLoaderData = workoutDetailLoaderDataSchema.safeParse(loaderData);

    if (!parsedLoaderData.success || !params.workoutId) {
      return null;
    }

    const { workout } = parsedLoaderData.data;

    if (workout.status === "active") {
      return {
        action: `/workouts/${params.workoutId}`,
        fields: {
          action: "finish_workout",
          expectedVersion: String(workout.version),
          workoutId: workout.id,
        },
        kind: "form",
        label: "Finish",
        variant: "secondary",
      };
    }

    return {
      kind: "link",
      label: "Edit",
      to: `/workouts/${params.workoutId}#workout-notes`,
      variant: "outline",
    };
  },
});

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData ? `${loaderData.workout.title} | lifting3` : "Workout | lifting3",
  },
  {
    name: "description",
    content: "Workout detail with RR7 loaders, forms, and app-event revalidation.",
  },
];

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return workoutMutationResultSchema.safeParse(actionResult).success
    ? false
    : defaultShouldRevalidate;
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const parsedParams = workoutDetailParamsSchema.safeParse(params);

  if (!parsedParams.success) {
    throw data({ message: "Invalid workout id." }, { status: 400 });
  }

  try {
    const service = createWorkoutRouteService(getAppDatabase(context));

    return await service.loadWorkoutDetail(parsedParams.data);
  } catch (error) {
    if (error instanceof WorkoutNotFoundError) {
      throw data({ message: error.message }, { status: 404 });
    }

    throw error;
  }
}

export async function action({ context, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsedMutation = safeParseWorkoutMutationFormData(formData);

  if (!parsedMutation.success) {
    throw data({ message: formatWorkoutMutationParseError(parsedMutation.error) }, { status: 400 });
  }

  try {
    const service = createWorkoutRouteService(getAppDatabase(context));

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

export default function WorkoutDetail({ actionData, loaderData }: Route.ComponentProps) {
  return <WorkoutDetailView actionData={actionData} loaderData={loaderData} />;
}
