import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck2,
  Flag,
  Kanban,
  Lightbulb,
  Milestone,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import { EmptyState, ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { api, ApiClientError } from '../../lib/api.ts';
import {
  ROADMAP_DISCLAIMER,
  ROADMAP_DURATIONS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type RoadmapDuration,
  type RoadmapPlanRecord,
  type TaskRecord,
  type TaskStatus,
} from '../../shared/phase5Schemas.ts';

export function RoadmapPage() {
  const [plans, setPlans] = useState<RoadmapPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<RoadmapPlanRecord | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskRecord[]>([]);
  const [completionPercentage, setCompletionPercentage] = useState<number>(0);

  const [ideas, setIdeas] = useState<Array<{ id: string; title: string }>>([]);
  const [reports, setReports] = useState<Array<{ id: string; ideaTitle: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generation inputs
  const [selectedIdeaId, setSelectedIdeaId] = useState<string>('');
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<RoadmapDuration>(30);
  const [customFocus, setCustomFocus] = useState<string>('');

  // View toggle: 'timeline' | 'kanban'
  const [activeView, setActiveView] = useState<'timeline' | 'kanban'>('timeline');

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.roadmap.list(),
      api.ideas.list().catch(() => ({ items: [] })),
      api.reports.list().catch(() => ({ items: [] })),
    ])
      .then(([roadmapRes, ideasRes, reportsRes]) => {
        setPlans(roadmapRes.items);
        setIdeas(ideasRes.items.map((i) => ({ id: i.id, title: i.title })));
        setReports(
          reportsRes.items.map((r) => ({ id: r.id, ideaTitle: r.ideaTitle || 'Validation Report' })),
        );

        if (roadmapRes.items.length > 0) {
          const firstId = roadmapRes.items[0].id;
          setSelectedPlanId(firstId);
          loadPlanDetails(firstId);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load roadmap.');
        setLoading(false);
      });
  }, []);

  const loadPlanDetails = (planId: string) => {
    setLoading(true);
    api.roadmap
      .get(planId)
      .then((res) => {
        setActivePlan(res.plan);
        setActiveTasks(res.tasks);
        setCompletionPercentage(res.completionPercentage);
      })
      .catch((err) => {
        toast.error(err instanceof ApiClientError ? err.message : 'Failed to load plan details.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectPlan = (id: string) => {
    setSelectedPlanId(id);
    loadPlanDetails(id);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await api.roadmap.generate({
        ideaId: selectedIdeaId || null,
        reportId: selectedReportId || null,
        durationDays: selectedDuration,
        customFocus,
      });

      toast.success(
        `Generated ${res.plan.durationDays}-day roadmap and created ${res.tasksCreatedCount} actionable tasks!`,
      );

      // Refresh list and select new plan
      const listRes = await api.roadmap.list();
      setPlans(listRes.items);
      setSelectedPlanId(res.plan.id);
      loadPlanDetails(res.plan.id);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to generate roadmap.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!window.confirm('Delete this roadmap and its generated tasks?')) return;
    try {
      await api.roadmap.delete(id);
      toast.success('Roadmap deleted');
      const updated = plans.filter((p) => p.id !== id);
      setPlans(updated);
      if (updated.length > 0) {
        setSelectedPlanId(updated[0].id);
        loadPlanDetails(updated[0].id);
      } else {
        setSelectedPlanId(null);
        setActivePlan(null);
        setActiveTasks([]);
      }
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete roadmap.');
    }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      setActiveTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      );
      const res = await api.tasks.updateStatus(taskId, { status: newStatus });
      setActiveTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));

      // Recompute completion percentage
      const total = activeTasks.length;
      const completed = activeTasks.filter((t) =>
        t.id === taskId ? newStatus === 'completed' : t.status === 'completed',
      ).length;
      setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);
      toast.success(`Task status updated to ${TASK_STATUS_LABELS[newStatus]}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to update task.');
    }
  };

  // Group tasks by status for Kanban view
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskRecord[]> = {
      todo: [],
      in_progress: [],
      completed: [],
    };
    for (const t of activeTasks) {
      if (map[t.status]) {
        map[t.status].push(t);
      } else {
        map.todo.push(t);
      }
    }
    return map;
  }, [activeTasks]);

  return (
    <AppShell title="Startup Roadmap" breadcrumb="Workspace / Roadmap">
      <div className="space-y-8">
        {/* Top Generator Box */}
        <section className="rounded-xl border border-border-hairline bg-surface-canvas p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-hairline">
            <div className="flex items-center gap-2.5">
              <Compass className="h-5 w-5 text-brand-primary" />
              <div>
                <h3 className="font-display text-base font-bold text-ink-primary">
                  Generate Execution Roadmap
                </h3>
                <p className="text-xs text-ink-secondary">
                  Generate actionable 30, 60, or 90-day execution plans from your idea or report. All generated tasks are automatically synced to your task manager.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md bg-brand-primary/10 px-2 py-1 text-xs font-semibold text-brand-primary border border-brand-primary/20">
              <Sparkles className="h-3.5 w-3.5" /> {ROADMAP_DISCLAIMER}
            </span>
          </div>

          <form onSubmit={handleGenerate} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                From Saved Idea
              </label>
              <select
                value={selectedIdeaId}
                onChange={(e) => setSelectedIdeaId(e.target.value)}
                className="w-full rounded-lg border border-border-hairline bg-surface-subtle px-3 py-2 text-xs text-ink-primary focus:border-brand-primary focus:outline-none"
              >
                <option value="">Choose idea...</option>
                {ideas.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Or From Validation Report
              </label>
              <select
                value={selectedReportId}
                onChange={(e) => setSelectedReportId(e.target.value)}
                className="w-full rounded-lg border border-border-hairline bg-surface-subtle px-3 py-2 text-xs text-ink-primary focus:border-brand-primary focus:outline-none"
              >
                <option value="">Choose report...</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.ideaTitle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Duration Timeframe
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border-hairline bg-surface-subtle p-1">
                {ROADMAP_DURATIONS.map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setSelectedDuration(dur)}
                    className={`py-1 text-xs font-medium rounded-md transition-colors ${
                      selectedDuration === dur
                        ? 'bg-surface-canvas font-bold text-brand-primary shadow-2xs'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    {dur} Days
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-xs font-bold text-white hover:bg-brand-primary/90 disabled:opacity-50 transition-colors h-[38px]"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Generating Plan...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate {selectedDuration}-Day Plan
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Saved Plans Selector (if multiple) */}
        {plans.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-ink-muted whitespace-nowrap">
              Saved Roadmaps:
            </span>
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPlan(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap ${
                  selectedPlanId === p.id
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold'
                    : 'border-border-hairline bg-surface-canvas text-ink-secondary hover:bg-surface-subtle'
                }`}
              >
                {p.title} ({p.durationDays}d)
              </button>
            ))}
          </div>
        )}

        {/* Loading and Error */}
        {loading && <SkeletonCard rows={5} />}
        {error && <ErrorState message={error} onRetry={loadData} />}

        {/* Empty State */}
        {!loading && !error && !activePlan && (
          <EmptyState
            icon={<Compass className="h-6 w-6 text-brand-primary" />}
            title="No roadmap generated yet"
            description="Use the generator above to create a 30, 60, or 90-day plan tailored to your startup idea."
          />
        )}

        {/* Active Roadmap View */}
        {!loading && !error && activePlan && (
          <div className="space-y-6">
            {/* Header info & Completion tracker */}
            <div className="rounded-xl border border-border-hairline bg-surface-canvas p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-xs font-bold text-brand-primary border border-brand-primary/20">
                      {activePlan.durationDays}-Day Plan
                    </span>
                    <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-xs font-medium text-ink-muted border border-border-hairline">
                      {activeTasks.length} Generated Tasks
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary">
                      <Sparkles className="h-3 w-3" /> {activePlan.evidenceLabel}
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-xl font-bold text-ink-primary">
                    {activePlan.title}
                  </h2>
                  <p className="mt-1 text-sm text-ink-secondary max-w-3xl">
                    {activePlan.summary}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* View Toggle */}
                  <div className="flex rounded-lg border border-border-hairline bg-surface-subtle p-1">
                    <button
                      type="button"
                      onClick={() => setActiveView('timeline')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        activeView === 'timeline'
                          ? 'bg-surface-canvas font-bold text-ink-primary shadow-2xs'
                          : 'text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      <Milestone className="h-3.5 w-3.5" /> Timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('kanban')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        activeView === 'kanban'
                          ? 'bg-surface-canvas font-bold text-ink-primary shadow-2xs'
                          : 'text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      <Kanban className="h-3.5 w-3.5" /> Kanban
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeletePlan(activePlan.id)}
                    className="p-2 text-ink-muted hover:text-red-600 rounded-lg border border-border-hairline hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    title="Delete Roadmap"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Completion Progress Bar */}
              <div className="mt-6 pt-5 border-t border-border-hairline">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-ink-secondary">Overall Plan Completion</span>
                  <span className="text-ink-primary font-bold">{completionPercentage}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-surface-subtle overflow-hidden border border-border-hairline">
                  <div
                    className="h-full bg-brand-primary transition-all duration-500 rounded-full"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* View Content: Timeline vs Kanban */}
            {activeView === 'timeline' ? (
              <div className="space-y-6">
                {activePlan.phases.map((phase) => (
                  <div
                    key={phase.phaseNumber}
                    className="rounded-xl border border-border-hairline bg-surface-canvas p-6 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border-hairline">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                          {phase.phaseNumber}
                        </span>
                        <div>
                          <h3 className="font-display text-base font-bold text-ink-primary">
                            {phase.name}
                          </h3>
                          <p className="text-xs text-ink-muted font-medium">{phase.timeframe}</p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-ink-secondary">
                        {phase.objective}
                      </span>
                    </div>

                    {/* Milestones */}
                    {phase.milestones.length > 0 && (
                      <div className="mt-4 rounded-lg bg-surface-subtle p-3 text-xs text-ink-secondary">
                        <span className="font-semibold text-ink-primary flex items-center gap-1 mb-1">
                          <Flag className="h-3.5 w-3.5 text-brand-primary" /> Key Milestones:
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 pl-1">
                          {phase.milestones.map((m, idx) => (
                            <li key={idx}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tasks in this phase */}
                    <div className="mt-4 space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                        Phase Execution Tasks
                      </h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {activeTasks
                          .filter((t) => t.description.includes(`[${phase.name}]`))
                          .map((task) => (
                            <div
                              key={task.id}
                              className="flex flex-col justify-between rounded-lg border border-border-hairline bg-surface-subtle/50 p-3.5 hover:border-brand-primary/40 transition-colors"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-canvas border border-border-hairline text-ink-secondary">
                                    {task.priority}
                                  </span>
                                  <span
                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                      task.status === 'completed'
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                        : task.status === 'in_progress'
                                          ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                          : 'bg-surface-canvas text-ink-muted border border-border-hairline'
                                    }`}
                                  >
                                    {TASK_STATUS_LABELS[task.status]}
                                  </span>
                                </div>
                                <h5
                                  className={`mt-2 text-sm font-semibold text-ink-primary ${
                                    task.status === 'completed' ? 'line-through text-ink-muted' : ''
                                  }`}
                                >
                                  {task.title}
                                </h5>
                                {task.expectedOutcome && (
                                  <p className="mt-1 text-xs text-ink-secondary">
                                    <span className="font-semibold text-ink-primary">Outcome: </span>
                                    {task.expectedOutcome}
                                  </p>
                                )}
                              </div>

                              <div className="mt-3 flex items-center justify-between pt-2 border-t border-border-hairline text-[11px] text-ink-muted">
                                <span>Due: {task.dueDate || 'N/A'}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleTaskStatusChange(
                                      task.id,
                                      task.status === 'completed' ? 'todo' : 'completed',
                                    )
                                  }
                                  className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {task.status === 'completed' ? 'Reopen' : 'Complete'}
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Kanban View of Roadmap's Tasks */
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {TASK_STATUSES.map((status) => {
                  const colTasks = tasksByStatus[status];
                  return (
                    <div
                      key={status}
                      className="flex flex-col rounded-xl border border-border-hairline bg-surface-subtle/50 p-4 min-h-[400px]"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-border-hairline">
                        <h4 className="font-display text-sm font-bold text-ink-primary">
                          {TASK_STATUS_LABELS[status]}
                        </h4>
                        <span className="rounded-full bg-surface-canvas px-2 py-0.5 text-xs font-semibold text-ink-muted border border-border-hairline">
                          {colTasks.length}
                        </span>
                      </div>

                      <div className="mt-3 flex-1 space-y-3">
                        {colTasks.length === 0 ? (
                          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border-hairline text-xs text-ink-muted">
                            No tasks in this stage
                          </div>
                        ) : (
                          colTasks.map((task) => (
                            <div
                              key={task.id}
                              className="rounded-xl border border-border-hairline bg-surface-canvas p-4 shadow-2xs space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-subtle border border-border-hairline text-ink-secondary">
                                  {task.priority}
                                </span>
                                <select
                                  value={task.status}
                                  onChange={(e) =>
                                    handleTaskStatusChange(task.id, e.target.value as TaskStatus)
                                  }
                                  className="text-[11px] rounded border border-border-hairline bg-surface-canvas px-1.5 py-0.5 text-ink-primary"
                                >
                                  {TASK_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {TASK_STATUS_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <h5
                                className={`text-sm font-semibold text-ink-primary ${
                                  status === 'completed' ? 'line-through text-ink-muted' : ''
                                }`}
                              >
                                {task.title}
                              </h5>
                              {task.expectedOutcome && (
                                <p className="text-xs text-ink-secondary line-clamp-2">
                                  <span className="font-semibold text-ink-primary">Outcome: </span>
                                  {task.expectedOutcome}
                                </p>
                              )}
                              <p className="text-[11px] text-ink-muted pt-2 border-t border-border-hairline">
                                Due: {task.dueDate || 'N/A'}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default RoadmapPage;
