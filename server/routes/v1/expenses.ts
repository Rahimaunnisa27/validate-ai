import crypto from 'node:crypto';
import { Router } from 'express';
import {
  EXPENSE_CATEGORIES,
  expenseBudgetInputSchema,
  expenseInputSchema,
  expenseUpdateSchema,
  type BudgetVsActualComparison,
  type ExpenseBudgetRecord,
  type ExpenseCategory,
  type ExpenseRecord,
  type ExpenseSummary,
  type PaymentMethod,
} from '../../../src/shared/phase5Schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { AppError, asyncHandler, sendError } from '../../utils/errors.ts';

interface ExpenseDbRow {
  id: string;
  user_id: string;
  startup_id: string | null;
  amount: number;
  category: string;
  date: string;
  payment_method: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface BudgetDbRow {
  id: string;
  user_id: string;
  category: string;
  month: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

function formatExpenseRow(row: ExpenseDbRow): ExpenseRecord {
  return {
    id: row.id,
    userId: row.user_id,
    startupId: row.startup_id,
    amount: row.amount,
    category: row.category as ExpenseCategory,
    date: row.date,
    paymentMethod: row.payment_method as PaymentMethod,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatBudgetRow(row: BudgetDbRow): ExpenseBudgetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category as ExpenseCategory,
    month: row.month,
    amount: row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const router = Router();
router.use(requireAuth);

// GET /api/v1/expenses
router.get(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { month, category } = req.query;

    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (typeof month === 'string' && month.trim()) {
      conditions.push("strftime('%Y-%m', date) = ?");
      params.push(month.trim());
    }
    if (typeof category === 'string' && category.trim()) {
      conditions.push('category = ?');
      params.push(category.trim());
    }

    const rows = db
      .prepare(
        `SELECT * FROM expenses
         WHERE ${conditions.join(' AND ')}
         ORDER BY date DESC, created_at DESC`,
      )
      .all(...params) as ExpenseDbRow[];

    // Calculate Summary Stats across all user's expenses (or filtered if month/category provided)
    const categoryRows = db
      .prepare(
        `SELECT category, SUM(amount) as total
         FROM expenses
         WHERE ${conditions.join(' AND ')}
         GROUP BY category`,
      )
      .all(...params) as Array<{ category: string; total: number }>;

    const byCategory: Record<string, number> = {};
    for (const cat of EXPENSE_CATEGORIES) {
      byCategory[cat] = 0;
    }
    let totalAmount = 0;
    for (const r of categoryRows) {
      byCategory[r.category] = r.total;
      totalAmount += r.total;
    }

    // Monthly Trend (last 12 months)
    const trendRows = db
      .prepare(
        `SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
         FROM expenses
         WHERE user_id = ?
         GROUP BY strftime('%Y-%m', date)
         ORDER BY month ASC
         LIMIT 12`,
      )
      .all(userId) as Array<{ month: string; total: number }>;

    const summary: ExpenseSummary = {
      totalAmount,
      byCategory,
      monthlyTrend: trendRows,
    };

    res.json({
      items: rows.map(formatExpenseRow),
      summary,
    });
  }),
);

// GET /api/v1/expenses/budgets
router.get(
  '/budgets',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const currentYearMonth = new Date().toISOString().slice(0, 7);
    const targetMonth =
      typeof req.query.month === 'string' && req.query.month.trim()
        ? req.query.month.trim()
        : currentYearMonth;

    const budgetRows = db
      .prepare(
        `SELECT * FROM expense_budgets
         WHERE user_id = ? AND month = ?
         ORDER BY category ASC`,
      )
      .all(userId, targetMonth) as BudgetDbRow[];

    const actualRows = db
      .prepare(
        `SELECT category, SUM(amount) as total
         FROM expenses
         WHERE user_id = ? AND strftime('%Y-%m', date) = ?
         GROUP BY category`,
      )
      .all(userId, targetMonth) as Array<{ category: string; total: number }>;

    const actualMap = new Map<string, number>();
    for (const r of actualRows) {
      actualMap.set(r.category, r.total);
    }

    const budgetMap = new Map<string, BudgetDbRow>();
    for (const b of budgetRows) {
      budgetMap.set(b.category, b);
    }

    // Combine all standard categories plus any custom budget/actual categories
    const categoriesToCompare = new Set<string>([
      ...EXPENSE_CATEGORIES,
      ...budgetMap.keys(),
      ...actualMap.keys(),
    ]);

    const comparison: BudgetVsActualComparison[] = [];
    for (const cat of categoriesToCompare) {
      const budgeted = budgetMap.get(cat)?.amount ?? 0;
      const actual = actualMap.get(cat) ?? 0;
      const variance = budgeted - actual;
      const percentageUsed = budgeted > 0 ? Math.round((actual / budgeted) * 1000) / 10 : 0;
      let status: 'under' | 'on_track' | 'over' = 'under';
      if (budgeted > 0) {
        if (actual > budgeted) {
          status = 'over';
        } else if (actual >= budgeted * 0.8) {
          status = 'on_track';
        } else {
          status = 'under';
        }
      } else if (actual > 0) {
        status = 'over';
      }

      comparison.push({
        category: cat as ExpenseCategory,
        budgeted,
        actual,
        variance,
        percentageUsed,
        status,
      });
    }

    res.json({
      items: budgetRows.map(formatBudgetRow),
      comparison,
      selectedMonth: targetMonth,
    });
  }),
);

