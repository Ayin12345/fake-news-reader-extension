# Backend Deployment Guide
## Deploying Your NewsScan Backend to Cloud Services

This guide covers deploying your backend from localhost to cloud services like Render, Railway, Fly.io, or Heroku. This enables your extension to work for all users, not just when your computer is running.

---

## 🎯 Why Deploy to Cloud?

### Current Problem (Local Backend)
- ❌ **Only works when your computer is on** - Users can't use extension when you're offline
- ❌ **Only accessible on your network** - Friends can't use it remotely
- ❌ **No scalability** - Can't handle multiple users simultaneously
- ❌ **No reliability** - Crashes when your computer restarts/sleeps
- ❌ **Security risk** - Exposing your local network

### Benefits of Cloud Deployment
- ✅ **Always available** - 24/7 uptime for all users
- ✅ **Accessible from anywhere** - Works for users worldwide
- ✅ **Scalable** - Automatically handles multiple concurrent users
- ✅ **Reliable** - Auto-restarts on crashes, survives reboots
- ✅ **Secure** - Proper firewall, HTTPS, and isolation
- ✅ **Professional** - Production-ready infrastructure
- ✅ **Monitoring** - Built-in logs and health checks
- ✅ **Easy updates** - Deploy new versions without downtime

### Cost Comparison

**Local Development:**
- Free (but requires your computer always on)
- Electricity costs (~$5-10/month if running 24/7)

**Cloud Services (Free/Cheap Tiers):**
- **Render**: Free tier available (750 hours/month)
- **Railway**: $5/month starter plan
- **Fly.io**: Free tier (3 shared VMs)
- **Heroku**: $7/month (Eco dyno)
- **Vercel/Netlify**: Free for serverless (but need to refactor)

**Recommended for Start**: Render Free Tier or Railway ($5/month)

---

## 📋 Prerequisites

Before deploying, ensure you have:

1. ✅ **Completed PRODUCTION_MUST_HAVE.md checklist**
   - Redis cache implemented
   - Environment validation
   - Health check endpoint
   - Security headers
   - Error handling

2. ✅ **Git repository** (GitHub, GitLab, or Bitbucket)
   - Your code should be in version control
   - All changes committed

3. ✅ **Cloud service account**
   - Sign up for chosen service (see options below)

4. ✅ **Redis cloud instance** (or use managed Redis)
   - Local Redis won't work for cloud deployment
   - Need cloud-hosted Redis (see Redis setup section)

---

## 🚀 Deployment Options Comparison

### Option 1: Render (Recommended for Beginners)
**Best for**: Easy setup, free tier, good documentation

**Pros:**
- ✅ Free tier (750 hours/month)
- ✅ Very easy setup (connects to GitHub)
- ✅ Automatic HTTPS
- ✅ Built-in Redis add-on
- ✅ Auto-deploy on git push
- ✅ Free SSL certificates
- ✅ Good documentation

**Cons:**
- ⚠️ Free tier spins down after inactivity (15 min)
- ⚠️ Slower cold starts on free tier

**Pricing:**
- Free: 750 hours/month (enough for testing)
- Starter: $7/month (always-on)

**Link**: https://render.com

---

### Option 2: Railway
**Best for**: Simple deployment, good developer experience

**Pros:**
- ✅ Very simple setup
- ✅ $5/month starter plan (always-on)
- ✅ Built-in Redis add-on
- ✅ Auto-deploy from GitHub
- ✅ Good free trial credits

**Cons:**
- ⚠️ No free tier (only trial credits)
- ⚠️ Can get expensive with usage

**Pricing:**
- Starter: $5/month
- Pro: $20/month

**Link**: https://railway.app

---

### Option 3: Fly.io
**Best for**: Global distribution, edge deployment

**Pros:**
- ✅ Free tier (3 shared VMs)
- ✅ Global edge deployment
- ✅ Good performance worldwide
- ✅ Docker-based

**Cons:**
- ⚠️ More complex setup
- ⚠️ Requires Docker knowledge

**Pricing:**
- Free: 3 shared VMs
- Paid: Pay-as-you-go

**Link**: https://fly.io

