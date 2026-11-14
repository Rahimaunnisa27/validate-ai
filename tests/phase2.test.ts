import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import { config } from '../server/config.ts';
import {
  computeLocalEmbedding,
  cosineSimilarity,
  LOCAL_EMBEDDING_MODEL,
} from '../server/services/embeddings.ts';
import {
  createSdkClient,
  formatGeminiError,
  isAllowedFreeFlashModel,
  resetGeminiStartupState,
  runGeminiStartupCheck,
  selectFreeTierModelsFromCatalog,
  withRateLimitRetry,
  type LlmDriver,
} from '../server/services/llmClient.ts';
import {
  REPORT_SECTION_META,
  SCORING_DISCLAIMER,
  type ValidationReportJson,
} from '../src/shared/reportSchemas.ts';

function buildValidReportJson(overrides?: {
  marketSourceId?: string | null;
  marketEvidence?: 'Verified research' | 'AI interpretation' | 'User assumption' | 'Unverified';
}): ValidationReportJson {
  const mkSection = (label: string) => ({
    summary: `Analysis summary for ${label}.`,
    items: [
      {
        text: `Primary insight for ${label} grounded in founder input.`,
        evidenceLabel: 'User assumption' as const,
        sourceId: null,
      },
      {
        text: `Analytical synthesis for ${label} highlighting key operational checks.`,
        evidenceLabel: 'AI interpretation' as const,
        sourceId: null,
      },
    ],
  });

  const marketLabel = overrides?.marketEvidence ?? 'Verified research';
  const marketSourceId = overrides?.marketSourceId !== undefined ? overrides.marketSourceId : 'SRC-1';

  return {
    disclaimer: SCORING_DISCLAIMER,
    scores: {
      problemClarity: { score: 8, explanation: 'Specific compliance pain.', evidenceLabel: 'User assumption' },
      customerDefinition: { score: 7.5, explanation: 'Target SMB buyers named.', evidenceLabel: 'User assumption' },
      competitiveDifferentiation: { score: 6.5, explanation: 'Workflow speed edge.', evidenceLabel: 'AI interpretation' },
      businessModelClarity: { score: 7, explanation: 'Clear monthly SaaS pricing.', evidenceLabel: 'User assumption' },
      financialAssumptions: { score: 6, explanation: 'Unit price vs burn stated.', evidenceLabel: 'User assumption' },
      evidenceStrength: { score: 5.5, explanation: 'Early qualitative notes.', evidenceLabel: 'AI interpretation' },
    },
    sections: {
      executiveSummary: mkSection('Executive Summary'),
      ideaExplanation: mkSection('Idea Explanation'),
      problemSolutionFit: mkSection('Problem-Solution Fit'),
      targetCustomers: mkSection('Target Customers'),
      marketOpportunity: {
        summary: 'Market opportunity evaluation based on retrieved sources.',
        items: [
          {
            text: 'SMB buyers evaluate workflow automation when manual overhead exceeds 4 hours weekly.',
            evidenceLabel: marketLabel,
            sourceId: marketSourceId,
          },
          {
            text: 'TAM/SAM estimates require primary buyer interviews before scale spend.',
            evidenceLabel: 'Unverified',
            sourceId: null,
          },
        ],
      },
      competitors: mkSection('Competitors'),
      usp: mkSection('USP'),
      swot: {
        strengths: [{ text: 'Clear vertical focus.', evidenceLabel: 'User assumption', sourceId: null }],
        weaknesses: [{ text: 'Limited customer proof so far.', evidenceLabel: 'Unverified', sourceId: null }],
        opportunities: [{ text: 'Increasing SMB digitization.', evidenceLabel: 'AI interpretation', sourceId: null }],
        threats: [{ text: 'Incumbent bundling.', evidenceLabel: 'AI interpretation', sourceId: null }],
      },
      businessModel: mkSection('Business Model'),
      revenueModel: mkSection('Revenue Model'),
      financialFeasibility: mkSection('Financial Feasibility'),
      risks: mkSection('Risks'),
      mvpRecommendations: mkSection('MVP Recommendations'),
      customerAcquisition: mkSection('Customer Acquisition'),
      marketing: mkSection('Marketing'),
      goToMarket: mkSection('Go-To-Market'),
      thirtyDayPlan: mkSection('30-Day Plan'),
      ninetyDayRoadmap: mkSection('90-Day Roadmap'),
    },
  };
}

