import { describe, expect, it } from "vite-plus/test";

import {
  createGeneralCoachTarget,
  createWorkoutCoachTarget,
  formatCoachInstanceName,
  parseCoachInstanceName,
} from "../../app/features/coach/contracts";

describe("coach contracts", () => {
  it("formats and parses the general coach thread", () => {
    const target = createGeneralCoachTarget();

    expect(formatCoachInstanceName(target)).toBe("general");
    expect(parseCoachInstanceName("general")).toEqual(target);
  });

  it("formats and parses the workout coach thread", () => {
    const target = createWorkoutCoachTarget("workout-1");

    expect(formatCoachInstanceName(target)).toBe("workout:workout-1");
    expect(parseCoachInstanceName("workout:workout-1")).toEqual(target);
  });

  it("rejects invalid coach instance names", () => {
    expect(parseCoachInstanceName("workout:")).toBeNull();
    expect(parseCoachInstanceName("unknown")).toBeNull();
  });
});
