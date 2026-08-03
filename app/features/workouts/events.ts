import * as Schema from "effect/Schema";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));

export const WorkoutActionActor = Schema.Literals(["user", "coach"]);
export type WorkoutActionActor = typeof WorkoutActionActor.Type;

export const WorkoutActionSource = Schema.Literals(["workout-ui", "coach-tool"]);
export type WorkoutActionSource = typeof WorkoutActionSource.Type;

export const WorkoutSetLoad = Schema.Struct({
  rpe: Schema.NullOr(NonNegativeNumber),
  weightLbs: Schema.NullOr(NonNegativeNumber),
});
export type WorkoutSetLoad = typeof WorkoutSetLoad.Type;

export const WorkoutSetActionSnapshot = Schema.Struct({
  actual: WorkoutSetLoad,
  confirmedAt: Schema.NullOr(NonEmptyString),
  designation: NonEmptyString,
  exerciseId: NonEmptyString,
  exerciseName: NonEmptyString,
  orderIndex: NonNegativeInt,
  planned: WorkoutSetLoad,
  reps: Schema.NullOr(NonNegativeInt),
  setId: NonEmptyString,
});
export type WorkoutSetActionSnapshot = typeof WorkoutSetActionSnapshot.Type;

const WorkoutStartedAction = Schema.Struct({
  kind: Schema.Literal("workout_started"),
  startedAt: NonEmptyString,
  title: NonEmptyString,
});

const SetLoggedAction = Schema.Struct({
  kind: Schema.Literal("set_logged"),
  set: WorkoutSetActionSnapshot,
});

const SetCorrectedAction = Schema.Struct({
  kind: Schema.Literal("set_corrected"),
  set: WorkoutSetActionSnapshot,
});

const SetLogRevertedAction = Schema.Struct({
  kind: Schema.Literal("set_log_reverted"),
  set: WorkoutSetActionSnapshot,
});

const WorkoutPlanAdjustedAction = Schema.Struct({
  exerciseId: Schema.optionalKey(NonEmptyString),
  kind: Schema.Literal("workout_plan_adjusted"),
  operation: NonEmptyString,
  setId: Schema.optionalKey(NonEmptyString),
  summary: NonEmptyString,
});

const WorkoutNoteChangedAction = Schema.Struct({
  coachNotes: Schema.NullOr(NonEmptyString),
  kind: Schema.Literal("workout_note_changed"),
  userNotes: Schema.NullOr(NonEmptyString),
});

const ExerciseNoteChangedAction = Schema.Struct({
  coachNotes: Schema.NullOr(NonEmptyString),
  exerciseId: NonEmptyString,
  exerciseName: NonEmptyString,
  kind: Schema.Literal("exercise_note_changed"),
  userNotes: Schema.NullOr(NonEmptyString),
});

const WorkoutCompletedAction = Schema.Struct({
  completedAt: NonEmptyString,
  kind: Schema.Literal("workout_completed"),
  title: NonEmptyString,
});

const WorkoutDeletedAction = Schema.Struct({
  kind: Schema.Literal("workout_deleted"),
  title: NonEmptyString,
});

const WorkoutCreatedAction = Schema.Struct({
  exerciseCount: NonNegativeInt,
  kind: Schema.Literal("workout_created"),
  title: NonEmptyString,
});

/** Semantic workout facts that are useful to UI, coach context, replay, and audit. */
export const WorkoutAction = Schema.Union([
  WorkoutStartedAction,
  SetLoggedAction,
  SetCorrectedAction,
  SetLogRevertedAction,
  WorkoutPlanAdjustedAction,
  WorkoutNoteChangedAction,
  ExerciseNoteChangedAction,
  WorkoutCompletedAction,
  WorkoutDeletedAction,
  WorkoutCreatedAction,
]);
export type WorkoutAction = typeof WorkoutAction.Type;

/** Durable application record written atomically beside the authoritative D1 mutation. */
export const WorkoutActionRecord = Schema.Struct({
  action: WorkoutAction,
  actor: WorkoutActionActor,
  eventId: NonEmptyString,
  occurredAt: NonEmptyString,
  source: WorkoutActionSource,
  version: NonNegativeInt,
  workoutId: NonEmptyString,
});
export type WorkoutActionRecord = typeof WorkoutActionRecord.Type;

export const decodeWorkoutActionRecord = Schema.decodeUnknownSync(WorkoutActionRecord);
export const encodeWorkoutActionRecord = Schema.encodeSync(WorkoutActionRecord);

export const isWorkoutPerformanceAction = (
  action: WorkoutAction,
): action is Extract<
  WorkoutAction,
  { readonly kind: "set_corrected" | "set_log_reverted" | "set_logged" }
> =>
  action.kind === "set_logged" ||
  action.kind === "set_corrected" ||
  action.kind === "set_log_reverted";

const formatActionNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatActionSet = (set: WorkoutSetActionSnapshot): string => {
  const load =
    set.actual.weightLbs === null ? "bodyweight" : `${formatActionNumber(set.actual.weightLbs)} lb`;
  const reps = set.reps === null ? "unrecorded reps" : `${set.reps}`;
  const rpe = set.actual.rpe === null ? "" : ` @ RPE ${formatActionNumber(set.actual.rpe)}`;
  return `${set.exerciseName} — ${load} × ${reps}${rpe}`;
};

/** Human-facing summary derived from the same semantic fact the coach receives. */
export const formatWorkoutActionSummary = (record: WorkoutActionRecord): string => {
  const { action } = record;
  switch (action.kind) {
    case "set_logged":
      return `Logged ${formatActionSet(action.set)}`;
    case "set_corrected":
      return `Corrected ${formatActionSet(action.set)}`;
    case "set_log_reverted":
      return `Unconfirmed ${action.set.exerciseName} set ${action.set.orderIndex + 1}`;
    case "workout_started":
      return `Started ${action.title}`;
    case "workout_completed":
      return `Completed ${action.title}`;
    case "workout_deleted":
      return `Deleted ${action.title}`;
    case "workout_created":
      return `Created ${action.title} with ${action.exerciseCount} exercise${action.exerciseCount === 1 ? "" : "s"}`;
    case "workout_note_changed":
      return "Updated workout notes";
    case "exercise_note_changed":
      return `Updated notes for ${action.exerciseName}`;
    case "workout_plan_adjusted":
      return action.summary;
  }
};
