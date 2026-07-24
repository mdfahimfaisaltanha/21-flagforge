import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getFlagById, updateFlag, deleteFlag, logAudit } from '@/lib/flags'

type Params = { params: { id: string } }

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const flag = await getFlagById(params.id)
    if (!flag) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ flag })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const existing = await getFlagById(params.id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const updated = await updateFlag(params.id, body)
    await logAudit(session.id, 'flag.update', 'flag', params.id, { before: existing, after: body })
    return NextResponse.json({ flag: updated })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const existing = await getFlagById(params.id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await deleteFlag(params.id)
    await logAudit(session.id, 'flag.delete', 'flag', params.id, { key: existing.key })
    return NextResponse.json({ deleted: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
