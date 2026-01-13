# ChessShare Review API - Deployment Guide

## Overview

This API handles server-side game analysis using Stockfish. It requires:
- Node.js 20+
- Stockfish binary (installed via apt)
- ~512MB-1GB RAM per Stockfish instance
- CPU-intensive workloads

## Deployment Options Comparison

| Platform | Pros | Cons | Cost | Best For |
|----------|------|------|------|----------|
| **Railway** | Easy Docker deploy, auto-scaling, good DX | Limited free tier | $5-50/mo | Production |
| **Render** | Simple, Docker support, free tier | Slower deploys | $7-25/mo | Budget production |
| **Fly.io** | Global edge, pay-per-use, great scaling | More complex setup | $5-30/mo | High traffic |
| **DigitalOcean App Platform** | Simple, reliable | Less auto-scaling | $12-48/mo | Stable workloads |
| **VPS (Hetzner/Vultr)** | Cheapest for heavy CPU | Manual scaling | $5-20/mo | Budget, predictable load |

### Recommendation: **Railway** for ease of use + scaling, or **Fly.io** for cost optimization at scale.

---

## Railway Deployment

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Create New Project
```bash
# Option A: From GitHub
# 1. Click "New Project"
# 2. Select "Deploy from GitHub repo"
# 3. Select your chessShare-review-api repo

# Option B: From CLI
npm install -g @railway/cli
railway login
railway init
railway link
```

### Step 3: Configure Environment Variables
In Railway dashboard → Your Project → Variables:

```env
# Required
NODE_ENV=production
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Stockfish (Railway auto-installs from Dockerfile)
STOCKFISH_PATH=/usr/games/stockfish
STOCKFISH_POOL_SIZE=4
STOCKFISH_DEPTH=18
STOCKFISH_TIMEOUT=10000

# CORS
ALLOWED_ORIGINS=https://www.chessshare.com,https://chess-share-khaki.vercel.app

# Rate Limiting
RATE_LIMIT_FREE_DAILY=3
RATE_LIMIT_PRO_DAILY=50
```

### Step 4: Configure Railway Settings
In Railway dashboard:

1. **Build Settings**:
   - Builder: Dockerfile
   - Watch Paths: `/src/**`, `/package.json`

2. **Deploy Settings**:
   - Healthcheck Path: `/api/v1/health`
   - Healthcheck Timeout: 30s

3. **Resources** (Pro plan):
   - vCPU: 2-4 (Stockfish is CPU intensive)
   - Memory: 1-2 GB
   - Enable auto-scaling: 1-3 instances

### Step 5: Deploy
```bash
# Push to GitHub (auto-deploys)
git push origin main

# Or manual deploy
railway up
```

### Step 6: Get Public URL
Railway provides a URL like: `your-app.railway.app`

Update your frontend `.env`:
```env
VITE_REVIEW_API_URL=https://your-app.railway.app
```

---

## Fly.io Deployment (Alternative - Better for Scale)

### Step 1: Install Fly CLI
```bash
brew install flyctl
# or
curl -L https://fly.io/install.sh | sh

flyctl auth login
```

### Step 2: Create fly.toml
```toml
# fly.toml
app = "chessshare-review-api"
primary_region = "fra"  # Frankfurt - close to EU users

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3001"
  STOCKFISH_PATH = "/usr/games/stockfish"
  STOCKFISH_POOL_SIZE = "4"
  STOCKFISH_DEPTH = "18"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "requests"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 1024
```

### Step 3: Set Secrets
```bash
flyctl secrets set SUPABASE_URL="https://your-project.supabase.co"
flyctl secrets set SUPABASE_SERVICE_KEY="your-service-role-key"
flyctl secrets set ALLOWED_ORIGINS="https://www.chessshare.com,https://chess-share-khaki.vercel.app"
```

### Step 4: Deploy
```bash
flyctl deploy
```

---

## Scaling Considerations

### Stockfish Resource Requirements
- Each Stockfish instance: ~200-400MB RAM
- Depth 18 analysis: ~50-150ms per position (native binary)
- Full game review (40 moves, ~80 positions): ~3-10 seconds with pool of 4 workers
- Native Stockfish is 2-3x faster than browser WASM

### Recommended Configuration

| Traffic Level | POOL_SIZE | RAM | vCPU | Instances |
|--------------|-----------|-----|------|-----------|
| Low (<100 reviews/day) | 2 | 512MB | 1 | 1 |
| Medium (100-500/day) | 4 | 1GB | 2 | 1-2 |
| High (500-2000/day) | 4-8 | 2GB | 4 | 2-4 |

### Auto-scaling Tips
1. Scale based on CPU usage (>70% = add instance)
2. Use `min_machines_running = 1` to avoid cold starts
3. Set `STOCKFISH_POOL_SIZE` based on vCPU count

---

## Monitoring

### Health Check Endpoint
```
GET /api/v1/health
```

Response:
```json
{
  "status": "healthy",
  "stockfish": "ready",
  "activeAnalyses": 2,
  "poolSize": 4,
  "uptime": 3600
}
```

### Recommended Monitoring
1. **Uptime**: Use UptimeRobot or Better Uptime (free tier)
2. **Logs**: Railway/Fly have built-in log viewers
3. **Alerts**: Set up alerts for:
   - Health check failures
   - Response time > 30s
   - Error rate > 5%

---

## Cost Estimation

### Railway (Pro plan)
- 2 vCPU, 1GB RAM: ~$10-15/month
- With auto-scaling: ~$20-40/month

### Fly.io
- shared-cpu-2x, 1GB: ~$10-15/month
- Pay-per-use scaling: varies

### Budget Option: Hetzner VPS
- CX21 (2 vCPU, 4GB): €5.68/month (~$6)
- Manual scaling required
- Best for predictable, low traffic

---

## Troubleshooting

### Stockfish not found
```bash
# Check in container
docker exec -it <container> which stockfish
# Should return: /usr/games/stockfish
```

### Memory issues
- Reduce `STOCKFISH_POOL_SIZE`
- Increase container memory
- Add swap (not recommended for production)

### Slow analysis
- Reduce `STOCKFISH_DEPTH` (16 instead of 18)
- Increase `STOCKFISH_POOL_SIZE`
- Add more instances

### CORS errors
- Verify `ALLOWED_ORIGINS` includes your frontend URL
- Check for trailing slashes

---

## Production Checklist

- [ ] Environment variables set
- [ ] CORS configured for production domains
- [ ] Health check working
- [ ] SSL/HTTPS enabled
- [ ] Rate limiting configured
- [ ] Monitoring set up
- [ ] Backup Supabase credentials securely
- [ ] Test full game review flow
- [ ] Update frontend `VITE_REVIEW_API_URL`
