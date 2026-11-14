import crypto from 'node:crypto';
import { Router } from 'express';
import {
  buildLeadsCsvExport,
  LEAD_STAGES,
  leadCsvImportRequestSchema,
  leadInputSchema,
  leadNoteInputSchema,
  leadStageUpdateSchema,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  parseCsvText,
  validateCsvMappedRows,
  type LeadStage,
} from '../../../src/shared/phase4Schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

interface LeadRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  idea_title: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: LeadStage;
  notes: string;
  notes_count: number;
  created_at: string;
  updated_at: string;
}

interface LeadNoteRow {
  id: string;
  lead_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

function mapLeadRow(row: LeadRow) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    source: row.source,
    status: row.status,
    notes: row.notes,
    notesCount: Number(row.notes_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLeadNoteRow(row: LeadNoteRow) {
  return {
    id: row.id,
    leadId: row.lead_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

function buildLeadSummary(userId: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as cnt
       FROM leads
       WHERE user_id = ?
       GROUP BY status`,
    )
    .all(userId) as Array<{ status: LeadStage; cnt: number }>;

  const byStage: Record<LeadStage, number> = {
    New: 0,
    Contacted: 0,
    Interested: 0,
    Qualified: 0,
    Converted: 0,
    Lost: 0,
  };
  let totalLeads = 0;
  for (const r of rows) {
    if (r.status in byStage) {
      byStage[r.status] = r.cnt;
      totalLeads += r.cnt;
    }
  }
  const convertedCount = byStage.Converted;
  const conversionRate =
    totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 1000) / 10 : 0;

  return {
    totalLeads,
    convertedCount,
    conversionRate,
    byStage,
  };
}

function fetchLeadByIdForUser(leadId: string, userId: string): LeadRow {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT l.*, i.title as idea_title,
              (SELECT COUNT(*) FROM lead_notes ln WHERE ln.lead_id = l.id AND ln.user_id = l.user_id) as notes_count
       FROM leads l
       LEFT JOIN ideas i ON i.id = l.idea_id AND i.user_id = l.user_id
       WHERE l.id = ? AND l.user_id = ?`,
    )
    .get(leadId, userId) as LeadRow | undefined;

  if (!row) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }
  return row;
}

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const statusFilter =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : '';
    const sourceFilter =
      typeof req.query.source === 'string' && req.query.source.trim()
        ? req.query.source.trim()
        : '';

    const where: string[] = ['l.user_id = ?'];
    const params: unknown[] = [userId];

    if (statusFilter && LEAD_STAGES.includes(statusFilter as LeadStage)) {
      where.push('l.status = ?');
      params.push(statusFilter);
    }
    if (sourceFilter) {
      where.push('LOWER(l.source) = LOWER(?)');
      params.push(sourceFilter);
    }
    if (search) {
      where.push(
        '(LOWER(l.name) LIKE ? OR LOWER(l.email) LIKE ? OR LOWER(l.company) LIKE ? OR LOWER(l.notes) LIKE ?)',
      );
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const rows = db
      .prepare(
        `SELECT l.*, i.title as idea_title,
                (SELECT COUNT(*) FROM lead_notes ln WHERE ln.lead_id = l.id AND ln.user_id = l.user_id) as notes_count
         FROM leads l
         LEFT JOIN ideas i ON i.id = l.idea_id AND i.user_id = l.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY l.updated_at DESC, l.created_at DESC`,
      )
      .all(...params) as LeadRow[];

    const sourcesRows = db
      .prepare(
        `SELECT DISTINCT source
         FROM leads
         WHERE user_id = ? AND TRIM(source) != ''
         ORDER BY source ASC`,
      )
      .all(userId) as Array<{ source: string }>;

    res.json({
      items: rows.map(mapLeadRow),
      sources: sourcesRows.map((s) => s.source),
      summary: buildLeadSummary(userId),
    });
  }),
);

