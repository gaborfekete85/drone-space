#!/usr/bin/env bash
#
# Bootstrap a Kubernetes secret in the `drone-space` namespace from values
# stored in the repo's `.env` file.
#
# Usage:
#   pkgs/k8s/init.sh
#
# Overridable via env:
#   NAMESPACE     — target namespace (default: drone-space)
#   SECRET_NAME   — secret name      (default: drone-secrets)
#   ENV_FILE      — path to .env     (default: <repo-root>/.env)
#   DB_PASSWORD   — postgres password to embed (default: postgres)
#
# The secret is applied idempotently — running the script again updates the
# values in place rather than failing on "already exists".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

NAMESPACE="${NAMESPACE:-drone-space}"
SECRET_NAME="${SECRET_NAME:-drone-secrets}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

# Keys read out of the .env file.
ENV_KEYS=(
  CLERK_SECRET_KEY
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
)

# Keys with hard-coded defaults — overridable via shell env of the same name.
# These don't live in `.env` because they're either local conveniences (the
# postgres password matches what docker-compose uses) or non-secret enough
# that committing the default doesn't matter.
DB_PASSWORD="${DB_PASSWORD:-postgres}"
LITERAL_KEYS=(
  DB_PASSWORD
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "error: kubectl not on PATH" >&2
  exit 1
fi

# Pull a single value out of the .env file. Reads the *last* matching line so
# duplicates lower in the file win, matching shell-`source` semantics. Strips
# surrounding single or double quotes if present.
read_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    echo "error: $key not present in $ENV_FILE" >&2
    return 1
  fi
  local val="${line#${key}=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  if [[ -z "$val" ]]; then
    echo "error: $key is set to an empty value in $ENV_FILE" >&2
    return 1
  fi
  printf '%s' "$val"
}

# Verify the namespace exists before doing anything destructive.
if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "error: namespace '$NAMESPACE' does not exist" >&2
  echo "       create it first:  kubectl create namespace $NAMESPACE" >&2
  exit 1
fi

# Build the kubectl args without echoing the values to the log.
literal_args=()
for key in "${ENV_KEYS[@]}"; do
  value="$(read_env_value "$key")"
  literal_args+=( "--from-literal=${key}=${value}" )
done
for key in "${LITERAL_KEYS[@]}"; do
  value="${!key}"   # indirect lookup: e.g. ${DB_PASSWORD}
  if [[ -z "$value" ]]; then
    echo "error: $key resolved to an empty value" >&2
    exit 1
  fi
  literal_args+=( "--from-literal=${key}=${value}" )
done

# Apply via dry-run -> apply pattern: idempotent, no error if the secret
# already exists, no `kubectl create` failure on second run.
kubectl create secret generic "$SECRET_NAME" \
  --namespace="$NAMESPACE" \
  "${literal_args[@]}" \
  --dry-run=client \
  -o yaml |
  kubectl apply -f -

echo
echo "Secret '$SECRET_NAME' applied in namespace '$NAMESPACE' with keys:"
for key in "${ENV_KEYS[@]}" "${LITERAL_KEYS[@]}"; do
  echo "  - $key"
done
