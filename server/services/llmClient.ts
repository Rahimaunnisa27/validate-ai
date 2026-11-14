import { GoogleGenAI } from '@google/genai';
import { config } from '../config.ts';
import { AppError } from '../utils/errors.ts';
import {
  REPORT_SECTION_META,
  SCORING_DISCLAIMER,
  validationReportJsonSchema,
  type ReportClaim,
  type ReportSection,
  type ValidationReportJson,
} from '../../src/shared/reportSchemas.ts';
import { computeLocalEmbedding, LOCAL_EMBEDDING_MODEL } from './embeddings.ts';

export interface LlmDriver {
  generateJson(prompt: string): Promise<string>;
  embedText(text: string): Promise<number[]>;
  getResolvedModels?: () => { llmModel: string; embeddingModel: string };
}

export interface DiscoveredModelInfo {
  name: string;
  supportedActions: string[];
}

export interface GeminiStartupCheckState {
  checked: boolean;
  checkedAt: string | null;
  keyLast4: string | null;
  configuredLlmModel: string;
  configuredEmbeddingModel: string;
  resolvedLlmModel: string;
  resolvedEmbeddingModel: string;
  availableFlashModels: string[];
  availableEmbeddingModels: string[];
  usedAutoFallback: boolean;
  error: string | null;
}

const startupState: GeminiStartupCheckState = {
  checked: false,
  checkedAt: null,
  keyLast4: null,
  configuredLlmModel: config.llmModel,
  configuredEmbeddingModel: config.embeddingModel,
  resolvedLlmModel: config.llmModel,
  resolvedEmbeddingModel: config.embeddingModel,
  availableFlashModels: [],
  availableEmbeddingModels: [],
  usedAutoFallback: false,
  error: null,
};

export function getGeminiStartupState(): GeminiStartupCheckState {
  return { ...startupState };
}

export function resetGeminiStartupState(): void {
  startupState.checked = false;
  startupState.checkedAt = null;
  startupState.keyLast4 = null;
  startupState.configuredLlmModel = config.llmModel;
  startupState.configuredEmbeddingModel = config.embeddingModel;
  startupState.resolvedLlmModel = config.llmModel;
  startupState.resolvedEmbeddingModel = config.embeddingModel;
  startupState.availableFlashModels = [];
  startupState.availableEmbeddingModels = [];
  startupState.usedAutoFallback = false;
  startupState.error = null;
}

export function isGeminiConfigured(): boolean {
  const key = config.geminiApiKey.trim();
  return key.length > 0 && !key.startsWith('MY_') && !key.startsWith('CHANGE_ME');
}

export function getGeminiSetupSteps(): string[] {
  return [
    'Create a free Gemini API key in Google AI Studio.',
    'Add GEMINI_API_KEY in AI Studio Settings > Secrets (or in your local .env file).',
    'Restart or refresh the server and verify status on the Integration Status page.',
  ];
}

