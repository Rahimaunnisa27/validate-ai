import { z } from 'zod';

// ==========================================
// 1. TASKS SCHEMAS & TYPES
// ==========================================

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ['todo', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const taskInputSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  roadmapPlanId: z.string().trim().nullable().optional(),
  title: z.string().trim().min(1, 'Task title is required').max(200),
  description: z.string().trim().max(3000).optional().default(''),
  priority: z.enum(TASK_PRIORITIES).optional().default('medium'),
  startDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  status: z.enum(TASK_STATUSES).optional().default('todo'),
  notes: z.string().trim().max(4000).optional().default(''),
  expectedOutcome: z.string().trim().max(1000).optional().default(''),
  sortOrder: z.number().int().min(0).optional(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskUpdateSchema = taskInputSchema.partial();
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const taskStatusUpdateSchema = z.object({
  status: z.enum(TASK_STATUSES),
  sortOrder: z.number().int().min(0).optional(),
});
export type TaskStatusUpdateInput = z.infer<typeof taskStatusUpdateSchema>;

export interface TaskRecord {
  id: string;
  userId: string;
  ideaId: string | null;
  roadmapPlanId: string | null;
  title: string;
  description: string;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
  notes: string;
  expectedOutcome: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 2. ROADMAP SCHEMAS & TYPES
// ==========================================

export const ROADMAP_DURATIONS = [30, 60, 90] as const;
export type RoadmapDuration = (typeof ROADMAP_DURATIONS)[number];

export const ROADMAP_DISCLAIMER = 'AI interpretation';

export const roadmapTaskItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(''),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  dayOffsetStart: z.number().int().min(0).max(90).default(0),
  dayOffsetDue: z.number().int().min(1).max(90).default(7),
  expectedOutcome: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(1000).default(''),
});
export type RoadmapTaskItem = z.infer<typeof roadmapTaskItemSchema>;

export const roadmapPhaseSchema = z.object({
  phaseNumber: z.number().int().min(1).max(12),
  name: z.string().trim().min(1).max(150),
  timeframe: z.string().trim().min(1).max(100),
  objective: z.string().trim().min(1).max(500),
  milestones: z.array(z.string().trim().min(1)).min(1),
  tasks: z.array(roadmapTaskItemSchema).min(1),
});
export type RoadmapPhase = z.infer<typeof roadmapPhaseSchema>;

export const roadmapPlanJsonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  targetMarket: z.string().trim().max(300).default(''),
  keyRisks: z.array(z.string().trim()).default([]),
  phases: z.array(roadmapPhaseSchema).min(1),
});
export type RoadmapPlanJson = z.infer<typeof roadmapPlanJsonSchema>;

export const roadmapGenerateRequestSchema = z.object({
  ideaId: z.string().trim().nullable().optional(),
  reportId: z.string().trim().nullable().optional(),
  durationDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(30),
  customFocus: z.string().trim().max(500).optional().default(''),
});
export type RoadmapGenerateRequest = z.infer<typeof roadmapGenerateRequestSchema>;

export interface RoadmapPlanRecord {
  id: string;
  userId: string;
  ideaId: string | null;
  reportId: string | null;
  title: string;
  durationDays: RoadmapDuration;
  summary: string;
  phases: RoadmapPhase[];
  keyRisks: string[];
  evidenceLabel: 'AI interpretation';
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 3. EXPENSES & BUDGET SCHEMAS & TYPES
// ==========================================

export const EXPENSE_CATEGORIES = [
  'Software & Tools',
  'Marketing & Ads',
  'Salaries & Contractors',
  'Legal & Compliance',
  'Office & Operations',
  'Travel & Events',
  'Other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_METHODS = [
  'Credit Card',
  'Debit Card',
  'UPI',
  'Net Banking',
  'Bank Transfer',
  'Cash',
  'Other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const expenseInputSchema = z.object({
  startupId: z.string().trim().nullable().optional(),
  amount: z.number().positive('Expense amount must be greater than zero'),
  category: z.enum(EXPENSE_CATEGORIES),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  paymentMethod: z.enum(PAYMENT_METHODS).default('Other'),
  description: z.string().trim().max(1000).optional().default(''),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const expenseUpdateSchema = expenseInputSchema.partial();
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

export const expenseBudgetInputSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  amount: z.number().positive('Budget amount must be greater than zero'),
});
export type ExpenseBudgetInput = z.infer<typeof expenseBudgetInputSchema>;

export interface ExpenseRecord {
  id: string;
  userId: string;
  startupId: string | null;
  amount: number;
  category: ExpenseCategory;
  date: string;
  paymentMethod: PaymentMethod;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseBudgetRecord {
  id: string;
  userId: string;
  category: ExpenseCategory;
  month: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetVsActualComparison {
  category: ExpenseCategory;
  budgeted: number;
  actual: number;
  variance: number;
  percentageUsed: number;
  status: 'under' | 'on_track' | 'over';
}

export interface ExpenseSummary {
  totalAmount: number;
  byCategory: Record<string, number>;
  monthlyTrend: Array<{ month: string; total: number }>;
}
