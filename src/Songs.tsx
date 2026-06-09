import React, { useState, useEffect, useCallback } from 'react'

interface Props {
  goLive: (title: string, content: string) => void
  addToQueue: (title: string, type: string) => void
  notify: (msg: string) => void
}

const C = {
  void: '#020305', ash: '#07090F', ember: '#0C0F18', coal: '#111520',
  crimson: '#CC1A1A', blood: '#FF2020', fire: '#FF6020',
  amber: '#FF9A00', gold: '#FFB800',
  ivory: '#F5EED8', bone: '#C8BEA8', ghost: '#7A8099',
  mist: '#3A4258', border2: '#1E2535',
}

interface Song { id: number; title: string; hymn_number: number | null; source: string; language: string; created_at: string }
interface Section { id: number; song_id: number; type: string; order_num: number; content: string }

const LANG_LABELS: Record<string, string> = { en: 'English', sn: 'Shona', nd: 'Ndebele', fr: 'French' }

export default function Songs({ goLive, addToQueue, notify }: Props) {
  const [songs, setSongs]           = useState<Song[]>([])
  const [selected, setSelected]     = useState<Song | null>(null)
  const [sections, setSections]     = useState<Section[]>([])
  const [currentSec, setCurrentSec] = useState(0)
  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState<'all' | 'hymnal' | 'custom'>('all')
  const [langFilter, setLangFilter] = useState('all')
  const [loading, setLoading]       = useState(true)
  const [editing, setEditing]       = useState(false)
  const [editSections, setEditSections] = useState<Section[]>([])
  const [editTitle, setEditTitle]   = useState('')
  const api = (window as any).shogunos

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all: Song[] = await api.searchSongs('')
      setSongs(all.sort((a, b) => (a.hymn_number || 999) - (b.hymn_number || 999)))
    } catch { notify('Failed to load songs') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function selectSong(song: Song) {
    setSelected(song); setCurrentSec(0); setEditing(false)
    const secs: Section[] = await api.getSongSections(song.id)
    setSections(secs)
  }

  async function handleDelete() {
    if (!selected) return
    if (!confirm(`Delete "${selected.title}"? This cannot be undone.`)) return
    await api.deleteSong(selected.id)
    setSongs(s => s.filter(x => x.id !== selected.id))
    setSelected(null); setSections([])
    notify(`"${selected.title}" deleted`)
  }

  function startEdit() {
    if (!selected) return
    setEditTitle(selected.title)
    setEditSections([...sections])
    setEditing(true)
  }

  async function saveEdit() {
    if (!selected) return
    for (const sec of editSections) {
      await api.addSongSection(selected.id, sec.type, sec.order_num, sec.content)
    }
    const updated = { ...selected, title: editTitle }
    setSongs(s => s.map(x => x.id === selected.id ? updated : x))
    setSelected(updated); setSections(editSections); setEditing(false)
    notify('Song saved')
  }

  const visible = songs.filter(s => {
    if (filter !== 'all' && s.source !== filter) return false
    if (langFilter !== 'all' && s.language !== langFilter) return false
    if (search) return s.title.toLowerCase().includes(search.toLowerCase())
    return true
  })

  const languages = Array.from(new Set(songs.map(s => s.language)))
  const section   = editing ? editSections[currentSec] : sections[currentSec]

  const inp: React.CSSProperties = { width: '100%', background: C.ember, border: `1px solid ${C.border2}`, color: C.ivory, padding: '7px 9px', fontSize: 11, outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

      {/* ── LEFT: LIST ── */}
      <div style={{ width: 280, background: C.ash, borderRight: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '10px 12px', background: C.void, borderBottom: `1px solid ${C.border2}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.3em', fontWeight: 900 }}>SONG LIBRARY</span>
            <span style={{ fontSize: 8, color: C.mist }}>{visible.length} / {songs.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', background: C.ember, border: `1px solid ${C.border2}`, padding: '0 9px', gap: 6, marginBottom: 8 }}>
            <i className="ti ti-search" style={{ color: C.mist, fontSize: 12 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search songs..." style={{ flex: 1, background: 'none', border: 'none', color: C.ivory, fontSize: 11, outline: 'none', padding: '7px 0', fontFamily: 'inherit' }} />
            {search && <span onClick={() => setSearch('')} style={{ color: C.mist, cursor: 'pointer', fontSize: 14 }}>×</span>}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {(['all','hymnal','custom'] as const).map(val => (
              <button key={val} onClick={() => setFilter(val)} style={{ flex: 1, padding: '3px 0', fontSize: 7, fontWeight: 900, letterSpacing: '0.08em', border: `1px solid ${filter === val ? C.gold : C.border2}`, color: filter === val ? C.gold : C.mist, background: filter === val ? 'rgba(255,184,0,0.08)' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{val.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => setLangFilter('all')} style={{ padding: '2px 7px', fontSize: 7, fontWeight: 800, border: `1px solid ${langFilter === 'all' ? C.amber : C.border2}`, color: langFilter === 'all' ? C.amber : C.mist, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>ALL</button>
            {languages.map(lang => (
              <button key={lang} onClick={() => setLangFilter(lang)} style={{ padding: '2px 7px', fontSize: 7, fontWeight: 800, border: `1px solid ${langFilter === lang ? C.amber : C.border2}`, color: langFilter === lang ? C.amber : C.mist, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{(LANG_LABELS[lang] || lang).toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: C.mist, fontSize: 11 }}>Loading...</div>}
          {!loading && visible.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.mist }}><div style={{ fontSize: 32, opacity: 0.2, marginBottom: 8 }}>⚔</div><div style={{ fontSize: 10 }}>{search ? 'No songs match' : 'No songs found'}</div></div>}
          {visible.map(song => {
            const isActive = selected?.id === song.id
            const srcColor = song.source === 'hymnal' ? C.amber : C.gold
            return (
              <div key={song.id} onClick={() => selectSong(song)} style={{ marginBottom: 4, border: `1px solid ${isActive ? C.gold : C.border2}`, borderLeft: `3px solid ${isActive ? C.gold : srcColor}`, background: isActive ? 'rgba(255,184,0,0.05)' : C.ember, cursor: 'pointer', padding: '8px 10px', transition: 'all 0.12s' }}>
                <div style={{ display: 'flex', gap: 5, marginBottom: 3 }}>
                  {song.hymn_number && <span style={{ fontSize: 7, color: C.fire, fontWeight: 900, padding: '1px 5px', border: `1px solid ${C.fire}44`, background: `${C.fire}11` }}>HYM {String(song.hymn_number).padStart(3,'0')}</span>}
                  <span style={{ fontSize: 7, color: srcColor, fontWeight: 900, padding: '1px 5px', border: `1px solid ${srcColor}44`, background: `${srcColor}11` }}>{song.source.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11, color: isActive ? C.ivory : C.bone, fontWeight: 600, marginBottom: 2 }}>{song.title}</div>
                <div style={{ fontSize: 9, color: C.mist }}>{LANG_LABELS[song.language] || song.language}</div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '6px 12px', borderTop: `1px solid ${C.border2}`, display: 'flex', gap: 12, flexShrink: 0 }}>
          {[['HYMNS', songs.filter(s=>s.source==='hymnal').length, C.amber],['CUSTOM', songs.filter(s=>s.source==='custom').length, C.gold],['TOTAL', songs.length, C.ghost]].map(([label,val,color]) => (
            <div key={label as string} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 200, color: color as string }}>{val as number}</div>
              <div style={{ fontSize: 7, color: C.mist, letterSpacing: '0.1em' }}>{label as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CENTER: DETAIL ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, background: C.ember }}>
            <div style={{ fontSize: 48, opacity: 0.15 }}>⚔</div>
            <div style={{ fontSize: 11, color: C.mist, letterSpacing: '0.12em' }}>SELECT A SONG</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', background: C.ash, borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing
                  ? <input style={{ ...inp, fontSize: 15, fontWeight: 700 }} value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  : <div style={{ fontFamily: "'Cinzel',serif", fontSize: 15, fontWeight: 700, color: C.ivory, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</div>
                }
                <div style={{ fontSize: 9, color: C.mist, marginTop: 3 }}>{LANG_LABELS[selected.language] || selected.language} · {selected.source} · {sections.length} sections</div>
              </div>
              <button onClick={() => addToQueue(selected.title, 'song')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 9, fontWeight: 900, cursor: 'pointer', border: `1px solid rgba(255,184,0,0.25)`, color: C.amber, background: 'rgba(255,184,0,0.06)', fontFamily: 'inherit' }}>
                <i className="ti ti-list-check" /> QUEUE
              </button>
              {selected.source === 'custom' && !editing && (
                <button onClick={startEdit} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 9, fontWeight: 700, cursor: 'pointer', border: `1px solid ${C.border2}`, color: C.mist, background: 'none', fontFamily: 'inherit' }}>
                  <i className="ti ti-edit" /> EDIT
                </button>
              )}
              {editing && <>
                <button onClick={saveEdit} style={{ padding: '5px 12px', fontSize: 9, fontWeight: 900, cursor: 'pointer', border: 'none', background: C.gold, color: C.void, fontFamily: 'inherit' }}>SAVE</button>
                <button onClick={() => setEditing(false)} style={{ padding: '5px 10px', fontSize: 9, fontWeight: 700, cursor: 'pointer', border: `1px solid ${C.border2}`, color: C.mist, background: 'none', fontFamily: 'inherit' }}>CANCEL</button>
              </>}
              {selected.source === 'custom' && !editing && (
                <button onClick={handleDelete} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 9, fontWeight: 700, cursor: 'pointer', border: `1px solid rgba(255,32,32,0.3)`, color: C.blood, background: 'none', fontFamily: 'inherit' }}>
                  <i className="ti ti-trash" /> DELETE
                </button>
              )}
            </div>

            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 5, padding: '8px 14px', background: C.ember, borderBottom: `1px solid ${C.border2}`, flexShrink: 0, overflowX: 'auto' }}>
              {sections.map((s, i) => (
                <button key={s.id} onClick={() => setCurrentSec(i)} style={{ padding: '4px 10px', fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', border: `1px solid ${i === currentSec ? C.gold : C.border2}`, color: i === currentSec ? C.gold : C.mist, background: i === currentSec ? 'rgba(255,184,0,0.08)' : 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  {s.type.toUpperCase()} {s.type === 'verse' ? i + 1 : ''}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', background: C.ember, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,${C.blood},${C.gold},transparent)` }} />
              {section && (editing
                ? <textarea value={editSections[currentSec]?.content || ''} onChange={e => setEditSections(secs => secs.map((s, i) => i === currentSec ? { ...s, content: e.target.value } : s))} rows={12} style={{ ...inp, resize: 'vertical', lineHeight: 1.8, fontSize: 16 }} />
                : <div style={{ fontSize: 18, lineHeight: 2.4, color: C.ivory, fontWeight: 300, whiteSpace: 'pre-line', letterSpacing: '0.03em' }}>{section.content}</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: '10px 14px', background: C.void, borderTop: `1px solid ${C.border2}`, display: 'flex', gap: 7, flexShrink: 0 }}>
              <button onClick={() => section && goLive(selected.title, section.content)} style={{ flex: 1, padding: '11px 0', background: `linear-gradient(to right,${C.crimson},#6B0000)`, border: 'none', borderTop: `1px solid ${C.blood}`, color: C.ivory, fontSize: 10, fontWeight: 900, letterSpacing: '0.25em', cursor: 'pointer', fontFamily: 'inherit' }}>
                GO LIVE — {section?.type?.toUpperCase()} {section?.type === 'verse' ? currentSec + 1 : ''}
              </button>
              <button onClick={() => currentSec > 0 && setCurrentSec(i => i - 1)} disabled={currentSec === 0} style={{ padding: '11px 14px', background: 'none', border: `1px solid ${C.border2}`, color: C.mist, fontSize: 14, cursor: currentSec === 0 ? 'not-allowed' : 'pointer', opacity: currentSec === 0 ? 0.3 : 1 }}>
                <i className="ti ti-chevron-left" />
              </button>
              <button onClick={() => currentSec < sections.length - 1 && setCurrentSec(i => i + 1)} disabled={currentSec === sections.length - 1} style={{ padding: '11px 14px', background: 'none', border: `1px solid ${C.border2}`, color: C.mist, fontSize: 14, cursor: currentSec === sections.length - 1 ? 'not-allowed' : 'pointer', opacity: currentSec === sections.length - 1 ? 0.3 : 1 }}>
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}