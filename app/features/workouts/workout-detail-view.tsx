import { CheckIcon, Clock3Icon, DumbbellIcon, MoreHorizontalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Form } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { usePublishAppEvent } from "~/features/app-events/client";
import { cn } from "~/lib/utils";

import type {
  WorkoutDetailLoaderData,
  WorkoutDetailWorkout,
  WorkoutExercise,
  WorkoutSet,
} from "./contracts";

const REST_TIMER_PLACEHOLDER = "02:00";
const WORKOUT_ROUTE_ACTIONS = [
  "start_workout",
  "update_set_actuals",
  "confirm_set",
  "skip_set",
  "add_set",
  "remove_set",
  "reorder_exercise",
  "update_workout_notes",
  "update_exercise_notes",
  "finish_workout",
] as const;

type WorkoutRouteAction = (typeof WORKOUT_ROUTE_ACTIONS)[number];

interface WorkoutDetailViewProps {
  actionData: unknown;
  loaderData: WorkoutDetailLoaderData;
}

interface MutationFieldsProps {
  action: WorkoutRouteAction;
  exerciseId?: string;
  setId?: string;
  workoutId: string;
  workoutVersion: number;
}

interface ExerciseCardProps {
  availableActions: readonly WorkoutRouteAction[];
  exercise: WorkoutExercise;
  workout: WorkoutDetailWorkout;
}

interface WorkoutOverviewCardProps {
  workout: WorkoutDetailWorkout;
}

interface SessionSummarySectionProps {
  exercisesCount: number;
  progress: WorkoutDetailLoaderData["progress"];
  workout: WorkoutDetailWorkout;
}

function getAvailableActions(
  workoutStatus: WorkoutDetailWorkout["status"],
): readonly WorkoutRouteAction[] {
  switch (workoutStatus) {
    case "planned":
      return [
        "start_workout",
        "add_set",
        "remove_set",
        "reorder_exercise",
        "update_workout_notes",
        "update_exercise_notes",
      ];
    case "active":
      return [
        "update_set_actuals",
        "confirm_set",
        "skip_set",
        "add_set",
        "remove_set",
        "reorder_exercise",
        "update_workout_notes",
        "update_exercise_notes",
        "finish_workout",
      ];
    case "completed":
    case "canceled":
      return ["update_workout_notes", "update_exercise_notes"];
    default:
      return [];
  }
}

function hasAction(availableActions: readonly WorkoutRouteAction[], action: WorkoutRouteAction) {
  return availableActions.includes(action);
}

function MutationFields({
  action,
  exerciseId,
  setId,
  workoutId,
  workoutVersion,
}: MutationFieldsProps) {
  return (
    <>
      <input name="action" type="hidden" value={action} />
      <input name="expectedVersion" type="hidden" value={workoutVersion} />
      {exerciseId ? <input name="exerciseId" type="hidden" value={exerciseId} /> : null}
      {setId ? <input name="setId" type="hidden" value={setId} /> : null}
      <input name="workoutId" type="hidden" value={workoutId} />
    </>
  );
}

function formatWorkoutDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatOptionalValue(value: number | null) {
  return value == null ? "\u2014" : String(value);
}

function formatSetPerformance(set: WorkoutSet | null | undefined) {
  if (!set) {
    return "\u2014";
  }

  const weight = set.actual.weightLbs ?? set.planned.weightLbs;
  const reps = set.actual.reps ?? set.planned.reps;
  const rpe = set.actual.rpe ?? set.planned.rpe;

  if (weight == null && reps == null && rpe == null) {
    return "\u2014";
  }

  const mainPart = `${formatOptionalValue(weight)} x ${formatOptionalValue(reps)}`;

  return rpe == null ? mainPart : `${mainPart} @ RPE ${rpe}`;
}

function getExerciseNotes(value: string | null) {
  return value?.trim() ?? null;
}

function getSetLabel(set: WorkoutSet, workingSetNumber: number) {
  return set.designation === "warmup" ? "W" : String(workingSetNumber);
}

function getWorkoutStatusClass(status: WorkoutDetailWorkout["status"]) {
  switch (status) {
    case "active":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
    case "completed":
      return "border-sky-500/25 bg-sky-500/10 text-sky-100";
    case "canceled":
      return "border-rose-500/25 bg-rose-500/10 text-rose-100";
    case "planned":
    default:
      return "border-border/80 bg-transparent text-muted-foreground";
  }
}

