import React, { useState, useEffect } from 'react'

// ── Colour tokens (matching App.tsx) ─────────────────────────────────────────
const C = {
  bg0: '#060609', bg1: '#0b0b12', bg2: '#101018', bg3: '#16161f', bg4: '#1d1d28', bg5: '#242433',
  b0: '#1a1a2a', b1: '#222235', b2: '#2d2d45',
  p1: '#7c3aed', p2: '#9f67f5', p3: '#c4a7f8',
  g1: '#d97706', g2: '#f59e0b', g3: '#fcd34d',
  t1: '#f0eff8', t2: '#a09fbe', t3: '#5a5875', t4: '#35344a',
  live: '#ef4444', safe: '#22c55e', warn: '#f59e0b',
}

type Role = 'ADMIN' | 'OPERATOR' | 'PRESENTER' | 'VIEWER'

interface User {
  id: number
  username: string
  display_name: string
  role: Role
  created_at: string
  last_login: string | null
}

const ROLES: Role[] = ['ADMIN', 'OPERATOR', 'PRESENTER', 'VIEWER']

const ROLE_META: Record<Role, { color: string; desc: string }> = {
  ADMIN:     { color: C.live,  desc: 'Full access — manage users, settings, all content' },
  OPERATOR:  { color: C.p2,   desc: 'Run services, control live output, edit queue' },
  PRESENTER: { color: C.g2,   desc: 'Present slides, browse library, go live' },
  VIEWER:    { color: C.t3,   desc: 'View-only — no editing or live control' },
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', background: C.bg4, border: `1px solid ${C.b1}`,
  color: C.t1, padding: '9px 12px', fontSize: 12, outline: 'none',
  fontFamily: 'inherit', borderRadius: 8, boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontSize: 10, color: C.t3, fontWeight: 600, marginBottom: 6,
  display: 'block', letterSpacing: '0.05em', textTransform: 'uppercase',
}
const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({
  padding: '8px 18px', background: bg, border: 'none', color: fg,
  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  borderRadius: 7, letterSpacing: '0.06em',
})
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px', background: 'none', border: `1px solid ${C.b2}`,
  color: C.t2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 7,
}

// ── Subcomponent: Add User form ───────────────────────────────────────────────
function AddUserForm({ onAdded, notify }: { onAdded: () => void; notify: (m: string) => void }) {
  const api = (window as any).shogunos
  const [username, setUsername]       = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword]       = useState('')
  const [role, setRole]               = useState<Role>('OPERATOR')
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState('')

  async function submit() {
    setErr('')
    if (!username.trim()) { setErr('Username is required'); return }
    if (!password.trim()) { setErr('Password is required'); return }
    setSaving(true)
    const res = await api.createUser(username.trim(), password, role, displayName.trim() || username.trim())
    setSaving(false)
    if (res.success) {
      notify(`User "${username}" created`)
      setUsername(''); setDisplayName(''); setPassword(''); setRole('OPERATOR')
      onAdded()
    } else {
      setErr(res.error || 'Failed to create user')
    }
  }

  return (
    <div style={{ background: C.bg3, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: C.p3, marginBottom: 16, textTransform: 'uppercase' }}>
        + Add New User
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Username</label>
          <input style={inp} value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. john_doe" />
        </div>
        <div>
          <label style={lbl}>Display Name</label>
          <input style={inp} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. John Doe" />
        </div>
        <div>
          <label style={lbl}>Password</label>
          <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" />
        </div>
        <div>
          <label style={lbl}>Role</label>
          <select style={{ ...inp }} value={role} onChange={e => setRole(e.target.value as Role)}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{ color: C.live, fontSize: 11, marginBottom: 10 }}>{err}</div>}
      <button style={btn(C.p1)} onClick={submit} disabled={saving}>
        {saving ? 'Creating…' : 'Create User'}
      </button>
    </div>
  )
}

