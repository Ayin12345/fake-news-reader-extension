# Production MUST-HAVE Checklist
## Critical Items Needed Before Testing with Users

**Goal**: Make the app scalable and reliable enough for friends/testers to use without breaking  
**Timeline**: Complete before inviting testers  
**Focus**: Scalability, reliability, and essential security

---

## 🎯 Why These Are Critical

When multiple users start using your app simultaneously, these issues will cause:
- **Cache conflicts** (in-memory cache won't work with multiple users)
- **Silent failures** (missing env vars cause crashes)
- **Resource exhaustion** (no timeouts/limits)
- **No visibility** (can't debug issues without logs/health checks)
- **Security vulnerabilities** (missing headers)

---

## ✅ MUST-HAVE Checklist

### 1. Redis Cache Migration 🔴 CRITICAL
**Why**: In-memory cache breaks with multiple concurrent users. Each user gets their own cache instance, leading to:
- Zero cache hits (wasted API calls = wasted money)
- Inconsistent results
- Memory issues on server

**Implementation**:
```bash
# Install Redis client
cd backend
npm install ioredis
```

```javascript
// backend/services/redisCache.js
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export class RedisCache {
  async set(key, value, ttlMs = 3600000) {
    await redis.setex(key, Math.floor(ttlMs / 1000), JSON.stringify(value));
  }
  
  async get(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
  
  async delete(key) {
    await redis.del(key);
  }
  
  async clear() {
    await redis.flushdb();
  }
  
  // Get cache stats
  async getStats() {
    const info = await redis.info('stats');
    const keyspace = await redis.info('keyspace');
    return { info, keyspace };
  }
}

export const analysisCache = new RedisCache();
export const webSearchCache = new RedisCache();
```

**Update cache usage**:
```javascript
// backend/routes/analyze.js - Update imports
import { analysisCache } from '../services/redisCache.js';

// Update cache calls to async
const cachedResult = await analysisCache.get(cacheKey);
if (cachedResult) {
  return res.json({ ... });
}

// Cache successful results
if (successfulResults.length > 0) {
  await analysisCache.set(cacheKey, response, 72 * 60 * 60 * 1000);
}
```

**Setup Redis**:
- **Local**: `docker run -d -p 6379:6379 redis:alpine`
- **Production**: Use managed Redis (AWS ElastiCache, Redis Cloud free tier, or Railway)

**Environment Variable**:
```bash
REDIS_URL=redis://localhost:6379
```

---

### 2. Environment Variable Validation 🔴 CRITICAL
**Why**: Prevents silent failures. If API keys are missing, the app should fail fast at startup, not when users try to use it.

**Implementation**:
```javascript
// backend/utils/envValidator.js
export function validateEnvironment() {
  const required = [
    'OPENAI_API_KEY',
    'GEMINI_API_KEY', 
    'GOOGLE_API_KEY',
    'GOOGLE_SEARCH_ENGINE_ID'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate formats
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-')) {
    console.warn('⚠️  WARNING: OpenAI API key format may be invalid');
  }
  
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('AIza')) {
    console.warn('⚠️  WARNING: Gemini API key format may be invalid');
  }
  
  // Validate Redis URL if provided
  if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('redis://')) {
    console.warn('⚠️  WARNING: Redis URL format may be invalid');
  }
  
  console.log('✅ All required environment variables are set');
}

export function getOptionalEnv(key, defaultValue) {
  return process.env[key] || defaultValue;
}
```

**Update server.js**:
```javascript
// backend/server.js - Add at the top, before creating app
import { validateEnvironment } from './utils/envValidator.js';

// Validate environment before starting
try {
  validateEnvironment();
} catch (error) {
  console.error('❌ Environment validation failed:', error.message);
  process.exit(1);
}

const app = express();
// ... rest of server.js
```

---

### 3. Health Check Endpoint 🔴 CRITICAL
**Why**: Need to know if the service is working. Essential for monitoring and debugging.

**Implementation**:
```javascript
// backend/routes/health.js
import { analysisCache, webSearchCache } from '../services/redisCache.js';

export async function healthRoute(req, res) {
  try {
    // Check Redis connection
    let cacheStatus = 'unknown';
    try {
      await analysisCache.get('health-check');
      cacheStatus = 'connected';
    } catch (error) {
      cacheStatus = 'disconnected';
    }
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        apiKeys: {
          openai: !!process.env.OPENAI_API_KEY,
          gemini: !!process.env.GEMINI_API_KEY,
          google: !!process.env.GOOGLE_API_KEY
        },
        cache: {
          status: cacheStatus,
          // Note: Redis stats would go here if needed
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB'
        }
      }
    };
    
    // Determine overall health
    const isHealthy = 
      health.checks.apiKeys.openai &&
      health.checks.apiKeys.gemini &&
      health.checks.apiKeys.google &&
      health.checks.cache.status === 'connected';
    
    health.status = isHealthy ? 'healthy' : 'degraded';
    
    res.status(isHealthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
```

**Update server.js**:
```javascript
// backend/server.js - Add route
import { healthRoute } from './routes/health.js';

// Add before other routes
app.get('/api/health', healthRoute);
```

**Test it**:
```bash
curl http://localhost:3000/api/health
```

---

### 4. Basic Security Headers 🔴 CRITICAL
**Why**: Prevents common attacks. Essential even for testing.

**Implementation**:
```bash
cd backend
npm install helmet
```

```javascript
// backend/server.js - Add after express() creation
import helmet from 'helmet';

// Add security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  crossOriginEmbedderPolicy: false, // May need to adjust for extension
  crossOriginResourcePolicy: { policy: "cross-origin" } // For extension access
}));
```

---

### 5. Request Size Limits 🔴 CRITICAL
**Why**: Prevents memory exhaustion from malicious or accidental large requests.

**Implementation**:
```javascript
// backend/server.js - Update express.json() calls
app.use(express.json({ 
  limit: '1mb', // Max 1MB request body
  strict: true 
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '1mb',
  parameterLimit: 50 // Max 50 parameters
}));
```

---

### 6. Request Timeout Protection 🔴 CRITICAL
**Why**: Prevents slow requests from exhausting server resources.

**Implementation**:
```bash
cd backend
npm install express-timeout-handler
```

```javascript
// backend/server.js - Add after middleware setup
import timeout from 'express-timeout-handler';

app.use(timeout.handler({
  timeout: 60000, // 60 seconds (matches your analysis timeout)
  onTimeout: (req, res) => {
    if (!res.headersSent) {
      res.status(504).json({ 
        success: false,
        error: 'Request timeout. The analysis took too long.',
        timestamp: new Date().toISOString()
      });
    }
  },
  disable: ['write', 'setHeaders', 'send', 'json', 'end']
}));
```

---

### 7. Basic Structured Logging 🔴 CRITICAL
**Why**: Need to see what's happening when users report issues. Console.log isn't enough.

**Implementation**:
```bash
cd backend
npm install winston
```

```javascript
// backend/utils/logger.js
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'newsscan-backend' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      )
    }),
    // Write errors to file
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs to file
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Replace console.log/error/warn with logger
export default logger;
```

**Update server.js**:
```javascript
// backend/server.js
import logger from './utils/logger.js';

// Replace console.log with logger
logger.info('Server starting...');
logger.error('Error occurred:', error);
```

**Create logs directory**:
```bash
mkdir -p backend/logs
echo "*.log" >> backend/.gitignore
```

---

### 8. Graceful Shutdown 🔴 CRITICAL
**Why**: Prevents data loss and incomplete requests when restarting/deploying.

**Implementation**:
```javascript
// backend/server.js - Add at the end
const server = app.listen(PORT, () => {
  logger.info(`[NewsScan Backend] Server running on port ${PORT}`);
  logger.info(`[NewsScan Backend] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close Redis connections if using Redis
    if (process.env.REDIS_URL) {
      // This would be handled by Redis client's quit() method
      logger.info('Closing Redis connections...');
    }
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

---

### 9. Request ID Middleware 🔴 CRITICAL
**Why**: Essential for tracing requests across logs when debugging user issues.

**Implementation**:
```javascript
// backend/middleware/requestId.js
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req, res, next) {
  // Use existing requestId from body or generate new one
  req.requestId = req.body?.requestId || uuidv4();
  
  // Add to response headers
  res.setHeader('X-Request-ID', req.requestId);
  
  // Add to logger context
  req.logger = logger.child({ requestId: req.requestId });
  
  next();
}
```

**Update server.js**:
```javascript
import { requestIdMiddleware } from './middleware/requestId.js';

// Add early in middleware chain
app.use(requestIdMiddleware);
```

**Install uuid**:
```bash
npm install uuid
```

**Update logger calls**:
```javascript
// Use req.logger instead of logger
req.logger.info('Processing request');
req.logger.error('Error occurred:', error);
```

---

### 10. Error Logging Enhancement 🔴 CRITICAL
**Why**: Need detailed error context when users report issues.

**Update error middleware**:
```javascript
// backend/server.js - Update error handler
app.use((err, req, res, next) => {
  const errorDetails = extractErrorDetails(err);
  
  // Enhanced logging with request context
  const logData = {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    errorType: errorDetails.type,
    errorCode: errorDetails.code,
    message: errorDetails.message,
    isRetryable: errorDetails.isRetryable,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };
  
  logger.error('Request error:', logData);
  
  // ... rest of error handler
});
```

---

## 📋 Implementation Order

1. **Day 1**: Environment validation + Health check
2. **Day 2**: Redis cache migration
3. **Day 3**: Security headers + Request limits + Timeouts
4. **Day 4**: Logging + Request ID + Graceful shutdown

---

## 🧪 Testing Checklist

After implementing each item, test:

- [ ] **Environment validation**: Remove an API key, restart server → should fail fast
- [ ] **Health check**: `curl http://localhost:3000/api/health` → should return status
- [ ] **Redis cache**: Make same request twice → second should be faster (check logs)
- [ ] **Security headers**: `curl -I http://localhost:3000/api/health` → should see security headers
- [ ] **Request limits**: Send 2MB request → should be rejected
- [ ] **Timeouts**: Simulate slow request → should timeout after 60s
- [ ] **Logging**: Check `logs/combined.log` → should see structured logs
- [ ] **Graceful shutdown**: Send SIGTERM → should close gracefully

---

## 🚀 Quick Start Commands

```bash
# 1. Install dependencies
cd backend
npm install ioredis helmet express-timeout-handler winston uuid

# 2. Start Redis (Docker)
docker run -d -p 6379:6379 --name redis redis:alpine

# 3. Update .env
echo "REDIS_URL=redis://localhost:6379" >> .env
echo "LOG_LEVEL=info" >> .env

# 4. Create logs directory
mkdir -p logs

# 5. Test health endpoint
curl http://localhost:3000/api/health
```

---

## 📊 Success Criteria

Before inviting testers, verify:

- ✅ Server validates environment on startup
- ✅ Health endpoint returns 200 when healthy
- ✅ Redis cache is working (check logs for cache hits)
- ✅ Security headers are present
- ✅ Large requests are rejected
- ✅ Logs are being written to files
- ✅ Server shuts down gracefully
- ✅ Request IDs appear in all logs

---

## ⚠️ Common Issues

**Redis connection fails**:
- Check Redis is running: `docker ps`
- Verify REDIS_URL in .env
- Check Redis logs: `docker logs redis`

**Health check fails**:
- Check all API keys are set
- Verify Redis connection
- Check server logs for errors

**Cache not working**:
- Verify Redis is connected (check health endpoint)
- Check cache calls are async (`await`)
- Look for errors in logs

---

**Next Steps**: 
1. Once these are complete, you can safely invite testers locally
2. When ready to scale, see `DEPLOYMENT_GUIDE.md` to deploy backend to cloud services (Render, Railway, etc.)
3. For advanced features, see `PRODUCTION_FUTURE.md`

