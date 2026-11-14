import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import { config } from '../server/config.ts';
import { calculateFinancialModel } from '../server/services/financeCalculator.ts';
import type { LlmDriver } from '../server/services/llmClient.ts';
import {
  DEFAULT_SCENARIO_MULTIPLIERS,
  PERSONA_DISCLAIMER,
  type FinancialPlanInputs,
} from '../src/shared/phase3aSchemas.ts';

function baseFinanceInputs(overrides?: Partial<FinancialPlanInputs>): FinancialPlanInputs {
  return {
    name: 'ColdChain Unit Model',
    startupId: null,
    ideaId: null,
    initialInvestment: 300000,
    sellingPrice: 4000,
    unitsSoldPerMonth: 50,
    fixedCosts: 40000,
    variableCostPerUnit: 1000,
    marketing: 20000,
    salaries: 50000,
    operationalExpenses: 10000,
    scenarioMultipliers: DEFAULT_SCENARIO_MULTIPLIERS,
    ...overrides,
  };
}

async function registerUser(
  app: ReturnType<typeof createApiApp>,
  email: string,
  fullName: string,
) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, fullName, password: 'Password#123' })
    .expect(201);
  return {
    cookies: res.headers['set-cookie'],
    token: res.body.accessToken as string,
  };
}

describe('Phase 3a — Deterministic Finance Calculator Unit Tests', () => {
  it('computes all 3 scenarios, margins, break-even, runway, and 12-month cash flow accurately', () => {
    const model = calculateFinancialModel(baseFinanceInputs());
    const exp = model.scenarios.expected;

    // Expected: 50 units * 4000 = 200,000 revenue
    // Variable = 50 * 1000 = 50,000; Overhead = 40k + 20k + 50k + 10k = 120,000
    // Total expenses = 170,000; Gross Profit = 150,000; Operating Profit = +30,000
    expect(exp.revenue).toBe(200000);
    expect(exp.totalVariableCost).toBe(50000);
    expect(exp.fixedOverhead).toBe(120000);
    expect(exp.totalExpenses).toBe(170000);
    expect(exp.contributionMarginPerUnit).toBe(3000);
    expect(exp.contributionMarginTotal).toBe(150000);
    expect(exp.contributionMarginRatio).toBe(0.75);
    expect(exp.grossProfit).toBe(150000);
    expect(exp.operatingProfit).toBe(30000);
    expect(exp.breakEvenUnits).toBe(40);
    expect(exp.breakEvenRevenue).toBe(160000);
    expect(exp.monthlyNetBurn).toBe(0);
    expect(exp.runwayMonths).toBeNull();
    expect(exp.runwayLabel).toContain('Infinite');
    expect(exp.cashFlow12Months).toHaveLength(12);
    expect(exp.cashFlow12Months[0].cashBalance).toBe(330000);
    expect(exp.cashFlow12Months[11].cashBalance).toBe(660000);

    // Conservative (0.7x units = 35, 1.1x costs -> var=1100/u, overhead=132000)
    const cons = model.scenarios.conservative;
    expect(cons.effectiveUnitsPerMonth).toBe(35);
    expect(cons.revenue).toBe(140000);
    expect(cons.totalVariableCost).toBe(38500);
    expect(cons.fixedOverhead).toBe(132000);
    expect(cons.totalExpenses).toBe(170500);
    expect(cons.operatingProfit).toBe(-30500);
    expect(cons.monthlyNetBurn).toBe(30500);
    expect(cons.runwayMonths).toBe(9.8);
    expect(cons.cashFlow12Months[11].cashBalance).toBe(300000 - 30500 * 12);
  });

  it('handles zero selling price edge case safely without NaN or Infinity', () => {
    const model = calculateFinancialModel(
      baseFinanceInputs({ sellingPrice: 0, variableCostPerUnit: 500 }),
    );
    const exp = model.scenarios.expected;
    expect(exp.revenue).toBe(0);
    expect(exp.contributionMarginRatio).toBeNull();
    expect(exp.breakEvenUnits).toBeNull();
    expect(exp.breakEvenRevenue).toBeNull();
    expect(exp.edgeCaseWarnings.some((w) => w.includes('Selling price is 0'))).toBe(true);
    expect(exp.runwayMonths).not.toBeNull();
    expect(Number.isFinite(exp.cashFlow12Months[11].cashBalance)).toBe(true);
  });

  it('handles variable cost at or above selling price edge case', () => {
    const model = calculateFinancialModel(
      baseFinanceInputs({ sellingPrice: 1000, variableCostPerUnit: 1200 }),
    );
    const exp = model.scenarios.expected;
    expect(exp.contributionMarginPerUnit).toBe(-200);
    expect(exp.breakEvenUnits).toBeNull();
    expect(exp.breakEvenRevenue).toBeNull();
    expect(
      exp.edgeCaseWarnings.some((w) => w.includes('Variable cost per unit is at or above selling price')),
    ).toBe(true);
  });

  it('handles zero burn (zero expenses and zero revenue) edge case', () => {
    const model = calculateFinancialModel(
      baseFinanceInputs({
        initialInvestment: 100000,
        sellingPrice: 1000,
        unitsSoldPerMonth: 0,
        fixedCosts: 0,
        variableCostPerUnit: 200,
        marketing: 0,
        salaries: 0,
        operationalExpenses: 0,
      }),
    );
    const exp = model.scenarios.expected;
    expect(exp.totalExpenses).toBe(0);
    expect(exp.monthlyNetBurn).toBe(0);
    expect(exp.runwayMonths).toBeNull();
    expect(exp.runwayLabel).toBe('Infinite (zero burn)');
    expect(exp.cashFlow12Months[11].cashBalance).toBe(100000);
  });

  it('handles zero initial investment while burning cash', () => {
    const model = calculateFinancialModel(
      baseFinanceInputs({
        initialInvestment: 0,
        unitsSoldPerMonth: 5,
      }),
    );
    const exp = model.scenarios.expected;
    expect(exp.operatingProfit).toBeLessThan(0);
    expect(exp.runwayMonths).toBe(0);
    expect(exp.runwayLabel).toContain('0 months');
    expect(exp.cashFlow12Months[0].cashBalance).toBeLessThan(0);
  });
});

