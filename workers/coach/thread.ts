import { parseCoachInstanceName, type CoachThread } from "~/features/coach/contracts";

export type { CoachThread } from "~/features/coach/contracts";

export function parseCoachThread(instanceName: string): CoachThread {
  const thread = parseCoachInstanceName(instanceName);

  if (thread) {
    return thread;
  }

  throw new Error(`Unknown coach thread "${instanceName}".`);
}
