#!/bin/sh
# Builds, uploads the build to the VPS and restarts the service. The first
# time, set the VPS up as deploy/pad.service and deploy/Caddyfile say.
set -eu
cd "$(dirname "$0")"

# deploy.env (gitignored) sets DEST=user@host:/opt/pad and PORT=...
[ -f deploy.env ] && . ./deploy.env
: "${DEST:?set DEST in deploy.env}"
: "${PORT:?set PORT in deploy.env}"

# What CI runs: nothing goes out that it would fail.
bun run lint
bun run check
bun test

# Building loads the server code, which opens a database: a throwaway one, not
# the dev one.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
PAD_DB="$tmp/pad.db" bun run build

rsync -e "ssh -p $PORT" -rlz --delete --delay-updates --chmod=D755,F644 \
  build/ "$DEST/build/"
ssh -t -p "$PORT" "${DEST%%:*}" sudo systemctl restart pad
