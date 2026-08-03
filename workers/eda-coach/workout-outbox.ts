import type { CommittedDurableEvent } from "effect-durable-agent/services/session-store";
import type { EDASessionSubmitBatchRpcInput } from "effect-durable-agent/host/durable-object";
import { SessionId } from "effect-durable-agent/types/core";
import { makeRootEDATraceMetadata } from "effect-durable-agent/types/tracing";

import { createWorkoutCoachTarget } from "~/features/coach/contracts";
import { formatCoachSessionId } from "~/features/coach/session-id";
import {
  loadPendingWorkoutActionRecords,
  markWorkoutActionDelivered,
  markWorkoutActionDeliveryFailed,
} from "~/features/workouts/d1-service.server";
import type { WorkoutActionRecord } from "~/features/workouts/events";
import type { AppDatabase } from "~/lib/.server/db";
import type { CoachAgent } from "./agent";
import { makeCoachThreadAttachedEvent, makeWorkoutActionCommittedEvent } from "./events";

/** Append one D1-outbox fact to its deterministic workout EDA session. */
export const deliverWorkoutActionRecord = async (
  env: Env,
  action: WorkoutActionRecord,
): Promise<void> => {
  const target = createWorkoutCoachTarget(action.workoutId);
  const sessionId = SessionId.make(await formatCoachSessionId(target));
  const stub: DurableObjectStub<CoachAgent> = env.CoachAgent.getByName(sessionId);
  await stub.bindThread(target);
  const submitBatch: (
    input: EDASessionSubmitBatchRpcInput,
  ) => Promise<readonly CommittedDurableEvent[]> = stub.submitBatch.bind(stub);
  await submitBatch({
    items: [
      makeCoachThreadAttachedEvent({ sessionId, target }),
      makeWorkoutActionCommittedEvent({ action, sessionId }),
    ],
    sessionId,
    trace: makeRootEDATraceMetadata(),
  });
};

/** Drain a bounded outbox window; failures remain pending for the next request or cron pass. */
export const drainWorkoutEventOutbox = async (
  db: AppDatabase,
  env: Env,
  options: { readonly limit?: number; readonly workoutId?: string } = {},
): Promise<{ readonly delivered: number; readonly failed: number }> => {
  const pending = await loadPendingWorkoutActionRecords(db, options);
  let delivered = 0;
  let failed = 0;

  for (const action of pending) {
    try {
      await deliverWorkoutActionRecord(env, action);
      await markWorkoutActionDelivered(db, action.eventId);
      delivered += 1;
    } catch (error) {
      await markWorkoutActionDeliveryFailed(db, action.eventId, error);
      failed += 1;
    }
  }

  return { delivered, failed };
};
