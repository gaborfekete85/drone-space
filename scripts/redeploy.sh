#!/usr/bin/env bash
#
# Rebuild + deploy (or upgrade) the drone-space stack on Kubernetes.
#
# Steps:
#   1. (only with -b / --build) Run svcs/stream-service/rebuild.sh and
#      svcs/frontend/rebuild.sh — build and push images to ECR.
#   2. Refresh the `ecr-regcred` docker-registry Secret. ECR auth tokens
#      expire after 12h, so we re-mint it every deploy — pods reference it
#      via `imagePullSecrets` to pull from the private repository.
#   3. helm upgrade --install with non-secret env values pulled from `.env`.
#      App secrets (CLERK_SECRET_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
#      DB_PASSWORD) are NOT threaded in here — they come from the
#      `drone-secrets` Secret bootstrapped by `pkgs/k8s/init.sh`.
#   4. kubectl rollout restart on the backend + frontend Deployments so the
#      new `:latest` digest is actually picked up. Without this, helm sees
#      no spec change and pods keep running their cached image.
#
# Usage:
#   scripts/redeploy.sh                        # deploy only (no rebuild)
#   scripts/redeploy.sh -b                     # rebuild images, then deploy
#   scripts/redeploy.sh --build                # same as -b
#   scripts/redeploy.sh --dry-run              # preview manifests (passed to helm)
#   scripts/redeploy.sh -b --set image.tag=abc # mix flags + helm overrides
#
# Overridable via env:
#   NAMESPACE     — target namespace          (default: drone-space)
#   RELEASE       — helm release name         (default: drone-space)
#   CHART_DIR     — path to the chart         (default: <repo>/pkgs/k8s/chart)
#   ENV_FILE      — path to .env              (default: <repo>/.env)
#   SECRET_NAME   — runtime secret name       (default: drone-secrets)
#   SKIP_RESTART  — set to 1 to skip restart  (default: unset)
#   ROLLOUT_TIMEOUT — kubectl rollout status timeout (default: 5m)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NAMESPACE="${NAMESPACE:-drone-space}"
RELEASE="${RELEASE:-drone-space}"
CHART_DIR="${CHART_DIR:-$REPO_ROOT/pkgs/k8s/chart}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"
SECRET_NAME="${SECRET_NAME:-drone-secrets}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-5m}"

# ECR pull-secret refresh (token expires every 12h)
ECR_REGISTRY="${ECR_REGISTRY:-190016928273.dkr.ecr.eu-central-1.amazonaws.com}"
ECR_REGION="${ECR_REGION:-eu-central-1}"
ECR_SECRET_NAME="${ECR_SECRET_NAME:-ecr-regcred}"

BACKEND_REBUILD="$REPO_ROOT/svcs/stream-service/rebuild.sh"
FRONTEND_REBUILD="$REPO_ROOT/svcs/frontend/rebuild.sh"

# Keys that live in the Secret — never written into helm values.
SECRET_KEYS=(
  CLERK_SECRET_KEY
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_SESSION_TOKEN
  DB_PASSWORD
)

# --- flag parsing -----------------------------------------------------------
# Pull `-b` / `--build` out of the args; everything else is forwarded to helm.

DO_BUILD=0
helm_passthrough=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace)
      NAMESPACE="$2"
      shift
      ;;
    -b|--build)
      DO_BUILD=1
      ;;
    *)
      helm_passthrough+=( "$1" )
      ;;
  esac
  shift
done

echo "NAMESPACE: $NAMESPACE"
echo "DO_BUILD: $DO_BUILD"

# Replace $@ with the helm-only args for the rest of the script.
set -- "${helm_passthrough[@]+"${helm_passthrough[@]}"}"

# --- preflight ---------------------------------------------------------------

[[ -d "$CHART_DIR" ]] || { echo "error: chart not found at $CHART_DIR" >&2; exit 1; }
[[ -f "$ENV_FILE" ]]  || { echo "error: env file not found: $ENV_FILE" >&2; exit 1; }
command -v helm    >/dev/null || { echo "error: helm not on PATH"    >&2; exit 1; }
command -v kubectl >/dev/null || { echo "error: kubectl not on PATH" >&2; exit 1; }

