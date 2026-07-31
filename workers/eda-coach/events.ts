import * as Schema from "effect/Schema";

import { EventId, SessionId } from "effect-durable-agent/types/core";
import {
  DurableEventEnvelope,
  EventNamespace,
  UnixEpochMillis,
  makeEventType,
  makeRootEDAEventTrace,
  schemaV1,
} from "effect-durable-agent/types/events";

export const coachEventNamespace = EventNamespace.make("lifting3.coach");
export const coachThreadAttachedEventType = makeEventType("CoachThreadAttached");
export const workoutMutationCommittedEventType = makeEventType("WorkoutMutationCommitted");

export const CoachTargetEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("general") }),
  Schema.Struct({ kind: Schema.Literal("workout"), workoutId: Schema.NonEmptyString }),
]);
export type CoachTargetEvent = typeof CoachTargetEvent.Type;

export const CoachThreadAttachedPayload = Schema.Struct({ target: CoachTargetEvent });
export type CoachThreadAttachedPayload = typeof CoachThreadAttachedPayload.Type;

export const CoachThreadAttachedEvent = Schema.Struct({
  ...DurableEventEnvelope.fields,
  namespace: Schema.Literal(coachEventNamespace),
  type: Schema.Literal(coachThreadAttachedEventType),
  schemaVersion: Schema.Literal(schemaV1),
  payload: CoachThreadAttachedPayload,
});
export type CoachThreadAttachedEvent = typeof CoachThreadAttachedEvent.Type;

export const WorkoutMutationCommittedPayload = Schema.Struct({
  eventId: Schema.NonEmptyString,
  invalidate: Schema.NonEmptyArray(Schema.NonEmptyString),
  type: Schema.Literals(["workout_created", "workout_updated"]),
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  workoutId: Schema.NonEmptyString,
});
export type WorkoutMutationCommittedPayload = typeof WorkoutMutationCommittedPayload.Type;

export const WorkoutMutationCommittedEvent = Schema.Struct({
  ...DurableEventEnvelope.fields,
  namespace: Schema.Literal(coachEventNamespace),
  type: Schema.Literal(workoutMutationCommittedEventType),
  schemaVersion: Schema.Literal(schemaV1),
  payload: WorkoutMutationCommittedPayload,
});
export type WorkoutMutationCommittedEvent = typeof WorkoutMutationCommittedEvent.Type;

export const CoachDurableEvent = Schema.Union([
  CoachThreadAttachedEvent,
  WorkoutMutationCommittedEvent,
]);
export type CoachDurableEvent = typeof CoachDurableEvent.Type;

const THREAD_ATTACHED_EVENT_ID = EventId.make("00000000-0000-7000-8000-000000000001");

export const makeCoachThreadAttachedEvent = (input: {
  readonly sessionId: SessionId;
  readonly target: CoachTargetEvent;
}): CoachThreadAttachedEvent =>
  CoachThreadAttachedEvent.make({
    createdAtMs: UnixEpochMillis.make(Date.now()),
    durability: "durable",
    eventId: THREAD_ATTACHED_EVENT_ID,
    namespace: coachEventNamespace,
    payload: CoachThreadAttachedPayload.make({ target: input.target }),
    schemaVersion: schemaV1,
    sessionId: input.sessionId,
    trace: makeRootEDAEventTrace(),
    type: coachThreadAttachedEventType,
  });

export const makeWorkoutMutationCommittedEvent = (input: {
  readonly eventId: EventId;
  readonly invalidate: readonly string[];
  readonly mutationType: "workout_created" | "workout_updated";
  readonly sessionId: SessionId;
  readonly version: number;
  readonly workoutId: string;
}): WorkoutMutationCommittedEvent => {
  const appEventId = String(input.eventId);
  const [firstInvalidateKey, ...remainingInvalidateKeys] = input.invalidate;
  if (firstInvalidateKey === undefined) {
    throw new Error("Workout mutation events require at least one invalidation key.");
  }

  return WorkoutMutationCommittedEvent.make({
    createdAtMs: UnixEpochMillis.make(Date.now()),
    durability: "durable",
    eventId: input.eventId,
    namespace: coachEventNamespace,
    payload: WorkoutMutationCommittedPayload.make({
      eventId: appEventId,
      invalidate: [firstInvalidateKey, ...remainingInvalidateKeys],
      type: input.mutationType,
      version: input.version,
      workoutId: input.workoutId,
    }),
    schemaVersion: schemaV1,
    sessionId: input.sessionId,
    trace: makeRootEDAEventTrace(),
    type: workoutMutationCommittedEventType,
  });
};
