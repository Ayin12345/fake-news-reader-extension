# Testing Guide
## Complete Testing Instructions for NewsScan Backend

This guide covers how to test all backend features, including Redis cache, health checks, and API endpoints.

---

## Prerequisites

Before testing, ensure you have:
- ✅ Node.js installed (v18+)
- ✅ All dependencies installed (`npm install` in backend folder)
- ✅ Environment variables configured (`.env` file)
- ✅ Redis installed and running (see below)

---

## 1. Starting Redis Cache

Redis is **required** for the backend to work properly. It handles caching to prevent duplicate API calls.

### Quick Setup

**Windows (Easiest):**
1. Download Redis for Windows: https://github.com/microsoftarchive/redis/releases
2. Install the `.msi` file
3. Redis starts automatically
4. Test: Open PowerShell and run `redis-cli ping` (should return PONG)

**macOS/Linux:**
```bash
# macOS
brew install redis
redis-server

# Linux
sudo apt install redis-server
redis-server
```

**Or use Docker (if installed):**
```bash
docker run -d -p 6379:6379 --name redis redis:alpine
```

### Configure Redis URL

Add to your `backend/.env` file:
```bash
REDIS_URL=redis://localhost:6379
```

### Verify Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

---

## 2. Starting the Backend Server

```bash
cd backend

# Install dependencies (if not done)
npm install

# Start server
npm start

# Or for development with auto-reload
npm run dev
```

**Expected output:**
```
✅ Redis connected successfully
[NewsScan Backend] Server running on port 3000
[NewsScan Backend] Environment: development
[NewsScan Backend] Allowed origins: chrome-extension://*
[NewsScan Backend] Rate limiting: Enabled
[NewsScan Backend] Caching: Enabled
```

**If you see Redis connection errors:**
- Make sure Redis is running (see section 1)
- Check `REDIS_URL` in `.env` file
- Verify Redis is accessible on the configured port

---

## 3. Testing the Health Endpoint

The health endpoint is the easiest way to verify everything is working.

### Basic Health Check

```bash
# Using curl
curl http://localhost:3000/api/health

# Using PowerShell (Windows)
Invoke-WebRequest -Uri http://localhost:3000/api/health | Select-Object -ExpandProperty Content

# Or open in browser
# http://localhost:3000/api/health
```

### Expected Response (Healthy)

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0",
  "checks": {
    "apiKeys": {
      "openai": true,
      "gemini": true,
      "google": true,
      "googleSearchEngineId": true
    },
    "cache": {
      "status": "connected",
      "redis": true
    },
    "memory": {
      "used": 45,
      "total": 128,
      "external": 2,
      "rss": 180,
      "unit": "MB"
    },
    "server": {
      "nodeVersion": "v20.0.0",
      "platform": "linux"
    }
  }
}
```

### Expected Response (Degraded/Unhealthy)

If something is wrong, you'll get `503` status with:
```json
{
  "status": "degraded",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0",
  "checks": {
    "apiKeys": {
      "openai": false,  // Missing API key
      "gemini": true,
      "google": true,
      "googleSearchEngineId": true
    },
    "cache": {
      "status": "disconnected",  // Redis not connected
      "redis": false
    },
    ...
  }
}
```

### Health Check Status Codes

- **200**: All systems healthy ✅
- **503**: Degraded or unhealthy ⚠️

### What Each Check Means

- **apiKeys**: Verifies all required API keys are set in environment
- **cache.status**: Checks if Redis is connected
- **cache.redis**: Redis ping test (true = connected)
- **memory**: Current memory usage (useful for monitoring)
- **uptime**: How long the server has been running (in seconds)

---

## 4. Testing API Endpoints

### Test Analysis Endpoint

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test article content here...",
    "providers": ["OpenAI", "Gemini"],
    "requestId": 1234567890
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "successfulResults": [
      {
        "provider": "OpenAI",
        "result": {
          "credibility_score": 75,
          "credibility_summary": "...",
          "reasoning": "...",
          "evidence_sentences": [...],
          "supporting_links": [...]
        }
      }
    ],
    "failedProviders": []
  },
  "requestId": 1234567890
}
```

