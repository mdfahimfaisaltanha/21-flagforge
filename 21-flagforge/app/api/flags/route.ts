import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllFlags, createFlag, logAudit } from '@/lib/flags'

export async function GET() {
  try {
    const flags = await getAllFlags()
    return NextResponse.json({ flags })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { key, name, description, tags, environments } = body

    if (!key || !name) {
      return NextResponse.json({ error: 'key and name are required' }, { status: 400 })
    }
    // key must be slug-safe
    if (!/^[a-z0-9_-]+$/.test(key)) {
      return NextResponse.json(
        { error: 'key must be lowercase letters, numbers, hyphens, or underscores' },
        { status: 400 }
      )
    }

    const flag = await createFlag({ key, name, description, tags, environments })
    await logAudit(session.id, 'flag.create', 'flag', flag.id, { key, name })
    return NextResponse.json({ flag }, { status: 201 })
  } catch (e: unknown) {
    const msg = String(e)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'A flag with that key already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
