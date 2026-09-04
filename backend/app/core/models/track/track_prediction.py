"""
Track Prediction Pipeline.

Multi-layer track forecasting:
    Layer 1: CLIPER (Climatology + Persistence) baseline
    Layer 2: NWP Steering Flow physical advection
    Layer 3: Analog Ensemble (10 historical similar cases)
    Layer 4: XGBoost MOS bias correction
    + KDE Probabilistic Cone generation
    + Landfall risk assessment
"""

import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field
from scipy.stats import gaussian_kde


@dataclass
class TrackPoint:
    """A single point in a track forecast."""
    lat: float
    lon: float
    lead_time_hours: int
    vmax_kt: Optional[float] = None
    mslp_hpa: Optional[float] = None


@dataclass
class ConeContour:
    """KDE probability cone contour."""
    lead_time_hours: int
    probability_level: float
    coordinates: List[Tuple[float, float]] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════
#  Layer 1: CLIPER Baseline
# ═══════════════════════════════════════════════════════════════════════

class CLIPERTrack:
    """
    Climatology and Persistence baseline track prediction.
    
    Persists current motion vector and adjusts using historical
    climatological beta-drift tendencies for the NIO basin.
    """

    def predict(
        self,
        lat0: float,
        lon0: float,
        lat_6h: float,
        lon_6h: float,
        lead_times: List[int] = None,
    ) -> List[TrackPoint]:
        """
        CLIPER track prediction.
        
        Args:
            lat0, lon0: Current position
            lat_6h, lon_6h: Position 6 hours ago
            lead_times: Forecast hours [6, 12, 24, 36, 48]
        """
        if lead_times is None:
            lead_times = [6, 12, 18, 24, 30, 36, 42, 48]

        # Current motion vector (degrees per hour)
        dlat_dt = (lat0 - lat_6h) / 6.0
        dlon_dt = (lon0 - lon_6h) / 6.0

        track = []
        for t in lead_times:
            # Beta drift: poleward and westward tendency
            beta_lat = (0.02 + 0.001 * abs(lat0)) * t
            beta_lon = -0.015 * t

            lat_t = lat0 + dlat_dt * t + beta_lat
            lon_t = lon0 + dlon_dt * t + beta_lon

            track.append(TrackPoint(lat=lat_t, lon=lon_t, lead_time_hours=t))

        return track


# ═══════════════════════════════════════════════════════════════════════
#  Layer 2: NWP Steering Flow Track
# ═══════════════════════════════════════════════════════════════════════

class NWPSteeringTrack:
    """
    Physics-based track prediction using atmospheric steering flow.
    
    Advects the cyclone along the deep-layer mean wind (850-200 hPa)
    extracted from GFS forecast fields.
    """
    EARTH_RADIUS_KM = 6371.0

    def predict(
        self,
        lat0: float,
        lon0: float,
        u_steer: float,  # m/s
        v_steer: float,  # m/s
        lead_times: List[int] = None,
    ) -> List[TrackPoint]:
        """
        Steering flow track prediction.
        
        Args:
            lat0, lon0: Current position
            u_steer, v_steer: Steering wind components (m/s)
            lead_times: Forecast hours
        """
        if lead_times is None:
            lead_times = [6, 12, 18, 24, 30, 36, 42, 48]

        track = []
        lat_curr, lon_curr = lat0, lon0

        prev_t = 0
        for t in lead_times:
            dt_hours = t - prev_t
            dt_sec = dt_hours * 3600.0

            # Convert wind speed to degree displacement
            dlat = (v_steer * dt_sec) / (self.EARTH_RADIUS_KM * 1000.0) * (180.0 / np.pi)
            dlon = (u_steer * dt_sec) / (
                self.EARTH_RADIUS_KM * 1000.0 * np.cos(np.radians(lat_curr))
            ) * (180.0 / np.pi)

            lat_curr += dlat
            lon_curr += dlon
            prev_t = t

            track.append(TrackPoint(lat=lat_curr, lon=lon_curr, lead_time_hours=t))

        return track


# ═══════════════════════════════════════════════════════════════════════
#  Layer 3: Analog Ensemble
# ═══════════════════════════════════════════════════════════════════════

