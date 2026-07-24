import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FlagForge — Feature Flags & A/B Testing',
  description: 'Feature flag management and A/B experiment platform for the CodeAtlas engineering team',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <span className="logo">🚩 FlagForge</span>
          <div className="nav-links">
            <a href="/">Dashboard</a>
            <a href="/?tab=flags">Flags</a>
            <a href="/?tab=experiments">Experiments</a>
            <a href="/?tab=audit">Audit Log</a>
            <a href="/?tab=sdk">SDK Guide</a>
          </div>
          <div className="nav-right">
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>CodeAtlas Internal</span>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
