"""End-to-end test of the m3u8 / HLS playback pipeline.

What this test guards against — a non-exhaustive list of regressions that
each cause a real player error like `manifestLoadError`:

  - cf_sign producing a malformed custom-policy URL (signature mismatch
    → CloudFront 403)
  - The known-good test asset disappearing from S3 (404 from CloudFront)
  - The CloudFront /stream/* cache behavior losing its CORS response
    headers policy (browsers silently block hls.js from reading the body)
  - The cache behavior being switched off TrustedKeyGroups (URLs would
    work without signing, then fail post-fix)
  - A peer .ts file not being reachable with the same Policy/Signature
    /Key-Pair-Id query string (custom-policy wildcard regression)
  - The S3 origin returning a wrong content-type (`text/plain` instead
    of application/x-mpegURL — some HLS players strict-check)

How to run from the project root:

    cd svcs/stream-service
    .venv/bin/python -m unittest tests.test_m3u8_pipeline

Requires CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID and
CLOUDFRONT_PRIVATE_KEY_B64 in the env (load via `set -a; source ../../.env;
set +a` first). Skips with a clear message if they're absent so CI without
the secrets doesn't see a hard failure.
"""

from __future__ import annotations

import json
import re
import unittest
import urllib.request
from urllib.error import HTTPError, URLError

import cf_sign

# A known-good HLS asset that lives in the production bucket. Created when
# the m3u8 plumbing first landed; sidecars + 60+ .ts segments. If the asset
# moves or is deleted, update these constants.
TEST_USER_PREFIX = "user_3DDgqxv7HBmwt3pFHt08hg1hqA5"
TEST_FOLDER = "Dani"
TEST_M3U8 = "Elthorn_Dani_cine_3.m3u8"
TEST_ORIGIN = "http://localhost:3000"  # browser-equivalent Origin header


def _request(method: str, url: str, *, headers: dict[str, str] | None = None):
    """Tiny wrapper so we get the Response object even on 4xx/5xx."""
    req = urllib.request.Request(url, method=method, headers=headers or {})
    try:
        return urllib.request.urlopen(req, timeout=15)
    except HTTPError as exc:
        return exc  # has .status / .headers / .read()
    except URLError as exc:
        raise AssertionError(f"network error reaching {url}: {exc}") from exc


