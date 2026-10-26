#!/usr/bin/env bash
# Runs the end-to-end suite the way CI does: fresh seed, production build, real server.
# Warning: reseeds the database in DATABASE_URL.
set -euo pipefail
pnpm build
pnpm db:seed
mkdir -p tmp && rm -f tmp/emails.jsonl
pnpm exec playwright test "$@"
