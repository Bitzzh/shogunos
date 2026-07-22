import React, { useEffect, useState, useRef } from 'react'

type Props = { onDone: (user: { display_name: string }) => void }

// ── Modern Tokyo palette ─────────────────────────────────────────────────────
// Two passes — Shinjuku night and overcast Tokyo day — using the exact same
// hex values as index.css's [data-theme] blocks, so whichever mode the app
// is about to open in, the splash matches it instead of always going dark.
const PALETTES = {
  dark: {
    bg0: '#08060f', bg1: '#100c1e', bg2: '#130f22', bg3: '#1b1531', bg4: '#241c3f', bg5: '#342951',
    b0: '#241c3f', b1: '#372a55', b2: '#4e3b73',
    p1: '#d61a5c', p2: '#ff2e63', p3: '#ff85ae',
    g1: '#1a3f96', g2: '#12b8ec', g3: '#6fe8ff',
    gold: '#b967ff', goldL: '#d9a6ff',
    t1: '#f5f1ff', t2: '#cec3ea', t3: '#9186b8', t4: '#5e5380',
    safe: '#39ff8f',
  },
  light: {
    bg0: '#eef0f6', bg1: '#ffffff', bg2: '#f7f8fc', bg3: '#e8eaf3', bg4: '#dadde9', bg5: '#c3c7db',
    b0: '#e1e3ef', b1: '#cfd2e6', b2: '#aeb2cc',
    p1: '#c81250', p2: '#ff2e63', p3: '#ff6b9d',
    g1: '#0d3b8c', g2: '#0091c8', g3: '#00b8e4',
    gold: '#9333ea', goldL: '#b967ff',
    t1: '#171531', t2: '#423c5c', t3: '#726b96', t4: '#9a93bd',
    safe: '#169c5a',
  },
}

// No network access is guaranteed at launch, so this never pulls a webfont —
// it leans on whichever CJK-capable serif font the OS already ships with
// (Yu Mincho/MS Mincho on Windows, Hiragino Mincho on macOS, Noto Serif CJK
// on most Linux distros) before falling back to a plain serif.
const SERIF_STACK = "'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP','Inter','Segoe UI',serif"

export default function Splash({ onDone }: Props) {
  // Same storage key App.tsx reads on boot — mirrors it exactly so the splash
  // never shows a theme the main app is about to contradict a moment later.
  const [themeMode] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('shogun_theme') as 'light' | 'dark') || 'dark' } catch { return 'dark' }
  })
  const C = PALETTES[themeMode]
  const isDark = themeMode === 'dark'
  const [phase, setPhase]   = useState(0)
  const [user, setUser]     = useState<{ display_name: string } | null>(null)
  const [embers, setEmbers] = useState<{ x:number;y:number;size:number;speed:number;opacity:number;gold:boolean }[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)

  // Neon rain / light-speck particle system — replaces the old ember drift
  useEffect(() => {
    const ps = Array.from({ length: 50 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100 + 100,
      size: Math.random() * 2.2 + 0.6,
      speed: Math.random() * 0.15 + 0.05,
      opacity: Math.random() * 0.5 + 0.1,
      gold: Math.random() > 0.4,
    }))
    setEmbers(ps)
  }, [])

  // Canvas background — neon city glow (magenta + cyan) over a faint street grid.
  // Dark pass reads as neon signage against night; light pass dials the same
  // hues down to a subtler daytime version instead of switching motif entirely.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0

    function resize() { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const glowPeak = isDark ? 0.16 : 0.09
    const glowWobble = isDark ? 0.05 : 0.03
    const gridStroke = isDark ? '111,232,255' : '13,59,140'
    const gridAlpha  = isDark ? 0.05 : 0.06

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const grad1 = ctx.createRadialGradient(canvas.width * 0.22, canvas.height * 0.3, 0, canvas.width * 0.22, canvas.height * 0.3, canvas.width * 0.5)
      grad1.addColorStop(0, `hsla(330,100%,62%,${glowPeak + Math.sin(t * 0.018) * glowWobble})`)
      grad1.addColorStop(1, 'transparent')
      ctx.fillStyle = grad1
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const grad2 = ctx.createRadialGradient(canvas.width * 0.78, canvas.height * 0.72, 0, canvas.width * 0.78, canvas.height * 0.72, canvas.width * 0.42)
      grad2.addColorStop(0, `hsla(190,100%,60%,${glowPeak * 0.85 + Math.sin(t * 0.014 + 1) * (glowWobble * 0.8)})`)
      grad2.addColorStop(1, 'transparent')
      ctx.fillStyle = grad2
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.strokeStyle = `rgba(${gridStroke},${gridAlpha})`
      ctx.lineWidth = 1
      const gridSize = 46
      for (let x = 0; x < canvas.width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
      for (let y = 0; y < canvas.height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }

      t++
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

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
      <div style={{ width: 2, height: 10, background: C.g2, opacity: 0.7 }} />
      <div style={{ width, height: 2, background: `linear-gradient(to right,${C.p2},${C.g2})` }} />
      <div style={{ width: 2, height: 10, background: C.g2, opacity: 0.7 }} />
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
          <svg width="96" height="96" viewBox="0 0 100 100">
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
            <circle cx="50" cy="50" r="38" fill="none" stroke={`${C.g2}33`} strokeWidth="1"/>
            <circle cx="50" cy="50" r="28" fill="none" stroke={`${C.p2}22`} strokeWidth="1"/>
            <text x="50" y="67" textAnchor="middle" fontSize="46" fill="url(#sl3)" fontFamily={SERIF_STACK} fontWeight="700">将</text>
          </svg>
        </div>

        <div style={{ ...trans(phase >= 2, 0.1), marginBottom: 18 }}>
          <div className="neon-flicker" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.05, marginBottom: 10, fontFamily: SERIF_STACK }}>
            <span style={{ color: C.t1, textShadow: `0 0 18px ${C.g3}66, 0 0 40px ${C.g2}33` }}>将軍</span><span style={{ color: C.gold, textShadow: `0 0 18px ${C.gold}aa, 0 0 44px ${C.gold}55` }}>OS</span>
          </div>
          <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.42em', fontWeight: 500 }}>MULTIMEDIA PRESENTATION SYSTEM</div>
        </div>

        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}><ToriiRule delay={0.15} /></div>

        <div style={{ ...trans(phase >= 3, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 14, color: C.gold, textShadow: `0 0 10px ${C.gold}` }}>◌</span>
          <span style={{ fontSize: 12, color: C.t3, letterSpacing: '0.14em' }}>
            {phase >= 4 ? `Welcome back, ${user?.display_name || 'Operator'}` : 'Preparing the hall…'}
          </span>
        </div>
      </div>
    </div>
  )
}