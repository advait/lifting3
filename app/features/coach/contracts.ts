import { z } from "zod";

const COACH_TARGET_KINDS = ["general", "workout"] as const;
const GENERAL_COACH_INSTANCE_NAME = "general";
const WORKOUT_COACH_INSTANCE_PREFIX = "workout:";

const nonEmptyStringSchema = z.string().trim().min(1);

export const coachTargetKindSchema = z.enum(COACH_TARGET_KINDS);
export const generalCoachTargetSchema = z.strictObject({
  kind: z.literal("general"),
});
export const workoutCoachTargetSchema = z.strictObject({
  kind: z.literal("workout"),
  workoutId: nonEmptyStringSchema,
});
export const coachTargetSchema = z.discriminatedUnion("kind", [
  generalCoachTargetSchema,
  workoutCoachTargetSchema,
]);

export type CoachTarget = z.infer<typeof coachTargetSchema>;
export type CoachThread = CoachTarget;

export function createGeneralCoachTarget(): CoachTarget {
  return {
    kind: "general",
  };
}

export function createWorkoutCoachTarget(workoutId: string): CoachTarget {
  return {
    kind: "workout",
    workoutId,
  };
}

export function formatCoachInstanceName(target: CoachTarget): string {
  switch (target.kind) {
    case "general":
      return GENERAL_COACH_INSTANCE_NAME;
    case "workout":
      return `${WORKOUT_COACH_INSTANCE_PREFIX}${target.workoutId}`;
  }
}

export function parseCoachInstanceName(instanceName: string): CoachThread | null {
  if (instanceName === GENERAL_COACH_INSTANCE_NAME) {
    return createGeneralCoachTarget();
  }

  if (!instanceName.startsWith(WORKOUT_COACH_INSTANCE_PREFIX)) {
    return null;
  }

  const workoutId = instanceName.slice(WORKOUT_COACH_INSTANCE_PREFIX.length).trim();

  return workoutId.length > 0 ? createWorkoutCoachTarget(workoutId) : null;
}
