export const EXERCISE_CLASSIFICATIONS = [
  "warmup",
  "main_lift",
  "assistance",
  "core",
] as const;

export type ExerciseClassification = (typeof EXERCISE_CLASSIFICATIONS)[number];

export const EXERCISE_MOVEMENT_PATTERNS = [
  "warmup",
  "hinge",
  "squat",
  "single_leg",
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "core",
] as const;

export type ExerciseMovementPattern =
  (typeof EXERCISE_MOVEMENT_PATTERNS)[number];

export const EXERCISE_EQUIPMENT = [
  "bodyweight",
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "band",
] as const;

export type ExerciseEquipment = (typeof EXERCISE_EQUIPMENT)[number];

export const EXERCISE_LOAD_TRACKING_MODES = [
  "none",
  "weight_lbs",
  "weight_lbs_per_hand",
  "machine_weight_lbs",
] as const;

export type ExerciseLoadTrackingMode =
  (typeof EXERCISE_LOAD_TRACKING_MODES)[number];

export interface ExerciseLoggingProfile {
  readonly loadTracking: ExerciseLoadTrackingMode;
  readonly supportsDuration: boolean;
  readonly supportsReps: boolean;
  readonly supportsRpe: boolean;
}

interface ExerciseSchemaDefinition {
  readonly aliases?: readonly string[];
  readonly classification: ExerciseClassification;
  readonly displayName: string;
  readonly equipment: readonly ExerciseEquipment[];
  readonly id: string;
  readonly lifting2Aliases?: readonly string[];
  readonly logging: ExerciseLoggingProfile;
  readonly movementPattern: ExerciseMovementPattern;
  readonly slug: string;
}

export interface ExerciseSchema extends ExerciseSchemaDefinition {
  readonly aliases: readonly string[];
  readonly lifting2Aliases: readonly string[];
}

