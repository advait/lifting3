import { describe, expect, it } from "vite-plus/test";

import {
  normalizeRestSeconds,
  parseRestTimerSecondsInput,
} from "../../app/features/workouts/rest-timer";

describe("normalizeRestSeconds", () => {
  it("keeps valid positive integer values", () => {
    expect(normalizeRestSeconds(120)).toBe(120);
    expect(normalizeRestSeconds("150")).toBe(150);
  });

  it("treats blank, invalid, and NaN values as missing", () => {
    expect(normalizeRestSeconds(undefined)).toBeUndefined();
    expect(normalizeRestSeconds(null)).toBeUndefined();
    expect(normalizeRestSeconds("")).toBeUndefined();
    expect(normalizeRestSeconds("abc")).toBeUndefined();
    expect(normalizeRestSeconds(Number.NaN)).toBeUndefined();
    expect(normalizeRestSeconds(0)).toBeUndefined();
  });
});

describe("parseRestTimerSecondsInput", () => {
  it("accepts seconds-only and colon-delimited timer inputs", () => {
    expect(parseRestTimerSecondsInput("90")).toBe(90);
    expect(parseRestTimerSecondsInput("2:30")).toBe(150);
    expect(parseRestTimerSecondsInput("1:02:03")).toBe(3723);
  });

  it("rejects blank and malformed values", () => {
    expect(parseRestTimerSecondsInput("")).toBeUndefined();
    expect(parseRestTimerSecondsInput("abc")).toBeUndefined();
    expect(parseRestTimerSecondsInput("2:75")).toBeUndefined();
    expect(parseRestTimerSecondsInput("0:00")).toBeUndefined();
  });
});
