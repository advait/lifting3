/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkoutSet } from "../../app/features/workouts/contracts";
import { ExerciseRestTimer } from "../../app/features/workouts/exercise-rest-timer";

const FIXED_NOW = "2026-04-21T10:00:00.000Z";

function createSet(id: string, confirmedAt: string | null): WorkoutSet {
  return {
    actual: {
      rpe: confirmedAt == null ? null : 8,
      weightLbs: confirmedAt == null ? null : 225,
    },
    confirmedAt,
    designation: "working",
    id,
    orderIndex: Number.parseInt(id.replace("set-", ""), 10) - 1,
    planned: {
      rpe: null,
      weightLbs: 225,
    },
    previous: null,
    personalRecord: null,
    reps: 5,
  };
}

function click(element: Element | null) {
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error("Expected a button element.");
  }

  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("ExerciseRestTimer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function renderTimer(sets: readonly WorkoutSet[], restSeconds = 90) {
    act(() => {
      root.render(<ExerciseRestTimer restSeconds={restSeconds} sets={sets} />);
    });
  }

  function getValue() {
    const value = container.querySelector("[data-rest-timer-value='true']")?.textContent;

    if (!value) {
      throw new Error("Expected timer value to be rendered.");
    }

    return value;
  }

  function getStatus() {
    const status = container.firstElementChild?.getAttribute("data-rest-timer-status");

    if (!status) {
      throw new Error("Expected timer status to be rendered.");
    }

    return status;
  }

  function getTone() {
    const tone = container.firstElementChild?.getAttribute("data-rest-timer-tone");

    if (!tone) {
      throw new Error("Expected timer tone to be rendered.");
    }

    return tone;
  }

  it("stays idle on first render even when the workout already has confirmed sets", () => {
    renderTimer([createSet("set-1", "2026-04-21T09:59:00.000Z")]);

    expect(getStatus()).toBe("idle");
    expect(getTone()).toBe("idle");
    expect(getValue()).toBe("1:30");
    expect(container.querySelector("[aria-label='Start rest timer']")).not.toBeNull();
    expect(container.querySelector("[aria-label='Add 30 seconds']")).toBeNull();
    expect(container.querySelector("[aria-label='Add 30 seconds']")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(getValue()).toBe("1:30");
  });

  it("starts on a newly confirmed set and restarts when the next set is confirmed", () => {
    renderTimer([createSet("set-1", null), createSet("set-2", null)]);

    expect(getStatus()).toBe("idle");
    expect(getValue()).toBe("1:30");

    renderTimer([createSet("set-1", "2026-04-21T10:00:00.000Z"), createSet("set-2", null)]);

    expect(getStatus()).toBe("running");
    expect(getValue()).toBe("1:30");
    expect(container.querySelector("[aria-label='Add 30 seconds']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(getValue()).toBe("0:59");

    renderTimer([
      createSet("set-1", "2026-04-21T10:00:00.000Z"),
      createSet("set-2", "2026-04-21T10:00:31.000Z"),
    ]);

    expect(getStatus()).toBe("running");
    expect(getValue()).toBe("1:30");
  });

  it("supports pause, resume, and stop", () => {
    renderTimer([createSet("set-1", null)]);
    renderTimer([createSet("set-1", "2026-04-21T10:00:00.000Z")]);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(getValue()).toBe("1:25");

    click(container.querySelector("[aria-label='Pause rest timer']"));

    expect(getStatus()).toBe("paused");
    expect(container.querySelector("[aria-label='Add 30 seconds']")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(getValue()).toBe("1:25");

    click(container.querySelector("[aria-label='Resume rest timer']"));

    expect(getStatus()).toBe("running");
    expect(container.querySelector("[aria-label='Add 30 seconds']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(getValue()).toBe("1:19");

    click(container.querySelector("[aria-label='Stop rest timer']"));

    expect(getStatus()).toBe("idle");
    expect(getTone()).toBe("idle");
    expect(getValue()).toBe("1:30");
    expect(container.querySelector("[aria-label='Start rest timer']")).not.toBeNull();

    click(container.querySelector("[aria-label='Start rest timer']"));

    expect(getStatus()).toBe("running");
    expect(getValue()).toBe("1:30");
    expect(container.querySelector("[aria-label='Start rest timer']")).not.toBeNull();
  });

  it("switches to overtime and +30 returns the timer to the countdown state", () => {
    renderTimer([createSet("set-1", null)]);
    renderTimer([createSet("set-1", "2026-04-21T10:00:00.000Z")]);

    act(() => {
      vi.advanceTimersByTime(91_000);
    });

    expect(getTone()).toBe("overtime");
    expect(getValue()).toBe("+0:01");

    click(container.querySelector("[aria-label='Add 30 seconds']"));

    expect(getTone()).toBe("running");
    expect(getValue()).toBe("0:29");
  });
});
