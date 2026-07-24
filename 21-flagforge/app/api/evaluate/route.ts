import { NextRequest, NextResponse } from 'next/server'
import { evaluateFlag, Environment } from '@/lib/flags'

// SDK evaluation endpoint — called by your apps at runtime
// Auth: SDK_API_KEY in Authorization: Bearer <key> header
// POST /api/evaluate
// Body: { flagKey, userId, environment?, attributes? }

export async function POST(req: NextRequest) {
  try {
    // Validate SDK key
    const sdkKey = process.env.SDK_API_KEY
    if (sdkKey && sdkKey !== 'dev') {
      const auth = req.headers.get('authorization') ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== sdkKey) {
        return NextResponse.json({ error: 'Invalid SDK key' }, { status: 401 })
      }
    }

    const body = await req.json()
    const {
      flagKey,
      userId,
      environment = 'production',
      attributes = {},
    } = body

    if (!flagKey) return NextResponse.json({ error: 'flagKey is required' }, { status: 400 })
    if (!userId)  return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    const validEnvs: Environment[] = ['development', 'staging', 'production']
    if (!validEnvs.includes(environment)) {
      return NextResponse.json({ error: `environment must be one of: ${validEnvs.join(', ')}` }, { status: 400 })
    }

    const result = await evaluateFlag(flagKey, environment as Environment, { userId, attributes })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Bulk evaluate multiple flags in one call
export async function PUT(req: NextRequest) {
  try {
    const sdkKey = process.env.SDK_API_KEY
    if (sdkKey && sdkKey !== 'dev') {
      const auth = req.headers.get('authorization') ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== sdkKey) {
        return NextResponse.json({ error: 'Invalid SDK key' }, { status: 401 })
      }
    }

    const body = await req.json()
    const {
      flagKeys,
      userId,
      environment = 'production',
      attributes = {},
    } = body

    if (!Array.isArray(flagKeys) || flagKeys.length === 0) {
      return NextResponse.json({ error: 'flagKeys must be a non-empty array' }, { status: 400 })
    }
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    if (flagKeys.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 flags per bulk evaluation' }, { status: 400 })
    }

    const results = await Promise.all(
      flagKeys.map((key: string) =>
        evaluateFlag(key, environment as Environment, { userId, attributes })
      )
    )

    // Return as a map: { [flagKey]: EvaluationResult }
    const map: Record<string, unknown> = {}
    for (const r of results) map[r.flagKey] = r

    return NextResponse.json({ evaluations: map, evaluatedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
