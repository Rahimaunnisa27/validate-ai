import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Info,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import { ConfirmDialog, ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import {
  api,
  ApiClientError,
  type EvidenceLabel,
  type ValidationReport,
} from '../../lib/api.ts';
import {
  REPORT_SECTION_META,
  SCORE_LABELS,
  SCORING_DISCLAIMER,
  type ReportClaim,
} from '../../shared/reportSchemas.ts';

const PIPELINE_STEPS = [
  { step: 1, label: 'Validating idea input' },
  { step: 2, label: 'Cleaning and normalizing text' },
  { step: 3, label: 'Extracting key concepts' },
  { step: 4, label: 'Creating semantic embedding' },
  { step: 5, label: 'Finding similar ideas in your workspace' },
  { step: 6, label: 'Running market & competitor research' },
  { step: 7, label: 'Generating & validating 18-section report JSON' },
  { step: 8, label: 'Saving final validation report' },
];

function evidenceStyle(label: EvidenceLabel): string {
  switch (label) {
    case 'Verified research':
      return 'text-semantic-success border-semantic-success/30 bg-semantic-success/5';
    case 'AI interpretation':
      return 'text-brand-secondary border-brand-secondary/30 bg-brand-secondary/5';
    case 'User assumption':
      return 'text-brand-accent border-brand-accent/30 bg-brand-accent/5';
    default:
      return 'text-semantic-warning border-semantic-warning/30 bg-semantic-warning/5';
  }
}

function ClaimRow({ claim }: { claim: ReportClaim }) {
  return (
    <li className="py-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 border-b border-border-hairline last:border-b-0">
      <span className="text-sm text-ink-primary leading-relaxed">{claim.text}</span>
      <span className="inline-flex items-center gap-2 shrink-0 self-start">
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${evidenceStyle(
            claim.evidenceLabel,
          )}`}
        >
          {claim.evidenceLabel}
        </span>
        {claim.sourceId && (
          <a
            href={`#source-${claim.sourceId}`}
            className="font-mono text-xs font-semibold text-brand-primary hover:underline"
          >
            [{claim.sourceId}]
          </a>
        )}
      </span>
    </li>
  );
}

