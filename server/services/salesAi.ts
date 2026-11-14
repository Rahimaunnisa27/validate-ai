import {
  salesPlaybookJsonSchema,
  type SalesInput,
  type SalesPlaybookJson,
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

function buildSalesPrompt(input: SalesInput): string {
  return `You are a practical B2B/B2C startup sales coach.
Generate a complete, editable sales assistant playbook with outreach and follow-up drafts tailored to the founder's inputs.

FOUNDER INPUTS:
- Product Description: ${input.productDescription}
- Target Customer: ${input.targetCustomer}
- Price Point: ${input.pricePoint}
- Primary Sales Channel: ${input.salesChannel}
- Core Value Proposition: ${input.valueProposition}
- Desired Tone: ${input.tone}

STRICT RULES:
1. Return ONLY valid JSON matching the exact schema below. Do not wrap in markdown fences.
2. Never invent customer testimonials, case study metrics, or fake statistics. Use realistic placeholders like [Recipient Name] or [Company] where personalization is needed.
3. Keep all drafts ready for the founder to review, edit, and copy manually.

REQUIRED JSON SHAPE:
{
  "title": "Short playbook title",
  "salesStrategy": "Multi-paragraph practical sales strategy tailored to this price point and channel",
  "pitch": "Concise 30-second elevator pitch plus discovery call opener",
  "productPositioning": "Clear positioning statement covering who it is for, pain solved, and why now",
  "pricingSuggestions": "Actionable pricing framing, packaging/pilot offer, and objection handling guidance",
  "funnelRecommendations": "Step-by-step pipeline stages from first touch to conversion and onboarding",
  "outreachDrafts": [
    { "channel": "Cold Email", "subject": "Clear subject line", "message": "Editable outreach draft body" },
    { "channel": "LinkedIn / WhatsApp", "subject": "Direct Message Opener", "message": "Editable short DM draft" }
  ],
  "followUpDrafts": [
    { "step": "Follow-up 1", "timing": "Day 3 after initial message", "subject": "Subject", "message": "Editable follow-up body" },
    { "step": "Follow-up 2", "timing": "Day 7 value-add check-in", "subject": "Subject", "message": "Editable follow-up body" }
  ]
}`;
}

function parseSalesPlaybookJson(
  raw: string,
): { ok: true; data: SalesPlaybookJson } | { ok: false; errorMessage: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFences(raw));
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Parse error'}`,
    };
  }

  const checked = salesPlaybookJsonSchema.safeParse(parsed);
  if (!checked.success) {
    const summary = checked.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { ok: false, errorMessage: `Schema validation failed: ${summary}` };
  }

  return { ok: true, data: checked.data };
}

export async function generateSalesPlaybook(
  input: SalesInput,
  driverOverride?: LlmDriver,
): Promise<{
  playbook: SalesPlaybookJson;
  evidenceLabel: 'AI interpretation';
}> {
  if (!driverOverride && !isGeminiConfigured()) {
    throw new AppError(
      503,
      'LLM_NOT_CONFIGURED',
      'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to generate sales playbooks.',
      { setupSteps: getGeminiSetupSteps() },
    );
  }

  const driver = driverOverride ?? createGeminiDriver();
  const prompt = buildSalesPrompt(input);

  const firstRaw = await driver.generateJson(prompt);
  const firstCheck = parseSalesPlaybookJson(firstRaw);
  if (firstCheck.ok) {
    return {
      playbook: firstCheck.data,
      evidenceLabel: 'AI interpretation',
    };
  }

  const repairPrompt = `${prompt}

PREVIOUS OUTPUT WAS INVALID: ${firstCheck.errorMessage}
Invalid snippet: ${firstRaw.slice(0, 1200)}
Fix and return ONLY valid JSON matching the exact schema.`;

  const secondRaw = await driver.generateJson(repairPrompt);
  const secondCheck = parseSalesPlaybookJson(secondRaw);
  if (secondCheck.ok) {
    return {
      playbook: secondCheck.data,
      evidenceLabel: 'AI interpretation',
    };
  }

  throw new AppError(
    502,
    'SALES_GENERATION_FAILED',
    `AI sales playbook JSON failed validation after retry (${secondCheck.errorMessage}).`,
  );
}