export function stripModelPrefix(name: string): string {
  return name.replace(/^models\//, '').trim();
}

/**
 * Only free-tier Flash / Hydrogen text models are allowed.
 * Explicitly excludes Pro, Argon, Carbon, Image, Video, Audio/TTS/Live, and Embedding models.
 */
export function isAllowedFreeFlashModel(modelName: string): boolean {
  const id = stripModelPrefix(modelName).toLowerCase();
  if (!id) return false;
  if (
    id.includes('pro') ||
    id.includes('argon') ||
    id.includes('carbon') ||
    id.includes('image') ||
    id.includes('imagen') ||
    id.includes('veo') ||
    id.includes('omni') ||
    id.includes('lyria') ||
    id.includes('tts') ||
    id.includes('live') ||
    id.includes('transcribe') ||
    id.includes('translate') ||
    id.includes('embedding') ||
    id.includes('aqa')
  ) {
    return false;
  }
  return id.includes('flash') || id.includes('hydrogen');
}

export function isEmbeddingModelId(modelName: string): boolean {
  const id = stripModelPrefix(modelName).toLowerCase();
  return id.includes('embedding');
}

function scoreFlashModelPreference(modelId: string): number {
  const id = modelId.toLowerCase();
  // Prefer newest stable Flash models first, then Flash-Lite / preview
  let score = 0;
  const verMatch = id.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (verMatch) {
    const major = Number(verMatch[1]) || 0;
    const minor = Number(verMatch[2]) || 0;
    score += major * 100 + minor * 10;
  }
  if (id.includes('hydrogen')) score += 250;
  if (id === 'gemini-2.5-flash') score += 80;
  if (!id.includes('lite')) score += 20;
  if (!id.includes('preview') && !id.includes('exp')) score += 10;
  if (id.includes('-001') || id.includes('-002')) score += 2;
  return score;
}

function scoreEmbeddingModelPreference(modelId: string): number {
  const id = modelId.toLowerCase();
  if (id === 'gemini-embedding-2') return 300;
  if (id === 'gemini-embedding-001') return 250;
  if (id === 'text-embedding-004') return 200;
  if (id.includes('embedding')) return 100;
  return 0;
}

export function selectFreeTierModelsFromCatalog(
  catalog: DiscoveredModelInfo[],
  configuredLlm: string,
  configuredEmbedding: string,
): {
  resolvedLlmModel: string;
  resolvedEmbeddingModel: string;
  availableFlashModels: string[];
  availableEmbeddingModels: string[];
  usedAutoFallback: boolean;
} {
  const normalizedCatalog = catalog.map((m) => ({
    id: stripModelPrefix(m.name),
    actions: (m.supportedActions || []).map((a) => a.toLowerCase()),
  }));

  const flashModels = normalizedCatalog
    .filter((m) => {
      if (!isAllowedFreeFlashModel(m.id)) return false;
      return m.actions.length === 0 || m.actions.includes('generatecontent');
    })
    .map((m) => m.id)
    .sort((a, b) => scoreFlashModelPreference(b) - scoreFlashModelPreference(a));

  const embeddingModels = normalizedCatalog
    .filter((m) => {
      if (!isEmbeddingModelId(m.id)) return false;
      return m.actions.length === 0 || m.actions.includes('embedcontent');
    })
    .map((m) => m.id)
    .sort((a, b) => scoreEmbeddingModelPreference(b) - scoreEmbeddingModelPreference(a));

  const cleanConfiguredLlm = stripModelPrefix(configuredLlm);
  const cleanConfiguredEmbedding = stripModelPrefix(configuredEmbedding);

  let usedAutoFallback = false;

  // Text generation model selection (never allow Pro/paid-only)
  let resolvedLlmModel = isAllowedFreeFlashModel(cleanConfiguredLlm)
    ? cleanConfiguredLlm
    : 'gemini-2.5-flash';

  if (flashModels.length > 0) {
    if (!isAllowedFreeFlashModel(cleanConfiguredLlm) || !flashModels.includes(cleanConfiguredLlm)) {
      resolvedLlmModel = flashModels[0];
      if (resolvedLlmModel !== cleanConfiguredLlm) {
        usedAutoFallback = true;
      }
    }
  } else if (!isAllowedFreeFlashModel(cleanConfiguredLlm)) {
    resolvedLlmModel = 'gemini-2.5-flash';
    usedAutoFallback = true;
  }

  // Embedding model selection (with local-hash-256 fallback if none listed)
  let resolvedEmbeddingModel = cleanConfiguredEmbedding || LOCAL_EMBEDDING_MODEL;
  if (catalog.length > 0) {
    if (embeddingModels.length > 0) {
      if (!embeddingModels.includes(cleanConfiguredEmbedding)) {
        resolvedEmbeddingModel = embeddingModels[0];
        usedAutoFallback = true;
      }
    } else {
      resolvedEmbeddingModel = LOCAL_EMBEDDING_MODEL;
      usedAutoFallback = true;
    }
  }

  return {
    resolvedLlmModel,
    resolvedEmbeddingModel,
    availableFlashModels: flashModels,
    availableEmbeddingModels: embeddingModels,
    usedAutoFallback,
  };
}

export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const code = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  return (
    code === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    /rate\s*limit|quota\s*exceeded/i.test(msg)
  );
}

