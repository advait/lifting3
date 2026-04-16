# lifting3

Single-user workout coaching app built with TypeScript, React Router v7, Tailwind v4, shadcn/ui, and Ultracite.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm verify:lifting2-exercises
pnpm check
pnpm fix
```

## Notes

- Perimeter access will come from Cloudflare Access, so the app does not need an in-app auth flow.
- Historical workout import/export will use a versioned JSON interchange format validated by Zod.
- Exercise definitions live in code and `pnpm verify:lifting2-exercises` checks compatibility with the local sibling `../lifting2` workout corpus.

Current docs:

- `docs/spec.md` — product and architecture spec
- `docs/hevy-app.md` — Hevy UX teardown informing interaction design
