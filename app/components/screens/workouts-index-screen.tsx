import { Link } from "react-router";

import { Button } from "~/components/atoms/button";
import { Card, CardDescription, CardHeader, CardTitle } from "~/components/atoms/card";
import { WorkoutListCard } from "~/components/organisms/workout-list-card";
import type { WorkoutListLoaderData } from "~/features/workouts/contracts";

const FILTER_ITEMS: ReadonlyArray<{
  label: string;
  status?: "active" | "completed" | "planned";
}> = [
  { label: "All" },
  { label: "Active", status: "active" },
  { label: "Planned", status: "planned" },
  { label: "Completed", status: "completed" },
] as const;

interface WorkoutsIndexScreenProps {
  readonly loaderData: WorkoutListLoaderData;
}

function createFilterHref(
  currentFilters: WorkoutsIndexScreenProps["loaderData"]["filters"],
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

export function WorkoutsIndexScreen({ loaderData }: WorkoutsIndexScreenProps) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-4">
        <div className="grid gap-4 md:flex md:items-end md:justify-between">
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">Workouts</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Browse recent sessions, filter the list, and jump back into anything still in
              progress.
            </p>
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
        </div>

        {loaderData.items.length > 0 ? (
          <div className="grid gap-4">
            {loaderData.items.map((item) => (
              <WorkoutListCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle>No workouts match these filters</CardTitle>
              <CardDescription>
                Try clearing filters or widen the date range to bring sessions back into view.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </section>
  );
}
