import { cookies } from 'next/headers'
import { query, queryOne } from './db'
import { createHash, timingSafeEqual } from 'crypto'

export type SessionUser = {
  id: string
  email: string
  role: 'admin' | 'viewer'
}

function hashPassword(password: string): string {
  return createHash('sha256')
    .update(password + (process.env.SESSION_SECRET ?? 'dev'))
    .digest('hex')
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get('session')?.value
  if (!token) return null
  const user = await queryOne<SessionUser>(
    `SELECT id, email, role FROM users WHERE session_token = $1 AND session_expires > NOW()`,
    [token]
  )
  return user
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: SessionUser } | null> {
  const row = await queryOne<{ id: string; email: string; role: string; password_hash: string }>(
    `SELECT id, email, role, password_hash FROM users WHERE email = $1`,
    [email]
  )
  if (!row) return null
  const hash = hashPassword(password)
  const a = Buffer.from(hash)
  const b = Buffer.from(row.password_hash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const token = createHash('sha256')
    .update(row.id + Date.now() + Math.random())
    .digest('hex')
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await query(
    `UPDATE users SET session_token = $1, session_expires = $2 WHERE id = $3`,
    [token, expires.toISOString(), row.id]
  )
  return { token, user: { id: row.id, email: row.email, role: row.role as 'admin' | 'viewer' } }
}

export { hashPassword }
