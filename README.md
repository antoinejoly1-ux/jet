# Jet — Owner Portal

A web portal where aircraft owners see their share of a plane (hours, budget, flights, invoices, maintenance), and where
the operator's team runs the business from the same app behind a **Client | Admin** toggle.

**Built so far:** Phase 0 (foundation: accounts, roles, permissions, the full schema, both app shells, French and
English, tests and CI), staff two-factor authentication, and Phase 1 (admin core: owners, aircraft and shares, View as
owner, team and roles, audit log), and Phase 2 (finance and invoices: invoices with PDFs, the money and hours ledgers,
budgets, spreadsheet import, and the owner's Finances and Invoices screens).

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

| Email                | Role                                          | 2FA                                     |
| -------------------- | --------------------------------------------- | --------------------------------------- |
| `admin@jet.test`     | Admin                                         | On (demo key printed by `pnpm db:seed`) |
| `dispatch@jet.test`  | Dispatcher                                    | On (same demo key)                      |
| `finance@jet.test`   | Finance                                       | Not set up: signing in shows the setup  |
| `owner@jet.test`     | Owner of 25% of C-GJTA                        | Not required for owners                 |
| `assistant@jet.test` | The owner's executive assistant (no finances) | Not required for owners                 |

Who gets which role at Univers:

- **Staff.** Directors are `admin`. `finance` handles invoices, budgets and owners; `dispatcher` handles flights and
  maintenance and answers owners. Only directors get access at first.
- **Owner logins.** Each login has a role for the owner it acts for: `owner` sees everything and can make requests;
  `assistant` (an executive assistant) sees the schedule and can make requests, and sees finances only when staff turn
  on "Sees finances"; `read_only` can look but not make requests. Staff set this on the invitation and can change it
  on the owner's page.
- **Holding companies.** Each aircraft belongs to a holding company (Admin → Holding companies); the owners holding
  shares in the aircraft are its shareholders.

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

## Money, files and imports

- **Ledgers:** transactions and hours are append-only. A mistake is corrected by **reversing** the entry (an exact
  opposite pointing at it), never by editing or deleting, so every balance can be traced.
- **Budgets** are drafted per share and year, compared live with actual costs by category, and **published** to the
  owner, who sees nothing until then. "Start from last year" copies the previous plan.
- **Invoices** are issued with their PDF. The owner gets an in-app notification and an email, and an
  `invoice.issued` event is queued for connected systems. Invoices are marked paid or voided with a reason, never deleted.
- **Files** go straight from the browser to storage with a 5-minute signed URL (S3 checks the declared size, type and
  SHA-256), so large PDFs never hit the app server's request limit. `/files/[id]` checks who is asking before handing
  out a 5-minute download link; owners can open only their own invoices. Duplicate uploads are flagged.
- **Spreadsheet import** (Admin → Imports): CSV parsed in the browser, columns matched once (remembered for next
  time, guessed from French or English headers), every row checked on the server with a per-row report, then the valid
  rows are imported in one transaction and the original file is kept.
- **Amounts** are typed as people write them: `1 234,56`, `1,234.56` and `1234.56` all work.

## Support, notifications and exports

- **Messages:** each owner has one running thread with dispatch. Owners write from Messages (a PDF or photo can ride
  along); dispatch answers from an inbox with Open / Mine / Resolved, assigns threads and resolves them. Pages refresh
  themselves every few seconds while open.
- **Notifications:** the bell lists a person's own notices. Owners choose on Account which ones also come by email; a
  reply from dispatch is emailed only if still unread after five minutes. Security emails can't be turned off. The full
  list of types is in `src/lib/notification-types.ts`.
- **Exports:** owners download a yearly statement PDF per share and CSV of their transactions, invoices and flights; the
  team exports the ledger, invoices and flights as filtered on screen. French CSV uses `;` and decimal commas for
  Excel.
- **Scheduled jobs:** `/api/cron/notifications` (every 5 minutes) and `/api/cron/retention` (daily) need
  `Authorization: Bearer $CRON_SECRET`. `.github/workflows/scheduled-jobs.yml` calls them once the repository has the
  `APP_URL` variable and `CRON_SECRET` secret, which works on any Vercel plan.

## API and webhooks

A REST API at `/api/v1` with scoped, revocable keys, an OpenAPI document at `/api/v1/openapi.json`, and signed,
retried webhooks for invoices, ledger entries, budgets, flights and maintenance. Managed by admins under Settings →
Developers. See [docs/api.md](docs/api.md).

## Privacy and security

- [Law 25 compliance](docs/privacy/law-25.md): privacy officer, public policy at `/privacy`, data download and requests
  on Account, incident register and requests under Admin → Settings → Personal information, retention schedule, and
  the privacy impact assessment draft.
- [Security review](docs/security-review.md), [backup and restore runbook](docs/runbooks/backup-restore.md),
  [launch checklist](docs/launch-checklist.md).

## Project layout

```
src/
  app/
    (auth)/        sign-in, sign-up, forgot/reset password, two-factor, invitation
    (client)/      owner screens (Home, Flights, Finances, Invoices, …, Account)
    (admin)/admin/ back office (Dashboard, Owners, Invitations, …)
    (public)/      pages anyone can read (privacy policy)
    api/auth/      Better Auth endpoint
    api/cron/      scheduled jobs (delayed emails, retention)
    start/         post-sign-in landing: picks the side, or /pending
  components/      ui/ (design system), shell/ (sidebar, tabs, toggle), auth/
  lib/
    auth/          auth config, session helpers, policy.ts (permissions)
    db/            Drizzle client and schema (one file per domain)
    services/      business logic: every read and write goes through here
    email/         sender and templates
    integrations/  adapters for outside systems (scheduling software)
    pdf/           PDF rendering (yearly statement)
  i18n/            locale resolution
  proxy.ts         redirects visitors without a session cookie to sign-in
drizzle/           SQL migrations (generated, committed)
scripts/           migrate.ts, seed.ts, restore-rehearsal.sh
docs/              privacy (Law 25), security review, runbooks, launch checklist
tests/             unit/, integration/, e2e/
```

**The one rule:** pages, components and actions never build database queries. They call `src/lib/services/*`, which
checks permissions, validates input, writes in a transaction and records the audit entry. ESLint enforces it.

## Commands

| Command                        | What it does                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`                     | Development server                                                            |
| `pnpm check`                   | Typecheck, lint, format check and tests: run before every push                |
| `pnpm test`                    | Unit and integration tests (needs the `jet_test` database)                    |
| `scripts/e2e-local.sh`         | End-to-end tests on desktop and phone, as CI runs them (reseeds the database) |
| `pnpm db:generate`             | Create a migration after changing `src/lib/db/schema/*`                       |
| `pnpm db:migrate`              | Apply migrations                                                              |
| `pnpm db:seed`                 | Reset and reseed demo data (refuses to run in production)                     |
| `pnpm db:studio`               | Browse the database                                                           |
| `scripts/restore-rehearsal.sh` | Dump, restore into a scratch database and compare (read-only on the source)   |

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
- **Files** (invoices, imports): a private S3 bucket in `ca-central-1` with default encryption and CORS allowing `PUT`
  and `GET` from the app's origin. Set `STORAGE_DRIVER=s3`, `S3_BUCKET`, and AWS credentials. Locally, files live in
  `tmp/storage` behind the same signed-URL flow.
- **App:** Vercel. Its servers process requests but don't store client data; run the functions in the region closest
  to Montreal (`iad1`) and note it in the Law 25 privacy assessment.

## What's next

Launch: work through the [launch checklist](docs/launch-checklist.md). The rest of Phase 5 waits on vendor choices:
accounting sync (QuickBooks Online or Xero, on top of the API and webhooks), live flight tracking, and the smart
summary on Home.
