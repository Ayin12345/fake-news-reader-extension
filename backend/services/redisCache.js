// Redis cache implementation for production scalability
// Migrated from in-memory cache to support multiple concurrent users

import Redis from 'ioredis';
import crypto from 'crypto';

// Create Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// Handle Redis connection errors
redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

export class RedisCache {
  async set(key, value, ttlMs = 3600000) {
    try {
      await redis.setex(key, Math.floor(ttlMs / 1000), JSON.stringify(value));
    } catch (error) {
      console.error('Redis set error:', error);
      throw error;
    }
  }
  
  async get(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null; // Return null on error to allow fallback behavior
    }
  }

  async delete(key) {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }

  async clear() {
    try {
      await redis.flushdb();
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }
  
  async getStats() {
    try {
      const info = await redis.info('stats');
      const keyspace = await redis.info('keyspace');
      return { info, keyspace };
    } catch (error) {
      console.error('Redis stats error:', error);
      return { info: null, keyspace: null };
    }
  }

  // Health check method
  async ping() {
    try {
      const result = await redis.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
}

// Create cache instances
export const analysisCache = new RedisCache();
export const webSearchCache = new RedisCache();

// Generate cache key from request data (moved from cache.js)
export function generateCacheKey(type, data) {
  // Create a deterministic string from the data
  const keyData = JSON.stringify({
    type,
    ...data
  });
  
  // Generate hash
  return crypto.createHash('sha256').update(keyData).digest('hex');
}

// Export Redis client for graceful shutdown
export { redis };