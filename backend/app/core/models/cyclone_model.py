"""
Unified Cyclone Analysis Model.

Combines all encoders and prediction heads into a single multi-task
model for end-to-end cyclone analysis.

Architecture:
    Satellite (9, 256, 256) → SatelliteEncoder → [P3, P4, P5, P6]
    Environment (10, 80, 80) → FNOEncoder → env_feat
    [P5, P6, env_feat] → FusedEncoder → fused_feat
    [P3, P4, P5, P6] → BiFPN → enhanced features
    BiFPN P6 frames → TemporalGRU → temporal_vec
    
    Combined (1536,) → IntensityHead, RIHead, DvorakHeads
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional

from backend.app.core.models.analysis.satellite_encoder import SatelliteEncoder
from backend.app.core.models.analysis.fno_encoder import FNOEncoder
from backend.app.core.models.analysis.fusion import FusedEncoder
from backend.app.core.models.analysis.bifpn import BiFPN
from backend.app.core.models.analysis.temporal_gru import TemporalGRU
from backend.app.core.models.heads.prediction_heads import (
    IntensityHead,
    RIHead,
    DvorakSegmentationHead,
    DvorakClassificationHead,
    TNumberHead,
)


class CycloneAnalysisModel(nn.Module):
    """
    End-to-end multi-task cyclone analysis model.
    
    Jointly predicts:
    - Intensity (Vmax, MSLP, IMD category)
    - Rapid intensification probability
    - Dvorak pattern classification & segmentation
    - T-number estimation
    """

    def __init__(
        self,
        sat_channels: int = 9,
        env_channels: int = 10,
        pretrained: bool = True,
    ):
        super().__init__()

        # Encoders
        self.sat_encoder = SatelliteEncoder(in_channels=sat_channels, pretrained=pretrained)
        self.fno_encoder = FNOEncoder(in_channels=env_channels)
        self.fusion = FusedEncoder()
        self.bifpn = BiFPN()
        self.temporal_gru = TemporalGRU()

        # Prediction heads
        self.intensity_head = IntensityHead(in_features=1536)
        self.ri_head = RIHead(in_features=1536, n_physics_features=5)
        self.dvorak_seg_head = DvorakSegmentationHead(in_channels=256)
        self.dvorak_cls_head = DvorakClassificationHead(in_features=1536)
        self.t_number_head = TNumberHead(in_features=768)

    def forward(
        self,
        satellite_frames: List[torch.Tensor],     # List of (B, 9, 256, 256)
        env_input: torch.Tensor,                   # (B, 10, 80, 80)
        availability_mask: Optional[torch.Tensor] = None,  # (B, 9)
        physics_features: Optional[torch.Tensor] = None,   # (B, 5)
    ) -> Dict[str, torch.Tensor]:
        """
        Full forward pass through the analysis pipeline.
        
        Args:
            satellite_frames: 1-3 satellite tensors (channel-stacked)
            env_input: Environmental field snapshot
            availability_mask: Channel availability indicators
            physics_features: Extra physics features for RI head
        Returns:
            Dict of all predictions
        """
        B = env_input.shape[0]
        device = env_input.device

        # ── Encode each satellite frame ──
        frame_features = []
        all_bifpn_outputs = []

        for frame in satellite_frames:
            # Satellite encoder → multi-scale features
            sat_feats = self.sat_encoder(frame, availability_mask)  # [P3, P4, P5, P6]

            # BiFPN enhancement
            bifpn_feats = self.bifpn(sat_feats)  # Enhanced [P3, P4, P5, P6]
            all_bifpn_outputs.append(bifpn_feats)

            # Pool P6 for temporal sequence
            p6_pooled = F.adaptive_avg_pool2d(bifpn_feats[3], 1).flatten(1)  # (B, 768)
            frame_features.append(p6_pooled)

        # ── Temporal aggregation ──
        temporal_vec = self.temporal_gru(frame_features)  # (B, 512)

        # ── Environmental encoding ──
        env_feat = self.fno_encoder(env_input)  # (B, 256, 16, 16)

        # ── Fusion (using last frame's satellite features) ──
        last_sat_feats = self.sat_encoder(satellite_frames[-1], availability_mask)
        fused = self.fusion(
            sat_p5=last_sat_feats[2],
            sat_p6=last_sat_feats[3],
            env_feat=env_feat,
            availability_mask=availability_mask,
        )

        # ── Build combined feature vector ──
        bifpn_p6_pool = F.adaptive_avg_pool2d(all_bifpn_outputs[-1][3], 1).flatten(1)  # (B, 768)
        env_global = F.adaptive_avg_pool2d(env_feat, 1).flatten(1)  # (B, 256)

        combined = torch.cat([temporal_vec, bifpn_p6_pool, env_global], dim=1)  # (B, 1536)

        # ── Prediction heads ──
        intensity_out = self.intensity_head(combined)

        # T-number (needed for RI physics features)
        t_number = self.t_number_head(bifpn_p6_pool)

        # RI prediction
        if physics_features is None:
            physics_features = torch.zeros(B, 5, device=device)
            physics_features[:, 4] = t_number.detach()
        ri_prob = self.ri_head(combined, physics_features)

        # Dvorak segmentation (from P3 of last frame)
        seg_logits = self.dvorak_seg_head(all_bifpn_outputs[-1][0])

        # Dvorak classification
        pattern_logits = self.dvorak_cls_head(combined, seg_logits)

        return {
            **intensity_out,
            "ri_probability": ri_prob,
            "t_number": t_number,
            "dvorak_seg_logits": seg_logits,
            "dvorak_pattern_logits": pattern_logits,
            "dvorak_pattern_probs": F.softmax(pattern_logits, dim=-1),
            "features": combined,
        }
