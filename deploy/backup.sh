#!/bin/sh
# Daily backup of villa.db (consistent SQLite snapshot via the app container) and uploads/ -> /srv/villa-walk/backups, 14 days rotation.
# Backs up the MAIN environment only. The training environment (/srv/villa-walk/data-train) is deliberately not backed up.
set -eu
SRC=/srv/villa-walk/data
DST=/srv/villa-walk/backups
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DST"
TMP="$DST/.tmp-$STAMP"; mkdir -p "$TMP"
docker exec villa-walk node -e "require('better-sqlite3')('/data/villa.db').backup('/data/.backup-tmp.db').then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"
mv "$SRC/.backup-tmp.db" "$TMP/villa.db"
tar -C "$TMP" -czf "$DST/villa-db-$STAMP.tar.gz" villa.db
[ -d "$SRC/uploads" ] && tar -C "$SRC" -czf "$DST/uploads-$STAMP.tar.gz" uploads
rm -rf "$TMP"
find "$DST" -maxdepth 1 -type f \( -name 'villa-db-*.tar.gz' -o -name 'uploads-*.tar.gz' \) -mtime +14 -delete
