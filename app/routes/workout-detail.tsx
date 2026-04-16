import { data, type ShouldRevalidateFunctionArgs } from "react-router";

import { defineAppEventRouteHandle } from "~/features/app-events/client";
import {
  createExerciseInvalidateKey,
  createWorkoutInvalidateKey,
} from "~/features/app-events/schema";
import {
  workoutDetailLoaderDataSchema,
  workoutDetailParamsSchema,
  workoutMutationResultSchema,
} from "~/features/workouts/contracts";
import {
  FixtureWorkoutConflictError,
  FixtureWorkoutMutationError,
  FixtureWorkoutNotFoundError,
  getWorkoutRouteService,
} from "~/features/workouts/fixture-service.server";
import {
  formatWorkoutMutationParseError,
  safeParseWorkoutMutationFormData,
} from "~/features/workouts/mutation-form.server";
import { WorkoutDetailView } from "~/features/workouts/workout-detail-view";

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
});

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData ? `${loaderData.workout.title} | lifting3` : "Workout | lifting3",
  },
  {
    name: "description",
    content: "Workout detail fixture with RR7 loaders, forms, and app-event revalidation.",
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

export async function loader({ params }: Route.LoaderArgs) {
  const parsedParams = workoutDetailParamsSchema.safeParse(params);

  if (!parsedParams.success) {
    throw data({ message: "Invalid workout id." }, { status: 400 });
  }

  try {
    return await getWorkoutRouteService().loadWorkoutDetail(parsedParams.data);
  } catch (error) {
    if (error instanceof FixtureWorkoutNotFoundError) {
      throw data({ message: error.message }, { status: 404 });
    }

    throw error;
  }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsedMutation = safeParseWorkoutMutationFormData(formData);

  if (!parsedMutation.success) {
    throw data({ message: formatWorkoutMutationParseError(parsedMutation.error) }, { status: 400 });
  }

  try {
    return await getWorkoutRouteService().mutateWorkout(parsedMutation.data);
  } catch (error) {
    if (error instanceof FixtureWorkoutNotFoundError) {
      throw data({ message: error.message }, { status: 404 });
    }

    if (error instanceof FixtureWorkoutConflictError) {
      throw data({ message: error.message }, { status: 409 });
    }

    if (error instanceof FixtureWorkoutMutationError) {
      throw data({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}

export default function WorkoutDetail({ actionData, loaderData }: Route.ComponentProps) {
  return <WorkoutDetailView actionData={actionData} loaderData={loaderData} />;
}
