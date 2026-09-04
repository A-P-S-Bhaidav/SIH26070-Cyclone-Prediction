"""
TCIR Dataset Loader.

Loads and preprocesses the Tropical Cyclone Infrared (TCIR) dataset
for satellite-based cyclone analysis training.

Dataset: HDF5 with (N, 201, 201, 4) satellite matrix and metadata.
"""

import numpy as np
import pandas as pd
from typing import Tuple, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def load_tcir_dataset(
    h5_path: str,
) -> Tuple[np.ndarray, pd.DataFrame]:
    """
    Load TCIR dataset from HDF5 file.
    
    Args:
        h5_path: Path to TCIR HDF5 file
    Returns:
        (matrix, info_df) where matrix is (N, 201, 201, 4)
        and info_df contains metadata for each sample
    """
    try:
        import h5py
    except ImportError:
        logger.error("h5py required for TCIR loading. Install: pip install h5py")
        raise

    logger.info("Loading TCIR dataset from %s", h5_path)
    
    with h5py.File(h5_path, "r") as f:
        # Standard TCIR structure
        matrix = np.array(f["matrix"])  # (N, 201, 201, 4)
        
        # Try to load info DataFrame
        info_dict = {}
        if "info" in f:
            for key in f["info"].keys():
                info_dict[key] = np.array(f["info"][key])
        elif "lat" in f:
            # Alternative structure
            info_dict = {
                "lat": np.array(f["lat"]),
                "lon": np.array(f["lon"]),
                "vmax": np.array(f.get("vmax", np.zeros(matrix.shape[0]))),
                "pmin": np.array(f.get("pmin", np.zeros(matrix.shape[0]))),
            }

    info_df = pd.DataFrame(info_dict)
    logger.info("Loaded TCIR: %d samples, shape %s", len(info_df), matrix.shape)
    return matrix, info_df


def filter_indian_ocean(
    matrix: np.ndarray,
    info_df: pd.DataFrame,
    lat_col: str = "lat",
    lon_col: str = "lon",
) -> Tuple[np.ndarray, pd.DataFrame]:
    """
    Filter TCIR samples to North Indian Ocean basin only.
    
    NIO bounds: 0-30°N, 30-100°E (Bay of Bengal + Arabian Sea)
    
    Args:
        matrix: (N, 201, 201, 4) satellite images
        info_df: Metadata DataFrame
    Returns:
        Filtered (matrix, info_df)
    """
    if lat_col not in info_df.columns or lon_col not in info_df.columns:
        logger.warning("Lat/lon columns not found, returning all data")
        return matrix, info_df

    lat = info_df[lat_col].values
    lon = info_df[lon_col].values

    mask = (lat >= 0) & (lat <= 30) & (lon >= 30) & (lon <= 100)
    
    filtered_matrix = matrix[mask]
    filtered_info = info_df[mask].reset_index(drop=True)
    
    logger.info("Filtered to NIO: %d → %d samples", len(info_df), len(filtered_info))
    return filtered_matrix, filtered_info


def preprocess_channels(
    matrix: np.ndarray,
    ir_min_k: float = 180.0,
    ir_max_k: float = 310.0,
) -> np.ndarray:
    """
    Normalize TCIR satellite channels.
    
    Channel mapping:
        0: IR1 (10.8 μm) — primary thermal channel
        1: IR2 (12.0 μm) — split-window
        2: WV  (6.7 μm)  — water vapour
        3: VIS (0.65 μm)  — visible (daytime only)
    
    Normalization:
        IR: (TB - min) / (max - min) → [0, 1]
        WV: (TB - 200) / (280 - 200) → [0, 1]
        VIS: raw / 255 → [0, 1] (reflectance)
    
    Args:
        matrix: (N, 201, 201, 4) raw satellite data
        ir_min_k, ir_max_k: IR normalization range
    Returns:
        (N, 201, 201, 4) normalized data in [0, 1]
    """
    result = np.zeros_like(matrix, dtype=np.float32)
    
    # IR channels (0, 1)
    for ch in [0, 1]:
        channel = matrix[:, :, :, ch].astype(np.float32)
        # Handle NaN/missing
        channel = np.nan_to_num(channel, nan=ir_max_k)
        result[:, :, :, ch] = (channel - ir_min_k) / (ir_max_k - ir_min_k)
    
    # WV channel (2)
    wv = matrix[:, :, :, 2].astype(np.float32)
    wv = np.nan_to_num(wv, nan=280.0)
    result[:, :, :, 2] = (wv - 200.0) / (280.0 - 200.0)
    
    # VIS channel (3)
    vis = matrix[:, :, :, 3].astype(np.float32)
    vis = np.nan_to_num(vis, nan=0.0)
    result[:, :, :, 3] = vis / 255.0 if vis.max() > 1.0 else vis
    
    # Clip to [0, 1]
    result = np.clip(result, 0.0, 1.0)
    
    logger.info("Preprocessed %d samples, shape %s", len(result), result.shape)
    return result


def create_training_samples(
    matrix: np.ndarray,
    info_df: pd.DataFrame,
) -> list:
    """
    Create training sample tuples from preprocessed TCIR data.
    
    Each sample: (satellite_tensor, labels_dict)
    satellite_tensor: (4, 201, 201) channels-first
    labels: {vmax_kt, mslp_hpa, category_idx}
    
    Args:
        matrix: (N, 201, 201, 4) normalized satellite data
        info_df: Metadata with vmax, pmin columns
    Returns:
        List of (tensor, labels) tuples
    """
    samples = []
    
    for i in range(len(matrix)):
        # Convert to channels-first: (4, 201, 201)
        sat_tensor = np.transpose(matrix[i], (2, 0, 1)).astype(np.float32)
        
        row = info_df.iloc[i]
        labels = {
            "vmax_kt": float(row.get("vmax", 0)),
            "mslp_hpa": float(row.get("pmin", 1010)),
        }
        
        # Compute category index
        vmax = labels["vmax_kt"]
        if vmax < 34: labels["category_idx"] = 0  # TD
        elif vmax < 48: labels["category_idx"] = 1  # CS
        elif vmax < 64: labels["category_idx"] = 2  # SCS
        elif vmax < 90: labels["category_idx"] = 3  # VSCS
        elif vmax < 120: labels["category_idx"] = 4  # ESCS
        else: labels["category_idx"] = 5  # SuCS
        
        samples.append((sat_tensor, labels))
    
    logger.info("Created %d training samples", len(samples))
    return samples


def hemispheric_flip(
    matrix: np.ndarray,
    info_df: pd.DataFrame,
    lat_col: str = "lat",
) -> Tuple[np.ndarray, pd.DataFrame]:
    """
    Flip Southern Hemisphere cyclones to Northern Hemisphere convention.
    
    Required because Coriolis effect causes opposite rotation in SH.
    Flips image vertically and negates latitude.
    
    Args:
        matrix: (N, H, W, C) satellite images
        info_df: Metadata with lat column
    Returns:
        (flipped_matrix, updated_info_df) with SH samples flipped
    """
    result = matrix.copy()
    info = info_df.copy()
    
    if lat_col not in info.columns:
        return result, info
    
    sh_mask = info[lat_col] < 0
    n_flipped = sh_mask.sum()
    
    if n_flipped > 0:
        # Vertical flip (latitude axis)
        result[sh_mask] = result[sh_mask, ::-1, :, :]
        # Negate latitude
        info.loc[sh_mask, lat_col] = -info.loc[sh_mask, lat_col]
        logger.info("Flipped %d Southern Hemisphere samples", n_flipped)
    
    return result, info
