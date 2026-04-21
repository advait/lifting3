import { z } from "zod";

import { EXERCISE_SCHEMA_IDS } from "../exercises/schema.ts";
import { userProfileValueSchema } from "../settings/contracts.ts";
import { DEFAULT_EXERCISE_REST_SECONDS } from "../workouts/rest-timer.ts";
import {
  SET_KINDS,
  sourceMetadataSchema,
  WORKOUT_STATUSES,
  workoutFileSchema,
} from "../workouts/file.ts";

export const APP_STATE_FILE_FORMAT = "lifting3.app_state" as const;
export const APP_STATE_FILE_SCHEMA_VERSION = 1 as const;

const WORKOUT_SOURCES = ["manual", "imported", "agent"] as const;
const EXERCISE_STATUSES = ["planned", "active", "completed", "skipped", "replaced"] as const;

const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nonEmptyStringSchema = z.string().trim().min(1);
const nullableTrimmedStringSchema = z.string().trim().min(1).nullable();
const nonNegativeIntegerSchema = z.int().nonnegative();
const restSecondsSchema = z.coerce.number().int().positive();

const exerciseSchemaIdSchema = z.enum(EXERCISE_SCHEMA_IDS);
const exerciseStatusSchema = z.enum(EXERCISE_STATUSES);
const setKindSchema = z.enum(SET_KINDS);
const workoutSourceSchema = z.enum(WORKOUT_SOURCES);
const workoutStatusSchema = z.enum(WORKOUT_STATUSES);

const halfStepRpeSchema = z
  .number()
  .min(0)
  .max(10)
  .refine((value) => Number.isInteger(value * 2), {
    error: "RPE must be in 0.5 increments.",
  });

export const appStateUserProfileSchema = z.strictObject({
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  value: userProfileValueSchema,
});

export const appStateSettingsSchema = z.strictObject({
  user_profile: appStateUserProfileSchema.nullable(),
});

export const appStateSetSchema = z
  .strictObject({
    actual_rpe: halfStepRpeSchema.nullable(),
    actual_weight_lbs: z.number().nonnegative().nullable(),
    confirmed_at: isoDateTimeSchema.nullable(),
    designation: setKindSchema,
    id: nonEmptyStringSchema,
    order_index: nonNegativeIntegerSchema,
    planned_rpe: halfStepRpeSchema.nullable(),
    planned_weight_lbs: z.number().nonnegative().nullable(),
    reps: nonNegativeIntegerSchema.nullable(),
  })
  .superRefine((set, context) => {
    if (set.confirmed_at != null) {
      const hasActualValue =
        set.reps != null || set.actual_rpe != null || set.actual_weight_lbs != null;

      if (!hasActualValue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Confirmed sets must include at least one actual value.",
          path: ["confirmed_at"],
        });
      }
    }
  });

export const appStateExerciseSchema = z.strictObject({
  coach_notes: nullableTrimmedStringSchema,
  exercise_schema_id: exerciseSchemaIdSchema,
  id: nonEmptyStringSchema,
  rest_seconds: restSecondsSchema.default(DEFAULT_EXERCISE_REST_SECONDS),
  order_index: nonNegativeIntegerSchema,
  sets: z.array(appStateSetSchema),
  source_exercise_name: nullableTrimmedStringSchema,
  status: exerciseStatusSchema,
  user_notes: nullableTrimmedStringSchema,
});

export const appStateImportSourceSchema = z.strictObject({
  metadata: sourceMetadataSchema,
  system: nonEmptyStringSchema,
  workout_id: nullableTrimmedStringSchema,
});

export const appStateWorkoutSchema = z
  .strictObject({
    coach_notes: nullableTrimmedStringSchema,
    completed_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema,
    date: isoDateTimeSchema,
    exercises: z.array(appStateExerciseSchema),
    id: nonEmptyStringSchema,
    import_source: appStateImportSourceSchema.nullable(),
    source: workoutSourceSchema,
    started_at: isoDateTimeSchema.nullable(),
    status: workoutStatusSchema,
    title: nonEmptyStringSchema,
    updated_at: isoDateTimeSchema,
    user_notes: nullableTrimmedStringSchema,
    version: nonNegativeIntegerSchema,
  })
  .superRefine((workout, context) => {
    const hasImportSource = workout.import_source != null;

    if (workout.source === "imported" && !hasImportSource) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Imported workouts must include an "import_source" payload.',
        path: ["import_source"],
      });
    }

    if (workout.source !== "imported" && hasImportSource) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only imported workouts may include an "import_source" payload.',
        path: ["import_source"],
      });
    }
  });

export const appStatePayloadSchema = z.strictObject({
  settings: appStateSettingsSchema,
  workouts: z.array(appStateWorkoutSchema),
});

export const appStateFileSchema = z.strictObject({
  app_state: appStatePayloadSchema,
  exported_at: isoDateTimeSchema,
  format: z.literal(APP_STATE_FILE_FORMAT),
  schema_version: z.literal(APP_STATE_FILE_SCHEMA_VERSION),
});

export const importableFileSchema = z.discriminatedUnion("format", [
  workoutFileSchema,
  appStateFileSchema,
]);

export type AppStateUserProfile = z.infer<typeof appStateUserProfileSchema>;
export type AppStateSettings = z.infer<typeof appStateSettingsSchema>;
export type AppStateSet = z.infer<typeof appStateSetSchema>;
export type AppStateExercise = z.infer<typeof appStateExerciseSchema>;
export type AppStateImportSource = z.infer<typeof appStateImportSourceSchema>;
export type AppStateWorkout = z.infer<typeof appStateWorkoutSchema>;
export type AppStatePayload = z.infer<typeof appStatePayloadSchema>;
export type AppStateFile = z.infer<typeof appStateFileSchema>;
export type ImportableFile = z.infer<typeof importableFileSchema>;

export function parseAppStateFile(value: unknown) {
  return appStateFileSchema.parse(value);
}

export function safeParseAppStateFile(value: unknown) {
  return appStateFileSchema.safeParse(value);
}

export function parseAppStateJson(json: string) {
  return parseAppStateFile(JSON.parse(json));
}

export function stringifyAppStateFile(file: AppStateFile) {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseImportableFile(value: unknown) {
  return importableFileSchema.parse(value);
}

export function safeParseImportableFile(value: unknown) {
  return importableFileSchema.safeParse(value);
}

export function parseImportableJson(json: string) {
  return parseImportableFile(JSON.parse(json));
}
