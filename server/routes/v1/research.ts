import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Router } from 'express';
import {
  marketResearchInputSchema,
  type MarketResearchResult,
} from '../../../src/shared/phase3bSchemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import type { LlmDriver } from '../../services/llmClient.ts';
import {
  fetchPhase3bSources,
  runMarketResearchSynthesis,
  type Phase3bSource,
  type SonarQueryFn,
} from '../../services/phase3bResearch.ts';
import { getResearchModeConfigStatus, type ResearchMode } from '../../services/research.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

export interface ResearchRouterOptions {
  llmDriver?: LlmDriver;
  demoModeOverride?: boolean;
  sonarFn?: SonarQueryFn;
}

interface MarketResearchRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  industry: string;
  business_category: string;
  target_customer: string;
  location: string;
  product_or_service: string;
  research_mode: ResearchMode;
  status: 'completed' | 'not_configured';
  sources_json: string;
  result_json: string | null;
  created_at: string;
  updated_at: string;
  idea_title: string | null;
}

function serializeResearchRun(row: MarketResearchRow, demoModeOverride?: boolean) {
  const modeStatus = getResearchModeConfigStatus(demoModeOverride);
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title,
    industry: row.industry,
    businessCategory: row.business_category,
    targetCustomer: row.target_customer,
    location: row.location,
    productOrService: row.product_or_service,
    researchMode: row.research_mode,
    status: row.status,
    sources: JSON.parse(row.sources_json) as Phase3bSource[],
    result: row.result_json ? (JSON.parse(row.result_json) as MarketResearchResult) : null,
    setupSteps: row.status === 'not_configured' ? modeStatus.setupSteps : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fetchResearchRunById(
  db: Database.Database,
  id: string,
  userId: string,
): MarketResearchRow | undefined {
  return db
    .prepare(
      `SELECT mr.*, i.title as idea_title
       FROM market_research_runs mr
       LEFT JOIN ideas i ON i.id = mr.idea_id AND i.user_id = mr.user_id
       WHERE mr.id = ? AND mr.user_id = ?`,
    )
    .get(id, userId) as MarketResearchRow | undefined;
}

const researchLimiter = createRateLimiter({
  name: 'market-research-run',
  windowMs: 60_000,
  maxRequests: 20,
});

export function createResearchRouter(options?: ResearchRouterOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT mr.*, i.title as idea_title
           FROM market_research_runs mr
           LEFT JOIN ideas i ON i.id = mr.idea_id AND i.user_id = mr.user_id
           WHERE mr.user_id = ?
           ORDER BY mr.created_at DESC`,
        )
        .all(req.user!.id) as MarketResearchRow[];

      res.json({
        items: rows.map((r) => serializeResearchRun(r, options?.demoModeOverride)),
        sourceStatus: getResearchModeConfigStatus(options?.demoModeOverride),
      });
    }),
  );

  router.post(
    '/',
    researchLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const parsed = marketResearchInputSchema.parse(req.body);
      const cleanIdeaId = parsed.ideaId && parsed.ideaId.trim() ? parsed.ideaId.trim() : null;

      let ideaContext: string | null = null;
      if (cleanIdeaId) {
        const ideaRow = db
          .prepare(
            'SELECT id, title, business_details_json, problem_solution_json FROM ideas WHERE id = ? AND user_id = ?',
          )
          .get(cleanIdeaId, userId) as
          | {
              id: string;
              title: string;
              business_details_json: string;
              problem_solution_json: string;
            }
          | undefined;
        if (!ideaRow) {
          throw new AppError(404, 'IDEA_NOT_FOUND', 'Idea not found.');
        }
        const bd = JSON.parse(ideaRow.business_details_json || '{}') as { oneLiner?: string };
        const ps = JSON.parse(ideaRow.problem_solution_json || '{}') as {
          problemStatement?: string;
        };
        ideaContext = `${ideaRow.title}. ${bd.oneLiner || ''} ${ps.problemStatement || ''}`.trim();
      }

      const query = `Market research, trends, buyer demand, problems, segments, and verified market sizing for ${parsed.productOrService} (${parsed.businessCategory}) in ${parsed.industry}, targeting ${parsed.targetCustomer} in ${parsed.location}.`;

      const fetched = await fetchPhase3bSources({
        query,
        industry: parsed.industry,
        location: parsed.location,
        demoModeOverride: options?.demoModeOverride,
        sonarFn: options?.sonarFn,
      });

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      if (fetched.researchMode === 'none') {
        db.prepare(
          `INSERT INTO market_research_runs (
             id, user_id, idea_id, industry, business_category, target_customer, location,
             product_or_service, research_mode, status, sources_json, result_json,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none', 'not_configured', '[]', NULL, ?, ?)`,
        ).run(
          id,
          userId,
          cleanIdeaId,
          parsed.industry,
          parsed.businessCategory,
          parsed.targetCustomer,
          parsed.location,
          parsed.productOrService,
          now,
          now,
        );

        writeAuditLog({
          userId,
          action: 'market_research.not_configured',
          resourceType: 'market_research_run',
          resourceId: id,
          metadata: { industry: parsed.industry, location: parsed.location },
          req,
        });

        const saved = fetchResearchRunById(db, id, userId)!;
        res.status(201).json({
          run: serializeResearchRun(saved, options?.demoModeOverride),
          sourceStatus: getResearchModeConfigStatus(options?.demoModeOverride),
        });
        return;
      }

      const result = await runMarketResearchSynthesis({
        input: { ...parsed, ideaId: cleanIdeaId },
        ideaContext,
        sources: fetched.sources,
        researchMode: fetched.researchMode,
        sonarSummary: fetched.sonarSummary,
        driverOverride: options?.llmDriver,
      });

      db.prepare(
        `INSERT INTO market_research_runs (
           id, user_id, idea_id, industry, business_category, target_customer, location,
           product_or_service, research_mode, status, sources_json, result_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        cleanIdeaId,
        parsed.industry,
        parsed.businessCategory,
        parsed.targetCustomer,
        parsed.location,
        parsed.productOrService,
        fetched.researchMode,
        JSON.stringify(fetched.sources),
        JSON.stringify(result),
        now,
        now,
      );

      writeAuditLog({
        userId,
        action: 'market_research.created',
        resourceType: 'market_research_run',
        resourceId: id,
        metadata: {
          researchMode: fetched.researchMode,
          sourcesCount: fetched.sources.length,
        },
        req,
      });

      const saved = fetchResearchRunById(db, id, userId)!;
      res.status(201).json({
        run: serializeResearchRun(saved, options?.demoModeOverride),
        sourceStatus: getResearchModeConfigStatus(options?.demoModeOverride),
      });
    }),
  );

  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = fetchResearchRunById(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'MARKET_RESEARCH_NOT_FOUND', 'Market research run not found.');
      }
      res.json({
        run: serializeResearchRun(row, options?.demoModeOverride),
        sourceStatus: getResearchModeConfigStatus(options?.demoModeOverride),
      });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const runId = String(req.params.id);

      const result = db
        .prepare('DELETE FROM market_research_runs WHERE id = ? AND user_id = ?')
        .run(runId, userId);
      if (result.changes === 0) {
        throw new AppError(404, 'MARKET_RESEARCH_NOT_FOUND', 'Market research run not found.');
      }

      writeAuditLog({
        userId,
        action: 'market_research.deleted',
        resourceType: 'market_research_run',
        resourceId: runId,
        req,
      });

      res.json({ ok: true });
    }),
  );

  return router;
}
