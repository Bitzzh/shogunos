import React, { useEffect, useState, useRef } from 'react'

type Props = { onDone: (user: { username: string; role: string; display_name: string }) => void }

// Shogun palette — ink, lacquer, aged gold (matches App.tsx)
const C = {
  bg0: '#060406', bg1: '#0b090b', bg2: '#100e10', bg3: '#151215', bg4: '#1b181b', bg5: '#211e21',
  b0: '#1e1a1e', b1: '#272227', b2: '#332e33',
  p1: '#8b1a1a', p2: '#b22222', p3: '#d44',
  g1: '#7a6218', g2: '#b8952a', g3: '#d4af5a',
  t1: '#e8e2d8', t2: '#a89e8e', t3: '#5a5048', t4: '#322c28',
  live: '#b22222', safe: '#4a7c59', warn: '#b8952a',
}

export default function Splash({ onDone }: Props) {
  const [phase, setPhase]           = useState(0)
  const [username, setUsername]     = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [success, setSuccess]       = useState<{ display_name: string; role: string } | null>(null)
  const [showPw, setShowPw]         = useState(false)
  // Forced password change state
  const [pendingUser, setPendingUser] = useState<{ id: number; display_name: string; role: string } | null>(null)
  const [newPw, setNewPw]           = useState('')
  const [newPw2, setNewPw2]         = useState('')
  const [showNewPw, setShowNewPw]   = useState(false)
  const [pwError, setPwError]       = useState('')
  const [pwSaving, setPwSaving]     = useState(false)
  const [embers, setEmbers]         = useState<{ x:number;y:number;size:number;speed:number;opacity:number;gold:boolean }[]>([])
  const canvasRef                   = useRef<HTMLCanvasElement>(null)
  const animRef                     = useRef<number>(0)
  const userRef                     = useRef<HTMLInputElement>(null)
  const pwRef                       = useRef<HTMLInputElement>(null)

  // Ember / ash particle system
  useEffect(() => {
    const ps = Array.from({ length: 40 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100 + 100,
      size: Math.random() * 2.2 + 0.6,
      speed: Math.random() * 0.15 + 0.05,
      opacity: Math.random() * 0.5 + 0.1,
      gold: Math.random() > 0.4,
    }))
    setEmbers(ps)
  }, [])

  // Canvas background — ink wash + faint grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0

    function resize() {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Ink-wash glow, upper left — lacquer red, very subdued
      const grad1 = ctx.createRadialGradient(canvas.width * 0.22, canvas.height * 0.3, 0, canvas.width * 0.22, canvas.height * 0.3, canvas.width * 0.5)
      grad1.addColorStop(0, `hsla(0,45%,18%,${0.22 + Math.sin(t * 0.018) * 0.06})`)
      grad1.addColorStop(1, 'transparent')
      ctx.fillStyle = grad1
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Aged gold glow, lower right
      const grad2 = ctx.createRadialGradient(canvas.width * 0.78, canvas.height * 0.72, 0, canvas.width * 0.78, canvas.height * 0.72, canvas.width * 0.42)
      grad2.addColorStop(0, `hsla(42,55%,22%,${0.16 + Math.sin(t * 0.014 + 1) * 0.05})`)
      grad2.addColorStop(1, 'transparent')
      ctx.fillStyle = grad2
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Faint washi-grid
      ctx.strokeStyle = 'rgba(184,149,42,0.035)'
      ctx.lineWidth = 1
      const gridSize = 46
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
      }

      t++
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  // Entrance sequence
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 650),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 1750),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (phase >= 4) setTimeout(() => userRef.current?.focus(), 100)
  }, [phase])

  async function handleLogin() {
    if (!username.trim()) { setError('Enter your username'); userRef.current?.focus(); return }
    if (!password.trim()) { setError('Enter your password'); pwRef.current?.focus(); return }
    setLoading(true); setError('')
    try {
      const result = await (window as any).shogunos.login(username.trim(), password)
      if (result.success) {
        if (result.user.must_change_password) {
          setPendingUser({ id: result.user.id, display_name: result.user.display_name, role: result.user.role })
          setLoading(false)
        } else {
          setSuccess(result.user)
          setTimeout(() => onDone(result.user), 1200)
        }
      } else {
        setError(result.error === 'User not found' ? 'Username not recognised' : 'Incorrect password')
        setLoading(false)
        if (result.error !== 'User not found') { setPassword(''); setTimeout(() => pwRef.current?.focus(), 50) }
        else setTimeout(() => { userRef.current?.focus(); userRef.current?.select() }, 50)
      }
    } catch {
      setError('Connection error — restart the app')
      setLoading(false)
    }
  }

  async function handleForcedChange() {
    setPwError('')
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
    if (newPw === 'changeme') { setPwError('Please choose a different password'); return }
    if (newPw !== newPw2) { setPwError('Passwords do not match'); return }
    setPwSaving(true)
    try {
      const res = await (window as any).shogunos.forcedChangePassword(pendingUser!.id, newPw)
      if (res.success) {
        const user = { ...pendingUser!, must_change_password: false }
        setSuccess(user)
        setTimeout(() => onDone(user), 1200)
      } else {
        setPwError(res.error || 'Failed to update password')
        setPwSaving(false)
      }
    } catch {
      setPwError('Connection error — restart the app')
      setPwSaving(false)
    }
  }

  const trans = (show: boolean, delay = 0) => ({
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0)' : 'translateY(18px)',
    transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
  })

  // A hairline "torii" divider — a rule with two short posts, evoking a gate
  const ToriiRule = ({ delay = 0, width = 72 }: { delay?: number; width?: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...trans(phase >= 2, delay) }}>
      <div style={{ width: 2, height: 10, background: C.g2, opacity: 0.7 }} />
      <div style={{ width, height: 2, background: `linear-gradient(to right,${C.p2},${C.g2})` }} />
      <div style={{ width: 2, height: 10, background: C.g2, opacity: 0.7 }} />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg0, display: 'flex', fontFamily: "'Noto Serif JP','Inter','Segoe UI',serif", overflow: 'hidden', color: C.t1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;700&display=swap');
        @keyframes shimmer { 0%{left:-100%} 60%,100%{left:150%} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes drift   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        input::placeholder { color: ${C.t3} }
        input:focus { border-color: ${C.g2}aa !important; box-shadow: 0 0 0 3px ${C.g1}22 !important; }
      `}</style>

      {/* Canvas background */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Drifting embers */}
      {embers.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${p.x}%`,
          top: `${(100 - (Date.now() * p.speed * 0.001 % 120))}%`,
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: p.gold ? C.g3 : C.p3,
          opacity: p.opacity,
          animation: `drift ${5 + p.speed * 10}s ease-in-out ${i * 0.3}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Gold hairline top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent 0%,${C.g2}88 30%,${C.g3} 50%,${C.g2}88 70%,transparent 100%)`, zIndex: 2 }} />

      {/* LEFT — Branding, generously spaced */}
      <div style={{
        width: 480, flexShrink: 0, position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '64px 64px',
        borderRight: `1px solid ${C.b0}`,
        ...trans(phase >= 1),
      }}>
        {/* Seal / logo mark */}
        <div style={{ marginBottom: 40, animation: 'drift 7s ease-in-out infinite' }}>
          <svg width="84" height="84" viewBox="0 0 100 100">
            <defs>
              <radialGradient id="sl1" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stopColor={C.bg3}/>
                <stop offset="100%" stopColor={C.bg0}/>
              </radialGradient>
              <linearGradient id="sl2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={C.p2}/>
                <stop offset="50%" stopColor={C.g2}/>
                <stop offset="100%" stopColor={C.p2}/>
              </linearGradient>
              <linearGradient id="sl3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.g3}/>
                <stop offset="100%" stopColor={C.g1}/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="url(#sl1)" stroke="url(#sl2)" strokeWidth="2"/>
            <circle cx="50" cy="50" r="38" fill="none" stroke={`${C.g2}33`} strokeWidth="1"/>
            <circle cx="50" cy="50" r="28" fill="none" stroke={`${C.p2}22`} strokeWidth="1"/>
            <text x="50" y="67" textAnchor="middle" fontSize="46" fill="url(#sl3)" fontFamily="'Noto Serif JP',serif" fontWeight="700">将</text>
          </svg>
        </div>

        {/* App name */}
        <div style={{ ...trans(phase >= 2, 0.1), marginBottom: 22 }}>
          <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.05, marginBottom: 10, fontFamily: "'Noto Serif JP',serif" }}>
            <span style={{ color: C.t1 }}>将軍</span>
            <span style={{ color: C.g3 }}>OS</span>
          </div>
          <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.42em', fontWeight: 500 }}>MULTIMEDIA PRESENTATION SYSTEM</div>
        </div>

        {/* Torii divider */}
        <div style={{ marginBottom: 32 }}>
          <ToriiRule delay={0.15} />
        </div>

        {/* Tagline */}
        <div style={{ ...trans(phase >= 3, 0.1), marginBottom: 44 }}>
          <div style={{ fontSize: 21, color: C.t1, fontWeight: 600, lineHeight: 1.5, marginBottom: 16 }}>
            Command the room<br />
            <span style={{ color: C.g3 }}>like a general commands the field.</span>
          </div>
          <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.85, maxWidth: 320 }}>
            From a former Lingfield student — forged with discipline,
            delivered with precision. This is how worship meets technology.
          </div>
        </div>

        {/* Seal badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...trans(phase >= 3, 0.3) }}>
          <div style={{ padding: '9px 16px', background: `${C.p1}18`, border: `1px solid ${C.p2}55`, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.safe, boxShadow: `0 0 8px ${C.safe}` }} />
            <span style={{ fontSize: 10, color: C.g3, fontWeight: 700, letterSpacing: '0.18em' }}>初撰 · RONIN EDITION · v1.0</span>
          </div>
        </div>
      </div>

      {/* RIGHT — Login, generously spaced */}
      <div style={{
        flex: 1, position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '64px 40px',
        ...trans(phase >= 3, 0.2),
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {success ? (
            /* Success state */
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: `${C.safe}14`, border: `2px solid ${C.safe}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', fontSize: 30 }}>✓</div>
              <div style={{ fontSize: 13, color: C.safe, fontWeight: 700, letterSpacing: '0.24em', marginBottom: 12 }}>ACCESS GRANTED</div>
              <div style={{ fontSize: 22, color: C.t1, fontWeight: 600, marginBottom: 8, fontFamily: "'Noto Serif JP',serif" }}>{success.display_name}</div>
              <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.1em' }}>{success.role} · Entering the hall...</div>
              <div style={{ marginTop: 28, width: 220, height: 2, background: C.b1, margin: '28px auto 0', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '100%', width: '60%', background: `linear-gradient(to right,${C.p2},${C.g2})`, animation: 'shimmer 1s ease forwards', position: 'absolute' }} />
              </div>
            </div>
          ) : pendingUser ? (
            /* Forced password change */
            <div>
              <div style={{ marginBottom: 36 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: `${C.g1}22`, border: `1px solid ${C.g2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 20 }}>🔑</div>
                <div style={{ fontSize: 11, color: C.g3, letterSpacing: '0.24em', fontWeight: 700, marginBottom: 12 }}>ACTION REQUIRED</div>
                <div style={{ fontSize: 29, fontWeight: 700, color: C.t1, letterSpacing: '0.01em', marginBottom: 12, fontFamily: "'Noto Serif JP',serif" }}>Set your password</div>
                <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.75 }}>
                  Welcome, <span style={{ color: C.g3 }}>{pendingUser.display_name}</span>. This is a default account — choose a strong password before you take the field.
                </div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.1em', display: 'block', marginBottom: 10 }}>NEW PASSWORD</label>
                <div style={{ position: 'relative' }}>
                  <input
                    autoFocus
                    type={showNewPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => { setNewPw(e.target.value); setPwError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleForcedChange()}
                    placeholder="Min. 8 characters"
                    style={{ width: '100%', background: C.bg2, border: `1px solid ${C.b1}`, color: C.t1, padding: '16px 50px 16px 18px', fontSize: 14, outline: 'none', fontFamily: 'inherit', borderRadius: 4, transition: 'all 0.2s' }}
                  />
                  <button onClick={() => setShowNewPw(s => !s)} tabIndex={-1} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: 16, padding: 0 }}>
                    {showNewPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: 26 }}>
                <label style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.1em', display: 'block', marginBottom: 10 }}>CONFIRM PASSWORD</label>
                <input
                  type="password"
                  value={newPw2}
                  onChange={e => { setNewPw2(e.target.value); setPwError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleForcedChange()}
                  placeholder="Repeat new password"
                  style={{ width: '100%', background: C.bg2, border: `1px solid ${C.b1}`, color: C.t1, padding: '16px 18px', fontSize: 14, outline: 'none', fontFamily: 'inherit', borderRadius: 4, transition: 'all 0.2s' }}
                />
              </div>
              <div style={{ minHeight: 22, marginBottom: 20 }}>
                {pwError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.p2, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: C.p3 }}>{pwError}</span>
                  </div>
                )}
              </div>
              <button onClick={handleForcedChange} disabled={pwSaving} style={{ width: '100%', padding: '17px 0', background: pwSaving ? `${C.p1}66` : `linear-gradient(135deg,${C.p2},${C.p1})`, border: `1px solid ${C.g2}55`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: pwSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', borderRadius: 4, letterSpacing: '0.1em' }}>
                {pwSaving ? 'Saving…' : 'Set Password & Continue'}
              </button>
              <div style={{ marginTop: 22, fontSize: 11, color: C.t4, textAlign: 'center', lineHeight: 1.75 }}>
                This password protects your church's ShogunOS installation.<br />Store it somewhere safe.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 44, ...trans(phase >= 4, 0.1) }}>
                <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.34em', fontWeight: 600, marginBottom: 14 }}>SECURE ACCESS</div>
                <div style={{ fontSize: 34, fontWeight: 700, color: C.t1, letterSpacing: '0.01em', fontFamily: "'Noto Serif JP',serif" }}>入門 · Sign in</div>
                <div style={{ fontSize: 13, color: C.t3, marginTop: 10, lineHeight: 1.6 }}>Present your credentials to enter the system</div>
              </div>

              {/* Username */}
              <div style={{ marginBottom: 24, ...trans(phase >= 4, 0.15) }}>
                <label style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.1em', display: 'block', marginBottom: 10 }}>USERNAME</label>
                <input
                  ref={userRef}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && pwRef.current?.focus()}
                  placeholder="Enter username"
                  disabled={loading}
                  style={{ width: '100%', background: C.bg2, border: `1px solid ${C.b1}`, color: C.t1, padding: '16px 18px', fontSize: 14, outline: 'none', fontFamily: 'inherit', borderRadius: 4, transition: 'all 0.2s' }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 36, ...trans(phase >= 4, 0.2) }}>
                <label style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.1em', display: 'block', marginBottom: 10 }}>PASSWORD</label>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={pwRef}
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="••••••••"
                    disabled={loading}
                    style={{ width: '100%', background: C.bg2, border: `1px solid ${C.b1}`, color: C.t1, padding: '16px 50px 16px 18px', fontSize: 14, outline: 'none', fontFamily: 'inherit', borderRadius: 4, transition: 'all 0.2s' }}
                  />
                  <button onClick={() => setShowPw(s => !s)} tabIndex={-1} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: 16, padding: 0 }}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {/* Error */}
              <div style={{ minHeight: 22, marginBottom: 20, ...trans(phase >= 4) }}>
                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.p2, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: C.p3 }}>{error}</span>
                  </div>
                )}
              </div>

              {/* Submit — lacquer seal button */}
              <button onClick={handleLogin} disabled={loading} style={{ ...trans(phase >= 4, 0.25), width: '100%', padding: '18px 0', background: loading ? `${C.p1}66` : `linear-gradient(135deg,${C.p2},${C.p1})`, border: `1px solid ${C.g2}66`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', borderRadius: 4, letterSpacing: '0.12em', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 14 }}>◌</span>
                    AUTHENTICATING...
                  </span>
                ) : 'ENTER THE HALL'}
                {!loading && (
                  <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: `linear-gradient(to right,transparent,${C.g3}22,transparent)`, transform: 'skewX(-20deg)', animation: 'shimmer 3s ease infinite' }} />
                )}
              </button>

              {/* Footer */}
              <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...trans(phase >= 4, 0.3) }}>
                <span style={{ fontSize: 10, color: C.t4, letterSpacing: '0.1em' }}>ShogunOS · Ronin Edition · 2024</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.safe, boxShadow: `0 0 6px ${C.safe}` }} />
                  <span style={{ fontSize: 10, color: C.t4 }}>SYSTEM READY</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}