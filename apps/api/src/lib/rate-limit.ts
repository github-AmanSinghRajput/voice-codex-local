import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (request, _response, next) => {
    const key = request.ip || 'unknown';
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      next();
      return;
    }

    if (current.count >= options.maxRequests) {
      next(new AppError(429, 'Too many requests. Please slow down.', 'RATE_LIMITED'));
      return;
    }

    current.count += 1;
    buckets.set(key, current);
    next();
  };
}
