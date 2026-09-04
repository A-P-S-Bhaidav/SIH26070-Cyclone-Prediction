"""
Genesis inference module with lead-time stratification.

Runs the trained genesis model on current and forecast fields
to produce 24h/48h/72h genesis probability maps and extracts
potential genesis zones using connected component analysis.
"""

import numpy as np
import torch
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from scipy import ndimage


@dataclass
class GenesisZone:
    """A detected potential genesis zone."""
    center_lat: float
    center_lon: float
    peak_probability: float
    area_km2: float
    lead_time_hours: int


class GenesisInference:
    """
    Genesis prediction inference engine.
    
    Supports:
    - Single snapshot prediction
    - Multi-lead-time prediction using NWP forward-pass
    - Genesis zone extraction via connected component labeling
    """

    def __init__(
        self,
        model: torch.nn.Module,
        device: str = "cpu",
        threshold: float = 0.5,
        min_area_gridpoints: int = 4,
    ):
        self.model = model
        self.device = torch.device(device)
        self.model.to(self.device)
        self.model.eval()
        self.threshold = threshold
        self.min_area_gridpoints = min_area_gridpoints

    @torch.no_grad()
    def predict(self, anomaly_gpi_fields: np.ndarray) -> np.ndarray:
        """
        Predict genesis probability map from anomaly+GPI fields.
        
        Args:
            anomaly_gpi_fields: (8, H, W) numpy array
        Returns:
            (H, W) probability map
        """
        x = torch.from_numpy(anomaly_gpi_fields).float().unsqueeze(0).to(self.device)
        output = self.model(x)
        prob_map = output["genesis_prob"].squeeze().cpu().numpy()
        return prob_map

    @torch.no_grad()
    def predict_multi_lead(
        self,
        current_fields: np.ndarray,
        gfs_24h_fields: Optional[np.ndarray] = None,
        gfs_48h_fields: Optional[np.ndarray] = None,
    ) -> Dict[int, np.ndarray]:
        """
        Run genesis model at multiple lead times.
        
        Same model on different temporal snapshots of forecast fields.
        
        Args:
            current_fields: (8, H, W) current ERA5 anomaly+GPI
            gfs_24h_fields: (8, H, W) GFS +24h forecast anomalies+GPI
            gfs_48h_fields: (8, H, W) GFS +48h forecast anomalies+GPI
        Returns:
            Dict mapping lead_time_hours → probability map
        """
        results = {24: self.predict(current_fields)}

        if gfs_24h_fields is not None:
            results[48] = self.predict(gfs_24h_fields)

        if gfs_48h_fields is not None:
            results[72] = self.predict(gfs_48h_fields)

        return results

    def extract_zones(
        self,
        prob_map: np.ndarray,
        lead_time_hours: int,
        lat_grid: Optional[np.ndarray] = None,
        lon_grid: Optional[np.ndarray] = None,
        grid_spacing_km: float = 28.0,
    ) -> List[GenesisZone]:
        """
        Extract potential genesis zones from probability map.
        
        Uses connected component labeling on thresholded probability map.
        
        Args:
            prob_map: (H, W) genesis probability map
            lead_time_hours: Lead time for this map
            lat_grid, lon_grid: Coordinate grids (optional)
            grid_spacing_km: Grid spacing in km (ERA5 ~28km at 0.25°)
        Returns:
            List of GenesisZone objects
        """
        # Threshold
        binary = prob_map >= self.threshold

        # Connected component labeling
        labeled, n_components = ndimage.label(binary)

        zones = []
        for comp_id in range(1, n_components + 1):
            component_mask = labeled == comp_id
            area_gridpoints = np.sum(component_mask)

            if area_gridpoints < self.min_area_gridpoints:
                continue

            # Peak probability
            peak_prob = float(np.max(prob_map[component_mask]))

            # Center of mass
            cy, cx = ndimage.center_of_mass(component_mask)

            # Convert to lat/lon if grids provided
            if lat_grid is not None and lon_grid is not None:
                center_lat = float(lat_grid[int(cy), int(cx)])
                center_lon = float(lon_grid[int(cy), int(cx)])
            else:
                # Approximate for Bay of Bengal region
                H, W = prob_map.shape
                center_lat = 0.0 + (cy / H) * 30.0  # 0-30°N
                center_lon = 60.0 + (cx / W) * 40.0  # 60-100°E

            # Area in km²
            area_km2 = float(area_gridpoints * grid_spacing_km ** 2)

            zones.append(GenesisZone(
                center_lat=center_lat,
                center_lon=center_lon,
                peak_probability=peak_prob,
                area_km2=area_km2,
                lead_time_hours=lead_time_hours,
            ))

        # Sort by peak probability descending
        zones.sort(key=lambda z: z.peak_probability, reverse=True)
        return zones
