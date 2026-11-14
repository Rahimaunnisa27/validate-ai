import { z } from 'zod';

export const LEAD_STAGES = [
  'New',
  'Contacted',
  'Interested',
  'Qualified',
  'Converted',
  'Lost',
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_CSV_ROWS = 500;

export const leadInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  name: z.string().trim().min(1, 'Lead name is required').max(150),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((val) => val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: 'Please enter a valid email address',
    })
    .optional()
    .default(''),
  phone: z.string().trim().max(60).optional().default(''),
  company: z.string().trim().max(150).optional().default(''),
  source: z.string().trim().max(100).optional().default('Manual'),
  status: z.enum(LEAD_STAGES).optional().default('New'),
  notes: z.string().trim().max(4000).optional().default(''),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export const leadStageUpdateSchema = z.object({
  status: z.enum(LEAD_STAGES),
});

export const leadNoteInputSchema = z.object({
  content: z.string().trim().min(1, 'Note content is required').max(2000),
});

export const csvColumnMappingSchema = z.object({
  name: z.string().trim().min(1, 'Name column mapping is required'),
  email: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  company: z.string().trim().optional().default(''),
  source: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default(''),
  notes: z.string().trim().optional().default(''),
});

export type CsvColumnMapping = z.infer<typeof csvColumnMappingSchema>;

export const leadCsvImportRequestSchema = z.object({
  csvText: z
    .string()
    .min(1, 'CSV content is required')
    .refine((s) => new TextEncoder().encode(s).length <= MAX_CSV_BYTES, {
      message: `CSV content exceeds the 2 MB (${MAX_CSV_BYTES.toLocaleString()} bytes) limit.`,
    }),
  mapping: csvColumnMappingSchema,
  ideaId: z.string().trim().nullable().optional(),
});

// ============================================================================
// CSV Parsing & Formula Injection Protection (=, +, -, @)
// ============================================================================

const FORMULA_TRIGGER_RE = /^[\s\u0000-\u001F]*[=+\-@]/;

export function hasCsvFormulaTrigger(value: string): boolean {
  if (!value) return false;
  return FORMULA_TRIGGER_RE.test(value);
}

/**
 * Neutralizes cells starting with =, +, -, @ (including after leading whitespace/control chars)
 * so imported values never persist executable spreadsheet formulas.
 */
export function sanitizeCsvImportCell(raw: string): {
  value: string;
  neutralized: boolean;
} {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { value: '', neutralized: false };
  if (hasCsvFormulaTrigger(trimmed)) {
    const stripped = trimmed.replace(/^[\s\u0000-\u001F]*[=+\-@]+/, '').trim();
    return {
      value: stripped ? `[text] ${stripped}` : '[neutralized]',
      neutralized: true,
    };
  }
  return { value: trimmed, neutralized: false };
}

/**
 * Escapes and neutralizes any cell starting with =, +, -, @ (or tab/CR) on CSV export
 * per OWASP CSV Injection guidelines, and applies RFC-4180 quoting.
 */
export function formatCsvExportCell(raw: string | number | null | undefined): string {
  const str = raw === null || raw === undefined ? '' : String(raw);
  const safe =
    hasCsvFormulaTrigger(str) || str.startsWith('\t') || str.startsWith('\r')
      ? `'${str}`
      : str;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildLeadsCsvExport(
  leads: Array<{
    name: string;
    email: string;
    phone: string;
    company: string;
    source: string;
    status: string;
    notes: string;
    createdAt: string;
  }>,
): string {
  const headers = ['Name', 'Email', 'Phone', 'Company', 'Source', 'Status', 'Notes', 'Created At'];
  const lines = [headers.map((h) => formatCsvExportCell(h)).join(',')];
  for (const lead of leads) {
    lines.push(
      [
        lead.name,
        lead.email,
        lead.phone,
        lead.company,
        lead.source,
        lead.status,
        lead.notes,
        lead.createdAt,
      ]
        .map((cell) => formatCsvExportCell(cell))
        .join(','),
    );
  }
  return lines.join('\r\n');
}

export interface ParsedCsvData {
  headers: string[];
  rows: Array<Record<string, string>>;
  totalDataRows: number;
}

export function parseCsvText(csvText: string, maxRows = MAX_CSV_ROWS): ParsedCsvData {
  const clean = csvText.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((c) => c.trim() !== '')) {
        records.push(row);
      }
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((c) => c.trim() !== '')) {
        records.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) {
      records.push(row);
    }
  }

  if (records.length === 0) {
    return { headers: [], rows: [], totalDataRows: 0 };
  }

  const headers = records[0].map((h, idx) => {
    const cleaned = h.trim();
    return cleaned || `Column ${idx + 1}`;
  });
  const dataRecords = records.slice(1);
  if (dataRecords.length > maxRows) {
    throw new Error(
      `CSV contains ${dataRecords.length} data rows, exceeding the maximum allowed ${maxRows} rows per import.`,
    );
  }

  const rows = dataRecords.map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = cells[idx] ?? '';
    });
    return obj;
  });

  return { headers, rows, totalDataRows: rows.length };
}

