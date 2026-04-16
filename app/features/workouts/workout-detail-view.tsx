import { Form, Link } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { usePublishAppEvent } from "~/features/app-events/client";

import type {
  WorkoutDetailLoaderData,
  WorkoutDetailWorkout,
  WorkoutExercise,
  WorkoutSet,
} from "./contracts";

const INPUT_CLASSNAME =
  "h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const TEXTAREA_CLASSNAME =
  "min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const QUICK_RPE_VALUES = [7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
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
  exerciseCount: number;
  exerciseIndex: number;
  workout: WorkoutDetailWorkout;
}

interface SetCardProps {
  availableActions: readonly WorkoutRouteAction[];
  exerciseId: string;
  set: WorkoutSet;
  workoutId: string;
  workoutVersion: number;
}

function hiddenValue(value: number | string | null | undefined) {
  return value == null ? "" : String(value);
}

function getAvailableActions(
  workoutStatus: WorkoutDetailWorkout["status"]
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

function hasAction(
  availableActions: readonly WorkoutRouteAction[],
  action: WorkoutRouteAction
) {
  return availableActions.includes(action);
}

function getAgentTargetPath(loaderData: WorkoutDetailLoaderData) {
  const agentSlug =
    loaderData.agentTarget.kind === "workout"
      ? "workout-coach"
      : "general-coach";

  return `/agents/${agentSlug}/${loaderData.agentTarget.instanceName}`;
}

function getSetStatusBadgeVariant(status: WorkoutSet["status"]) {
  if (status === "done") {
    return "default";
  }

  if (status === "skipped") {
    return "destructive";
  }

  return "secondary";
}

function hasActualValues(set: WorkoutSet) {
  return (
    set.actual.weightLbs != null ||
    set.actual.reps != null ||
    set.actual.rpe != null
  );
}

function getActualRpeSuffix(set: WorkoutSet) {
  if (set.actual.rpe == null) {
    return "";
  }

  return ` @ RPE ${set.actual.rpe}`;
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
      {exerciseId ? (
        <input name="exerciseId" type="hidden" value={exerciseId} />
      ) : null}
      {setId ? <input name="setId" type="hidden" value={setId} /> : null}
      <input name="workoutId" type="hidden" value={workoutId} />
    </>
  );
}

