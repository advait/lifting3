import { createWorkoutCoachTarget, type CoachTarget } from "./contracts";

const COACH_SESSION_REQUEST_EVENT = "lifting3:coach-session-request";

export interface CoachSessionRequest {
  readonly expand: boolean;
  readonly initialMessage: string | null;
  readonly requestId: string;
  readonly target: CoachTarget;
}

export const POST_WORKOUT_COACH_KICKOFF_MESSAGE = [
  "I just finished this workout. Recap it like a real coach using the logged workout data.",
  "Tell me what went well, what looks off or incomplete, what to adjust next time, and the clearest next step.",
  "Use recent history only if it materially sharpens the advice.",
].join("\n");

type CoachSessionRequestEventTarget = Pick<
  EventTarget,
  "addEventListener" | "dispatchEvent" | "removeEventListener"
>;

function getBrowserWindow() {
  const candidate = globalThis as Partial<CoachSessionRequestEventTarget>;

  if (
    typeof candidate.dispatchEvent !== "function" ||
    typeof candidate.addEventListener !== "function" ||
    typeof candidate.removeEventListener !== "function"
  ) {
    return null;
  }

  return candidate as CoachSessionRequestEventTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCoachTarget(value: unknown): CoachTarget | null {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return null;
  }

  if (value.kind === "general") {
    return {
      kind: "general",
    };
  }

  if (value.kind !== "workout" || typeof value.workoutId !== "string") {
    return null;
  }

  return createWorkoutCoachTarget(value.workoutId);
}

function parseCoachSessionRequest(value: unknown): CoachSessionRequest | null {
  if (
    !isRecord(value) ||
    typeof value.expand !== "boolean" ||
    typeof value.requestId !== "string"
  ) {
    return null;
  }

  const target = parseCoachTarget(value.target);

  if (!target) {
    return null;
  }

  return {
    expand: value.expand,
    initialMessage: typeof value.initialMessage === "string" ? value.initialMessage : null,
    requestId: value.requestId,
    target,
  };
}

export function createPostWorkoutCoachSessionRequest({
  requestId,
  workoutId,
}: {
  requestId: string;
  workoutId: string;
}): CoachSessionRequest {
  return {
    expand: true,
    initialMessage: POST_WORKOUT_COACH_KICKOFF_MESSAGE,
    requestId,
    target: createWorkoutCoachTarget(workoutId),
  };
}

export function isSameCoachTarget(left: CoachTarget, right: CoachTarget) {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "general") {
    return true;
  }

  return right.kind === "workout" && left.workoutId === right.workoutId;
}

export function publishCoachSessionRequest(request: CoachSessionRequest) {
  const browserWindow = getBrowserWindow();

  if (!browserWindow) {
    return;
  }

  browserWindow.dispatchEvent(
    new CustomEvent<CoachSessionRequest>(COACH_SESSION_REQUEST_EVENT, {
      detail: request,
    }),
  );
}

export function subscribeCoachSessionRequests(listener: (request: CoachSessionRequest) => void) {
  const browserWindow = getBrowserWindow();

  if (!browserWindow) {
    return () => {};
  }

  const onRequest = (event: Event) => {
    const parsedRequest = parseCoachSessionRequest((event as CustomEvent<unknown>).detail);

    if (!parsedRequest) {
      return;
    }

    listener(parsedRequest);
  };

  browserWindow.addEventListener(COACH_SESSION_REQUEST_EVENT, onRequest);

  return () => {
    browserWindow.removeEventListener(COACH_SESSION_REQUEST_EVENT, onRequest);
  };
}
