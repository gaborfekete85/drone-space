#!/usr/bin/env bash
#
# Build the frontend image and push it to AWS ECR.
#
# Reads NEXT_PUBLIC_* values from the repo's .env (because Next inlines
# those into the client bundle at build time) and forwards them as
# `--build-arg`. Secret values (CLERK_SECRET_KEY, AWS_*) are NOT baked in
# — those are injected at runtime via the K8s Secret.
#
# Usage:
#   svcs/frontend/rebuild.sh                       # full build + push
#   TAG=$(git rev-parse --short HEAD) … rebuild.sh # immutable tag
#   PLATFORM=linux/arm64    … rebuild.sh           # build for arm nodes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

REGISTRY="${REGISTRY:-190016928273.dkr.ecr.eu-central-1.amazonaws.com}"
REGION="${REGION:-eu-central-1}"
IMAGE_NAME="${IMAGE_NAME:-drone-frontend}"
TAG="${TAG:-latest}"
# The current EKS cluster nodes are Graviton (arm64).
PLATFORM="${PLATFORM:-linux/arm64}"

REMOTE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
BUILDER="${BUILDER:-drone-multiarch}"

command -v aws    >/dev/null || { echo "error: aws cli not on PATH"    >&2; exit 1; }
command -v docker >/dev/null || { echo "error: docker not on PATH"     >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "error: env file not found: $ENV_FILE"  >&2; exit 1; }

# Pull a single value out of the .env file (last match wins, quotes stripped).
read_env_value() {
  local key="$1" line val
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  [[ -z "$line" ]] && return 0
  val="${line#${key}=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

# NEXT_PUBLIC_* values to inline into the client bundle. Anything not present
# in .env falls back to the Dockerfile's ARG default (or empty).
PUB_KEYS=(
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  NEXT_PUBLIC_CLERK_SIGN_IN_URL
  NEXT_PUBLIC_CLERK_SIGN_UP_URL
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
)

build_args=()
for key in "${PUB_KEYS[@]}"; do
  value="$(read_env_value "$key")"
  if [[ -n "$value" ]]; then
    build_args+=( "--build-arg" "${key}=${value}" )
  else
    echo "warning: $key is empty or missing in $ENV_FILE" >&2
  fi
done

# Fail fast if the Clerk publishable key is missing, as the Next.js build
# will fail cryptically during static page generation without it.
if [[ -z "$(read_env_value "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")" ]]; then
  echo "error: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing from $ENV_FILE. This is required for Next.js static generation." >&2
  exit 1
fi

# BACKEND_INTERNAL_URL is also baked at build time (next config rewrites are
# serialized into routes-manifest.json). The cluster Service is named
# `backend` so this matches both compose and k8s.
build_args+=( "--build-arg" "BACKEND_INTERNAL_URL=http://backend:8000" )

# --- ensure cross-platform build infra ---------------------------------------
# See svcs/backend/rebuild.sh for the why. Same setup used here.
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  echo "Creating buildx builder '$BUILDER' (docker-container driver) …"
  docker buildx create \
    --name "$BUILDER" \
    --driver docker-container \
    --bootstrap >/dev/null
fi
docker run --privileged --rm tonistiigi/binfmt:latest --install all \
  >/dev/null 2>&1 || true

echo "Logging in to ECR (${REGISTRY}) …"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

echo "Building + pushing ${REMOTE} for ${PLATFORM} …"
docker buildx build \
  --builder "$BUILDER" \
  --platform "$PLATFORM" \
  --provenance=false \
  "${build_args[@]}" \
  --tag "$REMOTE" \
  --push \
  "$SCRIPT_DIR"

# Post-push sanity check: pull back and run a no-op to confirm the binaries
# actually match $PLATFORM (not just the manifest label).
echo "Verifying pushed image actually runs on ${PLATFORM} …"
docker pull --platform "$PLATFORM" "$REMOTE" >/dev/null
arch="$(docker run --rm --platform "$PLATFORM" --entrypoint /bin/sh "$REMOTE" -c 'uname -m')"
expected="${PLATFORM##*/}"
case "$expected/$arch" in
  amd64/x86_64|arm64/aarch64) ;;
  *)
    echo "error: image arch mismatch — expected $expected, got $arch" >&2
    exit 1
    ;;
esac
echo "  arch ok: $arch"

echo
echo "Done. Image is live at:"
echo "  $REMOTE"
