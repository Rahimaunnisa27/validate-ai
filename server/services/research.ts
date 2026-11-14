import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { config } from '../config.ts';

export type ResearchMode = 'sonar' | 'demo' | 'none';

export interface SavedResearchSource {
  id: string;
  sourceRef: string;
  query: string;
  url: string;
  title: string;
  snippet: string;
  retrievedAt: string;
  isDemo: boolean;
}

export interface ResearchExecutionResult {
  researchMode: ResearchMode;
  sources: SavedResearchSource[];
  statusLabel: 'Configured' | 'Demo data' | 'Not configured';
}

export function getResearchModeConfigStatus(demoModeOverride?: boolean): {
  researchMode: ResearchMode;
  statusLabel: 'Configured' | 'Demo data' | 'Not configured';
  setupSteps: string[];
} {
  const hasSonar = Boolean(config.sonarApiKey && config.sonarApiKey.trim().length > 0);
  const demoMode = demoModeOverride ?? config.demoMode;
  if (hasSonar) {
    return {
      researchMode: 'sonar',
      statusLabel: 'Configured',
      setupSteps: [],
    };
  }
  if (demoMode) {
    return {
      researchMode: 'demo',
      statusLabel: 'Demo data',
      setupSteps: [
        'DEMO_MODE=true is active: sample sources tagged "DEMO DATA" are used instead of live web citations.',
        'Set SONAR_API_KEY in Settings > Secrets to switch to live Perplexity Sonar web research.',
      ],
    };
  }
  return {
    researchMode: 'none',
    statusLabel: 'Not configured',
    setupSteps: [
      'Create an API key in Perplexity Sonar API settings and add SONAR_API_KEY in Settings > Secrets.',
      'Or set DEMO_MODE=true in your environment to inspect the workflow with clearly badged DEMO DATA sample sources.',
      'Restart the server after updating environment variables.',
    ],
  };
}

export function buildDemoSources(params: {
  query: string;
  industry: string;
  geography: string;
  retrievedAt: string;
}): Array<Omit<SavedResearchSource, 'id'>> {
  const industryLabel = params.industry || 'Indian SMB & Digital Services';
  const geoLabel = params.geography || 'India';
  return [
    {
      sourceRef: 'SRC-1',
      query: params.query,
      url: 'https://demo.venturepilot.local/sources/india-smb-software-adoption',
      title: `[DEMO DATA] ${industryLabel} Buyer Adoption Benchmarks (${geoLabel})`,
      snippet: `Sample demo benchmark for ${industryLabel} in ${geoLabel}: mid-market and SMB teams increasingly evaluate workflow automation when compliance or manual coordination overhead exceeds 4–6 hours per week.`,
      retrievedAt: params.retrievedAt,
      isDemo: true,
    },
    {
      sourceRef: 'SRC-2',
      query: params.query,
      url: 'https://demo.venturepilot.local/sources/competitive-landscape-overview',
      title: `[DEMO DATA] Competitive Positioning Patterns in ${industryLabel}`,
      snippet: `Sample demo landscape note: incumbent tools often bundle broad generic modules, leaving room for focused vertical workflows with faster onboarding and transparent INR pricing.`,
      retrievedAt: params.retrievedAt,
      isDemo: true,
    },
    {
      sourceRef: 'SRC-3',
      query: params.query,
      url: 'https://demo.venturepilot.local/sources/pricing-and-retention-notes',
      title: `[DEMO DATA] Early-Stage Pricing & Retention Benchmarks (${geoLabel})`,
      snippet: `Sample demo insight: early B2B/prosumer pilots in ${geoLabel} typically validate willingness to pay through 30-day paid trials or annual prepay discounts before scaling paid acquisition.`,
      retrievedAt: params.retrievedAt,
      isDemo: true,
    },
  ];
}

export async function queryPerplexitySonar(query: string): Promise<{
  summary: string;
  citations: Array<{ url: string; title: string; snippet: string }>;
}> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.sonarApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content:
            'You are a startup market research assistant. Provide factual market context, competitor mentions, and demand signals with citations. Do not invent numbers.',
        },
        {
          role: 'user',
          content: query,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Sonar research API returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    search_results?: Array<{ url?: string; title?: string; snippet?: string }>;
  };

  const summary = data.choices?.[0]?.message?.content?.trim() || '';
  const citations: Array<{ url: string; title: string; snippet: string }> = [];

  if (Array.isArray(data.search_results) && data.search_results.length > 0) {
    for (const item of data.search_results.slice(0, 5)) {
      if (!item.url) continue;
      citations.push({
        url: item.url,
        title: item.title?.trim() || item.url,
        snippet: item.snippet?.trim() || summary.slice(0, 320),
      });
    }
  } else if (Array.isArray(data.citations) && data.citations.length > 0) {
    for (const url of data.citations.slice(0, 5)) {
      citations.push({
        url,
        title: url,
        snippet: summary.slice(0, 320) || 'Cited source retrieved via Perplexity Sonar.',
      });
    }
  }

  return { summary, citations };
}

export async function runIdeaResearch(params: {
  db: Database.Database;
  userId: string;
  reportId: string;
  ideaTitle: string;
  industry: string;
  geography: string;
  problemStatement: string;
  concepts: string[];
  demoModeOverride?: boolean;
}): Promise<ResearchExecutionResult> {
  const retrievedAt = new Date().toISOString();
  const query = `Market opportunity, buyer demand, and key competitors for "${params.ideaTitle}" in ${params.industry || 'technology'} (${params.geography || 'India'}). Focus: ${params.problemStatement.slice(0, 180)} Keywords: ${params.concepts.slice(0, 5).join(', ')}`;

  const demoMode = params.demoModeOverride ?? config.demoMode;
  const hasSonar = Boolean(config.sonarApiKey && config.sonarApiKey.trim().length > 0);

  let mode: ResearchMode = 'none';
  let draftSources: Array<Omit<SavedResearchSource, 'id'>> = [];

  if (hasSonar) {
    const sonarResult = await queryPerplexitySonar(query);
    if (sonarResult.citations.length > 0) {
      mode = 'sonar';
      draftSources = sonarResult.citations.map((c, idx) => ({
        sourceRef: `SRC-${idx + 1}`,
        query,
        url: c.url,
        title: c.title,
        snippet: c.snippet,
        retrievedAt,
        isDemo: false,
      }));
    } else {
      mode = 'none';
    }
  } else if (demoMode) {
    mode = 'demo';
    draftSources = buildDemoSources({
      query,
      industry: params.industry,
      geography: params.geography,
      retrievedAt,
    });
  } else {
    return {
      researchMode: 'none',
      sources: [],
      statusLabel: 'Not configured',
    };
  }

  const insert = params.db.prepare(`
    INSERT INTO research_sources (
      id, user_id, report_id, source_ref, query, url, title, snippet, retrieved_at, is_demo, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const saved: SavedResearchSource[] = [];
  for (const src of draftSources) {
    const id = crypto.randomUUID();
    insert.run(
      id,
      params.userId,
      params.reportId,
      src.sourceRef,
      src.query,
      src.url,
      src.title,
      src.snippet,
      src.retrievedAt,
      src.isDemo ? 1 : 0,
      retrievedAt,
    );
    saved.push({ id, ...src });
  }

  return {
    researchMode: mode,
    sources: saved,
    statusLabel: mode === 'sonar' ? 'Configured' : mode === 'demo' ? 'Demo data' : 'Not configured',
  };
}
