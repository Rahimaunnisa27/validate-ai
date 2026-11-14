import crypto from 'node:crypto';
import { Router } from 'express';
import { startupSchema } from '../../../src/shared/schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

const router = Router();

router.use(requireAuth);

interface StartupRow {
  id: string;
  user_id: string;
  name: string;
  tagline: string;
  industry: string;
  stage: string;
  location: string;
  website: string;
  description: string;
  created_at: string;
  updated_at: string;
  ideas_count?: number;
}

function formatStartup(row: StartupRow) {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    industry: row.industry,
    stage: row.stage,
    location: row.location,
    website: row.website,
    description: row.description,
    ideasCount: row.ideas_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const rows = db
      .prepare(
        `SELECT s.*, COUNT(i.id) as ideas_count
         FROM startups s
         LEFT JOIN ideas i ON i.startup_id = s.id AND i.user_id = s.user_id
         WHERE s.user_id = ?
         GROUP BY s.id
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(req.user!.id, limit, offset) as StartupRow[];

    const total = (
      db
        .prepare('SELECT COUNT(*) as cnt FROM startups WHERE user_id = ?')
        .get(req.user!.id) as { cnt: number }
    ).cnt;

    res.json({
      items: rows.map(formatStartup),
      pagination: { total, limit, offset },
    });
  }),
);

router.post(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const parsed = startupSchema.parse(req.body);
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO startups (id, user_id, name, tagline, industry, stage, location, website, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.user!.id,
      parsed.name,
      parsed.tagline,
      parsed.industry,
      parsed.stage,
      parsed.location,
      parsed.website,
      parsed.description,
      now,
      now,
    );

    const row = db
      .prepare('SELECT * FROM startups WHERE id = ? AND user_id = ?')
      .get(id, req.user!.id) as StartupRow;

    res.status(201).json({ startup: formatStartup(row) });
  }),
);

router.get(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT s.*, COUNT(i.id) as ideas_count
         FROM startups s
         LEFT JOIN ideas i ON i.startup_id = s.id AND i.user_id = s.user_id
         WHERE s.id = ? AND s.user_id = ?
         GROUP BY s.id`,
      )
      .get(req.params.id, req.user!.id) as StartupRow | undefined;

    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Startup not found.');
    }

    res.json({ startup: formatStartup(row) });
  }),
);

router.patch(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM startups WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as StartupRow | undefined;

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Startup not found.');
    }

    const parsed = startupSchema.parse(req.body);
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE startups
       SET name = ?, tagline = ?, industry = ?, stage = ?, location = ?, website = ?, description = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      parsed.name,
      parsed.tagline,
      parsed.industry,
      parsed.stage,
      parsed.location,
      parsed.website,
      parsed.description,
      now,
      req.params.id,
      req.user!.id,
    );

    const updated = db
      .prepare(
        `SELECT s.*, COUNT(i.id) as ideas_count
         FROM startups s
         LEFT JOIN ideas i ON i.startup_id = s.id AND i.user_id = s.user_id
         WHERE s.id = ? AND s.user_id = ?
         GROUP BY s.id`,
      )
      .get(req.params.id, req.user!.id) as StartupRow;

    res.json({ startup: formatStartup(updated) });
  }),
);

router.delete(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT id, name FROM startups WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as { id: string; name: string } | undefined;

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Startup not found.');
    }

    db.prepare('DELETE FROM startups WHERE id = ? AND user_id = ?').run(
      req.params.id,
      req.user!.id,
    );

    writeAuditLog({
      userId: req.user!.id,
      action: 'startup_deleted',
      resourceType: 'startup',
      resourceId: existing.id,
      metadata: { name: existing.name },
      req,
    });

    res.json({ ok: true });
  }),
);

export default router;