if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "error: namespace '$NAMESPACE' does not exist" >&2
  exit 1
fi

if ! kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" >/dev/null 2>&1; then
  echo "error: secret '$SECRET_NAME' not found in namespace '$NAMESPACE'" >&2
  echo "       run pkgs/k8s/init.sh first" >&2
  exit 1
fi

# --- 1. rebuild + push images -----------------------------------------------

if [[ "$DO_BUILD" == "1" ]]; then
  [[ -x "$BACKEND_REBUILD"  ]] || { echo "error: $BACKEND_REBUILD not executable"  >&2; exit 1; }
  [[ -x "$FRONTEND_REBUILD" ]] || { echo "error: $FRONTEND_REBUILD not executable" >&2; exit 1; }

  echo "==> Rebuilding backend image"
  "$BACKEND_REBUILD"

  echo
  echo "==> Rebuilding frontend image"
  "$FRONTEND_REBUILD"
else
  echo "==> Skipping image rebuild (pass -b / --build to rebuild)"
fi

# --- 2. refresh the ECR pull-secret -----------------------------------------
#
# Mints a fresh 12h docker-registry credential and applies it idempotently
# (dry-run -> apply pattern, so existing values are overwritten in place).
# Pods reference it via `imagePullSecrets: ecr-regcred` (chart default).

command -v aws >/dev/null || { echo "error: aws cli not on PATH" >&2; exit 1; }

echo
echo "==> Refreshing ECR pull-secret '$ECR_SECRET_NAME' in namespace '$NAMESPACE'"

ECR_PASSWORD="$(aws ecr get-login-password --region "$ECR_REGION")"
kubectl create secret docker-registry "$ECR_SECRET_NAME" \
  --namespace="$NAMESPACE" \
  --docker-server="$ECR_REGISTRY" \
  --docker-username=AWS \
  --docker-password="$ECR_PASSWORD" \
  --dry-run=client -o yaml |
  kubectl apply -f -
unset ECR_PASSWORD

# --- 3. build helm overrides from .env --------------------------------------

is_secret_key() {
  local k="$1"
  for s in "${SECRET_KEYS[@]}"; do
    [[ "$k" == "$s" ]] && return 0
  done
  return 1
}

helm_args=()
while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip blank lines and comments
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  # Only honour KEY=value lines with a valid env var name
  [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
  is_secret_key "$key" && continue

  # Strip optional surrounding quotes
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"

  # Skip empty — let chart defaults apply
  [[ -z "$value" ]] && continue

  helm_args+=( "--set-string" "env.${key}=${value}" )
done < "$ENV_FILE"

# --- 4. helm install / upgrade ----------------------------------------------

echo
echo "==> Deploying release '$RELEASE' to namespace '$NAMESPACE' from $CHART_DIR"

helm upgrade --install "$RELEASE" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  --set-string ingress.host="${NAMESPACE}.findipend.com" \
  "${helm_args[@]}" \
  "$@"

# --- 5. force pod rollout to pick up the fresh :latest digest ----------------

# When --dry-run is in the helm args, no real deployment happened — bail.
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" || "$arg" == "--dry-run=client" || "$arg" == "--dry-run=server" ]]; then
    echo "==> dry run requested — skipping rollout restart"
    exit 0
  fi
done

if [[ "${SKIP_RESTART:-0}" == "1" ]]; then
  echo "==> SKIP_RESTART=1 — leaving existing pods in place"
  exit 0
fi

echo
echo "==> Restarting deployments so :latest images get re-pulled"
kubectl -n "$NAMESPACE" rollout restart deployment/backend deployment/frontend

echo
echo "==> Waiting for rollout to complete (timeout: $ROLLOUT_TIMEOUT)"
kubectl -n "$NAMESPACE" rollout status deployment/backend  --timeout="$ROLLOUT_TIMEOUT"
kubectl -n "$NAMESPACE" rollout status deployment/frontend --timeout="$ROLLOUT_TIMEOUT"

echo
echo "Done. Check pods with:  kubectl -n $NAMESPACE get pods"
