import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app/AppShell.tsx';
import { PublicFooter } from '../../components/public/PublicFooter.tsx';
import { PublicNavbar } from '../../components/public/PublicNavbar.tsx';
import { ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api, ApiClientError, type SystemStatusResponse } from '../../lib/api.ts';

function StatusContent() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    setLoading(true);
    setError(null);
    api.system
      .status()
      .then((res) => setStatus(res))
      .catch((err) =>
        setError(
          err instanceof ApiClientError ? err.message : 'Unable to load integration status.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-primary">
            System & Integration Health
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Live configuration check from <code className="font-mono text-xs">/api/v1/system/status</code>.
            No secret values are ever exposed to the browser.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStatus}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle self-start"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh Status
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      )}

      {error && <ErrorState message={error} onRetry={loadStatus} />}

      {!loading && !error && status && (
        <>
          <div className="rounded-xl border border-border-hairline bg-surface-canvas p-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs text-ink-secondary">
            <div>
              <span className="text-ink-muted block">Runtime Environment</span>
              <strong className="mt-0.5 inline-block font-mono text-sm text-ink-primary">
                {status.flags.nodeEnv}
              </strong>
            </div>
            <div>
              <span className="text-ink-muted block">ALLOW_UNPAID_REPORTS</span>
              <strong
                className={`mt-0.5 inline-block font-mono text-sm ${
                  status.flags.allowUnpaidReports
                    ? 'text-semantic-warning'
                    : 'text-ink-primary'
                }`}
              >
                {String(status.flags.allowUnpaidReports)}
              </strong>
            </div>
            <div>
              <span className="text-ink-muted block">DEMO_MODE</span>
              <strong
                className={`mt-0.5 inline-block font-mono text-sm ${
                  status.flags.demoMode ? 'text-semantic-warning' : 'text-ink-primary'
                }`}
              >
                {String(status.flags.demoMode)}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {status.integrations.map((item) => {
              const Icon =
                item.statusLabel === 'Configured'
                  ? CheckCircle2
                  : item.statusLabel === 'Dev fallback'
                    ? AlertTriangle
                    : XCircle;
              const statusColor =
                item.statusLabel === 'Configured'
                  ? 'text-semantic-success'
                  : item.statusLabel === 'Dev fallback'
                    ? 'text-semantic-warning'
                    : 'text-ink-muted';

              return (
                <div
                  key={item.key}
                  className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-ink-muted">{item.phase}</p>
                      <h3 className="mt-0.5 text-sm font-semibold text-ink-primary">{item.name}</h3>
                    </div>
                    <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusColor}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{item.statusLabel}</span>
                    </div>
                  </div>

                  <p className="text-sm text-ink-secondary">{item.message}</p>

                  {!item.configured && item.setupSteps.length > 0 && (
                    <div className="rounded-lg bg-surface-subtle p-3 border border-border-hairline">
                      <p className="text-xs font-semibold text-ink-primary">Setup steps</p>
                      <ul className="mt-1.5 space-y-1 text-xs text-ink-secondary list-disc list-inside">
                        {item.setupSteps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function IntegrationStatusPage() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return (
      <AppShell title="Integration Status" breadcrumb="Workspace / System / Integrations">
        <StatusContent />
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-surface-subtle text-ink-primary flex flex-col">
      <PublicNavbar />
      <main className="flex-1 pt-28 pb-20">
        <div className="mx-auto max-w-[1000px] px-6">
          <StatusContent />
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
