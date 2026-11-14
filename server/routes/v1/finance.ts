import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Router } from 'express';
import {
  financialPlanInputSchema,
  type ComputedFinancialModel,
  type FinancialPlanInputs,
} from '../../../src/shared/phase3aSchemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { generateFinancialInterpretation } from '../../services/financeAi.ts';
import { calculateFinancialModel } from '../../services/financeCalculator.ts';
import type { LlmDriver } from '../../services/llmClient.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

export interface FinanceRouterOptions {
  llmDriver?: LlmDriver;
}

interface FinancialPlanRow {
  id: string;
  user_id: string;
  startup_id: string | null;
  idea_id: string | null;
  name: string;
  inputs_json: string;
  computed_json: string;
  ai_interpretation: string | null;
  created_at: string;
  updated_at: string;
  startup_name: string | null;
  idea_title: string | null;
}

function serializeFinancialPlan(row: FinancialPlanRow) {
  return {
    id: row.id,
    startupId: row.startup_id,
    startupName: row.startup_name,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title,
    name: row.name,
    inputs: JSON.parse(row.inputs_json) as FinancialPlanInputs,
    computed: JSON.parse(row.computed_json) as ComputedFinancialModel,
    aiInterpretation: row.ai_interpretation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function verifyLinkedEntitiesOwnership(
  db: Database.Database,
  userId: string,
  startupId: string | null | undefined,
  ideaId: string | null | undefined,
): { cleanStartupId: string | null; cleanIdeaId: string | null } {
  const cleanStartupId = startupId && startupId.trim() ? startupId.trim() : null;
  const cleanIdeaId = ideaId && ideaId.trim() ? ideaId.trim() : null;

  if (cleanStartupId) {
    const ownedStartup = db
      .prepare('SELECT id FROM startups WHERE id = ? AND user_id = ?')
      .get(cleanStartupId, userId);
    if (!ownedStartup) {
      throw new AppError(404, 'STARTUP_NOT_FOUND', 'Startup not found.');
    }
  }

  if (cleanIdeaId) {
    const ownedIdea = db
      .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
      .get(cleanIdeaId, userId);
    if (!ownedIdea) {
      throw new AppError(404, 'IDEA_NOT_FOUND', 'Idea not found.');
    }
  }

  return { cleanStartupId, cleanIdeaId };
}

function fetchPlanRowById(
  db: Database.Database,
  id: string,
  userId: string,
): FinancialPlanRow | undefined {
  return db
    .prepare(
      `SELECT fp.*, s.name as startup_name, i.title as idea_title
       FROM financial_plans fp
       LEFT JOIN startups s ON s.id = fp.startup_id AND s.user_id = fp.user_id
       LEFT JOIN ideas i ON i.id = fp.idea_id AND i.user_id = fp.user_id
       WHERE fp.id = ? AND fp.user_id = ?`,
    )
    .get(id, userId) as FinancialPlanRow | undefined;
}

export function createFinanceRouter(options?: FinanceRouterOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT fp.*, s.name as startup_name, i.title as idea_title
           FROM financial_plans fp
           LEFT JOIN startups s ON s.id = fp.startup_id AND s.user_id = fp.user_id
           LEFT JOIN ideas i ON i.id = fp.idea_id AND i.user_id = fp.user_id
           WHERE fp.user_id = ?
           ORDER BY fp.updated_at DESC`,
        )
        .all(req.user!.id) as FinancialPlanRow[];

      res.json({ items: rows.map(serializeFinancialPlan) });
    }),
  );

  router.post(
    '/calculate',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const parsed = financialPlanInputSchema.parse(req.body);
      const computed = calculateFinancialModel(parsed);
      res.json({ inputs: parsed, computed });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const parsed = financialPlanInputSchema.parse(req.body);
      const { cleanStartupId, cleanIdeaId } = verifyLinkedEntitiesOwnership(
        db,
        userId,
        parsed.startupId,
        parsed.ideaId,
      );

      const normalizedInputs: FinancialPlanInputs = {
        ...parsed,
        startupId: cleanStartupId,
        ideaId: cleanIdeaId,
      };

      const computed = calculateFinancialModel(normalizedInputs);
      const aiInterpretation = await generateFinancialInterpretation(
        normalizedInputs,
        computed,
        options?.llmDriver,
      );

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO financial_plans (
           id, user_id, startup_id, idea_id, name,
           inputs_json, computed_json, ai_interpretation,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        cleanStartupId,
        cleanIdeaId,
        normalizedInputs.name,
        JSON.stringify(normalizedInputs),
        JSON.stringify(computed),
        aiInterpretation,
        now,
        now,
      );

      writeAuditLog({
        userId,
        action: 'finance_plan.created',
        resourceType: 'financial_plan',
        resourceId: id,
        metadata: {
          startupId: cleanStartupId,
          ideaId: cleanIdeaId,
          hasAiInterpretation: Boolean(aiInterpretation),
        },
        req,
      });

      const savedRow = fetchPlanRowById(db, id, userId)!;
      res.status(201).json({ plan: serializeFinancialPlan(savedRow) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = fetchPlanRowById(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'FINANCIAL_PLAN_NOT_FOUND', 'Financial plan not found.');
      }
      res.json({ plan: serializeFinancialPlan(row) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const planId = String(req.params.id);

      const existing = fetchPlanRowById(db, planId, userId);
      if (!existing) {
        throw new AppError(404, 'FINANCIAL_PLAN_NOT_FOUND', 'Financial plan not found.');
      }

      const parsed = financialPlanInputSchema.parse(req.body);
      const { cleanStartupId, cleanIdeaId } = verifyLinkedEntitiesOwnership(
        db,
        userId,
        parsed.startupId,
        parsed.ideaId,
      );

      const normalizedInputs: FinancialPlanInputs = {
        ...parsed,
        startupId: cleanStartupId,
        ideaId: cleanIdeaId,
      };

      const computed = calculateFinancialModel(normalizedInputs);
      const aiInterpretation = await generateFinancialInterpretation(
        normalizedInputs,
        computed,
        options?.llmDriver,
      );
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE financial_plans
         SET startup_id = ?,
             idea_id = ?,
             name = ?,
             inputs_json = ?,
             computed_json = ?,
             ai_interpretation = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(
        cleanStartupId,
        cleanIdeaId,
        normalizedInputs.name,
        JSON.stringify(normalizedInputs),
        JSON.stringify(computed),
        aiInterpretation,
        now,
        planId,
        userId,
      );

      writeAuditLog({
        userId,
        action: 'finance_plan.updated',
        resourceType: 'financial_plan',
        resourceId: planId,
        metadata: {
          startupId: cleanStartupId,
          ideaId: cleanIdeaId,
          hasAiInterpretation: Boolean(aiInterpretation),
        },
        req,
      });

      const updatedRow = fetchPlanRowById(db, planId, userId)!;
      res.json({ plan: serializeFinancialPlan(updatedRow) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const planId = String(req.params.id);

      const result = db
        .prepare('DELETE FROM financial_plans WHERE id = ? AND user_id = ?')
        .run(planId, userId);
      if (result.changes === 0) {
        throw new AppError(404, 'FINANCIAL_PLAN_NOT_FOUND', 'Financial plan not found.');
      }

      writeAuditLog({
        userId,
        action: 'finance_plan.deleted',
        resourceType: 'financial_plan',
        resourceId: planId,
        req,
      });

      res.json({ ok: true });
    }),
  );

  return router;
}
