import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const versionSchema = z.int().nonnegative();

export const WORKOUT_EVENT_TYPES = [
  "workout_created",
  "workout_updated",
  "workout_deleted",
  "workout_started",
  "exercise_added",
  "exercise_removed",
  "exercise_reordered",
  "exercise_replaced",
  "exercise_skipped",
  "set_added",
  "set_designation_updated",
  "set_planned_updated",
  "set_removed",
  "set_actuals_updated",
  "set_confirmed",
  "set_unconfirmed",
  "set_corrected",
  "workout_note_updated",
  "exercise_note_updated",
  "workout_completed",
] as const;

export const STATIC_INVALIDATE_KEYS = [
  "home",
  "workouts:list",
  "exercises:list",
  "analytics",
] as const;

const staticInvalidateKeySchema = z.enum(STATIC_INVALIDATE_KEYS);
const workoutInvalidateKeySchema = z.string().regex(/^workout:[^:]+$/, {
  error: "Expected invalidate key in the form workout:{workoutId}.",
});
const exerciseInvalidateKeySchema = z.string().regex(/^exercise:[^:]+$/, {
  error: "Expected invalidate key in the form exercise:{exerciseSchemaId}.",
});

export const workoutEventTypeSchema = z.enum(WORKOUT_EVENT_TYPES);
/** Constrains fanout keys so producers and RR7 listeners share the same invalidation vocabulary. */
export const appInvalidateKeySchema = z.union([
  staticInvalidateKeySchema,
  workoutInvalidateKeySchema,
  exerciseInvalidateKeySchema,
]);

/** Describes the non-authoritative websocket payload that tells mounted routes what to refetch. */
export const appEventEnvelopeSchema = z.strictObject({
  type: workoutEventTypeSchema,
  workoutId: nonEmptyStringSchema,
  version: versionSchema,
  eventId: nonEmptyStringSchema,
  invalidate: z.array(appInvalidateKeySchema).min(1),
});

export type WorkoutEventType = z.infer<typeof workoutEventTypeSchema>;
export type AppInvalidateKey = z.infer<typeof appInvalidateKeySchema>;
export type AppEventEnvelope = z.infer<typeof appEventEnvelopeSchema>;

export function createWorkoutInvalidateKey(workoutId: string) {
  return `workout:${workoutId}` as const;
}

export function createExerciseInvalidateKey(exerciseSchemaId: string) {
  return `exercise:${exerciseSchemaId}` as const;
}

export function uniqueInvalidateKeys(keys: readonly AppInvalidateKey[]) {
  return [...new Set(keys)] satisfies AppInvalidateKey[];
}
