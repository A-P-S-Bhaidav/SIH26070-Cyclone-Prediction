"""
Bidirectional Feature Pyramid Network (BiFPN).

Extracts cyclone structure features at multiple spatial scales
simultaneously using bidirectional top-down + bottom-up fusion
with learnable weights.

Based on EfficientDet (Tan et al. 2020).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List


class DepthwiseSeparableConv(nn.Module):
    """Depthwise separable convolution for efficiency."""

    def __init__(self, in_channels: int, out_channels: int, kernel_size: int = 3):
        super().__init__()
        self.depthwise = nn.Conv2d(
            in_channels, in_channels, kernel_size,
            padding=kernel_size // 2, groups=in_channels, bias=False,
        )
        self.pointwise = nn.Conv2d(in_channels, out_channels, 1, bias=False)
        self.norm = nn.BatchNorm2d(out_channels)
        self.act = nn.GELU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.act(self.norm(self.pointwise(self.depthwise(x))))


class BiFPNBlock(nn.Module):
    """
    Single BiFPN block with bidirectional feature fusion.
    
    Top-down: P6 → P5 → P4 → P3 (context flows down)
    Bottom-up: P3 → P4 → P5 → P6 (detail flows up)
    
    Each fusion node uses fast normalized fusion with learned weights.
    """

    def __init__(self, channels: int = 256, eps: float = 1e-4):
        super().__init__()
        self.eps = eps

        # Top-down fusion weights (3 nodes: P5, P4, P3)
        self.td_weights = nn.ParameterList([
            nn.Parameter(torch.ones(2)) for _ in range(3)
        ])

        # Bottom-up fusion weights (3 nodes: P4, P5, P6)
        self.bu_weights = nn.ParameterList([
            nn.Parameter(torch.ones(3)) for _ in range(3)
        ])

        # Convolutions after fusion
        self.td_convs = nn.ModuleList([
            DepthwiseSeparableConv(channels, channels) for _ in range(3)
        ])
        self.bu_convs = nn.ModuleList([
            DepthwiseSeparableConv(channels, channels) for _ in range(3)
        ])

    def _resize(self, x: torch.Tensor, target_size: tuple) -> torch.Tensor:
        """Resize feature map to target spatial dimensions."""
        if x.shape[-2:] != target_size:
            return F.interpolate(x, size=target_size, mode="nearest")
        return x

    def _fast_fusion(self, features: List[torch.Tensor], weights: nn.Parameter) -> torch.Tensor:
        """Fast normalized fusion: w_i * F_i / (sum(w_i) + eps)."""
        w = F.relu(weights)
        w_sum = w.sum() + self.eps

        target_size = features[0].shape[-2:]
        fused = sum(
            w[i] * self._resize(f, target_size)
            for i, f in enumerate(features)
        )
        return fused / w_sum

    def forward(self, features: List[torch.Tensor]) -> List[torch.Tensor]:
        """
        Args:
            features: [P3, P4, P5, P6] feature maps
        Returns:
            Enhanced [P3, P4, P5, P6]
        """
        p3, p4, p5, p6 = features

        # Top-down pass
        p5_td = self.td_convs[0](self._fast_fusion([p5, p6], self.td_weights[0]))
        p4_td = self.td_convs[1](self._fast_fusion([p4, p5_td], self.td_weights[1]))
        p3_td = self.td_convs[2](self._fast_fusion([p3, p4_td], self.td_weights[2]))

        # Bottom-up pass
        p4_out = self.bu_convs[0](self._fast_fusion([p4, p4_td, p3_td], self.bu_weights[0]))
        p5_out = self.bu_convs[1](self._fast_fusion([p5, p5_td, p4_out], self.bu_weights[1]))
        p6_out = self.bu_convs[2](self._fast_fusion([p6, p5_td, p5_out], self.bu_weights[2]))

        return [p3_td, p4_out, p5_out, p6_out]


class BiFPN(nn.Module):
    """
    Stacked BiFPN — multiple rounds of bidirectional fusion.
    
    Includes channel projection layers to unify feature map channels
    from the Swin-T encoder (which has varying channel counts per stage).
    """

    def __init__(
        self,
        in_channels: List[int] = None,
        out_channels: int = 256,
        n_blocks: int = 3,
    ):
        super().__init__()
        if in_channels is None:
            in_channels = [96, 192, 384, 768]

        # Channel projection to unified dimension
        self.channel_proj = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(c, out_channels, 1, bias=False),
                nn.BatchNorm2d(out_channels),
            )
            for c in in_channels
        ])

        # Stacked BiFPN blocks
        self.blocks = nn.ModuleList([
            BiFPNBlock(out_channels) for _ in range(n_blocks)
        ])

    def forward(self, features: List[torch.Tensor]) -> List[torch.Tensor]:
        """
        Args:
            features: [P3, P4, P5, P6] from Swin-T encoder
        Returns:
            Enhanced [P3, P4, P5, P6] with unified channels
        """
        # Project all features to same channel count
        projected = [
            proj(feat) for proj, feat in zip(self.channel_proj, features)
        ]

        # Apply BiFPN blocks
        for block in self.blocks:
            projected = block(projected)

        return projected