// ── Subcomponent: Reset Password modal ────────────────────────────────────────
function ResetPasswordModal({ user, onClose, notify }: { user: User; onClose: () => void; notify: (m: string) => void }) {
  const api = (window as any).shogunos
  const [pw, setPw]       = useState('')
  const [pw2, setPw2]     = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState('')

  async function submit() {
    setErr('')
    if (pw.length < 6)   { setErr('Password must be at least 6 characters'); return }
    if (pw !== pw2)       { setErr('Passwords do not match'); return }
    setSaving(true)
    const res = await api.adminResetPassword(user.id, pw)
    setSaving(false)
    if (res.success) { notify(`Password reset for ${user.display_name}`); onClose() }
    else setErr(res.error || 'Reset failed')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.b2}`, borderRadius: 14, padding: 28, width: 360 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 4 }}>Reset Password</div>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 20 }}>
          Setting a new password for <span style={{ color: C.p3 }}>{user.display_name}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={lbl}>New Password</label>
            <input style={inp} type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Min. 6 characters" autoFocus />
          </div>
          <div>
            <label style={lbl}>Confirm Password</label>
            <input style={inp} type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Repeat password" />
          </div>
        </div>
        {err && <div style={{ color: C.live, fontSize: 11, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={ghostBtn} onClick={onClose}>Cancel</button>
          <button style={btn(C.p1)} onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Reset Password'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UsersTab({
  currentUser,
  notify,
}: {
  currentUser: { username: string; role: string; display_name: string }
  notify: (m: string) => void
}) {
  const api = (window as any).shogunos
  const isAdmin = currentUser.role === 'ADMIN'

  const [users, setUsers]             = useState<User[]>([])
  const [loading, setLoading]         = useState(true)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [roleEditing, setRoleEditing] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const res: User[] = await api.getUsers()
    setUsers(res.sort((a, b) => a.id - b.id))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(user: User) {
    if (!confirm(`Delete user "${user.display_name}"? This cannot be undone.`)) return
    const res = await api.deleteUser(user.id)
    if (res.success) { notify(`Deleted ${user.display_name}`); load() }
    else notify(`Error: ${res.error}`)
  }

  async function handleRoleChange(user: User, newRole: Role) {
    if (newRole === user.role) { setRoleEditing(null); return }
    const res = await api.updateUserRole(user.id, newRole)
    if (res.success) { notify(`${user.display_name} is now ${newRole}`); load() }
    else notify(`Error: ${res.error}`)
    setRoleEditing(null)
  }

  function fmtDate(iso: string | null) {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (!isAdmin) {
    return (
      <div style={{ flex: 1, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg1 }}>
        <div style={{ textAlign: 'center', color: C.t3, fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          Admin access required to manage users.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, padding: 28, overflowY: 'auto', background: C.bg1 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: C.t4, textTransform: 'uppercase', marginBottom: 6 }}>
          Settings › User Management
        </div>
        <div style={{ fontSize: 18, fontWeight: 300, color: C.t1 }}>Users</div>
      </div>

      {/* Add user */}
      <AddUserForm onAdded={load} notify={notify} />

      {/* Role legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {ROLES.map(r => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.t3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: ROLE_META[r].color }} />
            <span style={{ color: ROLE_META[r].color, fontWeight: 700 }}>{r}</span>
            <span>— {ROLE_META[r].desc}</span>
          </div>
        ))}
      </div>

      {/* User list */}
      {loading ? (
        <div style={{ color: C.t4, fontSize: 12 }}>Loading…</div>
      ) : users.length === 0 ? (
        <div style={{ color: C.t4, fontSize: 12 }}>No users found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(user => {
            const meta = ROLE_META[user.role]
            const isSelf = user.username.toLowerCase() === currentUser.username.toLowerCase()
            return (
              <div key={user.id} style={{
                background: C.bg3, border: `1px solid ${isSelf ? C.p1 : C.b1}`,
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', background: meta.color + '22',
                  border: `2px solid ${meta.color}`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 15, fontWeight: 700, color: meta.color,
                  flexShrink: 0,
                }}>
                  {user.display_name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{user.display_name}</span>
                    {isSelf && <span style={{ fontSize: 9, color: C.p3, fontWeight: 700, letterSpacing: '0.1em' }}>YOU</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.t3 }}>
                    @{user.username} · Last login: {fmtDate(user.last_login)}
                  </div>
                </div>

                {/* Role selector */}
                <div style={{ flexShrink: 0 }}>
                  {roleEditing === user.id ? (
                    <select
                      style={{ ...inp, width: 'auto', padding: '6px 10px', fontSize: 11 }}
                      defaultValue={user.role}
                      autoFocus
                      onBlur={() => setRoleEditing(null)}
                      onChange={e => handleRoleChange(user, e.target.value as Role)}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <button
                      style={{
                        padding: '4px 10px', borderRadius: 5, border: `1px solid ${meta.color}44`,
                        background: meta.color + '18', color: meta.color,
                        fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em', fontFamily: 'inherit',
                      }}
                      title="Click to change role"
                      onClick={() => setRoleEditing(user.id)}
                    >
                      {user.role}
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    style={{ ...ghostBtn, fontSize: 10 }}
                    onClick={() => setResetTarget(user)}
                    title="Reset password"
                  >
                    🔑 Reset PW
                  </button>
                  {!isSelf && (
                    <button
                      style={{ ...ghostBtn, fontSize: 10, borderColor: C.live + '55', color: C.live }}
                      onClick={() => handleDelete(user)}
                      title="Delete user"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          notify={notify}
        />
      )}
    </div>
  )
}