"""
Dvorak technique pseudo-label generation and utilities.

Generates training labels for the Dvorak-inspired auxiliary supervision
using brightness temperature thresholding and morphological analysis.
"""

import numpy as np
from typing import Tuple, Optional


# Dvorak segmentation class indices
DVORAK_CLASSES = {
    "BACKGROUND": 0,
    "BANDING": 1,
    "CDO": 2,
    "EYEWALL": 3,
    "EYE_CLEAR": 4,
    "EYE_RAGGED": 5,
    "SHEAR": 6,
}

# T-number to Vmax mapping (Dvorak 1984, NIO basin)
T_NUMBER_TO_VMAX = {
    1.0: 25, 1.5: 25, 2.0: 30, 2.5: 35,
    3.0: 45, 3.5: 55, 4.0: 65, 4.5: 77,
    5.0: 90, 5.5: 102, 6.0: 115, 6.5: 127,
    7.0: 140, 7.5: 155, 8.0: 170,
}


def generate_pseudo_labels(
    ir_image: np.ndarray,
    wv_image: Optional[np.ndarray] = None,
    tb_eyewall_threshold: float = 220.0,
    tb_cdo_threshold: float = 240.0,
    tb_eye_warmth: float = 250.0,
) -> np.ndarray:
    """
    Generate Dvorak pseudo-labels from brightness temperature imagery.
    
    Uses thresholding and morphological analysis to create 7-class
    segmentation masks for auxiliary training supervision.
    
    Args:
        ir_image: IR brightness temperature image (K), shape (H, W)
        wv_image: Water vapour brightness temperature (K), optional
        tb_eyewall_threshold: TB below this → eyewall/CDO candidate
        tb_cdo_threshold: TB below this → CDO region
        tb_eye_warmth: TB above this within CDO → eye candidate
    Returns:
        Pseudo-label mask, shape (H, W), values 0-6
    """
    H, W = ir_image.shape
    labels = np.zeros((H, W), dtype=np.int64)

    # Step 1: Identify cold cloud regions (potential CDO/eyewall)
    cold_mask = ir_image < tb_cdo_threshold  # CDO candidates
    very_cold_mask = ir_image < tb_eyewall_threshold  # Eyewall candidates

    # Step 2: Find the densest cold region (CDO)
    if np.any(cold_mask):
        # Use connected component analysis
        from scipy import ndimage
        labeled_cold, n_features = ndimage.label(cold_mask)

        if n_features > 0:
            # Find largest connected cold region = CDO
            component_sizes = ndimage.sum(cold_mask, labeled_cold, range(1, n_features + 1))
            largest_component = np.argmax(component_sizes) + 1
            cdo_mask = labeled_cold == largest_component

            labels[cdo_mask] = DVORAK_CLASSES["CDO"]

            # Step 3: Within CDO, find eyewall (very cold ring)
            eyewall_in_cdo = cdo_mask & very_cold_mask
            labels[eyewall_in_cdo] = DVORAK_CLASSES["EYEWALL"]

            # Step 4: Find eye — warm region inside CDO
            cdo_center_y, cdo_center_x = ndimage.center_of_mass(cdo_mask)
            cdo_center_y, cdo_center_x = int(cdo_center_y), int(cdo_center_x)

            # Search for warm core within center region
            search_radius = max(H, W) // 8
            y_min = max(0, cdo_center_y - search_radius)
            y_max = min(H, cdo_center_y + search_radius)
            x_min = max(0, cdo_center_x - search_radius)
            x_max = min(W, cdo_center_x + search_radius)

            center_region = ir_image[y_min:y_max, x_min:x_max]
            warm_in_center = center_region > tb_eye_warmth

            if np.any(warm_in_center):
                # Eye detected — check if it's clear or ragged
                warm_fraction = np.sum(warm_in_center) / warm_in_center.size

                eye_label_region = np.zeros_like(center_region, dtype=np.int64)
                if warm_fraction > 0.3:
                    eye_label_region[warm_in_center] = DVORAK_CLASSES["EYE_CLEAR"]
                else:
                    eye_label_region[warm_in_center] = DVORAK_CLASSES["EYE_RAGGED"]

                labels[y_min:y_max, x_min:x_max] = np.where(
                    eye_label_region > 0, eye_label_region,
                    labels[y_min:y_max, x_min:x_max]
                )

    # Step 5: Banding features — cold clouds outside CDO
    banding_candidates = cold_mask & (labels == DVORAK_CLASSES["BACKGROUND"])
    labels[banding_candidates] = DVORAK_CLASSES["BANDING"]

    # Step 6: Shear pattern detection (asymmetric cold cloud distribution)
    if wv_image is not None:
        _detect_shear_pattern(labels, ir_image, wv_image)

    return labels


