import type {
  ComputedFinancialModel,
  FinancialPlanInputs,
} from '../../src/shared/phase3aSchemas.ts';
import {
  createGeminiDriver,
  isGeminiConfigured,
  type LlmDriver,
} from './llmClient.ts';

/**
 * Generates a plain-language "AI interpretation" of server-computed financial numbers.
 * Never performs financial math itself, and returns null cleanly when Gemini is not configured.
 */
export async function generateFinancialInterpretation(
  inputs: FinancialPlanInputs,
  computed: ComputedFinancialModel,
  driverOverride?: LlmDriver,
): Promise<string | null> {
  if (!driverOverride && !isGeminiConfigured()) {
    return null;
  }

  const driver = driverOverride ?? createGeminiDriver();
  const { conservative, expected, optimistic } = computed.scenarios;

  const prompt = `You are a concise startup finance advisor explaining ALREADY-COMPUTED financial metrics in plain English for a founder.
DO NOT recompute or alter any numbers. Only explain what the computed numbers below imply about unit economics, break-even, burn, and runway.

PLAN: ${inputs.name}
INPUTS (INR):
- Initial investment: INR ${inputs.initialInvestment}
- Selling price per unit: INR ${inputs.sellingPrice}
- Base units/month: ${inputs.unitsSoldPerMonth}
- Variable cost per unit: INR ${inputs.variableCostPerUnit}
- Monthly fixed costs: INR ${inputs.fixedCosts}, Marketing: INR ${inputs.marketing}, Salaries: INR ${inputs.salaries}, Operational expenses: INR ${inputs.operationalExpenses}

SERVER-COMPUTED SCENARIOS (DO NOT CHANGE THESE NUMBERS):
1. Conservative (${conservative.revenueMultiplier}x units, ${conservative.costMultiplier}x costs):
   Revenue=INR ${conservative.revenue}/mo, Expenses=INR ${conservative.totalExpenses}/mo, ContributionMargin/Unit=INR ${conservative.contributionMarginPerUnit}, GrossProfit=INR ${conservative.grossProfit}/mo, OperatingProfit=INR ${conservative.operatingProfit}/mo, BreakEvenUnits=${conservative.breakEvenUnits ?? 'Unreachable'}, Runway=${conservative.runwayLabel}, Month-12 Cash=INR ${conservative.cashFlow12Months[11].cashBalance}
2. Expected (${expected.revenueMultiplier}x units, ${expected.costMultiplier}x costs):
   Revenue=INR ${expected.revenue}/mo, Expenses=INR ${expected.totalExpenses}/mo, ContributionMargin/Unit=INR ${expected.contributionMarginPerUnit}, GrossProfit=INR ${expected.grossProfit}/mo, OperatingProfit=INR ${expected.operatingProfit}/mo, BreakEvenUnits=${expected.breakEvenUnits ?? 'Unreachable'}, Runway=${expected.runwayLabel}, Month-12 Cash=INR ${expected.cashFlow12Months[11].cashBalance}
3. Optimistic (${optimistic.revenueMultiplier}x units, ${optimistic.costMultiplier}x costs):
   Revenue=INR ${optimistic.revenue}/mo, Expenses=INR ${optimistic.totalExpenses}/mo, ContributionMargin/Unit=INR ${optimistic.contributionMarginPerUnit}, GrossProfit=INR ${optimistic.grossProfit}/mo, OperatingProfit=INR ${optimistic.operatingProfit}/mo, BreakEvenUnits=${optimistic.breakEvenUnits ?? 'Unreachable'}, Runway=${optimistic.runwayLabel}, Month-12 Cash=INR ${optimistic.cashFlow12Months[11].cashBalance}

Return ONLY valid JSON:
{
  "interpretation": "AI interpretation: <3-5 concise sentences covering expected profitability/burn, break-even feasibility, downside risk in the conservative scenario, and one practical lever to test>"
}`;

  try {
    const raw = await driver.generateJson(prompt);
    const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    const parsed = JSON.parse(cleaned) as { interpretation?: string };
    const text = parsed?.interpretation?.trim();
    if (!text) return null;
    return text.startsWith('AI interpretation') ? text : `AI interpretation: ${text}`;
  } catch (err) {
    console.warn(
      '[finance-ai] Failed to generate AI interpretation; keeping computed numbers intact:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
