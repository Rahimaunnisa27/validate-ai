import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Router } from 'express';
import {
  competitorDiscoverInputSchema,
  competitorInputSchema,
  type DifferentiationOpportunity,
} from '../../../src/shared/phase3bSchemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import {
  discoverCompetitorsFromSources,
  generateDifferentiationOpportunities,
} from '../../services/competitorsAi.ts';
import type { LlmDriver } from '../../services/llmClient.ts';
import {
  fetchPhase3bSources,
  type SonarQueryFn,
} from '../../services/phase3bResearch.ts';
import { getResearchModeConfigStatus } from '../../services/research.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

export interface CompetitorsRouterOptions {
  llmDriver?: LlmDriver;
  demoModeOverride?: boolean;
  sonarFn?: SonarQueryFn;
}

interface CompetitorRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  name: string;
  website: string;
  description: string;
  pricing: string;
  features_json: string;
  strengths_json: string;
  weaknesses_json: string;
  notes: string;
  source_url: string;
  researched_date: string | null;
  source_type: 'manual' | 'researched';
  is_demo: number;
  evidence_label: string;
  created_at: string;
  updated_at: string;
  idea_title: string | null;
}

function serializeCompetitor(row: CompetitorRow) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title,
    name: row.name,
    website: row.website,
    description: row.description,
    pricing: row.pricing,
    features: JSON.parse(row.features_json) as string[],
    strengths: JSON.parse(row.strengths_json) as string[],
    weaknesses: JSON.parse(row.weaknesses_json) as string[],
    notes: row.notes,
    sourceUrl: row.source_url,
    researchedDate: row.researched_date,
    sourceType: row.source_type,
    isDemo: Boolean(row.is_demo),
    evidenceLabel: row.evidence_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function verifyOwnedIdea(
  db: Database.Database,
  userId: string,
  ideaId: string | null | undefined,
): string | null {
  const cleanIdeaId = ideaId && ideaId.trim() ? ideaId.trim() : null;
  if (cleanIdeaId) {
    const owned = db
      .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
      .get(cleanIdeaId, userId);
    if (!owned) {
      throw new AppError(404, 'IDEA_NOT_FOUND', 'Idea not found.');
    }
  }
  return cleanIdeaId;
}

function fetchCompetitorById(
  db: Database.Database,
  id: string,
  userId: string,
): CompetitorRow | undefined {
  return db
    .prepare(
      `SELECT c.*, i.title as idea_title
       FROM competitors c
       LEFT JOIN ideas i ON i.id = c.idea_id AND i.user_id = c.user_id
       WHERE c.id = ? AND c.user_id = ?`,
    )
    .get(id, userId) as CompetitorRow | undefined;
}

const aiLimiter = createRateLimiter({
  name: 'competitors-ai',
  windowMs: 60_000,
  maxRequests: 20,
});

