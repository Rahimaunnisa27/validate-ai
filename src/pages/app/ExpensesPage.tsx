import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Filter,
  Pencil,
  PieChart as PieIcon,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import { EmptyState, ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { api, ApiClientError } from '../../lib/api.ts';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type BudgetVsActualComparison,
  type ExpenseBudgetInput,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecord,
  type ExpenseSummary,
  type PaymentMethod,
} from '../../shared/phase5Schemas.ts';

const CATEGORY_COLORS: Record<string, string> = {
  'Software & Tools': '#0284c7',
  'Marketing & Ads': '#8b5cf6',
  'Salaries & Contractors': '#10b981',
  'Legal & Compliance': '#f59e0b',
  'Office & Operations': '#06b6d4',
  'Travel & Events': '#ec4899',
  Other: '#64748b',
};

function formatInr(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [budgetComparison, setBudgetComparison] = useState<BudgetVsActualComparison[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseInput>({
    amount: 0,
    category: 'Software & Tools',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'Credit Card',
    description: '',
  });

  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState<ExpenseBudgetInput>({
    category: 'Software & Tools',
    month: selectedMonth,
    amount: 10000,
  });

  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.expenses.list({ month: selectedMonth }),
      api.expenses.budgets(selectedMonth),
    ])
      .then(([expRes, budgetRes]) => {
        setExpenses(expRes.items);
        setSummary(expRes.summary);
        setBudgetComparison(budgetRes.comparison);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load expenses.');
      })
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    if (filterCategory === 'all') return expenses;
    return expenses.filter((e) => e.category === filterCategory);
  }, [expenses, filterCategory]);

  // Overall totals for the selected month
  const totalSpentInMonth = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const totalBudgetedInMonth = useMemo(() => {
    return budgetComparison.reduce((sum, b) => sum + b.budgeted, 0);
  }, [budgetComparison]);

  const totalVariance = totalBudgetedInMonth - totalSpentInMonth;

  // Prepare chart data
  const categoryPieData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.byCategory)
      .filter(([_, val]) => val > 0)
      .map(([name, value]) => ({ name, value }));
  }, [summary]);

  const monthlyTrendData = useMemo(() => {
    if (!summary?.monthlyTrend) return [];
    return summary.monthlyTrend.map((m) => ({
      month: m.month,
      total: m.total,
    }));
  }, [summary]);

  const budgetVsActualData = useMemo(() => {
    return budgetComparison
      .filter((b) => b.budgeted > 0 || b.actual > 0)
      .map((b) => ({
        category: b.category,
        budgeted: b.budgeted,
        actual: b.actual,
        status: b.status,
      }));
  }, [budgetComparison]);

  const handleOpenCreateExpense = () => {
    setEditingExpense(null);
    setExpenseForm({
      amount: 1000,
      category: 'Software & Tools',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'Credit Card',
      description: '',
    });
    setExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (expense: ExpenseRecord) => {
    setEditingExpense(expense);
    setExpenseForm({
      amount: expense.amount,
      category: expense.category,
      date: expense.date,
      paymentMethod: expense.paymentMethod,
      description: expense.description,
    });
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseForm.amount <= 0) {
      toast.error('Amount must be greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingExpense) {
        await api.expenses.update(editingExpense.id, expenseForm);
        toast.success('Expense updated');
      } else {
        await api.expenses.create(expenseForm);
        toast.success('Expense recorded');
      }
      setExpenseModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.expenses.delete(id);
      toast.success('Expense deleted');
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete expense.');
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (budgetForm.amount <= 0) {
      toast.error('Budget amount must be greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      await api.expenses.saveBudget(budgetForm);
      toast.success(`Budget updated for ${budgetForm.category}`);
      setBudgetModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to save budget.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Expense Tracker"
      breadcrumb="Workspace / Expenses"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBudgetForm({
                category: 'Software & Tools',
                month: selectedMonth,
                amount: 10000,
              });
              setBudgetModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2 text-xs font-semibold text-ink-primary hover:bg-surface-subtle transition-colors"
          >
            <Wallet className="h-4 w-4 text-brand-primary" /> Set Budget
          </button>
          <button
            type="button"
            onClick={handleOpenCreateExpense}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" /> Record Expense
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Controls: Month and Category Filter */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-ink-muted" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="Select month"
                className="rounded-lg border border-border-hairline bg-surface-canvas px-3 py-1.5 text-xs font-semibold text-ink-primary focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-ink-muted" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                aria-label="Filter by category"
                className="rounded-lg border border-border-hairline bg-surface-canvas px-3 py-1.5 text-xs text-ink-primary focus:border-brand-primary focus:outline-none"
              >
                <option value="all">All Categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading and Error */}
        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
          </div>
        )}

        {error && <ErrorState message={error} onRetry={loadData} />}

        {!loading && !error && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
                <p className="text-xs font-medium text-ink-muted">Total Expenses ({selectedMonth})</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink-primary tabular-nums">
                  {formatInr(totalSpentInMonth)}
                </p>
                <p className="mt-1 text-xs text-ink-secondary tabular-nums">
                  {expenses.length} recorded expense{expenses.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
                <p className="text-xs font-medium text-ink-muted">Allocated Budget ({selectedMonth})</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink-primary tabular-nums">
                  {formatInr(totalBudgetedInMonth)}
                </p>
                <p className="mt-1 text-xs text-ink-secondary">
                  Across category budgets
                </p>
              </div>

              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
                <p className="text-xs font-medium text-ink-muted">Net Variance</p>
                <p
                  className={`mt-2 font-display text-2xl font-bold tabular-nums ${
                    totalVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatInr(Math.abs(totalVariance))}
                  <span className="text-xs font-normal ml-1">
                    {totalVariance >= 0 ? 'under' : 'over'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-secondary">
                  {totalBudgetedInMonth > 0
                    ? `${Math.round((totalSpentInMonth / totalBudgetedInMonth) * 100)}% of budget utilized`
                    : 'No budget configured yet'}
                </p>
              </div>

              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
                <p className="text-xs font-medium text-ink-muted">All-Time Expenses</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink-primary tabular-nums">
                  {formatInr(summary?.totalAmount || 0)}
                </p>
                <p className="mt-1 text-xs text-ink-secondary">Cumulative tracking</p>
              </div>
            </div>

            {/* Recharts Visualizations Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Category Breakdown (Pie / Bar) */}
              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
                <div className="flex items-center gap-2 mb-4">
                  <PieIcon className="h-4 w-4 text-brand-primary" />
                  <h3 className="font-display text-sm font-bold text-ink-primary">
                    Category Breakdown ({selectedMonth})
                  </h3>
                </div>

                {categoryPieData.length === 0 ? (
                  <div className="flex h-56 items-center justify-center text-xs text-ink-muted">
                    No expense data for this month
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) =>
                            `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                          }
                          labelLine={false}
                        >
                          {categoryPieData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={CATEGORY_COLORS[entry.name] || '#64748b'}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: unknown) => [
                            formatInr(Number(value) || 0),
                            'Spent',
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Monthly Trend (Bar) */}
              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-brand-primary" />
                  <h3 className="font-display text-sm font-bold text-ink-primary">
                    Monthly Expense Trend
                  </h3>
                </div>

                {monthlyTrendData.length === 0 ? (
                  <div className="flex h-56 items-center justify-center text-xs text-ink-muted">
                    No historical expense trend available
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyTrendData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="month" textAnchor="end" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(value: unknown) => [
                            formatInr(Number(value) || 0),
                            'Expenses',
                          ]}
                        />
                        <Bar dataKey="total" fill="#0284c7" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Budget vs Actual Comparison Chart */}
            <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-brand-primary" />
                  <h3 className="font-display text-sm font-bold text-ink-primary">
                    Budget vs. Actual Spending ({selectedMonth})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(true)}
                  className="text-xs font-semibold text-brand-primary hover:underline"
                >
                  Configure Category Budgets
                </button>
              </div>

              {budgetVsActualData.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-xs text-ink-muted">
                  No budget or expense data to compare for this month. Click "Set Budget" or "Record Expense" above.
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetVsActualData} margin={{ top: 10, right: 30, left: 10, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="category" angle={-15} textAnchor="end" interval={0} tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: unknown) => [formatInr(Number(value) || 0)]} />
                      <Legend />
                      <Bar dataKey="budgeted" name="Budgeted" fill="#0284c7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actual" name="Actual Spent" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Expenses Records Table */}
            <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-4 border-b border-border-hairline">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-brand-primary" />
                  <h3 className="font-display text-sm font-bold text-ink-primary">
                    Recorded Expenses ({filteredExpenses.length})
                  </h3>
                </div>
              </div>

              {filteredExpenses.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-muted">
                  No expenses found for this month and category.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border-hairline text-ink-muted">
                        <th className="py-2.5 px-3 font-semibold">Date</th>
                        <th className="py-2.5 px-3 font-semibold">Category</th>
                        <th className="py-2.5 px-3 font-semibold">Description</th>
                        <th className="py-2.5 px-3 font-semibold">Payment Method</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-hairline">
                      {filteredExpenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-surface-subtle/50 transition-colors">
                          <td className="py-2.5 px-3 text-ink-secondary whitespace-nowrap font-medium">
                            {exp.date}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                              style={{
                                backgroundColor: `${CATEGORY_COLORS[exp.category] || '#64748b'}15`,
                                color: CATEGORY_COLORS[exp.category] || '#64748b',
                              }}
                            >
                              {exp.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-ink-primary max-w-xs truncate">
                            {exp.description || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-ink-secondary whitespace-nowrap">
                            {exp.paymentMethod}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-ink-primary tabular-nums">
                            {formatInr(exp.amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenEditExpense(exp)}
                              className="p-1 text-ink-muted hover:text-ink-primary rounded"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 text-ink-muted hover:text-red-600 rounded ml-1"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Record Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-border-hairline bg-surface-canvas p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-border-hairline">
              <h3 className="font-display text-base font-bold text-ink-primary">
                {editingExpense ? 'Edit Expense' : 'Record New Expense'}
              </h3>
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-subtle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-primary">
                  Amount (INR) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={expenseForm.amount || ''}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-primary">Category *</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })
                  }
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-primary">Date *</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-primary">
                    Payment Method
                  </label>
                  <select
                    value={expenseForm.paymentMethod}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        paymentMethod: e.target.value as PaymentMethod,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-primary">Description</label>
                <input
                  type="text"
                  placeholder="e.g. AWS monthly cloud hosting or Google Workspace"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-hairline">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="rounded-lg border border-border-hairline px-4 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingExpense ? 'Update' : 'Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Category Budget Modal */}
      {budgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-border-hairline bg-surface-canvas p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-border-hairline">
              <h3 className="font-display text-base font-bold text-ink-primary">
                Set Category Budget
              </h3>
              <button
                type="button"
                onClick={() => setBudgetModalOpen(false)}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-subtle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-primary">Category *</label>
                <select
                  value={budgetForm.category}
                  onChange={(e) =>
                    setBudgetForm({ ...budgetForm, category: e.target.value as ExpenseCategory })
                  }
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-primary">Month *</label>
                <input
                  type="month"
                  required
                  value={budgetForm.month}
                  onChange={(e) => setBudgetForm({ ...budgetForm, month: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-primary">
                  Budget Amount (INR) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={budgetForm.amount || ''}
                  onChange={(e) =>
                    setBudgetForm({ ...budgetForm, amount: parseFloat(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-hairline">
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="rounded-lg border border-border-hairline px-4 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ExpensesPage;
