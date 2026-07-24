import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllExperiments, createExperiment } from '@/lib/experiments'

export async function GET() {
  try {
    const experiments = await getAllExperiments()
    return NextResponse.json({ experiments })
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
    const { name, hypothesis, metric, variants, flagId } = body

    if (!name || !hypothesis || !metric) {
      return NextResponse.json(
        { error: 'name, hypothesis, and metric are required' },
        { status: 400 }
      )
    }
    if (!Array.isArray(variants) || variants.length < 2) {
      return NextResponse.json(
        { error: 'variants must be an array with at least 2 entries (control + treatment)' },
        { status: 400 }
      )
    }

    const experiment = await createExperiment({ name, hypothesis, metric, variants, flagId })
    return NextResponse.json({ experiment }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
