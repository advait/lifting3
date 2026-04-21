import type { WorkoutSet } from "./contracts.ts";

export const DEFAULT_EXERCISE_REST_SECONDS = 90;
export const REST_TIMER_EXTENSION_SECONDS = 30;
const DIGITS_ONLY_PATTERN = /^\d+$/;

export function normalizeRestSeconds(value: unknown) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (trimmedValue.length === 0) {
      return undefined;
    }

    const parsedValue = Number(trimmedValue);

    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
  }

  return undefined;
}

export function parseRestTimerSecondsInput(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return undefined;
  }

  if (DIGITS_ONLY_PATTERN.test(trimmedValue)) {
    return normalizeRestSeconds(Number(trimmedValue));
  }

  const segments = trimmedValue.split(":");

  if (segments.length < 2 || segments.length > 3) {
    return undefined;
  }

  if (!segments.every((segment) => DIGITS_ONLY_PATTERN.test(segment))) {
    return undefined;
  }

  const numericSegments = segments.map((segment) => Number(segment));
  const seconds = numericSegments.at(-1);
  const minutes = numericSegments.at(-2);
  const hours = numericSegments.length === 3 ? numericSegments[0] : 0;

  if (seconds == null || minutes == null || hours == null || seconds > 59 || minutes > 59) {
    return undefined;
  }

  return normalizeRestSeconds(hours * 3600 + minutes * 60 + seconds);
}

function formatSeconds(totalSeconds: number, options?: { padMinutes?: boolean }) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  const renderedMinutes = options?.padMinutes ? String(minutes).padStart(2, "0") : String(minutes);

  return `${renderedMinutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatRestTimerValue(remainingMs: number) {
  if (remainingMs > 0) {
    return formatSeconds(Math.ceil(remainingMs / 1000), { padMinutes: false });
  }

  const overtimeSeconds = Math.floor(Math.abs(remainingMs) / 1000);

  return overtimeSeconds === 0
    ? formatSeconds(0, { padMinutes: false })
    : `+${formatSeconds(overtimeSeconds, { padMinutes: false })}`;
}

export function getConfirmedSetCount(sets: readonly WorkoutSet[]) {
  return sets.reduce((count, set) => count + (set.confirmedAt == null ? 0 : 1), 0);
}

export function getConfirmedSetSignature(sets: readonly WorkoutSet[]) {
  return sets
    .filter((set) => set.confirmedAt != null)
    .map((set) => `${set.id}:${set.confirmedAt}`)
    .join("|");
}
