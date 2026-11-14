import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import type { SimilarIdeaMatch } from '../../services/embeddings.ts';
import {
  getGeminiSetupSteps,
  isGeminiConfigured,
  type LlmDriver,
} from '../../services/llmClient.ts';
import { generateReportPdfBuffer } from '../../services/pdfExport.ts';
import {
  type ProgressLogEntry,
  runValidationReportPipeline,
} from '../../services/reportPipeline.ts';
import type { ResearchMode, SavedResearchSource } from '../../services/research.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';
import type { ValidationReportJson } from '../../../src/shared/reportSchemas.ts';

export interface ReportsRouterOptions {
  llmDriver?: LlmDriver;
  runSync?: boolean;
  demoModeOverride?: boolean;
}

const generateSchema = z.object({
  ideaId: z.string().trim().min(1, 'Idea ID is required.'),
  planSlug: z.string().trim().min(1).optional(),
  planId: z.string().trim().min(1).optional(),
});

const generateLimiter = createRateLimiter({
  name: 'reports-generate',
  windowMs: 60_000,
  maxRequests: 12,
});

interface ReportDbRow {
  id: string;
  user_id: string;
  idea_id: string;
  plan_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress_step: number;
  progress_total: number;
  progress_label: string;
  progress_log_json: string;
  concepts_json: string;
  similar_ideas_json: string;
  research_mode: ResearchMode;
  report_json: string | null;
  job_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  idea_title: string;
  startup_name: string | null;
  plan_name: string;
  plan_slug: string;
  plan_price_inr: number;
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function fetchReportSources(
  db: Database.Database,
  reportId: string,
  userId: string,
): SavedResearchSource[] {
  const rows = db
    .prepare(
      `SELECT id, source_ref, query, url, title, snippet, retrieved_at, is_demo
       FROM research_sources
       WHERE report_id = ? AND user_id = ?
       ORDER BY source_ref ASC`,
    )
    .all(reportId, userId) as Array<{
    id: string;
    source_ref: string;
    query: string;
    url: string;
    title: string;
    snippet: string;
    retrieved_at: string;
    is_demo: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sourceRef: r.source_ref,
    query: r.query,
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    retrievedAt: r.retrieved_at,
    isDemo: Boolean(r.is_demo),
  }));
}

function serializeReport(db: Database.Database, row: ReportDbRow, includeFullPayload = true) {
  const reportJson = includeFullPayload
    ? safeParseJson<ValidationReportJson | null>(row.report_json, null)
    : null;
  const sources = includeFullPayload ? fetchReportSources(db, row.id, row.user_id) : [];

  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title,
    startupName: row.startup_name,
    planId: row.plan_id,
    planName: row.plan_name,
    planSlug: row.plan_slug,
    planPriceInr: row.plan_price_inr,
    status: row.status,
    progressStep: row.progress_step,
    progressTotal: row.progress_total,
    progressLabel: row.progress_label,
    progressLog: safeParseJson<ProgressLogEntry[]>(row.progress_log_json, []),
    concepts: safeParseJson<string[]>(row.concepts_json, []),
    similarIdeas: safeParseJson<SimilarIdeaMatch[]>(row.similar_ideas_json, []),
    researchMode: row.research_mode,
    jobError: row.job_error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeFullPayload ? { reportJson, sources } : {}),
  };
}

function getOwnedReportRow(
  db: Database.Database,
  reportId: string,
  userId: string,
): ReportDbRow | undefined {
  return db
    .prepare(
      `SELECT r.*,
              i.title as idea_title,
              s.name as startup_name,
              p.name as plan_name,
              p.slug as plan_slug,
              p.price_inr as plan_price_inr
       FROM reports r
       JOIN ideas i ON i.id = r.idea_id
       LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = r.user_id
       JOIN report_plans p ON p.id = r.plan_id
       WHERE r.id = ? AND r.user_id = ?`,
    )
    .get(reportId, userId) as ReportDbRow | undefined;
}

