"""
Swin Transformer Genesis Prediction Model.

Predicts cyclone genesis probability over a spatial grid using
multi-channel anomaly fields and GPI as input.

Architecture:
    Input: (B, 8, 80, 80) → Channel Adapter → Swin-T Backbone → Genesis Head
    Output: (B, 1, 80, 80) probability map [0, 1]
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, Optional

try:
    import timm
except ImportError:
    timm = None


class SwinGenesisModel(nn.Module):
    """
    Swin-T based genesis prediction model.
    
    Takes 8-channel anomaly+GPI fields and outputs a spatial
    probability map of cyclone genesis likelihood.
    """

    def __init__(
        self,
        in_channels: int = 8,
        input_size: int = 80,
        pretrained: bool = True,
    ):
        super().__init__()
        self.in_channels = in_channels
        self.input_size = input_size

        # Channel adapter: project 8 channels → 3 for pretrained backbone
        self.channel_adapter = nn.Sequential(
            nn.Conv2d(in_channels, 3, kernel_size=1, bias=False),
            nn.BatchNorm2d(3),
            nn.GELU(),
        )

        # Swin-T backbone (pretrained on ImageNet)
        if timm is not None:
            self.backbone = timm.create_model(
                "swin_tiny_patch4_window7_224",
                pretrained=pretrained,
                features_only=True,
                out_indices=(0, 1, 2, 3),
            )
        else:
            # Fallback: simple CNN backbone for environments without timm
            self.backbone = self._build_fallback_backbone()
            self._is_fallback = True

        # Genesis prediction head
        # Swin-T C4 output has 768 channels at 1/32 resolution
        self.genesis_head = nn.Sequential(
            nn.Conv2d(768, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.GELU(),
            nn.Conv2d(256, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.GELU(),
            nn.Conv2d(64, 1, kernel_size=1),
        )

    def _build_fallback_backbone(self) -> nn.Module:
        """Simple CNN fallback when timm is unavailable."""
        return nn.Sequential(
            nn.Conv2d(3, 96, 4, stride=4, padding=0),
            nn.BatchNorm2d(96), nn.GELU(),
            nn.Conv2d(96, 192, 3, stride=2, padding=1),
            nn.BatchNorm2d(192), nn.GELU(),
            nn.Conv2d(192, 384, 3, stride=2, padding=1),
            nn.BatchNorm2d(384), nn.GELU(),
            nn.Conv2d(384, 768, 3, stride=2, padding=1),
            nn.BatchNorm2d(768), nn.GELU(),
        )

    def forward(
        self,
        x: torch.Tensor,
        return_features: bool = False,
    ) -> Dict[str, torch.Tensor]:
        """
        Forward pass.
        
        Args:
            x: Input tensor (B, 8, 80, 80) — anomaly fields + GPI
            return_features: If True, also return intermediate features
        Returns:
            Dict with 'genesis_prob': (B, 1, 80, 80) probability map
        """
        B = x.shape[0]

        # Resize input to 224x224 for pretrained Swin-T
        x_resized = F.interpolate(x, size=(224, 224), mode="bilinear", align_corners=False)

        # Channel adaptation
        x_adapted = self.channel_adapter(x_resized)

        # Backbone feature extraction
        if hasattr(self, '_is_fallback') and self._is_fallback:
            feat = self.backbone(x_adapted)
            features = [feat]
        else:
            features = self.backbone(x_adapted)

        # Use deepest feature map
        deep_feat = features[-1]  # (B, 768, H/32, W/32)

        # Permute if needed (timm may output B, H, W, C)
        if deep_feat.dim() == 4 and deep_feat.shape[1] != 768:
            if deep_feat.shape[-1] == 768:
                deep_feat = deep_feat.permute(0, 3, 1, 2)

        # Genesis head
        logits = self.genesis_head(deep_feat)

        # Upsample back to input resolution
        prob_map = F.interpolate(
            logits, size=(self.input_size, self.input_size),
            mode="bilinear", align_corners=False,
        )
        prob_map = torch.sigmoid(prob_map)

        output = {"genesis_prob": prob_map}

        if return_features:
            output["features"] = features

        return output


class FocalLoss(nn.Module):
    """
    Focal Loss for handling severe class imbalance in genesis prediction.
    
    FL(p_t) = -alpha_t * (1 - p_t)^gamma * log(p_t)
    
    Downweights easy negatives and focuses on hard positives — critical
    when 99% of grid points are 'no genesis'.
    """

    def __init__(self, alpha: float = 0.25, gamma: float = 2.0):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma

    def forward(
        self, predictions: torch.Tensor, targets: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            predictions: (B, 1, H, W) probability map
            targets: (B, 1, H, W) binary labels
        Returns:
            Scalar focal loss
        """
        p = predictions.clamp(1e-7, 1 - 1e-7)
        
        # Binary cross entropy per pixel
        bce = -targets * torch.log(p) - (1 - targets) * torch.log(1 - p)
        
        # Focal modulation
        p_t = targets * p + (1 - targets) * (1 - p)
        alpha_t = targets * self.alpha + (1 - targets) * (1 - self.alpha)
        focal_weight = alpha_t * (1 - p_t) ** self.gamma
        
        loss = focal_weight * bce
        return loss.mean()
