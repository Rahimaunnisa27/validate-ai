import {
  TAM_SAM_SOM_FALLBACK,
  marketResearchResultSchema,
  type MarketResearchInput,
  type MarketResearchResult,
  type MarketSizingEntry,
  type ResearchClaim,
} from '../../src/shared/phase3bSchemas.ts';
import { config } from '../config.ts';
import { AppError } from '../utils/errors.ts';
import {
  createGeminiDriver,
  getGeminiSetupSteps,
  isGeminiConfigured,
  type LlmDriver,
} from './llmClient.ts';
import {
  buildDemoSources,
  getResearchModeConfigStatus,
  queryPerplexitySonar,
  type ResearchMode,
} from './research.ts';

export interface Phase3bSource {
  sourceRef: string;
  query: string;
  url: string;
  title: string;
  snippet: string;
  retrievedAt: string;
  isDemo: boolean;
}

export type SonarQueryFn = typeof queryPerplexitySonar;

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

export async function fetchPhase3bSources(params: {
  query: string;
  industry: string;
  location: string;
  demoModeOverride?: boolean;
  sonarFn?: SonarQueryFn;
}): Promise<{
  researchMode: ResearchMode;
  statusLabel: 'Configured' | 'Demo data' | 'Not configured';
  setupSteps: string[];
  sources: Phase3bSource[];
  sonarSummary: string;
}> {
  const retrievedAt = new Date().toISOString();
  const hasSonar = Boolean(config.sonarApiKey && config.sonarApiKey.trim().length > 0) || Boolean(params.sonarFn);
  const demoMode = params.demoModeOverride ?? config.demoMode;

  if (hasSonar) {
    const fn = params.sonarFn ?? queryPerplexitySonar;
    const sonarResult = await fn(params.query);
    if (sonarResult.citations.length > 0) {
      return {
        researchMode: 'sonar',
        statusLabel: 'Configured',
        setupSteps: [],
        sonarSummary: sonarResult.summary,
        sources: sonarResult.citations.map((c, idx) => ({
          sourceRef: `SRC-${idx + 1}`,
          query: params.query,
          url: c.url,
          title: c.title,
          snippet: c.snippet,
          retrievedAt,
          isDemo: false,
        })),
      };
    }
    return {
      researchMode: 'none',
      statusLabel: 'Not configured',
      setupSteps: getResearchModeConfigStatus(demoMode).setupSteps,
      sonarSummary: '',
      sources: [],
    };
  }

  if (demoMode) {
    return {
      researchMode: 'demo',
      statusLabel: 'Demo data',
      setupSteps: getResearchModeConfigStatus(true).setupSteps,
      sonarSummary: '',
      sources: buildDemoSources({
        query: params.query,
        industry: params.industry,
        geography: params.location,
        retrievedAt,
      }),
    };
  }

  return {
    researchMode: 'none',
    statusLabel: 'Not configured',
    setupSteps: getResearchModeConfigStatus(false).setupSteps,
    sonarSummary: '',
    sources: [],
  };
}

