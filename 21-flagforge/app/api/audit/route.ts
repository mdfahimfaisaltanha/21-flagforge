import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const targetType = searchParams.get('targetType')
    const targetId   = searchParams.get('targetId')
    const limit      = Math.min(Number(searchParams.get('limit') ?? 50), 200)

    const conditions: string[] = []
    const params: unknown[]    = []

    if (targetType) { params.push(targetType); conditions.push(`target_type = $${params.length}`) }
    if (targetId)   { params.push(targetId);   conditions.push(`target_id   = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const rows = await query(
      `SELECT al.*, u.email AS actor_email
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${params.length}`,
      params
    )

    return NextResponse.json({ logs: rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
