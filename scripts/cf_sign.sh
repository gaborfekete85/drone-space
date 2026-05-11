#!/usr/bin/env bash
#
# Generate a CloudFront signed URL for an S3 object — broken down step by step.
#
# Usage:
#   svcs/cf_sign.sh                                       # default video
#   svcs/cf_sign.sh user_xxx/2026/foo.mp4                 # custom S3 key
#   EXPIRES_IN=7200 svcs/cf_sign.sh user_xxx/foo.mp4      # 2-hour validity
#
# What CloudFront signed URLs are:
#   A signed URL is the original URL + 3 query parameters:
#     Expires       — Unix epoch when the URL stops working
#     Signature     — RSA-SHA1 over a "policy" doc, signed with your PRIVATE key
#     Key-Pair-Id   — tells CloudFront which PUBLIC key to verify against
#   CloudFront verifies the signature at the edge BEFORE fetching from S3.
#   Anyone holding the URL can stream until Expires; nobody can forge one
#   without the private key.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"

S3_KEY="${1:-user_3DFyN4VkgbOCx5K41wFbpliTdLX/2026/Elthorn_Dani_cine_3.mp4}"
EXPIRES_IN="${EXPIRES_IN:-3600}"   # seconds — how long the URL stays valid

# ---------------------------------------------------------------------------
# Step 1 — read CloudFront config from .env
# ---------------------------------------------------------------------------
# We need three things:
#   CLOUDFRONT_DOMAIN          — e.g. d3blv0il7bwv9e.cloudfront.net
#   CLOUDFRONT_KEY_PAIR_ID     — e.g. KA48XGLWW3EBY  (CloudFront's reference
#                                to the PUBLIC key uploaded via console/CLI)
#   CLOUDFRONT_PRIVATE_KEY_B64 — base64-encoded PEM of the matching PRIVATE
#                                key.  Stored base64'd because PEM contains
#                                newlines that don't round-trip through .env.

read_env() {
  grep -E "^${1}=" "$ENV_FILE" | tail -n1 | cut -d= -f2-
}

CF_DOMAIN="$(read_env CLOUDFRONT_DOMAIN)"
KEY_PAIR_ID="$(read_env CLOUDFRONT_KEY_PAIR_ID)"
PRIV_B64="$(read_env CLOUDFRONT_PRIVATE_KEY_B64)"

[[ -n "$CF_DOMAIN" && -n "$KEY_PAIR_ID" && -n "$PRIV_B64" ]] || {
  echo "error: CloudFront config missing in $ENV_FILE" >&2
  echo "  need: CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID, CLOUDFRONT_PRIVATE_KEY_B64" >&2
  exit 1
}

echo "─── Step 1: config ──────────────────────────────────────────────"
echo "  domain       : $CF_DOMAIN"
echo "  key-pair-id  : $KEY_PAIR_ID"
echo "  private key  : (base64-encoded PEM, ${#PRIV_B64} chars)"

# ---------------------------------------------------------------------------
# Step 2 — build the resource URL
# ---------------------------------------------------------------------------
# The CloudFront distribution has a /stream/* cache behavior pointing at the
# S3 origin (with OAC).  A CloudFront Function strips the /stream prefix
# before the request reaches S3, so /stream/<s3_key> on CloudFront becomes
# /<s3_key> on S3.  The browser only ever sees the cloudfront.net hostname.

RESOURCE_URL="https://${CF_DOMAIN}/stream/${S3_KEY}"
EXPIRES=$(( $(date +%s) + EXPIRES_IN ))

echo
echo "─── Step 2: resource URL ────────────────────────────────────────"
echo "  $RESOURCE_URL"
echo "  expires      : $EXPIRES (Unix epoch, +${EXPIRES_IN}s from now)"

# ---------------------------------------------------------------------------
# Step 3 — write the private key out to a tempfile (openssl needs a file)
# ---------------------------------------------------------------------------

PRIV_PEM="$(mktemp)"
trap 'rm -f "$PRIV_PEM"' EXIT
printf '%s' "$PRIV_B64" | openssl base64 -d -A > "$PRIV_PEM"

# ---------------------------------------------------------------------------
# Step 4 — build the "canned policy" JSON
# ---------------------------------------------------------------------------
# A "canned policy" is the simplest CloudFront URL signature: it just says
# "this URL works until <epoch>".  The exact JSON format is mandatory —
# CloudFront reconstructs the same string on its side and verifies the
# signature against it, so any whitespace difference breaks verification.
#
# Canned policy = {"Statement":[{"Resource":"<url>","Condition":{"DateLessThan":{"AWS:EpochTime":<epoch>}}}]}

POLICY="{\"Statement\":[{\"Resource\":\"${RESOURCE_URL}\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":${EXPIRES}}}}]}"

echo
echo "─── Step 4: canned policy JSON ──────────────────────────────────"
echo "  $POLICY"

# ---------------------------------------------------------------------------
# Step 5 — sign the policy with RSA-SHA1, base64-encode URL-safely
# ---------------------------------------------------------------------------
# CloudFront mandates RSA-SHA1 (not SHA256).  Then it expects URL-safe base64
# but with a custom alphabet — replace standard +/= with -~_ respectively.
#
#   openssl dgst -sha1 -sign <key>  →  raw RSA signature bytes (256B for 2048-bit key)
#   openssl base64 -A               →  standard base64, single line (no \n)
#   tr '+/='  '-~_'                 →  CloudFront's URL-safe alphabet

SIGNATURE="$(printf '%s' "$POLICY" \
  | openssl dgst -sha1 -sign "$PRIV_PEM" \
  | openssl base64 -A \
  | tr '+/=' '-~_')"

echo
echo "─── Step 5: signature ───────────────────────────────────────────"
echo "  ${SIGNATURE:0:80}…  (${#SIGNATURE} chars)"

# ---------------------------------------------------------------------------
# Step 6 — assemble the final signed URL
# ---------------------------------------------------------------------------
# For a canned policy, the URL only carries Expires, Signature, Key-Pair-Id.
# (Policy parameter is only used for "custom policies" with extra conditions
# like IP restrictions.)

SIGNED_URL="${RESOURCE_URL}?Expires=${EXPIRES}&Signature=${SIGNATURE}&Key-Pair-Id=${KEY_PAIR_ID}"

echo
echo "─── Step 6: signed URL ──────────────────────────────────────────"
echo
echo "$SIGNED_URL"
echo

# ---------------------------------------------------------------------------
# Step 7 — sanity check (HEAD request, prints status only)
# ---------------------------------------------------------------------------

echo "─── Step 7: HEAD check ──────────────────────────────────────────"
HTTP_STATUS="$(curl -sI -o /dev/null -w '%{http_code}' "$SIGNED_URL")"
case "$HTTP_STATUS" in
  200) echo "  HTTP $HTTP_STATUS  ✓  signed URL works — open it in a browser to stream" ;;
  403) echo "  HTTP $HTTP_STATUS  ✗  CloudFront rejected the signature OR S3 OAC denied" ;;
  404) echo "  HTTP $HTTP_STATUS  ✗  object not found at s3://<bucket>/${S3_KEY}" ;;
  *)   echo "  HTTP $HTTP_STATUS  (unexpected — check 'curl -v' on the URL)" ;;
esac
