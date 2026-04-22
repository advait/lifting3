import { AIChatAgent } from "@cloudflare/ai-chat";
import type { ToolSet, StreamTextOnFinishCallback } from "ai";

import { getCoachSheetTrace8ReplayEvents } from "./coach-sheet-trace8-replay";

function parseFixtureSpeedMultiplier(body: Record<string, unknown> | undefined) {
  const speedMultiplier = body?.speedMultiplier;

  return typeof speedMultiplier === "number" && speedMultiplier > 0 ? speedMultiplier : 1;
}

function waitForReplayDelay(delayMs: number, abortSignal: AbortSignal | undefined) {
  if (delayMs <= 0 || abortSignal?.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      abortSignal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      clearTimeout(timeoutId);
      resolve();
    };

    abortSignal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function createReplaySseResponse(
  replayEvents: ReturnType<typeof getCoachSheetTrace8ReplayEvents>,
  abortSignal: AbortSignal | undefined,
) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for (const replayEvent of replayEvents) {
            if (abortSignal?.aborted) {
              break;
            }

            await waitForReplayDelay(replayEvent.delayMs, abortSignal);

            if (abortSignal?.aborted) {
              break;
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(replayEvent.chunk)}\n\n`));
          }
        } catch (error) {
          controller.error(error);
          return;
        }

        controller.close();
      },
    }),
    {
      headers: {
        "cache-control": "no-cache",
        "content-type": "text/event-stream; charset=utf-8",
      },
    },
  );
}

export class CoachSheetFixtureAgent extends AIChatAgent<Env> {
  override async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal; body?: Record<string, unknown> },
  ) {
    const replayEvents = getCoachSheetTrace8ReplayEvents({
      speedMultiplier: parseFixtureSpeedMultiplier(options?.body),
    });

    return createReplaySseResponse(replayEvents, options?.abortSignal);
  }
}
