import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Router } from 'express';
import {
  classifyBudgetTier,
  marketingCampaignUpdateSchema,
  marketingInputSchema,
  verifyAndNormalizeBudgetAllocation,
  type BudgetTier,
  type MarketingInput,
  type MarketingStrategyJson,
} from '../../../src/shared/phase4Schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import type { LlmDriver } from '../../services/llmClient.ts';
import { generateMarketingStrategy } from '../../services/marketingAi.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

export interface MarketingRouterOptions {
  llmDriver?: LlmDriver;
}

interface MarketingRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  idea_title: string | null;
  title: string;
  budget_tier: BudgetTier;
  inputs_json: string;
  strategy_json: string;
  evidence_label: string;
  created_at: string;
  updated_at: string;
}

function serializeCampaign(row: MarketingRow) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title ?? null,
    title: row.title,
    budgetTier: row.budget_tier,
    inputs: JSON.parse(row.inputs_json) as MarketingInput,
    strategy: JSON.parse(row.strategy_json) as MarketingStrategyJson,
    evidenceLabel: 'AI interpretation' as const,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fetchCampaignById(
  db: Database.Database,
  id: string,
  userId: string,
): MarketingRow | undefined {
  return db
    .prepare(
      `SELECT m.*, i.title as idea_title
       FROM marketing_campaigns m
       LEFT JOIN ideas i ON i.id = m.idea_id AND i.user_id = m.user_id
       WHERE m.id = ? AND m.user_id = ?`,
    )
    .get(id, userId) as MarketingRow | undefined;
}

const generateLimiter = createRateLimiter({
  name: 'marketing-generate',
  windowMs: 60_000,
  maxRequests: 20,
});

export function createMarketingRouter(options?: MarketingRouterOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT m.*, i.title as idea_title
           FROM marketing_campaigns m
           LEFT JOIN ideas i ON i.id = m.idea_id AND i.user_id = m.user_id
           WHERE m.user_id = ?
           ORDER BY m.updated_at DESC`,
        )
        .all(req.user!.id) as MarketingRow[];

      res.json({ items: rows.map(serializeCampaign) });
    }),
  );

  router.post(
    '/generate',
    generateLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const parsed = marketingInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid marketing strategy inputs.', {
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

      const generated = await generateMarketingStrategy(
        { ...input, ideaId: cleanIdeaId },
        options?.llmDriver,
      );

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const title = input.title.trim() || generated.strategy.campaignTitle;

      db.prepare(
        `INSERT INTO marketing_campaigns (
           id, user_id, idea_id, title, budget_tier, inputs_json, strategy_json,
           evidence_label, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        cleanIdeaId,
        title,
        generated.budgetTier,
        JSON.stringify({ ...input, ideaId: cleanIdeaId, title }),
        JSON.stringify(generated.strategy),
        generated.evidenceLabel,
        now,
        now,
      );

      writeAuditLog({
        userId,
        action: 'marketing.generated',
        resourceType: 'marketing_campaign',
        resourceId: id,
        metadata: {
          budgetTier: generated.budgetTier,
          allocationAdjusted: generated.allocationAdjusted,
        },
        req,
      });

      const saved = fetchCampaignById(db, id, userId)!;
      res.status(201).json({
        campaign: serializeCampaign(saved),
        allocationAdjusted: generated.allocationAdjusted,
      });
    }),
  );

  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = fetchCampaignById(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Marketing campaign not found.');
      }
      res.json({ campaign: serializeCampaign(row) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const campaignId = String(req.params.id);

      const existing = fetchCampaignById(db, campaignId, userId);
      if (!existing) {
        throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Marketing campaign not found.');
      }

      const parsed = marketingCampaignUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid marketing campaign update.', {
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

      let verifiedAlloc;
      try {
        verifiedAlloc = verifyAndNormalizeBudgetAllocation(
          parsed.data.strategy.budgetAllocation,
          parsed.data.inputs.budget,
        );
      } catch (err) {
        throw new AppError(
          400,
          'INVALID_BUDGET_ALLOCATION',
          err instanceof Error ? err.message : 'Invalid budget allocation.',
        );
      }

      const updatedStrategy: MarketingStrategyJson = {
        ...parsed.data.strategy,
        campaignTitle: parsed.data.title,
        budgetAllocation: verifiedAlloc.items,
      };
      const tier = classifyBudgetTier(parsed.data.inputs.budget);
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE marketing_campaigns
         SET idea_id = ?, title = ?, budget_tier = ?, inputs_json = ?, strategy_json = ?,
             evidence_label = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(
        cleanIdeaId,
        parsed.data.title,
        tier,
        JSON.stringify({ ...parsed.data.inputs, ideaId: cleanIdeaId, title: parsed.data.title }),
        JSON.stringify(updatedStrategy),
        'AI interpretation',
        now,
        campaignId,
        userId,
      );

      writeAuditLog({
        userId,
        action: 'marketing.updated',
        resourceType: 'marketing_campaign',
        resourceId: campaignId,
        req,
      });

      const updated = fetchCampaignById(db, campaignId, userId)!;
      res.json({
        campaign: serializeCampaign(updated),
        allocationAdjusted: verifiedAlloc.wasCorrected,
      });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const campaignId = String(req.params.id);

      const result = db
        .prepare('DELETE FROM marketing_campaigns WHERE id = ? AND user_id = ?')
        .run(campaignId, userId);
      if (result.changes === 0) {
        throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Marketing campaign not found.');
      }

      writeAuditLog({
        userId,
        action: 'marketing.deleted',
        resourceType: 'marketing_campaign',
        resourceId: campaignId,
        req,
      });

      res.json({ ok: true });
    }),
  );

  return router;
}
