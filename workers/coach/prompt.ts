import { EXERCISE_SCHEMAS } from "~/features/exercises/schema";
import {
  PATCH_WORKOUT_OPERATION_TYPES,
  PATCH_WORKOUT_TOOL_EXAMPLES,
} from "~/features/workouts/agent-tools";
import {
  countWorkoutPersonalRecords,
  countWorkoutSetPersonalRecords,
} from "~/features/workouts/personal-records";
import type { WorkoutExercise, WorkoutSet } from "~/features/workouts/contracts";

import type { GeneralCoachContext, WorkoutCoachContext } from "./context";

export const DEFAULT_COACH_SYSTEM_PROMPT = [
  "You are lifting3's coach.",
  "Coach like a pragmatic strength coach for one athlete: direct, concrete, and grounded in the actual workout data.",
  "Lead with judgment and next actions, not generic encouragement.",
  "Do not invent facts or claim that a tool mutation succeeded unless the tool output says ok: true.",
].join(" ");

const EXERCISE_SUMMARY_LIMIT = 6;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const XML_TEXT_ESCAPE_PATTERN = /[&<>]/g;
const XML_TEXT_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
} as const;

function formatSetValues({
  reps,
  rpe,
  weightLbs,
}: {
  readonly reps: number | null;
  readonly rpe: number | null;
  readonly weightLbs: number | null;
}) {
  const segments = [
    weightLbs == null ? null : `${weightLbs} lb`,
    reps == null ? null : `${reps} reps`,
    rpe == null ? null : `RPE ${rpe}`,
  ].filter((segment) => segment !== null);

  return segments.length > 0 ? segments.join(", ") : "no logged load target";
}

function formatSetTarget(set: WorkoutSet) {
  return formatSetValues({
    reps: set.reps,
    rpe: set.planned.rpe,
    weightLbs: set.planned.weightLbs,
  });
}

function formatLoggedSetValues(set: WorkoutSet) {
  return formatSetValues({
    reps: set.reps,
    rpe: set.actual.rpe,
    weightLbs: set.actual.weightLbs,
  });
}

function formatSetContextValues(set: WorkoutSet) {
  return formatSetValues({
    reps: set.reps,
    rpe: set.actual.rpe ?? set.planned.rpe,
    weightLbs: set.actual.weightLbs ?? set.planned.weightLbs,
  });
}

function isSetConfirmed(set: WorkoutSet) {
  return set.confirmedAt != null;
}

function isExerciseActionable(exercise: WorkoutExercise) {
  return exercise.status === "planned" || exercise.status === "active";
}

