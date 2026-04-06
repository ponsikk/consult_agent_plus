from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.analyses import router as analyses_router
from app.api.v1.reports import router as reports_router
from app.database import Base, engine
from app.services.storage_service import storage_service

app = FastAPI(title="Цифровой Инспектор API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:80",
        "http://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(analyses_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")


@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await storage_service.ensure_bucket()


@app.get("/")
async def root():
    return {"status": "ok"}
