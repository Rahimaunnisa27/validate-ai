import {
  AlertCircle,
  Check,
  Edit3,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '../../components/ui/States.tsx';
import {
  api,
  ApiClientError,
  type CustomerPersona,
  type Idea,
} from '../../lib/api.ts';
import { PERSONA_DISCLAIMER } from '../../shared/phase3aSchemas.ts';

function arrayToLines(items: string[]): string {
  return items.join('\n');
}

function linesToArray(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length >= 2);
}

interface PersonaFormState {
  ideaId: string;
  idea: string;
  industry: string;
  product: string;
  location: string;
  problem: string;
}

function emptyGeneratorForm(): PersonaFormState {
  return {
    ideaId: '',
    idea: '',
    industry: '',
    product: '',
    location: '',
    problem: '',
  };
}

interface PersonaEditState {
  name: string;
  idea: string;
  industry: string;
  product: string;
  location: string;
  problem: string;
  segment: string;
  needsText: string;
  painPointsText: string;
  motivationsText: string;
  objectionsText: string;
  preferredChannelsText: string;
  purchaseConsiderationsText: string;
}

function personaToEditState(p: CustomerPersona): PersonaEditState {
  return {
    name: p.name,
    idea: p.idea,
    industry: p.industry,
    product: p.product,
    location: p.location,
    problem: p.problem,
    segment: p.segment,
    needsText: arrayToLines(p.needs),
    painPointsText: arrayToLines(p.painPoints),
    motivationsText: arrayToLines(p.motivations),
    objectionsText: arrayToLines(p.objections),
    preferredChannelsText: arrayToLines(p.preferredChannels),
    purchaseConsiderationsText: arrayToLines(p.purchaseConsiderations),
  };
}

