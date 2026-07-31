import { describe, expect, it } from "vite-plus/test";

import {
  createGeneralCoachTarget,
  createWorkoutCoachTarget,
} from "../../app/features/coach/contracts";
import { formatCoachSessionId } from "../../app/features/coach/session-id";

describe("EDA coach session identity", () => {
  it("maps public thread keys to stable UUID v5 session ids", async () => {
    await expect(formatCoachSessionId(createGeneralCoachTarget())).resolves.toBe(
      "d167b776-9181-57ab-bf4f-f0ddf8e85b27",
    );
    await expect(formatCoachSessionId(createWorkoutCoachTarget("workout-123"))).resolves.toBe(
      "d7fec941-8e32-5afa-9323-239987773665",
    );
  });

  it("keeps distinct workout threads isolated", async () => {
    const first = await formatCoachSessionId(createWorkoutCoachTarget("first"));
    const second = await formatCoachSessionId(createWorkoutCoachTarget("second"));

    expect(first).not.toBe(second);
    expect(first[14]).toBe("5");
    expect(["8", "9", "a", "b"]).toContain(first[19]);
  });
});
