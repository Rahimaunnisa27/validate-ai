import {
  competitorDifferentiationJsonSchema,
  discoveredCompetitorsJsonSchema,
  type CompetitorDiscoverInput,
  type DifferentiationOpportunity,
} from '../../src/shared/phase3bSchemas.ts';
import { AppError } from '../utils/errors.ts';
import {
  createGeminiDriver,
  getGeminiSetupSteps,
  isGeminiConfigured,
  type LlmDriver,
} from './llmClient.ts';
import type { Phase3bSource } from './phase3bResearch.ts';
import type { ResearchMode } from './research.ts';

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

export interface DiscoveredCompetitorDraft {
  name: string;
  website: string;
  description: string;
  pricing: string;
  features: string[];
  strengths: string[];
  weaknesses: string[];
  notes: string;
  sourceUrl: string;
  researchedDate: string;
  sourceType: 'researched';
  isDemo: boolean;
  evidenceLabel: 'Verified research' | 'AI interpretation';
}

export async function discoverCompetitorsFromSources(params: {
  input: CompetitorDiscoverInput;
  sources: Phase3bSource[];
  researchMode: ResearchMode;
  sonarSummary: string;
  driverOverride?: LlmDriver;
}): Promise<DiscoveredCompetitorDraft[]> {
  if (!params.driverOverride && !isGeminiConfigured()) {
    throw new AppError(
      503,
      'LLM_NOT_CONFIGURED',
      'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to process competitor discovery.',
      { setupSteps: getGeminiSetupSteps() },
    );
  }

  const driver = params.driverOverride ?? createGeminiDriver();
  const sourcesByRef = new Map(params.sources.map((s) => [s.sourceRef, s]));
  const sourcesBlock = params.sources
    .map(
      (s) =>
        `[${s.sourceRef}]${s.isDemo ? ' [DEMO DATA]' : ''} ${s.title} (${s.url})\nSnippet: ${s.snippet}`,
    )
    .join('\n\n');

  const prompt = `You are a competitive intelligence analyst.
Extract or summarize competitor archetypes strictly grounded in the retrieved sources below.

MARKET CONTEXT:
- Industry: ${params.input.industry}
- Product or Service: ${params.input.productOrService}
- Location: ${params.input.location}
${params.input.targetCustomer ? `- Target Customer: ${params.input.targetCustomer}` : ''}

RETRIEVED SOURCES (mode=${params.researchMode}):
${sourcesBlock}
${params.sonarSummary ? `\nSONAR BRIEF:\n${params.sonarSummary.slice(0, 2000)}` : ''}

RULES:
1. Every competitor MUST reference a valid "sourceId" from: ${params.sources.map((s) => s.sourceRef).join(', ')}.
2. Do NOT invent competitor URLs or pricing numbers not present in the sources; use "" for website and "Not disclosed in retrieved sources" for pricing if unknown.
3. If mode=demo, prefix competitor names cleanly with "[DEMO DATA] " so sample entries are unmistakable.
4. Return 2-4 competitors as ONLY valid JSON matching:
{
  "competitors": [
    {
      "name": "...",
      "website": "",
      "description": "...",
      "pricing": "Not disclosed in retrieved sources",
      "features": ["...", "..."],
      "strengths": ["...", "..."],
      "weaknesses": ["...", "..."],
      "notes": "...",
      "sourceId": "SRC-1"
    }
  ]
}`;

  const parse = (raw: string) => {
    try {
      const parsed = JSON.parse(stripJsonCodeFences(raw));
      const checked = discoveredCompetitorsJsonSchema.safeParse(parsed);
      if (!checked.success) {
        return {
          ok: false as const,
          errorMessage: checked.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        };
      }
      return { ok: true as const, data: checked.data };
    } catch (err) {
      return {
        ok: false as const,
        errorMessage: err instanceof Error ? err.message : 'Invalid JSON',
      };
    }
  };

  let raw = await driver.generateJson(prompt);
  let check = parse(raw);
  if (!check.ok) {
    raw = await driver.generateJson(
      `${prompt}\n\nPREVIOUS OUTPUT INVALID: ${check.errorMessage}\nReturn ONLY valid JSON.`,
    );
    check = parse(raw);
  }
  if (!check.ok) {
    throw new AppError(
      502,
      'COMPETITOR_DISCOVERY_FAILED',
      `Competitor discovery JSON failed validation (${check.errorMessage}).`,
    );
  }

  const results: DiscoveredCompetitorDraft[] = [];
  for (const item of check.data.competitors) {
    const src = sourcesByRef.get(item.sourceId.trim());
    if (!src) continue;
    const isDemo = src.isDemo;
    const cleanName =
      isDemo && !item.name.startsWith('[DEMO DATA]') ? `[DEMO DATA] ${item.name}` : item.name;
    results.push({
      name: cleanName,
      website: item.website,
      description: item.description,
      pricing: item.pricing || 'Not disclosed in retrieved sources',
      features: item.features,
      strengths: item.strengths,
      weaknesses: item.weaknesses,
      notes: item.notes,
      sourceUrl: src.url,
      researchedDate: src.retrievedAt,
      sourceType: 'researched',
      isDemo,
      evidenceLabel: isDemo ? 'AI interpretation' : 'Verified research',
    });
  }

  if (results.length === 0) {
    throw new AppError(
      502,
      'COMPETITOR_DISCOVERY_FAILED',
      'No competitors could be matched to valid retrieved sources.',
    );
  }

  return results;
}

