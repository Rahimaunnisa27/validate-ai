import {
  PERSONA_DISCLAIMER,
  personaProfileJsonSchema,
  type PersonaGenerateInput,
  type PersonaProfileJson,
} from '../../src/shared/phase3aSchemas.ts';
import {
  createGeminiDriver,
  getGeminiSetupSteps,
  isGeminiConfigured,
  type LlmDriver,
} from './llmClient.ts';
import { AppError } from '../utils/errors.ts';

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

function buildPersonaPrompt(input: PersonaGenerateInput): string {
  return `You are a rigorous customer discovery strategist.
Generate a structured B2B/B2C customer persona hypothesis from the founder's inputs below.

FOUNDER INPUTS:
- Idea: ${input.idea}
- Industry: ${input.industry}
- Product: ${input.product}
- Location: ${input.location}
- Core Problem: ${input.problem}

STRICT RULES:
1. Return ONLY valid JSON matching the schema below. Do not wrap in markdown fences.
2. Be concrete and specific to "${input.industry}" in "${input.location}". Do NOT invent survey percentages or fake statistics.
3. Provide 3-5 concise bullet strings for each array field.

REQUIRED JSON SHAPE:
{
  "name": "Short persona archetype title (e.g. Regional Dairy Cold-Store Supervisor)",
  "segment": "1-2 sentence description of the specific customer segment",
  "needs": ["..."],
  "painPoints": ["..."],
  "motivations": ["..."],
  "objections": ["..."],
  "preferredChannels": ["..."],
  "purchaseConsiderations": ["..."]
}`;
}

function parsePersonaJson(raw: string):
  | { ok: true; data: PersonaProfileJson }
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
  const checked = personaProfileJsonSchema.safeParse(parsed);
  if (!checked.success) {
    const summary = checked.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { ok: false, errorMessage: `Schema validation failed: ${summary}` };
  }
  return { ok: true, data: checked.data };
}

export async function generateCustomerPersona(
  input: PersonaGenerateInput,
  driverOverride?: LlmDriver,
): Promise<{ profile: PersonaProfileJson; disclaimer: string }> {
  if (!driverOverride && !isGeminiConfigured()) {
    throw new AppError(
      503,
      'LLM_NOT_CONFIGURED',
      'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to generate customer personas.',
      { setupSteps: getGeminiSetupSteps() },
    );
  }

  const driver = driverOverride ?? createGeminiDriver();
  const prompt = buildPersonaPrompt(input);
  const firstRaw = await driver.generateJson(prompt);
  const firstCheck = parsePersonaJson(firstRaw);
  if (firstCheck.ok) {
    return { profile: firstCheck.data, disclaimer: PERSONA_DISCLAIMER };
  }

  // Retry once with repair instructions
  const repairPrompt = `${prompt}

PREVIOUS OUTPUT WAS INVALID: ${firstCheck.errorMessage}
Invalid snippet: ${firstRaw.slice(0, 1200)}
Fix and return ONLY valid JSON matching the exact schema.`;

  const secondRaw = await driver.generateJson(repairPrompt);
  const secondCheck = parsePersonaJson(secondRaw);
  if (secondCheck.ok) {
    return { profile: secondCheck.data, disclaimer: PERSONA_DISCLAIMER };
  }

  throw new AppError(
    502,
    'PERSONA_GENERATION_FAILED',
    `AI persona JSON failed validation after retry (${secondCheck.errorMessage}).`,
  );
}