function getWorkoutStatusLabel(status: WorkoutDetailWorkout["status"]) {
  switch (status) {
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "canceled":
      return "Canceled";
    case "planned":
    default:
      return "Planned";
  }
}

function getWorkoutDurationMs(workout: WorkoutDetailWorkout, nowMs: number) {
  if (!workout.startedAt) {
    return null;
  }

  const startedAtMs = Date.parse(workout.startedAt);

  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  const endedAtMs =
    workout.status === "active"
      ? nowMs
      : workout.completedAt
        ? Date.parse(workout.completedAt)
        : nowMs;

  if (Number.isNaN(endedAtMs)) {
    return null;
  }

  return Math.max(0, endedAtMs - startedAtMs);
}

function WorkoutOverviewCard({ workout }: WorkoutOverviewCardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const durationMs = getWorkoutDurationMs(workout, nowMs);

  useEffect(() => {
    if (workout.status !== "active" || !workout.startedAt) {
      return;
    }

    setNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [workout.startedAt, workout.status]);

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Badge
          className={cn(
            "rounded-full px-2.5 py-1 font-medium text-[11px] tracking-[0.08em]",
            getWorkoutStatusClass(workout.status),
          )}
          variant="outline"
        >
          {getWorkoutStatusLabel(workout.status)}
        </Badge>

        <div className="inline-flex items-center gap-2 text-sm">
          <Clock3Icon aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="font-medium tabular-nums">
            {durationMs == null ? "Not started" : formatDuration(durationMs)}
          </span>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">{formatWorkoutDate(workout.date)}</p>

      {getExerciseNotes(workout.coachNotes) || getExerciseNotes(workout.userNotes) ? (
        <div className="grid gap-2 pt-1">
          {getExerciseNotes(workout.coachNotes) ? (
            <p className="text-muted-foreground text-sm italic leading-relaxed">
              {getExerciseNotes(workout.coachNotes)}
            </p>
          ) : null}

          {getExerciseNotes(workout.userNotes) ? (
            <p className="font-medium text-sm leading-relaxed">{getExerciseNotes(workout.userNotes)}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SetRpeButton({ set }: { set: WorkoutSet }) {
  const isComplete = set.status === "done" && set.actual.rpe != null;

  return (
    <Button
      aria-label={isComplete ? `RPE ${set.actual.rpe}` : "Set incomplete"}
      className={cn(
        "min-w-14 rounded-full",
        isComplete ? "bg-emerald-600 text-white hover:bg-emerald-500" : "text-muted-foreground",
      )}
      size="xs"
      type="button"
      variant={isComplete ? "default" : "outline"}
    >
      {isComplete ? set.actual.rpe : <CheckIcon />}
    </Button>
  );
}

function ExerciseCard({ availableActions, exercise, workout }: ExerciseCardProps) {
  const canAddSet = hasAction(availableActions, "add_set");
  let workingSetNumber = 0;

  return (
    <section className="grid gap-3 py-5 first:pt-0">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-background/70 text-muted-foreground">
          <DumbbellIcon aria-hidden />
        </div>
        <h2 className="font-semibold text-base tracking-tight">{exercise.displayName}</h2>
        <Button
          aria-label={`Open exercise actions for ${exercise.displayName}`}
          size="icon"
          type="button"
          variant="ghost"
        >
          <MoreHorizontalIcon />
        </Button>
      </div>

      {getExerciseNotes(exercise.coachNotes) ? (
        <p className="text-muted-foreground text-sm italic leading-relaxed">
          {getExerciseNotes(exercise.coachNotes)}
        </p>
      ) : null}

      {getExerciseNotes(exercise.userNotes) ? (
        <p className="font-medium text-sm leading-relaxed">{getExerciseNotes(exercise.userNotes)}</p>
      ) : null}

      <div className="flex items-center gap-2 text-sm">
        <Clock3Icon aria-hidden className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Rest Timer:</span>
        <span className="font-medium">{REST_TIMER_PLACEHOLDER}</span>
      </div>

      <div className="-mx-4 w-[calc(100%+2rem)] border-border/70 border-y sm:mx-0 sm:w-full">
        <table className="w-full table-fixed text-sm">
          <thead className="border-border/70 border-b text-muted-foreground text-[11px] uppercase tracking-[0.12em]">
            <tr>
              <th className="w-12 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                Set
              </th>
              <th className="px-2 py-2 text-center font-medium first:pl-4 last:pr-4 sm:first:pl-2 sm:last:pr-2">
                Previous
              </th>
              <th className="w-16 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                LBS
              </th>
              <th className="w-14 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                Reps
              </th>
              <th className="w-18 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                RPE
              </th>
            </tr>
          </thead>
          <tbody>
            {exercise.sets.map((set, setIndex) => {
              const setLabel =
                set.designation === "warmup"
                  ? getSetLabel(set, workingSetNumber)
                  : getSetLabel(set, ++workingSetNumber);

              return (
                <tr className="odd:bg-background/45 even:bg-transparent" key={set.id}>
                  <td className="px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                    {setLabel}
                  </td>
                  <td className="px-2 py-2 text-center text-muted-foreground leading-relaxed first:pl-4 last:pr-4 sm:first:pl-2 sm:last:pr-2">
                    {formatSetPerformance(exercise.sets[setIndex - 1])}
                  </td>
                  <td className="px-1 py-2 text-center first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                    {formatOptionalValue(set.actual.weightLbs ?? set.planned.weightLbs)}
                  </td>
                  <td className="px-1 py-2 text-center first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                    {formatOptionalValue(set.actual.reps ?? set.planned.reps)}
                  </td>
                  <td className="px-1 py-2 text-center first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                    <SetRpeButton set={set} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canAddSet ? (
        <Form method="post">
          <MutationFields
            action="add_set"
            exerciseId={exercise.id}
            workoutId={workout.id}
            workoutVersion={workout.version}
          />
          <input name="insertAfterSetId" type="hidden" value={exercise.sets.at(-1)?.id ?? ""} />
          <Button className="w-full" size="sm" type="submit" variant="outline">
            Add Set
          </Button>
        </Form>
      ) : (
        <div>
          <Button className="w-full" disabled size="sm" type="button" variant="outline">
            Add Set
          </Button>
        </div>
      )}
    </section>
  );
}

function SessionSummarySection({ exercisesCount, progress, workout }: SessionSummarySectionProps) {
  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold text-sm tracking-tight">Session Summary</h2>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">TBD</p>
          <p className="mt-1 font-medium">{progress.tbd}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">Done</p>
          <p className="mt-1 font-medium">{progress.done}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">Skipped</p>
          <p className="mt-1 font-medium">{progress.skipped}</p>
        </div>
      </div>

      <dl className="grid gap-2 text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <dt>Date</dt>
          <dd className="text-foreground">{formatWorkoutDate(workout.date)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Exercises</dt>
          <dd className="text-foreground">{exercisesCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Started</dt>
          <dd className="text-foreground">
            {workout.startedAt ? new Date(workout.startedAt).toLocaleTimeString() : "Not started"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Completed</dt>
          <dd className="text-foreground">
            {workout.completedAt
              ? new Date(workout.completedAt).toLocaleTimeString()
              : "Not finished"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function WorkoutDetailView({ actionData, loaderData }: WorkoutDetailViewProps) {
  usePublishAppEvent(actionData);

  const availableActions = getAvailableActions(loaderData.workout.status);

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(240px,0.7fr)] lg:gap-8">
      <div className="grid gap-0">
        <WorkoutOverviewCard workout={loaderData.workout} />
        <div
          aria-hidden="true"
          className="my-6 -mx-4 w-[calc(100%+2rem)] border-border/70 border-t sm:mx-0 sm:my-8 sm:w-full"
        />

        <div>
          {loaderData.exercises.map((exercise) => (
            <ExerciseCard
              availableActions={availableActions}
              exercise={exercise}
              key={exercise.id}
              workout={loaderData.workout}
            />
          ))}
        </div>
      </div>

      <aside className="grid content-start gap-4 lg:border-border/70 lg:border-l lg:pl-6">
        <SessionSummarySection
          exercisesCount={loaderData.exercises.length}
          progress={loaderData.progress}
          workout={loaderData.workout}
        />
      </aside>
    </section>
  );
}
