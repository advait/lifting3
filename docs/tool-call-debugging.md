# Coach Sheet Tool-Call Debugging

Reviewed: 2026-04-21

## Summary

We investigated the `Maximum update depth exceeded` failure that appears in the workout-scoped coach sheet when the model emits more than three tool calls in one response.

The current evidence points away from our route invalidation logic and toward the Cloudflare chat client stack, specifically the live `@cloudflare/ai-chat` message-store update path used by `useAgentChat`.

The strongest signal is `trace5.json`:

- one live request id
- `120` `cf_agent_use_chat_response` events
- `101` `tool-input-delta` chunks
- `5` `tool-input-start`
- `5` `tool-input-available`
- `5` `tool-output-available`
- `0` `publish-app-event` entries

The crash lands inside the React client store path:

- `ReactChatState.replaceMessage`
- store subscriber callbacks
- `forceStoreRerender`

That lines up with a transport burst repeatedly replacing the same assistant message while several streamed tool calls are still arriving.

## Code Surface

The relevant client surface is `app/features/coach/coach-sheet.tsx`.

Key areas:

- `useCoachSheetLiveChat()` wires `useAgent()` + `useAgentChat()` for the live coach session.
- `CoachSheetSessionPanel` runs the sheet render/effect surface, including tool-driven invalidation, scroll behavior, session auto-send, and error handling.
- `useCoachSheetAgentDebugTrace()` now listens to raw agent websocket messages and records summarized transport events into a local trace buffer.

Supporting debug utilities live in `app/features/coach/coach-sheet-debug.ts`.

That file now exposes `window.__coachSheetDebug` with:

- `getTrace()`
- `clearTrace()`
- `copyTrace()`

## Instrumentation Added

This debugging branch adds four pieces of instrumentation and harnessing:

1. A deterministic jsdom fixture test in `test/coach/coach-sheet.test.ts` plus `vite.coach-fixture.config.mjs`.
2. A browser-accessible fixture route at `/debug/coach-sheet-fixture`.
3. Console logging when the sheet surfaces the `Coach unavailable` state.
4. A structured client-side trace that records:
   - `chat-update`
   - `publish-app-event`
   - `send-message`
   - `clear-thread`
   - `chat-error`
   - `agent-receive`

The browser fixture route is backed by:

- `app/routes/coach-sheet-fixture.tsx`
- `app/components/screens/coach-sheet-fixture-screen.tsx`
- `app/features/coach/coach-sheet-fixture.ts`

## Fixture Findings

### Deterministic fixture

The deterministic harness can replay:

- a single assistant turn
- a full batch of tool cards rendered immediately
- a configurable number of intermediate updates per tool

That fixture was useful for proving out the coach-sheet surface and stress-testing the UI path, but it did **not** reproduce the production failure.

That was the first important clue: tool count alone was not enough.

### Browser fixture

The browser route made it easy to replay the same panel surface in a real browser, but it also failed to trigger the error when driven by synthetic state alone.

That moved suspicion away from our local render/effect logic and toward the live transport path.

## Trace Findings

### `trace4.json`

`trace4.json` showed the failure during repeated assistant-message replacement, not during app-event invalidation.

Important observations:

- only one user message and one assistant message were present through the failing turn
- the same assistant message id was being replaced repeatedly as more tool parts arrived
- there were no `publish-app-event` entries
- the tools involved were `query_history`, which are read-only in our app surface
- the UI reached `status: "error"` before the fifth tool was visible in the normal chat snapshot

That ruled out the most obvious local explanation: a loop caused by our mutation invalidation effect.

### `trace5.json`

`trace5.json` added raw transport chunk logging and made the failure mode much clearer.

The failing request was a single streamed response with five `query_history` tools. Each tool emitted a large number of argument deltas before reaching `tool-input-available`.

Per tool:

- `call_XLdaaXjPyr0vR6LHbVzkFgKl`: `20` `tool-input-delta`
- `call_Uqn8HKVrjiMogZe6JwGH3CFt`: `21` `tool-input-delta`
- `call_jTMwPRkwGwDdr11rD3haeiqn`: `19` `tool-input-delta`
- `call_8WN79nf01iAEZ0aWoOFoCt2m`: `19` `tool-input-delta`
- `call_5wF1mLhRXMOBLYOCVplidF1x`: `22` `tool-input-delta`

The last stable UI snapshots before the crash were:

- `22:27:44.962Z`: `status: "streaming"`, 4 visible tools
- `22:27:44.980Z`: `status: "error"`, still 4 visible tools
- `22:27:45.083Z`: `status: "error"`, final assistant snapshot with 5 visible tools

The error itself was recorded at `2026-04-21T22:27:44.980Z`:

```text
Error: Maximum update depth exceeded
  at getRootForUpdatedFiber
  at enqueueConcurrentRenderForLane
  at forceStoreRerender
  at @cloudflare_ai-chat_react.js
  at ReactChatState.replaceMessage
```

Immediately after the error timestamp, the raw transport still delivered more response chunks, including:

- more `tool-input-delta`
- `tool-input-available` for the fifth tool
- `tool-output-available` for later tools
- `finish-step`
- then a final `cf_agent_chat_messages` state replacement

That means the client had already entered error state while the underlying queued stream updates were still draining.

## What This Rules Out

Current evidence does **not** support:

