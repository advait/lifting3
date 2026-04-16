import {
  CheckIcon,
  Clock3Icon,
  DumbbellIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Form, useFetcher, useNavigate } from "react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Textarea } from "~/components/ui/textarea";
import { usePublishAppEvent } from "~/features/app-events/client";
import { cn } from "~/lib/utils";

import { workoutMutationResultSchema } from "./actions";
import type {
  WorkoutDetailLoaderData,
  WorkoutDetailWorkout,
  WorkoutExercise,
  WorkoutSet,
} from "./contracts";
import { WorkoutStatusBadge } from "./workout-status-badge";

const REST_TIMER_PLACEHOLDER = "02:00";
const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
const workoutDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const workoutFullDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const WORKOUT_ROUTE_ACTIONS = [
  "delete_workout",
  "start_workout",
  "update_set_designation",
  "update_set_planned",
  "update_set_actuals",
  "confirm_set",
  "skip_set",
  "add_set",
  "remove_set",
  "remove_exercise",
  "reorder_exercise",
  "update_workout_notes",
  "update_exercise_notes",
  "finish_workout",
] as const;

type WorkoutRouteAction = (typeof WORKOUT_ROUTE_ACTIONS)[number];

interface WorkoutDetailViewProps {
  actionData: unknown;
  loaderData: WorkoutDetailLoaderData;
}

interface MutationFieldsProps {
  action: WorkoutRouteAction;
  exerciseId?: string;
  setId?: string;
  workoutId: string;
  workoutVersion: number;
}

interface ExerciseCardProps {
  availableActions: readonly WorkoutRouteAction[];
  exercise: WorkoutExercise;
  workout: WorkoutDetailWorkout;
}

interface WorkoutOverviewCardProps {
  availableActions: readonly WorkoutRouteAction[];
  isHistoricalEditMode: boolean;
  onEnterHistoricalEditMode: () => void;
  workout: WorkoutDetailWorkout;
}

interface SessionSummarySectionProps {
  exercisesCount: number;
  progress: WorkoutDetailLoaderData["progress"];
  workout: WorkoutDetailWorkout;
}

function getAvailableActions(
  workoutStatus: WorkoutDetailWorkout["status"],
  options?: {
    historicalEditMode?: boolean;
  },
): readonly WorkoutRouteAction[] {
  const historicalEditActions: readonly WorkoutRouteAction[] = [
    "update_set_designation",
    "update_set_actuals",
    "confirm_set",
    "add_set",
    "remove_set",
    "remove_exercise",
    "reorder_exercise",
    "update_workout_notes",
    "update_exercise_notes",
  ];

  switch (workoutStatus) {
    case "planned":
      return [
        "start_workout",
        "update_set_designation",
        "update_set_planned",
        "add_set",
        "remove_set",
        "remove_exercise",
        "reorder_exercise",
        "update_workout_notes",
        "update_exercise_notes",
      ];
    case "active":
      return [
        "update_set_designation",
        "update_set_actuals",
        "confirm_set",
        "add_set",
        "remove_set",
        "remove_exercise",
        "reorder_exercise",
        "update_workout_notes",
        "update_exercise_notes",
        "finish_workout",
      ];
    case "completed":
    case "canceled":
      return options?.historicalEditMode
        ? historicalEditActions
        : ["update_workout_notes", "update_exercise_notes"];
    default:
      return [];
  }
}

function isSetConfirmed(set: WorkoutSet) {
  return set.confirmedAt != null;
}

function hasAction(availableActions: readonly WorkoutRouteAction[], action: WorkoutRouteAction) {
  return availableActions.includes(action);
}

function MutationFields({
  action,
  exerciseId,
  setId,
  workoutId,
  workoutVersion,
}: MutationFieldsProps) {
  return (
    <>
      <input name="action" type="hidden" value={action} />
      <input name="expectedVersion" type="hidden" value={workoutVersion} />
      {exerciseId ? <input name="exerciseId" type="hidden" value={exerciseId} /> : null}
      {setId ? <input name="setId" type="hidden" value={setId} /> : null}
      <input name="workoutId" type="hidden" value={workoutId} />
    </>
  );
}

