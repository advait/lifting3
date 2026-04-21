import { BugIcon, FastForwardIcon, PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { useEffect, useEffectEvent, useState, type ComponentPropsWithoutRef } from "react";
import type { UIMessage } from "ai";

import { Badge } from "~/components/atoms/badge";
import { Button } from "~/components/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/card";
import {
  CoachSheetSessionPanel,
  type CoachSheetChatController,
} from "~/features/coach/coach-sheet";
import {
  createCoachSheetFixtureCompletedSnapshot,
  createCoachSheetFixtureSnapshot,
  DEFAULT_FIXTURE_TOOL_COUNT,
  DEFAULT_FIXTURE_UPDATES_PER_TOOL,
  DEFAULT_FIXTURE_USER_TEXT,
  getCoachSheetFixtureTotalSteps,
} from "~/features/coach/coach-sheet-fixture";
import { createGeneralCoachTarget } from "~/features/coach/contracts";

const FIXTURE_DRAG_HANDLE_PROPS = {
  type: "button",
} satisfies ComponentPropsWithoutRef<"button">;

const FIXTURE_PLAYBACK_DELAY_MS = 45;
const FIXTURE_TARGET = createGeneralCoachTarget();

function parsePositiveInteger(value: string, fallbackValue: number) {
  const parsedValue = Number.parseInt(value, 10);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function getSubmittedMessageText(message: Pick<UIMessage, "parts">) {
  for (const part of message.parts) {
    if (part.type === "text" && part.text.trim().length > 0) {
      return part.text.trim();
    }
  }

  return DEFAULT_FIXTURE_USER_TEXT;
}

export function CoachSheetFixtureScreen() {
  const [toolCount, setToolCount] = useState(DEFAULT_FIXTURE_TOOL_COUNT);
  const [updatesPerTool, setUpdatesPerTool] = useState(DEFAULT_FIXTURE_UPDATES_PER_TOOL);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<CoachSheetChatController["status"]>("ready");
  const [isPlaying, setIsPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [userText, setUserText] = useState(DEFAULT_FIXTURE_USER_TEXT);
  const totalSteps = getCoachSheetFixtureTotalSteps({
    toolCount,
    updatesPerTool,
    userText,
  });
  const isStreaming = status === "streaming";
  const completedTools = Math.min(Math.floor(step / updatesPerTool), toolCount);

  const applySnapshot = useEffectEvent((nextStep: number, nextUserText = userText) => {
    setMessages(
      createCoachSheetFixtureSnapshot({
        step: nextStep,
        toolCount,
        updatesPerTool,
        userText: nextUserText,
      }),
    );
    setStatus("streaming");
    setStep(nextStep);
    setUserText(nextUserText);
  });

  const completeFixture = useEffectEvent((nextUserText = userText) => {
    setMessages(
      createCoachSheetFixtureCompletedSnapshot({
        toolCount,
        userText: nextUserText,
      }),
    );
    setIsPlaying(false);
    setStatus("ready");
    setStep(totalSteps);
    setUserText(nextUserText);
  });

  const resetFixture = useEffectEvent(() => {
    setIsPlaying(false);
    setMessages([]);
    setStatus("ready");
    setStep(0);
  });

  const startFixture = useEffectEvent((nextUserText = userText) => {
    setIsPlaying(true);
    applySnapshot(0, nextUserText);
  });

  const advanceFixture = useEffectEvent(() => {
    if (messages.length === 0) {
      startFixture();
      return;
    }

    const nextStep = step + 1;

    if (nextStep >= totalSteps) {
      completeFixture();
      return;
    }

    applySnapshot(nextStep);
  });

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextStep = step + 1;

      if (nextStep >= totalSteps) {
        completeFixture();
        return;
      }

      applySnapshot(nextStep);
    }, FIXTURE_PLAYBACK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [applySnapshot, completeFixture, isPlaying, step, totalSteps]);

  const chatController: CoachSheetChatController = {
    addToolApprovalResponse: () => {},
    clearError: () => {},
    clearHistory: () => {
      resetFixture();
    },
    error: undefined,
    isServerStreaming: false,
    isStreaming,
    messages,
    sendMessage: async (message) => {
      startFixture(getSubmittedMessageText(message));
    },
    status,
    stop: () => {
      setIsPlaying(false);
      setStatus("ready");
    },
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)] xl:items-start">
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-lg shadow-black/10">
        <CardHeader className="gap-3 border-border/70 border-b bg-white/[0.02]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <BugIcon />
              Coach sheet fixture
            </Badge>
            <Badge variant={isStreaming ? "secondary" : "outline"}>
              {isStreaming ? "Streaming" : "Idle"}
            </Badge>
          </div>
          <CardTitle className="text-2xl tracking-tight">Browser harness</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-foreground/72">
            This route emits the full tool-call batch in a single assistant turn, then replays the
            output transitions through the same session panel used by the live coach sheet.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            <label className="grid gap-1.5">
              <span className="font-medium text-sm">Tool calls</span>
              <input
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                inputMode="numeric"
                min={1}
                onChange={(event) => {
                  setToolCount(parsePositiveInteger(event.currentTarget.value, toolCount));
                }}
                type="number"
                value={toolCount}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="font-medium text-sm">Updates / tool</span>
              <input
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                inputMode="numeric"
                min={1}
                onChange={(event) => {
                  setUpdatesPerTool(
                    parsePositiveInteger(event.currentTarget.value, updatesPerTool),
                  );
                }}
                type="number"
                value={updatesPerTool}
              />
            </label>

            <div className="grid gap-1.5">
              <span className="font-medium text-sm">Fixture stats</span>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 text-sm">
                <span>{completedTools} done</span>
                <span className="text-muted-foreground">/</span>
                <span>{toolCount} tools</span>
                <span className="ml-auto text-muted-foreground">
                  {Math.min(step, totalSteps)} / {totalSteps} frames
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                startFixture();
              }}
              type="button"
            >
              <PlayIcon />
              Run fixture
            </Button>
            <Button
              onClick={() => {
                advanceFixture();
              }}
              type="button"
              variant="outline"
            >
              <FastForwardIcon />
              Step
            </Button>
            <Button
              onClick={() => {
                completeFixture();
              }}
              type="button"
              variant="outline"
            >
              <SquareIcon />
              Complete
            </Button>
            <Button
              onClick={() => {
                resetFixture();
              }}
              type="button"
              variant="ghost"
            >
              <RotateCcwIcon />
              Reset
            </Button>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/15 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            The sheet composer is wired to restart the fixture with whatever message you submit, so
            you can rerun the same single-turn multi-tool surface with different prompt text.
          </div>
        </CardContent>
      </Card>

      <div className="rounded-[2rem] border border-border/80 border-b-0 bg-card/95 shadow-[0_-24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex h-[min(78dvh,56rem)] min-h-[36rem] flex-col overflow-hidden rounded-t-[2rem]">
          <CoachSheetSessionPanel
            chat={chatController}
            dragHandleProps={FIXTURE_DRAG_HANDLE_PROPS}
            isExpanded
            onClose={() => {}}
            onSessionRequestHandled={() => {}}
            sessionRequest={null}
            target={FIXTURE_TARGET}
          />
        </div>
      </div>
    </section>
  );
}
