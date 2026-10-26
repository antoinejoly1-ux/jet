# Jet — Owner Portal

@AGENTS.md

A Next.js 16 portal for aircraft owners (Client side) and the operator's team (Admin side). See `README.md` for setup
and the full layout.

## Rules for every change

- **Data access:** pages, components and server actions call `src/lib/services/*`. Only `src/lib/**` and `scripts/` may
  import `drizzle-orm` or `@/lib/db/schema` (ESLint enforces this).
- **Permissions:** every service call starts with `authorize(actor, permission, scope)` from `src/lib/auth/policy.ts`.
  Owner-facing reads pass `{ ownerIds }` so owners only ever see their own data. Never check roles anywhere else.
- **Writes** happen in a transaction with `recordAudit(tx, …)` in the same transaction.
- **Money** is integer cents plus currency; **hours** are integer minutes; ledgers are append-only (reverse, never edit).
- **Strings** go in both `messages/fr.json` and `messages/en.json` (same keys). French is the default.
- **Styling** uses the tokens in `src/app/globals.css` (`bg-surface`, `text-muted`, `border-border`, …), never raw
  colours. Check every screen at 390px and 1440px wide.
- **Schema changes:** edit `src/lib/db/schema/*`, then `pnpm db:generate`, and commit the SQL in `drizzle/`.

## Before pushing

Run `pnpm check` (typecheck, lint, format, unit and integration tests). For UI or auth changes, also run the e2e
suite against a seeded build: `pnpm build && pnpm db:seed && pnpm exec playwright test`.
