import {
  roadmapPlanJsonSchema,
  type RoadmapDuration,
  type RoadmapPlanJson,
} from '../../src/shared/phase5Schemas.ts';
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

export interface RoadmapAiInput {
  title: string;
  industry?: string;
  problem?: string;
  targetCustomer?: string;
  product?: string;
  reportContext?: string;
  durationDays: RoadmapDuration;
  customFocus?: string;
}

function buildRoadmapPrompt(input: RoadmapAiInput): string {
  const phaseGuidance =
    input.durationDays === 30
      ? 'Divide the 30-day plan into 3 progressive phases (Phase 1: Days 1-10 Validation & Setup, Phase 2: Days 11-20 Prototype & Channel Testing, Phase 3: Days 21-30 Pilot Launch & First Users).'
      : input.durationDays === 60
        ? 'Divide the 60-day plan into 4 progressive phases (Phase 1: Days 1-15 Discovery & Validation, Phase 2: Days 16-30 MVP Build & Testing, Phase 3: Days 31-45 Beta Outreach & Early Traction, Phase 4: Days 46-60 Conversion & Review).'
        : 'Divide the 90-day plan into 3 monthly phases (Phase 1: Month 1 Validation & MVP Blueprint, Phase 2: Month 2 Build & Pilot Testing, Phase 3: Month 3 Go-To-Market & Revenue Milestones).';

  return `You are a world-class startup execution advisor and lean startup coach.
Generate a high-impact, realistic ${input.durationDays}-day execution roadmap for a startup founder.

STARTUP CONTEXT:
- Title: ${input.title}
${input.industry ? `- Industry: ${input.industry}` : ''}
${input.problem ? `- Problem: ${input.problem}` : ''}
${input.targetCustomer ? `- Target Customer: ${input.targetCustomer}` : ''}
${input.product ? `- Product / Solution: ${input.product}` : ''}
${input.reportContext ? `- Validation Insights: ${input.reportContext}` : ''}
${input.customFocus ? `- Founder's Strategic Focus: ${input.customFocus}` : ''}

ROADMAP REQUIREMENTS:
1. Duration: ${input.durationDays} calendar days.
2. Structure: ${phaseGuidance}
3. Each phase must contain clear actionable milestones and at least 3-5 concrete tasks.
4. Each task must specify:
   - title: concise actionable verb-led title (e.g., "Conduct 15 customer discovery interviews")
   - description: step-by-step guidance on how to execute
   - priority: 'low' | 'medium' | 'high' | 'urgent'
   - dayOffsetStart: integer from 0 to ${input.durationDays - 5} representing start day relative to day 0
   - dayOffsetDue: integer from 1 to ${input.durationDays} representing due day relative to day 0
   - expectedOutcome: verifiable deliverable (e.g., "Summary document with 15 transcribed interview notes and top 3 validated pain points")
   - notes: practical tips, recommended tools, or risk alerts

STRICT RULES:
- Return ONLY valid JSON matching the exact schema below. Do not wrap in markdown fences or include introductory text.
- Do NOT generate fake testimonials or ungrounded claims. Focus on pragmatic lean execution.

REQUIRED JSON FORMAT:
{
  "title": "${input.durationDays}-Day Execution Roadmap: ${input.title}",
  "summary": "2-3 sentence strategic executive summary of the plan and target outcomes.",
  "targetMarket": "Specific customer segment being targeted during this timeframe",
  "keyRisks": [
    "Key execution risk and mitigation tactic",
    "Customer adoption risk and mitigation tactic"
  ],
  "phases": [
    {
      "phaseNumber": 1,
      "name": "Phase Name",
      "timeframe": "Days 1-10",
      "objective": "Primary objective of this phase",
      "milestones": [
        "Milestone 1 to achieve",
        "Milestone 2 to achieve"
      ],
      "tasks": [
        {
          "title": "Actionable task title",
          "description": "Clear execution instructions",
          "priority": "high",
          "dayOffsetStart": 0,
          "dayOffsetDue": 5,
          "expectedOutcome": "Measurable deliverable",
          "notes": "Helpful execution tip or tooling recommendation"
        }
      ]
    }
  ]
}`;
}

function parseRoadmapPlanJson(
  raw: string,
): { ok: true; data: RoadmapPlanJson } | { ok: false; errorMessage: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFences(raw));
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Parse error'}`,
    };
  }

  const checked = roadmapPlanJsonSchema.safeParse(parsed);
  if (!checked.success) {
    const summary = checked.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { ok: false, errorMessage: `Schema validation failed: ${summary}` };
  }

  return { ok: true, data: checked.data };
}

export async function generateRoadmapPlan(
  input: RoadmapAiInput,
  driverOverride?: LlmDriver,
): Promise<{
  plan: RoadmapPlanJson;
  evidenceLabel: 'AI interpretation';
}> {
  if (!driverOverride && !isGeminiConfigured()) {
    throw new AppError(
      503,
      'LLM_NOT_CONFIGURED',
      'Gemini API is not configured. Add GEMINI_API_KEY in Settings > Secrets to generate startup roadmaps.',
      { setupSteps: getGeminiSetupSteps() },
    );
  }

  const driver = driverOverride ?? createGeminiDriver();
  const prompt = buildRoadmapPrompt(input);

  const firstRaw = await driver.generateJson(prompt);
  const firstParsed = parseRoadmapPlanJson(firstRaw);
  if (firstParsed.ok) {
    return { plan: firstParsed.data, evidenceLabel: 'AI interpretation' };
  }

  // Single automatic retry with error feedback
  const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous output failed schema validation with: ${firstParsed.errorMessage}. Please return valid JSON strictly matching the requested format.`;
  const secondRaw = await driver.generateJson(retryPrompt);
  const secondParsed = parseRoadmapPlanJson(secondRaw);
  if (secondParsed.ok) {
    return { plan: secondParsed.data, evidenceLabel: 'AI interpretation' };
  }

  throw new AppError(
    502,
    'LLM_PARSE_ERROR',
    `Failed to generate a valid roadmap plan: ${secondParsed.errorMessage}`,
  );
}
