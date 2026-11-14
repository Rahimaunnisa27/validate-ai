import { FilePlus2, Lightbulb, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonTable,
} from '../../components/ui/States.tsx';
import { api, ApiClientError, type Idea } from '../../lib/api.ts';

export function IdeasListPage() {
  const [filter, setFilter] = useState<'all' | 'draft' | 'submitted'>('all');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Idea | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadIdeas = useCallback(() => {
    setLoading(true);
    setError(null);
    api.ideas
      .list(filter === 'all' ? undefined : filter)
      .then((res) => setIdeas(res.items))
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Unable to load ideas.'),
      )
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.ideas.delete(deleteTarget.id);
      toast.success('Idea deleted.');
      setDeleteTarget(null);
      loadIdeas();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete idea.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Ideas & Drafts"
      breadcrumb="Workspace / Ideas"
      action={
        <Link
          to="/ideas/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
          New Idea
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1 rounded-lg bg-surface-canvas p-1 border border-border-hairline">
            {(
              [
                { key: 'all', label: 'All Ideas' },
                { key: 'draft', label: 'Saved Drafts' },
                { key: 'submitted', label: 'Submitted' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? 'bg-brand-primary text-white'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-ink-muted tabular-nums">{ideas.length} items</p>
        </div>

        {loading && <SkeletonTable rows={5} />}
        {error && <ErrorState message={error} onRetry={loadIdeas} />}

        {!loading && !error && ideas.length === 0 && (
          <EmptyState
            icon={<Lightbulb className="h-5 w-5" aria-hidden="true" />}
            title={
              filter === 'draft'
                ? 'No saved drafts'
                : filter === 'submitted'
                  ? 'No submitted ideas yet'
                  : 'No business ideas yet'
            }
            description="Use the 5-step guided intake form to structure a business idea. Drafts autosave automatically so you can resume anytime."
            action={
              <Link
                to="/ideas/new"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors"
              >
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                Start New Idea
              </Link>
            }
          />
        )}

        {!loading && !error && ideas.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border-hairline bg-surface-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border-hairline bg-surface-subtle text-xs font-semibold text-ink-secondary">
                  <tr>
                    <th className="px-5 py-3">Idea Title</th>
                    <th className="px-5 py-3">Startup</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Last Updated</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline">
                  {ideas.map((idea) => (
                    <tr key={idea.id} className="hover:bg-surface-subtle/60 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-ink-primary">
                        <Link
                          to={
                            idea.status === 'draft'
                              ? `/ideas/${idea.id}/edit`
                              : `/ideas/${idea.id}`
                          }
                          className="hover:text-brand-primary"
                        >
                          {idea.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-ink-secondary">
                        {idea.startupName || 'Unassigned'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`text-xs font-medium ${
                            idea.status === 'submitted'
                              ? 'text-semantic-success'
                              : 'text-semantic-warning'
                          }`}
                        >
                          {idea.status === 'submitted'
                            ? 'Submitted'
                            : `Draft (Step ${idea.currentStep}/6)`}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-ink-muted tabular-nums">
                        {new Date(idea.updatedAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={
                              idea.status === 'draft'
                                ? `/ideas/${idea.id}/edit`
                                : `/ideas/${idea.id}`
                            }
                            className="rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle whitespace-nowrap"
                          >
                            {idea.status === 'draft' ? 'Resume Draft' : 'View'}
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(idea)}
                            aria-label={`Delete ${idea.title}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-hairline text-semantic-danger hover:bg-semantic-danger/5"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete idea?"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
