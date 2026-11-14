import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../../../src/shared/schemas.ts';
import { config } from '../../config.ts';
import { getDb } from '../../db.ts';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  getCookieOptions,
} from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

const router = Router();

const authLimiter = createRateLimiter({
  name: 'auth',
  windowMs: 60 * 1000,
  maxRequests: 15,
});

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function issueSessionCookies(req: Request, res: Response, userId: string): string {
  const db = getDb();
  const accessToken = jwt.sign({ sub: userId, type: 'access' }, config.secretKey, {
    expiresIn: `${config.accessTokenExpireMinutes}m`,
  });

  const rawRefresh = crypto.randomBytes(40).toString('hex');
  const refreshHash = hashToken(rawRefresh);
  const now = new Date();
  const refreshExpires = new Date(
    now.getTime() + config.refreshTokenExpireDays * 24 * 60 * 60 * 1000,
  );

  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), userId, refreshHash, refreshExpires.toISOString(), now.toISOString());

  res.cookie(
    ACCESS_COOKIE_NAME,
    accessToken,
    getCookieOptions(req, config.accessTokenExpireMinutes * 60 * 1000),
  );
  res.cookie(
    REFRESH_COOKIE_NAME,
    rawRefresh,
    getCookieOptions(req, config.refreshTokenExpireDays * 24 * 60 * 60 * 1000),
  );

  return accessToken;
}

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.parse(req.body);
    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(parsed.email) as { id: string } | undefined;
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(parsed.password, 10);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, role, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Founder', 'Asia/Kolkata', ?, ?)`,
    ).run(userId, parsed.email, passwordHash, parsed.fullName, now, now);

    const accessToken = issueSessionCookies(req, res, userId);
    writeAuditLog({
      userId,
      action: 'user_register',
      resourceType: 'user',
      resourceId: userId,
      req,
    });

    res.status(201).json({
      accessToken,
      user: {
        id: userId,
        email: parsed.email,
        fullName: parsed.fullName,
        role: 'Founder',
        timezone: 'Asia/Kolkata',
      },
    });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.parse(req.body);
    const db = getDb();

    const user = db
      .prepare(
        'SELECT id, email, password_hash, full_name, role, timezone FROM users WHERE email = ?',
      )
      .get(parsed.email) as
      | {
          id: string;
          email: string;
          password_hash: string;
          full_name: string;
          role: string;
          timezone: string;
        }
      | undefined;

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const valid = await bcrypt.compare(parsed.password, user.password_hash);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const accessToken = issueSessionCookies(req, res, user.id);
    writeAuditLog({
      userId: user.id,
      action: 'user_login',
      resourceType: 'user',
      resourceId: user.id,
      req,
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        timezone: user.timezone,
      },
    });
  }),
);

router.post(
  '/logout',
  asyncHandler((req, res) => {
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (rawRefresh) {
      const db = getDb();
      db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?').run(
        new Date().toISOString(),
        hashToken(rawRefresh),
      );
    }
    clearAuthCookies(req, res);
    res.json({ ok: true });
  }),
);

router.post(
  '/refresh',
  asyncHandler((req, res) => {
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawRefresh) {
      throw new AppError(401, 'NO_REFRESH_TOKEN', 'No refresh token provided.');
    }

    const db = getDb();
    const tokenHash = hashToken(rawRefresh);
    const stored = db
      .prepare(
        `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens WHERE token_hash = ?`,
      )
      .get(tokenHash) as
      | { id: string; user_id: string; expires_at: string; revoked_at: string | null }
      | undefined;

    if (!stored || stored.revoked_at || new Date(stored.expires_at).getTime() <= Date.now()) {
      clearAuthCookies(req, res);
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh session is invalid or expired.');
    }

    // Rotate refresh token
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      stored.id,
    );

    const user = db
      .prepare('SELECT id, email, full_name, role, timezone FROM users WHERE id = ?')
      .get(stored.user_id) as
      | { id: string; email: string; full_name: string; role: string; timezone: string }
      | undefined;

    if (!user) {
      clearAuthCookies(req, res);
      throw new AppError(401, 'UNAUTHORIZED', 'User not found.');
    }

    const accessToken = issueSessionCookies(req, res, user.id);
    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        timezone: user.timezone,
      },
    });
  }),
);

router.post(
  '/forgot-password',
  authLimiter,
  asyncHandler((req, res) => {
    const parsed = forgotPasswordSchema.parse(req.body);
    const db = getDb();
    const emailConfigured = Boolean(config.smtpHost && config.smtpUser && config.smtpPass);

    const user = db
      .prepare('SELECT id, email FROM users WHERE email = ?')
      .get(parsed.email) as { id: string; email: string } | undefined;

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

      db.prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), user.id, tokenHash, expiresAt.toISOString(), now.toISOString());

      writeAuditLog({
        userId: user.id,
        action: 'password_reset_requested',
        resourceType: 'user',
        resourceId: user.id,
        req,
      });

      const resetUrl = `${config.frontendUrl}/reset-password?token=${rawToken}`;
      if (!emailConfigured && !config.isProd) {
        console.info(`[dev-password-reset] Reset link for ${user.email}: ${resetUrl}`);
      }
    }

    res.json({
      emailConfigured,
      message: emailConfigured
        ? 'If an account matches that email, a password reset link has been sent.'
        : 'Email delivery (SMTP) is not configured on this server. In development mode, reset links are logged to the server console if the account exists.',
    });
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.parse(req.body);
    const db = getDb();
    const tokenHash = hashToken(parsed.token);

    const tokenRow = db
      .prepare(
        `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens WHERE token_hash = ?`,
      )
      .get(tokenHash) as
      | { id: string; user_id: string; expires_at: string; used_at: string | null }
      | undefined;

    if (
      !tokenRow ||
      tokenRow.used_at ||
      new Date(tokenRow.expires_at).getTime() <= Date.now()
    ) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'Reset token is invalid or has expired.');
    }

    const newHash = await bcrypt.hash(parsed.password, 10);
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        newHash,
        now,
        tokenRow.user_id,
      );
      db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, tokenRow.id);
      db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
        now,
        tokenRow.user_id,
      );
    });
    tx();

    writeAuditLog({
      userId: tokenRow.user_id,
      action: 'password_reset_completed',
      resourceType: 'user',
      resourceId: tokenRow.user_id,
      req,
    });

    res.json({ ok: true, message: 'Your password has been updated. You can now sign in.' });
  }),
);

export default router;
