import {
  AlertCircle,
  ArrowUpDown,
  Edit3,
  ExternalLink,
  Plus,
  Search,
  Sparkles,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonTable,
} from '../../components/ui/States.tsx';
import {
  api,
  ApiClientError,
  type CompetitorDifferentiation,
  type CompetitorInput,
  type CompetitorRecord,
  type Idea,
  type ResearchSourceStatus,
} from '../../lib/api.ts';

function linesToArray(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function arrayToLines(arr: string[]): string {
  return arr.join('\n');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface CompetitorFormState {
  ideaId: string;
  name: string;
  website: string;
  description: string;
  pricing: string;
  featuresText: string;
  strengthsText: string;
  weaknessesText: string;
  notes: string;
  sourceUrl: string;
  researchedDate: string;
  sourceType: 'manual' | 'researched';
}

function emptyCompetitorForm(): CompetitorFormState {
  return {
    ideaId: '',
    name: '',
    website: '',
    description: '',
    pricing: '',
    featuresText: '',
    strengthsText: '',
    weaknessesText: '',
    notes: '',
    sourceUrl: '',
    researchedDate: '',
    sourceType: 'manual',
  };
}

function recordToForm(c: CompetitorRecord): CompetitorFormState {
  return {
    ideaId: c.ideaId ?? '',
    name: c.name,
    website: c.website,
    description: c.description,
    pricing: c.pricing,
    featuresText: arrayToLines(c.features),
    strengthsText: arrayToLines(c.strengths),
    weaknessesText: arrayToLines(c.weaknesses),
    notes: c.notes,
    sourceUrl: c.sourceUrl,
    researchedDate: c.researchedDate ? c.researchedDate.slice(0, 10) : '',
    sourceType: c.sourceType,
  };
}

type SortKey = 'name' | 'sourceType' | 'pricing' | 'researchedDate' | 'updatedAt';

export function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<CompetitorRecord[]>([]);
  const [differentiation, setDifferentiation] = useState<CompetitorDifferentiation | null>(null);
  const [sourceStatus, setSourceStatus] = useState<ResearchSourceStatus | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showManualForm, setShowManualForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompetitorFormState>(emptyCompetitorForm);
  const [saving, setSaving] = useState(false);

  const [showDiscover, setShowDiscover] = useState(false);
  const [discoverForm, setDiscoverForm] = useState({
    ideaId: '',
    industry: '',
    productOrService: '',
    location: '',
    targetCustomer: '',
  });
  const [discovering, setDiscovering] = useState(false);
  const [discoverBanner, setDiscoverBanner] = useState<{
    title: string;
    steps: string[];
  } | null>(null);

  const [generatingDiff, setGeneratingDiff] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompetitorRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [compRes, ideasRes] = await Promise.all([
        api.competitors.list(),
        api.ideas.list(undefined, 100, 0),
      ]);
      setCompetitors(compRes.items);
      setDifferentiation(compRes.differentiation);
      setSourceStatus(compRes.sourceStatus);
      setIdeas(ideasRes.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load competitors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedCompetitors = useMemo(() => {
    const copy = [...competitors];
    copy.sort((a, b) => {
      const av = String(a[sortKey] ?? '').toLowerCase();
      const bv = String(b[sortKey] ?? '').toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [competitors, sortKey, sortDir]);

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(emptyCompetitorForm());
    setShowManualForm(true);
    setShowDiscover(false);
  };

  const handleOpenEdit = (c: CompetitorRecord) => {
    setEditingId(c.id);
    setForm(recordToForm(c));
    setShowManualForm(true);
    setShowDiscover(false);
  };

  const handleSaveCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: CompetitorInput = {
      ideaId: form.ideaId || null,
      name: form.name,
      website: form.website,
      description: form.description,
      pricing: form.pricing,
      features: linesToArray(form.featuresText),
      strengths: linesToArray(form.strengthsText),
      weaknesses: linesToArray(form.weaknessesText),
      notes: form.notes,
      sourceUrl: form.sourceUrl,
      researchedDate: form.researchedDate || null,
      sourceType: form.sourceType,
      isDemo: false,
    };

    try {
      if (editingId) {
        const res = await api.competitors.update(editingId, payload);
        setCompetitors((prev) => prev.map((c) => (c.id === res.competitor.id ? res.competitor : c)));
        toast.success('Competitor updated.');
      } else {
        const res = await api.competitors.create(payload);
        setCompetitors((prev) => [res.competitor, ...prev]);
        toast.success('Competitor added.');
      }
      setShowManualForm(false);
      setEditingId(null);
      setForm(emptyCompetitorForm());
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to save competitor.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrefillDiscoverFromIdea = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) {
      setDiscoverForm((prev) => ({ ...prev, ideaId: '' }));
      return;
    }
    setDiscoverForm({
      ideaId: idea.id,
      industry: idea.businessDetails?.industry || 'Technology',
      productOrService:
        idea.problemSolution?.proposedSolution || idea.businessDetails?.oneLiner || idea.title,
      location: idea.targetCustomer?.geography || 'India',
      targetCustomer: idea.targetCustomer?.primarySegment || '',
    });
  };

  const handleDiscover = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiscovering(true);
    setDiscoverBanner(null);
    try {
      const res = await api.competitors.discover({
        ideaId: discoverForm.ideaId || null,
        industry: discoverForm.industry,
        productOrService: discoverForm.productOrService,
        location: discoverForm.location,
        targetCustomer: discoverForm.targetCustomer,
      });
      setCompetitors((prev) => [...res.items, ...prev]);
      setShowDiscover(false);
      toast.success(
        `Discovered ${res.items.length} competitor${res.items.length === 1 ? '' : 's'} (${
          res.researchMode === 'demo' ? 'DEMO DATA' : 'Sonar'
        }).`,
      );
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        (err.code === 'RESEARCH_NOT_CONFIGURED' || err.code === 'LLM_NOT_CONFIGURED')
      ) {
        const details = err.details as { setupSteps?: string[] } | undefined;
        setDiscoverBanner({
          title:
            err.code === 'RESEARCH_NOT_CONFIGURED'
              ? 'Research Sources: Not configured'
              : 'Gemini AI: Not configured',
          steps: details?.setupSteps ?? [err.message],
        });
      } else {
        toast.error(
          err instanceof ApiClientError ? err.message : 'Failed to discover competitors.',
        );
      }
    } finally {
      setDiscovering(false);
    }
  };

  const handleDifferentiate = async () => {
    setGeneratingDiff(true);
    setDiscoverBanner(null);
    try {
      const res = await api.competitors.differentiate();
      setDifferentiation(res.differentiation);
      toast.success('Differentiation opportunities updated.');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'LLM_NOT_CONFIGURED') {
        const details = err.details as { setupSteps?: string[] } | undefined;
        setDiscoverBanner({
          title: 'Gemini AI: Not configured',
          steps: details?.setupSteps ?? [err.message],
        });
      } else {
        toast.error(
          err instanceof ApiClientError
            ? err.message
            : 'Unable to generate differentiation opportunities.',
        );
      }
    } finally {
      setGeneratingDiff(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.competitors.delete(deleteTarget.id);
      setCompetitors((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Competitor deleted.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to delete competitor.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Competitor Analysis"
      breadcrumb="Workspace / Competitor Analysis"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowDiscover((prev) => !prev);
              setShowManualForm(false);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle transition-colors whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Discover competitors
          </button>
          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Competitor
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Source Mode Indicator */}
        {sourceStatus && (
          <div
            className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
              sourceStatus.researchMode === 'sonar'
                ? 'border-semantic-success/30 bg-semantic-success/5'
                : 'border-semantic-warning/35 bg-semantic-warning/5'
            }`}
          >
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-ink-primary">
                Competitor Discovery Source Mode: {sourceStatus.statusLabel}
              </p>
              <p className="text-xs text-ink-secondary">
                {sourceStatus.researchMode === 'sonar'
                  ? 'Perplexity Sonar is active for cited competitor discovery. Manual competitors remain available anytime.'
                  : sourceStatus.researchMode === 'demo'
                    ? 'DEMO_MODE=true is active. Discovered entries will carry a visible "DEMO DATA" badge.'
                    : 'SONAR_API_KEY and DEMO_MODE are off. You can add and compare manual competitors anytime; discovery requires Sonar or DEMO_MODE=true.'}
              </p>
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
        )}

        {discoverBanner && (
          <div
            role="alert"
            className="rounded-xl border border-semantic-danger/30 bg-semantic-danger/5 p-5 space-y-2"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <AlertCircle className="h-4 w-4 text-semantic-danger" aria-hidden="true" />
              <span>{discoverBanner.title}</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-ink-secondary">
              {discoverBanner.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Discover Competitors Drawer */}
        {showDiscover && (
          <form
            onSubmit={handleDiscover}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-ink-primary">
                  Discover Competitors ({sourceStatus?.statusLabel ?? 'Source Mode'})
                </h2>
                <p className="text-xs text-ink-secondary">
                  Uses the active research mode (Sonar live citations or DEMO DATA). Makes zero fabricated claims when Not configured.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {ideas.length > 0 && (
                  <select
                    aria-label="Pre-fill discovery from idea"
                    value={discoverForm.ideaId}
                    onChange={(e) => handlePrefillDiscoverFromIdea(e.target.value)}
                    className="h-9 rounded-lg border border-border-hairline bg-surface-subtle px-3 text-xs"
                  >
                    <option value="">Pre-fill from Idea (optional)</option>
                    {ideas.map((idea) => (
                      <option key={idea.id} value={idea.id}>
                        {idea.title}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setShowDiscover(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-hairline text-ink-secondary hover:bg-surface-subtle"
                  aria-label="Close discovery form"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Industry</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={discoverForm.industry}
                  onChange={(e) => setDiscoverForm((p) => ({ ...p, industry: e.target.value }))}
                  placeholder="e.g. Cold-chain food logistics"
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Location</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={discoverForm.location}
                  onChange={(e) => setDiscoverForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="e.g. India"
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Product or Service
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={discoverForm.productOrService}
                  onChange={(e) =>
                    setDiscoverForm((p) => ({ ...p, productOrService: e.target.value }))
                  }
                  placeholder="e.g. Automated FSSAI temperature compliance logbook"
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Target Customer (optional)
                </label>
                <input
                  type="text"
                  value={discoverForm.targetCustomer}
                  onChange={(e) =>
                    setDiscoverForm((p) => ({ ...p, targetCustomer: e.target.value }))
                  }
                  placeholder="e.g. Regional dairy warehouses"
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={discovering}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                {discovering ? 'Discovering...' : 'Discover competitors'}
              </button>
            </div>
          </form>
        )}

        {/* Manual Add / Edit Form */}
        {showManualForm && (
          <form
            onSubmit={handleSaveCompetitor}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border-hairline pb-3">
              <h2 className="font-display text-base font-bold text-ink-primary">
                {editingId ? 'Edit Competitor' : 'Add Competitor Manually'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowManualForm(false);
                  setEditingId(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-ink-secondary hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Competitor Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Website</label>
                <input
                  type="text"
                  placeholder="https://competitor.example"
                  value={form.website}
                  onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Pricing</label>
                <input
                  type="text"
                  placeholder="e.g. ₹2,500/mo per site"
                  value={form.pricing}
                  onChange={(e) => setForm((p) => ({ ...p, pricing: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Source Type
                </label>
                <select
                  value={form.sourceType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      sourceType: e.target.value as 'manual' | 'researched',
                    }))
                  }
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                >
                  <option value="manual">Manual</option>
                  <option value="researched">Researched</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Source URL
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.sourceUrl}
                  onChange={(e) => setForm((p) => ({ ...p, sourceUrl: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Researched Date
                </label>
                <input
                  type="date"
                  value={form.researchedDate}
                  onChange={(e) => setForm((p) => ({ ...p, researchedDate: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-2.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Features (one per line)
                </label>
                <textarea
                  rows={3}
                  value={form.featuresText}
                  onChange={(e) => setForm((p) => ({ ...p, featuresText: e.target.value }))}
                  className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Strengths (one per line)
                </label>
                <textarea
                  rows={3}
                  value={form.strengthsText}
                  onChange={(e) => setForm((p) => ({ ...p, strengthsText: e.target.value }))}
                  className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Weaknesses (one per line)
                </label>
                <textarea
                  rows={3}
                  value={form.weaknessesText}
                  onChange={(e) => setForm((p) => ({ ...p, weaknessesText: e.target.value }))}
                  className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-2.5 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Competitor'}
              </button>
            </div>
          </form>
        )}

        {loading && <SkeletonTable rows={4} />}

        {error && <ErrorState message={error} onRetry={() => void loadData()} />}

        {!loading && !error && competitors.length === 0 && (
          <EmptyState
            icon={<Swords className="h-5 w-5" aria-hidden="true" />}
            title="No competitors added yet"
            description="Add competitors manually or click Discover competitors (when Sonar or DEMO_MODE is active) to compare pricing, features, strengths, and weaknesses."
            action={
              <button
                type="button"
                onClick={handleOpenNew}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add First Competitor
              </button>
            }
          />
        )}

        {/* Sortable, Horizontally Scrollable Comparison Table */}
        {!loading && !error && competitors.length > 0 && (
          <section className="rounded-xl border border-border-hairline bg-surface-canvas overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline px-5 py-3.5">
              <div>
                <h2 className="font-display text-sm font-bold text-ink-primary">
                  Competitor Comparison Matrix ({competitors.length})
                </h2>
                <p className="text-xs text-ink-muted">
                  Click column headers to sort. Scroll horizontally to inspect full feature, strength, and weakness columns.
                </p>
              </div>
              <button
                type="button"
                disabled={generatingDiff}
                onClick={() => void handleDifferentiate()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-primary/35 bg-brand-primary/5 px-3 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10 transition-colors disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {generatingDiff ? 'Analyzing Gaps...' : 'Analyze Differentiation'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-left text-xs">
                <thead className="bg-surface-subtle text-ink-secondary border-b border-border-hairline">
                  <tr>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Competitor
                        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort('sourceType')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Source Type
                        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort('pricing')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Pricing
                        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Features</th>
                    <th className="px-4 py-3 font-semibold">Strengths</th>
                    <th className="px-4 py-3 font-semibold">Weaknesses</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort('researchedDate')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Source & Date
                        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline align-top">
                  {sortedCompetitors.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-subtle/60 transition-colors">
                      <td className="px-4 py-3.5 min-w-[170px]">
                        <p className="font-semibold text-ink-primary">{c.name}</p>
                        {c.website && (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline break-all"
                          >
                            {c.website}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap space-y-1">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            c.sourceType === 'researched'
                              ? 'border-semantic-success/35 bg-semantic-success/10 text-semantic-success'
                              : 'border-border-hairline bg-surface-subtle text-ink-secondary'
                          }`}
                        >
                          {c.sourceType === 'researched' ? 'Researched' : 'Manual'}
                        </span>
                        {c.isDemo && (
                          <div>
                            <span className="inline-block rounded-md border border-semantic-warning/40 bg-semantic-warning/10 px-2 py-0.5 text-[10px] font-bold text-semantic-warning">
                              DEMO DATA
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 min-w-[130px] text-ink-primary tabular-nums">
                        {c.pricing || '—'}
                      </td>
                      <td className="px-4 py-3.5 min-w-[190px] text-ink-secondary leading-relaxed">
                        {c.description || '—'}
                      </td>
                      <td className="px-4 py-3.5 min-w-[160px]">
                        {c.features.length > 0 ? (
                          <ul className="list-disc list-inside space-y-0.5 text-ink-primary">
                            {c.features.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 min-w-[160px]">
                        {c.strengths.length > 0 ? (
                          <ul className="list-disc list-inside space-y-0.5 text-ink-primary">
                            {c.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 min-w-[160px]">
                        {c.weaknesses.length > 0 ? (
                          <ul className="list-disc list-inside space-y-0.5 text-ink-primary">
                            {c.weaknesses.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 min-w-[150px] text-ink-secondary">
                        {c.notes || '—'}
                      </td>
                      <td className="px-4 py-3.5 min-w-[170px] space-y-1">
                        <p className="text-[11px] text-ink-muted tabular-nums">
                          {formatDate(c.researchedDate)}
                        </p>
                        {c.sourceUrl && (
                          <a
                            href={c.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline break-all"
                          >
                            Source
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(c)}
                            aria-label={`Edit ${c.name}`}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-hairline px-2.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
                          >
                            <Edit3 className="h-3 w-3" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            aria-label={`Delete ${c.name}`}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-semantic-danger/30 px-2.5 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Differentiation Opportunities ("AI interpretation") */}
        <section className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-ink-primary">
                Differentiation Opportunities
              </h3>
            </div>
            <span className="rounded-md border border-brand-primary/30 bg-brand-primary/5 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">
              AI interpretation
            </span>
          </div>

          {differentiation && differentiation.opportunities.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {differentiation.opportunities.map((opp, idx) => (
                <div
                  key={`${opp.title}-${idx}`}
                  className="rounded-lg border border-border-hairline bg-surface-subtle p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink-primary">{opp.title}</h4>
                    <span className="shrink-0 rounded-md border border-brand-primary/30 bg-surface-canvas px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
                      {opp.evidenceLabel}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-secondary">{opp.rationale}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              Add or discover competitors above, then click &ldquo;Analyze Differentiation&rdquo; to synthesize positioning gaps labelled as AI interpretation.
            </p>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete competitor?"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}" from your comparison matrix?`
            : ''
        }
        confirmLabel="Delete Competitor"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
