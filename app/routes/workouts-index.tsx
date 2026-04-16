import { data, Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { defineAppEventRouteHandle } from "~/features/app-events/client";
import { workoutListSearchSchema } from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { getAppDatabase } from "~/lib/.server/router-context";

import type { Route } from "./+types/workouts-index";

const FILTER_ITEMS: ReadonlyArray<{
  label: string;
  status?: "active" | "completed" | "planned";
}> = [
  { label: "All" },
  { label: "Active", status: "active" },
  { label: "Planned", status: "planned" },
  { label: "Completed", status: "completed" },
] as const;

export const handle = defineAppEventRouteHandle({
  invalidateKeys: () => ["workouts:list"],
});

export const meta: Route.MetaFunction = () => [
  { title: "Workouts | lifting3" },
  {
    name: "description",
    content: "Historical workouts and active session entry points.",
  },
];

function createFilterHref(
  currentFilters: Route.ComponentProps["loaderData"]["filters"],
  status: (typeof FILTER_ITEMS)[number]["status"],
) {
  const nextSearchParams = new URLSearchParams();

  if (status) {
    nextSearchParams.set("status", status);
  }

  for (const source of currentFilters.source) {
    nextSearchParams.append("source", source);
  }

  if (currentFilters.dateFrom) {
    nextSearchParams.set("dateFrom", currentFilters.dateFrom);
  }
  if (currentFilters.dateTo) {
    nextSearchParams.set("dateTo", currentFilters.dateTo);
  }
  if (currentFilters.exercise) {
    nextSearchParams.set("exercise", currentFilters.exercise);
  }
  const search = nextSearchParams.toString();

  return search ? `/workouts?${search}` : "/workouts";
}

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
  const activeWorkout = loaderData.items.find((item) => item.id === loaderData.activeWorkoutId);

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Workouts</CardTitle>
            <CardDescription>
              D1-backed RR7 loaders now drive the list and detail routes through the shared workout
              contracts.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTER_ITEMS.map((filter) => {
              const isActive =
                filter.status === undefined
                  ? loaderData.filters.status.length === 0
                  : loaderData.filters.status.includes(filter.status);

              return (
                <Button
                  asChild
                  key={filter.label}
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                >
                  <Link to={createFilterHref(loaderData.filters, filter.status)}>
                    {filter.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loaderData.items.map((item) => (
            <Link
              className="rounded-2xl border border-border/80 bg-background/80 px-4 py-4 transition-colors hover:bg-accent/40"
              key={item.id}
              to={`/workouts/${item.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-base">{item.title}</h2>
                    <Badge variant="outline">{item.status}</Badge>
                    <Badge variant="secondary">{item.source}</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {new Date(item.date).toLocaleDateString()} · {item.exerciseCount} exercises ·{" "}
                    {item.counts.done} / {item.counts.total} sets confirmed
                  </p>
                </div>
                <div className="grid min-w-36 gap-1 text-right text-muted-foreground text-xs">
                  <span>tbd: {item.counts.tbd}</span>
                  <span>done: {item.counts.done}</span>
                  <span>skipped: {item.counts.skipped}</span>
                  <span>v{item.version}</span>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>Active Workout</CardTitle>
            <CardDescription>
              The list loader surfaces the currently active workout so home and workouts can share
              the same read model later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {activeWorkout ? (
              <>
                <p className="font-medium">{activeWorkout.title}</p>
                <p className="text-muted-foreground">
                  {activeWorkout.counts.done} / {activeWorkout.counts.total} sets confirmed
                </p>
                <Button asChild size="sm">
                  <Link to={`/workouts/${activeWorkout.id}`}>Resume workout</Link>
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">No active workout is loaded right now.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>Import / Export Boundary</CardTitle>
            <CardDescription>
              The interchange format remains the only supported boundary for moving workouts in or
              out of the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground text-sm">
            <p>Per-workout JSON files validated by the shared Zod schema.</p>
            <p>The current app keeps this boundary visible without HTTP import/export endpoints.</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