function formatWorkoutDate(value: string) {
  return workoutFullDateFormatter.format(new Date(value));
}

function formatWorkoutDateChip(value: string) {
  return workoutDateFormatter.format(new Date(value));
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatOptionalValue(value: number | null) {
  return value == null ? "\u2014" : String(value);
}

function formatSetPerformance(values: WorkoutSet["previous"]) {
  if (!values) {
    return "\u2014";
  }

  const weight = values.weightLbs;
  const reps = values.reps;
  const rpe = values.rpe;

  if (weight == null && reps == null && rpe == null) {
    return "\u2014";
  }

  const mainPart = `${formatOptionalValue(weight)} x ${formatOptionalValue(reps)}`;

  return rpe == null ? mainPart : `${mainPart} @ RPE ${rpe}`;
}

function getCarryForwardSetValues(set: WorkoutSet | null | undefined) {
  if (!set) {
    return null;
  }

  return {
    reps: set.actual.reps ?? set.planned.reps,
    weightLbs: set.actual.weightLbs ?? set.planned.weightLbs,
  };
}

function getExerciseNotes(value: string | null) {
  return value?.trim() ?? null;
}

function getSetLabel(set: WorkoutSet, workingSetNumber: number) {
  return set.designation === "warmup" ? "W" : String(workingSetNumber);
}

function getWorkoutDurationLabel(durationMs: number | null) {
  return durationMs == null ? "Not started" : formatDuration(durationMs);
}

const workoutMetaPillClassName =
  "inline-flex h-7 min-w-0 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium leading-none uppercase whitespace-nowrap";

function getWorkoutDurationMs(workout: WorkoutDetailWorkout, nowMs: number) {
  if (!workout.startedAt) {
    return null;
  }

  const startedAtMs = Date.parse(workout.startedAt);

  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  const endedAtMs =
    workout.status === "active"
      ? nowMs
      : workout.completedAt
        ? Date.parse(workout.completedAt)
        : nowMs;

  if (Number.isNaN(endedAtMs)) {
    return null;
  }

  return Math.max(0, endedAtMs - startedAtMs);
}

function WorkoutOverviewCard({
  availableActions,
  isHistoricalEditMode,
  onEnterHistoricalEditMode,
  workout,
}: WorkoutOverviewCardProps) {
  const notesFetcher = useFetcher();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [draftWorkoutNotes, setDraftWorkoutNotes] = useState(workout.userNotes ?? "");
  const [didSubmitNotes, setDidSubmitNotes] = useState(false);
  const durationMs = getWorkoutDurationMs(workout, nowMs);
  const canEditWorkoutNotes = hasAction(availableActions, "update_workout_notes");
  const canStartWorkout = hasAction(availableActions, "start_workout");
  const canFinishWorkout = hasAction(availableActions, "finish_workout");
  const canEnterHistoricalEditMode =
    (workout.status === "completed" || workout.status === "canceled") && !isHistoricalEditMode;
  const deleteWorkoutFormId = `delete-workout-${workout.id}`;

  useEffect(() => {
    if (workout.status !== "active" || !workout.startedAt) {
      return;
    }

    setNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [workout.startedAt, workout.status]);

  useEffect(() => {
    if (!isNotesDialogOpen) {
      return;
    }

    setDraftWorkoutNotes(workout.userNotes ?? "");
  }, [isNotesDialogOpen, workout.userNotes]);

  useEffect(() => {
    if (notesFetcher.state !== "idle" || !didSubmitNotes) {
      return;
    }

    const parsedMutationResult = workoutMutationResultSchema.safeParse(notesFetcher.data);

    if (
      !parsedMutationResult.success ||
      parsedMutationResult.data.action !== "update_workout_notes"
    ) {
      setDidSubmitNotes(false);
      return;
    }

    setDidSubmitNotes(false);
    setIsNotesDialogOpen(false);
  }, [didSubmitNotes, notesFetcher.data, notesFetcher.state]);

  return (
    <AlertDialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
      <Dialog onOpenChange={setIsNotesDialogOpen} open={isNotesDialogOpen}>
        <section className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-3 gap-2">
                <WorkoutStatusBadge className="min-w-0" size="lg" status={workout.status} />

                <div
                  className={cn(workoutMetaPillClassName, "border-border/70 text-muted-foreground")}
                >
                  <span className="truncate">{getWorkoutDurationLabel(durationMs)}</span>
                </div>

                <div
                  className={cn(workoutMetaPillClassName, "border-border/70 text-muted-foreground")}
                >
                  <span className="truncate">{formatWorkoutDateChip(workout.date)}</span>
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Open workout actions" size="icon" type="button" variant="ghost">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuGroup>
                  {canEnterHistoricalEditMode ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        onEnterHistoricalEditMode();
                      }}
                    >
                      Edit workout
                    </DropdownMenuItem>
                  ) : null}
                  {canEditWorkoutNotes ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setIsNotesDialogOpen(true);
                      }}
                    >
                      Edit notes
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onSelect={() => {
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    Delete workout
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {getExerciseNotes(workout.coachNotes) || getExerciseNotes(workout.userNotes) ? (
            <div className="grid gap-2 pt-1">
              {getExerciseNotes(workout.coachNotes) ? (
                <p className="text-muted-foreground text-sm italic leading-relaxed">
                  {getExerciseNotes(workout.coachNotes)}
                </p>
              ) : null}

              {getExerciseNotes(workout.userNotes) ? (
                <p className="font-medium text-sm leading-relaxed">
                  {getExerciseNotes(workout.userNotes)}
                </p>
              ) : null}
            </div>
          ) : null}

          {canStartWorkout ? (
            <Form method="post">
              <MutationFields
                action="start_workout"
                workoutId={workout.id}
                workoutVersion={workout.version}
              />
              <Button className="w-full" type="submit">
                Start workout
              </Button>
            </Form>
          ) : null}

          {canFinishWorkout ? (
            <Form method="post">
              <MutationFields
                action="finish_workout"
                workoutId={workout.id}
                workoutVersion={workout.version}
              />
              <Button className="w-full" type="submit" variant="secondary">
                Finish workout
              </Button>
            </Form>
          ) : null}

          <Form id={deleteWorkoutFormId} method="post">
            <MutationFields
              action="delete_workout"
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
          </Form>
        </section>

        <DialogContent>
          <notesFetcher.Form
            className="grid gap-4"
            method="post"
            onSubmit={() => {
              setDidSubmitNotes(true);
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit workout notes</DialogTitle>
              <DialogDescription>
                Update your top-level notes for this workout. Coach notes stay read-only here.
              </DialogDescription>
            </DialogHeader>
            <MutationFields
              action="update_workout_notes"
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <Textarea
              name="userNotes"
              onChange={(event) => {
                setDraftWorkoutNotes(event.target.value);
              }}
              placeholder="Add context for this session..."
              value={draftWorkoutNotes}
            />
            <DialogFooter>
              <Button
                onClick={() => {
                  setIsNotesDialogOpen(false);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={notesFetcher.state !== "idle"} type="submit">
                Save notes
              </Button>
            </DialogFooter>
          </notesFetcher.Form>
        </DialogContent>

        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{workout.title}</span> and all of its
              logged sets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
            <AlertDialogAction form={deleteWorkoutFormId} type="submit" variant="destructive">
              Delete workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </Dialog>
    </AlertDialog>
  );
}

function SetRpeButton({
  canChoose,
  isOpen,
  onToggle,
  set,
}: {
  canChoose: boolean;
  isOpen: boolean;
  onToggle: () => void;
  set: WorkoutSet;
}) {
  const isConfirmed = isSetConfirmed(set);
  const hasConfirmedRpe = isConfirmed && set.actual.rpe != null;

  return (
    <Button
      aria-label={
        hasConfirmedRpe ? `RPE ${set.actual.rpe}` : isConfirmed ? "Set confirmed" : "Set incomplete"
      }
      aria-pressed={isOpen}
      className={cn(
        "min-w-12 rounded-full",
        canChoose && isOpen && "border-foreground/20 bg-muted text-foreground",
        isConfirmed ? "bg-emerald-600 text-white hover:bg-emerald-500" : "text-muted-foreground",
      )}
      disabled={!canChoose}
      onClick={onToggle}
      size="xs"
      type="button"
      variant={isConfirmed ? "default" : "outline"}
    >
      {hasConfirmedRpe ? set.actual.rpe : <CheckIcon />}
    </Button>
  );
}

interface SetRpeChooserRowProps {
  exerciseId: string;
  onClose: () => void;
  set: WorkoutSet;
  workout: WorkoutDetailWorkout;
}

function SetRpeChooserRow({ exerciseId, onClose, set, workout }: SetRpeChooserRowProps) {
  const fetcher = useFetcher();
  const [didSubmit, setDidSubmit] = useState(false);

  useEffect(() => {
    if (fetcher.state !== "idle" || !didSubmit) {
      return;
    }

    setDidSubmit(false);
    onClose();
  }, [didSubmit, fetcher.state, onClose]);

  const submitRpe = (rpe: number) => {
    const formData = new FormData();
    const reps = set.actual.reps ?? set.planned.reps;
    const weightLbs = set.actual.weightLbs ?? set.planned.weightLbs;

    formData.set("action", "confirm_set");
    formData.set("expectedVersion", String(workout.version));
    formData.set("exerciseId", exerciseId);
    formData.set("setId", set.id);
    formData.set("workoutId", workout.id);
    formData.set("rpe", String(rpe));

    if (reps != null) {
      formData.set("reps", String(reps));
    }

    if (weightLbs != null) {
      formData.set("weightLbs", String(weightLbs));
    }

    setDidSubmit(true);
    void fetcher.submit(formData, { method: "post" });
  };

  return (
    <tr className="bg-background/90">
      <td className="px-4 py-2 sm:px-2" colSpan={5}>
        <div className="flex items-center justify-center gap-1.5">
          {RPE_OPTIONS.map((value) => {
            const isSelected = isSetConfirmed(set) && set.actual.rpe === value;

            return (
              <Button
                className={cn(
                  "min-w-10 rounded-full",
                  isSelected && "bg-emerald-600 text-white hover:bg-emerald-500",
                )}
                disabled={fetcher.state !== "idle"}
                key={value}
                onClick={() => {
                  submitRpe(value);
                }}
                size="xs"
                type="button"
                variant={isSelected ? "default" : "outline"}
              >
                {value}
              </Button>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

interface EditableSetNumberCellProps {
  editAction: "update_set_actuals" | "update_set_planned" | null;
  fieldName: "reps" | "weightLbs";
  inputMode: "decimal" | "numeric";
  exerciseId: string;
  set: WorkoutSet;
  step?: "0.5" | "1";
  workout: WorkoutDetailWorkout;
}

function EditableSetNumberCell({
  editAction,
  exerciseId,
  fieldName,
  inputMode,
  set,
  step = "1",
  workout,
}: EditableSetNumberCellProps) {
  const fetcher = useFetcher();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [didSubmit, setDidSubmit] = useState(false);
  const displayValue = set.actual[fieldName] ?? set.planned[fieldName];
  const pattern = inputMode === "numeric" ? "[0-9]*" : "[0-9]*[.]?[0-9]*";

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !didSubmit) {
      return;
    }

    setDidSubmit(false);
    setIsEditing(false);
  }, [didSubmit, fetcher.state]);

  const startEditing = () => {
    if (!editAction) {
      return;
    }

    setDraftValue(displayValue == null ? "" : String(displayValue));
    setIsEditing(true);
  };

  const submitValue = () => {
    if (!editAction || !isEditing) {
      return;
    }

    setDidSubmit(true);
    void fetcher.submit(
      {
        action: editAction,
        exerciseId,
        expectedVersion: String(workout.version),
        setId: set.id,
        [fieldName]: draftValue,
        workoutId: workout.id,
      },
      { method: "post" },
    );
  };

  if (!editAction) {
    return <span>{formatOptionalValue(displayValue)}</span>;
  }

  if (!isEditing) {
    return (
      <button
        className="w-full rounded-md px-1 py-1 text-center"
        onClick={startEditing}
        type="button"
      >
        {formatOptionalValue(displayValue)}
      </button>
    );
  }

  return (
    <fetcher.Form
      className="w-full"
      method="post"
      onSubmit={() => {
        setDidSubmit(true);
      }}
    >
      <MutationFields
        action={editAction}
        exerciseId={exerciseId}
        setId={set.id}
        workoutId={workout.id}
        workoutVersion={workout.version}
      />
      <input
        autoComplete="off"
        className="h-8 w-full rounded-md border border-border/70 bg-background px-1 text-center outline-none"
        enterKeyHint="done"
        inputMode={inputMode}
        name={fieldName}
        onBlur={submitValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitValue();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setDidSubmit(false);
            setIsEditing(false);
          }
        }}
        pattern={pattern}
        ref={inputRef}
        step={step}
        type="text"
        value={draftValue}
      />
    </fetcher.Form>
  );
}

interface SetPickerModalProps {
  availableActions: readonly WorkoutRouteAction[];
  exerciseId: string;
  onClose: () => void;
  set: WorkoutSet;
  setLabel: string;
  workout: WorkoutDetailWorkout;
}

function SetPickerModal({
  availableActions,
  exerciseId,
  onClose,
  set,
  setLabel,
  workout,
}: SetPickerModalProps) {
  const canUpdateSetDesignation = hasAction(availableActions, "update_set_designation");
  const canRemoveSet = hasAction(availableActions, "remove_set") && !isSetConfirmed(set);
  const canSwitchToWarmup = canUpdateSetDesignation && set.designation !== "warmup";
  const canSwitchToWorking = canUpdateSetDesignation && set.designation !== "working";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:p-6">
      <button
        aria-label="Close set picker"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <section className="relative z-10 w-full max-w-sm rounded-3xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="grid gap-1 pb-4">
          <p className="font-semibold text-base tracking-tight">Set {setLabel}</p>
          <p className="text-muted-foreground text-sm">Choose how this set should be classified.</p>
        </div>

        <div className="grid gap-2">
          <Form method="post" onSubmit={onClose}>
            <MutationFields
              action="update_set_designation"
              exerciseId={exerciseId}
              setId={set.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <input name="designation" type="hidden" value="warmup" />
            <Button
              className="w-full justify-start"
              disabled={!canSwitchToWarmup}
              type="submit"
              variant="outline"
            >
              Warmup Set
            </Button>
          </Form>

          <Form method="post" onSubmit={onClose}>
            <MutationFields
              action="update_set_designation"
              exerciseId={exerciseId}
              setId={set.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <input name="designation" type="hidden" value="working" />
            <Button
              className="w-full justify-start"
              disabled={!canSwitchToWorking}
              type="submit"
              variant="outline"
            >
              Regular Set
            </Button>
          </Form>

          <Form method="post" onSubmit={onClose}>
            <MutationFields
              action="remove_set"
              exerciseId={exerciseId}
              setId={set.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <Button
              className="w-full justify-start"
              disabled={!canRemoveSet}
              type="submit"
              variant="destructive"
            >
              Delete Set
            </Button>
          </Form>
        </div>

        <Button className="mt-3 w-full" onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </section>
    </div>
  );
}

function ExerciseCard({ availableActions, exercise, workout }: ExerciseCardProps) {
  const canAddSet = hasAction(availableActions, "add_set");
  const canConfirmSet = hasAction(availableActions, "confirm_set");
  const canEditExerciseNotes = hasAction(availableActions, "update_exercise_notes");
  const canRemoveExercise = hasAction(availableActions, "remove_exercise");
  const canRemoveExerciseNow = canRemoveExercise && !exercise.sets.some(isSetConfirmed);
  const canOpenSetPicker =
    hasAction(availableActions, "update_set_designation") ||
    hasAction(availableActions, "remove_set");
  const setWeightEditAction = hasAction(availableActions, "update_set_actuals")
    ? "update_set_actuals"
    : hasAction(availableActions, "update_set_planned")
      ? "update_set_planned"
      : null;
  const lastSet = exercise.sets.at(-1);
  const carryForwardValues = getCarryForwardSetValues(lastSet);
  const removeExerciseFormId = `remove-exercise-${exercise.id}`;
  const notesFetcher = useFetcher();
  const [didSubmitNotes, setDidSubmitNotes] = useState(false);
  const [draftExerciseNotes, setDraftExerciseNotes] = useState(exercise.userNotes ?? "");
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [selectedSetForPicker, setSelectedSetForPicker] = useState<{
    label: string;
    set: WorkoutSet;
  } | null>(null);
  const [selectedSetIdForRpe, setSelectedSetIdForRpe] = useState<string | null>(null);
  let workingSetNumber = 0;

  useEffect(() => {
    if (!isNotesDialogOpen) {
      return;
    }

    setDraftExerciseNotes(exercise.userNotes ?? "");
  }, [exercise.userNotes, isNotesDialogOpen]);

  useEffect(() => {
    if (notesFetcher.state !== "idle" || !didSubmitNotes) {
      return;
    }

    const parsedMutationResult = workoutMutationResultSchema.safeParse(notesFetcher.data);

    if (
      !parsedMutationResult.success ||
      parsedMutationResult.data.action !== "update_exercise_notes"
    ) {
      setDidSubmitNotes(false);
      return;
    }

    setDidSubmitNotes(false);
    setIsNotesDialogOpen(false);
  }, [didSubmitNotes, notesFetcher.data, notesFetcher.state]);

  return (
    <Dialog onOpenChange={setIsNotesDialogOpen} open={isNotesDialogOpen}>
      <section className="grid gap-3 py-5 first:pt-0">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-background/70 text-muted-foreground">
            <DumbbellIcon aria-hidden />
          </div>
          <h2 className="font-semibold text-base tracking-tight">{exercise.displayName}</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Open exercise actions for ${exercise.displayName}`}
                size="icon"
                type="button"
                variant="ghost"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <Form id={removeExerciseFormId} method="post">
                <MutationFields
                  action="remove_exercise"
                  exerciseId={exercise.id}
                  workoutId={workout.id}
                  workoutVersion={workout.version}
                />
              </Form>
              <DropdownMenuGroup>
                {canEditExerciseNotes ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setIsNotesDialogOpen(true);
                    }}
                  >
                    Edit notes
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={!canRemoveExerciseNow}
                  onSelect={() => {
                    const form = document.getElementById(removeExerciseFormId);

                    if (form instanceof HTMLFormElement) {
                      form.requestSubmit();
                    }
                  }}
                >
                  Remove exercise
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {getExerciseNotes(exercise.coachNotes) ? (
          <p className="text-muted-foreground text-sm italic leading-relaxed">
            {getExerciseNotes(exercise.coachNotes)}
          </p>
        ) : null}

        {getExerciseNotes(exercise.userNotes) ? (
          <p className="font-medium text-sm leading-relaxed">
            {getExerciseNotes(exercise.userNotes)}
          </p>
        ) : null}

        <div className="flex items-center gap-2 text-sm">
          <Clock3Icon aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Rest Timer:</span>
          <span className="font-medium">{REST_TIMER_PLACEHOLDER}</span>
        </div>

        <div className="-mx-4 w-[calc(100%+2rem)] border-border/70 border-y sm:mx-0 sm:w-full">
          <table className="w-full table-fixed text-sm">
            <thead className="border-border/70 border-b text-muted-foreground text-[11px] uppercase tracking-[0.12em]">
              <tr>
                <th className="w-12 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                  Set
                </th>
                <th className="px-2 py-2 text-center font-medium first:pl-4 last:pr-4 sm:first:pl-2 sm:last:pr-2">
                  Previous
                </th>
                <th className="w-16 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                  LBS
                </th>
                <th className="w-14 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                  Reps
                </th>
                <th className="w-20 px-2 py-2 text-center font-medium pr-4 sm:w-18 sm:px-2 sm:pr-2">
                  RPE
                </th>
              </tr>
            </thead>
            <tbody>
              {exercise.sets.map((set) => {
                const setLabel =
                  set.designation === "warmup"
                    ? getSetLabel(set, workingSetNumber)
                    : getSetLabel(set, ++workingSetNumber);

                return (
                  <Fragment key={set.id}>
                    <tr className="odd:bg-background/45 even:bg-transparent">
                      <td className="px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                        <Button
                          className="h-auto min-w-8 rounded-full px-2 py-1 font-medium"
                          disabled={!canOpenSetPicker}
                          onClick={() => {
                            setSelectedSetIdForRpe(null);
                            setSelectedSetForPicker({
                              label: setLabel,
                              set,
                            });
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {setLabel}
                        </Button>
                      </td>
                      <td className="px-2 py-2 text-center text-muted-foreground leading-relaxed first:pl-4 last:pr-4 sm:first:pl-2 sm:last:pr-2">
                        {formatSetPerformance(set.previous)}
                      </td>
                      <td className="px-1 py-2 text-center first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                        <EditableSetNumberCell
                          editAction={setWeightEditAction}
                          exerciseId={exercise.id}
                          fieldName="weightLbs"
                          inputMode="decimal"
                          set={set}
                          step="0.5"
                          workout={workout}
                        />
                      </td>
                      <td className="px-1 py-2 text-center first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                        <EditableSetNumberCell
                          editAction={setWeightEditAction}
                          exerciseId={exercise.id}
                          fieldName="reps"
                          inputMode="numeric"
                          set={set}
                          step="1"
                          workout={workout}
                        />
                      </td>
                      <td className="px-2 py-2 text-center pr-4 sm:px-2 sm:pr-2">
                        <SetRpeButton
                          canChoose={canConfirmSet}
                          isOpen={selectedSetIdForRpe === set.id}
                          onToggle={() => {
                            if (!canConfirmSet) {
                              return;
                            }

                            setSelectedSetForPicker(null);
                            setSelectedSetIdForRpe((currentValue) =>
                              currentValue === set.id ? null : set.id,
                            );
                          }}
                          set={set}
                        />
                      </td>
                    </tr>
                    {selectedSetIdForRpe === set.id ? (
                      <SetRpeChooserRow
                        exerciseId={exercise.id}
                        onClose={() => {
                          setSelectedSetIdForRpe(null);
                        }}
                        set={set}
                        workout={workout}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {canAddSet ? (
          <Form method="post">
            <MutationFields
              action="add_set"
              exerciseId={exercise.id}
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            <input name="insertAfterSetId" type="hidden" value={lastSet?.id ?? ""} />
            {carryForwardValues?.weightLbs != null ? (
              <input name="weightLbs" type="hidden" value={carryForwardValues.weightLbs} />
            ) : null}
            {carryForwardValues?.reps != null ? (
              <input name="reps" type="hidden" value={carryForwardValues.reps} />
            ) : null}
            <Button className="w-full" size="sm" type="submit" variant="outline">
              <PlusIcon />
              Add Set
            </Button>
          </Form>
        ) : (
          <div>
            <Button className="w-full" disabled size="sm" type="button" variant="outline">
              <PlusIcon />
              Add Set
            </Button>
          </div>
        )}

        {selectedSetForPicker ? (
          <SetPickerModal
            availableActions={availableActions}
            exerciseId={exercise.id}
            onClose={() => {
              setSelectedSetForPicker(null);
            }}
            set={selectedSetForPicker.set}
            setLabel={selectedSetForPicker.label}
            workout={workout}
          />
        ) : null}
      </section>

      <DialogContent>
        <notesFetcher.Form
          className="grid gap-4"
          method="post"
          onSubmit={() => {
            setDidSubmitNotes(true);
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit exercise notes</DialogTitle>
            <DialogDescription>
              Update your notes for{" "}
              <span className="font-medium text-foreground">{exercise.displayName}</span>.
            </DialogDescription>
          </DialogHeader>
          <MutationFields
            action="update_exercise_notes"
            exerciseId={exercise.id}
            workoutId={workout.id}
            workoutVersion={workout.version}
          />
          <Textarea
            name="userNotes"
            onChange={(event) => {
              setDraftExerciseNotes(event.target.value);
            }}
            placeholder="Add context for this exercise..."
            value={draftExerciseNotes}
          />
          <DialogFooter>
            <Button
              onClick={() => {
                setIsNotesDialogOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={notesFetcher.state !== "idle"} type="submit">
              Save notes
            </Button>
          </DialogFooter>
        </notesFetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function SessionSummarySection({ exercisesCount, progress, workout }: SessionSummarySectionProps) {
  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold text-sm tracking-tight">Session Summary</h2>

      <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3 text-center">
        <div className="grid justify-items-center gap-1">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">Total</p>
          <p className="font-medium">{progress.total}</p>
        </div>
        <div className="grid justify-items-center gap-1">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">Confirmed</p>
          <p className="font-medium">{progress.confirmed}</p>
        </div>
        <div className="grid justify-items-center gap-1">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">
            Unconfirmed
          </p>
          <p className="font-medium">{progress.unconfirmed}</p>
        </div>
      </div>

      <dl className="grid gap-2 text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <dt>Date</dt>
          <dd className="text-foreground">{formatWorkoutDate(workout.date)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Exercises</dt>
          <dd className="text-foreground">{exercisesCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Started</dt>
          <dd className="text-foreground">
            {workout.startedAt ? new Date(workout.startedAt).toLocaleTimeString() : "Not started"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Completed</dt>
          <dd className="text-foreground">
            {workout.completedAt
              ? new Date(workout.completedAt).toLocaleTimeString()
              : "Not finished"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function WorkoutDetailView({ actionData, loaderData }: WorkoutDetailViewProps) {
  const navigate = useNavigate();
  const [isHistoricalEditMode, setIsHistoricalEditMode] = useState(false);
  usePublishAppEvent(actionData);

  const availableActions = getAvailableActions(loaderData.workout.status, {
    historicalEditMode: isHistoricalEditMode,
  });

  useEffect(() => {
    const parsedActionData = workoutMutationResultSchema.safeParse(actionData);

    if (!parsedActionData.success || parsedActionData.data.action !== "delete_workout") {
      return;
    }

    void navigate("/workouts", { replace: true });
  }, [actionData, navigate]);

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(240px,0.7fr)] lg:gap-8">
      <div className="grid gap-0">
        <WorkoutOverviewCard
          availableActions={availableActions}
          isHistoricalEditMode={isHistoricalEditMode}
          onEnterHistoricalEditMode={() => {
            setIsHistoricalEditMode(true);
          }}
          workout={loaderData.workout}
        />
        <div
          aria-hidden="true"
          className="my-6 -mx-4 w-[calc(100%+2rem)] border-border/70 border-t sm:mx-0 sm:my-8 sm:w-full"
        />

        <div>
          {loaderData.exercises.map((exercise) => (
            <ExerciseCard
              availableActions={availableActions}
              exercise={exercise}
              key={exercise.id}
              workout={loaderData.workout}
            />
          ))}
        </div>
      </div>

      <aside className="grid content-start gap-4 lg:border-border/70 lg:border-l lg:pl-6">
        <SessionSummarySection
          exercisesCount={loaderData.exercises.length}
          progress={loaderData.progress}
          workout={loaderData.workout}
        />
      </aside>
    </section>
  );
}
