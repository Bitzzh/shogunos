import React, { useState, useEffect } from 'react'

interface Props {
  live: string | null
  currentSection: { type: string; content: string } | null
  sections: { id: number; type: string; order_num: number; content: string }[]
  currentSectionIndex: number
  onSectionClick: (i: number) => void
  timerSeconds: number
  timerRunning: boolean
  onTimerToggle: () => void
  onTimerReset: () => void
  notify: (msg: string) => void
}

const C = {
  void: '#020305', ash: '#07090F', ember: '#0C0F18', coal: '#111520',
  crimson: '#CC1A1A', blood: '#FF2020',
  amber: '#FF9A00', gold: '#FFB800',
  ivory: '#F5EED8', bone: '#C8BEA8', ghost: '#7A8099',
  mist: '#3A4258', border2: '#1E2535',
  green: '#22C55E',
}

function formatTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function StageView({
  live, currentSection, sections, currentSectionIndex,
  onSectionClick, timerSeconds, timerRunning, onTimerToggle, onTimerReset, notify,
}: Props) {
  const [clock, setClock]   = useState('')
  const [showNotes, setShowNotes] = useState(true)

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [])

  const nextSection = sections[currentSectionIndex + 1] || null
  const timerColor  = timerSeconds <= 60 ? C.blood : timerSeconds <= 180 ? C.amber : C.green
  const timerWarn   = timerSeconds <= 60

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#010203', color: C.ivory, overflow: 'hidden', fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── TOP BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: C.void, borderBottom: `1px solid ${C.border2}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: live ? C.blood : C.mist, boxShadow: live ? `0 0 8px ${C.blood}` : 'none' }} />
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', color: live ? C.blood : C.mist }}>{live ? '● LIVE' : '○ NOT LIVE'}</span>
        </div>
        <div style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.3em', fontWeight: 900 }}>STAGE VIEW</div>
        <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, letterSpacing: '0.15em', fontVariantNumeric: 'tabular-nums' } as any}>{clock}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── LEFT: CURRENT SLIDE ── */}
        <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border2}` }}>

          {/* Current lyrics — big */}
          <div style={{ flex: 1, padding: '32px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', background: 'linear-gradient(to bottom,#010203,#020305)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,${C.blood},${C.gold},transparent)` }} />

            {currentSection ? (
              <>
                <div style={{ fontSize: 9, color: 'rgba(255,184,0,0.5)', letterSpacing: '0.35em', fontWeight: 900, marginBottom: 20 }}>
                  {currentSection.type.toUpperCase()} {currentSection.type === 'verse' ? currentSectionIndex + 1 : ''} · NOW SHOWING
                </div>
                <div style={{ fontSize: 32, lineHeight: 1.8, color: C.ivory, fontWeight: 300, whiteSpace: 'pre-line', letterSpacing: '0.02em' }}>
                  {currentSection.content}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', opacity: 0.3 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚔</div>
                <div style={{ fontSize: 14, letterSpacing: '0.15em' }}>NOTHING SELECTED</div>
              </div>
            )}
          </div>

          {/* Next up */}
          {nextSection && (
            <div style={{ padding: '14px 24px', background: C.coal, borderTop: `1px solid ${C.border2}`, flexShrink: 0 }}>
              <div style={{ fontSize: 8, color: C.mist, letterSpacing: '0.25em', fontWeight: 800, marginBottom: 6 }}>NEXT UP</div>
              <div style={{ fontSize: 14, color: C.ghost, lineHeight: 1.5 }}>{nextSection.content.substring(0, 80)}...</div>
            </div>
          )}

          {/* Section navigator */}
          {sections.length > 0 && (
            <div style={{ padding: '10px 14px', background: C.void, borderTop: `1px solid ${C.border2}`, display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
              {sections.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => onSectionClick(i)}
                  style={{
                    padding: '5px 10px', fontSize: 8, fontWeight: 900, letterSpacing: '0.08em',
                    background: i === currentSectionIndex ? `linear-gradient(to right,${C.crimson},#6B0000)` : C.ember,
                    border: `1px solid ${i === currentSectionIndex ? C.blood : C.border2}`,
                    color: i === currentSectionIndex ? C.ivory : C.mist,
                    cursor: 'pointer', fontFamily: 'inherit',
                    borderTop: i === currentSectionIndex ? `1px solid ${C.blood}` : `1px solid ${C.border2}`,
                  }}
                >
                  {s.type.toUpperCase()} {s.type === 'verse' ? i + 1 : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: TIMER + NOTES ── */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', background: C.ash, flexShrink: 0 }}>

          {/* Timer */}
          <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border2}`, flexShrink: 0 }}>
            <div style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.25em', fontWeight: 900, marginBottom: 14 }}>COUNTDOWN TIMER</div>

            {/* Big timer display */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{
                fontSize: 52, fontWeight: 200, letterSpacing: '0.05em',
                color: timerColor, fontVariantNumeric: 'tabular-nums',
                textShadow: timerWarn ? `0 0 20px ${C.blood}` : 'none',
                animation: timerWarn && timerRunning ? 'pulse 1s ease infinite' : 'none',
              } as any}>
                {formatTime(timerSeconds)}
              </div>
              <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

              {/* Progress bar */}
              <div style={{ width: '100%', height: 3, background: C.border2, marginTop: 8, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: timerColor, width: `${Math.min(100, (timerSeconds / 300) * 100)}%`, transition: 'width 1s linear, background 0.3s' }} />
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onTimerToggle}
                style={{ flex: 1, padding: '10px 0', background: timerRunning ? C.ember : `linear-gradient(to right,${C.crimson},#6B0000)`, border: `1px solid ${timerRunning ? C.border2 : C.blood}`, borderTop: timerRunning ? `1px solid ${C.border2}` : `1px solid ${C.blood}`, color: C.ivory, fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', cursor: 'pointer', fontFamily: 'inherit' }}
              >{timerRunning ? 'PAUSE' : 'START'}</button>
              <button
                onClick={onTimerReset}
                style={{ padding: '10px 12px', background: 'none', border: `1px solid ${C.border2}`, color: C.mist, fontSize: 11, cursor: 'pointer' }}
              >↺</button>
            </div>
          </div>

          {/* Notes area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: C.void, borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.25em', fontWeight: 900 }}>PRESENTER NOTES</span>
              <button onClick={() => setShowNotes(s => !s)} style={{ background: 'none', border: 'none', color: C.mist, cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit' }}>{showNotes ? 'HIDE' : 'SHOW'}</button>
            </div>
            {showNotes && (
              <div style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
                <div style={{ fontSize: 11, color: C.mist, lineHeight: 1.6, fontStyle: 'italic' }}>
                  {(currentSection as any)?.notes || 'No presenter notes for this slide.'}
                </div>
              </div>
            )}
          </div>

          {/* Quick info */}
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border2}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 8, color: C.mist, letterSpacing: '0.1em' }}>SLIDE</span>
              <span style={{ fontSize: 8, color: C.bone, fontWeight: 700 }}>{currentSectionIndex + 1} / {sections.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 8, color: C.mist, letterSpacing: '0.1em' }}>STATUS</span>
              <span style={{ fontSize: 8, color: live ? C.blood : C.mist, fontWeight: 700 }}>{live ? 'PRESENTING' : 'STANDBY'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
