import {
  CheckIcon,
  DumbbellIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Form,
  useFetcher,
  useFetchers,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";

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
} from "~/components/atoms/alert-dialog";
import { Badge } from "~/components/atoms/badge";
import { Button } from "~/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/atoms/dialog";
import { LocalDateTime } from "~/components/atoms/local-date-time";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/atoms/dropdown-menu";
import { Textarea } from "~/components/atoms/textarea";
import { WorkoutStatusBadge } from "~/components/molecules/workout-status-badge";
import { usePublishAppEvent } from "~/features/app-events/client";
import {
  createPostWorkoutCoachSessionRequest,
  publishCoachSessionRequest,
} from "~/features/coach/session-request";
import { workoutMutationResultSchema } from "~/features/workouts/actions";
import { ExerciseRestTimer } from "~/features/workouts/exercise-rest-timer";
import type {
  WorkoutDetailLoaderData,
  WorkoutDetailWorkout,
  WorkoutExercise,
  WorkoutSet,
} from "~/features/workouts/contracts";
import {
  applyOptimisticWorkoutDetail,
  getPendingWorkoutMutations,
} from "~/features/workouts/optimistic-detail";
import { fireWeightPersonalRecordConfetti } from "~/features/workouts/personal-record-confetti.client";
import { countWorkoutPersonalRecords } from "~/features/workouts/personal-records";
import { formatRestTimerValue, parseRestTimerSecondsInput } from "~/features/workouts/rest-timer";
import { cn } from "~/lib/utils";

const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
const WORKOUT_ROUTE_ACTIONS = [
  "delete_workout",
  "start_workout",
  "update_set_designation",
  "update_set_planned",
  "update_set_actuals",
  "confirm_set",
  "unconfirm_set",
  "add_set",
  "remove_set",
  "remove_exercise",
  "reorder_exercise",
  "update_workout_notes",
  "update_exercise_notes",
  "update_exercise_rest_seconds",
  "finish_workout",
] as const;

type WorkoutRouteAction = (typeof WORKOUT_ROUTE_ACTIONS)[number];

interface WorkoutDetailScreenProps {
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
  isMutationPending: boolean;
  workout: WorkoutDetailWorkout;
}

interface WorkoutOverviewCardProps {
  availableActions: readonly WorkoutRouteAction[];
  initialNowMs: number;
  isHistoricalEditMode: boolean;
  isMutationPending: boolean;
  onEnterHistoricalEditMode: () => void;
  workout: WorkoutDetailWorkout;
}

interface SessionSummarySectionProps {
  exercisesCount: number;
  personalRecords: number;
  progress: WorkoutDetailLoaderData["progress"];
  totalWeightLbs: number;
  workout: WorkoutDetailWorkout;
}

function parseWorkoutMutationResult(actionData: unknown) {
  const parsedActionData = workoutMutationResultSchema.safeParse(actionData);

  return parsedActionData.success ? parsedActionData.data : null;
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
    "unconfirm_set",
    "add_set",
    "remove_set",
    "remove_exercise",
    "reorder_exercise",
    "update_workout_notes",
    "update_exercise_notes",
    "update_exercise_rest_seconds",
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
        "update_exercise_rest_seconds",
      ];
    case "active":
      return [
        "update_set_designation",
        "update_set_actuals",
        "confirm_set",
        "unconfirm_set",
        "add_set",
        "remove_set",
        "remove_exercise",
        "reorder_exercise",
        "update_workout_notes",
        "update_exercise_notes",
        "update_exercise_rest_seconds",
        "finish_workout",
      ];
    case "completed":
    case "canceled":
      return options?.historicalEditMode
        ? historicalEditActions
        : ["update_workout_notes", "update_exercise_notes", "update_exercise_rest_seconds"];
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

const workoutSummaryWeightFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const summaryPersonalRecordBadge: NonNullable<WorkoutSet["personalRecord"]> = {
  kind: "weight",
  previousMaxWeightLbs: null,
};

function getWorkoutSetVolumeLbs(set: WorkoutSet) {
  if (set.confirmedAt == null || set.actual.weightLbs == null || set.reps == null) {
    return 0;
  }

  return set.actual.weightLbs * set.reps;
}