function findNextOpenSet(workoutDetail: WorkoutCoachContext["workoutDetail"]) {
  for (const exercise of workoutDetail.exercises) {
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
  const personalRecords = countWorkoutSetPersonalRecords(exercise.sets);
  const nextSet =
    (isExerciseActionable(exercise) ? exercise.sets.find((set) => !isSetConfirmed(set)) : null) ??
    exercise.sets[0];
  const nextSetLabel = isExerciseActionable(exercise) ? "next target" : "reference set";

  return [
    `${exercise.displayName} [${exercise.id}]: ${exercise.sets.length} sets total (${exercise.status})`,
    `${confirmedSets} confirmed`,
    personalRecords > 0 ? `${personalRecords} PR${personalRecords === 1 ? "" : "s"}` : null,
    openSets > 0 ? `${openSets} open` : null,
    nextSet ? `${nextSetLabel} ${formatSetContextValues(nextSet)}` : null,
  ]
    .filter((segment) => segment !== null)
    .join(", ");
}

function buildWorkoutPatchReference(workoutDetail: WorkoutCoachContext["workoutDetail"]) {
  return workoutDetail.exercises
    .map((exercise) => [
      `- ${exercise.displayName} [${exercise.id}] exercise_status=${exercise.status}`,
      ...exercise.sets.map((set, index) =>
        [
          `  - set ${index + 1} [${set.id}] confirmed=${isSetConfirmed(set)} designation=${set.designation}`,
          `target=${formatSetTarget(set)}`,
          `logged=${formatLoggedSetValues(set)}`,
        ].join(" "),
      ),
    ])
    .flat()
    .join("\n");
}

function escapeXmlText(value: string) {
  return value.replaceAll(XML_TEXT_ESCAPE_PATTERN, (character) => {
    if (character in XML_TEXT_ESCAPES) {
      return XML_TEXT_ESCAPES[character as keyof typeof XML_TEXT_ESCAPES];
    }

    return character;
  });
}

function renderUserProfileSection(userProfile: string | null) {
  const profileText = userProfile ? escapeXmlText(userProfile) : "No saved user profile.";

  return [
    "Persistent user context is provided below inside <UserProfile> XML.",
    "This profile should contain the user's durable goals, constraints, injuries or limitations, schedule, equipment access, preferences, dislikes, unit conventions, and other standing context that should carry across chats.",
    "Use it when relevant, do not invent missing facts, and call set_user_profile when the user provides new durable profile information that should persist for future chats.",
    "<UserProfile>",
    profileText,
    "</UserProfile>",
  ].join("\n");
}

function renderExerciseCatalogSection() {
  return EXERCISE_SCHEMAS.map((exercise) => {
    const equipment = exercise.equipment.join(", ");

    return `- ${exercise.id}: ${exercise.displayName} (${exercise.classification}; ${equipment}; load=${exercise.logging.loadTracking})`;
  }).join("\n");
}

function renderSharedCoachBehaviorSection() {
  return [
    "Coach like a real strength coach, not a generic assistant.",
    "Lead with the most important training judgment, then give the clearest next action.",
    "Base claims on the provided workout data, saved profile, or tool output.",
    "If the data is incomplete or contradictory, say that plainly instead of smoothing it over.",
    "Keep replies compact but specific.",
  ].join("\n");
}

function renderPatchWorkoutContractSection() {
  return [
    "For patch_workout, ops[].type must be exactly one of:",
    `- ${PATCH_WORKOUT_OPERATION_TYPES.join(", ")}`,
    'For planned set retargeting, always use type "update_exercise_targets". Do not invent aliases like "update_sets" or "exercise_update_sets".',
    'Use type "update_workout_metadata" with title and/or date (YYYY-MM-DD) when the user wants to rename or reschedule a workout.',
    "Canonical patch_workout payload examples:",
    ...PATCH_WORKOUT_TOOL_EXAMPLES.map((example) => JSON.stringify(example)),
    "Replace workoutId, expectedVersion, exerciseId, and setId values with the real ids from the workout context.",
  ].join("\n");
}

export function describePatchWorkoutTool() {
  return [
    "Apply one guarded workout patch using the current expected version.",
    `Allowed ops[].type values: ${PATCH_WORKOUT_OPERATION_TYPES.join(", ")}.`,
    'For planned set retargeting, always use "update_exercise_targets". Never use aliases like "update_sets" or "exercise_update_sets".',
    'Use "update_workout_metadata" with title and/or date (YYYY-MM-DD) to rename or reschedule a workout.',
    `Example payloads: ${PATCH_WORKOUT_TOOL_EXAMPLES.map((example) => JSON.stringify(example)).join(" ")}`,
  ].join(" ");
}

export function renderGeneralCoachPrompt({
  recentWorkouts,
  userProfile,
}: GeneralCoachContext): string {
  const recentWorkoutLines = recentWorkouts.map(
    (workout) =>
      `- ${workout.id}: ${workout.title} on ${workout.date.slice(0, 10)} (${workout.status}, version ${workout.version})`,
  );

  return [
    "You are lifting3's general coach.",
    "You help with workout planning, training structure, and broad coaching discussion.",
    renderSharedCoachBehaviorSection(),
    "Use tools when the user asks to create a workout, patch workout data, or inspect structured history.",
    "When a useful answer depends on historical comparison or trends, use query_history instead of guessing.",
    "Do not claim that you completed a mutation unless the tool returned ok: true.",
    "If patch_workout returns ok: false with VERSION_MISMATCH, explain the conflict and ask the user to retry after refresh.",
    renderPatchWorkoutContractSection(),
    "When you need a workout id or version for a historical edit, get it from the recent-workout context below or query_history first.",
    "If the user is on a workout detail page, the workout-scoped coach may have more context for that single workout.",
    "",
    renderUserProfileSection(userProfile),
    "",
    "Available exercise ids:",
    renderExerciseCatalogSection(),
    "",
    "Recent workouts:",
    ...(recentWorkoutLines.length > 0 ? recentWorkoutLines : ["- No workouts found."]),
  ].join("\n");
}

export function renderWorkoutCoachPrompt({
  userProfile,
  workoutDetail,
}: WorkoutCoachContext): string {
  const nextOpenSet = findNextOpenSet(workoutDetail);
  const personalRecords = countWorkoutPersonalRecords(workoutDetail.exercises);
  const isCompletedWorkout = workoutDetail.workout.status === "completed";
  const isCanceledWorkout = workoutDetail.workout.status === "canceled";
  const exerciseLines = workoutDetail.exercises
    .slice(0, EXERCISE_SUMMARY_LIMIT)
    .map((exercise) => `- ${summarizeExercise(exercise)}`);
  const notes = [workoutDetail.workout.coachNotes, workoutDetail.workout.userNotes]
    .flatMap((note) => {
      const trimmedNote = note?.trim();

      return trimmedNote ? [trimmedNote] : [];
    })
    .join(" | ");
  const modeLine =
    isCompletedWorkout || isCanceledWorkout
      ? "Mode: post-workout review"
      : "Mode: live workout support";
  const completedAtLine =
    workoutDetail.workout.completedAt != null
      ? `Completed at: ${dateTimeFormatter.format(new Date(workoutDetail.workout.completedAt))}`
      : null;
  const loggingGapLine =
    isCompletedWorkout && workoutDetail.progress.unconfirmed > 0
      ? `Logging gaps: ${workoutDetail.progress.unconfirmed} sets remain unconfirmed even though the workout is completed.`
      : null;
  const workoutModeGuidance =
    isCompletedWorkout || isCanceledWorkout
      ? [
          "This workout is no longer live.",
          "Default to a recap unless the user clearly asks to edit the workout.",
          "Prioritize adherence to plan, standout lifts, missed or incomplete work, likely readiness or fatigue signals, and one clear next-session adjustment.",
        ]
      : [
          "Treat this as a live session unless the user clearly asks for historical analysis.",
          "Prioritize next-set decisions, pacing, substitutions, and in-session adjustments.",
        ];

  return [
    "You are lifting3's workout coach.",
    "You are attached to a single workout thread and must ground your reply in the workout snapshot below.",
    renderSharedCoachBehaviorSection(),
    ...workoutModeGuidance,
    "Use patch_workout for workout edits, create_workout when the user asks for a new session, and query_history for structured comparisons.",
    "If the user wants a follow-up workout based on this session, prefer using this workout as sourceWorkoutId.",
    "Only use query_history when comparison materially improves the answer.",
    "Do not claim that workout data changed unless patch_workout returned ok: true.",
    "Do not claim that you created a new workout unless create_workout returned ok: true.",
    "If patch_workout returns ok: false with VERSION_MISMATCH, explain that the workout changed and the user should retry after refresh.",
    renderPatchWorkoutContractSection(),
    "",
    renderUserProfileSection(userProfile),
    "",
    `Workout: ${workoutDetail.workout.title} (${workoutDetail.workout.id})`,
    `Version: ${workoutDetail.workout.version}`,
    `Status: ${workoutDetail.workout.status}`,
    modeLine,
    `Date: ${dateFormatter.format(new Date(workoutDetail.workout.date))}`,
    completedAtLine,
    `Progress: ${workoutDetail.progress.confirmed} confirmed, ${workoutDetail.progress.unconfirmed} unconfirmed of ${workoutDetail.progress.total} total sets`,
    `Personal records: ${personalRecords}`,
    nextOpenSet
      ? `Next open set: ${nextOpenSet.exercise.displayName} -> ${formatSetContextValues(nextOpenSet.set)}`
      : "Next open set: none",
    loggingGapLine,
    notes.length > 0 ? `Notes: ${notes}` : null,
    "",
    "Exercise snapshot:",
    ...exerciseLines,
    workoutDetail.exercises.length > EXERCISE_SUMMARY_LIMIT
      ? `- ${workoutDetail.exercises.length - EXERCISE_SUMMARY_LIMIT} more exercises not shown in this summary.`
      : null,
    "",
    "Patch reference:",
    buildWorkoutPatchReference(workoutDetail),
    "",
    "Available exercise ids for replacements and additions:",
    renderExerciseCatalogSection(),
  ]
    .filter((line) => line !== null)
    .join("\n");
}
