import {
  AlertCircle,
  ArrowUpDown,
  Download,
  Edit3,
  LayoutGrid,
  List,
  MessageSquarePlus,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type Idea,
  type LeadNoteRecord,
  type LeadRecord,
  type LeadSummary,
} from '../../lib/api.ts';
import {
  hasCsvFormulaTrigger,
  LEAD_STAGES,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  parseCsvText,
  type CsvColumnMapping,
  type LeadStage,
} from '../../shared/phase4Schemas.ts';

interface LeadFormState {
  ideaId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: LeadStage;
  notes: string;
}

function emptyLeadForm(): LeadFormState {
  return {
    ideaId: '',
    name: '',
    email: '',
    phone: '',
    company: '',
    source: 'Manual',
    status: 'New',
    notes: '',
  };
}

function recordToForm(lead: LeadRecord): LeadFormState {
  return {
    ideaId: lead.ideaId ?? '',
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    source: lead.source || 'Manual',
    status: lead.status,
    notes: lead.notes,
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function stageToneClass(stage: LeadStage): string {
  switch (stage) {
    case 'Converted':
      return 'border-semantic-success/35 bg-semantic-success/10 text-semantic-success';
    case 'Qualified':
    case 'Interested':
      return 'border-brand-primary/35 bg-brand-primary/10 text-brand-primary';
    case 'Lost':
      return 'border-semantic-danger/35 bg-semantic-danger/10 text-semantic-danger';
    default:
      return 'border-border-hairline bg-surface-subtle text-ink-secondary';
  }
}

function autoMapHeader(headers: string[], candidates: string[]): string {
  const lowerHeaders = headers.map((h) => ({ raw: h, norm: h.trim().toLowerCase() }));
  for (const cand of candidates) {
    const exact = lowerHeaders.find((h) => h.norm === cand);
    if (exact) return exact.raw;
  }
  for (const cand of candidates) {
    const partial = lowerHeaders.find((h) => h.norm.includes(cand));
    if (partial) return partial.raw;
  }
  return '';
}

function recomputeSummary(items: LeadRecord[]): LeadSummary {
  const byStage: Record<LeadStage, number> = {
    New: 0,
    Contacted: 0,
    Interested: 0,
    Qualified: 0,
    Converted: 0,
    Lost: 0,
  };
  for (const l of items) {
    if (l.status in byStage) byStage[l.status] += 1;
  }
  const totalLeads = items.length;
  const convertedCount = byStage.Converted;
  const conversionRate =
    totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 1000) / 10 : 0;
  return { totalLeads, convertedCount, conversionRate, byStage };
}

type SortKey = 'name' | 'company' | 'source' | 'status' | 'updatedAt';

export function LeadsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStage | ''>('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Add / Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm);
  const [saving, setSaving] = useState(false);

  // Selected lead & notes timeline drawer
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [timelineNotes, setTimelineNotes] = useState<LeadNoteRecord[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Drag-and-drop state
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);

  // CSV Import state
  const [showCsvPanel, setShowCsvPanel] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [csvTotalRows, setCsvTotalRows] = useState(0);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping>({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: '',
    status: '',
    notes: '',
  });
  const [csvIdeaId, setCsvIdeaId] = useState('');
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{
    importedCount: number;
    skippedCount: number;
    sanitizedFormulaCells: number;
    errors: Array<{ row: number; reason: string }>;
  } | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<LeadRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, ideasRes] = await Promise.all([
        api.leads.list(),
        api.ideas.list(undefined, 100, 0),
      ]);
      setLeads(leadsRes.items);
      setSources(leadsRes.sources);
      setSummary(leadsRes.summary);
      setIdeas(ideasRes.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openLeadTimeline = async (leadId: string) => {
    setSelectedLeadId(leadId);
    setLoadingNotes(true);
    try {
      const res = await api.leads.get(leadId);
      setTimelineNotes(res.timelineNotes);
      setLeads((prev) => prev.map((l) => (l.id === res.lead.id ? res.lead : l)));
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to load lead timeline.');
    } finally {
      setLoadingNotes(false);
    }
  };

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = leads.filter((l) => {
      if (statusFilter && l.status !== statusFilter) return false;
      if (sourceFilter && l.source.toLowerCase() !== sourceFilter.toLowerCase()) return false;
      if (q) {
        const hay = `${l.name} ${l.email} ${l.company} ${l.notes} ${l.source}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const av = String(a[sortKey] ?? '').toLowerCase();
      const bv = String(b[sortKey] ?? '').toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [leads, search, statusFilter, sourceFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(emptyLeadForm());
    setShowForm(true);
    setShowCsvPanel(false);
  };

  const handleOpenEdit = (lead: LeadRecord) => {
    setEditingId(lead.id);
    setForm(recordToForm(lead));
    setShowForm(true);
    setShowCsvPanel(false);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ideaId: form.ideaId || null,
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        source: form.source || 'Manual',
        status: form.status,
        notes: form.notes,
      };
      if (editingId) {
        const res = await api.leads.update(editingId, payload);
        setLeads((prev) => prev.map((l) => (l.id === res.lead.id ? res.lead : l)));
        setSummary(res.summary);
        toast.success('Lead updated.');
      } else {
        const res = await api.leads.create(payload);
        setLeads((prev) => [res.lead, ...prev]);
        setSummary(res.summary);
        if (res.lead.source && !sources.includes(res.lead.source)) {
          setSources((prev) => [...prev, res.lead.source].sort());
        }
        toast.success('Lead added.');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyLeadForm());
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to save lead.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Optimistically moves a lead to targetStage across Kanban or "Move to..." menu,
   * persists via PATCH /api/v1/leads/:id/stage, and rolls back automatically on error.
   */
  const handleMoveStage = async (leadId: string, targetStage: LeadStage) => {
    const target = leads.find((l) => l.id === leadId);
    if (!target || target.status === targetStage) return;

    const previousLeads = leads;
    const previousSummary = summary;

    const optimisticLeads = leads.map((l) =>
      l.id === leadId ? { ...l, status: targetStage, updatedAt: new Date().toISOString() } : l,
    );
    setLeads(optimisticLeads);
    setSummary(recomputeSummary(optimisticLeads));

    try {
      const res = await api.leads.updateStage(leadId, targetStage);
      setLeads((prev) => prev.map((l) => (l.id === res.lead.id ? res.lead : l)));
      setSummary(res.summary);
      toast.success(`Moved "${target.name}" to ${targetStage}.`);
    } catch (err) {
      // Roll back optimistic move
      setLeads(previousLeads);
      setSummary(previousSummary);
      toast.error(
        err instanceof ApiClientError
          ? `Stage move failed and rolled back: ${err.message}`
          : 'Stage move failed. Lead reverted to previous stage.',
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await api.leads.delete(deleteTarget.id);
      setLeads((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      setSummary(res.summary);
      if (selectedLeadId === deleteTarget.id) {
        setSelectedLeadId(null);
        setTimelineNotes([]);
      }
      setDeleteTarget(null);
      toast.success('Lead deleted.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to delete lead.');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddTimelineNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !newNoteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await api.leads.addNote(selectedLeadId, newNoteText.trim());
      setTimelineNotes((prev) => [res.note, ...prev]);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === selectedLeadId ? { ...l, notesCount: l.notesCount + 1 } : l,
        ),
      );
      setNewNoteText('');
      toast.success('Note added to timeline.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteTimelineNote = async (noteId: string) => {
    if (!selectedLeadId) return;
    try {
      await api.leads.deleteNote(selectedLeadId, noteId);
      setTimelineNotes((prev) => prev.filter((n) => n.id !== noteId));
      setLeads((prev) =>
        prev.map((l) =>
          l.id === selectedLeadId
            ? { ...l, notesCount: Math.max(0, l.notesCount - 1) }
            : l,
        ),
      );
      toast.success('Timeline note removed.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to delete note.');
    }
  };

  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCsvParseError(null);
    setCsvImportResult(null);
    if (!file) return;

    if (file.size > MAX_CSV_BYTES) {
      setCsvParseError(
        `File "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(2)} MB, exceeding the 2 MB limit.`,
      );
      return;
    }

    const text = await file.text();
    if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
      setCsvParseError('CSV content exceeds the 2 MB byte limit.');
      return;
    }

    try {
      const parsed = parseCsvText(text, MAX_CSV_ROWS);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setCsvParseError('CSV file has no header row or data rows.');
        return;
      }
      setCsvFileName(file.name);
      setCsvText(text);
      setCsvHeaders(parsed.headers);
      setCsvPreviewRows(parsed.rows.slice(0, 5));
      setCsvTotalRows(parsed.totalDataRows);
      setCsvMapping({
        name: autoMapHeader(parsed.headers, ['name', 'full name', 'contact', 'lead']) || parsed.headers[0],
        email: autoMapHeader(parsed.headers, ['email', 'e-mail', 'mail']),
        phone: autoMapHeader(parsed.headers, ['phone', 'mobile', 'tel', 'whatsapp']),
        company: autoMapHeader(parsed.headers, ['company', 'organization', 'org', 'business']),
        source: autoMapHeader(parsed.headers, ['source', 'channel', 'origin']),
        status: autoMapHeader(parsed.headers, ['status', 'stage']),
        notes: autoMapHeader(parsed.headers, ['notes', 'note', 'comment', 'comments']),
      });
    } catch (err) {
      setCsvParseError(err instanceof Error ? err.message : 'Unable to parse CSV file.');
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText || !csvMapping.name) {
      toast.error('Upload a CSV file and map the Lead Name column first.');
      return;
    }
    setImportingCsv(true);
    try {
      const res = await api.leads.importCsv({
        csvText,
        mapping: csvMapping,
        ideaId: csvIdeaId || null,
      });
      setCsvImportResult(res);
      setSummary(res.summary);
      toast.success(
        `Imported ${res.importedCount} lead${res.importedCount === 1 ? '' : 's'}${
          res.skippedCount > 0 ? ` (${res.skippedCount} skipped)` : ''
        }.`,
      );
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'CSV import failed.');
    } finally {
      setImportingCsv(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      await api.leads.downloadCsv();
      toast.success('Exported leads CSV with formula-injection protection.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to export CSV.');
    }
  };

  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;

  return (
    <AppShell
      title="Leads & Pipeline"
      breadcrumb="Workspace / Leads & Pipeline"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={leads.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCsvPanel((prev) => !prev);
              setShowForm(false);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-xs font-medium text-ink-primary hover:bg-surface-subtle whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Lead
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Privacy / No-Scraping Notice & Real Pipeline Metrics */}
        {summary && (
          <section className="rounded-xl border border-border-hairline bg-surface-canvas p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-ink-primary">
                  Pipeline Metrics (Real Database Totals)
                </h2>
                <p className="text-xs text-ink-muted">
                  Only leads you enter manually or import via CSV are stored here — VenturePilot never scrapes or fetches private contact data.
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[11px] font-medium text-ink-muted">Total Leads</p>
                  <p className="font-display text-xl font-bold text-ink-primary tabular-nums">
                    {summary.totalLeads}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-medium text-ink-muted">Conversion Rate</p>
                  <p className="font-display text-xl font-bold text-semantic-success tabular-nums">
                    {summary.conversionRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {LEAD_STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() =>
                    setStatusFilter((prev) => (prev === stage ? '' : stage))
                  }
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    statusFilter === stage
                      ? 'border-brand-primary bg-brand-primary/5'
                      : 'border-border-hairline bg-surface-subtle hover:bg-surface-canvas'
                  }`}
                >
                  <p className="text-[11px] font-medium text-ink-muted">{stage}</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink-primary tabular-nums">
                    {summary.byStage[stage] ?? 0}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* CSV Import Panel */}
        {showCsvPanel && (
          <form
            onSubmit={(e) => void handleImportCsv(e)}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-5"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-ink-primary">
                  Import Leads from CSV
                </h3>
                <p className="text-xs text-ink-muted">
                  Maximum 2 MB file size and {MAX_CSV_ROWS} rows per import. Cells starting with{' '}
                  <code className="font-mono">=, +, -, @</code> are automatically neutralized against spreadsheet formula injection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCsvPanel(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-hairline text-ink-secondary hover:bg-surface-subtle"
                aria-label="Close CSV import panel"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1.5">
                  Select CSV File (.csv, max 2 MB)
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void handleCsvFileSelect(e)}
                  className="block w-full text-xs text-ink-secondary file:mr-3 file:rounded-lg file:border file:border-border-hairline file:bg-surface-subtle file:px-3 file:py-2 file:text-xs file:font-medium file:text-ink-primary hover:file:bg-surface-canvas"
                />
                {csvFileName && (
                  <p className="mt-1 text-[11px] text-ink-muted tabular-nums">
                    Loaded {csvFileName} · {csvTotalRows} data row{csvTotalRows === 1 ? '' : 's'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1.5">
                  Link Imported Leads to Idea (Optional)
                </label>
                <select
                  value={csvIdeaId}
                  onChange={(e) => setCsvIdeaId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                >
                  <option value="">No linked idea</option>
                  {ideas.map((idea) => (
                    <option key={idea.id} value={idea.id}>
                      {idea.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {csvParseError && (
              <div className="rounded-lg border border-semantic-danger/35 bg-semantic-danger/5 p-3 text-xs text-semantic-danger flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{csvParseError}</span>
              </div>
            )}

            {csvHeaders.length > 0 && (
              <>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-ink-primary">Column Mapping</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        ['name', 'Name (Required)'],
                        ['email', 'Email'],
                        ['phone', 'Phone'],
                        ['company', 'Company'],
                        ['source', 'Source'],
                        ['status', 'Pipeline Stage'],
                        ['notes', 'Notes'],
                      ] as const
                    ).map(([fieldKey, label]) => (
                      <div key={fieldKey}>
                        <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                          {label}
                        </label>
                        <select
                          required={fieldKey === 'name'}
                          value={csvMapping[fieldKey] ?? ''}
                          onChange={(e) =>
                            setCsvMapping((prev) => ({ ...prev, [fieldKey]: e.target.value }))
                          }
                          className="h-9 w-full rounded-lg border border-border-hairline bg-surface-canvas px-2.5 text-xs"
                        >
                          <option value="">{fieldKey === 'name' ? 'Select column...' : 'Skip column'}</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* First 5 rows preview */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-ink-primary">
                    Preview (First {csvPreviewRows.length} of {csvTotalRows} rows)
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-border-hairline">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-surface-subtle text-ink-secondary border-b border-border-hairline">
                        <tr>
                          {csvHeaders.map((h) => (
                            <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-hairline">
                        {csvPreviewRows.map((row, idx) => (
                          <tr key={idx}>
                            {csvHeaders.map((h) => {
                              const cell = row[h] ?? '';
                              const flagged = hasCsvFormulaTrigger(cell);
                              return (
                                <td key={h} className="px-3 py-2 whitespace-nowrap">
                                  <span className={flagged ? 'text-semantic-warning font-medium' : 'text-ink-primary'}>
                                    {cell || '—'}
                                  </span>
                                  {flagged && (
                                    <span className="ml-1.5 text-[10px] text-semantic-warning">
                                      [formula neutralized]
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    disabled={importingCsv}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
                  >
                    {importingCsv ? 'Importing...' : `Import ${csvTotalRows} Rows`}
                  </button>
                </div>
              </>
            )}

            {csvImportResult && (
              <div className="rounded-lg border border-border-hairline bg-surface-subtle p-4 space-y-2 text-xs">
                <p className="font-semibold text-ink-primary tabular-nums">
                  Import summary: {csvImportResult.importedCount} imported ·{' '}
                  {csvImportResult.skippedCount} skipped ·{' '}
                  {csvImportResult.sanitizedFormulaCells} formula cell(s) neutralized
                </p>
                {csvImportResult.errors.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    <p className="font-medium text-semantic-danger">Per-row errors:</p>
                    {csvImportResult.errors.map((err, i) => (
                      <p key={i} className="text-ink-secondary tabular-nums">
                        Row {err.row}: {err.reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {/* Manual Add / Edit Form */}
        {showForm && (
          <form
            onSubmit={(e) => void handleSaveLead(e)}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-ink-primary">
                {editingId ? 'Edit Lead' : 'Add Lead Manually'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-hairline text-ink-secondary hover:bg-surface-subtle"
                aria-label="Close lead form"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Rohan Deshmukh"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="rohan@company.in"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+91 98200 12345"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Company</label>
                <input
                  value={form.company}
                  onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                  placeholder="e.g. Sahyadri Dairy Cold Room"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Source</label>
                <input
                  value={form.source}
                  onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                  placeholder="Manual / Referral / LinkedIn / Event"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Stage</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as LeadStage }))}
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                >
                  {LEAD_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Linked Idea (Optional)
                </label>
                <select
                  value={form.ideaId}
                  onChange={(e) => setForm((p) => ({ ...p, ideaId: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                >
                  <option value="">None</option>
                  {ideas.map((idea) => (
                    <option key={idea.id} value={idea.id}>
                      {idea.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">Notes</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Initial context or qualification details"
                  className="h-10 w-full rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Lead'}
              </button>
            </div>
          </form>
        )}

        {/* Filter & View Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-hairline bg-surface-canvas p-3.5">
          <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[240px]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, company, notes..."
                className="h-9 w-full rounded-lg border border-border-hairline bg-surface-subtle pl-8 pr-3 text-xs"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LeadStage | '')}
              aria-label="Filter by stage"
              className="h-9 rounded-lg border border-border-hairline bg-surface-canvas px-2.5 text-xs"
            >
              <option value="">All Stages</option>
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Filter by source"
              className="h-9 rounded-lg border border-border-hairline bg-surface-canvas px-2.5 text-xs"
            >
              <option value="">All Sources</option>
              {sources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-surface-subtle p-1">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-surface-canvas text-ink-primary shadow-sm'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              Pipeline Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'list'
                  ? 'bg-surface-canvas text-ink-primary shadow-sm'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Table View
            </button>
          </div>
        </div>

        {loading && <SkeletonTable rows={5} />}
        {error && <ErrorState message={error} onRetry={() => void loadData()} />}

        {!loading && !error && leads.length === 0 && (
          <EmptyState
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            title="No leads added yet"
            description="Add prospect leads manually or import a CSV spreadsheet with column mapping to manage your sales pipeline."
            action={
              <button
                type="button"
                onClick={handleOpenNew}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add First Lead
              </button>
            }
          />
        )}

        {/* Kanban Pipeline Board */}
        {!loading && !error && leads.length > 0 && viewMode === 'kanban' && (
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1260px] grid-cols-6 gap-3">
              {LEAD_STAGES.map((stage) => {
                const stageLeads = filteredLeads.filter((l) => l.status === stage);
                const isOver = dragOverStage === stage;
                return (
                  <div
                    key={stage}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverStage(stage);
                    }}
                    onDragLeave={() => setDragOverStage((prev) => (prev === stage ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverStage(null);
                      const id = e.dataTransfer.getData('text/plain') || draggedLeadId;
                      setDraggedLeadId(null);
                      if (id) void handleMoveStage(id, stage);
                    }}
                    className={`flex min-h-[420px] flex-col rounded-xl border p-3 transition-colors ${
                      isOver
                        ? 'border-brand-primary bg-brand-primary/5'
                        : 'border-border-hairline bg-surface-canvas'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-border-hairline pb-2">
                      <span className="text-xs font-bold text-ink-primary">{stage}</span>
                      <span className="text-xs font-mono font-semibold text-ink-muted tabular-nums">
                        {stageLeads.length}
                      </span>
                    </div>

                    <div className="space-y-2.5 flex-1">
                      {stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedLeadId(lead.id);
                            e.dataTransfer.setData('text/plain', lead.id);
                          }}
                          onDragEnd={() => {
                            setDraggedLeadId(null);
                            setDragOverStage(null);
                          }}
                          className="cursor-grab rounded-lg border border-border-hairline bg-surface-subtle p-3 space-y-2 hover:border-brand-primary/50 transition-colors active:cursor-grabbing"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => void openLeadTimeline(lead.id)}
                              className="text-left text-xs font-bold text-ink-primary hover:text-brand-primary leading-snug"
                            >
                              {lead.name}
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(lead)}
                                aria-label={`Edit ${lead.name}`}
                                className="rounded p-1 text-ink-muted hover:bg-surface-canvas hover:text-ink-primary"
                              >
                                <Edit3 className="h-3 w-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(lead)}
                                aria-label={`Delete ${lead.name}`}
                                className="rounded p-1 text-ink-muted hover:bg-surface-canvas hover:text-semantic-danger"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          <p className="text-[11px] text-ink-secondary truncate">
                            {[lead.company, lead.source].filter(Boolean).join(' · ') || 'Manual'}
                          </p>
                          {lead.email && (
                            <p className="text-[11px] text-ink-muted truncate">{lead.email}</p>
                          )}

                          {/* Keyboard & Mobile Accessible Stage Selector */}
                          <div className="pt-1 flex items-center justify-between gap-2 border-t border-border-hairline">
                            <select
                              aria-label={`Move ${lead.name} to stage`}
                              value={lead.status}
                              onChange={(e) =>
                                void handleMoveStage(lead.id, e.target.value as LeadStage)
                              }
                              className="h-7 flex-1 rounded border border-border-hairline bg-surface-canvas px-1.5 text-[11px] text-ink-primary"
                            >
                              {LEAD_STAGES.map((s) => (
                                <option key={s} value={s}>
                                  Move to: {s}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void openLeadTimeline(lead.id)}
                              className="inline-flex h-7 items-center gap-1 rounded border border-border-hairline bg-surface-canvas px-2 text-[11px] text-ink-secondary hover:text-ink-primary tabular-nums"
                            >
                              <MessageSquarePlus className="h-3 w-3" aria-hidden="true" />
                              {lead.notesCount}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* List / Table View */}
        {!loading && !error && leads.length > 0 && viewMode === 'list' && (
          <section className="rounded-xl border border-border-hairline bg-surface-canvas overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-xs">
                <thead className="bg-surface-subtle text-ink-secondary border-b border-border-hairline">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Name <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('company')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Company <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('source')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Source <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('status')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Stage <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('updatedAt')}
                        className="inline-flex items-center gap-1 hover:text-ink-primary"
                      >
                        Updated <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-surface-subtle/60">
                      <td className="px-4 py-3 font-semibold text-ink-primary">
                        <button
                          type="button"
                          onClick={() => void openLeadTimeline(lead.id)}
                          className="hover:text-brand-primary text-left"
                        >
                          {lead.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">
                        <div>{lead.email || '—'}</div>
                        {lead.phone && <div className="text-[11px] text-ink-muted">{lead.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-ink-primary">{lead.company || '—'}</td>
                      <td className="px-4 py-3 text-ink-secondary">{lead.source || 'Manual'}</td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Change stage for ${lead.name}`}
                          value={lead.status}
                          onChange={(e) =>
                            void handleMoveStage(lead.id, e.target.value as LeadStage)
                          }
                          className={`h-8 rounded-md border px-2 text-[11px] font-semibold ${stageToneClass(
                            lead.status,
                          )}`}
                        >
                          {LEAD_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-ink-muted tabular-nums">
                        {formatDate(lead.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openLeadTimeline(lead.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-hairline px-2.5 text-xs text-ink-primary hover:bg-surface-subtle tabular-nums"
                          >
                            Notes ({lead.notesCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(lead)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-hairline px-2.5 text-xs text-ink-primary hover:bg-surface-subtle"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(lead)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-semantic-danger/30 px-2.5 text-xs text-semantic-danger hover:bg-semantic-danger/5"
                          >
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

        {/* Selected Lead Notes Timeline Panel */}
        {selectedLead && (
          <section className="rounded-xl border border-border-hairline bg-surface-canvas p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-hairline pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-ink-primary">
                  {selectedLead.name} — Notes Timeline
                </h3>
                <p className="text-xs text-ink-muted">
                  {[selectedLead.company, selectedLead.email, selectedLead.phone, selectedLead.status]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedLeadId(null);
                  setTimelineNotes([]);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-hairline px-2.5 text-xs text-ink-secondary hover:bg-surface-subtle"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Close Timeline
              </button>
            </div>

            {selectedLead.notes && (
              <div className="rounded-lg border border-border-hairline bg-surface-subtle p-3 text-xs text-ink-secondary">
                <span className="font-semibold text-ink-primary">Lead summary note:</span>{' '}
                {selectedLead.notes}
              </div>
            )}

            <form onSubmit={(e) => void handleAddTimelineNote(e)} className="flex gap-2">
              <input
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Log a call summary, next step, or qualification observation..."
                className="h-10 flex-1 rounded-lg border border-border-hairline bg-surface-canvas px-3 text-sm"
              />
              <button
                type="submit"
                disabled={addingNote || !newNoteText.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-primary px-4 text-xs font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50 whitespace-nowrap"
              >
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </form>

            {loadingNotes ? (
              <p className="text-xs text-ink-muted">Loading timeline...</p>
            ) : timelineNotes.length === 0 ? (
              <p className="text-xs text-ink-muted">No timeline notes recorded for this lead yet.</p>
            ) : (
              <div className="divide-y divide-border-hairline rounded-lg border border-border-hairline">
                {timelineNotes.map((note) => (
                  <div key={note.id} className="flex items-start justify-between gap-3 p-3.5">
                    <div className="space-y-1">
                      <p className="text-xs text-ink-primary leading-relaxed">{note.content}</p>
                      <p className="text-[11px] text-ink-muted tabular-nums">
                        {new Date(note.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTimelineNote(note.id)}
                      aria-label="Delete timeline note"
                      className="inline-flex h-7 items-center rounded border border-semantic-danger/30 px-2 text-[11px] text-semantic-danger hover:bg-semantic-danger/5 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete lead?"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}" and its timeline notes from your pipeline?`
            : ''
        }
        confirmLabel="Delete Lead"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
