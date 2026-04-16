import { z } from "zod";
import {
  appInvalidateKeySchema,
  workoutEventTypeSchema,
} from "../app-events/schema.ts";
import {
  EXERCISE_CLASSIFICATIONS,
  EXERCISE_EQUIPMENT,
  EXERCISE_LOAD_TRACKING_MODES,
  EXERCISE_MOVEMENT_PATTERNS,
  EXERCISE_SCHEMA_IDS,
} from "../exercises/schema.ts";
import { SET_KINDS, SET_STATUSES, WORKOUT_STATUSES } from "./interchange.ts";

const WORKOUT_SOURCES = ["manual", "imported", "agent"] as const;
const EXERCISE_STATUSES = [
  "planned",
  "active",
  "completed",
  "skipped",
  "replaced",
] as const;
const AGENT_KINDS = ["general", "workout"] as const;
const WORKOUT_ROUTE_ACTIONS = [
  "start_workout",
  "update_set_actuals",
  "confirm_set",
  "skip_set",
  "add_set",
  "remove_set",
  "reorder_exercise",
  "update_workout_notes",
  "update_exercise_notes",
  "finish_workout",
] as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableTrimmedStringSchema = z.string().trim().min(1).nullable();
const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const exerciseSchemaIdSchema = z.enum(EXERCISE_SCHEMA_IDS);
const workoutStatusSchema = z.enum(WORKOUT_STATUSES);
const setStatusSchema = z.enum(SET_STATUSES);
const setKindSchema = z.enum(SET_KINDS);
const exerciseStatusSchema = z.enum(EXERCISE_STATUSES);
const workoutSourceSchema = z.enum(WORKOUT_SOURCES);
const agentKindSchema = z.enum(AGENT_KINDS);
const workoutRouteActionSchema = z.enum(WORKOUT_ROUTE_ACTIONS);
const nonNegativeIntegerSchema = z.int().nonnegative();
const positiveIntegerSchema = z.int().positive();

const halfStepRpeSchema = z
  .number()
  .min(0)
  .max(10)
  .refine((value) => Number.isInteger(value * 2), {
    error: "RPE must be in 0.5 increments.",
  });

const exerciseLoggingSchema = z.strictObject({
  loadTracking: z.enum(EXERCISE_LOAD_TRACKING_MODES),
  supportsDuration: z.boolean(),
  supportsReps: z.boolean(),
  supportsRpe: z.boolean(),
});

const setValuesSchema = z.strictObject({
  weightLbs: z.number().nonnegative().nullable(),
  reps: nonNegativeIntegerSchema.nullable(),
  rpe: halfStepRpeSchema.nullable(),
  durationSec: positiveIntegerSchema.nullable(),
});

const setValuesPatchSchema = z.strictObject({
  weightLbs: z.number().nonnegative().nullable().optional(),
  reps: nonNegativeIntegerSchema.nullable().optional(),
  rpe: halfStepRpeSchema.nullable().optional(),
  durationSec: positiveIntegerSchema.nullable().optional(),
});

const nonEmptySetValuesPatchSchema = setValuesPatchSchema.superRefine(
  (values, context) => {
    const hasDefinedField =
      values.weightLbs !== undefined ||
      values.reps !== undefined ||
      values.rpe !== undefined ||
      values.durationSec !== undefined;

    if (!hasDefinedField) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one set field update is required.",
        path: [],
      });
    }
  }
);

const notesPatchSchema = z
  .strictObject({
    userNotes: nullableTrimmedStringSchema.optional(),
    coachNotes: nullableTrimmedStringSchema.optional(),
  })
  .superRefine((notes, context) => {
    const hasDefinedField =
      notes.userNotes !== undefined || notes.coachNotes !== undefined;

    if (!hasDefinedField) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one notes field update is required.",
        path: [],
      });
    }
  });

export const workoutSetCountsSchema = z
  .strictObject({
    total: nonNegativeIntegerSchema,
    tbd: nonNegativeIntegerSchema,
    done: nonNegativeIntegerSchema,
    skipped: nonNegativeIntegerSchema,
  })
  .superRefine((counts, context) => {
    if (counts.total !== counts.tbd + counts.done + counts.skipped) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set counts must add up to total.",
        path: ["total"],
      });
    }
  });

