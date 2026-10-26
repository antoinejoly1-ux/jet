# Jet — Owner Portal

A web portal where aircraft owners see their share of a plane (hours, budget, flights, invoices, maintenance), and where
the operator's team runs the business from the same app behind a **Client | Admin** toggle.

**Built so far:** Phase 0 (foundation: accounts, roles, permissions, the full schema, both app shells, French and
English, tests and CI), staff two-factor authentication, and Phase 1 (admin core: owners, aircraft and shares, View as
owner, team and roles, audit log).

## Stack

| Area        | Choice                                                                   |
| ----------- | ------------------------------------------------------------------------ |
| Framework   | Next.js 16 (App Router), TypeScript strict, React 19                     |
| Database    | PostgreSQL 16 + Drizzle ORM, SQL migrations in `drizzle/`                |
| Auth        | Better Auth: Google, email + password, magic link, 2FA (authenticator)   |
| Permissions | `src/lib/auth/policy.ts`: one `can(actor, permission, scope)` for all    |
| UI          | Tailwind CSS 4 with design tokens in `src/app/globals.css`, Lucide icons |
| Languages   | next-intl, French by default, English second (`messages/*.json`)         |
| Email       | Resend (printed to the console when no API key is set)                   |
| Tests       | Vitest (unit + integration on real Postgres), Playwright (end-to-end)    |
| CI          | GitHub Actions: types, lint, format, migration drift, tests, build, e2e  |

## Getting started

Requirements: Node 22+, pnpm 10, and PostgreSQL 16 (or Docker).

```bash
pnpm install
cp .env.example .env.local          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d                # Postgres with the jet and jet_test databases
pnpm db:migrate                     # apply migrations
pnpm db:seed                        # demo fleet: 3 aircraft, 8 owners, a year of data
pnpm dev                            # http://localhost:3000
```

Demo logins created by the seed (password `demo-password-2026`):

| Email               | Role                   | 2FA                                     |
| ------------------- | ---------------------- | --------------------------------------- |
| `admin@jet.test`    | Admin                  | On (demo key printed by `pnpm db:seed`) |
| `dispatch@jet.test` | Dispatcher             | On (same demo key)                      |
| `finance@jet.test`  | Finance                | Not set up: signing in shows the setup  |
| `owner@jet.test`    | Owner of 25% of C-GJTA | Not required for owners                 |

Add the demo key to any authenticator app, or use one of the printed backup codes.

Without `RESEND_API_KEY`, emails (verification, magic links, invitations) are printed in the terminal running
`pnpm dev`; copy the link from there. Google sign-in appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
set (redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`).

## How access works

- **Anyone can create an account** (Google, email + password, or a magic link), but a new account sees nothing until it is
  linked by an **invitation**. Accounts without a link wait on `/pending`, and admins are notified.
- **Invitations** (Admin → Invitations) are single-use, expire after 7 days, are bound to one email address, and are
  stored only as a SHA-256 hash. Accepting one links the account to an owner, or gives it a staff role.
- **Roles:** owners read only their own data. Staff are `dispatcher`, `finance` or `admin`; the full matrix is in
  `src/lib/auth/policy.ts` and is tested permission by permission in `tests/unit/policy.test.ts`.
- **The toggle** switches staff between the Client and Admin sides. It is a view switch only: every page, action and
  service checks permissions on the server.
- **2FA** is required for staff when `REQUIRE_STAFF_2FA=true` (on by default; keep it on everywhere but local
  experiments). It applies to **every** sign-in method: Better Auth only challenges password sign-ins, so
  `src/lib/auth/second-factor-everywhere.ts` applies the same challenge to magic links, Google and email verification.
  Staff without 2FA are guided through `/setup-2fa` (QR code, one code, backup codes) on their first visit to Admin.
  Codes submit at the sixth digit, devices are trusted for 30 days by default, and backup codes are one tap away.
- **View as owner** (owner page → "View as this owner") shows the Client side exactly as that owner sees it, read-only,
  with a banner to exit. It uses a signed cookie bound to the staff member and expiring after an hour, and every start
  and end is written to the audit log.
- **Rate limits** on sign-in, sign-up, magic links, password reset and 2FA are stored in Postgres so they hold across
  serverless instances.

## Project layout

```
src/
  app/
    (auth)/        sign-in, sign-up, forgot/reset password, two-factor, invitation
    (client)/      owner screens (Home, Flights, Finances, Invoices, …, Account)
    (admin)/admin/ back office (Dashboard, Owners, Invitations, …)
    api/auth/      Better Auth endpoint
    start/         post-sign-in landing: picks the side, or /pending
  components/      ui/ (design system), shell/ (sidebar, tabs, toggle), auth/
  lib/
    auth/          auth config, session helpers, policy.ts (permissions)
    db/            Drizzle client and schema (one file per domain)
    services/      business logic: every read and write goes through here
    email/         sender and templates
  i18n/            locale resolution
  proxy.ts         redirects visitors without a session cookie to sign-in
drizzle/           SQL migrations (generated, committed)
scripts/           migrate.ts, seed.ts
tests/             unit/, integration/, e2e/
```

**The one rule:** pages, components and actions never build database queries. They call `src/lib/services/*`, which
checks permissions, validates input, writes in a transaction and records the audit entry. ESLint enforces it.

## Commands

| Command                | What it does                                                                  |
| ---------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`             | Development server                                                            |
| `pnpm check`           | Typecheck, lint, format check and tests: run before every push                |
| `pnpm test`            | Unit and integration tests (needs the `jet_test` database)                    |
| `scripts/e2e-local.sh` | End-to-end tests on desktop and phone, as CI runs them (reseeds the database) |
| `pnpm db:generate`     | Create a migration after changing `src/lib/db/schema/*`                       |
| `pnpm db:migrate`      | Apply migrations                                                              |
| `pnpm db:seed`         | Reset and reseed demo data (refuses to run in production)                     |
| `pnpm db:studio`       | Browse the database                                                           |

## House rules

- Money is integer **cents** with a currency (`CAD`, `USD`); hours are integer **minutes**. Never floats.
- Timestamps are stored in UTC and shown in `America/Montreal`.
- Primary keys are UUIDv7.
- Hours and money are **ledgers**: corrections are new entries that reverse old ones, never edits.
- Every user-visible string lives in `messages/fr.json` and `messages/en.json`.
- Components use design tokens (`bg-surface`, `text-muted`, …), never raw colours.

## Decisions to revisit

- **Cache Components is off.** Almost every page is per-user, so request-time rendering is the simpler default.
  Revisit if public or shared pages appear.
- **Sentry, PostHog and Inngest** are planned but not installed yet; they arrive with the phases that need them.

## Hosting (decided: Canada)

The business is Canadian, so client data stays in Canada:

- **Database:** PostgreSQL in AWS `ca-central-1` (Montreal), through AWS RDS or Supabase. Set `DATABASE_URL`.
- **Files** (invoices, imports): a private S3 bucket in `ca-central-1`, arriving with Phase 2.
- **App:** Vercel. Its servers process requests but don't store client data; run the functions in the region closest
  to Montreal (`iad1`) and note it in the Law 25 privacy assessment.

## What's next

Phase 2 (finance and invoices): budgets, transactions, hours ledger, invoice upload, spreadsheet import, and the owner's
Finances and Invoices screens.
