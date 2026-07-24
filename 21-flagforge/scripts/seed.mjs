import pg from 'pg'
import { randomUUID } from 'crypto'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function seed() {
  const client = await pool.connect()
  try {
    console.log('🌱 Seeding FlagForge demo data...')

    // ── Flags ──────────────────────────────────────────────────────────────
    const flags = [
      {
        key: 'new-checkout-flow',
        name: 'New Checkout Flow',
        description: 'Redesigned 3-step checkout replacing the legacy 7-step funnel.',
        environments: {
          development: { enabled: true,  rollout_pct: 100, rules: [] },
          staging:     { enabled: true,  rollout_pct: 50,  rules: [] },
          production:  { enabled: true,  rollout_pct: 10,  rules: [
            { attribute: 'plan', operator: 'eq', value: 'pro', serve: true }
          ]},
        },
        tags: ['checkout', 'revenue'],
      },
      {
        key: 'ai-search-suggestions',
        name: 'AI Search Suggestions',
        description: 'LLM-powered autocomplete in the global search bar.',
        environments: {
          development: { enabled: true,  rollout_pct: 100, rules: [] },
          staging:     { enabled: true,  rollout_pct: 100, rules: [] },
          production:  { enabled: false, rollout_pct: 0,   rules: [] },
        },
        tags: ['ai', 'search'],
      },
      {
        key: 'dark-mode-v2',
        name: 'Dark Mode v2',
        description: 'Updated colour tokens and contrast ratios for dark mode.',
        environments: {
          development: { enabled: true,  rollout_pct: 100, rules: [] },
          staging:     { enabled: true,  rollout_pct: 100, rules: [] },
          production:  { enabled: true,  rollout_pct: 100, rules: [] },
        },
        tags: ['ui', 'design'],
      },
      {
        key: 'bulk-export',
        name: 'Bulk Export',
        description: 'Allow users to export up to 10,000 rows as CSV/JSON.',
        environments: {
          development: { enabled: true,  rollout_pct: 100, rules: [] },
          staging:     { enabled: true,  rollout_pct: 20,  rules: [] },
          production:  { enabled: false, rollout_pct: 0,   rules: [] },
        },
        tags: ['data', 'enterprise'],
      },
      {
        key: 'onboarding-v3',
        name: 'Onboarding Flow v3',
        description: 'Interactive product tour replacing the static welcome email.',
        environments: {
          development: { enabled: true,  rollout_pct: 100, rules: [] },
          staging:     { enabled: true,  rollout_pct: 75,  rules: [] },
          production:  { enabled: true,  rollout_pct: 25,  rules: [] },
        },
        tags: ['onboarding', 'growth'],
      },
      {
        key: 'stripe-connect-payouts',
        name: 'Stripe Connect Payouts',
        description: 'Direct payout to creator bank accounts via Stripe Connect.',
        environments: {
          development: { enabled: true,  rollout_pct: 100, rules: [] },
          staging:     { enabled: false, rollout_pct: 0,   rules: [] },
          production:  { enabled: false, rollout_pct: 0,   rules: [] },
        },
        tags: ['payments', 'creator'],
      },
    ]

    const flagIds = {}
    for (const f of flags) {
      const res = await client.query(
        `INSERT INTO flags (key, name, description, environments, tags)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (key) DO UPDATE
           SET name=$2, description=$3, environments=$4, tags=$5
         RETURNING id`,
        [f.key, f.name, f.description, JSON.stringify(f.environments), JSON.stringify(f.tags)]
      )
      flagIds[f.key] = res.rows[0].id
    }
    console.log(`  ✅ ${flags.length} flags upserted`)

    // ── Experiments ────────────────────────────────────────────────────────
    const experiments = [
      {
        flagKey: 'new-checkout-flow',
        name: 'Checkout Funnel Conversion Test',
        hypothesis: 'The 3-step checkout will increase conversion rate by ≥8% vs the legacy 7-step funnel.',
        metric: 'conversion',
        variants: [
          { key: 'control',   name: 'Legacy Checkout (7-step)' },
          { key: 'treatment', name: 'New Checkout (3-step)'    },
        ],
        status: 'running',
        // Simulate realistic data: treatment wins with p < 0.05
        events: {
          control:   { exposures: 4821, conversions: 867  }, // 17.98%
          treatment: { exposures: 4934, conversions: 1036 }, // 20.99% (+16.7% relative)
        },
      },
      {
        flagKey: 'onboarding-v3',
        name: 'Interactive Onboarding Engagement Test',
        hypothesis: 'The interactive tour will improve day-7 activation rate vs static welcome email.',
        metric: 'activation',
        variants: [
          { key: 'control',   name: 'Static Welcome Email' },
          { key: 'treatment', name: 'Interactive Tour'     },
        ],
        status: 'running',
        // Treatment narrowly ahead — not yet significant
        events: {
          control:   { exposures: 1203, conversions: 241 }, // 20.03%
          treatment: { exposures: 1187, conversions: 251 }, // 21.14%
        },
      },
      {
        flagKey: 'ai-search-suggestions',
        name: 'AI Search Click-Through Test',
        hypothesis: 'AI autocomplete suggestions will increase search result click-through by 15%.',
        metric: 'click_through',
        variants: [
          { key: 'control',   name: 'Keyword Autocomplete' },
          { key: 'treatment', name: 'AI Suggestions'       },
        ],
        status: 'draft',
        events: { control: { exposures: 0, conversions: 0 }, treatment: { exposures: 0, conversions: 0 } },
      },
      {
        flagKey: null,
        name: 'Pricing Page CTA Colour Test',
        hypothesis: 'A green CTA button will outperform the current grey on the pricing page.',
        metric: 'conversion',
        variants: [
          { key: 'control',   name: 'Grey CTA'  },
          { key: 'treatment', name: 'Green CTA' },
        ],
        status: 'concluded',
        winner: 'treatment',
        // Treatment clearly won
        events: {
          control:   { exposures: 8932, conversions: 714  }, // 7.99%
          treatment: { exposures: 9011, conversions: 856  }, // 9.50% (+18.8% relative, p<<0.01)
        },
      },
    ]

    for (const exp of experiments) {
      const res = await client.query(
        `INSERT INTO experiments (flag_id, name, hypothesis, metric, variants, status, winner)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [
          exp.flagKey ? flagIds[exp.flagKey] ?? null : null,
          exp.name,
          exp.hypothesis,
          exp.metric,
          JSON.stringify(exp.variants),
          exp.status,
          exp.winner ?? null,
        ]
      )
      const expId = res.rows[0].id

      // Seed events
      for (const [variantKey, counts] of Object.entries(exp.events)) {
        const { exposures, conversions } = counts
        for (let i = 0; i < exposures; i++) {
          const userId = `seed_user_${expId.slice(0,8)}_${variantKey}_${i}`
          await client.query(
            `INSERT INTO experiment_events (experiment_id, user_id, variant_key, event_type)
             VALUES ($1,$2,$3,'exposure')`,
            [expId, userId, variantKey]
          )
        }
        for (let i = 0; i < conversions; i++) {
          const userId = `seed_user_${expId.slice(0,8)}_${variantKey}_${i}`
          await client.query(
            `INSERT INTO experiment_events (experiment_id, user_id, variant_key, event_type)
             VALUES ($1,$2,$3,'conversion')`,
            [expId, userId, variantKey]
          )
        }
      }
    }
    console.log(`  ✅ ${experiments.length} experiments seeded with realistic event data`)
    console.log('')
    console.log('🚩 FlagForge seed complete! Run `npm run dev` and sign in to explore.')
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(e => { console.error(e); process.exit(1) })
