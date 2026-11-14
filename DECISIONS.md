# Engineering Decisions (DECISIONS.md)

## 1. Runtime Stack Adaptation for AI Studio Environment
- **Context**: The specification mentions Next.js + Python/FastAPI + PostgreSQL (`pgvector`), while this AI Studio execution container runs a single Node.js v22 runtime on port 3000 with React + Vite + Express (`tsx server.ts`).
- **Decision**: Implemented a unified full-stack TypeScript architecture using React 19 + Vite (frontend) and Express 4 (`server/app.ts`) + `better-sqlite3` (backend) on port 3000.
- **Rationale**: Allows the full application—including real SQL migrations, httpOnly cookie auth, rate limiting, and typed APIs—to boot, run, and pass live tests immediately without Docker or external database provisioning. Shared Zod schemas in `src/shared/schemas.ts` keep client and server validation strictly synchronized.

## 2. Database & Migration Strategy
- **Decision**: All tables (`users`, `refresh_tokens`, `password_reset_tokens`, `startups`, `ideas`, `report_plans`, `contact_messages`, `audit_logs`) are created and evolved through versioned SQL migrations in `server/migrations.ts` tracked by `schema_migrations`, with `PRAGMA foreign_keys = ON` and composite indexes on `(user_id, created_at)`.
- **Plans Seeding**: `report_plans` is seeded idempotently on first boot with Basic (₹49), Full (₹149, recommended), and Advanced (₹299) so pricing is DB-driven and editable without code changes.

## 3. Cookie Security Across Localhost and Iframe Previews
- **Decision**: Auth cookies (`vp_access_token`, `vp_refresh_token`) are always `httpOnly`. When served over HTTPS (such as the AI Studio preview iframe), `Secure` and `SameSite=None` are applied; on local HTTP `localhost`, `SameSite=Lax` is used so browsers accept and attach cookies cleanly in both contexts.

## 4. Typography & Visual System
- **Decision**: Defined `#5B21B6` (primary deep purple), `#4F46E5` (secondary indigo), `#2563EB` (accent blue), `#FFFFFF`, and `#F8F9FB` as Tailwind v4 `@theme` tokens in `src/index.css`. Used `Plus Jakarta Sans` for display headings, `DM Sans` for body copy, and `JetBrains Mono` (`tabular-nums`) for numeric telemetry.

## 5. Phase 1 Feature Boundaries ("Nothing Fake")
- **Decision**: Unbuilt Phase 2–6 modules (AI Validation Reports, Market Research, Competitors, Financial Planning, Personas, Leads, Marketing, Sales, Tasks, Expenses, Razorpay Checkout) are omitted from active navigation or placed inside a collapsed "Coming in later phases" sidebar disclosure. Idea Detail clearly explains that AI Validation activates in Phase 2 rather than simulating output.

## 6. Explicit Demo Seed Account (`npm run seed`)
- **Decision**: Added `server/seed.ts` invoked explicitly via `npm run seed` (never auto-seeded on boot or exposed in frontend code) so presenters have real database rows without introducing fake UI mock data.
- **Credentials**:
  - **Email**: `demo@venturepilot.test`
  - **Password**: `Vp#Demo2026!Founder94`
  - **Seeded Data**: 1 startup (`FreshGrid ColdChain`) and 2 submitted ideas (`Automated FSSAI Cold-Chain Logbook`, `B2B Perishable Dispatch Slot Optimizer`).

## 7. Phase 2 Free-Tier Model Selection, Startup Discovery & Local Embedding Fallback
- **Context**: Phase 2 requires text generation and semantic embeddings that work reliably on a free Gemini API key without paid-only models (`Pro`, `Argon`, `Carbon`) or heavy Python/ONNX binaries.
- **Decision**:
  - Configurable defaults in `.env.example` and `server/config.ts`: `LLM_MODEL="gemini-2.5-flash"` and `EMBEDDING_MODEL="gemini-embedding-001"`.
  - Startup check (`runGeminiStartupCheck()` in `server/services/llmClient.ts`) queries `ai.models.list()`, excludes Pro/paid-only models, and automatically picks the newest accessible Flash model if the configured `LLM_MODEL` is unavailable or rejected.
  - Embeddings try the accessible free Gemini embedding model first and automatically fall back to a zero-dependency deterministic local feature-hashing vector (`local-hash-256` in `server/services/embeddings.ts`) if no free embedding model is accessible.
  - Rate limits (`429` / `RESOURCE_EXHAUSTED`) wait briefly (`retryDelay` or 3s) and perform 1 automatic retry before surfacing a readable retry message.

