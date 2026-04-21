import { Badge } from "~/components/atoms/badge";
import { cn } from "~/lib/utils";

import type { WorkoutStatus } from "./file.ts";

const workoutStatusLabelMap = {
  active: "Active",
  canceled: "Canceled",
  completed: "Completed",
  planned: "Planned",
} as const satisfies Record<WorkoutStatus, string>;

const workoutStatusToneMap = {
  active: "border-emerald-400/22 bg-emerald-400/14 text-emerald-100",
  canceled: "border-rose-400/22 bg-rose-400/14 text-rose-100",
  completed: "border-sky-400/22 bg-sky-400/14 text-sky-100",
  planned: "border-white/10 bg-white/[0.04] text-foreground/62",
} as const satisfies Record<WorkoutStatus, string>;

const workoutStatusSizeMap = {
  lg: "h-7 px-2.5 text-[11px]",
  md: "h-6 px-2.5 text-[10.5px]",
  sm: "h-5 px-2 text-[10px]",
} as const;

interface WorkoutStatusBadgeProps {
  className?: string;
  size?: keyof typeof workoutStatusSizeMap;
  status: WorkoutStatus;
}

export function WorkoutStatusBadge({ className, size = "md", status }: WorkoutStatusBadgeProps) {
  return (
    <Badge
      className={cn(
        "justify-center rounded-full font-medium leading-none uppercase tracking-[0.12em] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]",
        workoutStatusSizeMap[size],
        workoutStatusToneMap[status],
        className,
      )}
      variant="outline"
    >
      {workoutStatusLabelMap[status]}
    </Badge>
  );
}
