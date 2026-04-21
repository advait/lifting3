import { Think } from "@cloudflare/think";
import { createSettingsService } from "~/features/settings/d1-service.server";
import {
  parseCoachInstanceName,
  type WorkoutDetailLoaderData,
  type WorkoutExercise,
  type WorkoutSet,
  workoutListSearchSchema,
} from "~/features/workouts/contracts";
import { createWorkoutRouteService } from "~/features/workouts/d1-service.server";
import { WorkoutNotFoundError } from "~/features/workouts/service";
import { createAppDatabase } from "~/lib/.server/db";
import {
  buildExerciseCatalogPrompt,
  buildPatchWorkoutContractPrompt,
  buildUserProfilePrompt,
  createCoachLanguageModel,
  normalizeCoachError,
} from "./coach-agent-helpers";
import {
  createCreateWorkoutTool,
  createPatchWorkoutTool,
  createQueryHistoryTool,
  createSetUserProfileTool,
} from "./coach-agent-tools";

const ACTIVE_COACH_TOOL_NAMES = [
  "create_workout",
  "patch_workout",
  "query_history",
  "set_user_profile",
] as const;
const EXERCISE_SUMMARY_LIMIT = 6;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

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
    buildPatchWorkoutContractPrompt(),
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

function formatSetValues(set: WorkoutSet) {
  const weight = set.actual.weightLbs ?? set.planned.weightLbs;
  const reps = set.reps;
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
    "Use patch_workout for workout edits, create_workout when the user asks for a new session, and query_history for structured comparisons.",
    "If the user wants a follow-up workout based on this session, prefer using this workout as sourceWorkoutId.",
    "Do not claim that workout data changed unless patch_workout returned ok: true.",
    "Do not claim that you created a new workout unless create_workout returned ok: true.",
    "If patch_workout returns ok: false with VERSION_MISMATCH, explain that the workout changed and the user should retry after refresh.",
    buildPatchWorkoutContractPrompt(),
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

function parseCoachThread(instanceName: string) {
  const parsedInstance = parseCoachInstanceName(instanceName);

  if (parsedInstance) {
    return parsedInstance;
  }

  throw new Error(`Unknown coach thread "${instanceName}".`);
}

export class CoachAgent extends Think<Env> {
  override chatRecovery = false;
  override maxSteps = 5;
  override messageConcurrency = "queue" as const;

  override getModel() {
    return createCoachLanguageModel(this.env);
  }

  override getSystemPrompt() {
    return "You are lifting3's coach.";
  }

  override getTools() {
    const db = createAppDatabase(this.env);
    const thread = parseCoachThread(this.name);

    return {
      create_workout: createCreateWorkoutTool(db),
      patch_workout: createPatchWorkoutTool(
        db,
        thread.kind === "workout" ? thread.workoutId : undefined,
      ),
      query_history: createQueryHistoryTool(db),
      set_user_profile: createSetUserProfileTool(db),
    };
  }

  override async beforeTurn() {
    const db = createAppDatabase(this.env);
    const settingsService = createSettingsService(db);
    const workoutRouteService = createWorkoutRouteService(db);
    const thread = parseCoachThread(this.name);

    if (thread.kind === "general") {
      const [recentWorkouts, userProfile] = await Promise.all([
        workoutRouteService.loadWorkoutList(workoutListSearchSchema.parse({})),
        settingsService.loadUserProfile(),
      ]);

      return {
        activeTools: [...ACTIVE_COACH_TOOL_NAMES],
        system: buildGeneralCoachSystemPrompt(userProfile, recentWorkouts.items.slice(0, 8)),
      };
    }

    try {
      const [loaderData, userProfile] = await Promise.all([
        workoutRouteService.loadWorkoutDetail({ workoutId: thread.workoutId }),
        settingsService.loadUserProfile(),
      ]);

      return {
        activeTools: [...ACTIVE_COACH_TOOL_NAMES],
        system: buildWorkoutCoachSystemPrompt(loaderData, userProfile),
      };
    } catch (error) {
      if (error instanceof WorkoutNotFoundError) {
        throw new Error(`I could not find workout "${thread.workoutId}".`);
      }

      throw error;
    }
  }

  override onChatError(error: unknown) {
    return new Error(normalizeCoachError(error));
  }
}
