import { describe, expect, it } from "vite-plus/test";

import {
  applyEdaCoachEvents,
  createEdaCoachProjectionState,
  hydrateEdaCoachProjection,
  projectEdaCoachMessages,
  type CoachPositionedEvent,
} from "../../app/features/coach/eda-projection";

const positioned = (
  seq: number,
  type: string,
  payload: unknown,
  durability: "durable" | "ephemeral" = "durable",
): CoachPositionedEvent => ({
  event: { durability, payload, type },
  position: { seq },
});

describe("EDA coach panel projection", () => {
  it("projects replayable messages and live tool progress from EDA events", () => {
    const state = applyEdaCoachEvents(createEdaCoachProjectionState(), [
      positioned(1, "UserMessageSubmitted", {
        content: [{ text: "Add a back-off set", type: "text" }],
        messageId: "message-user",
      }),
      positioned(2, "RunStarted", { runId: "run-1" }),
      positioned(3, "InferenceStarted", { inferenceId: "inference-1" }),
      positioned(3, "TextDelta", { delta: "Updating", providerPartId: "part-1" }, "ephemeral"),
      positioned(4, "ToolCallCreated", {
        inferenceId: "inference-1",
        promptPart: {
          id: "tool-1",
          name: "patch_workout",
          params: { workoutId: "workout-1" },
          type: "tool-call",
        },
        toolCallId: "tool-1",
      }),
      positioned(5, "ToolCallStarted", { toolCallId: "tool-1" }),
      positioned(6, "ToolCallCompleted", {
        promptPart: {
          id: "tool-1",
          isFailure: false,
          name: "patch_workout",
          result: { ok: true, workoutId: "workout-1" },
          type: "tool-result",
        },
        toolCallId: "tool-1",
      }),
      positioned(7, "AssistantMessageCommitted", {
        inferenceId: "inference-1",
        messageId: "message-assistant",
        promptParts: [{ text: "I added the back-off set.", type: "text" }],
      }),
      positioned(8, "RunCompleted", { runId: "run-1" }),
    ]);

    expect(state.activeRunIds.size).toBe(0);
    expect(state.lastSeq).toBe(8);
    expect(projectEdaCoachMessages(state)).toEqual([
      expect.objectContaining({
        id: "message-user",
        parts: [{ text: "Add a back-off set", type: "text" }],
        role: "user",
      }),
      expect.objectContaining({
        id: "message-assistant",
        parts: [
          { text: "I added the back-off set.", type: "text" },
          expect.objectContaining({
            output: { ok: true, workoutId: "workout-1" },
            state: "complete",
            toolCallId: "tool-1",
            toolName: "patch_workout",
            type: "tool",
          }),
        ],
        role: "assistant",
      }),
    ]);
  });

  it("surfaces tool failures without leaving the thread busy", () => {
    const state = applyEdaCoachEvents(createEdaCoachProjectionState(), [
      positioned(1, "RunStarted", { runId: "run-1" }),
      positioned(2, "InferenceStarted", { inferenceId: "inference-1" }),
      positioned(3, "ToolCallCreated", {
        inferenceId: "inference-1",
        promptPart: { name: "query_history", params: {}, type: "tool-call" },
        toolCallId: "tool-1",
      }),
      positioned(4, "ToolCallFailed", {
        error: { code: "tool.failed", message: "D1 is unavailable" },
        promptPart: { result: { code: "tool.failed", message: "D1 is unavailable" } },
        toolCallId: "tool-1",
      }),
      positioned(5, "RunFailed", {
        error: { code: "run.failed", message: "The coach turn failed" },
        runId: "run-1",
      }),
    ]);

    expect(state.activeRunIds.size).toBe(0);
    expect(state.error).toBe("The coach turn failed");
    expect(state.tools.get("tool-1")).toEqual(
      expect.objectContaining({ error: "D1 is unavailable", state: "error" }),
    );
  });

  it("preserves workout truth while a durable conversation boundary clears chat state", () => {
    const record = {
      action: {
        kind: "set_logged" as const,
        set: {
          actual: { rpe: 7, weightLbs: 115 },
          confirmedAt: "2026-08-03T10:00:00.000Z",
          designation: "working",
          exerciseId: "exercise-1",
          exerciseName: "Deadlift",
          orderIndex: 0,
          planned: { rpe: 7, weightLbs: 115 },
          reps: 5,
          setId: "set-1",
        },
      },
      actor: "user" as const,
      eventId: "0198c900-0000-7000-8000-000000000001",
      occurredAt: "2026-08-03T10:00:00.000Z",
      source: "workout-ui" as const,
      version: 3,
      workoutId: "workout-1",
    };
    const state = applyEdaCoachEvents(createEdaCoachProjectionState(), [
      positioned(1, "WorkoutActionCommitted", record),
      positioned(2, "UserMessageSubmitted", {
        content: [{ text: "How did that look?", type: "text" }],
        messageId: "message-user",
      }),
      positioned(3, "CoachConversationStarted", { reason: "user-requested" }),
    ]);

    expect(state.activities).toEqual([
      expect.objectContaining({
        id: record.eventId,
        summary: "Logged Deadlift — 115 lb × 5 @ RPE 7",
      }),
    ]);
    expect(state.conversationStartedSeq).toBe(3);
    expect(projectEdaCoachMessages(state)).toEqual([]);
  });

  it("hydrates reconnect-safe active and tool state from a snapshot", () => {
    const state = hydrateEdaCoachProjection({
      activeInferenceId: "inference-1",
      activeRunIds: ["run-1"],
      lastSeq: 9,
      messages: [],
      tools: [
        {
          inferenceId: "inference-1",
          input: { workoutId: "workout-1" },
          seq: 8,
          state: "streaming",
          toolCallId: "tool-1",
          toolName: "patch_workout",
          type: "tool",
        },
      ],
    });

    expect(state.activeRunIds).toEqual(new Set(["run-1"]));
    expect(state.lastSeq).toBe(9);
    expect(projectEdaCoachMessages(state)).toEqual([
      expect.objectContaining({
        id: "live:inference-1",
        parts: [expect.objectContaining({ toolCallId: "tool-1", state: "streaming" })],
      }),
    ]);
  });
});
