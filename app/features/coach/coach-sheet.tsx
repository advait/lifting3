import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { BotIcon, SendHorizontalIcon } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import type { WorkoutAgentTarget } from "~/features/workouts/contracts";
import { cn } from "~/lib/utils";

interface CoachSheetProps {
  isOpen: boolean;
  onClose: () => void;
  target: WorkoutAgentTarget;
}

const SHEET_CLOSE_DRAG_THRESHOLD_PX = 120;

function getMessageText(parts: ReadonlyArray<{ type: string; text?: string }>) {
  const text = parts
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("")
    .trim();

  return text.length > 0 ? text : null;
}

function getAgentConfig(target: WorkoutAgentTarget) {
  switch (target.kind) {
    case "workout":
      return {
        agent: "WorkoutCoachAgent",
        emptyState: "Ask about this workout. The discussion stays attached to the current session.",
        footerHint: "Workout coach thread",
        placeholder: "Ask about progress, next sets, or exercise context",
      } as const;
    case "general":
    default:
      return {
        agent: "GeneralCoachAgent",
        emptyState: "Ask for planning or general coaching guidance.",
        footerHint: "General coach thread",
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
  const { messages, sendMessage, status } = useAgentChat({ agent });
  const isBusy = status === "streaming" || status === "submitted";

  const scrollDiscussionToTail = () => {
    discussionEndRef.current?.scrollIntoView({
      block: "end",
    });
  };

  useEffect(() => {
    setDraft("");
  }, [target.instanceName, target.kind]);

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
  const submitDraft = () => {
    const nextDraft = draft.trim();

    if (nextDraft.length === 0 || isBusy) {
      return;
    }

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
        <button
          aria-label="Close coach"
          className="flex justify-center px-4 pb-2 pt-3 touch-none"
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

            const shouldClose = dragOffset >= SHEET_CLOSE_DRAG_THRESHOLD_PX || !didDragRef.current;

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

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid min-h-full content-start gap-3">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-4 text-muted-foreground text-sm leading-relaxed">
                  {agentConfig.emptyState}
                </div>
              ) : (
                messages.map((message) => {
                  const messageText = getMessageText(message.parts);

                  if (!messageText) {
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
                      <p className="whitespace-pre-wrap">{messageText}</p>
                    </div>
                  );
                })
              )}
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
            <p className="text-muted-foreground text-xs">
              {isBusy
                ? "Coach is replying..."
                : `${agentConfig.footerHint}. History persists by thread.`}
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
