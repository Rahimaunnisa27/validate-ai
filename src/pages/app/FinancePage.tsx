import {
  AlertTriangle,
  Calculator,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '../../components/ui/States.tsx';
import {
  api,
  ApiClientError,
  type ComputedFinancialModel,
  type FinancialPlan,
  type FinancialPlanInputs,
  type Idea,
  type Startup,
} from '../../lib/api.ts';
import {
  DEFAULT_SCENARIO_MULTIPLIERS,
  SCENARIO_KEYS,
  type ScenarioKey,
} from '../../shared/phase3aSchemas.ts';

function formatInr(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function createEmptyInputs(): FinancialPlanInputs {
  return {
    name: 'Base Unit Economics Plan',
    startupId: null,
    ideaId: null,
    initialInvestment: 250000,
    sellingPrice: 3500,
    unitsSoldPerMonth: 60,
    fixedCosts: 35000,
    variableCostPerUnit: 850,
    marketing: 25000,
    salaries: 60000,
    operationalExpenses: 20000,
    scenarioMultipliers: {
      conservative: { ...DEFAULT_SCENARIO_MULTIPLIERS.conservative },
      expected: { ...DEFAULT_SCENARIO_MULTIPLIERS.expected },
      optimistic: { ...DEFAULT_SCENARIO_MULTIPLIERS.optimistic },
    },
  };
}

const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  conservative: 'Conservative',
  expected: 'Expected',
  optimistic: 'Optimistic',
};

export function FinancePage() {
  const [plans, setPlans] = useState<FinancialPlan[]>([]);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<FinancialPlanInputs>(createEmptyInputs);
  const [previewComputed, setPreviewComputed] = useState<ComputedFinancialModel | null>(null);
  const [activeAiInterpretation, setActiveAiInterpretation] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>('expected');

  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinancialPlan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectSavedPlan = useCallback((plan: FinancialPlan) => {
    setSelectedPlanId(plan.id);
    setInputs({
      ...plan.inputs,
      startupId: plan.startupId ?? null,
      ideaId: plan.ideaId ?? null,
      scenarioMultipliers: {
        conservative: {
          ...(plan.inputs.scenarioMultipliers?.conservative ??
            DEFAULT_SCENARIO_MULTIPLIERS.conservative),
        },
        expected: {
          ...(plan.inputs.scenarioMultipliers?.expected ??
            DEFAULT_SCENARIO_MULTIPLIERS.expected),
        },
        optimistic: {
          ...(plan.inputs.scenarioMultipliers?.optimistic ??
            DEFAULT_SCENARIO_MULTIPLIERS.optimistic),
        },
      },
    });
    setPreviewComputed(plan.computed);
    setActiveAiInterpretation(plan.aiInterpretation);
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, startupsRes, ideasRes] = await Promise.all([
        api.finance.list(),
        api.startups.list(100, 0),
        api.ideas.list(undefined, 100, 0),
      ]);
      setPlans(plansRes.items);
      setStartups(startupsRes.items);
      setIdeas(ideasRes.items);

      if (plansRes.items.length > 0) {
        selectSavedPlan(plansRes.items[0]);
      } else {
        const defaults = createEmptyInputs();
        setSelectedPlanId(null);
        setInputs(defaults);
        setActiveAiInterpretation(null);
        const calc = await api.finance.calculate(defaults);
        setPreviewComputed(calc.computed);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to load financial planner data.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectSavedPlan]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const handleStartNewPlan = async () => {
    const defaults = createEmptyInputs();
    setSelectedPlanId(null);
    setInputs(defaults);
    setActiveAiInterpretation(null);
    try {
      const calc = await api.finance.calculate(defaults);
      setPreviewComputed(calc.computed);
    } catch {
      // ignore preview error on reset
    }
  };

  const handleImportFromIdea = () => {
    if (!inputs.ideaId) {
      toast.error('Select a linked Idea first to import its financial assumptions.');
      return;
    }
    const idea = ideas.find((i) => i.id === inputs.ideaId);
    if (!idea) return;

    const fin = idea.financials || {};
    const next: FinancialPlanInputs = {
      ...inputs,
      name: inputs.name.trim() ? `${idea.title.slice(0, 80)} Plan` : inputs.name,
      startupId: idea.startupId ?? inputs.startupId ?? null,
      initialInvestment:
        typeof fin.initialCapitalInr === 'number' && fin.initialCapitalInr >= 0
          ? fin.initialCapitalInr
          : inputs.initialInvestment,
      sellingPrice:
        typeof fin.pricePerUnitInr === 'number' && fin.pricePerUnitInr >= 0
          ? fin.pricePerUnitInr
          : inputs.sellingPrice,
      unitsSoldPerMonth:
        typeof fin.estimatedMonthlyCustomers === 'number' && fin.estimatedMonthlyCustomers >= 0
          ? fin.estimatedMonthlyCustomers
          : inputs.unitsSoldPerMonth,
      operationalExpenses:
        typeof fin.monthlyBurnInr === 'number' && fin.monthlyBurnInr >= 0
          ? fin.monthlyBurnInr
          : inputs.operationalExpenses,
    };
    setInputs(next);
    toast.success('Imported financial assumptions from selected idea.');
  };

  const updateNumberField = (
    key: keyof Omit<
      FinancialPlanInputs,
      'name' | 'startupId' | 'ideaId' | 'scenarioMultipliers'
    >,
    rawValue: string,
  ) => {
    const num = rawValue === '' ? 0 : Number(rawValue);
    setInputs((prev) => ({
      ...prev,
      [key]: Number.isFinite(num) && num >= 0 ? num : 0,
    }));
  };

  const updateMultiplier = (
    scenario: ScenarioKey,
    field: 'revenueMultiplier' | 'costMultiplier',
    rawValue: string,
  ) => {
    const num = rawValue === '' ? 1 : Number(rawValue);
    setInputs((prev) => ({
      ...prev,
      scenarioMultipliers: {
        ...prev.scenarioMultipliers,
        [scenario]: {
          ...prev.scenarioMultipliers[scenario],
          [field]: Number.isFinite(num) ? num : 1,
        },
      },
    }));
  };

  const handleCalculatePreview = async () => {
    setPreviewing(true);
    try {
      const res = await api.finance.calculate(inputs);
      setPreviewComputed(res.computed);
      toast.success('Calculations updated on server.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to calculate scenario.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (selectedPlanId) {
        const res = await api.finance.update(selectedPlanId, inputs);
        setPlans((prev) => prev.map((p) => (p.id === res.plan.id ? res.plan : p)));
        selectSavedPlan(res.plan);
        toast.success('Financial plan recalculated and saved.');
      } else {
        const res = await api.finance.create(inputs);
        setPlans((prev) => [res.plan, ...prev]);
        selectSavedPlan(res.plan);
        toast.success('Financial plan calculated and saved.');
      }
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to save financial plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.finance.delete(deleteTarget.id);
      const remaining = plans.filter((p) => p.id !== deleteTarget.id);
      setPlans(remaining);
      if (selectedPlanId === deleteTarget.id) {
        if (remaining.length > 0) {
          selectSavedPlan(remaining[0]);
        } else {
          await handleStartNewPlan();
        }
      }
      setDeleteTarget(null);
      toast.success('Financial plan deleted.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete plan.');
    } finally {
      setDeleting(false);
    }
  };

  const currentScenarioData = previewComputed?.scenarios[activeScenario] ?? null;

  const cashBalanceChartData = useMemo(() => {
    if (!previewComputed) return [];
    return Array.from({ length: 12 }, (_, idx) => ({
      label: `M${idx + 1}`,
      conservative: previewComputed.scenarios.conservative.cashFlow12Months[idx]?.cashBalance ?? 0,
      expected: previewComputed.scenarios.expected.cashFlow12Months[idx]?.cashBalance ?? 0,
      optimistic: previewComputed.scenarios.optimistic.cashFlow12Months[idx]?.cashBalance ?? 0,
    }));
  }, [previewComputed]);

  const revenueCostChartData = useMemo(() => {
    if (!currentScenarioData) return [];
    return currentScenarioData.cashFlow12Months.map((pt) => ({
      label: pt.label,
      revenue: pt.revenue,
      totalExpenses: pt.totalExpenses,
      operatingProfit: pt.operatingProfit,
    }));
  }, [currentScenarioData]);

  return (
    <AppShell
      title="Financial Planner"
      breadcrumb="Workspace / Financial Planner"
      action={
        <button
          type="button"
          onClick={() => void handleStartNewPlan()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New Plan
        </button>
      }
    >
      <div className="space-y-6">
        {loading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SkeletonCard rows={5} />
            <SkeletonCard rows={5} />
            <SkeletonCard rows={5} />
          </div>
        )}

        {error && <ErrorState message={error} onRetry={() => void loadWorkspaceData()} />}

        {!loading && !error && (
          <>
            {/* Saved Plans Strip */}
            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-ink-primary">
                    Saved Financial Plans ({plans.length})
                  </h2>
                  <p className="text-xs text-ink-secondary">
                    All revenue, margin, break-even, and 12-month cash-flow math runs deterministically on the server.
                  </p>
                </div>
                {selectedPlanId && (
                  <button
                    type="button"
                    onClick={() => {
                      const found = plans.find((p) => p.id === selectedPlanId);
                      if (found) setDeleteTarget(found);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-semantic-danger/30 px-3 py-1.5 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete Selected
                  </button>
                )}
              </div>

              {plans.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<Calculator className="h-5 w-5" aria-hidden="true" />}
                    title="No saved financial plans yet"
                    description="Configure your assumptions below and save your first model to populate your Dashboard financial overview."
                  />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plans.map((plan) => {
                    const isSelected = plan.id === selectedPlanId;
                    const exp = plan.computed.scenarios.expected;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => selectSavedPlan(plan)}
                        className={`text-left rounded-xl border p-4 transition-colors ${
                          isSelected
                            ? 'border-brand-primary bg-brand-primary/5'
                            : 'border-border-hairline bg-surface-subtle hover:bg-surface-canvas'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-ink-primary">
                            {plan.name}
                          </p>
                          <span
                            className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                              exp.operatingProfit >= 0
                                ? 'border-semantic-success/30 bg-semantic-success/10 text-semantic-success'
                                : 'border-semantic-warning/30 bg-semantic-warning/10 text-semantic-warning'
                            }`}
                          >
                            {exp.operatingProfit >= 0 ? 'Profitable' : exp.runwayLabel}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-ink-muted">
                          {plan.startupName || plan.ideaTitle || 'Standalone workspace model'}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-xs text-ink-secondary tabular-nums">
                          <span>Rev: {formatInr(exp.revenue)}/mo</span>
                          <span>Exp: {formatInr(exp.totalExpenses)}/mo</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Inputs Form + Computed Model */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleSavePlan}
                className="lg:col-span-5 rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-5 h-fit"
              >
                <div className="flex items-center justify-between border-b border-border-hairline pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-ink-primary">
                      {selectedPlanId ? 'Edit Saved Plan' : 'New Financial Model'}
                    </h3>
                    <p className="text-xs text-ink-muted">All values in INR (₹) per month</p>
                  </div>
                  {selectedPlanId && (
                    <span className="rounded-md border border-border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                      Editing
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="fp-name"
                      className="block text-xs font-medium text-ink-primary mb-1"
                    >
                      Plan Name
                    </label>
                    <input
                      id="fp-name"
                      type="text"
                      required
                      minLength={2}
                      value={inputs.name}
                      onChange={(e) => setInputs((p) => ({ ...p, name: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="fp-startup"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Linked Startup (optional)
                      </label>
                      <select
                        id="fp-startup"
                        value={inputs.startupId ?? ''}
                        onChange={(e) =>
                          setInputs((p) => ({ ...p, startupId: e.target.value || null }))
                        }
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                      >
                        <option value="">None</option>
                        {startups.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="fp-idea"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Linked Idea (optional)
                      </label>
                      <select
                        id="fp-idea"
                        value={inputs.ideaId ?? ''}
                        onChange={(e) =>
                          setInputs((p) => ({ ...p, ideaId: e.target.value || null }))
                        }
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                      >
                        <option value="">None</option>
                        {ideas.map((idea) => (
                          <option key={idea.id} value={idea.id}>
                            {idea.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {inputs.ideaId && (
                    <button
                      type="button"
                      onClick={handleImportFromIdea}
                      className="text-xs font-medium text-brand-primary hover:underline"
                    >
                      Import financial inputs from selected idea
                    </button>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
                    <div>
                      <label
                        htmlFor="fp-initial"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Initial Investment (₹)
                      </label>
                      <input
                        id="fp-initial"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.initialInvestment}
                        onChange={(e) => updateNumberField('initialInvestment', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fp-price"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Selling Price / Unit (₹)
                      </label>
                      <input
                        id="fp-price"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.sellingPrice}
                        onChange={(e) => updateNumberField('sellingPrice', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fp-units"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Units Sold / Month
                      </label>
                      <input
                        id="fp-units"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.unitsSoldPerMonth}
                        onChange={(e) => updateNumberField('unitsSoldPerMonth', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fp-var"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Variable Cost / Unit (₹)
                      </label>
                      <input
                        id="fp-var"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.variableCostPerUnit}
                        onChange={(e) => updateNumberField('variableCostPerUnit', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fp-fixed"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Fixed Costs / Mo (₹)
                      </label>
                      <input
                        id="fp-fixed"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.fixedCosts}
                        onChange={(e) => updateNumberField('fixedCosts', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fp-marketing"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Marketing / Mo (₹)
                      </label>
                      <input
                        id="fp-marketing"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.marketing}
                        onChange={(e) => updateNumberField('marketing', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fp-salaries"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Salaries / Mo (₹)
                      </label>
                      <input
                        id="fp-salaries"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.salaries}
                        onChange={(e) => updateNumberField('salaries', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fp-ops"
                        className="block text-xs font-medium text-ink-primary mb-1"
                      >
                        Operational Expenses / Mo (₹)
                      </label>
                      <input
                        id="fp-ops"
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={inputs.operationalExpenses}
                        onChange={(e) => updateNumberField('operationalExpenses', e.target.value)}
                        className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {/* Adjustable Scenario Multipliers */}
                <div className="border-t border-border-hairline pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                      Scenario Multipliers
                    </h4>
                    <button
                      type="button"
                      onClick={() =>
                        setInputs((prev) => ({
                          ...prev,
                          scenarioMultipliers: {
                            conservative: { ...DEFAULT_SCENARIO_MULTIPLIERS.conservative },
                            expected: { ...DEFAULT_SCENARIO_MULTIPLIERS.expected },
                            optimistic: { ...DEFAULT_SCENARIO_MULTIPLIERS.optimistic },
                          },
                        }))
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Reset
                    </button>
                  </div>

                  <div className="space-y-2">
                    {SCENARIO_KEYS.map((key) => (
                      <div
                        key={key}
                        className="grid grid-cols-12 items-center gap-2 rounded-lg border border-border-hairline bg-surface-subtle px-3 py-2"
                      >
                        <span className="col-span-4 text-xs font-semibold text-ink-primary">
                          {SCENARIO_LABELS[key]}
                        </span>
                        <label className="col-span-4 text-[11px] text-ink-muted">
                          Units ×
                          <input
                            type="number"
                            min={0.1}
                            max={10}
                            step="0.05"
                            aria-label={`${SCENARIO_LABELS[key]} revenue multiplier`}
                            value={inputs.scenarioMultipliers[key].revenueMultiplier}
                            onChange={(e) =>
                              updateMultiplier(key, 'revenueMultiplier', e.target.value)
                            }
                            className="mt-0.5 w-full h-8 rounded border border-border-hairline bg-surface-canvas px-2 text-xs text-ink-primary tabular-nums"
                          />
                        </label>
                        <label className="col-span-4 text-[11px] text-ink-muted">
                          Costs ×
                          <input
                            type="number"
                            min={0.1}
                            max={10}
                            step="0.05"
                            aria-label={`${SCENARIO_LABELS[key]} cost multiplier`}
                            value={inputs.scenarioMultipliers[key].costMultiplier}
                            onChange={(e) =>
                              updateMultiplier(key, 'costMultiplier', e.target.value)
                            }
                            className="mt-0.5 w-full h-8 rounded border border-border-hairline bg-surface-canvas px-2 text-xs text-ink-primary tabular-nums"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={previewing || saving}
                    onClick={() => void handleCalculatePreview()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3.5 text-sm font-medium text-ink-primary hover:bg-surface-subtle transition-colors disabled:opacity-50"
                  >
                    <Calculator className="h-4 w-4" aria-hidden="true" />
                    {previewing ? 'Calculating...' : 'Preview Numbers'}
                  </button>

                  <button
                    type="submit"
                    disabled={saving || previewing}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving
                      ? 'Saving & Explaining...'
                      : selectedPlanId
                        ? 'Save Changes'
                        : 'Calculate & Save Plan'}
                  </button>
                </div>
              </form>

              {/* Right Column: Computed Metrics, Charts, Comparison, AI Interpretation */}
              <div className="lg:col-span-7 space-y-6">
                {currentScenarioData && previewComputed && (
                  <>
                    {/* Scenario Switcher */}
                    <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-display text-base font-bold text-ink-primary">
                          Computed Model Overview
                        </h3>
                        <div
                          role="tablist"
                          aria-label="Financial scenarios"
                          className="inline-flex rounded-lg border border-border-hairline bg-surface-subtle p-1"
                        >
                          {SCENARIO_KEYS.map((key) => (
                            <button
                              key={key}
                              type="button"
                              role="tab"
                              aria-selected={activeScenario === key}
                              onClick={() => setActiveScenario(key)}
                              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeScenario === key
                                  ? 'bg-surface-canvas text-brand-primary shadow-sm border border-border-hairline'
                                  : 'text-ink-secondary hover:text-ink-primary'
                              }`}
                            >
                              {SCENARIO_LABELS[key]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {currentScenarioData.edgeCaseWarnings.length > 0 && (
                        <div className="rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 p-3.5 flex items-start gap-2.5">
                          <AlertTriangle
                            className="h-4 w-4 text-semantic-warning shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <ul className="space-y-1 text-xs text-ink-primary">
                            {currentScenarioData.edgeCaseWarnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Core Metric Cards */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3.5">
                          <p className="text-[11px] font-medium text-ink-muted">Monthly Revenue</p>
                          <p className="mt-1 font-display text-lg font-bold text-ink-primary tabular-nums">
                            {formatInr(currentScenarioData.revenue)}
                          </p>
                          <p className="text-[11px] text-ink-secondary tabular-nums">
                            {currentScenarioData.effectiveUnitsPerMonth} units/mo
                          </p>
                        </div>

                        <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3.5">
                          <p className="text-[11px] font-medium text-ink-muted">Total Expenses</p>
                          <p className="mt-1 font-display text-lg font-bold text-ink-primary tabular-nums">
                            {formatInr(currentScenarioData.totalExpenses)}
                          </p>
                          <p className="text-[11px] text-ink-secondary tabular-nums">
                            Overhead: {formatInr(currentScenarioData.fixedOverhead)}
                          </p>
                        </div>

                        <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3.5">
                          <p className="text-[11px] font-medium text-ink-muted">
                            Contribution Margin
                          </p>
                          <p className="mt-1 font-display text-lg font-bold text-ink-primary tabular-nums">
                            {formatInr(currentScenarioData.contributionMarginTotal)}
                          </p>
                          <p className="text-[11px] text-ink-secondary tabular-nums">
                            {formatInr(currentScenarioData.contributionMarginPerUnit)}/unit
                            {currentScenarioData.contributionMarginRatio !== null
                              ? ` (${Math.round(currentScenarioData.contributionMarginRatio * 100)}%)`
                              : ''}
                          </p>
                        </div>

                        <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3.5">
                          <p className="text-[11px] font-medium text-ink-muted">Gross Profit</p>
                          <p className="mt-1 font-display text-lg font-bold text-ink-primary tabular-nums">
                            {formatInr(currentScenarioData.grossProfit)}
                          </p>
                          <p className="text-[11px] text-ink-secondary">
                            Revenue minus variable costs
                          </p>
                        </div>

                        <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3.5">
                          <p className="text-[11px] font-medium text-ink-muted">
                            Operating Profit / Mo
                          </p>
                          <p
                            className={`mt-1 font-display text-lg font-bold tabular-nums ${
                              currentScenarioData.operatingProfit >= 0
                                ? 'text-semantic-success'
                                : 'text-semantic-danger'
                            }`}
                          >
                            {formatInr(currentScenarioData.operatingProfit)}
                          </p>
                          <p className="text-[11px] text-ink-secondary">
                            {currentScenarioData.operatingProfit >= 0
                              ? 'Net positive monthly cash flow'
                              : `Burn: ${formatInr(currentScenarioData.monthlyNetBurn)}/mo`}
                          </p>
                        </div>

                        <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3.5">
                          <p className="text-[11px] font-medium text-ink-muted">
                            Break-Even & Runway
                          </p>
                          <p className="mt-1 font-display text-base font-bold text-ink-primary tabular-nums">
                            {currentScenarioData.breakEvenUnits !== null
                              ? `${currentScenarioData.breakEvenUnits.toLocaleString('en-IN')} units`
                              : 'Unreachable'}
                          </p>
                          <p className="text-[11px] text-ink-secondary tabular-nums">
                            {currentScenarioData.breakEvenRevenue !== null
                              ? `Rev: ${formatInr(currentScenarioData.breakEvenRevenue)} · `
                              : ''}
                            Runway: {currentScenarioData.runwayLabel}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Recharts Visualizations */}
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                      <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
                        <h4 className="font-display text-sm font-bold text-ink-primary">
                          12-Month Revenue vs. Costs ({SCENARIO_LABELS[activeScenario]})
                        </h4>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Monthly operating revenue compared against total expenses
                        </p>
                        <div className="mt-4 h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueCostChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                              <YAxis
                                tick={{ fontSize: 11, fill: '#64748B' }}
                                tickFormatter={(v: number) =>
                                  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                                }
                              />
                              <Tooltip
                                formatter={(value) => formatInr(Number(value ?? 0))}
                              />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Bar
                                dataKey="revenue"
                                name="Revenue"
                                fill="#5B21B6"
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="totalExpenses"
                                name="Total Expenses"
                                fill="#D97706"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
                        <h4 className="font-display text-sm font-bold text-ink-primary">
                          12-Month Cash Balance Across Scenarios
                        </h4>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Starting from {formatInr(inputs.initialInvestment)} initial investment
                        </p>
                        <div className="mt-4 h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={cashBalanceChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                              <YAxis
                                tick={{ fontSize: 11, fill: '#64748B' }}
                                tickFormatter={(v: number) =>
                                  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                                }
                              />
                              <ReferenceLine y={0} stroke="#DC2626" strokeDasharray="4 4" />
                              <Tooltip
                                formatter={(value) => formatInr(Number(value ?? 0))}
                              />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Line
                                type="monotone"
                                dataKey="conservative"
                                name="Conservative"
                                stroke="#D97706"
                                strokeWidth={2}
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="expected"
                                name="Expected"
                                stroke="#5B21B6"
                                strokeWidth={2.5}
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="optimistic"
                                name="Optimistic"
                                stroke="#16A34A"
                                strokeWidth={2}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* 3-Scenario Comparison Table */}
                    <div className="rounded-xl border border-border-hairline bg-surface-canvas overflow-hidden">
                      <div className="border-b border-border-hairline px-5 py-3.5">
                        <h4 className="font-display text-sm font-bold text-ink-primary">
                          Scenario Sensitivity Matrix
                        </h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-surface-subtle text-ink-secondary border-b border-border-hairline">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">Metric</th>
                              {SCENARIO_KEYS.map((key) => (
                                <th key={key} className="px-4 py-2.5 font-semibold">
                                  {SCENARIO_LABELS[key]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-hairline tabular-nums">
                            <tr>
                              <td className="px-4 py-2.5 text-ink-secondary">Monthly Revenue</td>
                              {SCENARIO_KEYS.map((k) => (
                                <td key={k} className="px-4 py-2.5 font-medium text-ink-primary">
                                  {formatInr(previewComputed.scenarios[k].revenue)}
                                </td>
                              ))}
                            </tr>
                            <tr>
                              <td className="px-4 py-2.5 text-ink-secondary">Monthly Expenses</td>
                              {SCENARIO_KEYS.map((k) => (
                                <td key={k} className="px-4 py-2.5 font-medium text-ink-primary">
                                  {formatInr(previewComputed.scenarios[k].totalExpenses)}
                                </td>
                              ))}
                            </tr>
                            <tr>
                              <td className="px-4 py-2.5 text-ink-secondary">Operating Profit</td>
                              {SCENARIO_KEYS.map((k) => {
                                const op = previewComputed.scenarios[k].operatingProfit;
                                return (
                                  <td
                                    key={k}
                                    className={`px-4 py-2.5 font-semibold ${
                                      op >= 0 ? 'text-semantic-success' : 'text-semantic-danger'
                                    }`}
                                  >
                                    {formatInr(op)}
                                  </td>
                                );
                              })}
                            </tr>
                            <tr>
                              <td className="px-4 py-2.5 text-ink-secondary">Break-Even Units</td>
                              {SCENARIO_KEYS.map((k) => {
                                const be = previewComputed.scenarios[k].breakEvenUnits;
                                return (
                                  <td key={k} className="px-4 py-2.5 text-ink-primary">
                                    {be !== null ? `${be.toLocaleString('en-IN')} units` : 'Unreachable'}
                                  </td>
                                );
                              })}
                            </tr>
                            <tr>
                              <td className="px-4 py-2.5 text-ink-secondary">Runway</td>
                              {SCENARIO_KEYS.map((k) => (
                                <td key={k} className="px-4 py-2.5 text-ink-primary">
                                  {previewComputed.scenarios[k].runwayLabel}
                                </td>
                              ))}
                            </tr>
                            <tr>
                              <td className="px-4 py-2.5 text-ink-secondary">Month-12 Cash</td>
                              {SCENARIO_KEYS.map((k) => (
                                <td key={k} className="px-4 py-2.5 font-medium text-ink-primary">
                                  {formatInr(
                                    previewComputed.scenarios[k].cashFlow12Months[11].cashBalance,
                                  )}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Plain-Language AI Interpretation */}
                    <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                          <h4 className="font-display text-sm font-bold text-ink-primary">
                            Financial Model Summary
                          </h4>
                        </div>
                        <span className="rounded-md border border-brand-primary/30 bg-brand-primary/5 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">
                          AI interpretation
                        </span>
                      </div>

                      {activeAiInterpretation ? (
                        <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
                          {activeAiInterpretation}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-ink-muted">
                          {selectedPlanId
                            ? 'All computed figures above are saved. Plain-language AI interpretation is omitted because Gemini is not configured or was unavailable when saved.'
                            : 'Save this plan to store the model and generate a plain-language AI interpretation (when Gemini is configured).'}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete financial plan?"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}"? This removes the saved scenario model from your workspace.`
            : ''
        }
        confirmLabel="Delete Plan"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
