# Backups and restore

## What is backed up

| What              | How                                                                                        | Kept                                                        |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Database          | Provider point-in-time recovery (RDS automated backups or Supabase PITR) in `ca-central-1` | 35 days (RDS maximum); 7+ on Supabase Pro                   |
| Database, monthly | A manual snapshot on the first of each month (RDS) or a `pg_dump` to the backup bucket     | 12 months                                                   |
| Files (S3)        | Bucket **versioning** on: a deleted or overwritten invoice keeps its previous version      | Non-current versions expire after 365 days (lifecycle rule) |

### Settings to switch on (once)

- **RDS:** backup retention 35 days, deletion protection on, encryption on, Multi-AZ for production.
- **S3:** versioning on; default encryption (SSE-S3 or KMS); block all public access; lifecycle rule "expire non-current
  versions after 365 days".

## Rehearsal (before launch, then every quarter)

`scripts/restore-rehearsal.sh` dumps a database, restores it into a scratch database on the same server, and compares
every table's row count plus the hour ledger, money ledger and invoice totals. It never writes to the source.

```sh
SOURCE_URL="postgres://…production read replica or a restored PITR copy…" scripts/restore-rehearsal.sh
```

To rehearse a real disaster, restore the provider's point-in-time backup to a new instance first, then run the script
with that instance as `SOURCE_URL` against the original, or simply sign in to a preview deployment pointed at it.

### Log

| Date            | Source                      | Result                                                     | Time | By     |
| --------------- | --------------------------- | ---------------------------------------------------------- | ---- | ------ |
| 2026-10-26      | Seeded development database | OK: 37 tables, 1,170 rows; ledger and invoice totals equal | 1 s  | Claude |
| _before launch_ | Production PITR copy        |                                                            |      |        |

## Restoring for real

1. **Database:** in the provider console, restore to a point in time just before the incident, as a new instance. Check
   it (run the rehearsal script against it), then point `DATABASE_URL` in Vercel at it and redeploy.
2. **A file:** in S3, show versions, select the previous version of the object, and restore it (copy it over the
   current one). Keys are random; find the key from the `files` table by invoice or file id.
3. Record what happened in the incident register if personal information was affected.
