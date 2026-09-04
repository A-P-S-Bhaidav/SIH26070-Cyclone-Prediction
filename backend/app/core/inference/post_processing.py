"""
Post-processing modules: MC Dropout Uncertainty, Temperature Scaling,
GradCAM Explainability, and Verification Metrics.
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple


# ═══════════════════════════════════════════════════════════════════════
#  MC Dropout Uncertainty Quantification
# ═══════════════════════════════════════════════════════════════════════

class MCDropoutUQ:
    """
    Monte Carlo Dropout for uncertainty estimation.
    
    Keeps dropout active during inference and runs N forward passes
    to estimate prediction mean and variance.
    """

    def __init__(self, model: nn.Module, n_samples: int = 30):
        self.model = model
        self.n_samples = n_samples

    def _enable_dropout(self):
        """Enable dropout layers during inference."""
        for module in self.model.modules():
            if isinstance(module, nn.Dropout):
                module.train()

    @torch.no_grad()
    def predict_with_uncertainty(
        self,
        *args,
        keys: List[str] = None,
        **kwargs,
    ) -> Dict[str, Dict[str, float]]:
        """
        Run N stochastic forward passes and compute statistics.
        
        Args:
            *args, **kwargs: Model inputs
            keys: Which output keys to compute uncertainty for
        Returns:
            Dict[key → {mean, std, lower, upper}]
        """
        if keys is None:
            keys = ["vmax_kt", "mslp_hpa", "ri_probability", "t_number"]

        self.model.eval()
        self._enable_dropout()

        predictions = {k: [] for k in keys}

        for _ in range(self.n_samples):
            output = self.model(*args, **kwargs)
            for key in keys:
                if key in output:
                    val = output[key]
                    if isinstance(val, torch.Tensor):
                        val = val.cpu().numpy()
                    predictions[key].append(val)

        results = {}
        for key in keys:
            if predictions[key]:
                vals = np.array(predictions[key])
                mean = float(np.mean(vals))
                std = float(np.std(vals))
                results[key] = {
                    "mean": mean,
                    "std": std,
                    "lower": mean - 2 * std,
                    "upper": mean + 2 * std,
                }

        self.model.eval()  # Reset to normal eval mode
        return results


# ═══════════════════════════════════════════════════════════════════════
#  Temperature Scaling Calibration
# ═══════════════════════════════════════════════════════════════════════

class TemperatureScaling(nn.Module):
    """
    Post-hoc calibration using temperature scaling.
    
    Fits a single scalar T on validation set to calibrate
    classification probabilities.
    
    calibrated_prob = softmax(logits / T)
    T > 1 → softer (less confident)
    T < 1 → sharper (more confident)
    """

    def __init__(self):
        super().__init__()
        self.temperature = nn.Parameter(torch.ones(1) * 1.5)

    def forward(self, logits: torch.Tensor) -> torch.Tensor:
        """Apply temperature scaling to logits."""
        return logits / self.temperature.clamp(min=0.1)

    def fit(
        self,
        val_logits: torch.Tensor,
        val_labels: torch.Tensor,
        lr: float = 0.01,
        max_iter: int = 100,
    ):
        """Fit temperature on validation set using NLL loss."""
        optimizer = torch.optim.LBFGS([self.temperature], lr=lr, max_iter=max_iter)
        nll_loss = nn.CrossEntropyLoss()

        def closure():
            optimizer.zero_grad()
            scaled = self.forward(val_logits)
            loss = nll_loss(scaled, val_labels)
            loss.backward()
            return loss

        optimizer.step(closure)
        return self.temperature.item()


# ═══════════════════════════════════════════════════════════════════════
#  GradCAM Explainability
# ═══════════════════════════════════════════════════════════════════════

class SimpleGradCAM:
    """
    Simplified GradCAM for satellite image explainability.
    
    Shows which regions of the satellite image the model focused on
    for its prediction — critical for IMD forecaster trust.
    """

    def __init__(self, model: nn.Module, target_layer: nn.Module):
        self.model = model
        self.target_layer = target_layer
        self.gradients = None
        self.activations = None

        # Register hooks
        target_layer.register_forward_hook(self._save_activation)
        target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, input, output):
        self.activations = output.detach()

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def generate(
        self,
        input_tensor: torch.Tensor,
        target_key: str = "vmax_kt",
        **model_kwargs,
    ) -> np.ndarray:
        """
        Generate GradCAM heatmap.
        
        Args:
            input_tensor: Model input
            target_key: Which output to compute attribution for
        Returns:
            Heatmap array (H, W) normalized to [0, 1]
        """
        self.model.eval()
        input_tensor.requires_grad_(True)

        # Forward pass
        output = self.model(input_tensor, **model_kwargs)
        target = output[target_key]

        if target.dim() > 1:
            target = target.mean()

        # Backward pass
        self.model.zero_grad()
        target.backward(retain_graph=True)

        if self.gradients is None or self.activations is None:
            return np.zeros((input_tensor.shape[-2], input_tensor.shape[-1]))

        # Weight channels by gradient global average
        weights = self.gradients.mean(dim=(2, 3), keepdim=True)
        cam = (weights * self.activations).sum(dim=1, keepdim=True)
        cam = F.relu(cam)

        # Resize to input dimensions
        cam = F.interpolate(
            cam, size=input_tensor.shape[-2:],
            mode="bilinear", align_corners=False,
        )

        # Normalize
        cam = cam.squeeze().cpu().numpy()
        if cam.max() > 0:
            cam = cam / cam.max()

        return cam


# ═══════════════════════════════════════════════════════════════════════
#  Verification Metrics
# ═══════════════════════════════════════════════════════════════════════

class VerificationModule:
    """
    Automated verification metrics computation.
    
    Evaluates system performance against historical IBTrACS data.
    """

    @staticmethod
    def track_mae(
        predicted: List[Tuple[float, float]],
        actual: List[Tuple[float, float]],
    ) -> float:
        """
        Mean Absolute Error for track positions (in km).
        
        Args:
            predicted: List of (lat, lon) predicted positions
            actual: List of (lat, lon) actual positions
        Returns:
            MAE in kilometers
        """
        if not predicted or not actual:
            return float("nan")

        errors = []
        for (plat, plon), (alat, alon) in zip(predicted, actual):
            dist = _haversine(plat, plon, alat, alon)
            errors.append(dist)

        return float(np.mean(errors))

    @staticmethod
    def intensity_mae(predicted_vmax: np.ndarray, actual_vmax: np.ndarray) -> float:
        """Intensity MAE in knots."""
        return float(np.mean(np.abs(predicted_vmax - actual_vmax)))

    @staticmethod
    def intensity_bias(predicted_vmax: np.ndarray, actual_vmax: np.ndarray) -> float:
        """Intensity bias in knots (positive = overestimate)."""
        return float(np.mean(predicted_vmax - actual_vmax))

    @staticmethod
    def brier_skill_score(
        predicted_probs: np.ndarray,
        actual_labels: np.ndarray,
        climatological_rate: Optional[float] = None,
    ) -> float:
        """
        Brier Skill Score relative to climatological frequency.
        
        BSS = 1 - BS / BS_clim
        BSS > 0 = better than climatology
        """
        bs = np.mean((predicted_probs - actual_labels) ** 2)

        if climatological_rate is None:
            climatological_rate = np.mean(actual_labels)

        bs_clim = np.mean((climatological_rate - actual_labels) ** 2)

        if bs_clim == 0:
            return 0.0

        return float(1.0 - bs / bs_clim)

    @staticmethod
    def cone_capture_rate(
        actual_positions: List[Tuple[float, float]],
        cone_contours_90pct: List[List[Tuple[float, float]]],
    ) -> float:
        """Fraction of actual positions falling within 90% probability cone."""
        if not actual_positions or not cone_contours_90pct:
            return 0.0

        inside_count = 0
        for pos in actual_positions:
            # Simple point-in-polygon check
            for contour in cone_contours_90pct:
                if _point_in_polygon(pos, contour):
                    inside_count += 1
                    break

        return inside_count / len(actual_positions)

    @staticmethod
    def reliability_diagram(
        predicted_probs: np.ndarray,
        actual_labels: np.ndarray,
        n_bins: int = 10,
    ) -> Dict:
        """
        Compute reliability diagram data.
        
        Returns predicted probability vs observed frequency per bin.
        """
        bin_edges = np.linspace(0, 1, n_bins + 1)
        bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

        observed_freq = []
        sample_counts = []

        for i in range(n_bins):
            mask = (predicted_probs >= bin_edges[i]) & (predicted_probs < bin_edges[i + 1])
            count = np.sum(mask)
            sample_counts.append(int(count))
            if count > 0:
                observed_freq.append(float(np.mean(actual_labels[mask])))
            else:
                observed_freq.append(float("nan"))

        return {
            "predicted_probability": bin_centers.tolist(),
            "observed_frequency": observed_freq,
            "sample_counts": sample_counts,
        }


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km."""
    R = 6371.0
    lat1_r, lat2_r = np.radians(lat1), np.radians(lat2)
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


def _point_in_polygon(
    point: Tuple[float, float], polygon: List[Tuple[float, float]]
) -> bool:
    """Ray casting point-in-polygon test."""
    x, y = point
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-10) + xi):
            inside = not inside
        j = i
    return inside
