import {
  CheckIcon,
  Clock3Icon,
  DumbbellIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { Form, Link } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { usePublishAppEvent } from "~/features/app-events/client";
import { cn } from "~/lib/utils";

import type {
  WorkoutDetailLoaderData,
  WorkoutDetailWorkout,
  WorkoutExercise,
  WorkoutSet,
} from "./contracts";

const TEXTAREA_CLASSNAME =
  "min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
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
    <Card className="border-border/70 bg-card/90">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-border/80 bg-background/70 text-muted-foreground">
          <DumbbellIcon aria-hidden />
        </div>
        <CardTitle>{exercise.displayName}</CardTitle>
        <Button
          aria-label={`Open exercise actions for ${exercise.displayName}`}
          size="icon"
          type="button"
          variant="ghost"
        >
          <MoreHorizontalIcon />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {getExerciseNotes(exercise.coachNotes) ? (
          <p className="text-muted-foreground text-sm italic leading-relaxed">
            {getExerciseNotes(exercise.coachNotes)}
          </p>
        ) : null}

        {getExerciseNotes(exercise.userNotes) ? (
          <p className="font-medium text-sm leading-relaxed">{getExerciseNotes(exercise.userNotes)}</p>
        ) : null}

        <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-background/60 px-3 py-3 text-sm">
          <Clock3Icon aria-hidden className="text-muted-foreground" />
          <span className="text-muted-foreground">Rest Timer:</span>
          <span className="font-medium">{REST_TIMER_PLACEHOLDER}</span>
        </div>

        <div className="rounded-2xl border border-border/80 bg-background/50">
          <table className="w-full table-fixed text-sm">
            <thead className="border-border/80 border-b text-muted-foreground text-xs uppercase tracking-[0.12em]">
              <tr>
                <th className="w-14 px-3 py-3 text-center font-medium sm:px-4">Set</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">Previous</th>
                <th className="w-16 px-3 py-3 text-center font-medium sm:px-4">Reps</th>
                <th className="w-20 px-3 py-3 text-center font-medium sm:px-4">RPE</th>
              </tr>
            </thead>
            <tbody>
              {exercise.sets.map((set, setIndex) => {
                const setLabel =
                  set.designation === "warmup"
                    ? getSetLabel(set, workingSetNumber)
                    : getSetLabel(set, ++workingSetNumber);

                return (
                  <tr className="border-border/70 border-b last:border-b-0" key={set.id}>
                    <td className="px-3 py-3 text-center font-medium sm:px-4">{setLabel}</td>
                    <td className="px-3 py-3 text-center text-muted-foreground leading-relaxed sm:px-4">
                      {formatSetPerformance(exercise.sets[setIndex - 1])}
                    </td>
                    <td className="px-3 py-3 text-center sm:px-4">
                      {formatOptionalValue(set.actual.reps ?? set.planned.reps)}
                    </td>
                    <td className="px-3 py-3 text-center sm:px-4">
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
      </CardContent>
    </Card>
  );
}

export function WorkoutDetailView({ actionData, loaderData }: WorkoutDetailViewProps) {
  usePublishAppEvent(actionData);

  const availableActions = getAvailableActions(loaderData.workout.status);

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
      <div className="grid gap-4">
        <Card className="border-border/70 bg-card/90">
          <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/workouts">Back to workouts</Link>
                </Button>
                <Badge variant="outline">{loaderData.workout.status}</Badge>
              </div>
              <div>
                <CardTitle>{loaderData.workout.title}</CardTitle>
                <CardDescription>
                  {formatWorkoutDate(loaderData.workout.date)} · {loaderData.progress.done} /{" "}
                  {loaderData.progress.total} sets confirmed
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasAction(availableActions, "start_workout") ? (
                <Form method="post">
                  <MutationFields
                    action="start_workout"
                    workoutId={loaderData.workout.id}
                    workoutVersion={loaderData.workout.version}
                  />
                  <Button size="sm" type="submit">
                    Start workout
                  </Button>
                </Form>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-card/90" id="workout-notes">
          <CardHeader>
            <CardTitle>Workout Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Form className="grid gap-3" method="post">
              <MutationFields
                action="update_workout_notes"
                workoutId={loaderData.workout.id}
                workoutVersion={loaderData.workout.version}
              />
              <label className="grid gap-1">
                <span className="font-medium text-sm">User notes</span>
                <textarea
                  className={TEXTAREA_CLASSNAME}
                  defaultValue={loaderData.workout.userNotes ?? ""}
                  name="userNotes"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-sm">Coach notes</span>
                <textarea
                  className={TEXTAREA_CLASSNAME}
                  defaultValue={loaderData.workout.coachNotes ?? ""}
                  name="coachNotes"
                />
              </label>
              <div>
                <Button size="sm" type="submit" variant="outline">
                  Save workout notes
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        <div className="grid gap-4">
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

      <div className="grid gap-4">
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>Session Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border/80 bg-background/70 px-3 py-3">
                <p className="text-muted-foreground text-xs">TBD</p>
                <p className="mt-1 font-medium">{loaderData.progress.tbd}</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-background/70 px-3 py-3">
                <p className="text-muted-foreground text-xs">Done</p>
                <p className="mt-1 font-medium">{loaderData.progress.done}</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-background/70 px-3 py-3">
                <p className="text-muted-foreground text-xs">Skipped</p>
                <p className="mt-1 font-medium">{loaderData.progress.skipped}</p>
              </div>
            </div>

            <dl className="grid gap-2 text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <dt>Date</dt>
                <dd className="text-foreground">{formatWorkoutDate(loaderData.workout.date)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Exercises</dt>
                <dd className="text-foreground">{loaderData.exercises.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Started</dt>
                <dd className="text-foreground">
                  {loaderData.workout.startedAt
                    ? new Date(loaderData.workout.startedAt).toLocaleTimeString()
                    : "Not started"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Completed</dt>
                <dd className="text-foreground">
                  {loaderData.workout.completedAt
                    ? new Date(loaderData.workout.completedAt).toLocaleTimeString()
                    : "Not finished"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