export function normalizeLeadStatus(raw: string): { status: LeadStage; valid: boolean } {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!trimmed) return { status: 'New', valid: true };
  const match = LEAD_STAGES.find((s) => s.toLowerCase() === trimmed);
  if (match) return { status: match, valid: true };
  return { status: 'New', valid: false };
}

export interface CsvRowImportResult {
  validRows: Array<{
    rowNumber: number;
    data: LeadInput;
    sanitizedFormulaColumns: string[];
  }>;
  errors: Array<{
    row: number;
    reason: string;
  }>;
  sanitizedFormulaCells: number;
}

export function validateCsvMappedRows(
  rows: Array<Record<string, string>>,
  mapping: CsvColumnMapping,
  ideaId: string | null = null,
): CsvRowImportResult {
  const validRows: CsvRowImportResult['validRows'] = [];
  const errors: CsvRowImportResult['errors'] = [];
  let sanitizedFormulaCells = 0;

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // 1-indexed including header row
    const sanitizedCols: string[] = [];

    const readMapped = (colName?: string): string => {
      if (!colName) return '';
      const rawVal = rawRow[colName] ?? '';
      const res = sanitizeCsvImportCell(rawVal);
      if (res.neutralized) {
        sanitizedFormulaCells += 1;
        sanitizedCols.push(colName);
      }
      return res.value;
    };

    const name = readMapped(mapping.name);
    const email = readMapped(mapping.email);
    const phone = readMapped(mapping.phone);
    const company = readMapped(mapping.company);
    const source = readMapped(mapping.source) || 'CSV Import';
    const rawStatus = readMapped(mapping.status);
    const notes = readMapped(mapping.notes);

    const statusCheck = normalizeLeadStatus(rawStatus);
    if (rawStatus && !statusCheck.valid) {
      errors.push({
        row: rowNumber,
        reason: `Invalid stage "${rawStatus}". Expected one of: ${LEAD_STAGES.join(', ')}.`,
      });
      return;
    }

    const parsed = leadInputSchema.safeParse({
      ideaId,
      name,
      email,
      phone,
      company,
      source,
      status: statusCheck.status,
      notes,
    });

    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      errors.push({
        row: rowNumber,
        reason: msg,
      });
      return;
    }

    validRows.push({
      rowNumber,
      data: parsed.data,
      sanitizedFormulaColumns: sanitizedCols,
    });
  });

  return { validRows, errors, sanitizedFormulaCells };
}

// ============================================================================
// Marketing Strategy Schemas & Budget Allocation Verification
// ============================================================================

export const BUDGET_TIERS = ['low', 'medium', 'high'] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

export function classifyBudgetTier(budgetInr: number): BudgetTier {
  if (budgetInr < 50_000) return 'low';
  if (budgetInr <= 300_000) return 'medium';
  return 'high';
}

export const marketingInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  title: z.string().trim().max(160).optional().default(''),
  businessDescription: z
    .string()
    .trim()
    .min(10, 'Business description must be at least 10 characters')
    .max(2000),
  targetAudience: z.string().trim().min(3, 'Target audience is required').max(500),
  industry: z.string().trim().min(2, 'Industry is required').max(150),
  budget: z.coerce.number().finite().positive('Budget must be greater than zero').max(1_000_000_000),
  market: z.string().trim().min(2, 'Market / geography is required').max(200),
  preferredChannels: z
    .array(z.string().trim().min(1).max(80))
    .min(1, 'Select at least one preferred channel')
    .max(12),
});

