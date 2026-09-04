"""
Multi-task Prediction Heads: Intensity, RI, Dvorak.

All heads receive the combined 1536-dimensional feature vector:
  GRU_hidden(512) + BiFPN_P6_pool(768) + env_global(256)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, Optional


# ═══════════════════════════════════════════════════════════════════════
#  Head A: Intensity Estimation
# ═══════════════════════════════════════════════════════════════════════

class IntensityHead(nn.Module):
    """
    Dual-branch intensity estimation with physics constraint.
    
    Branch 1: 6-class IMD category classification
    Branch 2: Continuous Vmax (kt) and MSLP (hPa) regression
    """

    def __init__(self, in_features: int = 1536, n_categories: int = 6):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(in_features, 512),
            nn.GELU(),
            nn.Dropout(0.3),
            nn.Linear(512, 128),
            nn.GELU(),
            nn.Dropout(0.2),
        )
        # Classification branch
        self.category_head = nn.Linear(128, n_categories)
        # Regression branch
        self.regression_head = nn.Linear(128, 2)  # [Vmax, MSLP]

    def forward(self, features: torch.Tensor) -> Dict[str, torch.Tensor]:
        """
        Returns:
            category_logits: (B, 6) raw logits for IMD categories
            category_probs: (B, 6) softmax probabilities
            vmax_kt: (B,) predicted Vmax in knots
            mslp_hpa: (B,) predicted MSLP in hPa
        """
        h = self.shared(features)
        cat_logits = self.category_head(h)
        regression = self.regression_head(h)

        return {
            "category_logits": cat_logits,
            "category_probs": F.softmax(cat_logits, dim=-1),
            "vmax_kt": F.relu(regression[:, 0]) + 15.0,   # Min 15kt
            "mslp_hpa": regression[:, 1] + 950.0,          # Center around typical values
        }


class IntensityLoss(nn.Module):
    """
    Combined loss for intensity estimation.
    CE(category) + Huber(Vmax) + Huber(MSLP) + WPR_penalty
    """

    def __init__(self, wpr_weight: float = 0.1):
        super().__init__()
        self.ce_loss = nn.CrossEntropyLoss()
        self.huber = nn.HuberLoss(delta=5.0)
        self.wpr_weight = wpr_weight

    def forward(
        self,
        pred: Dict[str, torch.Tensor],
        target_category: torch.Tensor,
        target_vmax: torch.Tensor,
        target_mslp: torch.Tensor,
    ) -> Dict[str, torch.Tensor]:
        # Category loss
        cat_loss = self.ce_loss(pred["category_logits"], target_category)
        # Regression losses
        vmax_loss = self.huber(pred["vmax_kt"], target_vmax)
        mslp_loss = self.huber(pred["mslp_hpa"], target_mslp)
        # Wind-Pressure Relationship constraint
        expected_mslp = 1010.0 - (pred["vmax_kt"] / 6.3) ** 2
        wpr_loss = F.mse_loss(pred["mslp_hpa"], expected_mslp)

        total = cat_loss + vmax_loss + 0.5 * mslp_loss + self.wpr_weight * wpr_loss

        return {
            "total": total,
            "category": cat_loss,
            "vmax": vmax_loss,
            "mslp": mslp_loss,
            "wpr": wpr_loss,
        }


# ═══════════════════════════════════════════════════════════════════════
#  Head B: Rapid Intensification Detector
# ═══════════════════════════════════════════════════════════════════════

class RIHead(nn.Module):
    """
    Binary RI classification: P(ΔVmax ≥ 35kt in next 24h).
    
    Receives main features + 5 physics-motivated extra features:
    OHC, VWS, CDO_roundness, outflow_symmetry, T_number
    """

    def __init__(self, in_features: int = 1536, n_physics_features: int = 5):
        super().__init__()
        total_in = in_features + n_physics_features  # 1541
        self.net = nn.Sequential(
            nn.Linear(total_in, 256),
            nn.GELU(),
            nn.Dropout(0.3),
            nn.Linear(256, 64),
            nn.GELU(),
            nn.Dropout(0.2),
            nn.Linear(64, 1),
        )

    def forward(
        self,
        features: torch.Tensor,
        physics_features: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            features: (B, 1536) main features
            physics_features: (B, 5) [OHC, VWS, CDO_roundness, outflow_sym, T_number]
        Returns:
            (B,) RI probability [0, 1]
        """
        combined = torch.cat([features, physics_features], dim=-1)
        return torch.sigmoid(self.net(combined)).squeeze(-1)