---

### Option 4: Heroku
**Best for**: Traditional PaaS, well-established

**Pros:**
- ✅ Very established platform
- ✅ Many add-ons available
- ✅ Good documentation

**Cons:**
- ⚠️ More expensive ($7/month minimum)
- ⚠️ Removed free tier in 2022

**Pricing:**
- Eco: $7/month
- Basic: $25/month

**Link**: https://heroku.com

---

## 🎯 Recommended: Render Deployment (Step-by-Step)

We'll use Render as the example since it has the best free tier and easiest setup.

### Step 1: Prepare Your Code

**1.1 Ensure your backend folder structure is correct:**
```
backend/
  ├── server.js
  ├── package.json
  ├── routes/
  ├── services/
  ├── middleware/
  └── utils/
```

**1.2 Verify your `package.json` has a start script:**
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

**1.3 Create a `.gitignore` in backend folder (if not exists):**
```gitignore
# Dependencies
node_modules/

# Environment variables
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
```

**1.4 Commit your code to Git:**
```bash
cd backend
git add .
git commit -m "Prepare for cloud deployment"
git push origin main
```

---

### Step 2: Set Up Cloud Redis

Your local Redis won't work for cloud deployment. You need cloud-hosted Redis.

#### Option A: Render Redis (Easiest - Recommended)

1. Go to https://render.com
2. Sign up/login
3. Click **"New +"** → **"Redis"**
4. Configure:
   - **Name**: `newsscan-redis`
   - **Plan**: Free (or Starter for production)
   - **Region**: Choose closest to your users
5. Click **"Create Redis"**
6. Wait for Redis to start (~2 minutes)
7. Copy the **Internal Redis URL** (looks like `redis://red-xxxxx:6379`)
   - This is your `REDIS_URL` for Render services
8. Copy the **External Redis URL** (for local testing)
   - Format: `redis://red-xxxxx.render.com:6379`

#### Option B: Redis Cloud (Free Tier)

1. Go to https://redis.com/try-free/
2. Sign up for free account
3. Create a free database
4. Copy the connection URL
5. Format: `redis://default:password@host:port`

#### Option C: Upstash Redis (Serverless)

1. Go to https://upstash.com
2. Create free Redis database
3. Copy connection URL

**Important**: Save your Redis URL - you'll need it in Step 4!

---

### Step 3: Deploy Backend to Render

**3.1 Create New Web Service:**
1. Go to Render dashboard
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub/GitLab repository
4. Select your repository
5. Configure service:

**Basic Settings:**
- **Name**: `newsscan-backend` (or your preferred name)
- **Region**: Same region as Redis (for lower latency)
- **Branch**: `main` (or your main branch)
- **Root Directory**: `backend` (important!)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**Advanced Settings:**
- **Instance Type**: Free (or Starter for always-on)
- **Auto-Deploy**: Yes (deploys on every git push)

**3.2 Add Environment Variables:**

Click **"Environment"** tab and add:

```bash
# Required API Keys
OPENAI_API_KEY=sk-your-openai-key-here
GEMINI_API_KEY=AIza-your-gemini-key-here
GOOGLE_API_KEY=AIza-your-google-key-here
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Redis Connection (from Step 2)
REDIS_URL=redis://red-xxxxx:6379

# Optional Settings
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# CORS (Important for extension!)
ALLOWED_ORIGINS=chrome-extension://*
```

**Important Notes:**
- Use **Internal Redis URL** (not external) for `REDIS_URL` in Render
- Internal URL format: `redis://red-xxxxx:6379` (no `.render.com`)
- This allows Render services to communicate internally (faster, free)

**3.3 Deploy:**
1. Click **"Create Web Service"**
2. Render will:
   - Clone your repo
   - Install dependencies (`npm install`)
   - Start your server (`npm start`)
3. Wait 2-5 minutes for first deployment
4. Check logs for any errors

**3.4 Get Your Backend URL:**
- After deployment, Render provides a URL like:
  - `https://newsscan-backend.onrender.com`
- This is your production backend URL!

---

### Step 4: Verify Deployment

