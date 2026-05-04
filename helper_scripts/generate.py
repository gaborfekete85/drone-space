#!/usr/bin/env python3

"""
Usage:
python presign_video.py "user1/2026/slideshow_with_music2.mp4"

Optional:
python presign_video.py "user1/2026/slideshow_with_music2.mp4" --expires 1800
"""

import argparse
import boto3
import webbrowser
from botocore.config import Config
from botocore.exceptions import ClientError


# =========================
# CONFIG
# =========================
REGION = "eu-central-1"
BUCKET = "drones-ch-store-dev-1"


def generate_presigned_url(object_key: str, expires: int = 900) -> str:
    session = boto3.Session()

    s3 = session.client(
        "s3",
        region_name=REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"}
        )
    )

    # Verify object exists first
    s3.head_object(Bucket=BUCKET, Key=object_key)

    # Generate URL
    return s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": BUCKET,
            "Key": object_key
        },
        ExpiresIn=expires,
        HttpMethod="GET"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Generate and open an S3 presigned URL for a private video."
    )

    parser.add_argument(
        "key",
        help="S3 object key, e.g. user1/2026/slideshow_with_music2.mp4"
    )

    parser.add_argument(
        "--expires",
        type=int,
        default=900,
        help="Expiration in seconds (default: 900)"
    )

    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Do not auto-open in browser"
    )

    args = parser.parse_args()

    try:
        url = generate_presigned_url(
            object_key=args.key,
            expires=args.expires
        )

        print("\nPresigned URL:\n")
        print(url)

        if not args.no_open:
            webbrowser.open(url)
            print("\nOpened in browser.")

    except ClientError as e:
        print(f"AWS Error: {e}")

    except Exception as e:
        print(f"Unexpected Error: {e}")


if __name__ == "__main__":
    main()