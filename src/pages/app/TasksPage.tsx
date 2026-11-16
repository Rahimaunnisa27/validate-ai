import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  Filter,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/app/AppShell.tsx';
import { EmptyState, ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { api, ApiClientError } from '../../lib/api.ts';
import {
  TASK_PRIORITIES,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskInput,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
} from '../../shared/phase5Schemas.ts';
import { toast } from 'sonner';

const PRIORITY_COLORS: Record<TaskPriority, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-surface-subtle', text: 'text-ink-secondary', border: 'border-border-hairline' },
  medium: { bg: 'bg-brand-primary/10', text: 'text-brand-primary', border: 'border-brand-primary/20' },
  high: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
  urgent: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/20' },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(dueDateStr: string | null): boolean {
  if (!dueDateStr) return false;
  const today = new Date().toISOString().split('T')[0];
  return dueDateStr < today;
}

function isDueSoon(dueDateStr: string | null): boolean {
  if (!dueDateStr) return false;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return dueDateStr >= todayStr && dueDateStr <= inThreeDays;
}

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [ideas, setIdeas] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [formData, setFormData] = useState<TaskInput>({
    title: '',
    description: '',
    priority: 'medium',
    startDate: '',
    dueDate: '',
    status: 'todo',
    notes: '',
    expectedOutcome: '',
    ideaId: null,
  });
  const [submitting, setSubmitting] = useState(false);

  // Move-to menu open popover
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const loadTasks = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.tasks.list(),
      api.ideas.list().catch(() => ({ items: [] })),
    ])
      .then(([tasksRes, ideasRes]) => {
        setTasks(tasksRes.items);
        setIdeas(ideasRes.items.map((i) => ({ id: i.id, title: i.title })));
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load tasks.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description.toLowerCase().includes(q);
        const matchesOutcome = t.expectedOutcome.toLowerCase().includes(q);
        const matchesNotes = t.notes.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesOutcome && !matchesNotes) return false;
      }
      return true;
    });
  }, [tasks, filterPriority, filterStatus, searchQuery]);

  // Group by Kanban status
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskRecord[]> = {
      todo: [],
      in_progress: [],
      completed: [],
    };
    for (const t of filteredTasks) {
      if (map[t.status]) {
        map[t.status].push(t);
      } else {
        map.todo.push(t);
      }
    }
    return map;
  }, [filteredTasks]);

  // Upcoming Deadlines list (non-completed tasks sorted by due date)
  const upcomingDeadlines = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'completed' && t.dueDate)
      .sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1))
      .slice(0, 5);
  }, [tasks]);

  const handleOpenCreate = () => {
    setEditingTask(null);
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      startDate: today,
      dueDate: '',
      status: 'todo',
      notes: '',
      expectedOutcome: '',
      ideaId: null,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (task: TaskRecord) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description,
      priority: task.priority,
      startDate: task.startDate || '',
      dueDate: task.dueDate || '',
      status: task.status,
      notes: task.notes,
      expectedOutcome: task.expectedOutcome,
      ideaId: task.ideaId,
    });
    setModalOpen(true);
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Task title is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload: TaskInput = {
        ...formData,
        startDate: formData.startDate ? formData.startDate : null,
        dueDate: formData.dueDate ? formData.dueDate : null,
        ideaId: formData.ideaId ? formData.ideaId : null,
      };

      if (editingTask) {
        const res = await api.tasks.update(editingTask.id, payload);
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? res.task : t)));
        toast.success('Task updated');
      } else {
        const res = await api.tasks.create(payload);
        setTasks((prev) => [res.task, ...prev]);
        toast.success('Task created');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to save task.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.tasks.delete(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Task deleted');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete task.');
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      );
      const res = await api.tasks.updateStatus(taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
      toast.success(`Task moved to ${TASK_STATUS_LABELS[newStatus]}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to update task status.');
      loadTasks();
    }
  };

  // Drag and Drop
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    handleStatusChange(taskId, status);
  };

  return (
    <AppShell
      title="Tasks & Execution"
      breadcrumb="Workspace / Tasks"
      action={
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Task
        </button>
      }
    >
      <div className="space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
              <input
                type="text"
                placeholder="Search tasks, outcomes, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border-hairline bg-surface-canvas py-2 pl-9 pr-4 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-ink-muted hidden sm:inline" />
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                aria-label="Filter by priority"
                className="rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
              >
                <option value="all">All Priorities</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by status"
                className="rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
              >
                <option value="all">All Statuses</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Upcoming Deadlines Widget */}
        {upcomingDeadlines.length > 0 && (
          <div className="rounded-xl border border-border-hairline bg-surface-canvas p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-brand-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                Upcoming Deadlines
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {upcomingDeadlines.map((task) => {
                const overdue = isOverdue(task.dueDate);
                const dueSoon = isDueSoon(task.dueDate);
                return (
                  <div
                    key={task.id}
                    onClick={() => handleOpenEdit(task)}
                    className="flex flex-col justify-between rounded-lg border border-border-hairline bg-surface-subtle p-3 hover:border-brand-primary/40 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${
                            PRIORITY_COLORS[task.priority].bg
                          } ${PRIORITY_COLORS[task.priority].text} ${
                            PRIORITY_COLORS[task.priority].border
                          }`}
                        >
                          {task.priority}
                        </span>
                        {overdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
                            <AlertCircle className="h-3 w-3" /> Overdue
                          </span>
                        ) : dueSoon ? (
                          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            Due soon
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-ink-primary line-clamp-1">
                        {task.title}
                      </p>
                    </div>
                    <p className="mt-2 text-[11px] text-ink-muted flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {formatDate(task.dueDate)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading & Error States */}
        {loading && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
          </div>
        )}

        {error && <ErrorState message={error} onRetry={loadTasks} />}

        {/* Empty State */}
        {!loading && !error && tasks.length === 0 && (
          <EmptyState
            icon={<CheckSquare className="h-6 w-6 text-brand-primary" />}
            title="No tasks yet"
            description="Create your first task or generate an execution roadmap to populate tasks automatically."
            action={
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
              >
                <Plus className="h-4 w-4" /> Create First Task
              </button>
            }
          />
        )}

        {/* Kanban Board */}
        {!loading && !error && tasks.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {TASK_STATUSES.map((status) => {
              const columnTasks = tasksByStatus[status];
              const columnTitle = TASK_STATUS_LABELS[status];

              return (
                <div
                  key={status}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, status)}
                  className="flex flex-col rounded-xl border border-border-hairline bg-surface-subtle/50 p-4 min-h-[480px]"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-border-hairline">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          status === 'completed'
                            ? 'bg-emerald-500'
                            : status === 'in_progress'
                              ? 'bg-amber-500'
                              : 'bg-brand-primary'
                        }`}
                      />
                      <h3 className="font-display text-sm font-bold text-ink-primary">
                        {columnTitle}
                      </h3>
                      <span className="rounded-full bg-surface-canvas px-2 py-0.5 text-xs font-semibold text-ink-muted border border-border-hairline">
                        {columnTasks.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTask(null);
                        setFormData({
                          title: '',
                          description: '',
                          priority: 'medium',
                          startDate: new Date().toISOString().split('T')[0],
                          dueDate: '',
                          status,
                          notes: '',
                          expectedOutcome: '',
                          ideaId: null,
                        });
                        setModalOpen(true);
                      }}
                      className="p-1 text-ink-muted hover:text-ink-primary rounded hover:bg-surface-canvas"
                      title={`Add task to ${columnTitle}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex-1 space-y-3">
                    {columnTasks.length === 0 ? (
                      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border-hairline text-xs text-ink-muted">
                        Drag tasks here or click + to add
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        const overdue = status !== 'completed' && isOverdue(task.dueDate);
                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onClick={() => handleOpenEdit(task)}
                            className="group relative rounded-xl border border-border-hairline bg-surface-canvas p-4 shadow-2xs hover:border-brand-primary/50 transition-all cursor-grab active:cursor-grabbing"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${
                                  PRIORITY_COLORS[task.priority].bg
                                } ${PRIORITY_COLORS[task.priority].text} ${
                                  PRIORITY_COLORS[task.priority].border
                                }`}
                              >
                                {task.priority.toUpperCase()}
                              </span>

                              {/* Action Menu / Dropdown */}
                              <div
                                className="relative"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveMenuId(activeMenuId === task.id ? null : task.id)
                                  }
                                  className="p-1 text-ink-muted hover:text-ink-primary rounded hover:bg-surface-subtle"
                                  title="Task actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                                {activeMenuId === task.id && (
                                  <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-border-hairline bg-surface-canvas p-1 shadow-lg text-xs">
                                    <div className="px-2 py-1 font-semibold text-[10px] uppercase text-ink-muted">
                                      Move to...
                                    </div>
                                    {TASK_STATUSES.filter((s) => s !== task.status).map((s) => (
                                      <button
                                        key={s}
                                        type="button"
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handleStatusChange(task.id, s);
                                        }}
                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-subtle text-ink-primary"
                                      >
                                        {TASK_STATUS_LABELS[s]}
                                      </button>
                                    ))}
                                    <div className="my-1 border-t border-border-hairline" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        handleOpenEdit(task);
                                      }}
                                      className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-subtle text-ink-primary flex items-center gap-1.5"
                                    >
                                      <Pencil className="h-3.5 w-3.5" /> Edit task
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        handleDelete(task.id);
                                      }}
                                      className="w-full text-left px-2 py-1.5 rounded hover:bg-red-50 text-red-600 dark:hover:bg-red-950/30 flex items-center gap-1.5"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" /> Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <h4
                              className={`mt-2 font-display text-sm font-semibold text-ink-primary ${
                                status === 'completed' ? 'line-through text-ink-muted' : ''
                              }`}
                            >
                              {task.title}
                            </h4>

                            {task.description && (
                              <p className="mt-1 text-xs text-ink-secondary line-clamp-2">
                                {task.description}
                              </p>
                            )}

                            {task.expectedOutcome && (
                              <div className="mt-2.5 rounded-md bg-surface-subtle p-2 text-[11px] text-ink-secondary">
                                <span className="font-semibold text-ink-primary">Outcome: </span>
                                {task.expectedOutcome}
                              </div>
                            )}

                            <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted pt-2 border-t border-border-hairline">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {task.dueDate ? (
                                  <span className={overdue ? 'font-bold text-red-600 dark:text-red-400' : ''}>
                                    {formatDate(task.dueDate)}
                                  </span>
                                ) : (
                                  'No due date'
                                )}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(
                                    task.id,
                                    task.status === 'completed' ? 'todo' : 'completed',
                                  );
                                }}
                                className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
                                  task.status === 'completed'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-ink-muted hover:text-brand-primary'
                                }`}
                                title={task.status === 'completed' ? 'Mark Incomplete' : 'Complete Task'}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {task.status === 'completed' ? 'Done' : 'Mark Done'}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border-hairline bg-surface-canvas p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-border-hairline">
              <h3 className="font-display text-lg font-bold text-ink-primary">
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-subtle hover:text-ink-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-primary">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Conduct 15 customer discovery interviews"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-primary">Description</label>
                <textarea
                  rows={3}
                  placeholder="Step-by-step guidance, context, or instructions..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-primary">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                    className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-primary">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                    className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TASK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-primary">Linked Idea</label>
                  <select
                    value={formData.ideaId || ''}
                    onChange={(e) => setFormData({ ...formData, ideaId: e.target.value || null })}
                    className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  >
                    <option value="">None</option>
                    {ideas.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-ink-primary">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate || ''}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-primary">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate || ''}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-primary">Expected Outcome</label>
                <input
                  type="text"
                  placeholder="e.g. 15 completed interviews and top 3 validated pain points"
                  value={formData.expectedOutcome}
                  onChange={(e) => setFormData({ ...formData, expectedOutcome: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-primary">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Helpful links, blockers, or tools..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border-hairline">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-border-hairline px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
export default TasksPage;
