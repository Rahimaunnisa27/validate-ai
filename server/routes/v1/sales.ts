import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Router } from 'express';
import {
  SALES_DRAFT_NOTICE,
  salesInputSchema,
  salesPlaybookUpdateSchema,
  type SalesInput,
  type SalesPlaybookJson,
} from '../../../src/shared/phase4Schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import type { LlmDriver } from '../../services/llmClient.ts';
import { generateSalesPlaybook } from '../../services/salesAi.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

export interface SalesRouterOptions {
  llmDriver?: LlmDriver;
}

interface SalesRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  idea_title: string | null;
  title: string;
  inputs_json: string;
  playbook_json: string;
  evidence_label: string;
  created_at: string;
  updated_at: string;
}

function serializePlaybook(row: SalesRow) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title ?? null,
    title: row.title,
    inputs: JSON.parse(row.inputs_json) as SalesInput,
    playbook: JSON.parse(row.playbook_json) as SalesPlaybookJson,
    evidenceLabel: 'AI interpretation' as const,
    draftNotice: SALES_DRAFT_NOTICE,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fetchPlaybookById(
  db: Database.Database,
  id: string,
  userId: string,
): SalesRow | undefined {
  return db
    .prepare(
      `SELECT s.*, i.title as idea_title
       FROM sales_playbooks s
       LEFT JOIN ideas i ON i.id = s.idea_id AND i.user_id = s.user_id
       WHERE s.id = ? AND s.user_id = ?`,
    )
    .get(id, userId) as SalesRow | undefined;
}

const generateLimiter = createRateLimiter({
  name: 'sales-generate',
  windowMs: 60_000,
  maxRequests: 20,
});

export function createSalesRouter(options?: SalesRouterOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT s.*, i.title as idea_title
           FROM sales_playbooks s
           LEFT JOIN ideas i ON i.id = s.idea_id AND i.user_id = s.user_id
           WHERE s.user_id = ?
           ORDER BY s.updated_at DESC`,
        )
        .all(req.user!.id) as SalesRow[];

      res.json({
        items: rows.map(serializePlaybook),
        draftNotice: SALES_DRAFT_NOTICE,
      });
    }),
  );

  router.post(
    '/generate',
    generateLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const parsed = salesInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid sales assistant inputs.', {
          issues: parsed.error.flatten().fieldErrors,
        });
      }

      const input = parsed.data;
      const cleanIdeaId = input.ideaId && input.ideaId.trim() ? input.ideaId.trim() : null;
      if (cleanIdeaId) {
        const ownedIdea = db
          .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
          .get(cleanIdeaId, userId);
        if (!ownedIdea) {
          throw new AppError(404, 'IDEA_NOT_FOUND', 'Linked idea not found.');
        }
      }

      const generated = await generateSalesPlaybook(
        { ...input, ideaId: cleanIdeaId },
        options?.llmDriver,
      );

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const title = input.title.trim() || generated.playbook.title;

      db.prepare(
        `INSERT INTO sales_playbooks (
           id, user_id, idea_id, title, inputs_json, playbook_json, evidence_label, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        cleanIdeaId,
        title,
        JSON.stringify({ ...input, ideaId: cleanIdeaId, title }),
        JSON.stringify({ ...generated.playbook, title }),
        generated.evidenceLabel,
        now,
        now,
      );

      writeAuditLog({
        userId,
        action: 'sales.generated',
        resourceType: 'sales_playbook',
        resourceId: id,
        req,
      });

      const saved = fetchPlaybookById(db, id, userId)!;
      res.status(201).json({ playbook: serializePlaybook(saved) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = fetchPlaybookById(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'PLAYBOOK_NOT_FOUND', 'Sales playbook not found.');
      }
      res.json({ playbook: serializePlaybook(row) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const playbookId = String(req.params.id);

      const existing = fetchPlaybookById(db, playbookId, userId);
      if (!existing) {
        throw new AppError(404, 'PLAYBOOK_NOT_FOUND', 'Sales playbook not found.');
      }

      const parsed = salesPlaybookUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid sales playbook update.', {
          issues: parsed.error.flatten().fieldErrors,
        });
      }

      const cleanIdeaId =
        parsed.data.ideaId && parsed.data.ideaId.trim() ? parsed.data.ideaId.trim() : null;
      if (cleanIdeaId) {
        const ownedIdea = db
          .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
          .get(cleanIdeaId, userId);
        if (!ownedIdea) {
          throw new AppError(404, 'IDEA_NOT_FOUND', 'Linked idea not found.');
        }
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE sales_playbooks
         SET idea_id = ?, title = ?, inputs_json = ?, playbook_json = ?, evidence_label = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(
        cleanIdeaId,
        parsed.data.title,
        JSON.stringify({ ...parsed.data.inputs, ideaId: cleanIdeaId, title: parsed.data.title }),
        JSON.stringify({ ...parsed.data.playbook, title: parsed.data.title }),
        'AI interpretation',
        now,
        playbookId,
        userId,
      );

      writeAuditLog({
        userId,
        action: 'sales.updated',
        resourceType: 'sales_playbook',
        resourceId: playbookId,
        req,
      });

      const updated = fetchPlaybookById(db, playbookId, userId)!;
      res.json({ playbook: serializePlaybook(updated) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const playbookId = String(req.params.id);

      const result = db
        .prepare('DELETE FROM sales_playbooks WHERE id = ? AND user_id = ?')
        .run(playbookId, userId);
      if (result.changes === 0) {
        throw new AppError(404, 'PLAYBOOK_NOT_FOUND', 'Sales playbook not found.');
      }

      writeAuditLog({
        userId,
        action: 'sales.deleted',
        resourceType: 'sales_playbook',
        resourceId: playbookId,
        req,
      });

      res.json({ ok: true });
    }),
  );

  return router;
}
