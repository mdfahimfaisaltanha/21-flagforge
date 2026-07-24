import { NextRequest, NextResponse } from 'next/server'
import { getSession, login } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ user: null }, { status: 200 })
    return NextResponse.json({ user })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password required' }, { status: 400 })
    }
    const result = await login(email, password)
    if (!result) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const res = NextResponse.json({ user: result.user })
    res.cookies.set('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })
    return res
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ loggedOut: true })
  res.cookies.set('session', '', { maxAge: 0, path: '/' })
  return res
}
