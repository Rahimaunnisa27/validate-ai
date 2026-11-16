import type {
  ComputedFinancialModel,
  FinancialPlanInputs,
} from '../shared/phase3aSchemas.ts';
import type {
  CompetitorInput,
  CompetitorSourceType,
  DifferentiationOpportunity,
  MarketResearchInput,
  MarketResearchResult,
} from '../shared/phase3bSchemas.ts';
import type {
  EvidenceLabel,
  ValidationReportJson,
} from '../shared/reportSchemas.ts';
import type {
  IdeaBusinessModel,
  IdeaStage,
  PainLevel,
  StartupStage,
} from '../shared/schemas.ts';
import type {
  BudgetTier,
  CsvColumnMapping,
  LeadInput,
  LeadStage,
  MarketingInput,
  MarketingStrategyJson,
  SalesInput,
  SalesPlaybookJson,
} from '../shared/phase4Schemas.ts';
import type {
  BudgetVsActualComparison,
  ExpenseBudgetInput,
  ExpenseBudgetRecord,
  ExpenseCategory,
  ExpenseInput,
  ExpenseRecord,
  ExpenseSummary,
  ExpenseUpdateInput,
  PaymentMethod,
  RoadmapDuration,
  RoadmapGenerateRequest,
  RoadmapPlanRecord,
  TaskInput,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  TaskStatusUpdateInput,
  TaskUpdateInput,
} from '../shared/phase5Schemas.ts';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  timezone: string;
  createdAt?: string;
}