const EXERCISE_DEFINITIONS = [
  {
    id: "warm_up",
    slug: "warm-up",
    displayName: "Warm Up",
    classification: "warmup",
    movementPattern: "warmup",
    equipment: ["bodyweight"],
    logging: {
      loadTracking: "none",
      supportsDuration: true,
      supportsReps: false,
      supportsRpe: false,
    },
    lifting2Aliases: ["Warm Up"],
  },
  {
    id: "deadlift_barbell",
    slug: "deadlift-barbell",
    displayName: "Deadlift (Barbell)",
    classification: "main_lift",
    movementPattern: "hinge",
    equipment: ["barbell"],
    logging: {
      loadTracking: "weight_lbs",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Deadlift (Barbell)"],
  },
  {
    id: "front_squat",
    slug: "front-squat",
    displayName: "Front Squat",
    classification: "main_lift",
    movementPattern: "squat",
    equipment: ["barbell"],
    logging: {
      loadTracking: "weight_lbs",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Front Squat"],
  },
  {
    id: "bench_press_dumbbell",
    slug: "bench-press-dumbbell",
    displayName: "Bench Press (Dumbbell)",
    classification: "main_lift",
    movementPattern: "horizontal_push",
    equipment: ["dumbbell"],
    logging: {
      loadTracking: "weight_lbs_per_hand",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Bench Press (Dumbbell)"],
  },
  {
    id: "bench_press_barbell",
    slug: "bench-press-barbell",
    displayName: "Bench Press (Barbell)",
    classification: "main_lift",
    movementPattern: "horizontal_push",
    equipment: ["barbell"],
    logging: {
      loadTracking: "weight_lbs",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Bench Press (Barbell)"],
  },
  {
    id: "seated_overhead_press_dumbbell",
    slug: "seated-overhead-press-dumbbell",
    displayName: "Seated Overhead Press (Dumbbell)",
    classification: "assistance",
    movementPattern: "vertical_push",
    equipment: ["dumbbell"],
    logging: {
      loadTracking: "weight_lbs_per_hand",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Seated Overhead Press (Dumbbell)"],
  },
  {
    id: "chest_supported_incline_row_dumbbell",
    slug: "chest-supported-incline-row-dumbbell",
    displayName: "Chest Supported Incline Row (Dumbbell)",
    classification: "assistance",
    movementPattern: "horizontal_pull",
    equipment: ["dumbbell"],
    logging: {
      loadTracking: "weight_lbs_per_hand",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Chest Supported Incline Row (Dumbbell)"],
  },
  {
    id: "machine_row",
    slug: "machine-row",
    displayName: "Machine Row",
    classification: "assistance",
    movementPattern: "horizontal_pull",
    equipment: ["machine"],
    logging: {
      loadTracking: "machine_weight_lbs",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Machine Row"],
  },
  {
    id: "split_squat_dumbbell",
    slug: "split-squat-dumbbell",
    displayName: "Split Squat (Dumbbell)",
    classification: "assistance",
    movementPattern: "single_leg",
    equipment: ["dumbbell"],
    logging: {
      loadTracking: "weight_lbs_per_hand",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Split Squat (Dumbbell)"],
  },
  {
    id: "goblet_squat",
    slug: "goblet-squat",
    displayName: "Goblet Squat",
    classification: "assistance",
    movementPattern: "squat",
    equipment: ["dumbbell"],
    logging: {
      loadTracking: "weight_lbs",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Goblet Squat"],
  },
  {
    id: "band_pullaparts",
    slug: "band-pullaparts",
    displayName: "Band Pullaparts",
    classification: "assistance",
    movementPattern: "horizontal_pull",
    equipment: ["band"],
    logging: {
      loadTracking: "none",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Band Pullaparts"],
  },
  {
    id: "dead_bug",
    slug: "dead-bug",
    displayName: "Dead Bug",
    classification: "core",
    movementPattern: "core",
    equipment: ["bodyweight"],
    logging: {
      loadTracking: "none",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Dead Bug"],
  },
  {
    id: "bicycle_crunch",
    slug: "bicycle-crunch",
    displayName: "Bicycle Crunch",
    classification: "core",
    movementPattern: "core",
    equipment: ["bodyweight"],
    logging: {
      loadTracking: "none",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Bicycle Crunch"],
  },
  {
    id: "cable_core_pallof_press",
    slug: "cable-core-pallof-press",
    displayName: "Cable Core Pallof Press",
    classification: "core",
    movementPattern: "core",
    equipment: ["cable"],
    logging: {
      loadTracking: "machine_weight_lbs",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    aliases: ["Cable Core Palloff Press"],
    lifting2Aliases: ["Cable Core Pallof Press", "Cable Core Palloff Press"],
  },
  {
    id: "push_ups",
    slug: "push-ups",
    displayName: "Push-ups",
    classification: "assistance",
    movementPattern: "horizontal_push",
    equipment: ["bodyweight"],
    logging: {
      loadTracking: "none",
      supportsDuration: false,
      supportsReps: true,
      supportsRpe: true,
    },
    lifting2Aliases: ["Push-ups"],
  },
] as const satisfies readonly ExerciseSchemaDefinition[];

export type ExerciseId = (typeof EXERCISE_DEFINITIONS)[number]["id"];
export type ExerciseSlug = (typeof EXERCISE_DEFINITIONS)[number]["slug"];

function normalizeExerciseName(name: string) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/['’]/g, "")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

function uniqueAliases(aliases: readonly string[]) {
  const values = new Set<string>();
  const deduped: string[] = [];

  for (const alias of aliases) {
    const normalized = normalizeExerciseName(alias);

    if (!normalized || values.has(normalized)) {
      continue;
    }

    values.add(normalized);
    deduped.push(alias);
  }

  return deduped;
}

function freezeExerciseSchema(
  definition: ExerciseSchemaDefinition
): Readonly<ExerciseSchema> {
  const aliases = uniqueAliases([
    definition.displayName,
    ...(definition.aliases ?? []),
    ...(definition.lifting2Aliases ?? []),
  ]);

  return Object.freeze({
    ...definition,
    aliases: Object.freeze(aliases),
    equipment: Object.freeze([...definition.equipment]),
    lifting2Aliases: Object.freeze([...(definition.lifting2Aliases ?? [])]),
    logging: Object.freeze({ ...definition.logging }),
  });
}

const schemaList = EXERCISE_DEFINITIONS.map(freezeExerciseSchema);

const schemaById = new Map<string, ExerciseSchema>();
const schemaBySlug = new Map<string, ExerciseSchema>();
const schemaByAlias = new Map<string, ExerciseSchema>();

for (const schema of schemaList) {
  if (schemaById.has(schema.id)) {
    throw new Error(`Duplicate exercise id: ${schema.id}`);
  }

  if (schemaBySlug.has(schema.slug)) {
    throw new Error(`Duplicate exercise slug: ${schema.slug}`);
  }

  schemaById.set(schema.id, schema);
  schemaBySlug.set(schema.slug, schema);

  for (const alias of schema.aliases) {
    const normalizedAlias = normalizeExerciseName(alias);
    const existing = schemaByAlias.get(normalizedAlias);

    if (existing && existing.id !== schema.id) {
      throw new Error(
        `Exercise alias collision: "${alias}" maps to both ${existing.id} and ${schema.id}`
      );
    }

    schemaByAlias.set(normalizedAlias, schema);
  }
}

export const EXERCISE_SCHEMAS = Object.freeze(schemaList);

export const LIFTING2_EXERCISE_NAMES = Object.freeze(
  EXERCISE_SCHEMAS.flatMap((schema) => schema.lifting2Aliases)
);

export function getExerciseSchemaById(id: ExerciseId) {
  return schemaById.get(id);
}

export function getExerciseSchemaBySlug(slug: ExerciseSlug) {
  return schemaBySlug.get(slug);
}

export function resolveExerciseSchemaByName(name: string) {
  return schemaByAlias.get(normalizeExerciseName(name)) ?? null;
}

export function requireExerciseSchemaByName(name: string) {
  const schema = resolveExerciseSchemaByName(name);

  if (!schema) {
    throw new Error(`Unknown exercise: ${name}`);
  }

  return schema;
}

export function isExerciseId(value: string): value is ExerciseId {
  return schemaById.has(value as ExerciseId);
}

export function isLifting2CompatibleExerciseName(name: string) {
  return resolveExerciseSchemaByName(name) !== null;
}

export { normalizeExerciseName };
