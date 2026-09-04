"""
Model Service — manages ML model lifecycle.
Placeholder for production model loading and inference.
"""


class ModelService:
    """Manages loading and serving ML models for inference."""

    def __init__(self):
        self.genesis_model = None
        self.cyclone_model = None
        self.xgboost_model = None

    async def initialize(self):
        """Load model weights from disk."""
        # In production, this loads actual model weights
        # For demo, we raise to trigger demo mode fallback
        raise FileNotFoundError(
            "Model weights not found. Running in demo mode with pre-computed data."
        )
