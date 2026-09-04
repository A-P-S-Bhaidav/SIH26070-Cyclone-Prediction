"""
Fourier Neural Operator (FNO) Encoder for Environmental Fields.

Operates in Fourier/frequency domain to capture global atmospheric
patterns efficiently — naturally suited for PDE-governed fields.

Architecture:
    (B, 10, 80, 80) → Lift → 4× FNO Blocks → Project → Pool → (B, 256, 16, 16)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional


class SpectralConv2d(nn.Module):
    """
    2D Spectral Convolution via FFT.
    
    Applies learned weights in Fourier space:
    FFT → multiply by spectral weights → IFFT
    
    Keeps only the top `modes` frequency components.
    """

    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        modes1: int = 20,
        modes2: int = 20,
    ):
        super().__init__()
        self.in_channels = in_channels
        self.out_channels = out_channels
        self.modes1 = modes1  # Number of Fourier modes to keep (height)
        self.modes2 = modes2  # Number of Fourier modes to keep (width)

        # Complex-valued spectral weights
        scale = 1.0 / (in_channels * out_channels)
        self.weights1 = nn.Parameter(
            scale * torch.rand(in_channels, out_channels, modes1, modes2, dtype=torch.cfloat)
        )
        self.weights2 = nn.Parameter(
            scale * torch.rand(in_channels, out_channels, modes1, modes2, dtype=torch.cfloat)
        )

    def _compl_mul2d(self, input: torch.Tensor, weights: torch.Tensor) -> torch.Tensor:
        """Complex multiplication in spectral domain."""
        # (B, C_in, H, W) × (C_in, C_out, H, W) → (B, C_out, H, W)
        return torch.einsum("bixy,ioxy->boxy", input, weights)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (B, C, H, W) spatial domain input
        Returns:
            (B, C_out, H, W) filtered output
        """
        B, C, H, W = x.shape

        # FFT
        x_ft = torch.fft.rfft2(x, norm="ortho")

        # Multiply relevant Fourier modes
        out_ft = torch.zeros(
            B, self.out_channels, H, W // 2 + 1,
            dtype=torch.cfloat, device=x.device
        )

        # Top-left corner modes
        m1 = min(self.modes1, H)
        m2 = min(self.modes2, W // 2 + 1)
        out_ft[:, :, :m1, :m2] = self._compl_mul2d(
            x_ft[:, :, :m1, :m2], self.weights1[:, :, :m1, :m2]
        )

        # Bottom-left corner modes (for symmetry)
        if H > self.modes1:
            out_ft[:, :, -m1:, :m2] = self._compl_mul2d(
                x_ft[:, :, -m1:, :m2], self.weights2[:, :, :m1, :m2]
            )

        # Inverse FFT
        return torch.fft.irfft2(out_ft, s=(H, W), norm="ortho")


class FNOBlock(nn.Module):
    """
    Single FNO block: Spectral Conv + Local Conv + Residual + Activation.
    
    Combines global (Fourier) and local (1×1 conv) processing with
    residual connection and GELU activation.
    """

    def __init__(self, channels: int, modes: int = 20):
        super().__init__()
        self.spectral_conv = SpectralConv2d(channels, channels, modes, modes)
        self.local_conv = nn.Conv2d(channels, channels, kernel_size=1)
        self.norm = nn.InstanceNorm2d(channels)
        self.activation = nn.GELU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Residual FNO block forward pass."""
        residual = x
        # Spectral path (global)
        x_spectral = self.spectral_conv(x)
        # Local path
        x_local = self.local_conv(x)
        # Combine + residual
        out = self.norm(x_spectral + x_local) + residual
        return self.activation(out)


class FNOEncoder(nn.Module):
    """
    Fourier Neural Operator encoder for environmental fields.
    
    Encodes ERA5 environmental snapshot into feature representation.
    FNO is chosen over CNN because atmospheric fields are PDE-governed
    and naturally expressed in Fourier space.
    
    Input: (B, 10, 80, 80) — 8 env vars + SST gradient + GPI
    Output: (B, 256, 16, 16) — spatial environmental features
    """

    def __init__(
        self,
        in_channels: int = 10,
        hidden_channels: int = 64,
        out_channels: int = 256,
        n_layers: int = 4,
        modes: int = 20,
    ):
        super().__init__()

        # Lifting layer: project input channels to hidden dimension
        self.lift = nn.Sequential(
            nn.Conv2d(in_channels, hidden_channels, kernel_size=1),
            nn.GELU(),
        )

        # Stack of FNO blocks
        self.fno_blocks = nn.ModuleList([
            FNOBlock(hidden_channels, modes) for _ in range(n_layers)
        ])

        # Projection to output channels
        self.project = nn.Sequential(
            nn.Conv2d(hidden_channels, out_channels, kernel_size=1),
            nn.GELU(),
        )

        # Adaptive pooling to match satellite feature resolution
        self.pool = nn.AdaptiveAvgPool2d((16, 16))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (B, 10, 80, 80) environmental fields
        Returns:
            (B, 256, 16, 16) environmental feature map
        """
        # Lift to hidden dimension
        h = self.lift(x)  # (B, 64, 80, 80)

        # Apply FNO blocks
        for block in self.fno_blocks:
            h = block(h)

        # Project to output channels
        h = self.project(h)  # (B, 256, 80, 80)

        # Pool to match satellite feature resolution
        h = self.pool(h)  # (B, 256, 16, 16)

        return h