async function createUserAndIdea(
  app: ReturnType<typeof createApiApp>,
  email: string,
  title: string,
) {
  const agent = request.agent(app);
  const reg = await agent.post('/api/v1/auth/register').send({
    fullName: email.split('@')[0],
    email,
    password: 'Password123!',
  });
  expect(reg.status).toBe(201);

  const draft = await agent.post('/api/v1/ideas').send({
    title,
    currentStep: 1,
    businessDetails: {
      title,
      industry: 'Logistics Tech',
      businessModel: 'b2b',
      stage: 'mvp',
      oneLiner: `Automated compliance logbook for ${title}`,
    },
  });
  expect(draft.status).toBe(201);

  const ideaId = draft.body.idea.id as string;
  const submit = await agent.post(`/api/v1/ideas/${ideaId}/submit`).send({
    businessDetails: {
      title,
      industry: 'Logistics Tech',
      businessModel: 'b2b',
      stage: 'mvp',
      oneLiner: `Automated compliance logbook for ${title}`,
    },
    problemSolution: {
      problemStatement: 'Operators lose hours filling manual inspection sheets every week.',
      currentAlternatives: 'Paper binders and spreadsheets.',
      proposedSolution: 'Mobile sensor sync and instant audit PDF export.',
      uniqueValueProposition: 'Zero-effort audit readiness in 5 minutes.',
    },
    targetCustomer: {
      primarySegment: 'Cold-chain warehouse operators in Tier-1/2 India',
      geography: 'India',
      customerPainLevel: 'high',
      willingnessToPay: 'INR 4,999/month per facility',
    },
    financials: {
      initialCapitalInr: 400000,
      pricePerUnitInr: 4999,
      estimatedMonthlyCustomers: 25,
      monthlyBurnInr: 80000,
      revenueModelNotes: 'Monthly subscription per warehouse',
    },
    competitors: {
      knownCompetitors: 'Generic ERPs and manual Excel logs',
      unfairAdvantage: 'Pre-built FSSAI inspection templates',
    },
  });
  expect(submit.status).toBe(200);
  return { agent, ideaId };
}