export const workoutSetSchema = z
  .strictObject({
    id: nonEmptyStringSchema,
    orderIndex: nonNegativeIntegerSchema,
    designation: setKindSchema,
    status: setStatusSchema,
    planned: setValuesSchema,
    actual: setValuesSchema,
    completedAt: isoDateTimeSchema.nullable(),
  })
  .superRefine((set, context) => {
    const hasActualValue =
      set.actual.weightLbs != null ||
      set.actual.reps != null ||
      set.actual.rpe != null ||
      set.actual.durationSec != null;

    if (set.status === "done" && !hasActualValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A done set must include at least one actual value.",
        path: ["actual"],
      });
    }

    if (set.status === "skipped" && hasActualValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A skipped set cannot carry actual values.",
        path: ["actual"],
      });
    }
  });

export const workoutExerciseSchema = z.strictObject({
  id: nonEmptyStringSchema,
  orderIndex: nonNegativeIntegerSchema,
  exerciseSchemaId: exerciseSchemaIdSchema,
  exerciseSlug: nonEmptyStringSchema,
  displayName: nonEmptyStringSchema,
  classification: z.enum(EXERCISE_CLASSIFICATIONS),
  movementPattern: z.enum(EXERCISE_MOVEMENT_PATTERNS),
  equipment: z.array(z.enum(EXERCISE_EQUIPMENT)).min(1),
  logging: exerciseLoggingSchema,
  status: exerciseStatusSchema,
  userNotes: nullableTrimmedStringSchema,
  coachNotes: nullableTrimmedStringSchema,
  sets: z.array(workoutSetSchema),
});

