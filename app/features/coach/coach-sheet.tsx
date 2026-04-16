import {
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
  BotIcon,
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
import { startTransition, useEffect, useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { WorkoutAgentTarget } from "~/features/workouts/contracts";
import { cn } from "~/lib/utils";

interface CoachSheetProps {
  isOpen: boolean;
  onClose: () => void;
  target: WorkoutAgentTarget;
}

const SHEET_CLOSE_DRAG_THRESHOLD_PX = 120;
const TOOL_SUMMARY_LIMIT = 3;
const historyValueFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

type CoachMessagePart = UIMessage["parts"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getTextPartText(part: CoachMessagePart) {
  if (part.type !== "text") {
    return null;
  }

  const text = part.text.trim();

  return text.length > 0 ? text : null;
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

function formatHistoryValue(value: unknown, unit: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "number") {
    return "No result";
  }

  const formattedValue = historyValueFormatter.format(value);

  switch (unit) {
    case "count":
      return formattedValue;
    case "e1rm_lbs":
      return `${formattedValue} lb e1RM`;
    case "load_lbs":
      return `${formattedValue} lb`;
    case "reps":
      return `${formattedValue} reps`;
    case "volume_lbs":
      return `${formattedValue} lb total`;
    default:
      return formattedValue;
  }
}

function formatToolJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatCompareDelta(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const prefix = value > 0 ? "+" : "";

  return `${prefix}${historyValueFormatter.format(value)}`;
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
          .flatMap((item) =>
            isRecord(item) && typeof item.summary === "string" ? [item.summary] : [],
          )
          .slice(0, TOOL_SUMMARY_LIMIT)
      : [];
    const totalApplied = Array.isArray(output.applied) ? output.applied.length : 0;
    const version = typeof output.version === "number" ? output.version : null;

    return (
      <div className="grid gap-2">
        {applied.length > 0 ? (
          <ul className="grid gap-1.5 text-sm">
            {applied.map((summary) => (
              <li className="flex items-start gap-2" key={summary}>
                <CheckCircle2Icon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                />
                <span>{summary}</span>
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
    const metric = formatHistoryMetric(output.metric);
    const value = formatHistoryValue(output.result.value, output.result.unit);
    const sampleSize =
      typeof output.result.sampleSize === "number" ? output.result.sampleSize : null;
    const delta = isRecord(output.compare) ? formatCompareDelta(output.compare.delta) : null;
    const sessions = Array.isArray(output.result.sessions)
      ? output.result.sessions
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
                date: shortDateFormatter.format(new Date(session.date)),
                title: session.title,
                value:
                  typeof session.value === "number"
                    ? historyValueFormatter.format(session.value)
                    : null,
              },
            ];
          })
          .slice(0, TOOL_SUMMARY_LIMIT)
      : [];

    return (
      <div className="grid gap-2">
        <div className="grid gap-0.5">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">{metric}</p>
          <p className="font-medium text-base text-foreground">{value}</p>
        </div>
        {sampleSize == null ? null : (
          <p className="text-muted-foreground text-xs">
            {sampleSize} matching session{sampleSize === 1 ? "" : "s"}
            {delta ? ` • ${delta} vs comparison window` : ""}
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
                  {session.value ? `${session.value} • ` : ""}
                  {session.date}
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
  part: CoachMessagePart,
  key: string,
) {
  const text = getTextPartText(part);

  if (text) {
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
    <div className="mr-8 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-destructive/10 p-2 text-destructive">
          <AlertTriangleIcon aria-hidden className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">Coach unavailable</p>
          <p className="mt-1 text-muted-foreground">{message}</p>
        </div>
        <Button onClick={onDismiss} size="sm" type="button" variant="outline">
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
        agent: "WorkoutCoachAgent",
        emptyState: "Ask about this workout. The discussion stays attached to the current session.",
        placeholder: "Ask about progress, next sets, or exercise context",
      } as const;
    case "general":
    default:
      return {
        agent: "GeneralCoachAgent",
        emptyState: "Ask for planning or general coaching guidance.",
        placeholder: "Ask about planning, structure, or next steps",
      } as const;
  }
}

export function CoachSheet({ isOpen, onClose, target }: CoachSheetProps) {
  const [draft, setDraft] = useState("");
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const agentConfig = getAgentConfig(target);
  const dragStartYRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  const discussionEndRef = useRef<HTMLDivElement | null>(null);
  const agent = useAgent({
    agent: agentConfig.agent,
    enabled: isOpen,
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
  } = useAgentChat({ agent });
  const isSubmitting = status === "submitted";
  const isBusy = isSubmitting || isStreaming;
  const chatErrorMessage = error ? getChatErrorMessage(error) : null;

  const scrollDiscussionToTail = () => {
    discussionEndRef.current?.scrollIntoView({
      block: "end",
    });
  };

  useEffect(() => {
    setDraft("");
    clearError();
  }, [clearError, target.instanceName, target.kind]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollDiscussionToTail();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOpen, messages, status, target.instanceName, target.kind]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    dragStartYRef.current = null;
    didDragRef.current = false;
    setDragOffset(0);
    setIsDragging(false);
  }, [isOpen]);

  const sheetTransform = isOpen ? `translateY(${dragOffset}px)` : "translateY(calc(100% + 1.5rem))";
  const handleClearThread = () => {
    void stop();
    clearError();
    clearHistory();
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

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 transition-transform ease-out sm:px-6 lg:px-8",
        isDragging ? "duration-0" : "duration-300",
      )}
      style={{ transform: sheetTransform }}
    >
      <section className="pointer-events-auto flex h-[60dvh] w-full max-w-7xl flex-col overflow-hidden rounded-t-[2rem] border border-border/80 border-b-0 bg-card/95 shadow-[0_-24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="px-4 pb-2 pt-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Button
              className="justify-self-start rounded-full"
              disabled={!isOpen}
              onClick={handleClearThread}
              size="sm"
              type="button"
              variant="outline"
            >
              <EraserIcon />
              Clear
            </Button>

            <button
              aria-label="Drag or tap to close coach"
              className="flex touch-none justify-self-center rounded-full px-4 py-1"
              onPointerCancel={() => {
                dragStartYRef.current = null;
                didDragRef.current = false;
                setDragOffset(0);
                setIsDragging(false);
              }}
              onPointerDown={(event) => {
                if (!isOpen) {
                  return;
                }

                dragStartYRef.current = event.clientY;
                didDragRef.current = false;
                setDragOffset(0);
                setIsDragging(true);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const dragStartY = dragStartYRef.current;

                if (dragStartY == null) {
                  return;
                }

                const nextOffset = Math.max(0, event.clientY - dragStartY);

                if (nextOffset > 4) {
                  didDragRef.current = true;
                }

                setDragOffset(nextOffset);
              }}
              onPointerUp={(event) => {
                const dragStartY = dragStartYRef.current;

                if (dragStartY == null) {
                  return;
                }

                event.currentTarget.releasePointerCapture(event.pointerId);
                dragStartYRef.current = null;
                setIsDragging(false);

                const shouldClose =
                  dragOffset >= SHEET_CLOSE_DRAG_THRESHOLD_PX || !didDragRef.current;

                didDragRef.current = false;
                setDragOffset(0);

                if (shouldClose) {
                  onClose();
                }
              }}
              type="button"
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
            {isBusy ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-primary text-xs">
                <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />
                <span>{activityStatusLabel}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid min-h-full content-start gap-3">
              {messages.length === 0 && !chatErrorMessage ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-relaxed">
                  {agentConfig.emptyState}
                </div>
              ) : (
                messages.map((message) => {
                  const renderedParts = message.parts
                    .map((part, index) =>
                      renderMessagePart(
                        (approvalId, approved) => {
                          addToolApprovalResponse({ approved, id: approvalId });
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
                        "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                        message.role === "user"
                          ? "ml-8 bg-primary text-primary-foreground"
                          : "mr-8 border border-border/70 bg-background/70 text-foreground shadow-sm",
                      )}
                      key={message.id}
                    >
                      <p className="mb-1 flex items-center gap-2 font-medium text-[11px] uppercase tracking-[0.12em] opacity-75">
                        {message.role === "assistant" ? (
                          <BotIcon aria-hidden className="size-3.5" />
                        ) : null}
                        {message.role === "user" ? "You" : "Coach"}
                      </p>
                      <div className="grid gap-3">{renderedParts}</div>
                    </div>
                  );
                })
              )}
              {chatErrorMessage ? (
                <CoachErrorCard message={chatErrorMessage} onDismiss={clearError} />
              ) : null}
              <div aria-hidden className="h-px w-full" ref={discussionEndRef} />
            </div>
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
                disabled={!isOpen || isBusy}
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
                disabled={!isOpen || draft.trim().length === 0 || isBusy}
                size="lg"
                type="submit"
              >
                <SendHorizontalIcon />
                Send
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