export function isTransientOverloadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const code = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  return (
    code === 503 ||
    msg.includes('"code":503') ||
    msg.includes('(503)') ||
    msg.includes('UNAVAILABLE') ||
    /high\s+demand|temporarily\s+unavailable|service\s+unavailable/i.test(msg)
  );
}

export function isModelRejectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const code = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  if (isLeakedOrInvalidKeyError(msg)) return false;
  return (
    code === 404 ||
    /not\s+found|is\s+not\s+supported|unknown\s+model|paid\s+plan|billing\s+required|model.*not\s+available/i.test(
      msg,
    )
  );
}

function isLeakedOrInvalidKeyError(msg: string): boolean {
  return /reported as leaked|api key not valid|api_key_invalid|permission_denied/i.test(msg);
}

function extractRetryDelayMs(err: unknown, defaultMs: number): number {
  const msg = err instanceof Error ? err.message : String(err || '');
  const match = msg.match(/retry(?:Delay| in)?["':\s]+(\d+(?:\.\d+)?)\s*s/i);
  if (match?.[1]) {
    const sec = Number(match[1]);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(8000, Math.max(1500, Math.round(sec * 1000)));
    }
  }
  return defaultMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  options?: { defaultWaitMs?: number },
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const rateLimited = isRateLimitError(err);
    const overloaded = isTransientOverloadError(err);
    if (!rateLimited && !overloaded) {
      throw err;
    }
    const waitMs = extractRetryDelayMs(err, options?.defaultWaitMs ?? 3000);
    console.warn(
      `[gemini] ${rateLimited ? 'Rate limit (429)' : 'Temporary high demand (503)'} hit. Waiting ${waitMs}ms before 1 automatic retry...`,
    );
    await sleep(waitMs);
    return await fn();
  }
}

export function formatGeminiError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown Gemini API error');

  const jsonStart = rawMessage.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      const code = parsed?.error?.code;
      const status = parsed?.error?.status;
      const msg = parsed?.error?.message;
      if (msg) {
        if (code === 403 || status === 'PERMISSION_DENIED') {
          return new AppError(
            503,
            'LLM_KEY_REJECTED',
            `Gemini API rejected the configured key (${code ?? 403} ${status ?? 'PERMISSION_DENIED'}): ${msg} Replace GEMINI_API_KEY in Settings > Secrets and restart the server.`,
          );
        }
        if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
          return new AppError(
            429,
            'LLM_RATE_LIMITED',
            `Gemini API rate limit reached (429) after automatic retry: ${msg} Please wait a minute and click Retry (Free).`,
          );
        }
        if (code === 503 || status === 'UNAVAILABLE') {
          return new AppError(
            503,
            'LLM_TEMPORARILY_UNAVAILABLE',
            `Gemini API error (503): ${msg}`,
          );
        }
        return new AppError(502, 'LLM_UPSTREAM_ERROR', `Gemini API error (${code ?? status ?? 'error'}): ${msg}`);
      }
    } catch {
      // Fall through to raw message handling
    }
  }

  if (isRateLimitError(err)) {
    return new AppError(
      429,
      'LLM_RATE_LIMITED',
      `Gemini API rate limit reached (429) after automatic retry: ${rawMessage} Please wait a minute and click Retry (Free).`,
    );
  }

  if (isTransientOverloadError(err)) {
    return new AppError(
      503,
      'LLM_TEMPORARILY_UNAVAILABLE',
      `Gemini API temporarily overloaded (503): ${rawMessage}`,
    );
  }

  return new AppError(502, 'LLM_UPSTREAM_ERROR', rawMessage);
}