**4.1 Check Health Endpoint:**
```bash
curl https://your-backend-url.onrender.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "checks": {
    "apiKeys": { "openai": true, "gemini": true, ... },
    "cache": { "status": "connected", "redis": true },
    ...
  }
}
```

**4.2 Test Analysis Endpoint:**
```bash
curl -X POST https://your-backend-url.onrender.com/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test article",
    "providers": ["OpenAI"],
    "requestId": 1234567890
  }'
```

**4.3 Check Logs:**
- Go to Render dashboard → Your service → **"Logs"** tab
- Should see: `[NewsScan Backend] Server running on port 3000`
- Should see: `✅ Redis connected successfully`

---

### Step 5: Update Extension Configuration

**5.1 Update Extension `.env` file:**

Create or update `.env` in your extension root:

```bash
# Production Backend URL
VITE_BACKEND_URL=https://your-backend-url.onrender.com

# Optional: Access token if you enabled auth
# VITE_ACCESS_TOKEN=your-access-token
```

**5.2 Update `backendClient.ts` (if hardcoded):**

Check `src/utils/backendClient.ts` - ensure it uses environment variable:

```typescript
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
```

**5.3 Rebuild Extension:**
```bash
npm run build
```

**5.4 Test Extension:**
1. Load extension in Chrome
2. Try analyzing an article
3. Check browser console for any CORS errors
4. Verify requests go to your Render URL

---

## 🔧 Alternative: Railway Deployment

If you prefer Railway over Render:

### Step 1: Sign Up
1. Go to https://railway.app
2. Sign up with GitHub

### Step 2: Create New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Select your repository

### Step 3: Add Redis
1. Click **"+ New"** → **"Database"** → **"Add Redis"**
2. Railway automatically creates Redis instance
3. Note the Redis connection URL

### Step 4: Configure Service
1. Click on your service
2. Go to **"Variables"** tab
3. Add all environment variables (same as Render)
4. Set `REDIS_URL` to Railway's Redis URL

### Step 5: Deploy
1. Railway auto-detects Node.js
2. Set **Root Directory** to `backend`
3. Deploy happens automatically
4. Get your Railway URL (format: `https://your-app.up.railway.app`)

---

## 🔧 Alternative: Fly.io Deployment

For Fly.io (more advanced):

### Step 1: Install Fly CLI
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# macOS/Linux
curl -L https://fly.io/install.sh | sh
```

### Step 2: Login
```bash
fly auth login
```

### Step 3: Create Fly App
```bash
cd backend
fly launch
```

Follow prompts:
- App name: `newsscan-backend`
- Region: Choose closest
- PostgreSQL: No (we use Redis)
- Redis: Yes (Fly will create it)

### Step 4: Add Secrets
```bash
fly secrets set OPENAI_API_KEY=sk-your-key
fly secrets set GEMINI_API_KEY=AIza-your-key
fly secrets set GOOGLE_API_KEY=AIza-your-key
fly secrets set GOOGLE_SEARCH_ENGINE_ID=your-id
fly secrets set REDIS_URL=redis://your-redis-url
```

### Step 5: Deploy
```bash
fly deploy
```

---

## 🔒 Security Considerations

### 1. Environment Variables
- ✅ **Never commit `.env` files** to Git
- ✅ Use cloud service's environment variable UI
- ✅ Rotate API keys regularly
- ✅ Use different keys for dev/prod

### 2. CORS Configuration
- ✅ Set `ALLOWED_ORIGINS` to your extension ID in production
- ✅ Don't use `*` in production (security risk)
- ✅ Format: `chrome-extension://your-extension-id-here`

**How to get Extension ID:**
1. Load extension in Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Copy the ID under your extension

**Production CORS:**
```bash
ALLOWED_ORIGINS=chrome-extension://abcdefghijklmnopqrstuvwxyz123456
```

### 3. Rate Limiting
- ✅ Your existing rate limits protect against abuse
- ✅ Consider stricter limits for production
- ✅ Monitor rate limit hits in logs

### 4. HTTPS
- ✅ Cloud services provide free SSL (HTTPS)
- ✅ Always use HTTPS URLs in production
- ✅ Never use HTTP for API keys

