import {
  DEFAULT_SCENARIO_MULTIPLIERS,
  SCENARIO_KEYS,
  type ComputedFinancialModel,
  type FinancialPlanInputs,
  type MonthlyCashFlowPoint,
  type ScenarioComputation,
  type ScenarioKey,
} from '../../src/shared/phase3aSchemas.ts';

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function computeScenario(
  inputs: FinancialPlanInputs,
  scenario: ScenarioKey,
): ScenarioComputation {
  const multipliers =
    inputs.scenarioMultipliers?.[scenario] ?? DEFAULT_SCENARIO_MULTIPLIERS[scenario];
  const revMult = multipliers.revenueMultiplier;
  const costMult = multipliers.costMultiplier;

  const sellingPrice = inputs.sellingPrice;
  const effectiveUnitsPerMonth = round2(inputs.unitsSoldPerMonth * revMult);
  const revenue = round2(sellingPrice * effectiveUnitsPerMonth);

  const effectiveVariableCostPerUnit = round2(inputs.variableCostPerUnit * costMult);
  const totalVariableCost = round2(effectiveVariableCostPerUnit * effectiveUnitsPerMonth);

  const baseFixedOverhead =
    inputs.fixedCosts + inputs.marketing + inputs.salaries + inputs.operationalExpenses;
  const fixedOverhead = round2(baseFixedOverhead * costMult);
  const totalExpenses = round2(totalVariableCost + fixedOverhead);

  const contributionMarginPerUnit = round2(sellingPrice - effectiveVariableCostPerUnit);
  const contributionMarginTotal = round2(revenue - totalVariableCost);
  const contributionMarginRatio =
    sellingPrice > 0 ? Math.round((contributionMarginPerUnit / sellingPrice) * 10000) / 10000 : null;

  const grossProfit = round2(revenue - totalVariableCost);
  const operatingProfit = round2(revenue - totalExpenses);

  const edgeCaseWarnings: string[] = [];

  if (sellingPrice === 0) {
    edgeCaseWarnings.push('Selling price is 0; revenue and break-even volume cannot be reached.');
  } else if (contributionMarginPerUnit <= 0) {
    edgeCaseWarnings.push(
      'Variable cost per unit is at or above selling price; unit contribution margin is non-positive so break-even cannot be reached.',
    );
  }

  let breakEvenUnits: number | null = null;
  let breakEvenRevenue: number | null = null;

  if (sellingPrice > 0 && contributionMarginPerUnit > 0) {
    breakEvenUnits = fixedOverhead === 0 ? 0 : Math.ceil(fixedOverhead / contributionMarginPerUnit);
    breakEvenRevenue = round2(breakEvenUnits * sellingPrice);
  }

  const monthlyNetBurn = operatingProfit < 0 ? round2(Math.abs(operatingProfit)) : 0;
  let runwayMonths: number | null = null;
  let runwayLabel: string;

  if (totalExpenses === 0 && monthlyNetBurn === 0) {
    edgeCaseWarnings.push('Total monthly expenses are 0 (zero burn); runway is infinite.');
    runwayLabel = 'Infinite (zero burn)';
  } else if (monthlyNetBurn === 0) {
    edgeCaseWarnings.push('Operating profit is non-negative (cash-flow positive); runway is infinite.');
    runwayLabel = 'Infinite (profitable / break-even)';
  } else if (inputs.initialInvestment <= 0) {
    runwayMonths = 0;
    runwayLabel = '0 months (no initial cash buffer)';
    edgeCaseWarnings.push('Monthly net burn exceeds 0 with 0 initial investment.');
  } else {
    runwayMonths = Math.round((inputs.initialInvestment / monthlyNetBurn) * 10) / 10;
    runwayLabel = `${runwayMonths} months`;
  }

  const cashFlow12Months: MonthlyCashFlowPoint[] = [];
  let runningCash = round2(inputs.initialInvestment);

  for (let m = 1; m <= 12; m++) {
    runningCash = round2(runningCash + operatingProfit);
    cashFlow12Months.push({
      month: m,
      label: `M${m}`,
      revenue,
      totalExpenses,
      operatingProfit,
      netCashFlow: operatingProfit,
      cashBalance: runningCash,
    });
  }

  return {
    scenario,
    revenueMultiplier: revMult,
    costMultiplier: costMult,
    effectiveUnitsPerMonth,
    revenue,
    totalVariableCost,
    fixedOverhead,
    totalExpenses,
    contributionMarginPerUnit,
    contributionMarginTotal,
    contributionMarginRatio,
    grossProfit,
    operatingProfit,
    breakEvenUnits,
    breakEvenRevenue,
    monthlyNetBurn,
    runwayMonths,
    runwayLabel,
    edgeCaseWarnings,
    cashFlow12Months,
  };
}

export function calculateFinancialModel(inputs: FinancialPlanInputs): ComputedFinancialModel {
  const scenarios = {} as Record<ScenarioKey, ScenarioComputation>;
  for (const key of SCENARIO_KEYS) {
    scenarios[key] = computeScenario(inputs, key);
  }
  return {
    scenarios,
    computedAt: new Date().toISOString(),
  };
}
