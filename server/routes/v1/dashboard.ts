import { Router } from 'express';
import type { ComputedFinancialModel } from '../../../src/shared/phase3aSchemas.ts';
import type { LeadStage } from '../../../src/shared/phase4Schemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { asyncHandler } from '../../utils/errors.ts';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler((req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const ideaStats = db
      .prepare(
        `SELECT
           COUNT(*) as totalIdeas,
           SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as submittedIdeas,
           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draftIdeas
         FROM ideas
         WHERE user_id = ?`,
      )
      .get(userId) as { totalIdeas: number; submittedIdeas: number | null; draftIdeas: number | null };

    const startupStats = db
      .prepare('SELECT COUNT(*) as activeStartups FROM startups WHERE user_id = ?')
      .get(userId) as { activeStartups: number };

    const reportStats = db
      .prepare(
        `SELECT COUNT(*) as completedReports
         FROM reports
         WHERE user_id = ? AND status = 'completed'`,
      )
      .get(userId) as { completedReports: number };

    const financeStats = db
      .prepare('SELECT COUNT(*) as savedFinancialPlans FROM financial_plans WHERE user_id = ?')
      .get(userId) as { savedFinancialPlans: number };

    const personaStats = db
      .prepare('SELECT COUNT(*) as savedPersonas FROM customer_personas WHERE user_id = ?')
      .get(userId) as { savedPersonas: number };

    const researchStats = db
      .prepare('SELECT COUNT(*) as savedResearchRuns FROM market_research_runs WHERE user_id = ?')
      .get(userId) as { savedResearchRuns: number };

    const competitorStats = db
      .prepare('SELECT COUNT(*) as savedCompetitors FROM competitors WHERE user_id = ?')
      .get(userId) as { savedCompetitors: number };

    const leadStageRows = db
      .prepare(
        `SELECT status, COUNT(*) as cnt
         FROM leads
         WHERE user_id = ?
         GROUP BY status`,
      )
      .all(userId) as Array<{ status: LeadStage; cnt: number }>;

    const leadsByStage: Record<LeadStage, number> = {
      New: 0,
      Contacted: 0,
      Interested: 0,
      Qualified: 0,
      Converted: 0,
      Lost: 0,
    };
    let totalLeads = 0;
    for (const row of leadStageRows) {
      if (row.status in leadsByStage) {
        leadsByStage[row.status] = row.cnt;
        totalLeads += row.cnt;
      }
    }
    const leadConversionRate =
      totalLeads > 0 ? Math.round((leadsByStage.Converted / totalLeads) * 1000) / 10 : 0;

    const marketingStats = db
      .prepare('SELECT COUNT(*) as savedMarketingCampaigns FROM marketing_campaigns WHERE user_id = ?')
      .get(userId) as { savedMarketingCampaigns: number };

    const salesStats = db
      .prepare('SELECT COUNT(*) as savedSalesPlaybooks FROM sales_playbooks WHERE user_id = ?')
      .get(userId) as { savedSalesPlaybooks: number };

    const latestPlanRow = db
      .prepare(
        `SELECT fp.id, fp.name, fp.computed_json, fp.updated_at,
                s.name as startup_name, i.title as idea_title
         FROM financial_plans fp
         LEFT JOIN startups s ON s.id = fp.startup_id AND s.user_id = fp.user_id
         LEFT JOIN ideas i ON i.id = fp.idea_id AND i.user_id = fp.user_id
         WHERE fp.user_id = ?
         ORDER BY fp.updated_at DESC
         LIMIT 1`,
      )
      .get(userId) as
      | {
          id: string;
          name: string;
          computed_json: string;
          updated_at: string;
          startup_name: string | null;
          idea_title: string | null;
        }
      | undefined;

    let financialOverview: {
      planId: string;
      name: string;
      startupName: string | null;
      ideaTitle: string | null;
      expectedMonthlyRevenue: number;
      expectedMonthlyExpenses: number;
      expectedOperatingProfit: number;
      expectedBreakEvenUnits: number | null;
      expectedRunwayLabel: string;
      updatedAt: string;
    } | null = null;

    if (latestPlanRow) {
      try {
        const parsed = JSON.parse(latestPlanRow.computed_json) as ComputedFinancialModel;
        const expected = parsed.scenarios?.expected;
        if (expected) {
          financialOverview = {
            planId: latestPlanRow.id,
            name: latestPlanRow.name,
            startupName: latestPlanRow.startup_name,
            ideaTitle: latestPlanRow.idea_title,
            expectedMonthlyRevenue: expected.revenue,
            expectedMonthlyExpenses: expected.totalExpenses,
            expectedOperatingProfit: expected.operatingProfit,
            expectedBreakEvenUnits: expected.breakEvenUnits,
            expectedRunwayLabel: expected.runwayLabel,
            updatedAt: latestPlanRow.updated_at,
          };
        }
      } catch {
        financialOverview = null;
      }
    }

    const recentIdeas = db
      .prepare(
        `SELECT i.id, i.title, i.status, i.current_step as currentStep, i.updated_at as updatedAt,
                s.name as startupName
         FROM ideas i
         LEFT JOIN startups s ON s.id = i.startup_id AND s.user_id = i.user_id
         WHERE i.user_id = ?
         ORDER BY i.updated_at DESC
         LIMIT 5`,
      )
      .all(userId);

    const recentStartups = db
      .prepare(
        `SELECT s.id, s.name, s.industry, s.stage, s.location, s.updated_at as updatedAt,
                COUNT(i.id) as ideasCount
         FROM startups s
         LEFT JOIN ideas i ON i.startup_id = s.id AND i.user_id = s.user_id
         WHERE s.user_id = ?
         GROUP BY s.id
         ORDER BY s.updated_at DESC
         LIMIT 4`,
      )
      .all(userId);

    const recentReports = db
      .prepare(
        `SELECT r.id, r.idea_id as ideaId, i.title as ideaTitle, r.status,
                p.name as planName, r.updated_at as updatedAt
         FROM reports r
         JOIN ideas i ON i.id = r.idea_id
         JOIN report_plans p ON p.id = r.plan_id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC
         LIMIT 4`,
      )
      .all(userId);

    res.json({
      summary: {
        totalIdeas: ideaStats.totalIdeas ?? 0,
        submittedIdeas: ideaStats.submittedIdeas ?? 0,
        draftIdeas: ideaStats.draftIdeas ?? 0,
        activeStartups: startupStats.activeStartups ?? 0,
        completedReports: reportStats.completedReports ?? 0,
        savedFinancialPlans: financeStats.savedFinancialPlans ?? 0,
        savedPersonas: personaStats.savedPersonas ?? 0,
        savedResearchRuns: researchStats.savedResearchRuns ?? 0,
        savedCompetitors: competitorStats.savedCompetitors ?? 0,
        totalLeads,
        leadConversionRate,
        leadsByStage,
        savedMarketingCampaigns: marketingStats.savedMarketingCampaigns ?? 0,
        savedSalesPlaybooks: salesStats.savedSalesPlaybooks ?? 0,
      },
      financialOverview,
      recentIdeas,
      recentStartups,
      recentReports,
    });
  }),
);

export default router;
