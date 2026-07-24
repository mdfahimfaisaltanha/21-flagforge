import { query, queryOne } from './db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Variant = {
  key: string        // 'control' | 'treatment' | any name
  name: string
  description?: string
}

export type Experiment = {
  id: string
  flag_id: string | null   // optional: link to a feature flag
  name: string
  hypothesis: string
  metric: string           // e.g. "conversion", "click", "signup"
  variants: Variant[]      // first is always control
  status: 'draft' | 'running' | 'paused' | 'concluded'
  winner: string | null
  created_at: string
  updated_at: string
}

export type ExperimentResult = {
  variantKey: string
  exposures: number
  conversions: number
  conversionRate: number
  // vs control
  relativeLift: number | null    // (treatment - control) / control
  absoluteLift: number | null    // treatment_rate - control_rate
  pValue: number | null
  significant: boolean           // p < 0.05
  confidenceInterval: [number, number] | null   // 95% CI on absolute lift
}

// ---------------------------------------------------------------------------
// Statistics: two-proportion z-test (from scratch)
// ---------------------------------------------------------------------------

/**
 * Approximates the standard normal CDF using Abramowitz & Stegun (7-term
 * rational approximation, max error 3e-7).
 */
function normalCDF(z: number): number {
  if (z < -8) return 0
  if (z >  8) return 1
  const sign = z >= 0 ? 1 : -1
  const x = Math.abs(z) / Math.SQRT2
  // erfc approximation
  const t = 1 / (1 + 0.3275911 * x)
  const poly =
    t * (0.254829592 +
    t * (-0.284496736 +
    t * (1.421413741 +
    t * (-1.453152027 +
    t * 1.061405429))))
  const erfc = poly * Math.exp(-x * x)
  return 0.5 * (1 + sign * (1 - erfc))
}

/**
 * Two-proportion z-test.
 * Returns p-value (two-tailed) and 95% confidence interval on (p2 - p1).
 */
export function twoProportionZTest(
  n1: number, x1: number,   // control:   n=exposures, x=conversions
  n2: number, x2: number    // treatment: n=exposures, x=conversions
): { zScore: number; pValue: number; ci95: [number, number] } | null {
  if (n1 < 1 || n2 < 1) return null

  const p1 = x1 / n1
  const p2 = x2 / n2
  const pPool = (x1 + x2) / (n1 + n2)

  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2))
  if (se === 0) return null

  const z = (p2 - p1) / se
  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)))

  // 95% CI on absolute lift (p2 - p1)
  const seDiff = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2)
  const margin = 1.96 * seDiff
  const diff = p2 - p1
  const ci95: [number, number] = [diff - margin, diff + margin]

  return { zScore: z, pValue, ci95 }
}

// ---------------------------------------------------------------------------
// Aggregate experiment results
// ---------------------------------------------------------------------------

export async function getExperimentResults(
  experimentId: string
): Promise<ExperimentResult[]> {
  const experiment = await queryOne<Experiment>(
    `SELECT * FROM experiments WHERE id = $1`,
    [experimentId]
  )
  if (!experiment) return []

  // Pull aggregated exposures + conversions per variant
  const rows = await query<{
    variant_key: string
    exposures: string
    conversions: string
  }>(
    `SELECT variant_key,
            COUNT(*) FILTER (WHERE event_type = 'exposure')   AS exposures,
            COUNT(*) FILTER (WHERE event_type = 'conversion') AS conversions
     FROM experiment_events
     WHERE experiment_id = $1
     GROUP BY variant_key`,
    [experimentId]
  )

  if (rows.length === 0) return []

  // Control is first variant
  const controlKey = experiment.variants[0]?.key ?? 'control'
  const controlRow = rows.find(r => r.variant_key === controlKey)
  const controlN = Number(controlRow?.exposures ?? 0)
  const controlX = Number(controlRow?.conversions ?? 0)
  const controlRate = controlN > 0 ? controlX / controlN : 0

  return rows.map(row => {
    const n = Number(row.exposures)
    const x = Number(row.conversions)
    const rate = n > 0 ? x / n : 0
    const isControl = row.variant_key === controlKey

    if (isControl) {
      return {
        variantKey: row.variant_key,
        exposures: n,
        conversions: x,
        conversionRate: rate,
        relativeLift: null,
        absoluteLift: null,
        pValue: null,
        significant: false,
        confidenceInterval: null,
      }
    }

    const stats = twoProportionZTest(controlN, controlX, n, x)
    const absoluteLift = rate - controlRate
    const relativeLift = controlRate > 0 ? absoluteLift / controlRate : null

    return {
      variantKey: row.variant_key,
      exposures: n,
      conversions: x,
      conversionRate: rate,
      relativeLift,
      absoluteLift,
      pValue: stats?.pValue ?? null,
      significant: stats ? stats.pValue < 0.05 : false,
      confidenceInterval: stats?.ci95 ?? null,
    }
  })
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getAllExperiments(): Promise<Experiment[]> {
  return query<Experiment>(`SELECT * FROM experiments ORDER BY created_at DESC`)
}

export async function getExperimentById(id: string): Promise<Experiment | null> {
  return queryOne<Experiment>(`SELECT * FROM experiments WHERE id = $1`, [id])
}

export async function createExperiment(data: {
  name: string
  hypothesis: string
  metric: string
  variants: Variant[]
  flagId?: string
}): Promise<Experiment> {
  const rows = await query<Experiment>(
    `INSERT INTO experiments (flag_id, name, hypothesis, metric, variants, status)
     VALUES ($1, $2, $3, $4, $5, 'draft')
     RETURNING *`,
    [
      data.flagId ?? null,
      data.name,
      data.hypothesis,
      data.metric,
      JSON.stringify(data.variants),
    ]
  )
  return rows[0]
}

export async function updateExperimentStatus(
  id: string,
  status: Experiment['status'],
  winner?: string
): Promise<Experiment | null> {
  const rows = await query<Experiment>(
    `UPDATE experiments
     SET status = $1, winner = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, winner ?? null, id]
  )
  return rows[0] ?? null
}

export async function trackEvent(
  experimentId: string,
  userId: string,
  variantKey: string,
  eventType: 'exposure' | 'conversion',
  metadata?: object
) {
  // Deduplicate exposures: one per user per experiment
  if (eventType === 'exposure') {
    const existing = await queryOne(
      `SELECT id FROM experiment_events
       WHERE experiment_id = $1 AND user_id = $2 AND event_type = 'exposure'`,
      [experimentId, userId]
    )
    if (existing) return // already recorded
  }
  await query(
    `INSERT INTO experiment_events (experiment_id, user_id, variant_key, event_type, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [experimentId, userId, variantKey, eventType, JSON.stringify(metadata ?? {})]
  )
}
