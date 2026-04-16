import { Card, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { defineAppEventRouteHandle } from "~/features/app-events/client";
import { workoutListSearchSchema } from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { WorkoutListCard } from "~/features/workouts/workout-list-card";
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
  const recentWorkouts = loaderData?.items.slice(0, 6) ?? [];

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Recent Workouts</h1>
      </div>

      {recentWorkouts.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {recentWorkouts.map((item) => (
            <WorkoutListCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>No workouts yet</CardTitle>
            <CardDescription>
              Once workouts exist, the home route will surface the most recent sessions here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
}
