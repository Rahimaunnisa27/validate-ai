import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemoAccount } from '../server/seed.ts';
import { initDatabase } from '../server/db.ts';
import { PERSONA_DISCLAIMER } from '../src/shared/phase3aSchemas.ts';
import {
  REPORT_SECTION_META,
  SCORE_LABELS,
  SCORING_DISCLAIMER,
} from '../src/shared/reportSchemas.ts';

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not allocate free port')));
      }
    });
  });
}

async function isServerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerHealthy(baseUrl)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${baseUrl} did not become healthy within ${timeoutMs}ms`);
}

async function main() {
  let baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
  let child: ChildProcess | null = null;

  try {
    let alreadyRunning = await isServerHealthy(baseUrl);
    if (!alreadyRunning && (baseUrl === 'http://localhost:3000' || !process.env.SMOKE_BASE_URL)) {
      if (await isServerHealthy('http://127.0.0.1:3000')) {
        baseUrl = 'http://127.0.0.1:3000';
        alreadyRunning = true;
      }
    }
    if (!alreadyRunning) {
      const port = await findFreePort();
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[smoke] Starting local server on ${baseUrl}...`);

      let tsxCli: string | null = null;
      try {
        const req = createRequire(import.meta.url);
        tsxCli = req.resolve('tsx/cli');
      } catch {
        // Fallback if tsx/cli cannot be resolved
      }

      if (tsxCli) {
        child = spawn(process.execPath, [tsxCli, 'server.ts'], {
          env: { ...process.env, PORT: String(port), APP_URL: baseUrl },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        child = spawn('npx', ['tsx', 'server.ts'], {
          env: { ...process.env, PORT: String(port), APP_URL: baseUrl },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        });
      }
      child.on('error', (err) => {
        console.error(`[smoke] Server spawn error: ${err.message}`);
      });
      child.stdout?.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
      child.stderr?.on('data', (chunk) => process.stderr.write(`[server-err] ${chunk}`));
      await waitForHealth(baseUrl);
    } else {
      console.log(`[smoke] Using running server at ${baseUrl}`);
    }

    // Ensure demo account exists in the configured SQLite DB
    const db = initDatabase();
    await seedDemoAccount(db);

    const cookieJar = new Map<string, string>();
    let currentAccessToken: string | null = null;
    const authHeaders: Record<string, string> = {};

    function updateCookiesFromResponse(res: Response): void {
      const setCookies =
        typeof res.headers.getSetCookie === 'function'
          ? res.headers.getSetCookie()
          : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
      for (const c of setCookies) {
        const [nameVal] = c.split(';');
        const eqIdx = nameVal.indexOf('=');
        if (eqIdx !== -1) {
          const name = nameVal.slice(0, eqIdx).trim();
          const val = nameVal.slice(eqIdx + 1).trim();
          cookieJar.set(name, val);
        }
      }
    }

    function syncAuthHeaders(): void {
      const cookies = Array.from(cookieJar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      if (cookies) {
        authHeaders['Cookie'] = cookies;
      }
      if (currentAccessToken) {
        authHeaders['Authorization'] = `Bearer ${currentAccessToken}`;
      }
    }

    async function loginDemoUser(): Promise<{ accessToken?: string; user?: { email?: string } }> {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Login failed (HTTP ${res.status}): ${text}`);
      }
      updateCookiesFromResponse(res);
      const data = JSON.parse(text) as { accessToken?: string; user?: { email?: string } };
      if (data.accessToken) {
        currentAccessToken = data.accessToken;
      }
      syncAuthHeaders();
      return data;
    }

    async function refreshTokenOrRelogin(): Promise<boolean> {
      // 1. Try POST /api/v1/auth/refresh
      try {
        const refreshHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        const cookies = Array.from(cookieJar.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
        if (cookies) {
          refreshHeaders['Cookie'] = cookies;
        }
        const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: refreshHeaders,
        });
        if (res.ok) {
          updateCookiesFromResponse(res);
          const data = (await res.json()) as { accessToken?: string };
          if (data.accessToken) {
            currentAccessToken = data.accessToken;
          }
          syncAuthHeaders();
          console.log('[smoke]    (Token expired: refreshed session via POST /api/v1/auth/refresh)');
          return true;
        }
      } catch {
        // Refresh failed, fall back to login below
      }

      // 2. If refresh fails, log in again as demo user
      try {
        await loginDemoUser();
        console.log('[smoke]    (Token expired: refresh failed, re-authenticated via POST /api/v1/auth/login)');
        return true;
      } catch {
        return false;
      }
    }

    async function apiFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
      function getCombinedHeaders(): Record<string, string> {
        const reqHeaders: Record<string, string> = {};
        if (init.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => {
              reqHeaders[k] = v;
            });
          } else if (Array.isArray(init.headers)) {
            for (const [k, v] of init.headers) {
              reqHeaders[k] = v;
            }
          } else {
            Object.assign(reqHeaders, init.headers);
          }
        }
        Object.assign(reqHeaders, authHeaders);
        return reqHeaders;
      }

      let res = await fetch(input, { ...init, headers: getCombinedHeaders() });
      updateCookiesFromResponse(res);

      if (res.status === 401) {
        let isExpired = false;
        try {
          const cloned = res.clone();
          const body = (await cloned.json()) as { error?: { code?: string } };
          if (body?.error?.code === 'TOKEN_EXPIRED') {
            isExpired = true;
          }
        } catch {
          // Response body was not JSON
        }

        if (isExpired) {
          const refreshed = await refreshTokenOrRelogin();
          if (refreshed) {
            res = await fetch(input, { ...init, headers: getCombinedHeaders() });
            updateCookiesFromResponse(res);
          }
        }
      }

      return res;
    }

    // 1. Login as demo founder
    console.log(`[smoke] 1. Logging in as ${DEMO_EMAIL}...`);
    const loginData = await loginDemoUser();
    console.log(`[smoke]    Logged in as ${loginData.user?.email} (cookies=${cookieJar.size}, bearer=${Boolean(loginData.accessToken)})`);

    // 2. Fetch submitted ideas
    console.log('[smoke] 2. Fetching submitted ideas...');
    const ideasRes = await apiFetch(`${baseUrl}/api/v1/ideas?status=submitted`, {
      headers: authHeaders,
    });
    if (!ideasRes.ok) {
      throw new Error(`Fetch ideas failed (HTTP ${ideasRes.status}): ${await ideasRes.text()}`);
    }
    const ideasData = (await ideasRes.json()) as { items: Array<{ id: string; title: string }> };
    if (!ideasData.items || ideasData.items.length === 0) {
      throw new Error('No submitted ideas found for demo user.');
    }
    const idea = ideasData.items[0];
    console.log(`[smoke]    Selected idea: "${idea.title}" (${idea.id})`);

    // 3. Trigger live report generation
    console.log('[smoke] 3. Calling POST /api/v1/reports/generate...');
    const genRes = await apiFetch(`${baseUrl}/api/v1/reports/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ ideaId: idea.id, planSlug: 'full' }),
    });
    const genText = await genRes.text();
    if (!genRes.ok) {
      throw new Error(`Generate failed (HTTP ${genRes.status}): ${genText}`);
    }
    const genData = JSON.parse(genText) as { report: { id: string; status: string } };
    const reportId = genData.report.id;
    console.log(`[smoke]    Queued report ${reportId} (status=${genData.report.status})`);

    // 4. Poll until completed or failed
    console.log('[smoke] 4. Polling GET /api/v1/reports/:id...');
    const pollDeadline = Date.now() + 180_000;
    let lastProgress = '';
    let finalReport: Record<string, unknown> | null = null;

    while (Date.now() < pollDeadline) {
      const pollRes = await apiFetch(`${baseUrl}/api/v1/reports/${reportId}`, {
        headers: authHeaders,
      });
      if (!pollRes.ok) {
        throw new Error(`Poll failed (HTTP ${pollRes.status}): ${await pollRes.text()}`);
      }
      const pollBody = (await pollRes.json()) as {
        report: {
          status: string;
          progressStep: number;
          progressTotal: number;
          progressLabel: string;
          jobError: string | null;
          reportJson: Record<string, unknown> | null;
          researchMode: string;
          concepts: string[];
          similarIdeas: unknown[];
          sources: unknown[];
        };
      };
      const rep = pollBody.report;
      const progressLine = `${rep.progressStep}/${rep.progressTotal} [${rep.status}] ${rep.progressLabel}`;
      if (progressLine !== lastProgress) {
        console.log(`[smoke]    Progress: ${progressLine}`);
        lastProgress = progressLine;
      }

      if (rep.status === 'completed') {
        finalReport = rep as unknown as Record<string, unknown>;
        break;
      }
      if (rep.status === 'failed') {
        throw new Error(`Report generation FAILED at step ${rep.progressStep}: ${rep.jobError}`);
      }

      await new Promise((r) => setTimeout(r, 1500));
    }

    if (!finalReport) {
      throw new Error('Timed out waiting for report completion after 180s.');
    }

    // 5. Verify 18 sections & 6 scores
    console.log('[smoke] 5. Verifying 18 sections, 6 scores, and disclaimer...');
    const reportJson = finalReport.reportJson as {
      disclaimer?: string;
      scores?: Record<string, { score: number; explanation: string; evidenceLabel: string }>;
      sections?: Record<string, unknown>;
    };
    if (!reportJson) {
      throw new Error('Completed report missing reportJson.');
    }
    if (reportJson.disclaimer !== SCORING_DISCLAIMER) {
      throw new Error(`Disclaimer mismatch: ${reportJson.disclaimer}`);
    }
    for (const s of SCORE_LABELS) {
      const scoreObj = reportJson.scores?.[s.key];
      if (!scoreObj || typeof scoreObj.score !== 'number') {
        throw new Error(`Missing score: ${s.key}`);
      }
    }
    for (const sec of REPORT_SECTION_META) {
      if (!reportJson.sections?.[sec.key]) {
        throw new Error(`Missing section: ${sec.key}`);
      }
    }
    console.log(
      `[smoke]    Verified all 18 sections, 6 scores, researchMode=${String(finalReport.researchMode)}, concepts=${(finalReport.concepts as string[]).length}`,
    );

    // 6. Fetch and verify PDF
    console.log('[smoke] 6. Fetching GET /api/v1/reports/:id/pdf...');
    const pdfRes = await apiFetch(`${baseUrl}/api/v1/reports/${reportId}/pdf`, {
      headers: authHeaders,
    });
    if (!pdfRes.ok) {
      throw new Error(`PDF download failed (HTTP ${pdfRes.status}): ${await pdfRes.text()}`);
    }
    const contentType = pdfRes.headers.get('content-type') || '';
    if (!contentType.includes('application/pdf')) {
      throw new Error(`Unexpected PDF Content-Type: ${contentType}`);
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    const header = pdfBuffer.subarray(0, 5).toString('utf8');
    if (header !== '%PDF-') {
      throw new Error(`Invalid PDF magic header: ${JSON.stringify(header)}`);
    }
    console.log(`[smoke]    Verified real PDF (${pdfBuffer.length} bytes, header=${header})`);

    // 7. Phase 3a — Financial Planner calculate, save, dashboard check, edit, delete
    console.log('[smoke] 7. Testing Phase 3a Financial Planner (/api/v1/finance)...');
    const startupsRes = await apiFetch(`${baseUrl}/api/v1/startups`, { headers: authHeaders });
    const startupsData = (await startupsRes.json()) as { items?: Array<{ id: string }> };
    const startupId = startupsData.items?.[0]?.id ?? null;

    const finCreateRes = await apiFetch(`${baseUrl}/api/v1/finance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name: 'Smoke Test Financial Plan',
        startupId,
        ideaId: idea.id,
        initialInvestment: 300000,
        sellingPrice: 4000,
        unitsSoldPerMonth: 50,
        fixedCosts: 40000,
        variableCostPerUnit: 1000,
        marketing: 20000,
        salaries: 50000,
        operationalExpenses: 10000,
      }),
    });
    const finCreateText = await finCreateRes.text();
    if (!finCreateRes.ok) {
      throw new Error(`Finance create failed (HTTP ${finCreateRes.status}): ${finCreateText}`);
    }
    const finData = JSON.parse(finCreateText) as {
      plan: {
        id: string;
        aiInterpretation: string | null;
        computed: {
          scenarios: {
            conservative: { operatingProfit: number; cashFlow12Months: unknown[] };
            expected: {
              revenue: number;
              totalExpenses: number;
              operatingProfit: number;
              breakEvenUnits: number | null;
            };
            optimistic: { operatingProfit: number };
          };
        };
      };
    };
    const exp = finData.plan.computed.scenarios.expected;
    if (exp.revenue !== 200000 || exp.operatingProfit !== 30000 || exp.breakEvenUnits !== 40) {
      throw new Error(`Unexpected deterministic finance calculation: ${JSON.stringify(exp)}`);
    }
    if (finData.plan.computed.scenarios.conservative.cashFlow12Months.length !== 12) {
      throw new Error('Expected 12-month cash flow points.');
    }
    console.log(
      `[smoke]    Finance plan saved (expectedProfit=${exp.operatingProfit}, aiInterpretation=${Boolean(finData.plan.aiInterpretation)})`,
    );

    // 8. Verify Dashboard Financial Overview reflects real saved plan
    console.log('[smoke] 8. Verifying Dashboard financialOverview...');
    const dashRes = await apiFetch(`${baseUrl}/api/v1/dashboard`, { headers: authHeaders });
    if (!dashRes.ok) {
      throw new Error(`Dashboard fetch failed (HTTP ${dashRes.status})`);
    }
    const dashData = (await dashRes.json()) as {
      financialOverview?: { planId: string; expectedMonthlyRevenue: number } | null;
    };
    if (!dashData.financialOverview || dashData.financialOverview.planId !== finData.plan.id) {
      throw new Error('Dashboard financialOverview did not reflect the latest saved plan.');
    }

    const finPatchRes = await apiFetch(`${baseUrl}/api/v1/finance/${finData.plan.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name: 'Smoke Test Financial Plan Updated',
        startupId,
        ideaId: idea.id,
        initialInvestment: 300000,
        sellingPrice: 4000,
        unitsSoldPerMonth: 60,
        fixedCosts: 40000,
        variableCostPerUnit: 1000,
        marketing: 20000,
        salaries: 50000,
        operationalExpenses: 10000,
      }),
    });
    if (!finPatchRes.ok) {
      throw new Error(`Finance update failed (HTTP ${finPatchRes.status}): ${await finPatchRes.text()}`);
    }
    const finDelRes = await apiFetch(`${baseUrl}/api/v1/finance/${finData.plan.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!finDelRes.ok) {
      throw new Error(`Finance delete failed (HTTP ${finDelRes.status})`);
    }
    console.log('[smoke]    Verified finance calculate/save/dashboard/edit/delete.');

    // 9. Phase 3a — Customer Personas generate, verify disclaimer & fields, edit, delete
    console.log('[smoke] 9. Testing Phase 3a Customer Personas (/api/v1/personas)...');
    const persGenRes = await apiFetch(`${baseUrl}/api/v1/personas/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        idea: 'Automated FSSAI Cold-Chain Logbook',
        industry: 'Cold-chain logistics & food safety',
        product: 'IoT temperature sensors with WhatsApp alerts and compliance logs',
        location: 'Tier-1 and Tier-2 cities in India',
        problem:
          'Cold storage supervisors rely on manual paper registers that miss overnight temperature spikes and fail surprise FSSAI audits.',
      }),
    });
    const persGenText = await persGenRes.text();
    if (!persGenRes.ok) {
      throw new Error(`Persona generate failed (HTTP ${persGenRes.status}): ${persGenText}`);
    }
    const persData = JSON.parse(persGenText) as {
      persona: {
        id: string;
        name: string;
        idea: string;
        industry: string;
        product: string;
        location: string;
        problem: string;
        segment: string;
        needs: string[];
        painPoints: string[];
        motivations: string[];
        objections: string[];
        preferredChannels: string[];
        purchaseConsiderations: string[];
        disclaimer: string;
      };
    };
    const p = persData.persona;
    if (p.disclaimer !== PERSONA_DISCLAIMER) {
      throw new Error(`Unexpected persona disclaimer: ${p.disclaimer}`);
    }
    if (
      !p.segment ||
      p.needs.length === 0 ||
      p.painPoints.length === 0 ||
      p.motivations.length === 0 ||
      p.objections.length === 0 ||
      p.preferredChannels.length === 0 ||
      p.purchaseConsiderations.length === 0
    ) {
      throw new Error('Generated persona missing one or more required output fields.');
    }

    const persPatchRes = await apiFetch(`${baseUrl}/api/v1/personas/${p.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name: `${p.name} (Verified)`,
        idea: p.idea,
        industry: p.industry,
        product: p.product,
        location: p.location,
        problem: p.problem,
        segment: p.segment,
        needs: p.needs,
        painPoints: p.painPoints,
        motivations: p.motivations,
        objections: p.objections,
        preferredChannels: p.preferredChannels,
        purchaseConsiderations: p.purchaseConsiderations,
      }),
    });
    if (!persPatchRes.ok) {
      throw new Error(`Persona update failed (HTTP ${persPatchRes.status}): ${await persPatchRes.text()}`);
    }

    const persDelRes = await apiFetch(`${baseUrl}/api/v1/personas/${p.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!persDelRes.ok) {
      throw new Error(`Persona delete failed (HTTP ${persDelRes.status})`);
    }
    console.log('[smoke]    Verified persona generate/disclaimer/edit/delete.');

    // 10. Phase 3b — Market Research (/api/v1/research)
    console.log('[smoke] 10. Testing Phase 3b Market Research (/api/v1/research)...');
    const resCreateRes = await apiFetch(`${baseUrl}/api/v1/research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        industry: 'Cold-chain food logistics',
        businessCategory: 'B2B Compliance SaaS',
        targetCustomer: 'Regional dairy cold-storage operators',
        location: 'India',
        productOrService: 'Automated FSSAI Cold-Chain Logbook',
      }),
    });
    const resCreateText = await resCreateRes.text();
    if (!resCreateRes.ok) {
      throw new Error(`Research create failed (HTTP ${resCreateRes.status}): ${resCreateText}`);
    }
    const resData = JSON.parse(resCreateText) as {
      run: {
        id: string;
        status: 'completed' | 'not_configured';
        researchMode: 'sonar' | 'demo' | 'none';
        sources: unknown[];
        result: { summary?: { text: string }; tamSamSom?: { tam: { value: string } } } | null;
        setupSteps: string[];
      };
    };
    const run = resData.run;
    if (run.researchMode === 'none') {
      if (run.status !== 'not_configured' || run.result !== null || run.sources.length !== 0) {
        throw new Error('Expected not_configured research run with zero fake claims or sources.');
      }
    } else if (run.status !== 'completed' || !run.result?.summary?.text) {
      throw new Error('Expected completed research run with summary.');
    }

    const resGetRes = await apiFetch(`${baseUrl}/api/v1/research/${run.id}`, {
      headers: authHeaders,
    });
    if (!resGetRes.ok) {
      throw new Error(`Research reopen failed (HTTP ${resGetRes.status})`);
    }
    const resDelRes = await apiFetch(`${baseUrl}/api/v1/research/${run.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!resDelRes.ok) {
      throw new Error(`Research delete failed (HTTP ${resDelRes.status})`);
    }
    console.log(
      `[smoke]    Verified research run/reopen/delete (mode=${run.researchMode}, status=${run.status}).`,
    );

    // 11. Phase 3b — Competitor Analysis (/api/v1/competitors)
    console.log('[smoke] 11. Testing Phase 3b Competitor Analysis (/api/v1/competitors)...');
    const compCreateRes = await apiFetch(`${baseUrl}/api/v1/competitors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        name: 'Smoke Test ColdLog Competitor',
        website: 'https://coldlog.example.in',
        description: 'Manual compliance register vendor.',
        pricing: 'INR 1,500/mo',
        features: ['Paper PDF templates'],
        strengths: ['Low upfront cost'],
        weaknesses: ['No automated sensor alerts'],
        notes: 'Created by smoke check',
        sourceType: 'manual',
      }),
    });
    const compCreateText = await compCreateRes.text();
    if (!compCreateRes.ok) {
      throw new Error(`Competitor create failed (HTTP ${compCreateRes.status}): ${compCreateText}`);
    }
    const compCreated = JSON.parse(compCreateText) as { competitor: { id: string } };
    const compId = compCreated.competitor.id;

    const compPatchRes = await apiFetch(`${baseUrl}/api/v1/competitors/${compId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        name: 'Smoke Test ColdLog Competitor Updated',
        pricing: 'INR 1,800/mo',
        features: ['Paper PDF templates'],
        strengths: ['Low upfront cost'],
        weaknesses: ['No automated sensor alerts'],
        sourceType: 'manual',
      }),
    });
    if (!compPatchRes.ok) {
      throw new Error(`Competitor patch failed (HTTP ${compPatchRes.status}): ${await compPatchRes.text()}`);
    }

    const diffRes = await apiFetch(`${baseUrl}/api/v1/competitors/differentiate`, {
      method: 'POST',
      headers: authHeaders,
    });
    const diffText = await diffRes.text();
    if (!diffRes.ok) {
      throw new Error(`Competitor differentiation failed (HTTP ${diffRes.status}): ${diffText}`);
    }
    const diffData = JSON.parse(diffText) as {
      differentiation: {
        opportunities: Array<{ title: string; evidenceLabel: string }>;
      };
    };
    if (
      !diffData.differentiation.opportunities.length ||
      diffData.differentiation.opportunities[0].evidenceLabel !== 'AI interpretation'
    ) {
      throw new Error('Expected differentiation opportunities labelled AI interpretation.');
    }

    const discRes = await apiFetch(`${baseUrl}/api/v1/competitors/discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        industry: 'Cold-chain logistics',
        productOrService: 'Automated FSSAI Cold-Chain Logbook',
        location: 'India',
      }),
    });
    if (run.researchMode === 'none') {
      if (discRes.status !== 503) {
        throw new Error(`Expected 503 RESEARCH_NOT_CONFIGURED on discover, got ${discRes.status}`);
      }
    } else if (!discRes.ok) {
      throw new Error(`Competitor discover failed (HTTP ${discRes.status}): ${await discRes.text()}`);
    } else {
      const discJson = (await discRes.json()) as { items?: Array<{ id: string }> };
      for (const item of discJson.items || []) {
        await apiFetch(`${baseUrl}/api/v1/competitors/${item.id}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
      }
    }

    const compDelRes = await apiFetch(`${baseUrl}/api/v1/competitors/${compId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!compDelRes.ok) {
      throw new Error(`Competitor delete failed (HTTP ${compDelRes.status})`);
    }
    console.log('[smoke]    Verified competitors manual CRUD, AI differentiation, discovery mode check, and cleanup.');

    // 12. Phase 4 — Leads CRUD, Notes Timeline, CSV Import & Formula Guard, Stage Move, Dashboard Counts
    console.log('[smoke] 12. Testing Phase 4 Leads & Pipeline (/api/v1/leads)...');
    const leadCreateRes = await apiFetch(`${baseUrl}/api/v1/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        name: 'Smoke Test ColdRoom Prospect',
        email: 'prospect@coldroom.example.in',
        phone: '+91 9820012345',
        company: 'Sahyadri Cold Chain',
        source: 'Manual',
        status: 'New',
        notes: 'Created by smoke suite',
      }),
    });
    const leadCreateText = await leadCreateRes.text();
    if (!leadCreateRes.ok) {
      throw new Error(`Lead create failed (HTTP ${leadCreateRes.status}): ${leadCreateText}`);
    }
    const leadCreated = JSON.parse(leadCreateText) as { lead: { id: string } };
    const leadId = leadCreated.lead.id;

    const noteRes = await apiFetch(`${baseUrl}/api/v1/leads/${leadId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ content: 'Initial qualification call completed.' }),
    });
    if (!noteRes.ok) {
      throw new Error(`Lead note failed (HTTP ${noteRes.status}): ${await noteRes.text()}`);
    }

    const stageRes = await apiFetch(`${baseUrl}/api/v1/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ status: 'Converted' }),
    });
    if (!stageRes.ok) {
      throw new Error(`Lead stage move failed (HTTP ${stageRes.status}): ${await stageRes.text()}`);
    }
    const stageData = (await stageRes.json()) as {
      lead: { status: string };
      summary: { totalLeads: number; byStage: Record<string, number> };
    };
    if (stageData.lead.status !== 'Converted' || (stageData.summary.byStage.Converted ?? 0) < 1) {
      throw new Error('Lead stage move to Converted did not update lead or summary.');
    }

    const csvImportRes = await apiFetch(`${baseUrl}/api/v1/leads/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        csvText: 'Name,Email,Company,Source,Status\n=CMD|calc,bad-email,@BadOrg,+Src,New\n',
        mapping: {
          name: 'Name',
          email: 'Email',
          company: 'Company',
          source: 'Source',
          status: 'Status',
        },
      }),
    });
    if (!csvImportRes.ok) {
      throw new Error(`Lead CSV import failed (HTTP ${csvImportRes.status}): ${await csvImportRes.text()}`);
    }
    const csvImportData = (await csvImportRes.json()) as {
      importedCount: number;
      skippedCount: number;
      sanitizedFormulaCells: number;
    };
    if (csvImportData.skippedCount !== 1 || csvImportData.sanitizedFormulaCells < 3) {
      throw new Error(`Unexpected CSV import guard outcome: ${JSON.stringify(csvImportData)}`);
    }

    const dash4Res = await apiFetch(`${baseUrl}/api/v1/dashboard`, { headers: authHeaders });
    const dash4Data = (await dash4Res.json()) as {
      summary?: { totalLeads?: number; leadsByStage?: Record<string, number> };
    };
    if (!dash4Data.summary || (dash4Data.summary.leadsByStage?.Converted ?? 0) < 1) {
      throw new Error('Dashboard did not reflect real lead counts by stage.');
    }

    const csvExportRes = await apiFetch(`${baseUrl}/api/v1/leads/export.csv`, {
      headers: authHeaders,
    });
    if (!csvExportRes.ok || !(csvExportRes.headers.get('content-type') || '').includes('text/csv')) {
      throw new Error(`Lead CSV export failed (HTTP ${csvExportRes.status})`);
    }
    const csvExportText = await csvExportRes.text();
    if (!csvExportText.includes('Smoke Test ColdRoom Prospect')) {
      throw new Error('Exported CSV missing created lead.');
    }

    const leadDelRes = await apiFetch(`${baseUrl}/api/v1/leads/${leadId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!leadDelRes.ok) {
      throw new Error(`Lead delete failed (HTTP ${leadDelRes.status})`);
    }
    console.log('[smoke]    Verified leads CRUD, timeline note, stage move, CSV formula guard, dashboard sync, and cleanup.');

    // 13. Phase 4 — Marketing Strategy generate, budget allocation sum=100%/budget, edit, delete
    console.log('[smoke] 13. Testing Phase 4 Marketing Strategy (/api/v1/marketing)...');
    const mktRes = await apiFetch(`${baseUrl}/api/v1/marketing/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        title: 'Smoke Test Dairy Launch',
        businessDescription:
          'Automated IoT temperature monitoring and FSSAI audit logbook for cold-storage operators.',
        targetAudience: 'Dairy and food cold-storage facility supervisors',
        industry: 'Cold-chain logistics SaaS',
        budget: 40000,
        market: 'India Tier-2 cities',
        preferredChannels: ['WhatsApp & Direct Outreach', 'LinkedIn Organic & Outbound'],
      }),
    });
    const mktText = await mktRes.text();
    if (!mktRes.ok) {
      throw new Error(`Marketing generate failed (HTTP ${mktRes.status}): ${mktText}`);
    }
    const mktData = JSON.parse(mktText) as {
      campaign: {
        id: string;
        budgetTier: string;
        evidenceLabel: string;
        inputs: Record<string, unknown>;
        strategy: {
          budgetAllocation: Array<{ percentage: number; amount: number }>;
        };
      };
    };
    const camp = mktData.campaign;
    const pctSum = camp.strategy.budgetAllocation.reduce((a, b) => a + b.percentage, 0);
    const amtSum = camp.strategy.budgetAllocation.reduce((a, b) => a + b.amount, 0);
    if (
      camp.budgetTier !== 'low' ||
      camp.evidenceLabel !== 'AI interpretation' ||
      Math.abs(pctSum - 100) > 0.05 ||
      Math.abs(amtSum - 40000) > 1
    ) {
      throw new Error(`Marketing budget verification failed (pctSum=${pctSum}, amtSum=${amtSum}).`);
    }

    const mktPatchRes = await apiFetch(`${baseUrl}/api/v1/marketing/${camp.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        title: 'Smoke Test Dairy Launch Updated',
        ideaId: idea.id,
        inputs: camp.inputs,
        strategy: camp.strategy,
      }),
    });
    if (!mktPatchRes.ok) {
      throw new Error(`Marketing edit failed (HTTP ${mktPatchRes.status}): ${await mktPatchRes.text()}`);
    }
    const mktDelRes = await apiFetch(`${baseUrl}/api/v1/marketing/${camp.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!mktDelRes.ok) {
      throw new Error(`Marketing delete failed (HTTP ${mktDelRes.status})`);
    }
    console.log(
      `[smoke]    Verified marketing strategy generate/budget-100%/edit/delete (tier=${camp.budgetTier}).`,
    );

    // 14. Phase 4 — Sales Assistant generate, verify draft notice, edit, save, delete
    console.log('[smoke] 14. Testing Phase 4 Sales Assistant (/api/v1/sales)...');
    const salesRes = await apiFetch(`${baseUrl}/api/v1/sales/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        ideaId: idea.id,
        title: 'Smoke Test Sales Playbook',
        productDescription: 'IoT temperature sensors with instant WhatsApp excursion alerts and FSSAI logs.',
        targetCustomer: 'Cold-storage facility managers',
        pricePoint: 'INR 2,500/month',
        salesChannel: 'Founder-led outbound + WhatsApp demo',
        valueProposition: 'Eliminate paper registers and prevent overnight spoilage.',
        tone: 'Consultative and direct',
      }),
    });
    const salesText = await salesRes.text();
    if (!salesRes.ok) {
      throw new Error(`Sales generate failed (HTTP ${salesRes.status}): ${salesText}`);
    }
    const salesData = JSON.parse(salesText) as {
      playbook: {
        id: string;
        draftNotice: string;
        inputs: Record<string, unknown>;
        playbook: { pitch: string; outreachDrafts: unknown[]; followUpDrafts: unknown[] };
      };
    };
    const pb = salesData.playbook;
    if (
      !pb.draftNotice.toLowerCase().includes('never sent automatically') ||
      pb.playbook.outreachDrafts.length === 0 ||
      pb.playbook.followUpDrafts.length === 0
    ) {
      throw new Error('Sales playbook missing required draft notice or drafts.');
    }

    const salesPatchRes = await apiFetch(`${baseUrl}/api/v1/sales/${pb.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        title: 'Smoke Test Sales Playbook Updated',
        ideaId: idea.id,
        inputs: pb.inputs,
        playbook: {
          ...pb.playbook,
          pitch: `${pb.playbook.pitch} (Edited during smoke verification)`,
        },
      }),
    });
    if (!salesPatchRes.ok) {
      throw new Error(`Sales edit failed (HTTP ${salesPatchRes.status}): ${await salesPatchRes.text()}`);
    }
    const salesDelRes = await apiFetch(`${baseUrl}/api/v1/sales/${pb.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!salesDelRes.ok) {
      throw new Error(`Sales delete failed (HTTP ${salesDelRes.status})`);
    }
    console.log('[smoke]    Verified sales assistant generate/notice/edit/save/delete.');
    console.log('[smoke] PASS: Live end-to-end Phase 2 + Phase 3a + Phase 3b + Phase 4 smoke suite succeeded!');
  } finally {
    if (child) {
      child.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error('[smoke] FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
