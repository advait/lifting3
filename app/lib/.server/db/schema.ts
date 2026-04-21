import { relations } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { APP_SETTING_KEYS } from "../../../features/settings/contracts.ts";
import { EXERCISE_SCHEMA_IDS } from "../../../features/exercises/schema.ts";
import { SET_KINDS, WORKOUT_STATUSES } from "../../../features/workouts/file.ts";

const WORKOUT_SOURCES = ["manual", "imported", "agent"] as const;
const EXERCISE_STATUSES = ["planned", "active", "completed", "skipped", "replaced"] as const;

/**
 * Authoritative workout header rows. Everything here is persisted state rather
 * than view decoration or controller policy.
 */
export const workouts = sqliteTable(
  "workouts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    status: text("status", { enum: WORKOUT_STATUSES }).notNull(),
    source: text("source", { enum: WORKOUT_SOURCES }).notNull(),
    version: integer("version").notNull().default(1),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    userNotes: text("user_notes"),
    coachNotes: text("coach_notes"),
    importSourceSystem: text("import_source_system"),
    importSourceWorkoutId: text("import_source_workout_id"),
    importSourceMetadataJson: text("import_source_metadata_json"),
  },
  (table) => [
    index("workouts_date_idx").on(table.date),
    index("workouts_status_idx").on(table.status),
    index("workouts_source_idx").on(table.source),
    index("workouts_updated_at_idx").on(table.updatedAt),
  ],
);

/** Simple key/value app settings that persist durable user-level defaults outside a workout. */
export const appSettings = sqliteTable(
  "app_settings",
  {
    key: text("key", { enum: APP_SETTING_KEYS }).primaryKey(),
    value: text("value").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("app_settings_updated_at_idx").on(table.updatedAt)],
);

/**
 * Persisted exercises inside one workout. Catalog-derived fields such as
 * display name and equipment stay out of D1 and are joined in application code.
 */
export const workoutExercises = sqliteTable(
  "workout_exercises",
  {
    id: text("id").primaryKey(),
    workoutId: text("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    exerciseSchemaId: text("exercise_schema_id", {
      enum: EXERCISE_SCHEMA_IDS,
    }).notNull(),
    status: text("status", { enum: EXERCISE_STATUSES }).notNull(),
    sourceExerciseName: text("source_exercise_name"),
    userNotes: text("user_notes"),
    coachNotes: text("coach_notes"),
  },
  (table) => [
    uniqueIndex("workout_exercises_workout_order_unique").on(table.workoutId, table.orderIndex),
    index("workout_exercises_schema_idx").on(table.exerciseSchemaId),
  ],
);

/**
 * Persisted sets for one workout exercise. Reps are canonical while planned and
 * actual columns remain only for load-specific fields.
 */
export const exerciseSets = sqliteTable(
  "exercise_sets",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    designation: text("designation", { enum: SET_KINDS }).notNull(),
    reps: integer("reps"),
    plannedWeightLbs: real("planned_weight_lbs"),
    plannedRpe: real("planned_rpe"),
    actualWeightLbs: real("actual_weight_lbs"),
    actualRpe: real("actual_rpe"),
    confirmedAt: text("confirmed_at"),
  },
  (table) => [
    uniqueIndex("exercise_sets_exercise_order_unique").on(table.exerciseId, table.orderIndex),
    index("exercise_sets_exercise_idx").on(table.exerciseId),
    index("exercise_sets_confirmed_at_idx").on(table.confirmedAt),
  ],
);

export const workoutsRelations = relations(workouts, ({ many }) => ({
  exercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ many, one }) => ({
  sets: many(exerciseSets),
  workout: one(workouts, {
    fields: [workoutExercises.workoutId],
    references: [workouts.id],
  }),
}));

export const exerciseSetsRelations = relations(exerciseSets, ({ one }) => ({
  exercise: one(workoutExercises, {
    fields: [exerciseSets.exerciseId],
    references: [workoutExercises.id],
  }),
}));

export type WorkoutRow = typeof workouts.$inferSelect;
export type NewWorkoutRow = typeof workouts.$inferInsert;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type NewAppSettingRow = typeof appSettings.$inferInsert;
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect;
export type NewWorkoutExerciseRow = typeof workoutExercises.$inferInsert;
export type ExerciseSetRow = typeof exerciseSets.$inferSelect;
export type NewExerciseSetRow = typeof exerciseSets.$inferInsert;