**Testing Cache:**
1. Make the same request twice
2. First request: Should call AI APIs (slower, ~5-10 seconds)
3. Second request: Should return cached result (faster, ~10-50ms)
4. Check response for `"cached": true` in second request

### Test Web Search Endpoint

```bash
curl -X POST http://localhost:3000/api/web-search \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Article Title",
    "url": "https://example.com/article",
    "limit": 5
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "url": "https://source.com/article",
        "title": "Related article title",
        "snippet": "Article preview..."
      }
    ],
    "searchMethod": "ai-generated",
    "queryUsed": "search query"
  }
}
```

---

## 5. Testing Cache Functionality

### Verify Cache is Working

1. **Make a request** (should be slow, calling AI APIs):
```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test article", "providers": ["OpenAI"]}'
```

2. **Make the same request again** (should be fast, from cache):
```bash
# Use exact same prompt
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test article", "providers": ["OpenAI"]}'
```

3. **Check response**: Second request should have `"cached": true` and be much faster

### Check Redis Cache Directly

```bash
# Connect to Redis CLI
redis-cli

# Or with Docker
docker exec -it redis redis-cli

# List all keys
KEYS *

# Get a specific key (if you know the hash)
GET <cache-key-hash>

# Check TTL (time to live) of a key
TTL <cache-key-hash>

# Clear all cache (use with caution!)
FLUSHDB
```

### Cache Duration

- **Analysis cache**: 7 days (604,800 seconds)
- **Web search cache**: 24 hours (86,400 seconds)

---

## 6. Testing Rate Limiting

### Test Rate Limits

**Analysis endpoint** (100 requests/hour):
```bash
# Make 101 requests quickly
for i in {1..101}; do
  curl -X POST http://localhost:3000/api/analyze \
    -H "Content-Type: application/json" \
    -d '{"prompt": "Test", "providers": ["OpenAI"]}'
done
```

After 100 requests, you should get:
```json
{
  "success": false,
  "error": "Too many analysis requests. Please try again later."
}
```

**Health endpoint** should NOT be rate limited (for monitoring):
```bash
# Make many health checks - should always work
for i in {1..1000}; do
  curl http://localhost:3000/api/health
done
```

---

## 7. Testing Error Handling

### Test Missing API Keys

Temporarily remove an API key from `.env`:
```bash
# Comment out OPENAI_API_KEY
# OPENAI_API_KEY=sk-...
```

Restart server - should fail fast with error:
```
❌ Missing required environment variables: OPENAI_API_KEY
Environment validation failed: Missing required environment variables: OPENAI_API_KEY
```

### Test Invalid Request

```bash
# Missing required fields
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{}'

# Should return validation error
```

### Test Large Request

```bash
# Request body over 1MB limit
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt": "'$(python -c "print('x' * 2000000)")'", "providers": ["OpenAI"]}'

# Should be rejected with error
```

---

## 8. Complete Testing Checklist

Use this checklist to verify everything works:

### Setup ✅
- [ ] Redis is running (`redis-cli ping` returns PONG)
- [ ] All environment variables are set
- [ ] Backend server starts without errors
- [ ] Health endpoint returns `200` status

### Health Check ✅
- [ ] Health endpoint accessible at `/api/health`
- [ ] Returns `status: "healthy"` when all systems OK
- [ ] Shows Redis connection status
- [ ] Shows API key status
- [ ] Shows memory usage

### Cache ✅
- [ ] First request calls AI APIs (slow)
- [ ] Second identical request uses cache (fast)
- [ ] Cache response includes `"cached": true`
- [ ] Redis stores cache keys (check with `redis-cli KEYS *`)

### API Endpoints ✅
- [ ] Analysis endpoint works (`/api/analyze`)
- [ ] Web search endpoint works (`/api/web-search`)
- [ ] Both endpoints return proper JSON responses
- [ ] Error responses are user-friendly

### Rate Limiting ✅
- [ ] Analysis endpoint rate limits after 100 requests/hour
- [ ] Web search endpoint rate limits after 50 requests/hour
- [ ] Health endpoint is NOT rate limited

### Error Handling ✅
- [ ] Missing API keys cause startup failure
- [ ] Invalid requests return proper error messages
- [ ] Large requests are rejected
- [ ] Redis disconnection is handled gracefully

