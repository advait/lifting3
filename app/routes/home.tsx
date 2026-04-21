import { HomeScreen } from "~/components/screens/home-screen";
import { defineAppEventRouteHandle } from "~/features/app-events/client";
import { workoutListSearchSchema } from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { createPageMeta } from "~/lib/meta";
import { getAppDatabase } from "~/lib/.server/router-context";

import type { Route } from "./+types/home";

export const handle = defineAppEventRouteHandle({
  invalidateKeys: () => ["workouts:list"],
});

export const meta: Route.MetaFunction = ({ location, matches }) =>
  createPageMeta({
    description:
      "Plan workouts, log sets fast, and jump back into recent training with coach-guided structure.",
    location,
    matches,
    title: "lifting3",
  });

export function loader({ context }: Route.LoaderArgs) {
  const search = workoutListSearchSchema.parse({});

  return createWorkoutRouteService(getAppDatabase(context)).loadWorkoutList(search);
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <HomeScreen items={loaderData.items} />;
}
