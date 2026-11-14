import { z } from 'zod';
import { EVIDENCE_LABELS } from './reportSchemas.ts';

export const evidenceLabelSchema = z.enum(EVIDENCE_LABELS);

export const TAM_SAM_SOM_FALLBACK = 'Not enough reliable data found';

export const COMPETITOR_SOURCE_TYPES = ['manual', 'researched'] as const;
export type CompetitorSourceType = (typeof COMPETITOR_SOURCE_TYPES)[number];

export const marketResearchInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  industry: z.string().trim().min(2, 'Industry is required').max(120),
  businessCategory: z.string().trim().min(2, 'Business category is required').max(120),
  targetCustomer: z.string().trim().min(3, 'Target customer is required').max(300),
  location: z.string().trim().min(2, 'Location is required').max(120),
  productOrService: z.string().trim().min(3, 'Product or service description is required').max(500),
});

export type MarketResearchInput = z.infer<typeof marketResearchInputSchema>;

export const researchClaimSchema = z.object({
  text: z.string().trim().min(3),
  evidenceLabel: evidenceLabelSchema,
  sourceId: z.string().trim().nullable().optional().default(null),
});

export type ResearchClaim = z.infer<typeof researchClaimSchema>;

export const marketSizingEntrySchema = z.object({
  value: z.string().trim().min(1),
  evidenceLabel: evidenceLabelSchema,
  sourceId: z.string().trim().nullable().optional().default(null),
  note: z.string().trim().min(1),
});

export type MarketSizingEntry = z.infer<typeof marketSizingEntrySchema>;

export const marketResearchResultSchema = z.object({
  summary: researchClaimSchema,
  industryTrends: z.array(researchClaimSchema).min(1),
  demandIndicators: z.array(researchClaimSchema).min(1),
  customerProblems: z.array(researchClaimSchema).min(1),
  potentialMarketSegments: z.array(researchClaimSchema).min(1),
  tamSamSom: z.object({
    tam: marketSizingEntrySchema,
    sam: marketSizingEntrySchema,
    som: marketSizingEntrySchema,
  }),
});

export type MarketResearchResult = z.infer<typeof marketResearchResultSchema>;

const trimmedStringArray = z.array(z.string().trim().min(1)).default([]);

export const competitorInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  name: z.string().trim().min(1, 'Competitor name is required').max(150),
  website: z.string().trim().max(400).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  pricing: z.string().trim().max(500).optional().default(''),
  features: trimmedStringArray,
  strengths: trimmedStringArray,
  weaknesses: trimmedStringArray,
  notes: z.string().trim().max(2000).optional().default(''),
  sourceUrl: z.string().trim().max(500).optional().default(''),
  researchedDate: z.string().trim().max(60).nullable().optional().default(null),
  sourceType: z.enum(COMPETITOR_SOURCE_TYPES).optional().default('manual'),
  isDemo: z.boolean().optional().default(false),
});

export type CompetitorInput = z.infer<typeof competitorInputSchema>;

export const competitorDiscoverInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  industry: z.string().trim().min(2, 'Industry is required').max(120),
  productOrService: z.string().trim().min(3, 'Product or service is required').max(500),
  location: z.string().trim().min(2, 'Location is required').max(120),
  targetCustomer: z.string().trim().max(300).optional().default(''),
});

export type CompetitorDiscoverInput = z.infer<typeof competitorDiscoverInputSchema>;

export const discoveredCompetitorsJsonSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(150),
        website: z.string().trim().max(400).optional().default(''),
        description: z.string().trim().min(5).max(1500),
        pricing: z.string().trim().max(300).optional().default('Not disclosed in retrieved sources'),
        features: z.array(z.string().trim().min(2)).min(1),
        strengths: z.array(z.string().trim().min(2)).min(1),
        weaknesses: z.array(z.string().trim().min(2)).min(1),
        notes: z.string().trim().max(1000).optional().default(''),
        sourceId: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(6),
});

export const differentiationOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(180),
  rationale: z.string().trim().min(10).max(1200),
  evidenceLabel: z.literal('AI interpretation'),
});

export const competitorDifferentiationJsonSchema = z.object({
  opportunities: z.array(differentiationOpportunitySchema).min(1).max(6),
});

export type DifferentiationOpportunity = z.infer<typeof differentiationOpportunitySchema>;
