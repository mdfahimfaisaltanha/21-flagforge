import { query, queryOne } from './db'
import { evaluateRules, bucketUser, Rule, UserContext } from './targeting'

export type Environment = 'development' | 'staging' | 'production'

export type Flag = {
  id: string
  key: string
  name: string
  description: string
  environments: Record<Environment, EnvConfig>
  tags: string[]
  created_at: string
  updated_at: string
}

export type EnvConfig = {
  enabled: boolean
  rollout_pct: number          // 0-100
  rules: Rule[]                // evaluated before rollout %
  variant?: string             // optional named variant (for A/B linkage)
}

export type EvaluationResult = {
  flagKey: string
  enabled: boolean
  variant: string | null
  reason: 'disabled' | 'rule_match' | 'rollout' | 'not_in_rollout'
  evaluatedAt: string
}

export async function evaluateFlag(
  flagKey: string,
  env: Environment,
  ctx: UserContext
): Promise<EvaluationResult> {
  const flag = await queryOne<{
    id: string
    key: string
    environments: Record<Environment, EnvConfig>
  }>(
    `SELECT id, key, environments FROM flags WHERE key = $1`,
    [flagKey]
  )

  const base: EvaluationResult = {
    flagKey,
    enabled: false,
    variant: null,
    reason: 'disabled',
    evaluatedAt: new Date().toISOString(),
  }

  if (!flag) return base

  const envCfg: EnvConfig = flag.environments?.[env] ?? {
    enabled: false, rollout_pct: 0, rules: []
  }

  if (!envCfg.enabled) return { ...base, reason: 'disabled' }

  // 1. Evaluate targeting rules (first match wins)
  const ruleResult = evaluateRules(envCfg.rules ?? [], ctx)
  if (ruleResult !== null) {
    return {
      ...base,
      enabled: ruleResult,
      variant: ruleResult ? (envCfg.variant ?? 'treatment') : null,
      reason: 'rule_match',
    }
  }

  // 2. Rollout percentage (deterministic bucketing)
  const bucket = bucketUser(ctx.userId, flagKey)
  const inRollout = bucket < (envCfg.rollout_pct ?? 0)
  return {
    ...base,
    enabled: inRollout,
    variant: inRollout ? (envCfg.variant ?? 'treatment') : null,
    reason: inRollout ? 'rollout' : 'not_in_rollout',
  }
}

export async function getAllFlags(): Promise<Flag[]> {
  return query<Flag>(`SELECT * FROM flags ORDER BY created_at DESC`)
}

export async function getFlagById(id: string): Promise<Flag | null> {
  return queryOne<Flag>(`SELECT * FROM flags WHERE id = $1`, [id])
}

export async function createFlag(data: {
  key: string
  name: string
  description?: string
  tags?: string[]
  environments?: Partial<Record<Environment, Partial<EnvConfig>>>
}): Promise<Flag> {
  const defaultEnv: EnvConfig = { enabled: false, rollout_pct: 0, rules: [] }
  const environments: Record<Environment, EnvConfig> = {
    development: { ...defaultEnv, ...data.environments?.development },
    staging:     { ...defaultEnv, ...data.environments?.staging },
    production:  { ...defaultEnv, ...data.environments?.production },
  }
  const rows = await query<Flag>(
    `INSERT INTO flags (key, name, description, environments, tags)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.key,
      data.name,
      data.description ?? '',
      JSON.stringify(environments),
      JSON.stringify(data.tags ?? []),
    ]
  )
  return rows[0]
}

export async function updateFlag(
  id: string,
  data: Partial<{
    name: string
    description: string
    tags: string[]
    environments: Record<Environment, EnvConfig>
  }>
): Promise<Flag | null> {
  const existing = await getFlagById(id)
  if (!existing) return null
  const rows = await query<Flag>(
    `UPDATE flags
     SET name = $1, description = $2, tags = $3, environments = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      data.name         ?? existing.name,
      data.description  ?? existing.description,
      JSON.stringify(data.tags ?? existing.tags),
      JSON.stringify(data.environments ?? existing.environments),
      id,
    ]
  )
  return rows[0] ?? null
}

export async function deleteFlag(id: string): Promise<boolean> {
  const res = await query(`DELETE FROM flags WHERE id = $1`, [id])
  return (res as unknown as { rowCount: number }).rowCount > 0
}

export async function logAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  diff?: object
) {
  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, diff)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(diff ?? {})]
  )
}