export interface Startup {
  id: string;
  name: string;
  tagline: string;
  industry: string;
  stage: StartupStage;
  location: string;
  website: string;
  description: string;
  ideasCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaBusinessDetails {
  title?: string;
  startupId?: string;
  industry?: string;
  businessModel?: IdeaBusinessModel;
  stage?: IdeaStage;
  oneLiner?: string;
}

export interface IdeaProblemSolution {
  problemStatement?: string;
  currentAlternatives?: string;
  proposedSolution?: string;
  uniqueValueProposition?: string;
}

export interface IdeaTargetCustomer {
  primarySegment?: string;
  geography?: string;
  customerPainLevel?: PainLevel;
  willingnessToPay?: string;
}

export interface IdeaFinancials {
  initialCapitalInr?: number | null;
  pricePerUnitInr?: number | null;
  estimatedMonthlyCustomers?: number | null;
  monthlyBurnInr?: number | null;
  revenueModelNotes?: string;
}

export interface IdeaCompetitors {
  knownCompetitors?: string;
  unfairAdvantage?: string;
}

export interface Idea {
  id: string;
  startupId: string | null;
  startupName: string | null;
  title: string;
  status: 'draft' | 'submitted';
  currentStep: number;
  businessDetails: IdeaBusinessDetails;
  problemSolution: IdeaProblemSolution;
  targetCustomer: IdeaTargetCustomer;
  financials: IdeaFinancials;
  competitors: IdeaCompetitors;
  createdAt: string;
  updatedAt: string;
}

export interface ReportPlan {
  id: string;
  slug: string;
  name: string;
  priceInr: number;
  currency: string;
  description: string;
  features: string[];
  isRecommended: boolean;
}

export type ReportStatus = 'queued' | 'running' | 'completed' | 'failed';
export type ResearchMode = 'sonar' | 'demo' | 'none';

export interface ProgressLogEntry {
  step: number;
  label: string;
  status: 'running' | 'completed' | 'failed';
  detail?: string;
  timestamp: string;
}

export interface SimilarIdeaMatch {
  ideaId: string;
  title: string;
  status: 'draft' | 'submitted';
  similarityScore: number;
}

export interface ResearchSource {
  id: string;
  sourceRef: string;
  query: string;
  url: string;
  title: string;
  snippet: string;
  retrievedAt: string;
  isDemo: boolean;
}

export interface ValidationReport {
  id: string;
  ideaId: string;
  ideaTitle: string;
  startupName: string | null;
  planId: string;
  planName: string;
  planSlug: string;
  planPriceInr: number;
  status: ReportStatus;
  progressStep: number;
  progressTotal: number;
  progressLabel: string;
  progressLog: ProgressLogEntry[];
  concepts: string[];
  similarIdeas: SimilarIdeaMatch[];
  researchMode: ResearchMode;
  jobError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reportJson?: ValidationReportJson | null;
  sources?: ResearchSource[];
}

export type {
  CompetitorInput,
  CompetitorSourceType,
  ComputedFinancialModel,
  DifferentiationOpportunity,
  EvidenceLabel,
  FinancialPlanInputs,
  MarketResearchInput,
  MarketResearchResult,
  ValidationReportJson,
};

export interface ResearchSourceStatus {
  researchMode: ResearchMode;
  statusLabel: 'Configured' | 'Demo data' | 'Not configured';
  setupSteps: string[];
}

export interface Phase3bResearchSource {
  sourceRef: string;
  query: string;
  url: string;
  title: string;
  snippet: string;
  retrievedAt: string;
  isDemo: boolean;
}

export interface MarketResearchRun {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  industry: string;
  businessCategory: string;
  targetCustomer: string;
  location: string;
  productOrService: string;
  researchMode: ResearchMode;
  status: 'completed' | 'not_configured';
  sources: Phase3bResearchSource[];
  result: MarketResearchResult | null;
  setupSteps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorRecord {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  name: string;
  website: string;
  description: string;
  pricing: string;
  features: string[];
  strengths: string[];
  weaknesses: string[];
  notes: string;
  sourceUrl: string;
  researchedDate: string | null;
  sourceType: CompetitorSourceType;
  isDemo: boolean;
  evidenceLabel: EvidenceLabel;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorDifferentiation {
  opportunities: DifferentiationOpportunity[];
  competitorCount: number;
  updatedAt: string;
}

export interface FinancialPlan {
  id: string;
  startupId: string | null;
  startupName: string | null;
  ideaId: string | null;
  ideaTitle: string | null;
  name: string;
  inputs: FinancialPlanInputs;
  computed: ComputedFinancialModel;
  aiInterpretation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPersona {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  name: string;
  idea: string;
  industry: string;
  product: string;
  location: string;
  problem: string;
  segment: string;
  needs: string[];
  painPoints: string[];
  motivations: string[];
  objections: string[];
  preferredChannels: string[];
  purchaseConsiderations: string[];
  disclaimer: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardFinancialOverview {
  planId: string;
  name: string;
  startupName: string | null;
  ideaTitle: string | null;
  expectedMonthlyRevenue: number;
  expectedMonthlyExpenses: number;
  expectedOperatingProfit: number;
  expectedBreakEvenUnits: number | null;
  expectedRunwayLabel: string;
  updatedAt: string;
}

export interface LeadRecord {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: LeadStage;
  notes: string;
  notesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadNoteRecord {
  id: string;
  leadId: string;
  content: string;
  createdAt: string;
}

export interface LeadSummary {
  totalLeads: number;
  convertedCount: number;
  conversionRate: number;
  byStage: Record<LeadStage, number>;
}

export interface MarketingCampaignRecord {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  title: string;
  budgetTier: BudgetTier;
  inputs: MarketingInput;
  strategy: MarketingStrategyJson;
  evidenceLabel: 'AI interpretation';
  createdAt: string;
  updatedAt: string;
}

export interface SalesPlaybookRecord {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  title: string;
  inputs: SalesInput;
  playbook: SalesPlaybookJson;
  evidenceLabel: 'AI interpretation';
  draftNotice: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  summary: {
    totalIdeas: number;
    submittedIdeas: number;
    draftIdeas: number;
    activeStartups: number;
    completedReports: number;
    savedFinancialPlans?: number;
    savedPersonas?: number;
    savedResearchRuns?: number;
    savedCompetitors?: number;
    totalLeads?: number;
    leadConversionRate?: number;
    leadsByStage?: Record<LeadStage, number>;
    savedMarketingCampaigns?: number;
    savedSalesPlaybooks?: number;
    totalTasks?: number;
    pendingTasks?: number;
    completedTasks?: number;
    taskCompletionRate?: number;
    totalExpenses?: number;
    savedRoadmaps?: number;
  };
  upcomingTasks?: Array<{
    id: string;
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string | null;
    startDate: string | null;
  }>;
  financialOverview?: DashboardFinancialOverview | null;
  recentIdeas: Array<{
    id: string;
    title: string;
    status: 'draft' | 'submitted';
    currentStep: number;
    updatedAt: string;
    startupName: string | null;
  }>;
  recentStartups: Array<{
    id: string;
    name: string;
    industry: string;
    stage: StartupStage;
    location: string;
    updatedAt: string;
    ideasCount: number;
  }>;
  recentReports?: Array<{
    id: string;
    ideaId: string;
    ideaTitle: string;
    status: ReportStatus;
    planName: string;
    updatedAt: string;
  }>;
}

export interface IntegrationStatusItem {
  key: string;
  name: string;
  configured: boolean;
  reachable: boolean;
  phase: string;
  statusLabel: 'Configured' | 'Not configured' | 'Dev fallback';
  message: string;
  setupSteps: string[];
}

export interface SystemStatusResponse {
  integrations: IntegrationStatusItem[];
  flags: {
    allowUnpaidReports: boolean;
    demoMode: boolean;
    nodeEnv: string;
  };
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setInMemoryAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

async function tryRefreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          inMemoryAccessToken = null;
          return false;
        }
        try {
          const data = (await res.json()) as { accessToken?: string };
          if (data.accessToken) {
            inMemoryAccessToken = data.accessToken;
          }
        } catch {
          // ignore JSON parse issues
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const authHeader: Record<string, string> = inMemoryAccessToken
    ? { Authorization: `Bearer ${inMemoryAccessToken}` }
    : {};

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(options.headers || {}),
    },
  });

  if (
    res.status === 401 &&
    allowRefresh &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/refresh')
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return request<T>(path, options, false);
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err = data?.error;
    throw new ApiClientError(
      res.status,
      err?.code || 'REQUEST_FAILED',
      err?.message || 'Request failed. Please try again.',
      err?.details,
    );
  }

  return data as T;
}

export const api = {
  auth: {
    register: async (body: { fullName: string; email: string; password: string }) => {
      const res = await request<{ user: User; accessToken?: string }>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify(body) },
        false,
      );
      if (res.accessToken) inMemoryAccessToken = res.accessToken;
      return res;
    },
    login: async (body: { email: string; password: string }) => {
      const res = await request<{ user: User; accessToken?: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify(body) },
        false,
      );
      if (res.accessToken) inMemoryAccessToken = res.accessToken;
      return res;
    },
    logout: async () => {
      inMemoryAccessToken = null;
      return request<{ ok: boolean }>('/auth/logout', { method: 'POST' }, false);
    },
    forgotPassword: (body: { email: string }) =>
      request<{ emailConfigured: boolean; message: string }>(
        '/auth/forgot-password',
        { method: 'POST', body: JSON.stringify(body) },
        false,
      ),
    resetPassword: (body: { token: string; password: string }) =>
      request<{ ok: boolean; message: string }>(
        '/auth/reset-password',
        { method: 'POST', body: JSON.stringify(body) },
        false,
      ),
  },
  users: {
    me: () => request<{ user: User }>('/users/me'),
    updateMe: (body: {
      fullName: string;
      role?: string;
      timezone?: string;
      currentPassword?: string;
      newPassword?: string;
    }) => request<{ user: User }>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
  },
  dashboard: {
    get: () => request<DashboardData>('/dashboard'),
  },
  startups: {
    list: (limit = 50, offset = 0) =>
      request<{ items: Startup[]; pagination: PaginationMeta }>(
        `/startups?limit=${limit}&offset=${offset}`,
      ),
    get: (id: string) => request<{ startup: Startup }>(`/startups/${id}`),
    create: (body: Record<string, unknown>) =>
      request<{ startup: Startup }>('/startups', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<{ startup: Startup }>(`/startups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/startups/${id}`, { method: 'DELETE' }),
  },
  ideas: {
    list: (status?: 'draft' | 'submitted', limit = 50, offset = 0) => {
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (status) qs.set('status', status);
      return request<{ items: Idea[]; pagination: PaginationMeta }>(`/ideas?${qs.toString()}`);
    },
    get: (id: string) => request<{ idea: Idea }>(`/ideas/${id}`),
    createDraft: (body: Record<string, unknown>) =>
      request<{ idea: Idea }>('/ideas', { method: 'POST', body: JSON.stringify(body) }),
    updateDraft: (id: string, body: Record<string, unknown>) =>
      request<{ idea: Idea }>(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    submit: (id: string, body: Record<string, unknown>) =>
      request<{ idea: Idea }>(`/ideas/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    delete: (id: string) => request<{ ok: boolean }>(`/ideas/${id}`, { method: 'DELETE' }),
  },
  reports: {
    list: (params?: { ideaId?: string; status?: ReportStatus; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams({
        limit: String(params?.limit ?? 50),
        offset: String(params?.offset ?? 0),
      });
      if (params?.ideaId) qs.set('ideaId', params.ideaId);
      if (params?.status) qs.set('status', params.status);
      return request<{ items: ValidationReport[]; pagination: PaginationMeta }>(
        `/reports?${qs.toString()}`,
      );
    },
    generate: (body: { ideaId: string; planSlug?: string; planId?: string }) =>
      request<{ report: ValidationReport }>('/reports/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<{ report: ValidationReport }>(`/reports/${id}`),
    retry: (id: string) =>
      request<{ report: ValidationReport }>(`/reports/${id}/retry`, { method: 'POST' }),
    delete: (id: string) => request<{ ok: boolean }>(`/reports/${id}`, { method: 'DELETE' }),
    downloadPdf: async (id: string, fallbackFilename = 'venturepilot-validation-report.pdf') => {
      const doFetch = () =>
        fetch(`/api/v1/reports/${id}/pdf`, {
          method: 'GET',
          credentials: 'include',
          headers: inMemoryAccessToken
            ? { Authorization: `Bearer ${inMemoryAccessToken}` }
            : {},
        });

      let res = await doFetch();
      if (res.status === 401) {
        const refreshed = await tryRefreshSession();
        if (refreshed) {
          res = await doFetch();
        }
      }

      if (!res.ok) {
        let message = 'Failed to download PDF report.';
        try {
          const data = await res.json();
          if (data?.error?.message) message = data.error.message;
        } catch {
          // ignore JSON parse errors
        }
        throw new ApiClientError(res.status, 'PDF_DOWNLOAD_FAILED', message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || fallbackFilename;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  },
  finance: {
    list: () => request<{ items: FinancialPlan[] }>('/finance'),
    get: (id: string) => request<{ plan: FinancialPlan }>(`/finance/${id}`),
    calculate: (body: FinancialPlanInputs) =>
      request<{ inputs: FinancialPlanInputs; computed: ComputedFinancialModel }>(
        '/finance/calculate',
        { method: 'POST', body: JSON.stringify(body) },
      ),
    create: (body: FinancialPlanInputs) =>
      request<{ plan: FinancialPlan }>('/finance', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: FinancialPlanInputs) =>
      request<{ plan: FinancialPlan }>(`/finance/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/finance/${id}`, { method: 'DELETE' }),
  },
  personas: {
    list: () => request<{ items: CustomerPersona[] }>('/personas'),
    get: (id: string) => request<{ persona: CustomerPersona }>(`/personas/${id}`),
    generate: (body: {
      ideaId?: string | null;
      idea: string;
      industry: string;
      product: string;
      location: string;
      problem: string;
    }) =>
      request<{ persona: CustomerPersona }>('/personas/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: {
        name: string;
        idea: string;
        industry: string;
        product: string;
        location: string;
        problem: string;
        segment: string;
        needs: string[];
        painPoints: string[];
        motivations: string[];
        objections: string[];
        preferredChannels: string[];
        purchaseConsiderations: string[];
      },
    ) =>
      request<{ persona: CustomerPersona }>(`/personas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/personas/${id}`, { method: 'DELETE' }),
  },
  research: {
    list: () =>
      request<{ items: MarketResearchRun[]; sourceStatus: ResearchSourceStatus }>('/research'),
    get: (id: string) =>
      request<{ run: MarketResearchRun; sourceStatus: ResearchSourceStatus }>(`/research/${id}`),
    run: (body: MarketResearchInput) =>
      request<{ run: MarketResearchRun; sourceStatus: ResearchSourceStatus }>('/research', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/research/${id}`, { method: 'DELETE' }),
  },
  competitors: {
    list: () =>
      request<{
        items: CompetitorRecord[];
        differentiation: CompetitorDifferentiation | null;
        sourceStatus: ResearchSourceStatus;
      }>('/competitors'),
    get: (id: string) => request<{ competitor: CompetitorRecord }>(`/competitors/${id}`),
    create: (body: CompetitorInput) =>
      request<{ competitor: CompetitorRecord }>('/competitors', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: CompetitorInput) =>
      request<{ competitor: CompetitorRecord }>(`/competitors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/competitors/${id}`, { method: 'DELETE' }),
    discover: (body: {
      ideaId?: string | null;
      industry: string;
      productOrService: string;
      location: string;
      targetCustomer?: string;
    }) =>
      request<{
        items: CompetitorRecord[];
        researchMode: ResearchMode;
        sources: Phase3bResearchSource[];
      }>('/competitors/discover', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    differentiate: () =>
      request<{ differentiation: CompetitorDifferentiation }>('/competitors/differentiate', {
        method: 'POST',
      }),
  },
  leads: {
    list: (params?: { search?: string; status?: LeadStage | ''; source?: string }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.status) qs.set('status', params.status);
      if (params?.source) qs.set('source', params.source);
      const query = qs.toString();
      return request<{ items: LeadRecord[]; sources: string[]; summary: LeadSummary }>(
        `/leads${query ? `?${query}` : ''}`,
      );
    },
    get: (id: string) =>
      request<{ lead: LeadRecord; timelineNotes: LeadNoteRecord[] }>(`/leads/${id}`),
    create: (body: LeadInput) =>
      request<{ lead: LeadRecord; summary: LeadSummary }>('/leads', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<LeadInput>) =>
      request<{ lead: LeadRecord; summary: LeadSummary }>(`/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    updateStage: (id: string, status: LeadStage) =>
      request<{ lead: LeadRecord; summary: LeadSummary }>(`/leads/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean; summary: LeadSummary }>(`/leads/${id}`, { method: 'DELETE' }),
    addNote: (leadId: string, content: string) =>
      request<{ note: LeadNoteRecord }>(`/leads/${leadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    deleteNote: (leadId: string, noteId: string) =>
      request<{ ok: boolean }>(`/leads/${leadId}/notes/${noteId}`, { method: 'DELETE' }),
    importCsv: (body: { csvText: string; mapping: CsvColumnMapping; ideaId?: string | null }) =>
      request<{
        importedCount: number;
        skippedCount: number;
        sanitizedFormulaCells: number;
        errors: Array<{ row: number; reason: string }>;
        summary: LeadSummary;
      }>('/leads/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    downloadCsv: async () => {
      const doFetch = () =>
        fetch('/api/v1/leads/export.csv', {
          method: 'GET',
          credentials: 'include',
          headers: inMemoryAccessToken
            ? { Authorization: `Bearer ${inMemoryAccessToken}` }
            : {},
        });
      let res = await doFetch();
      if (res.status === 401) {
        const refreshed = await tryRefreshSession();
        if (refreshed) res = await doFetch();
      }
      if (!res.ok) {
        throw new ApiClientError(res.status, 'CSV_EXPORT_FAILED', 'Failed to export leads CSV.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'venturepilot-leads.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  },
  marketing: {
    list: () => request<{ items: MarketingCampaignRecord[] }>('/marketing'),
    get: (id: string) => request<{ campaign: MarketingCampaignRecord }>(`/marketing/${id}`),
    generate: (body: MarketingInput) =>
      request<{ campaign: MarketingCampaignRecord; allocationAdjusted: boolean }>(
        '/marketing/generate',
        { method: 'POST', body: JSON.stringify(body) },
      ),
    update: (
      id: string,
      body: {
        title: string;
        ideaId?: string | null;
        inputs: MarketingInput;
        strategy: MarketingStrategyJson;
      },
    ) =>
      request<{ campaign: MarketingCampaignRecord; allocationAdjusted: boolean }>(
        `/marketing/${id}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/marketing/${id}`, { method: 'DELETE' }),
  },
  sales: {
    list: () =>
      request<{ items: SalesPlaybookRecord[]; draftNotice: string }>('/sales'),
    get: (id: string) => request<{ playbook: SalesPlaybookRecord }>(`/sales/${id}`),
    generate: (body: SalesInput) =>
      request<{ playbook: SalesPlaybookRecord }>('/sales/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: {
        title: string;
        ideaId?: string | null;
        inputs: SalesInput;
        playbook: SalesPlaybookJson;
      },
    ) =>
      request<{ playbook: SalesPlaybookRecord }>(`/sales/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/sales/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (query?: {
      status?: string;
      priority?: string;
      ideaId?: string;
      roadmapPlanId?: string;
      search?: string;
    }) => {
      const sp = new URLSearchParams();
      if (query?.status) sp.set('status', query.status);
      if (query?.priority) sp.set('priority', query.priority);
      if (query?.ideaId) sp.set('ideaId', query.ideaId);
      if (query?.roadmapPlanId) sp.set('roadmapPlanId', query.roadmapPlanId);
      if (query?.search) sp.set('search', query.search);
      const qs = sp.toString();
      return request<{ items: TaskRecord[] }>(`/tasks${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<{ task: TaskRecord }>(`/tasks/${id}`),
    create: (body: TaskInput) =>
      request<{ task: TaskRecord }>('/tasks', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: TaskUpdateInput) =>
      request<{ task: TaskRecord }>(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    updateStatus: (id: string, body: TaskStatusUpdateInput) =>
      request<{ task: TaskRecord }>(`/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  roadmap: {
    list: (query?: { ideaId?: string }) => {
      const sp = new URLSearchParams();
      if (query?.ideaId) sp.set('ideaId', query.ideaId);
      const qs = sp.toString();
      return request<{ items: RoadmapPlanRecord[] }>(`/roadmap${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) =>
      request<{
        plan: RoadmapPlanRecord;
        tasks: TaskRecord[];
        completionPercentage: number;
      }>(`/roadmap/${id}`),
    generate: (body: RoadmapGenerateRequest) =>
      request<{
        plan: RoadmapPlanRecord;
        tasksCreatedCount: number;
        evidenceLabel: 'AI interpretation';
      }>('/roadmap/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/roadmap/${id}`, { method: 'DELETE' }),
  },
  expenses: {
    list: (query?: { month?: string; category?: string }) => {
      const sp = new URLSearchParams();
      if (query?.month) sp.set('month', query.month);
      if (query?.category) sp.set('category', query.category);
      const qs = sp.toString();
      return request<{ items: ExpenseRecord[]; summary: ExpenseSummary }>(
        `/expenses${qs ? `?${qs}` : ''}`,
      );
    },
    get: (id: string) => request<{ expense: ExpenseRecord }>(`/expenses/${id}`),
    create: (body: ExpenseInput) =>
      request<{ expense: ExpenseRecord }>('/expenses', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: ExpenseUpdateInput) =>
      request<{ expense: ExpenseRecord }>(`/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/expenses/${id}`, { method: 'DELETE' }),
    budgets: (month?: string) => {
      const sp = new URLSearchParams();
      if (month) sp.set('month', month);
      const qs = sp.toString();
      return request<{
        items: ExpenseBudgetRecord[];
        comparison: BudgetVsActualComparison[];
        selectedMonth: string;
      }>(`/expenses/budgets${qs ? `?${qs}` : ''}`);
    },
    saveBudget: (body: ExpenseBudgetInput) =>
      request<{ budget: ExpenseBudgetRecord }>('/expenses/budgets', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deleteBudget: (id: string) =>
      request<{ ok: boolean }>(`/expenses/budgets/${id}`, { method: 'DELETE' }),
  },
  plans: {
    list: () => request<{ plans: ReportPlan[] }>('/plans', {}, false),
  },
  contact: {
    submit: (body: { name: string; email: string; subject: string; message: string }) =>
      request<{
        id: string;
        saved: boolean;
        emailDelivered: boolean;
        emailConfigured: boolean;
        message: string;
      }>('/contact', { method: 'POST', body: JSON.stringify(body) }, false),
  },
  system: {
    status: () => request<SystemStatusResponse>('/system/status', {}, false),
  },
};
