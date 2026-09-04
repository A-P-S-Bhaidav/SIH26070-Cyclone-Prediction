# SIH26070 — CycloneAI: NIO Cyclone Prediction System

AI-powered end-to-end cyclone prediction system for the North Indian Ocean basin, built for Smart India Hackathon 2024.

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend** | FastAPI + Uvicorn | REST API, SSE streaming, model serving |
| **Frontend** | React + TypeScript + Vite | Interactive dashboard with canvas map |
| **ML Pipeline** | PyTorch + timm + scipy | Multi-task prediction models |
| **Deployment** | Railway (backend) + Vercel (frontend) | Low-latency separated deployment |

## Key Features

- **Genesis Prediction** — Swin-T model on anomaly+GPI fields (24/48/72h)
- **Multi-Task Analysis** — Intensity, RI, Dvorak pattern, T-number estimation
- **Track Forecasting** — CLIPER + NWP Steering + Analog Ensemble + KDE Cone
- **Uncertainty Quantification** — MC Dropout (N=30) with calibrated probabilities
- **Explainability** — GradCAM attention heatmaps for IMD forecaster trust
- **Real-Time Streaming** — SSE telemetry for live dashboard updates
- **Demo Mode** — Pre-computed data for Amphan, Fani, Tauktae cyclones

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# API at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:5173
```

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/           # REST routes & schemas
│   │   ├── core/
│   │   │   ├── models/    # PyTorch model architectures
│   │   │   ├── inference/ # Post-processing & verification
│   │   │   └── utils/     # Physics & Dvorak utilities
│   │   └── services/      # Business logic & demo data
│   ├── Dockerfile
│   └── railway.toml
├── frontend/
│   ├── src/
│   │   ├── components/    # React dashboard components
│   │   └── api/           # API client
│   └── vercel.json
├── ml_pipeline/
│   ├── data_preparation/  # IBTrACS, TCIR, ERA5 loaders
│   └── training/          # Dataset builder & trainer
├── DEPLOYMENT.md          # Deployment guide
└── sih26070_complete_pipeline.md
```

## ML Model Architecture

```
Satellite (9, 256, 256) ─→ Swin-T Encoder ─→ BiFPN ─→ TemporalGRU ─┐
                                                                       ├→ [1536] → Intensity/RI/Dvorak
Environment (10, 80, 80) ─→ FNO Encoder ─→ Cross-Attention Fusion ──┘
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Railway + Vercel deployment instructions.

## License

This project is built for SIH 2024 evaluation purposes.
