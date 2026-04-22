import { getToolCallId, getToolPartState } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

import type { AppEventEnvelope } from "~/features/app-events/schema";

import type { CoachTarget } from "./contracts";

const COACH_SHEET_DEBUG_TRACE_LIMIT = 250;
const COACH_SHEET_DEBUG_RAW_CAPTURE_LIMIT = 500;
const COACH_SHEET_TEXT_PREVIEW_LIMIT = 160;

export interface CoachSheetDebugTarget {
  readonly kind: "general" | "workout";
  readonly workoutId?: string;
}

export interface CoachSheetDebugPartSummary {
  readonly state?: string | null;
  readonly textPreview?: string;
  readonly toolCallId?: string | null;
  readonly toolName?: string | null;
  readonly type: string;
}

export interface CoachSheetDebugMessageSummary {
  readonly id: string;
  readonly parts: readonly CoachSheetDebugPartSummary[];
  readonly role: UIMessage["role"];
}

export interface CoachSheetDebugStreamChunkSummary {
  readonly deltaLength?: number | null;
  readonly messageId?: string | null;
  readonly toolCallId?: string | null;
  readonly toolName?: string | null;
  readonly type: string;
}

export interface CoachSheetDebugAgentEventSummary {
  readonly chunk?: CoachSheetDebugStreamChunkSummary | null;
  readonly done?: boolean;
  readonly error?: boolean;
  readonly id?: string | null;
  readonly message?: CoachSheetDebugMessageSummary | null;
  readonly replay?: boolean;
  readonly replayComplete?: boolean;
  readonly type: string;
}

export interface CoachSheetDebugRawCaptureEntry {
  readonly chunk?: CoachSheetDebugStreamChunkSummary | null;
  readonly done: boolean;
  readonly error: boolean;
  readonly rawData: string;
  readonly relativeMs: number;
  readonly requestId: string | null;
  readonly timestamp: string;
  readonly type: string | null;
}

export interface CoachSheetDebugRawCapture {
  readonly armed: boolean;
  readonly entryLimit: number;
  readonly events: readonly CoachSheetDebugRawCaptureEntry[];
  readonly lockedRequestId: string | null;
  readonly requestedRequestId: string | null;
}

type CoachSheetDebugRawCaptureState = {
  armed: boolean;
  entryLimit: number;
  events: CoachSheetDebugRawCaptureEntry[];
  lockedRequestId: string | null;
  requestedRequestId: string | null;
  startedAtMs: number | null;
};

type CoachSheetDebugEntryBase = {
  readonly messageCount: number;
  readonly status: string;
  readonly target: CoachSheetDebugTarget;
  readonly timestamp: string;
};

export type CoachSheetDebugEntry =
  | (CoachSheetDebugEntryBase & {
      readonly event: CoachSheetDebugAgentEventSummary;
      readonly kind: "agent-receive";
    })
  | (CoachSheetDebugEntryBase & {
      readonly isServerStreaming: boolean;
      readonly isStreaming: boolean;
      readonly kind: "chat-update";
      readonly messages: readonly CoachSheetDebugMessageSummary[];
    })
  | (CoachSheetDebugEntryBase & {
      readonly envelope: AppEventEnvelope;
      readonly kind: "publish-app-event";
    })
  | (CoachSheetDebugEntryBase & {
      readonly error: {
        readonly message: string;
        readonly name: string;
        readonly stack: string | null;
      };
      readonly kind: "chat-error";
    })
  | (CoachSheetDebugEntryBase & {
      readonly kind: "send-message";
      readonly source: "draft" | "session-request";
      readonly text: string;
    })
  | (CoachSheetDebugEntryBase & {
      readonly kind: "clear-thread";
    });

type CoachSheetDebugEntryInput = {
  [Kind in CoachSheetDebugEntry["kind"]]: Omit<
    Extract<CoachSheetDebugEntry, { kind: Kind }>,
    "timestamp"
  >;
}[CoachSheetDebugEntry["kind"]];