export function createSdkClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: config.geminiApiKey.trim(),
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function listAccessibleGeminiModels(ai?: GoogleGenAI): Promise<DiscoveredModelInfo[]> {
  const client = ai ?? createSdkClient();
  const pager = await client.models.list({ config: { pageSize: 100 } });
  const collected: DiscoveredModelInfo[] = [];

  for await (const model of pager) {
    if (model.name) {
      collected.push({
        name: model.name,
        supportedActions: Array.isArray(model.supportedActions) ? model.supportedActions : [],
      });
    }
    if (collected.length >= 200) break;
  }

  return collected;
}

export async function runGeminiStartupCheck(options?: {
  listModelsFn?: () => Promise<DiscoveredModelInfo[]>;
  force?: boolean;
}): Promise<GeminiStartupCheckState> {
  if (startupState.checked && !options?.force) {
    return getGeminiStartupState();
  }

  startupState.configuredLlmModel = config.llmModel;
  startupState.configuredEmbeddingModel = config.embeddingModel;
  startupState.keyLast4 = isGeminiConfigured() ? config.geminiApiKey.trim().slice(-4) : null;

  if (!isGeminiConfigured() && !options?.listModelsFn) {
    startupState.checked = true;
    startupState.checkedAt = new Date().toISOString();
    startupState.resolvedLlmModel = isAllowedFreeFlashModel(config.llmModel)
      ? config.llmModel
      : 'gemini-2.5-flash';
    startupState.resolvedEmbeddingModel = LOCAL_EMBEDDING_MODEL;
    startupState.error = 'GEMINI_API_KEY is not configured.';
    return getGeminiStartupState();
  }

  try {
    const catalog = options?.listModelsFn
      ? await options.listModelsFn()
      : await listAccessibleGeminiModels();

    const selected = selectFreeTierModelsFromCatalog(
      catalog,
      config.llmModel,
      config.embeddingModel,
    );

    startupState.checked = true;
    startupState.checkedAt = new Date().toISOString();
    startupState.resolvedLlmModel = selected.resolvedLlmModel;
    startupState.resolvedEmbeddingModel = selected.resolvedEmbeddingModel;
    startupState.availableFlashModels = selected.availableFlashModels;
    startupState.availableEmbeddingModels = selected.availableEmbeddingModels;
    startupState.usedAutoFallback = selected.usedAutoFallback;
    startupState.error = null;

    console.log(
      `[gemini-startup] Key ...${startupState.keyLast4 ?? 'none'} | Accessible Flash models: [${selected.availableFlashModels.slice(0, 6).join(', ')}] -> active LLM: ${selected.resolvedLlmModel}; active embeddings: ${selected.resolvedEmbeddingModel}`,
    );
  } catch (err) {
    const formatted = formatGeminiError(err);
    startupState.checked = true;
    startupState.checkedAt = new Date().toISOString();
    startupState.resolvedLlmModel = isAllowedFreeFlashModel(config.llmModel)
      ? config.llmModel
      : 'gemini-2.5-flash';
    startupState.resolvedEmbeddingModel = config.embeddingModel || LOCAL_EMBEDDING_MODEL;
    startupState.error = formatted.message;
    console.warn(`[gemini-startup] Model discovery failed: ${formatted.message}`);
  }

  return getGeminiStartupState();
}

