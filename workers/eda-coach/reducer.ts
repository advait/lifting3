import * as Schema from "effect/Schema";

import type { CommittedDurableEvent } from "effect-durable-agent/services/session-store";
import { EDAReducer } from "effect-durable-agent/services/reducer-registry";

import {
  CoachTargetEvent,
  CoachThreadAttachedPayload,
  coachEventNamespace,
  coachThreadAttachedEventType,
} from "./events";

export interface CoachThreadState {
  readonly target: CoachTargetEvent | null;
}

export const COACH_THREAD_REDUCER_NAME = "lifting3.coach.thread";

const CoachThreadStateSchema = Schema.Struct({
  target: Schema.NullOr(CoachTargetEvent),
});

export const initialCoachThreadState: CoachThreadState = { target: null };

const coachTargetsMatch = (left: CoachTargetEvent, right: CoachTargetEvent): boolean =>
  left.kind === right.kind &&
  (left.kind === "general" || (right.kind === "workout" && left.workoutId === right.workoutId));

export const coachThreadReducer = EDAReducer.make<CoachThreadState>({
  initial: initialCoachThreadState,
  name: COACH_THREAD_REDUCER_NAME,
  stateSchema: CoachThreadStateSchema,
  reduce: (state, entry) => reduceCoachThreadState(state, entry),
});

export const reduceCoachThreadState = (
  state: CoachThreadState,
  entry: CommittedDurableEvent,
): CoachThreadState => {
  const { event } = entry;

  if (
    event.namespace !== coachEventNamespace ||
    event.type !== coachThreadAttachedEventType ||
    !Schema.is(CoachThreadAttachedPayload)(event.payload)
  ) {
    return state;
  }

  if (state.target !== null && !coachTargetsMatch(state.target, event.payload.target)) {
    throw new Error("An EDA coach session cannot be rebound to a different workout thread.");
  }

  return { target: event.payload.target };
};
