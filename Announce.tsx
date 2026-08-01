import React, { useState } from 'react'

interface Props {
  goLive: (title: string, content: string) => void
  notify: (msg: string) => void
}

// Edo-period palette — indigo night ground, vermillion lacquer, kin gold
const C = {
  void: '#0e1730', ash: '#141f42', ember: '#1a2851', coal: '#213262',
  crimson: '#a3242e', blood: '#c23b3b',
  amber: '#c99a34', gold: '#d4af37',
  ivory: '#f4ecd8', bone: '#dccfa8',
  mist: '#5c6aa0', border2: '#374a86',
}

const TEMPLATES = [
  { label: 'Welcome',   icon: '👋', text: 'Welcome to our service!\nWe are glad you are here.'                       },
  { label: 'Offering',  icon: '🙏', text: 'It is time for our tithes and offerings.\nThank you for your faithful giving.' },
  { label: 'Silence',   icon: '🤫', text: 'Please silence your mobile phones.\nThank you.'                            },
  { label: 'Break',     icon: '☕', text: 'We will take a short break.\nPlease be back in 10 minutes.'                },
  { label: 'Communion', icon: '✝',  text: 'We will now observe Holy Communion.\nPlease prepare your hearts.'         },
  { label: 'Closing',   icon: '🕊',  text: 'Thank you for joining us today.\nGod bless you as you go.'               },
]

const PRESETS = [
  { label: 'Default', bg: '#000000', fg: '#FFFFFF' },
  { label: 'Crimson', bg: '#1A0303', fg: '#FF9A00' },
  { label: 'Sacred',  bg: '#0F0620', fg: '#A78BFA' },
  { label: 'Arctic',  bg: '#020B18', fg: '#7DD3FC' },
  { label: 'Forest',  bg: '#031A0A', fg: '#86EFAC' },
  { label: 'Ember',   bg: '#0C0F18', fg: '#FFB800' },
]

