#!/usr/bin/env bash
# Nightly dump of this app's database. Separate from anything else on the server.
# Writes to ~/squeek-backups, keeps 14, and checks each dump before keeping it.
# The dumps hold password hashes and linked wallets, so they're private to this user.
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin
umask 077
CONTAINER="${PG_CONTAINER:-mintooor-postgres-1}"
DIR="$HOME/squeek-backups"
KEEP=14
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/squeek-$STAMP.sql.gz"
mkdir -p "$DIR"
fail() { echo "$(date -u +%FT%TZ) BACKUP FAILED: $1"; rm -f "$OUT.part"; exit 1; }
PASSWORD="$(cat "$HOME/squeek-time-machine-secrets/db")"
nice -n 19 docker exec -e PGPASSWORD="$PASSWORD" "$CONTAINER" \
  pg_dump -h 127.0.0.1 -U squeek -d squeek_time_machine --no-owner --no-privileges </dev/null \
  | nice -n 19 gzip -9 > "$OUT.part" || fail "pg_dump"
gzip -t "$OUT.part" || fail "the dump is corrupt"
# Counted, not grep -q: under pipefail an early grep exit would fail gunzip on success.
TABLES="$(gunzip -c "$OUT.part" | grep -c '^CREATE TABLE ' || true)"
[ "$TABLES" -ge 20 ] || fail "only $TABLES tables in the dump"
gunzip -c "$OUT.part" | tail -n 5 | grep -c 'PostgreSQL database dump complete' >/dev/null || fail "the dump is incomplete"
mv "$OUT.part" "$OUT"
ls -1t "$DIR"/squeek-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(date -u +%FT%TZ) ok $(basename "$OUT") $(wc -c < "$OUT") bytes, $TABLES tables"