class AnalogEnsemble:
    """
    Historical analog ensemble for multi-path track generation.
    
    Finds k most similar historical cyclone snapshots and uses their
    track deviations as perturbations to the NWP steering track.
    """

    def __init__(self, analog_library: Optional[Dict] = None, k: int = 10):
        self.k = k
        self.library = analog_library or {}

    def compute_similarity(
        self,
        current: Dict,
        historical: Dict,
        weights: Dict = None,
    ) -> float:
        """
        Compute similarity score between current and historical snapshot.
        
        Features: position, intensity, motion, (optionally steering flow).
        """
        if weights is None:
            weights = {"position": 0.3, "intensity": 0.2, "motion": 0.3, "season": 0.2}

        score = 0.0

        # Position similarity (inverse of distance)
        dist = np.sqrt(
            (current["lat"] - historical["lat"]) ** 2 +
            (current["lon"] - historical["lon"]) ** 2
        )
        score += weights["position"] * np.exp(-dist / 5.0)

        # Intensity similarity
        vmax_diff = abs(current.get("vmax", 50) - historical.get("vmax", 50))
        score += weights["intensity"] * np.exp(-vmax_diff / 20.0)

        # Motion similarity
        if "dlat" in current and "dlat" in historical:
            motion_diff = np.sqrt(
                (current["dlat"] - historical["dlat"]) ** 2 +
                (current["dlon"] - historical["dlon"]) ** 2
            )
            score += weights["motion"] * np.exp(-motion_diff / 0.5)

        # Seasonal similarity
        if "month" in current and "month" in historical:
            month_diff = min(
                abs(current["month"] - historical["month"]),
                12 - abs(current["month"] - historical["month"]),
            )
            score += weights["season"] * np.exp(-month_diff / 2.0)

        return score

    def find_analogs(self, current_state: Dict) -> List[Dict]:
        """Find k most similar historical snapshots."""
        if not self.library:
            return []

        scores = []
        for hist_id, hist_state in self.library.items():
            sim = self.compute_similarity(current_state, hist_state)
            scores.append((sim, hist_id, hist_state))

        scores.sort(reverse=True, key=lambda x: x[0])
        return [s[2] for s in scores[:self.k]]

    def generate_ensemble(
        self,
        nwp_track: List[TrackPoint],
        current_state: Dict,
    ) -> List[List[TrackPoint]]:
        """
        Generate ensemble tracks by perturbing NWP track with analog deviations.
        """
        analogs = self.find_analogs(current_state)

        if not analogs:
            # Fallback: generate random perturbations
            return self._random_perturbations(nwp_track, n=self.k)

        ensemble = []
        for analog in analogs:
            perturbed_track = []
            for point in nwp_track:
                # Get analog's deviation at this lead time
                dev = analog.get(f"dev_{point.lead_time_hours}h", {"dlat": 0, "dlon": 0})
                perturbed_track.append(TrackPoint(
                    lat=point.lat + dev.get("dlat", np.random.normal(0, 0.3)),
                    lon=point.lon + dev.get("dlon", np.random.normal(0, 0.3)),
                    lead_time_hours=point.lead_time_hours,
                ))
            ensemble.append(perturbed_track)

        return ensemble

    def _random_perturbations(
        self, base_track: List[TrackPoint], n: int = 10
    ) -> List[List[TrackPoint]]:
        """Fallback: Gaussian random perturbations scaled by lead time."""
        ensemble = []
        for _ in range(n):
            perturbed = []
            for point in base_track:
                scale = 0.1 + 0.02 * point.lead_time_hours
                perturbed.append(TrackPoint(
                    lat=point.lat + np.random.normal(0, scale),
                    lon=point.lon + np.random.normal(0, scale),
                    lead_time_hours=point.lead_time_hours,
                ))
            ensemble.append(perturbed)
        return ensemble


# ═══════════════════════════════════════════════════════════════════════
#  Layer 4: XGBoost MOS Bias Correction
# ═══════════════════════════════════════════════════════════════════════

class XGBoostMOS:
    """
    Model Output Statistics bias correction using XGBoost.
    
    Corrects systematic track biases (e.g., NWP steering tends to be
    slow in Western Bay of Bengal, CLIPER underpredicts recurvature).
    """

    def __init__(self, model=None):
        self.model = model  # Pre-trained XGBoost model

    def build_features(
        self,
        lat: float, lon: float,
        heading: float, speed: float,
        vmax: float,
        u_steer: float, v_steer: float,
        vws: float, sst: float, ohc: float,
        month: int, basin: int = 0,
        prev_error: float = 0.0,
    ) -> np.ndarray:
        """Build feature vector for XGBoost."""
        return np.array([
            vmax, heading, speed, lat, lon,
            u_steer, v_steer, vws, sst, ohc,
            month, basin, prev_error,
        ])

    def correct(
        self, nwp_track: List[TrackPoint], features: np.ndarray
    ) -> List[TrackPoint]:
        """Apply bias correction to NWP track."""
        if self.model is None:
            return nwp_track  # No correction if model not loaded

        corrected = []
        for point in nwp_track:
            try:
                bias = self.model.predict(features.reshape(1, -1))[0]
                corrected.append(TrackPoint(
                    lat=point.lat + bias[0],
                    lon=point.lon + bias[1],
                    lead_time_hours=point.lead_time_hours,
                ))
            except Exception:
                corrected.append(point)

        return corrected


