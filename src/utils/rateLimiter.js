// rateLimiter.js

import { logger } from './logger.js';

const rateLimitStore = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10_000;

function pruneExpiredEntries(now = Date.now()) {
  for (const [key, entry] of rateLimitStore) {
    if (!entry || now - entry.windowStart > (entry.windowMs ?? windowMs)) {
      rateLimitStore.delete(key);
    }
  }
}

function ensureCapacity(now) {
  if (rateLimitStore.size < MAX_RATE_LIMIT_ENTRIES) {
    return;
  }

  pruneExpiredEntries(now);
  // Map insertion order makes removing the oldest entry a predictable last
  // resort under a high-cardinality abuse attempt.
  while (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (oldestKey === undefined) break;
    rateLimitStore.delete(oldestKey);
  }
}

export async function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  try {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      ensureCapacity(now);
      rateLimitStore.set(key, {
        count: 1,
        windowStart: now,
        windowMs,
      });
      return true;
    }

    if (entry.count < maxAttempts) {
      entry.count++;
      return true;
    }

    logger.debug(`Rate limit exceeded for ${key}`);
    return false;
  } catch (error) {
    logger.error('Error checking rate limit:', error);
    return true; 
  }
}

export function getRateLimitStatus(key, windowMs = 60000) {
  const entry = rateLimitStore.get(key);
  if (!entry) {
    return { limited: false, remaining: windowMs };
  }

  const elapsed = Date.now() - entry.windowStart;
  if (elapsed > (entry.windowMs ?? windowMs)) {
    rateLimitStore.delete(key);
    return { limited: false, remaining: windowMs, attempts: 0 };
  }
  const remaining = Math.max(0, windowMs - elapsed);

  return {
    limited: remaining > 0,
    remaining,
    attempts: entry.count
  };
}

export function clearRateLimit(key) {
  rateLimitStore.delete(key);
}

export function clearAllRateLimits() {
  rateLimitStore.clear();
  logger.info('All rate limits cleared');
}
