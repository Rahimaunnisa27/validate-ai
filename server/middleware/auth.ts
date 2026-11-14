import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { getDb } from '../db.ts';
import { sendError } from '../utils/errors.ts';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  timezone: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  requestId?: string;
}

export const ACCESS_COOKIE_NAME = 'vp_access_token';
export const REFRESH_COOKIE_NAME = 'vp_refresh_token';

export function isHttpsRequest(req: Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const referer = typeof req.headers.referer === 'string' ? req.headers.referer : '';
  const host = req.get('host') || '';

  return (
    req.secure ||
    forwardedProto === 'https' ||
    origin.startsWith('https://') ||
    referer.startsWith('https://') ||
    host.endsWith('.run.app')
  );
}

export function getCookieOptions(req: Request, maxAgeMs: number) {
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function clearAuthCookies(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  const opts = {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
  res.clearCookie(ACCESS_COOKIE_NAME, opts);
  res.clearCookie(REFRESH_COOKIE_NAME, opts);
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const token = cookieToken || bearerToken;

  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    return;
  }

  try {
    const payload = jwt.verify(token, config.secretKey) as { sub?: string; type?: string };
    if (!payload.sub || payload.type !== 'access') {
      sendError(res, 401, 'INVALID_TOKEN', 'Invalid authentication token.');
      return;
    }

    const db = getDb();
    const row = db
      .prepare('SELECT id, email, full_name, role, timezone FROM users WHERE id = ?')
      .get(payload.sub) as
      | { id: string; email: string; full_name: string; role: string; timezone: string }
      | undefined;

    if (!row) {
      sendError(res, 401, 'UNAUTHORIZED', 'User account no longer exists.');
      return;
    }

    req.user = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      timezone: row.timezone,
    };
    next();
  } catch {
    sendError(res, 401, 'TOKEN_EXPIRED', 'Session expired. Please refresh or sign in again.');
  }
}
