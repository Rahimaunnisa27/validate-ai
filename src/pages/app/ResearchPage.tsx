import {
  AlertCircle,
  ExternalLink,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  type EvidenceLabel,
  type Idea,
  type MarketResearchRun,
  type ResearchSourceStatus,
} from '../../lib/api.ts';
import { TAM_SAM_SOM_FALLBACK } from '../../shared/phase3bSchemas.ts';

function evidenceTagClass(label: EvidenceLabel): string {
  switch (label) {
    case 'Verified research':
      return 'border-semantic-success/35 bg-semantic-success/10 text-semantic-success';
    case 'AI interpretation':
      return 'border-brand-primary/35 bg-brand-primary/10 text-brand-primary';
    case 'User assumption':
      return 'border-brand-accent/35 bg-brand-accent/10 text-brand-accent';
    case 'Unverified':
    default:
      return 'border-semantic-warning/35 bg-semantic-warning/10 text-semantic-warning';
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface ResearchFormState {
  ideaId: string;
  industry: string;
  businessCategory: string;
  targetCustomer: string;
  location: string;
  productOrService: string;
}

function emptyResearchForm(): ResearchFormState {
  return {
    ideaId: '',
    industry: '',
    businessCategory: '',
    targetCustomer: '',
    location: '',
    productOrService: '',
  };
}

export function ResearchPage() {
  const [runs, setRuns] = useState<MarketResearchRun[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [sourceStatus, setSourceStatus] = useState<ResearchSourceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState<ResearchFormState>(emptyResearchForm);
  const [submitting, setSubmitting] = useState(false);
  const [llmSetupSteps, setLlmSetupSteps] = useState<string[] | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<MarketResearchRun | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [researchRes, ideasRes] = await Promise.all([
        api.research.list(),
        api.ideas.list(undefined, 100, 0),
      ]);
      setRuns(researchRes.items);
      setSourceStatus(researchRes.sourceStatus);
      setIdeas(ideasRes.items);
      if (researchRes.items.length > 0) {
        setSelectedRunId((prev) => prev ?? researchRes.items[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load market research.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSelectRun = async (id: string) => {
    setSelectedRunId(id);
    try {
      const res = await api.research.get(id);
      setRuns((prev) => prev.map((r) => (r.id === res.run.id ? res.run : r)));
      setSourceStatus(res.sourceStatus);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to load selected run.');
    }
  };

  const handlePrefillFromIdea = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) {
      setForm((prev) => ({ ...prev, ideaId: '' }));
      return;
    }
    setForm({
      ideaId: idea.id,
      industry: idea.businessDetails?.industry || 'Technology',
      businessCategory: idea.businessDetails?.businessModel || 'B2B SaaS',
      targetCustomer: idea.targetCustomer?.primarySegment || 'SMB operations teams',
      location: idea.targetCustomer?.geography || 'India',
      productOrService:
        idea.problemSolution?.proposedSolution ||
        idea.businessDetails?.oneLiner ||
        idea.title,
    });
  };

  const handleRunResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLlmSetupSteps(null);
    try {
      const res = await api.research.run({
        ideaId: form.ideaId || null,
        industry: form.industry,
        businessCategory: form.businessCategory,
        targetCustomer: form.targetCustomer,
        location: form.location,
        productOrService: form.productOrService,
      });
      setRuns((prev) => [res.run, ...prev]);
      setSelectedRunId(res.run.id);
      setSourceStatus(res.sourceStatus);
      setShowForm(false);
      if (res.run.status === 'not_configured') {
        toast.info('Research sources are not configured. No synthetic claims were generated.');
      } else {
        toast.success('Market research run completed and saved.');
      }
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
          err instanceof ApiClientError ? err.message : 'Failed to execute market research.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.research.delete(deleteTarget.id);
      const remaining = runs.filter((r) => r.id !== deleteTarget.id);
      setRuns(remaining);
      if (selectedRunId === deleteTarget.id) {
        setSelectedRunId(remaining[0]?.id ?? null);
      }
      setDeleteTarget(null);
      toast.success('Research run deleted.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to delete research run.');
    } finally {
      setDeleting(false);
    }
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  return (
    <AppShell
      title="Market Research"
      breadcrumb="Workspace / Market Research"
      action={
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {showForm ? 'Hide Form' : 'New Research Run'}
        </button>
      }
    >
      <div className="space-y-6">
        {/* Source Mode Banner */}
        {sourceStatus && (
          <div
            className={`rounded-xl border p-4 space-y-2 ${
              sourceStatus.researchMode === 'sonar'
                ? 'border-semantic-success/30 bg-semantic-success/5'
                : 'border-semantic-warning/35 bg-semantic-warning/5'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-ink-primary" aria-hidden="true" />
                <span className="text-sm font-semibold text-ink-primary">
                  Research Source Mode: {sourceStatus.statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {sourceStatus.researchMode === 'demo' && (
                  <span className="rounded-md border border-semantic-warning/40 bg-surface-canvas px-2 py-0.5 text-[11px] font-bold text-semantic-warning">
                    DEMO DATA
                  </span>
                )}
                <Link
                  to="/integrations"
                  className="text-xs font-medium text-brand-primary hover:underline"
                >
                  Integration Status
                </Link>
              </div>
            </div>

            {sourceStatus.setupSteps.length > 0 && (
              <ul className="list-disc list-inside space-y-1 text-xs text-ink-secondary">
                {sourceStatus.setupSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {llmSetupSteps && (
          <div
            role="alert"
            className="rounded-xl border border-semantic-danger/30 bg-semantic-danger/5 p-5 space-y-2"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <AlertCircle className="h-4 w-4 text-semantic-danger" aria-hidden="true" />
              <span>Gemini AI: Not configured</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-ink-secondary">
              {llmSetupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Research Input Form */}
        {showForm && (
          <form
            onSubmit={handleRunResearch}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-ink-primary">
                  Run Market Research
                </h2>
                <p className="text-xs text-ink-secondary">
                  Claims are tagged by evidence provenance. Market sizing numbers appear only when backed by retrieved sources.
                </p>
              </div>

              {ideas.length > 0 && (
                <div className="min-w-[220px]">
                  <select
                    aria-label="Use saved idea as context"
                    value={form.ideaId}
                    onChange={(e) => handlePrefillFromIdea(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border-hairline bg-surface-subtle px-3 text-xs text-ink-primary"
                  >
                    <option value="">Optional Idea Context (none)</option>
                    {ideas.map((idea) => (
                      <option key={idea.id} value={idea.id}>
                        {idea.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="mr-industry" className="block text-xs font-medium text-ink-primary mb-1">
                  Industry
                </label>
                <input
                  id="mr-industry"
                  type="text"
                  required
                  minLength={2}
                  placeholder="e.g. Cold-chain food logistics"
                  value={form.industry}
                  onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="mr-category" className="block text-xs font-medium text-ink-primary mb-1">
                  Business Category
                </label>
                <input
                  id="mr-category"
                  type="text"
                  required
                  minLength={2}
                  placeholder="e.g. B2B Compliance SaaS + IoT"
                  value={form.businessCategory}
                  onChange={(e) => setForm((p) => ({ ...p, businessCategory: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="mr-customer" className="block text-xs font-medium text-ink-primary mb-1">
                  Target Customer
                </label>
                <input
                  id="mr-customer"
                  type="text"
                  required
                  minLength={3}
                  placeholder="e.g. Regional dairy and perishable warehouse operators"
                  value={form.targetCustomer}
                  onChange={(e) => setForm((p) => ({ ...p, targetCustomer: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="mr-location" className="block text-xs font-medium text-ink-primary mb-1">
                  Location
                </label>
                <input
                  id="mr-location"
                  type="text"
                  required
                  minLength={2}
                  placeholder="e.g. India (Tier-1 & Tier-2 cities)"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="mr-product" className="block text-xs font-medium text-ink-primary mb-1">
                Product or Service
              </label>
              <textarea
                id="mr-product"
                required
                minLength={3}
                rows={2}
                placeholder="Describe the product or service you want researched..."
                value={form.productOrService}
                onChange={(e) => setForm((p) => ({ ...p, productOrService: e.target.value }))}
                className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-sm"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Running Research...' : 'Run & Save Research'}
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SkeletonCard rows={4} />
            <SkeletonCard rows={4} />
            <SkeletonCard rows={4} />
          </div>
        )}

        {error && <ErrorState message={error} onRetry={() => void loadData()} />}

        {!loading && !error && runs.length === 0 && (
          <EmptyState
            icon={<Search className="h-5 w-5" aria-hidden="true" />}
            title="No market research runs saved yet"
            description="Submit a research scope above to analyze trends, demand indicators, customer problems, and segments—then reopen any saved run anytime."
          />
        )}

        {!loading && !error && runs.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Past Runs History */}
            <aside className="lg:col-span-4 space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted px-1">
                Past Research Runs ({runs.length})
              </h3>
              <div className="space-y-2">
                {runs.map((run) => {
                  const active = run.id === selectedRunId;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => void handleSelectRun(run.id)}
                      className={`w-full text-left rounded-xl border p-4 transition-colors ${
                        active
                          ? 'border-brand-primary bg-brand-primary/5'
                          : 'border-border-hairline bg-surface-canvas hover:bg-surface-subtle'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink-primary">
                          {run.industry}
                        </p>
                        <span className="shrink-0 rounded-md border border-border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                          {run.status === 'not_configured'
                            ? 'Not configured'
                            : run.researchMode === 'demo'
                              ? 'DEMO DATA'
                              : 'Sonar'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-ink-secondary">
                        {run.productOrService}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        {run.location} · {formatDateTime(run.createdAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Selected Run Viewer */}
            {selectedRun && (
              <section className="lg:col-span-8 rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-hairline pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-ink-primary">
                        {selectedRun.industry} · {selectedRun.businessCategory}
                      </h3>
                      {selectedRun.researchMode === 'demo' && (
                        <span className="rounded-md border border-semantic-warning/40 bg-semantic-warning/10 px-2 py-0.5 text-[11px] font-bold text-semantic-warning">
                          DEMO DATA
                        </span>
                      )}
                      {selectedRun.status === 'not_configured' && (
                        <span className="rounded-md border border-semantic-danger/35 bg-semantic-danger/10 px-2 py-0.5 text-[11px] font-semibold text-semantic-danger">
                          Not configured
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      Target: {selectedRun.targetCustomer} · Location: {selectedRun.location}
                      {selectedRun.ideaTitle ? ` · Idea: ${selectedRun.ideaTitle}` : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(selectedRun)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-semantic-danger/30 px-3 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </div>

                {selectedRun.status === 'not_configured' || !selectedRun.result ? (
                  <div className="rounded-xl border border-semantic-warning/35 bg-semantic-warning/5 p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-ink-primary">
                      Research Sources: Not configured
                    </h4>
                    <p className="text-xs text-ink-secondary leading-relaxed">
                      Neither <code className="font-mono">SONAR_API_KEY</code> nor{' '}
                      <code className="font-mono">DEMO_MODE=true</code> is active. To avoid fabricating statistics, URLs, or market claims, no synthetic research output was generated for this run.
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-ink-secondary">
                      {(selectedRun.setupSteps.length > 0
                        ? selectedRun.setupSteps
                        : sourceStatus?.setupSteps || []
                      ).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                          Executive Summary
                        </h4>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${evidenceTagClass(
                            selectedRun.result.summary.evidenceLabel,
                          )}`}
                        >
                          {selectedRun.result.summary.evidenceLabel}
                          {selectedRun.result.summary.sourceId
                            ? ` (${selectedRun.result.summary.sourceId})`
                            : ''}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-ink-primary">
                        {selectedRun.result.summary.text}
                      </p>
                    </div>

                    {/* TAM / SAM / SOM */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                        TAM / SAM / SOM Market Sizing
                      </h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {(
                          [
                            ['TAM', selectedRun.result.tamSamSom.tam],
                            ['SAM', selectedRun.result.tamSamSom.sam],
                            ['SOM', selectedRun.result.tamSamSom.som],
                          ] as const
                        ).map(([label, metric]) => (
                          <div
                            key={label}
                            className="rounded-lg border border-border-hairline bg-surface-subtle p-3.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-ink-primary">{label}</span>
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${evidenceTagClass(
                                  metric.evidenceLabel,
                                )}`}
                              >
                                {metric.evidenceLabel}
                              </span>
                            </div>
                            <p className="font-display text-sm font-bold text-ink-primary tabular-nums">
                              {metric.value || TAM_SAM_SOM_FALLBACK}
                            </p>
                            <p className="text-[11px] text-ink-muted leading-snug">{metric.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Structured Findings Sections */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {(
                        [
                          ['Industry Trends', selectedRun.result.industryTrends],
                          ['Demand Indicators', selectedRun.result.demandIndicators],
                          ['Customer Problems', selectedRun.result.customerProblems],
                          ['Potential Market Segments', selectedRun.result.potentialMarketSegments],
                        ] as const
                      ).map(([heading, claims]) => (
                        <div
                          key={heading}
                          className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-3"
                        >
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                            {heading}
                          </h4>
                          <ul className="space-y-2.5">
                            {claims.map((claim, idx) => (
                              <li
                                key={`${heading}-${idx}`}
                                className="rounded-lg border border-border-hairline bg-surface-canvas p-3 space-y-1.5"
                              >
                                <p className="text-xs leading-relaxed text-ink-primary">
                                  {claim.text}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${evidenceTagClass(
                                      claim.evidenceLabel,
                                    )}`}
                                  >
                                    {claim.evidenceLabel}
                                  </span>
                                  {claim.sourceId && (
                                    <span className="rounded-md border border-border-hairline px-2 py-0.5 text-[10px] font-mono text-ink-muted">
                                      {claim.sourceId}
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>

                    {/* Cited Sources */}
                    <div className="border-t border-border-hairline pt-4 space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                        Saved Sources ({selectedRun.sources.length})
                      </h4>
                      {selectedRun.sources.length === 0 ? (
                        <p className="text-xs text-ink-muted">No sources recorded for this run.</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedRun.sources.map((src) => (
                            <div
                              key={src.sourceRef}
                              className="rounded-lg border border-border-hairline bg-surface-subtle p-3 space-y-1"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="rounded-md border border-border-hairline bg-surface-canvas px-1.5 py-0.5 text-[11px] font-mono font-semibold text-ink-primary">
                                    {src.sourceRef}
                                  </span>
                                  <span className="truncate text-xs font-semibold text-ink-primary">
                                    {src.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {src.isDemo && (
                                    <span className="rounded-md border border-semantic-warning/40 bg-semantic-warning/10 px-2 py-0.5 text-[10px] font-bold text-semantic-warning">
                                      DEMO DATA
                                    </span>
                                  )}
                                  <span className="text-[11px] text-ink-muted tabular-nums">
                                    Retrieved {formatDateTime(src.retrievedAt)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-ink-secondary">{src.snippet}</p>
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline break-all"
                              >
                                {src.url}
                                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete market research run?"
        description={
          deleteTarget
            ? `Delete saved research for "${deleteTarget.industry} — ${deleteTarget.location}"?`
            : ''
        }
        confirmLabel="Delete Run"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
