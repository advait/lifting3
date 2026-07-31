import { describe, expect, it } from "vite-plus/test";

import { durableMessageTranscript } from "effect-durable-agent/domain/message-transcript";
import { foldReducedState, initialReducedState } from "effect-durable-agent/domain/reduced-state";
import {
  DurableSubSequenceNumber,
  SequenceNumber,
  SessionId,
} from "effect-durable-agent/types/core";

import {
  deterministicMigrationUuidV7,
  planLegacyCoachMigration,
  verifyLegacyCoachMigration,
} from "../../scripts/legacy-coach-migration";

const SESSION_ID = SessionId.make("d167b776-9181-57ab-bf4f-f0ddf8e85b27");

const migratedSnapshot = async () => {
  const plan = await planLegacyCoachMigration({
    legacyMessages: [
      { id: "legacy-user", parts: [{ text: "Add a back-off set", type: "text" }], role: "user" },
      {
        id: "legacy-assistant",
        parts: [
          { text: "I updated it.", type: "text" },
          {
            input: { workoutId: "workout-1" },
            output: { ok: true, version: 2 },
            state: "output-available",
            toolCallId: "provider-call-1",
            type: "tool-patch_workout",
          },
        ],
        role: "assistant",
      },
    ],
    sessionId: SESSION_ID,
    threadName: "workout:workout-1",
  });
  const committed = plan.events.map((event, index) => ({
    event,
    position: {
      seq: SequenceNumber.make(index + 1),
      subSeq: DurableSubSequenceNumber.make(0),
    },
  }));
  const state = foldReducedState(initialReducedState, committed);
  return {
    plan,
    snapshot: { messages: durableMessageTranscript(state), reducerStates: new Map(), state },
  };
};

describe("legacy coach session migration", () => {
  it("converts text and completed tools into an exactly verifiable EDA transcript", async () => {
    const { plan, snapshot } = await migratedSnapshot();

    expect(plan.legacyMessageCount).toBe(2);
    expect(plan.expectedToolCalls).toHaveLength(1);
    expect(plan.events.map(({ type }) => type)).toEqual([
      "UserMessageCommitted",
      "AssistantMessageCommitted",
      "ToolCallCreated",
      "ToolCallCompleted",
    ]);
    expect(verifyLegacyCoachMigration(plan, snapshot)).toEqual([]);
  });

  it("uses deterministic UUIDv7 identities so a retry cannot duplicate imported events", async () => {
    const first = await deterministicMigrationUuidV7("general:message:1");
    const second = await deterministicMigrationUuidV7("general:message:1");

    expect(first).toBe(second);
    expect(first[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(first[19]);
  });

  it("fails closed for an unfinished legacy tool call", async () => {
    await expect(
      planLegacyCoachMigration({
        legacyMessages: [
          {
            id: "legacy-assistant",
            parts: [
              {
                input: { workoutId: "workout-1" },
                state: "input-available",
                toolCallId: "provider-call-1",
                type: "tool-patch_workout",
              },
            ],
            role: "assistant",
          },
        ],
        sessionId: SESSION_ID,
        threadName: "workout:workout-1",
      }),
    ).rejects.toThrow("refusing a lossy migration");
  });

  it("detects destination transcript mismatches before deletion", async () => {
    const { plan, snapshot } = await migratedSnapshot();
    const mismatchedSnapshot = { ...snapshot, messages: snapshot.messages.slice(0, 1) };

    expect(verifyLegacyCoachMigration(plan, mismatchedSnapshot)).toContain(
      "Expected 2 transcript messages, found 1.",
    );
  });
});