# ═══════════════════════════════════════════════════════════════════════
#  KDE Probabilistic Cone
# ═══════════════════════════════════════════════════════════════════════

class KDEProbCone:
    """
    Kernel Density Estimation for probabilistic track cone.
    
    Fits 2D KDE on ensemble track positions at each lead time,
    extracting probability contours.
    """

    def generate_cone(
        self,
        ensemble_tracks: List[List[TrackPoint]],
        lead_times: List[int] = None,
        levels: List[float] = None,
        n_grid: int = 100,
    ) -> Dict[int, Dict[float, List[Tuple[float, float]]]]:
        """
        Generate KDE probability cone contours.
        
        Args:
            ensemble_tracks: List of track lists (from analog ensemble)
            lead_times: Hours to compute contours for
            levels: Probability mass levels [0.5, 0.75, 0.9]
            n_grid: KDE evaluation grid resolution
        Returns:
            Dict[lead_time → Dict[level → contour_coordinates]]
        """
        if lead_times is None:
            lead_times = [6, 12, 24, 36, 48]
        if levels is None:
            levels = [0.50, 0.75, 0.90]

        cone = {}
        for t in lead_times:
            positions = []
            for track in ensemble_tracks:
                for point in track:
                    if point.lead_time_hours == t:
                        positions.append([point.lat, point.lon])
                        break

            if len(positions) < 3:
                continue

            positions = np.array(positions)

            try:
                # Fit 2D KDE with bandwidth scaling by lead time
                bandwidth = 0.3 + 0.01 * t  # Grows with lead time
                kde = gaussian_kde(positions.T, bw_method=bandwidth / positions.std())

                # Evaluate on grid
                lat_range = positions[:, 0]
                lon_range = positions[:, 1]
                lat_margin = max(1.0, 0.04 * t)
                lon_margin = max(1.0, 0.04 * t)

                lat_grid = np.linspace(
                    lat_range.min() - lat_margin,
                    lat_range.max() + lat_margin,
                    n_grid,
                )
                lon_grid = np.linspace(
                    lon_range.min() - lon_margin,
                    lon_range.max() + lon_margin,
                    n_grid,
                )
                LAT, LON = np.meshgrid(lat_grid, lon_grid)
                grid_points = np.vstack([LAT.ravel(), LON.ravel()])
                density = kde(grid_points).reshape(n_grid, n_grid)

                # Extract contours at each probability level
                cone[t] = {}
                for level in levels:
                    threshold = self._find_threshold(density, level)
                    contour_coords = self._extract_contour(
                        density, LAT, LON, threshold
                    )
                    cone[t][level] = contour_coords

            except Exception:
                # Fallback: circular cone
                center_lat = positions[:, 0].mean()
                center_lon = positions[:, 1].mean()
                cone[t] = {}
                for level in levels:
                    radius = (1.0 - level) * (0.5 + 0.03 * t)
                    cone[t][level] = self._circle_coords(
                        center_lat, center_lon, radius
                    )

        return cone

    def _find_threshold(self, density: np.ndarray, level: float) -> float:
        """Find density threshold that captures `level` fraction of mass."""
        sorted_d = np.sort(density.ravel())[::-1]
        cumsum = np.cumsum(sorted_d) / sorted_d.sum()
        idx = np.searchsorted(cumsum, level)
        idx = min(idx, len(sorted_d) - 1)
        return sorted_d[idx]

    def _extract_contour(
        self,
        density: np.ndarray,
        LAT: np.ndarray,
        LON: np.ndarray,
        threshold: float,
    ) -> List[Tuple[float, float]]:
        """Extract contour coordinates at given threshold."""
        mask = density >= threshold
        if not np.any(mask):
            return []

        # Simple boundary extraction
        from scipy import ndimage
        boundary = mask & ~ndimage.binary_erosion(mask)
        coords = list(zip(LAT[boundary].tolist(), LON[boundary].tolist()))

        # Sort by angle from centroid for proper polygon
        if coords:
            center = np.mean(coords, axis=0)
            angles = [np.arctan2(c[0] - center[0], c[1] - center[1]) for c in coords]
            coords = [c for _, c in sorted(zip(angles, coords))]
            coords.append(coords[0])  # Close polygon

        return coords

    def _circle_coords(
        self, lat: float, lon: float, radius: float, n: int = 36
    ) -> List[Tuple[float, float]]:
        """Generate circular contour coordinates."""
        angles = np.linspace(0, 2 * np.pi, n)
        coords = [
            (lat + radius * np.cos(a), lon + radius * np.sin(a))
            for a in angles
        ]
        coords.append(coords[0])
        return coords


