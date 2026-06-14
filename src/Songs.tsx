import React, { useState, useEffect, useCallback } from 'react'

interface Props {
  goLive: (title: string, content: string) => void
  addToQueue: (title: string, type: string) => void
  notify: (msg: string) => void
}

const C = {
  void: '#0a0e14', ash: '#0f1419', ember: '#141923', coal: '#17202c',
  crimson: '#d32f2f', blood: '#ff5252', fire: '#ff6f00',
  amber: '#fbc02d', gold: '#ffd54f',
  ivory: '#f5f5f5', bone: '#e0e0e0', ghost: '#9e9e9e',
  mist: '#616161', border: '#2c3e50', divider: '#37474f'
}

interface Song { id: number; title: string; hymn_number: number | null; source: string; language: string; created_at: string }
interface Section { id: number; song_id: number; type: string; order_num: number; content: string }

const LANG_LABELS: Record<string, string> = { en: 'English', sn: 'Shona', nd: 'Ndebele', fr: 'French' }
const LANG_ORDER = ['en', 'sn', 'nd', 'fr'] // Display order

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
  const [expandedLangs, setExpandedLangs] = useState<Record<string, boolean>>({})
  const api = (window as any).shogunos

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all: Song[] = await api.searchSongs('')
      setSongs(all.sort((a, b) => (a.hymn_number || 999) - (b.hymn_number || 999)))
      // Auto-expand first language on load
      const langs = Array.from(new Set(all.map(s => s.language)))
      if (langs.length > 0) {
        setExpandedLangs({ [langs[0]]: true })
      }
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

  // Group songs by language
  const languages = Array.from(new Set(songs.map(s => s.language)))
    .sort((a, b) => LANG_ORDER.indexOf(a) - LANG_ORDER.indexOf(b))
  
  const songsByLang = languages.reduce((acc, lang) => {
    acc[lang] = visible.filter(s => s.language === lang)
    return acc
  }, {} as Record<string, Song[]>)

  const section = editing ? editSections[currentSec] : sections[currentSec]

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.coal,
    border: `1px solid ${C.divider}`,
    color: C.ivory,
    padding: '10px 12px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    borderRadius: 4,
    transition: 'border-color 0.2s, background-color 0.2s'
  }

  const buttonBase: React.CSSProperties = {
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    border: 'none',
    outline: 'none'
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, background: C.void }}>

      {/* ── LEFT: LIST ── */}
      <div style={{ width: 320, background: C.ash, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        
        {/* Header */}
        <div style={{ padding: '16px 18px', background: C.void, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.ghost, fontWeight: 600, letterSpacing: '0.15em', marginBottom: 8 }}>LIBRARY</div>
            <div style={{ fontSize: 20, color: C.ivory, fontWeight: 500, letterSpacing: '-0.02em' }}>Songs & Hymns</div>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', background: C.coal, border: `1px solid ${C.divider}`, padding: '0 12px', gap: 8, marginBottom: 12, borderRadius: 4 }}>
            <i className="ti ti-search" style={{ color: C.mist, fontSize: 14 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: C.ivory,
                fontSize: 13,
                outline: 'none',
                padding: '10px 0',
                fontFamily: 'inherit'
              }}
            />
            {search && (
              <span
                onClick={() => setSearch('')}
                style={{
                  color: C.mist,
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                  userSelect: 'none'
                }}
              >
                ✕
              </span>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['all', 'hymnal', 'custom'] as const).map(val => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                style={{
                  ...buttonBase,
                  flex: 1,
                  padding: '8px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  border: `1px solid ${filter === val ? C.gold : C.divider}`,
                  color: filter === val ? C.gold : C.mist,
                  background: filter === val ? 'rgba(255, 213, 79, 0.08)' : 'transparent',
                  borderRadius: 3
                }}
              >
                {val.charAt(0).toUpperCase() + val.slice(1)}
              </button>
            ))}
          </div>

          {/* Language filter pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setLangFilter('all')}
              style={{
                ...buttonBase,
                padding: '6px 12px',
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${langFilter === 'all' ? C.amber : C.divider}`,
                color: langFilter === 'all' ? C.amber : C.mist,
                background: langFilter === 'all' ? 'rgba(251, 192, 45, 0.1)' : 'transparent',
                borderRadius: 12
              }}
            >
              All
            </button>
            {languages.map(lang => (
              <button
                key={lang}
                onClick={() => setLangFilter(lang)}
                style={{
                  ...buttonBase,
                  padding: '6px 12px',
                  fontSize: 10,
                  fontWeight: 600,
                  border: `1px solid ${langFilter === lang ? C.amber : C.divider}`,
                  color: langFilter === lang ? C.amber : C.mist,
                  background: langFilter === lang ? 'rgba(251, 192, 45, 0.1)' : 'transparent',
                  borderRadius: 12
                }}
              >
                {LANG_LABELS[lang] || lang}
              </button>
            ))}
          </div>
        </div>

        {/* Song list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.mist, fontSize: 12 }}>Loading...</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.mist }}>
              <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 10 }}>⚔</div>
              <div style={{ fontSize: 11 }}>{search ? 'No songs match' : 'No songs'}</div>
            </div>
          ) : (
            languages.map(lang => {
              const langSongs = songsByLang[lang]
              if (langSongs.length === 0) return null
              const isExpanded = expandedLangs[lang] !== false // Default to expanded
              
              return (
                <div key={lang} style={{ marginBottom: 2 }}>
                  {/* Language group header */}
                  <button
                    onClick={() => setExpandedLangs(e => ({ ...e, [lang]: !e[lang] }))}
                    style={{
                      ...buttonBase,
                      width: '100%',
                      padding: '10px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: C.coal,
                      color: C.gold,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      borderLeft: `3px solid ${C.amber}`,
                      textAlign: 'left'
                    }}
                  >
                    <span>{(LANG_LABELS[lang] || lang).toUpperCase()}</span>
                    <span style={{ fontSize: 10, color: C.mist }}>
                      {langSongs.length} • {isExpanded ? '▼' : '▶'}
                    </span>
                  </button>

                  {/* Language group items */}
                  {isExpanded && langSongs.map(song => {
                    const isActive = selected?.id === song.id
                    const srcColor = song.source === 'hymnal' ? C.amber : C.fire
                    
                    return (
                      <div
                        key={song.id}
                        onClick={() => selectSong(song)}
                        style={{
                          borderLeft: `3px solid ${isActive ? C.gold : srcColor}`,
                          background: isActive ? 'rgba(255, 213, 79, 0.08)' : 'transparent',
                          borderBottom: `1px solid ${C.border}`,
                          cursor: 'pointer',
                          padding: '10px 18px',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                          {song.hymn_number && (
                            <span
                              style={{
                                fontSize: 8,
                                color: C.fire,
                                fontWeight: 700,
                                padding: '2px 7px',
                                background: 'rgba(255, 111, 0, 0.12)',
                                border: `1px solid rgba(255, 111, 0, 0.3)`,
                                borderRadius: 2,
                                letterSpacing: '0.05em'
                              }}
                            >
                              HYM {String(song.hymn_number).padStart(3, '0')}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 8,
                              color: srcColor,
                              fontWeight: 700,
                              padding: '2px 7px',
                              background: `rgba(${srcColor === C.amber ? '251,192,45' : '255,111,0'}, 0.12)`,
                              border: `1px solid ${srcColor}44`,
                              borderRadius: 2,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase'
                            }}
                          >
                            {song.source}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: isActive ? C.ivory : C.bone,
                            fontWeight: 500,
                            marginBottom: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {song.title}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer stats */}
        <div
          style={{
            padding: '14px 18px',
            borderTop: `1px solid ${C.border}`,
            background: C.void,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            flexShrink: 0
          }}
        >
          {[
            ['Hymns', songs.filter(s => s.source === 'hymnal').length, C.amber],
            ['Custom', songs.filter(s => s.source === 'custom').length, C.fire],
            ['Total', songs.length, C.gold]
          ].map(([label, val, color]) => (
            <div key={label as string} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: color as string }}>{val as number}</div>
              <div style={{ fontSize: 9, color: C.mist, letterSpacing: '0.05em', marginTop: 4 }}>{label as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: DETAIL ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: C.coal }}>
        {!selected ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              background: 'linear-gradient(135deg, rgba(23,32,44,0.5) 0%, rgba(20,25,35,0.8) 100%)'
            }}
          >
            <div style={{ fontSize: 56, opacity: 0.1 }}>⚔</div>
            <div style={{ fontSize: 12, color: C.mist, letterSpacing: '0.1em', fontWeight: 500 }}>SELECT A SONG TO BEGIN</div>
          </div>
        ) : (
          <>
            {/* Header with title and actions */}
            <div
              style={{
                padding: '18px 24px',
                background: C.ash,
                borderBottom: `1px solid ${C.border}`,
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <input
                      style={{
                        ...inputStyle,
                        fontSize: 18,
                        fontWeight: 600
                      }}
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                    />
                  ) : (
                    <h1
                      style={{
                        fontSize: 22,
                        fontWeight: 600,
                        color: C.ivory,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        letterSpacing: '-0.01em'
                      }}
                    >
                      {selected.title}
                    </h1>
                  )}
                  <div style={{ fontSize: 11, color: C.mist, marginTop: 6, display: 'flex', gap: 8 }}>
                    <span>{LANG_LABELS[selected.language] || selected.language}</span>
                    <span>•</span>
                    <span>{selected.source === 'hymnal' ? 'Hymnal' : 'Custom'}</span>
                    <span>•</span>
                    <span>{sections.length} sections</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => addToQueue(selected.title, 'song')}
                    style={{
                      ...buttonBase,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${C.amber}`,
                      color: C.amber,
                      background: 'rgba(251, 192, 45, 0.08)',
                      borderRadius: 3,
                      letterSpacing: '0.05em'
                    }}
                  >
                    <i className="ti ti-list-check" /> QUEUE
                  </button>

                  {selected.source === 'custom' && !editing && (
                    <button
                      onClick={startEdit}
                      style={{
                        ...buttonBase,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${C.divider}`,
                        color: C.mist,
                        background: 'transparent',
                        borderRadius: 3
                      }}
                    >
                      <i className="ti ti-edit" /> EDIT
                    </button>
                  )}

                  {editing && (
                    <>
                      <button
                        onClick={saveEdit}
                        style={{
                          ...buttonBase,
                          padding: '8px 16px',
                          fontSize: 11,
                          fontWeight: 700,
                          border: 'none',
                          background: C.gold,
                          color: C.void,
                          borderRadius: 3,
                          letterSpacing: '0.05em'
                        }}
                      >
                        SAVE
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        style={{
                          ...buttonBase,
                          padding: '8px 14px',
                          fontSize: 11,
                          fontWeight: 600,
                          border: `1px solid ${C.divider}`,
                          color: C.mist,
                          background: 'transparent',
                          borderRadius: 3
                        }}
                      >
                        CANCEL
                      </button>
                    </>
                  )}

                  {selected.source === 'custom' && !editing && (
                    <button
                      onClick={handleDelete}
                      style={{
                        ...buttonBase,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${C.crimson}88`,
                        color: C.blood,
                        background: 'transparent',
                        borderRadius: 3
                      }}
                    >
                      <i className="ti ti-trash" /> DELETE
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Section tabs */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '12px 18px',
                background: C.coal,
                borderBottom: `1px solid ${C.border}`,
                flexShrink: 0,
                overflowX: 'auto',
                overflowY: 'hidden'
              }}
            >
              {sections.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSec(i)}
                  style={{
                    ...buttonBase,
                    padding: '6px 12px',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    border: `1px solid ${i === currentSec ? C.gold : C.divider}`,
                    color: i === currentSec ? C.gold : C.mist,
                    background: i === currentSec ? 'rgba(255, 213, 79, 0.1)' : 'transparent',
                    borderRadius: 3,
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {s.type === 'verse' ? `Verse ${i + 1}` : s.type.charAt(0).toUpperCase() + s.type.slice(1)}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div
              style={{
                flex: 1,
                padding: '32px 40px',
                overflowY: 'auto',
                background: C.coal,
                position: 'relative'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: `linear-gradient(to right, ${C.blood}, ${C.gold}, transparent)`
                }}
              />

              {section && (editing ? (
                <textarea
                  value={editSections[currentSec]?.content || ''}
                  onChange={e =>
                    setEditSections(secs =>
                      secs.map((s, i) => (i === currentSec ? { ...s, content: e.target.value } : s))
                    )
                  }
                  rows={12}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    lineHeight: 1.8,
                    fontSize: 15,
                    fontFamily: 'inherit'
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: 1.9,
                    color: C.ivory,
                    fontWeight: 300,
                    whiteSpace: 'pre-line',
                    letterSpacing: '0.01em'
                  }}
                >
                  {section.content}
                </div>
              ))}
            </div>

            {/* Action bar */}
            <div
              style={{
                padding: '12px 18px',
                background: C.void,
                borderTop: `1px solid ${C.border}`,
                display: 'flex',
                gap: 8,
                flexShrink: 0
              }}
            >
              <button
                onClick={() => section && goLive(selected.title, section.content)}
                style={{
                  ...buttonBase,
                  flex: 1,
                  padding: '12px 16px',
                  background: `linear-gradient(to right, ${C.crimson}, #991f1f)`,
                  border: `1px solid ${C.blood}`,
                  color: C.ivory,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  borderRadius: 3
                }}
              >
                GO LIVE
              </button>

              <button
                onClick={() => currentSec > 0 && setCurrentSec(i => i - 1)}
                disabled={currentSec === 0}
                style={{
                  ...buttonBase,
                  padding: '12px 14px',
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: currentSec === 0 ? C.mist : C.ghost,
                  fontSize: 16,
                  cursor: currentSec === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentSec === 0 ? 0.3 : 1,
                  borderRadius: 3
                }}
              >
                <i className="ti ti-chevron-left" />
              </button>

              <button
                onClick={() => currentSec < sections.length - 1 && setCurrentSec(i => i + 1)}
                disabled={currentSec === sections.length - 1}
                style={{
                  ...buttonBase,
                  padding: '12px 14px',
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: currentSec === sections.length - 1 ? C.mist : C.ghost,
                  fontSize: 16,
                  cursor: currentSec === sections.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: currentSec === sections.length - 1 ? 0.3 : 1,
                  borderRadius: 3
                }}
              >
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}