export interface CompetitorSummaryForDiff {
  name: string;
  pricing: string;
  features: string[];
  strengths: string[];
  weaknesses: string[];
  notes: string;
  sourceType: 'manual' | 'researched';
}

export async function generateDifferentiationOpportunities(params: {
  competitors: CompetitorSummaryForDiff[];
  driverOverride?: LlmDriver;
}): Promise<DifferentiationOpportunity[]> {
  if (params.competitors.length === 0) {
    throw new AppError(
      400,
      'NO_COMPETITORS',
      'Add or discover at least one competitor before generating differentiation opportunities.',
    );
  }

  if (!params.driverOverride && !isGeminiConfigured()) {
    throw new AppError(
      503,
      'LLM_NOT_CONFIGURED',
      'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to generate AI differentiation opportunities.',
      { setupSteps: getGeminiSetupSteps() },
    );
  }

  const driver = params.driverOverride ?? createGeminiDriver();
  const competitorBlock = params.competitors
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} (${c.sourceType}) | Pricing: ${c.pricing || 'N/A'}\n   Features: ${c.features.join(', ') || 'None listed'}\n   Strengths: ${c.strengths.join(', ') || 'None listed'}\n   Weaknesses: ${c.weaknesses.join(', ') || 'None listed'}\n   Notes: ${c.notes || 'None'}`,
    )
    .join('\n\n');

  const prompt = `You are a startup positioning strategist.
Analyze the founder's saved competitor matrix below and identify 3 to 5 practical differentiation opportunities.

COMPETITORS:
${competitorBlock}

RULES:
1. Do NOT invent external statistics or market claims. Base your synthesis strictly on the competitor gaps above.
2. Every opportunity MUST have "evidenceLabel": "AI interpretation".
3. Return ONLY valid JSON matching:
{
  "opportunities": [
    {
      "title": "Short differentiation angle",
      "rationale": "2-3 sentences explaining which competitor weakness/pricing gap this exploits and how to test it.",
      "evidenceLabel": "AI interpretation"
    }
  ]
}`;

  const parse = (raw: string) => {
    try {
      const parsed = JSON.parse(stripJsonCodeFences(raw));
      const checked = competitorDifferentiationJsonSchema.safeParse(parsed);
      if (!checked.success) {
        return {
          ok: false as const,
          errorMessage: checked.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        };
      }
      return { ok: true as const, data: checked.data };
    } catch (err) {
      return {
        ok: false as const,
        errorMessage: err instanceof Error ? err.message : 'Invalid JSON',
      };
    }
  };

  let raw = await driver.generateJson(prompt);
  let check = parse(raw);
  if (!check.ok) {
    raw = await driver.generateJson(
      `${prompt}\n\nPREVIOUS OUTPUT INVALID: ${check.errorMessage}\nReturn ONLY valid JSON.`,
    );
    check = parse(raw);
  }
  if (!check.ok) {
    throw new AppError(
      502,
      'DIFFERENTIATION_FAILED',
      `AI differentiation JSON failed validation (${check.errorMessage}).`,
    );
  }

  return check.data.opportunities.map((o) => ({
    title: o.title,
    rationale: o.rationale,
    evidenceLabel: 'AI interpretation' as const,
  }));
}
