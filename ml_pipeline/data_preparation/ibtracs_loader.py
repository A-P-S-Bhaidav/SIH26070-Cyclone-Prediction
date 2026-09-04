"""
IBTrACS Data Loader — North Indian Ocean cyclone tracks.

Downloads and parses IBTrACS (International Best Track Archive for
Climate Stewardship) data for NIO basin cyclones 1990–2024.
"""

import numpy as np
import pandas as pd
from typing import Optional, Tuple
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def download_ibtracs_nio(
    output_dir: str = "data/raw/ibtracs",
    use_cached: bool = True,
) -> pd.DataFrame:
    """
    Download IBTrACS NIO basin data.
    
    Args:
        output_dir: Directory to save/cache the data
        use_cached: Use cached version if available
    Returns:
        DataFrame with NIO cyclone tracks
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    cache_file = output_path / "ibtracs_nio.csv"

    if use_cached and cache_file.exists():
        logger.info("Loading cached IBTrACS NIO data from %s", cache_file)
        return pd.read_csv(cache_file, parse_dates=["ISO_TIME"])

    # IBTrACS CSV URL for NIO basin
    url = "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.NI.list.v04r01.csv"

    logger.info("Downloading IBTrACS NIO data from %s", url)
    try:
        df = pd.read_csv(
            url,
            skiprows=[1],  # Skip units row
            na_values=[" ", ""],
            low_memory=False,
        )
        df.to_csv(cache_file, index=False)
        logger.info("Saved IBTrACS data to %s (%d rows)", cache_file, len(df))
    except Exception as e:
        logger.error("Failed to download IBTrACS: %s", e)
        # Return empty DataFrame with expected columns
        df = pd.DataFrame(columns=[
            "SID", "ISO_TIME", "LAT", "LON", "WMO_WIND", "WMO_PRES",
            "USA_WIND", "USA_PRES", "BASIN", "NAME",
        ])

    return df


def parse_ibtracs(raw_df: pd.DataFrame) -> pd.DataFrame:
    """
    Parse IBTrACS raw DataFrame into clean format.
    
    Args:
        raw_df: Raw IBTrACS DataFrame
    Returns:
        Cleaned DataFrame with columns:
        storm_id, timestamp, lat, lon, vmax_kt, mslp_hpa, category, name
    """
    df = raw_df.copy()

    # Rename and select columns
    column_map = {
        "SID": "storm_id",
        "ISO_TIME": "timestamp",
        "LAT": "lat",
        "LON": "lon",
        "NAME": "name",
    }

    # Use WMO wind/pressure with USA as fallback
    if "WMO_WIND" in df.columns:
        df["vmax_kt"] = pd.to_numeric(df["WMO_WIND"], errors="coerce")
        if "USA_WIND" in df.columns:
            usa_wind = pd.to_numeric(df["USA_WIND"], errors="coerce")
            df["vmax_kt"] = df["vmax_kt"].fillna(usa_wind)
    elif "USA_WIND" in df.columns:
        df["vmax_kt"] = pd.to_numeric(df["USA_WIND"], errors="coerce")

    if "WMO_PRES" in df.columns:
        df["mslp_hpa"] = pd.to_numeric(df["WMO_PRES"], errors="coerce")
        if "USA_PRES" in df.columns:
            usa_pres = pd.to_numeric(df["USA_PRES"], errors="coerce")
            df["mslp_hpa"] = df["mslp_hpa"].fillna(usa_pres)
    elif "USA_PRES" in df.columns:
        df["mslp_hpa"] = pd.to_numeric(df["USA_PRES"], errors="coerce")

    df = df.rename(columns=column_map)

    # Parse coordinates
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")

    # Parse timestamp
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    # Add IMD category
    df["category"] = df["vmax_kt"].apply(_vmax_to_category)

    # Select and clean
    cols = ["storm_id", "timestamp", "lat", "lon", "vmax_kt", "mslp_hpa", "category", "name"]
    df = df[[c for c in cols if c in df.columns]].dropna(subset=["lat", "lon", "timestamp"])

    # Sort chronologically
    df = df.sort_values(["storm_id", "timestamp"]).reset_index(drop=True)

    logger.info("Parsed %d track points for %d unique storms",
                len(df), df["storm_id"].nunique())
    return df


def compute_ri_labels(track_df: pd.DataFrame) -> pd.DataFrame:
    """
    Add Rapid Intensification binary labels.
    
    RI = True if ΔVmax ≥ 35kt in the next 24 hours.
    
    Args:
        track_df: Parsed IBTrACS DataFrame
    Returns:
        DataFrame with added 'ri_label' column
    """
    df = track_df.copy()
    df["ri_label"] = 0

    for storm_id, group in df.groupby("storm_id"):
        group = group.sort_values("timestamp")
        for idx, row in group.iterrows():
            # Look 24h ahead
            future_mask = (
                (group["timestamp"] > row["timestamp"]) &
                (group["timestamp"] <= row["timestamp"] + pd.Timedelta(hours=24))
            )
            future = group[future_mask]
            if len(future) > 0 and not pd.isna(row["vmax_kt"]):
                max_future_vmax = future["vmax_kt"].max()
                if not pd.isna(max_future_vmax):
                    delta_vmax = max_future_vmax - row["vmax_kt"]
                    if delta_vmax >= 35:
                        df.loc[idx, "ri_label"] = 1

    ri_count = df["ri_label"].sum()
    total = len(df)
    logger.info("RI labels: %d positive (%.1f%%) out of %d samples",
                ri_count, 100 * ri_count / max(total, 1), total)
    return df


def compute_track_displacement(track_df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute displacement vectors for track prediction targets.
    
    Adds dlat_6h, dlon_6h, dlat_12h, dlon_12h, dlat_24h, dlon_24h columns.
    
    Args:
        track_df: Parsed IBTrACS DataFrame
    Returns:
        DataFrame with displacement columns
    """
    df = track_df.copy()
    
    for lead_hours in [6, 12, 24, 48]:
        col_lat = f"dlat_{lead_hours}h"
        col_lon = f"dlon_{lead_hours}h"
        df[col_lat] = np.nan
        df[col_lon] = np.nan

        for storm_id, group in df.groupby("storm_id"):
            group = group.sort_values("timestamp")
            for idx, row in group.iterrows():
                target_time = row["timestamp"] + pd.Timedelta(hours=lead_hours)
                # Find closest future observation
                future = group[
                    (group["timestamp"] >= target_time - pd.Timedelta(hours=1)) &
                    (group["timestamp"] <= target_time + pd.Timedelta(hours=1))
                ]
                if len(future) > 0:
                    closest = future.iloc[0]
                    df.loc[idx, col_lat] = closest["lat"] - row["lat"]
                    df.loc[idx, col_lon] = closest["lon"] - row["lon"]

    return df


