import boto3
import webbrowser
from botocore.config import Config

REGION = "eu-central-1"
BUCKET = "drones-ch-store-dev-1"
KEY = "user1/2026/slideshow_with_music2.mp4"

session = boto3.Session(profile_name="default")

sts = session.client("sts")
print("AWS identity:", sts.get_caller_identity())

s3 = session.client(
    "s3",
    region_name=REGION,
    config=Config(
        signature_version="s3v4",
        s3={
            "addressing_style": "virtual"
        }
    )
)

print("Checking object...")
s3.head_object(Bucket=BUCKET, Key=KEY)

url = s3.generate_presigned_url(
    ClientMethod="get_object",
    Params={
        "Bucket": BUCKET,
        "Key": KEY
    },
    ExpiresIn=900,
    HttpMethod="GET"
)

print("\nPresigned URL:\n")
print(url)

webbrowser.open(url)