function getWorkoutTotalWeightLbs<TExercise extends { sets: readonly WorkoutSet[] }>(
  exercises: readonly TExercise[],
) {
  return exercises.reduce(
    (sessionTotal, exercise) =>
      sessionTotal +
      exercise.sets.reduce((exerciseTotal, set) => exerciseTotal + getWorkoutSetVolumeLbs(set), 0),
    0,
  );
}

function formatWorkoutSummaryWeight(value: number) {
  return `${workoutSummaryWeightFormatter.format(value)} lb`;
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

function PersonalRecordBadge({
  personalRecord,
}: {
  personalRecord: NonNullable<WorkoutSet["personalRecord"]>;
}) {
  const previousMaxWeightLbs =
    personalRecord.kind === "weight" ? personalRecord.previousMaxWeightLbs : null;
  const accessibleLabel =
    previousMaxWeightLbs == null
      ? "Personal record"
      : `Personal record. Previous max ${previousMaxWeightLbs} pounds.`;

  return (
    <Badge
      aria-label={accessibleLabel}
      className="border-yellow-200/40 bg-linear-to-r from-yellow-300/30 via-amber-200/24 to-yellow-100/34 text-[10px] text-yellow-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_20px_-16px_rgba(250,204,21,0.82)]"
      title={accessibleLabel}
      variant="outline"
    >
      <SparklesIcon aria-hidden data-icon="inline-start" />
      PR
    </Badge>
  );
}

function getCarryForwardSetValues(set: WorkoutSet | null | undefined) {
  if (!set) {
    return null;
  }

  return {
    reps: set.reps,
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
  initialNowMs,
  isHistoricalEditMode,
  isMutationPending,
  onEnterHistoricalEditMode,
  workout,
}: WorkoutOverviewCardProps) {
  const notesFetcher = useFetcher();
  const reopenWorkoutFormRef = useRef<HTMLFormElement | null>(null);
  const [nowMs, setNowMs] = useState(initialNowMs);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [draftWorkoutNotes, setDraftWorkoutNotes] = useState(workout.userNotes ?? "");
  const [didSubmitNotes, setDidSubmitNotes] = useState(false);
  const durationMs = getWorkoutDurationMs(workout, nowMs);
  const canEditWorkoutNotes = hasAction(availableActions, "update_workout_notes");
  const canStartWorkout = hasAction(availableActions, "start_workout");
  const canFinishWorkout = hasAction(availableActions, "finish_workout");
  const canMarkWorkoutIncomplete = workout.status === "completed" && !isHistoricalEditMode;
  const canEnterHistoricalEditMode =
    (workout.status === "completed" || workout.status === "canceled") && !isHistoricalEditMode;
  const controlsDisabled = isMutationPending;
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
                <WorkoutStatusBadge className="min-w-0 w-full" size="lg" status={workout.status} />

                <div
                  className={cn(workoutMetaPillClassName, "border-border/70 text-muted-foreground")}
                >
                  <span className="truncate">{getWorkoutDurationLabel(durationMs)}</span>
                </div>

                <div
                  className={cn(workoutMetaPillClassName, "border-border/70 text-muted-foreground")}
                >
                  <LocalDateTime
                    className="truncate"
                    formatOptions={{ day: "numeric", month: "short" }}
                    value={workout.date}
                    valueKind="calendar-date"
                  />
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Open workout actions"
                  disabled={controlsDisabled}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuGroup>
                  {canEnterHistoricalEditMode ? (
                    <DropdownMenuItem
                      disabled={controlsDisabled}
                      onSelect={() => {
                        onEnterHistoricalEditMode();
                      }}
                    >
                      Edit workout
                    </DropdownMenuItem>
                  ) : null}
                  {canEditWorkoutNotes ? (
                    <DropdownMenuItem
                      disabled={controlsDisabled}
                      onSelect={() => {
                        setIsNotesDialogOpen(true);
                      }}
                    >
                      Edit notes
                    </DropdownMenuItem>
                  ) : null}
                  {canMarkWorkoutIncomplete ? (
                    <DropdownMenuItem
                      disabled={controlsDisabled}
                      onSelect={() => {
                        reopenWorkoutFormRef.current?.requestSubmit();
                      }}
                    >
                      Mark as not completed
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    disabled={controlsDisabled}
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
              <Button className="w-full" disabled={controlsDisabled} type="submit">
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
              <Button
                className="w-full"
                disabled={controlsDisabled}
                type="submit"
                variant="secondary"
              >
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
          <Form className="hidden" method="post" ref={reopenWorkoutFormRef}>
            <MutationFields
              action="start_workout"
              workoutId={workout.id}
              workoutVersion={workout.version}
            />
            {workout.startedAt ? (
              <input name="startedAt" type="hidden" value={workout.startedAt} />
            ) : null}
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
              disabled={controlsDisabled}
              name="userNotes"
              onChange={(event) => {
                setDraftWorkoutNotes(event.target.value);
              }}
              placeholder="Add context for this session..."
              value={draftWorkoutNotes}
            />
            <DialogFooter>
              <Button
                disabled={controlsDisabled}
                onClick={() => {
                  setIsNotesDialogOpen(false);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={controlsDisabled || notesFetcher.state !== "idle"} type="submit">
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
            <AlertDialogAction
              disabled={controlsDisabled}
              form={deleteWorkoutFormId}
              type="submit"
              variant="destructive"
            >
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
  isMutationPending: boolean;
  onClose: () => void;
  set: WorkoutSet;
  workout: WorkoutDetailWorkout;
}

function SetRpeChooserRow({
  exerciseId,
  isMutationPending,
  onClose,
  set,
  workout,
}: SetRpeChooserRowProps) {
  const fetcher = useFetcher();
  const [didSubmit, setDidSubmit] = useState(false);
  const controlsDisabled = isMutationPending || fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !didSubmit) {
      return;
    }

    const parsedMutationResult = workoutMutationResultSchema.safeParse(fetcher.data);

    if (
      parsedMutationResult.success &&
      parsedMutationResult.data.action === "confirm_set" &&
      parsedMutationResult.data.confirmedSet?.personalRecord
    ) {
      void fireWeightPersonalRecordConfetti();
    }

    setDidSubmit(false);
    onClose();
  }, [didSubmit, fetcher.data, fetcher.state, onClose]);

  const submitSetConfirmation = (rpe: number | null) => {
    const formData = new FormData();
    const reps = set.reps;
    const weightLbs = set.actual.weightLbs ?? set.planned.weightLbs;

    formData.set("action", "confirm_set");
    formData.set("expectedVersion", String(workout.version));
    formData.set("exerciseId", exerciseId);
    formData.set("rpe", rpe == null ? "" : String(rpe));
    formData.set("setId", set.id);
    formData.set("workoutId", workout.id);

    if (reps != null) {
      formData.set("reps", String(reps));
    }

    if (weightLbs != null) {
      formData.set("weightLbs", String(weightLbs));
    }

    setDidSubmit(true);
    void fetcher.submit(formData, { method: "post" });
  };

  const submitSetUnconfirmation = () => {
    const formData = new FormData();

    formData.set("action", "unconfirm_set");
    formData.set("expectedVersion", String(workout.version));
    formData.set("exerciseId", exerciseId);
    formData.set("setId", set.id);
    formData.set("workoutId", workout.id);

    setDidSubmit(true);
    void fetcher.submit(formData, { method: "post" });
  };

  return (
    <tr className="bg-background/90">
      <td className="px-4 py-2 sm:px-2" colSpan={5}>
        <div className="flex items-center justify-center gap-1.5">
          <Button
            aria-label="Confirm set without RPE"
            className={cn(
              "min-w-10 rounded-full",
              isSetConfirmed(set) &&
                set.actual.rpe == null &&
                "bg-emerald-600 text-white hover:bg-emerald-500",
            )}
            disabled={controlsDisabled}
            onClick={() => {
              if (isSetConfirmed(set) && set.actual.rpe == null) {
                submitSetUnconfirmation();
                return;
              }

              submitSetConfirmation(null);
            }}
            size="xs"
            type="button"
            variant={isSetConfirmed(set) && set.actual.rpe == null ? "default" : "outline"}
          >
            <CheckIcon />
          </Button>
          {RPE_OPTIONS.map((value) => {
            const isSelected = isSetConfirmed(set) && set.actual.rpe === value;

            return (
              <Button
                className={cn(
                  "min-w-10 rounded-full",
                  isSelected && "bg-emerald-600 text-white hover:bg-emerald-500",
                )}
                disabled={controlsDisabled}
                key={value}
                onClick={() => {
                  if (isSelected) {
                    submitSetUnconfirmation();
                    return;
                  }

                  submitSetConfirmation(value);
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
  isMutationPending: boolean;
  set: WorkoutSet;
  step?: "0.5" | "1";
  workout: WorkoutDetailWorkout;
}

function EditableSetNumberCell({
  editAction,
  exerciseId,
  fieldName,
  inputMode,
  isMutationPending,
  set,
  step = "1",
  workout,
}: EditableSetNumberCellProps) {
  const fetcher = useFetcher();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [didSubmit, setDidSubmit] = useState(false);
  const displayValue =
    fieldName === "reps" ? set.reps : (set.actual.weightLbs ?? set.planned.weightLbs);
  const controlsDisabled = isMutationPending || fetcher.state !== "idle";
  const inputWidthClassName = fieldName === "reps" ? "w-12" : "w-14";
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
    if (!editAction || isMutationPending) {
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
        className="inline-flex min-w-8 items-center justify-center rounded-md px-1 py-1 text-center disabled:cursor-not-allowed disabled:opacity-60"
        disabled={controlsDisabled}
        onClick={startEditing}
        type="button"
      >
        {formatOptionalValue(displayValue)}
      </button>
    );
  }

  return (
    <fetcher.Form
      className="flex justify-center"
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
        className={cn(
          "h-8 rounded-md border border-border/70 bg-background px-1 text-center outline-none",
          inputWidthClassName,
        )}
        disabled={controlsDisabled}
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

interface EditableExerciseRestTimerValueProps {
  canEdit: boolean;
  displayValue: string;
  exerciseId: string;
  isMutationPending: boolean;
  restSeconds: number;
  tone: "idle" | "overtime" | "running";
  workout: WorkoutDetailWorkout;
}

function EditableExerciseRestTimerValue({
  canEdit,
  displayValue,
  exerciseId,
  isMutationPending,
  restSeconds,
  tone,
  workout,
}: EditableExerciseRestTimerValueProps) {
  const fetcher = useFetcher();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [didSubmit, setDidSubmit] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const controlsDisabled = isMutationPending || fetcher.state !== "idle";

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
    setValidationMessage(null);
    setIsEditing(false);
  }, [didSubmit, fetcher.state]);

  const stopEditing = () => {
    setDidSubmit(false);
    setValidationMessage(null);
    setIsEditing(false);
  };

  const startEditing = () => {
    if (!canEdit || controlsDisabled) {
      return;
    }

    setDraftValue(formatRestTimerValue(restSeconds * 1000));
    setDidSubmit(false);
    setValidationMessage(null);
    setIsEditing(true);
  };

  const submitValue = () => {
    if (!canEdit || !isEditing) {
      return;
    }

    const parsedRestSeconds = parseRestTimerSecondsInput(draftValue);

    if (parsedRestSeconds == null) {
      setValidationMessage("Use m:ss or seconds.");
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    setDidSubmit(true);
    setValidationMessage(null);
    void fetcher.submit(
      {
        action: "update_exercise_rest_seconds",
        exerciseId,
        expectedVersion: String(workout.version),
        restSeconds: String(parsedRestSeconds),
        workoutId: workout.id,
      },
      { method: "post" },
    );
  };

  if (!canEdit) {
    return (
      <p
        aria-live="polite"
        className={cn("font-semibold tabular-nums", tone === "idle" && "text-foreground")}
        data-rest-timer-value="true"
      >
        {displayValue}
      </p>
    );
  }

  if (!isEditing) {
    return (
      <button
        aria-label="Edit rest timer duration"
        className={cn(
          "-ml-1 rounded-md px-1 py-0.5 text-left font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-60",
          tone === "idle" && "text-foreground",
        )}
        data-rest-timer-value="true"
        disabled={controlsDisabled}
        onClick={startEditing}
        type="button"
      >
        {displayValue}
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
        action="update_exercise_rest_seconds"
        exerciseId={exerciseId}
        workoutId={workout.id}
        workoutVersion={workout.version}
      />
      <input
        aria-invalid={validationMessage != null}
        aria-label="Rest timer duration"
        autoComplete="off"
        className={cn(
          "h-8 w-full rounded-md border bg-background px-2 font-semibold tabular-nums outline-none",
          validationMessage == null ? "border-border/70" : "border-destructive",
        )}
        disabled={controlsDisabled}
        enterKeyHint="done"
        inputMode="numeric"
        name="restSeconds"
        onBlur={submitValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
          setValidationMessage(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitValue();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            stopEditing();
          }
        }}
        pattern="[0-9:]*"
        placeholder="m:ss"
        ref={inputRef}
        title={validationMessage ?? "Use m:ss or seconds."}
        type="text"
        value={draftValue}
      />
    </fetcher.Form>
  );
}

interface SetPickerModalProps {
  availableActions: readonly WorkoutRouteAction[];
  exerciseId: string;
  isMutationPending: boolean;
  onClose: () => void;
  set: WorkoutSet;
  setLabel: string;
  workout: WorkoutDetailWorkout;
}

function SetPickerModal({
  availableActions,
  exerciseId,
  isMutationPending,
  onClose,
  set,
  setLabel,
  workout,
}: SetPickerModalProps) {
  const canUpdateSetDesignation = hasAction(availableActions, "update_set_designation");
  const canRemoveSet = hasAction(availableActions, "remove_set") && !isSetConfirmed(set);
  const canSwitchToWarmup = canUpdateSetDesignation && set.designation !== "warmup";
  const canSwitchToWorking = canUpdateSetDesignation && set.designation !== "working";
  const controlsDisabled = isMutationPending;

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
              disabled={controlsDisabled || !canSwitchToWarmup}
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
              disabled={controlsDisabled || !canSwitchToWorking}
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
              disabled={controlsDisabled || !canRemoveSet}
              type="submit"
              variant="destructive"
            >
              Delete Set
            </Button>
          </Form>
        </div>

        <Button
          className="mt-3 w-full"
          disabled={controlsDisabled}
          onClick={onClose}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </section>
    </div>
  );
}

function ExerciseCard({
  availableActions,
  exercise,
  isMutationPending,
  workout,
}: ExerciseCardProps) {
  const canAddSet = hasAction(availableActions, "add_set");
  const canConfirmSet = hasAction(availableActions, "confirm_set");
  const canEditExerciseNotes = hasAction(availableActions, "update_exercise_notes");
  const canEditExerciseRestSeconds = hasAction(availableActions, "update_exercise_rest_seconds");
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
  const controlsDisabled = isMutationPending;
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
                disabled={controlsDisabled}
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
                    disabled={controlsDisabled}
                    onSelect={() => {
                      setIsNotesDialogOpen(true);
                    }}
                  >
                    Edit notes
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={controlsDisabled || !canRemoveExerciseNow}
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

        <div className="grid gap-0">
          <ExerciseRestTimer
            renderValue={({ displayValue, tone }) => (
              <EditableExerciseRestTimerValue
                canEdit={canEditExerciseRestSeconds}
                displayValue={displayValue}
                exerciseId={exercise.id}
                isMutationPending={controlsDisabled}
                restSeconds={exercise.restSeconds}
                tone={tone}
                workout={workout}
              />
            )}
            restSeconds={exercise.restSeconds}
            sets={exercise.sets}
          />

          <div className="-mx-4 w-[calc(100%+2rem)] border-border/70 border-b sm:mx-0 sm:w-full">
            <table className="w-full table-fixed text-sm">
              <thead className="border-border/70 border-b text-muted-foreground text-[11px] uppercase tracking-[0.12em]">
                <tr>
                  <th className="w-12 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                    Set
                  </th>
                  <th className="px-2 py-2 text-center font-medium first:pl-4 last:pr-4 sm:first:pl-2 sm:last:pr-2">
                    Previous
                  </th>
                  <th className="w-24 px-1 py-2 text-center font-medium first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
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
                            disabled={controlsDisabled || !canOpenSetPicker}
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
                          <div className="flex items-center justify-center gap-1.5">
                            <EditableSetNumberCell
                              editAction={setWeightEditAction}
                              exerciseId={exercise.id}
                              fieldName="weightLbs"
                              inputMode="decimal"
                              isMutationPending={controlsDisabled}
                              set={set}
                              step="0.5"
                              workout={workout}
                            />
                            {set.personalRecord ? (
                              <PersonalRecordBadge personalRecord={set.personalRecord} />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-1 py-2 text-center first:pl-4 last:pr-4 sm:px-2 sm:first:pl-2 sm:last:pr-2">
                          <EditableSetNumberCell
                            editAction={setWeightEditAction}
                            exerciseId={exercise.id}
                            fieldName="reps"
                            inputMode="numeric"
                            isMutationPending={controlsDisabled}
                            set={set}
                            step="1"
                            workout={workout}
                          />
                        </td>
                        <td className="px-2 py-2 text-center pr-4 sm:px-2 sm:pr-2">
                          <SetRpeButton
                            canChoose={canConfirmSet && !controlsDisabled}
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
                          isMutationPending={controlsDisabled}
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
            <Button
              className="w-full"
              disabled={controlsDisabled}
              size="sm"
              type="submit"
              variant="outline"
            >
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
            isMutationPending={controlsDisabled}
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
            disabled={controlsDisabled}
            name="userNotes"
            onChange={(event) => {
              setDraftExerciseNotes(event.target.value);
            }}
            placeholder="Add context for this exercise..."
            value={draftExerciseNotes}
          />
          <DialogFooter>
            <Button
              disabled={controlsDisabled}
              onClick={() => {
                setIsNotesDialogOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={controlsDisabled || notesFetcher.state !== "idle"} type="submit">
              Save notes
            </Button>
          </DialogFooter>
        </notesFetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function SessionSummarySection({
  exercisesCount,
  personalRecords,
  progress,
  totalWeightLbs,
  workout,
}: SessionSummarySectionProps) {
  const hasPersonalRecords = personalRecords > 0;

  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold text-sm tracking-tight">Session Summary</h2>

      <div
        className={cn(
          "mx-auto grid w-full gap-3 text-center",
          hasPersonalRecords ? "max-w-sm grid-cols-3" : "max-w-xs grid-cols-2",
        )}
      >
        <div className="grid justify-items-center gap-1">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">Sets</p>
          <p className="font-medium tabular-nums">
            {progress.confirmed}/{progress.total}
          </p>
        </div>
        <div className="grid justify-items-center gap-1">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">
            Total Weight
          </p>
          <p className="font-medium tabular-nums">{formatWorkoutSummaryWeight(totalWeightLbs)}</p>
        </div>
        {hasPersonalRecords ? (
          <div className="grid justify-items-center gap-1">
            <p className="text-muted-foreground text-[11px] uppercase tracking-[0.12em]">PRs</p>
            <div className="inline-flex items-center gap-1.5">
              <span className="font-medium tabular-nums">{personalRecords}</span>
              <PersonalRecordBadge personalRecord={summaryPersonalRecordBadge} />
            </div>
          </div>
        ) : null}
      </div>

      <dl className="grid gap-2 text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <dt>Date</dt>
          <dd className="text-foreground">
            <LocalDateTime
              formatOptions={{ day: "numeric", month: "short", year: "numeric" }}
              value={workout.date}
              valueKind="calendar-date"
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Exercises</dt>
          <dd className="text-foreground">{exercisesCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Started</dt>
          <dd className="text-foreground">
            {workout.startedAt ? (
              <LocalDateTime formatOptions={{ timeStyle: "medium" }} value={workout.startedAt} />
            ) : (
              "Not started"
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Completed</dt>
          <dd className="text-foreground">
            {workout.completedAt ? (
              <LocalDateTime formatOptions={{ timeStyle: "medium" }} value={workout.completedAt} />
            ) : (
              "Not finished"
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function WorkoutDetailScreen({ actionData, loaderData }: WorkoutDetailScreenProps) {
  const fetchers = useFetchers();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [isHistoricalEditMode, setIsHistoricalEditMode] = useState(false);

  const pendingMutations = getPendingWorkoutMutations(
    [
      ...fetchers.map((fetcher) => ({
        formData: fetcher.formData,
        key: fetcher.key,
      })),
      ...(navigation.formData
        ? [
            {
              formData: navigation.formData,
              key: "navigation",
            },
          ]
        : []),
    ],
    loaderData.workout.id,
  );
  const optimisticLoaderData = applyOptimisticWorkoutDetail(loaderData, pendingMutations);
  const personalRecords = countWorkoutPersonalRecords(optimisticLoaderData.exercises);
  const totalWeightLbs = getWorkoutTotalWeightLbs(optimisticLoaderData.exercises);
  const isMutationPending = pendingMutations.length > 0;
  const availableActions = getAvailableActions(optimisticLoaderData.workout.status, {
    historicalEditMode: isHistoricalEditMode,
  });

  useEffect(() => {
    const mutationResult = parseWorkoutMutationResult(actionData);

    if (!mutationResult || mutationResult.action !== "delete_workout") {
      return;
    }

    void navigate("/workouts", { replace: true });
  }, [actionData, navigate]);

  useEffect(() => {
    const mutationResult = parseWorkoutMutationResult(actionData);

    if (!mutationResult || mutationResult.action !== "finish_workout" || !mutationResult.ok) {
      return;
    }

    publishCoachSessionRequest(
      createPostWorkoutCoachSessionRequest({
        requestId: mutationResult.eventId,
        workoutId: mutationResult.workoutId,
      }),
    );
  }, [actionData]);

  useEffect(() => {
    setIsHistoricalEditMode(false);
  }, [loaderData.workout.id, location.key]);

  useEffect(() => {
    const resetHistoricalEditMode = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        return;
      }

      setIsHistoricalEditMode(false);
    };

    window.addEventListener("pageshow", resetHistoricalEditMode);

    return () => {
      window.removeEventListener("pageshow", resetHistoricalEditMode);
    };
  }, []);
  usePublishAppEvent(actionData);

  return (
    <section
      aria-busy={isMutationPending}
      className={cn(
        "grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(240px,0.7fr)] lg:gap-8",
        isMutationPending && "opacity-95",
      )}
    >
      <div className="grid gap-0">
        <WorkoutOverviewCard
          availableActions={availableActions}
          initialNowMs={Date.parse(optimisticLoaderData.loadedAt)}
          isHistoricalEditMode={isHistoricalEditMode}
          isMutationPending={isMutationPending}
          onEnterHistoricalEditMode={() => {
            setIsHistoricalEditMode(true);
          }}
          workout={optimisticLoaderData.workout}
        />
        <div
          aria-hidden="true"
          className="my-6 -mx-4 w-[calc(100%+2rem)] border-border/70 border-t sm:mx-0 sm:my-8 sm:w-full"
        />

        <div>
          {optimisticLoaderData.exercises.map((exercise) => (
            <ExerciseCard
              availableActions={availableActions}
              exercise={exercise}
              isMutationPending={isMutationPending}
              key={exercise.id}
              workout={optimisticLoaderData.workout}
            />
          ))}
        </div>
      </div>

      <aside className="grid content-start gap-4 lg:border-border/70 lg:border-l lg:pl-6">
        <SessionSummarySection
          exercisesCount={optimisticLoaderData.exercises.length}
          personalRecords={personalRecords}
          progress={optimisticLoaderData.progress}
          totalWeightLbs={totalWeightLbs}
          workout={optimisticLoaderData.workout}
        />
      </aside>
    </section>
  );
}
