import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { workoutListSearchSchema } from "~/features/workouts/contracts";
import { createAppDatabase } from "~/lib/.server/db";
import {
  DEFAULT_AI_GATEWAY_ID,
  buildExerciseCatalogPrompt,
  createCoachLanguageModel,
  createStaticChatResponse,
  getLatestUserText,
} from "./coach-agent-helpers";
import {
  createCreateWorkoutTool,
  createPatchWorkoutTool,
  createQueryHistoryTool,
} from "./coach-agent-tools";

function buildGeneralCoachFallbackReply(latestUserText: string | null) {
  return [
    "General Coach thread is active.",
    `AI Gateway inference is unavailable, so this reply is using the deterministic fallback for gateway "${DEFAULT_AI_GATEWAY_ID}". Server-side workout tools are unavailable in this mode.`,
    "",
    "Current scope:",
    "- explain workout structure and intent",
    "- talk through planning or tradeoffs at a high level",
    "- hand off to the workout-scoped coach when you are inside a workout detail route",
    "",
    "When model-backed inference is available, this agent can:",
    "- create planned workouts",
    "- query workout history",
    "- patch existing workouts through guarded tools",
    latestUserText ? "" : null,
    latestUserText ? `Last user message: ${latestUserText}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildGeneralCoachSystemPrompt(
  recentWorkouts: ReadonlyArray<{
    date: string;
    id: string;
    status: string;
    title: string;
    version: number;
  }>,
) {
  const recentWorkoutLines = recentWorkouts.map(
    (workout) =>
      `- ${workout.id}: ${workout.title} on ${workout.date.slice(0, 10)} (${workout.status}, version ${workout.version})`,
  );

  return [
    "You are lifting3's general coach.",
    "You help with workout planning, training structure, and broad coaching discussion.",
    "Be concrete and concise.",
    "Use tools when the user asks to create a workout, patch workout data, or inspect structured history.",
    "Do not claim that you completed a mutation unless the tool returned ok: true.",
    "If patch_workout returns ok: false with VERSION_MISMATCH, explain the conflict and ask the user to retry after refresh.",
    "When you need a workout id or version for a historical edit, get it from the recent-workout context below or query_history first.",
    "If the user is on a workout detail page, the workout-scoped coach may have more context for that single workout.",
    "",
    "Available exercise ids:",
    buildExerciseCatalogPrompt(),
    "",
    "Recent workouts:",
    ...(recentWorkoutLines.length > 0 ? recentWorkoutLines : ["- No workouts found."]),
  ].join("\n");
}

export class GeneralCoachAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 40;

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options: Parameters<AIChatAgent<Env>["onChatMessage"]>[1],
  ) {
    const fallbackReply = buildGeneralCoachFallbackReply(getLatestUserText(this.messages));
    const db = createAppDatabase(this.env);

    try {
      const recentWorkouts = await createWorkoutRouteService(db).loadWorkoutList(
        workoutListSearchSchema.parse({}),
      );
      const result = streamText({
        abortSignal: options?.abortSignal,
        messages: await convertToModelMessages(this.messages),
        model: createCoachLanguageModel(this.env),
        onFinish,
        stopWhen: stepCountIs(5),
        system: buildGeneralCoachSystemPrompt(recentWorkouts.items.slice(0, 8)),
        tools: {
          create_workout: createCreateWorkoutTool(db),
          patch_workout: createPatchWorkoutTool(db),
          query_history: createQueryHistoryTool(db),
        },
      });

      return result.toUIMessageStreamResponse({
        originalMessages: this.messages,
      });
    } catch (error) {
      console.error("[GeneralCoachAgent] Streaming inference failed:", error);
      return createStaticChatResponse(this.messages, fallbackReply);
    }
  }
}
