import { describe, expect, it } from "vite-plus/test";

import {
  applyEdaCoachEvents,
  createEdaCoachProjectionState,
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
});
