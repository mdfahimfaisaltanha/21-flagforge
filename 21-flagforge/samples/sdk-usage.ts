// FlagForge SDK Usage Examples
// These are standalone TypeScript snippets — copy into your app.

const FLAGFORGE_URL = 'https://flags.codeatlas.com'
const SDK_KEY = process.env.FLAGFORGE_SDK_KEY ?? 'sdk_dev_changeme'

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SDK_KEY}`,
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Evaluate a single flag (most common use case)
// ─────────────────────────────────────────────────────────────────────────────
async function isFeatureEnabled(
  flagKey: string,
  userId: string,
  attributes: Record<string, string | number | boolean> = {}
): Promise<boolean> {
  const res = await fetch(`${FLAGFORGE_URL}/api/evaluate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      flagKey,
      userId,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      attributes,
    }),
  })
  if (!res.ok) return false // fail open: if FlagForge is down, default to false
  const { enabled } = await res.json()
  return enabled
}

// Usage in a Next.js API route or Server Component:
//
// const userId = session.user.id
// const showNewCheckout = await isFeatureEnabled('new-checkout-flow', userId, {
//   plan: session.user.plan,
//   country: session.user.country,
// })


// ─────────────────────────────────────────────────────────────────────────────
// 2. Bulk evaluate (initialise all flags once per page load)
// ─────────────────────────────────────────────────────────────────────────────
async function evaluateAll(
  flagKeys: string[],
  userId: string,
  attributes: Record<string, string | number | boolean> = {}
): Promise<Record<string, boolean>> {
  const res = await fetch(`${FLAGFORGE_URL}/api/evaluate`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ flagKeys, userId, environment: 'production', attributes }),
  })
  if (!res.ok) return Object.fromEntries(flagKeys.map(k => [k, false]))
  const { evaluations } = await res.json()
  return Object.fromEntries(
    Object.entries(evaluations).map(([k, v]) => [k, (v as { enabled: boolean }).enabled])
  )
}

// Usage:
// const flags = await evaluateAll(
//   ['new-checkout-flow', 'dark-mode-v2', 'ai-search-suggestions'],
//   userId,
//   { plan: 'pro' }
// )
// if (flags['new-checkout-flow']) { ... }


// ─────────────────────────────────────────────────────────────────────────────
// 3. Track A/B experiment events
// ─────────────────────────────────────────────────────────────────────────────
async function trackExposure(
  experimentId: string,
  userId: string,
  variantKey: 'control' | 'treatment'
) {
  // Exposure is deduplicated server-side: safe to call on every page load.
  await fetch(`${FLAGFORGE_URL}/api/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ experimentId, userId, variantKey, eventType: 'exposure' }),
  }).catch(() => {}) // fire-and-forget; never block the UI
}

async function trackConversion(
  experimentId: string,
  userId: string,
  variantKey: 'control' | 'treatment',
  metadata?: Record<string, unknown>
) {
  await fetch(`${FLAGFORGE_URL}/api/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ experimentId, userId, variantKey, eventType: 'conversion', metadata }),
  }).catch(() => {})
}

// Usage in a React component:
//
// useEffect(() => {
//   trackExposure('exp-uuid-here', userId, userVariant)
// }, [])
//
// // On checkout button click:
// async function handleCheckout() {
//   await trackConversion('exp-uuid-here', userId, userVariant, { revenue: 49.99 })
//   router.push('/checkout')
// }


// ─────────────────────────────────────────────────────────────────────────────
// 4. Targeting rules reference
// ─────────────────────────────────────────────────────────────────────────────
//
// Rules are set in the dashboard per flag per environment.
// They are evaluated IN ORDER — first match wins.
// If no rule matches, the rollout % bucket is used.
//
// Supported operators:
//   eq, neq                  — exact string match / not match
//   contains, not_contains   — substring match
//   gt, gte, lt, lte        — numeric comparison
//   in, not_in              — membership in a list
//   exists, not_exists      — attribute presence
//
// Example rules JSON (stored in flag.environments.production.rules):
// [
//   { attribute: 'plan',    operator: 'eq',  value: 'enterprise', serve: true  },
//   { attribute: 'country', operator: 'in',  value: ['US','CA'],  serve: true  },
//   { attribute: 'email',   operator: 'contains', value: '@beta.', serve: true },
// ]

export { isFeatureEnabled, evaluateAll, trackExposure, trackConversion }
