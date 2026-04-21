import { data } from "react-router";

import { WorkoutsIndexScreen } from "~/components/screens/workouts-index-screen";
import { defineAppEventRouteHandle } from "~/features/app-events/client";
import { workoutListSearchSchema } from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { createPageMeta } from "~/lib/meta";
import { getAppDatabase } from "~/lib/.server/router-context";

import type { Route } from "./+types/workouts-index";

export const handle = defineAppEventRouteHandle({
  invalidateKeys: () => ["workouts:list"],
});

export const meta: Route.MetaFunction = ({ location, matches }) =>
  createPageMeta({
    description:
      "Browse planned, active, and completed workouts, then jump back into the sessions that matter.",
    location,
    matches,
    title: "Workouts | lifting3",
  });

export function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const parsedSearch = workoutListSearchSchema.safeParse({
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    exercise: url.searchParams.get("exercise") ?? undefined,
    page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined,
    source: url.searchParams.getAll("source"),
    status: url.searchParams.getAll("status"),
  });

  if (!parsedSearch.success) {
    throw data({ message: "Invalid workouts filter query." }, { status: 400 });
  }

  return createWorkoutRouteService(getAppDatabase(context)).loadWorkoutList(parsedSearch.data);
}

export default function WorkoutsIndex({ loaderData }: Route.ComponentProps) {
  return <WorkoutsIndexScreen loaderData={loaderData} />;
}
