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

const weightFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
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

type WorkoutListItem = Route.ComponentProps["loaderData"]["items"][number];
type WorkoutExerciseSummary = WorkoutListItem["exerciseSummaries"][number];

function formatExerciseProgress(exercise: WorkoutExerciseSummary) {
  return `${exercise.completedSetCount}/${exercise.totalSetCount} sets`;
}

function formatTopSet(topSet: WorkoutExerciseSummary["topSet"]) {
  if (topSet.weightLbs == null) {
    return "\u2014";
  }

  const formattedWeight = weightFormatter.format(topSet.weightLbs);

  return topSet.rpe == null ? formattedWeight : `${formattedWeight} @ ${topSet.rpe}`;
}

function ExerciseSummaryTable({ item }: { item: WorkoutListItem }) {
  return (
    <div className="w-full border-white/6 border-t bg-linear-to-b from-white/[0.035] via-white/[0.018] to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors group-hover/card:from-white/[0.045] group-hover/card:via-white/[0.024]">
      <table className="w-full table-fixed text-sm">
        <thead className="border-white/10 border-b bg-white/[0.055] text-[11px] text-foreground/46 uppercase tracking-[0.16em] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <tr>
            <th className="w-[51%] px-4 py-2 text-left font-medium">Exercise</th>
            <th className="w-[22%] px-4 py-2 text-right font-medium">Sets</th>
            <th className="w-[27%] px-4 py-2 text-right font-medium">Max</th>
          </tr>
        </thead>
        <tbody className="[&_tr+tr]:border-t [&_tr+tr]:border-white/5">
          {item.exerciseSummaries.length > 0 ? (
            item.exerciseSummaries.map((exercise) => (
              <tr
                className="bg-transparent transition-colors odd:bg-white/[0.012] hover:bg-white/[0.03]"
                key={`${exercise.orderIndex}-${exercise.displayName}`}
              >
                <td className="px-4 py-3 font-medium text-foreground/92 leading-snug">
                  {exercise.displayName}
                </td>
                <td className="px-4 py-3 text-right text-foreground/58 tabular-nums whitespace-nowrap">
                  {formatExerciseProgress(exercise)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground/84 tabular-nums whitespace-nowrap">
                  {formatTopSet(exercise.topSet)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-4 py-3 text-muted-foreground" colSpan={3}>
                No exercises logged.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
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
            <Link
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              key={item.id}
              to={`/workouts/${item.id}`}
            >
              <Card className="border-border/70 bg-card/95 pb-0 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-card hover:shadow-xl hover:shadow-black/5 hover:ring-primary/20">
                <CardHeader className="gap-3">
                  <CardAction className="flex flex-wrap gap-2">
                    <Badge className="border-border/70 bg-background/60" variant="outline">
                      {item.status}
                    </Badge>
                  </CardAction>
                  <CardTitle className="pr-20">{item.title}</CardTitle>
                  <CardDescription>
                    {dateFormatter.format(new Date(item.date))} · {item.exerciseCount} exercises
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <ExerciseSummaryTable item={item} />
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
