/** @vitest-environment jsdom */

import { Suspense, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createCoachSheetFixtureCompletedSnapshot,
  createCoachSheetFixtureSnapshot,
  DEFAULT_FIXTURE_TOOL_COUNT,
  DEFAULT_FIXTURE_UPDATES_PER_TOOL,
  getCoachSheetFixtureTotalSteps,
} from "../../app/features/coach/coach-sheet-fixture";
import {
  createGeneralCoachTarget,
  createWorkoutCoachTarget,
} from "../../app/features/coach/contracts";
import {
  clearCoachSheetDebugTrace,
  type CoachSheetDebugApi,
  type CoachSheetDebugEntry,
} from "../../app/features/coach/coach-sheet-debug";

const {
  dispatchAgentMessage,
  getChatState,
  publishAppEventSpy,
  resetChatFixture,
  setChatState,
  subscribeToAgentMessages,
  subscribeToChatState,
  unsubscribeFromAgentMessages,
} = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const agentMessageListeners = new Set<(event: { data?: unknown }) => void>();
  const publishAppEventSpy = vi.fn();

  function createEmptyChatState() {
    return {
      addToolApprovalResponse: vi.fn(),
      clearError: vi.fn(),
      clearHistory: vi.fn(),
      error: undefined,
      isServerStreaming: false,
      isStreaming: false,
      messages: [],
      sendMessage: vi.fn(async () => {}),
      status: "ready",
      stop: vi.fn(async () => {}),
    };
  }

  let currentChatState = createEmptyChatState();

  return {
    dispatchAgentMessage: (payload: unknown) => {
      const event = {
        data: JSON.stringify(payload),
      };

      for (const listener of agentMessageListeners) {
        listener(event);
      }
    },
    getChatState: () => currentChatState,
    publishAppEventSpy,
    resetChatFixture: () => {
      currentChatState = createEmptyChatState();
      agentMessageListeners.clear();
      publishAppEventSpy.mockReset();
    },
    setChatState: (nextState: Record<string, unknown>) => {
      currentChatState = {
        ...currentChatState,
        ...nextState,
      };

      for (const listener of listeners) {
        listener();
      }
    },
    subscribeToAgentMessages: (listener: (event: { data?: unknown }) => void) => {
      agentMessageListeners.add(listener);
    },
    subscribeToChatState: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    unsubscribeFromAgentMessages: (listener: (event: { data?: unknown }) => void) => {
      agentMessageListeners.delete(listener);
    },
  };
});

vi.mock("agents/react", () => ({
  useAgent: () => ({
    addEventListener: (
      type: string,
      listener: (event: { data?: unknown }) => void,
      options?: { signal?: AbortSignal },
    ) => {
      if (type !== "message") {
        return;
      }

      subscribeToAgentMessages(listener);
      options?.signal?.addEventListener(
        "abort",
        () => {
          unsubscribeFromAgentMessages(listener);
        },
        { once: true },
      );
    },
    agent: "CoachAgent",
    getHttpUrl: () => "http://example.test/agents/coach/general",
    name: "general",
    removeEventListener: (type: string, listener: (event: { data?: unknown }) => void) => {
      if (type === "message") {
        unsubscribeFromAgentMessages(listener);
      }
    },
  }),
}));

vi.mock("@cloudflare/ai-chat/react", async () => {
  const React = await import("react");
  const actual = await vi.importActual<typeof import("@cloudflare/ai-chat/react")>(
    "@cloudflare/ai-chat/react",
  );

  return {
    ...actual,
    useAgentChat: () =>
      React.useSyncExternalStore(subscribeToChatState, getChatState, getChatState),
  };
});

vi.mock("~/features/app-events/client", async () => {
  const actual = await vi.importActual<typeof import("~/features/app-events/client")>(
    "~/features/app-events/client",
  );

  return {
    ...actual,
    publishAppEvent: publishAppEventSpy,
  };
});

