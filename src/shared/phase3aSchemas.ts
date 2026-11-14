import { z } from 'zod';

export const SCENARIO_KEYS = ['conservative', 'expected', 'optimistic'] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export const PERSONA_DISCLAIMER =
  'AI-generated hypothesis: validate through real customer research.';

export const scenarioMultiplierPairSchema = z.object({
  revenueMultiplier: z.coerce.number().min(0.1).max(10),
  costMultiplier: z.coerce.number().min(0.1).max(10),
});

export const scenarioMultipliersSchema = z.object({
  conservative: scenarioMultiplierPairSchema.default({
    revenueMultiplier: 0.7,
    costMultiplier: 1.1,
  }),
  expected: scenarioMultiplierPairSchema.default({
    revenueMultiplier: 1.0,
    costMultiplier: 1.0,
  }),
  optimistic: scenarioMultiplierPairSchema.default({
    revenueMultiplier: 1.35,
    costMultiplier: 0.95,
  }),
});

export type ScenarioMultipliers = z.infer<typeof scenarioMultipliersSchema>;

export const DEFAULT_SCENARIO_MULTIPLIERS: ScenarioMultipliers = {
  conservative: { revenueMultiplier: 0.7, costMultiplier: 1.1 },
  expected: { revenueMultiplier: 1.0, costMultiplier: 1.0 },
  optimistic: { revenueMultiplier: 1.35, costMultiplier: 0.95 },
};

const nonNegNum = z.coerce
  .number()
  .refine((n) => Number.isFinite(n), { message: 'Must be a valid number' })
  .min(0, 'Must be 0 or greater');

export const financialPlanInputSchema = z.object({
  name: z.string().trim().min(2, 'Plan name must be at least 2 characters').max(120),
  startupId: z.string().trim().nullable().optional(),
  ideaId: z.string().trim().nullable().optional(),
  initialInvestment: nonNegNum,
  sellingPrice: nonNegNum,
  unitsSoldPerMonth: nonNegNum,
  fixedCosts: nonNegNum,
  variableCostPerUnit: nonNegNum,
  marketing: nonNegNum,
  salaries: nonNegNum,
  operationalExpenses: nonNegNum,
  scenarioMultipliers: scenarioMultipliersSchema.optional().default(DEFAULT_SCENARIO_MULTIPLIERS),
});

export type FinancialPlanInputs = z.infer<typeof financialPlanInputSchema>;

export interface MonthlyCashFlowPoint {
  month: number;
  label: string;
  revenue: number;
  totalExpenses: number;
  operatingProfit: number;
  netCashFlow: number;
  cashBalance: number;
}

export interface ScenarioComputation {
  scenario: ScenarioKey;
  revenueMultiplier: number;
  costMultiplier: number;
  effectiveUnitsPerMonth: number;
  revenue: number;
  totalVariableCost: number;
  fixedOverhead: number;
  totalExpenses: number;
  contributionMarginPerUnit: number;
  contributionMarginTotal: number;
  contributionMarginRatio: number | null;
  grossProfit: number;
  operatingProfit: number;
  breakEvenUnits: number | null;
  breakEvenRevenue: number | null;
  monthlyNetBurn: number;
  runwayMonths: number | null;
  runwayLabel: string;
  edgeCaseWarnings: string[];
  cashFlow12Months: MonthlyCashFlowPoint[];
}

export interface ComputedFinancialModel {
  scenarios: Record<ScenarioKey, ScenarioComputation>;
  computedAt: string;
}

export const personaGenerateInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  idea: z.string().trim().min(3, 'Idea summary must be at least 3 characters').max(500),
  industry: z.string().trim().min(2, 'Industry is required').max(120),
  product: z.string().trim().min(3, 'Product description is required').max(500),
  location: z.string().trim().min(2, 'Target location is required').max(120),
  problem: z.string().trim().min(10, 'Describe the customer problem (at least 10 characters)').max(1500),
});

export type PersonaGenerateInput = z.infer<typeof personaGenerateInputSchema>;

const nonEmptyStringArray = z.array(z.string().trim().min(2)).min(1);

export const personaProfileJsonSchema = z.object({
  name: z.string().trim().min(2).max(120),
  segment: z.string().trim().min(5).max(600),
  needs: nonEmptyStringArray,
  painPoints: nonEmptyStringArray,
  motivations: nonEmptyStringArray,
  objections: nonEmptyStringArray,
  preferredChannels: nonEmptyStringArray,
  purchaseConsiderations: nonEmptyStringArray,
});

export type PersonaProfileJson = z.infer<typeof personaProfileJsonSchema>;

export const personaUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  idea: z.string().trim().min(3).max(500),
  industry: z.string().trim().min(2).max(120),
  product: z.string().trim().min(3).max(500),
  location: z.string().trim().min(2).max(120),
  problem: z.string().trim().min(10).max(1500),
  segment: z.string().trim().min(5).max(600),
  needs: nonEmptyStringArray,
  painPoints: nonEmptyStringArray,
  motivations: nonEmptyStringArray,
  objections: nonEmptyStringArray,
  preferredChannels: nonEmptyStringArray,
  purchaseConsiderations: nonEmptyStringArray,
});
