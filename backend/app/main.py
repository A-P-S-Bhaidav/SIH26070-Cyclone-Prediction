"""
SIH26070 Cyclone Prediction System — FastAPI Application Entry Point.

This is the main ASGI application that serves:
- REST API endpoints for cyclone analysis data
- SSE streaming for real-time telemetry updates
- Static model inference and demo data serving
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.config import settings

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: load models on startup, cleanup on shutdown."""
    logger.info("🌀 Starting SIH26070 Cyclone Prediction System v%s", settings.APP_VERSION)

    # Load ML models into memory (lazy — only if weight files exist)
    app.state.models_loaded = False
    try:
        from app.services.model_service import ModelService
        app.state.model_service = ModelService()
        await app.state.model_service.initialize()
        app.state.models_loaded = True
        logger.info("✅ ML models loaded successfully")
    except Exception as e:
        logger.warning("⚠️ ML models not loaded (demo mode): %s", str(e))
        app.state.model_service = None

    # Load demo data for dashboard
    try:
        from app.services.demo_data_service import DemoDataService
        app.state.demo_service = DemoDataService()
        await app.state.demo_service.initialize()
        logger.info("✅ Demo data service initialized")
    except Exception as e:
        logger.warning("⚠️ Demo data service not available: %s", str(e))
        app.state.demo_service = None

    logger.info("🚀 System ready — API serving at http://%s:%d", settings.HOST, settings.PORT)
    yield

    # Cleanup
    logger.info("🛑 Shutting down SIH26070 system")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "AI-powered cyclone prediction system for the North Indian Ocean. "
        "Features genesis prediction, intensity estimation, rapid intensification detection, "
        "Dvorak pattern classification, multi-path track forecasting, and probabilistic "
        "landfall risk assessment."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ──────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """System health check endpoint."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "models_loaded": getattr(app.state, "models_loaded", False),
        "demo_mode": app.state.model_service is None,
    }


@app.get("/", tags=["System"])
async def root():
    """API root — system information."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": "Cyclone Prediction AI System for North Indian Ocean",
        "docs": "/docs",
        "endpoints": {
            "cyclones": "/api/v1/cyclones",
            "genesis": "/api/v1/genesis",
            "districts": "/api/v1/districts/risk",
            "stream": "/api/v1/stream/telemetry",
            "verification": "/api/v1/verification",
        },
    }


# ── Register API Routers ─────────────────────────────────────────────
from app.api.routes import cyclone, genesis, stream, verification, districts

app.include_router(cyclone.router, prefix="/api/v1", tags=["Cyclone Analysis"])
app.include_router(genesis.router, prefix="/api/v1", tags=["Genesis Prediction"])
app.include_router(stream.router, prefix="/api/v1", tags=["Real-Time Stream"])
app.include_router(verification.router, prefix="/api/v1", tags=["Verification"])
app.include_router(districts.router, prefix="/api/v1", tags=["District Risk"])


# ── Global Exception Handler ─────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("Unhandled exception: %s", str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "An unexpected error occurred",
        },
    )