router.get(
  '/export.csv',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const rows = db
      .prepare(
        `SELECT l.*, i.title as idea_title, 0 as notes_count
         FROM leads l
         LEFT JOIN ideas i ON i.id = l.idea_id AND i.user_id = l.user_id
         WHERE l.user_id = ?
         ORDER BY l.created_at DESC`,
      )
      .all(userId) as LeadRow[];

    const csv = buildLeadsCsvExport(
      rows.map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone,
        company: r.company,
        source: r.source,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
      })),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="venturepilot-leads.csv"');
    res.send(csv);
  }),
);

router.post(
  '/import',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const rawCsv = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    if (Buffer.byteLength(rawCsv, 'utf8') > MAX_CSV_BYTES) {
      throw new AppError(
        400,
        'CSV_TOO_LARGE',
        `CSV file exceeds the 2 MB (${MAX_CSV_BYTES.toLocaleString()} bytes) limit.`,
      );
    }

    const parsedReq = leadCsvImportRequestSchema.safeParse(req.body);
    if (!parsedReq.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid CSV import payload.', {
        issues: parsedReq.error.flatten().fieldErrors,
      });
    }

    const { csvText, mapping, ideaId } = parsedReq.data;
    let resolvedIdeaId: string | null = null;
    if (ideaId) {
      const idea = db
        .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
        .get(ideaId, userId);
      if (!idea) {
        throw new AppError(404, 'IDEA_NOT_FOUND', 'Linked idea not found.');
      }
      resolvedIdeaId = ideaId;
    }

    let parsedCsv: ReturnType<typeof parseCsvText>;
    try {
      parsedCsv = parseCsvText(csvText, MAX_CSV_ROWS);
    } catch (err) {
      throw new AppError(
        400,
        'CSV_ROW_LIMIT_EXCEEDED',
        err instanceof Error ? err.message : 'Unable to parse CSV.',
      );
    }

    if (parsedCsv.headers.length === 0 || parsedCsv.rows.length === 0) {
      throw new AppError(400, 'EMPTY_CSV', 'CSV file has no data rows to import.');
    }

    const result = validateCsvMappedRows(parsedCsv.rows, mapping, resolvedIdeaId);
    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO leads (
        id, user_id, idea_id, name, email, phone, company, source, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedIds: string[] = [];
    const tx = db.transaction(() => {
      for (const row of result.validRows) {
        const id = crypto.randomUUID();
        insertStmt.run(
          id,
          userId,
          row.data.ideaId ?? null,
          row.data.name,
          row.data.email,
          row.data.phone,
          row.data.company,
          row.data.source || 'CSV Import',
          row.data.status,
          row.data.notes,
          now,
          now,
        );
        insertedIds.push(id);
      }
    });
    tx();

    writeAuditLog({
      userId,
      action: 'lead.csv_import',
      resourceType: 'lead',
      metadata: {
        importedCount: insertedIds.length,
        errorCount: result.errors.length,
        sanitizedFormulaCells: result.sanitizedFormulaCells,
      },
      req,
    });

    res.status(201).json({
      importedCount: insertedIds.length,
      skippedCount: result.errors.length,
      sanitizedFormulaCells: result.sanitizedFormulaCells,
      errors: result.errors,
      summary: buildLeadSummary(userId),
    });
  }),
);

router.post(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const parsed = leadInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid lead input.', {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const input = parsed.data;
    if (input.ideaId) {
      const idea = db
        .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
        .get(input.ideaId, userId);
      if (!idea) {
        throw new AppError(404, 'IDEA_NOT_FOUND', 'Linked idea not found.');
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO leads (
        id, user_id, idea_id, name, email, phone, company, source, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.ideaId || null,
      input.name,
      input.email,
      input.phone,
      input.company,
      input.source || 'Manual',
      input.status,
      input.notes,
      now,
      now,
    );

    const created = fetchLeadByIdForUser(id, userId);
    res.status(201).json({
      lead: mapLeadRow(created),
      summary: buildLeadSummary(userId),
    });
  }),
);

