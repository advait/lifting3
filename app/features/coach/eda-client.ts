import * as Schema from "effect/Schema";
import {
  EDAWebSocketWireClientFrame,
  type EDAWebSocketWireAckFrame,
  makeEDAWebSocketWireProtocol,
} from "effect-durable-agent/host/websocket-wire";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publishAppEvent } from "~/features/app-events/client";
import { formatCoachApiPath, type CoachTarget } from "./contracts";
import {
  applyEdaCoachEvents,
  createEdaCoachProjectionState,
  projectEdaCoachMessages,
} from "./eda-projection";
import { CoachDurableEvent } from "../../../workers/eda-coach/events";

const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 5_000;
const CoachWebSocketServerFrame = makeEDAWebSocketWireProtocol({
  appEvents: CoachDurableEvent,
}).serverFrame;

export interface CoachSendMessageInput {
  readonly parts: readonly { readonly text: string; readonly type: "text" }[];
  readonly role: "user";
}

const getBrowserHref = (): string => {
  const locationValue: unknown = Reflect.get(globalThis, "location");
  if (typeof locationValue !== "object" || locationValue === null) {
    throw new Error("The EDA coach WebSocket is only available in a browser.");
  }

  const hrefValue: unknown = Reflect.get(locationValue, "href");
  if (typeof hrefValue !== "string") {
    throw new Error("The browser location does not expose a valid URL.");
  }

  return hrefValue;
};

export const coachEventsWebSocketUrl = (eventsPath: string, afterSeq: number): string => {
  const url = new URL(eventsPath, getBrowserHref());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("afterSeq", String(afterSeq));
  return url.toString();
};

export const coachReconnectDelayMs = (attempt: number): number =>
  Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt));

const ackForFrame = (frame: {
  readonly durableThroughSeq: number;
  readonly frameId: number;
}): EDAWebSocketWireAckFrame => ({
  _tag: "ack",
  durableThroughSeq: frame.durableThroughSeq,
  frameId: frame.frameId,
});

const apiRequest = async (path: string, init: RequestInit): Promise<void> => {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (response.ok) {
    return;
  }
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : `Coach request failed with ${response.status}.`;
  throw new Error(message);
};

