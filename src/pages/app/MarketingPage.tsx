import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Megaphone,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  type Idea,
  type MarketingCampaignRecord,
} from '../../lib/api.ts';
import {
  classifyBudgetTier,
  type MarketingStrategyJson,
} from '../../shared/phase4Schemas.ts';

const CHANNEL_OPTIONS = [
  'LinkedIn Organic & Outbound',
  'WhatsApp & Direct Outreach',
  'Content / SEO',
  'Cold Email',
  'Search Ads',
  'Social Ads',
  'Industry Events & Associations',
  'Partnerships & Referrals',
];

function formatInr(val: number): string {
  return `₹${Math.round(val).toLocaleString('en-IN')}`;
}

export function MarketingPage() {
  const [campaigns, setCampaigns] = useState<MarketingCampaignRecord[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [llmSetupSteps, setLlmSetupSteps] = useState<string[] | null>(null);

  const [ideaId, setIdeaId] = useState('');
  const [title, setTitle] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [industry, setIndustry] = useState('');
  const [budget, setBudget] = useState('40000');
  const [market, setMarket] = useState('India (Tier-1 & Tier-2 cities)');
  const [preferredChannels, setPreferredChannels] = useState<string[]>([
    'LinkedIn Organic & Outbound',
    'WhatsApp & Direct Outreach',
  ]);

  // Edit mode state for selected campaign
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBudget, setEditBudget] = useState('0');
  const [editStrategy, setEditStrategy] = useState<MarketingStrategyJson | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MarketingCampaignRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mktRes, ideasRes] = await Promise.all([
        api.marketing.list(),
        api.ideas.list(undefined, 100, 0),
      ]);
      setCampaigns(mktRes.items);
      setIdeas(ideasRes.items);
      if (mktRes.items.length > 0) {
        setSelectedId((prev) => prev ?? mktRes.items[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load marketing campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePrefillFromIdea = (id: string) => {
    setIdeaId(id);
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    setTitle(`${idea.title} Launch Campaign`);
    setBusinessDescription(
      idea.problemSolution?.proposedSolution ||
        idea.businessDetails?.oneLiner ||
        idea.problemSolution?.problemStatement ||
        idea.title,
    );
    setTargetAudience(idea.targetCustomer?.primarySegment || '');
    setIndustry(idea.businessDetails?.industry || '');
    setMarket(idea.targetCustomer?.geography || 'India');
  };

  const toggleChannel = (ch: string) => {
    setPreferredChannels((prev) =>
      prev.includes(ch) ? prev.filter((item) => item !== ch) : [...prev, ch],
    );
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preferredChannels.length === 0) {
      toast.error('Select at least one preferred channel.');
      return;
    }
    setGenerating(true);
    setLlmSetupSteps(null);
    try {
      const res = await api.marketing.generate({
        ideaId: ideaId || null,
        title: title.trim(),
        businessDescription,
        targetAudience,
        industry,
        budget: Number(budget),
        market,
        preferredChannels,
      });
      setCampaigns((prev) => [res.campaign, ...prev]);
      setSelectedId(res.campaign.id);
      setShowForm(false);
      setEditing(false);
      toast.success(
        res.allocationAdjusted
          ? 'Marketing strategy saved (budget allocation normalized to exact 100%).'
          : 'Marketing strategy generated and saved.',
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'LLM_NOT_CONFIGURED') {
        const details = err.details as { setupSteps?: string[] } | undefined;
        setLlmSetupSteps(
          details?.setupSteps ?? [
            'Add GEMINI_API_KEY in Settings > Secrets.',
            'Restart the server so the key is loaded.',
          ],
        );
      } else {
        toast.error(
          err instanceof ApiClientError ? err.message : 'Unable to generate marketing strategy.',
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null;

  const startEdit = () => {
    if (!selectedCampaign) return;
    setEditTitle(selectedCampaign.title);
    setEditBudget(String(selectedCampaign.inputs.budget));
    setEditStrategy(structuredClone(selectedCampaign.strategy));
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign || !editStrategy) return;
    setSavingEdit(true);
    try {
      const updatedBudget = Number(editBudget);
      const res = await api.marketing.update(selectedCampaign.id, {
        title: editTitle,
        ideaId: selectedCampaign.ideaId,
        inputs: {
          ...selectedCampaign.inputs,
          title: editTitle,
          budget: updatedBudget,
        },
        strategy: editStrategy,
      });
      setCampaigns((prev) => prev.map((c) => (c.id === res.campaign.id ? res.campaign : c)));
      setEditing(false);
      toast.success('Campaign saved with verified budget allocation.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to save campaign edits.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.marketing.delete(deleteTarget.id);
      const remaining = campaigns.filter((c) => c.id !== deleteTarget.id);
      setCampaigns(remaining);
      if (selectedId === deleteTarget.id) {
        setSelectedId(remaining[0]?.id ?? null);
        setEditing(false);
      }
      setDeleteTarget(null);
      toast.success('Campaign deleted.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to delete campaign.');
    } finally {
      setDeleting(false);
    }
  };

  const previewBudgetTier =
    Number(budget) > 0 ? classifyBudgetTier(Number(budget)) : 'low';

  return (
    <AppShell
      title="Marketing Strategy"
      breadcrumb="Workspace / Marketing Strategy"
      action={
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {showForm ? 'Hide Generator' : 'New Strategy'}
        </button>
      }
    >
      <div className="space-y-6">
        {llmSetupSteps && (
          <div className="rounded-xl border border-semantic-warning/40 bg-semantic-warning/5 p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <AlertCircle className="h-4 w-4 text-semantic-warning" aria-hidden="true" />
              Gemini AI is Not Configured
            </div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-ink-secondary">
              {llmSetupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={(e) => void handleGenerate(e)}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-ink-primary">
                  Generate Budget-Tiered Marketing Strategy
                </h2>
                <p className="text-xs text-ink-muted">
                  Budget allocations are deterministically verified to sum to 100% and match your exact budget. Output is labelled AI interpretation.
                </p>
              </div>
              <span className="rounded-md border border-brand-primary/30 bg-brand-primary/5 px-2.5 py-1 text-[11px] font-semibold text-brand-primary uppercase">
                Tier: {previewBudgetTier} budget
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Pre-fill from Saved Idea (Optional)
                </label>
                <select
                  value={ideaId}
                  onChange={(e) => handlePrefillFromIdea(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                >
                  <option value="">Enter manually</option>
                  {ideas.map((idea) => (
                    <option key={idea.id} value={idea.id}>
                      {idea.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Campaign Title (Optional)
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q3 Cold-Chain Compliance Launch"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-primary mb-1">
                Business Description *
              </label>
              <textarea
                required
                minLength={10}
                rows={3}
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value)}
                placeholder="Describe your product, core problem solved, and differentiator..."
                className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Target Audience *
                </label>
                <input
                  required
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Cold-storage plant supervisors"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Industry *
                </label>
                <input
                  required
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Food Logistics & SaaS"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Budget (INR) *
                </label>
                <input
                  required
                  type="number"
                  min={100}
                  step="any"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm font-mono tabular-nums"
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Low &lt; ₹50k · Medium ₹50k–₹3L · High &gt; ₹3L
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Market / Geography *
                </label>
                <input
                  required
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  placeholder="e.g. India B2B"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-primary mb-2">
                Preferred Channels *
              </label>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.map((ch) => {
                  const active = preferredChannels.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleChannel(ch)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                          : 'border-border-hairline bg-surface-subtle text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {generating ? 'Generating & Verifying Budget...' : 'Generate Strategy'}
              </button>
            </div>
          </form>
        )}

        {loading && <SkeletonCard rows={4} />}
        {error && <ErrorState message={error} onRetry={() => void loadData()} />}

        {!loading && !error && campaigns.length === 0 && (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
            title="No marketing campaigns saved yet"
            description="Generate a budget-tiered marketing strategy above to save editable campaigns, content ideas, and verified channel budget splits."
          />
        )}

        {!loading && !error && campaigns.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Saved Campaigns List */}
            <aside className="lg:col-span-4 space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Saved Campaigns ({campaigns.length})
              </h3>
              <div className="space-y-2">
                {campaigns.map((camp) => {
                  const active = camp.id === selectedId;
                  return (
                    <button
                      key={camp.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(camp.id);
                        setEditing(false);
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                        active
                          ? 'border-brand-primary bg-brand-primary/5'
                          : 'border-border-hairline bg-surface-canvas hover:bg-surface-subtle'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-primary leading-snug">
                          {camp.title}
                        </p>
                        <span className="shrink-0 rounded-md border border-border-hairline px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-secondary">
                          {camp.budgetTier}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted tabular-nums">
                        {formatInr(camp.inputs.budget)} · {camp.inputs.industry}
                      </p>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Selected Campaign Detail / Editor */}
            {selectedCampaign && (
              <section className="lg:col-span-8 rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-hairline pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-ink-primary">
                        {selectedCampaign.title}
                      </h3>
                      <span className="rounded-md border border-brand-primary/35 bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">
                        {selectedCampaign.evidenceLabel}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted tabular-nums">
                      Budget: {formatInr(selectedCampaign.inputs.budget)} ({selectedCampaign.budgetTier} tier) ·{' '}
                      {selectedCampaign.inputs.market}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!editing ? (
                      <button
                        type="button"
                        onClick={startEdit}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit Campaign
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline px-3 text-xs font-medium text-ink-secondary hover:bg-surface-subtle"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selectedCampaign)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-semantic-danger/30 px-3 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>

                {editing && editStrategy ? (
                  <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-ink-primary mb-1">
                          Campaign Title
                        </label>
                        <input
                          required
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-primary mb-1">
                          Total Budget (INR)
                        </label>
                        <input
                          required
                          type="number"
                          min={100}
                          value={editBudget}
                          onChange={(e) => setEditBudget(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-ink-primary mb-1">
                        Positioning Statement
                      </label>
                      <textarea
                        rows={3}
                        value={editStrategy.positioning}
                        onChange={(e) =>
                          setEditStrategy({ ...editStrategy, positioning: e.target.value })
                        }
                        className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-ink-primary">
                        Budget Allocation (% automatically verified &amp; normalized to 100% on save)
                      </label>
                      {editStrategy.budgetAllocation.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            value={row.channel}
                            onChange={(e) => {
                              const next = [...editStrategy.budgetAllocation];
                              next[idx] = { ...next[idx], channel: e.target.value };
                              setEditStrategy({ ...editStrategy, budgetAllocation: next });
                            }}
                            className="col-span-6 h-9 rounded-lg border border-border-hairline px-2.5 text-xs"
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            value={row.percentage}
                            onChange={(e) => {
                              const next = [...editStrategy.budgetAllocation];
                              const pct = Number(e.target.value) || 0;
                              next[idx] = {
                                ...next[idx],
                                percentage: pct,
                                amount: Math.round(((Number(editBudget) || 0) * pct) / 100),
                              };
                              setEditStrategy({ ...editStrategy, budgetAllocation: next });
                            }}
                            className="col-span-3 h-9 rounded-lg border border-border-hairline px-2.5 text-xs font-mono tabular-nums"
                          />
                          <span className="col-span-3 text-xs text-ink-muted font-mono tabular-nums text-right">
                            {formatInr(row.amount)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        {savingEdit ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-1.5">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                        Positioning
                      </h4>
                      <p className="text-sm leading-relaxed text-ink-primary">
                        {selectedCampaign.strategy.positioning}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Objectives
                        </h4>
                        <ul className="list-disc list-inside space-y-1.5 text-xs text-ink-primary">
                          {selectedCampaign.strategy.objectives.map((obj, idx) => (
                            <li key={idx}>{obj}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Acquisition Suggestions
                        </h4>
                        <ul className="list-disc list-inside space-y-1.5 text-xs text-ink-primary">
                          {selectedCampaign.strategy.acquisitionSuggestions.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Budget Allocation Table */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Verified Budget Allocation
                        </h4>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-semantic-success tabular-nums">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Sum:{' '}
                          {selectedCampaign.strategy.budgetAllocation
                            .reduce((a, b) => a + b.percentage, 0)
                            .toFixed(1)}
                          % ·{' '}
                          {formatInr(
                            selectedCampaign.strategy.budgetAllocation.reduce(
                              (a, b) => a + b.amount,
                              0,
                            ),
                          )}
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-border-hairline">
                        <table className="min-w-full text-left text-xs">
                          <thead className="bg-surface-subtle text-ink-secondary border-b border-border-hairline">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">Channel / Activity</th>
                              <th className="px-4 py-2.5 font-semibold text-right">Share</th>
                              <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                              <th className="px-4 py-2.5 font-semibold">Rationale</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-hairline">
                            {selectedCampaign.strategy.budgetAllocation.map((row, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2.5 font-semibold text-ink-primary">
                                  {row.channel}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-primary">
                                  {row.percentage}%
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-primary">
                                  {formatInr(row.amount)}
                                </td>
                                <td className="px-4 py-2.5 text-ink-secondary">{row.rationale}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Channels & Social Strategy */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Recommended Channels
                        </h4>
                        <div className="space-y-2">
                          {selectedCampaign.strategy.channels.map((ch, idx) => (
                            <div key={idx} className="rounded-lg border border-border-hairline bg-surface-canvas p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-ink-primary">
                                  {ch.channel}
                                </span>
                                <span className="text-[11px] font-medium text-brand-primary">
                                  {ch.priority}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-ink-secondary">{ch.rationale}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Social Strategy
                        </h4>
                        <p className="text-xs text-ink-primary">
                          <span className="font-semibold">Cadence:</span>{' '}
                          {selectedCampaign.strategy.socialStrategy.cadence}
                        </p>
                        <p className="text-xs text-ink-secondary">
                          <span className="font-semibold text-ink-primary">Formats:</span>{' '}
                          {selectedCampaign.strategy.socialStrategy.formats.join(', ')}
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-xs text-ink-secondary">
                          {selectedCampaign.strategy.socialStrategy.themes.map((t, idx) => (
                            <li key={idx}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Content Ideas & Campaigns */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Content Ideas
                        </h4>
                        <div className="space-y-2">
                          {selectedCampaign.strategy.contentIdeas.map((ci, idx) => (
                            <div key={idx} className="rounded-lg border border-border-hairline bg-surface-canvas p-3">
                              <p className="text-xs font-semibold text-ink-primary">
                                {ci.title} · <span className="text-ink-muted font-normal">{ci.format}</span>
                              </p>
                              <p className="mt-1 text-xs text-ink-secondary">{ci.angle}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Campaigns &amp; KPIs
                        </h4>
                        <div className="space-y-2">
                          {selectedCampaign.strategy.campaigns.map((c, idx) => (
                            <div key={idx} className="rounded-lg border border-border-hairline bg-surface-canvas p-3 space-y-1">
                              <p className="text-xs font-semibold text-ink-primary">
                                {c.name} ({c.channel})
                              </p>
                              <p className="text-xs text-ink-secondary">{c.goal}</p>
                            </div>
                          ))}
                          <div className="pt-2 space-y-1.5">
                            {selectedCampaign.strategy.kpis.map((k, idx) => (
                              <p key={idx} className="text-xs text-ink-secondary">
                                <span className="font-semibold text-ink-primary">{k.metric}:</span>{' '}
                                {k.targetNote}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete marketing campaign?"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.title}" from your saved campaigns?`
            : ''
        }
        confirmLabel="Delete Campaign"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
