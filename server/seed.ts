import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { pathToFileURL } from 'node:url';
import { initDatabase } from './db.ts';

export const DEMO_EMAIL = 'demo@venturepilot.test';
export const DEMO_PASSWORD = 'Vp#Demo2026!Founder94';

export async function seedDemoAccount(db: Database.Database): Promise<{
  email: string;
  userId: string;
  startupId: string;
  ideaIds: string[];
}> {
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  let existingUser = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(DEMO_EMAIL) as { id: string } | undefined;

  let userId: string;
  if (!existingUser) {
    userId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, role, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      DEMO_EMAIL,
      passwordHash,
      'Aarav Mehta (Demo Founder)',
      'Founder',
      'Asia/Kolkata',
      now,
      now,
    );
  } else {
    userId = existingUser.id;
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      passwordHash,
      now,
      userId,
    );
  }

  let existingStartup = db
    .prepare('SELECT id FROM startups WHERE user_id = ? AND name = ?')
    .get(userId, 'FreshGrid ColdChain') as { id: string } | undefined;

  let startupId: string;
  if (!existingStartup) {
    startupId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO startups (id, user_id, name, tagline, industry, stage, location, website, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      startupId,
      userId,
      'FreshGrid ColdChain',
      'Automated cold-storage compliance & spoilage alerts for Indian distributors',
      'Logistics & Cold-Chain SaaS',
      'mvp',
      'Pune, India',
      'https://freshgrid.example.in',
      'Compliance and temperature excursion workflow software for regional dairy, pharma, and quick-commerce cold storage operators.',
      now,
      now,
    );
  } else {
    startupId = existingStartup.id;
  }

  const demoIdeas = [
    {
      title: 'Automated FSSAI Cold-Chain Logbook',
      businessDetails: {
        title: 'Automated FSSAI Cold-Chain Logbook',
        startupId,
        industry: 'Logistics & Cold-Chain SaaS',
        businessModel: 'saas',
        stage: 'mvp',
        oneLiner:
          'Cloud compliance logbook that replaces paper temperature sheets for regional cold storage operators.',
      },
      problemSolution: {
        problemStatement:
          'Mid-sized cold storage warehouses still record chamber temperatures manually on paper clipboards, leading to missed excursion alerts and failed FSSAI/pharma audits.',
        currentAlternatives: 'Paper clipboards, WhatsApp photos, and manual Excel sheets.',
        proposedSolution:
          'Ingest existing sensor/gateway readings and generate automated WhatsApp excursion alerts plus one-click monthly audit PDFs.',
        uniqueValueProposition:
          'Works with existing third-party temperature loggers without forcing hardware replacement.',
      },
      targetCustomer: {
        primarySegment: 'Regional cold-storage operators (5,000–25,000 sq ft) in Tier-1 & Tier-2 India',
        geography: 'India (Maharashtra, Gujarat, Karnataka)',
        customerPainLevel: 'high',
        willingnessToPay: '₹4,500 per warehouse per month',
      },
      financials: {
        initialCapitalInr: 600000,
        pricePerUnitInr: 4500,
        estimatedMonthlyCustomers: 20,
        monthlyBurnInr: 95000,
        revenueModelNotes: 'Monthly per-warehouse SaaS subscription plus ₹6,000 onboarding setup.',
      },
      competitors: {
        knownCompetitors: 'Hardware-bundled IoT dashboards (TagBox, Ecozen) and manual Excel logs.',
        unfairAdvantage: 'Hardware-agnostic integration and regional cold-chain distributor partnerships.',
      },
    },
    {
      title: 'B2B Perishable Dispatch Slot Optimizer',
      businessDetails: {
        title: 'B2B Perishable Dispatch Slot Optimizer',
        startupId,
        industry: 'Supply Chain Software',
        businessModel: 'b2b',
        stage: 'concept',
        oneLiner:
          'Dock-scheduling and pre-cooling verification tool for dairy and fresh-produce distribution hubs.',
      },
      problemSolution: {
        problemStatement:
          'Reefer trucks wait 90–150 minutes at regional mandi and distributor docks without pre-cooling verification, accelerating shelf-life loss.',
        currentAlternatives: 'Phone calls with dock supervisors and paper gate registers.',
        proposedSolution:
          'Self-serve dispatch slot booking linked with pre-cooling checklist sign-off before truck loading.',
        uniqueValueProposition:
          'Cuts loading bay dwell time and creates an auditable handoff timestamp between carrier and hub.',
      },
      targetCustomer: {
        primarySegment: 'Dairy cooperatives and regional fresh-produce aggregators',
        geography: 'Western & Southern India',
        customerPainLevel: 'medium',
        willingnessToPay: '₹8,000 per hub per month',
      },
      financials: {
        initialCapitalInr: 400000,
        pricePerUnitInr: 8000,
        estimatedMonthlyCustomers: 10,
        monthlyBurnInr: 70000,
        revenueModelNotes: 'Per-hub monthly SaaS license.',
      },
      competitors: {
        knownCompetitors: 'Generic yard-management ERPs and manual gate registers.',
        unfairAdvantage: 'Built specifically around perishable pre-cooling handoff rules.',
      },
    },
  ];

  const ideaIds: string[] = [];
  for (const item of demoIdeas) {
    const existingIdea = db
      .prepare('SELECT id FROM ideas WHERE user_id = ? AND title = ?')
      .get(userId, item.title) as { id: string } | undefined;

    if (!existingIdea) {
      const ideaId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO ideas (
          id, user_id, startup_id, title, status, current_step,
          business_details_json, problem_solution_json, target_customer_json,
          financials_json, competitors_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'submitted', 6, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        ideaId,
        userId,
        startupId,
        item.title,
        JSON.stringify(item.businessDetails),
        JSON.stringify(item.problemSolution),
        JSON.stringify(item.targetCustomer),
        JSON.stringify(item.financials),
        JSON.stringify(item.competitors),
        now,
        now,
      );
      ideaIds.push(ideaId);
    } else {
      ideaIds.push(existingIdea.id);
    }
  }

  return { email: DEMO_EMAIL, userId, startupId, ideaIds };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const db = initDatabase();
  seedDemoAccount(db)
    .then((result) => {
      console.log('[VenturePilot AI Seed] Demo account ready:');
      console.log(`  Email:    ${DEMO_EMAIL}`);
      console.log(`  Password: ${DEMO_PASSWORD}`);
      console.log(`  Startup:  1 (id=${result.startupId})`);
      console.log(`  Ideas:    ${result.ideaIds.length} submitted`);
    })
    .catch((err) => {
      console.error('[VenturePilot AI Seed] Failed:', err);
      process.exit(1);
    });
}