def _detect_shear_pattern(
    labels: np.ndarray,
    ir_image: np.ndarray,
    wv_image: np.ndarray,
) -> None:
    """
    Detect shear pattern by checking asymmetry of cold cloud distribution.
    Modifies labels in-place.
    """
    H, W = ir_image.shape
    center_y, center_x = H // 2, W // 2

    # Split into quadrants and check asymmetry
    cold_mask = ir_image < 240.0
    quadrants = [
        cold_mask[:center_y, :center_x],  # NW
        cold_mask[:center_y, center_x:],  # NE
        cold_mask[center_y:, :center_x],  # SW
        cold_mask[center_y:, center_x:],  # SE
    ]

    fractions = [np.mean(q) if q.size > 0 else 0 for q in quadrants]

    # High asymmetry indicates shear pattern
    if max(fractions) > 0 and min(fractions) / (max(fractions) + 1e-8) < 0.25:
        # Mark the sparse quadrants as shear
        for i, (q_frac, q_slice) in enumerate(zip(fractions, [
            (slice(None, center_y), slice(None, center_x)),
            (slice(None, center_y), slice(center_x, None)),
            (slice(center_y, None), slice(None, center_x)),
            (slice(center_y, None), slice(center_x, None)),
        ])):
            if q_frac < 0.1:
                region = labels[q_slice]
                region[region == DVORAK_CLASSES["BACKGROUND"]] = DVORAK_CLASSES["SHEAR"]


def compute_t_number(vmax_kt: float) -> float:
    """
    Convert Vmax (knots) to Dvorak T-number.
    
    Uses inverse lookup of the Dvorak T-number to Vmax table.
    
    Args:
        vmax_kt: Maximum sustained wind speed in knots
    Returns:
        T-number in range [1.0, 8.0]
    """
    t_numbers = sorted(T_NUMBER_TO_VMAX.keys())

    if vmax_kt <= T_NUMBER_TO_VMAX[t_numbers[0]]:
        return t_numbers[0]
    if vmax_kt >= T_NUMBER_TO_VMAX[t_numbers[-1]]:
        return t_numbers[-1]

    # Linear interpolation
    for i in range(len(t_numbers) - 1):
        t_low, t_high = t_numbers[i], t_numbers[i + 1]
        v_low, v_high = T_NUMBER_TO_VMAX[t_low], T_NUMBER_TO_VMAX[t_high]
        if v_low <= vmax_kt <= v_high:
            frac = (vmax_kt - v_low) / (v_high - v_low) if v_high > v_low else 0
            return t_low + frac * (t_high - t_low)

    return 4.0  # Fallback


def cdo_roundness_score(segmentation_mask: np.ndarray) -> float:
    """
    Compute CDO roundness metric from segmentation mask.
    
    Roundness = 4π × Area / Perimeter² — 1.0 for perfect circle.
    
    Args:
        segmentation_mask: (H, W) integer mask with Dvorak classes
    Returns:
        Roundness score in [0, 1]
    """
    cdo_mask = (segmentation_mask == DVORAK_CLASSES["CDO"]) | \
               (segmentation_mask == DVORAK_CLASSES["EYEWALL"])

    if not np.any(cdo_mask):
        return 0.0

    area = np.sum(cdo_mask)

    # Compute perimeter using edge detection
    from scipy import ndimage
    eroded = ndimage.binary_erosion(cdo_mask)
    perimeter = np.sum(cdo_mask & ~eroded)

    if perimeter == 0:
        return 0.0

    roundness = (4.0 * np.pi * area) / (perimeter ** 2)
    return float(np.clip(roundness, 0.0, 1.0))


def outflow_symmetry_score(wv_image: np.ndarray) -> float:
    """
    Compute outflow symmetry from WV channel.
    
    Uses entropy of upper cloud distribution in quadrants.
    Higher symmetry → better outflow → more organized cyclone.
    
    Args:
        wv_image: Water vapour brightness temperature (K), shape (H, W)
    Returns:
        Symmetry score in [0, 1], 1 = perfectly symmetric outflow
    """
    H, W = wv_image.shape
    cy, cx = H // 2, W // 2

    # Cold WV = moisture/outflow present
    outflow_mask = wv_image < 240.0

    quadrants = [
        outflow_mask[:cy, :cx],
        outflow_mask[:cy, cx:],
        outflow_mask[cy:, :cx],
        outflow_mask[cy:, cx:],
    ]

    fractions = np.array([np.mean(q) if q.size > 0 else 0 for q in quadrants])
    total = fractions.sum()

    if total < 1e-8:
        return 0.0

    probs = fractions / total
    # Entropy-based symmetry: max entropy = uniform distribution = symmetric
    entropy = -np.sum(probs * np.log(probs + 1e-10))
    max_entropy = np.log(4)  # Perfect symmetry across 4 quadrants

    return float(entropy / max_entropy)