// POST /api/v1/expenses/budgets
router.post(
  '/budgets',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const parsed = expenseBudgetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid budget input.', parsed.error.format());
    }

    const { category, month, amount } = parsed.data;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO expense_budgets (id, user_id, category, month, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, category, month)
       DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
    ).run(id, userId, category, month, amount, now, now);

    const saved = db
      .prepare('SELECT * FROM expense_budgets WHERE user_id = ? AND category = ? AND month = ?')
      .get(userId, category, month) as BudgetDbRow;

    res.status(201).json({ budget: formatBudgetRow(saved) });
  }),
);

// DELETE /api/v1/expenses/budgets/:id
router.delete(
  '/budgets/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = db
      .prepare('SELECT id FROM expense_budgets WHERE id = ? AND user_id = ?')
      .get(id, userId);

    if (!existing) {
      return sendError(res, 404, 'BUDGET_NOT_FOUND', 'Budget not found.');
    }

    db.prepare('DELETE FROM expense_budgets WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ ok: true });
  }),
);

// POST /api/v1/expenses
router.post(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const parsed = expenseInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid expense fields.', parsed.error.format());
    }

    const { startupId, amount, category, date, paymentMethod, description } = parsed.data;

    if (startupId) {
      const startup = db
        .prepare('SELECT id FROM startups WHERE id = ? AND user_id = ?')
        .get(startupId, userId);
      if (!startup) {
        throw new AppError(404, 'STARTUP_NOT_FOUND', 'Specified startup does not exist.');
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO expenses (
        id, user_id, startup_id, amount, category, date, payment_method, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      startupId || null,
      amount,
      category,
      date,
      paymentMethod || 'Other',
      description || '',
      now,
      now,
    );

    const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as ExpenseDbRow;
    res.status(201).json({ expense: formatExpenseRow(created) });
  }),
);

// GET /api/v1/expenses/:id
router.get(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const row = db
      .prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?')
      .get(id, userId) as ExpenseDbRow | undefined;

    if (!row) {
      return sendError(res, 404, 'EXPENSE_NOT_FOUND', 'Expense not found.');
    }

    res.json({ expense: formatExpenseRow(row) });
  }),
);

// PATCH /api/v1/expenses/:id
router.patch(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = db
      .prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?')
      .get(id, userId) as ExpenseDbRow | undefined;

    if (!existing) {
      return sendError(res, 404, 'EXPENSE_NOT_FOUND', 'Expense not found.');
    }

    const parsed = expenseUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid expense update fields.', parsed.error.format());
    }

    const data = parsed.data;
    if (data.startupId) {
      const startup = db
        .prepare('SELECT id FROM startups WHERE id = ? AND user_id = ?')
        .get(data.startupId, userId);
      if (!startup) {
        throw new AppError(404, 'STARTUP_NOT_FOUND', 'Specified startup does not exist.');
      }
    }

    const now = new Date().toISOString();
    const updatedAmount = data.amount ?? existing.amount;
    const updatedCategory = data.category ?? existing.category;
    const updatedDate = data.date ?? existing.date;
    const updatedPaymentMethod = data.paymentMethod ?? existing.payment_method;
    const updatedDescription = data.description ?? existing.description;
    const updatedStartupId =
      data.startupId !== undefined ? data.startupId : existing.startup_id;

    db.prepare(
      `UPDATE expenses SET
        amount = ?,
        category = ?,
        date = ?,
        payment_method = ?,
        description = ?,
        startup_id = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?`,
    ).run(
      updatedAmount,
      updatedCategory,
      updatedDate,
      updatedPaymentMethod,
      updatedDescription,
      updatedStartupId,
      now,
      id,
      userId,
    );

    const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as ExpenseDbRow;
    res.json({ expense: formatExpenseRow(updated) });
  }),
);

// DELETE /api/v1/expenses/:id
router.delete(
  '/:id',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = db
      .prepare('SELECT id FROM expenses WHERE id = ? AND user_id = ?')
      .get(id, userId);

    if (!existing) {
      return sendError(res, 404, 'EXPENSE_NOT_FOUND', 'Expense not found.');
    }

    db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ ok: true });
  }),
);

export default router;
