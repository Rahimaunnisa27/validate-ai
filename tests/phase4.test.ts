import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import type { LlmDriver } from '../server/services/llmClient.ts';
import {
  buildLeadsCsvExport,
  classifyBudgetTier,
  formatCsvExportCell,
  hasCsvFormulaTrigger,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  parseCsvText,
  SALES_DRAFT_NOTICE,
  sanitizeCsvImportCell,
  verifyAndNormalizeBudgetAllocation,
  type MarketingStrategyJson,
  type SalesPlaybookJson,
} from '../src/shared/phase4Schemas.ts';

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

function buildMockMarketingJson(budget: number, offPct = false): string {
  const strategy: MarketingStrategyJson = {
    campaignTitle: 'Cold-Chain Compliance Pilot Push',
    positioning: 'Automated temperature audit compliance for Indian cold-storage operators.',
    objectives: [
      'Generate 30 qualified cold-room pilot demos in 60 days',
      'Establish credibility with regional FSSAI consultants',
    ],
    channels: [
      {
        channel: 'LinkedIn Organic & Outbound',
        priority: 'Primary',
        rationale: 'Reaches plant directors and quality heads directly.',
      },
      {
        channel: 'WhatsApp & Direct Outreach',
        priority: 'Secondary',
        rationale: 'High open rate for facility supervisors in Tier-2 cities.',
      },
    ],
    socialStrategy: {
      cadence: '3 posts/week + daily supervisor outreach',
      formats: ['Checklist PDF', 'Short walkthrough video'],
      themes: ['FSSAI inspection readiness', 'Preventing overnight spoilage'],
    },
    contentIdeas: [
      {
        title: '7-Point Cold-Room Audit Checklist',
        format: 'Checklist',
        angle: 'Zero-paper inspection prep for plant managers',
      },
      {
        title: 'How Overnight Compressor Drift Causes Silent Spoilage',
        format: 'Case Brief',
        angle: 'Operational downtime avoidance',
      },
    ],
    campaigns: [
      {
        name: '14-Day Compliance Trial Outreach',
        goal: 'Book 15 supervisor demos',
        channel: 'WhatsApp & Direct Outreach',
        actionSteps: ['Segment 100 local dairy facilities', 'Send editable pilot invite'],
      },
    ],
    budgetAllocation: offPct
      ? [
          {
            channel: 'Content & Checklist Assets',
            percentage: 45,
            amount: 1000, // Intentionally mismatched amount & pct sum (45 + 35 = 80%)
            rationale: 'Core collateral creation',
          },
          {
            channel: 'Direct Outreach & Field Pilots',
            percentage: 35,
            amount: 1000,
            rationale: 'Supervisor follow-up kits',
          },
        ]
      : [
          {
            channel: 'Content & Checklist Assets',
            percentage: 60,
            amount: budget * 0.6,
            rationale: 'Core collateral creation',
          },
          {
            channel: 'Direct Outreach & Field Pilots',
            percentage: 40,
            amount: budget * 0.4,
            rationale: 'Supervisor follow-up kits',
          },
        ],
    acquisitionSuggestions: [
      'Partner with regional refrigeration maintenance technicians for warm referrals.',
      'Offer a free 14-day audit log export during pilot onboarding.',
    ],
    kpis: [
      { metric: 'Qualified Pilot Demos', targetNote: 'Track weekly scheduled demos' },
      { metric: 'Pilot-to-Paid Conversion', targetNote: 'Review at Day 30 post-trial' },
    ],
  };
  return JSON.stringify(strategy);
}

