# SIH26070 Cyclone Prediction System — Deployment Guide

## Architecture Overview (Unified Vercel Deployment)

The entire application (React Frontend + FastAPI Backend) is configured to deploy as a **single project on Vercel**. 

Vercel will build the frontend using Vite and host it on its global CDN, while simultaneously deploying the FastAPI backend as Serverless Python Functions (`/api/index.py`).

Because Vercel Serverless Functions have strict size limits (250MB), the heavy PyTorch ML models are excluded from the Vercel deployment. **The backend will automatically run in `DEMO_MODE=true` on Vercel**, serving the high-fidelity pre-computed data for Amphan, Fani, and Tauktae.

---

## Deployment Steps

### Prerequisites
- [Vercel account](https://vercel.com) (free tier)
- GitHub repository connected

### Deploy to Vercel

1. **Login to Vercel Dashboard** → Click **"Add New"** → **"Project"**
2. **Import the GitHub repo**: `A-P-S-Bhaidav/SIH26070-Cyclone-Prediction`
3. **Configure Build Settings** (Vercel should auto-detect everything based on the root config files):
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (Keep it as the default root)
   - **Build Command**: `npm run build` (This will trigger the root `package.json` to build the frontend)
   - **Output Directory**: `frontend/dist`
4. **Environment Variables**:
   - Vercel automatically maps the API to the same domain, so you **do not** need to set `VITE_API_URL` unless you are pointing to a different backend. The frontend will hit `/api/v1/...` which Vercel proxies to the Python Serverless Function.
5. **Click Deploy**
6. **Wait for the Build**: Vercel will install the slim Python requirements (FastAPI, Uvicorn, etc.) and build the React frontend.
7. **Verify**: Visit your Vercel URL — the dashboard should load perfectly with the demo data!

---

## How It Works Under the Hood

To make this monorepo work on Vercel, we added 4 files to the root of the repository:

1. **`/vercel.json`**: Tells Vercel how to route traffic. All traffic to `/api/*` goes to the Python function, and everything else goes to the React SPA.
2. **`/api/index.py`**: The entry point for Vercel's Python runtime. It imports the FastAPI app from `backend/app/main.py` and forces it into `DEMO_MODE`.
3. **`/requirements.txt`**: A highly trimmed-down Python dependencies file. It omits PyTorch, SciPy, and other heavy ML libraries so the backend fits within Vercel's 250MB Serverless Function limit.
4. **`/package.json`**: A simple script that tells Vercel to change into the `frontend/` directory, run `npm install`, and build the Vite app.

---

## Local Development

If you want to run the project locally (with full ML models):

### Backend
```bash
cd backend/
pip install -r requirements.txt  # This installs the FULL requirements, including PyTorch
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend/
npm install
npm run dev
# Opens at http://localhost:5173 with a Vite proxy pointing to your local :8000 backend
```
