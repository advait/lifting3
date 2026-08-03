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
import {
  WorkoutActionRecord,
  type WorkoutActionRecord as WorkoutActionRecordValue,
} from "~/features/workouts/events";

export const coachEventNamespace = EventNamespace.make("lifting3.coach");
export const coachThreadAttachedEventType = makeEventType("CoachThreadAttached");
export const workoutActionCommittedEventType = makeEventType("WorkoutActionCommitted");
export const coachConversationStartedEventType = makeEventType("CoachConversationStarted");

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

export const WorkoutActionCommittedEvent = Schema.Struct({
  ...DurableEventEnvelope.fields,
  namespace: Schema.Literal(coachEventNamespace),
  type: Schema.Literal(workoutActionCommittedEventType),
  schemaVersion: Schema.Literal(schemaV1),
  payload: WorkoutActionRecord,
});
export type WorkoutActionCommittedEvent = typeof WorkoutActionCommittedEvent.Type;

export const CoachConversationStartedPayload = Schema.Struct({
  reason: Schema.Literal("user-requested"),
});
export type CoachConversationStartedPayload = typeof CoachConversationStartedPayload.Type;

export const CoachConversationStartedEvent = Schema.Struct({
  ...DurableEventEnvelope.fields,
  namespace: Schema.Literal(coachEventNamespace),
  type: Schema.Literal(coachConversationStartedEventType),
  schemaVersion: Schema.Literal(schemaV1),
  payload: CoachConversationStartedPayload,
});
export type CoachConversationStartedEvent = typeof CoachConversationStartedEvent.Type;

export const CoachDurableEvent = Schema.Union([
  CoachThreadAttachedEvent,
  WorkoutActionCommittedEvent,
  CoachConversationStartedEvent,
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

export const makeWorkoutActionCommittedEvent = (input: {
  readonly action: WorkoutActionRecordValue;
  readonly sessionId: SessionId;
}): WorkoutActionCommittedEvent =>
  WorkoutActionCommittedEvent.make({
    createdAtMs: UnixEpochMillis.make(Date.parse(input.action.occurredAt)),
    durability: "durable",
    eventId: EventId.make(input.action.eventId),
    namespace: coachEventNamespace,
    payload: input.action,
    schemaVersion: schemaV1,
    sessionId: input.sessionId,
    trace: makeRootEDAEventTrace(),
    type: workoutActionCommittedEventType,
  });

export const makeCoachConversationStartedEvent = (input: {
  readonly eventId: EventId;
  readonly sessionId: SessionId;
}): CoachConversationStartedEvent =>
  CoachConversationStartedEvent.make({
    createdAtMs: UnixEpochMillis.make(Date.now()),
    durability: "durable",
    eventId: input.eventId,
    namespace: coachEventNamespace,
    payload: CoachConversationStartedPayload.make({ reason: "user-requested" }),
    schemaVersion: schemaV1,
    sessionId: input.sessionId,
    trace: makeRootEDAEventTrace(),
    type: coachConversationStartedEventType,
  });
