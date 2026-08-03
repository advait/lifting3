import * as Schema from "effect/Schema";

import type { CommittedDurableEvent } from "effect-durable-agent/services/session-store";
import { EDAReducer } from "effect-durable-agent/services/reducer-registry";
import { turnCompletedEventType } from "effect-durable-agent/types/events";
import {
  WorkoutActionRecord,
  WorkoutSetActionSnapshot,
  type WorkoutActionRecord as WorkoutActionRecordValue,
  type WorkoutSetActionSnapshot as WorkoutSetActionSnapshotValue,
} from "~/features/workouts/events";
import {
  CoachConversationStartedPayload,
  coachConversationStartedEventType,
  coachEventNamespace,
  workoutActionCommittedEventType,
} from "./events";

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const WorkoutActivityEntry = Schema.Struct({
  record: WorkoutActionRecord,
  seq: NonNegativeInt,
});
type WorkoutActivityEntry = typeof WorkoutActivityEntry.Type;

export interface WorkoutActivityState {
  readonly conversationStartedSeq: number;
  readonly effectiveSets: ReadonlyArray<WorkoutSetActionSnapshotValue>;
  readonly entries: ReadonlyArray<WorkoutActivityEntry>;
  readonly lastCoachTurnCompletedSeq: number;
  readonly version: number;
  readonly workoutId: string | null;
}

const WorkoutActivityStateSchema = Schema.Struct({
  conversationStartedSeq: NonNegativeInt,
  effectiveSets: Schema.Array(WorkoutSetActionSnapshot),
  entries: Schema.Array(WorkoutActivityEntry),
  lastCoachTurnCompletedSeq: NonNegativeInt,
  version: NonNegativeInt,
  workoutId: Schema.NullOr(Schema.String),
});

export const initialWorkoutActivityState: WorkoutActivityState = {
  conversationStartedSeq: 0,
  effectiveSets: [],
  entries: [],
  lastCoachTurnCompletedSeq: 0,
  version: 0,
  workoutId: null,
};

export const WORKOUT_ACTIVITY_REDUCER_NAME = "lifting3.workout.activity";

/** Projects semantic workout facts into correction-aware coach observation state. */
export const workoutActivityReducer = EDAReducer.make<WorkoutActivityState>({
  initial: initialWorkoutActivityState,
  name: WORKOUT_ACTIVITY_REDUCER_NAME,
  stateSchema: WorkoutActivityStateSchema,
  reduce: (state, entry) => reduceWorkoutActivityState(state, entry),
});

const upsertEffectiveSet = (
  sets: ReadonlyArray<WorkoutSetActionSnapshotValue>,
  next: WorkoutSetActionSnapshotValue,
): ReadonlyArray<WorkoutSetActionSnapshotValue> => {
  const index = sets.findIndex((set) => set.setId === next.setId);
  if (index < 0) {
    return [...sets, next];
  }
  return sets.map((set, setIndex) => (setIndex === index ? next : set));
};

const applyWorkoutAction = (
  state: WorkoutActivityState,
  record: WorkoutActionRecordValue,
  seq: number,
): WorkoutActivityState => {
  const action = record.action;
  const effectiveSets =
    action.kind === "set_logged" || action.kind === "set_corrected"
      ? upsertEffectiveSet(state.effectiveSets, action.set)
      : action.kind === "set_log_reverted"
        ? state.effectiveSets.filter((set) => set.setId !== action.set.setId)
        : state.effectiveSets;

  return {
    ...state,
    effectiveSets,
    entries: [...state.entries, { record, seq }],
    version: Math.max(state.version, record.version),
    workoutId: state.workoutId ?? record.workoutId,
  };
};

export const reduceWorkoutActivityState = (
  state: WorkoutActivityState,
  entry: CommittedDurableEvent,
): WorkoutActivityState => {
  const { event } = entry;
  const seq = Number(entry.position.seq);

  if (event.type === turnCompletedEventType) {
    return { ...state, lastCoachTurnCompletedSeq: seq };
  }

  if (event.namespace !== coachEventNamespace) {
    return state;
  }

  if (
    event.type === coachConversationStartedEventType &&
    Schema.is(CoachConversationStartedPayload)(event.payload)
  ) {
    return { ...state, conversationStartedSeq: seq };
  }

  if (
    event.type === workoutActionCommittedEventType &&
    Schema.is(WorkoutActionRecord)(event.payload)
  ) {
    return applyWorkoutAction(state, event.payload, seq);
  }

  return state;
};

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const setPerformanceKey = (set: WorkoutSetActionSnapshotValue): string =>
  [set.exerciseId, set.actual.weightLbs, set.reps, set.actual.rpe].join(":");

const formatSetPerformance = (set: WorkoutSetActionSnapshotValue, count: number): string => {
  const load =
    set.actual.weightLbs === null ? "bodyweight" : `${formatNumber(set.actual.weightLbs)} lb`;
  const reps =
    set.reps === null ? "unrecorded reps" : `${set.reps} rep${set.reps === 1 ? "" : "s"}`;
  const rpe = set.actual.rpe === null ? "" : ` @ RPE ${formatNumber(set.actual.rpe)}`;
  return `${count}× ${load} × ${reps}${rpe}`;
};

/** Deterministically summarize effective logged sets for UI and LLM context. */
export const formatWorkoutActivitySummary = (
  state: WorkoutActivityState,
  options: { readonly afterSeq?: number } = {},
): string => {
  const afterSeq = options.afterSeq;
  const allowedSetIds =
    afterSeq === undefined
      ? null
      : new Set(
          state.entries
            .filter((entry) => entry.seq > afterSeq)
            .flatMap((entry) => {
              const { action } = entry.record;
              return action.kind === "set_logged" || action.kind === "set_corrected"
                ? [action.set.setId]
                : [];
            }),
        );
  const sets = state.effectiveSets.filter(
    (set) => allowedSetIds === null || allowedSetIds.has(set.setId),
  );
  if (sets.length === 0) {
    return "";
  }

  const byExercise = new Map<string, WorkoutSetActionSnapshotValue[]>();
  for (const set of sets) {
    const exerciseSets = byExercise.get(set.exerciseName) ?? [];
    exerciseSets.push(set);
    byExercise.set(set.exerciseName, exerciseSets);
  }

  const lines: string[] = [];
  for (const [exerciseName, exerciseSets] of byExercise) {
    const groups = new Map<string, { count: number; set: WorkoutSetActionSnapshotValue }>();
    for (const set of [...exerciseSets].sort((left, right) => left.orderIndex - right.orderIndex)) {
      const key = setPerformanceKey(set);
      const group = groups.get(key);
      groups.set(
        key,
        group === undefined ? { count: 1, set } : { ...group, count: group.count + 1 },
      );
    }
    lines.push(
      `${exerciseName}: ${[...groups.values()]
        .map((group) => formatSetPerformance(group.set, group.count))
        .join("; ")}`,
    );
  }

  return lines.join("\n");
};
