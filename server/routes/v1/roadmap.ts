import crypto from 'node:crypto';
import { Router } from 'express';
import {
  roadmapGenerateRequestSchema,
  type RoadmapDuration,
  type RoadmapPhase,
  type RoadmapPlanRecord,
  type TaskRecord,
} from '../../../src/shared/phase5Schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { type LlmDriver } from '../../services/llmClient.ts';
import { generateRoadmapPlan } from '../../services/roadmapAi.ts';
import { AppError, asyncHandler, sendError } from '../../utils/errors.ts';
import { formatTaskRow } from './tasks.ts';

export interface RoadmapRouterOptions {
  driver?: LlmDriver;
}

interface RoadmapDbRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  report_id: string | null;
  title: string;
  duration_days: number;
  summary: string;
  phases_json: string;
  key_risks_json: string;
  evidence_label: string;
  created_at: string;
  updated_at: string;
}

function formatRoadmapRow(row: RoadmapDbRow): RoadmapPlanRecord {
  let phases: RoadmapPhase[] = [];
  let keyRisks: string[] = [];
  try {
    phases = JSON.parse(row.phases_json) as RoadmapPhase[];
  } catch {
    phases = [];
  }
  try {
    keyRisks = JSON.parse(row.key_risks_json) as string[];
  } catch {
    keyRisks = [];
  }

  return {
    id: row.id,
    userId: row.user_id,
    ideaId: row.idea_id,
    reportId: row.report_id,
    title: row.title,
    durationDays: row.duration_days as RoadmapDuration,
    summary: row.summary,
    phases,
    keyRisks,
    evidenceLabel: 'AI interpretation',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function addDaysToIsoDate(baseDate: Date, days: number): string {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function createRoadmapRouter(options?: RoadmapRouterOptions): Router {
  const router = Router();
  router.use(requireAuth);

  // GET /api/v1/roadmap
  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const { ideaId } = req.query;

      const conditions = ['user_id = ?'];
      const params: unknown[] = [userId];

      if (typeof ideaId === 'string' && ideaId) {
        conditions.push('idea_id = ?');
        params.push(ideaId);
      }

      const rows = db
        .prepare(
          `SELECT * FROM roadmap_plans
           WHERE ${conditions.join(' AND ')}
           ORDER BY created_at DESC`,
        )
        .all(...params) as RoadmapDbRow[];

      const items = rows.map(formatRoadmapRow);

      res.json({ items });
    }),
  );

  // POST /api/v1/roadmap/generate
  router.post(
    '/generate',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;

      const parsed = roadmapGenerateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid roadmap generation options.', parsed.error.format());
      }

      const { ideaId, reportId, durationDays, customFocus } = parsed.data;

      let ideaTitle = 'Startup Venture';
      let ideaIndustry = '';
      let ideaProblem = '';
      let ideaTargetCustomer = '';
      let ideaProduct = '';
      let reportContext = '';

      if (ideaId) {
        const idea = db
          .prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?')
          .get(ideaId, userId) as
          | {
              title: string;
              business_details_json: string;
              problem_solution_json: string;
              target_customer_json: string;
            }
          | undefined;

        if (!idea) {
          throw new AppError(404, 'IDEA_NOT_FOUND', 'Specified idea does not exist.');
        }

        ideaTitle = idea.title;
        try {
          const biz = JSON.parse(idea.business_details_json || '{}') as { industry?: string; productOrService?: string };
          ideaIndustry = biz.industry || '';
          ideaProduct = biz.productOrService || '';
        } catch {
          // ignore
        }
        try {
          const prob = JSON.parse(idea.problem_solution_json || '{}') as { problemDescription?: string };
          ideaProblem = prob.problemDescription || '';
        } catch {
          // ignore
        }
        try {
          const cust = JSON.parse(idea.target_customer_json || '{}') as { targetCustomer?: string };
          ideaTargetCustomer = cust.targetCustomer || '';
        } catch {
          // ignore
        }
      }

      if (reportId) {
        const report = db
          .prepare('SELECT id, report_json FROM reports WHERE id = ? AND user_id = ?')
          .get(reportId, userId) as { report_json: string } | undefined;

        if (!report) {
          throw new AppError(404, 'REPORT_NOT_FOUND', 'Specified report does not exist.');
        }

        try {
          const rep = JSON.parse(report.report_json || '{}') as {
            sections?: { executiveSummary?: { content?: string } };
          };
          reportContext = rep.sections?.executiveSummary?.content?.slice(0, 500) || '';
        } catch {
          // ignore
        }
      }

      // Generate roadmap using Gemini / stand-in driver
      const result = await generateRoadmapPlan(
        {
          title: ideaTitle,
          industry: ideaIndustry,
          problem: ideaProblem,
          targetCustomer: ideaTargetCustomer,
          product: ideaProduct,
          reportContext,
          durationDays,
          customFocus,
        },
        options?.driver,
      );

      const planId = crypto.randomUUID();
      const now = new Date().toISOString();
      const today = new Date();

      const tx = db.transaction(() => {
        // 1. Insert roadmap_plans record
        db.prepare(
          `INSERT INTO roadmap_plans (
            id, user_id, idea_id, report_id, title, duration_days, summary,
            phases_json, key_risks_json, evidence_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          planId,
          userId,
          ideaId || null,
          reportId || null,
          result.plan.title,
          durationDays,
          result.plan.summary,
          JSON.stringify(result.plan.phases),
          JSON.stringify(result.plan.keyRisks),
          result.evidenceLabel,
          now,
          now,
        );

        // 2. Insert all generated tasks into the tasks table!
        let sortIndex = 1;
        const insertTask = db.prepare(
          `INSERT INTO tasks (
            id, user_id, idea_id, roadmap_plan_id, title, description, priority,
            start_date, due_date, status, notes, expected_outcome, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)`,
        );

        for (const phase of result.plan.phases) {
          for (const task of phase.tasks) {
            const taskId = crypto.randomUUID();
            const startDate = addDaysToIsoDate(today, task.dayOffsetStart);
            const dueDate = addDaysToIsoDate(today, task.dayOffsetDue);
            const fullDesc = task.description
              ? `[${phase.name}] ${task.description}`
              : `[${phase.name}]`;

            insertTask.run(
              taskId,
              userId,
              ideaId || null,
              planId,
              task.title,
              fullDesc,
              task.priority,
              startDate,
              dueDate,
              task.notes || '',
              task.expectedOutcome || '',
              sortIndex++,
              now,
              now,
            );
          }
        }
      });

      tx();

      const createdPlanRow = db
        .prepare('SELECT * FROM roadmap_plans WHERE id = ?')
        .get(planId) as RoadmapDbRow;

      const createdTasksCount = (
        db
          .prepare('SELECT COUNT(*) as cnt FROM tasks WHERE roadmap_plan_id = ?')
          .get(planId) as { cnt: number }
      ).cnt;

      res.status(201).json({
        plan: formatRoadmapRow(createdPlanRow),
        tasksCreatedCount: createdTasksCount,
        evidenceLabel: 'AI interpretation',
      });
    }),
  );

  // GET /api/v1/roadmap/:id
  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const { id } = req.params;

      const row = db
        .prepare('SELECT * FROM roadmap_plans WHERE id = ? AND user_id = ?')
        .get(id, userId) as RoadmapDbRow | undefined;

      if (!row) {
        return sendError(res, 404, 'ROADMAP_NOT_FOUND', 'Roadmap plan not found.');
      }

      const tasksRows = db
        .prepare(
          `SELECT * FROM tasks
           WHERE roadmap_plan_id = ? AND user_id = ?
           ORDER BY sort_order ASC, due_date ASC NULLS LAST, created_at ASC`,
        )
        .all(id, userId) as Array<Parameters<typeof formatTaskRow>[0]>;

      const tasks: TaskRecord[] = tasksRows.map(formatTaskRow);
      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === 'completed').length;
      const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      res.json({
        plan: formatRoadmapRow(row),
        tasks,
        completionPercentage,
      });
    }),
  );

  // DELETE /api/v1/roadmap/:id
  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const { id } = req.params;

      const existing = db
        .prepare('SELECT id FROM roadmap_plans WHERE id = ? AND user_id = ?')
        .get(id, userId);

      if (!existing) {
        return sendError(res, 404, 'ROADMAP_NOT_FOUND', 'Roadmap plan not found.');
      }

      const tx = db.transaction(() => {
        db.prepare('DELETE FROM tasks WHERE roadmap_plan_id = ? AND user_id = ?').run(id, userId);
        db.prepare('DELETE FROM roadmap_plans WHERE id = ? AND user_id = ?').run(id, userId);
      });
      tx();

      res.json({ ok: true });
    }),
  );

  return router;
}

export default createRoadmapRouter();
