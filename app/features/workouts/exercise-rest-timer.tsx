import { Clock3Icon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "~/components/atoms/button";
import { cn } from "~/lib/utils";

import type { WorkoutSet } from "./contracts";
import {
  REST_TIMER_EXTENSION_SECONDS,
  formatRestTimerValue,
  getConfirmedSetCount,
  getConfirmedSetSignature,
} from "./rest-timer";

type RestTimerStatus = "idle" | "paused" | "running";

type RestTimerTone = "idle" | "overtime" | "running";

interface ExerciseRestTimerProps {
  renderValue?: (props: { displayValue: string; tone: RestTimerTone }) => ReactNode;
  restSeconds: number;
  sets: readonly WorkoutSet[];
}

interface RestTimerState {
  extraMs: number;
  pausedElapsedMs: number;
  startedAtMs: number | null;
  status: RestTimerStatus;
}

const REST_TIMER_INCREMENT_MS = REST_TIMER_EXTENSION_SECONDS * 1000;

function createIdleTimerState(): RestTimerState {
  return {
    extraMs: 0,
    pausedElapsedMs: 0,
    startedAtMs: null,
    status: "idle",
  };
}

function getElapsedMs(timerState: RestTimerState, nowMs: number) {
  if (timerState.status === "idle") {
    return 0;
  }

  if (timerState.status === "paused" || timerState.startedAtMs == null) {
    return timerState.pausedElapsedMs;
  }

  return timerState.pausedElapsedMs + Math.max(0, nowMs - timerState.startedAtMs);
}

export function ExerciseRestTimer({ renderValue, restSeconds, sets }: ExerciseRestTimerProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [timerState, setTimerState] = useState<RestTimerState>(() => createIdleTimerState());
  const confirmedSetCount = getConfirmedSetCount(sets);
  const confirmedSetSignature = getConfirmedSetSignature(sets);
  const previousConfirmedSetCountRef = useRef(confirmedSetCount);
  const previousConfirmedSetSignatureRef = useRef(confirmedSetSignature);
  const totalDurationMs = restSeconds * 1000 + timerState.extraMs;
  const elapsedMs = getElapsedMs(timerState, nowMs);
  const remainingMs = totalDurationMs - elapsedMs;
  const overtimeSeconds = remainingMs < 0 ? Math.floor(Math.abs(remainingMs) / 1000) : 0;
  const tone: RestTimerTone =
    timerState.status === "idle" ? "idle" : overtimeSeconds > 0 ? "overtime" : "running";
  const displayValue = formatRestTimerValue(remainingMs);
  const playbackLabel =
    timerState.status === "running"
      ? "Pause rest timer"
      : timerState.status === "paused"
        ? "Resume rest timer"
        : "Start rest timer";
  const stopDisabled = timerState.status === "idle" && timerState.extraMs === 0;

  useEffect(() => {
    if (timerState.status !== "running") {
      return;
    }

    setNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [timerState.status]);

  useEffect(() => {
    const previousConfirmedSetCount = previousConfirmedSetCountRef.current;
    const previousConfirmedSetSignature = previousConfirmedSetSignatureRef.current;

    if (
      confirmedSetSignature !== previousConfirmedSetSignature &&
      confirmedSetCount > previousConfirmedSetCount
    ) {
      const startedAtMs = Date.now();

      setNowMs(startedAtMs);
      setTimerState({
        extraMs: 0,
        pausedElapsedMs: 0,
        startedAtMs,
        status: "running",
      });
    }

    previousConfirmedSetCountRef.current = confirmedSetCount;
    previousConfirmedSetSignatureRef.current = confirmedSetSignature;
  }, [confirmedSetCount, confirmedSetSignature]);

  const handleAddThirtySeconds = () => {
    setNowMs(Date.now());
    setTimerState((currentState) => ({
      ...currentState,
      extraMs: currentState.extraMs + REST_TIMER_INCREMENT_MS,
    }));
  };

  const handlePlaybackToggle = () => {
    const nextNowMs = Date.now();

    setNowMs(nextNowMs);
    setTimerState((currentState) => {
      if (currentState.status === "running") {
        const elapsedSinceStart =
          currentState.startedAtMs == null ? 0 : nextNowMs - currentState.startedAtMs;

        return {
          ...currentState,
          pausedElapsedMs: currentState.pausedElapsedMs + elapsedSinceStart,
          startedAtMs: null,
          status: "paused",
        };
      }

      return {
        ...currentState,
        pausedElapsedMs: currentState.status === "idle" ? 0 : currentState.pausedElapsedMs,
        startedAtMs: nextNowMs,
        status: "running",
      };
    });
  };

  const handleStop = () => {
    setNowMs(Date.now());
    setTimerState(createIdleTimerState());
  };

  return (
    <div
      className={cn(
        "-mx-4 flex w-[calc(100%+2rem)] items-center justify-between gap-3 border-y px-4 py-2.5 text-sm transition-colors sm:mx-0 sm:w-full sm:px-0",
        tone === "idle" && "border-border/70 bg-background/60 text-muted-foreground",
        tone === "running" &&
          "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-300",
        tone === "overtime" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300",
      )}
      data-rest-timer-status={timerState.status}
      data-rest-timer-tone={tone}
    >
      <div className="min-w-0 flex flex-1 items-center gap-2.5">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            tone === "idle" && "bg-background text-muted-foreground",
            tone === "running" && "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
            tone === "overtime" &&
              "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
          )}
        >
          <Clock3Icon aria-hidden className="size-4" />
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em]">Rest Timer</p>
          {renderValue ? (
            renderValue({ displayValue, tone })
          ) : (
            <p
              aria-live="polite"
              className={cn("font-semibold tabular-nums", tone === "idle" && "text-foreground")}
              data-rest-timer-value="true"
            >
              {displayValue}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-3">
        {timerState.status === "running" ? (
          <Button
            aria-label="Add 30 seconds"
            onClick={handleAddThirtySeconds}
            size="xs"
            type="button"
            variant="outline"
          >
            +30
          </Button>
        ) : null}
        <Button
          aria-label={playbackLabel}
          onClick={handlePlaybackToggle}
          size="icon-xs"
          type="button"
          variant="outline"
        >
          {timerState.status === "running" ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </Button>
        <Button
          aria-label="Stop rest timer"
          disabled={stopDisabled}
          onClick={handleStop}
          size="icon-xs"
          type="button"
          variant="outline"
        >
          <SquareIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
