"""
Application configuration using Pydantic Settings.
Loads from environment variables / .env file.
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Global application settings."""

    # Application
    APP_NAME: str = "SIH26070 Cyclone Prediction System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",       # Vite dev server
        "http://localhost:3000",
        "https://*.vercel.app",        # Vercel deployments
    ]

    # Model Paths
    MODEL_DIR: str = os.path.join(os.path.dirname(__file__), "..", "weights")
    GENESIS_MODEL_PATH: Optional[str] = None
    CYCLONE_MODEL_PATH: Optional[str] = None
    XGBOOST_MODEL_PATH: Optional[str] = None

    # Data Paths
    DATA_DIR: str = os.path.join(os.path.dirname(__file__), "..", "..", "data")
    IBTRACS_PATH: Optional[str] = None
    DISTRICT_GEOJSON_PATH: Optional[str] = None

    # External APIs
    CDS_API_KEY: Optional[str] = None
    CDS_API_URL: str = "https://cds.climate.copernicus.eu/api"

    # Redis (optional, for production async tasks)
    REDIS_URL: Optional[str] = None

    # Inference
    MC_DROPOUT_SAMPLES: int = 30
    ANALOG_ENSEMBLE_K: int = 10
    INFERENCE_DEVICE: str = "cpu"  # "cuda" for GPU

    # Region of Interest (Bay of Bengal + Arabian Sea)
    ROI_LAT_MIN: float = 0.0
    ROI_LAT_MAX: float = 30.0
    ROI_LON_MIN: float = 60.0
    ROI_LON_MAX: float = 100.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
