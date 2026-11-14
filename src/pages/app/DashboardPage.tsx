import {
  Activity,
  ArrowRight,
  Briefcase,
  Calculator,
  FileCheck2,
  FilePlus2,
  Handshake,
  Lightbulb,
  Megaphone,
  Plus,
  Search,
  Swords,
  UserCheck,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/app/AppShell.tsx';
import { EmptyState, ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api, ApiClientError, type DashboardData } from '../../lib/api.ts';
import { LEAD_STAGES } from '../../shared/phase4Schemas.ts';

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatInr(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setError(null);
    api.dashboard
      .get()
      .then((res) => setData(res))
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'Unable to load dashboard.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <AppShell title="Dashboard" breadcrumb="Workspace / Overview">
      <div className="space-y-8">
        <div>
          <h2 className="font-display text-xl font-bold text-ink-primary">
            Welcome back, {user?.fullName}
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            All metrics below are queried directly from your VenturePilot database.
          </p>
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
          </div>
        )}

        {error && <ErrorState message={error} onRetry={loadDashboard} />}

        {!loading && !error && data && (
          <>
            {/* Real DB KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
                <p className="text-xs font-medium text-ink-muted">Total Ideas</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink-primary tabular-nums">
                  {data.summary.totalIdeas}
                </p>
                <p className="mt-1 text-xs text-ink-secondary tabular-nums">
                  {data.summary.submittedIdeas} submitted · {data.summary.draftIdeas} drafts
                </p>
              </div>

              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
                <p className="text-xs font-medium text-ink-muted">Active Startups</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink-primary tabular-nums">
                  {data.summary.activeStartups}
                </p>
                <p className="mt-1 text-xs text-ink-secondary">
                  Organized in your workspace
                </p>
              </div>

              <Link
                to="/reports"
                className="rounded-xl border border-border-hairline bg-surface-canvas p-5 hover:border-brand-primary/50 transition-colors block"
              >
                <p className="text-xs font-medium text-ink-muted">Completed Reports</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink-primary tabular-nums">
                  {data.summary.completedReports}
                </p>
                <p className="mt-1 text-xs text-brand-primary font-medium">
                  View validation reports
                </p>
              </Link>

              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
                <p className="text-xs font-medium text-ink-muted">Drafts In Progress</p>
                <p className="mt-2 font-display text-2xl font-bold text-brand-primary tabular-nums">
                  {data.summary.draftIdeas}
                </p>
                <p className="mt-1 text-xs text-ink-secondary">
                  Autosaved step-by-step
                </p>
              </div>
            </div>

            {/* Financial Overview Card (Real Saved-Plan Data) */}
            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Calculator className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-primary">
                      Financial Overview
                    </h3>
                    <p className="text-xs text-ink-muted">
                      {data.financialOverview
                        ? `Latest saved plan: ${data.financialOverview.name}${
                            data.financialOverview.startupName
                              ? ` · ${data.financialOverview.startupName}`
                              : ''
                          }`
                        : 'Server-calculated unit economics from your saved financial plans'}
                    </p>
                  </div>
                </div>
                <Link
                  to="/finance"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle transition-colors"
                >
                  {data.financialOverview ? 'Open Financial Planner' : 'Create Financial Plan'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              {data.financialOverview ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3">
                    <p className="text-[11px] font-medium text-ink-muted">Expected Revenue/Mo</p>
                    <p className="mt-1 font-display text-base font-bold text-ink-primary tabular-nums">
                      {formatInr(data.financialOverview.expectedMonthlyRevenue)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3">
                    <p className="text-[11px] font-medium text-ink-muted">Expected Expenses/Mo</p>
                    <p className="mt-1 font-display text-base font-bold text-ink-primary tabular-nums">
                      {formatInr(data.financialOverview.expectedMonthlyExpenses)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3">
                    <p className="text-[11px] font-medium text-ink-muted">Operating Profit/Mo</p>
                    <p
                      className={`mt-1 font-display text-base font-bold tabular-nums ${
                        data.financialOverview.expectedOperatingProfit >= 0
                          ? 'text-semantic-success'
                          : 'text-semantic-danger'
                      }`}
                    >
                      {formatInr(data.financialOverview.expectedOperatingProfit)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3">
                    <p className="text-[11px] font-medium text-ink-muted">Break-Even Volume</p>
                    <p className="mt-1 font-display text-base font-bold text-ink-primary tabular-nums">
                      {data.financialOverview.expectedBreakEvenUnits !== null
                        ? `${data.financialOverview.expectedBreakEvenUnits.toLocaleString('en-IN')} units`
                        : 'Unreachable'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3">
                    <p className="text-[11px] font-medium text-ink-muted">Expected Runway</p>
                    <p className="mt-1 font-display text-sm font-bold text-ink-primary tabular-nums">
                      {data.financialOverview.expectedRunwayLabel}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-ink-secondary">
                  No financial plans saved yet. Create a plan to see monthly revenue, operating profit, break-even volume, and runway here.
                </p>
              )}
            </section>

            {/* Leads & Pipeline Overview (Real Lead Totals by Stage) */}
            <section className="rounded-xl border border-border-hairline bg-surface-canvas p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-primary">
                      Leads &amp; Pipeline Overview
                    </h3>
                    <p className="text-xs text-ink-muted tabular-nums">
                      Total Leads: {data.summary.totalLeads ?? 0} · Conversion Rate:{' '}
                      {(data.summary.leadConversionRate ?? 0).toFixed(1)}% · Marketing Campaigns:{' '}
                      {data.summary.savedMarketingCampaigns ?? 0} · Sales Playbooks:{' '}
                      {data.summary.savedSalesPlaybooks ?? 0}
                    </p>
                  </div>
                </div>
                <Link
                  to="/leads"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle transition-colors"
                >
                  Open Pipeline Board
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {LEAD_STAGES.map((stage) => (
                  <div
                    key={stage}
                    className="rounded-lg border border-border-hairline bg-surface-subtle p-3"
                  >
                    <p className="text-[11px] font-medium text-ink-muted">{stage}</p>
                    <p className="mt-1 font-display text-lg font-bold text-ink-primary tabular-nums">
                      {data.summary.leadsByStage?.[stage] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick Actions */}
            <section>
              <h3 className="text-sm font-semibold text-ink-primary mb-3">Quick Actions</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Link
                  to="/ideas/new"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FilePlus2 className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">New Idea</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/reports"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileCheck2 className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Validation Reports</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/finance"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Calculator className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Financial Planner</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/personas"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-brand-secondary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Customer Personas</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/research"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Search className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Market Research</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/competitors"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Swords className="h-4 w-4 text-brand-secondary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Competitor Analysis</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/leads"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <UserCheck className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Leads &amp; Pipeline</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/marketing"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Megaphone className="h-4 w-4 text-brand-secondary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Marketing Strategy</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/sales"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Handshake className="h-4 w-4 text-brand-accent" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Sales Assistant</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/startups?new=1"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Plus className="h-4 w-4 text-brand-secondary" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Create Startup</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>

                <Link
                  to="/integrations"
                  className="flex items-center justify-between rounded-xl border border-border-hairline bg-surface-canvas p-4 hover:border-brand-primary/50 hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-brand-accent" aria-hidden="true" />
                    <span className="text-sm font-medium text-ink-primary">Integration Status</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </Link>
              </div>
            </section>

            {/* Recent Ideas & Startups */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-primary">Recent Ideas & Drafts</h3>
                  <Link
                    to="/ideas"
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    View all
                  </Link>
                </div>

                {data.recentIdeas.length === 0 ? (
                  <EmptyState
                    icon={<Lightbulb className="h-5 w-5" aria-hidden="true" />}
                    title="No ideas recorded yet"
                    description="Start the 5-step idea intake form. Your draft saves automatically as you write."
                    action={
                      <Link
                        to="/ideas/new"
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors"
                      >
                        Submit Your First Idea
                      </Link>
                    }
                  />
                ) : (
                  <div className="divide-y divide-border-hairline rounded-xl border border-border-hairline bg-surface-canvas">
                    {data.recentIdeas.map((idea) => (
                      <div
                        key={idea.id}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-surface-subtle transition-colors"
                      >
                        <div className="min-w-0">
                          <Link
                            to={
                              idea.status === 'draft'
                                ? `/ideas/${idea.id}/edit`
                                : `/ideas/${idea.id}`
                            }
                            className="block truncate text-sm font-semibold text-ink-primary hover:text-brand-primary"
                          >
                            {idea.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {idea.status === 'draft'
                              ? `Draft · Step ${idea.currentStep} of 6`
                              : 'Submitted'}
                            {idea.startupName ? ` · ${idea.startupName}` : ''} · Updated{' '}
                            {formatRelativeDate(idea.updatedAt)}
                          </p>
                        </div>
                        <Link
                          to={
                            idea.status === 'draft'
                              ? `/ideas/${idea.id}/edit`
                              : `/ideas/${idea.id}`
                          }
                          className="shrink-0 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-canvas whitespace-nowrap"
                        >
                          {idea.status === 'draft' ? 'Resume Draft' : 'Open'}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-primary">Your Startups</h3>
                  <Link
                    to="/startups"
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Manage startups
                  </Link>
                </div>

                {data.recentStartups.length === 0 ? (
                  <EmptyState
                    icon={<Briefcase className="h-5 w-5" aria-hidden="true" />}
                    title="No startups created yet"
                    description="Create a startup workspace to group related ideas, validation runs, and future financial plans."
                    action={
                      <Link
                        to="/startups?new=1"
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-hairline bg-surface-canvas px-4 text-sm font-medium text-ink-primary hover:bg-surface-subtle transition-colors"
                      >
                        Create Startup
                      </Link>
                    }
                  />
                ) : (
                  <div className="divide-y divide-border-hairline rounded-xl border border-border-hairline bg-surface-canvas">
                    {data.recentStartups.map((st) => (
                      <div
                        key={st.id}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-surface-subtle transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-primary">
                            {st.name}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {st.industry} · Stage: {st.stage.replace('_', ' ')} ·{' '}
                            <span className="tabular-nums">{st.ideasCount}</span>{' '}
                            {st.ideasCount === 1 ? 'idea' : 'ideas'}
                          </p>
                        </div>
                        <Link
                          to="/startups"
                          className="shrink-0 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-canvas whitespace-nowrap"
                        >
                          Manage
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
