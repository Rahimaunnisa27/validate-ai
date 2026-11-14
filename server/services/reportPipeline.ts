import type Database from 'better-sqlite3';
import { getDb } from '../db.ts';
import { findSimilarUserIdeas, type SimilarIdeaMatch } from './embeddings.ts';
import {
  createGeminiDriver,
  generateStructuredReportJson,
  type LlmDriver,
} from './llmClient.ts';
import { runIdeaResearch } from './research.ts';

export interface ProgressLogEntry {
  step: number;
  label: string;
  status: 'running' | 'completed' | 'failed';
  detail?: string;
  timestamp: string;
}

interface RawIdeaRow {
  id: string;
  user_id: string;
  startup_id: string | null;
  title: string;
  status: 'draft' | 'submitted';
  current_step: number;
  business_details_json: string;
  problem_solution_json: string;
  target_customer_json: string;
  financials_json: string;
  competitors_json: string;
}

interface ParsedIdeaContext {
  title: string;
  industry: string;
  businessModel: string;
  stage: string;
  oneLiner: string;
  problemStatement: string;
  currentAlternatives: string;
  proposedSolution: string;
  uniqueValueProposition: string;
  primarySegment: string;
  geography: string;
  customerPainLevel: string;
  willingnessToPay: string;
  initialCapitalInr: number | null;
  pricePerUnitInr: number | null;
  estimatedMonthlyCustomers: number | null;
  monthlyBurnInr: number | null;
  revenueModelNotes: string;
  knownCompetitors: string;
  unfairAdvantage: string;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'our', 'their', 'about',
  'have', 'has', 'are', 'was', 'were', 'will', 'would', 'could', 'should', 'can', 'not', 'but',
  'who', 'what', 'when', 'where', 'how', 'why', 'more', 'than', 'less', 'also', 'using', 'used',
  'platform', 'solution', 'system', 'help', 'helps', 'need', 'needs', 'make', 'makes', 'team',
  'teams', 'users', 'customers', 'india', 'indian',
]);

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonObj(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function validateAndNormalizeIdea(row: RawIdeaRow): {
  context: ParsedIdeaContext;
  cleanedText: string;
  financialNote: string;
} {
  const b = parseJsonObj(row.business_details_json);
  const p = parseJsonObj(row.problem_solution_json);
  const t = parseJsonObj(row.target_customer_json);
  const f = parseJsonObj(row.financials_json);
  const c = parseJsonObj(row.competitors_json);

  const context: ParsedIdeaContext = {
    title: normalizeText(b.title) || normalizeText(row.title),
    industry: normalizeText(b.industry),
    businessModel: normalizeText(b.businessModel),
    stage: normalizeText(b.stage),
    oneLiner: normalizeText(b.oneLiner),
    problemStatement: normalizeText(p.problemStatement),
    currentAlternatives: normalizeText(p.currentAlternatives),
    proposedSolution: normalizeText(p.proposedSolution),
    uniqueValueProposition: normalizeText(p.uniqueValueProposition),
    primarySegment: normalizeText(t.primarySegment),
    geography: normalizeText(t.geography),
    customerPainLevel: normalizeText(t.customerPainLevel),
    willingnessToPay: normalizeText(t.willingnessToPay),
    initialCapitalInr: toNum(f.initialCapitalInr),
    pricePerUnitInr: toNum(f.pricePerUnitInr),
    estimatedMonthlyCustomers: toNum(f.estimatedMonthlyCustomers),
    monthlyBurnInr: toNum(f.monthlyBurnInr),
    revenueModelNotes: normalizeText(f.revenueModelNotes),
    knownCompetitors: normalizeText(c.knownCompetitors),
    unfairAdvantage: normalizeText(c.unfairAdvantage),
  };

  if (!context.title || context.title.length < 2) {
    throw new Error('Idea title is missing or too short to validate.');
  }

  const substantiveFields = [
    context.oneLiner,
    context.problemStatement,
    context.proposedSolution,
    context.primarySegment,
  ].filter((s) => s.length >= 3);

  if (substantiveFields.length === 0) {
    throw new Error(
      'Idea lacks core problem, solution, or customer details. Please complete the idea intake form before generating a report.',
    );
  }

  const lines = [
    `Title: ${context.title}`,
    context.industry ? `Industry: ${context.industry}` : null,
    context.businessModel ? `Business Model: ${context.businessModel}` : null,
    context.stage ? `Stage: ${context.stage}` : null,
    context.oneLiner ? `One-Liner: ${context.oneLiner}` : null,
    context.problemStatement ? `Problem Statement: ${context.problemStatement}` : null,
    context.currentAlternatives ? `Current Alternatives: ${context.currentAlternatives}` : null,
    context.proposedSolution ? `Proposed Solution: ${context.proposedSolution}` : null,
    context.uniqueValueProposition ? `Unique Value Proposition: ${context.uniqueValueProposition}` : null,
    context.primarySegment ? `Target Customer Segment: ${context.primarySegment}` : null,
    context.geography ? `Geography: ${context.geography}` : null,
    context.customerPainLevel ? `Pain Level: ${context.customerPainLevel}` : null,
    context.willingnessToPay ? `Willingness to Pay: ${context.willingnessToPay}` : null,
    context.knownCompetitors ? `Known Competitors: ${context.knownCompetitors}` : null,
    context.unfairAdvantage ? `Unfair Advantage: ${context.unfairAdvantage}` : null,
    context.revenueModelNotes ? `Revenue Model Notes: ${context.revenueModelNotes}` : null,
  ].filter(Boolean);

  // Deterministic financial sanity check (backend computation — never delegated to LLM guessing).
  const estRevenue =
    context.pricePerUnitInr !== null && context.estimatedMonthlyCustomers !== null
      ? context.pricePerUnitInr * context.estimatedMonthlyCustomers
      : null;
  const estNetMonthly =
    estRevenue !== null && context.monthlyBurnInr !== null ? estRevenue - context.monthlyBurnInr : null;
  const runwayMonths =
    context.initialCapitalInr !== null && context.monthlyBurnInr !== null && context.monthlyBurnInr > 0
      ? Math.round((context.initialCapitalInr / context.monthlyBurnInr) * 10) / 10
      : null;

  const finParts = [
    context.initialCapitalInr !== null ? `Initial capital: INR ${context.initialCapitalInr}` : 'Initial capital: Not provided',
    context.pricePerUnitInr !== null ? `Price per unit: INR ${context.pricePerUnitInr}` : 'Price per unit: Not provided',
    context.estimatedMonthlyCustomers !== null
      ? `Est. monthly customers: ${context.estimatedMonthlyCustomers}`
      : 'Est. monthly customers: Not provided',
    context.monthlyBurnInr !== null ? `Monthly burn: INR ${context.monthlyBurnInr}` : 'Monthly burn: Not provided',
    estRevenue !== null ? `Implied gross monthly revenue: INR ${estRevenue}` : null,
    estNetMonthly !== null ? `Implied monthly net before COGS/tax: INR ${estNetMonthly}` : null,
    runwayMonths !== null ? `Gross capital runway at zero revenue: ${runwayMonths} months` : null,
  ].filter(Boolean);

  return {
    context,
    cleanedText: lines.join('\n'),
    financialNote: finParts.join(' | '),
  };
}

export function extractKeyConcepts(context: ParsedIdeaContext): string[] {
  const concepts: string[] = [];
  const pushUnique = (val: string) => {
    const clean = val.trim();
    if (!clean || clean.length < 2) return;
    if (!concepts.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      concepts.push(clean);
    }
  };

  if (context.industry) pushUnique(context.industry);
  if (context.businessModel) pushUnique(context.businessModel.toUpperCase());
  if (context.geography) pushUnique(context.geography);
  if (context.primarySegment) pushUnique(context.primarySegment.slice(0, 60));

  const corpus = [
    context.title,
    context.oneLiner,
    context.problemStatement,
    context.proposedSolution,
    context.uniqueValueProposition,
  ].join(' ');

  const freq = new Map<string, number>();
  const words = corpus
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const topKeywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  for (const kw of topKeywords) {
    pushUnique(kw);
  }

  return concepts.slice(0, 12);
}

function recordProgress(
  db: Database.Database,
  reportId: string,
  logs: ProgressLogEntry[],
  step: number,
  label: string,
  status: 'running' | 'completed' | 'failed',
  detail?: string,
) {
  const now = new Date().toISOString();
  const existingIdx = logs.findIndex((l) => l.step === step);
  const entry: ProgressLogEntry = {
    step,
    label,
    status,
    detail,
    timestamp: now,
  };
  if (existingIdx >= 0) {
    logs[existingIdx] = entry;
  } else {
    logs.push(entry);
  }

  const dbStatus = status === 'failed' ? 'failed' : step === 8 && status === 'completed' ? 'completed' : 'running';
  db.prepare(
    `UPDATE reports
     SET status = ?,
         progress_step = ?,
         progress_label = ?,
         progress_log_json = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(dbStatus, step, label, JSON.stringify(logs), now, reportId);
}

export interface PipelineOptions {
  llmDriver?: LlmDriver;
  demoModeOverride?: boolean;
}

export async function runValidationReportPipeline(
  reportId: string,
  options?: PipelineOptions,
): Promise<void> {
  const db = getDb();
  const logs: ProgressLogEntry[] = [];
  let activeStep = 1;
  let activeLabel = 'Validating idea input';

  try {
    const reportRow = db
      .prepare(
        `SELECT r.id, r.user_id, r.idea_id, r.plan_id, p.name as plan_name, p.slug as plan_slug
         FROM reports r
         JOIN report_plans p ON p.id = r.plan_id
         WHERE r.id = ?`,
      )
      .get(reportId) as
      | {
          id: string;
          user_id: string;
          idea_id: string;
          plan_id: string;
          plan_name: string;
          plan_slug: string;
        }
      | undefined;

    if (!reportRow) return;

    const nowStart = new Date().toISOString();
    db.prepare(
      `UPDATE reports SET status = 'running', started_at = ?, job_error = NULL, updated_at = ? WHERE id = ?`,
    ).run(nowStart, nowStart, reportId);

    const driver = options?.llmDriver ?? createGeminiDriver();

    // Step 1: Validate input
    activeStep = 1;
    activeLabel = 'Validating idea input';
    recordProgress(db, reportId, logs, 1, activeLabel, 'running');
    const ideaRow = db
      .prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?')
      .get(reportRow.idea_id, reportRow.user_id) as RawIdeaRow | undefined;

    if (!ideaRow) {
      throw new Error('Target idea no longer exists or is inaccessible.');
    }
    const validated = validateAndNormalizeIdea(ideaRow);
    recordProgress(db, reportId, logs, 1, activeLabel, 'completed', 'Input fields validated.');

    // Step 2: Clean text
    activeStep = 2;
    activeLabel = 'Cleaning and normalizing text';
    recordProgress(db, reportId, logs, 2, activeLabel, 'running');
    const cleanedText = validated.cleanedText;
    recordProgress(
      db,
      reportId,
      logs,
      2,
      activeLabel,
      'completed',
      `Normalized ${cleanedText.length} characters.`,
    );

    // Step 3: Extract key concepts
    activeStep = 3;
    activeLabel = 'Extracting key concepts';
    recordProgress(db, reportId, logs, 3, activeLabel, 'running');
    const concepts = extractKeyConcepts(validated.context);
    db.prepare('UPDATE ideas SET concepts_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(concepts),
      new Date().toISOString(),
      ideaRow.id,
    );
    db.prepare('UPDATE reports SET concepts_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(concepts),
      new Date().toISOString(),
      reportId,
    );
    recordProgress(
      db,
      reportId,
      logs,
      3,
      activeLabel,
      'completed',
      `Extracted ${concepts.length} concepts.`,
    );

    // Step 4: Create embedding
    activeStep = 4;
    activeLabel = 'Creating semantic embedding';
    recordProgress(db, reportId, logs, 4, activeLabel, 'running');
    const embedding = await driver.embedText(cleanedText);
    const resolvedEmbModel = driver.getResolvedModels?.()?.embeddingModel || 'embedding';
    db.prepare('UPDATE ideas SET embedding_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(embedding),
      new Date().toISOString(),
      ideaRow.id,
    );
    recordProgress(
      db,
      reportId,
      logs,
      4,
      activeLabel,
      'completed',
      `Generated ${embedding.length}-dimension embedding (${resolvedEmbModel}).`,
    );

    // Step 5: Cosine similarity among user's own ideas only
    activeStep = 5;
    activeLabel = 'Finding similar ideas in your workspace';
    recordProgress(db, reportId, logs, 5, activeLabel, 'running');
    const similarIdeas: SimilarIdeaMatch[] = findSimilarUserIdeas(
      db,
      reportRow.user_id,
      ideaRow.id,
      embedding,
      3,
    );
    db.prepare('UPDATE reports SET similar_ideas_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(similarIdeas),
      new Date().toISOString(),
      reportId,
    );
    recordProgress(
      db,
      reportId,
      logs,
      5,
      activeLabel,
      'completed',
      `Found ${similarIdeas.length} similar idea(s) in your workspace.`,
    );

    // Step 6: Run research
    activeStep = 6;
    activeLabel = 'Running market & competitor research';
    recordProgress(db, reportId, logs, 6, activeLabel, 'running');
    const research = await runIdeaResearch({
      db,
      userId: reportRow.user_id,
      reportId,
      ideaTitle: validated.context.title,
      industry: validated.context.industry,
      geography: validated.context.geography,
      problemStatement: validated.context.problemStatement,
      concepts,
      demoModeOverride: options?.demoModeOverride,
    });
    db.prepare('UPDATE reports SET research_mode = ?, updated_at = ? WHERE id = ?').run(
      research.researchMode,
      new Date().toISOString(),
      reportId,
    );
    const researchDetail =
      research.researchMode === 'sonar'
        ? `Retrieved ${research.sources.length} Sonar citations.`
        : research.researchMode === 'demo'
          ? `Using ${research.sources.length} DEMO DATA sources.`
          : 'Research Not configured; unverified market claims flagged.';
    recordProgress(db, reportId, logs, 6, activeLabel, 'completed', researchDetail);

    // Step 7: Call Gemini for structured JSON + validate (retry once)
    activeStep = 7;
    activeLabel = 'Generating & validating 18-section report JSON';
    recordProgress(db, reportId, logs, 7, activeLabel, 'running');
    const llmResult = await generateStructuredReportJson(driver, {
      planName: reportRow.plan_name,
      planSlug: reportRow.plan_slug,
      cleanedIdeaText: cleanedText,
      concepts,
      similarIdeas: similarIdeas.map((s) => ({
        title: s.title,
        similarityScore: s.similarityScore,
      })),
      researchMode: research.researchMode,
      sources: research.sources.map((s) => ({
        sourceRef: s.sourceRef,
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        isDemo: s.isDemo,
      })),
      computedFinancialsNote: validated.financialNote,
    });
    recordProgress(
      db,
      reportId,
      logs,
      7,
      activeLabel,
      'completed',
      llmResult.repaired
        ? 'Validated structured JSON after automatic schema repair.'
        : 'Validated 18-section structured JSON.',
    );

    // Step 8: Save final report
    activeStep = 8;
    activeLabel = 'Saving final validation report';
    recordProgress(db, reportId, logs, 8, activeLabel, 'running');
    const completedAt = new Date().toISOString();
    const finalEntry: ProgressLogEntry = {
      step: 8,
      label: activeLabel,
      status: 'completed',
      detail: 'Report saved and ready for viewing & PDF export.',
      timestamp: completedAt,
    };
    const idx8 = logs.findIndex((l) => l.step === 8);
    if (idx8 >= 0) logs[idx8] = finalEntry;
    else logs.push(finalEntry);

    db.prepare(
      `UPDATE reports
       SET status = 'completed',
           progress_step = 8,
           progress_label = 'Completed',
           progress_log_json = ?,
           report_json = ?,
           completed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(logs),
      JSON.stringify(llmResult.report),
      completedAt,
      completedAt,
      reportId,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Validation report generation failed unexpectedly.';
    const nowFail = new Date().toISOString();
    const existingIdx = logs.findIndex((l) => l.step === activeStep);
    const failEntry: ProgressLogEntry = {
      step: activeStep,
      label: activeLabel,
      status: 'failed',
      detail: message,
      timestamp: nowFail,
    };
    if (existingIdx >= 0) logs[existingIdx] = failEntry;
    else logs.push(failEntry);

    db.prepare(
      `UPDATE reports
       SET status = 'failed',
           progress_step = ?,
           progress_label = ?,
           progress_log_json = ?,
           job_error = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(activeStep, `Failed at step ${activeStep}: ${activeLabel}`, JSON.stringify(logs), message, nowFail, reportId);
  }
}
