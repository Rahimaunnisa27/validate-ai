import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Loader2,
  SkipForward,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/app/AppShell.tsx';
import { ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { api, ApiClientError, type Startup } from '../../lib/api.ts';
import { MOTION_EASE } from '../../lib/motion.ts';
import {
  IDEA_BUSINESS_MODELS,
  IDEA_STAGES,
  PAIN_LEVELS,
  ideaBusinessDetailsSchema,
  ideaCompetitorsSchema,
  ideaFinancialsSchema,
  ideaFullFormSchema,
  ideaProblemSolutionSchema,
  ideaTargetCustomerSchema,
} from '../../shared/schemas.ts';

const STEPS = [
  { id: 1, title: 'Business Details', required: true },
  { id: 2, title: 'Problem & Solution', required: true },
  { id: 3, title: 'Target Customer', required: true },
  { id: 4, title: 'Financials', required: false },
  { id: 5, title: 'Competitors', required: false },
  { id: 6, title: 'Review & Submit', required: true },
] as const;

interface WizardState {
  businessDetails: {
    title: string;
    startupId: string;
    industry: string;
    businessModel: string;
    stage: string;
    oneLiner: string;
  };
  problemSolution: {
    problemStatement: string;
    currentAlternatives: string;
    proposedSolution: string;
    uniqueValueProposition: string;
  };
  targetCustomer: {
    primarySegment: string;
    geography: string;
    customerPainLevel: string;
    willingnessToPay: string;
  };
  financials: {
    initialCapitalInr: string;
    pricePerUnitInr: string;
    estimatedMonthlyCustomers: string;
    monthlyBurnInr: string;
    revenueModelNotes: string;
  };
  competitors: {
    knownCompetitors: string;
    unfairAdvantage: string;
  };
}

const DEFAULT_WIZARD_STATE: WizardState = {
  businessDetails: {
    title: '',
    startupId: '',
    industry: '',
    businessModel: 'saas',
    stage: 'concept',
    oneLiner: '',
  },
  problemSolution: {
    problemStatement: '',
    currentAlternatives: '',
    proposedSolution: '',
    uniqueValueProposition: '',
  },
  targetCustomer: {
    primarySegment: '',
    geography: 'India',
    customerPainLevel: 'high',
    willingnessToPay: '',
  },
  financials: {
    initialCapitalInr: '',
    pricePerUnitInr: '',
    estimatedMonthlyCustomers: '',
    monthlyBurnInr: '',
    revenueModelNotes: '',
  },
  competitors: {
    knownCompetitors: '',
    unfairAdvantage: '',
  },
};

function strVal(obj: object | undefined, key: string, fallback = ''): string {
  const val = (obj as Record<string, unknown> | undefined)?.[key];
  if (val === null || val === undefined) return fallback;
  return String(val);
}

export function IdeaWizardPage() {
  const { id: routeIdeaId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const [ideaId, setIdeaId] = useState<string | null>(routeIdeaId || null);
  const [step, setStep] = useState<number>(1);
  const [formState, setFormState] = useState<WizardState>(DEFAULT_WIZARD_STATE);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [startups, setStartups] = useState<Startup[]>([]);

  const [initialLoading, setInitialLoading] = useState<boolean>(Boolean(routeIdeaId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isDirtyRef = useRef(false);
  const savingLockRef = useRef(false);
  const latestStateRef = useRef({ formState, step, ideaId });
  latestStateRef.current = { formState, step, ideaId };

  useEffect(() => {
    api.startups
      .list()
      .then((res) => setStartups(res.items))
      .catch(() => {});
  }, []);

  const loadExistingIdea = useCallback(async (idToLoad: string) => {
    setInitialLoading(true);
    setLoadError(null);
    try {
      const res = await api.ideas.get(idToLoad);
      const idea = res.idea;
      setIdeaId(idea.id);
      setStep(idea.currentStep || 1);
      setFormState({
        businessDetails: {
          title: strVal(idea.businessDetails, 'title', idea.title === 'Untitled Idea' ? '' : idea.title),
          startupId: strVal(idea.businessDetails, 'startupId', idea.startupId || ''),
          industry: strVal(idea.businessDetails, 'industry'),
          businessModel: strVal(idea.businessDetails, 'businessModel', 'saas'),
          stage: strVal(idea.businessDetails, 'stage', 'concept'),
          oneLiner: strVal(idea.businessDetails, 'oneLiner'),
        },
        problemSolution: {
          problemStatement: strVal(idea.problemSolution, 'problemStatement'),
          currentAlternatives: strVal(idea.problemSolution, 'currentAlternatives'),
          proposedSolution: strVal(idea.problemSolution, 'proposedSolution'),
          uniqueValueProposition: strVal(idea.problemSolution, 'uniqueValueProposition'),
        },
        targetCustomer: {
          primarySegment: strVal(idea.targetCustomer, 'primarySegment'),
          geography: strVal(idea.targetCustomer, 'geography', 'India'),
          customerPainLevel: strVal(idea.targetCustomer, 'customerPainLevel', 'high'),
          willingnessToPay: strVal(idea.targetCustomer, 'willingnessToPay'),
        },
        financials: {
          initialCapitalInr: strVal(idea.financials, 'initialCapitalInr'),
          pricePerUnitInr: strVal(idea.financials, 'pricePerUnitInr'),
          estimatedMonthlyCustomers: strVal(idea.financials, 'estimatedMonthlyCustomers'),
          monthlyBurnInr: strVal(idea.financials, 'monthlyBurnInr'),
          revenueModelNotes: strVal(idea.financials, 'revenueModelNotes'),
        },
        competitors: {
          knownCompetitors: strVal(idea.competitors, 'knownCompetitors'),
          unfairAdvantage: strVal(idea.competitors, 'unfairAdvantage'),
        },
      });
      setSaveStatus('saved');
      setLastSavedAt(
        new Date(idea.updatedAt).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
      isDirtyRef.current = false;
    } catch (err) {
      setLoadError(err instanceof ApiClientError ? err.message : 'Unable to load idea draft.');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (routeIdeaId) {
      void loadExistingIdea(routeIdeaId);
    } else {
      setIdeaId(null);
      setStep(1);
      setFormState(DEFAULT_WIZARD_STATE);
      setSaveStatus('idle');
      setLastSavedAt(null);
      setInitialLoading(false);
    }
  }, [routeIdeaId, loadExistingIdea]);

  const persistDraft = useCallback(
    async (targetStep?: number): Promise<string | null> => {
      if (savingLockRef.current) return latestStateRef.current.ideaId;
      const { formState: current, step: currentStep, ideaId: currentId } = latestStateRef.current;

      const hasAnyContent =
        current.businessDetails.title.trim().length > 0 ||
        current.businessDetails.industry.trim().length > 0 ||
        current.businessDetails.oneLiner.trim().length > 0 ||
        current.problemSolution.problemStatement.trim().length > 0;

      if (!currentId && !hasAnyContent) {
        return null;
      }

      savingLockRef.current = true;
      setSaveStatus('saving');

      const payload = {
        currentStep: targetStep ?? currentStep,
        startupId: current.businessDetails.startupId || null,
        title: current.businessDetails.title.trim() || 'Untitled Idea',
        businessDetails: current.businessDetails,
        problemSolution: current.problemSolution,
        targetCustomer: current.targetCustomer,
        financials: current.financials,
        competitors: current.competitors,
      };

      try {
        if (!currentId) {
          const created = await api.ideas.createDraft(payload);
          setIdeaId(created.idea.id);
          isDirtyRef.current = false;
          setSaveStatus('saved');
          setLastSavedAt(
            new Date().toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          );
          navigate(`/ideas/${created.idea.id}/edit`, { replace: true });
          return created.idea.id;
        } else {
          await api.ideas.updateDraft(currentId, payload);
          isDirtyRef.current = false;
          setSaveStatus('saved');
          setLastSavedAt(
            new Date().toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          );
          return currentId;
        }
      } catch {
        setSaveStatus('error');
        return currentId;
      } finally {
        savingLockRef.current = false;
      }
    },
    [navigate],
  );

  // Debounced autosave every 2 seconds after edits
  useEffect(() => {
    if (!isDirtyRef.current || initialLoading) return;
    const timer = setTimeout(() => {
      if (isDirtyRef.current) {
        void persistDraft();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [formState, step, initialLoading, persistDraft]);

  const updateSection = <K extends keyof WizardState>(
    section: K,
    field: keyof WizardState[K],
    value: string,
  ) => {
    isDirtyRef.current = true;
    setStepErrors((prev) => {
      const next = { ...prev };
      delete next[String(field)];
      return next;
    });
    setFormState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const validateCurrentStep = (stepNum: number): boolean => {
    setStepErrors({});
    let result;
    if (stepNum === 1) {
      result = ideaBusinessDetailsSchema.safeParse(formState.businessDetails);
    } else if (stepNum === 2) {
      result = ideaProblemSolutionSchema.safeParse(formState.problemSolution);
    } else if (stepNum === 3) {
      result = ideaTargetCustomerSchema.safeParse(formState.targetCustomer);
    } else if (stepNum === 4) {
      result = ideaFinancialsSchema.safeParse(formState.financials);
    } else if (stepNum === 5) {
      result = ideaCompetitorsSchema.safeParse(formState.competitors);
    } else {
      return true;
    }

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] || '');
        if (key && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setStepErrors(fieldErrors);
      return false;
    }
    return true;
  };

  const goToStep = async (nextStep: number, skipValidation = false) => {
    if (!skipValidation && nextStep > step && !validateCurrentStep(step)) {
      return;
    }
    setStep(nextStep);
    isDirtyRef.current = true;
    await persistDraft(nextStep);
  };

  const handleFinalSubmit = async () => {
    const parsed = ideaFullFormSchema.safeParse(formState);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const section = String(firstIssue?.path[0] || '');
      const targetStep =
        section === 'businessDetails'
          ? 1
          : section === 'problemSolution'
            ? 2
            : section === 'targetCustomer'
              ? 3
              : section === 'financials'
                ? 4
                : 5;
      toast.error(firstIssue?.message || 'Please complete all required fields before submitting.');
      setStep(targetStep);
      validateCurrentStep(targetStep);
      return;
    }

    setSubmitting(true);
    try {
      let currentId = ideaId;
      if (!currentId) {
        currentId = await persistDraft(6);
      }
      if (!currentId) {
        const created = await api.ideas.createDraft({
          currentStep: 6,
          startupId: parsed.data.businessDetails.startupId || null,
          title: parsed.data.businessDetails.title,
          ...parsed.data,
        });
        currentId = created.idea.id;
      }

      const submitted = await api.ideas.submit(currentId, parsed.data);
      toast.success('Business idea submitted!');
      navigate(`/ideas/${submitted.idea.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to submit idea.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title={formState.businessDetails.title.trim() || 'Submit Business Idea'}
      breadcrumb="Workspace / Idea Builder"
      action={
        <div className="flex items-center gap-2 text-xs text-ink-muted" aria-live="polite">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" aria-hidden="true" />
              <span>Saving draft...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Cloud className="h-3.5 w-3.5 text-semantic-success" aria-hidden="true" />
              <span>Saved{lastSavedAt ? ` · ${lastSavedAt}` : ''}</span>
            </>
          )}
          {saveStatus === 'error' && (
            <span className="text-semantic-danger">Autosave failed</span>
          )}
        </div>
      }
    >
      {initialLoading && <SkeletonCard rows={6} />}
      {loadError && (
        <ErrorState
          message={loadError}
          onRetry={() => routeIdeaId && void loadExistingIdea(routeIdeaId)}
        />
      )}

      {!initialLoading && !loadError && (
        <div className="space-y-6">
          {/* Progress Stepper */}
          <nav aria-label="Idea submission steps" className="rounded-xl border border-border-hairline bg-surface-canvas p-4">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {STEPS.map((s) => {
                const isActive = step === s.id;
                const isCompleted = step > s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (s.id <= step || validateCurrentStep(step)) {
                          void goToStep(s.id, s.id <= step);
                        }
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'bg-brand-primary/8 text-brand-primary'
                          : isCompleted
                            ? 'text-ink-primary hover:bg-surface-subtle'
                            : 'text-ink-muted hover:bg-surface-subtle'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                          isActive
                            ? 'bg-brand-primary text-white'
                            : isCompleted
                              ? 'bg-semantic-success/15 text-semantic-success'
                              : 'bg-surface-muted text-ink-muted'
                        }`}
                      >
                        {isCompleted ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : s.id}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{s.title}</span>
                        <span className="block text-[11px] text-ink-muted">
                          {s.required ? 'Required' : 'Optional'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Step Content */}
          <motion.div
            key={step}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-6 sm:p-8"
          >
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-ink-primary">1. Business Details</h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Define the core identity of your business idea. Required fields are marked with *.
                  </p>
                </div>

                <div>
                  <label htmlFor="idea-title" className="block text-sm font-medium text-ink-primary">
                    Idea Title *
                  </label>
                  <input
                    id="idea-title"
                    type="text"
                    value={formState.businessDetails.title}
                    onChange={(e) => updateSection('businessDetails', 'title', e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="e.g., Automated FSSAI Cold-Chain Compliance Logbook"
                  />
                  {stepErrors.title && (
                    <p className="mt-1 text-xs text-semantic-danger">{stepErrors.title}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="idea-startup"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Link to Startup (optional)
                    </label>
                    <select
                      id="idea-startup"
                      value={formState.businessDetails.startupId}
                      onChange={(e) => updateSection('businessDetails', 'startupId', e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      <option value="">Standalone idea (no startup)</option>
                      {startups.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="idea-industry"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Industry / Category *
                    </label>
                    <input
                      id="idea-industry"
                      type="text"
                      value={formState.businessDetails.industry}
                      onChange={(e) => updateSection('businessDetails', 'industry', e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="e.g., Supply Chain / AgriTech / SaaS"
                    />
                    {stepErrors.industry && (
                      <p className="mt-1 text-xs text-semantic-danger">{stepErrors.industry}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="idea-model"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Business Model *
                    </label>
                    <select
                      id="idea-model"
                      value={formState.businessDetails.businessModel}
                      onChange={(e) =>
                        updateSection('businessDetails', 'businessModel', e.target.value)
                      }
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      {IDEA_BUSINESS_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="idea-stage"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Current Stage *
                    </label>
                    <select
                      id="idea-stage"
                      value={formState.businessDetails.stage}
                      onChange={(e) => updateSection('businessDetails', 'stage', e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      {IDEA_STAGES.map((st) => (
                        <option key={st} value={st}>
                          {st.charAt(0).toUpperCase() + st.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="idea-oneliner"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    One-Sentence Pitch *
                  </label>
                  <input
                    id="idea-oneliner"
                    type="text"
                    value={formState.businessDetails.oneLiner}
                    onChange={(e) => updateSection('businessDetails', 'oneLiner', e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="Software that automates daily temperature audit logs for Indian cold-storage warehouses."
                  />
                  {stepErrors.oneLiner && (
                    <p className="mt-1 text-xs text-semantic-danger">{stepErrors.oneLiner}</p>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-ink-primary">2. Problem & Solution</h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Describe the pain point clearly and how your product resolves it.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="idea-problem"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Problem Statement *
                  </label>
                  <textarea
                    id="idea-problem"
                    rows={4}
                    value={formState.problemSolution.problemStatement}
                    onChange={(e) =>
                      updateSection('problemSolution', 'problemStatement', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="What specific recurring problem do customers face today, and what happens if they ignore it?"
                  />
                  {stepErrors.problemStatement && (
                    <p className="mt-1 text-xs text-semantic-danger">
                      {stepErrors.problemStatement}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="idea-alternatives"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Current Alternatives / Workarounds (optional)
                  </label>
                  <textarea
                    id="idea-alternatives"
                    rows={2}
                    value={formState.problemSolution.currentAlternatives}
                    onChange={(e) =>
                      updateSection('problemSolution', 'currentAlternatives', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="Paper clipboards, Excel spreadsheets, WhatsApp photos..."
                  />
                </div>

                <div>
                  <label
                    htmlFor="idea-solution"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Proposed Solution *
                  </label>
                  <textarea
                    id="idea-solution"
                    rows={4}
                    value={formState.problemSolution.proposedSolution}
                    onChange={(e) =>
                      updateSection('problemSolution', 'proposedSolution', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="How does your product work step-by-step for the customer?"
                  />
                  {stepErrors.proposedSolution && (
                    <p className="mt-1 text-xs text-semantic-danger">
                      {stepErrors.proposedSolution}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="idea-uvp" className="block text-sm font-medium text-ink-primary">
                    Unique Value Proposition (optional)
                  </label>
                  <input
                    id="idea-uvp"
                    type="text"
                    value={formState.problemSolution.uniqueValueProposition}
                    onChange={(e) =>
                      updateSection('problemSolution', 'uniqueValueProposition', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="Works with existing sensors and generates one-click audit PDFs."
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-ink-primary">3. Target Customer</h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Specify who pays for this solution and where they are located.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="idea-segment"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Primary Customer Segment *
                  </label>
                  <input
                    id="idea-segment"
                    type="text"
                    value={formState.targetCustomer.primarySegment}
                    onChange={(e) =>
                      updateSection('targetCustomer', 'primarySegment', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="Mid-sized cold storage operators (5,000–25,000 sq ft) serving pharma & dairy"
                  />
                  {stepErrors.primarySegment && (
                    <p className="mt-1 text-xs text-semantic-danger">{stepErrors.primarySegment}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="idea-geo"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Target Geography *
                    </label>
                    <input
                      id="idea-geo"
                      type="text"
                      value={formState.targetCustomer.geography}
                      onChange={(e) => updateSection('targetCustomer', 'geography', e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="India (Tier-1 & Tier-2 cities)"
                    />
                    {stepErrors.geography && (
                      <p className="mt-1 text-xs text-semantic-danger">{stepErrors.geography}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="idea-pain"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Estimated Pain Level *
                    </label>
                    <select
                      id="idea-pain"
                      value={formState.targetCustomer.customerPainLevel}
                      onChange={(e) =>
                        updateSection('targetCustomer', 'customerPainLevel', e.target.value)
                      }
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      {PAIN_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="idea-wtp" className="block text-sm font-medium text-ink-primary">
                    Willingness to Pay Evidence (optional)
                  </label>
                  <input
                    id="idea-wtp"
                    type="text"
                    value={formState.targetCustomer.willingnessToPay}
                    onChange={(e) =>
                      updateSection('targetCustomer', 'willingnessToPay', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="3 warehouse managers indicated ₹4,000–5,000/month budget"
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-ink-primary">
                      4. Financial Assumptions (Optional)
                    </h2>
                    <p className="mt-1 text-sm text-ink-secondary">
                      Provide initial INR estimates if available, or skip this step for now.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void goToStep(5, true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-subtle shrink-0"
                  >
                    <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                    Skip Step
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="fin-capital"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Initial Capital (INR)
                    </label>
                    <input
                      id="fin-capital"
                      type="number"
                      min="0"
                      value={formState.financials.initialCapitalInr}
                      onChange={(e) =>
                        updateSection('financials', 'initialCapitalInr', e.target.value)
                      }
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 font-mono text-sm tabular-nums focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="500000"
                    />
                    {stepErrors.initialCapitalInr && (
                      <p className="mt-1 text-xs text-semantic-danger">
                        {stepErrors.initialCapitalInr}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="fin-price"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Price per Unit / Month (INR)
                    </label>
                    <input
                      id="fin-price"
                      type="number"
                      min="0"
                      value={formState.financials.pricePerUnitInr}
                      onChange={(e) =>
                        updateSection('financials', 'pricePerUnitInr', e.target.value)
                      }
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 font-mono text-sm tabular-nums focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="4500"
                    />
                    {stepErrors.pricePerUnitInr && (
                      <p className="mt-1 text-xs text-semantic-danger">
                        {stepErrors.pricePerUnitInr}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="fin-customers"
                      className="block text-sm font-medium text-ink-primary"
                    >
                      Est. Monthly Paying Customers
                    </label>
                    <input
                      id="fin-customers"
                      type="number"
                      min="0"
                      value={formState.financials.estimatedMonthlyCustomers}
                      onChange={(e) =>
                        updateSection('financials', 'estimatedMonthlyCustomers', e.target.value)
                      }
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 font-mono text-sm tabular-nums focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="25"
                    />
                  </div>

                  <div>
                    <label htmlFor="fin-burn" className="block text-sm font-medium text-ink-primary">
                      Estimated Monthly Burn (INR)
                    </label>
                    <input
                      id="fin-burn"
                      type="number"
                      min="0"
                      value={formState.financials.monthlyBurnInr}
                      onChange={(e) => updateSection('financials', 'monthlyBurnInr', e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 font-mono text-sm tabular-nums focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="85000"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="fin-notes" className="block text-sm font-medium text-ink-primary">
                    Revenue Model Notes
                  </label>
                  <textarea
                    id="fin-notes"
                    rows={3}
                    value={formState.financials.revenueModelNotes}
                    onChange={(e) =>
                      updateSection('financials', 'revenueModelNotes', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="Subscription + one-time onboarding fee..."
                  />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-ink-primary">
                      5. Competitors & Differentiation (Optional)
                    </h2>
                    <p className="mt-1 text-sm text-ink-secondary">
                      List any known direct or indirect competitors, or skip directly to review.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void goToStep(6, true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-subtle shrink-0"
                  >
                    <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                    Skip Step
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="comp-known"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Known Competitors
                  </label>
                  <textarea
                    id="comp-known"
                    rows={4}
                    value={formState.competitors.knownCompetitors}
                    onChange={(e) =>
                      updateSection('competitors', 'knownCompetitors', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="List names, websites, or tools customers currently use..."
                  />
                </div>

                <div>
                  <label htmlFor="comp-moat" className="block text-sm font-medium text-ink-primary">
                    Expected Unfair Advantage / Differentiation
                  </label>
                  <textarea
                    id="comp-moat"
                    rows={3}
                    value={formState.competitors.unfairAdvantage}
                    onChange={(e) =>
                      updateSection('competitors', 'unfairAdvantage', e.target.value)
                    }
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="Domain network, distribution partnership, proprietary workflow..."
                  />
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-ink-primary">
                    6. Review Your Idea Submission
                  </h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Verify all inputs before submitting. All details entered here are stored as{' '}
                    <span className="font-medium text-brand-accent">User assumptions</span>.
                  </p>
                </div>

                <div className="divide-y divide-border-hairline rounded-xl border border-border-hairline bg-surface-subtle">
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink-primary">
                        1. Business Details
                      </h3>
                      <button
                        type="button"
                        onClick={() => void goToStep(1, true)}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-ink-muted">Title</dt>
                        <dd className="font-medium text-ink-primary">
                          {formState.businessDetails.title || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Industry · Model · Stage</dt>
                        <dd className="text-ink-primary">
                          {formState.businessDetails.industry || '—'} ·{' '}
                          {formState.businessDetails.businessModel.toUpperCase()} ·{' '}
                          {formState.businessDetails.stage}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-ink-muted">One-liner</dt>
                        <dd className="text-ink-secondary">
                          {formState.businessDetails.oneLiner || '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink-primary">
                        2. Problem & Solution
                      </h3>
                      <button
                        type="button"
                        onClick={() => void goToStep(2, true)}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-ink-muted">Problem Statement</dt>
                        <dd className="text-ink-secondary">
                          {formState.problemSolution.problemStatement || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Proposed Solution</dt>
                        <dd className="text-ink-secondary">
                          {formState.problemSolution.proposedSolution || '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink-primary">
                        3. Target Customer
                      </h3>
                      <button
                        type="button"
                        onClick={() => void goToStep(3, true)}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-ink-muted">Primary Segment</dt>
                        <dd className="text-ink-primary">
                          {formState.targetCustomer.primarySegment || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Geography · Pain</dt>
                        <dd className="text-ink-primary">
                          {formState.targetCustomer.geography || '—'} ·{' '}
                          {formState.targetCustomer.customerPainLevel}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink-primary">
                        4. Financials & 5. Competitors (Optional)
                      </h3>
                      <button
                        type="button"
                        onClick={() => void goToStep(4, true)}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-ink-secondary tabular-nums">
                      Price/unit: {formState.financials.pricePerUnitInr ? `₹${formState.financials.pricePerUnitInr}` : 'Not provided'} ·
                      Monthly burn: {formState.financials.monthlyBurnInr ? `₹${formState.financials.monthlyBurnInr}` : 'Not provided'} ·
                      Competitors: {formState.competitors.knownCompetitors ? 'Provided' : 'Not provided'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Footer */}
            <div className="mt-8 flex items-center justify-between border-t border-border-hairline pt-6">
              <button
                type="button"
                disabled={step === 1}
                onClick={() => void goToStep(step - 1, true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-hairline bg-surface-canvas px-4 text-sm font-medium text-ink-primary hover:bg-surface-subtle transition-colors disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>

              {step < 6 ? (
                <button
                  type="button"
                  onClick={() => void goToStep(step + 1)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors active:scale-[0.98]"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleFinalSubmit}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-primary px-6 text-sm font-semibold text-white hover:bg-brand-primary-hover transition-colors active:scale-[0.98] disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {submitting ? 'Submitting...' : 'Submit Business Idea'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AppShell>
  );
}