export function createGeminiDriver(options?: { defaultRateLimitWaitMs?: number }): LlmDriver {
  if (!isGeminiConfigured()) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Settings > Secrets to generate AI validation reports.',
    );
  }

  const ai = createSdkClient();

  return {
    getResolvedModels() {
      return {
        llmModel: startupState.resolvedLlmModel,
        embeddingModel: startupState.resolvedEmbeddingModel,
      };
    },

    async generateJson(prompt: string): Promise<string> {
      await runGeminiStartupCheck();
      let activeModel = isAllowedFreeFlashModel(startupState.resolvedLlmModel)
        ? startupState.resolvedLlmModel
        : 'gemini-2.5-flash';

      const invokeOnce = async (modelId: string) => {
        const response = await ai.models.generateContent({
          model: modelId,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        const text = response.text;
        if (!text || !text.trim()) {
          throw new Error('Gemini returned an empty response while generating the report.');
        }
        return text;
      };

      const invoke = async (modelId: string) =>
        withRateLimitRetry(() => invokeOnce(modelId), {
          defaultWaitMs: options?.defaultRateLimitWaitMs,
        });

      try {
        return await invoke(activeModel);
      } catch (err) {
        let lastErr: unknown = err;
        if (
          isModelRejectionError(err) ||
          isTransientOverloadError(err) ||
          isRateLimitError(err)
        ) {
          await runGeminiStartupCheck({ force: true });
          const preferredOrder = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
          const catalogSet = new Set(startupState.availableFlashModels);
          const fallbacks = Array.from(
            new Set([
              ...preferredOrder.filter((m) => catalogSet.size === 0 || catalogSet.has(m)),
              ...startupState.availableFlashModels,
              ...preferredOrder,
            ]),
          )
            .filter((m) => m !== activeModel && isAllowedFreeFlashModel(m))
            .slice(0, 4);

          for (const candidate of fallbacks) {
            const reason = isTransientOverloadError(lastErr)
              ? '503 overloaded'
              : isRateLimitError(lastErr)
                ? '429 quota/rate limit'
                : 'rejected';
            console.warn(
              `[gemini] Model "${activeModel}" failed (${reason}); switching automatically to "${candidate}".`,
            );
            activeModel = candidate;
            startupState.resolvedLlmModel = candidate;
            startupState.usedAutoFallback = true;
            try {
              return await invokeOnce(candidate);
            } catch (retryErr) {
              lastErr = retryErr;
              if (
                !isModelRejectionError(retryErr) &&
                !isTransientOverloadError(retryErr) &&
                !isRateLimitError(retryErr)
              ) {
                throw formatGeminiError(retryErr);
              }
            }
          }
        }
        throw formatGeminiError(lastErr);
      }
    },

    async embedText(text: string): Promise<number[]> {
      await runGeminiStartupCheck();
      const targetModel = startupState.resolvedEmbeddingModel;

      if (!targetModel || targetModel === LOCAL_EMBEDDING_MODEL) {
        return computeLocalEmbedding(text);
      }

      try {
        return await withRateLimitRetry(
          async () => {
            const result = await ai.models.embedContent({
              model: targetModel,
              contents: text,
            });
            const values = result.embeddings?.[0]?.values;
            if (!values || !Array.isArray(values) || values.length === 0) {
              throw new Error('Gemini embedding model returned an empty vector.');
            }
            return values;
          },
          { defaultWaitMs: options?.defaultRateLimitWaitMs },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If the API key itself is leaked/invalid, surface the clear error rather than hiding key failure.
        if (isLeakedOrInvalidKeyError(msg)) {
          throw formatGeminiError(err);
        }
        // Otherwise, no free embedding model worked — fall back cleanly to local embeddings!
        console.warn(
          `[gemini] Embedding model "${targetModel}" unavailable (${formatGeminiError(err).message}); falling back to ${LOCAL_EMBEDDING_MODEL}.`,
        );
        startupState.resolvedEmbeddingModel = LOCAL_EMBEDDING_MODEL;
        startupState.usedAutoFallback = true;
        return computeLocalEmbedding(text);
      }
    },
  };
}

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

function sanitizeClaim(
  claim: ReportClaim,
  validSourceIds: Set<string>,
  researchMode: 'sonar' | 'demo' | 'none',
): ReportClaim {
  const rawSourceId = claim.sourceId ? claim.sourceId.trim() : null;
  const hasValidSource = Boolean(rawSourceId && validSourceIds.has(rawSourceId));

  if (claim.evidenceLabel === 'Verified research') {
    if (researchMode === 'none' || !hasValidSource) {
      return {
        text: claim.text,
        evidenceLabel: 'Unverified',
        sourceId: null,
      };
    }
    return {
      text: claim.text,
      evidenceLabel: 'Verified research',
      sourceId: rawSourceId,
    };
  }

  return {
    text: claim.text,
    evidenceLabel: claim.evidenceLabel,
    sourceId: hasValidSource ? rawSourceId : null,
  };
}

function sanitizeSection(
  section: ReportSection,
  validSourceIds: Set<string>,
  researchMode: 'sonar' | 'demo' | 'none',
): ReportSection {
  return {
    summary: section.summary,
    items: section.items.map((item) => sanitizeClaim(item, validSourceIds, researchMode)),
  };
}

export function enforceEvidenceAndSources(
  report: ValidationReportJson,
  validSourceIds: Set<string>,
  researchMode: 'sonar' | 'demo' | 'none',
): ValidationReportJson {
  const sanitizeScore = (s: ValidationReportJson['scores']['problemClarity']) => ({
    ...s,
    score: Math.round(s.score * 10) / 10,
    evidenceLabel:
      s.evidenceLabel === 'Verified research' && (researchMode === 'none' || validSourceIds.size === 0)
        ? ('Unverified' as const)
        : s.evidenceLabel,
  });

  return {
    disclaimer: SCORING_DISCLAIMER,
    scores: {
      problemClarity: sanitizeScore(report.scores.problemClarity),
      customerDefinition: sanitizeScore(report.scores.customerDefinition),
      competitiveDifferentiation: sanitizeScore(report.scores.competitiveDifferentiation),
      businessModelClarity: sanitizeScore(report.scores.businessModelClarity),
      financialAssumptions: sanitizeScore(report.scores.financialAssumptions),
      evidenceStrength: sanitizeScore(report.scores.evidenceStrength),
    },
    sections: {
      executiveSummary: sanitizeSection(report.sections.executiveSummary, validSourceIds, researchMode),
      ideaExplanation: sanitizeSection(report.sections.ideaExplanation, validSourceIds, researchMode),
      problemSolutionFit: sanitizeSection(report.sections.problemSolutionFit, validSourceIds, researchMode),
      targetCustomers: sanitizeSection(report.sections.targetCustomers, validSourceIds, researchMode),
      marketOpportunity: sanitizeSection(report.sections.marketOpportunity, validSourceIds, researchMode),
      competitors: sanitizeSection(report.sections.competitors, validSourceIds, researchMode),
      usp: sanitizeSection(report.sections.usp, validSourceIds, researchMode),
      swot: {
        strengths: report.sections.swot.strengths.map((c) => sanitizeClaim(c, validSourceIds, researchMode)),
        weaknesses: report.sections.swot.weaknesses.map((c) => sanitizeClaim(c, validSourceIds, researchMode)),
        opportunities: report.sections.swot.opportunities.map((c) => sanitizeClaim(c, validSourceIds, researchMode)),
        threats: report.sections.swot.threats.map((c) => sanitizeClaim(c, validSourceIds, researchMode)),
      },
      businessModel: sanitizeSection(report.sections.businessModel, validSourceIds, researchMode),
      revenueModel: sanitizeSection(report.sections.revenueModel, validSourceIds, researchMode),
      financialFeasibility: sanitizeSection(report.sections.financialFeasibility, validSourceIds, researchMode),
      risks: sanitizeSection(report.sections.risks, validSourceIds, researchMode),
      mvpRecommendations: sanitizeSection(report.sections.mvpRecommendations, validSourceIds, researchMode),
      customerAcquisition: sanitizeSection(report.sections.customerAcquisition, validSourceIds, researchMode),
      marketing: sanitizeSection(report.sections.marketing, validSourceIds, researchMode),
      goToMarket: sanitizeSection(report.sections.goToMarket, validSourceIds, researchMode),
      thirtyDayPlan: sanitizeSection(report.sections.thirtyDayPlan, validSourceIds, researchMode),
      ninetyDayRoadmap: sanitizeSection(report.sections.ninetyDayRoadmap, validSourceIds, researchMode),
    },
  };
}

export interface ReportPromptInput {
  planName: string;
  planSlug: string;
  cleanedIdeaText: string;
  concepts: string[];
  similarIdeas: Array<{ title: string; similarityScore: number }>;
  researchMode: 'sonar' | 'demo' | 'none';
  sources: Array<{ sourceRef: string; title: string; url: string; snippet: string; isDemo: boolean }>;
  computedFinancialsNote: string;
}

function buildReportPrompt(input: ReportPromptInput): string {
  const sectionKeysList = REPORT_SECTION_META.map((s) => `- ${s.key} (${s.code}: ${s.title})`).join('\n');
  const sourcesBlock =
    input.sources.length > 0
      ? input.sources
          .map(
            (s) =>
              `[${s.sourceRef}]${s.isDemo ? ' [DEMO DATA]' : ''} ${s.title} (${s.url})\nSnippet: ${s.snippet}`,
          )
          .join('\n\n')
      : 'NO EXTERNAL RESEARCH SOURCES AVAILABLE (Research is Not configured).';

  const similarBlock =
    input.similarIdeas.length > 0
      ? input.similarIdeas
          .map((s) => `- "${s.title}" (cosine similarity: ${s.similarityScore.toFixed(2)})`)
          .join('\n')
      : 'No prior ideas in this user workspace for similarity comparison.';

  const researchRule =
    input.researchMode === 'none'
      ? `CRITICAL: External research is NOT configured. You MUST NOT invent any market size numbers (TAM/SAM/SOM), competitor pricing, growth rates, or URLs. For marketOpportunity and competitor stats lacking user input, explicitly state "Not enough reliable data found" and label those items "Unverified". NEVER use "Verified research" when no sources exist.`
      : `CRITICAL: You may ONLY use "Verified research" when directly citing one of the provided source IDs (${input.sources.map((s) => s.sourceRef).join(', ')}) in "sourceId". Never invent statistics or URLs outside those sources. Keep sourceId null for AI interpretation, User assumption, or Unverified items.`;

  return `You are VenturePilot AI, a rigorous startup validation analyst.
Generate a structured JSON validation report for the founder's startup idea below.

PLAN TIER: ${input.planName} (${input.planSlug})

CLEANED FOUNDER IDEA INPUT:
${input.cleanedIdeaText}

EXTRACTED KEY CONCEPTS:
${input.concepts.join(', ')}

SIMILAR IDEAS IN THIS USER'S OWN WORKSPACE:
${similarBlock}

DETERMINISTIC FINANCIAL SANITY CHECK (INR):
${input.computedFinancialsNote}

RESEARCH SOURCES (researchMode=${input.researchMode}):
${sourcesBlock}

${researchRule}

STRICT RULES:
1. Return ONLY valid JSON matching the exact schema below. Do not wrap in markdown code fences.
2. "disclaimer" MUST equal exactly: "${SCORING_DISCLAIMER}"
3. Every score in "scores" must be a number from 0 to 10 with a concise "explanation" and "evidenceLabel".
4. Every claim item must have: { "text": string, "evidenceLabel": "Verified research" | "AI interpretation" | "User assumption" | "Unverified", "sourceId": string | null }.
5. Include ALL 18 sections under "sections":
${sectionKeysList}
6. For "swot", return: { "strengths": Claim[], "weaknesses": Claim[], "opportunities": Claim[], "threats": Claim[] } (at least 2 items each).
7. For all other 17 sections, return: { "summary": string, "items": Claim[] } (at least 2 items each).
8. Clearly distinguish founder-entered facts ("User assumption"), your analytical synthesis ("AI interpretation"), cited source facts ("Verified research" with matching sourceId), and unsupported/missing claims ("Unverified").

JSON SCHEMA SHAPE:
{
  "disclaimer": "${SCORING_DISCLAIMER}",
  "scores": {
    "problemClarity": { "score": 0-10, "explanation": "...", "evidenceLabel": "..." },
    "customerDefinition": { "score": 0-10, "explanation": "...", "evidenceLabel": "..." },
    "competitiveDifferentiation": { "score": 0-10, "explanation": "...", "evidenceLabel": "..." },
    "businessModelClarity": { "score": 0-10, "explanation": "...", "evidenceLabel": "..." },
    "financialAssumptions": { "score": 0-10, "explanation": "...", "evidenceLabel": "..." },
    "evidenceStrength": { "score": 0-10, "explanation": "...", "evidenceLabel": "..." }
  },
  "sections": {
    "executiveSummary": { "summary": "...", "items": [{ "text": "...", "evidenceLabel": "...", "sourceId": null }] },
    "ideaExplanation": { "summary": "...", "items": [...] },
    "problemSolutionFit": { "summary": "...", "items": [...] },
    "targetCustomers": { "summary": "...", "items": [...] },
    "marketOpportunity": { "summary": "...", "items": [...] },
    "competitors": { "summary": "...", "items": [...] },
    "usp": { "summary": "...", "items": [...] },
    "swot": { "strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...] },
    "businessModel": { "summary": "...", "items": [...] },
    "revenueModel": { "summary": "...", "items": [...] },
    "financialFeasibility": { "summary": "...", "items": [...] },
    "risks": { "summary": "...", "items": [...] },
    "mvpRecommendations": { "summary": "...", "items": [...] },
    "customerAcquisition": { "summary": "...", "items": [...] },
    "marketing": { "summary": "...", "items": [...] },
    "goToMarket": { "summary": "...", "items": [...] },
    "thirtyDayPlan": { "summary": "...", "items": [...] },
    "ninetyDayRoadmap": { "summary": "...", "items": [...] }
  }
}`;
}

function parseAndValidateReportJson(raw: string): {
  ok: true;
  data: ValidationReportJson;
} | {
  ok: false;
  errorMessage: string;
} {
  const cleaned = stripJsonCodeFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Unable to parse JSON'}`,
    };
  }

  const result = validationReportJsonSchema.safeParse(parsed);
  if (!result.success) {
    const issueSummary = result.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      errorMessage: `Schema validation failed: ${issueSummary}`,
    };
  }

  return { ok: true, data: result.data };
}

