#!/usr/bin/env bash
#
# Mission First — server-side deploy step.
#
# Run as webserver0, from /var/www/html/mission-first. Invoked by the GitHub
# Actions workflow over SSH on every push to main, and safe to run by hand.
#
# Scope guarantee: this script touches ONLY this application's directory and
# its own pm2 process. It never runs sudo, never edits nginx, and never
# restarts another pm2 process.

set -euo pipefail

APP_DIR="/var/www/html/mission-first"
APP_NAME="mission-first"

cd "$APP_DIR"

echo "==> Deploying $APP_NAME at $(date -Is)"

# Refuse to run anywhere unexpected.
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "ERROR: $APP_DIR does not look like the app checkout." >&2
  exit 1
fi

echo "==> Fetching main"
git fetch --prune origin
git checkout main
git reset --hard origin/main

echo "==> Installing dependencies"
# npm ci needs devDependencies to build; NODE_ENV is deliberately not
# production here so they are installed.
npm ci --include=dev

echo "==> Applying database migrations"
# migrate deploy only applies existing migrations; it never resets or drops.
npx prisma migrate deploy

echo "==> Building"
NODE_ENV=production npm run build

mkdir -p "$APP_DIR/logs" "$APP_DIR/storage"

echo "==> Restarting pm2 process (this one only)"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start "$APP_DIR/deploy/pm2.ecosystem.yaml"
fi
pm2 save

echo "==> Health check"
sleep 4
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3010/login || echo 000)
  if [ "$code" = "200" ]; then
    echo "==> OK: /login returned 200"
    exit 0
  fi
  echo "    attempt $i: HTTP $code, retrying..."
  sleep 3
done

echo "ERROR: app did not come up healthy on 127.0.0.1:3010" >&2
pm2 logs "$APP_NAME" --lines 40 --nostream || true
exit 1
