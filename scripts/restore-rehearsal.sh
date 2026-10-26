#!/usr/bin/env bash
# Backup-restore rehearsal: dumps a database, restores it into a fresh scratch
# database, and proves the copy is complete by comparing every table's row
# count and the ledger totals. Run before launch and every quarter after
# (see docs/runbooks/backup-restore.md).
#
#   scripts/restore-rehearsal.sh                       # uses $DATABASE_URL
#   SOURCE_URL=postgres://... scripts/restore-rehearsal.sh
#
# The source is only read. The scratch database is created on the same server
# and dropped at the end unless KEEP_SCRATCH=1.
set -euo pipefail

SOURCE_URL="${SOURCE_URL:-${DATABASE_URL:?Set DATABASE_URL or SOURCE_URL}}"
SCRATCH_DB="restore_rehearsal_$(date +%Y%m%d%H%M%S)"
ADMIN_URL="${SOURCE_URL%/*}/postgres"
SCRATCH_URL="${SOURCE_URL%/*}/${SCRATCH_DB}"
DUMP="$(mktemp -d)/backup.dump"

started=$(date +%s)
echo "1/4 Dumping (custom format, compressed)…"
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$SOURCE_URL"
echo "    $(du -h "$DUMP" | cut -f1) written"

echo "2/4 Creating scratch database $SCRATCH_DB…"
psql "$ADMIN_URL" -qc "CREATE DATABASE \"$SCRATCH_DB\""
cleanup() {
  if [ "${KEEP_SCRATCH:-0}" != "1" ]; then psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS \"$SCRATCH_DB\"" || true; fi
  rm -rf "$(dirname "$DUMP")"
}
trap cleanup EXIT

echo "3/4 Restoring…"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$SCRATCH_URL" "$DUMP"

echo "4/4 Comparing…"
counts() {
  psql "$1" -At -F' ' <<'SQL'
select 'table:' || c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public', 'drizzle')
union all select 'ledger:hours', coalesce(sum(minutes), 0)::text from hour_ledger
union all select 'ledger:money', coalesce(sum(amount_cents), 0)::text from transactions
union all select 'invoices:total', coalesce(sum(total_cents), 0)::text from invoices
order by 1;
SQL
}
diff <(counts "$SOURCE_URL") <(counts "$SCRATCH_URL") >/dev/null || {
  echo "MISMATCH between source and restore:"
  diff <(counts "$SOURCE_URL") <(counts "$SCRATCH_URL") || true
  exit 1
}
tables=$(counts "$SCRATCH_URL" | grep -c '^table:')
rows=$(counts "$SCRATCH_URL" | awk '/^table:/ {s += $2} END {print s}')
echo "OK: $tables tables, $rows rows, ledger and invoice totals identical. Took $(( $(date +%s) - started ))s."
