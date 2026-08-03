import { describe, expect, it } from "vite-plus/test";

import type { CommittedDurableEvent } from "effect-durable-agent/services/session-store";
import {
  EventId,
  SequenceNumber,
  SessionId,
  durablePosition,
} from "effect-durable-agent/types/core";

import type { WorkoutActionRecord } from "../../app/features/workouts/events";
import {
  makeCoachConversationStartedEvent,
  makeWorkoutActionCommittedEvent,
} from "../../workers/eda-coach/events";
import {
  formatWorkoutActivitySummary,
  initialWorkoutActivityState,
  reduceWorkoutActivityState,
} from "../../workers/eda-coach/workout-activity-reducer";

const SESSION_ID = SessionId.make("d167b776-9181-57ab-bf4f-f0ddf8e85b27");

const record = (
  eventId: string,
  kind: "set_corrected" | "set_log_reverted" | "set_logged",
  setId: string,
  weightLbs: number,
  reps: number,
  rpe: number,
): WorkoutActionRecord => ({
  action: {
    kind,
    set: {
      actual: { rpe, weightLbs },
      confirmedAt: "2026-08-03T10:00:00.000Z",
      designation: "working",
      exerciseId: "exercise-1",
      exerciseName: "Deadlift",
      orderIndex: Number(setId.at(-1)) - 1,
      planned: { rpe: 7, weightLbs: 115 },
      reps,
      setId,
    },
  },
  actor: "user",
  eventId,
  occurredAt: "2026-08-03T10:00:00.000Z",
  source: "workout-ui",
  version: 1,
  workoutId: "workout-1",
});

const committed = (seq: number, action: WorkoutActionRecord): CommittedDurableEvent => ({
  event: makeWorkoutActionCommittedEvent({ action, sessionId: SESSION_ID }),
  position: durablePosition(SequenceNumber.make(seq)),
});

describe("workout activity reducer", () => {
  it("groups identical logged sets into concise LLM context", () => {
    const first = reduceWorkoutActivityState(
      initialWorkoutActivityState,
      committed(
        1,
        record("0198c900-0000-7000-8000-000000000001", "set_logged", "set-1", 115, 5, 7),
      ),
    );
    const second = reduceWorkoutActivityState(
      first,
      committed(
        2,
        record("0198c900-0000-7000-8000-000000000002", "set_logged", "set-2", 115, 5, 7),
      ),
    );

    expect(formatWorkoutActivitySummary(second)).toBe("Deadlift: 2× 115 lb × 5 reps @ RPE 7");
  });

  it("projects corrections and reversions without retaining stale set facts", () => {
    const logged = reduceWorkoutActivityState(
      initialWorkoutActivityState,
      committed(
        1,
        record("0198c900-0000-7000-8000-000000000011", "set_logged", "set-1", 115, 5, 7),
      ),
    );
    const corrected = reduceWorkoutActivityState(
      logged,
      committed(
        2,
        record("0198c900-0000-7000-8000-000000000012", "set_corrected", "set-1", 135, 3, 8),
      ),
    );

    expect(formatWorkoutActivitySummary(corrected)).toBe("Deadlift: 1× 135 lb × 3 reps @ RPE 8");

    const reverted = reduceWorkoutActivityState(
      corrected,
      committed(
        3,
        record("0198c900-0000-7000-8000-000000000013", "set_log_reverted", "set-1", 135, 3, 8),
      ),
    );
    expect(formatWorkoutActivitySummary(reverted)).toBe("");
  });

  it("records a new-conversation cursor without discarding workout history", () => {
    const logged = reduceWorkoutActivityState(
      initialWorkoutActivityState,
      committed(
        1,
        record("0198c900-0000-7000-8000-000000000021", "set_logged", "set-1", 115, 5, 7),
      ),
    );
    const boundary: CommittedDurableEvent = {
      event: makeCoachConversationStartedEvent({
        eventId: EventId.make("0198c900-0000-7000-8000-000000000022"),
        sessionId: SESSION_ID,
      }),
      position: durablePosition(SequenceNumber.make(2)),
    };
    const reset = reduceWorkoutActivityState(logged, boundary);

    expect(reset.conversationStartedSeq).toBe(2);
    expect(reset.effectiveSets).toEqual(logged.effectiveSets);
    expect(reset.entries).toEqual(logged.entries);
  });
});
