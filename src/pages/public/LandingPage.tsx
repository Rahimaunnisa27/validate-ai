import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
  Compass,
  FileText,
  Layers,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicFooter } from '../../components/public/PublicFooter.tsx';
import { PublicNavbar } from '../../components/public/PublicNavbar.tsx';
import { HeroDashboardPreview } from '../../components/public/HeroDashboardPreview.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api, type ReportPlan } from '../../lib/api.ts';
import {
  MOTION_DURATIONS,
  MOTION_EASE,
  MOTION_STAGGER,
  VIEWPORT_ONCE,
  getRevealProps,
} from '../../lib/motion.ts';

const HEADLINE_LINES = ['Turn Your Business Idea', 'Into a Successful Startup.'];

const PROBLEMS = [
  {
    title: 'Guesswork disguised as market research',
    description:
      'Founders spend weeks building before checking whether real buyers feel the problem or whether cited market demand actually exists.',
  },
  {
    title: 'Spreadsheet math prone to hidden errors',
    description:
      'Optimistic unit economics and break-even numbers break down when variable costs, burn rate, and churn are calculated inconsistently.',
  },
  {
    title: 'Disconnected documents and lost momentum',
    description:
      'Ideas sit in scattered notes instead of moving cleanly into validation, competitor tracking, personas, tasks, and cash discipline.',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Structure your idea in 5 steps',
    description:
      'Capture business details, problem & solution, target customer, optional financials, and known competitors with automatic draft saving.',
  },
  {
    step: '02',
    title: 'Ground claims in cited research',
    description:
      'Every market figure and competitor reference is tagged by evidence type: Verified research, AI interpretation, User assumption, or Unverified.',
  },
  {
    step: '03',
    title: 'Run deterministic financial checks',
    description:
      'Backend financial formulas compute contribution margin, break-even units, 12-month cash flow, and runway before any AI narrative is written.',
  },
  {
    step: '04',
    title: 'Execute inside your workspace',
    description:
      'Turn findings into structured startups, execution roadmaps, Kanban tasks, lead pipelines, and monthly expense tracking.',
  },
];

const CORE_FEATURES = [
  {
    icon: Layers,
    title: '5-Step Idea Intake & Drafts',
    description:
      'Guided multi-step intake with explicit required vs optional fields, shared validation, and continuous backend autosave.',
  },
  {
    icon: ShieldCheck,
    title: 'Evidence-Tagged Reporting',
    description:
      'Every claim distinguishes verified citations (with URL and retrieval date) from AI interpretation and founder assumptions.',
  },
  {
    icon: Compass,
    title: 'Cited Market & Competitor Intel',
    description:
      'Surface real competitors and demand indicators with editable comparison tables and preserved source links.',
  },
  {
    icon: BarChart3,
    title: 'Deterministic Finance Engine',
    description:
      'Conservative, expected, and optimistic unit-economics and runway scenarios computed in code, never guessed by an LLM.',
  },
  {
    icon: Target,
    title: 'Customer Personas & GTM',
    description:
      'Hypothesized buyer segments, objections, channel mix, and editable outreach drafts without automated spam.',
  },
  {
    icon: FileText,
    title: '18-Section Report & PDF Export',
    description:
      'Structured sections from executive summary through 90-day roadmap, exportable as a formatted PDF with sources.',
  },
];

const SAMPLE_TABS = ['Summary', 'SWOT', 'Scores', 'Roadmap'] as const;
type SampleTab = (typeof SAMPLE_TABS)[number];

const SAMPLE_SCORES = [
  { label: 'Problem Clarity', value: 8.4, note: 'Specific pain point quantified for mid-size cold storage operators.' },
  { label: 'Customer Definition', value: 7.8, note: 'Clear buyer persona in Tier-1 and Tier-2 Indian logistics hubs.' },
  { label: 'Competitive Differentiation', value: 6.5, note: 'Automated compliance alerts differentiate from generic ERPs.' },
  { label: 'Business Model Clarity', value: 7.2, note: 'Monthly per-warehouse SaaS pricing aligns with operator cash cycles.' },
  { label: 'Financial Assumptions', value: 6.9, note: 'Hardware sensor onboarding cost needs field pilot confirmation.' },
  { label: 'Evidence Strength', value: 7.5, note: 'Backed by 9 retrieved industry reports; 3 pricing assumptions unverified.' },
];