---

## 📊 Monitoring Your Deployment

### Render Monitoring

**Logs:**
- Dashboard → Your service → **"Logs"** tab
- Real-time logs
- Search/filter capabilities

**Metrics:**
- CPU usage
- Memory usage
- Request count
- Response times

**Health Checks:**
- Render automatically checks `/api/health`
- Restarts service if unhealthy

### Railway Monitoring

**Logs:**
- Real-time streaming logs
- Search functionality

**Metrics:**
- CPU/Memory graphs
- Request metrics

### Custom Monitoring

**Health Check Script:**
```bash
#!/bin/bash
# monitor.sh - Check backend health every 5 minutes

while true; do
  response=$(curl -s https://your-backend-url.onrender.com/api/health)
  status=$(echo $response | jq -r '.status')
  
  if [ "$status" != "healthy" ]; then
    echo "ALERT: Backend is unhealthy!"
    # Add notification (email, Slack, etc.)
  fi
  
  sleep 300  # 5 minutes
done
```

---

## 🐛 Troubleshooting

### Issue: Deployment Fails

**Symptoms:**
- Build fails
- Service won't start

**Solutions:**
1. Check build logs in cloud dashboard
2. Verify `package.json` has correct start script
3. Ensure all dependencies are in `package.json` (not just devDependencies)
4. Check Node.js version compatibility
5. Verify root directory is set to `backend`

### Issue: Redis Connection Fails

**Symptoms:**
- Health check shows `"cache": { "status": "disconnected" }`
- Logs show Redis connection errors

**Solutions:**
1. **Render**: Use Internal Redis URL (not external)
   - Internal: `redis://red-xxxxx:6379`
   - External: `redis://red-xxxxx.render.com:6379` (for local testing only)
2. Verify Redis is running in cloud dashboard
3. Check `REDIS_URL` environment variable is set correctly
4. Ensure Redis and backend are in same region

### Issue: CORS Errors

**Symptoms:**
- Browser console shows CORS errors
- Extension can't connect to backend

**Solutions:**
1. Check `ALLOWED_ORIGINS` environment variable
2. Verify extension ID matches CORS config
3. Ensure backend URL uses HTTPS
4. Check backend logs for CORS warnings

### Issue: Free Tier Spins Down

**Symptoms:**
- First request after inactivity is slow (~30 seconds)
- Service appears "offline"

**Solutions:**
1. **Render Free Tier**: Spins down after 15 min inactivity
   - First request wakes it up (takes ~30 seconds)
   - Consider upgrading to Starter ($7/month) for always-on
2. **Keep-alive script** (if on free tier):
   ```bash
   # Ping every 10 minutes to keep alive
   */10 * * * * curl https://your-backend-url.onrender.com/api/health
   ```

### Issue: Environment Variables Not Working

**Symptoms:**
- Server starts but API calls fail
- Missing API key errors

**Solutions:**
1. Verify all variables are set in cloud dashboard
2. Check for typos in variable names
3. Ensure no extra spaces in values
4. Restart service after adding variables
5. Check logs for validation errors

### Issue: Extension Can't Connect

**Symptoms:**
- Extension shows connection errors
- Network tab shows failed requests

**Solutions:**
1. Verify `VITE_BACKEND_URL` in extension `.env`
2. Rebuild extension after changing `.env`
3. Check backend URL is accessible (test in browser)
4. Verify CORS configuration
5. Check browser console for specific errors

---

## 💰 Cost Optimization

### Free Tier Strategies

**Render Free Tier:**
- 750 hours/month = ~31 days of 24/7 uptime
- Perfect for testing and low-traffic apps
- Upgrade to Starter ($7/month) when you need always-on

**Railway:**
- $5/month starter plan
- Good value for always-on service
- Pay-as-you-go for usage

**Fly.io:**
- 3 shared VMs free
- Good for testing
- Scales automatically

### Reducing Costs

1. **Use caching aggressively** - Reduces API calls (saves money)
2. **Monitor usage** - Set up alerts for unexpected spikes
3. **Optimize code** - Faster responses = less compute time
4. **Use free tiers** - Start free, upgrade when needed
5. **Monitor Redis usage** - Free tiers have limits

