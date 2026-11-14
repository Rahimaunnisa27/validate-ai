import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestLoggerMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    if (!req.path.startsWith('/api')) return;
    const durationMs = Date.now() - start;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
      }),
    );
  });

  next();
}
