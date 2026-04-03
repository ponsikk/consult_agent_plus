from arq.connections import ArqRedis, RedisSettings, create_pool
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # BYPASS AUTH FOR DEV
    result = await db.execute(select(User).limit(1))
    return result.scalar_one_or_none()


def _parse_redis_settings(redis_url: str) -> RedisSettings:
    """Parse a redis:// URL into arq RedisSettings."""
    # redis://[:password@]host[:port][/db]
    url = redis_url
    if url.startswith("redis://"):
        url = url[len("redis://"):]
    password = None
    if "@" in url:
        password, url = url.rsplit("@", 1)
        if password.startswith(":"):
            password = password[1:]
    db = 0
    if "/" in url:
        url, db_str = url.rsplit("/", 1)
        try:
            db = int(db_str)
        except ValueError:
            db = 0
    host = "localhost"
    port = 6379
    if ":" in url:
        host, port_str = url.rsplit(":", 1)
        try:
            port = int(port_str)
        except ValueError:
            port = 6379
    else:
        host = url

    return RedisSettings(
        host=host,
        port=port,
        password=password,
        database=db,
    )


async def get_arq_pool() -> ArqRedis:
    redis_settings = _parse_redis_settings(settings.REDIS_URL)
    pool = await create_pool(redis_settings)
    return pool