export interface CoachSheetDebugApi {
  armRawCapture: (options?: { entryLimit?: number; requestId?: string }) => void;
  clearTrace: () => void;
  clearRawCapture: () => void;
  copyRawCapture: () => Promise<string>;
  copyTrace: () => Promise<string>;
  getRawCapture: () => CoachSheetDebugRawCapture;
  getTrace: () => CoachSheetDebugEntry[];
  stopRawCapture: () => void;
}

type BrowserWindow = {
  __capture?: CoachSheetDebugRawCaptureState;
  __coachSheetDebug?: CoachSheetDebugApi;
  __printCoachSheetRawCapture?: () => string;
  navigator?: {
    clipboard?: {
      writeText?: (text: string) => Promise<void>;
    };
  };
};

declare global {
  interface Window {
    __capture?: CoachSheetDebugRawCaptureState;
    __coachSheetDebug?: CoachSheetDebugApi;
    __printCoachSheetRawCapture?: () => string;
  }
}

const coachSheetDebugTrace: CoachSheetDebugEntry[] = [];
const coachSheetDebugRawCaptureState: CoachSheetDebugRawCaptureState = {
  armed: true,
  entryLimit: COACH_SHEET_DEBUG_RAW_CAPTURE_LIMIT,
  events: [],
  lockedRequestId: null,
  requestedRequestId: null,
  startedAtMs: null,
};

function getBrowserWindow() {
  const candidate = globalThis as Partial<BrowserWindow>;

  return typeof candidate === "object" && candidate !== null ? (candidate as BrowserWindow) : null;
}

