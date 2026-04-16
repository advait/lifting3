import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import type {
  WorkoutDetailLoaderData,
  WorkoutExercise,
  WorkoutSet,
} from "~/features/workouts/contracts";
import { WorkoutNotFoundError } from "~/features/workouts/service";
import { createAppDatabase } from "~/lib/.server/db";
import {
  DEFAULT_AI_GATEWAY_ID,
  buildExerciseCatalogPrompt,
  createCoachLanguageModel,
  createStaticChatResponse,
  getLatestUserText,
} from "./coach-agent-helpers";
import { createPatchWorkoutTool, createQueryHistoryTool } from "./coach-agent-tools";

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

function findNextOpenSet(loaderData: WorkoutDetailLoaderData) {
  for (const exercise of loaderData.exercises) {
    for (const set of exercise.sets) {
      if (set.status === "tbd") {
        return { exercise, set };
      }
    }
  }

  return null;
}

function summarizeExercise(exercise: WorkoutExercise) {
  const completedSets = exercise.sets.filter((set) => set.status === "done").length;
  const skippedSets = exercise.sets.filter((set) => set.status === "skipped").length;
  const remainingSets = exercise.sets.filter((set) => set.status === "tbd").length;
  const nextSet = exercise.sets.find((set) => set.status === "tbd") ?? exercise.sets[0];

  return [
    `${exercise.displayName} [${exercise.id}]: ${exercise.sets.length} sets total`,
    `${completedSets} done`,
    `${remainingSets} remaining`,
    skippedSets > 0 ? `${skippedSets} skipped` : null,
    nextSet ? `next target ${formatSetValues(nextSet)}` : null,
  ]
    .filter((segment) => segment !== null)
    .join(", ");
}

function buildWorkoutCoachFallbackReply(
  loaderData: WorkoutDetailLoaderData,
  latestUserText: string | null,
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
  const nextSetLine = nextOpenSet
    ? `Next open set: ${nextOpenSet.exercise.displayName} -> ${formatSetValues(nextOpenSet.set)}.`
    : "No open sets remain in this workout.";

  return [
    `Workout Coach is attached to "${loaderData.workout.title}" (${loaderData.workout.id}).`,
    `AI Gateway inference is unavailable, so this reply is using the deterministic fallback for gateway "${DEFAULT_AI_GATEWAY_ID}". Server-side workout tools are unavailable in this mode.`,
    "",
    `Status: ${loaderData.workout.status}. Date: ${dateFormatter.format(new Date(loaderData.workout.date))}.`,
    `Progress: ${loaderData.progress.done} done, ${loaderData.progress.tbd} remaining, ${loaderData.progress.skipped} skipped across ${loaderData.progress.total} sets.`,
    nextSetLine,
    notes.length > 0 ? `Notes: ${notes}` : null,
    "",
    "Exercise snapshot:",
    ...exerciseLines,
    loaderData.exercises.length > EXERCISE_SUMMARY_LIMIT
      ? `- ${loaderData.exercises.length - EXERCISE_SUMMARY_LIMIT} more exercises not shown in this summary.`
      : null,
    latestUserText ? "" : null,
    latestUserText ? `Last user message: ${latestUserText}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildWorkoutPatchReference(loaderData: WorkoutDetailLoaderData) {
  return loaderData.exercises
    .map((exercise) => [
      `- ${exercise.displayName} [${exercise.id}]`,
      ...exercise.sets.map(
        (set, index) =>
          `  - set ${index + 1} [${set.id}] status=${set.status} designation=${set.designation} planned=${formatSetValues(set)}`,
      ),
    ])
    .flat()
    .join("\n");
}

function buildWorkoutCoachSystemPrompt(loaderData: WorkoutDetailLoaderData) {
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
    `Workout: ${loaderData.workout.title} (${loaderData.workout.id})`,
    `Version: ${loaderData.workout.version}`,
    `Status: ${loaderData.workout.status}`,
    `Date: ${dateFormatter.format(new Date(loaderData.workout.date))}`,
    `Progress: ${loaderData.progress.done} done, ${loaderData.progress.tbd} remaining, ${loaderData.progress.skipped} skipped of ${loaderData.progress.total} total sets`,
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
    const latestUserText = getLatestUserText(this.messages);

    try {
      const loaderData = await createWorkoutRouteService(
        createAppDatabase(this.env),
      ).loadWorkoutDetail({ workoutId: this.name });
      const db = createAppDatabase(this.env);

      const fallbackReply = buildWorkoutCoachFallbackReply(loaderData, latestUserText);

      try {
        const result = streamText({
          abortSignal: options?.abortSignal,
          messages: await convertToModelMessages(this.messages),
          model: createCoachLanguageModel(this.env),
          onFinish,
          stopWhen: stepCountIs(5),
          system: buildWorkoutCoachSystemPrompt(loaderData),
          tools: {
            patch_workout: createPatchWorkoutTool(db, this.name),
            query_history: createQueryHistoryTool(db),
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: this.messages,
        });
      } catch (error) {
        console.error("[WorkoutCoachAgent] Streaming inference failed:", error);
        return createStaticChatResponse(this.messages, fallbackReply);
      }
    } catch (error) {
      if (error instanceof WorkoutNotFoundError) {
        return createStaticChatResponse(this.messages, `I could not find workout "${this.name}".`);
      }

      throw error;
    }
  }
}
