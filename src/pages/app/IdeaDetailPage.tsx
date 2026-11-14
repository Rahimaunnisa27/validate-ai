import {
  ArrowLeft,
  ArrowRight,
  FileCheck2,
  Loader2,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import { ConfirmDialog, ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import {
  api,
  ApiClientError,
  type Idea,
  type IntegrationStatusItem,
  type ReportPlan,
  type ValidationReport,
} from '../../lib/api.ts';

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink-primary whitespace-pre-wrap">
        {value !== undefined && value !== null && String(value).trim() !== ''
          ? String(value)
          : 'Not provided'}
      </dd>
    </div>
  );
}

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [plans, setPlans] = useState<ReportPlan[]>([]);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState('full');
  const [ideaReports, setIdeaReports] = useState<ValidationReport[]>([]);
  const [llmIntegration, setLlmIntegration] = useState<IntegrationStatusItem | null>(null);
  const [allowUnpaidReports, setAllowUnpaidReports] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<{
    message: string;
    setupSteps?: string[];
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadIdea = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.ideas.get(id),
      api.plans.list(),
      api.system.status(),
      api.reports.list({ ideaId: id, limit: 10 }),
    ])
      .then(([ideaRes, plansRes, sysRes, reportsRes]) => {
        setIdea(ideaRes.idea);
        setPlans(plansRes.plans);
        const rec = plansRes.plans.find((p) => p.isRecommended) || plansRes.plans[0];
        if (rec) setSelectedPlanSlug(rec.slug);
        setLlmIntegration(sysRes.integrations.find((i) => i.key === 'llm') || null);
        setAllowUnpaidReports(sysRes.flags.allowUnpaidReports);
        setIdeaReports(reportsRes.items);
      })
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Unable to load idea.'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadIdea();
  }, [loadIdea]);

  const handleGenerate = async () => {
    if (!idea) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await api.reports.generate({
        ideaId: idea.id,
        planSlug: selectedPlanSlug,
      });
      toast.success('Validation report pipeline started.');
      navigate(`/reports/${res.report.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const details = err.details as { setupSteps?: string[] } | undefined;
        setGenerateError({
          message: err.message,
          setupSteps: details?.setupSteps,
        });
        toast.error(err.message);
      } else {
        toast.error('Failed to start validation report generation.');
      }
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!idea) return;
    setDeleting(true);
    try {
      await api.ideas.delete(idea.id);
      toast.success('Idea deleted.');
      navigate('/ideas', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete idea.');
      setDeleting(false);
    }
  };

  const llmConfigured = llmIntegration ? llmIntegration.configured : false;

  return (
    <AppShell
      title={idea?.title || 'Idea Details'}
      breadcrumb="Workspace / Ideas / Detail"
      action={
        <Link
          to="/ideas"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All Ideas
        </Link>
      }
    >
      {loading && <SkeletonCard rows={8} />}
      {error && <ErrorState message={error} onRetry={loadIdea} />}

      {!loading && !error && idea && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border-hairline bg-surface-canvas p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="font-medium text-brand-accent">User assumption</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    idea.status === 'submitted'
                      ? 'font-medium text-semantic-success'
                      : 'font-medium text-semantic-warning'
                  }
                >
                  {idea.status === 'submitted' ? 'Submitted' : `Draft (Step ${idea.currentStep}/6)`}
                </span>
                {idea.startupName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Startup: {idea.startupName}</span>
                  </>
                )}
              </div>
              <h2 className="mt-1.5 font-display text-xl font-bold text-ink-primary">
                {idea.title}
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                {idea.businessDetails.oneLiner || 'No one-line summary entered yet.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                to={`/ideas/${idea.id}/edit`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline px-3.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit Idea
              </Link>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline px-3.5 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>

          {/* Phase 2 AI Validation Report Generation */}
          <section className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-ink-primary">
                    AI Validation Report (18 Sections + 6 Scores + PDF)
                  </h3>
                </div>
                <p className="text-sm text-ink-secondary">
                  Runs the 8-step validation pipeline: input check, concept extraction, Gemini
                  embeddings, per-user cosine similarity, market research, and structured JSON
                  generation.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {plans.length > 0 && (
                  <select
                    aria-label="Validation report plan tier"
                    value={selectedPlanSlug}
                    onChange={(e) => setSelectedPlanSlug(e.target.value)}
                    disabled={generating}
                    className="h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium text-ink-primary focus:border-brand-primary focus:outline-none"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.name} ({allowUnpaidReports ? 'Free · Phase 2' : `₹${p.priceInr}`})
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerate}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {generating ? 'Starting Pipeline...' : 'Generate Validation Report'}
                </button>
              </div>
            </div>

            {!llmConfigured && llmIntegration && (
              <div className="rounded-lg border border-semantic-warning/40 bg-semantic-warning/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-ink-primary">
                    <ShieldAlert className="h-4 w-4 text-semantic-warning" aria-hidden="true" />
                    <span>Gemini LLM Status: Not configured</span>
                  </div>
                  <Link
                    to="/integrations"
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Integration Status
                  </Link>
                </div>
                <p className="text-xs text-ink-secondary">{llmIntegration.message}</p>
                {llmIntegration.setupSteps.length > 0 && (
                  <ul className="space-y-1 text-xs text-ink-secondary list-disc list-inside">
                    {llmIntegration.setupSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {generateError && (
              <div className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/5 p-4 space-y-2">
                <p className="text-xs font-semibold text-semantic-danger">{generateError.message}</p>
                {generateError.setupSteps && generateError.setupSteps.length > 0 && (
                  <ul className="space-y-1 text-xs text-ink-secondary list-disc list-inside">
                    {generateError.setupSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {ideaReports.length > 0 && (
              <div className="pt-3 border-t border-border-hairline space-y-2">
                <p className="text-xs font-semibold text-ink-muted">
                  Reports Generated for This Idea
                </p>
                <div className="divide-y divide-border-hairline rounded-lg border border-border-hairline">
                  {ideaReports.map((rep) => (
                    <div
                      key={rep.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck2 className="h-3.5 w-3.5 text-brand-primary shrink-0" aria-hidden="true" />
                        <span className="font-medium text-ink-primary truncate">{rep.planName}</span>
                        <span className="text-ink-muted">·</span>
                        <span className="capitalize text-ink-secondary">{rep.status}</span>
                        <span className="text-ink-muted">·</span>
                        <span className="text-ink-muted">
                          {new Date(rep.createdAt).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <Link
                        to={`/reports/${rep.id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-primary hover:underline shrink-0"
                      >
                        Open
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4">
              <h3 className="text-sm font-semibold text-ink-primary border-b border-border-hairline pb-3">
                Business & Customer Context
              </h3>
              <dl className="space-y-4">
                <Field label="Industry" value={idea.businessDetails.industry} />
                <Field
                  label="Business Model & Stage"
                  value={`${(idea.businessDetails.businessModel || '—').toUpperCase()} · ${idea.businessDetails.stage || '—'}`}
                />
                <Field
                  label="Primary Customer Segment"
                  value={idea.targetCustomer.primarySegment}
                />
                <Field label="Geography" value={idea.targetCustomer.geography} />
                <Field label="Pain Level" value={idea.targetCustomer.customerPainLevel} />
                <Field
                  label="Willingness to Pay Evidence"
                  value={idea.targetCustomer.willingnessToPay}
                />
              </dl>
            </section>

            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4">
              <h3 className="text-sm font-semibold text-ink-primary border-b border-border-hairline pb-3">
                Problem, Solution & Assumptions
              </h3>
              <dl className="space-y-4">
                <Field label="Problem Statement" value={idea.problemSolution.problemStatement} />
                <Field
                  label="Current Alternatives"
                  value={idea.problemSolution.currentAlternatives}
                />
                <Field label="Proposed Solution" value={idea.problemSolution.proposedSolution} />
                <Field
                  label="Unique Value Proposition"
                  value={idea.problemSolution.uniqueValueProposition}
                />
              </dl>
            </section>

            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4">
              <h3 className="text-sm font-semibold text-ink-primary border-b border-border-hairline pb-3">
                Financial Inputs (INR)
              </h3>
              <dl className="grid grid-cols-2 gap-4">
                <Field
                  label="Initial Capital"
                  value={
                    idea.financials.initialCapitalInr
                      ? `₹${idea.financials.initialCapitalInr}`
                      : null
                  }
                />
                <Field
                  label="Price / Unit"
                  value={
                    idea.financials.pricePerUnitInr ? `₹${idea.financials.pricePerUnitInr}` : null
                  }
                />
                <Field
                  label="Est. Monthly Customers"
                  value={idea.financials.estimatedMonthlyCustomers}
                />
                <Field
                  label="Monthly Burn"
                  value={idea.financials.monthlyBurnInr ? `₹${idea.financials.monthlyBurnInr}` : null}
                />
                <div className="col-span-2">
                  <Field label="Revenue Model Notes" value={idea.financials.revenueModelNotes} />
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4">
              <h3 className="text-sm font-semibold text-ink-primary border-b border-border-hairline pb-3">
                Competitors & Edge
              </h3>
              <dl className="space-y-4">
                <Field label="Known Competitors" value={idea.competitors.knownCompetitors} />
                <Field label="Unfair Advantage" value={idea.competitors.unfairAdvantage} />
              </dl>
            </section>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this idea?"
        description={`Are you sure you want to permanently delete "${idea?.title}"?`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </AppShell>
  );
}
