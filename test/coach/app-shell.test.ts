/** @vitest-environment jsdom */

import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createWorkoutCoachTarget } from "../../app/features/coach/contracts";
import {
  createPostWorkoutCoachSessionRequest,
  publishCoachSessionRequest,
} from "../../app/features/coach/session-request";

const { getFetchers, getLocation, getNavigation, resetRouterState, setNavigation } = vi.hoisted(
  () => {
    let currentLocation = {
      key: "initial",
      pathname: "/workouts/workout-123",
    };
    let currentNavigation = {
      formMethod: undefined as string | undefined,
      state: "idle",
    };

    return {
      getFetchers: () => [],
      getLocation: () => currentLocation,
      getNavigation: () => currentNavigation,
      resetRouterState: () => {
        currentLocation = {
          key: "initial",
          pathname: "/workouts/workout-123",
        };
        currentNavigation = {
          formMethod: undefined,
          state: "idle",
        };
      },
      setLocation: (nextLocation: typeof currentLocation) => {
        currentLocation = nextLocation;
      },
      setNavigation: (nextNavigation: typeof currentNavigation) => {
        currentNavigation = nextNavigation;
      },
    };
  },
);

const { coachSheetSpy, resetCoachSheetSpy } = vi.hoisted(() => {
  const coachSheetSpy = vi.fn();

  return {
    coachSheetSpy,
    resetCoachSheetSpy: () => {
      coachSheetSpy.mockReset();
    },
  };
});

vi.mock("react-router", async () => {
  const { createElement: reactCreateElement } = await import("react");

  return {
    Form: ({ children }: { children?: ReactNode }) =>
      reactCreateElement("form", undefined, children),
    Link: ({ children, className, ...props }: { children?: ReactNode; className?: string }) =>
      reactCreateElement("a", { ...props, className }, children),
    Links: () => null,
    Meta: () => null,
    NavLink: ({
      children,
      className,
      ...props
    }: {
      children?: ReactNode | ((input: { isActive: boolean }) => ReactNode);
      className?: string | ((input: { isActive: boolean }) => string);
    }) => {
      const navState = {
        isActive: false,
      };

      return reactCreateElement(
        "a",
        {
          ...props,
          className: typeof className === "function" ? className(navState) : className,
        },
        typeof children === "function" ? children(navState) : children,
      );
    },
    Scripts: () => null,
    ScrollRestoration: () => null,
    useFetchers: () => getFetchers(),
    useLocation: () => getLocation(),
    useNavigation: () => getNavigation(),
  };
});

vi.mock("~/components/atoms/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement("button", props, children),
}));

vi.mock("~/components/atoms/local-date-time", () => ({
  LocalDateTime: ({ value }: { value: string }) => createElement("time", undefined, value),
}));

vi.mock("~/components/atoms/separator", () => ({
  Separator: () => createElement("hr"),
}));

vi.mock("~/components/molecules/workout-status-badge", () => ({
  WorkoutStatusBadge: ({ status }: { status: string }) => createElement("span", undefined, status),
}));

vi.mock("../../app/components/organisms/install-app-callout", () => ({
  InstallAppCallout: () => null,
}));

vi.mock("~/features/coach/coach-sheet", () => ({
  CoachSheet: ({
    isOpen,
    sessionRequest,
    target,
  }: {
    isOpen: boolean;
    sessionRequest: { requestId: string } | null;
    target: { kind: string; workoutId?: string };
  }) => {
    coachSheetSpy({
      isOpen,
      requestId: sessionRequest?.requestId ?? null,
      target,
    });

    return createElement("div", {
      "data-coach-open": String(isOpen),
      "data-request-id": sessionRequest?.requestId ?? "",
    });
  },
}));

type AppShellComponent = typeof import("../../app/components/organisms/app-shell").AppShell;
type AppShellProps = Parameters<AppShellComponent>[0];

function EffectPublisher({
  requestId,
  workoutId,
}: {
  requestId: string | null;
  workoutId: string;
}) {
  useEffect(() => {
    if (!requestId) {
      return;
    }

    publishCoachSessionRequest(
      createPostWorkoutCoachSessionRequest({
        requestId,
        workoutId,
      }),
    );
  }, [requestId, workoutId]);

  return null;
}

describe("AppShell coach session requests", () => {
  let AppShell: AppShellComponent;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.useFakeTimers();
    resetCoachSheetSpy();
    resetRouterState();
    ({ AppShell } = await import("../../app/components/organisms/app-shell"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.useRealTimers();
  });

  async function renderAppShell({
    requestId = null,
    workoutId = "workout-123",
  }: {
    requestId?: string | null;
    workoutId?: string;
  } = {}) {
    const renderableAppShell = AppShell as (props: AppShellProps) => ReactNode;
    const shellProps: AppShellProps = {
      children: createElement(EffectPublisher, {
        requestId,
        workoutId,
      }),
      coachTarget: createWorkoutCoachTarget(workoutId),
      pageTitle: "Workout",
      recentWorkouts: [],
      topBarAction: null,
    };

    await act(async () => {
      root.render(createElement(renderableAppShell, shellProps));
    });
  }

  it("keeps the post-workout request when it is published during a coach target rerender", async () => {
    await renderAppShell();
    await renderAppShell({
      requestId: "finish-1",
    });

    expect(
      coachSheetSpy.mock.calls.some(([call]) => call.isOpen && call.requestId === "finish-1"),
    ).toBe(true);
  });

  it("shows a delayed save indicator for non-GET mutations", async () => {
    await renderAppShell();

    const indicator = container.querySelector("[data-visible]");

    expect(indicator?.getAttribute("data-visible")).toBe("false");

    setNavigation({
      formMethod: "POST",
      state: "submitting",
    });
    await renderAppShell();

    await act(async () => {
      vi.advanceTimersByTime(124);
    });

    expect(indicator?.getAttribute("data-visible")).toBe("false");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(indicator?.getAttribute("data-visible")).toBe("true");

    setNavigation({
      formMethod: undefined,
      state: "idle",
    });
    await renderAppShell();

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(indicator?.getAttribute("data-visible")).toBe("true");

    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    expect(indicator?.getAttribute("data-visible")).toBe("false");
  });
});
