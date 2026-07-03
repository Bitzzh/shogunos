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
const LANG_ORDER = ['en', 'sn', 'nd', 'fr']

export default function Songs({ goLive, addToQueue, notify }: Props) {
  const [songs, setSongs] = useState<Song[]>([])
  const [selected, setSelected] = useState<Song | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [currentSec, setCurrentSec] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'hymnal' | 'custom'>('all')
  const [langFilter, setLangFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editSections, setEditSections] = useState<Section[]>([])
  const [editTitle, setEditTitle] = useState('')
  const [expandedLangs, setExpandedLangs] = useState<Record<string, boolean>>({})
  const api = (window as any).shogunos

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all: Song[] = await api.searchSongs('')
      setSongs(all.sort((a, b) => (a.hymn_number || 999) - (b.hymn_number || 999)))
      const langs = Array.from(new Set(all.map(s => s.language)))
      if (langs.length > 0) setExpandedLangs({ [langs[0]]: true })
    } catch { notify('Failed to load songs') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function selectSong(song: Song) {
    setSelected(song)
    setCurrentSec(0)
    setEditing(false)
    const secs: Section[] = await api.getSongSections(song.id)
    setSections(secs)
  }

  async function handleDelete() {
    if (!selected) return
    if (!confirm(`Delete "${selected.title}"? This cannot be undone.`)) return
    await api.deleteSong(selected.id)
    setSongs(s => s.filter(x => x.id !== selected.id))
    setSelected(null)
    setSections([])
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
    setSelected(updated)
    setSections(editSections)
    setEditing(false)
    notify('Song saved')
  }

  const visible = songs.filter(s => {
    if (filter !== 'all' && s.source !== filter) return false
    if (langFilter !== 'all' && s.language !== langFilter) return false
    if (search) return s.title.toLowerCase().includes(search.toLowerCase())
    return true
  })

  const languages = Array.from(new Set(songs.map(s => s.language)))
    .sort((a, b) => LANG_ORDER.indexOf(a) - LANG_ORDER.indexOf(b))

  const songsByLang = languages.reduce((acc, lang) => {
    acc[lang] = visible.filter(s => s.language === lang)
    return acc
  }, {} as Record<string, Song[]>)

  const section = editing ? editSections[currentSec] : sections[currentSec]

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: C.void }}>
      {/* SIDEBAR - 360px WIDE */}
      <div style={{ width: 360, background: C.ash, borderRight: `1px solid ${C.divider}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        
        {/* TOP SECTION */}
        <div style={{ background: C.void, borderBottom: `1px solid ${C.divider}`, flexShrink: 0, padding: '28px 28px' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: C.ghost, fontWeight: 700, letterSpacing: '0.25em', marginBottom: 12 }}>LIBRARY</div>
            <div style={{ fontSize: 32, color: C.ivory, fontWeight: 700, letterSpacing: '-0.02em' }}>Songs</div>
          </div>

          {/* SEARCH */}
          <div style={{ display: 'flex', alignItems: 'center', background: C.coal, border: `1px solid ${C.divider}`, padding: '0 18px', gap: 12, marginBottom: 24, borderRadius: 8, height: 50 }}>
            <i className="ti ti-search" style={{ color: C.mist, fontSize: 18 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: C.ivory,
                fontSize: 15,
                outline: 'none',
                padding: '12px 0',
                fontFamily: 'inherit'
              }}
            />
            {search && (
              <span onClick={() => setSearch('')} style={{ color: C.mist, cursor: 'pointer', fontSize: 20, userSelect: 'none' }}>✕</span>
            )}
          </div>

          {/* SOURCE FILTERS */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {(['all', 'hymnal', 'custom'] as const).map(val => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  border: `2px solid ${filter === val ? C.gold : C.divider}`,
                  color: filter === val ? C.gold : C.mist,
                  background: filter === val ? 'rgba(255, 213, 79, 0.12)' : 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
                }}
              >
                {val === 'all' ? 'All' : val === 'hymnal' ? 'Hymnal' : 'Custom'}
              </button>
            ))}
          </div>

          {/* LANGUAGE FILTERS */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setLangFilter('all')}
              style={{
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 700,
                border: `1.5px solid ${langFilter === 'all' ? C.amber : C.divider}`,
                color: langFilter === 'all' ? C.amber : C.mist,
                background: langFilter === 'all' ? 'rgba(251, 192, 45, 0.15)' : 'transparent',
                borderRadius: 16,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s'
              }}
            >
              All
            </button>
            {languages.map(lang => (
              <button
                key={lang}
                onClick={() => setLangFilter(lang)}
                style={{
                  padding: '10px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  border: `1.5px solid ${langFilter === lang ? C.amber : C.divider}`,
                  color: langFilter === lang ? C.amber : C.mist,
                  background: langFilter === lang ? 'rgba(251, 192, 45, 0.15)' : 'transparent',
                  borderRadius: 16,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
                }}
              >
                {LANG_LABELS[lang] || lang}
              </button>
            ))}
          </div>
        </div>

        {/* SONG LIST */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {loading && (
            <div style={{ padding: 60, textAlign: 'center', color: C.mist, fontSize: 14 }}>Loading...</div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: C.mist }}>
              <div style={{ fontSize: 48, opacity: 0.15, marginBottom: 16 }}>⚔</div>
              <div style={{ fontSize: 13 }}>{search ? 'No matches' : 'No songs'}</div>
            </div>
          )}
          {languages.map(lang => {
            const langSongs = songsByLang[lang]
            if (langSongs.length === 0) return null
            const isExpanded = expandedLangs[lang] !== false

            return (
              <div key={lang}>
                <button
                  onClick={() => setExpandedLangs(e => ({ ...e, [lang]: !e[lang] }))}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: C.coal,
                    color: C.gold,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.15em',
                    borderLeft: `5px solid ${C.amber}`,
                    cursor: 'pointer',
                    border: 'none',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{(LANG_LABELS[lang] || lang).toUpperCase()}</span>
                  <span style={{ fontSize: 12, color: C.mist }}>{langSongs.length} {isExpanded ? '▼' : '▶'}</span>
                </button>

                {isExpanded && langSongs.map(song => {
                  const isActive = selected?.id === song.id
                  const srcColor = song.source === 'hymnal' ? C.amber : C.fire

                  return (
                    <div
                      key={song.id}
                      onClick={() => selectSong(song)}
                      style={{
                        borderLeft: `5px solid ${isActive ? C.gold : srcColor}`,
                        background: isActive ? 'rgba(255, 213, 79, 0.1)' : 'transparent',
                        cursor: 'pointer',
                        padding: '16px 24px',
                        transition: 'all 0.15s',
                        borderBottom: `1px solid ${C.divider}`
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        {song.hymn_number && (
                          <span style={{
                            fontSize: 10,
                            color: C.fire,
                            fontWeight: 800,
                            padding: '4px 10px',
                            background: 'rgba(255, 111, 0, 0.15)',
                            border: `1px solid rgba(255, 111, 0, 0.5)`,
                            borderRadius: 4,
                            letterSpacing: '0.05em'
                          }}>
                            #{String(song.hymn_number).padStart(3, '0')}
                          </span>
                        )}
                        <span style={{
                          fontSize: 10,
                          color: srcColor,
                          fontWeight: 800,
                          padding: '4px 10px',
                          background: `rgba(${srcColor === C.amber ? '251,192,45' : '255,111,0'}, 0.15)`,
                          border: `1px solid ${srcColor}88`,
                          borderRadius: 4,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase'
                        }}>
                          {song.source}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 15,
                        color: isActive ? C.ivory : C.bone,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {song.title}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* STATS */}
        <div style={{ padding: '18px 24px', borderTop: `1px solid ${C.divider}`, background: C.void, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flexShrink: 0 }}>
          {[
            ['Hymns', songs.filter(s => s.source === 'hymnal').length, C.amber],
            ['Custom', songs.filter(s => s.source === 'custom').length, C.fire],
            ['Total', songs.length, C.gold]
          ].map(([label, val, color]) => (
            <div key={label as string} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: color as string }}>{val as number}</div>
              <div style={{ fontSize: 11, color: C.mist, letterSpacing: '0.08em', marginTop: 8 }}>{label as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.void }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 80, opacity: 0.08 }}>⚔</div>
            <div style={{ fontSize: 16, color: C.mist, letterSpacing: '0.2em', fontWeight: 600 }}>SELECT A SONG</div>
          </div>
        ) : (
          <>
            {/* HEADER */}
            <div style={{ padding: '32px 40px', background: C.ash, borderBottom: `1px solid ${C.divider}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  {editing ? (
                    <input
                      style={{
                        width: '100%',
                        background: C.coal,
                        border: `1px solid ${C.divider}`,
                        color: C.ivory,
                        padding: '14px 16px',
                        fontSize: 24,
                        fontWeight: 700,
                        outline: 'none',
                        fontFamily: 'inherit',
                        borderRadius: 6,
                        marginBottom: 12
                      }}
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                    />
                  ) : (
                    <h1 style={{ fontSize: 36, fontWeight: 700, color: C.ivory, margin: 0, marginBottom: 12, letterSpacing: '-0.01em' }}>
                      {selected.title}
                    </h1>
                  )}
                  <div style={{ fontSize: 13, color: C.mist, display: 'flex', gap: 16 }}>
                    <span style={{ fontWeight: 600 }}>{LANG_LABELS[selected.language] || selected.language}</span>
                    <span>•</span>
                    <span>{selected.source === 'hymnal' ? 'Hymnal' : 'Custom'}</span>
                    <span>•</span>
                    <span>{sections.length} sections</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => addToQueue(selected.title, 'song')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 22px',
                      fontSize: 13,
                      fontWeight: 700,
                      border: `2px solid ${C.amber}`,
                      color: C.amber,
                      background: 'rgba(251, 192, 45, 0.12)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.2s'
                    }}
                  >
                    <i className="ti ti-list-check" style={{ fontSize: 16 }} /> QUEUE
                  </button>

                  {selected.source === 'custom' && !editing && (
                    <button
                      onClick={startEdit}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 22px',
                        fontSize: 13,
                        fontWeight: 700,
                        border: `2px solid ${C.divider}`,
                        color: C.ghost,
                        background: 'transparent',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.2s'
                      }}
                    >
                      <i className="ti ti-edit" style={{ fontSize: 16 }} /> EDIT
                    </button>
                  )}

                  {editing && (
                    <>
                      <button
                        onClick={saveEdit}
                        style={{
                          padding: '12px 28px',
                          fontSize: 13,
                          fontWeight: 700,
                          border: 'none',
                          background: C.gold,
                          color: C.void,
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'all 0.2s'
                        }}
                      >
                        SAVE
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        style={{
                          padding: '12px 22px',
                          fontSize: 13,
                          fontWeight: 700,
                          border: `2px solid ${C.divider}`,
                          color: C.ghost,
                          background: 'transparent',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'all 0.2s'
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
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 22px',
                        fontSize: 13,
                        fontWeight: 700,
                        border: `2px solid ${C.crimson}88`,
                        color: C.blood,
                        background: 'transparent',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.2s'
                      }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: 16 }} /> DELETE
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* TABS */}
            <div style={{ display: 'flex', gap: 12, padding: '20px 40px', background: C.void, borderBottom: `1px solid ${C.divider}`, flexShrink: 0, overflowX: 'auto' }}>
              {sections.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSec(i)}
                  style={{
                    padding: '10px 20px',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    border: `2px solid ${i === currentSec ? C.gold : C.divider}`,
                    color: i === currentSec ? C.gold : C.mist,
                    background: i === currentSec ? 'rgba(255, 213, 79, 0.12)' : 'transparent',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s'
                  }}
                >
                  {s.type === 'verse' ? `Verse ${i + 1}` : s.type.charAt(0).toUpperCase() + s.type.slice(1)}
                </button>
              ))}
            </div>

            {/* CONTENT */}
            <div style={{ flex: 1, padding: '40px 50px', overflowY: 'auto', background: C.coal }}>
              {section && (editing ? (
                <textarea
                  value={editSections[currentSec]?.content || ''}
                  onChange={e =>
                    setEditSections(secs =>
                      secs.map((s, i) => (i === currentSec ? { ...s, content: e.target.value } : s))
                    )
                  }
                  rows={16}
                  style={{
                    width: '100%',
                    background: C.ember,
                    border: `1px solid ${C.divider}`,
                    color: C.ivory,
                    padding: '20px 24px',
                    fontSize: 16,
                    outline: 'none',
                    fontFamily: 'inherit',
                    borderRadius: 6,
                    resize: 'vertical',
                    lineHeight: 2.2
                  }}
                />
              ) : (
                <div style={{
                  fontSize: 18,
                  lineHeight: 2.4,
                  color: C.ivory,
                  fontWeight: 400,
                  whiteSpace: 'pre-line',
                  letterSpacing: '0.01em'
                }}>
                  {section.content}
                </div>
              ))}
            </div>

            {/* ACTION BAR */}
            <div style={{ padding: '20px 40px', background: C.void, borderTop: `1px solid ${C.divider}`, display: 'flex', gap: 16, flexShrink: 0 }}>
              <button
                onClick={() => section && goLive(selected.title, section.content)}
                style={{
                  flex: 1,
                  padding: '16px 24px',
                  background: `linear-gradient(to right, ${C.crimson}, #cc0000)`,
                  border: `2px solid ${C.blood}`,
                  color: C.ivory,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.15em',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
                }}
              >
                LIVE
              </button>

              <button
                onClick={() => currentSec > 0 && setCurrentSec(i => i - 1)}
                disabled={currentSec === 0}
                style={{
                  padding: '16px 24px',
                  background: 'transparent',
                  border: `2px solid ${C.divider}`,
                  color: currentSec === 0 ? C.mist : C.ghost,
                  fontSize: 20,
                  cursor: currentSec === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentSec === 0 ? 0.4 : 1,
                  borderRadius: 6,
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
                }}
              >
                <i className="ti ti-chevron-left" />
              </button>

              <button
                onClick={() => currentSec < sections.length - 1 && setCurrentSec(i => i + 1)}
                disabled={currentSec === sections.length - 1}
                style={{
                  padding: '16px 24px',
                  background: 'transparent',
                  border: `2px solid ${C.divider}`,
                  color: currentSec === sections.length - 1 ? C.mist : C.ghost,
                  fontSize: 20,
                  cursor: currentSec === sections.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: currentSec === sections.length - 1 ? 0.4 : 1,
                  borderRadius: 6,
                  fontFamily: 'inherit',
                  transition: 'all 0.2s'
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