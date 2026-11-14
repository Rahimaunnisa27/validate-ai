import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import { config } from '../server/config.ts';
import type { LlmDriver } from '../server/services/llmClient.ts';
import {
  enforceMarketResearchGrounding,
  type Phase3bSource,
  type SonarQueryFn,
} from '../server/services/phase3bResearch.ts';
import {
  TAM_SAM_SOM_FALLBACK,
  type MarketResearchResult,
} from '../src/shared/phase3bSchemas.ts';

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

function buildFakeResearchRaw(options?: {
  inventedSourceId?: string | null;
  tamValue?: string;
}): string {
  const result: MarketResearchResult = {
    summary: {
      text: 'Mid-market food cold-chain operators face strict compliance audits.',
      evidenceLabel: 'Verified research',
      sourceId: options?.inventedSourceId !== undefined ? options.inventedSourceId : 'SRC-1',
    },
    industryTrends: [
      {
        text: 'Cloud-connected temperature logging adoption is rising.',
        evidenceLabel: 'Verified research',
        sourceId: 'SRC-1',
      },
      {
        text: 'Manual registers create compliance gaps during inspections.',
        evidenceLabel: 'AI interpretation',
        sourceId: null,
      },
    ],
    demandIndicators: [
      {
        text: 'Operators waste hours weekly reconciling paper logs.',
        evidenceLabel: 'User assumption',
        sourceId: null,
      },
    ],
    customerProblems: [
      {
        text: 'Overnight compressor failures go unnoticed without instant alerts.',
        evidenceLabel: 'Verified research',
        sourceId: 'SRC-999', // Invalid source ID -> must downgrade to Unverified!
      },
    ],
    potentialMarketSegments: [
      {
        text: 'Tier-2 dairy cold rooms with 2-10 chambers.',
        evidenceLabel: 'AI interpretation',
        sourceId: null,
      },
    ],
    tamSamSom: {
      tam: {
        value: options?.tamValue ?? 'INR 4,500 Cr',
        evidenceLabel: 'Verified research',
        sourceId: 'SRC-1',
        note: 'Derived from report.',
      },
      sam: {
        value: 'INR 900 Cr',
        evidenceLabel: 'Verified research',
        sourceId: 'SRC-NOPE',
        note: 'Invented estimate.',
      },
      som: {
        value: TAM_SAM_SOM_FALLBACK,
        evidenceLabel: 'Unverified',
        sourceId: null,
        note: 'Needs primary validation.',
      },
    },
  };
  return JSON.stringify(result);
}

describe('Phase 3b — No-Fabrication Guard & Source Labelling', () => {
  it('downgrades ungrounded Verified research claims to Unverified and blocks unsupported TAM/SAM/SOM', () => {
    const raw = JSON.parse(buildFakeResearchRaw({ inventedSourceId: null })) as MarketResearchResult;
    const demoSources: Phase3bSource[] = [
      {
        sourceRef: 'SRC-1',
        query: 'q',
        url: 'https://demo.venturepilot.local/sources/1',
        title: '[DEMO DATA] Sample Source',
        snippet: 'Teams evaluate automation when manual overhead is high.',
        retrievedAt: new Date().toISOString(),
        isDemo: true,
      },
    ];

    const demoGrounded = enforceMarketResearchGrounding(raw, demoSources, 'demo');
    // summary claimed Verified research with sourceId=null -> downgraded to Unverified
    expect(demoGrounded.summary.evidenceLabel).toBe('Unverified');
    expect(demoGrounded.summary.sourceId).toBeNull();
    // SRC-1 is valid in demo mode -> preserved
    expect(demoGrounded.industryTrends[0].evidenceLabel).toBe('Verified research');
    expect(demoGrounded.industryTrends[0].sourceId).toBe('SRC-1');
    // SRC-999 does not exist -> downgraded to Unverified
    expect(demoGrounded.customerProblems[0].evidenceLabel).toBe('Unverified');
    expect(demoGrounded.customerProblems[0].sourceId).toBeNull();
    // Demo mode must NEVER fabricate numeric TAM/SAM/SOM
    expect(demoGrounded.tamSamSom.tam.value).toBe(TAM_SAM_SOM_FALLBACK);
    expect(demoGrounded.tamSamSom.tam.evidenceLabel).toBe('Unverified');
    expect(demoGrounded.tamSamSom.sam.value).toBe(TAM_SAM_SOM_FALLBACK);

    // Sonar mode WITH numeric figure in snippet preserves TAM, while invalid SRC-NOPE SAM falls back
    const sonarSources: Phase3bSource[] = [
      {
        sourceRef: 'SRC-1',
        query: 'q',
        url: 'https://reports.example.com/cold-chain',
        title: 'India Cold Chain Market Report',
        snippet: 'The India cold-chain monitoring segment reached INR 4,500 Cr in 2025.',
        retrievedAt: new Date().toISOString(),
        isDemo: false,
      },
    ];
    const sonarGrounded = enforceMarketResearchGrounding(raw, sonarSources, 'sonar');
    expect(sonarGrounded.tamSamSom.tam.value).toBe('INR 4,500 Cr');
    expect(sonarGrounded.tamSamSom.tam.evidenceLabel).toBe('Verified research');
    expect(sonarGrounded.tamSamSom.tam.sourceId).toBe('SRC-1');
    expect(sonarGrounded.tamSamSom.sam.value).toBe(TAM_SAM_SOM_FALLBACK);
    expect(sonarGrounded.tamSamSom.sam.evidenceLabel).toBe('Unverified');
  });

  it('returns Not configured with zero fake claims or competitors when SONAR_API_KEY and DEMO_MODE are off', async () => {
    const origSonar = config.sonarApiKey;
    config.sonarApiKey = '';
    try {
      const app = createApiApp({
        dbPath: ':memory:',
        researchOptions: { demoModeOverride: false },
        competitorsOptions: { demoModeOverride: false },
      });
      const user = await registerUser(app, 'r-none@example.com', 'Founder None');

      const res = await request(app)
        .post('/api/v1/research')
        .set('Cookie', user.cookies)
        .send({
          industry: 'Cold-chain logistics',
          businessCategory: 'B2B SaaS',
          targetCustomer: 'Dairy cold rooms',
          location: 'India',
          productOrService: 'Automated FSSAI compliance sensors',
        })
        .expect(201);

      expect(res.body.run.status).toBe('not_configured');
      expect(res.body.run.researchMode).toBe('none');
      expect(res.body.run.sources).toEqual([]);
      expect(res.body.run.result).toBeNull();
      expect(res.body.run.setupSteps.length).toBeGreaterThan(0);

      const discRes = await request(app)
        .post('/api/v1/competitors/discover')
        .set('Cookie', user.cookies)
        .send({
          industry: 'Cold-chain logistics',
          productOrService: 'Automated FSSAI compliance sensors',
          location: 'India',
        })
        .expect(503);
      expect(discRes.body.error.code).toBe('RESEARCH_NOT_CONFIGURED');
    } finally {
      config.sonarApiKey = origSonar;
    }
  });
});

