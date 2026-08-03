import { describe, expect, it } from "vite-plus/test";

import type { CommittedDurableEvent } from "effect-durable-agent/services/session-store";
import { SequenceNumber, SessionId, durablePosition } from "effect-durable-agent/types/core";

import { makeCoachThreadAttachedEvent } from "../../workers/eda-coach/events";
import { initialCoachThreadState, reduceCoachThreadState } from "../../workers/eda-coach/reducer";

const SESSION_ID = SessionId.make("d167b776-9181-57ab-bf4f-f0ddf8e85b27");

const attached = (
  seq: number,
  target: { readonly kind: "general" } | { readonly kind: "workout"; readonly workoutId: string },
): CommittedDurableEvent => ({
  event: makeCoachThreadAttachedEvent({ sessionId: SESSION_ID, target }),
  position: durablePosition(SequenceNumber.make(seq)),
});

describe("EDA coach thread reducer", () => {
  it("durably binds and idempotently replays a thread target", () => {
    const bound = reduceCoachThreadState(
      initialCoachThreadState,
      attached(1, { kind: "workout", workoutId: "workout-1" }),
    );

    expect(bound.target).toEqual({ kind: "workout", workoutId: "workout-1" });
    expect(
      reduceCoachThreadState(bound, attached(1, { kind: "workout", workoutId: "workout-1" })),
    ).toEqual(bound);
  });

  it("rejects rebinding an EDA session to another product thread", () => {
    const bound = reduceCoachThreadState(initialCoachThreadState, attached(1, { kind: "general" }));

    expect(() =>
      reduceCoachThreadState(bound, attached(2, { kind: "workout", workoutId: "workout-1" })),
    ).toThrow("cannot be rebound");
  });
});
