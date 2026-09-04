# SIH26070 Cyclone Prediction System — Deployment Guide

## Architecture Overview

```
┌────────────────────┐     HTTPS      ┌─────────────────────┐
│    Vercel CDN      │ ◄────────────► │   Railway Backend   │
│  (React Frontend)  │    /api proxy  │   (FastAPI + ML)    │
│                    │                │                     │
│  • Vite build      │                │  • Uvicorn ASGI     │
│  • Edge caching    │                │  • PyTorch models   │
│  • SSR ready       │                │  • SSE streaming    │
└────────────────────┘                └─────────────────────┘
```

---

## Step 1: Deploy Backend on Railway

### Prerequisites
- [Railway account](https://railway.app) (free tier available)
- GitHub repository linked to Railway

### Deploy Steps

1. **Login to Railway Dashboard** → Click **"New Project"** → **"Deploy from GitHub Repo"**

2. **Select the repository**: `A-P-S-Bhaidav/SIH26070-Cyclone-Prediction`

3. **Configure the service**:
   - **Root Directory**: Set to `backend/`
   - Railway will auto-detect the `Dockerfile` and `railway.toml`

4. **Set Environment Variables** in Railway dashboard:
   ```
   ENVIRONMENT=production
   DEMO_MODE=true
   LOG_LEVEL=info
   PORT=8000
   CORS_ORIGINS=https://your-frontend.vercel.app
   ```

5. **Deploy** → Railway builds and deploys automatically

6. **Get your Railway URL**: It will look like `https://your-app-production.up.railway.app`

7. **Verify**: Visit `https://your-app.railway.app/health` — should return `{"status": "ok"}`

### Railway CLI Alternative

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
cd backend/
railway link

# Deploy
railway up
```

---

## Step 2: Deploy Frontend on Vercel

### Prerequisites
- [Vercel account](https://vercel.com) (free tier)
- GitHub repository connected

### Deploy Steps

1. **Login to Vercel Dashboard** → **"Add New"** → **"Project"**

2. **Import the GitHub repo**: `A-P-S-Bhaidav/SIH26070-Cyclone-Prediction`

3. **Configure Build Settings**:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend/`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

4. **Set Environment Variables**:
   ```
   VITE_API_URL=https://your-app-production.up.railway.app/api/v1
   ```

5. **Update `vercel.json`** — Replace the Railway URL:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/(.*)",
         "destination": "https://your-app-production.up.railway.app/api/$1"
       },
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```

6. **Deploy** → Vercel builds and deploys automatically

7. **Verify**: Visit your Vercel URL — the dashboard should load with demo data

### Vercel CLI Alternative

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from frontend directory
cd frontend/
vercel

# Follow prompts to link project and deploy
# For production:
vercel --prod
```

---

## Step 3: Connect Frontend ↔ Backend

1. **Update CORS on Railway**:
   - Go to Railway dashboard → Variables
   - Set `CORS_ORIGINS` to your Vercel domain: `https://cyclone-ai.vercel.app`

2. **Update API URL on Vercel**:
   - Go to Vercel dashboard → Settings → Environment Variables
   - Set `VITE_API_URL` to your Railway URL: `https://your-app.railway.app/api/v1`

3. **Redeploy both** to pick up the changes.

---

## Step 4: Verify End-to-End

1. **Backend Health**: `curl https://your-app.railway.app/health`
2. **API Docs**: Visit `https://your-app.railway.app/docs` (Swagger UI)
3. **Frontend**: Visit your Vercel URL
4. **SSE Stream**: `curl -N https://your-app.railway.app/api/v1/stream/telemetry`

---

## Local Development

### Backend
```bash
cd backend/
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend/
npm install
npm run dev
# Opens at http://localhost:5173 with API proxy to :8000
```

---

## Environment Variables Reference

### Backend (Railway)
| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | `development` or `production` |
| `DEMO_MODE` | `true` | Use demo data instead of live inference |
| `LOG_LEVEL` | `info` | Logging level |
| `PORT` | `8000` | Server port |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |

### Frontend (Vercel)
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000/api/v1` | Backend API base URL |

---

## Monitoring

- **Railway**: Built-in metrics dashboard (CPU, memory, network)
- **Vercel**: Analytics dashboard (Core Web Vitals, traffic)
- **Backend Logs**: `railway logs` or Railway dashboard → Deployments → Logs
- **Health Check**: Railway auto-restarts on health check failure (configured in `railway.toml`)