function buildMockSalesJson(): string {
  const playbook: SalesPlaybookJson = {
    title: 'Dairy Cold-Room Founder Outbound Playbook',
    salesStrategy:
      'Lead with audit risk reduction during surprise FSSAI inspections and offer a 14-day single-chamber pilot.',
    pitch:
      'We replace paper cold-room registers with automated sensor alerts and 1-click audit logs in under an hour.',
    productPositioning:
      'Built specifically for 2-10 chamber regional cold-storage operators who need audit-ready records without ERP overhead.',
    pricingSuggestions:
      'Offer INR 2,500/month per chamber with free sensor calibration during the first 30 days.',
    funnelRecommendations:
      'New -> Contacted (Day 1) -> Interested (Demo booked) -> Qualified (Chamber count confirmed) -> Converted.',
    outreachDrafts: [
      {
        channel: 'Cold Email',
        subject: 'Quick question about your [Company] cold-room audit logs',
        message: 'Hi [Name], noticed [Company] operates cold storage in [City]...',
      },
      {
        channel: 'WhatsApp',
        subject: '15-min cold-room logbook walkthrough',
        message: 'Hello [Name], sharing a quick 1-page sample of automated FSSAI temp logs.',
      },
    ],
    followUpDrafts: [
      {
        step: 'Follow-up 1',
        timing: 'Day 3',
        subject: 'Re: cold-room audit logs',
        message: 'Hi [Name], checking if you want to see a sample export for [Company].',
      },
      {
        step: 'Follow-up 2',
        timing: 'Day 7',
        subject: 'Sample audit checklist',
        message: 'Hi [Name], attaching our cold-room readiness checklist for your supervisor.',
      },
    ],
  };
  return JSON.stringify(playbook);
}

