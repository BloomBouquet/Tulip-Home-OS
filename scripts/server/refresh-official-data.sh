#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${TULIP_APP_DIR:-/srv/tulip-home-os}"
ENV_FILE="${TULIP_ENV_FILE:-/etc/tulip-home-os/tulip.env}"
LOCK_DIR="${APP_DIR}/.runtime/locks"

mkdir -p "$LOCK_DIR"
chmod 700 "${APP_DIR}/.runtime" "$LOCK_DIR"
exec 9>"${LOCK_DIR}/official-data-refresh.lock"
flock -n 9 || { echo "official-data refresh already running" >&2; exit 75; }

[[ -r "$ENV_FILE" ]] || { echo "Tulip environment file is not readable" >&2; exit 78; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for name in DATABASE_URL DATA_GO_KR_API_KEY TULIP_REGION_API_URL TULIP_WASTE_API_URL; do
  [[ -n "${!name:-}" ]] || { echo "required Tulip server variable is missing: $name" >&2; exit 78; }
done

cd "$APP_DIR"
npm run sync:official-data
