# VenturePilot AI — API Reference (`/api/v1`)

All endpoints return JSON. Error responses follow a consistent envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {}
  }
}
```

## Health & System
- `GET /api/v1/health` — Returns `{ ok: true, service: "venturepilot-api", phase: "4" }`.
- `GET /api/v1/system/status` — Returns configuration & reachability status for Database, Auth, LLM, Sonar, Embeddings, Razorpay, Webhook Secret, and SMTP Email without exposing secrets.

## Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Creates user (`fullName`, `email`, `password` min 8 chars), sets `httpOnly` access + refresh cookies. Rate-limited.
- `POST /api/v1/auth/login` — Verifies credentials, sets `httpOnly` access + refresh cookies, writes audit log. Rate-limited.
- `POST /api/v1/auth/refresh` — Rotates refresh token and issues a fresh access cookie.
- `POST /api/v1/auth/logout` — Revokes refresh token and clears auth cookies.
- `POST /api/v1/auth/forgot-password` — Generates single-use 30-min reset token (stored SHA-256 hashed). Logs reset URL in dev console if SMTP is unconfigured. Rate-limited.
- `POST /api/v1/auth/reset-password` — Consumes token once, updates password hash, revokes existing refresh tokens.

## Users (`/api/v1/users`) — Auth Required
- `GET /api/v1/users/me` — Returns current authenticated user profile.
- `PATCH /api/v1/users/me` — Updates `fullName`, `role`, `timezone`, and optionally changes password (requires `currentPassword`).

## Dashboard (`/api/v1/dashboard`) — Auth Required
- `GET /api/v1/dashboard` — Returns real DB counts (`totalIdeas`, `submittedIdeas`, `draftIdeas`, `activeStartups`, `completedReports`, `savedFinancialPlans`, `savedPersonas`, `savedResearchRuns`, `savedCompetitors`, `totalLeads`, `leadConversionRate`, `leadsByStage`, `savedMarketingCampaigns`, `savedSalesPlaybooks`), `financialOverview`, `recentIdeas`, `recentStartups`, and `recentReports`.

## Startups (`/api/v1/startups`) — Auth Required
- `GET /api/v1/startups?limit=50&offset=0` — Paginated list of startups owned by current user.
- `POST /api/v1/startups` — Create startup.
- `GET /api/v1/startups/:id` — Get startup by ID (returns `404` if not owned by user).
- `PATCH /api/v1/startups/:id` — Update startup (returns `404` if not owned).
- `DELETE /api/v1/startups/:id` — Delete startup and write audit log (returns `404` if not owned).

## Ideas (`/api/v1/ideas`) — Auth Required
- `GET /api/v1/ideas?status=draft|submitted&limit=50&offset=0` — Paginated list of user's ideas.
- `POST /api/v1/ideas` — Create a new idea draft.
- `GET /api/v1/ideas/:id` — Fetch idea draft or submitted idea (returns `404` if not owned).
- `PATCH /api/v1/ideas/:id` — Autosave draft fields and `currentStep` (returns `404` if not owned).
- `POST /api/v1/ideas/:id/submit` — Validates full 5-step schema with Zod and transitions status to `submitted`.
- `DELETE /api/v1/ideas/:id` — Delete idea and write audit log (returns `404` if not owned).

## Validation Reports (`/api/v1/reports`) — Auth Required (Phase 2)
- `GET /api/v1/reports?ideaId=...&status=...&limit=50&offset=0` — Paginated list of user's validation reports.
- `POST /api/v1/reports/generate` — Queues and runs the 8-step validation pipeline for `{ ideaId, planSlug? }`. Returns `503 LLM_NOT_CONFIGURED` with setup steps if `GEMINI_API_KEY` is missing; returns `202` with report job otherwise. Rate-limited.
- `GET /api/v1/reports/:id` — Fetch full report progress, extracted concepts, per-user similar ideas, research sources, and validated 18-section report JSON (`404` if not owned).
- `POST /api/v1/reports/:id/retry` — Free retry for `failed` validation reports (`404` if not owned).
- `GET /api/v1/reports/:id/pdf` — Generates and streams a branded `application/pdf` document containing all 18 sections, 6 scores, disclaimer, evidence labels, and citations (`404` if not owned).
- `DELETE /api/v1/reports/:id` — Delete report and write audit log (`404` if not owned).

## Financial Planner (`/api/v1/finance`) — Auth Required (Phase 3a)
- `GET /api/v1/finance` — List saved financial plans owned by the user.
- `POST /api/v1/finance/calculate` — Deterministic server-side calculation across `conservative`, `expected`, and `optimistic` scenarios (revenue, total expenses, contribution margin, gross profit, operating profit, break-even units & revenue, 12-month cash flow, runway, and edge-case warnings) without saving or calling AI.
- `POST /api/v1/finance` — Compute deterministically on server, optionally attach Gemini plain-language `AI interpretation` (returns `null` if Gemini is unconfigured), and save plan (`404` if linked `startupId`/`ideaId` is not owned).
- `GET /api/v1/finance/:id` — Fetch saved financial plan (`404` if not owned).
- `PATCH /api/v1/finance/:id` — Recompute deterministically, refresh AI interpretation if configured, and update saved plan (`404` if not owned).
- `DELETE /api/v1/finance/:id` — Delete saved financial plan (`404` if not owned).

## Customer Personas (`/api/v1/personas`) — Auth Required (Phase 3a)
- `GET /api/v1/personas` — List saved customer personas owned by the user.
- `POST /api/v1/personas/generate` — Generate structured persona (`segment`, `needs`, `painPoints`, `motivations`, `objections`, `preferredChannels`, `purchaseConsiderations`) via Gemini with mandatory hypothesis disclaimer (`503 LLM_NOT_CONFIGURED` if Gemini is unconfigured; `404` if linked `ideaId` is not owned). Rate-limited.
- `GET /api/v1/personas/:id` — Fetch saved customer persona (`404` if not owned).
- `PATCH /api/v1/personas/:id` — Edit saved customer persona (`404` if not owned).
- `DELETE /api/v1/personas/:id` — Delete saved customer persona (`404` if not owned).

## Market Research (`/api/v1/research`) — Auth Required (Phase 3b)
- `GET /api/v1/research` — List saved market research runs owned by the user plus active `sourceStatus` (`Configured` / `Demo data` / `Not configured`).
- `POST /api/v1/research` — Run market research for `{ industry, businessCategory, targetCustomer, location, productOrService, ideaId? }`. Uses Perplexity Sonar when `SONAR_API_KEY` is set, clearly badged `DEMO DATA` sources when `DEMO_MODE=true`, or saves a `not_configured` run with setup steps and zero fake claims when neither is set. Enforces claim evidence labels and replaces unsupported TAM/SAM/SOM with `"Not enough reliable data found"`.
- `GET /api/v1/research/:id` — Reopen a saved research run (`404` if not owned).
- `DELETE /api/v1/research/:id` — Delete a saved research run (`404` if not owned).

## Competitor Analysis (`/api/v1/competitors`) — Auth Required (Phase 3b)
- `GET /api/v1/competitors` — List saved competitors, saved AI differentiation opportunities, and active `sourceStatus`.
- `POST /api/v1/competitors` — Add a competitor manually (`name`, `website`, `description`, `pricing`, `features`, `strengths`, `weaknesses`, `notes`, `sourceUrl`, `researchedDate`, `sourceType`).
- `GET /api/v1/competitors/:id` — Get competitor by ID (`404` if not owned).
- `PATCH /api/v1/competitors/:id` — Edit competitor (`404` if not owned).
- `DELETE /api/v1/competitors/:id` — Delete competitor (`404` if not owned).
- `POST /api/v1/competitors/discover` — Discover competitors using the same source modes as research (`503 RESEARCH_NOT_CONFIGURED` with setup steps when neither `SONAR_API_KEY` nor `DEMO_MODE=true` is set). Rate-limited.
- `POST /api/v1/competitors/differentiate` — Generate differentiation opportunities from saved competitors, labelled `"AI interpretation"`. Rate-limited.

## Leads & Pipeline (`/api/v1/leads`) — Auth Required (Phase 4)
- `GET /api/v1/leads` — List leads owned by user (optional `search`, `status`, `source` query filters), available sources, and real stage totals + conversion rate.
- `POST /api/v1/leads` — Add a lead manually (`404` if linked `ideaId` is not owned).
- `POST /api/v1/leads/import` — Import CSV leads with 2 MB size limit, 500-row limit, column mapping, CSV formula-injection neutralization (`=`, `+`, `-`, `@`), and per-row error report.
- `GET /api/v1/leads/export.csv` — Export user's leads as CSV with OWASP formula-injection escaping.
- `GET /api/v1/leads/:id` — Fetch lead details and notes timeline (`404` if not owned).
- `PATCH /api/v1/leads/:id` — Edit lead details (`404` if not owned).
- `PATCH /api/v1/leads/:id/stage` — Move lead stage (`New`, `Contacted`, `Interested`, `Qualified`, `Converted`, `Lost`) and return updated summary (`404` if not owned).
- `DELETE /api/v1/leads/:id` — Delete lead (`404` if not owned).
- `POST /api/v1/leads/:id/notes` — Add a note to the lead's timeline (`404` if not owned).
- `DELETE /api/v1/leads/:id/notes/:noteId` — Delete a timeline note (`404` if not owned).

## Marketing Strategy (`/api/v1/marketing`) — Auth Required (Phase 4)
- `GET /api/v1/marketing` — List saved marketing campaigns owned by user.
- `POST /api/v1/marketing/generate` — Generate budget-tiered (`low`, `medium`, `high`) marketing strategy via Gemini Flash with deterministic verification that budget allocation percentages sum to 100% and amounts sum to budget, labelled `"AI interpretation"`. Rate-limited.
- `GET /api/v1/marketing/:id` — Fetch saved campaign (`404` if not owned).
- `PATCH /api/v1/marketing/:id` — Edit saved campaign and re-verify budget allocation (`404` if not owned).
- `DELETE /api/v1/marketing/:id` — Delete saved campaign (`404` if not owned).

## Sales Assistant (`/api/v1/sales`) — Auth Required (Phase 4)
- `GET /api/v1/sales` — List saved sales playbooks owned by user plus non-sending safety notice.
- `POST /api/v1/sales/generate` — Generate editable sales strategy, pitch, positioning, pricing suggestions, funnel recommendations, outreach drafts, and follow-up drafts (never auto-sent). Rate-limited.
- `GET /api/v1/sales/:id` — Fetch saved playbook (`404` if not owned).
- `PATCH /api/v1/sales/:id` — Save edits to playbook and drafts (`404` if not owned).
- `DELETE /api/v1/sales/:id` — Delete saved playbook (`404` if not owned).

## Public Data
- `GET /api/v1/plans` — Lists active report pricing tiers from `report_plans`.
- `POST /api/v1/contact` — Validates and saves contact message to `contact_messages`. Rate-limited.
