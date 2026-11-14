# VenturePilot AI (Phases 1–4)

Turn a business idea into a validated, structured, actionable startup plan.

## Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Framer Motion (`motion/react`), Recharts, React Hook Form + Zod, Lucide Icons
- **Backend**: Node.js 22, Express, TypeScript (`tsx`), Zod, JWT (`httpOnly` cookies + Bearer fallback), `bcryptjs`, `@google/genai`, `pdfkit`
- **Database**: SQLite (`better-sqlite3`) with foreign keys enabled and versioned migrations (`server/migrations.ts`)

## Quick Start (< 5 minutes)
1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Configure environment** (set `GEMINI_API_KEY` in AI Studio Secrets or `.env` for Phase 2/3 AI features, and optionally `SONAR_API_KEY` or `DEMO_MODE=true` for market/competitor citations):
   ```bash
   cp .env.example .env
   ```
3. **Run the development server** (mounts Vite + Express API on port `3000`):
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

## Running Checks & Tests
- **Seed demo account**: `npm run seed` (creates `demo@venturepilot.test` with 1 startup and 2 submitted ideas; password printed to server console and `DECISIONS.md`)
- **Type check**: `npm run lint`
- **Production frontend build**: `npm run build`
- **Automated API & Security tests**: `npm test`
- **Live end-to-end smoke check**: `npm run smoke` (logs in as demo founder, runs live report generation + PDF export, tests Financial Planner save/dashboard/edit/delete, Customer Personas generate/edit/delete, Market Research run/reopen/delete, Competitor Analysis CRUD/differentiation/discovery check, Leads CRUD/notes/stage move/CSV formula guard/export, Marketing Strategy generate/budget-100%/edit/delete, and Sales Assistant generate/notice/edit/delete)

## Included Scope (Phases 1–4)
- **Public Pages**: Landing, About, Features, How It Works, Pricing (from `report_plans` DB table), Contact (saved to `contact_messages`), Terms, Privacy, Refund Policy, Integration Status.
- **Auth & Security**: Registration, login, logout, refresh token rotation, forgot/reset password (single-use expiring token), `httpOnly` cookie auth + in-memory Bearer fallback, ownership isolation (`404` on cross-user access), rate limiting, audit logs.
- **Authenticated Workspace**: Dashboard (`GET /api/v1/dashboard` with real Financial Overview and real Lead stage counts), Startups CRUD, 5-Step Idea Submission Form with debounced backend autosave & draft restoration, Ideas list, Validation Reports (`/reports`, `/reports/:id`) with 18 sections, 6 scores, evidence labels, per-user cosine similarity, free failed-job retry, and `pdfkit` PDF export, Financial Planner (`/finance`), Customer Personas (`/personas`), Market Research (`/research`), Competitor Analysis (`/competitors`), Leads & Kanban Pipeline (`/leads`) with notes timeline & 2 MB formula-guarded CSV import/export, Marketing Strategy (`/marketing`) with budget-tiered plans & verified 100% allocation splits, and Sales Assistant (`/sales`) with editable copy/save playbooks and no auto-sending.
