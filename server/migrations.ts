import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_phase1_foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Founder',
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, created_at);

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id, created_at);

      CREATE TABLE IF NOT EXISTS startups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        tagline TEXT NOT NULL DEFAULT '',
        industry TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('idea', 'mvp', 'early_revenue', 'growth')),
        location TEXT NOT NULL DEFAULT 'India',
        website TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_startups_user_created ON startups(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        startup_id TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')) DEFAULT 'draft',
        current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 6),
        business_details_json TEXT NOT NULL DEFAULT '{}',
        problem_solution_json TEXT NOT NULL DEFAULT '{}',
        target_customer_json TEXT NOT NULL DEFAULT '{}',
        financials_json TEXT NOT NULL DEFAULT '{}',
        competitors_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (startup_id) REFERENCES startups(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ideas_user_created ON ideas(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ideas_startup ON ideas(startup_id);

      CREATE TABLE IF NOT EXISTS report_plans (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
        currency TEXT NOT NULL DEFAULT 'INR',
        description TEXT NOT NULL,
        features_json TEXT NOT NULL,
        is_recommended INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contact_messages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('new', 'read', 'replied')) DEFAULT 'new',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        ip_address TEXT NOT NULL DEFAULT '',
        request_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
    `,
  },
  {
    id: '002_phase2_validation_reports',
    sql: `
      ALTER TABLE ideas ADD COLUMN embedding_json TEXT;
      ALTER TABLE ideas ADD COLUMN concepts_json TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')) DEFAULT 'queued',
        progress_step INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 8,
        progress_label TEXT NOT NULL DEFAULT 'Queued',
        progress_log_json TEXT NOT NULL DEFAULT '[]',
        concepts_json TEXT NOT NULL DEFAULT '[]',
        similar_ideas_json TEXT NOT NULL DEFAULT '[]',
        research_mode TEXT NOT NULL DEFAULT 'none' CHECK (research_mode IN ('sonar', 'demo', 'none')),
        report_json TEXT,
        job_error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES report_plans(id)
      );
      CREATE INDEX IF NOT EXISTS idx_reports_user_created ON reports(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reports_idea ON reports(idea_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS research_sources (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        report_id TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        query TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        snippet TEXT NOT NULL,
        retrieved_at TEXT NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_research_sources_report ON research_sources(report_id);
      CREATE INDEX IF NOT EXISTS idx_research_sources_user_created ON research_sources(user_id, created_at DESC);
    `,
  },
  {
    id: '003_phase3a_finance_personas',
    sql: `
      CREATE TABLE IF NOT EXISTS financial_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        startup_id TEXT,
        idea_id TEXT,
        name TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        computed_json TEXT NOT NULL,
        ai_interpretation TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (startup_id) REFERENCES startups(id) ON DELETE SET NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_financial_plans_user_created ON financial_plans(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS customer_personas (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        name TEXT NOT NULL,
        idea_summary TEXT NOT NULL,
        industry TEXT NOT NULL,
        product TEXT NOT NULL,
        location TEXT NOT NULL,
        problem TEXT NOT NULL,
        segment TEXT NOT NULL,
        needs_json TEXT NOT NULL,
        pain_points_json TEXT NOT NULL,
        motivations_json TEXT NOT NULL,
        objections_json TEXT NOT NULL,
        preferred_channels_json TEXT NOT NULL,
        purchase_considerations_json TEXT NOT NULL,
        disclaimer TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_personas_user_created ON customer_personas(user_id, created_at DESC);
    `,
  },
  {
    id: '004_phase3b_research_competitors',
    sql: `
      CREATE TABLE IF NOT EXISTS market_research_runs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        industry TEXT NOT NULL,
        business_category TEXT NOT NULL,
        target_customer TEXT NOT NULL,
        location TEXT NOT NULL,
        product_or_service TEXT NOT NULL,
        research_mode TEXT NOT NULL CHECK (research_mode IN ('sonar', 'demo', 'none')),
        status TEXT NOT NULL CHECK (status IN ('completed', 'not_configured')),
        sources_json TEXT NOT NULL DEFAULT '[]',
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_market_research_user_created ON market_research_runs(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS competitors (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        name TEXT NOT NULL,
        website TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        pricing TEXT NOT NULL DEFAULT '',
        features_json TEXT NOT NULL DEFAULT '[]',
        strengths_json TEXT NOT NULL DEFAULT '[]',
        weaknesses_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        researched_date TEXT,
        source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'researched')) DEFAULT 'manual',
        is_demo INTEGER NOT NULL DEFAULT 0,
        evidence_label TEXT NOT NULL DEFAULT 'User assumption',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_competitors_user_created ON competitors(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS competitor_analyses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        opportunities_json TEXT NOT NULL,
        competitor_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `,
  },
  {
    id: '005_phase4_leads_marketing_sales',
    sql: `
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'Manual',
        status TEXT NOT NULL CHECK (status IN ('New', 'Contacted', 'Interested', 'Qualified', 'Converted', 'Lost')) DEFAULT 'New',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_leads_user_created ON leads(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_user_status ON leads(user_id, status);

      CREATE TABLE IF NOT EXISTS lead_notes (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        title TEXT NOT NULL,
        budget_tier TEXT NOT NULL CHECK (budget_tier IN ('low', 'medium', 'high')),
        inputs_json TEXT NOT NULL,
        strategy_json TEXT NOT NULL,
        evidence_label TEXT NOT NULL DEFAULT 'AI interpretation',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_user_created ON marketing_campaigns(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS sales_playbooks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        title TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        playbook_json TEXT NOT NULL,
        evidence_label TEXT NOT NULL DEFAULT 'AI interpretation',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sales_playbooks_user_created ON sales_playbooks(user_id, created_at DESC);
    `,
  },
  {
    id: '006_phase5_roadmap_tasks_expenses',
    sql: `
      CREATE TABLE IF NOT EXISTS roadmap_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        report_id TEXT,
        title TEXT NOT NULL,
        duration_days INTEGER NOT NULL CHECK (duration_days IN (30, 60, 90)),
        summary TEXT NOT NULL DEFAULT '',
        phases_json TEXT NOT NULL,
        key_risks_json TEXT NOT NULL DEFAULT '[]',
        evidence_label TEXT NOT NULL DEFAULT 'AI interpretation',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_roadmap_plans_user_created ON roadmap_plans(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idea_id TEXT,
        roadmap_plan_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
        start_date TEXT,
        due_date TEXT,
        status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'completed')) DEFAULT 'todo',
        notes TEXT NOT NULL DEFAULT '',
        expected_outcome TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL,
        FOREIGN KEY (roadmap_plan_id) REFERENCES roadmap_plans(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON tasks(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_due_date ON tasks(user_id, due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_roadmap ON tasks(roadmap_plan_id);

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        startup_id TEXT,
        amount REAL NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Other',
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (startup_id) REFERENCES startups(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_user_created ON expenses(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
      CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category);

      CREATE TABLE IF NOT EXISTS expense_budgets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        month TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, category, month)
      );
      CREATE INDEX IF NOT EXISTS idx_expense_budgets_user_month ON expense_budgets(user_id, month);
    `,
  },
];

function seedReportPlans(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM report_plans').get() as { cnt: number };
  if (count.cnt > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO report_plans (
      id, slug, name, price_inr, currency, description, features_json,
      is_recommended, sort_order, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const plans = [
    {
      slug: 'basic',
      name: 'Basic Validation',
      price_inr: 49,
      description: 'Quick sanity check on problem clarity, customer definition, and core risks.',
      features: [
        'Executive summary & idea breakdown',
        '6 structured validation scores with explanations',
        'SWOT analysis with evidence tags',
        'Top risks & immediate next checks',
      ],
      is_recommended: 0,
      sort_order: 1,
    },
    {
      slug: 'full',
      name: 'Full Validation',
      price_inr: 149,
      description: 'Complete 18-section validation report with cited market research and PDF export.',
      features: [
        'All 18 report sections (A to R)',
        'Cited market opportunity & competitor matrix',
        'Backend-verified financial feasibility check',
        '30-day & 90-day execution roadmap + PDF download',
      ],
      is_recommended: 1,
      sort_order: 2,
    },
    {
      slug: 'advanced',
      name: 'Advanced Deep-Dive',
      price_inr: 299,
      description: 'Extended competitor & market intelligence with deeper go-to-market analysis.',
      features: [
        'Everything in Full Validation',
        'Extended Sonar market & competitor citations',
        'Detailed customer acquisition & pricing strategy',
        'Extended 90-day milestone breakdown + PDF download',
      ],
      is_recommended: 0,
      sort_order: 3,
    },
  ];

  for (const plan of plans) {
    insert.run(
      crypto.randomUUID(),
      plan.slug,
      plan.name,
      plan.price_inr,
      'INR',
      plan.description,
      JSON.stringify(plan.features),
      plan.is_recommended,
      plan.sort_order,
      now,
      now,
    );
  }
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>).map(
      (r) => r.id,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.id)) {
      const tx = db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
          migration.id,
          new Date().toISOString(),
        );
      });
      tx();
    }
  }

  seedReportPlans(db);
}
