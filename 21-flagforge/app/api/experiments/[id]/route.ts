import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getExperimentById,
  updateExperimentStatus,
  getExperimentResults,
} from '@/lib/experiments'

type Params = { params: { id: string } }

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const experiment = await getExperimentById(params.id)
    if (!experiment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const results = await getExperimentResults(params.id)
    return NextResponse.json({ experiment, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const experiment = await getExperimentById(params.id)
    if (!experiment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const { status, winner } = body

    const valid = ['draft', 'running', 'paused', 'concluded']
    if (!valid.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${valid.join(', ')}` }, { status: 400 })
    }

    // Validate status transitions — prevents data contamination
    const transitions: Record<string, string[]> = {
      draft:     ['running'],
      running:   ['paused', 'concluded'],
      paused:    ['running', 'concluded'],
      concluded: [],
    }
    if (!transitions[experiment.status].includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${experiment.status}' to '${status}'` },
        { status: 422 }
      )
    }

    const updated = await updateExperimentStatus(params.id, status, winner)
    return NextResponse.json({ experiment: updated })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