const FAQS = [
  {
    question: 'Does a high validation score guarantee my startup will succeed?',
    answer:
      'No. Validation scores measure how clearly defined, internally consistent, and evidence-backed your idea is—not whether customers will buy. Real customer interviews and pilot sales remain essential.',
  },
  {
    question: 'What is free vs paid on VenturePilot AI?',
    answer:
      'Creating an account, managing startups, submitting and saving idea drafts, and accessing the workspace dashboard are free. You pay only per AI validation report tier (Basic, Full, or Advanced) in INR.',
  },
  {
    question: 'How does VenturePilot AI avoid fabricated market statistics?',
    answer:
      'Every claim in reports and research carries an explicit evidence label. Market sizes (TAM/SAM/SOM) are displayed only when backed by a saved source URL and retrieval date; otherwise the system explicitly states "Not enough reliable data found".',
  },
  {
    question: 'Do I need API keys to use the workspace right now?',
    answer:
      'No. Account registration, startup management, the 5-step idea builder with draft autosave, and Integration Status work immediately with zero external AI or payment keys.',
  },
];

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const [activeTab, setActiveTab] = useState<SampleTab>('Summary');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [plans, setPlans] = useState<ReportPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  const howItWorksRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: howItWorksRef,
    offset: ['start 80%', 'end 55%'],
  });
  const lineScaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  useEffect(() => {
    let mounted = true;
    api.plans
      .list()
      .then((res) => {
        if (mounted) setPlans(res.plans);
      })
      .catch(() => {
        if (mounted) setPlans([]);
      })
      .finally(() => {
        if (mounted) setPlansLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const primaryHref = user ? '/ideas/new' : '/register';

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-primary">
      <PublicNavbar />

      <main>
        {/* 1. Hero Section */}
        <section className="relative overflow-hidden pt-28 pb-20 lg:pt-36 lg:pb-28">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <div className="animate-mesh-drift absolute -top-32 right-[-10%] h-[520px] w-[520px] rounded-full bg-brand-primary/8 blur-3xl" />
            <div className="animate-mesh-drift absolute -bottom-24 left-[-8%] h-[420px] w-[420px] rounded-full bg-brand-secondary/8 blur-3xl" />
          </div>

          <div className="mx-auto max-w-[1200px] px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <p className="text-sm font-medium text-brand-primary">
                  Startup Validation & Execution Workspace
                </p>

                <h1 className="mt-3 font-display text-[clamp(2.25rem,4vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-ink-primary [text-wrap:balance]">
                  {HEADLINE_LINES.map((line, idx) => (
                    <motion.span
                      key={line}
                      className="block"
                      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      transition={{
                        duration: MOTION_DURATIONS.heroLine,
                        delay: reducedMotion ? 0 : idx * MOTION_STAGGER.heroLine,
                        ease: MOTION_EASE,
                      }}
                    >
                      {line}
                    </motion.span>
                  ))}
                </h1>

                <motion.p
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{
                    duration: MOTION_DURATIONS.heroLine,
                    delay: reducedMotion ? 0 : 0.16,
                    ease: MOTION_EASE,
                  }}
                  className="mt-5 max-w-xl text-base leading-relaxed text-ink-secondary sm:text-lg"
                >
                  Validate your ideas, discover market opportunities, understand competitors, plan
                  finances and grow your business with AI-powered startup intelligence.
                </motion.p>

                <motion.div
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{
                    duration: MOTION_DURATIONS.heroLine,
                    delay: reducedMotion ? 0 : 0.24,
                    ease: MOTION_EASE,
                  }}
                  className="mt-8 flex flex-wrap items-center gap-4"
                >
                  <Link
                    to={primaryHref}
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 text-sm font-semibold text-white hover:bg-brand-primary-hover transition-all duration-150 active:scale-[0.98] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  >
                    Validate My Business Idea
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                  <a
                    href="#features"
                    className="inline-flex h-12 items-center justify-center rounded-lg border border-border-hairline bg-surface-canvas px-6 text-sm font-medium text-ink-primary hover:bg-surface-subtle transition-colors duration-150 active:scale-[0.98] whitespace-nowrap"
                  >
                    Explore Features
                  </a>
                </motion.div>

                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border-hairline pt-6 text-xs text-ink-muted tabular-nums">
                  <span>18 structured report sections</span>
                  <span aria-hidden="true">·</span>
                  <span>6 evidence-backed scores</span>
                  <span aria-hidden="true">·</span>
                  <span>5-step autosaved idea intake</span>
                </div>
              </div>

              <div className="lg:col-span-6">
                <HeroDashboardPreview />
              </div>
            </div>
          </div>
        </section>

        {/* 2. Problem & Solution */}
        <section className="border-t border-border-hairline bg-surface-subtle py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <motion.div {...getRevealProps(reducedMotion)} className="max-w-2xl">
              <p className="text-sm font-medium text-brand-secondary">Why founders lose months</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl [text-wrap:balance]">
                Replace founder guesswork with verifiable structure
              </h2>
            </motion.div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {PROBLEMS.map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...getRevealProps(reducedMotion, idx * MOTION_STAGGER.cards)}
                  className="rounded-xl border border-border-hairline bg-surface-canvas p-6"
                >
                  <span className="font-mono text-xs font-medium text-ink-muted">
                    0{idx + 1}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-ink-primary">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                    {item.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. How It Works */}
        <section id="how-it-works" ref={howItWorksRef} className="border-t border-border-hairline py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <motion.div {...getRevealProps(reducedMotion)} className="max-w-2xl">
              <p className="text-sm font-medium text-brand-primary">How it works</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
                From raw concept to an accountable startup plan
              </h2>
            </motion.div>

            <div className="relative mt-12">
              <div
                aria-hidden="true"
                className="hidden lg:block absolute top-6 left-0 right-0 h-px bg-border-hairline"
              >
                <motion.div
                  style={{ scaleX: reducedMotion ? 1 : lineScaleX, transformOrigin: 'left' }}
                  className="h-full w-full bg-brand-primary"
                />
              </div>

              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
                {HOW_IT_WORKS_STEPS.map((item, idx) => (
                  <motion.div
                    key={item.step}
                    {...getRevealProps(reducedMotion, idx * MOTION_STAGGER.cards)}
                    className="relative pt-2"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-hairline bg-surface-canvas font-mono text-sm font-semibold text-brand-primary">
                      {item.step}
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-ink-primary">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                      {item.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4. Core Features */}
        <section id="features" className="border-t border-border-hairline bg-surface-subtle py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <motion.div {...getRevealProps(reducedMotion)} className="max-w-2xl">
              <p className="text-sm font-medium text-brand-secondary">Core capabilities</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
                Built for analytical rigor, not generic AI fluff
              </h2>
            </motion.div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {CORE_FEATURES.map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <motion.div
                    key={feat.title}
                    {...getRevealProps(reducedMotion, idx * 0.05)}
                    className="rounded-xl border border-border-hairline bg-surface-canvas p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-subtle border border-border-hairline text-brand-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-ink-primary">{feat.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                      {feat.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 5. Sample Report */}
        <section id="sample-report" className="border-t border-border-hairline py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <motion.div
              {...getRevealProps(reducedMotion)}
              className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-brand-primary">
                  Sample report · Illustrative output
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
                  Inspect how every claim and score is structured
                </h2>
              </div>

              <div
                role="tablist"
                aria-label="Sample report sections"
                className="inline-flex items-center gap-1 rounded-lg bg-surface-subtle p-1 border border-border-hairline self-start"
              >
                {SAMPLE_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? 'bg-surface-canvas text-ink-primary shadow-sm'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </motion.div>

            <div className="mt-8 rounded-xl border border-border-hairline bg-surface-canvas p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4 text-xs text-ink-muted">
                <span>Sample report: B2B Cold-Chain Compliance SaaS (India)</span>
                <span>Not a live generated user report</span>
              </div>

              {activeTab === 'Summary' && (
                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-lg font-semibold text-ink-primary">
                      Executive Summary (Sample)
                    </h3>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      The proposed platform targets mid-tier perishable warehouse operators in India
                      facing manual temperature-log audits.{' '}
                      <span className="font-medium text-semantic-success">
                        [Verified research]
                      </span>{' '}
                      Cold-chain logistics capacity is expanding alongside pharma and quick-commerce
                      distribution.{' '}
                      <span className="font-medium text-brand-secondary">
                        [AI interpretation]
                      </span>{' '}
                      Focusing on compliance automation lowers switching friction compared to full
                      ERP replacement.
                    </p>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      <span className="font-medium text-brand-accent">[User assumption]</span>{' '}
                      Target pricing of ₹4,500/month per facility requires validation against
                      incumbent IoT dashboard bundles.
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-subtle p-5 border border-border-hairline space-y-3">
                    <p className="text-xs font-semibold text-ink-primary">Evidence Breakdown</p>
                    <div className="space-y-2 text-xs text-ink-secondary">
                      <div className="flex justify-between">
                        <span>Verified research</span>
                        <span className="font-mono font-medium text-semantic-success">9 sources</span>
                      </div>
                      <div className="flex justify-between">
                        <span>AI interpretation</span>
                        <span className="font-mono font-medium text-brand-secondary">6 insights</span>
                      </div>
                      <div className="flex justify-between">
                        <span>User assumptions</span>
                        <span className="font-mono font-medium text-brand-accent">5 inputs</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Unverified claims</span>
                        <span className="font-mono font-medium text-semantic-warning">2 flagged</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'SWOT' && (
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    {
                      heading: 'Strengths (AI interpretation)',
                      points: [
                        'Lightweight compliance workflow avoids heavy ERP migration.',
                        'Clear ROI tie-in to spoilage penalty reduction.',
                      ],
                    },
                    {
                      heading: 'Weaknesses (User assumption / Unverified)',
                      points: [
                        'Hardware sensor integration effort across legacy cold rooms is unverified.',
                        'Single-founder engineering capacity during field pilots.',
                      ],
                    },
                    {
                      heading: 'Opportunities (Verified research)',
                      points: [
                        'Quick-commerce dark-store expansion in Tier-1/Tier-2 cities.',
                        'Stricter FSSAI and pharma cold-chain audit trails.',
                      ],
                    },
                    {
                      heading: 'Threats (AI interpretation)',
                      points: [
                        'Existing hardware vendors bundling free monitoring software.',
                        'Long B2B procurement cycles with regional distributors.',
                      ],
                    },
                  ].map((quad) => (
                    <div
                      key={quad.heading}
                      className="rounded-lg bg-surface-subtle p-5 border border-border-hairline"
                    >
                      <h3 className="text-sm font-semibold text-ink-primary">{quad.heading}</h3>
                      <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
                        {quad.points.map((pt) => (
                          <li key={pt} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0" />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'Scores' && (
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {SAMPLE_SCORES.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg bg-surface-subtle p-4 border border-border-hairline"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-ink-primary">{item.label}</span>
                          <span className="font-mono font-semibold text-brand-primary tabular-nums">
                            {item.value.toFixed(1)} / 10
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border-hairline">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${item.value * 10}%` }}
                            viewport={VIEWPORT_ONCE}
                            transition={{
                              duration: reducedMotion ? 0 : 0.7,
                              ease: MOTION_EASE,
                            }}
                            className="h-full rounded-full bg-brand-primary"
                          />
                        </div>
                        <p className="mt-2 text-xs text-ink-secondary">{item.note}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-ink-muted">
                    Disclaimer: Scores assess how well-defined and evidenced the idea is. They do
                    not predict business success.
                  </p>
                </div>
              )}

              {activeTab === 'Roadmap' && (
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {[
                    {
                      window: 'Days 1–30 · Discovery',
                      items: [
                        'Interview 15 cold-storage facility managers on audit pain.',
                        'Verify willingness to pay ₹4,500/month without bundled sensors.',
                      ],
                    },
                    {
                      window: 'Days 31–60 · Pilot MVP',
                      items: [
                        'Ship CSV + WhatsApp temperature alert prototype for 2 pilot sites.',
                        'Measure weekly operator log completion rate.',
                      ],
                    },
                    {
                      window: 'Days 61–90 · Commercialization',
                      items: [
                        'Convert pilot facilities to paid annual compliance contracts.',
                        'Standardize onboarding playbook for regional distributors.',
                      ],
                    },
                  ].map((phase) => (
                    <div
                      key={phase.window}
                      className="rounded-lg bg-surface-subtle p-5 border border-border-hairline"
                    >
                      <h3 className="text-sm font-semibold text-ink-primary">{phase.window}</h3>
                      <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
                        {phase.items.map((it) => (
                          <li key={it} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" aria-hidden="true" />
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 6. Startup Management Features */}
        <section className="border-t border-border-hairline bg-surface-subtle py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <motion.div
              {...getRevealProps(reducedMotion)}
              className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12"
            >
              <div className="lg:col-span-5">
                <p className="text-sm font-medium text-brand-secondary">Beyond validation</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
                  One connected startup workspace
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-secondary sm:text-base">
                  Keep your startups, ideas, research sources, financial models, leads, and tasks
                  in a single source of truth—built phase by phase with zero fabricated metrics.
                </p>
                <div className="mt-6">
                  <Link
                    to={primaryHref}
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors active:scale-[0.98]"
                  >
                    Start Your Free Workspace
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Briefcase,
                    title: 'Startup & Idea Workspace',
                    status: 'Available in Phase 1',
                    desc: 'Organize multiple startups, save 5-step idea drafts automatically, and manage founder settings.',
                  },
                  {
                    icon: BookOpen,
                    title: 'AI Validation & PDF Reports',
                    status: 'Phase 2 rollout',
                    desc: 'Structured 18-section reports, semantic similarity checks, and cited source exports.',
                  },
                  {
                    icon: BarChart3,
                    title: 'Finance, Competitors & Personas',
                    status: 'Phase 3 rollout',
                    desc: 'Deterministic 12-month cash flow, editable competitor tables, and buyer hypotheses.',
                  },
                  {
                    icon: Layers,
                    title: 'Leads, Tasks & Expenses',
                    status: 'Phase 4–5 rollout',
                    desc: 'Kanban pipeline with CSV import, 30/60/90-day tasks, and budget-vs-actual analytics.',
                  },
                ].map((mod) => {
                  const Icon = mod.icon;
                  return (
                    <div
                      key={mod.title}
                      className="rounded-xl border border-border-hairline bg-surface-canvas p-5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Icon className="h-5 w-5 text-brand-primary" aria-hidden="true" />
                        <span className="text-xs font-medium text-ink-muted">{mod.status}</span>
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-ink-primary">{mod.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
                        {mod.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* 7. Pricing (read from DB config) */}
        <section id="pricing" className="border-t border-border-hairline py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <motion.div {...getRevealProps(reducedMotion)} className="text-center max-w-2xl mx-auto">
              <p className="text-sm font-medium text-brand-primary">Transparent INR pricing</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
                Free workspace. Pay per validation report.
              </h2>
              <p className="mt-3 text-sm text-ink-secondary sm:text-base">
                No recurring SaaS lock-in. Manage your startups and ideas for free, and choose a
                report tier only when you want AI validation.
              </p>
            </motion.div>

            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {plansLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-80 rounded-xl border border-border-hairline bg-surface-subtle animate-pulse"
                  />
                ))
              ) : plans.length > 0 ? (
                plans.map((plan, idx) => (
                  <motion.div
                    key={plan.id}
                    {...getRevealProps(reducedMotion, idx * MOTION_STAGGER.cards)}
                    className={`rounded-xl border p-6 sm:p-8 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 ${
                      plan.isRecommended
                        ? 'border-brand-primary bg-surface-canvas shadow-md'
                        : 'border-border-hairline bg-surface-canvas hover:shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-lg font-semibold text-ink-primary">{plan.name}</h3>
                        {plan.isRecommended && (
                          <span className="text-xs font-semibold text-brand-primary">
                            Recommended
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="font-display text-3xl font-bold text-ink-primary tabular-nums">
                          ₹{plan.priceInr}
                        </span>
                        <span className="text-sm text-ink-muted">/ report</span>
                      </div>

                      <p className="mt-3 text-sm text-ink-secondary">{plan.description}</p>

                      <ul className="mt-6 space-y-3 border-t border-border-hairline pt-6 text-sm text-ink-secondary">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5">
                            <Check
                              className="h-4 w-4 text-brand-primary shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(user ? '/ideas/new' : '/register')}
                      className={`mt-8 w-full h-11 rounded-lg px-4 text-sm font-medium transition-colors active:scale-[0.98] ${
                        plan.isRecommended
                          ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                          : 'border border-border-hairline bg-surface-canvas text-ink-primary hover:bg-surface-subtle'
                      }`}
                    >
                      {user ? 'Start Idea Draft' : `Choose ${plan.name}`}
                    </button>
                  </motion.div>
                ))
              ) : (
                <div className="lg:col-span-3 text-center text-sm text-ink-secondary">
                  Pricing tiers could not be loaded. Please check the backend API connection.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 8. FAQ */}
        <section className="border-t border-border-hairline bg-surface-subtle py-20">
          <div className="mx-auto max-w-[820px] px-6">
            <motion.div {...getRevealProps(reducedMotion)} className="text-center">
              <p className="text-sm font-medium text-brand-secondary">FAQ</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
                Common questions from founders
              </h2>
            </motion.div>

            <div className="mt-10 divide-y divide-border-hairline rounded-xl border border-border-hairline bg-surface-canvas">
              {FAQS.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={faq.question} className="px-6 py-4">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="flex w-full min-h-[44px] items-center justify-between gap-4 text-left text-sm font-semibold text-ink-primary sm:text-base focus-visible:outline-2 focus-visible:outline-brand-primary rounded"
                    >
                      <span>{faq.question}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-ink-muted shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <motion.div
                        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, ease: MOTION_EASE }}
                        className="pb-2 pt-2 text-sm leading-relaxed text-ink-secondary"
                      >
                        {faq.answer}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
