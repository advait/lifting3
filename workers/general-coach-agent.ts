import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { createSettingsService } from "~/features/settings/d1-service.server";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { workoutListSearchSchema } from "~/features/workouts/contracts";
import { createAppDatabase } from "~/lib/.server/db";
import {
  buildExerciseCatalogPrompt,
  buildUserProfilePrompt,
  createCoachLanguageModel,
  createErrorAwareChatResponse,
  createErrorChatResponse,
} from "./coach-agent-helpers";
import {
  createCreateWorkoutTool,
  createPatchWorkoutTool,
  createQueryHistoryTool,
  createSetUserProfileTool,
} from "./coach-agent-tools";

function buildGeneralCoachSystemPrompt(
  userProfile: string | null,
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
    buildUserProfilePrompt(userProfile),
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
    const db = createAppDatabase(this.env);
    const settingsService = createSettingsService(db);

    try {
      const [recentWorkouts, userProfile] = await Promise.all([
        createWorkoutRouteService(db).loadWorkoutList(workoutListSearchSchema.parse({})),
        settingsService.loadUserProfile(),
      ]);
      const result = streamText({
        abortSignal: options?.abortSignal,
        messages: await convertToModelMessages(this.messages),
        model: createCoachLanguageModel(this.env),
        onFinish,
        stopWhen: stepCountIs(5),
        system: buildGeneralCoachSystemPrompt(userProfile, recentWorkouts.items.slice(0, 8)),
        tools: {
          create_workout: createCreateWorkoutTool(db),
          patch_workout: createPatchWorkoutTool(db),
          query_history: createQueryHistoryTool(db),
          set_user_profile: createSetUserProfileTool(db),
        },
      });

      return createErrorAwareChatResponse({
        logPrefix: "[GeneralCoachAgent] Streaming inference failed:",
        messages: this.messages,
        stream: result.toUIMessageStream(),
      });
    } catch (error) {
      return createErrorChatResponse({
        error,
        logPrefix: "[GeneralCoachAgent] Failed to create coach response:",
        messages: this.messages,
      });
    }
  }
}
