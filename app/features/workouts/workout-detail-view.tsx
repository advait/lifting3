import { CheckIcon, Clock3Icon, DumbbellIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Form, useNavigate } from "react-router";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { usePublishAppEvent } from "~/features/app-events/client";
import { cn } from "~/lib/utils";

import { workoutMutationResultSchema } from "./actions";
import type {
  WorkoutDetailLoaderData,
  WorkoutDetailWorkout,
  WorkoutExercise,
  WorkoutSet,
} from "./contracts";

const REST_TIMER_PLACEHOLDER = "02:00";
const workoutDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const workoutFullDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const WORKOUT_ROUTE_ACTIONS = [
  "delete_workout",
  "start_workout",
  "update_set_designation",
  "update_set_actuals",
  "confirm_set",
  "skip_set",
  "add_set",
  "remove_set",
  "remove_exercise",
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
  availableActions: readonly WorkoutRouteAction[];
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
        "update_set_designation",
        "add_set",
        "remove_set",
        "remove_exercise",
        "reorder_exercise",
        "update_workout_notes",
        "update_exercise_notes",
      ];
    case "active":
      return [
        "update_set_designation",
        "update_set_actuals",
        "confirm_set",
        "skip_set",
        "add_set",
        "remove_set",
        "remove_exercise",
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
  return workoutFullDateFormatter.format(new Date(value));
}

