import React, { useEffect, useState } from 'react'

type Props = { onDone: () => void }

export default function Splash({ onDone }: Props) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2300),
      setTimeout(() => setPhase(5), 3000),
      setTimeout(onDone, 4200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#040508',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(0,255,178,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,178,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: phase >= 1 ? 1 : 0,
        transition: 'opacity 1s ease',
      }} />

      {/* Vertical slash */}
      <div style={{
        position: 'absolute', left: '50%', top: 0,
        width: '1px',
        height: phase >= 1 ? '100%' : '0%',
        background: 'linear-gradient(to bottom, transparent, #00FFB2, transparent)',
        transition: 'height 0.6s ease',
        transform: 'translateX(-50%)',
      }} />

      {/* Kanji */}
      <div style={{
        width: 72, height: 72,
        background: phase >= 2 ? '#00FFB2' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36, fontWeight: 900, color: '#040508',
        position: 'relative', marginBottom: 24,
        transition: 'background 0.4s ease, transform 0.4s ease, box-shadow 0.4s ease',
        transform: phase >= 2 ? 'scale(1)' : 'scale(0.5)',
        boxShadow: phase >= 2 ? '0 0 40px rgba(0,255,178,0.3)' : 'none',
      }}>
        将
        <div style={{ position: 'absolute', inset: -4, border: '1px solid rgba(0,255,178,0.3)', opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.4s ease' }} />
        <div style={{ position: 'absolute', inset: -8, border: '1px solid rgba(0,255,178,0.15)', opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.6s ease' }} />
      </div>

      {/* Title */}
      <div style={{
        fontSize: 38, fontWeight: 800, letterSpacing: '0.3em', color: '#E8EDF8',
        opacity: phase >= 3 ? 1 : 0,
        transform: phase >= 3 ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        marginBottom: 8,
      }}>
        SHOGUN<span style={{ color: '#00FFB2' }}>OS</span>
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: 11, letterSpacing: '0.6em', fontWeight: 600, color: '#00CDA0',
        opacity: phase >= 4 ? 1 : 0,
        transform: phase >= 4 ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        marginBottom: 40,
      }}>
        — RONIN EDITION —
      </div>

      {/* Loading bar */}
      <div style={{ width: 200, height: 1, background: 'rgba(0,255,178,0.15)', position: 'relative', opacity: phase >= 4 ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          background: '#00FFB2',
          width: phase >= 5 ? '100%' : phase >= 4 ? '60%' : '0%',
          transition: 'width 0.8s ease',
          boxShadow: '0 0 8px rgba(0,255,178,0.6)',
        }} />
      </div>

      <div style={{ fontSize: 10, color: '#3D4560', letterSpacing: '0.15em', marginTop: 16, opacity: phase >= 4 ? 1 : 0, transition: 'opacity 0.5s ease' }}>
        WORSHIP PRESENTATION SYSTEM
      </div>

      {/* Corner brackets */}
      {[{ top: 20, left: 20 }, { top: 20, right: 20 }, { bottom: 20, left: 20 }, { bottom: 20, right: 20 }].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', ...pos as any,
          width: 20, height: 20,
          borderTop: i < 2 ? '1px solid rgba(0,255,178,0.3)' : 'none',
          borderBottom: i >= 2 ? '1px solid rgba(0,255,178,0.3)' : 'none',
          borderLeft: i % 2 === 0 ? '1px solid rgba(0,255,178,0.3)' : 'none',
          borderRight: i % 2 === 1 ? '1px solid rgba(0,255,178,0.3)' : 'none',
          opacity: phase >= 1 ? 1 : 0,
          transition: `opacity 0.5s ease ${i * 0.1}s`,
        }} />
      ))}
    </div>
  )
}