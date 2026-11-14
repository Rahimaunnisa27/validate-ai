import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

// Ephemeral fallback in development so the app runs cleanly out-of-the-box without leaking hardcoded production keys.
const devFallbackSecret = crypto.randomBytes(32).toString('hex');
const devFallbackRefreshSecret = crypto.randomBytes(32).toString('hex');

function resolveSecret(envName: string, fallback: string): string {
  const value = process.env[envName];
  if (value && value.trim().length >= 16 && !value.startsWith('CHANGE_ME')) {
    return value.trim();
  }
  if (isProd) {
    console.warn(`[config] Warning: ${envName} is not set securely in production; generating ephemeral secret.`);
  }
  return fallback;
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databasePath: process.env.DATABASE_PATH || './data/venturepilot.db',
  secretKey: resolveSecret('SECRET_KEY', devFallbackSecret),
  refreshSecretKey: resolveSecret('REFRESH_SECRET_KEY', devFallbackRefreshSecret),
  accessTokenExpireMinutes: Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES) || 15,
  refreshTokenExpireDays: Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS) || 7,
  llmProvider: process.env.LLM_PROVIDER || 'gemini',
  llmModel: process.env.LLM_MODEL || 'gemini-2.5-flash',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || '',
  sonarApiKey: process.env.SONAR_API_KEY || '',
  embeddingModel: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'noreply@venturepilot.local',
  allowUnpaidReports: process.env.ALLOW_UNPAID_REPORTS !== 'false',
  demoMode: process.env.DEMO_MODE === 'true',
};

export interface IntegrationStatusItem {
  key: string;
  name: string;
  configured: boolean;
  reachable: boolean;
  phase: string;
  statusLabel: 'Configured' | 'Not configured' | 'Dev fallback';
  message: string;
  setupSteps: string[];
}