---

## 9. Common Issues & Troubleshooting

### Issue: Redis Connection Failed

**Symptoms:**
- Health check shows `"cache": { "status": "disconnected" }`
- Server logs show: `Redis connection error`

**Solutions:**
1. Check if Redis is running:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

2. Check Redis URL in `.env`:
   ```bash
   REDIS_URL=redis://localhost:6379
   ```

3. Restart Redis:
   ```bash
   # Windows (as service)
   net stop redis
   net start redis
   
   # macOS/Linux
   redis-server
   ```

### Issue: Health Check Returns 503

**Symptoms:**
- Health endpoint returns `status: "degraded"` or `status: "unhealthy"`

**Check:**
1. Are all API keys set? (Check `checks.apiKeys`)
2. Is Redis connected? (Check `checks.cache.status`)
3. Check server logs for errors

### Issue: Cache Not Working

**Symptoms:**
- Second request still calls AI APIs
- No `"cached": true` in response

**Solutions:**
1. Verify Redis is connected (check health endpoint)
2. Check cache key generation (same prompt = same key)
3. Verify cache TTL hasn't expired
4. Check Redis directly: `redis-cli KEYS *`

### Issue: Server Won't Start

**Symptoms:**
- Server exits immediately
- Error about missing environment variables

**Solutions:**
1. Check `.env` file exists in `backend/` folder
2. Verify all required variables are set:
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - `GOOGLE_API_KEY`
   - `GOOGLE_SEARCH_ENGINE_ID`
3. Check for typos in variable names
4. Restart server after adding variables

### Issue: Rate Limiting Too Strict

**Symptoms:**
- Getting rate limited quickly
- Need to test more

**Solutions:**
1. Wait for rate limit window to reset (1 hour for analyze endpoint)
2. Or restart server (resets rate limit in development)
3. Or modify rate limits in `backend/middleware/rateLimiting.js` for testing

---

## 10. Quick Test Commands

Copy-paste these commands for quick testing:

```bash
# 1. Make sure Redis is running (see section 1)

# 2. Start backend server
cd backend && npm start

# 3. Test health endpoint
curl http://localhost:3000/api/health

# 4. Test analysis endpoint
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test", "providers": ["OpenAI"]}'

# 5. Test cache (run same command twice - second should be faster)
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test", "providers": ["OpenAI"]}'
```

---

## 11. Monitoring During Testing

### Watch Server Logs

```bash
# Terminal 1: Start server
cd backend && npm start

# Terminal 2: Watch logs (if using file logging)
tail -f logs/combined.log
```

### Monitor Redis

```bash
# Watch Redis commands
docker exec -it redis redis-cli MONITOR

# Check Redis memory usage
docker exec -it redis redis-cli INFO memory

# Check number of keys
docker exec -it redis redis-cli DBSIZE
```

### Monitor Health Endpoint

```bash
# Continuous health checks
watch -n 5 curl -s http://localhost:3000/api/health | jq

# Or simple loop
while true; do
  curl -s http://localhost:3000/api/health | jq '.status'
  sleep 5
done
```

---

## 12. Production Testing

Before deploying to production, test:

1. **Environment validation**: Remove an API key, verify server fails fast
2. **Redis connection**: Disconnect Redis, verify graceful handling
3. **Rate limiting**: Verify limits work correctly
4. **Cache expiration**: Wait for cache to expire, verify new requests work
5. **Error responses**: Verify user-friendly error messages (no stack traces)
6. **Health endpoint**: Verify returns proper status codes
7. **Concurrent requests**: Test multiple simultaneous requests
8. **Memory usage**: Monitor memory during load testing

---

## Need Help?

If you encounter issues:

1. Check server logs for error messages
2. Verify health endpoint status
3. Check Redis connection
4. Verify environment variables
5. Review this guide's troubleshooting section

For more details, see:
- `PRODUCTION_MUST_HAVE.md` - Critical production requirements
- `DEPLOYMENT_GUIDE.md` - How to deploy backend to cloud services (Render, Railway, etc.)
- `backend/README.md` - Backend API documentation

---

**Happy Testing! 🚀**