export function ReportViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadReport = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api.reports.get(id);
        setReport(res.report);
      } catch (err) {
        if (!silent) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load validation report.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    void loadReport(false);
  }, [loadReport]);

  useEffect(() => {
    if (!report) return;
    if (report.status !== 'queued' && report.status !== 'running') return;
    const timer = window.setInterval(() => {
      void loadReport(true);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [report, loadReport]);

  const handleRetry = async () => {
    if (!report) return;
    setRetrying(true);
    try {
      const res = await api.reports.retry(report.id);
      setReport(res.report);
      toast.success('Validation pipeline restarted for free.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to retry validation job.');
    } finally {
      setRetrying(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setDownloadingPdf(true);
    try {
      await api.reports.downloadPdf(report.id);
      toast.success('PDF downloaded.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to generate PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    setDeleting(true);
    try {
      await api.reports.delete(report.id);
      toast.success('Report deleted.');
      navigate('/reports', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete report.');
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title={report ? `${report.ideaTitle}` : 'Validation Report'}
      breadcrumb="Workspace / Validation Reports / Viewer"
      action={
        <div className="flex items-center gap-2">
          <Link
            to="/reports"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All Reports
          </Link>
          {report?.status === 'completed' && (
            <button
              type="button"
              disabled={downloadingPdf}
              onClick={handleDownloadPdf}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
            >
              {downloadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Download PDF
            </button>
          )}
        </div>
      }
    >
      {loading && <SkeletonCard rows={10} />}
      {error && <ErrorState message={error} onRetry={() => loadReport(false)} />}

      {!loading && !error && report && (
        <div className="space-y-6">
          {/* Header summary */}
          <div className="rounded-xl border border-border-hairline bg-surface-canvas p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="font-semibold text-ink-primary">{report.planName}</span>
                <span aria-hidden="true">·</span>
                <span>Status: {report.status.toUpperCase()}</span>
                {report.startupName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Startup: {report.startupName}</span>
                  </>
                )}
                {report.researchMode === 'demo' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center rounded border border-semantic-warning/40 bg-semantic-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-semantic-warning">
                      DEMO DATA
                    </span>
                  </>
                )}
              </div>
              <h2 className="font-display text-xl font-bold text-ink-primary">
                {report.ideaTitle}
              </h2>
              <p className="text-xs text-ink-muted">
                <Link to={`/ideas/${report.ideaId}`} className="text-brand-primary hover:underline">
                  View original idea input
                </Link>
                {report.completedAt && (
                  <> · Completed {new Date(report.completedAt).toLocaleString('en-IN')}</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {report.status === 'failed' && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={handleRetry}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
                >
                  {retrying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Retry (Free)
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline px-3 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>

          {/* Failed state banner */}
          {report.status === 'failed' && (
            <div className="rounded-xl border border-semantic-danger/30 bg-semantic-danger/5 p-6 space-y-3">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-ink-primary">
                    Validation Report Generation Failed
                  </h3>
                  <p className="text-sm text-ink-secondary">
                    {report.jobError || 'An unexpected error interrupted report generation.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={retrying}
                  onClick={handleRetry}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-4 text-xs font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {retrying ? 'Restarting...' : 'Retry Generation for Free'}
                </button>
                <Link
                  to={`/ideas/${report.ideaId}/edit`}
                  className="text-xs font-medium text-ink-secondary hover:text-ink-primary underline"
                >
                  Edit Idea Input
                </Link>
              </div>
            </div>
          )}

          {/* Live pipeline progress (always shown while queued/running or failed; collapsible review otherwise) */}
          {(report.status === 'queued' || report.status === 'running' || report.status === 'failed') && (
            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink-primary">
                    8-Step Validation Pipeline
                  </h3>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Progress is saved to the database after every step ({report.progressStep} of{' '}
                    {report.progressTotal}).
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-brand-primary tabular-nums">
                  {Math.round((report.progressStep / report.progressTotal) * 100)}%
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={`h-full transition-all duration-300 ${
                    report.status === 'failed' ? 'bg-semantic-danger' : 'bg-brand-primary'
                  }`}
                  style={{
                    width: `${Math.max(5, Math.round((report.progressStep / report.progressTotal) * 100))}%`,
                  }}
                />
              </div>

              <ol className="space-y-2.5 pt-2">
                {PIPELINE_STEPS.map((s) => {
                  const logEntry = report.progressLog.find((l) => l.step === s.step);
                  const stepStatus =
                    logEntry?.status ||
                    (report.progressStep > s.step
                      ? 'completed'
                      : report.progressStep === s.step && report.status === 'running'
                        ? 'running'
                        : 'pending');

                  return (
                    <li
                      key={s.step}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border-hairline bg-surface-subtle px-3.5 py-2.5 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        {stepStatus === 'completed' ? (
                          <CheckCircle2
                            className="h-4 w-4 text-semantic-success shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : stepStatus === 'failed' ? (
                          <XCircle
                            className="h-4 w-4 text-semantic-danger shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : stepStatus === 'running' ? (
                          <Loader2
                            className="h-4 w-4 text-brand-primary animate-spin shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock
                            className="h-4 w-4 text-ink-muted shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        )}
                        <div>
                          <p className="font-medium text-ink-primary">
                            {s.step}. {s.label}
                          </p>
                          {logEntry?.detail && (
                            <p className="mt-0.5 text-ink-secondary">{logEntry.detail}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-ink-muted uppercase shrink-0">
                        {stepStatus}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* Completed report view */}
          {report.status === 'completed' && report.reportJson && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
              {/* Sticky section navigation */}
              <aside className="hidden lg:block">
                <nav
                  aria-label="Report sections"
                  className="sticky top-24 rounded-xl border border-border-hairline bg-surface-canvas p-4 space-y-1 max-h-[calc(100vh-7rem)] overflow-y-auto"
                >
                  <p className="px-2 pb-2 text-xs font-semibold text-ink-muted uppercase tracking-wider">
                    Report Sections
                  </p>
                  <a
                    href="#section-scores"
                    className="block rounded-md px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary"
                  >
                    6 Validation Scores
                  </a>
                  <a
                    href="#section-context"
                    className="block rounded-md px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary"
                  >
                    Concepts & Similar Ideas
                  </a>
                  {REPORT_SECTION_META.map((sec) => (
                    <a
                      key={sec.key}
                      href={`#section-${sec.key}`}
                      className="block rounded-md px-2 py-1.5 text-xs text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary truncate"
                    >
                      <span className="font-mono font-semibold text-brand-primary mr-1.5">
                        {sec.code}
                      </span>
                      {sec.title}
                    </a>
                  ))}
                  <a
                    href="#section-sources"
                    className="block rounded-md px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary"
                  >
                    Research Sources
                  </a>
                </nav>
              </aside>

              {/* Main report body */}
              <div className="space-y-6 min-w-0">
                {/* Research mode notice */}
                {report.researchMode === 'demo' && (
                  <div className="rounded-xl border border-semantic-warning/40 bg-semantic-warning/5 p-4 flex items-start gap-3">
                    <AlertTriangle
                      className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="text-sm">
                      <p className="font-semibold text-ink-primary">
                        DEMO DATA Research Active
                      </p>
                      <p className="mt-0.5 text-ink-secondary">
                        SONAR_API_KEY is not configured and DEMO_MODE=true. Sample citations below
                        are explicitly labelled <strong className="font-semibold">DEMO DATA</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {report.researchMode === 'none' && (
                  <div className="rounded-xl border border-border-hairline bg-surface-canvas p-4 flex items-start gap-3">
                    <ShieldAlert
                      className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="text-sm">
                      <p className="font-semibold text-ink-primary">
                        External Research: Not configured
                      </p>
                      <p className="mt-0.5 text-ink-secondary">
                        No live research key or demo mode is enabled. External market claims could
                        not be verified and are marked <strong className="font-semibold">Unverified</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Scores & Fixed Disclaimer */}
                <section
                  id="section-scores"
                  className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-5 scroll-mt-24"
                >
                  <div>
                    <h3 className="font-display text-lg font-bold text-ink-primary">
                      Validation Readiness Scores
                    </h3>
                    <div className="mt-2 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-ink-primary">
                      <Info className="h-4 w-4 text-brand-secondary shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{SCORING_DISCLAIMER}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {SCORE_LABELS.map((meta) => {
                      const item = report.reportJson!.scores[meta.key];
                      const pct = Math.min(100, Math.max(0, item.score * 10));
                      return (
                        <div
                          key={meta.key}
                          className="rounded-lg border border-border-hairline bg-surface-subtle p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-ink-primary">
                              {meta.title}
                            </span>
                            <span className="font-mono text-base font-bold text-brand-primary tabular-nums">
                              {item.score.toFixed(1)} / 10
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full bg-brand-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-ink-secondary leading-relaxed">
                            {item.explanation}
                          </p>
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${evidenceStyle(
                              item.evidenceLabel,
                            )}`}
                          >
                            {item.evidenceLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Concepts & Per-user cosine similarity */}
                <section
                  id="section-context"
                  className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4 scroll-mt-24"
                >
                  <h3 className="font-display text-base font-bold text-ink-primary">
                    Extracted Concepts & Workspace Similarity
                  </h3>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-ink-muted">Key Concepts</p>
                    <div className="flex flex-wrap gap-2">
                      {report.concepts.length > 0 ? (
                        report.concepts.map((c) => (
                          <span
                            key={c}
                            className="rounded-md border border-border-hairline bg-surface-subtle px-2.5 py-1 text-xs font-medium text-ink-primary"
                          >
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted">None extracted</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border-hairline">
                    <p className="text-xs font-medium text-ink-muted">
                      Similar Ideas (Your Own Workspace Only · Cosine Similarity)
                    </p>
                    {report.similarIdeas.length === 0 ? (
                      <p className="text-xs text-ink-secondary">
                        No other ideas with embeddings found in your workspace yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border-hairline rounded-lg border border-border-hairline">
                        {report.similarIdeas.map((sim) => (
                          <li
                            key={sim.ideaId}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <Link
                              to={`/ideas/${sim.ideaId}`}
                              className="font-medium text-ink-primary hover:text-brand-primary truncate"
                            >
                              {sim.title}
                            </Link>
                            <span className="font-mono text-ink-secondary tabular-nums shrink-0">
                              {(sim.similarityScore * 100).toFixed(1)}% match
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                {/* All 18 Sections (A–R) */}
                {REPORT_SECTION_META.map((meta) => {
                  if (meta.key === 'swot') {
                    const swot = report.reportJson!.sections.swot;
                    const quads: Array<{ title: string; items: ReportClaim[] }> = [
                      { title: 'Strengths', items: swot.strengths },
                      { title: 'Weaknesses', items: swot.weaknesses },
                      { title: 'Opportunities', items: swot.opportunities },
                      { title: 'Threats', items: swot.threats },
                    ];
                    return (
                      <section
                        key={meta.key}
                        id={`section-${meta.key}`}
                        className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4 scroll-mt-24"
                      >
                        <h3 className="font-display text-base font-bold text-ink-primary border-b border-border-hairline pb-3">
                          <span className="font-mono text-brand-primary mr-2">{meta.code}.</span>
                          {meta.title}
                        </h3>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {quads.map((q) => (
                            <div
                              key={q.title}
                              className="rounded-lg border border-border-hairline bg-surface-subtle p-4"
                            >
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
                                {q.title}
                              </h4>
                              <ul>
                                {q.items.map((item, idx) => (
                                  <ClaimRow key={idx} claim={item} />
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  }

                  const sec = report.reportJson!.sections[meta.key];
                  return (
                    <section
                      key={meta.key}
                      id={`section-${meta.key}`}
                      className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-3 scroll-mt-24"
                    >
                      <h3 className="font-display text-base font-bold text-ink-primary border-b border-border-hairline pb-3">
                        <span className="font-mono text-brand-primary mr-2">{meta.code}.</span>
                        {meta.title}
                      </h3>
                      <p className="text-sm text-ink-secondary leading-relaxed">{sec.summary}</p>
                      <ul className="pt-1">
                        {sec.items.map((item, idx) => (
                          <ClaimRow key={idx} claim={item} />
                        ))}
                      </ul>
                    </section>
                  );
                })}

                {/* Sources */}
                <section
                  id="section-sources"
                  className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4 scroll-mt-24"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border-hairline pb-3">
                    <h3 className="font-display text-base font-bold text-ink-primary">
                      Research Sources & Citations
                    </h3>
                    {report.researchMode === 'demo' && (
                      <span className="inline-flex items-center rounded border border-semantic-warning/40 bg-semantic-warning/10 px-2 py-0.5 text-xs font-semibold text-semantic-warning">
                        DEMO DATA
                      </span>
                    )}
                  </div>

                  {!report.sources || report.sources.length === 0 ? (
                    <p className="text-sm text-ink-secondary">
                      Not configured — no external sources were retrieved. Configure{' '}
                      <code className="font-mono text-xs">SONAR_API_KEY</code> (or enable{' '}
                      <code className="font-mono text-xs">DEMO_MODE=true</code> for sample data) to
                      include citations.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border-hairline">
                      {report.sources.map((src) => (
                        <li
                          key={src.id}
                          id={`source-${src.sourceRef}`}
                          className="py-4 first:pt-0 last:pb-0 space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-brand-primary">
                              [{src.sourceRef}]
                            </span>
                            {src.isDemo && (
                              <span className="inline-flex items-center rounded border border-semantic-warning/40 bg-semantic-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-semantic-warning">
                                DEMO DATA
                              </span>
                            )}
                            <span className="text-sm font-semibold text-ink-primary">
                              {src.title}
                            </span>
                          </div>
                          <p className="text-xs text-ink-secondary leading-relaxed">{src.snippet}</p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-brand-accent hover:underline break-all"
                            >
                              <span>{src.url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                            </a>
                            <span>·</span>
                            <span>Retrieved {new Date(src.retrievedAt).toLocaleString('en-IN')}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete validation report?"
        description={`Permanently delete this report for "${report?.ideaTitle}"? Your idea remains saved.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </AppShell>
  );
}
