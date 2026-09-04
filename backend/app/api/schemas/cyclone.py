"""
Pydantic v2 response schemas for the Cyclone Prediction API.

These schemas define the exact shape of all API responses,
enabling automatic OpenAPI documentation and TypeScript type generation.
"""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime


# ── Enums ─────────────────────────────────────────────────────────────

class IMDCategory(str, Enum):
    """IMD Tropical Cyclone classification categories."""
    TD = "Tropical Depression"
    TS = "Tropical Storm"
    CS = "Cyclonic Storm"
    SCS = "Severe Cyclonic Storm"
    VSCS = "Very Severe Cyclonic Storm"
    ESCS = "Extremely Severe Cyclonic Storm"
    SuCS = "Super Cyclonic Storm"


class DvorakPattern(str, Enum):
    """Dvorak cloud pattern classification."""
    PRE_ORG = "Pre-organization"
    BANDING = "Banding Feature"
    CDO = "Central Dense Overcast"
    EYE = "Eye"
    DETERIORATING = "Deteriorating"
    SHEAR = "Shear Pattern"


class AlertLevel(str, Enum):
    """Alert severity levels."""
    LOW = "LOW"
    MODERATE = "MODERATE"
    ELEVATED = "ELEVATED"
    HIGH = "HIGH"
    EXTREME = "EXTREME"


# ── Core Data Models ──────────────────────────────────────────────────

class GeoPoint(BaseModel):
    """Geographic coordinate point."""
    lat: float = Field(..., ge=-90, le=90, description="Latitude in degrees")
    lon: float = Field(..., ge=-180, le=360, description="Longitude in degrees")


class UncertainValue(BaseModel):
    """A value with MC Dropout uncertainty bounds."""
    mean: float = Field(..., description="Mean prediction")
    std: float = Field(..., description="Standard deviation (uncertainty)")
    lower: float = Field(..., description="Lower bound (mean - 2*std)")
    upper: float = Field(..., description="Upper bound (mean + 2*std)")


class TrackPoint(BaseModel):
    """A single point in a track forecast."""
    lead_time_hours: int = Field(..., description="Lead time in hours")
    position: GeoPoint
    vmax_kt: Optional[float] = None
    mslp_hpa: Optional[float] = None


class EnsembleTrack(BaseModel):
    """A single ensemble member track."""
    track_id: int
    method: str = Field(..., description="Track method: CLIPER, NWP, ANALOG_n, MOS")
    points: list[TrackPoint]


class KDEConeContour(BaseModel):
    """KDE probability cone contour at a specific lead time."""
    lead_time_hours: int
    probability_level: float = Field(..., description="Probability mass level (0.5, 0.75, 0.9)")
    coordinates: list[list[float]] = Field(..., description="Polygon coordinates [[lon, lat], ...]")


class DistrictRisk(BaseModel):
    """Landfall probability for a coastal district."""
    district_name: str
    state: str
    landfall_probability: float = Field(..., ge=0, le=1)
    wind_risk_category: Optional[str] = None
    population_at_risk: Optional[int] = None


# ── Main API Response Models ──────────────────────────────────────────

class IntensityEstimate(BaseModel):
    """Current intensity estimation with uncertainty."""
    vmax_kt: UncertainValue = Field(..., description="Maximum sustained wind speed (knots)")
    mslp_hpa: UncertainValue = Field(..., description="Minimum sea-level pressure (hPa)")
    category: IMDCategory
    category_confidence: float = Field(..., ge=0, le=1)
    category_probabilities: dict[str, float] = Field(
        ..., description="Probability for each IMD category"
    )


class RapidIntensification(BaseModel):
    """Rapid intensification assessment."""
    probability: UncertainValue = Field(
        ..., description="P(ΔVmax ≥ 35kt in next 24h)"
    )
    alert_level: AlertLevel
    contributing_factors: dict[str, float] = Field(
        ..., description="Key physical factors: OHC, VWS, CDO_roundness, etc."
    )


class DvorakAnalysis(BaseModel):
    """Dvorak technique analysis output."""
    pattern: DvorakPattern
    pattern_confidence: float = Field(..., ge=0, le=1)
    pattern_probabilities: dict[str, float]
    t_number: UncertainValue = Field(..., description="Dvorak T-number [1.0-8.0]")
    segmentation_url: Optional[str] = Field(
        None, description="URL to segmentation overlay image"
    )


class TrackForecast(BaseModel):
    """Complete track forecast with uncertainty cone."""
    primary_track: list[TrackPoint] = Field(
        ..., description="Best-estimate track (MOS-corrected NWP steering)"
    )
    ensemble_tracks: list[EnsembleTrack]
    kde_cone: list[KDEConeContour]
    cliper_track: list[TrackPoint]
    landfall_risk: list[DistrictRisk]


class GenesisZone(BaseModel):
    """A detected potential genesis zone."""
    center: GeoPoint
    peak_probability: float = Field(..., ge=0, le=1)
    area_km2: float
    lead_time_hours: int = Field(..., description="24, 48, or 72 hours")


class GenesisMap(BaseModel):
    """Genesis prediction output."""
    timestamp: datetime
    zones: list[GenesisZone]
    probability_grid: Optional[dict] = Field(
        None, description="Grid data for heatmap visualization"
    )


class VerificationMetrics(BaseModel):
    """System performance verification metrics."""
    track_mae_24h_km: float
    track_mae_48h_km: float
    intensity_mae_kt: float
    intensity_bias_kt: float
    ri_brier_skill_score: float
    genesis_brier_skill_score: float
    cone_capture_rate_90pct: float
    sample_count: int


class CycloneBulletin(BaseModel):
    """Complete cyclone analysis bulletin — the unified output."""
    storm_id: str
    storm_name: Optional[str] = None
    basin: str = Field(default="NIO", description="North Indian Ocean")
    timestamp: datetime
    position: GeoPoint
    intensity: IntensityEstimate
    rapid_intensification: RapidIntensification
    dvorak: DvorakAnalysis
    track: TrackForecast
    genesis_context: Optional[GenesisMap] = None
    gradcam_url: Optional[str] = None
    bulletin_text: str = Field(..., description="Human-readable text bulletin")


class CycloneListItem(BaseModel):
    """Brief cyclone info for listing."""
    storm_id: str
    storm_name: Optional[str] = None
    current_position: GeoPoint
    current_vmax_kt: float
    current_category: IMDCategory
    is_active: bool
    last_update: datetime


# ── SSE Event Models ──────────────────────────────────────────────────

class TelemetryEvent(BaseModel):
    """Real-time telemetry SSE event payload."""
    event_type: str = Field(..., description="cyclone_telemetry | track_update | ri_alert | genesis_update")
    storm_id: Optional[str] = None
    timestamp: datetime
    data: dict
