import type { WorkoutSet } from "./contracts.ts";

type EditableSetWeightMode = "actual" | "planned";
type EditableSetCascadeInput = {
  nextValue: number | null | undefined;
  setId: string;
};

function getEditableSetWeightLbs(set: WorkoutSet, mode: EditableSetWeightMode) {
  if (mode === "planned") {
    return set.planned.weightLbs;
  }

  return set.actual.weightLbs ?? set.planned.weightLbs;
}

function isSetConfirmed(set: WorkoutSet) {
  return set.confirmedAt != null;
}

function cascadeMatchingSetValues(
  sets: WorkoutSet[],
  input: EditableSetCascadeInput,
  options: {
    getValue: (set: WorkoutSet) => number | null;
    setValue: (set: WorkoutSet, value: number) => void;
  },
) {
  if (input.nextValue == null) {
    return;
  }

  const editedSetIndex = sets.findIndex((set) => set.id === input.setId);
  const editedSet = editedSetIndex >= 0 ? sets[editedSetIndex] : null;

  if (!editedSet) {
    return;
  }

  const previousValue = options.getValue(editedSet);

  if (Object.is(previousValue, input.nextValue)) {
    return;
  }

  for (const set of sets.slice(editedSetIndex + 1)) {
    if (set.designation !== editedSet.designation) {
      break;
    }

    if (isSetConfirmed(set)) {
      break;
    }

    if (!Object.is(options.getValue(set), previousValue)) {
      break;
    }

    options.setValue(set, input.nextValue);
  }
}

export function cascadeSetWeightLbs(
  sets: WorkoutSet[],
  input: {
    mode: EditableSetWeightMode;
    nextWeightLbs: number | null | undefined;
    setId: string;
  },
) {
  cascadeMatchingSetValues(
    sets,
    {
      nextValue: input.nextWeightLbs,
      setId: input.setId,
    },
    {
      getValue: (set) => getEditableSetWeightLbs(set, input.mode),
      setValue: (set, value) => {
        if (input.mode === "planned") {
          set.planned.weightLbs = value;
          return;
        }

        set.actual.weightLbs = value;
      },
    },
  );
}

export function cascadeSetReps(sets: WorkoutSet[], input: EditableSetCascadeInput) {
  cascadeMatchingSetValues(sets, input, {
    getValue: (set) => set.reps,
    setValue: (set, value) => {
      set.reps = value;
    },
  });
}