export function PersonasPage() {
  const [personas, setPersonas] = useState<CustomerPersona[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(true);
  const [genForm, setGenForm] = useState<PersonaFormState>(emptyGeneratorForm);
  const [generating, setGenerating] = useState(false);
  const [notConfiguredSteps, setNotConfiguredSteps] = useState<string[] | null>(null);

  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<PersonaEditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CustomerPersona | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [personasRes, ideasRes] = await Promise.all([
        api.personas.list(),
        api.ideas.list(undefined, 100, 0),
      ]);
      setPersonas(personasRes.items);
      setIdeas(ideasRes.items);
      if (personasRes.items.length > 0) {
        setSelectedId((prev) => prev ?? personasRes.items[0].id);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to load customer personas.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedPersona = personas.find((p) => p.id === selectedId) ?? null;

  const handlePrefillFromIdea = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) {
      setGenForm((prev) => ({ ...prev, ideaId: '' }));
      return;
    }
    setGenForm({
      ideaId: idea.id,
      idea: idea.businessDetails?.oneLiner || idea.title,
      industry: idea.businessDetails?.industry || 'Technology',
      product: idea.problemSolution?.proposedSolution || idea.title,
      location: idea.targetCustomer?.geography || 'India',
      problem:
        idea.problemSolution?.problemStatement ||
        'Customers struggle with manual operational workflows and costly errors.',
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setNotConfiguredSteps(null);
    try {
      const res = await api.personas.generate({
        ideaId: genForm.ideaId || null,
        idea: genForm.idea,
        industry: genForm.industry,
        product: genForm.product,
        location: genForm.location,
        problem: genForm.problem,
      });
      setPersonas((prev) => [res.persona, ...prev]);
      setSelectedId(res.persona.id);
      setEditing(false);
      setShowGenerator(false);
      toast.success('Customer persona generated and saved.');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'LLM_NOT_CONFIGURED') {
        const details = err.details as { setupSteps?: string[] } | undefined;
        setNotConfiguredSteps(
          details?.setupSteps ?? [
            'Add GEMINI_API_KEY in AI Studio Settings > Secrets.',
            'Restart the server so the secret is loaded.',
          ],
        );
      } else {
        toast.error(
          err instanceof ApiClientError ? err.message : 'Failed to generate customer persona.',
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleStartEdit = () => {
    if (!selectedPersona) return;
    setEditState(personaToEditState(selectedPersona));
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPersona || !editState) return;
    setSavingEdit(true);
    try {
      const res = await api.personas.update(selectedPersona.id, {
        name: editState.name,
        idea: editState.idea,
        industry: editState.industry,
        product: editState.product,
        location: editState.location,
        problem: editState.problem,
        segment: editState.segment,
        needs: linesToArray(editState.needsText),
        painPoints: linesToArray(editState.painPointsText),
        motivations: linesToArray(editState.motivationsText),
        objections: linesToArray(editState.objectionsText),
        preferredChannels: linesToArray(editState.preferredChannelsText),
        purchaseConsiderations: linesToArray(editState.purchaseConsiderationsText),
      });
      setPersonas((prev) => prev.map((p) => (p.id === res.persona.id ? res.persona : p)));
      setEditing(false);
      setEditState(null);
      toast.success('Customer persona updated.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to update persona.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.personas.delete(deleteTarget.id);
      const remaining = personas.filter((p) => p.id !== deleteTarget.id);
      setPersonas(remaining);
      if (selectedId === deleteTarget.id) {
        setSelectedId(remaining[0]?.id ?? null);
        setEditing(false);
      }
      setDeleteTarget(null);
      toast.success('Customer persona deleted.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to delete persona.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Customer Personas"
      breadcrumb="Workspace / Customer Personas"
      action={
        <button
          type="button"
          onClick={() => {
            setShowGenerator((prev) => !prev);
            setEditing(false);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {showGenerator ? 'Hide Generator' : 'Generate Persona'}
        </button>
      }
    >
      <div className="space-y-6">
        {/* Mandatory Fixed Hypothesis Disclaimer */}
        <div className="rounded-xl border border-semantic-warning/35 bg-semantic-warning/5 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-ink-primary">
            {PERSONA_DISCLAIMER}
          </p>
          <span className="shrink-0 rounded-md border border-semantic-warning/40 bg-surface-canvas px-2 py-0.5 text-[11px] font-semibold text-semantic-warning">
            Hypothesis
          </span>
        </div>

        {/* Gemini Not Configured Banner (No Fake Fallback) */}
        {notConfiguredSteps && (
          <div
            role="alert"
            className="rounded-xl border border-semantic-danger/30 bg-semantic-danger/5 p-5 space-y-2"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <AlertCircle className="h-4 w-4 text-semantic-danger" aria-hidden="true" />
              <span>Gemini AI: Not configured</span>
            </div>
            <p className="text-xs text-ink-secondary">
              Persona generation requires a configured Gemini API key. Follow these steps:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-ink-secondary">
              {notConfiguredSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Link
              to="/integrations"
              className="inline-block text-xs font-medium text-brand-primary hover:underline pt-1"
            >
              View Integration Status
            </Link>
          </div>
        )}

        {/* Generator Form */}
        {showGenerator && (
          <form
            onSubmit={handleGenerate}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-ink-primary">
                  Generate Customer Persona Hypothesis
                </h2>
                <p className="text-xs text-ink-secondary">
                  Provide your target product, location, and core customer problem to draft a structured buyer persona.
                </p>
              </div>

              {ideas.length > 0 && (
                <div className="min-w-[220px]">
                  <select
                    aria-label="Pre-fill from saved idea"
                    value={genForm.ideaId}
                    onChange={(e) => handlePrefillFromIdea(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border-hairline bg-surface-subtle px-3 text-xs text-ink-primary"
                  >
                    <option value="">Pre-fill from an Idea (optional)</option>
                    {ideas.map((idea) => (
                      <option key={idea.id} value={idea.id}>
                        {idea.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p-idea" className="block text-xs font-medium text-ink-primary mb-1">
                  Idea Summary
                </label>
                <input
                  id="p-idea"
                  type="text"
                  required
                  minLength={3}
                  placeholder="e.g. Automated FSSAI Cold-Chain Logbook"
                  value={genForm.idea}
                  onChange={(e) => setGenForm((p) => ({ ...p, idea: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="p-industry"
                  className="block text-xs font-medium text-ink-primary mb-1"
                >
                  Industry
                </label>
                <input
                  id="p-industry"
                  type="text"
                  required
                  minLength={2}
                  placeholder="e.g. Cold-chain logistics & food safety"
                  value={genForm.industry}
                  onChange={(e) => setGenForm((p) => ({ ...p, industry: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="p-product"
                  className="block text-xs font-medium text-ink-primary mb-1"
                >
                  Product
                </label>
                <input
                  id="p-product"
                  type="text"
                  required
                  minLength={3}
                  placeholder="e.g. IoT temperature sensors + WhatsApp alert compliance dashboard"
                  value={genForm.product}
                  onChange={(e) => setGenForm((p) => ({ ...p, product: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="p-location"
                  className="block text-xs font-medium text-ink-primary mb-1"
                >
                  Location / Geography
                </label>
                <input
                  id="p-location"
                  type="text"
                  required
                  minLength={2}
                  placeholder="e.g. Tier-1 & Tier-2 cities across India"
                  value={genForm.location}
                  onChange={(e) => setGenForm((p) => ({ ...p, location: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm text-ink-primary"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="p-problem"
                className="block text-xs font-medium text-ink-primary mb-1"
              >
                Core Customer Problem
              </label>
              <textarea
                id="p-problem"
                required
                minLength={10}
                rows={3}
                placeholder="Describe the workflow bottleneck, pain, or compliance failure customers experience today..."
                value={genForm.problem}
                onChange={(e) => setGenForm((p) => ({ ...p, problem: e.target.value }))}
                className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-sm text-ink-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={generating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {generating ? 'Generating Persona...' : 'Generate & Save Persona'}
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SkeletonCard rows={4} />
            <SkeletonCard rows={4} />
            <SkeletonCard rows={4} />
          </div>
        )}

        {error && <ErrorState message={error} onRetry={() => void loadData()} />}

        {!loading && !error && personas.length === 0 && (
          <EmptyState
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            title="No customer personas saved yet"
            description="Generate your first customer persona hypothesis above to inspect needs, pain points, objections, and preferred channels."
          />
        )}

        {!loading && !error && personas.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left List */}
            <aside className="lg:col-span-4 space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted px-1">
                Saved Personas ({personas.length})
              </h3>
              <div className="space-y-2">
                {personas.map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id);
                        setEditing(false);
                        setEditState(null);
                      }}
                      className={`w-full text-left rounded-xl border p-4 transition-colors ${
                        active
                          ? 'border-brand-primary bg-brand-primary/5'
                          : 'border-border-hairline bg-surface-canvas hover:bg-surface-subtle'
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-ink-primary">{p.name}</p>
                      <p className="mt-1 truncate text-xs text-ink-secondary">
                        {p.industry} · {p.location}
                      </p>
                      <p className="mt-1.5 text-[11px] text-semantic-warning font-medium">
                        {p.disclaimer}
                      </p>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Right Detail / Edit Panel */}
            {selectedPersona && (
              <section className="lg:col-span-8 rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-5">
                {!editing ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-hairline pb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg font-bold text-ink-primary">
                            {selectedPersona.name}
                          </h3>
                          <span className="rounded-md border border-border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                            {selectedPersona.industry}
                          </span>
                          <span className="rounded-md border border-border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                            {selectedPersona.location}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          Idea: {selectedPersona.idea}
                          {selectedPersona.ideaTitle
                            ? ` (Linked: ${selectedPersona.ideaTitle})`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(selectedPersona)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-semantic-danger/30 px-3 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-semantic-warning/35 bg-semantic-warning/5 px-3.5 py-2.5 text-xs font-medium text-ink-primary">
                      {selectedPersona.disclaimer}
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Target Segment
                      </h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-primary">
                        {selectedPersona.segment}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {(
                        [
                          ['Needs', selectedPersona.needs],
                          ['Pain Points', selectedPersona.painPoints],
                          ['Motivations', selectedPersona.motivations],
                          ['Objections', selectedPersona.objections],
                          ['Preferred Channels', selectedPersona.preferredChannels],
                          ['Purchase Considerations', selectedPersona.purchaseConsiderations],
                        ] as const
                      ).map(([label, items]) => (
                        <div
                          key={label}
                          className="rounded-lg border border-border-hairline bg-surface-subtle p-4"
                        >
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                            {label}
                          </h4>
                          <ul className="mt-2 space-y-1.5 text-xs text-ink-primary list-disc list-inside">
                            {items.map((item, idx) => (
                              <li key={`${label}-${idx}`} className="leading-relaxed">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  editState && (
                    <form onSubmit={handleSaveEdit} className="space-y-4">
                      <div className="flex items-center justify-between border-b border-border-hairline pb-3">
                        <h3 className="font-display text-base font-bold text-ink-primary">
                          Edit Persona Details
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(false);
                            setEditState(null);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-ink-secondary hover:text-ink-primary"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Cancel
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-ink-primary mb-1">
                            Persona Name
                          </label>
                          <input
                            type="text"
                            required
                            value={editState.name}
                            onChange={(e) =>
                              setEditState((s) => (s ? { ...s, name: e.target.value } : s))
                            }
                            className="w-full h-9 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-primary mb-1">
                            Industry
                          </label>
                          <input
                            type="text"
                            required
                            value={editState.industry}
                            onChange={(e) =>
                              setEditState((s) => (s ? { ...s, industry: e.target.value } : s))
                            }
                            className="w-full h-9 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-primary mb-1">
                            Location
                          </label>
                          <input
                            type="text"
                            required
                            value={editState.location}
                            onChange={(e) =>
                              setEditState((s) => (s ? { ...s, location: e.target.value } : s))
                            }
                            className="w-full h-9 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-primary mb-1">
                            Product
                          </label>
                          <input
                            type="text"
                            required
                            value={editState.product}
                            onChange={(e) =>
                              setEditState((s) => (s ? { ...s, product: e.target.value } : s))
                            }
                            className="w-full h-9 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-ink-primary mb-1">
                          Segment
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={editState.segment}
                          onChange={(e) =>
                            setEditState((s) => (s ? { ...s, segment: e.target.value } : s))
                          }
                          className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-2.5 text-sm"
                        />
                      </div>

                      <p className="text-[11px] text-ink-muted">
                        Enter one bullet item per line for each list below.
                      </p>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {(
                          [
                            ['Needs', 'needsText'],
                            ['Pain Points', 'painPointsText'],
                            ['Motivations', 'motivationsText'],
                            ['Objections', 'objectionsText'],
                            ['Preferred Channels', 'preferredChannelsText'],
                            ['Purchase Considerations', 'purchaseConsiderationsText'],
                          ] as const
                        ).map(([label, field]) => (
                          <div key={field}>
                            <label className="block text-xs font-medium text-ink-primary mb-1">
                              {label}
                            </label>
                            <textarea
                              rows={4}
                              required
                              value={editState[field]}
                              onChange={(e) =>
                                setEditState((s) =>
                                  s ? { ...s, [field]: e.target.value } : s,
                                )
                              }
                              className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-2.5 text-xs"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(false);
                            setEditState(null);
                          }}
                          className="h-9 rounded-lg border border-border-hairline px-3.5 text-xs font-medium text-ink-primary hover:bg-surface-subtle"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingEdit}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-4 text-xs font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          {savingEdit ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  )
                )}
              </section>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete customer persona?"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}"? This removes the saved persona from your workspace.`
            : ''
        }
        confirmLabel="Delete Persona"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
