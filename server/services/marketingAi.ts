import {
  classifyBudgetTier,
  marketingStrategyJsonSchema,
  verifyAndNormalizeBudgetAllocation,
  type BudgetTier,
  type MarketingInput,
  type MarketingStrategyJson,
} from '../../src/shared/phase4Schemas.ts';
import { AppError } from '../utils/errors.ts';
import {
  createGeminiDriver,
  getGeminiSetupSteps,
  isGeminiConfigured,
  type LlmDriver,
} from './llmClient.ts';

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

function buildMarketingPrompt(input: MarketingInput, tier: BudgetTier): string {
  const tierGuidance =
    tier === 'low'
      ? 'LOW BUDGET TIER (< INR 50,000): Prioritize organic founder-led distribution, zero-cost partnerships, targeted community outreach, WhatsApp/LinkedIn direct engagement, and tightly scoped micro-experiments. Avoid expensive broad paid ads or agency retainers.'
      : tier === 'medium'
        ? 'MEDIUM BUDGET TIER (INR 50,000 - 3,00,000): Combine organic authority content and outbound SDR sequences with focused high-intent search/social experiments, referral incentives, and repeatable conversion landing pages.'
        : 'HIGH BUDGET TIER (> INR 3,00,000): Combine multi-channel demand capture (paid search/social, sponsorships, field events, outbound tooling, PR/case studies) with clear attribution, retargeting, and dedicated content production.';

  return `You are a startup growth and marketing strategist.
Generate a structured JSON marketing strategy tailored specifically to the founder's budget tier and inputs.

FOUNDER INPUTS:
- Business Description: ${input.businessDescription}
- Target Audience: ${input.targetAudience}
- Industry: ${input.industry}
- Market / Geography: ${input.market}
- Total Budget: INR ${input.budget.toLocaleString('en-IN')} (${tier.toUpperCase()} BUDGET TIER)
- Preferred Channels: ${input.preferredChannels.join(', ')}

BUDGET TIER GUIDANCE:
${tierGuidance}

STRICT RULES:
1. Return ONLY valid JSON matching the exact schema below. Do not wrap in markdown fences.
2. Do NOT invent fake benchmark CTR/ROAS/conversion percentages or unverified market statistics. Focus on actionable plans, messaging, and measurable KPI targets framed as milestones/notes.
3. In "budgetAllocation", percentages MUST sum to exactly 100 and amounts MUST sum to exactly ${input.budget}.
4. Every campaign and suggestion must be realistic for the ${tier} budget tier.

REQUIRED JSON SHAPE:
{
  "campaignTitle": "Short strategy title",
  "positioning": "2-3 sentence market positioning statement",
  "objectives": ["Objective 1", "Objective 2", "Objective 3"],
  "channels": [
    { "channel": "Channel name", "priority": "Primary" | "Secondary", "rationale": "Why it fits this audience & budget" }
  ],
  "socialStrategy": {
    "cadence": "Recommended weekly publishing & engagement cadence",
    "formats": ["Format 1", "Format 2"],
    "themes": ["Theme 1", "Theme 2", "Theme 3"]
  },
  "contentIdeas": [
    { "title": "Content title", "format": "Article / Video / Checklist / Case Study", "angle": "Specific problem-solving angle" }
  ],
  "campaigns": [
    { "name": "Campaign name", "goal": "Goal", "channel": "Channel", "actionSteps": ["Step 1", "Step 2"] }
  ],
  "budgetAllocation": [
    { "channel": "Channel or activity", "percentage": 40, "amount": ${Math.round(input.budget * 0.4)}, "rationale": "Specific allocation reason" }
  ],
  "acquisitionSuggestions": ["Practical acquisition tactic 1", "Practical acquisition tactic 2"],
  "kpis": [
    { "metric": "KPI name", "targetNote": "Measurement cadence & realistic milestone note" }
  ]
}`;
}

function parseMarketingJson(
  raw: string,
  budgetInr: number,
):
  | { ok: true; data: MarketingStrategyJson; wasCorrected: boolean }
  | { ok: false; errorMessage: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFences(raw));
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Parse error'}`,
    };
  }

  const checked = marketingStrategyJsonSchema.safeParse(parsed);
  if (!checked.success) {
    const summary = checked.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { ok: false, errorMessage: `Schema validation failed: ${summary}` };
  }

  try {
    const verified = verifyAndNormalizeBudgetAllocation(checked.data.budgetAllocation, budgetInr);
    return {
      ok: true,
      data: {
        ...checked.data,
        budgetAllocation: verified.items,
      },
      wasCorrected: verified.wasCorrected,
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'Budget allocation verification failed.',
    };
  }
}

export async function generateMarketingStrategy(
  input: MarketingInput,
  driverOverride?: LlmDriver,
): Promise<{
  budgetTier: BudgetTier;
  strategy: MarketingStrategyJson;
  allocationAdjusted: boolean;
  evidenceLabel: 'AI interpretation';
}> {
  if (!driverOverride && !isGeminiConfigured()) {
    throw new AppError(
      503,
      'LLM_NOT_CONFIGURED',
      'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to generate marketing strategies.',
      { setupSteps: getGeminiSetupSteps() },
    );
  }

  const budgetTier = classifyBudgetTier(input.budget);
  const driver = driverOverride ?? createGeminiDriver();
  const prompt = buildMarketingPrompt(input, budgetTier);

  const firstRaw = await driver.generateJson(prompt);
  const firstCheck = parseMarketingJson(firstRaw, input.budget);
  if (firstCheck.ok) {
    return {
      budgetTier,
      strategy: firstCheck.data,
      allocationAdjusted: firstCheck.wasCorrected,
      evidenceLabel: 'AI interpretation',
    };
  }

  const repairPrompt = `${prompt}

PREVIOUS OUTPUT WAS INVALID: ${firstCheck.errorMessage}
Invalid snippet: ${firstRaw.slice(0, 1200)}
Fix the JSON so budgetAllocation percentages sum to 100 and amounts sum to ${input.budget}, and return ONLY valid JSON.`;

  const secondRaw = await driver.generateJson(repairPrompt);
  const secondCheck = parseMarketingJson(secondRaw, input.budget);
  if (secondCheck.ok) {
    return {
      budgetTier,
      strategy: secondCheck.data,
      allocationAdjusted: secondCheck.wasCorrected,
      evidenceLabel: 'AI interpretation',
    };
  }

  throw new AppError(
    502,
    'MARKETING_GENERATION_FAILED',
    `AI marketing strategy JSON failed validation after retry (${secondCheck.errorMessage}).`,
  );
}