def build_analog_library(all_tracks_df: pd.DataFrame) -> dict:
    """
    Pre-compute similarity features for analog ensemble track prediction.
    
    For each 6-hourly observation, stores:
    - Position, intensity, motion vector, month
    - Track deviations at +6/12/24/48h for ensemble perturbation
    
    Args:
        all_tracks_df: Complete IBTrACS DataFrame with displacements
    Returns:
        Dict of {snapshot_id → features_dict}
    """
    library = {}
    
    df = all_tracks_df.copy()
    
    for storm_id, group in df.groupby("storm_id"):
        group = group.sort_values("timestamp")
        
        for i, (idx, row) in enumerate(group.iterrows()):
            if pd.isna(row["vmax_kt"]) or pd.isna(row["lat"]):
                continue
                
            snapshot_id = f"{storm_id}_{i}"
            
            # Motion vector (from previous point)
            dlat, dlon = 0.0, 0.0
            if i > 0:
                prev = group.iloc[i - 1]
                dlat = row["lat"] - prev["lat"]
                dlon = row["lon"] - prev["lon"]
            
            features = {
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "vmax": float(row["vmax_kt"]),
                "dlat": dlat,
                "dlon": dlon,
                "month": row["timestamp"].month if pd.notna(row["timestamp"]) else 6,
            }
            
            # Add track deviations for perturbation
            for lead in [6, 12, 24, 48]:
                col_lat = f"dlat_{lead}h"
                col_lon = f"dlon_{lead}h"
                if col_lat in df.columns and pd.notna(row.get(col_lat)):
                    features[f"dev_{lead}h"] = {
                        "dlat": float(row[col_lat]),
                        "dlon": float(row[col_lon]),
                    }
            
            library[snapshot_id] = features

    logger.info("Built analog library with %d snapshots", len(library))
    return library


def _vmax_to_category(vmax_kt: float) -> str:
    """Convert Vmax to IMD category string."""
    if pd.isna(vmax_kt):
        return "Unknown"
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
