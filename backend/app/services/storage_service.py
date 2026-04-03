import aioboto3
from botocore.config import Config

from app.config import settings


class StorageService:
    def __init__(self):
        self.session = aioboto3.Session()

    def _client(self):
        return self.session.client(
            "s3",
            endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )

    async def upload_file(self, key: str, data: bytes, content_type: str) -> str:
        async with self._client() as client:
            await client.put_object(
                Bucket=settings.MINIO_BUCKET,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        return key

    async def download_file(self, key: str) -> bytes:
        async with self._client() as client:
            response = await client.get_object(
                Bucket=settings.MINIO_BUCKET,
                Key=key,
            )
            body = await response["Body"].read()
        return body

    async def get_presigned_url(self, key: str, expires: int = 3600) -> str:
        async with self._client() as client:
            url = await client.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.MINIO_BUCKET, "Key": key},
                ExpiresIn=expires,
            )
        return url


storage_service = StorageService()
