import type { WorkoutSet } from "./contracts.ts";

type EditableSetWeightMode = "actual" | "planned";

function getEditableSetWeightLbs(set: WorkoutSet, mode: EditableSetWeightMode) {
  if (mode === "planned") {
    return set.planned.weightLbs;
  }

  return set.actual.weightLbs ?? set.planned.weightLbs;
}

function isSetConfirmed(set: WorkoutSet) {
  return set.confirmedAt != null;
}

export function cascadeSetWeightLbs(
  sets: WorkoutSet[],
  input: {
    mode: EditableSetWeightMode;
    nextWeightLbs: number | null | undefined;
    setId: string;
  },
) {
  if (input.nextWeightLbs == null) {
    return;
  }

  const editedSetIndex = sets.findIndex((set) => set.id === input.setId);
  const editedSet = editedSetIndex >= 0 ? sets[editedSetIndex] : null;

  if (!editedSet) {
    return;
  }

  const previousWeightLbs = getEditableSetWeightLbs(editedSet, input.mode);

  if (Object.is(previousWeightLbs, input.nextWeightLbs)) {
    return;
  }

  for (const set of sets.slice(editedSetIndex + 1)) {
    if (set.designation !== editedSet.designation) {
      break;
    }

    if (isSetConfirmed(set)) {
      break;
    }

    if (!Object.is(getEditableSetWeightLbs(set, input.mode), previousWeightLbs)) {
      break;
    }

    if (input.mode === "planned") {
      set.planned.weightLbs = input.nextWeightLbs;
      continue;
    }

    set.actual.weightLbs = input.nextWeightLbs;
  }
}
