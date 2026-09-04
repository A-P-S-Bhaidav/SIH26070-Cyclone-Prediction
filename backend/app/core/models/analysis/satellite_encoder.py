"""
Swin Transformer Satellite Encoder with Channel Adapters.

Encodes 9-channel (3 bands × 3 time steps) satellite imagery
into multi-scale feature maps for the main analysis pipeline.

Architecture:
    (B, 9, 256, 256) → Channel Adapter → Swin-T → [P3, P4, P5, P6]
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Dict, Optional

try:
    import timm
except ImportError:
    timm = None


class ChannelAdapter(nn.Module):
    """
    Lightweight 1×1 Conv adapter that projects multi-channel satellite
    input to 3 channels for the pretrained Swin-T backbone.
    
    Learns optimal mixing of channels from different time steps and bands.
    """

    def __init__(self, in_channels: int = 9):
        super().__init__()
        self.adapter = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=1, bias=False),
            nn.BatchNorm2d(32),
            nn.GELU(),
            nn.Conv2d(32, 3, kernel_size=1, bias=False),
            nn.BatchNorm2d(3),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.adapter(x)


class SatelliteEncoder(nn.Module):
    """
    Shared Swin-T satellite encoder with channel adapters.
    
    Processes channel-stacked satellite imagery and produces
    multi-scale feature maps at 4 resolutions.
    
    Output feature maps:
        P3: (B, 96,  64, 64)  — fine scale, eyewall detail
        P4: (B, 192, 32, 32)
        P5: (B, 384, 16, 16)  
        P6: (B, 768, 8,  8)   — coarse scale, large-scale structure
    """

    def __init__(
        self,
        in_channels: int = 9,
        pretrained: bool = True,
    ):
        super().__init__()
        self.in_channels = in_channels

        # Channel adapter: 9 → 3
        self.channel_adapter = ChannelAdapter(in_channels)

        # Swin-T backbone
        if timm is not None:
            self.backbone = timm.create_model(
                "swin_tiny_patch4_window7_224",
                pretrained=pretrained,
                features_only=True,
                out_indices=(0, 1, 2, 3),
            )
            self.feature_channels = [96, 192, 384, 768]
        else:
            self.backbone = self._build_fallback()
            self.feature_channels = [96, 192, 384, 768]

    def _build_fallback(self) -> nn.ModuleList:
        """Simple CNN fallback for environments without timm."""
        return nn.ModuleList([
            nn.Sequential(nn.Conv2d(3, 96, 4, 4), nn.BatchNorm2d(96), nn.GELU()),
            nn.Sequential(nn.Conv2d(96, 192, 3, 2, 1), nn.BatchNorm2d(192), nn.GELU()),
            nn.Sequential(nn.Conv2d(192, 384, 3, 2, 1), nn.BatchNorm2d(384), nn.GELU()),
            nn.Sequential(nn.Conv2d(384, 768, 3, 2, 1), nn.BatchNorm2d(768), nn.GELU()),
        ])

    def forward(
        self,
        x: torch.Tensor,
        availability_mask: Optional[torch.Tensor] = None,
    ) -> List[torch.Tensor]:
        """
        Forward pass.
        
        Args:
            x: (B, 9, 256, 256) channel-stacked satellite tensor
            availability_mask: (B, 9) binary mask — 1 = available, 0 = missing
        Returns:
            List of 4 feature maps [P3, P4, P5, P6]
        """
        # Apply availability mask (zero out missing channels)
        if availability_mask is not None:
            mask = availability_mask.unsqueeze(-1).unsqueeze(-1)  # (B, 9, 1, 1)
            x = x * mask

        # Resize to 224×224 for pretrained Swin-T
        x_resized = F.interpolate(x, size=(224, 224), mode="bilinear", align_corners=False)

        # Channel adaptation
        x_adapted = self.channel_adapter(x_resized)

        # Feature extraction
        if isinstance(self.backbone, nn.ModuleList):
            features = []
            h = x_adapted
            for stage in self.backbone:
                h = stage(h)
                features.append(h)
        else:
            features = self.backbone(x_adapted)

        # Ensure features are in (B, C, H, W) format
        out_features = []
        for feat in features:
            if feat.dim() == 4 and feat.shape[1] not in self.feature_channels:
                if feat.shape[-1] in self.feature_channels:
                    feat = feat.permute(0, 3, 1, 2)
            out_features.append(feat)

        return out_features
