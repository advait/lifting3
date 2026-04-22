import type { UIMessageChunk } from "ai";

import trace8FixedCapture from "../trace8.fixed.json";

interface CoachSheetRawCaptureEvent {
  readonly rawData: string;
  readonly timestamp: string;
  readonly type: string;
}

interface CoachSheetRawCapture {
  readonly events: readonly CoachSheetRawCaptureEvent[];
}

interface CoachSheetReplayTransportMessage {
  readonly body?: string;
  readonly done?: boolean;
  readonly error?: boolean;
  readonly id?: string;
  readonly type: string;
}

interface CoachSheetReplayChunkEvent {
  readonly chunk: UIMessageChunk;
  readonly delayMs: number;
  readonly timestampMs: number;
}

export interface CoachSheetTraceReplayEvent {
  readonly chunk: UIMessageChunk;
  readonly delayMs: number;
}

export interface CoachSheetTraceReplaySummary {
  readonly captureRequestId: string;
  readonly durationMs: number;
  readonly inputAvailableCount: number;
  readonly inputDeltaCount: number;
  readonly outputAvailableCount: number;
  readonly toolCount: number;
}

function normalizeReplayTimestamp(value: string) {
  return value.replace(/:\s+/g, ":");
}

function stripReplayRawDataWhitespace(value: string) {
  return value.replace(/\r|\n/g, "");
}

function decodeReplayJson<T>(value: string, label: string): T {
  let normalizedValue = stripReplayRawDataWhitespace(value);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return JSON.parse(normalizedValue) as T;
    } catch {
      normalizedValue = normalizedValue.replaceAll('\\"', '"');
    }
  }

  throw new Error(`Could not decode ${label}`);
}

function parseReplayTimestampMs(value: string) {
  const timestampMs = Date.parse(normalizeReplayTimestamp(value));

  if (Number.isNaN(timestampMs)) {
    throw new Error(`Invalid replay timestamp: ${value}`);
  }

  return timestampMs;
}

function createCoachSheetTraceReplay() {
  const capture = trace8FixedCapture as CoachSheetRawCapture;
  const responseMessages = capture.events.flatMap((event) => {
    const transportMessage = decodeReplayJson<CoachSheetReplayTransportMessage>(
      event.rawData,
      `trace8 rawData @ ${event.timestamp}`,
    );

    if (transportMessage.type !== "cf_agent_use_chat_response") {
      return [];
    }

    return [
      {
        body:
          typeof transportMessage.body === "string" && transportMessage.body.trim().length > 0
            ? decodeReplayJson<UIMessageChunk>(
                transportMessage.body,
                `trace8 response body @ ${event.timestamp}`,
              )
            : null,
        done: transportMessage.done === true,
        error: transportMessage.error === true,
        requestId: transportMessage.id ?? null,
        timestampMs: parseReplayTimestampMs(event.timestamp),
      },
    ];
  });

  const replayEvents: CoachSheetReplayChunkEvent[] = [];

  for (const responseMessage of responseMessages) {
    if (!responseMessage.body) {
      continue;
    }

    const previousTimestampMs =
      replayEvents.length > 0
        ? (replayEvents[replayEvents.length - 1]?.timestampMs ?? responseMessage.timestampMs)
        : responseMessage.timestampMs;

    replayEvents.push({
      chunk: responseMessage.body,
      delayMs: Math.max(0, responseMessage.timestampMs - previousTimestampMs),
      timestampMs: responseMessage.timestampMs,
    });
  }

  const captureRequestId =
    responseMessages.find((message) => message.requestId != null)?.requestId ?? "trace8";
  const firstTimestampMs = responseMessages[0]?.timestampMs ?? 0;
  const lastTimestampMs = responseMessages[responseMessages.length - 1]?.timestampMs ?? 0;
  const toolCallIds = new Set<string>();
  let inputAvailableCount = 0;
  let inputDeltaCount = 0;
  let outputAvailableCount = 0;

  for (const event of replayEvents) {
    const toolCallId =
      "toolCallId" in event.chunk && typeof event.chunk.toolCallId === "string"
        ? event.chunk.toolCallId
        : null;

    if (toolCallId) {
      toolCallIds.add(toolCallId);
    }

    switch (event.chunk.type) {
      case "tool-input-available":
        inputAvailableCount += 1;
        break;
      case "tool-input-delta":
        inputDeltaCount += 1;
        break;
      case "tool-output-available":
        outputAvailableCount += 1;
        break;
      default:
        break;
    }
  }

  const summary: CoachSheetTraceReplaySummary = {
    captureRequestId,
    durationMs: Math.max(0, lastTimestampMs - firstTimestampMs),
    inputAvailableCount,
    inputDeltaCount,
    outputAvailableCount,
    toolCount: toolCallIds.size,
  };

  return {
    replayEvents,
    summary,
  } as const;
}

const coachSheetTraceReplay = createCoachSheetTraceReplay();

export const coachSheetTrace8ReplaySummary = coachSheetTraceReplay.summary;

export function getCoachSheetTrace8ReplayEvents(options?: { readonly speedMultiplier?: number }) {
  const speedMultiplier =
    typeof options?.speedMultiplier === "number" && options.speedMultiplier > 0
      ? options.speedMultiplier
      : 1;

  return coachSheetTraceReplay.replayEvents.map(({ chunk, delayMs }) => ({
    chunk,
    delayMs: Math.max(0, Math.round(delayMs / speedMultiplier)),
  })) satisfies readonly CoachSheetTraceReplayEvent[];
}
