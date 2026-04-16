import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { createSettingsService } from "~/features/settings/d1-service.server";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import type {
  WorkoutDetailLoaderData,
  WorkoutExercise,
  WorkoutSet,
} from "~/features/workouts/contracts";
import { WorkoutNotFoundError } from "~/features/workouts/service";
import { createAppDatabase } from "~/lib/.server/db";
import {
  buildExerciseCatalogPrompt,
  buildUserProfilePrompt,
  createCoachLanguageModel,
  createErrorAwareChatResponse,
  createErrorChatResponse,
  createStaticChatResponse,
} from "./coach-agent-helpers";
import {
  createPatchWorkoutTool,
  createQueryHistoryTool,
  createSetUserProfileTool,
} from "./coach-agent-tools";

const EXERCISE_SUMMARY_LIMIT = 6;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function formatSetValues(set: WorkoutSet) {
  const weight = set.actual.weightLbs ?? set.planned.weightLbs;
  const reps = set.actual.reps ?? set.planned.reps;
  const rpe = set.actual.rpe ?? set.planned.rpe;

  const segments = [
    weight == null ? null : `${weight} lb`,
    reps == null ? null : `${reps} reps`,
    rpe == null ? null : `RPE ${rpe}`,
  ].filter((segment) => segment !== null);

  return segments.length > 0 ? segments.join(", ") : "no logged load target";
}

function isSetConfirmed(set: WorkoutSet) {
  return set.confirmedAt != null;
}

function isExerciseActionable(exercise: WorkoutExercise) {
  return exercise.status === "planned" || exercise.status === "active";
}

function findNextOpenSet(loaderData: WorkoutDetailLoaderData) {
  for (const exercise of loaderData.exercises) {
    if (!isExerciseActionable(exercise)) {
      continue;
    }

    for (const set of exercise.sets) {
      if (!isSetConfirmed(set)) {
        return { exercise, set };
      }
    }
  }

  return null;
}

function summarizeExercise(exercise: WorkoutExercise) {
  const confirmedSets = exercise.sets.filter(isSetConfirmed).length;
  const openSets = isExerciseActionable(exercise)
    ? exercise.sets.filter((set) => !isSetConfirmed(set)).length
    : 0;
  const nextSet =
    (isExerciseActionable(exercise) ? exercise.sets.find((set) => !isSetConfirmed(set)) : null) ??
    exercise.sets[0];

  return [
    `${exercise.displayName} [${exercise.id}]: ${exercise.sets.length} sets total (${exercise.status})`,
    `${confirmedSets} confirmed`,
    openSets > 0 ? `${openSets} open` : null,
    nextSet ? `next target ${formatSetValues(nextSet)}` : null,
  ]
    .filter((segment) => segment !== null)
    .join(", ");
}

function buildWorkoutPatchReference(loaderData: WorkoutDetailLoaderData) {
  return loaderData.exercises
    .map((exercise) => [
      `- ${exercise.displayName} [${exercise.id}] exercise_status=${exercise.status}`,
      ...exercise.sets.map(
        (set, index) =>
          `  - set ${index + 1} [${set.id}] confirmed=${isSetConfirmed(set)} designation=${set.designation} planned=${formatSetValues(set)}`,
      ),
    ])
    .flat()
    .join("\n");
}

function buildWorkoutCoachSystemPrompt(
  loaderData: WorkoutDetailLoaderData,
  userProfile: string | null,
) {
  const nextOpenSet = findNextOpenSet(loaderData);
  const exerciseLines = loaderData.exercises
    .slice(0, EXERCISE_SUMMARY_LIMIT)
    .map((exercise) => `- ${summarizeExercise(exercise)}`);
  const notes = [loaderData.workout.coachNotes, loaderData.workout.userNotes]
    .flatMap((note) => {
      const trimmedNote = note?.trim();

      return trimmedNote ? [trimmedNote] : [];
    })
    .join(" | ");

  return [
    "You are lifting3's workout coach.",
    "You are attached to a single workout thread and must ground your reply in the workout snapshot below.",
    "Be concrete, concise, and useful.",
    "Use patch_workout for workout edits and query_history for structured comparisons.",
    "Do not claim that workout data changed unless patch_workout returned ok: true.",
    "If patch_workout returns ok: false with VERSION_MISMATCH, explain that the workout changed and the user should retry after refresh.",
    "",
    buildUserProfilePrompt(userProfile),
    "",
    `Workout: ${loaderData.workout.title} (${loaderData.workout.id})`,
    `Version: ${loaderData.workout.version}`,
    `Status: ${loaderData.workout.status}`,
    `Date: ${dateFormatter.format(new Date(loaderData.workout.date))}`,
    `Progress: ${loaderData.progress.confirmed} confirmed, ${loaderData.progress.unconfirmed} unconfirmed of ${loaderData.progress.total} total sets`,
    nextOpenSet
      ? `Next open set: ${nextOpenSet.exercise.displayName} -> ${formatSetValues(nextOpenSet.set)}`
      : "Next open set: none",
    notes.length > 0 ? `Notes: ${notes}` : null,
    "",
    "Exercise snapshot:",
    ...exerciseLines,
    loaderData.exercises.length > EXERCISE_SUMMARY_LIMIT
      ? `- ${loaderData.exercises.length - EXERCISE_SUMMARY_LIMIT} more exercises not shown in this summary.`
      : null,
    "",
    "Patch reference:",
    buildWorkoutPatchReference(loaderData),
    "",
    "Available exercise ids for replacements and additions:",
    buildExerciseCatalogPrompt(),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export class WorkoutCoachAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 40;

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options: Parameters<AIChatAgent<Env>["onChatMessage"]>[1],
  ) {
    return this.createCoachResponse(onFinish, options);
  }

  private async createCoachResponse(
    onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options: Parameters<AIChatAgent<Env>["onChatMessage"]>[1],
  ) {
    try {
      const db = createAppDatabase(this.env);
      const settingsService = createSettingsService(db);
      const [loaderData, userProfile] = await Promise.all([
        createWorkoutRouteService(db).loadWorkoutDetail({ workoutId: this.name }),
        settingsService.loadUserProfile(),
      ]);

      try {
        const result = streamText({
          abortSignal: options?.abortSignal,
          messages: await convertToModelMessages(this.messages),
          model: createCoachLanguageModel(this.env),
          onFinish,
          stopWhen: stepCountIs(5),
          system: buildWorkoutCoachSystemPrompt(loaderData, userProfile),
          tools: {
            patch_workout: createPatchWorkoutTool(db, this.name),
            query_history: createQueryHistoryTool(db),
            set_user_profile: createSetUserProfileTool(db),
          },
        });

        return createErrorAwareChatResponse({
          logPrefix: "[WorkoutCoachAgent] Streaming inference failed:",
          messages: this.messages,
          stream: result.toUIMessageStream(),
        });
      } catch (error) {
        return createErrorChatResponse({
          error,
          logPrefix: "[WorkoutCoachAgent] Streaming inference failed:",
          messages: this.messages,
        });
      }
    } catch (error) {
      if (error instanceof WorkoutNotFoundError) {
        return createStaticChatResponse(this.messages, `I could not find workout "${this.name}".`);
      }

      return createErrorChatResponse({
        error,
        logPrefix: "[WorkoutCoachAgent] Failed to prepare workout context:",
        messages: this.messages,
      });
    }
  }
}
