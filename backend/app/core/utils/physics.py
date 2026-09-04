"""
Physics computations for cyclone analysis.

Implements meteorological formulas used throughout the pipeline:
- Wind-Pressure Relationship (WPR) for North Indian Ocean
- Maximum Potential Intensity (MPI)
- Beta drift for track persistence
- Steering flow computation
- Genesis Potential Index (GPI) — Tippett et al. 2011
- Anomaly field computation
- SST spatial gradient
"""

import numpy as np
from typing import Tuple, Optional


def wind_pressure_relationship(vmax_kt: float) -> float:
    """
    Estimate MSLP from Vmax using NIO basin approximation.
    
    Formula: MSLP = 1010 - (Vmax / 6.3)^2
    
    Args:
        vmax_kt: Maximum sustained wind speed in knots
    Returns:
        Estimated minimum sea-level pressure in hPa
    """
    return 1010.0 - (vmax_kt / 6.3) ** 2


def maximum_potential_intensity(sst_celsius: float) -> float:
    """
    Estimate Maximum Potential Intensity using simplified Kerry Emanuel formula.
    
    Vpot ≈ A * sqrt(SST - SST_threshold) where SST_threshold ≈ 26.5°C
    
    Args:
        sst_celsius: Sea surface temperature in Celsius
    Returns:
        Maximum potential intensity in knots
    """
    SST_THRESHOLD = 26.5  # °C — minimum SST for cyclone maintenance
    A = 28.2  # Empirical constant for NIO basin

    if sst_celsius <= SST_THRESHOLD:
        return 0.0

    return A * np.sqrt(sst_celsius - SST_THRESHOLD)


def beta_drift(lat: float, lead_time_hours: float) -> Tuple[float, float]:
    """
    Compute beta-drift displacement (poleward and westward tendency).
    
    Cyclones drift poleward and westward due to Earth's curvature (beta-effect).
    Computed from IBTrACS climatological statistics for NIO basin.
    
    Args:
        lat: Current latitude in degrees
        lead_time_hours: Forecast lead time in hours
    Returns:
        (dlat, dlon) displacement in degrees
    """
    # Climatological beta drift rates for NIO (degrees per hour)
    # Poleward component increases with latitude
    beta_lat_rate = 0.02 + 0.001 * abs(lat)  # deg/hour northward
    beta_lon_rate = -0.015  # deg/hour westward

    dlat = beta_lat_rate * lead_time_hours
    dlon = beta_lon_rate * lead_time_hours

    return dlat, dlon


def steering_flow(
    u_850: np.ndarray,
    v_850: np.ndarray,
    u_200: np.ndarray,
    v_200: np.ndarray,
    lat_grid: np.ndarray,
    lon_grid: np.ndarray,
    center_lat: float,
    center_lon: float,
    radius_deg: float = 5.0,
) -> Tuple[float, float]:
    """
    Compute deep-layer mean steering flow.
    
    The steering flow is the pressure-weighted average wind between
    850 and 200 hPa within a radius around the cyclone center.
    
    Args:
        u_850, v_850: 850 hPa wind components (2D grids)
        u_200, v_200: 200 hPa wind components (2D grids)
        lat_grid, lon_grid: Coordinate grids
        center_lat, center_lon: Cyclone center position
        radius_deg: Averaging radius in degrees
    Returns:
        (u_steer, v_steer) steering wind components in m/s
    """
    # Create circular mask
    dist = np.sqrt((lat_grid - center_lat) ** 2 + (lon_grid - center_lon) ** 2)
    mask = dist <= radius_deg

    if not np.any(mask):
        # Fallback: use nearest grid point
        idx = np.unravel_index(np.argmin(dist), dist.shape)
        u_dlm = 0.7 * u_850[idx] + 0.3 * u_200[idx]
        v_dlm = 0.7 * v_850[idx] + 0.3 * v_200[idx]
        return float(u_dlm), float(v_dlm)

    # Deep-layer mean (weight: 70% low-level, 30% upper-level)
    u_dlm = 0.7 * np.mean(u_850[mask]) + 0.3 * np.mean(u_200[mask])
    v_dlm = 0.7 * np.mean(v_850[mask]) + 0.3 * np.mean(v_200[mask])

    return float(u_dlm), float(v_dlm)


