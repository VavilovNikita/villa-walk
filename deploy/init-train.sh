#!/bin/sh
# One-time (and safe to repeat) setup of the training environment, run on the VPS from the repo directory:
#   sh deploy/init-train.sh [domain]
# - creates .env.train (mode 600) with a fresh EDIT_KEY, only if it does not exist yet - an existing key is never replaced;
# - writes the editor link to EDIT_LINK.train.txt (mode 600). Nothing secret is printed;
# - creates the data directory of the training environment, separate from the main one.
set -eu
cd "$(dirname "$0")/.."
DOMAIN="${1:-villa.sunsetsamui.com}"
DATA=/srv/villa-walk/data-train
umask 077

if [ ! -f .env.train ]; then
  KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  {
    echo "# training environment (https://$DOMAIN/train/); not the main environment's key"
    echo "EDIT_KEY=$KEY"
  } > .env.train
  chmod 600 .env.train
  echo ".env.train created"
else
  chmod 600 .env.train
  echo ".env.train exists, key kept"
fi

KEY=$(sed -n 's/^EDIT_KEY=//p' .env.train)
[ -n "$KEY" ] || { echo "EDIT_KEY missing in .env.train" >&2; exit 1; }
printf 'https://%s/train/?k=%s\n' "$DOMAIN" "$KEY" > EDIT_LINK.train.txt
chmod 600 EDIT_LINK.train.txt
echo "editor link written to EDIT_LINK.train.txt (not printed)"

mkdir -p "$DATA"
# the container runs as 1000:1000 like the main one
chown 1000:1000 "$DATA" 2>/dev/null || echo "note: could not chown $DATA to 1000:1000 - run: sudo chown 1000:1000 $DATA"
echo "data directory: $DATA"