export type MarketingInput = z.infer<typeof marketingInputSchema>;

export const budgetAllocationItemSchema = z.object({
  channel: z.string().trim().min(1).max(120),
  percentage: z.number().finite().min(0).max(100),
  amount: z.number().finite().min(0),
  rationale: z.string().trim().min(3).max(500),
});

export type BudgetAllocationItem = z.infer<typeof budgetAllocationItemSchema>;

export const marketingStrategyJsonSchema = z.object({
  campaignTitle: z.string().trim().min(3).max(180),
  positioning: z.string().trim().min(10).max(2000),
  objectives: z.array(z.string().trim().min(3).max(400)).min(2).max(8),
  channels: z
    .array(
      z.object({
        channel: z.string().trim().min(2).max(120),
        priority: z.enum(['Primary', 'Secondary']),
        rationale: z.string().trim().min(5).max(500),
      }),
    )
    .min(1)
    .max(8),
  socialStrategy: z.object({
    cadence: z.string().trim().min(3).max(300),
    formats: z.array(z.string().trim().min(2).max(160)).min(1).max(8),
    themes: z.array(z.string().trim().min(2).max(200)).min(1).max(8),
  }),
  contentIdeas: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(200),
        format: z.string().trim().min(2).max(80),
        angle: z.string().trim().min(5).max(400),
      }),
    )
    .min(2)
    .max(10),
  campaigns: z
    .array(
      z.object({
        name: z.string().trim().min(3).max(180),
        goal: z.string().trim().min(5).max(400),
        channel: z.string().trim().min(2).max(100),
        actionSteps: z.array(z.string().trim().min(3).max(300)).min(1).max(6),
      }),
    )
    .min(1)
    .max(6),
  budgetAllocation: z.array(budgetAllocationItemSchema).min(1).max(10),
  acquisitionSuggestions: z.array(z.string().trim().min(5).max(400)).min(2).max(8),
  kpis: z
    .array(
      z.object({
        metric: z.string().trim().min(2).max(150),
        targetNote: z.string().trim().min(3).max(300),
      }),
    )
    .min(2)
    .max(8),
});

export type MarketingStrategyJson = z.infer<typeof marketingStrategyJsonSchema>;

export const marketingCampaignUpdateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  ideaId: z.string().trim().nullable().optional(),
  inputs: marketingInputSchema,
  strategy: marketingStrategyJsonSchema,
});

/**
 * Verifies that budget allocation percentages sum to 100 and amounts sum to totalBudget.
 * - Rejects empty/negative/zero-total allocations.
 * - Deterministically normalizes rounding drift so percentages sum strictly to 100
 *   and currency amounts sum strictly to Math.round(totalBudget * 100) / 100 (or integer INR).
 */
