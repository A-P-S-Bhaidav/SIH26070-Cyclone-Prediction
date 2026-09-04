"""
Cross-Attention Fusion with Modality Gating.

Merges satellite features and environmental features into a unified
representation using two-level fusion (local + global) with adaptive
modality gating for handling missing/nighttime data.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


class CrossAttention(nn.Module):
    """
    Multi-head cross-attention module.
    
    Q comes from satellite, K/V from environment — lets the model ask:
    'Given what I see in the satellite image, what environmental
    features are most relevant?'
    """

    def __init__(self, q_dim: int, kv_dim: int, hidden_dim: int = 256, n_heads: int = 4):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = hidden_dim // n_heads

        self.q_proj = nn.Linear(q_dim, hidden_dim)
        self.k_proj = nn.Linear(kv_dim, hidden_dim)
        self.v_proj = nn.Linear(kv_dim, hidden_dim)
        self.out_proj = nn.Linear(hidden_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)

    def forward(self, q: torch.Tensor, kv: torch.Tensor) -> torch.Tensor:
        """
        Args:
            q: (B, q_dim) query from satellite
            kv: (B, kv_dim) key-value from environment
        Returns:
            (B, hidden_dim) attended features
        """
        B = q.shape[0]

        Q = self.q_proj(q).view(B, self.n_heads, self.head_dim)
        K = self.k_proj(kv).view(B, self.n_heads, self.head_dim)
        V = self.v_proj(kv).view(B, self.n_heads, self.head_dim)

        # Scaled dot-product attention
        attn = torch.einsum("bnh,bnh->bn", Q, K) / (self.head_dim ** 0.5)
        attn = F.softmax(attn, dim=-1)

        out = torch.einsum("bn,bnh->bnh", attn, V)
        out = out.reshape(B, -1)
        out = self.out_proj(out)

        return self.norm(out)


class ModalityGating(nn.Module):
    """
    Learned modality gating for handling missing satellite data.
    
    Automatically downweights satellite contribution when channels
    are missing (nighttime VIS, incomplete frames) and upweights
    the environment — which is always available.
    """

    def __init__(self, n_channels: int = 9):
        super().__init__()
        self.gate_net = nn.Sequential(
            nn.Linear(n_channels, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(
        self, availability_flag: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            availability_flag: (B, n_channels) binary availability mask
        Returns:
            (gate_sat, gate_env) tensors each of shape (B, 1)
        """
        gate_sat = self.gate_net(availability_flag.float())  # (B, 1)
        gate_env = 1.0 - gate_sat * 0.3  # Environment always has significant weight

        return gate_sat, gate_env


class FusedEncoder(nn.Module):
    """
    Two-level cross-attention fusion with modality gating.
    
    Level 1 (Local): Spatial alignment via concatenation + 1×1 conv
    Level 2 (Global): Cross-attention between satellite and environment
    
    Output: (B, 512, 16, 16) fused feature tensor
    """

    def __init__(
        self,
        sat_channels: int = 384,   # Satellite P5 channels
        env_channels: int = 256,   # FNO output channels
        sat_global_dim: int = 768, # Satellite P6 global pool dim
        n_input_channels: int = 9,
    ):
        super().__init__()

        # Level 1: Local spatial fusion
        self.local_fusion = nn.Sequential(
            nn.Conv2d(sat_channels + env_channels, 512, kernel_size=1),
            nn.BatchNorm2d(512),
            nn.GELU(),
            nn.Conv2d(512, 512, kernel_size=3, padding=1),
            nn.BatchNorm2d(512),
            nn.GELU(),
        )

        # Level 2: Global cross-attention
        self.cross_attention = CrossAttention(
            q_dim=sat_global_dim,
            kv_dim=env_channels,
            hidden_dim=256,
            n_heads=4,
        )

        # Modality gating
        self.modality_gate = ModalityGating(n_input_channels)

        # Projection for environment features to match spatial dims
        self.env_upsample = nn.Sequential(
            nn.Conv2d(env_channels, 512, kernel_size=1),
            nn.BatchNorm2d(512),
        )

    def forward(
        self,
        sat_p5: torch.Tensor,     # (B, 384, 16, 16)
        sat_p6: torch.Tensor,     # (B, 768, 8, 8)
        env_feat: torch.Tensor,   # (B, 256, 16, 16)
        availability_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Fuse satellite and environmental features.
        
        Returns: (B, 512, 16, 16) fused feature tensor
        """
        B = sat_p5.shape[0]

        # Ensure spatial dimensions match
        if sat_p5.shape[-2:] != env_feat.shape[-2:]:
            sat_p5 = F.interpolate(sat_p5, size=env_feat.shape[-2:], mode="bilinear", align_corners=False)

        # Level 1: Local fusion (spatial alignment)
        local_cat = torch.cat([sat_p5, env_feat], dim=1)  # (B, 640, 16, 16)
        local_fused = self.local_fusion(local_cat)  # (B, 512, 16, 16)

        # Level 2: Global cross-attention
        sat_global = F.adaptive_avg_pool2d(sat_p6, 1).flatten(1)  # (B, 768)
        env_global = F.adaptive_avg_pool2d(env_feat, 1).flatten(1)  # (B, 256)
        global_attn = self.cross_attention(sat_global, env_global)  # (B, 256)

        # Broadcast global attention to spatial dims
        global_attn_spatial = global_attn.unsqueeze(-1).unsqueeze(-1)  # (B, 256, 1, 1)
        global_attn_spatial = global_attn_spatial.expand(-1, -1, local_fused.shape[2], local_fused.shape[3])

        # Modality gating
        if availability_mask is not None:
            gate_sat, gate_env = self.modality_gate(availability_mask)
            gate_sat = gate_sat.unsqueeze(-1).unsqueeze(-1)
            gate_env = gate_env.unsqueeze(-1).unsqueeze(-1)
        else:
            gate_sat = torch.ones(B, 1, 1, 1, device=sat_p5.device)
            gate_env = torch.ones(B, 1, 1, 1, device=sat_p5.device)

        # Gated combination
        env_upsampled = self.env_upsample(env_feat)  # (B, 512, 16, 16)
        fused = gate_sat * local_fused + gate_env * env_upsampled

        return fused