describe('Phase 3b — Research Runs, Competitors CRUD, Discovery, Differentiation & 404 Ownership', () => {
  it('supports DEMO_MODE research runs, Sonar source preservation, and cross-user 404 isolation', async () => {
    const fakeLlm: LlmDriver = {
      async generateJson() {
        return buildFakeResearchRaw({ inventedSourceId: 'SRC-1' });
      },
      async embedText() {
        return [0.1, 0.2];
      },
    };

    const app = createApiApp({
      dbPath: ':memory:',
      researchOptions: { llmDriver: fakeLlm, demoModeOverride: true },
    });
    const userA = await registerUser(app, 'r-a@example.com', 'Research Owner');
    const userB = await registerUser(app, 'r-b@example.com', 'Research Other');

    const ideaRes = await request(app)
      .post('/api/v1/ideas')
      .set('Cookie', userA.cookies)
      .send({ title: 'Cold-Chain Logbook' })
      .expect(201);
    const ideaId = ideaRes.body.idea.id as string;

    // User B cannot link User A's idea
    await request(app)
      .post('/api/v1/research')
      .set('Cookie', userB.cookies)
      .send({
        ideaId,
        industry: 'Logistics',
        businessCategory: 'SaaS',
        targetCustomer: 'Warehouses',
        location: 'India',
        productOrService: 'Compliance logger',
      })
      .expect(404);

    // User A creates a DEMO DATA research run
    const createRes = await request(app)
      .post('/api/v1/research')
      .set('Cookie', userA.cookies)
      .send({
        ideaId,
        industry: 'Cold-chain food logistics',
        businessCategory: 'B2B SaaS',
        targetCustomer: 'Regional dairy cold-storage operators',
        location: 'India',
        productOrService: 'Automated FSSAI Cold-Chain Logbook',
      })
      .expect(201);

    const run = createRes.body.run;
    expect(run.status).toBe('completed');
    expect(run.researchMode).toBe('demo');
    expect(run.sources.length).toBe(3);
    expect(run.sources[0].isDemo).toBe(true);
    expect(run.sources[0].title).toContain('[DEMO DATA]');
    expect(run.result.tamSamSom.tam.value).toBe(TAM_SAM_SOM_FALLBACK);
    expect(run.result.customerProblems[0].evidenceLabel).toBe('Unverified');

    // Cross-user 404 isolation
    await request(app)
      .get(`/api/v1/research/${run.id}`)
      .set('Cookie', userB.cookies)
      .expect(404);
    await request(app)
      .delete(`/api/v1/research/${run.id}`)
      .set('Cookie', userB.cookies)
      .expect(404);

    // Owner can list, reopen, and delete
    const listRes = await request(app)
      .get('/api/v1/research')
      .set('Cookie', userA.cookies)
      .expect(200);
    expect(listRes.body.items).toHaveLength(1);

    await request(app)
      .get(`/api/v1/research/${run.id}`)
      .set('Cookie', userA.cookies)
      .expect(200);

    await request(app)
      .delete(`/api/v1/research/${run.id}`)
      .set('Cookie', userA.cookies)
      .expect(200);
    await request(app)
      .get(`/api/v1/research/${run.id}`)
      .set('Cookie', userA.cookies)
      .expect(404);
  });

  it('supports manual competitors CRUD, Sonar/Demo discovery, AI differentiation, and 404 ownership isolation', async () => {
    const fakeSonar: SonarQueryFn = async () => ({
      summary: 'FrostWatch India offers cold-room monitoring at INR 3,500/month.',
      citations: [
        {
          url: 'https://frostwatch.example.in/pricing',
          title: 'FrostWatch India Cold-Chain Pricing',
          snippet: 'FrostWatch charges INR 3,500/month for 2 sensors with email alerts.',
        },
      ],
    });

    const fakeCompLlm: LlmDriver = {
      async generateJson(prompt: string) {
        if (prompt.includes('Extract or summarize competitor archetypes')) {
          return JSON.stringify({
            competitors: [
              {
                name: 'FrostWatch India',
                website: 'https://frostwatch.example.in',
                description: 'Hardware + web dashboard for warehouse temperature logging.',
                pricing: 'INR 3,500/month for 2 sensors',
                features: ['2 sensors', 'Email alerts'],
                strengths: ['Established brand'],
                weaknesses: ['No WhatsApp alerts', 'No automated FSSAI PDF'],
                notes: 'Discovered from Sonar source.',
                sourceId: 'SRC-1',
              },
            ],
          });
        }
        return JSON.stringify({
          opportunities: [
            {
              title: 'WhatsApp-first instant alerts & 1-click FSSAI export',
              rationale:
                'Saved competitors rely on email alerts and manual PDF assembly; bundling WhatsApp alerts with audit-ready exports addresses this direct weakness.',
              evidenceLabel: 'AI interpretation',
            },
          ],
        });
      },
      async embedText() {
        return [0.1, 0.2];
      },
    };

    const app = createApiApp({
      dbPath: ':memory:',
      competitorsOptions: {
        llmDriver: fakeCompLlm,
        sonarFn: fakeSonar,
      },
    });
    const userA = await registerUser(app, 'comp-a@example.com', 'Comp Owner');
    const userB = await registerUser(app, 'comp-b@example.com', 'Comp Other');

    // Manual add
    const manualRes = await request(app)
      .post('/api/v1/competitors')
      .set('Cookie', userA.cookies)
      .send({
        name: 'Manual Legacy Spreadsheet',
        website: 'https://legacy.example',
        description: 'Paper + Excel logbooks used by local operators.',
        pricing: 'Free / Manual labor',
        features: ['Manual entry'],
        strengths: ['Zero software cost'],
        weaknesses: ['Prone to audit failures'],
        notes: 'Observed in customer discovery',
        sourceUrl: '',
        sourceType: 'manual',
      })
      .expect(201);
    const manualId = manualRes.body.competitor.id as string;
    expect(manualRes.body.competitor.sourceType).toBe('manual');

    // Discover competitors via Sonar mock
    const discRes = await request(app)
      .post('/api/v1/competitors/discover')
      .set('Cookie', userA.cookies)
      .send({
        industry: 'Cold-chain logistics',
        productOrService: 'FSSAI logbook',
        location: 'India',
      })
      .expect(201);
    expect(discRes.body.researchMode).toBe('sonar');
    expect(discRes.body.items).toHaveLength(1);
    expect(discRes.body.items[0].sourceType).toBe('researched');
    expect(discRes.body.items[0].sourceUrl).toBe('https://frostwatch.example.in/pricing');
    expect(discRes.body.items[0].isDemo).toBe(false);

    // Differentiation opportunities ("AI interpretation")
    const diffRes = await request(app)
      .post('/api/v1/competitors/differentiate')
      .set('Cookie', userA.cookies)
      .expect(200);
    expect(diffRes.body.differentiation.opportunities[0].evidenceLabel).toBe('AI interpretation');

    // Cross-user 404 ownership
    await request(app)
      .get(`/api/v1/competitors/${manualId}`)
      .set('Cookie', userB.cookies)
      .expect(404);
    await request(app)
      .patch(`/api/v1/competitors/${manualId}`)
      .set('Cookie', userB.cookies)
      .send({ name: 'Tampered' })
      .expect(404);
    await request(app)
      .delete(`/api/v1/competitors/${manualId}`)
      .set('Cookie', userB.cookies)
      .expect(404);

    // Owner edits & deletes manual competitor
    const patchRes = await request(app)
      .patch(`/api/v1/competitors/${manualId}`)
      .set('Cookie', userA.cookies)
      .send({
        name: 'Manual Legacy Logbook v2',
        pricing: 'INR 0',
        sourceType: 'manual',
      })
      .expect(200);
    expect(patchRes.body.competitor.name).toBe('Manual Legacy Logbook v2');

    await request(app)
      .delete(`/api/v1/competitors/${manualId}`)
      .set('Cookie', userA.cookies)
      .expect(200);
    await request(app)
      .get(`/api/v1/competitors/${manualId}`)
      .set('Cookie', userA.cookies)
      .expect(404);
  });
});
