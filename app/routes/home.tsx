import { Link } from "react-router";

import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { defineAppEventRouteHandle } from "~/features/app-events/client";
import { workoutListSearchSchema } from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { getAppDatabase } from "~/lib/.server/router-context";

import type { Route } from "./+types/home";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export const handle = defineAppEventRouteHandle({
  invalidateKeys: () => ["workouts:list"],
});

export const meta: Route.MetaFunction = () => [
  { title: "lifting3" },
  {
    name: "description",
    content: "Recent workouts from the shared D1-backed workout loader.",
  },
];

export function loader({ context }: Route.LoaderArgs) {
  const search = workoutListSearchSchema.parse({});

  return createWorkoutRouteService(getAppDatabase(context)).loadWorkoutList(search);
}

function summarizeSetProgress(item: Route.ComponentProps["loaderData"]["items"][number]) {
  return `${item.counts.done} of ${item.counts.total} sets confirmed`;
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
            <Link className="block" key={item.id} to={`/workouts/${item.id}`}>
              <Card className="border-border/70 bg-card/90 transition-all hover:bg-card hover:ring-primary/15">
                <CardHeader>
                  <CardAction className="flex flex-wrap gap-2">
                    <Badge variant="outline">{item.status}</Badge>
                  </CardAction>
                  <CardTitle className="pr-20">{item.title}</CardTitle>
                  <CardDescription>
                    {dateFormatter.format(new Date(item.date))} · {item.exerciseCount} exercises
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <p className="text-sm">{summarizeSetProgress(item)}</p>

                  <dl className="grid grid-cols-4 gap-3 text-sm">
                    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                      <dt className="text-muted-foreground text-xs">Total</dt>
                      <dd className="mt-1 font-medium">{item.counts.total}</dd>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                      <dt className="text-muted-foreground text-xs">Done</dt>
                      <dd className="mt-1 font-medium">{item.counts.done}</dd>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                      <dt className="text-muted-foreground text-xs">TBD</dt>
                      <dd className="mt-1 font-medium">{item.counts.tbd}</dd>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                      <dt className="text-muted-foreground text-xs">Skipped</dt>
                      <dd className="mt-1 font-medium">{item.counts.skipped}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </Link>
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