describe('Phase 4 — CSV Injection Guard, Parsing & Budget Allocation Verification', () => {
  it('detects and neutralizes CSV formula triggers (=, +, -, @) on import and export', () => {
    const triggers = ['=CMD|"/C calc"!A0', '+1+1', '-2+3', '@SUM(1,1)', '  =HYPERLINK("x")'];
    for (const sample of triggers) {
      expect(hasCsvFormulaTrigger(sample)).toBe(true);
      const imported = sanitizeCsvImportCell(sample);
      expect(imported.neutralized).toBe(true);
      expect(hasCsvFormulaTrigger(imported.value)).toBe(false);

      const exported = formatCsvExportCell(sample);
      // Exported cell prefixes with ' (wrapped in quotes if needed) so spreadsheets treat as text
      expect(exported.startsWith("'") || exported.startsWith('"\'')).toBe(true);
    }

    const csvOut = buildLeadsCsvExport([
      {
        name: '=SUM(A1:A2)',
        email: 'safe@example.in',
        phone: '+919800000000',
        company: '@EvilCorp',
        source: '-manual',
        status: 'New',
        notes: 'Clean note',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(csvOut).toContain("'=SUM(A1:A2)");
    expect(csvOut).toContain("'+919800000000");
    expect(csvOut).toContain("'@EvilCorp");
    expect(csvOut).toContain("'-manual");
  });

  it('enforces CSV row limit and parses quoted cells accurately', () => {
    const parsed = parseCsvText(
      'Name,Email,Company\n"Asha, Patel",asha@example.in,"Cold ""Grid"" Pvt Ltd"\n',
    );
    expect(parsed.headers).toEqual(['Name', 'Email', 'Company']);
    expect(parsed.rows[0].Name).toBe('Asha, Patel');
    expect(parsed.rows[0].Company).toBe('Cold "Grid" Pvt Ltd');

    const tooManyRows = ['Name,Email', ...Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => `Lead ${i},l${i}@test.in`)].join('\n');
    expect(() => parseCsvText(tooManyRows, MAX_CSV_ROWS)).toThrow(/exceeding/i);
  });

  it('verifies and deterministically corrects budget allocation percentages (100%) and amounts (budget) and rejects invalid zero/negative allocations', () => {
    expect(classifyBudgetTier(25_000)).toBe('low');
    expect(classifyBudgetTier(150_000)).toBe('medium');
    expect(classifyBudgetTier(500_000)).toBe('high');

    // Exact allocation passes without adjustment
    const exact = verifyAndNormalizeBudgetAllocation(
      [
        { channel: 'LinkedIn', percentage: 60, amount: 30_000, rationale: 'Primary B2B' },
        { channel: 'Content', percentage: 40, amount: 20_000, rationale: 'Lead magnets' },
      ],
      50_000,
    );
    expect(exact.wasCorrected).toBe(false);
    expect(exact.percentageSum).toBe(100);
    expect(exact.amountSum).toBe(50_000);

    // Drifted percentages (50 + 30 = 80) and wrong amounts get normalized deterministically
    const drifted = verifyAndNormalizeBudgetAllocation(
      [
        { channel: 'LinkedIn', percentage: 50, amount: 100, rationale: 'Primary B2B' },
        { channel: 'Content', percentage: 30, amount: 100, rationale: 'Lead magnets' },
      ],
      40_000,
    );
    expect(drifted.wasCorrected).toBe(true);
    expect(drifted.percentageSum).toBe(100);
    expect(drifted.amountSum).toBe(40_000);
    expect(drifted.items[0].percentage).toBe(62.5);
    expect(drifted.items[1].percentage).toBe(37.5);
    expect(drifted.items[0].amount).toBe(25_000);
    expect(drifted.items[1].amount).toBe(15_000);

    // Zero or negative totals rejected
    expect(() =>
      verifyAndNormalizeBudgetAllocation(
        [{ channel: 'Zero', percentage: 0, amount: 0, rationale: 'Invalid' }],
        40_000,
      ),
    ).toThrow();
    expect(() =>
      verifyAndNormalizeBudgetAllocation(
        [{ channel: 'Neg', percentage: -10, amount: 1000, rationale: 'Invalid' }],
        40_000,
      ),
    ).toThrow();
  });
});

describe('Phase 4 — Leads, Stage Moves, CSV Import, Marketing, Sales & 404 Ownership', () => {
  it('supports leads CRUD, notes timeline, stage moves, dashboard real stage counts, CSV import error report & 2MB guard, and 404 ownership', async () => {
    const app = createApiApp({ dbPath: ':memory:' });
    const alpha = await registerUser(app, 'alpha4@example.in', 'Alpha Founder');
    const beta = await registerUser(app, 'beta4@example.in', 'Beta Founder');

    // Create manual lead
    const createRes = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', alpha.cookies)
      .send({
        name: 'Vikram ColdRoom',
        email: 'vikram@coldroom.in',
        phone: '+91 9820011223',
        company: 'Sahyadri Ice & Cold',
        source: 'LinkedIn',
        status: 'New',
        notes: 'Initial outreach target',
      })
      .expect(201);

    const leadId = createRes.body.lead.id as string;
    expect(createRes.body.summary.totalLeads).toBe(1);
    expect(createRes.body.summary.byStage.New).toBe(1);

    // Timeline notes add & delete
    const noteRes = await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Cookie', alpha.cookies)
      .send({ content: 'Called supervisor; requested sample FSSAI PDF.' })
      .expect(201);
    const noteId = noteRes.body.note.id as string;

    const getRes = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Cookie', alpha.cookies)
      .expect(200);
    expect(getRes.body.timelineNotes).toHaveLength(1);

    // Stage move via PATCH /stage -> Converted updates conversion rate & Dashboard counts
    const stageRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/stage`)
      .set('Cookie', alpha.cookies)
      .send({ status: 'Converted' })
      .expect(200);
    expect(stageRes.body.lead.status).toBe('Converted');
    expect(stageRes.body.summary.conversionRate).toBe(100);

    // CSV Import with valid row, formula injection row, and invalid row -> per-row error report
    const csvPayload = [
      'Full Name,Email Address,Company Name,Channel,Pipeline Stage',
      'Meera Logistics,meera@logistics.in,Western Freight,Referral,Qualified',
      '=CMD|calc!A0,bad-email-format,@InjectedOrg,+Source,New',
      'Rohan Dairy,rohan@dairy.in,-DashOrg,Event,Interested',
    ].join('\n');

    const importRes = await request(app)
      .post('/api/v1/leads/import')
      .set('Cookie', alpha.cookies)
      .send({
        csvText: csvPayload,
        mapping: {
          name: 'Full Name',
          email: 'Email Address',
          company: 'Company Name',
          source: 'Channel',
          status: 'Pipeline Stage',
        },
      })
      .expect(201);

    expect(importRes.body.importedCount).toBe(2);
    expect(importRes.body.skippedCount).toBe(1);
    expect(importRes.body.errors).toHaveLength(1);
    expect(importRes.body.errors[0].row).toBe(3);
    expect(importRes.body.sanitizedFormulaCells).toBeGreaterThanOrEqual(4);

    // Export CSV neutralizes formula cells cleanly
    const exportRes = await request(app)
      .get('/api/v1/leads/export.csv')
      .set('Cookie', alpha.cookies)
      .expect(200);
    expect(exportRes.text).toContain('Meera Logistics');
    expect(exportRes.text).toContain('Rohan Dairy');

    // Enforce 2 MB CSV limit
    const overLimitCsv = 'Name\n' + 'A'.repeat(MAX_CSV_BYTES + 100);
    await request(app)
      .post('/api/v1/leads/import')
      .set('Cookie', alpha.cookies)
      .send({ csvText: overLimitCsv, mapping: { name: 'Name' } })
      .expect(400);

    // Dashboard reflects real lead totals by stage (1 Converted, 1 Qualified, 1 Interested = 3 total)
    const dashRes = await request(app)
      .get('/api/v1/dashboard')
      .set('Cookie', alpha.cookies)
      .expect(200);
    expect(dashRes.body.summary.totalLeads).toBe(3);
    expect(dashRes.body.summary.leadsByStage.Converted).toBe(1);
    expect(dashRes.body.summary.leadsByStage.Qualified).toBe(1);
    expect(dashRes.body.summary.leadsByStage.Interested).toBe(1);

    // Cross-user 404 ownership isolation
    await request(app).get(`/api/v1/leads/${leadId}`).set('Cookie', beta.cookies).expect(404);
    await request(app)
      .patch(`/api/v1/leads/${leadId}/stage`)
      .set('Cookie', beta.cookies)
      .send({ status: 'Lost' })
      .expect(404);
    await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Cookie', beta.cookies)
      .send({ content: 'Unauthorized note' })
      .expect(404);
    await request(app)
      .delete(`/api/v1/leads/${leadId}/notes/${noteId}`)
      .set('Cookie', beta.cookies)
      .expect(404);
    await request(app).delete(`/api/v1/leads/${leadId}`).set('Cookie', beta.cookies).expect(404);

    // Owner deletes note & lead cleanly
    await request(app)
      .delete(`/api/v1/leads/${leadId}/notes/${noteId}`)
      .set('Cookie', alpha.cookies)
      .expect(200);
    await request(app).delete(`/api/v1/leads/${leadId}`).set('Cookie', alpha.cookies).expect(200);
  });

  it('supports Marketing Strategy (budget tiering, 100% allocation correction, AI label) and Sales Assistant (editable, never-auto-sent notice) with 404 ownership', async () => {
    const mockDriver: LlmDriver = {
      async generateJson(prompt: string) {
        if (prompt.includes('marketing strategist')) {
          return buildMockMarketingJson(25_000, true);
        }
        return buildMockSalesJson();
      },
      async embedText() {
        return [0.1, 0.2];
      },
    };

    const app = createApiApp({
      dbPath: ':memory:',
      marketingOptions: { llmDriver: mockDriver },
      salesOptions: { llmDriver: mockDriver },
    });

    const alpha = await registerUser(app, 'alpha-mkt@example.in', 'Alpha Growth');
    const beta = await registerUser(app, 'beta-mkt@example.in', 'Beta Growth');

    // Marketing generate (low budget tier = 25,000, off-sum percentages corrected automatically)
    const mktRes = await request(app)
      .post('/api/v1/marketing/generate')
      .set('Cookie', alpha.cookies)
      .send({
        businessDescription: 'Automated cold-chain compliance monitoring for dairy cold rooms.',
        targetAudience: 'Dairy cold-storage supervisors',
        industry: 'Cold-chain Logistics',
        budget: 25_000,
        market: 'India Tier-2 cities',
        preferredChannels: ['WhatsApp & Direct Outreach', 'Content / SEO'],
      })
      .expect(201);

    expect(mktRes.body.allocationAdjusted).toBe(true);
    const camp = mktRes.body.campaign;
    expect(camp.budgetTier).toBe('low');
    expect(camp.evidenceLabel).toBe('AI interpretation');
    const pctSum = camp.strategy.budgetAllocation.reduce(
      (a: number, b: { percentage: number }) => a + b.percentage,
      0,
    );
    const amtSum = camp.strategy.budgetAllocation.reduce(
      (a: number, b: { amount: number }) => a + b.amount,
      0,
    );
    expect(Math.round(pctSum * 100) / 100).toBe(100);
    expect(Math.round(amtSum * 100) / 100).toBe(25_000);

    // Edit marketing campaign
    const mktPatch = await request(app)
      .patch(`/api/v1/marketing/${camp.id}`)
      .set('Cookie', alpha.cookies)
      .send({
        title: 'Updated Q4 Dairy Launch',
        inputs: camp.inputs,
        strategy: camp.strategy,
      })
      .expect(200);
    expect(mktPatch.body.campaign.title).toBe('Updated Q4 Dairy Launch');

    // Cross-user 404 on marketing
    await request(app)
      .get(`/api/v1/marketing/${camp.id}`)
      .set('Cookie', beta.cookies)
      .expect(404);
    await request(app)
      .delete(`/api/v1/marketing/${camp.id}`)
      .set('Cookie', beta.cookies)
      .expect(404);

    // Sales playbook generate
    const salesRes = await request(app)
      .post('/api/v1/sales/generate')
      .set('Cookie', alpha.cookies)
      .send({
        productDescription: 'IoT temperature logbook with instant WhatsApp excursion alerts.',
        targetCustomer: 'Regional cold-storage operators',
        pricePoint: 'INR 2,500/month',
        salesChannel: 'Founder-led outbound + WhatsApp demo',
        valueProposition: 'Prevent overnight spoilage and pass FSSAI inspections without paper logs.',
      })
      .expect(201);

    const pb = salesRes.body.playbook;
    expect(pb.draftNotice).toBe(SALES_DRAFT_NOTICE);
    expect(pb.playbook.outreachDrafts.length).toBeGreaterThanOrEqual(2);
    expect(pb.playbook.followUpDrafts.length).toBeGreaterThanOrEqual(2);

    // Edit & save sales playbook
    const salesPatch = await request(app)
      .patch(`/api/v1/sales/${pb.id}`)
      .set('Cookie', alpha.cookies)
      .send({
        title: 'Edited Dairy Outbound Playbook',
        inputs: pb.inputs,
        playbook: {
          ...pb.playbook,
          pitch: 'Custom edited founder pitch ready for live discovery calls.',
        },
      })
      .expect(200);
    expect(salesPatch.body.playbook.title).toBe('Edited Dairy Outbound Playbook');
    expect(salesPatch.body.playbook.playbook.pitch).toContain('Custom edited founder pitch');

    // Cross-user 404 on sales
    await request(app).get(`/api/v1/sales/${pb.id}`).set('Cookie', beta.cookies).expect(404);
    await request(app)
      .delete(`/api/v1/sales/${pb.id}`)
      .set('Cookie', beta.cookies)
      .expect(404);

    // Owner cleanup
    await request(app).delete(`/api/v1/marketing/${camp.id}`).set('Cookie', alpha.cookies).expect(200);
    await request(app).delete(`/api/v1/sales/${pb.id}`).set('Cookie', alpha.cookies).expect(200);
  });
});
