import React, { useState } from 'react'

const C = {
  bg: '#040508', s1: '#080B12', s2: '#0C1018', s3: '#111620',
  teal: '#00FFB2', teal2: '#00CDA0', teal3: '#008C6E', teal4: '#004D3D', teal5: '#001F18',
  purple: '#8B5CF6', purple2: '#A78BFA',
  rose: '#F43F5E', rose2: '#FB7185',
  white: '#E8EDF8', dim: '#6B7899', muted: '#2D3550',
  border: '#161D2E', border2: '#1F2840',
}

type Props = {
  onClose: () => void
  onSaved: () => void
}

type SectionDraft = { type: string; content: string }

export default function AddSongModal({ onClose, onSaved }: Props) {
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('en')
  const [hymnNumber, setHymnNumber] = useState('')
  const [sections, setSections] = useState<SectionDraft[]>([
    { type: 'verse', content: '' }
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addSection(type: string) {
    setSections(s => [...s, { type, content: '' }])
  }

  function removeSection(i: number) {
    setSections(s => s.filter((_, idx) => idx !== i))
  }

  function updateSection(i: number, field: keyof SectionDraft, value: string) {
    setSections(s => s.map((sec, idx) => idx === i ? { ...sec, [field]: value } : sec))
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    if (sections.every(s => !s.content.trim())) { setError('Add at least one section with content'); return }
    setSaving(true)
    try {
      const songId = await (window as any).shogunos.addSong(
        title.trim(), language, 'custom',
        hymnNumber ? parseInt(hymnNumber) : undefined
      )
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].content.trim()) {
          await (window as any).shogunos.addSongSection(songId, sections[i].type, i + 1, sections[i].content.trim())
        }
      }
      onSaved()
      onClose()
    } catch (e) {
      setError('Failed to save song. Please try again.')
    }
    setSaving(false)
  }

  const inp = {
    background: C.s2, border: `1px solid ${C.border2}`, color: C.white,
    padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%',
    fontFamily: "'Segoe UI', sans-serif",
  } as React.CSSProperties

  const lbl = { fontSize: 9, color: C.teal, letterSpacing: '0.2em', fontWeight: 800, marginBottom: 5, display: 'block' } as React.CSSProperties

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,5,8,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: C.s1, border: `1px solid ${C.border2}`, width: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.bg }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.white, letterSpacing: '0.08em' }}>ADD NEW SONG</div>
            <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>Add a custom song to My Songs library</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.border2}`, color: C.dim, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {error && (
            <div style={{ background: 'rgba(244,63,94,0.1)', border: `1px solid ${C.rose}`, padding: '8px 12px', fontSize: 11, color: C.rose2 }}>{error}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>SONG TITLE *</label>
              <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter song title..." />
            </div>
            <div>
              <label style={lbl}>HYMN NUMBER (optional)</label>
              <input style={inp} value={hymnNumber} onChange={e => setHymnNumber(e.target.value)} placeholder="e.g. 142" type="number" />
            </div>
          </div>

          <div>
            <label style={lbl}>LANGUAGE</label>
            <select style={{ ...inp }} value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="sn">Shona</option>
              <option value="nd">Ndebele</option>
              <option value="fr">French</option>
              <option value="pt">Portuguese</option>
              <option value="sw">Swahili</option>
            </select>
          </div>

          <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 12 }}>
            <div style={{ fontSize: 9, color: C.teal, letterSpacing: '0.2em', fontWeight: 800, marginBottom: 10 }}>SONG SECTIONS</div>

            {sections.map((sec, i) => (
              <div key={i} style={{ marginBottom: 10, border: `1px solid ${C.border2}`, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: C.s2, borderBottom: `1px solid ${C.border2}` }}>
                  <select
                    value={sec.type}
                    onChange={e => updateSection(i, 'type', e.target.value)}
                    style={{ background: C.s3, border: `1px solid ${C.border2}`, color: C.white, padding: '3px 6px', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', outline: 'none' }}
                  >
                    <option value="verse">VERSE {i + 1}</option>
                    <option value="chorus">CHORUS</option>
                    <option value="bridge">BRIDGE</option>
                    <option value="intro">INTRO</option>
                    <option value="outro">OUTRO</option>
                  </select>
                  <div style={{ flex: 1 }} />
                  {sections.length > 1 && (
                    <button onClick={() => removeSection(i)} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>✕</button>
                  )}
                </div>
                <textarea
                  value={sec.content}
                  onChange={e => updateSection(i, 'content', e.target.value)}
                  placeholder="Type lyrics here... (press Enter for new line)"
                  rows={4}
                  style={{ ...inp, resize: 'vertical', border: 'none', borderRadius: 0 }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 6 }}>
              {['verse', 'chorus', 'bridge'].map(type => (
                <button key={type} onClick={() => addSection(type)} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border2}`, color: C.dim, fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  + {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border2}`, display: 'flex', gap: 8, justifyContent: 'flex-end', background: C.bg }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: `1px solid ${C.border2}`, color: C.dim, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em' }}>
            CANCEL
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: C.teal, border: 'none', color: C.bg, fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.12em', borderTop: `2px solid #fff`, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'SAVING...' : 'SAVE SONG'}
          </button>
        </div>
      </div>
    </div>
  )
}