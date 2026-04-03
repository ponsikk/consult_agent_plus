from app.api.v1.auth import router as auth_router
from app.api.v1.analyses import router as analyses_router

__all__ = ["auth_router", "analyses_router"]
