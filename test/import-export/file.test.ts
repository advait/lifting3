import { describe, expect, it } from "vite-plus/test";

import {
  parseAppStateFile,
  parseImportableJson,
  safeParseAppStateFile,
  stringifyAppStateFile,
  type AppStateFile,
} from "../../app/features/import-export/file";
import { stringifyWorkoutFile, type WorkoutFile } from "../../app/features/workouts/file";

function createWorkoutFile(): WorkoutFile {
  return {
    exported_at: "2026-04-17T12:00:00.000Z",
    format: "lifting3.workout",
    version: 2,
    workout: {
      coach_notes: "Drive evenly through the floor.",
      completed_at: "2026-04-17T12:48:00.000Z",
      date: "2026-04-17T00:00:00.000Z",
      exercises: [
        {
          coach_notes: null,
          exercise_schema_id: "bench_press_barbell",
          id: "exercise-1",
          sets: [
            {
              confirmed_at: "2026-04-17T12:20:00.000Z",
              id: "set-1",
              reps: 5,
              rpe: 8,
              set_kind: "working",
              weight_lbs: 225,
            },
          ],
          source_exercise_name: null,
          user_notes: "Stay braced.",
        },
      ],
      id: "workout-1",
      source: {
        metadata: {
          block: "strength",
        },
        system: "lifting3",
        workout_id: null,
      },
      started_at: "2026-04-17T12:00:00.000Z",
      status: "completed",
      title: "Squat Day",
      user_notes: "Moved well.",
    },
  };
}

function createAppStateFileInput() {
  return {
    app_state: {
      settings: {
        user_profile: {
          created_at: "2026-04-10T08:00:00.000Z",
          updated_at: "2026-04-17T09:30:00.000Z",
          value: "Goal: build strength\nConstraint: train 3 days per week",
        },
      },
      workouts: [
        {
          coach_notes: "Keep the session short.",
          completed_at: null,
          created_at: "2026-04-17T11:58:00.000Z",
          date: "2026-04-17T00:00:00.000Z",
          exercises: [
            {
              coach_notes: "Skip if shoulder is irritated.",
              exercise_schema_id: "bench_press_barbell",
              id: "exercise-1",
              order_index: 0,
              sets: [
                {
                  actual_rpe: null,
                  actual_weight_lbs: null,
                  confirmed_at: null,
                  designation: "working",
                  id: "set-1",
                  order_index: 0,
                  planned_rpe: 8,
                  planned_weight_lbs: 185,
                  reps: 5,
                },
              ],
              source_exercise_name: "Barbell Bench Press",
              status: "skipped",
              user_notes: "Resume next week.",
            },
          ],
          id: "workout-2",
          import_source: {
            metadata: {
              facility: "hotel gym",
            },
            system: "lifting2",
            workout_id: "legacy-22",
          },
          source: "imported",
          started_at: "2026-04-17T12:00:00.000Z",
          status: "active",
          title: "Travel Press",
          updated_at: "2026-04-17T12:05:00.000Z",
          user_notes: "Cut accessories if time is tight.",
          version: 7,
        },
      ],
    },
    exported_at: "2026-04-18T09:00:00.000Z",
    format: "lifting3.app_state",
    schema_version: 1,
  };
}

function createAppStateFile(): AppStateFile {
  return parseAppStateFile(createAppStateFileInput());
}

describe("import/export file schemas", () => {
  it("parses a full app-state backup with settings and persisted workout fields", () => {
    const parsed = createAppStateFile();

    expect(parsed.app_state.settings.user_profile?.value).toBe(
      "Goal: build strength\nConstraint: train 3 days per week",
    );
    expect(parsed.app_state.workouts[0]).toMatchObject({
      id: "workout-2",
      source: "imported",
      title: "Travel Press",
      version: 7,
    });
    expect(parsed.app_state.workouts[0]?.exercises[0]).toMatchObject({
      source_exercise_name: "Barbell Bench Press",
      status: "skipped",
    });
    expect(parsed.app_state.workouts[0]?.exercises[0]?.sets[0]?.reps).toBe(5);
  });

  it("distinguishes workout files from full app-state files by format", () => {
    const workoutFile = createWorkoutFile();
    const appStateFile = createAppStateFile();

    expect(parseImportableJson(stringifyWorkoutFile(workoutFile)).format).toBe("lifting3.workout");
    expect(parseImportableJson(stringifyAppStateFile(appStateFile)).format).toBe(
      "lifting3.app_state",
    );
  });

  it('requires "import_source" for imported workouts in full app-state backups', () => {
    const file = createAppStateFileInput();
    const workout = file.app_state.workouts[0];

    const result = safeParseAppStateFile({
      ...file,
      app_state: {
        ...file.app_state,
        workouts: workout
          ? [
              {
                ...workout,
                import_source: null,
              },
            ]
          : [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Imported workouts must include an "import_source" payload.',
    );
  });
});
