import { describe, expect, it } from "vite-plus/test";

import {
  buildAppStateFile,
  buildAppStateImportSql,
  summarizeAppState,
} from "../../app/features/import-export/app-state";
import type {
  AppSettingRow,
  ExerciseSetRow,
  WorkoutExerciseRow,
  WorkoutRow,
} from "../../app/lib/.server/db/schema";

function createRows() {
  const settings: AppSettingRow[] = [
    {
      createdAt: "2026-04-10T08:00:00.000Z",
      key: "user_profile",
      updatedAt: "2026-04-17T09:30:00.000Z",
      value: "Goal: build strength\nConstraint: train 3 days per week",
    },
  ];
  const workoutRows: WorkoutRow[] = [
    {
      coachNotes: "Keep the session short.",
      completedAt: null,
      createdAt: "2026-04-17T11:58:00.000Z",
      date: "2026-04-17T00:00:00.000Z",
      id: "workout-2",
      importSourceMetadataJson: JSON.stringify({ facility: "hotel gym" }),
      importSourceSystem: "lifting2",
      importSourceWorkoutId: "legacy-22",
      source: "imported",
      startedAt: "2026-04-17T12:00:00.000Z",
      status: "active",
      title: "Travel Press",
      updatedAt: "2026-04-17T12:05:00.000Z",
      userNotes: "Cut accessories if time is tight.",
      version: 7,
    },
  ];
  const workoutExercises: WorkoutExerciseRow[] = [
    {
      coachNotes: "Skip if shoulder is irritated.",
      exerciseSchemaId: "bench_press_barbell",
      id: "exercise-1",
      orderIndex: 0,
      restSeconds: 150,
      sourceExerciseName: "Barbell Bench Press",
      status: "skipped",
      userNotes: "Resume next week.",
      workoutId: "workout-2",
    },
  ];
  const exerciseSetRows: ExerciseSetRow[] = [
    {
      actualRpe: null,
      actualWeightLbs: null,
      confirmedAt: null,
      designation: "working",
      exerciseId: "exercise-1",
      id: "set-1",
      orderIndex: 0,
      plannedRpe: 8,
      plannedWeightLbs: 185,
      reps: 5,
    },
  ];

  return {
    exerciseSetRows,
    settings,
    workoutExercises,
    workoutRows,
  };
}

describe("app-state import/export helpers", () => {
  it("builds a full app-state backup from persisted rows", () => {
    const file = buildAppStateFile(createRows(), "2026-04-18T09:00:00.000Z");

    expect(file.app_state.settings.user_profile?.value).toBe(
      "Goal: build strength\nConstraint: train 3 days per week",
    );
    expect(file.app_state.workouts[0]).toMatchObject({
      id: "workout-2",
      import_source: {
        metadata: { facility: "hotel gym" },
        system: "lifting2",
        workout_id: "legacy-22",
      },
      source: "imported",
      version: 7,
    });
    expect(file.app_state.workouts[0]?.exercises[0]).toMatchObject({
      rest_seconds: 150,
    });
    expect(file.app_state.workouts[0]?.exercises[0]?.sets[0]?.reps).toBe(5);
  });

  it("builds transactional restore SQL for a full app-state backup", () => {
    const file = buildAppStateFile(createRows(), "2026-04-18T09:00:00.000Z");
    const sql = buildAppStateImportSql(file);

    expect(sql).toContain("DELETE FROM app_settings;");
    expect(sql).toContain("DELETE FROM workouts;");
    expect(sql).toContain("INSERT INTO workouts");
    expect(sql).toContain("INSERT INTO app_settings");
    expect(sql).toContain("INSERT INTO exercise_sets");
    expect(sql).toContain("'lifting2'");
    expect(sql).toContain("'Barbell Bench Press'");
    expect(sql).toContain("150");
    expect(sql).toContain("'set-1'");
  });

  it("summarizes the backup payload", () => {
    const file = buildAppStateFile(createRows(), "2026-04-18T09:00:00.000Z");

    expect(summarizeAppState(file)).toEqual({
      exerciseCount: 1,
      hasUserProfile: true,
      setCount: 1,
      workoutCount: 1,
    });
  });
});
