import { z } from "zod";
import {
  EXERCISE_CLASSIFICATIONS,
  EXERCISE_EQUIPMENT,
  EXERCISE_LOAD_TRACKING_MODES,
  EXERCISE_MOVEMENT_PATTERNS,
  EXERCISE_SCHEMA_IDS,
} from "../exercises/schema.ts";
import { SET_KINDS, WORKOUT_STATUSES } from "./file.ts";
import { DEFAULT_EXERCISE_REST_SECONDS } from "./rest-timer.ts";

const WORKOUT_SOURCES = ["manual", "imported", "agent"] as const;
const EXERCISE_STATUSES = ["planned", "active", "completed", "skipped", "replaced"] as const;
const AGENT_KINDS = ["general", "workout"] as const;
export const GENERAL_COACH_INSTANCE_NAME = "general";
export const WORKOUT_COACH_INSTANCE_PREFIX = "workout:";

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableTrimmedStringSchema = z.string().trim().min(1).nullable();
const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const exerciseSchemaIdSchema = z.enum(EXERCISE_SCHEMA_IDS);
const workoutStatusSchema = z.enum(WORKOUT_STATUSES);
const setKindSchema = z.enum(SET_KINDS);
const exerciseStatusSchema = z.enum(EXERCISE_STATUSES);
const workoutSourceSchema = z.enum(WORKOUT_SOURCES);
const agentKindSchema = z.enum(AGENT_KINDS);
const nonNegativeIntegerSchema = z.int().nonnegative();
const positiveIntegerSchema = z.int().positive();
const restSecondsSchema = z.coerce.number().int().positive();

const halfStepRpeSchema = z
  .number()
  .min(0)
  .max(10)
  .refine((value) => Number.isInteger(value * 2), {
    error: "RPE must be in 0.5 increments.",
  });

const exerciseLoggingSchema = z.strictObject({
  loadTracking: z.enum(EXERCISE_LOAD_TRACKING_MODES),
  supportsReps: z.boolean(),
  supportsRpe: z.boolean(),
});

const setLoadValuesSchema = z.strictObject({
  weightLbs: z.number().nonnegative().nullable(),
  rpe: halfStepRpeSchema.nullable(),
});

const setPerformanceSnapshotSchema = z.strictObject({
  weightLbs: z.number().nonnegative().nullable(),
  reps: nonNegativeIntegerSchema.nullable(),
  rpe: halfStepRpeSchema.nullable(),
});

export const workoutSetPersonalRecordSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("weight"),
    previousMaxWeightLbs: z.number().nonnegative().nullable(),
  }),
]);

/** Summarizes visible set progress for list/detail routes without exposing storage internals. */
export const workoutSetCountsSchema = z
  .strictObject({
    total: nonNegativeIntegerSchema,
    confirmed: nonNegativeIntegerSchema,
    unconfirmed: nonNegativeIntegerSchema,
  })
  .superRefine((counts, context) => {
    if (counts.total !== counts.confirmed + counts.unconfirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set counts must add up to total.",
        path: ["total"],
      });
    }
  });

/** Defines the set shape the workout UI renders and mutates regardless of backing storage. */
export const workoutSetSchema = z
  .strictObject({
    id: nonEmptyStringSchema,
    orderIndex: nonNegativeIntegerSchema,
    designation: setKindSchema,
    reps: nonNegativeIntegerSchema.nullable(),
    planned: setLoadValuesSchema,
    actual: setLoadValuesSchema,
    previous: setPerformanceSnapshotSchema.nullable(),
    personalRecord: workoutSetPersonalRecordSchema.nullable().default(null),
    confirmedAt: isoDateTimeSchema.nullable(),
  })
  .superRefine((set, context) => {
    const hasActualValue =
      set.reps != null || set.actual.weightLbs != null || set.actual.rpe != null;

    if (set.confirmedAt != null && !hasActualValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A confirmed set must include at least one logged value.",
        path: ["confirmedAt"],
      });
    }
  });

/**
 * Captures only the persisted exercise state we expect to house in D1.
 * Derived exercise-catalog decoration belongs in separate loader/view shapes.
 */
export const workoutExerciseStateSchema = z.strictObject({
  id: nonEmptyStringSchema,
  orderIndex: nonNegativeIntegerSchema,
  exerciseSchemaId: exerciseSchemaIdSchema,
  restSeconds: restSecondsSchema.default(DEFAULT_EXERCISE_REST_SECONDS),
  status: exerciseStatusSchema,
  userNotes: nullableTrimmedStringSchema,
  coachNotes: nullableTrimmedStringSchema,
  sets: z.array(workoutSetSchema),
});

/** Carries the exercise-catalog decoration the UI can derive from exerciseSchemaId. */
export const workoutExerciseDisplaySchema = z.strictObject({
  exerciseSlug: nonEmptyStringSchema,
  displayName: nonEmptyStringSchema,
  classification: z.enum(EXERCISE_CLASSIFICATIONS),
  movementPattern: z.enum(EXERCISE_MOVEMENT_PATTERNS),
  equipment: z.array(z.enum(EXERCISE_EQUIPMENT)).min(1),
  logging: exerciseLoggingSchema,
});

/** Decorated exercise route/view model combining persisted state with catalog-derived fields. */
export const workoutExerciseSchema = workoutExerciseStateSchema.extend(
  workoutExerciseDisplaySchema.shape,
);