export function verifyAndNormalizeBudgetAllocation(
  items: BudgetAllocationItem[],
  totalBudget: number,
): {
  items: BudgetAllocationItem[];
  wasCorrected: boolean;
  percentageSum: number;
  amountSum: number;
} {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Budget allocation must include at least one channel.');
  }
  if (!Number.isFinite(totalBudget) || totalBudget <= 0) {
    throw new Error('Total budget must be a positive number.');
  }

  for (const item of items) {
    if (
      !Number.isFinite(item.percentage) ||
      !Number.isFinite(item.amount) ||
      item.percentage < 0 ||
      item.amount < 0
    ) {
      throw new Error(`Invalid negative or non-finite allocation for channel "${item.channel}".`);
    }
  }

  const rawPctSum = items.reduce((acc, i) => acc + i.percentage, 0);
  const rawAmtSum = items.reduce((acc, i) => acc + i.amount, 0);

  if (rawPctSum <= 0 && rawAmtSum <= 0) {
    throw new Error('Budget allocation percentages and amounts cannot all be zero.');
  }

  const pctAlreadyExact = Math.abs(rawPctSum - 100) < 0.001;
  const targetTotalCents = Math.round(totalBudget * 100);
  const amtAlreadyExact = Math.abs(Math.round(rawAmtSum * 100) - targetTotalCents) === 0;
  const eachMatchesBudget = items.every(
    (item) => Math.abs(item.amount - (totalBudget * item.percentage) / 100) <= 1,
  );

  if (pctAlreadyExact && amtAlreadyExact && eachMatchesBudget) {
    return {
      items,
      wasCorrected: false,
      percentageSum: 100,
      amountSum: Math.round(rawAmtSum * 100) / 100,
    };
  }

  // Derive weights from percentages if positive, otherwise from amounts.
  const baseWeights =
    rawPctSum > 0 ? items.map((i) => i.percentage) : items.map((i) => i.amount);
  const weightSum = baseWeights.reduce((a, b) => a + b, 0);

  // Allocate basis points (100.00% = 10000 bps) so percentages sum strictly to 100.00
  const exactBps = baseWeights.map((w) => (w / weightSum) * 10000);
  const floorBps = exactBps.map((b) => Math.floor(b));
  let remainderBps = 10000 - floorBps.reduce((a, b) => a + b, 0);
  const bpsOrder = exactBps
    .map((val, idx) => ({ idx, frac: val - Math.floor(val) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainderBps; k += 1) {
    floorBps[bpsOrder[k % bpsOrder.length].idx] += 1;
  }

  const normalizedPcts = floorBps.map((b) => b / 100);

  // Allocate amounts in minor units (paise/cents) from normalized percentages so sum === targetTotalCents
  const exactUnits = normalizedPcts.map((pct) => (pct / 100) * targetTotalCents);
  const floorUnits = exactUnits.map((u) => Math.floor(u));
  let remainderUnits = targetTotalCents - floorUnits.reduce((a, b) => a + b, 0);
  const unitOrder = exactUnits
    .map((val, idx) => ({ idx, frac: val - Math.floor(val) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainderUnits; k += 1) {
    floorUnits[unitOrder[k % unitOrder.length].idx] += 1;
  }

  const normalizedItems: BudgetAllocationItem[] = items.map((item, idx) => ({
    ...item,
    percentage: normalizedPcts[idx],
    amount: floorUnits[idx] / 100,
  }));

  const finalPctSum = Math.round(normalizedItems.reduce((a, b) => a + b.percentage, 0) * 100) / 100;
  const finalAmtSum = Math.round(normalizedItems.reduce((a, b) => a + b.amount, 0) * 100) / 100;

  return {
    items: normalizedItems,
    wasCorrected: true,
    percentageSum: finalPctSum,
    amountSum: finalAmtSum,
  };
}

// ============================================================================
// Sales Assistant Schemas
// ============================================================================

export const SALES_DRAFT_NOTICE =
  'Drafts are never sent automatically. Review, edit, and copy messages manually before sending.';

export const salesInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  title: z.string().trim().max(180).optional().default(''),
  productDescription: z
    .string()
    .trim()
    .min(10, 'Product description must be at least 10 characters')
    .max(2000),
  targetCustomer: z.string().trim().min(3, 'Target customer is required').max(500),
  pricePoint: z.string().trim().min(1, 'Price point is required').max(200),
  salesChannel: z.string().trim().min(2, 'Sales channel is required').max(200),
  valueProposition: z.string().trim().min(5, 'Value proposition is required').max(800),
  tone: z.string().trim().max(80).optional().default('Consultative and direct'),
});

export type SalesInput = z.infer<typeof salesInputSchema>;

export const salesOutreachDraftSchema = z.object({
  channel: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(10).max(4000),
});

export const salesFollowUpDraftSchema = z.object({
  step: z.string().trim().min(2).max(120),
  timing: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(10).max(4000),
});

export const salesPlaybookJsonSchema = z.object({
  title: z.string().trim().min(3).max(180),
  salesStrategy: z.string().trim().min(15).max(4000),
  pitch: z.string().trim().min(15).max(4000),
  productPositioning: z.string().trim().min(15).max(4000),
  pricingSuggestions: z.string().trim().min(10).max(4000),
  funnelRecommendations: z.string().trim().min(15).max(4000),
  outreachDrafts: z.array(salesOutreachDraftSchema).min(2).max(6),
  followUpDrafts: z.array(salesFollowUpDraftSchema).min(2).max(6),
});

export type SalesPlaybookJson = z.infer<typeof salesPlaybookJsonSchema>;

export const salesPlaybookUpdateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  ideaId: z.string().trim().nullable().optional(),
  inputs: salesInputSchema,
  playbook: salesPlaybookJsonSchema,
});