export const useEdaCoachSession = (target: CoachTarget) => {
  const [projection, setProjection] = useState(createEdaCoachProjectionState);
  const projectionRef = useRef(projection);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<Error | undefined>();
  const [pendingSubmissions, setPendingSubmissions] = useState(0);
  const [reconnectKey, setReconnectKey] = useState(0);
  const lastSeqRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishedAppEventIdsRef = useRef(new Set<string>());
  const eventsPath = formatCoachApiPath(target, "events");
  const messagesPath = formatCoachApiPath(target, "messages");
  const sessionPath = formatCoachApiPath(target, "session");
  const stopPath = formatCoachApiPath(target, "stop");
  const targetKey = eventsPath;

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      return;
    }
    const delay = coachReconnectDelayMs(reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setReconnectKey((current) => current + 1);
    }, delay);
  }, []);

  useEffect(() => {
    projectionRef.current = createEdaCoachProjectionState();
    setProjection(projectionRef.current);
    lastSeqRef.current = 0;
    publishedAppEventIdsRef.current = new Set();
  }, [targetKey]);

  useEffect(() => {
    let disposed = false;
    let reconnectOnClose = true;
    const socket = new WebSocket(coachEventsWebSocketUrl(eventsPath, lastSeqRef.current));
    setConnectionError(null);

    socket.addEventListener("open", () => {
      reconnectAttemptRef.current = 0;
    });
    socket.addEventListener("message", (message) => {
      let frame: Schema.Schema.Type<typeof CoachWebSocketServerFrame>;
      try {
        frame = Schema.decodeUnknownSync(CoachWebSocketServerFrame)(
          JSON.parse(String(message.data)),
        );
      } catch {
        reconnectOnClose = false;
        setConnectionError("Received a malformed EDA coach event frame.");
        socket.close();
        return;
      }

      if (frame._tag === "events") {
        for (const item of frame.events) {
          const event = item.event;
          if (event.type !== "WorkoutMutationCommitted") {
            continue;
          }
          const eventId = event.payload.eventId;
          if (!publishedAppEventIdsRef.current.has(eventId)) {
            publishedAppEventIdsRef.current.add(eventId);
            publishAppEvent(event.payload);
          }
        }
        projectionRef.current = applyEdaCoachEvents(projectionRef.current, frame.events);
        setProjection(projectionRef.current);
        lastSeqRef.current = Math.max(lastSeqRef.current, frame.durableThroughSeq);
        socket.send(
          JSON.stringify(Schema.encodeUnknownSync(EDAWebSocketWireClientFrame)(ackForFrame(frame))),
        );
        return;
      }
      if (frame._tag === "lagged") {
        reconnectOnClose = false;
        lastSeqRef.current = frame.resumeSeq;
        setConnectionError(`EDA coach stream lagged (${frame.reason}); reconnecting.`);
        socket.close();
        scheduleReconnect();
        return;
      }
      if (frame._tag === "error") {
        reconnectOnClose = false;
        setConnectionError(frame.message);
        socket.close();
      }
    });
    socket.addEventListener("close", () => {
      if (!disposed && reconnectOnClose) {
        scheduleReconnect();
      }
    });
    socket.addEventListener("error", () => {
      if (!disposed) {
        setConnectionError("EDA coach connection failed; reconnecting.");
        scheduleReconnect();
      }
    });

    return () => {
      disposed = true;
      socket.close();
    };
  }, [eventsPath, reconnectKey, scheduleReconnect]);

  useEffect(
    () => () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
    },
    [],
  );

  const withSubmission = useCallback(async (operation: () => Promise<void>) => {
    setPendingSubmissions((current) => current + 1);
    setLocalError(undefined);
    try {
      await operation();
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("Coach request failed.");
      setLocalError(normalized);
      throw normalized;
    } finally {
      setPendingSubmissions((current) => Math.max(0, current - 1));
    }
  }, []);

  const sendMessage = useCallback(
    async (message: CoachSendMessageInput) => {
      const text = message.parts
        .map((part) => part.text)
        .join("")
        .trim();
      if (!text) {
        return;
      }
      await withSubmission(() =>
        apiRequest(messagesPath, {
          body: JSON.stringify({
            idempotencyKey: `web:coach:${crypto.randomUUID()}`,
            text,
          }),
          method: "POST",
        }),
      );
    },
    [messagesPath, withSubmission],
  );

  const stop = useCallback(async () => {
    await withSubmission(() =>
      apiRequest(stopPath, {
        body: JSON.stringify({ idempotencyKey: `web:coach:stop:${crypto.randomUUID()}` }),
        method: "POST",
      }),
    );
  }, [stopPath, withSubmission]);

  const clearHistory = useCallback(async () => {
    await withSubmission(() => apiRequest(sessionPath, { method: "DELETE" }));
    projectionRef.current = createEdaCoachProjectionState();
    setProjection(projectionRef.current);
    lastSeqRef.current = 0;
    publishedAppEventIdsRef.current = new Set();
    setReconnectKey((current) => current + 1);
  }, [sessionPath, withSubmission]);

  const isStreaming = projection.activeRunIds.size > 0;
  const error =
    localError ??
    (projection.error || connectionError
      ? new Error(projection.error ?? connectionError ?? "")
      : undefined);
  const clearError = useCallback(() => {
    setLocalError(undefined);
    setConnectionError(null);
    if (projectionRef.current.error !== null) {
      projectionRef.current = { ...projectionRef.current, error: null };
      setProjection(projectionRef.current);
    }
  }, []);

  return useMemo(
    () => ({
      clearError,
      clearHistory,
      error,
      isServerStreaming: isStreaming,
      isStreaming,
      messages: projectEdaCoachMessages(projection),
      sendMessage,
      status:
        pendingSubmissions > 0
          ? "submitted"
          : isStreaming
            ? "streaming"
            : error
              ? "error"
              : "ready",
      stop,
    }),
    [
      clearError,
      clearHistory,
      error,
      isStreaming,
      pendingSubmissions,
      projection,
      sendMessage,
      stop,
    ],
  );
};
