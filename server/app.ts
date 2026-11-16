import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config.ts';
import { initDatabase } from './db.ts';
import { requestLoggerMiddleware } from './middleware/requestLogger.ts';
import authRouter from './routes/v1/auth.ts';
import { createCompetitorsRouter, type CompetitorsRouterOptions } from './routes/v1/competitors.ts';
import contactRouter from './routes/v1/contact.ts';
import dashboardRouter from './routes/v1/dashboard.ts';
import { createFinanceRouter, type FinanceRouterOptions } from './routes/v1/finance.ts';
import ideasRouter from './routes/v1/ideas.ts';
import leadsRouter from './routes/v1/leads.ts';
import { createMarketingRouter, type MarketingRouterOptions } from './routes/v1/marketing.ts';
import { createPersonasRouter, type PersonasRouterOptions } from './routes/v1/personas.ts';
import plansRouter from './routes/v1/plans.ts';
import { createReportsRouter, type ReportsRouterOptions } from './routes/v1/reports.ts';
import { createResearchRouter, type ResearchRouterOptions } from './routes/v1/research.ts';
import { createRoadmapRouter, type RoadmapRouterOptions } from './routes/v1/roadmap.ts';
import { createSalesRouter, type SalesRouterOptions } from './routes/v1/sales.ts';
import startupsRouter from './routes/v1/startups.ts';
import systemRouter from './routes/v1/system.ts';
import tasksRouter from './routes/v1/tasks.ts';
import expensesRouter from './routes/v1/expenses.ts';
import usersRouter from './routes/v1/users.ts';
import { runGeminiStartupCheck } from './services/llmClient.ts';
import { errorMiddleware, sendError } from './utils/errors.ts';

export function createApiApp(options?: {
  dbPath?: string;
  reportOptions?: ReportsRouterOptions;
  financeOptions?: FinanceRouterOptions;
  personasOptions?: PersonasRouterOptions;
  researchOptions?: ResearchRouterOptions;
  competitorsOptions?: CompetitorsRouterOptions;
  marketingOptions?: MarketingRouterOptions;
  salesOptions?: SalesRouterOptions;
  roadmapOptions?: RoadmapRouterOptions;
}) {
  initDatabase(options?.dbPath);
  if (process.env.NODE_ENV !== 'test') {
    void runGeminiStartupCheck();
  }

  const app = express();
  app.set('trust proxy', true);

  app.use(requestLoggerMiddleware);

  // Strict CORS check with credentials enabled for configured and active host origins.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const host = req.get('host');
      const forwardedHost = String(req.headers['x-forwarded-host'] || '')
        .split(',')[0]
        .trim();
      const allowed = new Set([
        ...config.corsOrigins,
        config.frontendUrl,
        config.appUrl,
        ...(host ? [`https://${host}`, `http://${host}`] : []),
        ...(forwardedHost ? [`https://${forwardedHost}`, `http://${forwardedHost}`] : []),
      ]);
      if (allowed.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'venturepilot-api', phase: '5' });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/startups', startupsRouter);
  app.use('/api/v1/ideas', ideasRouter);
  app.use('/api/v1/reports', createReportsRouter(options?.reportOptions));
  app.use('/api/v1/finance', createFinanceRouter(options?.financeOptions));
  app.use('/api/v1/personas', createPersonasRouter(options?.personasOptions));
  app.use('/api/v1/research', createResearchRouter(options?.researchOptions));
  app.use('/api/v1/competitors', createCompetitorsRouter(options?.competitorsOptions));
  app.use('/api/v1/leads', leadsRouter);
  app.use('/api/v1/marketing', createMarketingRouter(options?.marketingOptions));
  app.use('/api/v1/sales', createSalesRouter(options?.salesOptions));
  app.use('/api/v1/roadmap', createRoadmapRouter(options?.roadmapOptions));
  app.use('/api/v1/tasks', tasksRouter);
  app.use('/api/v1/expenses', expensesRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/plans', plansRouter);
  app.use('/api/v1/contact', contactRouter);
  app.use('/api/v1/system', systemRouter);

  app.use('/api', (_req, res) => {
    sendError(res, 404, 'ENDPOINT_NOT_FOUND', 'API endpoint not found.');
  });

  app.use(errorMiddleware);

  return app;
}
