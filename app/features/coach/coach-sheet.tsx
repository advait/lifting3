import {
  getToolCallId,
  getToolApproval,
  getToolInput,
  getToolOutput,
  getToolPartState,
  useAgentChat,
} from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useAgent } from "agents/react";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  CalendarIcon,
  CheckCircle2Icon,
  DumbbellIcon,
  EraserIcon,
  HistoryIcon,
  LoaderCircleIcon,
  SendHorizontalIcon,
  Settings2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { Streamdown } from "streamdown";

import { LocalDateTime } from "~/components/atoms/local-date-time";
import { Badge } from "~/components/atoms/badge";
import { Button } from "~/components/atoms/button";
import { publishAppEvent } from "~/features/app-events/client";
import { type AppEventEnvelope, appInvalidateKeySchema } from "~/features/app-events/schema";
import type { WorkoutAgentTarget } from "~/features/workouts/contracts";
import { cn } from "~/lib/utils";

interface CoachSheetProps {
  isOpen: boolean;
  onClose: () => void;
  target: WorkoutAgentTarget;
}

const SHEET_CLOSE_DRAG_THRESHOLD_PX = 120;
const SHEET_RESIZE_DRAG_THRESHOLD_PX = 72;
const SHEET_TRANSITION_MS = 300;
const SHEET_COLLAPSED_HEIGHT = "60dvh";
const SHEET_EXPANDED_HEIGHT = "92dvh";
const SHEET_MAX_UPWARD_DRAG_PX = 160;
const SHEET_MAX_DOWNWARD_DRAG_PX = 160;
const TOOL_SUMMARY_LIMIT = 3;
const COACH_AGENT_RUNTIME_NAME = "CoachAgent";

