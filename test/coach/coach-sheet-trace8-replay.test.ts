import { describe, expect, it } from "vitest";

import { COACH_SHEET_TRACE8_FIXTURE_SUMMARY } from "../../app/features/coach/coach-sheet-fixture-live";
import {
  coachSheetTrace8ReplaySummary,
  getCoachSheetTrace8ReplayEvents,
} from "../../workers/coach-sheet-trace8-replay";

describe("coach sheet trace8 replay", () => {
  it("decodes the captured transport into replayable UI chunks", () => {
    const replayEvents = getCoachSheetTrace8ReplayEvents();

    expect(replayEvents.length).toBeGreaterThan(0);
    expect(replayEvents[0]).toMatchObject({
      chunk: {
        type: "start",
      },
      delayMs: 0,
    });
    expect(replayEvents.some((event) => event.chunk.type === "tool-input-delta")).toBe(true);
    expect(replayEvents.some((event) => event.chunk.type === "tool-output-available")).toBe(true);
    expect(replayEvents[replayEvents.length - 1]?.chunk.type).toBe("finish-step");
  });

  it("matches the published fixture summary", () => {
    expect(coachSheetTrace8ReplaySummary).toEqual(COACH_SHEET_TRACE8_FIXTURE_SUMMARY);
  });

  it("supports replay speed scaling without mutating chunk order", () => {
    const capturedSpeedEvents = getCoachSheetTrace8ReplayEvents();
    const fasterReplayEvents = getCoachSheetTrace8ReplayEvents({ speedMultiplier: 4 });

    expect(fasterReplayEvents).toHaveLength(capturedSpeedEvents.length);
    expect(fasterReplayEvents[10]?.chunk).toEqual(capturedSpeedEvents[10]?.chunk);
    expect(fasterReplayEvents[1]?.delayMs).toBeLessThanOrEqual(capturedSpeedEvents[1]?.delayMs);
  });
});
