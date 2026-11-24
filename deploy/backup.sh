#!/bin/sh
# Daily backup of villa.db (consistent SQLite snapshot via the app container) and uploads/ -> /srv/villa-walk/backups.
# Backs up the MAIN environment only. The training environment (/srv/villa-walk/data-train) is deliberately not backed up.
#
# villa.db: every day, kept 14 days (a few dozen KB each).
# uploads/: several GB, so it is archived only when its contents changed since the last archive
# (file list + sizes + mtimes), and only the newest UPLOADS_KEEP archives are kept, however old -
# an unchanged uploads/ means the newest archive is still the current state and must not age out.
# The old version archived all of uploads/ every night and kept 14 days: 14 x 7.5 GB filled the 99 GB disk.
# An archive is written under a temporary name and renamed only once complete, so a failed or
# interrupted run (e.g. a full disk) never leaves a broken archive that looks like a good one.
# If free space is below twice the expected archive size, the uploads archive is skipped (logged).
set -eu
SRC=/srv/villa-walk/data
DST=/srv/villa-walk/backups
UPLOADS_KEEP=${UPLOADS_KEEP:-3}
DB_KEEP_DAYS=${DB_KEEP_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)
log() { echo "$(date '+%F %T') $*"; }

mkdir -p "$DST"
TMP="$DST/.tmp-$STAMP"; PART="$DST/.uploads-$STAMP.tar.gz.part"
trap 'rm -rf "$TMP" "$PART" "$DST/.villa-db-$STAMP.tar.gz.part"' EXIT
mkdir -p "$TMP"

# --- villa.db ---
docker exec villa-walk node -e "require('better-sqlite3')('/data/villa.db').backup('/data/.backup-tmp.db').then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"
mv "$SRC/.backup-tmp.db" "$TMP/villa.db"
tar -C "$TMP" -czf "$DST/.villa-db-$STAMP.tar.gz.part" villa.db
mv "$DST/.villa-db-$STAMP.tar.gz.part" "$DST/villa-db-$STAMP.tar.gz"
log "db: villa-db-$STAMP.tar.gz"

# --- uploads/ ---
if [ -d "$SRC/uploads" ]; then
  FP_FILE="$DST/uploads.fingerprint"
  FP=$(cd "$SRC" && find uploads -type f -printf '%P %s %T@\n' | LC_ALL=C sort | sha256sum | cut -d' ' -f1)
  LATEST=$(ls -1 "$DST"/uploads-*.tar.gz 2>/dev/null | sort | tail -1 || true)
  if [ -n "$LATEST" ] && [ -f "$FP_FILE" ] && [ "$(cat "$FP_FILE")" = "$FP" ]; then
    log "uploads: unchanged since $(basename "$LATEST"), not archived again"
  else
    if [ -n "$LATEST" ]; then NEED=$(stat -c %s "$LATEST"); else NEED=$(du -sb "$SRC/uploads" | cut -f1); fi
    FREE=$(df -B1 --output=avail "$DST" | tail -1 | tr -d ' ')
    if [ "$FREE" -lt $((NEED * 2)) ]; then
      log "uploads: SKIPPED - only $((FREE / 1048576)) MB free, need about $((NEED * 2 / 1048576)) MB"
      logger -p user.err -t villa-walk-backup "uploads backup skipped: low disk space" 2>/dev/null || true
    else
      tar -C "$SRC" -czf "$PART" uploads
      mv "$PART" "$DST/uploads-$STAMP.tar.gz"
      echo "$FP" > "$FP_FILE"
      log "uploads: uploads-$STAMP.tar.gz ($(($(stat -c %s "$DST/uploads-$STAMP.tar.gz") / 1048576)) MB)"
    fi
  fi
fi

# --- rotation ---
ls -1 "$DST"/uploads-*.tar.gz 2>/dev/null | sort | head -n -"$UPLOADS_KEEP" | while read -r f; do
  rm -f "$f"; log "rotated: $(basename "$f")"
done
find "$DST" -maxdepth 1 -type f -name 'villa-db-*.tar.gz' -mtime +"$DB_KEEP_DAYS" -delete
find "$DST" -maxdepth 1 -name '.tmp-*' -mmin +360 -exec rm -rf {} + 2>/dev/null || true
find "$DST" -maxdepth 1 -name '.*.part' -mmin +360 -delete 2>/dev/null || true