class RILoss(nn.Module):
    """Weighted BCE loss for RI detection (handles class imbalance)."""

    def __init__(self, pos_weight: float = 4.0):
        super().__init__()
        self.loss = nn.BCEWithLogitsLoss(
            pos_weight=torch.tensor(pos_weight)
        )

    def forward(self, pred_logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        return self.loss(pred_logits, targets)


# ═══════════════════════════════════════════════════════════════════════
#  Head C: Dvorak Pattern Classification
# ═══════════════════════════════════════════════════════════════════════

class DvorakSegmentationHead(nn.Module):
    """
    Pixel-wise Dvorak pattern segmentation from BiFPN P3 features.
    
    UNet-style decoder producing 7-class segmentation map.
    """

    def __init__(self, in_channels: int = 256, n_classes: int = 7):
        super().__init__()
        self.decoder = nn.Sequential(
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(in_channels, 128, 3, padding=1), nn.BatchNorm2d(128), nn.GELU(),
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(128, 64, 3, padding=1), nn.BatchNorm2d(64), nn.GELU(),
            nn.Conv2d(64, n_classes, 1),
        )

    def forward(self, p3_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            p3_features: (B, 256, 64, 64) from BiFPN P3
        Returns:
            (B, 7, 256, 256) segmentation logits
        """
        return self.decoder(p3_features)


class DvorakClassificationHead(nn.Module):
    """Dvorak organizational stage classification."""

    def __init__(self, in_features: int = 1536, seg_features: int = 128, n_classes: int = 6):
        super().__init__()
        self.seg_pool = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(7, seg_features),
            nn.GELU(),
        )
        self.classifier = nn.Sequential(
            nn.Linear(in_features + seg_features, 256),
            nn.GELU(),
            nn.Dropout(0.2),
            nn.Linear(256, n_classes),
        )

    def forward(
        self,
        features: torch.Tensor,
        seg_logits: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            features: (B, 1536) main features
            seg_logits: (B, 7, H, W) segmentation output
        Returns:
            (B, 6) Dvorak pattern class probabilities
        """
        seg_pooled = self.seg_pool(seg_logits)
        combined = torch.cat([features, seg_pooled], dim=-1)
        return self.classifier(combined)


class TNumberHead(nn.Module):
    """T-number regression from BiFPN P6 global features."""

    def __init__(self, in_features: int = 768):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, 256),
            nn.GELU(),
            nn.Linear(256, 64),
            nn.GELU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),  # Output in [0, 1]
        )

    def forward(self, p6_global: torch.Tensor) -> torch.Tensor:
        """
        Args:
            p6_global: (B, 768) global average pooled P6
        Returns:
            (B,) T-number in [1.0, 8.0]
        """
        return self.net(p6_global).squeeze(-1) * 7.0 + 1.0


class DvorakLoss(nn.Module):
    """Combined Dvorak loss: Dice+CE (segmentation) + Huber (T-number)."""

    def __init__(self):
        super().__init__()
        self.ce = nn.CrossEntropyLoss(ignore_index=-1)
        self.huber = nn.HuberLoss(delta=0.5)

    def dice_loss(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        """Soft Dice loss for segmentation."""
        pred_soft = F.softmax(pred, dim=1)
        target_one_hot = F.one_hot(target.long(), pred.shape[1]).permute(0, 3, 1, 2).float()
        intersection = (pred_soft * target_one_hot).sum(dim=(2, 3))
        union = pred_soft.sum(dim=(2, 3)) + target_one_hot.sum(dim=(2, 3))
        dice = (2.0 * intersection + 1e-6) / (union + 1e-6)
        return 1.0 - dice.mean()

    def forward(
        self,
        seg_logits: torch.Tensor,
        seg_targets: torch.Tensor,
        t_number_pred: torch.Tensor,
        t_number_target: torch.Tensor,
        pattern_logits: Optional[torch.Tensor] = None,
        pattern_targets: Optional[torch.Tensor] = None,
    ) -> Dict[str, torch.Tensor]:
        seg_ce = self.ce(seg_logits, seg_targets)
        seg_dice = self.dice_loss(seg_logits, seg_targets)
        t_loss = self.huber(t_number_pred, t_number_target)

        total = seg_ce + seg_dice + t_loss

        if pattern_logits is not None and pattern_targets is not None:
            pattern_loss = self.ce(pattern_logits, pattern_targets)
            total = total + pattern_loss

        return {"total": total, "seg_ce": seg_ce, "seg_dice": seg_dice, "t_number": t_loss}
