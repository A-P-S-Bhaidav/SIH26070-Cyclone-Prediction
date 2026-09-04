"""
Demo Data Service.

Provides pre-computed realistic demo data for the dashboard,
based on historical North Indian Ocean cyclones (Amphan, Fani, Tauktae).

This allows the frontend to be fully functional without live model inference.
"""

import json
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict


class DemoDataService:
    """Serves pre-computed cyclone analysis data for dashboard demonstration."""

    def __init__(self):
        self._cyclones = {}
        self._genesis_data = {}
        self._verification = {}
        self._telemetry_index = 0

    async def initialize(self):
        """Load demo data for historical NIO cyclones."""
        self._cyclones = self._build_demo_cyclones()
        self._genesis_data = self._build_demo_genesis()
        self._verification = self._build_demo_verification()

    def _build_demo_cyclones(self) -> Dict:
        """Build demo data for major historical NIO cyclones."""
        return {
            "AMPHAN_2020": self._build_amphan(),
            "FANI_2019": self._build_fani(),
            "TAUKTAE_2021": self._build_tauktae(),
        }

    def _build_amphan(self) -> Dict:
        """Super Cyclonic Storm Amphan (May 2020) — strongest NIO cyclone on record."""
        base_time = datetime(2020, 5, 18, 12, 0, tzinfo=timezone.utc)
        return {
            "storm_id": "AMPHAN_2020",
            "storm_name": "Amphan",
            "basin": "NIO",
            "is_active": True,
            "timestamp": base_time.isoformat(),
            "position": {"lat": 15.2, "lon": 87.1},
            "intensity": {
                "vmax_kt": {"mean": 130, "std": 8, "lower": 114, "upper": 146},
                "mslp_hpa": {"mean": 920, "std": 5, "lower": 910, "upper": 930},
                "category": "Extremely Severe Cyclonic Storm",
                "category_confidence": 0.92,
                "category_probabilities": {
                    "TD": 0.0, "CS": 0.0, "SCS": 0.02,
                    "VSCS": 0.06, "ESCS": 0.92, "SuCS": 0.0,
                },
            },
            "rapid_intensification": {
                "probability": {"mean": 0.82, "std": 0.09, "lower": 0.64, "upper": 1.0},
                "alert_level": "HIGH",
                "contributing_factors": {
                    "ohc": 0.95, "vws": 0.15, "cdo_roundness": 0.88,
                    "outflow_symmetry": 0.91, "sst_anomaly": 0.78,
                },
            },
            "dvorak": {
                "pattern": "Eye",
                "pattern_confidence": 0.87,
                "pattern_probabilities": {
                    "Pre-organization": 0.0, "Banding Feature": 0.02,
                    "CDO": 0.08, "Eye": 0.87,
                    "Deteriorating": 0.02, "Shear Pattern": 0.01,
                },
                "t_number": {"mean": 6.5, "std": 0.3, "lower": 5.9, "upper": 7.1},
            },
            "track": self._build_amphan_track(),
            "timeline": self._build_intensity_timeline(
                base_vmax=130, base_mslp=920,
                n_past=12, n_future=8,
            ),
            "bulletin_text": self._format_bulletin("Amphan", 15.2, 87.1, 130, 920, "ESCS", 0.82),
        }

    def _build_fani(self) -> Dict:
        """Extremely Severe Cyclonic Storm Fani (April 2019)."""
        base_time = datetime(2019, 4, 30, 12, 0, tzinfo=timezone.utc)
        return {
            "storm_id": "FANI_2019",
            "storm_name": "Fani",
            "basin": "NIO",
            "is_active": True,
            "timestamp": base_time.isoformat(),
            "position": {"lat": 14.8, "lon": 85.9},
            "intensity": {
                "vmax_kt": {"mean": 115, "std": 7, "lower": 101, "upper": 129},
                "mslp_hpa": {"mean": 934, "std": 4, "lower": 926, "upper": 942},
                "category": "Extremely Severe Cyclonic Storm",
                "category_confidence": 0.88,
                "category_probabilities": {
                    "TD": 0.0, "CS": 0.0, "SCS": 0.03,
                    "VSCS": 0.09, "ESCS": 0.88, "SuCS": 0.0,
                },
            },
            "rapid_intensification": {
                "probability": {"mean": 0.65, "std": 0.12, "lower": 0.41, "upper": 0.89},
                "alert_level": "ELEVATED",
                "contributing_factors": {
                    "ohc": 0.88, "vws": 0.22, "cdo_roundness": 0.82,
                    "outflow_symmetry": 0.85, "sst_anomaly": 0.72,
                },
            },
            "dvorak": {
                "pattern": "CDO",
                "pattern_confidence": 0.79,
                "pattern_probabilities": {
                    "Pre-organization": 0.0, "Banding Feature": 0.05,
                    "CDO": 0.79, "Eye": 0.12,
                    "Deteriorating": 0.03, "Shear Pattern": 0.01,
                },
                "t_number": {"mean": 5.5, "std": 0.4, "lower": 4.7, "upper": 6.3},
            },
            "track": self._build_fani_track(),
            "timeline": self._build_intensity_timeline(
                base_vmax=115, base_mslp=934,
                n_past=12, n_future=8,
            ),
            "bulletin_text": self._format_bulletin("Fani", 14.8, 85.9, 115, 934, "ESCS", 0.65),
        }

    def _build_tauktae(self) -> Dict:
        """Very Severe Cyclonic Storm Tauktae (May 2021) — Arabian Sea."""
        base_time = datetime(2021, 5, 16, 12, 0, tzinfo=timezone.utc)
        return {
            "storm_id": "TAUKTAE_2021",
            "storm_name": "Tauktae",
            "basin": "NIO",
            "is_active": True,
            "timestamp": base_time.isoformat(),
            "position": {"lat": 16.5, "lon": 72.8},
            "intensity": {
                "vmax_kt": {"mean": 95, "std": 6, "lower": 83, "upper": 107},
                "mslp_hpa": {"mean": 950, "std": 3, "lower": 944, "upper": 956},
                "category": "Very Severe Cyclonic Storm",
                "category_confidence": 0.85,
                "category_probabilities": {
                    "TD": 0.0, "CS": 0.01, "SCS": 0.08,
                    "VSCS": 0.85, "ESCS": 0.06, "SuCS": 0.0,
                },
            },
            "rapid_intensification": {
                "probability": {"mean": 0.45, "std": 0.15, "lower": 0.15, "upper": 0.75},
                "alert_level": "MODERATE",
                "contributing_factors": {
                    "ohc": 0.72, "vws": 0.35, "cdo_roundness": 0.75,
                    "outflow_symmetry": 0.68, "sst_anomaly": 0.65,
                },
            },
            "dvorak": {
                "pattern": "CDO",
                "pattern_confidence": 0.83,
                "pattern_probabilities": {
                    "Pre-organization": 0.01, "Banding Feature": 0.06,
                    "CDO": 0.83, "Eye": 0.07,
                    "Deteriorating": 0.02, "Shear Pattern": 0.01,
                },
                "t_number": {"mean": 4.5, "std": 0.3, "lower": 3.9, "upper": 5.1},
            },
            "track": self._build_tauktae_track(),
            "timeline": self._build_intensity_timeline(
                base_vmax=95, base_mslp=950,
                n_past=12, n_future=8,
            ),
            "bulletin_text": self._format_bulletin("Tauktae", 16.5, 72.8, 95, 950, "VSCS", 0.45),
        }

    def _build_amphan_track(self) -> Dict:
        """Amphan track: Bay of Bengal → West Bengal landfall."""
        primary = [
            {"lead_time_hours": 0, "position": {"lat": 15.2, "lon": 87.1}},
            {"lead_time_hours": 6, "position": {"lat": 15.9, "lon": 87.0}},
            {"lead_time_hours": 12, "position": {"lat": 16.8, "lon": 86.8}},
            {"lead_time_hours": 24, "position": {"lat": 18.5, "lon": 86.3}},
            {"lead_time_hours": 36, "position": {"lat": 20.2, "lon": 87.0}},
            {"lead_time_hours": 48, "position": {"lat": 21.8, "lon": 88.2}},
        ]
        ensemble = self._generate_demo_ensemble(primary, n=10)
        cone = self._generate_demo_cone(primary)
        landfall = [
            {"district_name": "South 24 Parganas", "state": "West Bengal", "landfall_probability": 0.72},
            {"district_name": "North 24 Parganas", "state": "West Bengal", "landfall_probability": 0.58},
            {"district_name": "Kolkata", "state": "West Bengal", "landfall_probability": 0.45},
            {"district_name": "Balasore", "state": "Odisha", "landfall_probability": 0.32},
        ]
        return {"primary_track": primary, "ensemble_tracks": ensemble,
                "kde_cone": cone, "cliper_track": primary, "landfall_risk": landfall}

    def _build_fani_track(self) -> Dict:
        """Fani track: Bay of Bengal → Odisha landfall."""
        primary = [
            {"lead_time_hours": 0, "position": {"lat": 14.8, "lon": 85.9}},
            {"lead_time_hours": 6, "position": {"lat": 15.5, "lon": 85.6}},
            {"lead_time_hours": 12, "position": {"lat": 16.3, "lon": 85.2}},
            {"lead_time_hours": 24, "position": {"lat": 18.0, "lon": 84.5}},
            {"lead_time_hours": 36, "position": {"lat": 19.5, "lon": 84.8}},
            {"lead_time_hours": 48, "position": {"lat": 20.8, "lon": 85.5}},
        ]
        ensemble = self._generate_demo_ensemble(primary, n=10)
        cone = self._generate_demo_cone(primary)
        landfall = [
            {"district_name": "Puri", "state": "Odisha", "landfall_probability": 0.68},
            {"district_name": "Ganjam", "state": "Odisha", "landfall_probability": 0.52},
            {"district_name": "Srikakulam", "state": "Andhra Pradesh", "landfall_probability": 0.35},
        ]
        return {"primary_track": primary, "ensemble_tracks": ensemble,
                "kde_cone": cone, "cliper_track": primary, "landfall_risk": landfall}

    def _build_tauktae_track(self) -> Dict:
        """Tauktae track: Arabian Sea → Gujarat landfall."""
        primary = [
            {"lead_time_hours": 0, "position": {"lat": 16.5, "lon": 72.8}},
            {"lead_time_hours": 6, "position": {"lat": 17.2, "lon": 72.3}},
            {"lead_time_hours": 12, "position": {"lat": 18.0, "lon": 71.8}},
            {"lead_time_hours": 24, "position": {"lat": 19.5, "lon": 71.0}},
            {"lead_time_hours": 36, "position": {"lat": 20.5, "lon": 70.5}},
            {"lead_time_hours": 48, "position": {"lat": 21.3, "lon": 70.2}},
        ]
        ensemble = self._generate_demo_ensemble(primary, n=10)
        cone = self._generate_demo_cone(primary)
        landfall = [
            {"district_name": "Junagadh", "state": "Gujarat", "landfall_probability": 0.62},
            {"district_name": "Porbandar", "state": "Gujarat", "landfall_probability": 0.48},
            {"district_name": "Mumbai", "state": "Maharashtra", "landfall_probability": 0.22},
        ]
        return {"primary_track": primary, "ensemble_tracks": ensemble,
                "kde_cone": cone, "cliper_track": primary, "landfall_risk": landfall}

    def _generate_demo_ensemble(self, primary: List[Dict], n: int = 10) -> List[Dict]:
        """Generate realistic ensemble tracks with Gaussian perturbations."""
        ensemble = []
        for i in range(n):
            track = {"track_id": i, "method": f"ANALOG_{i}", "points": []}
            for pt in primary:
                scale = 0.15 + 0.01 * pt["lead_time_hours"]
                track["points"].append({
                    "lead_time_hours": pt["lead_time_hours"],
                    "position": {
                        "lat": pt["position"]["lat"] + np.random.normal(0, scale),
                        "lon": pt["position"]["lon"] + np.random.normal(0, scale),
                    },
                })
            ensemble.append(track)
        return ensemble

    def _generate_demo_cone(self, primary: List[Dict]) -> List[Dict]:
        """Generate demo KDE cone contours."""
        cone = []
        for pt in primary:
            if pt["lead_time_hours"] == 0:
                continue
            t = pt["lead_time_hours"]
            lat, lon = pt["position"]["lat"], pt["position"]["lon"]
            for level in [0.5, 0.75, 0.9]:
                radius = (1 - level + 0.1) * (0.3 + 0.025 * t)
                coords = []
                for angle in np.linspace(0, 2 * np.pi, 24):
                    coords.append([
                        round(lon + radius * np.cos(angle) * 1.2, 3),
                        round(lat + radius * np.sin(angle), 3),
                    ])
                coords.append(coords[0])
                cone.append({
                    "lead_time_hours": t,
                    "probability_level": level,
                    "coordinates": coords,
                })
        return cone

    def _build_intensity_timeline(
        self, base_vmax: float, base_mslp: float,
        n_past: int = 12, n_future: int = 8,
    ) -> Dict:
        """Build intensity timeline with historical + forecast data."""
        timeline = {"timestamps": [], "vmax": [], "mslp": [],
                     "vmax_upper": [], "vmax_lower": [],
                     "mslp_upper": [], "mslp_lower": []}

        for i in range(-n_past, n_future + 1):
            hours = i * 6
            # Simulate intensity evolution
            phase = i / n_past
            vmax = base_vmax * (0.4 + 0.6 * np.exp(-0.5 * (phase - 0.5) ** 2 / 0.3))
            mslp = 1010 - (vmax / 6.3) ** 2

            # Uncertainty grows with forecast time
            unc = max(0, i) * 2 + 3

            timeline["timestamps"].append(hours)
            timeline["vmax"].append(round(vmax, 1))
            timeline["mslp"].append(round(mslp, 1))
            timeline["vmax_upper"].append(round(vmax + unc, 1))
            timeline["vmax_lower"].append(round(max(15, vmax - unc), 1))
            timeline["mslp_upper"].append(round(mslp + unc * 0.7, 1))
            timeline["mslp_lower"].append(round(mslp - unc * 0.7, 1))

        return timeline

    def _build_demo_genesis(self) -> Dict:
        """Demo genesis data."""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "zones": [
                {
                    "center": {"lat": 11.5, "lon": 85.0},
                    "peak_probability": 0.42,
                    "area_km2": 125000,
                    "lead_time_hours": 48,
                },
            ],
            "probability_grid": None,
        }

    def _build_demo_verification(self) -> Dict:
        """Demo verification metrics (competitive with operational systems)."""
        return {
            "track_mae_24h_km": 95.2,
            "track_mae_48h_km": 168.5,
            "intensity_mae_kt": 8.7,
            "intensity_bias_kt": -1.2,
            "ri_brier_skill_score": 0.18,
            "genesis_brier_skill_score": 0.22,
            "cone_capture_rate_90pct": 0.88,
            "sample_count": 847,
        }

    def _format_bulletin(
        self, name, lat, lon, vmax, mslp, category, ri_prob,
    ) -> str:
        """Format human-readable cyclone bulletin."""
        alert = "⚠️ ELEVATED" if ri_prob > 0.5 else "MODERATE"
        return (
            f"CYCLONE ANALYSIS BULLETIN — {name}\n"
            f"Position: {lat:.1f}°N, {lon:.1f}°E\n"
            f"Intensity: Vmax {vmax} kt | MSLP {mslp} hPa\n"
            f"Category: {category}\n"
            f"RI Probability (24h): {ri_prob:.0%} [{alert}]\n"
        )

    # ── API Methods ─────────────────────────────────────────────────
    async def get_cyclone_list(self, active_only=True, basin="NIO"):
        items = []
        for sid, data in self._cyclones.items():
            items.append({
                "storm_id": sid,
                "storm_name": data.get("storm_name"),
                "current_position": data["position"],
                "current_vmax_kt": data["intensity"]["vmax_kt"]["mean"],
                "current_category": data["intensity"]["category"],
                "is_active": data.get("is_active", True),
                "last_update": data["timestamp"],
            })
        return items

    async def get_bulletin(self, storm_id):
        return self._cyclones.get(storm_id)

    async def get_intensity(self, storm_id):
        c = self._cyclones.get(storm_id)
        return c["intensity"] if c else None

    async def get_track(self, storm_id):
        c = self._cyclones.get(storm_id)
        return c["track"] if c else None

    async def get_dvorak(self, storm_id):
        c = self._cyclones.get(storm_id)
        return c["dvorak"] if c else None

    async def get_gradcam(self, storm_id, target="intensity"):
        return {"storm_id": storm_id, "target": target, "heatmap_url": None,
                "description": f"GradCAM attribution for {target} prediction"}

    async def get_intensity_timeline(self, storm_id, hours_back=72, hours_forward=48):
        c = self._cyclones.get(storm_id)
        return c["timeline"] if c else None

    async def get_genesis_map(self, lead_time=24):
        return self._genesis_data

    async def get_genesis_zones(self):
        return self._genesis_data.get("zones", [])

    async def get_district_risks(self, storm_id=None, min_probability=0.0):
        risks = []
        for sid, data in self._cyclones.items():
            if storm_id and sid != storm_id:
                continue
            for r in data["track"].get("landfall_risk", []):
                if r["landfall_probability"] >= min_probability:
                    risks.append(r)
        return risks

    async def get_districts_geojson(self):
        return {"type": "FeatureCollection", "features": []}

    async def get_verification_metrics(self):
        return self._verification

    async def get_reliability_data(self, target="intensity"):
        # 10-bin reliability diagram data
        bins = np.linspace(0, 1, 11)
        centers = (bins[:-1] + bins[1:]) / 2
        observed = centers + np.random.normal(0, 0.05, 10)
        observed = np.clip(observed, 0, 1)
        return {
            "predicted_probability": centers.tolist(),
            "observed_frequency": observed.tolist(),
            "sample_counts": np.random.randint(10, 200, 10).tolist(),
        }

    async def get_next_telemetry_event(self):
        """Get next SSE telemetry event (cycling through demo data)."""
        storms = list(self._cyclones.values())
        if not storms:
            return None
        storm = storms[self._telemetry_index % len(storms)]
        self._telemetry_index += 1
        return {
            "event_type": "cyclone_telemetry",
            "storm_id": storm["storm_id"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": {
                "position": storm["position"],
                "vmax_kt": storm["intensity"]["vmax_kt"]["mean"],
                "mslp_hpa": storm["intensity"]["mslp_hpa"]["mean"],
                "category": storm["intensity"]["category"],
                "ri_prob": storm["rapid_intensification"]["probability"]["mean"],
            },
        }
