import { ArrowRight, Check, Layers, ShieldCheck, Compass, BarChart3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicFooter } from '../../components/public/PublicFooter.tsx';
import { PublicNavbar } from '../../components/public/PublicNavbar.tsx';
import { ErrorState, SkeletonCard } from '../../components/ui/States.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api, type ReportPlan } from '../../lib/api.ts';

function PublicPageLayout({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-canvas text-ink-primary flex flex-col">
      <PublicNavbar />
      <main className="flex-1 pt-28 pb-20">
        <div className="mx-auto max-w-[1000px] px-6">
          <p className="text-sm font-medium text-brand-primary">{kicker}</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-primary sm:text-4xl [text-wrap:balance]">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-secondary">{subtitle}</p>
          <div className="mt-10">{children}</div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function AboutPage() {
  return (
    <PublicPageLayout
      kicker="About VenturePilot AI"
      title="Honest startup validation for early-stage builders"
      subtitle="VenturePilot AI helps aspiring founders, small business owners, and entrepreneurship students evaluate ideas with evidence labels and structured execution workflows."
    >
      <div className="space-y-8 border-t border-border-hairline pt-8 text-sm leading-relaxed text-ink-secondary sm:text-base">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-ink-primary">Our Product Principles</h2>
          <p>
            Generic AI tools routinely invent market sizes, fabricate competitors, and give
            arbitrary confidence scores. VenturePilot AI is engineered around strict evidence
            hygiene: every claim is tagged as Verified research, AI interpretation, User
            assumption, or Unverified.
          </p>
          <p>
            Financial calculations are executed deterministically in backend code before any AI
            commentary is generated, ensuring break-even and runway math stays accurate.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-border-hairline bg-surface-subtle p-6">
            <h3 className="text-base font-semibold text-ink-primary">Built for India, Ready Globally</h3>
            <p className="mt-2 text-sm text-ink-secondary">
              Priced transparently in INR with pay-per-report tiers (Basic, Full, Advanced) while
              supporting founders in any geography.
            </p>
          </div>
          <div className="rounded-xl border border-border-hairline bg-surface-subtle p-6">
            <h3 className="text-base font-semibold text-ink-primary">Phased Rollout Transparency</h3>
            <p className="mt-2 text-sm text-ink-secondary">
              Every active capability works end-to-end against real databases. Upcoming capabilities
              are clearly marked rather than simulated.
            </p>
          </div>
        </section>
      </div>
    </PublicPageLayout>
  );
}

export function FeaturesPage() {
  const { user } = useAuth();
  const blocks = [
    {
      icon: Layers,
      phase: 'Phase 1 · Live',
      title: '5-Step Idea Intake & Autosaved Drafts',
      body: 'Structured intake covering business details, problem & solution, target customer, optional financials, and competitors. Drafts save automatically to the database so you never lose progress.',
    },
    {
      icon: ShieldCheck,
      phase: 'Phase 2',
      title: 'Evidence-Tagged 18-Section AI Reports',
      body: 'Full validation reports across problem clarity, market opportunity, SWOT, risks, and 30/90-day roadmaps with source URLs, retrieval dates, and PDF download.',
    },
    {
      icon: Compass,
      phase: 'Phase 3',
      title: 'Market Research, Competitors & Personas',
      body: 'Cited market research runs, editable competitor comparison tables, and customer persona hypotheses.',
    },
    {
      icon: BarChart3,
      phase: 'Phase 3–5',
      title: 'Finance Engine, Leads Kanban, Tasks & Expenses',
      body: 'Unit-tested 12-month cash flow projections, CSV lead import with Kanban pipeline, 30/60/90-day tasks, and budget-vs-actual expense tracking.',
    },
  ];

  return (
    <PublicPageLayout
      kicker="Platform Features"
      title="Everything required to validate and run an early-stage venture"
      subtitle="A structured workspace separating verified facts from assumptions at every step."
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {blocks.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-xl border border-border-hairline bg-surface-canvas p-6"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-brand-primary" aria-hidden="true" />
                <span className="text-xs font-medium text-ink-muted">{item.phase}</span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-ink-primary">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{item.body}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <Link
          to={user ? '/ideas/new' : '/register'}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors"
        >
          {user ? 'Open Idea Builder' : 'Create Free Account'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </PublicPageLayout>
  );
}

export function HowItWorksPage() {
  const steps = [
    {
      num: '01',
      title: 'Create your startup workspace',
      desc: 'Register an account and define your startup profile (name, industry, stage, and geography).',
    },
    {
      num: '02',
      title: 'Complete the 5-step idea submission',
      desc: 'Document the problem, proposed solution, customer segment, optional unit financials, and known competitors. Drafts autosave continuously.',
    },
    {
      num: '03',
      title: 'Choose a report tier & run AI validation (Phase 2+)',
      desc: 'Select Basic, Full, or Advanced validation. The pipeline retrieves cited sources, runs deterministic financial checks, and labels every claim.',
    },
    {
      num: '04',
      title: 'Track execution across tasks, leads, and cash',
      desc: 'Use your single source of truth workspace to manage leads, validate personas, and monitor monthly budget vs actual spend.',
    },
  ];

  return (
    <PublicPageLayout
      kicker="Workflow"
      title="How VenturePilot AI works"
      subtitle="Four structured stages from initial founder hypothesis to disciplined execution."
    >
      <div className="space-y-4">
        {steps.map((s) => (
          <div
            key={s.num}
            className="rounded-xl border border-border-hairline bg-surface-canvas p-6 flex flex-col sm:flex-row sm:items-start gap-4"
          >
            <span className="font-mono text-sm font-semibold text-brand-primary shrink-0">
              Step {s.num}
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink-primary">{s.title}</h2>
              <p className="mt-1.5 text-sm text-ink-secondary">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </PublicPageLayout>
  );
}

export function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<ReportPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlans = () => {
    setLoading(true);
    setError(null);
    api.plans
      .list()
      .then((res) => setPlans(res.plans))
      .catch((err) => setError(err?.message || 'Failed to load pricing plans.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPlans();
  }, []);

  return (
    <PublicPageLayout
      kicker="Pricing"
      title="Free workspace. Pay only per validation report."
      subtitle="Plan prices below are loaded live from the backend report_plans configuration table."
    >
      {loading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <SkeletonCard rows={5} />
          <SkeletonCard rows={5} />
          <SkeletonCard rows={5} />
        </div>
      )}

      {error && <ErrorState message={error} onRetry={loadPlans} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 flex flex-col justify-between ${
                plan.isRecommended
                  ? 'border-brand-primary bg-surface-canvas shadow-md'
                  : 'border-border-hairline bg-surface-canvas'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-ink-primary">{plan.name}</h2>
                  {plan.isRecommended && (
                    <span className="text-xs font-semibold text-brand-primary">Recommended</span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-ink-primary tabular-nums">
                    ₹{plan.priceInr}
                  </span>
                  <span className="text-sm text-ink-muted">/ report</span>
                </div>
                <p className="mt-3 text-sm text-ink-secondary">{plan.description}</p>
                <ul className="mt-6 space-y-2.5 border-t border-border-hairline pt-5 text-sm text-ink-secondary">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => navigate(user ? '/ideas/new' : '/register')}
                className={`mt-8 w-full h-11 rounded-lg px-4 text-sm font-medium transition-colors ${
                  plan.isRecommended
                    ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                    : 'border border-border-hairline text-ink-primary hover:bg-surface-subtle'
                }`}
              >
                {user ? 'Create Idea Draft' : 'Get Started'}
              </button>
            </div>
          ))}
        </div>
      )}
    </PublicPageLayout>
  );
}

export function TermsPage() {
  return (
    <PublicPageLayout
      kicker="Legal"
      title="Terms of Service"
      subtitle="Effective November 2026 · Please review these terms carefully before using VenturePilot AI."
    >
      <div className="space-y-6 text-sm leading-relaxed text-ink-secondary border-t border-border-hairline pt-8">
        <section>
          <h2 className="text-base font-semibold text-ink-primary">1. Informational Nature</h2>
          <p className="mt-2">
            VenturePilot AI provides structured frameworks, cited research summaries, deterministic
            financial calculations, and analytical scoring. Outputs do not constitute legal, tax,
            investment, or accounting advice, and validation scores do not predict commercial
            success.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-ink-primary">2. Account & Ownership</h2>
          <p className="mt-2">
            You retain full ownership of the startup records, business ideas, and operational data
            you submit to your workspace. You are responsible for safeguarding your account
            credentials.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-ink-primary">3. Acceptable Use</h2>
          <p className="mt-2">
            You agree not to attempt unauthorized access to other users&apos; records, circumvent
            rate limits, or submit unlawful content.
          </p>
        </section>
      </div>
    </PublicPageLayout>
  );
}

export function PrivacyPage() {
  return (
    <PublicPageLayout
      kicker="Legal"
      title="Privacy Policy"
      subtitle="Effective November 2026 · How VenturePilot AI stores and protects your account and startup idea data."
    >
      <div className="space-y-6 text-sm leading-relaxed text-ink-secondary border-t border-border-hairline pt-8">
        <section>
          <h2 className="text-base font-semibold text-ink-primary">1. Data Isolation</h2>
          <p className="mt-2">
            Every startup, idea draft, and workspace record is scoped strictly to your authenticated
            user ID. Other accounts cannot read, query, or modify your private business ideas.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-ink-primary">2. Authentication & Cookies</h2>
          <p className="mt-2">
            Sessions are secured via httpOnly access and refresh cookies. Passwords are stored
            strictly as salted cryptographic hashes and are never logged or returned in API
            responses.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-ink-primary">3. Contact Data</h2>
          <p className="mt-2">
            Inquiries submitted via the Contact page are stored securely to respond to your request.
            We never scrape or sell personal contact records.
          </p>
        </section>
      </div>
    </PublicPageLayout>
  );
}

export function RefundPolicyPage() {
  return (
    <PublicPageLayout
      kicker="Legal"
      title="Refund Policy"
      subtitle="Effective November 2026 · Clear rules for pay-per-report purchases in INR."
    >
      <div className="space-y-6 text-sm leading-relaxed text-ink-secondary border-t border-border-hairline pt-8">
        <section>
          <h2 className="text-base font-semibold text-ink-primary">1. Free Workspace Tools</h2>
          <p className="mt-2">
            Account creation, startup management, and the 5-step idea builder are free and incur no
            charges.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-ink-primary">2. Failed Report Generation</h2>
          <p className="mt-2">
            If a paid AI validation report job fails after payment verification, you can retry
            report generation at no additional cost. If a technical failure cannot be resolved, you
            are eligible for a full refund to your original payment method.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-ink-primary">3. Completed Reports</h2>
          <p className="mt-2">
            Once a validation report has been generated and delivered, purchases are generally
            non-refundable unless duplicate billing occurred, in which case duplicate charges are
            refunded promptly.
          </p>
        </section>
      </div>
    </PublicPageLayout>
  );
}
