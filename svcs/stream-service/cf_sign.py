"""CloudFront signed-URL generator.

Pure-Python port of `scripts/cf_sign.sh`. Used when `STREAM_URL_STRATEGY=cloudfront`
to hand the browser a CDN-cached, signed URL instead of a direct S3 presign.

Configured via:
    CLOUDFRONT_DOMAIN          — e.g. d3blv0il7bwv9e.cloudfront.net
    CLOUDFRONT_KEY_PAIR_ID     — public-key reference uploaded to CloudFront
    CLOUDFRONT_PRIVATE_KEY_B64 — base64-encoded PEM of the matching private key

The distribution has a `/stream/*` cache behavior pointing at the S3 origin
(via OAC). A CloudFront Function strips the `/stream/` prefix before the
request reaches S3, so `https://<domain>/stream/<s3_key>` resolves to the
object at `s3://<bucket>/<s3_key>`.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from typing import Optional

log = logging.getLogger(__name__)

CF_DOMAIN = os.environ.get("CLOUDFRONT_DOMAIN", "").strip()
CF_KEY_PAIR_ID = os.environ.get("CLOUDFRONT_KEY_PAIR_ID", "").strip()
CF_PRIVATE_KEY_B64 = os.environ.get("CLOUDFRONT_PRIVATE_KEY_B64", "").strip()

_private_key = None  # cached after first successful load


def is_configured() -> bool:
    """True only when all three CloudFront env vars are set."""
    return bool(CF_DOMAIN and CF_KEY_PAIR_ID and CF_PRIVATE_KEY_B64)


def _load_private_key():
    """Lazy-load the PEM private key. Raises on failure (caller catches)."""
    global _private_key
    if _private_key is None:
        from cryptography.hazmat.primitives import serialization

        pem_bytes = base64.b64decode(CF_PRIVATE_KEY_B64)
        _private_key = serialization.load_pem_private_key(pem_bytes, password=None)
    return _private_key


def sign_video_url(s3_key: str, expires_in: int = 900) -> Optional[str]:
    """Return a CloudFront-signed URL for the given S3 key, or None on error.

    Uses CloudFront's "canned policy" — the simplest signing model: the URL
    is valid until `expires_in` seconds from now and carries no other
    conditions. CF reconstructs the same policy string at the edge to verify
    the signature, so the JSON formatting must be byte-for-byte identical to
    the spec (no whitespace, fixed key order).
    """
    if not is_configured():
        log.error(
            "cf_sign: not configured (need CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID, "
            "CLOUDFRONT_PRIVATE_KEY_B64)"
        )
        return None
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        log.error("cf_sign: `cryptography` package not installed")
        return None

    resource_url = f"https://{CF_DOMAIN}/stream/{s3_key}"
    expires = int(time.time()) + expires_in
    # Canned policy — fixed JSON shape, no whitespace, key order matters.
    policy = json.dumps(
        {
            "Statement": [
                {
                    "Resource": resource_url,
                    "Condition": {"DateLessThan": {"AWS:EpochTime": expires}},
                }
            ]
        },
        separators=(",", ":"),
    )

    try:
        key = _load_private_key()
        signature = key.sign(policy.encode(), padding.PKCS1v15(), hashes.SHA1())
    except Exception as exc:  # noqa: BLE001 — small surface, just log and bail
        log.error("cf_sign: signing failed: %s", exc)
        return None

    sig_b64 = base64.b64encode(signature).decode()
    # CloudFront's URL-safe alphabet: + / = → - ~ _
    cf_safe = sig_b64.translate(str.maketrans("+/=", "-~_"))
    return (
        f"{resource_url}"
        f"?Expires={expires}"
        f"&Signature={cf_safe}"
        f"&Key-Pair-Id={CF_KEY_PAIR_ID}"
    )


def sign_url_with_path_policy(
    file_s3_key: str, allow_prefix: str, expires_in: int = 900
) -> Optional[str]:
    """Sign a URL with a CUSTOM policy whose Resource is a wildcard path.

    The signed URL points at `file_s3_key`, but the policy allows the same
    Policy/Signature/Key-Pair-Id query string to be reused for any other
    object whose URL matches `<cf_domain>/stream/<allow_prefix>*`. That's
    exactly what HLS playback needs: sign the .m3u8, then re-attach the
    same auth params to every .ts segment under the same folder.

    Returns a URL of the form:
        https://<cf_domain>/stream/<file_s3_key>?Policy=...&Signature=...&Key-Pair-Id=...
    """
    if not is_configured():
        log.error("cf_sign: not configured")
        return None
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        log.error("cf_sign: `cryptography` package not installed")
        return None

    file_url = f"https://{CF_DOMAIN}/stream/{file_s3_key}"
    wildcard_resource = f"https://{CF_DOMAIN}/stream/{allow_prefix.rstrip('/')}/*"
    expires = int(time.time()) + expires_in

    policy = json.dumps(
        {
            "Statement": [
                {
                    "Resource": wildcard_resource,
                    "Condition": {"DateLessThan": {"AWS:EpochTime": expires}},
                }
            ]
        },
        separators=(",", ":"),
    )

    try:
        key = _load_private_key()
        signature = key.sign(policy.encode(), padding.PKCS1v15(), hashes.SHA1())
    except Exception as exc:  # noqa: BLE001
        log.error("cf_sign: signing failed: %s", exc)
        return None

    # Both the policy and the signature go through CloudFront's URL-safe
    # base64 alphabet (+/= → -~_). NO Expires param — the expiry lives
    # inside the policy itself for custom policies.
    cf_alphabet = str.maketrans("+/=", "-~_")
    policy_safe = base64.b64encode(policy.encode()).decode().translate(cf_alphabet)
    sig_safe = base64.b64encode(signature).decode().translate(cf_alphabet)
    return (
        f"{file_url}"
        f"?Policy={policy_safe}"
        f"&Signature={sig_safe}"
        f"&Key-Pair-Id={CF_KEY_PAIR_ID}"
    )


def log_status() -> None:
    """Called at startup so the operator sees the wiring decision."""
    if not is_configured():
        log.info("cf_sign: not configured")
        return
    log.info(
        "cf_sign: enabled domain=%s key_pair_id=%s",
        CF_DOMAIN,
        CF_KEY_PAIR_ID,
    )