@unittest.skipUnless(
    cf_sign.is_configured(),
    "CLOUDFRONT_DOMAIN / KEY_PAIR_ID / PRIVATE_KEY_B64 not set in env",
)
class M3u8PipelineTest(unittest.TestCase):
    """Sign → HEAD manifest → parse → HEAD peer .ts. All four asserted."""

    @classmethod
    def setUpClass(cls):
        cls.allow_prefix = f"{TEST_USER_PREFIX}/{TEST_FOLDER}"
        cls.file_key = f"{cls.allow_prefix}/{TEST_M3U8}"
        cls.url = cf_sign.sign_url_with_path_policy(
            file_s3_key=cls.file_key,
            allow_prefix=cls.allow_prefix,
            expires_in=300,
        )
        if not cls.url:
            raise unittest.SkipTest("cf_sign returned None — bad config")

    # 1. structural — cheap to run, catches signing-format regressions before
    #    we hit the network
    def test_signed_url_carries_required_query_params(self):
        self.assertIn("Policy=", self.url)
        self.assertIn("Signature=", self.url)
        self.assertIn("Key-Pair-Id=", self.url)
        self.assertNotIn(
            "Expires=",
            self.url,
            msg="Custom-policy URL must NOT include Expires — that's canned-policy",
        )

    def test_policy_resource_uses_wildcard(self):
        # The whole point of custom policy is that the same signature
        # works for peer files. If the policy's Resource is a fixed URL
        # (not a wildcard), .ts segment requests would fail.
        # CloudFront's URL-safe base64 alphabet: + / = → - ~ _
        # So decoding maps - → +, ~ → /, _ → =. (Easy to swap by accident.)
        m = re.search(r"Policy=([^&]+)", self.url)
        assert m
        b64 = m.group(1).translate(str.maketrans("-~_", "+/="))
        import base64

        policy = json.loads(base64.b64decode(b64))
        resource = policy["Statement"][0]["Resource"]
        self.assertTrue(
            resource.endswith("/*"),
            msg=f"expected wildcard Resource, got {resource!r}",
        )

    # 2. manifest — the file the player loads first
    def test_manifest_returns_200_with_cors(self):
        resp = _request("GET", self.url, headers={"Origin": TEST_ORIGIN})
        self.assertEqual(resp.status, 200, msg=f"manifest GET → {resp.status}")
        self.assertEqual(
            resp.headers.get("access-control-allow-origin"),
            "*",
            msg=(
                "manifest is missing access-control-allow-origin — hls.js "
                "will report manifestLoadError. Re-attach the SimpleCORS "
                "ResponseHeadersPolicy on /stream/* and invalidate."
            ),
        )
        ctype = resp.headers.get("content-type", "")
        self.assertIn("mpegurl", ctype.lower())

    def test_manifest_body_is_valid_hls(self):
        resp = _request("GET", self.url, headers={"Origin": TEST_ORIGIN})
        body = resp.read().decode("utf-8", errors="replace")
        self.assertTrue(body.startswith("#EXTM3U"), msg=body[:200])
        self.assertIn("#EXTINF", body)
        # At least one peer segment referenced
        peers = re.findall(r"^([\w./-]+\.ts)\s*$", body, flags=re.MULTILINE)
        self.assertGreater(len(peers), 0, msg="no .ts peers in manifest")

    # 3. peer segment — proves the wildcard policy actually works for siblings
    def test_first_peer_ts_loads_with_reused_query(self):
        manifest = _request("GET", self.url, headers={"Origin": TEST_ORIGIN}).read().decode("utf-8", errors="replace")
        peers = re.findall(r"^([\w./-]+\.ts)\s*$", manifest, flags=re.MULTILINE)
        first_peer = peers[0]
        # Build the .ts URL by swapping the manifest filename for the peer
        # while keeping the query string intact — this mimics what hls.js's
        # URL resolution does, except hls.js then loses the query string
        # which our AuthLoader re-attaches.
        ts_url = self.url.replace(TEST_M3U8, first_peer)
        resp = _request(
            "GET",
            ts_url,
            headers={"Origin": TEST_ORIGIN, "Range": "bytes=0-1023"},
        )
        self.assertIn(
            resp.status,
            (200, 206),
            msg=f"peer {first_peer} → {resp.status} (signature reuse broken? policy not wildcard?)",
        )
        self.assertEqual(
            resp.headers.get("access-control-allow-origin"),
            "*",
            msg="peer .ts missing CORS — hls.js can read but not feed MSE buffer",
        )
        self.assertEqual(resp.headers.get("content-type"), "video/MP2T")


class LocalBackendIntegrationTest(unittest.TestCase):
    """If a local uvicorn is running on 127.0.0.1:8000, additionally verify
    the integrated path: /api/test_m3u8 → URL → CloudFront. Skips silently
    when the local backend isn't up (so this test still works in CI)."""

    LOCAL_URL = "http://127.0.0.1:8000/api/test_m3u8"

    @classmethod
    def setUpClass(cls):
        try:
            with urllib.request.urlopen(cls.LOCAL_URL, timeout=2) as resp:
                cls.body = json.loads(resp.read())
        except (URLError, OSError):
            raise unittest.SkipTest("local backend not running on :8000")

    def test_local_endpoint_returns_signed_cloudfront_url(self):
        url = self.body.get("url", "")
        self.assertTrue(url.startswith("https://"), msg=f"non-https URL: {url[:80]}")
        self.assertIn("cloudfront.net/stream/", url)
        self.assertIn("Policy=", url)
        self.assertIn("Signature=", url)

    def test_url_from_local_backend_actually_loads(self):
        # End-to-end: the URL that the local backend HANDS TO THE FRONTEND
        # must successfully load through CloudFront with CORS. If this
        # passes, any remaining playback issue is browser-side state
        # (HTTP cache, service worker, extension).
        resp = _request("GET", self.body["url"], headers={"Origin": TEST_ORIGIN})
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.headers.get("access-control-allow-origin"), "*")


if __name__ == "__main__":
    unittest.main(verbosity=2)
