"""
PyTorch Dataset and Training Pipeline for the Cyclone Analysis Model.
"""

import numpy as np
import torch
from torch.utils.data import Dataset
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class CycloneDataset(Dataset):
    """
    PyTorch Dataset for cyclone analysis training.
    
    Each sample contains:
    - satellite_tensor: (9, 256, 256) — 3 channels × 3 time steps
    - env_tensor: (10, 80, 80) — environmental fields
    - labels: dict with vmax, mslp, category, ri_flag, track displacement
    - availability_mask: (9,) binary mask for missing channels
    """

    def __init__(
        self,
        satellite_data: List[np.ndarray],
        env_data: List[np.ndarray],
        labels: List[Dict],
        augment: bool = False,
    ):
        self.satellite_data = satellite_data
        self.env_data = env_data
        self.labels = labels
        self.augment = augment

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        sat = self.satellite_data[idx].astype(np.float32)
        env = self.env_data[idx].astype(np.float32)
        label = self.labels[idx]

        # Create availability mask (1 = available)
        mask = np.ones(sat.shape[0], dtype=np.float32)
        # Zero out channels that are entirely 0 (missing)
        for c in range(sat.shape[0]):
            if np.all(sat[c] == 0):
                mask[c] = 0.0

        # Data augmentation
        if self.augment:
            sat, env = self._augment(sat, env)

        return {
            "satellite": torch.from_numpy(sat),
            "env": torch.from_numpy(env),
            "availability_mask": torch.from_numpy(mask),
            "vmax_kt": torch.tensor(label.get("vmax_kt", 0.0), dtype=torch.float32),
            "mslp_hpa": torch.tensor(label.get("mslp_hpa", 1010.0), dtype=torch.float32),
            "category": torch.tensor(label.get("category_idx", 0), dtype=torch.long),
            "ri_flag": torch.tensor(label.get("ri_flag", 0), dtype=torch.float32),
        }

    def _augment(
        self, sat: np.ndarray, env: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Apply data augmentation: random rotation and horizontal flip."""
        # Random horizontal flip
        if np.random.random() > 0.5:
            sat = sat[:, :, ::-1].copy()
            env = env[:, :, ::-1].copy()

        # Random rotation (90° increments for rotational equivariance)
        k = np.random.randint(0, 4)
        if k > 0:
            sat = np.rot90(sat, k=k, axes=(1, 2)).copy()
            env = np.rot90(env, k=k, axes=(1, 2)).copy()

        return sat, env


def split_train_val_test(
    labels: List[Dict],
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> Tuple[List[int], List[int], List[int]]:
    """
    Temporal split to prevent data leakage.
    
    Sorts by timestamp and splits chronologically:
    first 70% → train, next 15% → val, last 15% → test
    
    Args:
        labels: List of label dicts (must contain 'timestamp' or index order)
        train_ratio: Training set fraction
        val_ratio: Validation set fraction
    Returns:
        (train_indices, val_indices, test_indices)
    """
    n = len(labels)
    
    # Sort by timestamp if available, otherwise use natural order
    if labels and "timestamp" in labels[0]:
        indices = sorted(range(n), key=lambda i: labels[i]["timestamp"])
    else:
        indices = list(range(n))

    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    train_idx = indices[:n_train]
    val_idx = indices[n_train:n_train + n_val]
    test_idx = indices[n_train + n_val:]

    logger.info("Split: train=%d, val=%d, test=%d", len(train_idx), len(val_idx), len(test_idx))
    return train_idx, val_idx, test_idx


class CycloneTrainer:
    """
    Training loop for the multi-task cyclone analysis model.
    """

    def __init__(
        self,
        model: torch.nn.Module,
        optimizer: torch.optim.Optimizer,
        scheduler: Optional[torch.optim.lr_scheduler._LRScheduler] = None,
        device: str = "cpu",
    ):
        self.model = model.to(device)
        self.device = device
        self.optimizer = optimizer
        self.scheduler = scheduler

    def train_epoch(
        self,
        dataloader: torch.utils.data.DataLoader,
    ) -> Dict[str, float]:
        """Run one training epoch."""
        self.model.train()
        total_loss = 0.0
        n_batches = 0

        for batch in dataloader:
            sat = batch["satellite"].to(self.device)
            env = batch["env"].to(self.device)
            mask = batch["availability_mask"].to(self.device)

            self.optimizer.zero_grad()

            # Forward pass (single frame for simplicity)
            outputs = self.model(
                satellite_frames=[sat],
                env_input=env,
                availability_mask=mask,
            )

            # Compute losses (simplified — uses IntensityLoss in production)
            vmax_loss = torch.nn.functional.huber_loss(
                outputs["vmax_kt"], batch["vmax_kt"].to(self.device)
            )
            cat_loss = torch.nn.functional.cross_entropy(
                outputs["category_logits"], batch["category"].to(self.device)
            )
            loss = vmax_loss + cat_loss

            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()

            total_loss += loss.item()
            n_batches += 1

        if self.scheduler:
            self.scheduler.step()

        return {"loss": total_loss / max(n_batches, 1)}

    @torch.no_grad()
    def validate(
        self,
        dataloader: torch.utils.data.DataLoader,
    ) -> Dict[str, float]:
        """Run validation."""
        self.model.eval()
        total_loss = 0.0
        n_batches = 0
        vmax_errors = []

        for batch in dataloader:
            sat = batch["satellite"].to(self.device)
            env = batch["env"].to(self.device)
            mask = batch["availability_mask"].to(self.device)

            outputs = self.model(
                satellite_frames=[sat],
                env_input=env,
                availability_mask=mask,
            )

            vmax_loss = torch.nn.functional.huber_loss(
                outputs["vmax_kt"], batch["vmax_kt"].to(self.device)
            )
            cat_loss = torch.nn.functional.cross_entropy(
                outputs["category_logits"], batch["category"].to(self.device)
            )
            loss = vmax_loss + cat_loss

            vmax_err = torch.abs(
                outputs["vmax_kt"] - batch["vmax_kt"].to(self.device)
            ).mean().item()
            vmax_errors.append(vmax_err)

            total_loss += loss.item()
            n_batches += 1

        return {
            "val_loss": total_loss / max(n_batches, 1),
            "vmax_mae": np.mean(vmax_errors) if vmax_errors else 0.0,
        }
