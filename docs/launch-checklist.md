# Launch checklist

Phase 4 is done when every owner is invited and every box below is ticked.

## Accounts and keys

- [ ] Product name and domain chosen; `BETTER_AUTH_URL` set to it
- [ ] Resend: domain verified (SPF, DKIM), `RESEND_API_KEY` and `EMAIL_FROM` set
- [ ] Google sign-in: OAuth client created with redirect `{BETTER_AUTH_URL}/api/auth/callback/google`
- [ ] `CRON_SECRET` set in Vercel and as a GitHub secret; `APP_URL` set as a GitHub variable (enables the scheduled jobs)
- [ ] `OPERATOR_PHONE` set (call-to-book and call-us buttons)

## Hosting (Canada)

- [ ] Database in `ca-central-1` with backups and deletion protection ([runbook](runbooks/backup-restore.md))
- [ ] S3 bucket in `ca-central-1`: private, encrypted, versioned, CORS for the app's origin
- [ ] Restore rehearsed on a production copy and logged in the runbook

## Privacy (Law 25)

- [ ] Privacy officer named; `PRIVACY_OFFICER_NAME`, `PRIVACY_OFFICER_EMAIL`, `OPERATOR_LEGAL_NAME` set
- [ ] Privacy policy reviewed by the lawyer
- [ ] Privacy impact assessment completed and signed; Vercel and Resend agreements signed
- [ ] Team briefed on the request and incident procedures ([law-25.md](privacy/law-25.md))

## Security

- [ ] Every staff member has signed in and set up two-factor
- [ ] Branch protection on `main`; secret scanning on
- [ ] Open findings in the [security review](security-review.md) accepted or fixed

## Data

- [ ] Real fleet entered: aircraft, owners, shares (100% per aircraft)
- [ ] Opening hour balances and this year's budgets entered and published
- [ ] Past invoices imported or uploaded
- [ ] Scheduling software connected, or flights entered by hand

## Owners

- [ ] Every owner has an email on file (Admin → Owners)
- [ ] Every owner invited (Admin → Invitations); the dashboard shows "owners without access" at zero
- [ ] A test owner walked through sign-up, Home, Finances, Invoices, Messages on a phone