export default function Announce({ goLive, notify }: Props) {
  const [text, setText]         = useState('')
  const [title, setTitle]       = useState('')
  const [bgColor, setBgColor]   = useState('#000000')
  const [fgColor, setFgColor]   = useState('#FFFFFF')
  const [fontSize, setFontSize] = useState(48)
  const [align, setAlign]       = useState<'left' | 'center' | 'right'>('center')
  const [history, setHistory]   = useState<{ title: string; text: string; ts: string }[]>([])

  function handleSend() {
    if (!text.trim()) { notify('Type a message first'); return }
    goLive(title || 'Announcement', text)
    setHistory(h => [{ title: title || 'Announcement', text, ts: new Date().toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 10))
    notify('Announcement sent live')
  }

  const inp: React.CSSProperties = { width: '100%', background: C.ember, border: `1px solid ${C.border2}`, color: C.ivory, padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 8, color: 'rgba(255,184,0,0.7)', letterSpacing: '0.25em', fontWeight: 800, marginBottom: 6, display: 'block' }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

      {/* ── LEFT: COMPOSE ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border2}` }}>
        <div style={{ padding: '8px 14px', background: C.void, borderBottom: `1px solid ${C.border2}`, flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,${C.blood},${C.gold},transparent)` }} />
          <span style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.3em', fontWeight: 900 }}>COMPOSE ANNOUNCEMENT</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* Templates */}
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>QUICK TEMPLATES</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button key={t.label} onClick={() => { setText(t.text); setTitle(t.label) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: C.coal, border: `1px solid ${C.border2}`, color: C.bone, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.amber; (e.currentTarget as HTMLElement).style.color = C.amber }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border2; (e.currentTarget as HTMLElement).style.color = C.bone }}
                ><span>{t.icon}</span>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>TITLE (optional)</label>
            <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Welcome, Offering..." />
          </div>

          {/* Message */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>MESSAGE</label>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type your announcement here..." rows={6} style={{ ...inp, resize: 'vertical', lineHeight: 1.7 }} />
            <div style={{ fontSize: 8, color: C.mist, marginTop: 4, textAlign: 'right' }}>{text.length} chars</div>
          </div>

          {/* Color presets */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>COLOR THEME</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {PRESETS.map(p => (
                <div key={p.label} onClick={() => { setBgColor(p.bg); setFgColor(p.fg) }} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 36, height: 36, background: p.bg, border: bgColor === p.bg ? `2px solid ${C.gold}` : `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 16, height: 3, background: p.fg, borderRadius: 1 }} />
                  </div>
                  <span style={{ fontSize: 7, color: C.mist, letterSpacing: '0.08em' }}>{p.label.toUpperCase()}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...lbl, marginBottom: 4 }}>BACKGROUND</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 32, height: 28, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer' }} />
                  <input style={{ ...inp, width: 80, fontSize: 10 }} value={bgColor} onChange={e => setBgColor(e.target.value)} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...lbl, marginBottom: 4 }}>TEXT COLOR</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} style={{ width: 32, height: 28, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer' }} />
                  <input style={{ ...inp, width: 80, fontSize: 10 }} value={fgColor} onChange={e => setFgColor(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Font size + alignment */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>FONT SIZE — {fontSize}px</label>
              <input type="range" min={20} max={96} value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} style={{ width: '100%', accentColor: C.gold }} />
            </div>
            <div>
              <label style={lbl}>ALIGNMENT</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['left','center','right'] as const).map(a => (
                  <button key={a} onClick={() => setAlign(a)} style={{ padding: '6px 9px', fontSize: 14, border: `1px solid ${align === a ? C.gold : C.border2}`, color: align === a ? C.gold : C.mist, background: align === a ? 'rgba(255,184,0,0.07)' : 'none', cursor: 'pointer' }}>
                    <i className={`ti ti-align-${a}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button onClick={handleSend} style={{ width: '100%', padding: '14px 0', background: `linear-gradient(to right,${C.crimson},#6B0000)`, border: 'none', borderTop: `1px solid ${C.blood}`, color: C.ivory, fontSize: 11, fontWeight: 900, letterSpacing: '0.3em', cursor: 'pointer', fontFamily: 'inherit' }}>
            ● SEND LIVE
          </button>
        </div>
      </div>

      {/* ── RIGHT: PREVIEW + HISTORY ── */}
      <div style={{ width: 340, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '8px 14px', background: C.void, borderBottom: `1px solid ${C.border2}`, flexShrink: 0 }}>
          <span style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.3em', fontWeight: 900 }}>PREVIEW</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: C.ember }}>
          <div style={{ width: '100%', aspectRatio: '16/9', background: bgColor, border: `1px solid ${C.border2}`, boxShadow: '0 0 32px rgba(0,0,0,0.6)', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,${C.blood},${C.gold},transparent)`, opacity: 0.6 }} />
            {text
              ? <div style={{ fontSize: fontSize * 0.22, color: fgColor, textAlign: align, lineHeight: 1.6, whiteSpace: 'pre-line', wordBreak: 'break-word', fontWeight: 300 }}>{text}</div>
              : <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>PREVIEW</div>
            }
          </div>
        </div>

        {/* History */}
        <div style={{ borderTop: `1px solid ${C.border2}`, flexShrink: 0 }}>
          <div style={{ padding: '7px 12px', background: C.void, borderBottom: `1px solid ${C.border2}` }}>
            <span style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.25em', fontWeight: 900 }}>RECENT</span>
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {history.length === 0 && <div style={{ padding: '12px 14px', fontSize: 9, color: C.mist }}>No announcements sent yet</div>}
            {history.map((h, i) => (
              <div key={i} onClick={() => { setText(h.text); setTitle(h.title) }}
                style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border2}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.ember}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: C.amber, fontWeight: 700, marginBottom: 2 }}>{h.title}</div>
                  <div style={{ fontSize: 9, color: C.mist, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</div>
                </div>
                <div style={{ fontSize: 8, color: C.mist, flexShrink: 0 }}>{h.ts}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}