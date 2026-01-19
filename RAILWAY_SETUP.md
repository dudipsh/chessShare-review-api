# Railway Setup Guide - ChessShare Review API

## Environment Strategy

We recommend **two separate Railway projects**:
- **Staging**: For testing and development
- **Production**: For live users

This provides isolation and safety - you can test changes without affecting production.

---

## Prerequisites

1. Railway account: https://railway.app (sign up with GitHub)
2. GitHub repo pushed with latest code

---

## Step 1: Push Code to GitHub

```bash
cd /Users/dudipartush/dev/newChessGame/chessShare-review-api
git push origin master
```

---

## Step 2: Create Railway Project (Staging)

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Find and select: `dudipsh/chessShare-review-api`
5. Click **"Deploy Now"**
6. **Rename the project** to `chessshare-api-staging` (click project name to rename)

### Later: Create Production Project

When ready for production, repeat the same steps and name it `chessshare-api-production`.

---

## Step 3: Configure Environment Variables

In Railway dashboard, click on your service → **Variables** tab.

Add these variables (copy-paste each one):

### Required Variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `3001` | Server port |
| `SUPABASE_URL` | `https://xxxxxxxxxxx.supabase.co` | Your Supabase URL |
| `SUPABASE_SERVICE_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Service Role Key (NOT anon key!) |
| `STOCKFISH_PATH` | `/usr/games/stockfish` | Stockfish binary path |
| `STOCKFISH_POOL_SIZE` | `4` | Number of parallel workers |
| `STOCKFISH_DEPTH` | `18` | Analysis depth |
| `STOCKFISH_TIMEOUT` | `10000` | Timeout per position (ms) |
| `ALLOWED_ORIGINS` | See below | CORS origins |

### ALLOWED_ORIGINS by Environment:

**Staging:**
```
http://localhost:8080,https://chess-share-khaki.vercel.app
```

**Production:**
```
https://www.chessshare.com,https://chessshare.com
```

### Rate Limiting:

| Variable | Value | Description |
|----------|-------|-------------|
| `RATE_LIMIT_FREE_DAILY` | `3` | Free tier daily limit |
| `RATE_LIMIT_PRO_DAILY` | `50` | Pro tier daily limit |

### Where to find Supabase credentials:

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (under "Project API keys") → `SUPABASE_SERVICE_KEY`

⚠️ **IMPORTANT**: Use `service_role` key, NOT `anon` key!

---

## Step 4: Configure Build Settings

In Railway dashboard, click on your service → **Settings** tab.

### Build Configuration:
- **Builder**: Nixpacks (auto-detected) or Dockerfile
- **Build Command**: `npm run build`
- **Start Command**: `npm start`

### If using Dockerfile (recommended):
Railway should auto-detect the Dockerfile. If not:
1. Go to Settings → Build
2. Set **Builder** to "Dockerfile"
3. Leave other fields empty (will use Dockerfile defaults)

---

## Step 5: Generate Domain

1. In Railway dashboard, click on your service
2. Go to **Settings** → **Networking**
3. Click **"Generate Domain"**
4. You'll get a URL like: `chessshare-review-api-production.up.railway.app`

---

## Step 6: Verify Deployment

Test the health endpoint:

```bash
curl https://YOUR-RAILWAY-URL/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "stockfish": "ready",
  "activeAnalyses": 0,
  "poolSize": 4,
  "uptime": 123
}
```

---

## Step 7: Update Frontend

In your `chessy-linker` project, update the environment variable:

### For local development (.env):
```
VITE_REVIEW_API_URL=https://YOUR-RAILWAY-URL
```

### For Vercel production:
1. Go to Vercel dashboard
2. Select `chess-share-khaki` project
3. Go to **Settings** → **Environment Variables**
4. Add: `VITE_REVIEW_API_URL` = `https://YOUR-RAILWAY-URL`
5. Redeploy

---

## Troubleshooting

### Build fails
- Check Railway logs for errors
- Make sure `package.json` has correct scripts
- Verify TypeScript compiles locally: `npm run build`

### Stockfish not found
- Make sure Dockerfile is being used (not Nixpacks)
- Check logs for Stockfish installation

### CORS errors
- Verify `ALLOWED_ORIGINS` includes your frontend URL
- No trailing slashes in URLs
- Check for typos

### Health check fails
- Wait 30-60 seconds after deploy
- Check Railway logs for startup errors
- Verify port is 3001

### Rate limiting
- Check Supabase connection
- Verify `SUPABASE_SERVICE_KEY` is correct (service_role, not anon)

---

## Scaling (When Needed)

In Railway dashboard → Settings:

1. **Increase Resources**:
   - vCPU: 2 → 4
   - Memory: 1GB → 2GB

2. **Add Instances**:
   - Enable "Horizontal Scaling"
   - Set min: 1, max: 3

3. **Increase Pool Size**:
   - Update `STOCKFISH_POOL_SIZE` to match vCPU count

---

## Costs

Railway Pro plan (~$5/month base + usage):
- 2 vCPU, 1GB RAM: ~$10-15/month
- 4 vCPU, 2GB RAM: ~$25-35/month

---

## Quick Checklist

- [ ] Code pushed to GitHub
- [ ] Railway project created from GitHub repo
- [ ] Environment variables set (especially SUPABASE_SERVICE_KEY!)
- [ ] Domain generated
- [ ] Health check passes
- [ ] Frontend updated with new API URL
- [ ] Test a game review end-to-end
