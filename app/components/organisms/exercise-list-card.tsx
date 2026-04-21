import { Badge } from "~/components/atoms/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/atoms/card";
import type { ExerciseListItem } from "~/features/exercises/contracts";

const CLASSIFICATION_LABELS: Record<ExerciseListItem["classification"], string> = {
  assistance: "Assistance",
  core: "Core",
  main_lift: "Main lift",
  warmup: "Warm-up",
};

const EQUIPMENT_LABELS: Record<ExerciseListItem["equipment"][number], string> = {
  band: "Band",
  barbell: "Barbell",
  bodyweight: "Bodyweight",
  cable: "Cable",
  dumbbell: "Dumbbell",
  machine: "Machine",
};

const MOVEMENT_PATTERN_LABELS: Record<ExerciseListItem["movementPattern"], string> = {
  core: "Core",
  hinge: "Hinge",
  horizontal_pull: "Horizontal pull",
  horizontal_push: "Horizontal push",
  single_leg: "Single-leg",
  squat: "Squat",
  vertical_push: "Vertical push",
  warmup: "Warm-up",
};

const exerciseListWeightFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function formatProgress(progress: ExerciseListItem["progress"]) {
  if (progress.firstSessionMaxWeightLbs == null || progress.latestSessionMaxWeightLbs == null) {
    return "\u2014";
  }

  return `${exerciseListWeightFormatter.format(progress.firstSessionMaxWeightLbs)} -> ${exerciseListWeightFormatter.format(progress.latestSessionMaxWeightLbs)} lb`;
}

function ExerciseStatsTable({ item }: { item: ExerciseListItem }) {
  return (
    <div className="w-full border-white/6 border-t bg-linear-to-b from-white/[0.035] via-white/[0.018] to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors">
      <table className="w-full table-fixed text-sm">
        <thead className="border-white/10 border-b bg-white/[0.055] text-[11px] text-foreground/46 uppercase tracking-[0.16em] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <tr>
            <th className="w-[30%] px-4 py-2 text-center font-medium">Workouts</th>
            <th className="w-[30%] px-4 py-2 text-center font-medium">Total Sets</th>
            <th className="w-[40%] px-4 py-2 text-center font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-transparent">
            <td className="px-4 py-3 text-center font-medium text-foreground/92 tabular-nums whitespace-nowrap">
              {item.totalWorkouts}
            </td>
            <td className="px-4 py-3 text-center font-medium text-foreground/92 tabular-nums whitespace-nowrap">
              {item.totalSets}
            </td>
            <td className="px-4 py-3 text-center font-medium text-foreground/84 tabular-nums whitespace-nowrap">
              {formatProgress(item.progress)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ExerciseListCard({ item }: { item: ExerciseListItem }) {
  return (
    <Card className="border-border/70 bg-card/95 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-card hover:shadow-xl hover:shadow-black/5 hover:ring-primary/20">
      <CardHeader className="gap-1">
        <CardTitle>{item.displayName}</CardTitle>
      </CardHeader>

      <CardContent className="px-0">
        <ExerciseStatsTable item={item} />
      </CardContent>

      <CardFooter className="flex-wrap gap-2 border-white/6 bg-transparent px-4 py-3">
        <Badge
          className="border-primary/30 bg-primary/12 text-primary-foreground"
          variant="outline"
        >
          {CLASSIFICATION_LABELS[item.classification]}
        </Badge>
        <Badge
          className={
            item.hasDone
              ? "border-emerald-400/28 bg-emerald-500/10 text-emerald-200"
              : "border-border/80 bg-muted/40 text-muted-foreground"
          }
          variant="outline"
        >
          {item.hasDone ? "Have done" : "Not yet"}
        </Badge>
        <Badge className="border-border/75 bg-white/[0.03] text-foreground/68" variant="outline">
          {MOVEMENT_PATTERN_LABELS[item.movementPattern]}
        </Badge>
        {item.equipment.map((equipment) => (
          <Badge
            className="border-border/75 bg-white/[0.03] text-foreground/68"
            key={equipment}
            variant="outline"
          >
            {EQUIPMENT_LABELS[equipment]}
          </Badge>
        ))}
      </CardFooter>
    </Card>
  );
}
