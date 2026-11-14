import type { NextFunction, Request, Response } from 'express';
import { sendError } from '../utils/errors.ts';

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export function clearRateLimitBuckets(): void {
  buckets.clear();
}

export function createRateLimiter(options: {
  name: string;
  windowMs: number;
  maxRequests: number;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-enable-rate-limit'] !== 'true') {
      next();
      return;
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.name}:${clientIp}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const existing = buckets.get(key) ?? { timestamps: [] };
    existing.timestamps = existing.timestamps.filter((t) => t > cutoff);

    if (existing.timestamps.length >= options.maxRequests) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((existing.timestamps[0] + options.windowMs - now) / 1000),
      );
      res.setHeader('Retry-After', String(retryAfterSec));
      sendError(
        res,
        429,
        'RATE_LIMITED',
        `Too many requests. Please wait ${retryAfterSec} seconds and try again.`,
        { retryAfterSec },
      );
      return;
    }

    existing.timestamps.push(now);
    buckets.set(key, existing);
    next();
  };
}
