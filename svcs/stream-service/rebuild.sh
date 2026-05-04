#!/usr/bin/env bash
#
# Build the backend image and push it to AWS ECR.
#
# Defaults match the production deployment; override any of the env vars
# below if you're targeting a different account / region / repo.
#
# Usage:
#   svcs/stream-service/rebuild.sh                     # full build + push
#   TAG=$(git rev-parse --short HEAD) … rebuild.sh  # immutable tag
#   PLATFORM=linux/arm64    … rebuild.sh        # build for arm nodes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REGISTRY="${REGISTRY:-190016928273.dkr.ecr.eu-central-1.amazonaws.com}"
REGION="${REGION:-eu-central-1}"
IMAGE_NAME="${IMAGE_NAME:-drone-stream-service}"
TAG="${TAG:-latest}"
# The current EKS cluster nodes are Graviton (arm64).
PLATFORM="${PLATFORM:-linux/arm64}"

REMOTE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
BUILDER="${BUILDER:-drone-multiarch}"

command -v aws    >/dev/null || { echo "error: aws cli not on PATH"    >&2; exit 1; }
command -v docker >/dev/null || { echo "error: docker not on PATH"     >&2; exit 1; }

# --- ensure cross-platform build infra ---------------------------------------
# Buildx's *default* builder uses the `docker` driver, which can only build
# for the host arch — `--platform linux/amd64` on Apple Silicon is silently
# downgraded: the manifest is labeled amd64 but the layers contain arm64
# binaries, so pods crash with "exec format error" on amd64 EKS nodes. The
# `docker-container` driver does proper cross-arch builds via QEMU.
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  echo "Creating buildx builder '$BUILDER' (docker-container driver) …"
  docker buildx create \
    --name "$BUILDER" \
    --driver docker-container \
    --bootstrap >/dev/null
fi

# Register QEMU emulators so RUN instructions in the Dockerfile execute the
# foreign-arch toolchain transparently. Idempotent.
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
  --tag "$REMOTE" \
  --push \
  "$SCRIPT_DIR"

# --- post-push verification --------------------------------------------------
# Pull the image back and exec a tiny command to confirm the binaries inside
# really match $PLATFORM. Catches the "manifest says amd64, layers are arm64"
# class of bug at build time instead of in cluster.
# echo "Verifying pushed image actually runs on ${PLATFORM} …"
# docker pull --platform "$PLATFORM" "$REMOTE" >/dev/null
# arch="$(docker run --rm --platform "$PLATFORM" --entrypoint /bin/sh "$REMOTE" -c 'uname -m')"
# expected="${PLATFORM##*/}"
# case "$expected/$arch" in
#   amd64/x86_64|arm64/aarch64) ;;
#   *)
#     echo "error: image arch mismatch — expected $expected, got $arch" >&2
#     exit 1
#     ;;
# esac
# echo "  arch ok: $arch"

echo
echo "Done. Image is live at:"
echo "  $REMOTE"
