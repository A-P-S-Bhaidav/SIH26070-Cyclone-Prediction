import sys
import os

# Add the backend directory to the Python path so imports work correctly
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_path)

# Ensure the app runs in demo mode since Vercel can't hold the PyTorch models
os.environ["DEMO_MODE"] = "true"

from app.main import app
