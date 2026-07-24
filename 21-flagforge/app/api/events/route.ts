import { NextRequest, NextResponse } from 'next/server'
import { trackEvent } from '@/lib/experiments'

// Called by your app to record exposure & conversion events
// Auth: SDK_API_KEY via Authorization: Bearer <key>
// POST /api/events

export async function POST(req: NextRequest) {
  try {
    const sdkKey = process.env.SDK_API_KEY
    if (sdkKey && sdkKey !== 'dev') {
      const auth  = req.headers.get('authorization') ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== sdkKey) {
        return NextResponse.json({ error: 'Invalid SDK key' }, { status: 401 })
      }
    }

    const body = await req.json()
    const { experimentId, userId, variantKey, eventType, metadata } = body

    if (!experimentId || !userId || !variantKey || !eventType) {
      return NextResponse.json(
        { error: 'experimentId, userId, variantKey, and eventType are required' },
        { status: 400 }
      )
    }
    if (!['exposure', 'conversion'].includes(eventType)) {
      return NextResponse.json(
        { error: "eventType must be 'exposure' or 'conversion'" },
        { status: 400 }
      )
    }

    await trackEvent(experimentId, userId, variantKey, eventType, metadata)
    return NextResponse.json({ tracked: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
