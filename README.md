# lifting3

`lifting3` is a single-user workout planning and logging app with an embedded AI coach.

It is built around a simple product rule: the workout data is authoritative, not the chat transcript. The coach can create or modify workouts, but those changes only count after they pass through the same guarded mutation pipeline as direct UI edits.

Today the app is a mobile-first training system that already covers the core loop:

- recent workout browsing on the home screen
- filterable workout history with detailed workout pages
- start, log, confirm, and finish workout sessions
- exercise catalog browsing with historical summaries
- an in-app coach sheet that can create workouts, patch workouts, query history, and persist profile context

It is intentionally single-user and assumes perimeter auth via Cloudflare Access rather than an in-app sign-in flow.

## What Is Working

- `Home` shows recent workouts and acts as the daily landing page.
- `Workouts` lists planned, active, and completed sessions and links into the full workout detail view.
- `Workout detail` supports planned and active session management, including notes, set edits, carry-forward context, RPE entry, set confirmation, add/remove set actions, and workout completion.
- `Exercises` shows the exercise catalog with filters plus per-exercise history signals such as logged-session counts and top load.
- `Coach` is available from a floating sheet and can operate globally or against the current workout.
- `Analytics` and `Settings` routes exist, but both are still marked coming soon.

## Screens

<table>
  <tr>
    <td width="50%" align="center">
      <img src="screenshots/nav-drawer.png" alt="Navigation drawer with recent workouts and primary app sections" width="280" />
    </td>
    <td width="50%" align="center">
      <img src="screenshots/home-coach-create-workout.png" alt="Home screen with recent workouts and the coach creating a new planned workout" width="280" />
    </td>
  </tr>
  <tr>
    <td valign="top">
      <strong>Navigation + recent sessions</strong><br />
      The slide-out navigation keeps the main areas visible and makes it easy to jump back into recent workouts.
    </td>
    <td valign="top">
      <strong>Coach-driven planning</strong><br />
      The coach can create a planned workout from chat without bypassing the structured workout model.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="screenshots/workout-plan-detail.png" alt="Planned workout detail screen with exercise cards, set targets, and a start workout action" width="280" />
    </td>
    <td width="50%" align="center">
      <img src="screenshots/active-set-logging.png" alt="Active workout detail with previous performance, current load and reps, and quick RPE controls" width="280" />
    </td>
  </tr>
  <tr>
    <td valign="top">
      <strong>Planned workout detail</strong><br />
      Planned sessions keep notes, constraints, exercise order, and set targets in a form that is ready to start and edit.
    </td>
    <td valign="top">
      <strong>Fast live logging</strong><br />
      Active workouts expose previous performance, actual load and reps, and quick RPE confirmation controls for the main logging loop.
    </td>
  </tr>
</table>

## Architecture

- React 19 + React Router 7 for the UI and data-loading model
- Cloudflare Workers for the app runtime
- Cloudflare D1 + Drizzle for authoritative workout data
- Cloudflare Agents for durable coach conversations
- Tailwind CSS v4 + shadcn/ui for the interface
- Vite+ for formatting, linting, and type-aware checks

The important split is:

- structured workout state lives in D1
- coach conversations live in Cloudflare Agents
- both manual edits and coach-authored edits use the same D1-backed domain services

## Local Development

1. Copy `.env.sample` to `.env`.
2. Set `OPENAI_API_KEY` if you want the coach flow available through Cloudflare AI Gateway's OpenAI provider.
3. Install dependencies with `pnpm install`.
4. Apply local migrations with `pnpm db:migrate:local`.
5. Seed sample workouts with `pnpm db:seed:local`.
6. Start the app with `pnpm dev`.

The default local URL is `http://localhost:43110`.

## Commands

```bash
pnpm dev
pnpm build
pnpm preview
pnpm deploy
pnpm check
pnpm fix
pnpm typecheck
pnpm test
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm db:seed:local
pnpm db:seed:remote
pnpm validate:workout-interchange -- <path>
pnpm verify:lifting2-exercises
```

## Docs

- [docs/spec.md](docs/spec.md) - product and architecture spec
- [docs/hevy-app.md](docs/hevy-app.md) - reference teardown of the Hevy workout UX
- [docs/cloudflare-agents.md](docs/cloudflare-agents.md) - Cloudflare architecture guidance for D1, Drizzle, and Agents
