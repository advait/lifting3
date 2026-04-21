import { Link } from "react-router";

import { Button } from "~/components/atoms/button";
import { Card, CardDescription, CardHeader, CardTitle } from "~/components/atoms/card";
import { ExerciseListCard } from "~/components/organisms/exercise-list-card";
import type { ExerciseListLoaderData, ExerciseListSearch } from "~/features/exercises/contracts";

const HISTORY_FILTER_ITEMS: ReadonlyArray<{
  history: ExerciseListSearch["history"];
  label: string;
}> = [
  { history: "all", label: "All history" },
  { history: "done", label: "Have done" },
  { history: "not_done", label: "Not yet" },
] as const;

const TYPE_FILTER_ITEMS: ReadonlyArray<{
  label: string;
  type?: ExerciseListSearch["type"];
}> = [
  { label: "All types" },
  { label: "Main lifts", type: "main_lift" },
  { label: "Assistance", type: "assistance" },
  { label: "Core", type: "core" },
  { label: "Warm-up", type: "warmup" },
] as const;

const EQUIPMENT_FILTER_ITEMS: ReadonlyArray<{
  equipment?: ExerciseListSearch["equipment"];
  label: string;
}> = [
  { label: "All gear" },
  { equipment: "barbell", label: "Barbell" },
  { equipment: "dumbbell", label: "Dumbbell" },
  { equipment: "machine", label: "Machine" },
  { equipment: "bodyweight", label: "Bodyweight" },
  { equipment: "cable", label: "Cable" },
  { equipment: "band", label: "Band" },
] as const;

interface ExercisesScreenProps {
  readonly loaderData: ExerciseListLoaderData;
}

function createFilterHref(currentFilters: ExerciseListSearch, patch: Partial<ExerciseListSearch>) {
  const nextFilters = {
    ...currentFilters,
    ...patch,
  } satisfies ExerciseListSearch;
  const nextSearchParams = new URLSearchParams();

  if (nextFilters.type) {
    nextSearchParams.set("type", nextFilters.type);
  }

  if (nextFilters.equipment) {
    nextSearchParams.set("equipment", nextFilters.equipment);
  }

  if (nextFilters.history !== "all") {
    nextSearchParams.set("history", nextFilters.history);
  }

  const search = nextSearchParams.toString();

  return search ? `/exercises?${search}` : "/exercises";
}

export function ExercisesScreen({ loaderData }: ExercisesScreenProps) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-4">
        <div className="grid gap-4 md:flex md:items-end md:justify-between">
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">Exercises</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Browse the full catalog, see how often each lift shows up in training, and filter down
              to the work you have actually logged.
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-sm shadow-black/5">
          <div className="grid gap-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.16em]">Type</p>
            <div className="flex flex-wrap gap-2">
              {TYPE_FILTER_ITEMS.map((filter) => {
                const isActive = loaderData.filters.type === filter.type;

                return (
                  <Button
                    asChild
                    key={filter.label}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                  >
                    <Link
                      to={createFilterHref(loaderData.filters, {
                        type: filter.type,
                      })}
                    >
                      {filter.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.16em]">History</p>
            <div className="flex flex-wrap gap-2">
              {HISTORY_FILTER_ITEMS.map((filter) => {
                const isActive = loaderData.filters.history === filter.history;

                return (
                  <Button
                    asChild
                    key={filter.label}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                  >
                    <Link
                      to={createFilterHref(loaderData.filters, {
                        history: filter.history,
                      })}
                    >
                      {filter.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
              Equipment
            </p>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_FILTER_ITEMS.map((filter) => {
                const isActive = loaderData.filters.equipment === filter.equipment;

                return (
                  <Button
                    asChild
                    key={filter.label}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                  >
                    <Link
                      to={createFilterHref(loaderData.filters, {
                        equipment: filter.equipment,
                      })}
                    >
                      {filter.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {loaderData.items.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {loaderData.items.map((item) => (
              <ExerciseListCard item={item} key={item.exerciseSchemaId} />
            ))}
          </div>
        ) : (
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle>No exercises match these filters</CardTitle>
              <CardDescription>
                Try clearing one of the chips to widen the catalog and show more exercise cards.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </section>
  );
}