export async function generateStructuredReportJson(
  driver: LlmDriver,
  input: ReportPromptInput,
): Promise<{ report: ValidationReportJson; attempts: number; repaired: boolean }> {
  const validSourceIds = new Set(input.sources.map((s) => s.sourceRef));
  const initialPrompt = buildReportPrompt(input);

  const firstRaw = await driver.generateJson(initialPrompt);
  const firstCheck = parseAndValidateReportJson(firstRaw);
  if (firstCheck.ok) {
    return {
      report: enforceEvidenceAndSources(firstCheck.data, validSourceIds, input.researchMode),
      attempts: 1,
      repaired: false,
    };
  }

  // Retry once with an explicit repair prompt containing the exact validation error.
  const repairPrompt = `${initialPrompt}

PREVIOUS OUTPUT WAS INVALID AND REJECTED.
Validation Error: ${firstCheck.errorMessage}
Invalid Output Snippet: ${firstRaw.slice(0, 1500)}

Fix the JSON so it strictly matches the required schema, includes all 18 sections (A-R), all 6 scores (0-10), and returns ONLY raw JSON with no markdown fences.`;

  const secondRaw = await driver.generateJson(repairPrompt);
  const secondCheck = parseAndValidateReportJson(secondRaw);
  if (secondCheck.ok) {
    return {
      report: enforceEvidenceAndSources(secondCheck.data, validSourceIds, input.researchMode),
      attempts: 2,
      repaired: true,
    };
  }

  throw new Error(
    `AI report JSON failed validation after 1 automatic retry (${secondCheck.errorMessage}). You can retry this job for free.`,
  );
}