describe('Phase 3a — Financial Planner & Personas API Integration & Ownership', () => {
  it('saves finance plans cleanly without AI when Gemini is unconfigured, and updates Dashboard overview', async () => {
    const originalKey = config.geminiApiKey;
    config.geminiApiKey = '';
    try {
      const app = createApiApp({ dbPath: ':memory:' });
      const userA = await registerUser(app, 'fin-a@example.com', 'Founder A');
      const userB = await registerUser(app, 'fin-b@example.com', 'Founder B');

      // Create startup & idea for User A
      const startupRes = await request(app)
        .post('/api/v1/startups')
        .set('Cookie', userA.cookies)
        .send({ name: 'GridFlow', industry: 'Logistics', stage: 'mvp' })
        .expect(201);
      const startupId = startupRes.body.startup.id as string;

      // Save financial plan without Gemini configured -> still 201 with null aiInterpretation
      const createRes = await request(app)
        .post('/api/v1/finance')
        .set('Cookie', userA.cookies)
        .send(baseFinanceInputs({ startupId }))
        .expect(201);

      const plan = createRes.body.plan;
      expect(plan.id).toBeTruthy();
      expect(plan.startupId).toBe(startupId);
      expect(plan.computed.scenarios.expected.revenue).toBe(200000);
      expect(plan.computed.scenarios.expected.operatingProfit).toBe(30000);
      expect(plan.aiInterpretation).toBeNull();

      // Dashboard reflects real saved plan
      const dashRes = await request(app)
        .get('/api/v1/dashboard')
        .set('Cookie', userA.cookies)
        .expect(200);
      expect(dashRes.body.summary.savedFinancialPlans).toBe(1);
      expect(dashRes.body.financialOverview.planId).toBe(plan.id);
      expect(dashRes.body.financialOverview.expectedMonthlyRevenue).toBe(200000);
      expect(dashRes.body.financialOverview.expectedOperatingProfit).toBe(30000);

      // User B cannot view, edit, delete User A's plan, nor link User A's startup
      await request(app)
        .get(`/api/v1/finance/${plan.id}`)
        .set('Cookie', userB.cookies)
        .expect(404);
      await request(app)
        .patch(`/api/v1/finance/${plan.id}`)
        .set('Cookie', userB.cookies)
        .send(baseFinanceInputs())
        .expect(404);
      await request(app)
        .delete(`/api/v1/finance/${plan.id}`)
        .set('Cookie', userB.cookies)
        .expect(404);
      await request(app)
        .post('/api/v1/finance')
        .set('Cookie', userB.cookies)
        .send(baseFinanceInputs({ startupId }))
        .expect(404);

      // User A can update and delete
      const patchRes = await request(app)
        .patch(`/api/v1/finance/${plan.id}`)
        .set('Cookie', userA.cookies)
        .send(baseFinanceInputs({ name: 'Updated Model', unitsSoldPerMonth: 80 }))
        .expect(200);
      expect(patchRes.body.plan.name).toBe('Updated Model');
      expect(patchRes.body.plan.computed.scenarios.expected.revenue).toBe(320000);

      await request(app)
        .delete(`/api/v1/finance/${plan.id}`)
        .set('Cookie', userA.cookies)
        .expect(200);
      await request(app)
        .get(`/api/v1/finance/${plan.id}`)
        .set('Cookie', userA.cookies)
        .expect(404);
    } finally {
      config.geminiApiKey = originalKey;
    }
  });

  it('attaches plain-language AI interpretation labelled "AI interpretation" when Gemini is configured', async () => {
    const fakeFinanceDriver: LlmDriver = {
      async generateJson() {
        return JSON.stringify({
          interpretation:
            'AI interpretation: At 50 units/month, expected operating profit is positive at INR 30,000 with break-even at 40 units. In the conservative scenario, monthly burn is INR 30,500 giving 9.8 months of runway.',
        });
      },
      async embedText() {
        return [0.1, 0.2];
      },
    };
    const app = createApiApp({
      dbPath: ':memory:',
      financeOptions: { llmDriver: fakeFinanceDriver },
    });
    const user = await registerUser(app, 'fin-ai@example.com', 'Founder AI');

    const res = await request(app)
      .post('/api/v1/finance')
      .set('Cookie', user.cookies)
      .send(baseFinanceInputs())
      .expect(201);

    expect(res.body.plan.aiInterpretation).toContain('AI interpretation:');
    expect(res.body.plan.computed.scenarios.expected.revenue).toBe(200000);
  });

  it('returns 503 LLM_NOT_CONFIGURED on persona generation when Gemini key is absent', async () => {
    const originalKey = config.geminiApiKey;
    config.geminiApiKey = '';
    try {
      const app = createApiApp({ dbPath: ':memory:' });
      const user = await registerUser(app, 'pers-nokey@example.com', 'Founder NoKey');

      const res = await request(app)
        .post('/api/v1/personas/generate')
        .set('Cookie', user.cookies)
        .send({
          idea: 'Automated FSSAI Cold-Chain Logbook',
          industry: 'Cold-chain logistics',
          product: 'IoT sensor and compliance dashboard',
          location: 'Pune, India',
          problem: 'Manual temperature logbooks fail surprise FSSAI audits and cause spoilage.',
        })
        .expect(503);

      expect(res.body.error.code).toBe('LLM_NOT_CONFIGURED');
    } finally {
      config.geminiApiKey = originalKey;
    }
  });

  it('generates, retries invalid JSON, saves with disclaimer, edits, deletes, and enforces 404 ownership on personas', async () => {
    let calls = 0;
    const flakyPersonaDriver: LlmDriver = {
      async generateJson() {
        calls += 1;
        if (calls === 1) {
          return '{ broken-json ';
        }
        return JSON.stringify({
          name: 'Regional Dairy Cold-Store Supervisor',
          segment: 'Operations supervisors managing 2-5 mid-sized dairy cold rooms in Tier-2 India.',
          needs: ['Automated audit-ready logs', 'Instant excursion alerts'],
          painPoints: ['Paper registers get lost', 'Spoilage discovered too late'],
          motivations: ['Zero audit penalties', 'Protect high-margin dairy stock'],
          objections: ['Sensor installation downtime', 'Monthly subscription cost'],
          preferredChannels: ['WhatsApp Business', 'Regional cold-storage associations'],
          purchaseConsiderations: ['Battery backup during power cuts', 'Hindi/Marathi alert UI'],
        });
      },
      async embedText() {
        return [0.1, 0.2];
      },
    };

    const app = createApiApp({
      dbPath: ':memory:',
      personasOptions: { llmDriver: flakyPersonaDriver },
    });
    const userA = await registerUser(app, 'pers-a@example.com', 'Persona Owner');
    const userB = await registerUser(app, 'pers-b@example.com', 'Persona Other');

    const ideaRes = await request(app)
      .post('/api/v1/ideas')
      .set('Cookie', userA.cookies)
      .send({ title: 'Cold-Chain Logbook' })
      .expect(201);
    const ideaId = ideaRes.body.idea.id as string;

    // User B cannot attach User A's ideaId
    await request(app)
      .post('/api/v1/personas/generate')
      .set('Cookie', userB.cookies)
      .send({
        ideaId,
        idea: 'Cold-Chain Logbook',
        industry: 'Logistics',
        product: 'Sensors',
        location: 'India',
        problem: 'Manual logs fail regulatory compliance inspections regularly.',
      })
      .expect(404);

    // User A generates persona (retries invalid JSON once -> succeeds on call 2)
    const genRes = await request(app)
      .post('/api/v1/personas/generate')
      .set('Cookie', userA.cookies)
      .send({
        ideaId,
        idea: 'Cold-Chain Logbook',
        industry: 'Cold-chain logistics',
        product: 'IoT sensors + WhatsApp alerts',
        location: 'Tier-2 India',
        problem: 'Manual temperature logbooks fail FSSAI audits and miss overnight cooling faults.',
      })
      .expect(201);

    expect(calls).toBe(2);
    const persona = genRes.body.persona;
    expect(persona.disclaimer).toBe(PERSONA_DISCLAIMER);
    expect(persona.needs.length).toBeGreaterThanOrEqual(2);
    expect(persona.preferredChannels).toContain('WhatsApp Business');

    // Ownership isolation (404 for User B)
    await request(app)
      .get(`/api/v1/personas/${persona.id}`)
      .set('Cookie', userB.cookies)
      .expect(404);
    await request(app)
      .patch(`/api/v1/personas/${persona.id}`)
      .set('Cookie', userB.cookies)
      .send({ ...persona, name: 'Hijacked' })
      .expect(404);
    await request(app)
      .delete(`/api/v1/personas/${persona.id}`)
      .set('Cookie', userB.cookies)
      .expect(404);

    // User A edits persona
    const patchRes = await request(app)
      .patch(`/api/v1/personas/${persona.id}`)
      .set('Cookie', userA.cookies)
      .send({
        name: 'Updated Dairy Supervisor',
        idea: persona.idea,
        industry: persona.industry,
        product: persona.product,
        location: persona.location,
        problem: persona.problem,
        segment: persona.segment,
        needs: ['Automated FSSAI PDF export'],
        painPoints: persona.painPoints,
        motivations: persona.motivations,
        objections: persona.objections,
        preferredChannels: persona.preferredChannels,
        purchaseConsiderations: persona.purchaseConsiderations,
      })
      .expect(200);
    expect(patchRes.body.persona.name).toBe('Updated Dairy Supervisor');
    expect(patchRes.body.persona.disclaimer).toBe(PERSONA_DISCLAIMER);

    // User A deletes persona
    await request(app)
      .delete(`/api/v1/personas/${persona.id}`)
      .set('Cookie', userA.cookies)
      .expect(200);
    await request(app)
      .get(`/api/v1/personas/${persona.id}`)
      .set('Cookie', userA.cookies)
      .expect(404);
  });
});
