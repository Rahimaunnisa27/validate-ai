import { z } from 'zod';

export const STARTUP_STAGES = ['idea', 'mvp', 'early_revenue', 'growth'] as const;
export type StartupStage = (typeof STARTUP_STAGES)[number];

export const IDEA_BUSINESS_MODELS = [
  'b2b',
  'b2c',
  'b2b2c',
  'marketplace',
  'saas',
  'd2c',
  'other',
] as const;
export type IdeaBusinessModel = (typeof IDEA_BUSINESS_MODELS)[number];

export const IDEA_STAGES = ['concept', 'prototype', 'mvp', 'launched'] as const;
export type IdeaStage = (typeof IDEA_STAGES)[number];

export const PAIN_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type PainLevel = (typeof PAIN_LEVELS)[number];

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, 'Reset token is invalid'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
});

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  role: z.string().trim().max(80).optional().default('Founder'),
  timezone: z.string().trim().max(64).optional().default('Asia/Kolkata'),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128)
    .optional()
    .or(z.literal('')),
});

export const startupSchema = z.object({
  name: z.string().trim().min(2, 'Startup name must be at least 2 characters').max(120),
  tagline: z.string().trim().max(180).optional().default(''),
  industry: z.string().trim().min(2, 'Industry is required').max(80),
  stage: z.enum(STARTUP_STAGES),
  location: z.string().trim().max(120).optional().default('India'),
  website: z
    .string()
    .trim()
    .refine((val) => val === '' || /^https?:\/\/.+/.test(val), {
      message: 'Website must start with http:// or https://',
    })
    .optional()
    .default(''),
  description: z.string().trim().max(2000).optional().default(''),
});

export const ideaBusinessDetailsSchema = z.object({
  title: z.string().trim().min(3, 'Idea title must be at least 3 characters').max(140),
  startupId: z.string().trim().optional().default(''),
  industry: z.string().trim().min(2, 'Industry is required').max(80),
  businessModel: z.enum(IDEA_BUSINESS_MODELS),
  stage: z.enum(IDEA_STAGES),
  oneLiner: z
    .string()
    .trim()
    .min(10, 'Provide a concise 1-sentence summary (at least 10 characters)')
    .max(280),
});

export const ideaProblemSolutionSchema = z.object({
  problemStatement: z
    .string()
    .trim()
    .min(15, 'Describe the core problem (at least 15 characters)')
    .max(2000),
  currentAlternatives: z.string().trim().max(1000).optional().default(''),
  proposedSolution: z
    .string()
    .trim()
    .min(15, 'Describe your proposed solution (at least 15 characters)')
    .max(2000),
  uniqueValueProposition: z.string().trim().max(1000).optional().default(''),
});

export const ideaTargetCustomerSchema = z.object({
  primarySegment: z
    .string()
    .trim()
    .min(3, 'Describe your primary target customer')
    .max(300),
  geography: z.string().trim().min(2, 'Target geography is required').max(120),
  customerPainLevel: z.enum(PAIN_LEVELS),
  willingnessToPay: z.string().trim().max(300).optional().default(''),
});

const optionalNonNegativeNumber = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : val;
}, z.number().min(0, 'Must be 0 or greater').nullable().optional());

export const ideaFinancialsSchema = z.object({
  initialCapitalInr: optionalNonNegativeNumber,
  pricePerUnitInr: optionalNonNegativeNumber,
  estimatedMonthlyCustomers: optionalNonNegativeNumber,
  monthlyBurnInr: optionalNonNegativeNumber,
  revenueModelNotes: z.string().trim().max(1000).optional().default(''),
});

export const ideaCompetitorsSchema = z.object({
  knownCompetitors: z.string().trim().max(1500).optional().default(''),
  unfairAdvantage: z.string().trim().max(1000).optional().default(''),
});

export const ideaFullFormSchema = z.object({
  businessDetails: ideaBusinessDetailsSchema,
  problemSolution: ideaProblemSolutionSchema,
  targetCustomer: ideaTargetCustomerSchema,
  financials: ideaFinancialsSchema,
  competitors: ideaCompetitorsSchema,
});

export type IdeaFullFormData = z.infer<typeof ideaFullFormSchema>;

export const ideaDraftPayloadSchema = z.object({
  currentStep: z.number().int().min(1).max(6).optional().default(1),
  startupId: z.string().trim().nullable().optional(),
  title: z.string().trim().max(140).optional().default('Untitled Idea'),
  businessDetails: z.record(z.string(), z.unknown()).optional().default({}),
  problemSolution: z.record(z.string(), z.unknown()).optional().default({}),
  targetCustomer: z.record(z.string(), z.unknown()).optional().default({}),
  financials: z.record(z.string(), z.unknown()).optional().default({}),
  competitors: z.record(z.string(), z.unknown()).optional().default({}),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(150),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(3000),
});
