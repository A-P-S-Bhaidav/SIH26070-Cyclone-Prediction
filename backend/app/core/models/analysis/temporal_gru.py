"""
GRU Temporal Aggregation Module.

Lightweight temporal processing for 2-3 sparse satellite frames.
Extracts motion and evolution dynamics from short sequences.
"""

import torch
import torch.nn as nn
from typing import List


class TemporalGRU(nn.Module):
    """
    GRU-based temporal aggregation for sparse satellite frames.
    
    Processes 1-3 feature vectors from BiFPN P6 global average pool,
    extracting temporal dynamics: CDO growth, convective trends,
    organizational changes between frames.
    
    Gracefully degrades for single-frame input.
    
    Input: List of (B, 768) feature vectors (1-3 frames)
    Output: (B, 512) temporal context vector
    """

    def __init__(
        self,
        input_size: int = 768,
        hidden_size: int = 512,
        num_layers: int = 2,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.hidden_size = hidden_size

        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0.0,
            batch_first=True,
        )

        # Layer norm on output for stability
        self.norm = nn.LayerNorm(hidden_size)

    def forward(
        self,
        frame_features: List[torch.Tensor],
    ) -> torch.Tensor:
        """
        Args:
            frame_features: List of (B, 768) tensors, length 1-3
                            Ordered chronologically: [t-12h, t-6h, t0]
        Returns:
            (B, 512) temporal context vector
        """
        if len(frame_features) == 0:
            raise ValueError("At least one frame feature is required")

        # Stack into sequence: (B, T, 768)
        sequence = torch.stack(frame_features, dim=1)

        # GRU forward pass
        output, hidden = self.gru(sequence)

        # Use final hidden state from last layer
        temporal_vec = hidden[-1]  # (B, 512)

        return self.norm(temporal_vec)
