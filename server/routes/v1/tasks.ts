import crypto from 'node:crypto';
import { Router } from 'express';
import {
  taskInputSchema,
  taskStatusUpdateSchema,
  taskUpdateSchema,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
} from '../../../src/shared/phase5Schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { AppError, asyncHandler, sendError } from '../../utils/errors.ts';

interface TaskDbRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  roadmap_plan_id: string | null;
  title: string;
  description: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  status: string;
  notes: string;
  expected_outcome: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function formatTaskRow(row: TaskDbRow): TaskRecord {
  return {
    id: row.id,
    userId: row.user_id,
    ideaId: row.idea_id,
    roadmapPlanId: row.roadmap_plan_id,
    title: row.title,
    description: row.description,
    priority: row.priority as TaskPriority,
    startDate: row.start_date,
    dueDate: row.due_date,
    status: row.status as TaskStatus,
    notes: row.notes,
    expectedOutcome: row.expected_outcome,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const router = Router();
router.use(requireAuth);

// GET /api/v1/tasks
router.get(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { status, priority, ideaId, roadmapPlanId, search } = req.query;

    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (typeof status === 'string' && status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (typeof priority === 'string' && priority) {
      conditions.push('priority = ?');
      params.push(priority);
    }
    if (typeof ideaId === 'string' && ideaId) {
      conditions.push('idea_id = ?');
      params.push(ideaId);
    }
    if (typeof roadmapPlanId === 'string' && roadmapPlanId) {
      conditions.push('roadmap_plan_id = ?');
      params.push(roadmapPlanId);
    }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(title LIKE ? OR description LIKE ? OR notes LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const sql = `
      SELECT * FROM tasks
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order ASC, due_date ASC NULLS LAST, created_at DESC
    `;
    const rows = db.prepare(sql).all(...params) as TaskDbRow[];
    const items = rows.map(formatTaskRow);

    res.json({ items });
  }),
);

// POST /api/v1/tasks
router.post(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const parsed = taskInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid task fields.', parsed.error.format());
    }

    const {
      ideaId,
      roadmapPlanId,
      title,
      description,
      priority,
      startDate,
      dueDate,
      status,
      notes,
      expectedOutcome,
      sortOrder,
    } = parsed.data;

    if (ideaId) {
      const idea = db
        .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
        .get(ideaId, userId);
      if (!idea) {
        throw new AppError(404, 'IDEA_NOT_FOUND', 'Specified idea does not exist.');
      }
    }

    if (roadmapPlanId) {
      const plan = db
        .prepare('SELECT id FROM roadmap_plans WHERE id = ? AND user_id = ?')
        .get(roadmapPlanId, userId);
      if (!plan) {
        throw new AppError(404, 'ROADMAP_NOT_FOUND', 'Specified roadmap plan does not exist.');
      }
    }

    // Default sort order if not specified
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined || finalSortOrder === 0) {
      const maxRow = db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM tasks WHERE user_id = ? AND status = ?')
        .get(userId, status) as { maxOrder: number };
      finalSortOrder = maxRow.maxOrder + 1;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (
        id, user_id, idea_id, roadmap_plan_id, title, description, priority,
        start_date, due_date, status, notes, expected_outcome, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      ideaId || null,
      roadmapPlanId || null,
      title,
      description || '',
      priority || 'medium',
      startDate || null,
      dueDate || null,
      status || 'todo',
      notes || '',
      expectedOutcome || '',
      finalSortOrder,
      now,
      now,
    );

    const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskDbRow;
    res.status(201).json({ task: formatTaskRow(created) });
  }),
);

// GET /api/v1/tasks/:id
router.get(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId) as
      | TaskDbRow
      | undefined;
    if (!row) {
      return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
    }

    res.json({ task: formatTaskRow(row) });
  }),
);

// PATCH /api/v1/tasks/:id
router.patch(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = db
      .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
      .get(id, userId) as TaskDbRow | undefined;
    if (!existing) {
      return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
    }

    const parsed = taskUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid task update fields.', parsed.error.format());
    }

    const data = parsed.data;
    if (data.ideaId !== undefined && data.ideaId !== null) {
      const idea = db
        .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
        .get(data.ideaId, userId);
      if (!idea) {
        throw new AppError(404, 'IDEA_NOT_FOUND', 'Specified idea does not exist.');
      }
    }

    const now = new Date().toISOString();
    const updatedTitle = data.title ?? existing.title;
    const updatedDescription = data.description ?? existing.description;
    const updatedPriority = data.priority ?? existing.priority;
    const updatedStartDate = data.startDate !== undefined ? data.startDate : existing.start_date;
    const updatedDueDate = data.dueDate !== undefined ? data.dueDate : existing.due_date;
    const updatedStatus = data.status ?? existing.status;
    const updatedNotes = data.notes ?? existing.notes;
    const updatedOutcome = data.expectedOutcome ?? existing.expected_outcome;
    const updatedSortOrder = data.sortOrder ?? existing.sort_order;
    const updatedIdeaId = data.ideaId !== undefined ? data.ideaId : existing.idea_id;
    const updatedRoadmapId =
      data.roadmapPlanId !== undefined ? data.roadmapPlanId : existing.roadmap_plan_id;

    db.prepare(
      `UPDATE tasks SET
        title = ?,
        description = ?,
        priority = ?,
        start_date = ?,
        due_date = ?,
        status = ?,
        notes = ?,
        expected_outcome = ?,
        sort_order = ?,
        idea_id = ?,
        roadmap_plan_id = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?`,
    ).run(
      updatedTitle,
      updatedDescription,
      updatedPriority,
      updatedStartDate,
      updatedDueDate,
      updatedStatus,
      updatedNotes,
      updatedOutcome,
      updatedSortOrder,
      updatedIdeaId,
      updatedRoadmapId,
      now,
      id,
      userId,
    );

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskDbRow;
    res.json({ task: formatTaskRow(updated) });
  }),
);

// PATCH /api/v1/tasks/:id/status
router.patch(
  '/:id/status',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = db
      .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
      .get(id, userId) as TaskDbRow | undefined;
    if (!existing) {
      return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
    }

    const parsed = taskStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid status payload.', parsed.error.format());
    }

    const { status, sortOrder } = parsed.data;
    const now = new Date().toISOString();
    const newSortOrder = sortOrder !== undefined ? sortOrder : existing.sort_order;

    db.prepare(
      `UPDATE tasks SET
        status = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?`,
    ).run(status, newSortOrder, now, id, userId);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskDbRow;
    res.json({ task: formatTaskRow(updated) });
  }),
);

// DELETE /api/v1/tasks/:id
router.delete(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?')
      .get(id, userId);
    if (!existing) {
      return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
    }

    db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ ok: true });
  }),
);

export default router;
