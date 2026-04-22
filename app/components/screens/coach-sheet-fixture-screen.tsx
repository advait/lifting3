import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { BugIcon, GaugeIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import type { UIMessage } from "ai";

import { Badge } from "~/components/atoms/badge";
import { Button } from "~/components/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/card";
import {
  CoachSheetSessionPanel,
  type CoachSheetChatController,
  useCoachSheetAgentDebugTrace,
} from "~/features/coach/coach-sheet";
import {
  COACH_SHEET_FIXTURE_AGENT_RUNTIME_NAME,
  COACH_SHEET_TRACE8_DEFAULT_PROMPT,
  COACH_SHEET_TRACE8_FIXTURE_SUMMARY,
} from "~/features/coach/coach-sheet-fixture-live";
import { createGeneralCoachTarget } from "~/features/coach/contracts";

const FIXTURE_DRAG_HANDLE_PROPS = {
  type: "button",
} satisfies ComponentPropsWithoutRef<"button">;

const FIXTURE_TARGET = createGeneralCoachTarget();
const FIXTURE_SPEED_OPTIONS = [
  { label: "1x captured", value: "1" },
  { label: "2x faster", value: "2" },
  { label: "4x faster", value: "4" },
] as const;

function formatDurationLabel(durationMs: number) {
  return `${(durationMs / 1000).toFixed(3)}s`;
}

function getSubmittedMessageText(message: Pick<UIMessage, "parts">) {
  for (const part of message.parts) {
    if (part.type === "text" && part.text.trim().length > 0) {
      return part.text.trim();
    }
  }

  return COACH_SHEET_TRACE8_DEFAULT_PROMPT;
}

export function CoachSheetFixtureScreen() {
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const sessionPrefix = useId().replaceAll(":", "-");
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [lastPrompt, setLastPrompt] = useState(COACH_SHEET_TRACE8_DEFAULT_PROMPT);
  const autoStartedSessionRef = useRef<string | null>(null);
  const sessionName = `trace8-${sessionPrefix}-${sessionGeneration}`;
  const agent = useAgent({
    agent: COACH_SHEET_FIXTURE_AGENT_RUNTIME_NAME,
    name: sessionName,
  });
  const chat = useAgentChat({
    agent,
    body: () => ({
      speedMultiplier,
    }),
    getInitialMessages: null,
  });
  const isBusy = chat.status === "submitted" || chat.status === "streaming";

  const chatController: CoachSheetChatController = {
    ...chat,
    sendMessage: async (message) => {
      const submittedPrompt = getSubmittedMessageText(message);

      setLastPrompt(submittedPrompt);
      return chat.sendMessage({ text: submittedPrompt });
    },
  };

  useCoachSheetAgentDebugTrace(agent, chatController, FIXTURE_TARGET);

  const startFixtureSession = useEffectEvent(async (prompt = lastPrompt) => {
    setLastPrompt(prompt);
    await chat.sendMessage({ text: prompt });
  });

  useEffect(() => {
    let cancelled = false;

    if (autoStartedSessionRef.current === sessionName) {
      return;
    }

    autoStartedSessionRef.current = sessionName;

    void agent.ready.then(() => {
      if (cancelled) {
        return;
      }

      void startFixtureSession();
    });

    return () => {
      cancelled = true;
    };
  }, [agent, sessionName, startFixtureSession]);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)] xl:items-start">
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-lg shadow-black/10">
        <CardHeader className="gap-3 border-border/70 border-b bg-white/[0.02]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <BugIcon />
              Live AIChatAgent
            </Badge>
            <Badge variant={isBusy ? "secondary" : "outline"}>{chat.status}</Badge>
          </div>
          <CardTitle className="text-2xl tracking-tight">Trace8 replay fixture</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-foreground/72">
            This route mounts the real coach sheet against a dedicated Cloudflare{" "}
            <code>AIChatAgent</code> that replays the captured <code>trace8</code> chunk sequence
            over SSE. Opening the page starts a fresh agent session automatically.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <div className="grid gap-1.5">
              <span className="font-medium text-sm">Replay stats</span>
              <div className="grid gap-2 rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <GaugeIcon className="size-4 text-muted-foreground" />
                  <span>{COACH_SHEET_TRACE8_FIXTURE_SUMMARY.toolCount} tool calls</span>
                </div>
                <div>{COACH_SHEET_TRACE8_FIXTURE_SUMMARY.inputDeltaCount} tool-input deltas</div>
                <div>
                  {formatDurationLabel(COACH_SHEET_TRACE8_FIXTURE_SUMMARY.durationMs)} capture
                </div>
                <div className="text-muted-foreground text-xs">
                  request {COACH_SHEET_TRACE8_FIXTURE_SUMMARY.captureRequestId}
                </div>
              </div>
            </div>

            <label className="grid gap-1.5">
              <span className="font-medium text-sm">Replay speed</span>
              <select
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                onChange={(event) => {
                  setSpeedMultiplier(Number(event.currentTarget.value));
                }}
                value={String(speedMultiplier)}
              >
                {FIXTURE_SPEED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2 rounded-2xl border border-border/70 bg-muted/15 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              The page creates a new agent instance per run, so each replay starts from a clean
              persisted transcript and goes through the same <code>useAgentChat</code> transport
              path as production.
            </p>
            <p>
              The embedded composer still uses the live chat controller, but the server always
              replays the captured trace8 inference stream regardless of prompt text.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setSessionGeneration((currentValue) => currentValue + 1);
              }}
              type="button"
            >
              {isBusy ? <LoaderCircleIcon className="animate-spin" /> : <RotateCcwIcon />}
              Fresh session
            </Button>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm">
            <div className="font-medium">Current runtime</div>
            <div className="mt-1 text-muted-foreground">
              <code>{COACH_SHEET_FIXTURE_AGENT_RUNTIME_NAME}</code>
              {" · "}
              <code>{sessionName}</code>
            </div>
            <div className="mt-2 text-muted-foreground text-xs">Last prompt: {lastPrompt}</div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-[2rem] border border-border/80 border-b-0 bg-card/95 shadow-[0_-24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex h-[min(78dvh,56rem)] min-h-[36rem] flex-col overflow-hidden rounded-t-[2rem]">
          <CoachSheetSessionPanel
            chat={chatController}
            dragHandleProps={FIXTURE_DRAG_HANDLE_PROPS}
            isExpanded
            key={sessionName}
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
