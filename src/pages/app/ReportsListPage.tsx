import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileCheck2,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import { ConfirmDialog, EmptyState, ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { api, ApiClientError, type ReportStatus, type ValidationReport } from '../../lib/api.ts';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusMeta(status: ReportStatus): { label: string; className: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', className: 'text-semantic-success' };
    case 'failed':
      return { label: 'Failed', className: 'text-semantic-danger' };
    case 'running':
      return { label: 'Running', className: 'text-brand-primary' };
    default:
      return { label: 'Queued', className: 'text-semantic-warning' };
  }
}

export function ReportsListPage() {
  const [reports, setReports] = useState<ValidationReport[]>([]);
  const [filter, setFilter] = useState<'all' | ReportStatus>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ValidationReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadReports = useCallback(() => {
    setLoading(true);
    setError(null);
    api.reports
      .list({ status: filter === 'all' ? undefined : filter })
      .then((res) => setReports(res.items))
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Unable to load reports.'),
      )
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleRetry = async (report: ValidationReport) => {
    setRetryingId(report.id);
    try {
      const res = await api.reports.retry(report.id);
      setReports((prev) => prev.map((r) => (r.id === report.id ? res.report : r)));
      toast.success('Validation job restarted for free.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to retry validation job.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDownloadPdf = async (report: ValidationReport) => {
    setDownloadingId(report.id);
    try {
      await api.reports.downloadPdf(report.id);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to download PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.reports.delete(deleteTarget.id);
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success('Report deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete report.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Validation Reports"
      breadcrumb="Workspace / Validation Reports"
      action={
        <Link
          to="/ideas"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          Select an Idea
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-lg border border-border-hairline bg-surface-canvas p-1">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'completed', label: 'Completed' },
                { key: 'running', label: 'Running' },
                { key: 'failed', label: 'Failed' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-brand-primary text-white'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-ink-muted tabular-nums">
            {reports.length} {reports.length === 1 ? 'report' : 'reports'}
          </p>
        </div>

        {loading && (
          <div className="space-y-3">
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
          </div>
        )}

        {error && <ErrorState message={error} onRetry={loadReports} />}

        {!loading && !error && reports.length === 0 && (
          <EmptyState
            icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}
            title="No validation reports yet"
            description="Open any saved or submitted idea in your workspace and click Generate Validation Report to run the 8-step AI pipeline."
            action={
              <Link
                to="/ideas"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover"
              >
                Browse Ideas
              </Link>
            }
          />
        )}

        {!loading && !error && reports.length > 0 && (
          <div className="divide-y divide-border-hairline rounded-xl border border-border-hairline bg-surface-canvas">
            {reports.map((report) => {
              const meta = statusMeta(report.status);
              return (
                <div
                  key={report.id}
                  className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between hover:bg-surface-subtle transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`font-semibold ${meta.className}`}>{meta.label}</span>
                      <span className="text-ink-muted" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-medium text-ink-secondary">{report.planName}</span>
                      {report.researchMode === 'demo' && (
                        <>
                          <span className="text-ink-muted" aria-hidden="true">
                            ·
                          </span>
                          <span className="inline-flex items-center rounded border border-semantic-warning/40 bg-semantic-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-semantic-warning">
                            DEMO DATA
                          </span>
                        </>
                      )}
                      {report.researchMode === 'none' && report.status === 'completed' && (
                        <>
                          <span className="text-ink-muted" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-ink-muted">Research not configured</span>
                        </>
                      )}
                    </div>

                    <Link
                      to={`/reports/${report.id}`}
                      className="block truncate font-display text-base font-bold text-ink-primary hover:text-brand-primary"
                    >
                      {report.ideaTitle}
                    </Link>

                    <p className="text-xs text-ink-muted">
                      {report.startupName ? `${report.startupName} · ` : ''}
                      {report.status === 'running' || report.status === 'queued'
                        ? `Step ${report.progressStep}/${report.progressTotal}: ${report.progressLabel}`
                        : `Created ${formatDate(report.createdAt)}`}
                    </p>

                    {report.status === 'failed' && report.jobError && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-semantic-danger">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{report.jobError}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                      to={`/reports/${report.id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
                    >
                      View Report
                    </Link>

                    {report.status === 'completed' && (
                      <button
                        type="button"
                        disabled={downloadingId === report.id}
                        onClick={() => handleDownloadPdf(report)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3 text-xs font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
                      >
                        {downloadingId === report.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Download PDF
                      </button>
                    )}

                    {report.status === 'failed' && (
                      <button
                        type="button"
                        disabled={retryingId === report.id}
                        onClick={() => handleRetry(report)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-primary/40 bg-brand-primary/5 px-3 text-xs font-medium text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50"
                      >
                        {retryingId === report.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Retry (Free)
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(report)}
                      aria-label={`Delete report for ${report.ideaTitle}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-hairline text-ink-muted hover:text-semantic-danger hover:bg-semantic-danger/5"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete validation report?"
        description={`Remove the validation report for "${deleteTarget?.ideaTitle}"? Your underlying idea will remain saved.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
