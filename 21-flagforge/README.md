# FlagForge — Feature Flag & A/B Testing Platform

Enterprise-grade feature flag management and A/B experiment platform for the fictional
**CodeAtlas** engineering team. Built to demonstrate the patterns used by LaunchDarkly,
Statsig, and GrowthBook — from scratch, with full statistical rigor.

Next.js 14 (App Router) + TypeScript + PostgreSQL.

## Architecture

```
Your App (SDK calls)          FlagForge API              Dashboard
┌───────────────────┐    ┌──────────────────────┐    ┌────────────────────────┐
│ isFeatureEnabled( │    │ POST /api/evaluate   │    │ 🚩 Flags table         │
│  'new-checkout',  │───▶│  1. Load flag from DB│    │    Toggle per env      │
│   userId,         │    │  2. Evaluate rules   │───▶│    Rollout % slider    │
│   { plan:'pro' }  │    │  3. FNV-1a bucket    │    │ 🧪 Experiments table   │
│ ) => true/false   │◀───│  4. Return result    │    │    Results + stats     │
└───────────────────┘    └──────────────────────┘    │ 📋 Audit log           │
                                                      │ 📖 SDK Guide           │
┌───────────────────┐    ┌──────────────────────┐    └────────────────────────┘
│ trackExposure()   │───▶│ POST /api/events     │
│ trackConversion() │    │  Dedup exposures     │
└───────────────────┘    │  Aggregate for stats │
                         └──────────────────────┘

    PostgreSQL: users · flags · experiments · experiment_events · audit_log
```

## Design

1. **Deterministic bucketing with FNV-1a hash — no database lookup per evaluation.**
   Most flag systems (LaunchDarkly, Statsig) hash `userId:flagKey` to assign a 0–99
   bucket. FNV-1a is fast, simple to implement, and has excellent distribution uniformity.
   The key insight: the same user always gets the same flag value (sticky assignment)
   without storing anything. Random assignment would break consistency across page loads.

2. **Rules are evaluated before rollout %, first match wins.**
   This matches how every production flag system works. A common interview mistake is
   applying rollout % to users who already matched a targeting rule. Rules give you
   overrides (e.g. "always show to enterprise users") independent of the general rollout.

3. **Two-proportion z-test implemented from scratch — no stats library.**
   The Abramowitz & Stegun rational approximation for normalCDF has max error 3×10⁻⁷,
   which is more than sufficient for A/B test p-values. The key formula:
   `z = (p₂ - p₁) / √(p_pool × (1-p_pool) × (1/n₁ + 1/n₂))`
   where p_pool is the pooled proportion. Using a pooled SE (not separate SEs) is correct
   for the null hypothesis test; separate SEs are only correct for the confidence interval.

4. **Exposure deduplication is server-side, not client-side.**
   Calling `trackExposure()` on every page render is safe — the server rejects duplicate
   exposures per user per experiment. Client-side dedup (localStorage) would be lost on
   incognito or different devices, inflating exposure counts and biasing results.

5. **Experiment status transitions are validated (state machine).**
   `draft → running → paused → concluded`. You can't go from concluded back to running,
   and you can't skip states. This prevents accidental data contamination (e.g. restarting
   a concluded experiment with a different audience mix).

6. **Three-environment model (dev/staging/prod) with independent configs.**
   Each environment stores its own `{ enabled, rollout_pct, rules }`. This lets teams:
   - Always enable in dev (100% rollout, no rules needed)
   - Canary in staging (e.g. 50% rollout)
   - Gate prod behind a targeting rule (e.g. enterprise plan only)
   All in one flag, with one dashboard view.

7. **Audit log is append-only and enforced at the API layer.**
   Every flag create/update/delete writes to `audit_log` before returning. There's no way
   to mutate a flag without leaving a trace. The actor's user ID is resolved from the
   session cookie — the caller can't inject a fake actor.

## Getting started

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL (Neon/Supabase free tier)
npm run setup                    # schema + 2 dashboard users
npm run seed                     # 6 flags + 4 experiments with realistic event data
npm run dev                      # http://localhost:3000
```

Sign in with:
- `admin@codeatlas.test` / `ChangeMe123!` — full read/write access
- `viewer@codeatlas.test` / `ViewOnly456!` — read-only, no flag/experiment mutations

## API reference

| Method | Route | Auth | Purpose |
|--------|-------|------|--------|
| GET | `/api/flags` | session | List all flags |
| POST | `/api/flags` | admin session | Create a flag |
| GET | `/api/flags/:id` | session | Get single flag |
| PATCH | `/api/flags/:id` | admin session | Update flag (name, envs, tags) |
| DELETE | `/api/flags/:id` | admin session | Delete flag |
| POST | `/api/evaluate` | SDK key | Evaluate a single flag |
| PUT | `/api/evaluate` | SDK key | Bulk-evaluate up to 50 flags |
| GET | `/api/experiments` | session | List all experiments |
| POST | `/api/experiments` | admin session | Create experiment |
| GET | `/api/experiments/:id` | session | Get experiment + live results |
| PATCH | `/api/experiments/:id` | admin session | Update status (start/pause/conclude) |
| POST | `/api/events` | SDK key | Track exposure or conversion event |
| GET | `/api/audit` | session | Audit log (filterable by target) |
| GET/POST/DELETE | `/api/auth` | — | Session check / login / logout |

## Seeded demo data

| Flag | Dev | Staging | Production |
|------|-----|---------|------------|
| `new-checkout-flow` | ON 100% | ON 50% | ON 10% + pro-plan rule |
| `ai-search-suggestions` | ON 100% | ON 100% | OFF |
| `dark-mode-v2` | ON 100% | ON 100% | ON 100% |
| `bulk-export` | ON 100% | ON 20% | OFF |
| `onboarding-v3` | ON 100% | ON 75% | ON 25% |
| `stripe-connect-payouts` | ON 100% | OFF | OFF |

| Experiment | Status | Result |
|------------|--------|--------|
| Checkout Funnel Conversion | running | Treatment +16.7% relative, **p < 0.05 ✅** |
| Onboarding Engagement | running | Treatment +5.5%, not yet significant |
| AI Search Click-Through | draft | No data yet |
| Pricing Page CTA Colour | concluded | Green CTA won (+18.8% relative) |

## Statistical methodology

**Test:** Two-proportion z-test (one test per variant vs control)

**Null hypothesis:** The conversion rates of control and treatment are equal

**Significance threshold:** p < 0.05 (two-tailed)

**Confidence interval:** 95% CI on absolute lift (treatment_rate − control_rate)

**Exposure deduplication:** One exposure per user per experiment (server-enforced)

**Known limitations for production use:**
- No multiple-comparison correction (Bonferroni/BH) — add if testing many variants
- No sequential testing / always-valid p-values — peeking inflates false positives
- No minimum detectable effect (MDE) / sample size calculator — add a pre-flight check

## Deploying

- **App:** Vercel (Next.js defaults, zero config)
- **Postgres:** Neon or Supabase free tier
- **SDK key:** Set `SDK_API_KEY` in environment; your apps pass it as `Authorization: Bearer <key>`
- **Scaling eval:** The evaluate endpoint is stateless and DB-read-only — add Redis caching
  (`GET flag:${key}`, TTL 30 s) to handle thousands of evaluations/second without DB pressure
