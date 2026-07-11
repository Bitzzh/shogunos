import React, { useState } from 'react'

// Edo-period palette — indigo night ground, gold accents, vermillion for alerts
const C = {
  bg: '#0c1329', s1: '#111b3a', s2: '#162047', s3: '#1c2853',
  teal: '#c99a34', teal2: '#d4af37', teal3: '#a8791f', teal4: '#6e5115', teal5: '#3c2c0e',
  white: '#f4ecd8', dim: '#8f9bc4', muted: '#374a86',
  border: '#233060', border2: '#2b3a70',
  rose: '#a3242e', rose2: '#c23b3b',
}

type Props = { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [fontSize, setFontSize] = useState('48')
  const [textAlign, setTextAlign] = useState('center')
  const [bgColor, setBgColor] = useState('#000000')
  const [fontColor, setFontColor] = useState('#FFFFFF')
  const [activeSection, setActiveSection] = useState('display')

  const inp = { background: C.s2, border: `1px solid ${C.border2}`, color: C.white, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties
  const lbl = { fontSize: 9, color: C.teal, letterSpacing: '0.2em', fontWeight: 800, marginBottom: 5, display: 'block' } as React.CSSProperties

  const sections = [
    { id: 'display', label: 'Display' },
    { id: 'about', label: 'About' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,5,8,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: C.s1, border: `1px solid ${C.border2}`, width: 520, height: 400, display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.bg }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.white, letterSpacing: '0.08em' }}>SETTINGS</div>
          <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.border2}`, color: C.dim, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>

        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ width: 140, borderRight: `1px solid ${C.border2}`, background: C.bg }}>
            {sections.map(s => (
              <div key={s.id} onClick={() => setActiveSection(s.id)} style={{ padding: '10px 14px', fontSize: 11, color: activeSection === s.id ? C.white : C.dim, cursor: 'pointer', borderLeft: activeSection === s.id ? `2px solid ${C.teal}` : '2px solid transparent', background: activeSection === s.id ? C.s1 : 'transparent' }}>
                {s.label}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
            {activeSection === 'display' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lbl}>DEFAULT FONT SIZE</label>
                  <input style={{ ...inp, width: '100%' }} type="number" value={fontSize} onChange={e => setFontSize(e.target.value)} min="24" max="96" />
                </div>
                <div>
                  <label style={lbl}>TEXT ALIGNMENT</label>
                  <select style={{ ...inp, width: '100%' }} value={textAlign} onChange={e => setTextAlign(e.target.value)}>
                    <option value="center">Center</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>DEFAULT BACKGROUND COLOR</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 40, height: 32, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer' }} />
                    <input style={{ ...inp, flex: 1 }} value={bgColor} onChange={e => setBgColor(e.target.value)} placeholder="#000000" />
                  </div>
                </div>
                <div>
                  <label style={lbl}>DEFAULT FONT COLOR</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} style={{ width: 40, height: 32, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer' }} />
                    <input style={{ ...inp, flex: 1 }} value={fontColor} onChange={e => setFontColor(e.target.value)} placeholder="#FFFFFF" />
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'about' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 40, height: 40, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: C.bg }}>将</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.white, letterSpacing: '0.15em' }}>SHOGUN<span style={{ color: C.teal }}>OS</span></div>
                    <div style={{ fontSize: 9, color: C.teal2, letterSpacing: '0.3em' }}>RONIN EDITION · v1.0</div>
                  </div>
                </div>
                {[
                  ['Developer', 'Admin_10 with Claude AI'],
                  ['Type', 'Worship Presentation Software'],
                  ['Platform', 'Windows · macOS · Linux'],
                  ['Stack', 'Electron · React · TypeScript · SQLite'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ fontSize: 9, color: C.teal, fontWeight: 800, letterSpacing: '0.15em', width: 80, flexShrink: 0 }}>{k}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border2}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: C.bg }}>
          <button onClick={onClose} style={{ padding: '7px 16px', background: 'none', border: `1px solid ${C.border2}`, color: C.dim, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em' }}>CLOSE</button>
          <button style={{ padding: '7px 16px', background: C.teal, border: 'none', color: C.bg, fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.12em' }}>SAVE</button>
        </div>
      </div>
    </div>
  )
}