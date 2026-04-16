import { z } from "zod";

import { EXERCISE_SCHEMA_IDS } from "../exercises/schema.ts";

export const WORKOUT_INTERCHANGE_FORMAT = "lifting3.workout" as const;
export const WORKOUT_INTERCHANGE_VERSION = 2 as const;

export const WORKOUT_STATUSES = ["planned", "active", "completed", "canceled"] as const;

export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];

export const SET_KINDS = ["warmup", "working"] as const;
export type SetKind = (typeof SET_KINDS)[number];

const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nullableTrimmedStringSchema = z.string().trim().min(1).nullable();
const exerciseSchemaIdSchema = z.enum(EXERCISE_SCHEMA_IDS);

type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const sourceMetadataSchema = z.record(z.string(), jsonValueSchema);

/** Captures where a workout came from so imports and generated plans can stay attributable. */
export const workoutSourceSchema = z.object({
  system: z.string().trim().min(1),
  workout_id: nullableTrimmedStringSchema.optional(),
  metadata: sourceMetadataSchema.default({}),
});

const halfStepRpeSchema = z
  .number()
  .min(0)
  .max(10)
  .refine((value) => Number.isInteger(value * 2), {
    message: "RPE must be in 0.5 increments.",
  });

/** Defines the portable per-set shape used for import, export, and internal exchange. */
export const workoutInterchangeSetSchema = z
  .object({
    id: z.string().trim().min(1),
    confirmed_at: isoDateTimeSchema.nullable().optional(),
    set_kind: z.enum(SET_KINDS),
    weight_lbs: z.number().nonnegative().nullable().optional(),
    reps: z.number().int().nonnegative().nullable().optional(),
    rpe: halfStepRpeSchema.nullable().optional(),
  })
  .superRefine((set, context) => {
    if (set.confirmed_at != null) {
      const hasLoggedValue = set.reps != null || set.weight_lbs != null || set.rpe != null;

      if (!hasLoggedValue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Completed sets must include at least one logged value such as reps, weight, or RPE.",
          path: [],
        });
      }
    }
  });

/** Preserves exercise order, notes, and canonical exercise ids at the interchange boundary. */
export const workoutInterchangeExerciseSchema = z.object({
  id: z.string().trim().min(1),
  exercise_schema_id: exerciseSchemaIdSchema,
  source_exercise_name: nullableTrimmedStringSchema.optional(),
  user_notes: nullableTrimmedStringSchema.optional(),
  coach_notes: nullableTrimmedStringSchema.optional(),
  sets: z.array(workoutInterchangeSetSchema),
});

/** Represents one whole workout file payload apart from format/version wrapper metadata. */
export const workoutInterchangeWorkoutSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: z.enum(WORKOUT_STATUSES),
  date: isoDateTimeSchema,
  started_at: isoDateTimeSchema.nullable().optional(),
  completed_at: isoDateTimeSchema.nullable().optional(),
  user_notes: nullableTrimmedStringSchema.optional(),
  coach_notes: nullableTrimmedStringSchema.optional(),
  source: workoutSourceSchema,
  exercises: z.array(workoutInterchangeExerciseSchema),
});

/** Serves as the stable import/export contract for workouts across tooling and environments. */
export const workoutInterchangeFileSchema = z.object({
  format: z.literal(WORKOUT_INTERCHANGE_FORMAT),
  version: z.literal(WORKOUT_INTERCHANGE_VERSION),
  exported_at: isoDateTimeSchema.optional(),
  workout: workoutInterchangeWorkoutSchema,
});

export type WorkoutInterchangeSet = z.infer<typeof workoutInterchangeSetSchema>;
export type WorkoutInterchangeExercise = z.infer<typeof workoutInterchangeExerciseSchema>;
export type WorkoutInterchangeWorkout = z.infer<typeof workoutInterchangeWorkoutSchema>;
export type WorkoutInterchangeFile = z.infer<typeof workoutInterchangeFileSchema>;

export function parseWorkoutInterchangeFile(value: unknown) {
  return workoutInterchangeFileSchema.parse(value);
}

export function safeParseWorkoutInterchangeFile(value: unknown) {
  return workoutInterchangeFileSchema.safeParse(value);
}

export function parseWorkoutInterchangeJson(json: string) {
  return parseWorkoutInterchangeFile(JSON.parse(json));
}

export function stringifyWorkoutInterchangeFile(file: WorkoutInterchangeFile) {
  return `${JSON.stringify(file, null, 2)}\n`;
}
