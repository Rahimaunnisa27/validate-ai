import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { profileUpdateSchema } from '../../../src/shared/schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

const router = Router();

router.use(requireAuth);

router.get(
  '/me',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = db
      .prepare('SELECT id, email, full_name, role, timezone, created_at FROM users WHERE id = ?')
      .get(req.user!.id) as
      | {
          id: string;
          email: string;
          full_name: string;
          role: string;
          timezone: string;
          created_at: string;
        }
      | undefined;

    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        timezone: user.timezone,
        createdAt: user.created_at,
      },
    });
  }),
);

router.patch(
  '/me',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = profileUpdateSchema.parse(req.body);
    const db = getDb();
    const userId = req.user!.id;
    const now = new Date().toISOString();

    if (parsed.newPassword && parsed.newPassword.length > 0) {
      if (!parsed.currentPassword) {
        throw new AppError(
          400,
          'CURRENT_PASSWORD_REQUIRED',
          'Current password is required to set a new password.',
        );
      }

      const row = db
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get(userId) as { password_hash: string } | undefined;

      if (!row) {
        throw new AppError(404, 'NOT_FOUND', 'User not found.');
      }

      const matches = await bcrypt.compare(parsed.currentPassword, row.password_hash);
      if (!matches) {
        throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');
      }

      const nextHash = await bcrypt.hash(parsed.newPassword, 10);
      db.prepare(
        `UPDATE users
         SET full_name = ?, role = ?, timezone = ?, password_hash = ?, updated_at = ?
         WHERE id = ?`,
      ).run(parsed.fullName, parsed.role, parsed.timezone, nextHash, now, userId);

      writeAuditLog({
        userId,
        action: 'user_password_changed',
        resourceType: 'user',
        resourceId: userId,
        req,
      });
    } else {
      db.prepare(
        `UPDATE users
         SET full_name = ?, role = ?, timezone = ?, updated_at = ?
         WHERE id = ?`,
      ).run(parsed.fullName, parsed.role, parsed.timezone, now, userId);
    }

    const updated = db
      .prepare('SELECT id, email, full_name, role, timezone, created_at FROM users WHERE id = ?')
      .get(userId) as {
      id: string;
      email: string;
      full_name: string;
      role: string;
      timezone: string;
      created_at: string;
    };

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.full_name,
        role: updated.role,
        timezone: updated.timezone,
        createdAt: updated.created_at,
      },
    });
  }),
);

export default router;