function formatWorkoutDateChip(value: string) {
  return workoutDateFormatter.format(new Date(value));
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

function getCarryForwardSetValues(set: WorkoutSet | null | undefined) {
  if (!set) {
    return null;
  }

  return {
    reps: set.actual.reps ?? set.planned.reps,
    weightLbs: set.actual.weightLbs ?? set.planned.weightLbs,
  };
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

function getWorkoutDurationLabel(durationMs: number | null) {
  return durationMs == null ? "Not started" : formatDuration(durationMs);
}

const workoutMetaPillClassName =
  "inline-flex h-7 min-w-0 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium leading-none tracking-[0.08em] uppercase whitespace-nowrap";

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

function WorkoutOverviewCard({ availableActions, workout }: WorkoutOverviewCardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const durationMs = getWorkoutDurationMs(workout, nowMs);
  const canStartWorkout = hasAction(availableActions, "start_workout");
  const canFinishWorkout = hasAction(availableActions, "finish_workout");
  const deleteWorkoutFormId = `delete-workout-${workout.id}`;

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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-3 gap-2">
            <div className={cn(workoutMetaPillClassName, getWorkoutStatusClass(workout.status))}>
              <span className="truncate">{getWorkoutStatusLabel(workout.status)}</span>
            </div>

            <div className={cn(workoutMetaPillClassName, "border-border/70 text-muted-foreground")}>
              <span className="truncate">{getWorkoutDurationLabel(durationMs)}</span>
            </div>

            <div className={cn(workoutMetaPillClassName, "border-border/70 text-muted-foreground")}>
              <span className="truncate">{formatWorkoutDateChip(workout.date)}</span>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Open workout actions" size="icon" type="button" variant="ghost">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem disabled>Edit workout</DropdownMenuItem>
            <Form id={deleteWorkoutFormId} method="post">
              <MutationFields
                action="delete_workout"
                workoutId={workout.id}
                workoutVersion={workout.version}
              />
            </Form>
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => {
                const form = document.getElementById(deleteWorkoutFormId);

                if (form instanceof HTMLFormElement) {
                  form.requestSubmit();
                }
              }}
            >
              Delete workout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {getExerciseNotes(workout.coachNotes) || getExerciseNotes(workout.userNotes) ? (
        <div className="grid gap-2 pt-1">
          {getExerciseNotes(workout.coachNotes) ? (
            <p className="text-muted-foreground text-sm italic leading-relaxed">
              {getExerciseNotes(workout.coachNotes)}
            </p>
          ) : null}

          {getExerciseNotes(workout.userNotes) ? (
            <p className="font-medium text-sm leading-relaxed">
              {getExerciseNotes(workout.userNotes)}
            </p>
          ) : null}
        </div>
      ) : null}

      {canStartWorkout ? (
        <Form method="post">
          <MutationFields
            action="start_workout"
            workoutId={workout.id}
            workoutVersion={workout.version}
          />
          <Button className="w-full" type="submit">
            Start workout
          </Button>
        </Form>
      ) : null}

      {canFinishWorkout ? (
        <Form method="post">
          <MutationFields
            action="finish_workout"
            workoutId={workout.id}
            workoutVersion={workout.version}
          />
          <Button className="w-full" type="submit" variant="secondary">
            Finish workout
          </Button>
        </Form>
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
        "min-w-12 rounded-full",
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

interface SetPickerModalProps {
  availableActions: readonly WorkoutRouteAction[];
  exerciseId: string;
  onClose: () => void;
  set: WorkoutSet;
  setLabel: string;
  workout: WorkoutDetailWorkout;
}

function SetPickerModal({
  availableActions,
  exerciseId,
  onClose,
  set,
  setLabel,
  workout,
}: SetPickerModalProps) {
  const canUpdateSetDesignation = hasAction(availableActions, "update_set_designation");
  const canRemoveSet = hasAction(availableActions, "remove_set") && set.status !== "done";
  const canSwitchToWarmup = canUpdateSetDesignation && set.designation !== "warmup";
  const canSwitchToWorking = canUpdateSetDesignation && set.designation !== "working";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:p-6">
      <button
        aria-label="Close set picker"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <section className="relative z-10 w-full max-w-sm rounded-3xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="grid gap-1 pb-4">
          <p className="font-semibold text-base tracking-tight">Set {setLabel}</p>
          <p className="text-muted-foreground text-sm">
            Choose how this set should be classified.
          </p>
        </div>

        <div className="grid gap-2">
          <Form method="post" onSubmit={onClose}>
            <MutationFields
              action="update_set_designation"
              exerciseId={exerciseId}
              setId={set.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <input name="designation" type="hidden" value="warmup" />
            <Button className="w-full justify-start" disabled={!canSwitchToWarmup} type="submit" variant="outline">
              Warmup Set
            </Button>
          </Form>

          <Form method="post" onSubmit={onClose}>
            <MutationFields
              action="update_set_designation"
              exerciseId={exerciseId}
              setId={set.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <input name="designation" type="hidden" value="working" />
            <Button className="w-full justify-start" disabled={!canSwitchToWorking} type="submit" variant="outline">
              Regular Set
            </Button>
          </Form>

          <Form method="post" onSubmit={onClose}>
            <MutationFields
              action="remove_set"
              exerciseId={exerciseId}
              setId={set.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <Button className="w-full justify-start" disabled={!canRemoveSet} type="submit" variant="destructive">
              Delete Set
            </Button>
          </Form>
        </div>

        <Button className="mt-3 w-full" onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </section>
    </div>
  );
}

function ExerciseCard({ availableActions, exercise, workout }: ExerciseCardProps) {
  const canAddSet = hasAction(availableActions, "add_set");
  const canRemoveExercise = hasAction(availableActions, "remove_exercise");
  const canRemoveExerciseNow =
    canRemoveExercise && !exercise.sets.some((set) => set.status === "done");
  const canOpenSetPicker =
    hasAction(availableActions, "update_set_designation") || hasAction(availableActions, "remove_set");
  const lastSet = exercise.sets.at(-1);
  const carryForwardValues = getCarryForwardSetValues(lastSet);
  const removeExerciseFormId = `remove-exercise-${exercise.id}`;
  const [selectedSetForPicker, setSelectedSetForPicker] = useState<{
    label: string;
    set: WorkoutSet;
  } | null>(null);
  let workingSetNumber = 0;

  return (
    <section className="grid gap-3 py-5 first:pt-0">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-background/70 text-muted-foreground">
          <DumbbellIcon aria-hidden />
        </div>
        <h2 className="font-semibold text-base tracking-tight">{exercise.displayName}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Open exercise actions for ${exercise.displayName}`}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <Form id={removeExerciseFormId} method="post">
              <MutationFields
                action="remove_exercise"
                exerciseId={exercise.id}
                workoutId={workout.id}
                workoutVersion={workout.version}
              />
            </Form>
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              disabled={!canRemoveExerciseNow}
              onSelect={() => {
                const form = document.getElementById(removeExerciseFormId);

                if (form instanceof HTMLFormElement) {
                  form.requestSubmit();
                }
              }}
            >
              Remove exercise
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {getExerciseNotes(exercise.coachNotes) ? (
        <p className="text-muted-foreground text-sm italic leading-relaxed">
          {getExerciseNotes(exercise.coachNotes)}
        </p>
      ) : null}

      {getExerciseNotes(exercise.userNotes) ? (
        <p className="font-medium text-sm leading-relaxed">
          {getExerciseNotes(exercise.userNotes)}
        </p>
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
              <th className="w-20 px-2 py-2 text-center font-medium pr-4 sm:w-18 sm:px-2 sm:pr-2">
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
                    <Button
                      className="h-auto min-w-8 rounded-full px-2 py-1 font-medium"
                      disabled={!canOpenSetPicker}
                      onClick={() => {
                        setSelectedSetForPicker({
                          label: setLabel,
                          set,
                        });
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {setLabel}
                    </Button>
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
                  <td className="px-2 py-2 text-center pr-4 sm:px-2 sm:pr-2">
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
          <input name="insertAfterSetId" type="hidden" value={lastSet?.id ?? ""} />
          {carryForwardValues?.weightLbs != null ? (
            <input name="weightLbs" type="hidden" value={carryForwardValues.weightLbs} />
          ) : null}
          {carryForwardValues?.reps != null ? (
            <input name="reps" type="hidden" value={carryForwardValues.reps} />
          ) : null}
          <Button className="w-full" size="sm" type="submit" variant="outline">
            <PlusIcon />
            Add Set
          </Button>
        </Form>
      ) : (
        <div>
          <Button className="w-full" disabled size="sm" type="button" variant="outline">
            <PlusIcon />
            Add Set
          </Button>
        </div>
      )}

      {selectedSetForPicker ? (
        <SetPickerModal
          availableActions={availableActions}
          exerciseId={exercise.id}
          onClose={() => {
            setSelectedSetForPicker(null);
          }}
          set={selectedSetForPicker.set}
          setLabel={selectedSetForPicker.label}
          workout={workout}
        />
      ) : null}
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
  const navigate = useNavigate();
  usePublishAppEvent(actionData);

  const availableActions = getAvailableActions(loaderData.workout.status);
  const canEditWorkout =
    loaderData.workout.status === "planned" || loaderData.workout.status === "active";

  useEffect(() => {
    const parsedActionData = workoutMutationResultSchema.safeParse(actionData);

    if (!parsedActionData.success || parsedActionData.data.action !== "delete_workout") {
      return;
    }

    void navigate("/workouts", { replace: true });
  }, [actionData, navigate]);

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(240px,0.7fr)] lg:gap-8">
      <div className="grid gap-0">
        <WorkoutOverviewCard availableActions={availableActions} workout={loaderData.workout} />
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

        <div className="pt-4">
          <Button
            className="w-full"
            disabled={!canEditWorkout}
            size="sm"
            type="button"
            variant="secondary"
          >
            <PlusIcon />
            Add Exercise
          </Button>
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
