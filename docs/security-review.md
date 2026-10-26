# Security review (Phase 4, before launch)

Reviewed on 2026-10-26 against the plan's security section and the OWASP Top 10. Findings are fixed in this branch
unless marked otherwise.

## What protects what

| Threat                                  | Control                                                                                                                                                       | Where                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| An owner reading another owner's data   | Every service call starts with `authorize(actor, permission, { ownerIds })`; owner reads are filtered by their own owner ids inside the query; tests prove it | `src/lib/auth/policy.ts`, `tests/integration/*`      |
| Probing for other people's files or ids | Downloads answer 404 for both "missing" and "not yours"                                                                                                       | `src/lib/route-errors.ts`, `/files/[id]`             |
| Stolen staff password                   | Two-factor required for every staff sign-in method (password, magic link, Google)                                                                             | `src/lib/auth/second-factor-everywhere.ts`           |
| Password guessing                       | Rate limits on sign-in and 2FA; breached-password check in production                                                                                         | `src/lib/auth/auth.ts`                               |
| Staff impersonation going unnoticed     | "View as owner" is read-only, expires after an hour, and is logged                                                                                            | `src/lib/auth/view-as.ts`                            |
| SQL injection                           | All queries through Drizzle's parameterised builder; inputs validated with Zod                                                                                | `src/lib/services/*`, `src/lib/validation/*`         |
| Cross-site scripting                    | React escapes output; emails escape every value; Content Security Policy limits scripts to the app's origin                                                   | `next.config.ts`, `src/lib/email/templates.ts`       |
| Clickjacking                            | `frame-ancestors 'none'` and `X-Frame-Options: DENY`                                                                                                          | `next.config.ts`                                     |
| Spreadsheet formula injection           | CSV cells starting with `= + - @` are prefixed so spreadsheets show them as text                                                                              | `src/lib/csv.ts`                                     |
| Forged scheduled-job calls              | `/api/cron/*` requires `CRON_SECRET`, compared in constant time; refuses to run without it                                                                    | `src/lib/cron.ts`                                    |
| Attaching someone else's file to a chat | A message can only carry a file its sender uploaded                                                                                                           | `src/lib/services/messages.ts`                       |
| Tampered or oversized uploads           | Signed URLs fix the size, type and SHA-256; the server re-checks size before recording the file                                                               | `src/lib/services/files.ts`                          |
| Lost or altered records                 | Ledgers are append-only; every change is in the audit log with before and after values                                                                        | `src/lib/services/ledger.ts`, `audit_log`            |
| Leaked or over-broad API access         | Keys are shown once, stored as SHA-256 hashes, scoped to listed permissions, revocable, rate limited (120/min)                                                | `src/lib/services/api-keys.ts`                       |
| Webhooks used to reach internal systems | HTTPS only; hosts resolving to private, loopback or link-local addresses refused; redirects not followed; 10 s timeout                                        | `src/lib/services/webhooks.ts`                       |
| Forged webhook deliveries               | HMAC-SHA256 signature with a per-endpoint secret (encrypted at rest with AES-256-GCM) and a timestamp against replays                                         | `src/lib/services/webhooks.ts`, `src/lib/crypto.ts`  |
| Lost database or files                  | Point-in-time recovery, bucket versioning, rehearsed restores                                                                                                 | [backup-restore runbook](runbooks/backup-restore.md) |

## Findings

| #   | Finding                                                                                          | Severity | Status                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No Content Security Policy                                                                       | Medium   | **Fixed**: CSP added; `'unsafe-inline'` scripts remain because nonces would make every page dynamic (revisit with Cache Components) |
| 2   | Home's "next flight" showed a co-owner's route                                                   | Medium   | **Fixed** in Phase 3                                                                                                                |
| 3   | Status badge text below 4.5:1 contrast                                                           | Low      | **Fixed**: darker light-mode tokens; axe now runs on every screen in CI                                                             |
| 4   | No automated dependency updates                                                                  | Low      | **Fixed**: Dependabot, weekly, grouped                                                                                              |
| 5   | `pnpm audit`: one moderate advisory in `esbuild` ≤ 0.24 (GHSA-67mh-4wv8-2f99), via `drizzle-kit` | Low      | **Accepted**: development-server issue in a dev-only tool, never shipped or run in production                                       |
| 6   | Uploads have no per-user rate limit                                                              | Low      | **Open**: only signed-in owners and staff can upload, 10–25 MB each; add a limit if abuse appears                                   |
| 7   | Vercel functions run in the United States                                                        | Info     | **Documented** in the [privacy impact assessment](privacy/law-25.md)                                                                |

## Before launch

- Set production secrets only in Vercel: `BETTER_AUTH_SECRET` (32+ random bytes), `CRON_SECRET`, AWS and Resend keys.
- Keep `REQUIRE_STAFF_2FA=true` and `AUTH_RATE_LIMIT=on`.
- Enable GitHub secret scanning and branch protection on `main` (CI must pass).
- Review the audit log weekly for the first month.
