import {
  AlertCircle,
  Copy,
  Handshake,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  type Idea,
  type SalesPlaybookRecord,
} from '../../lib/api.ts';
import {
  SALES_DRAFT_NOTICE,
  type SalesPlaybookJson,
} from '../../shared/phase4Schemas.ts';

export function SalesPage() {
  const [playbooks, setPlaybooks] = useState<SalesPlaybookRecord[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [llmSetupSteps, setLlmSetupSteps] = useState<string[] | null>(null);

  const [ideaId, setIdeaId] = useState('');
  const [title, setTitle] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [targetCustomer, setTargetCustomer] = useState('');
  const [pricePoint, setPricePoint] = useState('INR 2,500/month');
  const [salesChannel, setSalesChannel] = useState('Founder-led outbound + WhatsApp demo');
  const [valueProposition, setValueProposition] = useState('');
  const [tone, setTone] = useState('Consultative and direct');

  // Fully editable working draft copy of the selected playbook
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPlaybook, setDraftPlaybook] = useState<SalesPlaybookJson | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalesPlaybookRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const syncDraftFromRecord = useCallback((rec: SalesPlaybookRecord | null) => {
    if (!rec) {
      setDraftTitle('');
      setDraftPlaybook(null);
      return;
    }
    setDraftTitle(rec.title);
    setDraftPlaybook(structuredClone(rec.playbook));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesRes, ideasRes] = await Promise.all([
        api.sales.list(),
        api.ideas.list(undefined, 100, 0),
      ]);
      setPlaybooks(salesRes.items);
      setIdeas(ideasRes.items);
      if (salesRes.items.length > 0) {
        const first = salesRes.items[0];
        setSelectedId((prev) => {
          const targetId = prev ?? first.id;
          const match = salesRes.items.find((p) => p.id === targetId) ?? first;
          syncDraftFromRecord(match);
          return match.id;
        });
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load sales playbooks.');
    } finally {
      setLoading(false);
    }
  }, [syncDraftFromRecord]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePrefillFromIdea = (id: string) => {
    setIdeaId(id);
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    setTitle(`${idea.title} Sales Playbook`);
    setProductDescription(
      idea.problemSolution?.proposedSolution || idea.businessDetails?.oneLiner || idea.title,
    );
    setTargetCustomer(idea.targetCustomer?.primarySegment || '');
    setValueProposition(
      idea.problemSolution?.uniqueValueProposition ||
        idea.problemSolution?.problemStatement ||
        '',
    );
    if (idea.financials?.pricePerUnitInr) {
      setPricePoint(`INR ${idea.financials.pricePerUnitInr.toLocaleString('en-IN')}`);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setLlmSetupSteps(null);
    try {
      const res = await api.sales.generate({
        ideaId: ideaId || null,
        title: title.trim(),
        productDescription,
        targetCustomer,
        pricePoint,
        salesChannel,
        valueProposition,
        tone,
      });
      setPlaybooks((prev) => [res.playbook, ...prev]);
      setSelectedId(res.playbook.id);
      syncDraftFromRecord(res.playbook);
      setShowForm(false);
      toast.success('Sales playbook and editable drafts saved.');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'LLM_NOT_CONFIGURED') {
        const details = err.details as { setupSteps?: string[] } | undefined;
        setLlmSetupSteps(
          details?.setupSteps ?? [
            'Add GEMINI_API_KEY in Settings > Secrets.',
            'Restart the server so the key is loaded.',
          ],
        );
      } else {
        toast.error(
          err instanceof ApiClientError ? err.message : 'Unable to generate sales playbook.',
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  const selectedRecord = playbooks.find((p) => p.id === selectedId) ?? null;

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord || !draftPlaybook) return;
    setSaving(true);
    try {
      const res = await api.sales.update(selectedRecord.id, {
        title: draftTitle,
        ideaId: selectedRecord.ideaId,
        inputs: {
          ...selectedRecord.inputs,
          title: draftTitle,
        },
        playbook: {
          ...draftPlaybook,
          title: draftTitle,
        },
      });
      setPlaybooks((prev) => prev.map((p) => (p.id === res.playbook.id ? res.playbook : p)));
      syncDraftFromRecord(res.playbook);
      toast.success('All sales playbook edits saved.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to save playbook edits.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label} to clipboard.`);
    } catch {
      toast.error('Clipboard copy failed — select and copy text manually.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.sales.delete(deleteTarget.id);
      const remaining = playbooks.filter((p) => p.id !== deleteTarget.id);
      setPlaybooks(remaining);
      if (selectedId === deleteTarget.id) {
        const next = remaining[0] ?? null;
        setSelectedId(next?.id ?? null);
        syncDraftFromRecord(next);
      }
      setDeleteTarget(null);
      toast.success('Sales playbook deleted.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to delete playbook.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Sales Assistant"
      breadcrumb="Workspace / Sales Assistant"
      action={
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {showForm ? 'Hide Generator' : 'New Playbook'}
        </button>
      }
    >
      <div className="space-y-6">
        {/* Visible Non-Sending Safety Banner */}
        <div className="rounded-xl border border-semantic-warning/35 bg-semantic-warning/5 p-4 flex items-start gap-3">
          <ShieldAlert className="h-4 w-4 text-semantic-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-ink-primary space-y-0.5">
            <p className="font-semibold">{SALES_DRAFT_NOTICE}</p>
            <p className="text-ink-secondary">
              Every strategy block, pitch, outreach draft, and follow-up message below is editable text with Copy and Save buttons. VenturePilot never dispatches emails or messages on your behalf.
            </p>
          </div>
        </div>

        {llmSetupSteps && (
          <div className="rounded-xl border border-semantic-warning/40 bg-semantic-warning/5 p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <AlertCircle className="h-4 w-4 text-semantic-warning" aria-hidden="true" />
              Gemini AI is Not Configured
            </div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-ink-secondary">
              {llmSetupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={(e) => void handleGenerate(e)}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4"
          >
            <h2 className="font-display text-base font-bold text-ink-primary">
              Generate Editable Sales Strategy &amp; Outreach Drafts
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Pre-fill from Saved Idea (Optional)
                </label>
                <select
                  value={ideaId}
                  onChange={(e) => handlePrefillFromIdea(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                >
                  <option value="">Enter manually</option>
                  {ideas.map((idea) => (
                    <option key={idea.id} value={idea.id}>
                      {idea.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Playbook Title (Optional)
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cold-Chain B2B Outbound Playbook"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Product Description *
                </label>
                <textarea
                  required
                  minLength={10}
                  rows={3}
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="What does your product do and how is it delivered?"
                  className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Core Value Proposition *
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={valueProposition}
                  onChange={(e) => setValueProposition(e.target.value)}
                  placeholder="Why should customers switch from their current workflow?"
                  className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Target Customer *
                </label>
                <input
                  required
                  value={targetCustomer}
                  onChange={(e) => setTargetCustomer(e.target.value)}
                  placeholder="e.g. Operations managers"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Price Point *
                </label>
                <input
                  required
                  value={pricePoint}
                  onChange={(e) => setPricePoint(e.target.value)}
                  placeholder="e.g. INR 2,500/month"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Sales Channel *
                </label>
                <input
                  required
                  value={salesChannel}
                  onChange={(e) => setSalesChannel(e.target.value)}
                  placeholder="e.g. Founder-led demo calls"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Tone</label>
                <input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="Consultative and direct"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {generating ? 'Generating Playbook...' : 'Generate Sales Playbook'}
              </button>
            </div>
          </form>
        )}

        {loading && <SkeletonCard rows={4} />}
        {error && <ErrorState message={error} onRetry={() => void loadData()} />}

        {!loading && !error && playbooks.length === 0 && (
          <EmptyState
            icon={<Handshake className="h-5 w-5" aria-hidden="true" />}
            title="No sales playbooks saved yet"
            description="Generate your first sales strategy, pitch, pricing framing, and editable outreach/follow-up drafts above."
          />
        )}

        {!loading && !error && playbooks.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Saved Playbooks Sidebar */}
            <aside className="lg:col-span-4 space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Saved Playbooks ({playbooks.length})
              </h3>
              <div className="space-y-2">
                {playbooks.map((pb) => {
                  const active = pb.id === selectedId;
                  return (
                    <button
                      key={pb.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(pb.id);
                        syncDraftFromRecord(pb);
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                        active
                          ? 'border-brand-primary bg-brand-primary/5'
                          : 'border-border-hairline bg-surface-canvas hover:bg-surface-subtle'
                      }`}
                    >
                      <p className="text-sm font-semibold text-ink-primary leading-snug">
                        {pb.title}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted truncate">
                        {pb.inputs.pricePoint} · {pb.inputs.salesChannel}
                      </p>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Editable Playbook Workspace */}
            {selectedRecord && draftPlaybook && (
              <form
                onSubmit={(e) => void handleSaveChanges(e)}
                className="lg:col-span-8 rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-[11px] font-medium text-ink-muted mb-1">
                      Playbook Title (Editable)
                    </label>
                    <input
                      required
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border-hairline bg-surface-subtle px-3 text-sm font-bold text-ink-primary"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-brand-primary/35 bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">
                      {selectedRecord.evidenceLabel}
                    </span>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50 whitespace-nowrap"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selectedRecord)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-semantic-danger/30 px-3 text-xs font-medium text-semantic-danger hover:bg-semantic-danger/5"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Editable Strategy Blocks */}
                {(
                  [
                    ['salesStrategy', 'Sales Strategy'],
                    ['pitch', 'Pitch & Opener'],
                    ['productPositioning', 'Product Positioning'],
                    ['pricingSuggestions', 'Pricing Suggestions'],
                    ['funnelRecommendations', 'Funnel Recommendations'],
                  ] as const
                ).map(([fieldKey, label]) => (
                  <div key={fieldKey} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                        {label}
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleCopyText(label, draftPlaybook[fieldKey])}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border-hairline px-2.5 text-[11px] font-medium text-ink-primary hover:bg-surface-subtle"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Copy
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={draftPlaybook[fieldKey]}
                      onChange={(e) =>
                        setDraftPlaybook({ ...draftPlaybook, [fieldKey]: e.target.value })
                      }
                      className="w-full rounded-lg border border-border-hairline bg-surface-subtle p-3 text-xs leading-relaxed text-ink-primary"
                    />
                  </div>
                ))}

                {/* Outreach Message Drafts */}
                <div className="space-y-3 border-t border-border-hairline pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                      Outreach Message Drafts (Editable — Never Auto-Sent)
                    </h4>
                  </div>

                  <div className="space-y-3">
                    {draftPlaybook.outreachDrafts.map((draft, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-ink-primary">
                            {draft.channel}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyText(
                                `${draft.channel} draft`,
                                `Subject: ${draft.subject}\n\n${draft.message}`,
                              )
                            }
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border-hairline bg-surface-canvas px-2.5 text-[11px] font-medium text-ink-primary hover:bg-surface-subtle"
                          >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            Copy Draft
                          </button>
                        </div>
                        <input
                          value={draft.subject}
                          onChange={(e) => {
                            const next = [...draftPlaybook.outreachDrafts];
                            next[idx] = { ...next[idx], subject: e.target.value };
                            setDraftPlaybook({ ...draftPlaybook, outreachDrafts: next });
                          }}
                          aria-label={`${draft.channel} subject`}
                          className="h-9 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium"
                        />
                        <textarea
                          rows={4}
                          value={draft.message}
                          onChange={(e) => {
                            const next = [...draftPlaybook.outreachDrafts];
                            next[idx] = { ...next[idx], message: e.target.value };
                            setDraftPlaybook({ ...draftPlaybook, outreachDrafts: next });
                          }}
                          aria-label={`${draft.channel} message`}
                          className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-xs leading-relaxed"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Follow-Up Drafts */}
                <div className="space-y-3 border-t border-border-hairline pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                    Follow-Up Sequence Drafts (Editable — Never Auto-Sent)
                  </h4>
                  <div className="space-y-3">
                    {draftPlaybook.followUpDrafts.map((draft, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border-hairline bg-surface-subtle p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-ink-primary">
                            {draft.step} · <span className="font-normal text-ink-muted">{draft.timing}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyText(
                                `${draft.step} draft`,
                                `Subject: ${draft.subject}\n\n${draft.message}`,
                              )
                            }
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border-hairline bg-surface-canvas px-2.5 text-[11px] font-medium text-ink-primary hover:bg-surface-subtle"
                          >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            Copy Draft
                          </button>
                        </div>
                        <input
                          value={draft.subject}
                          onChange={(e) => {
                            const next = [...draftPlaybook.followUpDrafts];
                            next[idx] = { ...next[idx], subject: e.target.value };
                            setDraftPlaybook({ ...draftPlaybook, followUpDrafts: next });
                          }}
                          aria-label={`${draft.step} subject`}
                          className="h-9 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium"
                        />
                        <textarea
                          rows={3}
                          value={draft.message}
                          onChange={(e) => {
                            const next = [...draftPlaybook.followUpDrafts];
                            next[idx] = { ...next[idx], message: e.target.value };
                            setDraftPlaybook({ ...draftPlaybook, followUpDrafts: next });
                          }}
                          aria-label={`${draft.step} message`}
                          className="w-full rounded-lg border border-border-hairline bg-surface-canvas p-3 text-xs leading-relaxed"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end border-t border-border-hairline pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving ? 'Saving...' : 'Save All Playbook Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete sales playbook?"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.title}" and its outreach drafts?`
            : ''
        }
        confirmLabel="Delete Playbook"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