router.get(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const lead = fetchLeadByIdForUser(String(req.params.id), userId);
    const notesRows = db
      .prepare(
        `SELECT * FROM lead_notes
         WHERE lead_id = ? AND user_id = ?
         ORDER BY created_at DESC`,
      )
      .all(lead.id, userId) as LeadNoteRow[];

    res.json({
      lead: mapLeadRow(lead),
      timelineNotes: notesRows.map(mapLeadNoteRow),
    });
  }),
);

router.patch(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const existing = fetchLeadByIdForUser(String(req.params.id), userId);

    const parsed = leadInputSchema.safeParse({
      ideaId: req.body?.ideaId !== undefined ? req.body.ideaId : existing.idea_id,
      name: req.body?.name ?? existing.name,
      email: req.body?.email ?? existing.email,
      phone: req.body?.phone ?? existing.phone,
      company: req.body?.company ?? existing.company,
      source: req.body?.source ?? existing.source,
      status: req.body?.status ?? existing.status,
      notes: req.body?.notes ?? existing.notes,
    });

    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid lead update.', {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const input = parsed.data;
    if (input.ideaId) {
      const idea = db
        .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
        .get(input.ideaId, userId);
      if (!idea) {
        throw new AppError(404, 'IDEA_NOT_FOUND', 'Linked idea not found.');
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE leads
      SET idea_id = ?, name = ?, email = ?, phone = ?, company = ?, source = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      input.ideaId || null,
      input.name,
      input.email,
      input.phone,
      input.company,
      input.source || 'Manual',
      input.status,
      input.notes,
      now,
      existing.id,
      userId,
    );

    const updated = fetchLeadByIdForUser(existing.id, userId);
    res.json({
      lead: mapLeadRow(updated),
      summary: buildLeadSummary(userId),
    });
  }),
);

router.patch(
  '/:id/stage',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const existing = fetchLeadByIdForUser(String(req.params.id), userId);

    const parsed = leadStageUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid pipeline stage.', {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      parsed.data.status,
      now,
      existing.id,
      userId,
    );

    const updated = fetchLeadByIdForUser(existing.id, userId);
    res.json({
      lead: mapLeadRow(updated),
      summary: buildLeadSummary(userId),
    });
  }),
);

router.delete(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const existing = fetchLeadByIdForUser(String(req.params.id), userId);
    db.prepare('DELETE FROM leads WHERE id = ? AND user_id = ?').run(existing.id, userId);

    writeAuditLog({
      userId,
      action: 'lead.delete',
      resourceType: 'lead',
      resourceId: existing.id,
      req,
    });

    res.json({
      ok: true,
      summary: buildLeadSummary(userId),
    });
  }),
);

router.post(
  '/:id/notes',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const lead = fetchLeadByIdForUser(String(req.params.id), userId);

    const parsed = leadNoteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Note content is required.', {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO lead_notes (id, lead_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, lead.id, userId, parsed.data.content, now);
    db.prepare('UPDATE leads SET updated_at = ? WHERE id = ? AND user_id = ?').run(
      now,
      lead.id,
      userId,
    );

    const created = db
      .prepare('SELECT * FROM lead_notes WHERE id = ? AND user_id = ?')
      .get(id, userId) as LeadNoteRow;

    res.status(201).json({ note: mapLeadNoteRow(created) });
  }),
);

router.delete(
  '/:id/notes/:noteId',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const lead = fetchLeadByIdForUser(String(req.params.id), userId);

    const note = db
      .prepare('SELECT * FROM lead_notes WHERE id = ? AND lead_id = ? AND user_id = ?')
      .get(String(req.params.noteId), lead.id, userId) as LeadNoteRow | undefined;

    if (!note) {
      throw new AppError(404, 'NOTE_NOT_FOUND', 'Timeline note not found.');
    }

    db.prepare('DELETE FROM lead_notes WHERE id = ? AND user_id = ?').run(note.id, userId);
    res.json({ ok: true });
  }),
);

export default router;