type CoachMessagePart = UIMessage["parts"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseInvalidateKeys(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const parsedKeys = value.flatMap((item) => {
    const parsedKey = appInvalidateKeySchema.safeParse(item);

    return parsedKey.success ? [parsedKey.data] : [];
  });

  return parsedKeys.length === value.length ? parsedKeys : null;
}

async function getInitialCoachMessages({ url }: { url: string }): Promise<UIMessage[]> {
  try {
    const getMessagesUrl = new URL(url);

    getMessagesUrl.pathname += "/get-messages";

    const response = await fetch(getMessagesUrl.toString());

    if (!response.ok) {
      return [];
    }

    const text = await response.text();

    if (!text.trim()) {
      return [];
    }

    const parsedMessages = JSON.parse(text);

    return Array.isArray(parsedMessages) ? parsedMessages : [];
  } catch {
    return [];
  }
}

function parseToolMutationEnvelope(
  toolName: string,
  toolCallId: string,
  output: unknown,
): AppEventEnvelope | null {
  if (!isRecord(output) || output.ok !== true) {
    return null;
  }

  const invalidate = parseInvalidateKeys(output.invalidate);
  const workoutId = typeof output.workoutId === "string" ? output.workoutId : null;
  const version = typeof output.version === "number" ? output.version : null;

  if (!invalidate || !workoutId || version == null) {
    return null;
  }

  switch (toolName) {
    case "create_workout":
      return {
        eventId: `${workoutId}-v${version}-workout_created-${toolCallId}`,
        invalidate,
        type: "workout_created",
        version,
        workoutId,
      };
    case "patch_workout":
      return {
        eventId: `${workoutId}-v${version}-workout_updated-${toolCallId}`,
        invalidate,
        type: "workout_updated",
        version,
        workoutId,
      };
    default:
      return null;
  }
}

function getTextPartText(part: CoachMessagePart) {
  if (part.type !== "text") {
    return null;
  }

  const text = part.text;

  return text.trim().length > 0 ? text : null;
}

function getToolLabel(toolName: string) {
  switch (toolName) {
    case "create_workout":
      return "Create workout";
    case "patch_workout":
      return "Update workout";
    case "query_history":
      return "Query history";
    case "set_user_profile":
      return "Save profile";
    default:
      return toolName.replaceAll("_", " ");
  }
}

function getToolStatusLabel(state: ReturnType<typeof getToolPartState>, toolName: string) {
  switch (state) {
    case "complete":
      return "Done";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "error":
      return "Error";
    case "loading":
      return toolName === "patch_workout" ? "Queued" : "Pending";
    case "streaming":
      return toolName === "patch_workout" ? "Applying" : "Running";
    case "waiting-approval":
      return "Needs approval";
    default:
      return "Pending";
  }
}

function getToolStatusVariant(state: ReturnType<typeof getToolPartState>) {
  switch (state) {
    case "complete":
      return "secondary" as const;
    case "error":
      return "destructive" as const;
    case "denied":
      return "outline" as const;
    case "waiting-approval":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case "create_workout":
      return CalendarIcon;
    case "patch_workout":
      return DumbbellIcon;
    case "query_history":
      return HistoryIcon;
    case "set_user_profile":
      return Settings2Icon;
    default:
      return WrenchIcon;
  }
}

function isToolRunningState(state: ReturnType<typeof getToolPartState>) {
  return state === "loading" || state === "streaming";
}

function formatToolJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatHistoryMetric(metric: unknown) {
  switch (metric) {
    case "best_session":
      return "Best session";
    case "e1rm":
      return "Estimated 1RM";
    case "frequency":
      return "Frequency";
    case "max_load":
      return "Max load";
    case "reps_at_load":
      return "Reps at load";
    case "top_set":
      return "Top set";
    case "volume":
      return "Volume";
    default:
      return "History";
  }
}

function renderUnknownToolResult(output: unknown) {
  return (
    <details className="grid gap-2">
      <summary className="cursor-pointer font-medium text-foreground">View tool details</summary>
      <pre className="overflow-x-auto rounded-lg bg-background/80 p-3 text-[11px] leading-relaxed">
        {formatToolJson(output)}
      </pre>
    </details>
  );
}

function renderCreateWorkoutToolBody(
  state: ReturnType<typeof getToolPartState>,
  input: unknown,
  output: unknown,
) {
  if (state === "loading" || state === "streaming") {
    const title = isRecord(input) && typeof input.title === "string" ? input.title : null;

    return (
      <p className="text-muted-foreground text-sm">
        {title ? `Building "${title}"...` : "Building a planned workout..."}
      </p>
    );
  }

  if (!isRecord(output)) {
    return renderUnknownToolResult(output);
  }

  if (output.ok === true) {
    const title = typeof output.title === "string" ? output.title : "Planned workout";
    const exerciseCount = typeof output.exerciseCount === "number" ? output.exerciseCount : null;
    const workoutUrl = typeof output.workoutUrl === "string" ? output.workoutUrl : null;

    return (
      <div className="grid gap-2">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground text-sm">
          {exerciseCount == null
            ? "Created a planned workout."
            : `Created with ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}.`}
        </p>
        {workoutUrl ? (
          <a className="font-medium text-sm underline underline-offset-4" href={workoutUrl}>
            Open workout
          </a>
        ) : null}
      </div>
    );
  }

  if (output.ok === false) {
    return (
      <p className="text-sm text-foreground">
        {typeof output.message === "string" ? output.message : "Unable to create the workout."}
      </p>
    );
  }

  return renderUnknownToolResult(output);
}

function renderPatchWorkoutToolBody(
  state: ReturnType<typeof getToolPartState>,
  input: unknown,
  output: unknown,
) {
  if (state === "loading" || state === "streaming") {
    const reason = isRecord(input) && typeof input.reason === "string" ? input.reason : null;
    const operationCount = isRecord(input) && Array.isArray(input.ops) ? input.ops.length : null;

    return (
      <div className="grid gap-1.5">
        <p className="text-muted-foreground text-sm">
          {reason ? `Applying: ${reason}` : "Applying workout changes..."}
        </p>
        {operationCount == null ? null : (
          <p className="text-muted-foreground text-xs">
            {operationCount} change{operationCount === 1 ? "" : "s"} requested
          </p>
        )}
      </div>
    );
  }

  if (!isRecord(output)) {
    return renderUnknownToolResult(output);
  }

  if (output.ok === true) {
    const applied = Array.isArray(output.applied)
      ? output.applied
          .flatMap((item, index) => {
            if (!isRecord(item) || typeof item.summary !== "string") {
              return [];
            }

            return [
              {
                key: `${index}:${item.summary}`,
                summary: item.summary,
              },
            ];
          })
          .slice(0, TOOL_SUMMARY_LIMIT)
      : [];
    const totalApplied = Array.isArray(output.applied) ? output.applied.length : 0;
    const version = typeof output.version === "number" ? output.version : null;

    return (
      <div className="grid gap-2">
        {applied.length > 0 ? (
          <ul className="grid gap-1.5 text-sm">
            {applied.map((item) => (
              <li className="flex items-start gap-2" key={item.key}>
                <CheckCircle2Icon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                />
                <span>{item.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground">Workout updated.</p>
        )}
        {totalApplied > TOOL_SUMMARY_LIMIT ? (
          <p className="text-muted-foreground text-xs">
            +{totalApplied - TOOL_SUMMARY_LIMIT} more change
            {totalApplied - TOOL_SUMMARY_LIMIT === 1 ? "" : "s"}
          </p>
        ) : null}
        {version == null ? null : (
          <p className="text-muted-foreground text-xs">Saved as workout version {version}.</p>
        )}
      </div>
    );
  }

  if (output.ok === false) {
    const currentVersion = typeof output.currentVersion === "number" ? output.currentVersion : null;

    return (
      <div className="grid gap-1.5">
        <p className="text-sm text-foreground">
          {typeof output.message === "string" ? output.message : "Unable to update the workout."}
        </p>
        {currentVersion == null ? null : (
          <p className="text-muted-foreground text-xs">Latest saved version: {currentVersion}</p>
        )}
      </div>
    );
  }

  return renderUnknownToolResult(output);
}

function renderQueryHistoryToolBody(
  state: ReturnType<typeof getToolPartState>,
  input: unknown,
  output: unknown,
) {
  if (state === "loading" || state === "streaming") {
    const metric =
      isRecord(input) && typeof input.metric === "string"
        ? formatHistoryMetric(input.metric)
        : null;

    return (
      <p className="text-muted-foreground text-sm">
        {metric ? `Looking up ${metric.toLowerCase()}...` : "Looking up workout history..."}
      </p>
    );
  }

  if (!isRecord(output)) {
    return renderUnknownToolResult(output);
  }

  if (output.ok === true && isRecord(output.result)) {
    const sessionCount =
      typeof output.result.sessionCount === "number"
        ? output.result.sessionCount
        : Array.isArray(output.result.sessions)
          ? output.result.sessions.length
          : null;
    const sessionsSource = Array.isArray(output.result.previewSessions)
      ? output.result.previewSessions
      : Array.isArray(output.result.sessions)
        ? output.result.sessions
        : [];
    const sessions = sessionsSource
      .flatMap((session) => {
        if (
          !isRecord(session) ||
          typeof session.date !== "string" ||
          typeof session.title !== "string"
        ) {
          return [];
        }

        return [
          {
            date: session.date,
            title: session.title,
          },
        ];
      })
      .slice(0, TOOL_SUMMARY_LIMIT);

    return (
      <div className="grid gap-2">
        {sessionCount == null ? null : (
          <p className="font-medium text-foreground text-sm">
            {sessionCount} matching session{sessionCount === 1 ? "" : "s"}
          </p>
        )}
        {sessions.length === 0 ? null : (
          <div className="grid gap-1.5">
            {sessions.map((session) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-2.5 py-2 text-xs"
                key={`${session.date}:${session.title}`}
              >
                <span className="min-w-0 truncate text-foreground">{session.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  <LocalDateTime
                    formatOptions={{ day: "numeric", month: "short" }}
                    value={session.date}
                    valueKind="calendar-date"
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (output.ok === false) {
    return (
      <p className="text-sm text-foreground">
        {typeof output.message === "string" ? output.message : "Unable to query history."}
      </p>
    );
  }

  return renderUnknownToolResult(output);
}

function renderSetUserProfileToolBody(
  state: ReturnType<typeof getToolPartState>,
  input: unknown,
  output: unknown,
) {
  if (state === "loading" || state === "streaming") {
    const isClearing = isRecord(input) && input.userProfile === null;

    return (
      <p className="text-muted-foreground text-sm">
        {isClearing ? "Clearing the saved user profile..." : "Saving the user profile..."}
      </p>
    );
  }

  if (!isRecord(output)) {
    return renderUnknownToolResult(output);
  }

  if (output.ok === true) {
    const isCleared = output.cleared === true;
    const savedProfile = typeof output.userProfile === "string" ? output.userProfile : null;

    return (
      <div className="grid gap-2">
        <p className="font-medium text-foreground">
          {isCleared
            ? "Cleared the saved user profile."
            : "Saved the user profile for future chats."}
        </p>
        {savedProfile ? (
          <pre className="overflow-x-auto rounded-lg bg-background/80 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
            {savedProfile}
          </pre>
        ) : null}
      </div>
    );
  }

  return renderUnknownToolResult(output);
}

function renderToolBody(
  toolName: string,
  state: ReturnType<typeof getToolPartState>,
  input: unknown,
  output: unknown,
) {
  switch (toolName) {
    case "create_workout":
      return renderCreateWorkoutToolBody(state, input, output);
    case "patch_workout":
      return renderPatchWorkoutToolBody(state, input, output);
    case "query_history":
      return renderQueryHistoryToolBody(state, input, output);
    case "set_user_profile":
      return renderSetUserProfileToolBody(state, input, output);
    default:
      if (state === "loading" || state === "streaming") {
        return <p className="text-muted-foreground text-sm">Running {getToolLabel(toolName)}...</p>;
      }

      return renderUnknownToolResult(output);
  }
}

function ToolPartCard({
  onApprovalResponse,
  part,
}: {
  onApprovalResponse: (approvalId: string, approved: boolean) => void;
  part: CoachMessagePart;
}) {
  if (!isToolUIPart(part)) {
    return null;
  }

  const toolName = getToolName(part);
  const toolLabel = getToolLabel(toolName);
  const toolState = getToolPartState(part);
  const input = getToolInput(part);
  const output = getToolOutput(part);
  const approval = getToolApproval(part);
  const Icon = getToolIcon(toolName);
  const isRunning = isToolRunningState(toolState);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/60 bg-muted/25 px-3 py-3 transition-colors",
        isRunning ? "border-primary/30 bg-primary/5" : null,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          aria-hidden
          className={cn(
            "size-4 text-muted-foreground",
            isRunning ? "animate-pulse text-primary" : null,
          )}
        />
        <p className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">{toolLabel}</p>
        <Badge variant={getToolStatusVariant(toolState)}>
          {getToolStatusLabel(toolState, toolName)}
        </Badge>
      </div>

      {renderToolBody(toolName, toolState, input, output)}

      {toolState === "waiting-approval" && approval ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              onApprovalResponse(approval.id, true);
            }}
            size="sm"
            type="button"
          >
            Approve
          </Button>
          <Button
            onClick={() => {
              onApprovalResponse(approval.id, false);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function renderMessagePart(
  onApprovalResponse: (approvalId: string, approved: boolean) => void,
  options: {
    isAnimating: boolean;
    role: UIMessage["role"];
  },
  part: CoachMessagePart,
  key: string,
) {
  const text = getTextPartText(part);

  if (text) {
    if (options.role === "assistant") {
      return (
        <Streamdown
          className="text-sm leading-relaxed"
          isAnimating={options.isAnimating}
          key={key}
          mode={options.isAnimating ? "streaming" : "static"}
        >
          {text}
        </Streamdown>
      );
    }

    return (
      <p className="whitespace-pre-wrap" key={key}>
        {text}
      </p>
    );
  }

  if (isToolUIPart(part)) {
    return <ToolPartCard key={key} onApprovalResponse={onApprovalResponse} part={part} />;
  }

  return null;
}

function getChatErrorMessage(error: Error | undefined) {
  const message = error?.message?.trim();

  return message && message.length > 0 ? message : "The coach could not complete this request.";
}

function CoachErrorCard({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="w-full rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="shrink-0 rounded-full bg-destructive/10 p-2 text-destructive">
          <AlertTriangleIcon aria-hidden className="size-4" />
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-medium text-foreground">Coach unavailable</p>
          <p className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">
            {message}
          </p>
        </div>
        <Button
          className="w-full sm:w-auto sm:shrink-0"
          onClick={onDismiss}
          size="sm"
          type="button"
          variant="outline"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function getAgentConfig(target: WorkoutAgentTarget) {
  switch (target.kind) {
    case "workout":
      return {
        agent: COACH_AGENT_RUNTIME_NAME,
        emptyState: "Ask about this workout. The discussion stays attached to the current session.",
        placeholder: "Ask about progress, next sets, or exercise context",
      } as const;
    case "general":
    default:
      return {
        agent: COACH_AGENT_RUNTIME_NAME,
        emptyState: "Ask for planning or general coaching guidance.",
        placeholder: "Ask about planning, structure, or next steps",
      } as const;
  }
}

function CoachSheetHeader({
  activityStatusLabel,
  clearDisabled,
  dragHandleProps,
  isExpanded,
  onClear,
  onClose,
}: {
  activityStatusLabel?: string;
  clearDisabled: boolean;
  dragHandleProps: ComponentPropsWithoutRef<"button">;
  isExpanded: boolean;
  onClear?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="px-4 pb-2 pt-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Button
          className="justify-self-start rounded-full"
          disabled={clearDisabled}
          onClick={onClear}
          size="sm"
          type="button"
          variant="outline"
        >
          <EraserIcon />
          Clear
        </Button>

        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse coach sheet" : "Expand coach sheet"}
          className="flex touch-none justify-self-center rounded-full px-4 py-1"
          {...dragHandleProps}
        >
          <div className="h-1.5 w-14 rounded-full bg-foreground/15" />
        </button>

        <Button
          aria-label="Close coach"
          className="justify-self-end rounded-full"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>

      <div className="mt-3 flex min-h-6 items-center justify-center">
        {activityStatusLabel ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-primary text-xs">
            <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />
            <span>{activityStatusLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CoachSheetClosedContent({
  dragHandleProps,
  isExpanded,
  onClose,
  target,
}: {
  dragHandleProps: ComponentPropsWithoutRef<"button">;
  isExpanded: boolean;
  onClose: () => void;
  target: WorkoutAgentTarget;
}) {
  const agentConfig = getAgentConfig(target);

  return (
    <>
      <CoachSheetHeader
        clearDisabled
        dragHandleProps={dragHandleProps}
        isExpanded={isExpanded}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full content-start gap-3">
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-relaxed">
              {agentConfig.emptyState}
            </div>
            <div aria-hidden className="h-px w-full" />
          </div>
        </div>

        <form className="grid gap-3 border-border/70 border-t pt-3">
          <label className="sr-only" htmlFor="coach-sheet-message">
            Ask the coach
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <textarea
              className="min-h-28 resize-y rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              disabled
              id="coach-sheet-message"
              placeholder={agentConfig.placeholder}
              value=""
            />
            <Button className="w-full sm:w-auto" disabled size="lg" type="submit">
              <SendHorizontalIcon />
              Send
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function CoachSheetSessionContent({
  dragHandleProps,
  isExpanded,
  onClose,
  target,
}: {
  dragHandleProps: ComponentPropsWithoutRef<"button">;
  isExpanded: boolean;
  onClose: () => void;
  target: WorkoutAgentTarget;
}) {
  const [draft, setDraft] = useState("");
  const [isBottomLocked, setIsBottomLocked] = useState(true);
  const agentConfig = getAgentConfig(target);
  const discussionScrollRef = useRef<HTMLDivElement | null>(null);
  const discussionEndRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const observedToolStatesRef = useRef<Map<string, ReturnType<typeof getToolPartState>>>(new Map());
  const publishedToolEventIdsRef = useRef<Set<string>>(new Set());
  const hasObservedLiveAgentActivityRef = useRef(false);
  const agent = useAgent({
    agent: agentConfig.agent,
    name: target.instanceName,
  });
  const {
    addToolApprovalResponse,
    clearHistory,
    clearError,
    error,
    isServerStreaming,
    isStreaming,
    messages,
    sendMessage,
    status,
    stop,
  } = useAgentChat({
    agent,
    getInitialMessages: getInitialCoachMessages,
  });
  const isSubmitting = status === "submitted";
  const isBusy = isSubmitting || isStreaming;
  const chatErrorMessage = error ? getChatErrorMessage(error) : null;
  const publishToolMutationEvents = useEffectEvent((nextMessages: readonly UIMessage[]) => {
    const nextObservedToolStates = new Map<string, ReturnType<typeof getToolPartState>>();

    for (const message of nextMessages) {
      for (const part of message.parts) {
        if (!isToolUIPart(part)) {
          continue;
        }

        const toolCallId = getToolCallId(part);
        const toolState = getToolPartState(part);
        const previousToolState = observedToolStatesRef.current.get(toolCallId);
        const shouldPublishFromTransition =
          toolState === "complete" &&
          (previousToolState != null
            ? previousToolState !== "complete"
            : hasObservedLiveAgentActivityRef.current);

        if (shouldPublishFromTransition) {
          const envelope = parseToolMutationEnvelope(
            getToolName(part),
            toolCallId,
            getToolOutput(part),
          );

          if (envelope && !publishedToolEventIdsRef.current.has(envelope.eventId)) {
            publishedToolEventIdsRef.current.add(envelope.eventId);
            publishAppEvent(envelope);
          }
        }

        nextObservedToolStates.set(toolCallId, toolState);
      }
    }

    observedToolStatesRef.current = nextObservedToolStates;
  });

  const syncBottomLock = useEffectEvent((nextValue: boolean) => {
    setIsBottomLocked((currentValue) => (currentValue === nextValue ? currentValue : nextValue));
  });

  const isDiscussionTailVisible = useEffectEvent(() => {
    const discussionScroll = discussionScrollRef.current;
    const discussionEnd = discussionEndRef.current;

    if (!discussionScroll || !discussionEnd) {
      return true;
    }

    const scrollBounds = discussionScroll.getBoundingClientRect();
    const endBounds = discussionEnd.getBoundingClientRect();

    return endBounds.top <= scrollBounds.bottom && endBounds.bottom >= scrollBounds.top;
  });

  const releaseProgrammaticScrollLock = useEffectEvent(() => {
    if (programmaticScrollFrameRef.current != null) {
      window.cancelAnimationFrame(programmaticScrollFrameRef.current);
    }

    programmaticScrollFrameRef.current = window.requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
      syncBottomLock(isDiscussionTailVisible());
    });
  });

  const scrollDiscussionToTail = useEffectEvent((behavior: ScrollBehavior = "auto") => {
    if (!discussionEndRef.current) {
      return;
    }

    isProgrammaticScrollRef.current = true;
    discussionEndRef.current.scrollIntoView({
      behavior,
      block: "end",
    });
    releaseProgrammaticScrollLock();
  });

  const handleDiscussionScroll = useEffectEvent(() => {
    if (isProgrammaticScrollRef.current) {
      return;
    }

    syncBottomLock(isDiscussionTailVisible());
  });

  useEffect(() => {
    if (isBusy) {
      hasObservedLiveAgentActivityRef.current = true;
    }

    publishToolMutationEvents(messages);
  }, [isBusy, messages]);

  useEffect(() => {
    const discussionScroll = discussionScrollRef.current;
    const discussionEnd = discussionEndRef.current;

    if (!discussionScroll || !discussionEnd) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          syncBottomLock(true);
        }
      },
      {
        root: discussionScroll,
        threshold: 0.5,
      },
    );

    observer.observe(discussionEnd);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (programmaticScrollFrameRef.current != null) {
        window.cancelAnimationFrame(programmaticScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isBottomLocked) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollDiscussionToTail();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isBottomLocked, messages, status]);

  const handleClearThread = () => {
    void stop();
    clearError();
    clearHistory();
    observedToolStatesRef.current = new Map();
    publishedToolEventIdsRef.current = new Set();
    hasObservedLiveAgentActivityRef.current = false;
    setIsBottomLocked(true);
    setDraft("");
  };
  const activityStatusLabel = isSubmitting
    ? "Sending to coach"
    : isServerStreaming
      ? "Coach is working in the background"
      : "Coach is replying";

  const submitDraft = () => {
    const nextDraft = draft.trim();

    if (nextDraft.length === 0 || isBusy) {
      return;
    }

    clearError();
    setIsBottomLocked(true);
    setDraft("");
    startTransition(() => {
      void sendMessage({
        parts: [{ text: nextDraft, type: "text" }],
        role: "user",
      }).catch(() => {
        setDraft(nextDraft);
      });
    });
  };
  const jumpToBottom = () => {
    setIsBottomLocked(true);
    scrollDiscussionToTail();
  };
  const showJumpToBottomButton = messages.length > 0 && !isBottomLocked;

  return (
    <>
      <CoachSheetHeader
        activityStatusLabel={isBusy ? activityStatusLabel : undefined}
        clearDisabled={false}
        dragHandleProps={dragHandleProps}
        isExpanded={isExpanded}
        onClear={handleClearThread}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
        <div className="relative min-h-0 flex-1">
          <div
            className="min-h-0 h-full overflow-y-auto"
            onScroll={handleDiscussionScroll}
            ref={discussionScrollRef}
          >
            <div className="grid min-h-full content-start gap-3">
              {messages.length === 0 && !chatErrorMessage ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-relaxed">
                  {agentConfig.emptyState}
                </div>
              ) : (
                messages.map((message) => {
                  const isAnimatingAssistantMessage =
                    message.role === "assistant" &&
                    isStreaming &&
                    message.id === messages.at(-1)?.id;
                  const renderedParts = message.parts
                    .map((part, index) =>
                      renderMessagePart(
                        (approvalId, approved) => {
                          addToolApprovalResponse({ approved, id: approvalId });
                        },
                        {
                          isAnimating: isAnimatingAssistantMessage,
                          role: message.role,
                        },
                        part,
                        `${message.id}:${part.type}:${index}`,
                      ),
                    )
                    .filter((part) => part !== null);

                  if (renderedParts.length === 0) {
                    return null;
                  }

                  return (
                    <div
                      className={cn(
                        "text-sm leading-relaxed",
                        message.role === "user"
                          ? "ml-8 rounded-2xl bg-primary px-4 py-3 text-primary-foreground"
                          : "w-full text-foreground",
                      )}
                      key={message.id}
                    >
                      <div className="grid gap-3">{renderedParts}</div>
                    </div>
                  );
                })
              )}
              {chatErrorMessage ? (
                <CoachErrorCard message={chatErrorMessage} onDismiss={clearError} />
              ) : null}
              <div aria-hidden className="h-4 w-full" ref={discussionEndRef} />
            </div>
          </div>
          {showJumpToBottomButton ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
              <Button
                aria-label="Jump to latest coach messages"
                className="pointer-events-auto size-11 rounded-full border-border/70 bg-background/55 text-foreground shadow-[0_18px_36px_rgba(0,0,0,0.24)] backdrop-blur-xl hover:bg-background/72"
                onClick={jumpToBottom}
                size="icon-lg"
                type="button"
                variant="outline"
              >
                <ArrowDownIcon />
              </Button>
            </div>
          ) : null}
        </div>

        <form
          className="grid gap-3 border-border/70 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitDraft();
          }}
        >
          <label className="sr-only" htmlFor="coach-sheet-message">
            Ask the coach
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <textarea
              className="min-h-28 resize-y rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              disabled={isBusy}
              id="coach-sheet-message"
              onChange={(event) => {
                setDraft(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                  return;
                }

                event.preventDefault();
                submitDraft();
              }}
              placeholder={agentConfig.placeholder}
              value={draft}
            />
            <Button
              className="w-full sm:w-auto"
              disabled={draft.trim().length === 0 || isBusy}
              size="lg"
              type="submit"
            >
              <SendHorizontalIcon />
              Send
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

export function CoachSheet({ isOpen, onClose, target }: CoachSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [renderedOpen, setRenderedOpen] = useState(isOpen);
  const dragStartYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const didDragRef = useRef(false);
  const suppressHandleClickRef = useRef(false);
  const threadKey = `${target.kind}:${target.instanceName}`;

  useEffect(() => {
    if (isOpen) {
      setRenderedOpen(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRenderedOpen(false);
      setIsExpanded(false);
    }, SHEET_TRANSITION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    dragStartYRef.current = null;
    dragOffsetRef.current = 0;
    didDragRef.current = false;
    suppressHandleClickRef.current = false;
    setDragOffset(0);
    setIsDragging(false);
  }, [isOpen]);

  const dragHandleProps: ComponentPropsWithoutRef<"button"> = {
    onPointerCancel: () => {
      dragStartYRef.current = null;
      dragOffsetRef.current = 0;
      didDragRef.current = false;
      suppressHandleClickRef.current = false;
      setDragOffset(0);
      setIsDragging(false);
    },
    onClick: (event) => {
      if (suppressHandleClickRef.current) {
        suppressHandleClickRef.current = false;
        event.preventDefault();
        return;
      }

      if (!isOpen) {
        return;
      }

      setIsExpanded((currentValue) => !currentValue);
    },
    onPointerDown: (event) => {
      if (!isOpen) {
        return;
      }

      dragStartYRef.current = event.clientY;
      dragOffsetRef.current = 0;
      didDragRef.current = false;
      suppressHandleClickRef.current = false;
      setDragOffset(0);
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      const dragStartY = dragStartYRef.current;

      if (dragStartY == null) {
        return;
      }

      const nextOffset = Math.max(
        -SHEET_MAX_UPWARD_DRAG_PX,
        Math.min(event.clientY - dragStartY, SHEET_MAX_DOWNWARD_DRAG_PX),
      );

      if (Math.abs(nextOffset) > 4) {
        didDragRef.current = true;
      }

      dragOffsetRef.current = nextOffset;
      setDragOffset(nextOffset);
    },
    onPointerUp: (event) => {
      const dragStartY = dragStartYRef.current;

      if (dragStartY == null) {
        return;
      }

      event.currentTarget.releasePointerCapture(event.pointerId);
      dragStartYRef.current = null;
      setIsDragging(false);

      const nextDragOffset = dragOffsetRef.current;
      const didDrag = didDragRef.current;

      suppressHandleClickRef.current = didDrag;
      dragOffsetRef.current = 0;
      didDragRef.current = false;

      setDragOffset(0);

      if (nextDragOffset <= -SHEET_RESIZE_DRAG_THRESHOLD_PX && !isExpanded) {
        setIsExpanded(true);
        return;
      }

      if (nextDragOffset >= SHEET_RESIZE_DRAG_THRESHOLD_PX && isExpanded) {
        setIsExpanded(false);
        return;
      }

      if (nextDragOffset >= SHEET_CLOSE_DRAG_THRESHOLD_PX) {
        onClose();
      }
    },
    type: "button",
  };
  const sheetTransform = isOpen ? `translateY(${dragOffset}px)` : "translateY(calc(100% + 1.5rem))";
  const sheetHeight = isExpanded ? SHEET_EXPANDED_HEIGHT : SHEET_COLLAPSED_HEIGHT;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 transition-transform ease-out sm:px-6 lg:px-8",
        isDragging ? "duration-0" : "duration-300",
      )}
      style={{ transform: sheetTransform }}
    >
      <section
        className={cn(
          "pointer-events-auto flex w-full max-w-7xl flex-col overflow-hidden rounded-t-[2rem] border border-border/80 border-b-0 bg-card/95 shadow-[0_-24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-[height] ease-out",
          isDragging ? "duration-0" : "duration-300",
        )}
        style={{ height: sheetHeight }}
      >
        {renderedOpen ? (
          <CoachSheetSessionContent
            dragHandleProps={dragHandleProps}
            isExpanded={isExpanded}
            key={threadKey}
            onClose={onClose}
            target={target}
          />
        ) : (
          <CoachSheetClosedContent
            dragHandleProps={dragHandleProps}
            isExpanded={isExpanded}
            onClose={onClose}
            target={target}
          />
        )}
      </section>
    </div>
  );
}
