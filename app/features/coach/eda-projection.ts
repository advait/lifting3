import type {
  AssistantMessageCommittedPayload,
  AssistantPartialCommittedPayload,
  InferenceStartedPayload,
  RunCompletedPayload,
  RunFailedPayload,
  RunInterruptedPayload,
  RunStartedPayload,
  ToolCallCompletedPayload,
  ToolCallCreatedPayload,
  ToolCallFailedPayload,
  ToolCallRejectedPayload,
  ToolCallStartedPayload,
  TextDeltaPayload,
  ToolParamsDeltaPayload,
  ToolParamsStartPayload,
  UserMessageCommittedPayload,
  UserMessageSubmittedPayload,
} from "effect-durable-agent/types/events";

export interface CoachPositionedEvent {
  readonly event: {
    readonly durability: "durable" | "ephemeral";
    readonly payload: unknown;
    readonly type: string;
  };
  readonly position: { readonly seq: number };
}

export type CoachToolState = "complete" | "error" | "loading" | "streaming";

export interface CoachTextPart {
  readonly text: string;
  readonly type: "text";
}

export interface CoachToolPart {
  readonly error?: string;
  readonly input: unknown;
  readonly output?: unknown;
  readonly state: CoachToolState;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly type: "tool";
}

export type CoachMessagePart = CoachTextPart | CoachToolPart;

export interface CoachMessage {
  readonly id: string;
  readonly inferenceId?: string;
  readonly parts: readonly CoachMessagePart[];
  readonly role: "assistant" | "user";
  readonly seq: number;
}

interface StoredCoachTool extends CoachToolPart {
  readonly inferenceId?: string;
  readonly seq: number;
}

export interface EdaCoachProjectionState {
  readonly activeInferenceId: string | null;
  readonly activeRunIds: ReadonlySet<string>;
  readonly error: string | null;
  readonly lastSeq: number;
  readonly liveText: string;
  readonly messages: ReadonlyMap<string, CoachMessage>;
  readonly tools: ReadonlyMap<string, StoredCoachTool>;
}

export const createEdaCoachProjectionState = (): EdaCoachProjectionState => ({
  activeInferenceId: null,
  activeRunIds: new Set(),
  error: null,
  lastSeq: 0,
  liveText: "",
  messages: new Map(),
  tools: new Map(),
});

const textFromContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) =>
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("");
};

const assistantTextParts = (promptParts: unknown): readonly CoachTextPart[] => {
  if (!Array.isArray(promptParts)) {
    return [];
  }

  return promptParts.flatMap((part) =>
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "text" &&
    "text" in part &&
    typeof part.text === "string" &&
    part.text.trim().length > 0
      ? [{ text: part.text, type: "text" as const }]
      : [],
  );
};

const errorMessage = (payload: unknown): string | null => {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return null;
  }
  const error = payload.error;
  if (typeof error !== "object" || error === null) {
    return null;
  }
  if ("code" in error && typeof error.code === "string" && error.code.includes("interrupted")) {
    return null;
  }
  return "message" in error && typeof error.message === "string" ? error.message : null;
};

/** The wire schema validates event type/payload pairing before projection. */
const eventPayload = <Payload>(item: CoachPositionedEvent): Payload =>
  item.event.payload as Payload;