---

## 🔄 Updating Your Deployment

### Automatic Updates (Recommended)

**Render/Railway:**
- Connect to GitHub
- Auto-deploys on every `git push`
- Zero-downtime deployments

**Process:**
1. Make changes locally
2. Test locally
3. Commit and push:
   ```bash
   git add .
   git commit -m "Update backend"
   git push origin main
   ```
4. Cloud service auto-deploys
5. Check logs to verify deployment

### Manual Updates

**Render:**
- Dashboard → Your service → **"Manual Deploy"** → **"Deploy latest commit"**

**Railway:**
- Dashboard → Your service → **"Redeploy"**

---

## 📈 Scaling Considerations

### When to Scale

**Signs you need to scale:**
- Response times increasing (>2 seconds)
- High error rates
- Rate limit frequently hit
- High CPU/memory usage

### Scaling Options

**Vertical Scaling (More Power):**
- Upgrade instance size
- More CPU/RAM
- Render: Free → Starter → Standard
- Railway: Starter → Pro

**Horizontal Scaling (More Instances):**
- Run multiple instances
- Load balancer distributes traffic
- Requires shared Redis (you have this ✅)
- Requires stateless app (you have this ✅)

**Render Scaling:**
- Dashboard → Your service → **"Settings"** → **"Scaling"**
- Set instance count (2+ for horizontal scaling)

**Railway Scaling:**
- Automatic scaling based on usage
- Or manual scaling in settings

---

## ✅ Deployment Checklist

Use this checklist before going live:

### Pre-Deployment
- [ ] Code committed to Git
- [ ] All tests passing locally
- [ ] Health endpoint working locally
- [ ] Redis cache working locally
- [ ] Environment variables documented

### Cloud Setup
- [ ] Cloud account created
- [ ] Redis instance created and running
- [ ] Backend service created
- [ ] All environment variables set
- [ ] Root directory set to `backend`
- [ ] Build/start commands configured

### Deployment
- [ ] Initial deployment successful
- [ ] Health endpoint returns 200
- [ ] Redis connection successful
- [ ] Logs show no errors
- [ ] Test analysis endpoint works

### Extension Update
- [ ] Extension `.env` updated with production URL
- [ ] Extension rebuilt
- [ ] Extension tested with production backend
- [ ] CORS configured correctly
- [ ] No console errors

### Post-Deployment
- [ ] Monitoring set up
- [ ] Alerts configured (optional)
- [ ] Documentation updated with production URL
- [ ] Team notified of production URL

---

## 🎓 Next Steps

After successful deployment:

1. **Monitor Usage**
   - Watch logs for errors
   - Monitor response times
   - Track API usage

2. **Set Up Alerts** (Optional)
   - Health check failures
   - High error rates
   - Unusual traffic spikes

3. **Optimize**
   - Review cache hit rates
   - Optimize slow endpoints
   - Reduce unnecessary API calls

4. **Document**
   - Update README with production URL
   - Document environment variables
   - Create runbook for common issues

5. **Scale When Needed**
   - Monitor metrics
   - Upgrade plan when needed
   - Add more instances if traffic grows

---

## 📚 Additional Resources

### Official Documentation
- **Render**: https://render.com/docs
- **Railway**: https://docs.railway.app
- **Fly.io**: https://fly.io/docs

### Related Guides
- `PRODUCTION_MUST_HAVE.md` - Critical production requirements
- `TESTING_GUIDE.md` - Testing your deployment
- `PRODUCTION_FUTURE.md` - Advanced features

### Support
- Render Support: https://render.com/docs/support
- Railway Discord: https://discord.gg/railway
- Fly.io Community: https://community.fly.io

---

## 🎉 Success!

Once deployed, your backend will be:
- ✅ Accessible 24/7
- ✅ Available to all users worldwide
- ✅ Scalable and reliable
- ✅ Production-ready

Your extension users can now use NewsScan anytime, anywhere!

---

**Last Updated**: Check your cloud service's latest documentation for any changes to deployment process.

