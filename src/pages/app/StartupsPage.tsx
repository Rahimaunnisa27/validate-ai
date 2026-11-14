import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase, ExternalLink, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import { AppShell } from '../../components/app/AppShell.tsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonTable,
} from '../../components/ui/States.tsx';
import { api, ApiClientError, type Startup } from '../../lib/api.ts';
import { STARTUP_STAGES, startupSchema } from '../../shared/schemas.ts';

type StartupFormValues = z.input<typeof startupSchema>;

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea Stage',
  mvp: 'MVP / Prototype',
  early_revenue: 'Early Revenue',
  growth: 'Growth',
};

export function StartupsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Startup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Startup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StartupFormValues>({
    resolver: zodResolver(startupSchema),
    defaultValues: {
      name: '',
      tagline: '',
      industry: '',
      stage: 'idea',
      location: 'India',
      website: '',
      description: '',
    },
  });

  const loadStartups = useCallback(() => {
    setLoading(true);
    setError(null);
    api.startups
      .list()
      .then((res) => setStartups(res.items))
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Unable to load startups.'),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadStartups();
  }, [loadStartups]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreateModal();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    setEditing(null);
    reset({
      name: '',
      tagline: '',
      industry: '',
      stage: 'idea',
      location: 'India',
      website: '',
      description: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (st: Startup) => {
    setEditing(st);
    reset({
      name: st.name,
      tagline: st.tagline,
      industry: st.industry,
      stage: st.stage,
      location: st.location,
      website: st.website,
      description: st.description,
    });
    setModalOpen(true);
  };

  const onSubmit = async (values: StartupFormValues) => {
    try {
      if (editing) {
        await api.startups.update(editing.id, values);
        toast.success('Startup updated.');
      } else {
        await api.startups.create(values);
        toast.success('Startup created.');
      }
      setModalOpen(false);
      loadStartups();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to save startup.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.startups.delete(deleteTarget.id);
      toast.success('Startup deleted.');
      setDeleteTarget(null);
      loadStartups();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete startup.');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return startups;
    return startups.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.industry.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q),
    );
  }, [startups, search]);

  return (
    <AppShell
      title="Startups"
      breadcrumb="Workspace / Startups"
      action={
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New Startup
        </button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm w-full">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search startups by name, industry, location..."
              aria-label="Search startups"
              className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas pl-9 pr-3 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
          <p className="text-xs text-ink-muted tabular-nums">
            Showing {filtered.length} of {startups.length} startups
          </p>
        </div>

        {loading && <SkeletonTable rows={4} />}
        {error && <ErrorState message={error} onRetry={loadStartups} />}

        {!loading && !error && startups.length === 0 && (
          <EmptyState
            icon={<Briefcase className="h-5 w-5" aria-hidden="true" />}
            title="No startups yet"
            description="Create your first startup profile to group business ideas, market research, and financial models."
            action={
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Startup
              </button>
            }
          />
        )}

        {!loading && !error && startups.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={<Search className="h-5 w-5" aria-hidden="true" />}
            title="No matching startups"
            description="Try a different search term or clear your filter."
            action={
              <button
                type="button"
                onClick={() => setSearch('')}
                className="rounded-lg border border-border-hairline px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-canvas"
              >
                Clear Search
              </button>
            }
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((st) => (
              <div
                key={st.id}
                className="rounded-xl border border-border-hairline bg-surface-canvas p-6 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-ink-primary">
                        {st.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {st.industry} · {STAGE_LABELS[st.stage] || st.stage} · {st.location}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-brand-primary tabular-nums">
                      {st.ideasCount} {st.ideasCount === 1 ? 'idea' : 'ideas'}
                    </span>
                  </div>

                  {st.tagline && (
                    <p className="mt-3 text-sm font-medium text-ink-primary">{st.tagline}</p>
                  )}
                  {st.description && (
                    <p className="mt-1.5 text-sm text-ink-secondary line-clamp-2">
                      {st.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border-hairline pt-4">
                  <div>
                    {st.website ? (
                      <a
                        href={st.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
                      >
                        Website
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-xs text-ink-muted">No website added</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(st)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(st)}
                      aria-label={`Delete ${st.name}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="startup-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-border-hairline bg-surface-canvas p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-border-hairline">
              <h2 id="startup-modal-title" className="text-lg font-semibold text-ink-primary">
                {editing ? 'Edit Startup' : 'Create Startup'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-subtle"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
              <div>
                <label htmlFor="st-name" className="block text-sm font-medium text-ink-primary">
                  Startup Name *
                </label>
                <input
                  id="st-name"
                  type="text"
                  {...register('name')}
                  className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  placeholder="e.g., FreshGrid ColdChain"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-semantic-danger">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="st-industry"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Industry *
                  </label>
                  <input
                    id="st-industry"
                    type="text"
                    {...register('industry')}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="e.g., Logistics SaaS"
                  />
                  {errors.industry && (
                    <p className="mt-1 text-xs text-semantic-danger">{errors.industry.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="st-stage" className="block text-sm font-medium text-ink-primary">
                    Current Stage *
                  </label>
                  <select
                    id="st-stage"
                    {...register('stage')}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  >
                    {STARTUP_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {STAGE_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="st-location"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Location
                  </label>
                  <input
                    id="st-location"
                    type="text"
                    {...register('location')}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="Bengaluru, India"
                  />
                </div>

                <div>
                  <label
                    htmlFor="st-website"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Website (optional)
                  </label>
                  <input
                    id="st-website"
                    type="url"
                    {...register('website')}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="https://example.in"
                  />
                  {errors.website && (
                    <p className="mt-1 text-xs text-semantic-danger">{errors.website.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="st-tagline" className="block text-sm font-medium text-ink-primary">
                  One-line Tagline
                </label>
                <input
                  id="st-tagline"
                  type="text"
                  {...register('tagline')}
                  className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  placeholder="Automated cold-storage compliance for food distributors"
                />
              </div>

              <div>
                <label
                  htmlFor="st-description"
                  className="block text-sm font-medium text-ink-primary"
                >
                  Description
                </label>
                <textarea
                  id="st-description"
                  rows={3}
                  {...register('description')}
                  className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  placeholder="Brief overview of what this venture is building..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-border-hairline px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-60"
                >
                  {isSubmitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Startup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete startup?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Ideas linked to it will remain in your Ideas list unlinked.`}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
