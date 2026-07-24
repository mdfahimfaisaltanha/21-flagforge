// Rule-based user targeting engine
// Rules are evaluated in order; first match wins.
// If no rules match, the flag falls back to rollout % check.

export type Operator =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'exists' | 'not_exists'

export type Rule = {
  attribute: string   // e.g. "country", "plan", "email"
  operator: Operator
  value?: string | number | string[] // not needed for exists/not_exists
  serve: boolean      // what to return when this rule matches
}

export type UserContext = {
  userId: string
  attributes?: Record<string, string | number | boolean>
}

export function evaluateRules(
  rules: Rule[],
  ctx: UserContext
): boolean | null {
  for (const rule of rules) {
    if (matchRule(rule, ctx)) return rule.serve
  }
  return null // no rule matched
}

function matchRule(rule: Rule, ctx: UserContext): boolean {
  const attrs = ctx.attributes ?? {}
  const actual = attrs[rule.attribute]

  switch (rule.operator) {
    case 'exists':     return actual !== undefined && actual !== null
    case 'not_exists': return actual === undefined || actual === null
    case 'eq':         return String(actual) === String(rule.value)
    case 'neq':        return String(actual) !== String(rule.value)
    case 'contains':   return typeof actual === 'string' && actual.includes(String(rule.value))
    case 'not_contains': return typeof actual === 'string' && !actual.includes(String(rule.value))
    case 'gt':         return Number(actual) > Number(rule.value)
    case 'gte':        return Number(actual) >= Number(rule.value)
    case 'lt':         return Number(actual) < Number(rule.value)
    case 'lte':        return Number(actual) <= Number(rule.value)
    case 'in': {
      const list = Array.isArray(rule.value) ? rule.value : [String(rule.value)]
      return list.map(String).includes(String(actual))
    }
    case 'not_in': {
      const list = Array.isArray(rule.value) ? rule.value : [String(rule.value)]
      return !list.map(String).includes(String(actual))
    }
    default: return false
  }
}

// Deterministic bucketing: hash userId+flagKey to 0-99 for rollout %
export function bucketUser(userId: string, flagKey: string): number {
  // FNV-1a 32-bit hash for speed and good distribution
  let hash = 2166136261
  const str = `${userId}:${flagKey}`
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash % 100
}