const applyEvent = (
  state: EdaCoachProjectionState,
  item: CoachPositionedEvent,
): EdaCoachProjectionState => {
  const { event, position } = item;
  const lastSeq =
    event.durability === "durable" ? Math.max(state.lastSeq, position.seq) : state.lastSeq;

  switch (event.type) {
    case "UserMessageSubmitted":
    case "UserMessageCommitted": {
      const payload = eventPayload<UserMessageSubmittedPayload | UserMessageCommittedPayload>(item);
      const messageId = payload.messageId;
      const text = textFromContent(payload.content);
      if (!text.trim()) {
        return { ...state, lastSeq };
      }
      const messages = new Map(state.messages);
      messages.set(messageId, {
        id: messageId,
        parts: [{ text, type: "text" }],
        role: "user",
        seq: position.seq,
      });
      return { ...state, lastSeq, messages };
    }
    case "AssistantMessageCommitted":
    case "AssistantPartialCommitted": {
      const payload = eventPayload<
        AssistantMessageCommittedPayload | AssistantPartialCommittedPayload
      >(item);
      const messages = new Map(state.messages);
      messages.set(payload.messageId, {
        id: payload.messageId,
        inferenceId: payload.inferenceId,
        parts: assistantTextParts(payload.promptParts),
        role: "assistant",
        seq: position.seq,
      });
      return {
        ...state,
        activeInferenceId: null,
        lastSeq,
        liveText: "",
        messages,
      };
    }
    case "RunStarted": {
      const payload = eventPayload<RunStartedPayload>(item);
      const activeRunIds = new Set(state.activeRunIds);
      activeRunIds.add(payload.runId);
      return { ...state, activeRunIds, error: null, lastSeq };
    }
    case "RunCompleted":
    case "RunFailed":
    case "RunInterrupted": {
      const payload = eventPayload<RunCompletedPayload | RunFailedPayload | RunInterruptedPayload>(
        item,
      );
      const activeRunIds = new Set(state.activeRunIds);
      activeRunIds.delete(payload.runId);
      return { ...state, activeRunIds, error: errorMessage(payload) ?? state.error, lastSeq };
    }
    case "InferenceStarted": {
      const payload = eventPayload<InferenceStartedPayload>(item);
      return {
        ...state,
        activeInferenceId: payload.inferenceId,
        error: null,
        lastSeq,
        liveText: "",
      };
    }
    case "InferenceFailed":
    case "TurnFailed":
    case "CommandFailed":
      return { ...state, error: errorMessage(event.payload) ?? state.error, lastSeq };
    case "TextDelta": {
      const payload = eventPayload<TextDeltaPayload>(item);
      return { ...state, liveText: `${state.liveText}${payload.delta}` };
    }
    case "ToolParamsStart": {
      const payload = eventPayload<ToolParamsStartPayload>(item);
      const tools = new Map(state.tools);
      tools.set(payload.toolCallId, {
        inferenceId: state.activeInferenceId ?? undefined,
        input: {},
        seq: position.seq,
        state: "loading",
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        type: "tool",
      });
      return { ...state, tools };
    }
    case "ToolParamsDelta": {
      const payload = eventPayload<ToolParamsDeltaPayload>(item);
      const existing = state.tools.get(payload.toolCallId);
      if (!existing) {
        return state;
      }
      const current = typeof existing.input === "string" ? existing.input : "";
      const tools = new Map(state.tools);
      tools.set(payload.toolCallId, { ...existing, input: `${current}${payload.delta}` });
      return { ...state, tools };
    }
    case "ToolCallCreated": {
      const payload = eventPayload<ToolCallCreatedPayload>(item);
      const tools = new Map(state.tools);
      const existing = tools.get(payload.toolCallId);
      tools.set(payload.toolCallId, {
        ...existing,
        inferenceId: payload.inferenceId,
        input: payload.promptPart.params,
        seq: position.seq,
        state: "loading",
        toolCallId: payload.toolCallId,
        toolName: payload.promptPart.name,
        type: "tool",
      });
      return { ...state, lastSeq, tools };
    }
    case "ToolCallStarted": {
      const payload = eventPayload<ToolCallStartedPayload>(item);
      const existing = state.tools.get(payload.toolCallId);
      if (!existing) {
        return { ...state, lastSeq };
      }
      const tools = new Map(state.tools);
      tools.set(payload.toolCallId, { ...existing, state: "streaming" });
      return { ...state, lastSeq, tools };
    }
    case "ToolCallCompleted": {
      const payload = eventPayload<ToolCallCompletedPayload>(item);
      const existing = state.tools.get(payload.toolCallId);
      if (!existing) {
        return { ...state, lastSeq };
      }
      const tools = new Map(state.tools);
      tools.set(payload.toolCallId, {
        ...existing,
        output: payload.promptPart.result,
        state: "complete",
      });
      return { ...state, lastSeq, tools };
    }
    case "ToolCallRejected": {
      const payload = eventPayload<ToolCallRejectedPayload>(item);
      const existing = state.tools.get(payload.toolCallId);
      if (!existing) {
        return { ...state, lastSeq };
      }
      const tools = new Map(state.tools);
      tools.set(payload.toolCallId, {
        ...existing,
        error: payload.promptPart.result.message,
        output: payload.promptPart.result,
        state: "error",
      });
      return { ...state, lastSeq, tools };
    }
    case "ToolCallFailed": {
      const payload = eventPayload<ToolCallFailedPayload>(item);
      const existing = state.tools.get(payload.toolCallId);
      if (!existing) {
        return { ...state, lastSeq };
      }
      const tools = new Map(state.tools);
      tools.set(payload.toolCallId, {
        ...existing,
        error: errorMessage(payload) ?? "Tool execution failed.",
        output: payload.promptPart.result,
        state: "error",
      });
      return { ...state, lastSeq, tools };
    }
    default:
      return { ...state, lastSeq };
  }
};

export const applyEdaCoachEvents = (
  state: EdaCoachProjectionState,
  events: readonly CoachPositionedEvent[],
): EdaCoachProjectionState => {
  let next = state;
  for (const item of events) {
    next = applyEvent(next, item);
  }
  return next;
};

export const projectEdaCoachMessages = (
  state: EdaCoachProjectionState,
): readonly CoachMessage[] => {
  const tools = [...state.tools.values()];
  const messages = [...state.messages.values()].map((message) => ({
    ...message,
    parts:
      message.role !== "assistant" || !message.inferenceId
        ? message.parts
        : [
            ...message.parts,
            ...tools
              .filter((tool) => tool.inferenceId === message.inferenceId)
              .sort((left, right) => left.seq - right.seq),
          ],
  }));

  if (
    state.activeInferenceId &&
    (state.liveText || tools.some((tool) => tool.inferenceId === state.activeInferenceId))
  ) {
    messages.push({
      id: `live:${state.activeInferenceId}`,
      inferenceId: state.activeInferenceId,
      parts: [
        ...(state.liveText ? [{ text: state.liveText, type: "text" as const }] : []),
        ...tools
          .filter((tool) => tool.inferenceId === state.activeInferenceId)
          .sort((left, right) => left.seq - right.seq),
      ],
      role: "assistant",
      seq: Number.MAX_SAFE_INTEGER,
    });
  }

  return messages.sort((left, right) => left.seq - right.seq);
};
