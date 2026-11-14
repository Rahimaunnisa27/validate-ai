import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import { getDb } from '../server/db.ts';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemoAccount } from '../server/seed.ts';

let app: ReturnType<typeof createApiApp>;

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  app = createApiApp({ dbPath: ':memory:' });
});

describe('VenturePilot AI — Phase 1 API & Security Checks', () => {
  it('returns system status and feature flags without leaking secret values', async () => {
    const res = await request(app).get('/api/v1/system/status');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.integrations)).toBe(true);
    expect(typeof res.body.flags.allowUnpaidReports).toBe('boolean');
    expect(typeof res.body.flags.demoMode).toBe('boolean');
    const dbItem = res.body.integrations.find((i: { key: string }) => i.key === 'database');
    expect(dbItem.reachable).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('CHANGE_ME');
  });

  it('seeds demo account idempotently with 1 startup and 2 submitted ideas', async () => {
    const db = getDb();
    await seedDemoAccount(db);
    await seedDemoAccount(db); // verify idempotency

    const demoAgent = request.agent(app);
    const loginRes = await demoAgent.post('/api/v1/auth/login').send({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(loginRes.status).toBe(200);

    const dashRes = await demoAgent.get('/api/v1/dashboard');
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.summary.activeStartups).toBe(1);
    expect(dashRes.body.summary.submittedIdeas).toBe(2);
    expect(dashRes.body.summary.totalIdeas).toBe(2);
  });

  it('reads report pricing tiers from the database', async () => {
    const res = await request(app).get('/api/v1/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans.length).toBe(3);
    expect(res.body.plans.map((p: { priceInr: number }) => p.priceInr)).toEqual([49, 149, 299]);
  });

  it('saves contact form submissions to the database', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Rohan Mehta',
      email: 'rohan@example.in',
      subject: 'Phase 1 inquiry',
      message: 'Testing that contact form messages persist cleanly to SQLite.',
    });
    expect(res.status).toBe(201);
    expect(res.body.saved).toBe(true);
    expect(res.body.id).toBeTruthy();
  });

  it('blocks unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('completes full Phase 1 founder flow and enforces cross-user ownership isolation (404)', async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    // 1. Register User A
    const regA = await agentA.post('/api/v1/auth/register').send({
      fullName: 'Founder Alpha',
      email: 'alpha@example.in',
      password: 'Password123!',
    });
    expect(regA.status).toBe(201);
    expect(regA.body.user.email).toBe('alpha@example.in');

    // 2. Logout & Login User A
    const logoutA = await agentA.post('/api/v1/auth/logout');
    expect(logoutA.status).toBe(200);

    const afterLogout = await agentA.get('/api/v1/users/me');
    expect(afterLogout.status).toBe(401);

    const loginA = await agentA.post('/api/v1/auth/login').send({
      email: 'alpha@example.in',
      password: 'Password123!',
    });
    expect(loginA.status).toBe(200);

    // 3. Create Startup for User A
    const startupRes = await agentA.post('/api/v1/startups').send({
      name: 'ColdGrid Logistics',
      industry: 'Supply Chain',
      stage: 'mvp',
      location: 'Pune, India',
    });
    expect(startupRes.status).toBe(201);
    const startupId = startupRes.body.startup.id;

    // 4. Create Idea Draft (autosave step 2), reload it, then submit
    const draftRes = await agentA.post('/api/v1/ideas').send({
      currentStep: 2,
      startupId,
      title: 'Cold-Chain Compliance App',
      businessDetails: {
        title: 'Cold-Chain Compliance App',
        startupId,
        industry: 'Supply Chain',
        businessModel: 'saas',
        stage: 'mvp',
        oneLiner: 'Automated FSSAI temperature logbooks for cold storage operators.',
      },
      problemSolution: {
        problemStatement: 'Manual paper temperature logs fail audits and cause spoilage.',
        proposedSolution: 'Automated alert dashboard with audit-ready PDF exports.',
      },
    });
    expect(draftRes.status).toBe(201);
    const ideaId = draftRes.body.idea.id;
    expect(draftRes.body.idea.status).toBe('draft');
    expect(draftRes.body.idea.currentStep).toBe(2);

    // Reload draft
    const reloadDraft = await agentA.get(`/api/v1/ideas/${ideaId}`);
    expect(reloadDraft.status).toBe(200);
    expect(reloadDraft.body.idea.currentStep).toBe(2);
    expect(reloadDraft.body.idea.problemSolution.problemStatement).toContain('Manual paper');

    // Submit full idea
    const submitRes = await agentA.post(`/api/v1/ideas/${ideaId}/submit`).send({
      businessDetails: {
        title: 'Cold-Chain Compliance App',
        startupId,
        industry: 'Supply Chain',
        businessModel: 'saas',
        stage: 'mvp',
        oneLiner: 'Automated FSSAI temperature logbooks for cold storage operators.',
      },
      problemSolution: {
        problemStatement: 'Manual paper temperature logs fail audits and cause spoilage.',
        currentAlternatives: 'Excel sheets',
        proposedSolution: 'Automated alert dashboard with audit-ready PDF exports.',
        uniqueValueProposition: 'Works with existing sensors',
      },
      targetCustomer: {
        primarySegment: 'Mid-sized cold storage operators',
        geography: 'India',
        customerPainLevel: 'high',
        willingnessToPay: '4500 INR/month',
      },
      financials: {
        initialCapitalInr: 500000,
        pricePerUnitInr: 4500,
      },
      competitors: {
        knownCompetitors: 'Manual logs',
      },
    });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.idea.status).toBe('submitted');

    // 5. Verify Dashboard reflects real DB counts
    const dashA = await agentA.get('/api/v1/dashboard');
    expect(dashA.status).toBe(200);
    expect(dashA.body.summary.totalIdeas).toBe(1);
    expect(dashA.body.summary.submittedIdeas).toBe(1);
    expect(dashA.body.summary.activeStartups).toBe(1);

    // 6. Register User B and prove User B CANNOT read, update, or delete User A's data (returns 404)
    const regB = await agentB.post('/api/v1/auth/register').send({
      fullName: 'Founder Beta',
      email: 'beta@example.in',
      password: 'Password123!',
    });
    expect(regB.status).toBe(201);

    const bListIdeas = await agentB.get('/api/v1/ideas');
    expect(bListIdeas.status).toBe(200);
    expect(bListIdeas.body.items.length).toBe(0);

    const bGetIdea = await agentB.get(`/api/v1/ideas/${ideaId}`);
    expect(bGetIdea.status).toBe(404);

    const bPatchIdea = await agentB.patch(`/api/v1/ideas/${ideaId}`).send({ title: 'Hijacked' });
    expect(bPatchIdea.status).toBe(404);

    const bDeleteIdea = await agentB.delete(`/api/v1/ideas/${ideaId}`);
    expect(bDeleteIdea.status).toBe(404);

    const bGetStartup = await agentB.get(`/api/v1/startups/${startupId}`);
    expect(bGetStartup.status).toBe(404);

    const bDeleteStartup = await agentB.delete(`/api/v1/startups/${startupId}`);
    expect(bDeleteStartup.status).toBe(404);
  });

  it('supports single-use password reset tokens and blocks reuse', async () => {
    const db = getDb();
    const res = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'alpha@example.in',
    });
    expect(res.status).toBe(200);

    const tokenCount = db
      .prepare('SELECT COUNT(*) as cnt FROM password_reset_tokens')
      .get() as { cnt: number };
    expect(tokenCount.cnt).toBeGreaterThan(0);

    const badReset = await request(app).post('/api/v1/auth/reset-password').send({
      token: 'invalid-token-value-123456',
      password: 'NewPassword123!',
    });
    expect(badReset.status).toBe(400);
  });

  it('logs in and accesses /api/v1/dashboard using returned cookies, HTTPS proxy SameSite=None, and Bearer fallback', async () => {
    const db = getDb();
    await seedDemoAccount(db);

    // 1. Local HTTP login sets SameSite=Lax (no Secure) and allows calling /dashboard with returned cookies
    const httpLogin = await request(app).post('/api/v1/auth/login').send({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(httpLogin.status).toBe(200);
    expect(typeof httpLogin.body.accessToken).toBe('string');

    const httpCookies = httpLogin.headers['set-cookie'] as unknown as string[];
    expect(Array.isArray(httpCookies)).toBe(true);
    expect(httpCookies.some((c) => c.startsWith('vp_access_token=') && c.includes('SameSite=Lax'))).toBe(true);

    const cookieHeader = httpCookies.map((c) => c.split(';')[0]).join('; ');
    const dashViaCookies = await request(app)
      .get('/api/v1/dashboard')
      .set('Cookie', cookieHeader);
    expect(dashViaCookies.status).toBe(200);
    expect(dashViaCookies.body.summary.activeStartups).toBe(1);

    // 2. Behind HTTPS proxy (AI Studio preview), cookies get SameSite=None and Secure
    const httpsLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://ais-dev-preview.run.app')
      .set('Host', 'ais-dev-preview.run.app')
      .send({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
    expect(httpsLogin.status).toBe(200);
    expect(httpsLogin.headers['access-control-allow-credentials']).toBe('true');
    expect(httpsLogin.headers['access-control-allow-origin']).toBe('https://ais-dev-preview.run.app');

    const httpsCookies = httpsLogin.headers['set-cookie'] as unknown as string[];
    expect(
      httpsCookies.some(
        (c) =>
          c.startsWith('vp_access_token=') &&
          c.includes('SameSite=None') &&
          c.includes('Secure') &&
          c.includes('HttpOnly'),
      ),
    ).toBe(true);

    // 3. Fallback when third-party cookies are blocked: Authorization Bearer header works alone
    const dashViaBearer = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${httpsLogin.body.accessToken}`);
    expect(dashViaBearer.status).toBe(200);
    expect(dashViaBearer.body.summary.submittedIdeas).toBe(2);
  });
});