type CoachSheetComponent = typeof import("../../app/features/coach/coach-sheet").CoachSheet;

const TOOL_COUNT = DEFAULT_FIXTURE_TOOL_COUNT;
const UPDATES_PER_TOOL = DEFAULT_FIXTURE_UPDATES_PER_TOOL;

describe("CoachSheet streaming fixture", () => {
  let CoachSheet: CoachSheetComponent;
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalScrollIntoViewDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    resetChatFixture();
    clearCoachSheetDebugTrace();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(function scrollIntoViewShim(this: HTMLElement) {
        const scrollContainer = this.parentElement?.parentElement;

        if (!scrollContainer) {
          return;
        }

        scrollContainer.dispatchEvent(new Event("scroll"));
      }),
    });

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(window.performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      window.clearTimeout(id);
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class MockIntersectionObserver {
        readonly root = null;
        readonly rootMargin = "";
        readonly thresholds = [0.5];
        private readonly callback: IntersectionObserverCallback;

        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }

        disconnect() {}

        observe(target: Element) {
          this.callback(
            [
              {
                boundingClientRect: target.getBoundingClientRect(),
                intersectionRatio: 1,
                intersectionRect: target.getBoundingClientRect(),
                isIntersecting: true,
                rootBounds: null,
                target,
                time: 0,
              } satisfies IntersectionObserverEntry,
            ],
            this as unknown as IntersectionObserver,
          );
        }

        takeRecords() {
          return [];
        }

        unobserve() {}
      },
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    ({ CoachSheet } = await import("../../app/features/coach/coach-sheet"));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    if (originalScrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        originalScrollIntoViewDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function flushWork() {
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });
  }

  async function renderCoachSheet(
    props: Partial<{
      isOpen: boolean;
      onClose: () => void;
      sessionRequest: {
        expand: boolean;
        initialMessage: string | null;
        requestId: string;
        target: ReturnType<typeof createWorkoutCoachTarget>;
      } | null;
      target: ReturnType<typeof createGeneralCoachTarget>;
    }> = {},
  ) {
    act(() => {
      root.render(
        createElement(
          Suspense,
          { fallback: null },
          createElement(CoachSheet, {
            isOpen: props.isOpen ?? true,
            onClose: props.onClose ?? (() => {}),
            sessionRequest: props.sessionRequest,
            target: props.target ?? createGeneralCoachTarget(),
          }),
        ),
      );
    });

    await flushWork();
  }

  it("replays a four-tool streamed coach response through the coach sheet surface", async () => {
    await renderCoachSheet();

    setChatState({
      isStreaming: true,
      messages: createCoachSheetFixtureSnapshot({
        step: 0,
        toolCount: TOOL_COUNT,
        updatesPerTool: UPDATES_PER_TOOL,
      }),
      status: "streaming",
    });
    await flushWork();

    expect(container.textContent?.match(/Update workout/g)?.length ?? 0).toBe(TOOL_COUNT);

    for (
      let step = 1;
      step <
      getCoachSheetFixtureTotalSteps({
        toolCount: TOOL_COUNT,
        updatesPerTool: UPDATES_PER_TOOL,
        userText: "Make a lot of coach sheet changes.",
      });
      step += 1
    ) {
      setChatState({
        isStreaming: true,
        messages: createCoachSheetFixtureSnapshot({
          step,
          toolCount: TOOL_COUNT,
          updatesPerTool: UPDATES_PER_TOOL,
        }),
        status: "streaming",
      });
      await flushWork();
    }

    setChatState({
      isStreaming: false,
      messages: createCoachSheetFixtureCompletedSnapshot({
        toolCount: TOOL_COUNT,
      }),
      status: "ready",
    });
    await flushWork();

    expect(container.textContent).toContain("Finished applying the requested workout updates.");
    expect(container.textContent).toContain("Update workout");
    expect(publishAppEventSpy).toHaveBeenCalledTimes(TOOL_COUNT);
    const debugTrace =
      (window.__coachSheetDebug as CoachSheetDebugApi | undefined)?.getTrace() ?? [];
    const firstStreamingEntry = debugTrace.find(
      (entry): entry is Extract<CoachSheetDebugEntry, { kind: "chat-update" }> =>
        entry.kind === "chat-update" && entry.status === "streaming",
    );
    const publishEntries = debugTrace.filter(
      (entry): entry is Extract<CoachSheetDebugEntry, { kind: "publish-app-event" }> =>
        entry.kind === "publish-app-event",
    );

    expect(
      firstStreamingEntry?.messages.at(-1)?.parts.filter((part) => part.type.startsWith("tool-")),
    ).toHaveLength(TOOL_COUNT);
    expect(publishEntries).toHaveLength(TOOL_COUNT);
    expect(
      consoleErrorSpy.mock.calls
        .flat()
        .some(
          (entry: unknown) =>
            typeof entry === "string" && entry.includes("Maximum update depth exceeded"),
        ),
    ).toBe(false);
  });

  it("expands and auto-sends a post-workout kickoff once per request id", async () => {
    const sendMessage = vi.fn(async () => {});
    const target = createWorkoutCoachTarget("workout-123");

    setChatState({
      sendMessage,
    });

    await renderCoachSheet({
      sessionRequest: {
        expand: true,
        initialMessage: "Auto review this completed workout.",
        requestId: "finish-1",
        target,
      },
      target,
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      parts: [{ text: "Auto review this completed workout.", type: "text" }],
      role: "user",
    });
    expect(container.querySelector('button[aria-label="Collapse coach sheet"]')).not.toBeNull();

    await renderCoachSheet({
      isOpen: false,
      sessionRequest: {
        expand: true,
        initialMessage: "Auto review this completed workout.",
        requestId: "finish-1",
        target,
      },
      target,
    });
    await renderCoachSheet({
      sessionRequest: {
        expand: true,
        initialMessage: "Auto review this completed workout.",
        requestId: "finish-1",
        target,
      },
      target,
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("logs coach chat errors when the unavailable card is shown", async () => {
    const chatError = new Error("Fixture coach failure");

    await renderCoachSheet();

    setChatState({
      error: chatError,
      status: "error",
    });
    await flushWork();

    expect(container.textContent).toContain("Coach unavailable");
    expect(container.textContent).toContain("Fixture coach failure");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Coach sheet chat error",
      chatError,
      expect.objectContaining({
        debugTrace: expect.any(Array),
        messageCount: 0,
        status: "error",
        target: createGeneralCoachTarget(),
      }),
    );
  });

  it("records raw agent response chunks in the coach debug trace", async () => {
    await renderCoachSheet({
      target: createWorkoutCoachTarget("workout-debug"),
    });

    dispatchAgentMessage({
      body: JSON.stringify({
        toolCallId: "call-debug-1",
        toolName: "query_history",
        type: "tool-input-start",
      }),
      done: false,
      id: "request-debug-1",
      type: "cf_agent_use_chat_response",
    });
    await flushWork();

    const debugTrace =
      (window.__coachSheetDebug as CoachSheetDebugApi | undefined)?.getTrace() ?? [];
    const agentEntry = debugTrace.find(
      (entry): entry is Extract<CoachSheetDebugEntry, { kind: "agent-receive" }> =>
        entry.kind === "agent-receive" && entry.event.type === "cf_agent_use_chat_response",
    );

    expect(agentEntry).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          chunk: expect.objectContaining({
            toolCallId: "call-debug-1",
            toolName: "query_history",
            type: "tool-input-start",
          }),
          id: "request-debug-1",
          type: "cf_agent_use_chat_response",
        }),
        status: "ready",
        target: {
          kind: "workout",
          workoutId: "workout-debug",
        },
      }),
    );
  });
});