export function getIntegrationStatuses(
  dbReachable: boolean,
  geminiInfo?: {
    checked: boolean;
    resolvedLlmModel: string;
    resolvedEmbeddingModel: string;
    usedAutoFallback: boolean;
    error: string | null;
  },
): {
  integrations: IntegrationStatusItem[];
  flags: { allowUnpaidReports: boolean; demoMode: boolean; nodeEnv: string };
} {
  const hasRealSecret =
    Boolean(process.env.SECRET_KEY) && !String(process.env.SECRET_KEY).startsWith('CHANGE_ME');
  const hasLlm = Boolean(config.geminiApiKey && !config.geminiApiKey.startsWith('MY_'));
  const hasSonar = Boolean(config.sonarApiKey);
  const hasRazorpay = Boolean(config.razorpayKeyId && config.razorpayKeySecret);
  const hasWebhook = Boolean(config.razorpayWebhookSecret);
  const hasEmail = Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
  const activeLlmModel = geminiInfo?.resolvedLlmModel || config.llmModel;
  const activeEmbModel = geminiInfo?.resolvedEmbeddingModel || config.embeddingModel;
  const llmReachable = hasLlm && (!geminiInfo?.checked || !geminiInfo.error);

  return {
    integrations: [
      {
        key: 'database',
        name: 'SQLite Database & Migrations',
        configured: true,
        reachable: dbReachable,
        phase: 'Phase 1',
        statusLabel: dbReachable ? 'Configured' : 'Not configured',
        message: dbReachable
          ? 'Embedded SQLite database connected with foreign keys and versioned migrations.'
          : 'Database file is unreachable.',
        setupSteps: [
          'Verify DATABASE_PATH in .env (defaults to ./data/venturepilot.db).',
          'Ensure the runtime process has write permission to the data directory.',
        ],
      },
      {
        key: 'auth',
        name: 'JWT Cookie Authentication',
        configured: hasRealSecret,
        reachable: true,
        phase: 'Phase 1',
        statusLabel: hasRealSecret ? 'Configured' : 'Dev fallback',
        message: hasRealSecret
          ? 'Signing access and refresh tokens with configured SECRET_KEY.'
          : 'Using an ephemeral development SECRET_KEY. Sessions reset on server restart.',
        setupSteps: [
          'Set SECRET_KEY and REFRESH_SECRET_KEY (32+ random characters) in Secrets or .env.',
        ],
      },
      {
        key: 'llm',
        name: `LLM Provider (${config.llmProvider})`,
        configured: hasLlm && !geminiInfo?.error,
        reachable: llmReachable,
        phase: 'Phase 2',
        statusLabel:
          hasLlm && !geminiInfo?.error
            ? 'Configured'
            : hasLlm && geminiInfo?.error
              ? 'Dev fallback'
              : 'Not configured',
        message:
          hasLlm && geminiInfo?.error
            ? `Startup model check failed: ${geminiInfo.error}`
            : hasLlm
              ? `Configured with free-tier Flash model ${activeLlmModel}${
                  geminiInfo?.usedAutoFallback ? ' (auto-selected from accessible models)' : ''
                }.`
              : 'GEMINI_API_KEY / LLM_API_KEY is missing. AI validation reports will show "Not configured" in Phase 2.',
        setupSteps: [
          'Obtain a free Gemini API key from Google AI Studio.',
          'Add GEMINI_API_KEY to AI Studio Settings > Secrets (or .env).',
        ],
      },
      {
        key: 'sonar',
        name: 'Sonar Research API (Perplexity)',
        configured: hasSonar,
        reachable: hasSonar,
        phase: 'Phase 2–3',
        statusLabel: hasSonar ? 'Configured' : config.demoMode ? 'Dev fallback' : 'Not configured',
        message: hasSonar
          ? 'Perplexity Sonar API key is configured for cited market research.'
          : config.demoMode
            ? 'SONAR_API_KEY is missing, but DEMO_MODE=true provides sample sources tagged "DEMO DATA".'
            : 'SONAR_API_KEY is missing. Market claims without live sources will be marked "Unverified".',
        setupSteps: [
          'Create an API key in Perplexity API Settings.',
          'Add SONAR_API_KEY to your environment Secrets (or enable DEMO_MODE=true for demo citations).',
        ],
      },
      {
        key: 'embeddings',
        name: `Embeddings (${activeEmbModel})`,
        configured: hasLlm || activeEmbModel === 'local-hash-256',
        reachable: llmReachable || activeEmbModel === 'local-hash-256',
        phase: 'Phase 2',
        statusLabel:
          activeEmbModel === 'local-hash-256'
            ? 'Dev fallback'
            : hasLlm
              ? 'Configured'
              : 'Not configured',
        message:
          activeEmbModel === 'local-hash-256'
            ? 'Using local deterministic embedding fallback (local-hash-256) for per-user cosine similarity.'
            : hasLlm
              ? `Using Gemini Embeddings (${activeEmbModel}) for per-user cosine similarity (auto-falls back to local-hash-256 if unavailable).`
              : 'GEMINI_API_KEY is missing. Local embedding fallback activates automatically during validation if needed.',
        setupSteps: ['Add GEMINI_API_KEY in Settings > Secrets to use free-tier Gemini embeddings.'],
      },
      {
        key: 'razorpay',
        name: 'Razorpay Checkout (INR)',
        configured: hasRazorpay,
        reachable: hasRazorpay,
        phase: 'Phase 6',
        statusLabel: hasRazorpay ? 'Configured' : 'Not configured',
        message: hasRazorpay
          ? 'Razorpay key ID and secret are configured.'
          : 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are missing. Paid report checkout activates in Phase 6.',
        setupSteps: [
          'Create a Razorpay account and switch to Test Mode.',
          'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment Secrets.',
        ],
      },
      {
        key: 'razorpay_webhook',
        name: 'Razorpay Webhook Secret',
        configured: hasWebhook,
        reachable: hasWebhook,
        phase: 'Phase 6',
        statusLabel: hasWebhook ? 'Configured' : 'Not configured',
        message: hasWebhook
          ? 'Webhook HMAC verification secret is configured.'
          : 'RAZORPAY_WEBHOOK_SECRET is missing. Required in Phase 6 for payment capture confirmation.',
        setupSteps: [
          'Configure a webhook endpoint in Razorpay Dashboard pointing to /api/v1/payments/webhook.',
          'Enable payment.captured, payment.failed, and refund.processed events and set RAZORPAY_WEBHOOK_SECRET.',
        ],
      },
      {
        key: 'email',
        name: 'Email / SMTP Delivery',
        configured: hasEmail,
        reachable: hasEmail,
        phase: 'Phase 1+',
        statusLabel: hasEmail ? 'Configured' : 'Not configured',
        message: hasEmail
          ? `SMTP configured (${config.smtpHost}:${config.smtpPort}).`
          : 'SMTP_* variables are not set. Password reset links log to server console in dev mode; contact messages still save to database.',
        setupSteps: [
          'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in .env.',
        ],
      },
    ],
    flags: {
      allowUnpaidReports: config.allowUnpaidReports,
      demoMode: config.demoMode,
      nodeEnv: config.nodeEnv,
    },
  };
}