export function createReportsRouter(options?: ReportsRouterOptions) {
  const router = Router();
  router.use(requireAuth);

  const ensureLlmReady = () => {
    if (!options?.llmDriver && !isGeminiConfigured()) {
      throw new AppError(
        503,
        'LLM_NOT_CONFIGURED',
        'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to generate AI validation reports.',
        {
          provider: config.llmProvider,
          model: config.llmModel,
          setupSteps: getGeminiSetupSteps(),
        },
      );
    }
  };

  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const ideaId = typeof req.query.ideaId === 'string' ? req.query.ideaId.trim() : undefined;
      const status =
        typeof req.query.status === 'string' &&
        ['queued', 'running', 'completed', 'failed'].includes(req.query.status)
          ? req.query.status
          : undefined;

      const whereClauses = ['r.user_id = ?'];
      const params: unknown[] = [userId];

      if (ideaId) {
        whereClauses.push('r.idea_id = ?');
        params.push(ideaId);
      }
      if (status) {
        whereClauses.push('r.status = ?');
        params.push(status);
      }

      const whereSql = whereClauses.join(' AND ');
      const totalRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM reports r WHERE ${whereSql}`)
        .get(...params) as { cnt: number };

      const rows = db
        .prepare(
          `SELECT r.*,
                  i.title as idea_title,
                  s.name as startup_name,
                  p.name as plan_name,
                  p.slug as plan_slug,
                  p.price_inr as plan_price_inr
           FROM reports r
           JOIN ideas i ON i.id = r.idea_id
           LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = r.user_id
           JOIN report_plans p ON p.id = r.plan_id
           WHERE ${whereSql}
           ORDER BY r.created_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset) as ReportDbRow[];

      res.json({
        items: rows.map((row) => serializeReport(db, row, false)),
        pagination: { total: totalRow.cnt, limit, offset },
      });
    }),
  );

  router.post(
    '/generate',
    generateLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const parsed = generateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Please provide a valid ideaId.',
          parsed.error.flatten().fieldErrors,
        );
      }

      if (!config.allowUnpaidReports) {
        throw new AppError(
          402,
          'PAYMENT_REQUIRED',
          'Report checkout is required when ALLOW_UNPAID_REPORTS=false. Razorpay payments activate in Phase 6.',
        );
      }

      ensureLlmReady();

      const db = getDb();
      const userId = req.user!.id;

      const idea = db
        .prepare('SELECT id, title FROM ideas WHERE id = ? AND user_id = ?')
        .get(parsed.data.ideaId, userId) as { id: string; title: string } | undefined;

      if (!idea) {
        throw new AppError(404, 'IDEA_NOT_FOUND', 'Idea not found.');
      }

      const plan = parsed.data.planId
        ? (db
            .prepare('SELECT id, slug, name FROM report_plans WHERE id = ? AND is_active = 1')
            .get(parsed.data.planId) as { id: string; slug: string; name: string } | undefined)
        : (db
            .prepare('SELECT id, slug, name FROM report_plans WHERE slug = ? AND is_active = 1')
            .get(parsed.data.planSlug || 'full') as
            | { id: string; slug: string; name: string }
            | undefined);

      if (!plan) {
        throw new AppError(400, 'INVALID_PLAN', 'Selected report plan was not found.');
      }

      const reportId = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO reports (
           id, user_id, idea_id, plan_id, status, progress_step, progress_total,
           progress_label, progress_log_json, concepts_json, similar_ideas_json,
           research_mode, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'queued', 0, 8, 'Queued', '[]', '[]', '[]', 'none', ?, ?)`,
      ).run(reportId, userId, idea.id, plan.id, now, now);

      writeAuditLog({
        userId,
        action: 'report.generate_queued',
        resourceType: 'report',
        resourceId: reportId,
        metadata: { ideaId: idea.id, planSlug: plan.slug },
        req,
      });

      const pipelineOpts = {
        llmDriver: options?.llmDriver,
        demoModeOverride: options?.demoModeOverride,
      };

      if (options?.runSync) {
        await runValidationReportPipeline(reportId, pipelineOpts);
      } else {
        setImmediate(() => {
          void runValidationReportPipeline(reportId, pipelineOpts);
        });
      }

      const createdRow = getOwnedReportRow(db, reportId, userId);
      res.status(202).json({
        report: createdRow ? serializeReport(db, createdRow, true) : { id: reportId },
      });
    }),
  );

  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = getOwnedReportRow(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Validation report not found.');
      }

      res.json({ report: serializeReport(db, row, true) });
    }),
  );

  router.post(
    '/:id/retry',
    generateLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const reportId = String(req.params.id);

      const row = getOwnedReportRow(db, reportId, userId);
      if (!row) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Validation report not found.');
      }

      if (row.status === 'completed') {
        throw new AppError(
          400,
          'REPORT_ALREADY_COMPLETED',
          'This report has already completed successfully.',
        );
      }
      if (row.status === 'queued' || row.status === 'running') {
        throw new AppError(
          409,
          'REPORT_IN_PROGRESS',
          'This validation report is currently running.',
        );
      }

      ensureLlmReady();

      const now = new Date().toISOString();
      db.prepare('DELETE FROM research_sources WHERE report_id = ? AND user_id = ?').run(
        reportId,
        userId,
      );
      db.prepare(
        `UPDATE reports
         SET status = 'queued',
             progress_step = 0,
             progress_label = 'Queued for retry',
             progress_log_json = '[]',
             concepts_json = '[]',
             similar_ideas_json = '[]',
             research_mode = 'none',
             report_json = NULL,
             job_error = NULL,
             started_at = NULL,
             completed_at = NULL,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(now, reportId, userId);

      writeAuditLog({
        userId,
        action: 'report.retried',
        resourceType: 'report',
        resourceId: reportId,
        req,
      });

      const pipelineOpts = {
        llmDriver: options?.llmDriver,
        demoModeOverride: options?.demoModeOverride,
      };

      if (options?.runSync) {
        await runValidationReportPipeline(reportId, pipelineOpts);
      } else {
        setImmediate(() => {
          void runValidationReportPipeline(reportId, pipelineOpts);
        });
      }

      const updatedRow = getOwnedReportRow(db, reportId, userId)!;
      res.status(202).json({ report: serializeReport(db, updatedRow, true) });
    }),
  );

  router.get(
    '/:id/pdf',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = getOwnedReportRow(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Validation report not found.');
      }

      const reportJson = safeParseJson<ValidationReportJson | null>(row.report_json, null);
      if (row.status !== 'completed' || !reportJson) {
        throw new AppError(
          400,
          'REPORT_NOT_READY',
          'PDF export is only available once the validation report has completed.',
        );
      }

      const sources = fetchReportSources(db, row.id, row.user_id);
      const concepts = safeParseJson<string[]>(row.concepts_json, []);
      const similarIdeas = safeParseJson<SimilarIdeaMatch[]>(row.similar_ideas_json, []);

      const pdfBuffer = await generateReportPdfBuffer({
        reportId: row.id,
        ideaTitle: row.idea_title,
        startupName: row.startup_name,
        planName: row.plan_name,
        generatedAt: row.completed_at || row.updated_at,
        researchMode: row.research_mode,
        concepts,
        similarIdeas,
        sources,
        reportJson,
      });

      const safeSlug = row.idea_title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="venturepilot-${safeSlug || 'validation-report'}.pdf"`,
      );
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.send(pdfBuffer);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const reportId = String(req.params.id);
      const result = db
        .prepare('DELETE FROM reports WHERE id = ? AND user_id = ?')
        .run(reportId, req.user!.id);

      if (result.changes === 0) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Validation report not found.');
      }

      writeAuditLog({
        userId: req.user!.id,
        action: 'report.deleted',
        resourceType: 'report',
        resourceId: reportId,
        req,
      });

      res.json({ ok: true });
    }),
  );

  return router;
}

export default createReportsRouter();
