#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${TULIP_ENV_FILE:-/etc/tulip-home-os/tulip.env}"
[[ -r "$ENV_FILE" ]] || { echo "Tulip environment file is not readable" >&2; exit 78; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

APP_DIR="${TULIP_APP_DIR:-/srv/tulip-home-os}"
DEPLOY_BRANCH="${TULIP_DEPLOY_BRANCH:-main}"
PORT="${TULIP_PORT:-3100}"
LOCK_DIR="${APP_DIR}/.runtime/locks"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

mkdir -p "$LOCK_DIR"
chmod 700 "${APP_DIR}/.runtime" "$LOCK_DIR"
exec 9>"${LOCK_DIR}/deploy.lock"
flock -n 9 || { echo "Tulip deployment already running" >&2; exit 75; }

for command_name in node pnpm pm2 git curl flock; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "required deployment command is missing: $command_name" >&2
    exit 69
  }
done

cd "$APP_DIR"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "tracked working tree changes must be committed or reverted before deploy" >&2
  exit 73
fi

PREVIOUS_SHA="$(git rev-parse HEAD)"
git fetch --prune origin "$DEPLOY_BRANCH"
TARGET_SHA="$(git rev-parse "origin/${DEPLOY_BRANCH}")"

git checkout --detach "$TARGET_SHA"

restore_previous_checkout() {
  git checkout --detach "$PREVIOUS_SHA"
  pnpm install --no-frozen-lockfile
}

if ! pnpm install --no-frozen-lockfile || ! pnpm verify; then
  echo "target verification failed; restoring previous checkout" >&2
  restore_previous_checkout
  exit 1
fi

pm2 startOrReload deploy/ecosystem.config.cjs --update-env

health_ok=false
for _ in {1..10}; do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    health_ok=true
    break
  fi
  sleep 2
done

if [[ "$health_ok" != "true" ]]; then
  echo "new deployment failed health check; rolling back" >&2
  git checkout --detach "$PREVIOUS_SHA"
  pnpm install --no-frozen-lockfile
  pnpm build
  pm2 startOrReload deploy/ecosystem.config.cjs --update-env

  restored=false
  for _ in {1..10}; do
    if curl -fsS "$HEALTH_URL" >/dev/null; then
      restored=true
      break
    fi
    sleep 2
  done

  if [[ "$restored" != "true" ]]; then
    echo "rollback health check also failed" >&2
  fi
  exit 1
fi

echo "deployed ${TARGET_SHA}"
