import { describe, expect, it } from "vite-plus/test";

import {
  assertUniqueWorkoutIds,
  buildImportedWorkoutRecord,
  buildWorkoutImportSql,
  toImportedWorkoutRows,
} from "../../app/features/workouts/importer";
import { parseWorkoutFile } from "../../app/features/workouts/file";

const IMPORTED_AT = "2026-04-17T12:00:00.000Z";

function createWorkoutFile() {
  return parseWorkoutFile({
    format: "lifting3.workout",
    version: 2,
    workout: {
      coach_notes: "Keep the dumbbells moving cleanly.",
      completed_at: "2026-04-04T07:55:00.000Z",
      date: "2026-04-04T00:00:00.000Z",
      exercises: [
        {
          exercise_schema_id: "bench_press_dumbbell",
          id: "exercise-1",
          sets: [
            {
              confirmed_at: "2026-04-04T07:18:00.000Z",
              id: "set-1",
              reps: 10,
              rpe: 8,
              set_kind: "working",
              weight_lbs: 60,
            },
            {
              id: "set-2",
              reps: 12,
              set_kind: "working",
              weight_lbs: 55,
            },
          ],
          source_exercise_name: "Dumbbell Bench Press",
          user_notes: "Elbows tucked.",
        },
        {
          exercise_schema_id: "bicycle_crunch",
          id: "exercise-2",
          sets: [
            {
              id: "set-1",
              reps: 20,
              set_kind: "working",
            },
          ],
        },
      ],
      id: "legacy-upper-a",
      source: {
        metadata: {
          facility: "hotel gym",
          legacy_program: "travel_block",
        },
        system: "lifting2",
        workout_id: "legacy-42",
      },
      started_at: "2026-04-04T07:10:00.000Z",
      status: "completed",
      title: "Travel Upper A",
      user_notes: "Short session before checkout.",
    },
  });
}

describe("workout JSON import helpers", () => {
  it("maps workout JSON files into imported rows without losing target values", () => {
    const record = buildImportedWorkoutRecord(
      {
        file: createWorkoutFile(),
        filePath: "/tmp/legacy-upper-a.json",
      },
      IMPORTED_AT,
    );

    expect(record.workout).toMatchObject({
      coachNotes: "Keep the dumbbells moving cleanly.",
      createdAt: IMPORTED_AT,
      source: "imported",
      status: "completed",
      title: "Travel Upper A",
      updatedAt: IMPORTED_AT,
      userNotes: "Short session before checkout.",
      version: 1,
    });
    expect(record.importSource).toMatchObject({
      metadataJson: JSON.stringify({
        facility: "hotel gym",
        legacy_program: "travel_block",
      }),
      system: "lifting2",
      workoutId: "legacy-42",
    });

    expect(record.exercises[0]).toMatchObject({
      sourceExerciseName: "Dumbbell Bench Press",
      state: {
        id: "legacy-upper-a::exercise:0:exercise-1",
        status: "active",
      },
    });
    expect(record.exercises[0]?.state.sets[0]).toMatchObject({
      actual: { rpe: 8, weightLbs: 60 },
      confirmedAt: "2026-04-04T07:18:00.000Z",
      id: "legacy-upper-a::set:0:0:exercise-1:set-1",
      planned: { rpe: 8, weightLbs: 60 },
      reps: 10,
    });
    expect(record.exercises[0]?.state.sets[1]).toMatchObject({
      actual: { rpe: null, weightLbs: null },
      confirmedAt: null,
      id: "legacy-upper-a::set:0:1:exercise-1:set-2",
      planned: { rpe: null, weightLbs: 55 },
      reps: 12,
    });
    expect(record.exercises[1]?.state.status).toBe("planned");

    const rows = toImportedWorkoutRows(record);

    expect(rows.workoutRow).toMatchObject({
      id: "legacy-upper-a",
      importSourceMetadataJson: JSON.stringify({
        facility: "hotel gym",
        legacy_program: "travel_block",
      }),
      importSourceSystem: "lifting2",
      importSourceWorkoutId: "legacy-42",
      source: "imported",
    });
    expect(rows.exerciseRows[0]).toMatchObject({
      id: "legacy-upper-a::exercise:0:exercise-1",
      sourceExerciseName: "Dumbbell Bench Press",
      status: "active",
    });

    const sql = buildWorkoutImportSql([rows]);

    expect(sql).toContain("import_source_system");
    expect(sql).toContain("'lifting2'");
    expect(sql).toContain("'Dumbbell Bench Press'");
    expect(sql).toContain("'legacy-upper-a::set:0:0:exercise-1:set-1'");
  });

  it("rejects duplicate workout ids across multiple files", () => {
    const sharedFile = createWorkoutFile();

    expect(() =>
      assertUniqueWorkoutIds([
        {
          file: sharedFile,
          filePath: "/tmp/first.json",
        },
        {
          file: sharedFile,
          filePath: "/tmp/second.json",
        },
      ]),
    ).toThrow('Duplicate workout id "legacy-upper-a"');
  });
});