function sanitizeResearchClaim(
  claim: ResearchClaim,
  validSourceIds: Set<string>,
  researchMode: ResearchMode,
): ResearchClaim {
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

function sanitizeSizingEntry(
  entry: MarketSizingEntry,
  sourcesByRef: Map<string, Phase3bSource>,
  researchMode: ResearchMode,
): MarketSizingEntry {
  const rawSourceId = entry.sourceId ? entry.sourceId.trim() : null;
  const citedSource = rawSourceId ? sourcesByRef.get(rawSourceId) : undefined;
  const hasNumericEvidence = Boolean(
    citedSource &&
      researchMode === 'sonar' &&
      !citedSource.isDemo &&
      /\d/.test(citedSource.snippet) &&
      entry.value.trim().toLowerCase() !== TAM_SAM_SOM_FALLBACK.toLowerCase(),
  );

  if (!hasNumericEvidence || !citedSource) {
    return {
      value: TAM_SAM_SOM_FALLBACK,
      evidenceLabel: 'Unverified',
      sourceId: null,
      note: 'No verified source with reliable market-sizing figures was found in this run.',
    };
  }

  return {
    value: entry.value.trim(),
    evidenceLabel: 'Verified research',
    sourceId: citedSource.sourceRef,
    note: entry.note.trim(),
  };
}

export function enforceMarketResearchGrounding(
  rawResult: MarketResearchResult,
  sources: Phase3bSource[],
  researchMode: ResearchMode,
): MarketResearchResult {
  const validSourceIds = new Set(sources.map((s) => s.sourceRef));
  const sourcesByRef = new Map(sources.map((s) => [s.sourceRef, s]));

  return {
    summary: sanitizeResearchClaim(rawResult.summary, validSourceIds, researchMode),
    industryTrends: rawResult.industryTrends.map((c) =>
      sanitizeResearchClaim(c, validSourceIds, researchMode),
    ),
    demandIndicators: rawResult.demandIndicators.map((c) =>
      sanitizeResearchClaim(c, validSourceIds, researchMode),
    ),
    customerProblems: rawResult.customerProblems.map((c) =>
      sanitizeResearchClaim(c, validSourceIds, researchMode),
    ),
    potentialMarketSegments: rawResult.potentialMarketSegments.map((c) =>
      sanitizeResearchClaim(c, validSourceIds, researchMode),
    ),
    tamSamSom: {
      tam: sanitizeSizingEntry(rawResult.tamSamSom.tam, sourcesByRef, researchMode),
      sam: sanitizeSizingEntry(rawResult.tamSamSom.sam, sourcesByRef, researchMode),
      som: sanitizeSizingEntry(rawResult.tamSamSom.som, sourcesByRef, researchMode),
    },
  };
}

function buildMarketResearchPrompt(params: {
  input: MarketResearchInput;
  ideaContext: string | null;
  sources: Phase3bSource[];
  researchMode: ResearchMode;
  sonarSummary: string;
}): string {
  const sourcesBlock = params.sources
    .map(
      (s) =>
        `[${s.sourceRef}]${s.isDemo ? ' [DEMO DATA]' : ''} ${s.title} (${s.url})\nSnippet: ${s.snippet}`,
    )
    .join('\n\n');

  return `You are a rigorous startup market research analyst.
Synthesize structured market research strictly from the founder's scope and the retrieved sources below.

RESEARCH SCOPE:
- Industry: ${params.input.industry}
- Business Category: ${params.input.businessCategory}
- Target Customer: ${params.input.targetCustomer}
- Location: ${params.input.location}
- Product or Service: ${params.input.productOrService}
${params.ideaContext ? `- Linked Idea Context: ${params.ideaContext}` : ''}

RETRIEVED SOURCES (mode=${params.researchMode}):
${sourcesBlock}
${params.sonarSummary ? `\nSONAR BRIEF:\n${params.sonarSummary.slice(0, 2000)}` : ''}

ANTI-FABRICATION RULES (MANDATORY):
1. NEVER invent statistics, percentages, dollar/INR market sizes, or URLs.
2. Only mark a claim "Verified research" when directly supported by a listed source ID (${params.sources.map((s) => s.sourceRef).join(', ')}) in "sourceId".
3. Use "AI interpretation" for synthesis across the inputs/sources (with "sourceId": null), "User assumption" for claims stated only in the founder inputs, and "Unverified" when evidence is missing.
4. For "tamSamSom" (tam, sam, som): ONLY provide a numeric estimate if one of the retrieved sources explicitly gives supporting market-size numbers and cite its "sourceId". Otherwise set "value" to exact string "${TAM_SAM_SOM_FALLBACK}", "evidenceLabel" to "Unverified", and "sourceId" to null.
5. Return ONLY valid JSON matching the exact shape below (no markdown fences). Provide 3-4 concise items per array.

REQUIRED JSON SHAPE:
{
  "summary": { "text": "...", "evidenceLabel": "Verified research" | "AI interpretation" | "User assumption" | "Unverified", "sourceId": "SRC-1" | null },
  "industryTrends": [{ "text": "...", "evidenceLabel": "...", "sourceId": null }],
  "demandIndicators": [{ "text": "...", "evidenceLabel": "...", "sourceId": null }],
  "customerProblems": [{ "text": "...", "evidenceLabel": "...", "sourceId": null }],
  "potentialMarketSegments": [{ "text": "...", "evidenceLabel": "...", "sourceId": null }],
  "tamSamSom": {
    "tam": { "value": "${TAM_SAM_SOM_FALLBACK}", "evidenceLabel": "Unverified", "sourceId": null, "note": "..." },
    "sam": { "value": "${TAM_SAM_SOM_FALLBACK}", "evidenceLabel": "Unverified", "sourceId": null, "note": "..." },
    "som": { "value": "${TAM_SAM_SOM_FALLBACK}", "evidenceLabel": "Unverified", "sourceId": null, "note": "..." }
  }
}`;
}

function parseResearchResult(raw: string):
  | { ok: true; data: MarketResearchResult }
  | { ok: false; errorMessage: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFences(raw));
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Invalid JSON: ${err instanceof Error ? err.message : 'Unable to parse'}`,
    };
  }
  const checked = marketResearchResultSchema.safeParse(parsed);
  if (!checked.success) {
    const summary = checked.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { ok: false, errorMessage: `Schema validation failed: ${summary}` };
  }
  return { ok: true, data: checked.data };
}

export async function runMarketResearchSynthesis(params: {
  input: MarketResearchInput;
  ideaContext: string | null;
  sources: Phase3bSource[];
  researchMode: ResearchMode;
  sonarSummary: string;
  driverOverride?: LlmDriver;
}): Promise<MarketResearchResult> {
  if (!params.driverOverride && !isGeminiConfigured()) {
    throw new AppError(
      503,
      'LLM_NOT_CONFIGURED',
      'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to synthesize market research.',
      { setupSteps: getGeminiSetupSteps() },
    );
  }

  const driver = params.driverOverride ?? createGeminiDriver();
  const prompt = buildMarketResearchPrompt(params);
  const firstRaw = await driver.generateJson(prompt);
  const firstCheck = parseResearchResult(firstRaw);
  if (firstCheck.ok) {
    return enforceMarketResearchGrounding(firstCheck.data, params.sources, params.researchMode);
  }

  const repairPrompt = `${prompt}

PREVIOUS OUTPUT WAS INVALID: ${firstCheck.errorMessage}
Invalid snippet: ${firstRaw.slice(0, 1200)}
Fix and return ONLY valid JSON matching the exact schema.`;

  const secondRaw = await driver.generateJson(repairPrompt);
  const secondCheck = parseResearchResult(secondRaw);
  if (secondCheck.ok) {
    return enforceMarketResearchGrounding(secondCheck.data, params.sources, params.researchMode);
  }

  throw new AppError(
    502,
    'MARKET_RESEARCH_FAILED',
    `AI market research JSON failed validation after retry (${secondCheck.errorMessage}).`,
  );
}
