import React, { useEffect, useState, useRef } from 'react'

type Props = { onDone: (user: { display_name: string }) => void }

// ── Tokyo night palette ──────────────────────────────────────────────────────
// Deep indigo-black ground, signage magenta, signage cyan, neon gold.
// Same tokens used across the whole app (see index.css [data-theme='dark']).
const C = {
  bg0: '#08070f', bg1: '#0e0c1a', bg2: '#120f20', bg3: '#1a1630', bg4: '#241f42', bg5: '#302a56',
  b0: '#1e1a34', b1: '#2e2850', b2: '#453c74',
  p1: '#7a1050', p2: '#ff2d87', p3: '#ff7ab8',
  g1: '#0c3550', g2: '#00c2ff', g3: '#7ee8ff',
  gold: '#ffd23f', goldL: '#ffe27a',
  t1: '#f2eefc', t2: '#cabfe8', t3: '#8b80b8', t4: '#5b5288',
  safe: '#2be08a',
}

// No network access is guaranteed at launch, so this never pulls a webfont —
// it leans on whichever CJK-capable serif font the OS already ships with
// (Yu Mincho/MS Mincho on Windows, Hiragino Mincho on macOS, Noto Serif CJK
// on most Linux distros) before falling back to a plain serif.
const SERIF_STACK = "'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP','Inter','Segoe UI',serif"

export default function Splash({ onDone }: Props) {
  const [phase, setPhase]   = useState(0)
  const [user, setUser]     = useState<{ display_name: string } | null>(null)
  const [embers, setEmbers] = useState<{ x:number;y:number;size:number;speed:number;opacity:number;gold:boolean }[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)

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

  // Canvas background — indigo ink wash + faint grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0

    function resize() { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const grad1 = ctx.createRadialGradient(canvas.width * 0.22, canvas.height * 0.3, 0, canvas.width * 0.22, canvas.height * 0.3, canvas.width * 0.5)
      grad1.addColorStop(0, `hsla(327,95%,60%,${0.16 + Math.sin(t * 0.018) * 0.05})`)
      grad1.addColorStop(1, 'transparent')
      ctx.fillStyle = grad1
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const grad2 = ctx.createRadialGradient(canvas.width * 0.78, canvas.height * 0.72, 0, canvas.width * 0.78, canvas.height * 0.72, canvas.width * 0.42)
      grad2.addColorStop(0, `hsla(193,100%,55%,${0.14 + Math.sin(t * 0.014 + 1) * 0.05})`)
      grad2.addColorStop(1, 'transparent')
      ctx.fillStyle = grad2
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.strokeStyle = 'rgba(0,194,255,0.05)'
      ctx.lineWidth = 1
      const gridSize = 46
      for (let x = 0; x < canvas.width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
      for (let y = 0; y < canvas.height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }

      t++
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  // Entrance sequence — load the single local operator profile, no credentials needed
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 650),
      setTimeout(() => setPhase(3), 1200),
    ]
    ;(async () => {
      try {
        const u = await (window as any).shogunos.getCurrentUser()
        setUser(u)
      } catch {
        setUser({ display_name: 'Operator' })
      }
    })()
    const finish = setTimeout(() => {
      setPhase(4)
      setTimeout(() => onDone(user || { display_name: 'Operator' }), 900)
    }, 2000)
    return () => { timers.forEach(clearTimeout); clearTimeout(finish) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trans = (show: boolean, delay = 0) => ({
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0)' : 'translateY(18px)',
    transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
  })

  const ToriiRule = ({ delay = 0, width = 72 }: { delay?: number; width?: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...trans(phase >= 2, delay) }}>
      <div style={{ width: 2, height: 10, background: C.g2, opacity: 0.7, boxShadow: `0 0 6px ${C.g2}` }} />
      <div style={{ width, height: 2, background: `linear-gradient(to right,${C.p2},${C.g2})`, boxShadow: `0 0 8px ${C.p2}66` }} />
      <div style={{ width: 2, height: 10, background: C.g2, opacity: 0.7, boxShadow: `0 0 6px ${C.g2}` }} />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF_STACK, overflow: 'hidden', color: C.t1 }}>
      <style>{`
        @keyframes shimmer { 0%{left:-100%} 60%,100%{left:150%} }
        @keyframes drift   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {embers.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${p.x}%`, top: `${(100 - (Date.now() * p.speed * 0.001 % 120))}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: p.gold ? C.gold : C.p3, opacity: p.opacity * 0.5,
          animation: `drift ${5 + p.speed * 10}s ease-in-out ${i * 0.3}s infinite`, pointerEvents: 'none',
        }} />
      ))}

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: C.b1, zIndex: 2 }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', ...trans(phase >= 1) }}>
        {/* Seal / logo mark */}
        <div style={{ marginBottom: 32, animation: 'drift 7s ease-in-out infinite', display: 'flex', justifyContent: 'center' }}>
          <svg width="96" height="96" viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 0 10px ${C.p2}88) drop-shadow(0 0 20px ${C.g2}55)` }}>
            <defs>
              <radialGradient id="sl1" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stopColor={C.bg3}/>
                <stop offset="100%" stopColor={C.bg0}/>
              </radialGradient>
              <linearGradient id="sl2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={C.p2}/>
                <stop offset="50%" stopColor={C.gold}/>
                <stop offset="100%" stopColor={C.p2}/>
              </linearGradient>
              <linearGradient id="sl3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.goldL}/>
                <stop offset="100%" stopColor={C.g1}/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="url(#sl1)" stroke="url(#sl2)" strokeWidth="2"/>
            <circle cx="50" cy="50" r="38" fill="none" stroke={`${C.g2}55`} strokeWidth="1"/>
            <circle cx="50" cy="50" r="28" fill="none" stroke={`${C.p2}44`} strokeWidth="1"/>
            <text x="50" y="67" textAnchor="middle" fontSize="46" fill="url(#sl3)" fontFamily={SERIF_STACK} fontWeight="700">将</text>
          </svg>
        </div>

        <div style={{ ...trans(phase >= 2, 0.1), marginBottom: 18 }}>
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.05, marginBottom: 10, fontFamily: SERIF_STACK }}>
            <span style={{ color: C.t1 }}>将軍</span><span style={{ color: C.gold, textShadow: `0 0 12px ${C.gold}77` }}>OS</span>
          </div>
          <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.42em', fontWeight: 500 }}>MULTIMEDIA PRESENTATION SYSTEM</div>
        </div>

        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}><ToriiRule delay={0.15} /></div>

        <div style={{ ...trans(phase >= 3, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 14, color: C.gold }}>◌</span>
          <span style={{ fontSize: 12, color: C.t3, letterSpacing: '0.14em' }}>
            {phase >= 4 ? `Welcome back, ${user?.display_name || 'Operator'}` : 'Preparing the hall…'}
          </span>
        </div>
      </div>
    </div>
  )
}