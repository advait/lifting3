import { Link } from "react-router";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

import type { WorkoutListExerciseSummary, WorkoutListItem } from "./contracts";
import { WorkoutStatusBadge } from "./workout-status-badge";

const workoutListDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const workoutListWeightFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function formatExerciseProgress(exercise: WorkoutListExerciseSummary) {
  return `${exercise.confirmedSetCount}/${exercise.totalSetCount} sets`;
}

function formatTopSet(topSet: WorkoutListExerciseSummary["topSet"]) {
  if (topSet.weightLbs == null) {
    return "\u2014";
  }

  const formattedWeight = workoutListWeightFormatter.format(topSet.weightLbs);

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

export function WorkoutListCard({ item }: { item: WorkoutListItem }) {
  return (
    <Link
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
      to={`/workouts/${item.id}`}
    >
      <Card className="border-border/70 bg-card/95 pb-0 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-card hover:shadow-xl hover:shadow-black/5 hover:ring-primary/20">
        <CardHeader className="gap-3">
          <CardAction className="flex flex-wrap gap-2">
            <WorkoutStatusBadge size="sm" status={item.status} />
          </CardAction>
          <CardTitle className="pr-20">{item.title}</CardTitle>
          <CardDescription>
            {workoutListDateFormatter.format(new Date(item.date))} · {item.exerciseCount} exercises
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ExerciseSummaryTable item={item} />
        </CardContent>
      </Card>
    </Link>
  );
}