export function createCompetitorsRouter(options?: CompetitorsRouterOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;

      const rows = db
        .prepare(
          `SELECT c.*, i.title as idea_title
           FROM competitors c
           LEFT JOIN ideas i ON i.id = c.idea_id AND i.user_id = c.user_id
           WHERE c.user_id = ?
           ORDER BY c.updated_at DESC`,
        )
        .all(userId) as CompetitorRow[];

      const diffRow = db
        .prepare(
          'SELECT opportunities_json, competitor_count, updated_at FROM competitor_analyses WHERE user_id = ?',
        )
        .get(userId) as
        | { opportunities_json: string; competitor_count: number; updated_at: string }
        | undefined;

      res.json({
        items: rows.map(serializeCompetitor),
        differentiation: diffRow
          ? {
              opportunities: JSON.parse(diffRow.opportunities_json) as DifferentiationOpportunity[],
              competitorCount: diffRow.competitor_count,
              updatedAt: diffRow.updated_at,
            }
          : null,
        sourceStatus: getResearchModeConfigStatus(options?.demoModeOverride),
      });
    }),
  );

  router.post(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const parsed = competitorInputSchema.parse(req.body);
      const cleanIdeaId = verifyOwnedIdea(db, userId, parsed.ideaId);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const evidenceLabel =
        parsed.sourceType === 'researched' && parsed.sourceUrl
          ? 'Verified research'
          : 'User assumption';

      db.prepare(
        `INSERT INTO competitors (
           id, user_id, idea_id, name, website, description, pricing,
           features_json, strengths_json, weaknesses_json, notes,
           source_url, researched_date, source_type, is_demo, evidence_label,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        cleanIdeaId,
        parsed.name,
        parsed.website,
        parsed.description,
        parsed.pricing,
        JSON.stringify(parsed.features),
        JSON.stringify(parsed.strengths),
        JSON.stringify(parsed.weaknesses),
        parsed.notes,
        parsed.sourceUrl,
        parsed.researchedDate || (parsed.sourceType === 'researched' ? now : null),
        parsed.sourceType,
        parsed.isDemo ? 1 : 0,
        evidenceLabel,
        now,
        now,
      );

      writeAuditLog({
        userId,
        action: 'competitor.created',
        resourceType: 'competitor',
        resourceId: id,
        metadata: { sourceType: parsed.sourceType },
        req,
      });

      const saved = fetchCompetitorById(db, id, userId)!;
      res.status(201).json({ competitor: serializeCompetitor(saved) });
    }),
  );

  router.post(
    '/discover',
    aiLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const parsed = competitorDiscoverInputSchema.parse(req.body);
      const cleanIdeaId = verifyOwnedIdea(db, userId, parsed.ideaId);

      const query = `Key competitors, pricing, features, strengths, and weaknesses competing with ${parsed.productOrService} in ${parsed.industry} (${parsed.location})${parsed.targetCustomer ? ` for ${parsed.targetCustomer}` : ''}.`;

      const fetched = await fetchPhase3bSources({
        query,
        industry: parsed.industry,
        location: parsed.location,
        demoModeOverride: options?.demoModeOverride,
        sonarFn: options?.sonarFn,
      });

      if (fetched.researchMode === 'none') {
        throw new AppError(
          503,
          'RESEARCH_NOT_CONFIGURED',
          'Not configured: add SONAR_API_KEY in Settings > Secrets (or enable DEMO_MODE=true) to discover competitors.',
          {
            statusLabel: fetched.statusLabel,
            setupSteps: fetched.setupSteps,
          },
        );
      }

      const drafts = await discoverCompetitorsFromSources({
        input: { ...parsed, ideaId: cleanIdeaId },
        sources: fetched.sources,
        researchMode: fetched.researchMode,
        sonarSummary: fetched.sonarSummary,
        driverOverride: options?.llmDriver,
      });

      const now = new Date().toISOString();
      const insert = db.prepare(
        `INSERT INTO competitors (
           id, user_id, idea_id, name, website, description, pricing,
           features_json, strengths_json, weaknesses_json, notes,
           source_url, researched_date, source_type, is_demo, evidence_label,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'researched', ?, ?, ?, ?)`,
      );

      const createdIds: string[] = [];
      for (const item of drafts) {
        const id = crypto.randomUUID();
        insert.run(
          id,
          userId,
          cleanIdeaId,
          item.name,
          item.website,
          item.description,
          item.pricing,
          JSON.stringify(item.features),
          JSON.stringify(item.strengths),
          JSON.stringify(item.weaknesses),
          item.notes,
          item.sourceUrl,
          item.researchedDate,
          item.isDemo ? 1 : 0,
          item.evidenceLabel,
          now,
          now,
        );
        createdIds.push(id);
      }

      writeAuditLog({
        userId,
        action: 'competitor.discovered',
        resourceType: 'competitor',
        resourceId: createdIds[0] ?? null,
        metadata: { count: createdIds.length, researchMode: fetched.researchMode },
        req,
      });

      const inserted = createdIds.map((id) => serializeCompetitor(fetchCompetitorById(db, id, userId)!));
      res.status(201).json({
        items: inserted,
        researchMode: fetched.researchMode,
        sources: fetched.sources,
      });
    }),
  );

  router.post(
    '/differentiate',
    aiLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;

      const rows = db
        .prepare('SELECT * FROM competitors WHERE user_id = ? ORDER BY updated_at DESC')
        .all(userId) as CompetitorRow[];

      const opportunities = await generateDifferentiationOpportunities({
        competitors: rows.map((r) => ({
          name: r.name,
          pricing: r.pricing,
          features: JSON.parse(r.features_json) as string[],
          strengths: JSON.parse(r.strengths_json) as string[],
          weaknesses: JSON.parse(r.weaknesses_json) as string[],
          notes: r.notes,
          sourceType: r.source_type,
        })),
        driverOverride: options?.llmDriver,
      });

      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO competitor_analyses (id, user_id, opportunities_json, competitor_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           opportunities_json = excluded.opportunities_json,
           competitor_count = excluded.competitor_count,
           updated_at = excluded.updated_at`,
      ).run(
        crypto.randomUUID(),
        userId,
        JSON.stringify(opportunities),
        rows.length,
        now,
        now,
      );

      writeAuditLog({
        userId,
        action: 'competitor.differentiated',
        resourceType: 'competitor_analysis',
        resourceId: userId,
        metadata: { competitorCount: rows.length, opportunitiesCount: opportunities.length },
        req,
      });

      res.json({
        differentiation: {
          opportunities,
          competitorCount: rows.length,
          updatedAt: now,
        },
      });
    }),
  );

  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = fetchCompetitorById(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'COMPETITOR_NOT_FOUND', 'Competitor not found.');
      }
      res.json({ competitor: serializeCompetitor(row) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const compId = String(req.params.id);

      const existing = fetchCompetitorById(db, compId, userId);
      if (!existing) {
        throw new AppError(404, 'COMPETITOR_NOT_FOUND', 'Competitor not found.');
      }

      const parsed = competitorInputSchema.parse(req.body);
      const cleanIdeaId = verifyOwnedIdea(db, userId, parsed.ideaId);
      const now = new Date().toISOString();
      const evidenceLabel =
        parsed.sourceType === 'researched' && parsed.sourceUrl
          ? existing.is_demo
            ? 'AI interpretation'
            : 'Verified research'
          : 'User assumption';

      db.prepare(
        `UPDATE competitors
         SET idea_id = ?,
             name = ?,
             website = ?,
             description = ?,
             pricing = ?,
             features_json = ?,
             strengths_json = ?,
             weaknesses_json = ?,
             notes = ?,
             source_url = ?,
             researched_date = ?,
             source_type = ?,
             evidence_label = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(
        cleanIdeaId,
        parsed.name,
        parsed.website,
        parsed.description,
        parsed.pricing,
        JSON.stringify(parsed.features),
        JSON.stringify(parsed.strengths),
        JSON.stringify(parsed.weaknesses),
        parsed.notes,
        parsed.sourceUrl,
        parsed.researchedDate,
        parsed.sourceType,
        evidenceLabel,
        now,
        compId,
        userId,
      );

      writeAuditLog({
        userId,
        action: 'competitor.updated',
        resourceType: 'competitor',
        resourceId: compId,
        req,
      });

      const updated = fetchCompetitorById(db, compId, userId)!;
      res.json({ competitor: serializeCompetitor(updated) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const compId = String(req.params.id);

      const result = db
        .prepare('DELETE FROM competitors WHERE id = ? AND user_id = ?')
        .run(compId, userId);
      if (result.changes === 0) {
        throw new AppError(404, 'COMPETITOR_NOT_FOUND', 'Competitor not found.');
      }

      writeAuditLog({
        userId,
        action: 'competitor.deleted',
        resourceType: 'competitor',
        resourceId: compId,
        req,
      });

      res.json({ ok: true });
    }),
  );

  return router;
}
