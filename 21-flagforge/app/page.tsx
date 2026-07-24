'use client'
import { useState, useEffect, useCallback } from 'react'

type Flag = {
  id: string; key: string; name: string; description: string
  environments: Record<string, { enabled: boolean; rollout_pct: number; rules: unknown[] }>
  tags: string[]; created_at: string
}
type Experiment = {
  id: string; name: string; hypothesis: string; metric: string
  variants: { key: string; name: string }[]
  status: string; winner: string | null; created_at: string
}
type AuditLog = {
  id: string; action: string; target_type: string; target_id: string
  actor_email: string; created_at: string; diff: unknown
}
type ExpResult = {
  variantKey: string; exposures: number; conversions: number
  conversionRate: number; relativeLift: number | null; pValue: number | null
  significant: boolean; confidenceInterval: [number,number] | null
}

const ENV_COLORS: Record<string, string> = {
  development: 'badge-blue', staging: 'badge-yellow', production: 'badge-green'
}

export default function Home() {
  const [tab, setTab] = useState('flags')
  const [flags, setFlags] = useState<Flag[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showExpModal, setShowExpModal]   = useState(false)
  const [selectedExp, setSelectedExp] = useState<string | null>(null)
  const [expResults, setExpResults] = useState<ExpResult[]>([])
  const [user, setUser] = useState<{ email: string; role: string } | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass]   = useState('')
  const [loginErr, setLoginErr]     = useState('')

  // New flag form
  const [nfKey,  setNfKey]  = useState('')
  const [nfName, setNfName] = useState('')
  const [nfDesc, setNfDesc] = useState('')
  const [nfPct,  setNfPct]  = useState(0)

  // New experiment form
  const [neName,  setNeName]  = useState('')
  const [neHyp,   setNeHyp]   = useState('')
  const [neMet,   setNeMet]   = useState('conversion')
  const [neCtrl,  setNeCtrl]  = useState('Control')
  const [neTreat, setNeTreat] = useState('Treatment')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [fr, er, ar, ur] = await Promise.all([
        fetch('/api/flags').then(r => r.json()),
        fetch('/api/experiments').then(r => r.json()),
        fetch('/api/audit').then(r => r.json()),
        fetch('/api/auth').then(r => r.json()),
      ])
      setFlags(fr.flags ?? [])
      setExperiments(er.experiments ?? [])
      setAuditLogs(ar.logs ?? [])
      setUser(ur.user ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function loadExpResults(id: string) {
    setSelectedExp(id)
    const r = await fetch(`/api/experiments/${id}`).then(r => r.json())
    setExpResults(r.results ?? [])
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPass }),
    }).then(r => r.json())
    if (r.error) { setLoginErr(r.error); return }
    setUser(r.user)
  }

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    setUser(null)
  }

  async function createFlag(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      key: nfKey, name: nfName, description: nfDesc,
      environments: {
        development: { enabled: true,  rollout_pct: 100, rules: [] },
        staging:     { enabled: true,  rollout_pct: nfPct, rules: [] },
        production:  { enabled: false, rollout_pct: 0,    rules: [] },
      }
    }
    await fetch('/api/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setShowFlagModal(false)
    setNfKey(''); setNfName(''); setNfDesc(''); setNfPct(0)
    fetchAll()
  }

  async function toggleFlag(flag: Flag, env: string) {
    const envs = { ...flag.environments }
    envs[env] = { ...envs[env], enabled: !envs[env].enabled }
    await fetch(`/api/flags/${flag.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environments: envs }),
    })
    fetchAll()
  }

  async function createExperiment(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: neName, hypothesis: neHyp, metric: neMet,
        variants: [
          { key: 'control',   name: neCtrl },
          { key: 'treatment', name: neTreat },
        ]
      }),
    })
    setShowExpModal(false)
    setNeName(''); setNeHyp(''); setNeMet('conversion'); setNeCtrl('Control'); setNeTreat('Treatment')
    fetchAll()
  }

  async function updateExpStatus(id: string, status: string) {
    await fetch(`/api/experiments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchAll()
    if (selectedExp === id) loadExpResults(id)
  }

  const activeFlags = flags.filter(f => Object.values(f.environments).some(e => e.enabled))
  const runningExps = experiments.filter(e => e.status === 'running')

  if (!user) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh' }}>
      <div className="card" style={{ width: 360 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🚩</div>
          <div style={{ fontSize:20, fontWeight:700 }}>Sign in to FlagForge</div>
          <div style={{ color:'var(--muted)', fontSize:13, marginTop:4 }}>CodeAtlas Feature Flag Platform</div>
        </div>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}
              placeholder="admin@codeatlas.test" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)}
              placeholder="••••••••" required />
          </div>
          {loginErr && <p style={{ color:'var(--danger)', fontSize:13, marginBottom:12 }}>{loginErr}</p>}
          <button type="submit" className="btn btn-primary" style={{ width:'100%' }}>Sign in</button>
        </form>
        <p style={{ color:'var(--muted)', fontSize:12, marginTop:16, textAlign:'center' }}>
          admin@codeatlas.test / ChangeMe123! &nbsp;·&nbsp; viewer@codeatlas.test / ViewOnly456!
        </p>
      </div>
    </div>
  )

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Feature Flag Dashboard</div>
          <div className="page-sub">Manage flags, run A/B experiments, and track every change</div>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ color:'var(--muted)', fontSize:12 }}>{user.email} ({user.role})</span>
          <button className="btn btn-ghost" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        {[{label:'Total Flags', value: flags.length, icon:'🚩'},
          {label:'Active Flags', value: activeFlags.length, icon:'✅'},
          {label:'Running Experiments', value: runningExps.length, icon:'🧪'},
          {label:'Audit Events (24 h)', value: auditLogs.length, icon:'📋'}
        ].map(s => (
          <div key={s.label} className="card">
            <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
            <div className="card-value">{loading ? '—' : s.value}</div>
            <div style={{ color:'var(--muted)', fontSize:12, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {['flags','experiments','audit','sdk'].map(t => (
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
            {t === 'flags' ? '🚩 Flags'
             : t === 'experiments' ? '🧪 Experiments'
             : t === 'audit' ? '📋 Audit Log'
             : '📖 SDK Guide'}
          </button>
        ))}
      </div>

      {/* ── FLAGS TAB ── */}
      {tab === 'flags' && (
        <>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            {user.role === 'admin' && (
              <button className="btn btn-primary" onClick={()=>setShowFlagModal(true)}>+ New Flag</button>
            )}
          </div>
          {flags.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🚩</div>
              <div className="empty-title">No flags yet</div>
              <div>Create your first feature flag to get started.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Key</th><th>Name</th>
                  <th>Development</th><th>Staging</th><th>Production</th>
                  <th>Tags</th><th>Created</th>
                </tr></thead>
                <tbody>
                  {flags.map(flag => (
                    <tr key={flag.id}>
                      <td><code style={{ fontSize:12, color:'var(--accent)' }}>{flag.key}</code></td>
                      <td>
                        <div style={{ fontWeight:600 }}>{flag.name}</div>
                        {flag.description && <div style={{ color:'var(--muted)', fontSize:12 }}>{flag.description}</div>}
                      </td>
                      {(['development','staging','production'] as const).map(env => {
                        const cfg = flag.environments?.[env]
                        const on  = cfg?.enabled ?? false
                        return (
                          <td key={env}>
                            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                              <button
                                className={`badge ${on ? ENV_COLORS[env] : 'badge-gray'}`}
                                style={{ cursor: user.role==='admin'?'pointer':'default', border:'none' }}
                                onClick={() => user.role==='admin' && toggleFlag(flag, env)}
                                title={user.role==='admin' ? `Click to toggle ${env}` : ''}
                              >
                                {on ? 'ON' : 'OFF'}
                              </button>
                              {on && (
                                <div style={{ fontSize:11, color:'var(--muted)' }}>
                                  {cfg.rollout_pct}% rollout
                                  <div className="rollout-bar" style={{ marginTop:3, width:60 }}>
                                    <div className="rollout-fill" style={{ width:`${cfg.rollout_pct}%` }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        )
                      })}
                      <td>
                        {(flag.tags ?? []).map((t: string) => (
                          <span key={t} className="badge badge-blue" style={{ marginRight:4 }}>{t}</span>
                        ))}
                      </td>
                      <td style={{ color:'var(--muted)', fontSize:12 }}>
                        {new Date(flag.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── EXPERIMENTS TAB ── */}
      {tab === 'experiments' && (
        <>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            {user.role === 'admin' && (
              <button className="btn btn-primary" onClick={()=>setShowExpModal(true)}>+ New Experiment</button>
            )}
          </div>
          {experiments.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🧪</div>
              <div className="empty-title">No experiments yet</div>
              <div>Create your first A/B experiment to start collecting data.</div>
            </div>
          ) : (
            <>
              <div className="table-wrap" style={{ marginBottom:32 }}>
                <table>
                  <thead><tr>
                    <th>Name</th><th>Metric</th><th>Variants</th><th>Status</th><th>Winner</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {experiments.map(exp => (
                      <tr key={exp.id}>
                        <td>
                          <div style={{ fontWeight:600 }}>{exp.name}</div>
                          <div style={{ color:'var(--muted)', fontSize:12 }}>{exp.hypothesis}</div>
                        </td>
                        <td><code style={{ fontSize:12 }}>{exp.metric}</code></td>
                        <td style={{ fontSize:12 }}>{exp.variants.map(v=>v.name).join(' vs ')}</td>
                        <td>
                          <span className={`badge ${
                            exp.status==='running'   ? 'badge-green'
                          : exp.status==='draft'     ? 'badge-gray'
                          : exp.status==='paused'    ? 'badge-yellow'
                          : 'badge-blue'
                          }`}>{exp.status}</span>
                        </td>
                        <td style={{ fontSize:12, color:'var(--accent2)' }}>
                          {exp.winner ?? '—'}
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:8 }}>
                            <button className="btn btn-ghost" style={{ padding:'4px 10px' }}
                              onClick={() => loadExpResults(exp.id)}>Results</button>
                            {user.role === 'admin' && exp.status === 'draft' && (
                              <button className="btn btn-success" style={{ padding:'4px 10px' }}
                                onClick={() => updateExpStatus(exp.id, 'running')}>Start</button>
                            )}
                            {user.role === 'admin' && exp.status === 'running' && (
                              <button className="btn btn-ghost" style={{ padding:'4px 10px' }}
                                onClick={() => updateExpStatus(exp.id, 'paused')}>Pause</button>
                            )}
                            {user.role === 'admin' && ['running','paused'].includes(exp.status) && (
                              <button className="btn btn-danger" style={{ padding:'4px 10px' }}
                                onClick={() => updateExpStatus(exp.id, 'concluded')}>Conclude</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedExp && expResults.length > 0 && (
                <div className="card">
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:16 }}>📊 Experiment Results</div>
                  <table>
                    <thead><tr>
                      <th>Variant</th><th>Exposures</th><th>Conversions</th>
                      <th>Conv. Rate</th><th>Relative Lift</th><th>p-value</th>
                      <th>Significant?</th><th>95% CI</th>
                    </tr></thead>
                    <tbody>
                      {expResults.map(r => (
                        <tr key={r.variantKey}>
                          <td style={{ fontWeight:600 }}>
                            <span className={`badge ${r.variantKey==='control'?'badge-gray':'badge-blue'}`}>
                              {r.variantKey}
                            </span>
                          </td>
                          <td>{r.exposures.toLocaleString()}</td>
                          <td>{r.conversions.toLocaleString()}</td>
                          <td>{(r.conversionRate * 100).toFixed(2)}%</td>
                          <td>
                            {r.relativeLift !== null
                              ? <span style={{ color: r.relativeLift >= 0 ? 'var(--accent2)' : 'var(--danger)' }}>
                                  {r.relativeLift >= 0 ? '+' : ''}{(r.relativeLift*100).toFixed(1)}%
                                </span>
                              : '—'}
                          </td>
                          <td>
                            {r.pValue !== null
                              ? <span className={r.significant?'sig-yes':'sig-no'}>
                                  {r.pValue.toFixed(4)}
                                </span>
                              : '—'}
                          </td>
                          <td>
                            {r.significant !== undefined && r.pValue !== null
                              ? <span className={r.significant?'sig-yes':'sig-no'}>
                                  {r.significant ? '✅ Yes (p<0.05)' : '❌ No'}
                                </span>
                              : '—'}
                          </td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>
                            {r.confidenceInterval
                              ? `[${(r.confidenceInterval[0]*100).toFixed(2)}%, ${(r.confidenceInterval[1]*100).toFixed(2)}%]`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ color:'var(--muted)', fontSize:12, marginTop:12 }}>
                    Statistical test: two-proportion z-test. Significance threshold: p &lt; 0.05.
                    95% confidence interval on absolute lift (treatment − control).
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── AUDIT TAB ── */}
      {tab === 'audit' && (
        <div className="table-wrap">
          {auditLogs.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-title">No audit events yet</div>
              <div>All flag and experiment changes will appear here.</div>
            </div>
          ) : (
            <table>
              <thead><tr>
                <th>Time</th><th>Actor</th><th>Action</th><th>Target Type</th><th>Target ID</th>
              </tr></thead>
              <tbody>
                {auditLogs.map((log: AuditLog) => (
                  <tr key={log.id}>
                    <td style={{ color:'var(--muted)', fontSize:12 }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontSize:12 }}>{log.actor_email ?? 'system'}</td>
                    <td><code style={{ fontSize:12, color:'var(--accent)' }}>{log.action}</code></td>
                    <td style={{ fontSize:12 }}>{log.target_type}</td>
                    <td style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace' }}>
                      {String(log.target_id).slice(0,8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── SDK GUIDE TAB ── */}
      {tab === 'sdk' && (
        <div className="card" style={{ maxWidth:760 }}>
          <h2 style={{ marginBottom:20, fontSize:18 }}>📖 FlagForge SDK Guide</h2>

          <h3 style={{ color:'var(--accent)', marginBottom:8 }}>1. Evaluate a single flag</h3>
          <pre style={{ background:'var(--bg)', padding:16, borderRadius:8, overflowX:'auto', fontSize:12, marginBottom:20 }}>
{`const res = await fetch('https://your-domain.com/api/evaluate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sdk_dev_changeme',
  },
  body: JSON.stringify({
    flagKey: 'new-checkout-flow',
    userId: 'user_abc123',
    environment: 'production',
    attributes: { country: 'US', plan: 'pro' },
  }),
})

const { enabled, variant, reason } = await res.json()
// enabled: true/false
// variant: 'treatment' | null
// reason: 'rule_match' | 'rollout' | 'not_in_rollout' | 'disabled'`}
          </pre>

          <h3 style={{ color:'var(--accent)', marginBottom:8 }}>2. Bulk evaluate (up to 50 flags)</h3>
          <pre style={{ background:'var(--bg)', padding:16, borderRadius:8, overflowX:'auto', fontSize:12, marginBottom:20 }}>
{`const res = await fetch('https://your-domain.com/api/evaluate', {
  method: 'PUT',
  headers: { ... },
  body: JSON.stringify({
    flagKeys: ['new-checkout-flow', 'dark-mode', 'ai-suggestions'],
    userId: 'user_abc123',
    environment: 'production',
    attributes: { plan: 'pro' },
  }),
})
const { evaluations } = await res.json()
// evaluations['new-checkout-flow'].enabled => true/false`}
          </pre>

          <h3 style={{ color:'var(--accent)', marginBottom:8 }}>3. Track experiment events</h3>
          <pre style={{ background:'var(--bg)', padding:16, borderRadius:8, overflowX:'auto', fontSize:12, marginBottom:20 }}>
{`// Track exposure (deduplicated — safe to call multiple times)
await fetch('https://your-domain.com/api/events', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sdk_dev_changeme' },
  body: JSON.stringify({
    experimentId: 'exp_uuid',
    userId: 'user_abc123',
    variantKey: 'treatment',
    eventType: 'exposure',
  }),
})

// Track conversion
await fetch('https://your-domain.com/api/events', {
  method: 'POST',
  ...,
  body: JSON.stringify({ ..., eventType: 'conversion' }),
})`}
          </pre>

          <h3 style={{ color:'var(--accent)', marginBottom:8 }}>4. Bucketing algorithm</h3>
          <p style={{ color:'var(--muted)', fontSize:13, lineHeight:1.7 }}>
            Users are assigned to rollout buckets deterministically using FNV-1a 32-bit hash
            on <code>userId:flagKey</code>. This means the same user always gets the same
            flag value (sticky assignment), with excellent distribution uniformity across 0–99
            without requiring a database lookup for every evaluation.
          </p>
        </div>
      )}

      {/* ── NEW FLAG MODAL ── */}
      {showFlagModal && (
        <div className="modal-backdrop" onClick={()=>setShowFlagModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">New Feature Flag</div>
              <button className="modal-close" onClick={()=>setShowFlagModal(false)}>×</button>
            </div>
            <form onSubmit={createFlag}>
              <div className="form-group">
                <label>Flag Key (slug)</label>
                <input value={nfKey} onChange={e=>setNfKey(e.target.value.toLowerCase().replace(/\s/g,'-'))}
                  placeholder="new-checkout-flow" required pattern="[a-z0-9_-]+" />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input value={nfName} onChange={e=>setNfName(e.target.value)}
                  placeholder="New Checkout Flow" required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={nfDesc} onChange={e=>setNfDesc(e.target.value)}
                  placeholder="What does this flag control?" rows={2} />
              </div>
              <div className="form-group">
                <label>Staging Rollout % ({nfPct}%)</label>
                <input type="range" min={0} max={100} value={nfPct}
                  onChange={e=>setNfPct(Number(e.target.value))} />
                <div className="rollout-bar">
                  <div className="rollout-fill" style={{ width:`${nfPct}%` }} />
                </div>
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
                🟢 Development: always ON (100%)&nbsp;&nbsp;
                🟡 Staging: {nfPct}% rollout&nbsp;&nbsp;
                🔴 Production: OFF (enable manually)
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={()=>setShowFlagModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Flag</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── NEW EXPERIMENT MODAL ── */}
      {showExpModal && (
        <div className="modal-backdrop" onClick={()=>setShowExpModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">New A/B Experiment</div>
              <button className="modal-close" onClick={()=>setShowExpModal(false)}>×</button>
            </div>
            <form onSubmit={createExperiment}>
              <div className="form-group">
                <label>Experiment Name</label>
                <input value={neName} onChange={e=>setNeName(e.target.value)}
                  placeholder="New Checkout Button Colour" required />
              </div>
              <div className="form-group">
                <label>Hypothesis</label>
                <textarea value={neHyp} onChange={e=>setNeHyp(e.target.value)}
                  placeholder="Changing the CTA from grey to green will increase checkout conversion by 5%."
                  rows={2} required />
              </div>
              <div className="form-group">
                <label>Primary Metric</label>
                <input value={neMet} onChange={e=>setNeMet(e.target.value)}
                  placeholder="conversion" required />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group">
                  <label>Control Variant Name</label>
                  <input value={neCtrl} onChange={e=>setNeCtrl(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Treatment Variant Name</label>
                  <input value={neTreat} onChange={e=>setNeTreat(e.target.value)} required />
                </div>
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={()=>setShowExpModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Experiment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
