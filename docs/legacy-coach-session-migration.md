# Legacy coach session migration

This one-off operator command copies persisted `Think` coach messages into their deterministic
effect-durable-agent session, verifies the resulting transcript and tool calls, and only then
deletes the legacy Durable Object.

The EDA refactor must be deployed before running this command because the temporary migration
Worker binds to both `CoachAgent` and `EDACoachAgent` in the deployed `lifting3` Worker.

## Runbook

Start with the read-only dry run:

```sh
pnpm migrate:legacy-coach-sessions
```

Resolve every reported failure, then run the destructive mode with its exact confirmation:

```sh
pnpm migrate:legacy-coach-sessions \
  --apply \
  --confirm=DELETE_LEGACY_COACH_SESSIONS
```

The default candidate set is `general` plus one thread for every workout currently in D1.
Durable Object namespaces do not expose instance enumeration. If a workout was deleted while its
coach session remains, add the known legacy instance name explicitly:

```sh
pnpm migrate:legacy-coach-sessions --thread 'workout:deleted-workout-id'
```

Use `--json` for an archival report and `--verbose` to expose Wrangler startup output. The command
uses an ephemeral `wrangler dev --remote` Worker with a per-run bearer token; it does not deploy an
admin endpoint.

## Safety and retry behavior

- Dry-run mode reads legacy messages and validates that every part can be represented by EDA. It
  does not instantiate the destination session.
- Import identities are deterministic UUIDv7 values derived from legacy thread, message, and tool
  identities. Retrying an interrupted import is idempotent.
- Existing unrelated EDA transcript entries cause verification to fail rather than being merged or
  overwritten.
- In-progress tool calls and unsupported message parts fail closed because migrating them would be
  lossy.
- Empty legacy objects are reported but retained; merely reading a missing Durable Object can create
  an empty instance, so emptiness is not proof that there was a session to delete.
- The legacy object's `destroy()` method is called only after the EDA snapshot exactly matches the
  planned messages and tool terminal states.
