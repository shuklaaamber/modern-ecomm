#!/usr/bin/env bash
# Daily logical backup of the production database. Install on the VM with `crontab -e`:
#   15 2 * * * /opt/modern-ecomm/scripts/backup-db.sh >> /var/log/backup-db.log 2>&1
# Needs postgresql-client (pg_dump) matching the server major version. Copy /var/backups off the VM too.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.production; set +a
dir=/var/backups/thread-and-co; mkdir -p "$dir"; umask 077
out="$dir/$(date +%F).sql.gz"
pg_dump --no-owner "$DATABASE_URL" | gzip > "$out"
find "$dir" -name '*.sql.gz' -mtime +14 -delete
echo "backup ok: $out"
