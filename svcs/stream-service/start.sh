#!/usr/bin/env bash
# Local dev entrypoint for the stream-service.
#
# Why this file:
#   - Loads the repo-root `.env` so AWS keys, CloudFront signing keys,
#     STREAM_URL_STRATEGY, etc. reach the uvicorn process. Without this,
#     `cf_sign.is_configured()` returns False and /api/test_m3u8 (or
#     /api/check_access in cloudfront mode) responds with
#     "cloudfront signing not configured".
#   - Forces DATABASE_URL to point at the local docker-compose postgres,
#     overriding the prod RDS URL that lives in `.env`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../../.env}"

cd "$SCRIPT_DIR"

if [[ -f "$ENV_FILE" ]]; then
  # `set -a` auto-exports every variable assigned while it's active,
  # which is what `source <env>` needs to push values into the child
  # uvicorn process (env files use simple KEY=VALUE, no `export`).
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "warning: env file not found at $ENV_FILE — running with shell env only" >&2
fi

# Local docker-compose postgres — overrides the prod RDS URL from .env.
set -a; source /Users/gaborfekete/my-projects/drone/.env; set +a
export DATABASE_URL="postgresql+psycopg://drone:drone@localhost:5432/drone"


exec .venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000
