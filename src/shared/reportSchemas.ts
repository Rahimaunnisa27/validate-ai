import { z } from 'zod';

export const EVIDENCE_LABELS = [
  'Verified research',
  'AI interpretation',
  'User assumption',
  'Unverified',
] as const;

export type EvidenceLabel = (typeof EVIDENCE_LABELS)[number];

export const SCORING_DISCLAIMER =
  'Scores assess how well-defined and evidenced the idea is. They do not predict business success.';

export const reportClaimSchema = z.object({
  text: z.string().trim().min(3),
  evidenceLabel: z.enum(EVIDENCE_LABELS),
  sourceId: z.string().trim().nullable().optional(),
});

export type ReportClaim = z.infer<typeof reportClaimSchema>;

export const reportSectionSchema = z.object({
  summary: z.string().trim().min(5),
  items: z.array(reportClaimSchema).min(1),
});

export type ReportSection = z.infer<typeof reportSectionSchema>;

export const scoreItemSchema = z.object({
  score: z.number().min(0).max(10),
  explanation: z.string().trim().min(5),
  evidenceLabel: z.enum(EVIDENCE_LABELS),
});

export const reportScoresSchema = z.object({
  problemClarity: scoreItemSchema,
  customerDefinition: scoreItemSchema,
  competitiveDifferentiation: scoreItemSchema,
  businessModelClarity: scoreItemSchema,
  financialAssumptions: scoreItemSchema,
  evidenceStrength: scoreItemSchema,
});

export const swotSchema = z.object({
  strengths: z.array(reportClaimSchema).min(1),
  weaknesses: z.array(reportClaimSchema).min(1),
  opportunities: z.array(reportClaimSchema).min(1),
  threats: z.array(reportClaimSchema).min(1),
});

export const validationReportJsonSchema = z.object({
  disclaimer: z.string().trim().min(10),
  scores: reportScoresSchema,
  sections: z.object({
    executiveSummary: reportSectionSchema,
    ideaExplanation: reportSectionSchema,
    problemSolutionFit: reportSectionSchema,
    targetCustomers: reportSectionSchema,
    marketOpportunity: reportSectionSchema,
    competitors: reportSectionSchema,
    usp: reportSectionSchema,
    swot: swotSchema,
    businessModel: reportSectionSchema,
    revenueModel: reportSectionSchema,
    financialFeasibility: reportSectionSchema,
    risks: reportSectionSchema,
    mvpRecommendations: reportSectionSchema,
    customerAcquisition: reportSectionSchema,
    marketing: reportSectionSchema,
    goToMarket: reportSectionSchema,
    thirtyDayPlan: reportSectionSchema,
    ninetyDayRoadmap: reportSectionSchema,
  }),
});

export type ValidationReportJson = z.infer<typeof validationReportJsonSchema>;

export const REPORT_SECTION_META: Array<{
  key: keyof ValidationReportJson['sections'];
  code: string;
  title: string;
}> = [
  { key: 'executiveSummary', code: 'A', title: 'Executive Summary' },
  { key: 'ideaExplanation', code: 'B', title: 'Idea Explanation' },
  { key: 'problemSolutionFit', code: 'C', title: 'Problem-Solution Fit' },
  { key: 'targetCustomers', code: 'D', title: 'Target Customers' },
  { key: 'marketOpportunity', code: 'E', title: 'Market Opportunity' },
  { key: 'competitors', code: 'F', title: 'Competitors' },
  { key: 'usp', code: 'G', title: 'Unique Selling Proposition (USP)' },
  { key: 'swot', code: 'H', title: 'SWOT Analysis' },
  { key: 'businessModel', code: 'I', title: 'Business Model' },
  { key: 'revenueModel', code: 'J', title: 'Revenue Model' },
  { key: 'financialFeasibility', code: 'K', title: 'Financial Feasibility' },
  { key: 'risks', code: 'L', title: 'Risks & Mitigations' },
  { key: 'mvpRecommendations', code: 'M', title: 'MVP Recommendations' },
  { key: 'customerAcquisition', code: 'N', title: 'Customer Acquisition' },
  { key: 'marketing', code: 'O', title: 'Marketing Recommendations' },
  { key: 'goToMarket', code: 'P', title: 'Go-To-Market Strategy' },
  { key: 'thirtyDayPlan', code: 'Q', title: '30-Day Execution Plan' },
  { key: 'ninetyDayRoadmap', code: 'R', title: '90-Day Roadmap' },
];

export const SCORE_LABELS: Array<{
  key: keyof ValidationReportJson['scores'];
  title: string;
}> = [
  { key: 'problemClarity', title: 'Problem Clarity' },
  { key: 'customerDefinition', title: 'Customer Definition' },
  { key: 'competitiveDifferentiation', title: 'Competitive Differentiation' },
  { key: 'businessModelClarity', title: 'Business Model Clarity' },
  { key: 'financialAssumptions', title: 'Financial Assumptions' },
  { key: 'evidenceStrength', title: 'Evidence Strength' },
];
