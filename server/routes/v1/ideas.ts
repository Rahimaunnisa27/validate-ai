import crypto from 'node:crypto';
import { Router } from 'express';
import { ideaDraftPayloadSchema, ideaFullFormSchema } from '../../../src/shared/schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

const router = Router();

router.use(requireAuth);

interface IdeaRow {
  id: string;
  user_id: string;
  startup_id: string | null;
  startup_name?: string | null;
  title: string;
  status: 'draft' | 'submitted';
  current_step: number;
  business_details_json: string;
  problem_solution_json: string;
  target_customer_json: string;
  financials_json: string;
  competitors_json: string;
  created_at: string;
  updated_at: string;
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatIdea(row: IdeaRow) {
  return {
    id: row.id,
    startupId: row.startup_id,
    startupName: row.startup_name ?? null,
    title: row.title,
    status: row.status,
    currentStep: row.current_step,
    businessDetails: safeParseJson(row.business_details_json),
    problemSolution: safeParseJson(row.problem_solution_json),
    targetCustomer: safeParseJson(row.target_customer_json),
    financials: safeParseJson(row.financials_json),
    competitors: safeParseJson(row.competitors_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function verifyStartupOwnership(userId: string, startupId?: string | null): string | null {
  if (!startupId || startupId.trim() === '') return null;
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM startups WHERE id = ? AND user_id = ?')
    .get(startupId, userId) as { id: string } | undefined;
  if (!row) {
    throw new AppError(404, 'STARTUP_NOT_FOUND', 'Selected startup was not found.');
  }
  return row.id;
}

router.get(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const status = req.query.status as string | undefined;

    const whereClause =
      status === 'draft' || status === 'submitted'
        ? 'WHERE i.user_id = ? AND i.status = ?'
        : 'WHERE i.user_id = ?';
    const params =
      status === 'draft' || status === 'submitted'
        ? [req.user!.id, status, limit, offset]
        : [req.user!.id, limit, offset];

    const rows = db
      .prepare(
        `SELECT i.*, s.name as startup_name
         FROM ideas i
         LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = i.user_id
         ${whereClause}
         ORDER BY i.updated_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params) as IdeaRow[];

    const countParams =
      status === 'draft' || status === 'submitted' ? [req.user!.id, status] : [req.user!.id];
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) as cnt FROM ideas i ${whereClause}`,
        )
        .get(...countParams) as { cnt: number }
    ).cnt;

    res.json({
      items: rows.map(formatIdea),
      pagination: { total, limit, offset },
    });
  }),
);

router.post(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const parsed = ideaDraftPayloadSchema.parse(req.body);
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const businessDetails = parsed.businessDetails ?? {};
    const rawStartupId =
      parsed.startupId ?? (typeof businessDetails.startupId === 'string' ? businessDetails.startupId : null);
    const startupId = verifyStartupOwnership(req.user!.id, rawStartupId);
    const title =
      (typeof businessDetails.title === 'string' && businessDetails.title.trim()) ||
      parsed.title ||
      'Untitled Idea';

    db.prepare(
      `INSERT INTO ideas (
        id, user_id, startup_id, title, status, current_step,
        business_details_json, problem_solution_json, target_customer_json,
        financials_json, competitors_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.user!.id,
      startupId,
      title,
      parsed.currentStep,
      JSON.stringify(businessDetails),
      JSON.stringify(parsed.problemSolution ?? {}),
      JSON.stringify(parsed.targetCustomer ?? {}),
      JSON.stringify(parsed.financials ?? {}),
      JSON.stringify(parsed.competitors ?? {}),
      now,
      now,
    );

    const row = db
      .prepare(
        `SELECT i.*, s.name as startup_name
         FROM ideas i
         LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = i.user_id
         WHERE i.id = ? AND i.user_id = ?`,
      )
      .get(id, req.user!.id) as IdeaRow;

    res.status(201).json({ idea: formatIdea(row) });
  }),
);

router.get(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT i.*, s.name as startup_name
         FROM ideas i
         LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = i.user_id
         WHERE i.id = ? AND i.user_id = ?`,
      )
      .get(req.params.id, req.user!.id) as IdeaRow | undefined;

    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Idea not found.');
    }

    res.json({ idea: formatIdea(row) });
  }),
);

router.patch(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as IdeaRow | undefined;

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Idea not found.');
    }

    const parsed = ideaDraftPayloadSchema.parse(req.body);
    const businessDetails = parsed.businessDetails ?? {};
    const rawStartupId =
      parsed.startupId ?? (typeof businessDetails.startupId === 'string' ? businessDetails.startupId : null);
    const startupId = verifyStartupOwnership(req.user!.id, rawStartupId);
    const title =
      (typeof businessDetails.title === 'string' && businessDetails.title.trim()) ||
      parsed.title ||
      existing.title;

    const now = new Date().toISOString();

    db.prepare(
      `UPDATE ideas
       SET startup_id = ?, title = ?, current_step = ?,
           business_details_json = ?, problem_solution_json = ?, target_customer_json = ?,
           financials_json = ?, competitors_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      startupId,
      title,
      parsed.currentStep,
      JSON.stringify(businessDetails),
      JSON.stringify(parsed.problemSolution ?? {}),
      JSON.stringify(parsed.targetCustomer ?? {}),
      JSON.stringify(parsed.financials ?? {}),
      JSON.stringify(parsed.competitors ?? {}),
      now,
      req.params.id,
      req.user!.id,
    );

    const updated = db
      .prepare(
        `SELECT i.*, s.name as startup_name
         FROM ideas i
         LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = i.user_id
         WHERE i.id = ? AND i.user_id = ?`,
      )
      .get(req.params.id, req.user!.id) as IdeaRow;

    res.json({ idea: formatIdea(updated) });
  }),
);

router.post(
  '/:id/submit',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as IdeaRow | undefined;

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Idea not found.');
    }

    const parsed = ideaFullFormSchema.parse(req.body);
    const startupId = verifyStartupOwnership(req.user!.id, parsed.businessDetails.startupId);
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE ideas
       SET startup_id = ?, title = ?, status = 'submitted', current_step = 6,
           business_details_json = ?, problem_solution_json = ?, target_customer_json = ?,
           financials_json = ?, competitors_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      startupId,
      parsed.businessDetails.title,
      JSON.stringify(parsed.businessDetails),
      JSON.stringify(parsed.problemSolution),
      JSON.stringify(parsed.targetCustomer),
      JSON.stringify(parsed.financials),
      JSON.stringify(parsed.competitors),
      now,
      req.params.id,
      req.user!.id,
    );

    writeAuditLog({
      userId: req.user!.id,
      action: 'idea_submitted',
      resourceType: 'idea',
      resourceId: existing.id,
      metadata: { title: parsed.businessDetails.title },
      req,
    });

    const updated = db
      .prepare(
        `SELECT i.*, s.name as startup_name
         FROM ideas i
         LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = i.user_id
         WHERE i.id = ? AND i.user_id = ?`,
      )
      .get(req.params.id, req.user!.id) as IdeaRow;

    res.json({ idea: formatIdea(updated) });
  }),
);

router.delete(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT id, title FROM ideas WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as { id: string; title: string } | undefined;

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Idea not found.');
    }

    db.prepare('DELETE FROM ideas WHERE id = ? AND user_id = ?').run(
      req.params.id,
      req.user!.id,
    );

    writeAuditLog({
      userId: req.user!.id,
      action: 'idea_deleted',
      resourceType: 'idea',
      resourceId: existing.id,
      metadata: { title: existing.title },
      req,
    });

    res.json({ ok: true });
  }),
);

export default router;
