import { data, type ShouldRevalidateFunctionArgs } from "react-router";

import { defineAppEventRouteHandle } from "~/features/app-events/client";
import {
  createExerciseInvalidateKey,
  createWorkoutInvalidateKey,
} from "~/features/app-events/schema";
import { workoutMutationResultSchema } from "~/features/workouts/actions";
import {
  workoutDetailLoaderDataSchema,
  workoutDetailParamsSchema,
} from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { handleWorkoutPostAction } from "~/features/workouts/workout-action.server";
import { WorkoutNotFoundError } from "~/features/workouts/service";
import { WorkoutDetailView } from "~/features/workouts/workout-detail-view";
import { createPageMeta } from "~/lib/meta";
import { getAppDatabase } from "~/lib/.server/router-context";

import type { Route } from "./+types/workout-detail";

export const handle = defineAppEventRouteHandle({
  coachTarget: ({ loaderData, params }) => {
    const parsedLoaderData = workoutDetailLoaderDataSchema.safeParse(loaderData);

    if (parsedLoaderData.success) {
      return parsedLoaderData.data.agentTarget;
    }

    return params.workoutId
      ? {
          instanceName: params.workoutId,
          kind: "workout",
        }
      : null;
  },
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
});

export const meta: Route.MetaFunction = ({ loaderData, location, matches }) =>
  createPageMeta({
    description:
      "Review exercise order, notes, sets, and live logging context for this workout session.",
    location,
    matches,
    title: loaderData ? `${loaderData.workout.title} | lifting3` : "Workout | lifting3",
  });

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const parsedMutationResult = workoutMutationResultSchema.safeParse(actionResult);

  if (!parsedMutationResult.success) {
    return defaultShouldRevalidate;
  }

  return parsedMutationResult.data.action === "delete_workout" ? false : defaultShouldRevalidate;
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
  return handleWorkoutPostAction({
    db: getAppDatabase(context),
    request,
  });
}

export default function WorkoutDetail({ actionData, loaderData }: Route.ComponentProps) {
  return <WorkoutDetailView actionData={actionData} loaderData={loaderData} />;
}