function cloneTrace<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function getMonotonicTimeMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function trimTextPreview(text: string) {
  const normalizedText = text.replaceAll(/\s+/g, " ").trim();

  if (normalizedText.length <= COACH_SHEET_TEXT_PREVIEW_LIMIT) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, COACH_SHEET_TEXT_PREVIEW_LIMIT - 1)}…`;
}

function parseJsonString(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function summarizeCoachSheetStreamChunk(value: unknown): CoachSheetDebugStreamChunkSummary | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  return {
    deltaLength: typeof value.delta === "string" ? value.delta.length : null,
    messageId: typeof value.messageId === "string" ? value.messageId : null,
    toolCallId: typeof value.toolCallId === "string" ? value.toolCallId : null,
    toolName: typeof value.toolName === "string" ? value.toolName : null,
    type: value.type,
  };
}

function isCoachSheetDebugUIMessage(value: unknown): value is UIMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.role === "string" &&
    Array.isArray(value.parts)
  );
}

export function serializeCoachSheetDebugTarget(target: CoachTarget): CoachSheetDebugTarget {
  if (target.kind === "general") {
    return { kind: "general" };
  }

  return {
    kind: "workout",
    workoutId: target.workoutId,
  };
}

export function summarizeCoachSheetMessages(
  messages: readonly UIMessage[],
): CoachSheetDebugMessageSummary[] {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts.map((part) => {
      if (part.type === "text") {
        return {
          state: part.state ?? null,
          textPreview: trimTextPreview(part.text),
          type: part.type,
        };
      }

      if (isToolUIPart(part)) {
        return {
          state: getToolPartState(part),
          toolCallId: getToolCallId(part),
          toolName: getToolName(part),
          type: part.type,
        };
      }

      return {
        type: part.type,
      };
    }),
    role: message.role,
  }));
}

export function summarizeCoachSheetAgentEvent(
  value: unknown,
): CoachSheetDebugAgentEventSummary | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  if (value.type === "cf_agent_use_chat_response") {
    return {
      chunk: summarizeCoachSheetStreamChunk(parseJsonString(value.body)),
      done: value.done === true,
      error: value.error === true,
      id: typeof value.id === "string" ? value.id : null,
      replay: value.replay === true,
      replayComplete: value.replayComplete === true,
      type: value.type,
    };
  }

  if (value.type === "cf_agent_message_updated") {
    const messages = isCoachSheetDebugUIMessage(value.message)
      ? summarizeCoachSheetMessages([value.message])
      : [];

    return {
      id: typeof value.id === "string" ? value.id : null,
      message: messages[0] ?? null,
      type: value.type,
    };
  }

  return {
    done: value.done === true,
    error: value.error === true,
    id: typeof value.id === "string" ? value.id : null,
    type: value.type,
  };
}

function trimRawCaptureEvents() {
  const { entryLimit, events } = coachSheetDebugRawCaptureState;

  if (events.length <= entryLimit) {
    return;
  }

  events.splice(0, events.length - entryLimit);
}

function shouldStartRawCaptureForMessage(value: Record<string, unknown>) {
  if (value.type !== "cf_agent_use_chat_response") {
    return false;
  }

  const requestId = typeof value.id === "string" ? value.id : null;
  const requestedRequestId = coachSheetDebugRawCaptureState.requestedRequestId;

  if (requestedRequestId == null) {
    return requestId != null;
  }

  return requestId === requestedRequestId;
}

function shouldIncludeRawCaptureMessage(value: Record<string, unknown>) {
  const lockedRequestId = coachSheetDebugRawCaptureState.lockedRequestId;

  if (lockedRequestId == null) {
    return false;
  }

  if (value.type === "cf_agent_use_chat_response") {
    return value.id === lockedRequestId;
  }

  return true;
}

function resetRawCaptureBuffer(options?: { requestId?: string }) {
  coachSheetDebugRawCaptureState.events.length = 0;
  coachSheetDebugRawCaptureState.lockedRequestId = options?.requestId ?? null;
  coachSheetDebugRawCaptureState.requestedRequestId = null;
  coachSheetDebugRawCaptureState.startedAtMs = null;
}

function appendTraceEntry(entry: CoachSheetDebugEntry) {
  coachSheetDebugTrace.push(entry);

  if (coachSheetDebugTrace.length <= COACH_SHEET_DEBUG_TRACE_LIMIT) {
    return;
  }

  coachSheetDebugTrace.splice(0, coachSheetDebugTrace.length - COACH_SHEET_DEBUG_TRACE_LIMIT);
}

export function appendCoachSheetDebugEntry(entry: CoachSheetDebugEntryInput) {
  appendTraceEntry({
    ...entry,
    timestamp: new Date().toISOString(),
  } as CoachSheetDebugEntry);
}

export function armCoachSheetDebugRawCapture(options?: {
  entryLimit?: number;
  requestId?: string;
}) {
  coachSheetDebugRawCaptureState.armed = true;
  coachSheetDebugRawCaptureState.entryLimit = Math.max(
    1,
    options?.entryLimit ?? COACH_SHEET_DEBUG_RAW_CAPTURE_LIMIT,
  );
  resetRawCaptureBuffer();
  coachSheetDebugRawCaptureState.requestedRequestId = options?.requestId?.trim() || null;
}

export function stopCoachSheetDebugRawCapture() {
  coachSheetDebugRawCaptureState.armed = false;
}

export function clearCoachSheetDebugRawCapture() {
  coachSheetDebugRawCaptureState.armed = true;
  resetRawCaptureBuffer();
  coachSheetDebugRawCaptureState.entryLimit = COACH_SHEET_DEBUG_RAW_CAPTURE_LIMIT;
}

export function recordCoachSheetDebugRawAgentMessage(rawData: string, value: unknown) {
  if (!coachSheetDebugRawCaptureState.armed || !isRecord(value) || typeof value.type !== "string") {
    return;
  }

  const requestId = typeof value.id === "string" ? value.id : null;
  const chunk =
    value.type === "cf_agent_use_chat_response"
      ? summarizeCoachSheetStreamChunk(parseJsonString(value.body))
      : null;
  const isRequestStart =
    value.type === "cf_agent_use_chat_response" && requestId != null && chunk?.type === "start";

  if (isRequestStart && requestId !== coachSheetDebugRawCaptureState.lockedRequestId) {
    resetRawCaptureBuffer({ requestId });
  }

  if (
    coachSheetDebugRawCaptureState.lockedRequestId == null &&
    !shouldStartRawCaptureForMessage(value)
  ) {
    return;
  }

  if (coachSheetDebugRawCaptureState.lockedRequestId == null) {
    coachSheetDebugRawCaptureState.lockedRequestId = typeof value.id === "string" ? value.id : null;
    coachSheetDebugRawCaptureState.startedAtMs = getMonotonicTimeMs();
  }

  if (!shouldIncludeRawCaptureMessage(value)) {
    return;
  }

  const nowMs = getMonotonicTimeMs();
  const startedAtMs = coachSheetDebugRawCaptureState.startedAtMs ?? nowMs;

  coachSheetDebugRawCaptureState.events.push({
    chunk,
    done: value.done === true,
    error: value.error === true,
    rawData,
    relativeMs: Math.max(0, nowMs - startedAtMs),
    requestId: typeof value.id === "string" ? value.id : null,
    timestamp: new Date().toISOString(),
    type: value.type,
  });
  trimRawCaptureEvents();
}

export function clearCoachSheetDebugTrace() {
  coachSheetDebugTrace.length = 0;
}

export function getCoachSheetDebugTrace() {
  return cloneTrace(coachSheetDebugTrace);
}

export function getCoachSheetDebugRawCapture() {
  return cloneTrace({
    armed: coachSheetDebugRawCaptureState.armed,
    entryLimit: coachSheetDebugRawCaptureState.entryLimit,
    events: coachSheetDebugRawCaptureState.events,
    lockedRequestId: coachSheetDebugRawCaptureState.lockedRequestId,
    requestedRequestId: coachSheetDebugRawCaptureState.requestedRequestId,
  } satisfies CoachSheetDebugRawCapture);
}

export async function copyCoachSheetDebugTrace() {
  const serializedTrace = JSON.stringify(getCoachSheetDebugTrace(), null, 2);
  const browserWindow = getBrowserWindow();
  const writeText = browserWindow?.navigator?.clipboard?.writeText;

  if (typeof writeText !== "function") {
    return serializedTrace;
  }

  try {
    await writeText(serializedTrace);
  } catch {}

  return serializedTrace;
}

export async function copyCoachSheetDebugRawCapture() {
  const serializedCapture = JSON.stringify(getCoachSheetDebugRawCapture(), null, 2);
  const browserWindow = getBrowserWindow();
  const writeText = browserWindow?.navigator?.clipboard?.writeText;

  if (typeof writeText !== "function") {
    return serializedCapture;
  }

  try {
    await writeText(serializedCapture);
  } catch {}

  return serializedCapture;
}

export function printCoachSheetRawCapture() {
  const serializedCapture = JSON.stringify(getCoachSheetDebugRawCapture());
  console.log(serializedCapture);

  return serializedCapture;
}

export function ensureCoachSheetDebugGlobal() {
  const browserWindow = getBrowserWindow();

  if (!browserWindow) {
    return;
  }

  browserWindow.__coachSheetDebug = {
    armRawCapture: armCoachSheetDebugRawCapture,
    clearRawCapture: clearCoachSheetDebugRawCapture,
    clearTrace: clearCoachSheetDebugTrace,
    copyRawCapture: copyCoachSheetDebugRawCapture,
    copyTrace: copyCoachSheetDebugTrace,
    getRawCapture: getCoachSheetDebugRawCapture,
    getTrace: getCoachSheetDebugTrace,
    stopRawCapture: stopCoachSheetDebugRawCapture,
  };
  browserWindow.__capture = coachSheetDebugRawCaptureState;
  browserWindow.__printCoachSheetRawCapture = printCoachSheetRawCapture;
}