function SetCard({
  availableActions,
  exerciseId,
  set,
  workoutId,
  workoutVersion,
}: SetCardProps) {
  const resolvedWeight = set.actual.weightLbs ?? set.planned.weightLbs;
  const resolvedReps = set.actual.reps ?? set.planned.reps;
  const canUpdateActuals =
    set.status === "tbd" && hasAction(availableActions, "update_set_actuals");
  const canConfirmSet = hasAction(availableActions, "confirm_set");
  const canSkipSet = hasAction(availableActions, "skip_set");
  const canRemoveSet = hasAction(availableActions, "remove_set");

  return (
    <div className="rounded-2xl border border-border/80 bg-background/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">
              Set {set.orderIndex + 1}
            </span>
            <Badge variant="outline">{set.designation}</Badge>
            <Badge variant={getSetStatusBadgeVariant(set.status)}>
              {set.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Planned: {hiddenValue(set.planned.weightLbs)} lbs ×{" "}
            {hiddenValue(set.planned.reps)} reps
          </p>
          {hasActualValues(set) ? (
            <p className="text-muted-foreground text-sm">
              Actual: {hiddenValue(set.actual.weightLbs)} lbs ×{" "}
              {hiddenValue(set.actual.reps)} reps
              {getActualRpeSuffix(set)}
            </p>
          ) : null}
        </div>

        {canUpdateActuals ? (
          <div className="grid gap-2 md:min-w-80">
            <Form
              className="grid gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))_auto]"
              method="post"
            >
              <MutationFields
                action="update_set_actuals"
                exerciseId={exerciseId}
                setId={set.id}
                workoutId={workoutId}
                workoutVersion={workoutVersion}
              />
              <input
                className={INPUT_CLASSNAME}
                defaultValue={hiddenValue(set.actual.weightLbs)}
                name="weightLbs"
                placeholder="Weight"
                step="0.5"
                type="number"
              />
              <input
                className={INPUT_CLASSNAME}
                defaultValue={hiddenValue(set.actual.reps)}
                name="reps"
                placeholder="Reps"
                step="1"
                type="number"
              />
              <Button size="sm" type="submit" variant="outline">
                Save actuals
              </Button>
            </Form>

            <div className="flex flex-wrap gap-2">
              {canConfirmSet
                ? QUICK_RPE_VALUES.map((rpe) => (
                    <Form key={rpe} method="post">
                      <MutationFields
                        action="confirm_set"
                        exerciseId={exerciseId}
                        setId={set.id}
                        workoutId={workoutId}
                        workoutVersion={workoutVersion}
                      />
                      <input
                        name="reps"
                        type="hidden"
                        value={hiddenValue(resolvedReps)}
                      />
                      <input name="rpe" type="hidden" value={rpe} />
                      <input
                        name="weightLbs"
                        type="hidden"
                        value={hiddenValue(resolvedWeight)}
                      />
                      <Button size="xs" type="submit">
                        RPE {rpe}
                      </Button>
                    </Form>
                  ))
                : null}
              {canSkipSet ? (
                <Form method="post">
                  <MutationFields
                    action="skip_set"
                    exerciseId={exerciseId}
                    setId={set.id}
                    workoutId={workoutId}
                    workoutVersion={workoutVersion}
                  />
                  <Button size="xs" type="submit" variant="outline">
                    Skip
                  </Button>
                </Form>
              ) : null}
              {canRemoveSet ? (
                <Form method="post">
                  <MutationFields
                    action="remove_set"
                    exerciseId={exerciseId}
                    setId={set.id}
                    workoutId={workoutId}
                    workoutVersion={workoutVersion}
                  />
                  <Button size="xs" type="submit" variant="destructive">
                    Remove
                  </Button>
                </Form>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="text-right text-muted-foreground text-sm">
            {set.completedAt ? (
              <p>Confirmed {new Date(set.completedAt).toLocaleTimeString()}</p>
            ) : (
              <p>Awaiting action</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ExerciseCard({
  availableActions,
  exercise,
  exerciseCount,
  exerciseIndex,
  workout,
}: ExerciseCardProps) {
  const canReorder = hasAction(availableActions, "reorder_exercise");
  const canAddSet = hasAction(availableActions, "add_set");
  const canUpdateExerciseNotes = hasAction(
    availableActions,
    "update_exercise_notes"
  );

  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{exercise.displayName}</CardTitle>
            <Badge variant="outline">{exercise.status}</Badge>
            <Badge variant="secondary">{exercise.classification}</Badge>
          </div>
          <CardDescription>
            {exercise.logging.loadTracking.replaceAll("_", " ")} ·{" "}
            {exercise.sets.length} sets
          </CardDescription>
        </div>
        {canReorder ? (
          <div className="flex gap-2">
            <Form method="post">
              <MutationFields
                action="reorder_exercise"
                exerciseId={exercise.id}
                workoutId={workout.id}
                workoutVersion={workout.version}
              />
              <input
                name="targetIndex"
                type="hidden"
                value={Math.max(0, exerciseIndex - 1)}
              />
              <Button
                disabled={exerciseIndex === 0}
                size="sm"
                type="submit"
                variant="outline"
              >
                Move up
              </Button>
            </Form>
            <Form method="post">
              <MutationFields
                action="reorder_exercise"
                exerciseId={exercise.id}
                workoutId={workout.id}
                workoutVersion={workout.version}
              />
              <input
                name="targetIndex"
                type="hidden"
                value={Math.min(exerciseCount - 1, exerciseIndex + 1)}
              />
              <Button
                disabled={exerciseIndex === exerciseCount - 1}
                size="sm"
                type="submit"
                variant="outline"
              >
                Move down
              </Button>
            </Form>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {canUpdateExerciseNotes ? (
          <Form className="grid gap-3" method="post">
            <MutationFields
              action="update_exercise_notes"
              exerciseId={exercise.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-medium text-sm">User notes</span>
                <textarea
                  className={TEXTAREA_CLASSNAME}
                  defaultValue={exercise.userNotes ?? ""}
                  name="userNotes"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-sm">Coach notes</span>
                <textarea
                  className={TEXTAREA_CLASSNAME}
                  defaultValue={exercise.coachNotes ?? ""}
                  name="coachNotes"
                />
              </label>
            </div>
            <div>
              <Button size="sm" type="submit" variant="outline">
                Save exercise notes
              </Button>
            </div>
          </Form>
        ) : null}

        <div className="grid gap-3">
          {exercise.sets.map((set) => (
            <SetCard
              availableActions={availableActions}
              exerciseId={exercise.id}
              key={set.id}
              set={set}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
          ))}
        </div>

        {canAddSet ? (
          <Form
            className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/80 border-dashed bg-background/50 p-4"
            method="post"
          >
            <MutationFields
              action="add_set"
              exerciseId={exercise.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <input
              name="insertAfterSetId"
              type="hidden"
              value={exercise.sets.at(-1)?.id ?? ""}
            />
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs">
                Planned weight
              </span>
              <input
                className={INPUT_CLASSNAME}
                name="weightLbs"
                placeholder="Weight"
                step="0.5"
                type="number"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs">
                Planned reps
              </span>
              <input
                className={INPUT_CLASSNAME}
                name="reps"
                placeholder="Reps"
                step="1"
                type="number"
              />
            </label>
            <Button size="sm" type="submit" variant="outline">
              Add set
            </Button>
          </Form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function WorkoutDetailView({
  actionData,
  loaderData,
}: WorkoutDetailViewProps) {
  usePublishAppEvent(actionData);

  const availableActions = getAvailableActions(loaderData.workout.status);
  const agentTargetPath = getAgentTargetPath(loaderData);

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
                <Badge variant="secondary">{loaderData.workout.source}</Badge>
                <Badge variant="outline">v{loaderData.workout.version}</Badge>
              </div>
              <div>
                <CardTitle>{loaderData.workout.title}</CardTitle>
                <CardDescription>
                  {new Date(loaderData.workout.date).toLocaleDateString()} ·{" "}
                  {loaderData.progress.done} / {loaderData.progress.total} sets
                  confirmed
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
              {hasAction(availableActions, "finish_workout") ? (
                <Form method="post">
                  <MutationFields
                    action="finish_workout"
                    workoutId={loaderData.workout.id}
                    workoutVersion={loaderData.workout.version}
                  />
                  <Button size="sm" type="submit" variant="secondary">
                    Finish workout
                  </Button>
                </Form>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>Workout Notes</CardTitle>
            <CardDescription>
              This posts through the same mutation contract as future D1-backed
              routes.
            </CardDescription>
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
          {loaderData.exercises.map((exercise, exerciseIndex) => (
            <ExerciseCard
              availableActions={availableActions}
              exercise={exercise}
              exerciseCount={loaderData.exercises.length}
              exerciseIndex={exerciseIndex}
              key={exercise.id}
              workout={loaderData.workout}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>Live Invalidation</CardTitle>
            <CardDescription>
              This screen publishes mutation results as app events, and the root
              hook revalidates mounted routes when their handle keys intersect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>Agent target: {agentTargetPath}</p>
            <p>Available actions: {availableActions.join(", ")}</p>
            <p>
              Progress breakdown: {loaderData.progress.tbd} tbd /{" "}
              {loaderData.progress.done} done / {loaderData.progress.skipped}{" "}
              skipped
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>Why This Slice Exists</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              The route loader/action shapes now match the shared contracts,
              which lets fixture UI and future D1 plumbing evolve against the
              same boundary.
            </p>
            <p>
              The detail route does not directly patch client state from the
              action result. It republishes an app event and lets RR7 loader
              revalidation refresh the authoritative data.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