- a coach-sheet `publishAppEvent()` feedback loop
- router revalidation churn
- repeated `sendMessage()` calls
- session-request auto-send duplication
- a failure triggered by our deterministic fixture state updates alone

The strongest negative signal is that `trace5.json` contains `0` `publish-app-event` entries during the failing turn.

## Likely Root Cause

The most likely failure mode is:

1. `@cloudflare/think` or the upstream chat runtime emits extremely granular streamed tool-input deltas for `query_history`.
2. `@cloudflare/ai-chat` applies each chunk as a synchronous assistant-message replacement.
3. That replacement path triggers subscriber rerenders inside the React client store.
4. A sufficiently dense burst of replacements trips React’s nested update protection and throws `Maximum update depth exceeded`.

So the bug looks upstream from our sheet in two layers:

- **most directly:** `@cloudflare/ai-chat` / `useAgentChat` client store handling
- **possibly contributing:** `@cloudflare/think` or the server-side response emitter producing excessively chatty `tool-input-delta` streams

I do **not** have evidence yet that the primary bug is in our coach-sheet component itself.

## Existing Issue Search

I searched the current `cloudflare/agents` issue tracker on 2026-04-21 for the exact signatures involved here.

Exact-match searches with no direct match:

- [`"Maximum update depth exceeded"`](https://github.com/cloudflare/agents/issues?q=is%3Aissue+%22Maximum+update+depth+exceeded%22)
- [`tool-input-delta`](https://github.com/cloudflare/agents/issues?q=is%3Aissue+tool-input-delta)
- [`cf_agent_use_chat_response`](https://github.com/cloudflare/agents/issues?q=is%3Aissue+cf_agent_use_chat_response)

I did **not** find an existing issue that specifically describes:

- `Maximum update depth exceeded`
- caused by multi-tool streaming
- with many `tool-input-delta` chunks
- in `useAgentChat`

There are, however, several related `useAgentChat` / live-stream reconciliation bugs in the same area:

- [`#1094 useAgentChat: temporary duplicate messages after tool calls (CF_AGENT_MESSAGE_UPDATED races with stream)`](https://github.com/cloudflare/agents/issues/1094)
  - documents client-state races between streamed chunks and persisted message broadcasts
- [`#1108 useAgentChat: tool approval continuation creates duplicate assistant message in live client state`](https://github.com/cloudflare/agents/issues/1108)
  - documents another live-state duplication bug during multi-step tool flows
- [`#1165 ai-chat: activeStreamRef.messageId becomes stale when server replaces message IDs during CF_AGENT_CHAT_MESSAGES`](https://github.com/cloudflare/agents/issues/1165)
  - documents message-replacement bugs in the active stream path
- [`#1223 useAgentChat cache key includes query params, breaking stream resume with cross-domain auth`](https://github.com/cloudflare/agents/issues/1223)
  - not the same symptom, but it confirms that `useAgentChat` resume/cache behavior has already needed fixes
- [`#1231 messageConcurrency strategies cause duplicate assistant message during active stream`](https://github.com/cloudflare/agents/issues/1231)
  - documents a different streaming-state assumption breaking while a response is still live

My read is that our bug belongs in the same family, but I did not find an already-open issue for this exact failure.

## Useful Trace Commands

These were the most useful local commands for inspecting `trace5.json`:

```bash
jq '[.[] | select(.kind=="agent-receive" and .event.type=="cf_agent_use_chat_response") | .event.chunk.type] | group_by(.) | map({chunkType: .[0], count: length})' trace5.json
```

```bash
jq '[.[] | select(.kind=="agent-receive" and .event.type=="cf_agent_use_chat_response" and .event.chunk.toolCallId != null) | {toolCallId: .event.chunk.toolCallId, chunkType: .event.chunk.type}] | group_by(.toolCallId) | map({toolCallId: .[0].toolCallId, chunks: (map(.chunkType) | group_by(.) | map({type: .[0], count: length}))})' trace5.json
```

```bash
jq '[.[] | select(.kind=="chat-update")] | map({timestamp, status, messageCount, tools: ([.messages[]?.parts[]? | select(.toolCallId != null)] | length)})' trace5.json
```

## Recommended Next Steps

### Upstream

Open a new `cloudflare/agents` issue with:

- the React stack trace
- the `trace5.json` chunk counts
- the fact that the failure occurs with `query_history`
- the fact that `publish-app-event` count is `0`
- the observation that the client enters error state before the final assistant snapshot lands
- links to related issues `#1094`, `#1108`, `#1165`, and `#1231`

### Local mitigation options

If we need a local workaround before upstream lands a fix, the most promising mitigation is to reduce pressure from `tool-input-delta` updates before they hit the rendered chat surface.

Practical options:

- ignore `tool-input-delta` UI updates for read-only tools like `query_history`
- coalesce multiple tool-input delta chunks into fewer client message updates
- render server-side tools only once they reach `tool-input-available`
- special-case high-frequency tool argument streaming in the coach UI

Those would be mitigations, not root-cause fixes.

## Current Bottom Line

The current diagnosis is:

- **not reproduced** by our deterministic local fixture alone
- **reproduced** only on the live Cloudflare stream
- **not explained** by our app-event invalidation path
- **most likely** a `useAgentChat` / `@cloudflare/ai-chat` live replacement bug triggered by a dense burst of streamed tool-input deltas

If we file upstream, this branch already contains the fixture route and trace instrumentation needed to support that report.