## 8. Phase 2 Validation Pipeline, Anti-Hallucination & PDF Export
- **Structured JSON & Retry-Once Repair**: `server/services/llmClient.ts` validates Gemini's 18-section (`A–R`), 6-score output against `validationReportJsonSchema` (Zod). On invalid JSON or schema mismatch, it automatically triggers 1 repair retry containing the exact validation error before failing the job with a readable `jobError` and free Retry button.
- **Evidence & Research Grounding**: Every claim carries one of `Verified research`, `AI interpretation`, `User assumption`, or `Unverified`. Claims tagged `Verified research` without a valid saved `sourceId` (or when `researchMode === 'none'`) are automatically downgraded to `Unverified`.
- **Research Modes**: Uses live Perplexity Sonar citations when `SONAR_API_KEY` is set; uses clearly badged `DEMO DATA` sample sources (`is_demo = 1`) when `DEMO_MODE=true` and no Sonar key is present; otherwise records `Not configured` and creates no fake statistics.
- **PDF Generation**: Implemented server-side with `pdfkit` (`GET /api/v1/reports/:id/pdf`) outputting VenturePilot AI branding, fixed scoring disclaimer, 6 scores, all 18 sections, evidence labels, and source URLs with retrieval dates.

## 9. Phase 3a: Deterministic Financial Planner & Customer Personas
- **Server-Only Financial Math**: All unit economics, 3-scenario projections (`conservative`, `expected`, `optimistic` with adjustable multipliers), break-even units/revenue, 12-month cash flow, runway, and edge-case warnings (zero price, variable cost >= selling price, zero burn, zero initial investment with burn) are computed strictly in `server/services/financeCalculator.ts`. Gemini never computes or modifies numbers; it receives the server-computed values to produce an optional plain-language `"AI interpretation"` (`null` when Gemini is not configured).
- **Customer Personas**: `server/services/personasAi.ts` generates structured buyer personas via free-tier Flash Gemini with one automatic JSON repair retry (`503 LLM_NOT_CONFIGURED` if no key is set) and attaches the fixed disclaimer `"AI-generated hypothesis: validate through real customer research."` to every saved record and UI view.

## 10. Phase 3b: Market Research & Competitor Analysis
- **Source Modes & No-Fabrication Guard**: Both `/research` and `/competitors` share `getResearchModeConfigStatus` and `fetchPhase3bSources` (`server/services/phase3bResearch.ts`):
  - `SONAR_API_KEY` set -> live Perplexity Sonar citations with saved URL, title, and retrieval timestamp.
  - `DEMO_MODE=true` without `SONAR_API_KEY` -> clearly badged `[DEMO DATA]` sample sources (`isDemo: true`).
  - Neither configured -> displays `"Not configured"` with setup steps, saves zero fabricated claims (`status: 'not_configured'` on `/research`), and returns `503 RESEARCH_NOT_CONFIGURED` on `/competitors/discover`.
- **Evidence Downgrade & TAM/SAM/SOM Rule**: `enforceMarketResearchGrounding` downgrades any `'Verified research'` claim lacking a valid `sourceId` (or in `'none'` mode) to `'Unverified'`, and replaces any `TAM`/`SAM`/`SOM` value lacking supporting numeric evidence from a live Sonar source with `"Not enough reliable data found"`.
- **Competitors Matrix & Differentiation**: Manual CRUD remains available regardless of research configuration. Differentiation opportunities (`POST /api/v1/competitors/differentiate`) are persisted per user and tagged `"AI interpretation"`.

## 11. Phase 4: Leads & Pipeline, Marketing Strategy, and Sales Assistant
- **Leads & CSV Injection Protection**: Leads, timeline notes (`lead_notes`), and Kanban stages (`New`, `Contacted`, `Interested`, `Qualified`, `Converted`, `Lost`) are stored in SQLite with strict user ownership (`404` across users). CSV imports enforce a 2 MB byte limit and 500-row limit, render a column-mapped preview, report per-row errors, and neutralize cells starting with `=`, `+`, `-`, or `@` (`sanitizeCsvImportCell`) while CSV exports (`GET /api/v1/leads/export.csv`) apply OWASP `'` prefix escaping (`formatCsvExportCell`). No external scraping or private contact lookup is performed.
- **Kanban Optimistic Moves & Rollback**: Drag-and-drop and the accessible `"Move to..."` selector apply optimistic UI stage updates immediately, persist via `PATCH /api/v1/leads/:id/stage`, and roll back cleanly if the server request fails.
- **Marketing Strategy Budget Verification**: `classifyBudgetTier` segments budgets into `low` (`< ₹50,000`), `medium` (`₹50,000–₹3,00,000`), and `high` (`> ₹3,00,000`). `verifyAndNormalizeBudgetAllocation` rejects zero/negative/non-finite allocations and deterministically reconciles rounding drift so percentages always sum to `100` and currency amounts sum exactly to `budget`. Every generated/saved campaign is labelled `"AI interpretation"`.
- **Sales Assistant Draft Safety**: Outreach and follow-up drafts are generated as editable playbooks (`sales_playbooks`) with Copy and Save controls and an explicit visible notice confirming drafts are never sent automatically.