export const workoutListSearchSchema = z
  .strictObject({
    status: z.array(workoutStatusSchema).default([]),
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

export const workoutListItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  date: isoDateTimeSchema,
  status: workoutStatusSchema,
  source: workoutSourceSchema,
  version: nonNegativeIntegerSchema,
  exerciseCount: nonNegativeIntegerSchema,
  counts: workoutSetCountsSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

export const workoutListLoaderDataSchema = z.strictObject({
  items: z.array(workoutListItemSchema),
  filters: workoutListSearchSchema,
  activeWorkoutId: nonEmptyStringSchema.nullable(),
});

export const workoutDetailParamsSchema = z.strictObject({
  workoutId: nonEmptyStringSchema,
});

export const workoutAgentTargetSchema = z.strictObject({
  kind: agentKindSchema,
  instanceName: nonEmptyStringSchema,
  path: nonEmptyStringSchema,
});

export const workoutAvailableActionSchema = workoutRouteActionSchema;

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

export const workoutDetailLoaderDataSchema = z.strictObject({
  workout: workoutDetailWorkoutSchema,
  exercises: z.array(workoutExerciseSchema),
  progress: workoutSetCountsSchema,
  agentTarget: workoutAgentTargetSchema,
  availableActions: z.array(workoutAvailableActionSchema),
});

const workoutMutationBaseSchema = {
  workoutId: nonEmptyStringSchema,
  expectedVersion: nonNegativeIntegerSchema,
};

export const startWorkoutInputSchema = z.strictObject({
  action: z.literal("start_workout"),
  ...workoutMutationBaseSchema,
  startedAt: isoDateTimeSchema.optional(),
});

export const updateSetActualsInputSchema = z.strictObject({
  action: z.literal("update_set_actuals"),
  ...workoutMutationBaseSchema,
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
  actual: nonEmptySetValuesPatchSchema,
});

export const confirmSetInputSchema = z.strictObject({
  action: z.literal("confirm_set"),
  ...workoutMutationBaseSchema,
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
  actual: z.strictObject({
    weightLbs: z.number().nonnegative().nullable().optional(),
    reps: nonNegativeIntegerSchema.nullable().optional(),
    rpe: halfStepRpeSchema,
    durationSec: positiveIntegerSchema.nullable().optional(),
  }),
});

export const skipSetInputSchema = z.strictObject({
  action: z.literal("skip_set"),
  ...workoutMutationBaseSchema,
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
});

export const addSetInputSchema = z.strictObject({
  action: z.literal("add_set"),
  ...workoutMutationBaseSchema,
  exerciseId: nonEmptyStringSchema,
  insertAfterSetId: nonEmptyStringSchema.nullable().optional(),
  designation: setKindSchema.default("working"),
  planned: setValuesPatchSchema.optional(),
});

export const removeSetInputSchema = z.strictObject({
  action: z.literal("remove_set"),
  ...workoutMutationBaseSchema,
  exerciseId: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
});

export const reorderExerciseInputSchema = z.strictObject({
  action: z.literal("reorder_exercise"),
  ...workoutMutationBaseSchema,
  exerciseId: nonEmptyStringSchema,
  targetIndex: nonNegativeIntegerSchema,
});

export const updateWorkoutNotesInputSchema = z.strictObject({
  action: z.literal("update_workout_notes"),
  ...workoutMutationBaseSchema,
  notes: notesPatchSchema,
});

export const updateExerciseNotesInputSchema = z.strictObject({
  action: z.literal("update_exercise_notes"),
  ...workoutMutationBaseSchema,
  exerciseId: nonEmptyStringSchema,
  notes: notesPatchSchema,
});

export const finishWorkoutInputSchema = z.strictObject({
  action: z.literal("finish_workout"),
  ...workoutMutationBaseSchema,
  completedAt: isoDateTimeSchema.optional(),
});

export const workoutMutationInputSchema = z.discriminatedUnion("action", [
  startWorkoutInputSchema,
  updateSetActualsInputSchema,
  confirmSetInputSchema,
  skipSetInputSchema,
  addSetInputSchema,
  removeSetInputSchema,
  reorderExerciseInputSchema,
  updateWorkoutNotesInputSchema,
  updateExerciseNotesInputSchema,
  finishWorkoutInputSchema,
]);

export const workoutMutationResultSchema = z.strictObject({
  ok: z.boolean(),
  action: workoutRouteActionSchema,
  workoutId: nonEmptyStringSchema,
  version: nonNegativeIntegerSchema,
  eventId: nonEmptyStringSchema,
  eventType: workoutEventTypeSchema,
  invalidate: z.array(appInvalidateKeySchema).min(1),
});

export type WorkoutListSearch = z.infer<typeof workoutListSearchSchema>;
export type WorkoutListItem = z.infer<typeof workoutListItemSchema>;
export type WorkoutListLoaderData = z.infer<typeof workoutListLoaderDataSchema>;
export type WorkoutDetailParams = z.infer<typeof workoutDetailParamsSchema>;
export type WorkoutSet = z.infer<typeof workoutSetSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutAgentTarget = z.infer<typeof workoutAgentTargetSchema>;
export type WorkoutDetailWorkout = z.infer<typeof workoutDetailWorkoutSchema>;
export type WorkoutDetailLoaderData = z.infer<
  typeof workoutDetailLoaderDataSchema
>;
export type WorkoutAvailableAction = z.infer<
  typeof workoutAvailableActionSchema
>;
export type StartWorkoutInput = z.infer<typeof startWorkoutInputSchema>;
export type UpdateSetActualsInput = z.infer<typeof updateSetActualsInputSchema>;
export type ConfirmSetInput = z.infer<typeof confirmSetInputSchema>;
export type SkipSetInput = z.infer<typeof skipSetInputSchema>;
export type AddSetInput = z.infer<typeof addSetInputSchema>;
export type RemoveSetInput = z.infer<typeof removeSetInputSchema>;
export type ReorderExerciseInput = z.infer<typeof reorderExerciseInputSchema>;
export type UpdateWorkoutNotesInput = z.infer<
  typeof updateWorkoutNotesInputSchema
>;
export type UpdateExerciseNotesInput = z.infer<
  typeof updateExerciseNotesInputSchema
>;
export type FinishWorkoutInput = z.infer<typeof finishWorkoutInputSchema>;
export type WorkoutMutationInput = z.infer<typeof workoutMutationInputSchema>;
export type WorkoutMutationResult = z.infer<typeof workoutMutationResultSchema>;
