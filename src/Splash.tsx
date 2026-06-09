import React, { useEffect, useState, useRef } from 'react'

type Props = { onDone: (user: { username: string; role: string; display_name: string }) => void }

const C = {
  bg:     '#08080f',
  panel:  '#0d0d16',
  border: '#1a1a2e',
  purple: '#7c3aed',
  purpleL:'#a78bfa',
  gold:   '#f59e0b',
  goldL:  '#fcd34d',
  white:  '#f8f8ff',
  muted:  '#6b7280',
  dim:    '#374151',
  red:    '#ef4444',
  green:  '#22c55e',
}

export default function Splash({ onDone }: Props) {
  const [phase, setPhase]           = useState(0)
  const [username, setUsername]     = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [success, setSuccess]       = useState<{ display_name: string; role: string } | null>(null)
  const [showPw, setShowPw]         = useState(false)
  const [particles, setParticles]   = useState<{ x:number;y:number;size:number;speed:number;opacity:number;hue:number }[]>([])
  const canvasRef                   = useRef<HTMLCanvasElement>(null)
  const animRef                     = useRef<number>(0)
  const userRef                     = useRef<HTMLInputElement>(null)
  const pwRef                       = useRef<HTMLInputElement>(null)

  // Particle system
  useEffect(() => {
    const ps = Array.from({ length: 60 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100 + 100,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.15 + 0.05,
      opacity: Math.random() * 0.6 + 0.1,
      hue: Math.random() > 0.5 ? 270 : 45, // purple or gold
    }))
    setParticles(ps)
  }, [])

  // Canvas animation
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

      // Animated aurora background
      const grad1 = ctx.createRadialGradient(canvas.width * 0.3, canvas.height * 0.4, 0, canvas.width * 0.3, canvas.height * 0.4, canvas.width * 0.5)
      grad1.addColorStop(0, `hsla(270,70%,20%,${0.3 + Math.sin(t * 0.02) * 0.1})`)
      grad1.addColorStop(1, 'transparent')
      ctx.fillStyle = grad1
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const grad2 = ctx.createRadialGradient(canvas.width * 0.7, canvas.height * 0.6, 0, canvas.width * 0.7, canvas.height * 0.6, canvas.width * 0.4)
      grad2.addColorStop(0, `hsla(45,80%,30%,${0.2 + Math.sin(t * 0.015 + 1) * 0.08})`)
      grad2.addColorStop(1, 'transparent')
      ctx.fillStyle = grad2
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Grid lines
      ctx.strokeStyle = 'rgba(124,58,237,0.04)'
      ctx.lineWidth = 1
      const gridSize = 40
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
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 1600),
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
        setSuccess(result.user)
        setTimeout(() => onDone(result.user), 1200)
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

  const trans = (show: boolean, delay = 0) => ({
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0)' : 'translateY(16px)',
    transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', fontFamily: "'Inter','Segoe UI',sans-serif", overflow: 'hidden' }}>
      <style>{`
        @keyframes shimmer { 0%{left:-100%} 60%,100%{left:150%} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes glow    { 0%,100%{box-shadow:0 0 20px rgba(124,58,237,0.3)} 50%{box-shadow:0 0 40px rgba(124,58,237,0.6)} }
        input::placeholder { color: #374151 }
        input:focus { border-color: rgba(124,58,237,0.6) !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.1) !important; }
      `}</style>

      {/* Canvas background */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${p.x}%`,
          top: `${(100 - (Date.now() * p.speed * 0.001 % 120))}%`,
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: `hsl(${p.hue}, 70%, 60%)`,
          opacity: p.opacity,
          animation: `float ${4 + p.speed * 10}s ease-in-out ${i * 0.3}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* LEFT — Branding */}
      <div style={{
        width: 440, flexShrink: 0, position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px 50px',
        borderRight: '1px solid rgba(124,58,237,0.15)',
        ...trans(phase >= 1),
      }}>
        {/* Logo mark */}
        <div style={{ marginBottom: 32, animation: 'float 6s ease-in-out infinite' }}>
          <svg width="80" height="80" viewBox="0 0 100 100">
            <defs>
              <radialGradient id="sl1" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#1a0a2e"/>
                <stop offset="100%" stopColor="#08080f"/>
              </radialGradient>
              <linearGradient id="sl2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c3aed"/>
                <stop offset="50%" stopColor="#f59e0b"/>
                <stop offset="100%" stopColor="#7c3aed"/>
              </linearGradient>
              <linearGradient id="sl3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fcd34d"/>
                <stop offset="100%" stopColor="#d97706"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="url(#sl1)" stroke="url(#sl2)" strokeWidth="2"/>
            <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(124,58,237,0.2)" strokeWidth="1"/>
            <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(245,158,11,0.1)" strokeWidth="1"/>
            <text x="50" y="66" textAnchor="middle" fontSize="44" fill="url(#sl3)" fontFamily="serif" fontWeight="700">将</text>
          </svg>
        </div>

        {/* App name */}
        <div style={{ ...trans(phase >= 2, 0.1) }}>
          <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6 }}>
            <span style={{ color: C.white }}>SHOGUN</span>
            <span style={{ background: 'linear-gradient(135deg,#7c3aed,#f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>OS</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.4em', marginBottom: 28, fontWeight: 500 }}>MULTIMEDIA PRESENTATION SYSTEM</div>
        </div>

        {/* Divider */}
        <div style={{ width: 64, height: 2, background: 'linear-gradient(to right,#7c3aed,#f59e0b)', marginBottom: 28, ...trans(phase >= 2, 0.2) }} />

        {/* Tagline */}
        <div style={{ ...trans(phase >= 3, 0.1) }}>
          <div style={{ fontSize: 20, color: C.white, fontWeight: 600, lineHeight: 1.4, marginBottom: 12 }}>
            Built for those who<br />
            <span style={{ color: C.purpleL }}>command the room.</span>
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, maxWidth: 300 }}>
            From a former Lingfield student — crafted with obsession, 
            delivered with precision. This is how worship meets technology.
          </div>
        </div>

        {/* Version badge */}
        <div style={{ marginTop: 40, display: 'inline-flex', alignItems: 'center', gap: 8, ...trans(phase >= 3, 0.3) }}>
          <div style={{ padding: '6px 12px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
            <span style={{ fontSize: 10, color: C.purpleL, fontWeight: 700, letterSpacing: '0.15em' }}>v1.0 · RONIN EDITION</span>
          </div>
        </div>
      </div>

      {/* RIGHT — Login */}
      <div style={{
        flex: 1, position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px 80px',
        ...trans(phase >= 3, 0.2),
      }}>
        {/* Top accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(to right,transparent,#7c3aed,#f59e0b,#7c3aed,transparent)' }} />

        {success ? (
          /* Success state */
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
            <div style={{ fontSize: 13, color: C.green, fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>ACCESS GRANTED</div>
            <div style={{ fontSize: 20, color: C.white, fontWeight: 600, marginBottom: 6 }}>{success.display_name}</div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em' }}>{success.role} · Loading workspace...</div>
            <div style={{ marginTop: 20, width: 200, height: 2, background: C.border, margin: '20px auto 0', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: `linear-gradient(to right,${C.purple},${C.gold})`, animation: 'shimmer 1s ease forwards', position: 'relative' }} />
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 380 }}>
            <div style={{ marginBottom: 36, ...trans(phase >= 4, 0.1) }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.3em', fontWeight: 600, marginBottom: 10 }}>SECURE ACCESS</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.white, letterSpacing: '-0.01em' }}>Sign in</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Enter your credentials to access the system</div>
            </div>

            {/* Username */}
            <div style={{ marginBottom: 18, ...trans(phase >= 4, 0.15) }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>USERNAME</label>
              <input
                ref={userRef}
                value={username}
                onChange={e => { setUsername(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && pwRef.current?.focus()}
                placeholder="Enter username"
                disabled={loading}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: C.white, padding: '14px 16px', fontSize: 14, outline: 'none', fontFamily: 'inherit', borderRadius: 10, transition: 'all 0.2s' }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 28, ...trans(phase >= 4, 0.2) }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>PASSWORD</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={pwRef}
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••"
                  disabled={loading}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: C.white, padding: '14px 48px 14px 16px', fontSize: 14, outline: 'none', fontFamily: 'inherit', borderRadius: 10, transition: 'all 0.2s' }}
                />
                <button onClick={() => setShowPw(s => !s)} tabIndex={-1} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, padding: 0 }}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Error */}
            <div style={{ minHeight: 20, marginBottom: 16, ...trans(phase >= 4) }}>
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.red }}>{error}</span>
                </div>
              )}
            </div>

            {/* Submit */}
            <button onClick={handleLogin} disabled={loading} style={{ ...trans(phase >= 4, 0.25), width: '100%', padding: '15px 0', background: loading ? 'rgba(124,58,237,0.4)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', borderRadius: 10, letterSpacing: '0.1em', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 14 }}>◌</span>
                  AUTHENTICATING...
                </span>
              ) : 'ENTER THE SYSTEM'}
              {!loading && (
                <div style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(to right,transparent,rgba(255,255,255,0.08),transparent)', transform: 'skewX(-20deg)', animation: 'shimmer 3s ease infinite' }} />
              )}
            </button>

            {/* Footer */}
            <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...trans(phase >= 4, 0.3) }}>
              <span style={{ fontSize: 10, color: C.dim, letterSpacing: '0.08em' }}>ShogunOS · Ronin Edition · 2024</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                <span style={{ fontSize: 10, color: C.dim }}>SYSTEM READY</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}