# ═══════════════════════════════════════════════════════════════════════
#  Landfall Risk Assessment
# ═══════════════════════════════════════════════════════════════════════

class LandfallRisk:
    """
    Assess landfall probability for Indian coastal districts.
    
    Intersects the probability cone with district boundaries
    to compute per-district landfall probability.
    """

    # Major NIO coastal districts with approximate coordinates
    COASTAL_DISTRICTS = [
        {"name": "Puri", "state": "Odisha", "lat": 19.81, "lon": 85.83},
        {"name": "Ganjam", "state": "Odisha", "lat": 19.58, "lon": 84.81},
        {"name": "Balasore", "state": "Odisha", "lat": 21.49, "lon": 86.93},
        {"name": "Srikakulam", "state": "Andhra Pradesh", "lat": 18.30, "lon": 84.00},
        {"name": "Visakhapatnam", "state": "Andhra Pradesh", "lat": 17.69, "lon": 83.22},
        {"name": "East Godavari", "state": "Andhra Pradesh", "lat": 17.00, "lon": 82.25},
        {"name": "Krishna", "state": "Andhra Pradesh", "lat": 16.17, "lon": 81.13},
        {"name": "Nellore", "state": "Andhra Pradesh", "lat": 14.44, "lon": 79.99},
        {"name": "Chennai", "state": "Tamil Nadu", "lat": 13.08, "lon": 80.27},
        {"name": "Nagapattinam", "state": "Tamil Nadu", "lat": 10.77, "lon": 79.84},
        {"name": "Ramanathapuram", "state": "Tamil Nadu", "lat": 9.37, "lon": 78.83},
        {"name": "South 24 Parganas", "state": "West Bengal", "lat": 21.87, "lon": 88.43},
        {"name": "North 24 Parganas", "state": "West Bengal", "lat": 22.62, "lon": 88.85},
        {"name": "Kolkata", "state": "West Bengal", "lat": 22.57, "lon": 88.36},
        {"name": "Junagadh", "state": "Gujarat", "lat": 21.52, "lon": 70.46},
        {"name": "Porbandar", "state": "Gujarat", "lat": 21.64, "lon": 69.60},
        {"name": "Kutch", "state": "Gujarat", "lat": 23.73, "lon": 69.86},
        {"name": "Mumbai", "state": "Maharashtra", "lat": 19.08, "lon": 72.88},
        {"name": "Ratnagiri", "state": "Maharashtra", "lat": 16.99, "lon": 73.30},
        {"name": "Ernakulam", "state": "Kerala", "lat": 9.98, "lon": 76.30},
        {"name": "Thiruvananthapuram", "state": "Kerala", "lat": 8.52, "lon": 76.94},
    ]

    def assess(
        self,
        cone_90pct: Dict[int, List[Tuple[float, float]]],
        ensemble_tracks: List[List[TrackPoint]],
    ) -> List[Dict]:
        """
        Compute landfall probability for coastal districts.
        
        Args:
            cone_90pct: 90% probability contours at each lead time
            ensemble_tracks: Ensemble track members
        Returns:
            List of {district_name, state, landfall_probability}
        """
        risks = []

        for district in self.COASTAL_DISTRICTS:
            # Count how many ensemble members pass within 100km of district
            close_count = 0
            for track in ensemble_tracks:
                for point in track:
                    dist = self._approx_distance(
                        point.lat, point.lon,
                        district["lat"], district["lon"],
                    )
                    if dist < 100.0:  # 100 km threshold
                        close_count += 1
                        break

            prob = close_count / max(len(ensemble_tracks), 1)

            if prob > 0.01:  # Only include non-trivial risks
                risks.append({
                    "district_name": district["name"],
                    "state": district["state"],
                    "landfall_probability": round(prob, 3),
                })

        risks.sort(key=lambda r: r["landfall_probability"], reverse=True)
        return risks

    def _approx_distance(
        self, lat1: float, lon1: float, lat2: float, lon2: float
    ) -> float:
        """Approximate distance in km using Euclidean on equirectangular projection."""
        dlat = (lat2 - lat1) * 111.0
        dlon = (lon2 - lon1) * 111.0 * np.cos(np.radians((lat1 + lat2) / 2))
        return np.sqrt(dlat ** 2 + dlon ** 2)
