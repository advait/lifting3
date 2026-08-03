# Effect Durable Agent architecture

Reviewed: 2026-08-03

`lifting3` is the public product reference for [`effect-durable-agent`](../effect-durable-agent). The coach runs as an event-sourced Cloudflare Durable Object. D1 remains authoritative for validated workout aggregates, while semantic workout facts also enter the coach's durable event stream.

## Runtime

The Worker exports one agent class: `CoachAgent extends EDASessionDurableObject<Env>`. The name preserves the already-migrated Cloudflare Durable Object class identity so preview version uploads need no class migration; it does not preserve the old Think Agent implementation, storage protocol, or behavior. Its runtime composes:

- OpenAI `gpt-5.4` through Cloudflare AI Gateway `default`;
- the four workout/profile tools;
- a prompt projector that combines current D1 state with event-derived workout activity;
- the `lifting3.coach.thread` and `lifting3.workout.activity` reducers;
- the typed EDA WebSocket protocol.

The legacy Think agent, binding, storage path, and SDK dependencies have been removed. There is no compatibility or session migration layer.

## Session identity and thread binding

The product exposes stable thread keys:

- `general`
- `workout:{workoutId}`

Each key maps deterministically to an EDA UUID session id. `CoachThreadAttached` durably binds that session to its product target. The thread reducer rejects rebinding, while EDA's framework reducers remain the sole owners of commands, runs, inferences, tools, and transcript state.

## Semantic workout events

Every successful workout mutation—whether initiated by the workout UI or a coach tool—creates a typed `WorkoutActionRecord`. Current action kinds are:

- workout created, started, completed, or deleted;
- set logged, corrected, or reverted;
- workout plan adjusted;
- workout or exercise notes changed.

The D1 mutation and a `workout_event_outbox` insert happen in the same D1 batch. This prevents the structured aggregate and its event stream from silently diverging. Request `waitUntil()` work drains the outbox quickly, and a five-minute cron retries anything left behind. Delivery uses the action's UUIDv7 as the EDA event id, so retries are idempotent.

The workout activity reducer keeps:

- the ordered audit entries used by the UI Event Lens;
- correction-aware effective logged sets;
- the latest workout version;
- the last completed coach-turn cursor;
- the latest conversation boundary cursor.

Its deterministic summary groups identical effective sets by exercise. Corrections replace stale facts and reversions remove them, so the LLM never receives both the old and new performance as current truth.

## Application events

The coach defines three durable application events:

- `CoachThreadAttached` binds session identity to the product target.
- `WorkoutActionCommitted` carries a semantic workout fact.
- `CoachConversationStarted` creates a new visible/model conversation without deleting history.

`WorkoutActionCommitted` also adapts to the app's existing browser invalidation envelope after it reaches the EDA WebSocket. Route revalidation is therefore a projection of the durable fact, not an inference from a tool result.

## Prompt projection

EDA commits a stable system prompt. Before an inference, the app projector:

1. filters transcript messages before the most recent `CoachConversationStarted` boundary;
2. reloads the authoritative D1 workout/profile/history context;
3. derives all effective logged sets and changes since the previous completed coach turn;
4. inserts that application-authenticated context beside the active user request.

This keeps provider-cache-friendly instructions stable while guaranteeing that the coach sees UI-originated set logs between messages. Workout facts are explicitly marked as data rather than instructions.

## HTTP, snapshot, and WebSocket facade

The browser uses a narrow facade:

- `GET /api/coach/threads/:thread/snapshot` returns the authoritative cursor, visible transcript, tool state, active run state, and workout activity projection;
- `GET /api/coach/threads/:thread/events?afterSeq=N` upgrades to EDA's event WebSocket;
- `POST /api/coach/threads/:thread/messages` durably admits a queued message;
- `POST /api/coach/threads/:thread/stop` admits a stop command;
- `POST /api/coach/threads/:thread/conversation` appends a conversation boundary.

The client hydrates the snapshot first and then follows events after that exact cursor. Frames are schema-validated and acknowledged. Reconnects use the last durable sequence with bounded backoff. The React panel is rendered from a pure projection of snapshot plus event frames, including messages, tool cards, streaming state, sync status, workout activity, and the Event Lens.

## Data ownership

- D1 owns workout aggregates, optimistic versions, profile data, history queries, and the transactional event outbox.
- The EDA Durable Object owns command and inference lifecycle, transcript history, semantic application events, and reducer projections.
- A conversation boundary changes which transcript messages are visible to the user and model; it does not erase the audit log.
- Browser app events remain a local route-revalidation adapter, not an authoritative event store.

This split demonstrates the central EDA advantage: product state can remain in the database best suited to it while agent reasoning and UI recover from one durable, replayable chronology of meaningful facts.