describe('VenturePilot AI — Phase 2 Validation Reports', () => {
  it('returns 503 LLM_NOT_CONFIGURED with setup steps and produces no fake report when GEMINI_API_KEY is missing', async () => {
    const prevKey = config.geminiApiKey;
    config.geminiApiKey = '';
    try {
      process.env.NODE_ENV = 'test';
      const app = createApiApp({ dbPath: ':memory:' });
      const { agent, ideaId } = await createUserAndIdea(app, 'nokey@example.in', 'ColdChain Alpha');

      const genRes = await agent.post('/api/v1/reports/generate').send({ ideaId, planSlug: 'full' });
      expect(genRes.status).toBe(503);
      expect(genRes.body.error.code).toBe('LLM_NOT_CONFIGURED');
      expect(Array.isArray(genRes.body.error.details.setupSteps)).toBe(true);

      const listRes = await agent.get('/api/v1/reports');
      expect(listRes.status).toBe(200);
      expect(listRes.body.items.length).toBe(0);
    } finally {
      config.geminiApiKey = prevKey;
    }
  });

  it('retries invalid JSON once, completes 18-section report with DEMO DATA sources, enforces ownership (404), and exports real PDF', async () => {
    process.env.NODE_ENV = 'test';
    let jsonCallCount = 0;

    const mockDriver: LlmDriver = {
      async embedText(text: string): Promise<number[]> {
        return text.includes('Second') ? [0.9, 0.1, 0.0] : [0.85, 0.15, 0.0];
      },
      async generateJson(): Promise<string> {
        jsonCallCount += 1;
        if (jsonCallCount === 1) {
          // Invalid JSON on attempt 1 -> triggers automatic repair retry once
          return '{ "broken": true, "scores": {} ';
        }
        return JSON.stringify(buildValidReportJson({ marketSourceId: 'SRC-1', marketEvidence: 'Verified research' }));
      },
    };

    const app = createApiApp({
      dbPath: ':memory:',
      reportOptions: {
        llmDriver: mockDriver,
        runSync: true,
        demoModeOverride: true,
      },
    });

    const userA = await createUserAndIdea(app, 'owner@example.in', 'First ColdChain');
    const userA2 = await userA.agent.post('/api/v1/ideas').send({
      title: 'Second ColdChain Idea',
      currentStep: 1,
      businessDetails: {
        title: 'Second ColdChain Idea',
        industry: 'Logistics Tech',
        businessModel: 'b2b',
        stage: 'mvp',
        oneLiner: 'Second workspace idea for cosine similarity',
      },
      problemSolution: {
        problemStatement: 'Tracking fleet temperature variance in transit.',
        proposedSolution: 'Live dispatch dashboard.',
      },
    });
    expect(userA2.status).toBe(201);

    // User B also creates an idea to prove per-user cosine similarity & ownership isolation
    const userB = await createUserAndIdea(app, 'intruder@example.in', 'Intruder Idea');
    const genB = await userB.agent.post('/api/v1/reports/generate').send({
      ideaId: userB.ideaId,
      planSlug: 'full',
    });
    expect(genB.status).toBe(202);

    // Generate report for User A's second idea first so it gets an embedding, then first idea
    const genA2 = await userA.agent.post('/api/v1/reports/generate').send({
      ideaId: userA2.body.idea.id,
      planSlug: 'full',
    });
    expect(genA2.status).toBe(202);

    // Reset counter so User A's primary idea specifically exercises attempt 1 invalid -> attempt 2 valid
    jsonCallCount = 0;
    const genA1 = await userA.agent.post('/api/v1/reports/generate').send({
      ideaId: userA.ideaId,
      planSlug: 'full',
    });
    expect(genA1.status).toBe(202);
    expect(jsonCallCount).toBe(2);

    const reportId = genA1.body.report.id as string;

    const getA = await userA.agent.get(`/api/v1/reports/${reportId}`);
    expect(getA.status).toBe(200);
    const report = getA.body.report;
    expect(report.status).toBe('completed');
    expect(report.progressStep).toBe(8);
    expect(report.researchMode).toBe('demo');
    expect(report.sources.length).toBeGreaterThan(0);
    expect(report.sources.every((s: { isDemo: boolean }) => s.isDemo)).toBe(true);
    expect(report.reportJson.disclaimer).toBe(SCORING_DISCLAIMER);

    // Verify all 18 sections exist
    for (const sec of REPORT_SECTION_META) {
      expect(report.reportJson.sections[sec.key]).toBeTruthy();
    }

    // Verify per-user cosine similarity excludes User B's idea
    const similarIds = report.similarIdeas.map((s: { ideaId: string }) => s.ideaId);
    expect(similarIds).toContain(userA2.body.idea.id);
    expect(similarIds).not.toContain(userB.ideaId);

    // Verify real PDF binary output
    const pdfRes = await userA.agent
      .get(`/api/v1/reports/${reportId}/pdf`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect((pdfRes.body as Buffer).subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // Verify dashboard reflects real completedReports count
    const dashA = await userA.agent.get('/api/v1/dashboard');
    expect(dashA.status).toBe(200);
    expect(dashA.body.summary.completedReports).toBe(2);

    // Ownership isolation: User B must receive 404 on every endpoint for User A's report & idea
    expect((await userB.agent.get(`/api/v1/reports/${reportId}`)).status).toBe(404);
    expect((await userB.agent.get(`/api/v1/reports/${reportId}/pdf`)).status).toBe(404);
    expect((await userB.agent.post(`/api/v1/reports/${reportId}/retry`)).status).toBe(404);
    expect((await userB.agent.delete(`/api/v1/reports/${reportId}`)).status).toBe(404);
    expect(
      (await userB.agent.post('/api/v1/reports/generate').send({ ideaId: userA.ideaId })).status,
    ).toBe(404);
  });

  it('downgrades ungrounded Verified research claims to Unverified when DEMO_MODE=false and handles failed-job free retry', async () => {
    process.env.NODE_ENV = 'test';
    let shouldFail = true;

    const mockDriver: LlmDriver = {
      async embedText(): Promise<number[]> {
        return [0.5, 0.5, 0.5];
      },
      async generateJson(): Promise<string> {
        if (shouldFail) {
          return 'NOT_VALID_JSON_AT_ALL';
        }
        // Intentionally claims Verified research with fake sourceId when researchMode=none
        return JSON.stringify(
          buildValidReportJson({ marketSourceId: 'SRC-FAKE', marketEvidence: 'Verified research' }),
        );
      },
    };

    const app = createApiApp({
      dbPath: ':memory:',
      reportOptions: {
        llmDriver: mockDriver,
        runSync: true,
        demoModeOverride: false,
      },
    });

    const user = await createUserAndIdea(app, 'retry@example.in', 'Retry Test Idea');

    // First attempt fails after retry-once repair because both attempts return invalid JSON
    const genFail = await user.agent.post('/api/v1/reports/generate').send({
      ideaId: user.ideaId,
      planSlug: 'basic',
    });
    expect(genFail.status).toBe(202);
    const reportId = genFail.body.report.id as string;

    const failedState = await user.agent.get(`/api/v1/reports/${reportId}`);
    expect(failedState.status).toBe(200);
    expect(failedState.body.report.status).toBe('failed');
    expect(failedState.body.report.jobError).toContain('validation after 1 automatic retry');

    // Free retry succeeds once LLM returns valid JSON
    shouldFail = false;
    const retryRes = await user.agent.post(`/api/v1/reports/${reportId}/retry`);
    expect(retryRes.status).toBe(202);
    expect(retryRes.body.report.status).toBe('completed');
    expect(retryRes.body.report.researchMode).toBe('none');

    // Verify anti-hallucination guard downgraded fake Verified research claim to Unverified
    const firstMarketClaim = retryRes.body.report.reportJson.sections.marketOpportunity.items[0];
    expect(firstMarketClaim.evidenceLabel).toBe('Unverified');
    expect(firstMarketClaim.sourceId).toBeNull();
  });

  it('formats raw Gemini JSON errors (403 leaked key / 429 rate limit) into readable jobError messages', async () => {
    const leakedErr = formatGeminiError(
      new Error(
        '{"error":{"code":403,"message":"Your API key was reported as leaked. Please use another API key.","status":"PERMISSION_DENIED"}}',
      ),
    );
    expect(leakedErr.message).toContain('Gemini API rejected the configured key');
    expect(leakedErr.message).toContain('Settings > Secrets');
    expect(leakedErr.message).not.toContain('{"error"');

    const rateErr = formatGeminiError(
      new Error('{"error":{"code":429,"message":"Quota exceeded.","status":"RESOURCE_EXHAUSTED"}}'),
    );
    expect(rateErr.message).toContain('Gemini API rate limit reached (429) after automatic retry');
    expect(rateErr.message).toContain('Retry (Free)');
  });

  it('excludes Pro/paid-only models, picks newest accessible Flash model on startup, and falls back to local-hash-256 when no embedding model is available', async () => {
    expect(isAllowedFreeFlashModel('gemini-2.5-pro')).toBe(false);
    expect(isAllowedFreeFlashModel('gemini-4-argon')).toBe(false);
    expect(isAllowedFreeFlashModel('gemini-4-carbon')).toBe(false);
    expect(isAllowedFreeFlashModel('gemini-2.5-flash')).toBe(true);

    const picked = selectFreeTierModelsFromCatalog(
      [
        { name: 'models/gemini-2.5-pro', supportedActions: ['generateContent'] },
        { name: 'models/gemini-2.0-flash', supportedActions: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', supportedActions: ['generateContent'] },
      ],
      'gemini-2.5-pro', // paid/Pro requested -> must be rejected and replaced
      'gemini-embedding-001',
    );
    expect(picked.resolvedLlmModel).toBe('gemini-2.5-flash');
    expect(picked.resolvedEmbeddingModel).toBe(LOCAL_EMBEDDING_MODEL);
    expect(picked.usedAutoFallback).toBe(true);

    resetGeminiStartupState();
    const state = await runGeminiStartupCheck({
      force: true,
      listModelsFn: async () => [
        { name: 'models/gemini-2.5-flash-lite', supportedActions: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedActions: ['embedContent'] },
      ],
    });
    expect(state.resolvedLlmModel).toBe('gemini-2.5-flash-lite');
    expect(state.resolvedEmbeddingModel).toBe('gemini-embedding-001');
    resetGeminiStartupState();
  });

  it('computes normalized deterministic local-hash-256 embeddings with higher similarity for related ideas', () => {
    const vecCold1 = computeLocalEmbedding(
      'Automated FSSAI cold-chain temperature logbook and compliance alerts for dairy warehouses in Pune.',
    );
    const vecCold2 = computeLocalEmbedding(
      'Cold-chain dairy warehouse sensor logbook for FSSAI compliance audits in Maharashtra.',
    );
    const vecUnrelated = computeLocalEmbedding(
      'Electric scooter battery swapping marketplace for college commuters in Bangalore.',
    );
    expect(vecCold1.length).toBe(256);
    expect(cosineSimilarity(vecCold1, vecCold2)).toBeGreaterThan(
      cosineSimilarity(vecCold1, vecUnrelated),
    );
  });

  it('handles 429 rate-limit errors with a short wait and one automatic retry', async () => {
    let attempts = 0;
    const result = await withRateLimitRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error(
            '{"error":{"code":429,"message":"Rate limit exceeded.","status":"RESOURCE_EXHAUSTED"}}',
          );
        }
        return 'ok-after-retry';
      },
      { defaultWaitMs: 25 },
    );
    expect(result).toBe('ok-after-retry');
    expect(attempts).toBe(2);

    let failAttempts = 0;
    await expect(
      withRateLimitRetry(
        async () => {
          failAttempts += 1;
          throw new Error('429 RESOURCE_EXHAUSTED');
        },
        { defaultWaitMs: 10 },
      ),
    ).rejects.toThrow(/429/);
    expect(failAttempts).toBe(2);
  });

  it('configures GoogleGenAI SDK client with apiVersion v1beta so JSON mode is enabled', () => {
    const prev = config.geminiApiKey;
    config.geminiApiKey = 'test-key-placeholder-1234';
    try {
      const client = createSdkClient() as unknown as {
        apiClient?: { getApiVersion?: () => string };
      };
      expect(client.apiClient?.getApiVersion?.()).toBe('v1beta');
    } finally {
      config.geminiApiKey = prev;
    }
  });
});
