import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  workoutDetailWorkoutSchema,
  workoutExerciseStateSchema,
  workoutSetSchema,
  type WorkoutDetailWorkout,
  type WorkoutExerciseState,
  type WorkoutSet,
} from "../app/features/workouts/contracts.ts";
type SeedMode = "local" | "remote";
type LegacySeedSetStatus = "done" | "skipped" | "tbd";
interface SeedWorkoutRecord {
  readonly exercises: readonly WorkoutExerciseState[];
  readonly workout: WorkoutDetailWorkout;
}
type SeedSetValuesInput = {
  readonly rpe?: WorkoutSet["actual"]["rpe"];
  readonly weightLbs?: WorkoutSet["actual"]["weightLbs"];
};
interface SeedSetInput {
  readonly actual?: SeedSetValuesInput;
  readonly completedAt?: string | null;
  readonly confirmedAt?: string | null;
  readonly designation: WorkoutSet["designation"];
  readonly planned?: SeedSetValuesInput;
  readonly reps?: WorkoutSet["reps"];
  readonly status?: LegacySeedSetStatus;
}
interface SeedExerciseInput {
  readonly coachNotes?: WorkoutExerciseState["coachNotes"];
  readonly exerciseSchemaId: WorkoutExerciseState["exerciseSchemaId"];
  readonly sets: readonly SeedSetInput[];
  readonly status?: WorkoutExerciseState["status"];
  readonly userNotes?: WorkoutExerciseState["userNotes"];
}
interface SeedWorkoutInput {
  readonly coachNotes?: WorkoutDetailWorkout["coachNotes"];
  readonly completedAt?: WorkoutDetailWorkout["completedAt"];
  readonly createdAt: WorkoutDetailWorkout["createdAt"];
  readonly date: WorkoutDetailWorkout["date"];
  readonly exercises: readonly SeedExerciseInput[];
  readonly id: WorkoutDetailWorkout["id"];
  readonly source: WorkoutDetailWorkout["source"];
  readonly startedAt?: WorkoutDetailWorkout["startedAt"];
  readonly status: WorkoutDetailWorkout["status"];
  readonly title: WorkoutDetailWorkout["title"];
  readonly updatedAt: WorkoutDetailWorkout["updatedAt"];
  readonly userNotes?: WorkoutDetailWorkout["userNotes"];
  readonly version: WorkoutDetailWorkout["version"];
}
function at(day: string, time: string) {
  return `${day}T${time}.000Z`;
}
function createSet(exerciseId: string, orderIndex: number, input: SeedSetInput) {
  return workoutSetSchema.parse({
    actual: {
      rpe: input.actual?.rpe ?? null,
      weightLbs: input.actual?.weightLbs ?? null,
    },
    confirmedAt: input.confirmedAt ?? input.completedAt ?? null,
    designation: input.designation,
    id: `set-${exerciseId}-${orderIndex + 1}`,
    orderIndex,
    planned: {
      rpe: input.planned?.rpe ?? null,
      weightLbs: input.planned?.weightLbs ?? null,
    },
    previous: null,
    reps: input.reps ?? null,
  });
}
function createExercise(workoutId: string, orderIndex: number, input: SeedExerciseInput) {
  const exerciseId = `exercise-${workoutId}-${orderIndex + 1}`;
  return workoutExerciseStateSchema.parse({
    coachNotes: input.coachNotes ?? null,
    exerciseSchemaId: input.exerciseSchemaId,
    id: exerciseId,
    orderIndex,
    sets: input.sets.map((set, setIndex) => createSet(exerciseId, setIndex, set)),
    status: input.status ?? "planned",
    userNotes: input.userNotes ?? null,
  });
}
function createWorkoutRecord(input: SeedWorkoutInput): SeedWorkoutRecord {
  return {
    exercises: input.exercises.map((exercise, orderIndex) =>
      createExercise(input.id, orderIndex, exercise),
    ),
    workout: workoutDetailWorkoutSchema.parse({
      coachNotes: input.coachNotes ?? null,
      completedAt: input.completedAt ?? null,
      createdAt: input.createdAt,
      date: input.date,
      id: input.id,
      source: input.source,
      startedAt: input.startedAt ?? null,
      status: input.status,
      title: input.title,
      updatedAt: input.updatedAt,
      userNotes: input.userNotes ?? null,
      version: input.version,
    }),
  };
}
function createSeedWorkouts() {
  return [
    createWorkoutRecord({
      coachNotes: "Keep the pace tight and stop the deadlifts if the pull slows down.",
      createdAt: at("2026-04-16", "00:00:00"),
      date: at("2026-04-16", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "deadlift_barbell",
          sets: [
            {
              actual: { rpe: 6.5, weightLbs: 225 },
              completedAt: at("2026-04-16", "00:09:00"),
              designation: "warmup",
              reps: 5,
              planned: { weightLbs: 225 },
              status: "done",
            },
            {
              actual: { rpe: 8, weightLbs: 275 },
              completedAt: at("2026-04-16", "00:13:00"),
              designation: "working",
              reps: 5,
              planned: { weightLbs: 275 },
              status: "done",
            },
            {
              designation: "working",
              reps: 5,
              planned: { weightLbs: 295 },
              status: "tbd",
            },
          ],
          status: "active",
          userNotes: "Brace hard before each rep.",
        },
        {
          exerciseSchemaId: "split_squat_dumbbell",
          sets: [
            {
              designation: "working",
              reps: 10,
              planned: { weightLbs: 40 },
              status: "tbd",
            },
            {
              designation: "working",
              reps: 10,
              planned: { weightLbs: 40 },
              status: "tbd",
            },
          ],
          status: "planned",
        },
        {
          exerciseSchemaId: "bicycle_crunch",
          sets: [
            {
              designation: "working",
              reps: 20,
              planned: {},
              status: "tbd",
            },
            {
              designation: "working",
              reps: 20,
              planned: {},
              status: "tbd",
            },
          ],
          status: "planned",
        },
      ],
      id: "workout-active-lower-a",
      source: "manual",
      startedAt: at("2026-04-16", "00:05:00"),
      status: "active",
      title: "Lower A",
      updatedAt: at("2026-04-16", "00:15:00"),
      userNotes: "Low back feels good. Keep rest short.",
      version: 7,
    }),
    createWorkoutRecord({
      coachNotes: "Bench volume should feel controlled and submaximal.",
      createdAt: at("2026-04-16", "00:22:00"),
      date: at("2026-04-18", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "bench_press_barbell",
          sets: [
            { designation: "working", reps: 8, planned: { weightLbs: 175 } },
            { designation: "working", reps: 8, planned: { weightLbs: 175 } },
            { designation: "working", reps: 8, planned: { weightLbs: 180 } },
          ],
        },
        {
          exerciseSchemaId: "machine_row",
          sets: [
            { designation: "working", reps: 12, planned: { weightLbs: 110 } },
            { designation: "working", reps: 12, planned: { weightLbs: 110 } },
            { designation: "working", reps: 12, planned: { weightLbs: 120 } },
          ],
        },
        {
          exerciseSchemaId: "push_ups",
          sets: [
            { designation: "working", reps: 15, planned: {} },
            { designation: "working", reps: 15, planned: {} },
          ],
        },
      ],
      id: "workout-planned-upper-a",
      source: "agent",
      status: "planned",
      title: "Upper A",
      updatedAt: at("2026-04-16", "00:22:00"),
      version: 1,
    }),
    createWorkoutRecord({
      coachNotes: "Front squats stay upright. Do not chase load.",
      createdAt: at("2026-04-16", "00:30:00"),
      date: at("2026-04-20", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "front_squat",
          sets: [
            { designation: "working", reps: 6, planned: { weightLbs: 205 } },
            { designation: "working", reps: 6, planned: { weightLbs: 205 } },
            { designation: "working", reps: 6, planned: { weightLbs: 215 } },
          ],
        },
        {
          exerciseSchemaId: "goblet_squat",
          sets: [
            { designation: "working", reps: 12, planned: { weightLbs: 70 } },
            { designation: "working", reps: 12, planned: { weightLbs: 70 } },
          ],
        },
        {
          exerciseSchemaId: "dead_bug",
          sets: [
            { designation: "working", reps: 10, planned: {} },
            { designation: "working", reps: 10, planned: {} },
            { designation: "working", reps: 10, planned: {} },
          ],
        },
      ],
      id: "workout-planned-lower-b",
      source: "manual",
      status: "planned",
      title: "Lower B",
      updatedAt: at("2026-04-16", "00:30:00"),
      userNotes: "Keep torso tall on every squat rep.",
      version: 2,
    }),
    createWorkoutRecord({
      coachNotes: "Travel session. Minimal setup, no grinders.",
      createdAt: at("2026-04-16", "00:35:00"),
      date: at("2026-04-22", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "push_ups",
          sets: [
            { designation: "working", reps: 18, planned: {} },
            { designation: "working", reps: 18, planned: {} },
            { designation: "working", reps: 15, planned: {} },
          ],
        },
        {
          exerciseSchemaId: "chest_supported_incline_row_dumbbell",
          sets: [
            { designation: "working", reps: 12, planned: { weightLbs: 45 } },
            { designation: "working", reps: 12, planned: { weightLbs: 45 } },
            { designation: "working", reps: 12, planned: { weightLbs: 50 } },
          ],
        },
        {
          exerciseSchemaId: "bicycle_crunch",
          sets: [
            { designation: "working", reps: 24, planned: {} },
            { designation: "working", reps: 24, planned: {} },
          ],
        },
      ],
      id: "workout-planned-travel-upper",
      source: "imported",
      status: "planned",
      title: "Travel Upper",
      updatedAt: at("2026-04-16", "00:35:00"),
      version: 1,
    }),
    createWorkoutRecord({
      coachNotes: "Bench moved well. Keep rows strict.",
      completedAt: at("2026-04-14", "18:40:00"),
      createdAt: at("2026-04-14", "17:45:00"),
      date: at("2026-04-14", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "bench_press_barbell",
          sets: [
            {
              actual: { rpe: 8.5, weightLbs: 175 },
              completedAt: at("2026-04-14", "18:10:00"),
              designation: "working",
              reps: 8,
              planned: { weightLbs: 175 },
              status: "done",
            },
            {
              actual: { rpe: 9, weightLbs: 175 },
              completedAt: at("2026-04-14", "18:16:00"),
              designation: "working",
              reps: 8,
              planned: { weightLbs: 175 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "machine_row",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 110 },
              completedAt: at("2026-04-14", "18:25:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 110 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 110 },
              completedAt: at("2026-04-14", "18:30:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 110 },
              status: "done",
            },
          ],
          coachNotes: "Pause briefly at the chest.",
          status: "completed",
        },
        {
          exerciseSchemaId: "bicycle_crunch",
          sets: [
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-04-14", "18:34:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 8 },
              completedAt: at("2026-04-14", "18:36:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-upper-a",
      source: "agent",
      startedAt: at("2026-04-14", "17:55:00"),
      status: "completed",
      title: "Upper A",
      updatedAt: at("2026-04-14", "18:40:00"),
      userNotes: "Shoulder felt better after warmups.",
      version: 4,
    }),
    createWorkoutRecord({
      coachNotes: "Use the last set to gauge readiness for next week.",
      completedAt: at("2026-04-12", "11:10:00"),
      createdAt: at("2026-04-12", "10:00:00"),
      date: at("2026-04-12", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "front_squat",
          sets: [
            {
              actual: { rpe: 7.5, weightLbs: 205 },
              completedAt: at("2026-04-12", "10:18:00"),
              designation: "working",
              reps: 6,
              planned: { weightLbs: 205 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 215 },
              completedAt: at("2026-04-12", "10:26:00"),
              designation: "working",
              reps: 6,
              planned: { weightLbs: 215 },
              status: "done",
            },
            {
              actual: { rpe: 9, weightLbs: 215 },
              completedAt: at("2026-04-12", "10:34:00"),
              designation: "working",
              reps: 6,
              planned: { weightLbs: 215 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "split_squat_dumbbell",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 40 },
              completedAt: at("2026-04-12", "10:45:00"),
              designation: "working",
              reps: 10,
              planned: { weightLbs: 40 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 40 },
              completedAt: at("2026-04-12", "10:53:00"),
              designation: "working",
              reps: 10,
              planned: { weightLbs: 40 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "bicycle_crunch",
          sets: [
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-04-12", "11:02:00"),
              designation: "working",
              reps: 24,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 8 },
              completedAt: at("2026-04-12", "11:05:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-lower-b",
      source: "manual",
      startedAt: at("2026-04-12", "10:08:00"),
      status: "completed",
      title: "Lower B",
      updatedAt: at("2026-04-12", "11:10:00"),
      userNotes: "Knees felt good after the first set.",
      version: 3,
    }),
    createWorkoutRecord({
      coachNotes: "Imported hotel gym session. Keep the dumbbells moving cleanly.",
      completedAt: at("2026-04-10", "08:50:00"),
      createdAt: at("2026-04-10", "08:00:00"),
      date: at("2026-04-10", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "seated_overhead_press_dumbbell",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 45 },
              completedAt: at("2026-04-10", "08:12:00"),
              designation: "working",
              reps: 10,
              planned: { weightLbs: 45 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 45 },
              completedAt: at("2026-04-10", "08:18:00"),
              designation: "working",
              reps: 10,
              planned: { weightLbs: 45 },
              status: "done",
            },
            {
              actual: { rpe: 9, weightLbs: 45 },
              completedAt: at("2026-04-10", "08:24:00"),
              designation: "working",
              reps: 9,
              planned: { weightLbs: 45 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "chest_supported_incline_row_dumbbell",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 50 },
              completedAt: at("2026-04-10", "08:32:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 50 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 50 },
              completedAt: at("2026-04-10", "08:38:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 50 },
              status: "done",
            },
            {
              actual: { rpe: 9, weightLbs: 55 },
              completedAt: at("2026-04-10", "08:43:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 55 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "push_ups",
          sets: [
            {
              actual: { rpe: 8 },
              completedAt: at("2026-04-10", "08:46:00"),
              designation: "working",
              reps: 18,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 9 },
              completedAt: at("2026-04-10", "08:48:00"),
              designation: "working",
              reps: 16,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-upper-b",
      source: "imported",
      startedAt: at("2026-04-10", "08:05:00"),
      status: "completed",
      title: "Upper B",
      updatedAt: at("2026-04-10", "08:50:00"),
      version: 2,
    }),
    createWorkoutRecord({
      coachNotes: "Hinge volume stays honest. No hitching.",
      completedAt: at("2026-04-08", "19:20:00"),
      createdAt: at("2026-04-08", "18:10:00"),
      date: at("2026-04-08", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "deadlift_barbell",
          sets: [
            {
              actual: { rpe: 6.5, weightLbs: 225 },
              completedAt: at("2026-04-08", "18:25:00"),
              designation: "warmup",
              reps: 5,
              planned: { weightLbs: 225 },
              status: "done",
            },
            {
              actual: { rpe: 8, weightLbs: 285 },
              completedAt: at("2026-04-08", "18:35:00"),
              designation: "working",
              reps: 5,
              planned: { weightLbs: 285 },
              status: "done",
            },
            {
              actual: { rpe: 9, weightLbs: 305 },
              completedAt: at("2026-04-08", "18:44:00"),
              designation: "working",
              reps: 4,
              planned: { weightLbs: 305 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "goblet_squat",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 70 },
              completedAt: at("2026-04-08", "18:56:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 70 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 70 },
              completedAt: at("2026-04-08", "19:02:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 70 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "dead_bug",
          sets: [
            {
              actual: { rpe: 7 },
              completedAt: at("2026-04-08", "19:10:00"),
              designation: "working",
              reps: 10,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-04-08", "19:14:00"),
              designation: "working",
              reps: 10,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-lower-c",
      source: "manual",
      startedAt: at("2026-04-08", "18:18:00"),
      status: "completed",
      title: "Lower C",
      updatedAt: at("2026-04-08", "19:20:00"),
      userNotes: "Grip was the limiter on the last set.",
      version: 5,
    }),
    createWorkoutRecord({
      coachNotes: "Clean assistance day with no barbell fatigue.",
      completedAt: at("2026-04-06", "12:35:00"),
      createdAt: at("2026-04-06", "11:40:00"),
      date: at("2026-04-06", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "bench_press_dumbbell",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 60 },
              completedAt: at("2026-04-06", "11:55:00"),
              designation: "working",
              reps: 10,
              planned: { weightLbs: 60 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 60 },
              completedAt: at("2026-04-06", "12:02:00"),
              designation: "working",
              reps: 10,
              planned: { weightLbs: 60 },
              status: "done",
            },
            {
              actual: { rpe: 9, weightLbs: 65 },
              completedAt: at("2026-04-06", "12:09:00"),
              designation: "working",
              reps: 8,
              planned: { weightLbs: 65 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "band_pullaparts",
          sets: [
            {
              actual: { rpe: 7 },
              completedAt: at("2026-04-06", "12:15:00"),
              designation: "working",
              reps: 25,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-04-06", "12:18:00"),
              designation: "working",
              reps: 25,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "bicycle_crunch",
          sets: [
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-04-06", "12:24:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 8 },
              completedAt: at("2026-04-06", "12:28:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-upper-c",
      source: "agent",
      startedAt: at("2026-04-06", "11:48:00"),
      status: "completed",
      title: "Upper C",
      updatedAt: at("2026-04-06", "12:35:00"),
      version: 3,
    }),
    createWorkoutRecord({
      coachNotes: "Imported hotel workout. Simple and repeatable.",
      completedAt: at("2026-04-04", "07:55:00"),
      createdAt: at("2026-04-04", "07:05:00"),
      date: at("2026-04-04", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "push_ups",
          sets: [
            {
              actual: { rpe: 8 },
              completedAt: at("2026-04-04", "07:18:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 8.5 },
              completedAt: at("2026-04-04", "07:22:00"),
              designation: "working",
              reps: 18,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 9 },
              completedAt: at("2026-04-04", "07:26:00"),
              designation: "working",
              reps: 16,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "split_squat_dumbbell",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 25 },
              completedAt: at("2026-04-04", "07:36:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 25 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 25 },
              completedAt: at("2026-04-04", "07:42:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 25 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "dead_bug",
          sets: [
            {
              actual: { rpe: 7 },
              completedAt: at("2026-04-04", "07:48:00"),
              designation: "working",
              reps: 10,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-04-04", "07:51:00"),
              designation: "working",
              reps: 10,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-travel-hotel",
      source: "imported",
      startedAt: at("2026-04-04", "07:10:00"),
      status: "completed",
      title: "Travel Hotel",
      updatedAt: at("2026-04-04", "07:55:00"),
      version: 2,
    }),
    createWorkoutRecord({
      coachNotes: "Recovery day. Move, breathe, and leave fresh.",
      completedAt: at("2026-04-02", "09:05:00"),
      createdAt: at("2026-04-02", "08:20:00"),
      date: at("2026-04-02", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "warm_up",
          sets: [
            {
              actual: {},
              completedAt: at("2026-04-02", "08:28:00"),
              designation: "warmup",
              reps: 8,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "dead_bug",
          sets: [
            {
              actual: { rpe: 6.5 },
              completedAt: at("2026-04-02", "08:40:00"),
              designation: "working",
              reps: 8,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 7 },
              completedAt: at("2026-04-02", "08:45:00"),
              designation: "working",
              reps: 10,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-04-02", "08:49:00"),
              designation: "working",
              reps: 10,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "bicycle_crunch",
          sets: [
            {
              actual: { rpe: 7 },
              completedAt: at("2026-04-02", "08:56:00"),
              designation: "working",
              reps: 18,
              planned: {},
              status: "done",
            },
            {
              completedAt: null,
              designation: "working",
              reps: 20,
              planned: {},
              status: "skipped",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "band_pullaparts",
          sets: [
            {
              actual: { rpe: 6.5 },
              completedAt: at("2026-04-02", "09:00:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 7 },
              completedAt: at("2026-04-02", "09:03:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-recovery-reset",
      source: "manual",
      startedAt: at("2026-04-02", "08:25:00"),
      status: "completed",
      title: "Recovery Reset",
      updatedAt: at("2026-04-02", "09:05:00"),
      version: 2,
    }),
    createWorkoutRecord({
      coachNotes: "Bench tune-up day. Crisp bar path over extra fatigue.",
      completedAt: at("2026-03-31", "18:05:00"),
      createdAt: at("2026-03-31", "17:00:00"),
      date: at("2026-03-31", "00:00:00"),
      exercises: [
        {
          exerciseSchemaId: "bench_press_barbell",
          sets: [
            {
              actual: { rpe: 6.5, weightLbs: 135 },
              completedAt: at("2026-03-31", "17:18:00"),
              designation: "warmup",
              reps: 8,
              planned: { weightLbs: 135 },
              status: "done",
            },
            {
              actual: { rpe: 8, weightLbs: 185 },
              completedAt: at("2026-03-31", "17:29:00"),
              designation: "working",
              reps: 6,
              planned: { weightLbs: 185 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 190 },
              completedAt: at("2026-03-31", "17:38:00"),
              designation: "working",
              reps: 6,
              planned: { weightLbs: 190 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "machine_row",
          sets: [
            {
              actual: { rpe: 8, weightLbs: 120 },
              completedAt: at("2026-03-31", "17:47:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 120 },
              status: "done",
            },
            {
              actual: { rpe: 8.5, weightLbs: 120 },
              completedAt: at("2026-03-31", "17:52:00"),
              designation: "working",
              reps: 12,
              planned: { weightLbs: 120 },
              status: "done",
            },
          ],
          status: "completed",
        },
        {
          exerciseSchemaId: "bicycle_crunch",
          sets: [
            {
              actual: { rpe: 7.5 },
              completedAt: at("2026-03-31", "17:58:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
            {
              actual: { rpe: 8 },
              completedAt: at("2026-03-31", "18:01:00"),
              designation: "working",
              reps: 20,
              planned: {},
              status: "done",
            },
          ],
          status: "completed",
        },
      ],
      id: "workout-completed-bench-tuneup",
      source: "agent",
      startedAt: at("2026-03-31", "17:08:00"),
      status: "completed",
      title: "Bench Tune-Up",
      updatedAt: at("2026-03-31", "18:05:00"),
      version: 6,
    }),
  ] as const;
}
function parseSeedMode(argv: readonly string[]): SeedMode {
  const hasLocal = argv.includes("--local");
  const hasRemote = argv.includes("--remote");
  if (hasLocal === hasRemote) {
    throw new Error("Pass exactly one of --local or --remote.");
  }
  return hasLocal ? "local" : "remote";
}
function sqlValue(value: number | string | null) {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite number: ${value}`);
    }
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}
function createInsertStatement(
  tableName: string,
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<number | string | null>>,
) {
  if (rows.length === 0) {
    return "";
  }
  const renderedRows = rows.map((row) => `  (${row.map((value) => sqlValue(value)).join(", ")})`);
  return [
    `INSERT INTO ${tableName} (${columns.join(", ")})`,
    "VALUES",
    renderedRows.join(",\n"),
    ";",
  ].join("\n");
}
function buildSeedSql(records: readonly SeedWorkoutRecord[]) {
  const workoutRows = records.map(
    ({ workout }) =>
      [
        workout.id,
        workout.title,
        workout.date,
        workout.status,
        workout.source,
        workout.version,
        workout.startedAt,
        workout.completedAt,
        workout.createdAt,
        workout.updatedAt,
        workout.userNotes,
        workout.coachNotes,
      ] satisfies ReadonlyArray<number | string | null>,
  );
  const exerciseRows = records.flatMap(({ exercises, workout }) =>
    exercises.map(
      (exercise) =>
        [
          exercise.id,
          workout.id,
          exercise.orderIndex,
          exercise.exerciseSchemaId,
          exercise.status,
          exercise.userNotes,
          exercise.coachNotes,
        ] satisfies ReadonlyArray<number | string | null>,
    ),
  );
  const setRows = records.flatMap(({ exercises }) =>
    exercises.flatMap((exercise) =>
      exercise.sets.map(
        (set) =>
          [
            set.id,
            exercise.id,
            set.orderIndex,
            set.designation,
            set.reps,
            set.planned.weightLbs,
            set.planned.rpe,
            set.actual.weightLbs,
            set.actual.rpe,
            set.confirmedAt,
          ] satisfies ReadonlyArray<number | string | null>,
      ),
    ),
  );
  const statements = [
    "PRAGMA foreign_keys = ON;",
    "BEGIN TRANSACTION;",
    "DELETE FROM exercise_sets;",
    "DELETE FROM workout_exercises;",
    "DELETE FROM workouts;",
    createInsertStatement(
      "workouts",
      [
        "id",
        "title",
        "date",
        "status",
        "source",
        "version",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
        "user_notes",
        "coach_notes",
      ],
      workoutRows,
    ),
    createInsertStatement(
      "workout_exercises",
      [
        "id",
        "workout_id",
        "order_index",
        "exercise_schema_id",
        "status",
        "user_notes",
        "coach_notes",
      ],
      exerciseRows,
    ),
    createInsertStatement(
      "exercise_sets",
      [
        "id",
        "exercise_id",
        "order_index",
        "designation",
        "reps",
        "planned_weight_lbs",
        "planned_rpe",
        "actual_weight_lbs",
        "actual_rpe",
        "confirmed_at",
      ],
      setRows,
    ),
    "COMMIT;",
    "",
  ];
  return statements.filter(Boolean).join("\n\n");
}
function runWranglerSeed(mode: SeedMode, sqlFilePath: string) {
  const packageManagerExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const modeFlag = mode === "local" ? "--local" : "--remote";
  const result = spawnSync(
    packageManagerExecutable,
    ["wrangler", "d1", "execute", "DB", modeFlag, "--yes", "--file", sqlFilePath],
    {
      cwd: process.cwd(),
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`Wrangler D1 seed failed with exit code ${result.status ?? "unknown"}.`);
  }
}
function main() {
  const mode = parseSeedMode(process.argv.slice(2));
  const records = createSeedWorkouts();
  const sql = buildSeedSql(records);
  const tempDirectory = mkdtempSync(join(tmpdir(), "lifting3-seed-"));
  const sqlFilePath = join(tempDirectory, "seed-workouts.sql");
  writeFileSync(sqlFilePath, sql, "utf8");
  try {
    runWranglerSeed(mode, sqlFilePath);
    process.stdout.write(
      `Seeded ${records.length} workouts into D1 (${mode}) using a deterministic reseed.\n`,
    );
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
}
main();
