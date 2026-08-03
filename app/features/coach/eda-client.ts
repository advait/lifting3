import * as Schema from "effect/Schema";
import {
  EDAWebSocketWireClientFrame,
  type EDAWebSocketWireAckFrame,
  makeEDAWebSocketWireProtocol,
} from "effect-durable-agent/host/websocket-wire";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publishAppEvent } from "~/features/app-events/client";
import type { AppEventEnvelope, WorkoutEventType } from "~/features/app-events/schema";
import { WorkoutActionRecord } from "~/features/workouts/events";
import { formatCoachApiPath, type CoachTarget } from "./contracts";
import {
  applyEdaCoachEvents,
  createEdaCoachProjectionState,
  hydrateEdaCoachProjection,
  projectEdaCoachMessages,
} from "./eda-projection";
import { CoachDurableEvent } from "../../../workers/eda-coach/events";

const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 5_000;
const CoachWebSocketServerFrame = makeEDAWebSocketWireProtocol({
  appEvents: CoachDurableEvent,
}).serverFrame;
const CoachSnapshot = Schema.Struct({
  activeInferenceId: Schema.NullOr(Schema.String),
  activeRunIds: Schema.Array(Schema.String),
  activities: Schema.Array(
    Schema.Struct({
      record: WorkoutActionRecord,
      seq: Schema.Number,
    }),
  ),
  lastSeq: Schema.Number,
  messages: Schema.Array(Schema.Unknown),
  tools: Schema.Array(
    Schema.Struct({
      error: Schema.optionalKey(Schema.String),
      inferenceId: Schema.optionalKey(Schema.String),
      input: Schema.Unknown,
      output: Schema.optionalKey(Schema.Unknown),
      seq: Schema.Number,
      state: Schema.Literals(["complete", "error", "loading", "streaming"]),
      toolCallId: Schema.String,
      toolName: Schema.String,
      type: Schema.Literal("tool"),
    }),
  ),
});

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

const apiRequest = async (path: string, init: RequestInit): Promise<unknown> => {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (response.ok) {
    return await response.json().catch(() => null);
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

const appEventTypeForAction = (record: typeof WorkoutActionRecord.Type): WorkoutEventType => {
  switch (record.action.kind) {
    case "workout_created":
      return "workout_created";
    case "workout_started":
      return "workout_started";
    case "set_logged":
      return "set_confirmed";
    case "set_corrected":
      return "set_corrected";
    case "set_log_reverted":
      return "set_unconfirmed";
    case "workout_note_changed":
      return "workout_note_updated";
    case "exercise_note_changed":
      return "exercise_note_updated";
    case "workout_completed":
      return "workout_completed";
    case "workout_deleted":
      return "workout_deleted";
    case "workout_plan_adjusted":
      return "workout_updated";
  }
};

const publishWorkoutAction = (record: typeof WorkoutActionRecord.Type): void => {
  const event: AppEventEnvelope = {
    eventId: record.eventId,
    invalidate: ["workouts:list", "exercises:list", "analytics", `workout:${record.workoutId}`],
    type: appEventTypeForAction(record),
    version: record.version,
    workoutId: record.workoutId,
  };
  publishAppEvent(event);
};

export const useEdaCoachSession = (target: CoachTarget) => {
  const [projection, setProjection] = useState(createEdaCoachProjectionState);
  const projectionRef = useRef(projection);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "error" | "live">(
    "connecting",
  );
  const [localError, setLocalError] = useState<Error | undefined>();
  const [pendingSubmissions, setPendingSubmissions] = useState(0);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const lastSeqRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventsPath = formatCoachApiPath(target, "events");
  const messagesPath = formatCoachApiPath(target, "messages");
  const conversationPath = formatCoachApiPath(target, "conversation");
  const snapshotPath = formatCoachApiPath(target, "snapshot");
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
    let disposed = false;
    setSnapshotReady(false);
    setConnectionStatus("connecting");
    projectionRef.current = createEdaCoachProjectionState();
    setProjection(projectionRef.current);
    lastSeqRef.current = 0;

    const hydrate = async () => {
      try {
        const response = await fetch(snapshotPath);
        if (!response.ok) {
          throw new Error(`Unable to load coach snapshot (${response.status}).`);
        }
        const snapshot = Schema.decodeUnknownSync(CoachSnapshot)(await response.json());
        if (disposed) {
          return;
        }
        projectionRef.current = hydrateEdaCoachProjection(snapshot);
        lastSeqRef.current = snapshot.lastSeq;
        setProjection(projectionRef.current);
        setSnapshotReady(true);
      } catch (error) {
        if (!disposed) {
          setConnectionError(
            error instanceof Error ? error.message : "Unable to load coach snapshot.",
          );
          setConnectionStatus("error");
        }
      }
    };

    void hydrate();
    return () => {
      disposed = true;
    };
  }, [snapshotPath, targetKey]);

  useEffect(() => {
    if (!snapshotReady) {
      return;
    }

    let disposed = false;
    let reconnectOnClose = true;
    const socket = new WebSocket(coachEventsWebSocketUrl(eventsPath, lastSeqRef.current));
    setConnectionError(null);
    setConnectionStatus("connecting");

    socket.addEventListener("open", () => {
      reconnectAttemptRef.current = 0;
      setConnectionStatus("live");
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
        setConnectionStatus("error");
        socket.close();
        return;
      }

      switch (frame._tag) {
        case "events":
          for (const item of frame.events) {
            if (item.event.type === "WorkoutActionCommitted") {
              publishWorkoutAction(item.event.payload);
            }
          }
          projectionRef.current = applyEdaCoachEvents(projectionRef.current, frame.events);
          setProjection(projectionRef.current);
          lastSeqRef.current = Math.max(lastSeqRef.current, frame.durableThroughSeq);
          socket.send(
            JSON.stringify(
              Schema.encodeUnknownSync(EDAWebSocketWireClientFrame)(ackForFrame(frame)),
            ),
          );
          return;
        case "lagged":
          reconnectOnClose = false;
          lastSeqRef.current = frame.resumeSeq;
          setConnectionError(`EDA coach stream lagged (${frame.reason}); reconnecting.`);
          setConnectionStatus("error");
          socket.close();
          scheduleReconnect();
          return;
        case "error":
          reconnectOnClose = false;
          setConnectionError(frame.message);
          setConnectionStatus("error");
          socket.close();
          return;
        case "heartbeat":
        case "hello":
          setConnectionStatus("live");
          return;
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
        setConnectionStatus("error");
        scheduleReconnect();
      }
    });

    return () => {
      disposed = true;
      socket.close();
    };
  }, [eventsPath, reconnectKey, scheduleReconnect, snapshotReady]);

  useEffect(
    () => () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
    },
    [],
  );

  const withSubmission = useCallback(async (operation: () => Promise<unknown>) => {
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

  const startNewConversation = useCallback(async () => {
    await withSubmission(() => apiRequest(conversationPath, { method: "POST" }));
  }, [conversationPath, withSubmission]);

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
      activities: projection.activities,
      clearError,
      connectionStatus,
      error,
      isServerStreaming: isStreaming,
      isStreaming,
      lastSeq: projection.lastSeq,
      messages: projectEdaCoachMessages(projection),
      sendMessage,
      startNewConversation,
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
      connectionStatus,
      error,
      isStreaming,
      pendingSubmissions,
      projection,
      sendMessage,
      startNewConversation,
      stop,
    ],
  );
};
