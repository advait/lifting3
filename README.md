# lifting3

Single-user workout coaching app built with TypeScript, React Router v7, Tailwind v4, shadcn/ui, and Vite+.

## Commands

```bash
pnpm dev
pnpm build
pnpm check
pnpm fix
pnpm typecheck
pnpm validate:workout-interchange -- <path>
pnpm verify:lifting2-exercises
```

## Notes

- Perimeter access will come from Cloudflare Access, so the app does not need an in-app auth flow.
- Historical workout import/export will use a versioned JSON interchange format validated by Zod.
- The shared workout interchange schema lives in [app/features/workouts/interchange.ts](/home/advait/l3-root/l3/app/features/workouts/interchange.ts).
- Exercise definitions live in code and `pnpm verify:lifting2-exercises` checks compatibility with the local sibling `../lifting2` workout corpus.

Current docs:

- `docs/spec.md` — product and architecture spec
- `docs/hevy-app.md` — Hevy UX teardown informing interaction design
- `docs/cloudflare-agents.md` — Cloudflare architecture guidance for D1 + Drizzle + AIChatAgent
