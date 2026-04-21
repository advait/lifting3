import { data } from "react-router";

import { ExercisesScreen } from "~/components/screens/exercises-screen";
import { defineAppEventRouteHandle } from "~/features/app-events/client";
import { exerciseListSearchSchema } from "~/features/exercises/contracts";
import { createExerciseRouteService } from "~/features/exercises/d1-service.server";
import { createPageMeta } from "~/lib/meta";
import { getAppDatabase } from "~/lib/.server/router-context";

import type { Route } from "./+types/exercises";

export const handle = defineAppEventRouteHandle({
  invalidateKeys: () => ["exercises:list"],
});

export const meta: Route.MetaFunction = ({ location, matches }) =>
  createPageMeta({
    description:
      "Browse the exercise catalog, filter by type or equipment, and see how each lift shows up in your training history.",
    location,
    matches,
    title: "Exercises | lifting3",
  });

export function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const parsedSearch = exerciseListSearchSchema.safeParse({
    equipment: url.searchParams.get("equipment") ?? undefined,
    history: url.searchParams.get("history") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });

  if (!parsedSearch.success) {
    throw data({ message: "Invalid exercises filter query." }, { status: 400 });
  }

  return createExerciseRouteService(getAppDatabase(context)).loadExerciseList(parsedSearch.data);
}

export default function Exercises({ loaderData }: Route.ComponentProps) {
  return <ExercisesScreen loaderData={loaderData} />;
}