def genesis_potential_index(
    vorticity_850: np.ndarray,
    humidity_600: np.ndarray,
    sst: np.ndarray,
    vshear: np.ndarray,
) -> np.ndarray:
    """
    Compute Genesis Potential Index (Tippett et al. 2011).
    
    GPI = |η|^3 × H^3 × (Vpot/70)^3 × (1 + 0.1 × Vshear)^(-2)
    
    Args:
        vorticity_850: 850 hPa absolute vorticity (s^-1), 2D grid
        humidity_600: 600 hPa relative humidity (fraction 0-1), 2D grid
        sst: Sea surface temperature (°C), 2D grid
        vshear: 200-850 hPa vertical wind shear magnitude (m/s), 2D grid
    Returns:
        GPI field (2D grid, non-negative)
    """
    # Absolute vorticity term
    eta = np.abs(vorticity_850)
    eta_term = eta ** 3

    # Humidity term (ensure positive)
    H = np.clip(humidity_600, 0.0, 1.0)
    h_term = H ** 3

    # Maximum potential intensity term
    vpot = np.vectorize(maximum_potential_intensity)(sst)
    vpot_term = (vpot / 70.0) ** 3

    # Shear term (inhibiting factor)
    vshear_clipped = np.clip(vshear, 0.0, 50.0)  # Cap extreme shear
    shear_term = (1.0 + 0.1 * vshear_clipped) ** (-2)

    gpi = eta_term * h_term * vpot_term * shear_term

    # Mask where SST < 26.5°C (no genesis possible)
    gpi[sst < 26.5] = 0.0

    return np.clip(gpi, 0.0, None)


def compute_anomaly(
    field: np.ndarray, climatology: np.ndarray
) -> np.ndarray:
    """
    Compute anomaly field by subtracting climatological mean.
    
    anomaly = field - climatology
    
    Args:
        field: Current state variable (2D or 3D array)
        climatology: Monthly climatological mean (same shape)
    Returns:
        Anomaly field
    """
    return field - climatology


def sst_gradient(sst_field: np.ndarray) -> np.ndarray:
    """
    Compute SST spatial gradient magnitude.
    
    Captures warm pool boundaries critical for track deflection.
    
    Args:
        sst_field: 2D SST field
    Returns:
        Gradient magnitude field (same shape)
    """
    grad_y, grad_x = np.gradient(sst_field)
    return np.sqrt(grad_x ** 2 + grad_y ** 2)


def haversine_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """
    Compute great-circle distance between two points in km.
    
    Args:
        lat1, lon1: First point coordinates (degrees)
        lat2, lon2: Second point coordinates (degrees)
    Returns:
        Distance in kilometers
    """
    R = 6371.0  # Earth's radius in km

    lat1_r, lat2_r = np.radians(lat1), np.radians(lat2)
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)

    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

    return R * c


def vmax_to_imd_category(vmax_kt: float) -> str:
    """
    Convert Vmax (knots) to IMD cyclone category.
    
    IMD Classification:
    - TD: < 34 kt
    - TS: 34-47 kt (not official IMD, used for consistency)
    - CS: 34-47 kt
    - SCS: 48-63 kt
    - VSCS: 64-89 kt
    - ESCS: 90-119 kt
    - SuCS: >= 120 kt
    """
    if vmax_kt < 34:
        return "TD"
    elif vmax_kt < 48:
        return "CS"
    elif vmax_kt < 64:
        return "SCS"
    elif vmax_kt < 90:
        return "VSCS"
    elif vmax_kt < 120:
        return "ESCS"
    else:
        return "SuCS"