/** Validates the URL/query filter surface for the workouts index route. */
export const workoutListSearchSchema = z
  .strictObject({
    status: z.array(workoutStatusSchema).default([]),
    source: z.array(workoutSourceSchema).default([]),
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    exercise: nonEmptyStringSchema.optional(),
    page: positiveIntegerSchema.default(1),
  })
  .superRefine((search, context) => {
    if (
      search.dateFrom !== undefined &&
      search.dateTo !== undefined &&
      search.dateFrom > search.dateTo
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dateFrom must be on or before dateTo.",
        path: ["dateFrom"],
      });
    }
  });

export const workoutListExerciseSummarySchema = z
  .strictObject({
    displayName: nonEmptyStringSchema,
    orderIndex: nonNegativeIntegerSchema,
    confirmedSetCount: nonNegativeIntegerSchema,
    totalSetCount: nonNegativeIntegerSchema,
    topSet: z.strictObject({
      rpe: halfStepRpeSchema.nullable(),
      weightLbs: z.number().nonnegative().nullable(),
    }),
  })
  .superRefine((summary, context) => {
    if (summary.confirmedSetCount > summary.totalSetCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confirmedSetCount cannot exceed totalSetCount.",
        path: ["confirmedSetCount"],
      });
    }
  });

export const workoutListItemSchema = z
  .strictObject({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    date: isoDateTimeSchema,
    status: workoutStatusSchema,
    source: workoutSourceSchema,
    version: nonNegativeIntegerSchema,
    exerciseCount: nonNegativeIntegerSchema,
    exerciseSummaries: z.array(workoutListExerciseSummarySchema),
    counts: workoutSetCountsSchema,
    startedAt: isoDateTimeSchema.nullable(),
    completedAt: isoDateTimeSchema.nullable(),
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((item, context) => {
    if (item.exerciseCount !== item.exerciseSummaries.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exerciseCount must match the number of exercise summaries.",
        path: ["exerciseCount"],
      });
    }
  });

/** Describes the authoritative loader payload for the workouts list screen. */
export const workoutListLoaderDataSchema = z.strictObject({
  items: z.array(workoutListItemSchema),
  filters: workoutListSearchSchema,
  activeWorkoutId: nonEmptyStringSchema.nullable(),
});

/** Makes the route-param boundary explicit before detail loaders or actions touch domain code. */
export const workoutDetailParamsSchema = z.strictObject({
  workoutId: nonEmptyStringSchema,
});

/** Identifies the canonical agent thread a workout screen should attach to. */
export const workoutAgentTargetSchema = z.strictObject({
  kind: agentKindSchema,
  instanceName: nonEmptyStringSchema,
});

export const workoutDetailWorkoutSchema = z.strictObject({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  date: isoDateTimeSchema,
  status: workoutStatusSchema,
  source: workoutSourceSchema,
  version: nonNegativeIntegerSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  userNotes: nullableTrimmedStringSchema,
  coachNotes: nullableTrimmedStringSchema,
});

/** Defines the complete RR7 loader contract for a workout detail page. */
export const workoutDetailLoaderDataSchema = z.strictObject({
  workout: workoutDetailWorkoutSchema,
  exercises: z.array(workoutExerciseSchema),
  progress: workoutSetCountsSchema,
  agentTarget: workoutAgentTargetSchema,
  loadedAt: isoDateTimeSchema,
});

export type WorkoutListSearch = z.infer<typeof workoutListSearchSchema>;
export type WorkoutListExerciseSummary = z.infer<typeof workoutListExerciseSummarySchema>;
export type WorkoutListItem = z.infer<typeof workoutListItemSchema>;
export type WorkoutListLoaderData = z.infer<typeof workoutListLoaderDataSchema>;
export type WorkoutDetailParams = z.infer<typeof workoutDetailParamsSchema>;
export type WorkoutSetPersonalRecord = z.infer<typeof workoutSetPersonalRecordSchema>;
export type WorkoutSet = z.infer<typeof workoutSetSchema>;
export type WorkoutExerciseState = z.infer<typeof workoutExerciseStateSchema>;
export type WorkoutExerciseDisplay = z.infer<typeof workoutExerciseDisplaySchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutAgentTarget = z.infer<typeof workoutAgentTargetSchema>;
export type WorkoutDetailWorkout = z.infer<typeof workoutDetailWorkoutSchema>;
export type WorkoutDetailLoaderData = z.infer<typeof workoutDetailLoaderDataSchema>;

export function createGeneralCoachTarget(): WorkoutAgentTarget {
  return {
    instanceName: GENERAL_COACH_INSTANCE_NAME,
    kind: "general",
  };
}

export function createWorkoutCoachTarget(workoutId: string): WorkoutAgentTarget {
  return {
    instanceName: `${WORKOUT_COACH_INSTANCE_PREFIX}${workoutId}`,
    kind: "workout",
  };
}

export function parseCoachInstanceName(instanceName: string) {
  if (instanceName === GENERAL_COACH_INSTANCE_NAME) {
    return {
      kind: "general" as const,
    };
  }

  if (instanceName.startsWith(WORKOUT_COACH_INSTANCE_PREFIX)) {
    const workoutId = instanceName.slice(WORKOUT_COACH_INSTANCE_PREFIX.length).trim();

    if (workoutId.length > 0) {
      return {
        kind: "workout" as const,
        workoutId,
      };
    }
  }

  return null;
}
