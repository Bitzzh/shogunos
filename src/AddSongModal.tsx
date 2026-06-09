import React, { useState, useEffect, useRef } from 'react'
import Splash from './Splash'

type Song = { id: number; title: string; hymn_number: number; source: string; language: string }
type Section = { id: number; song_id: number; type: string; order_num: number; content: string }
type Display = { id: number; label: string; isPrimary: boolean }
type DailyVerse = { book: string; chapter: number; verse: number; text: string; version: string }
type BibleVerse = { id: number; book: string; chapter: number; verse: number; text: string; version: string }
type QueueItem = { id: string; title: string; type: string }
type ActiveTab = 'hymnal' | 'bible' | 'songs' | 'daily' | 'queue' | 'timer' | 'backgrounds' | 'stage' | 'themes' | 'add' | 'import' | 'export' | 'settings'

const C = {
  bg: '#040508', s1: '#080B12', s2: '#0C1018', s3: '#111620',
  s4: '#171D2A', s5: '#1E2535',
  teal: '#00FFB2', teal2: '#00CDA0', teal3: '#008C6E', teal4: '#004D3D', teal5: '#001F18',
  purple: '#8B5CF6', purple2: '#A78BFA', purple3: '#4C1D95',
  rose: '#F43F5E', rose2: '#FB7185',
  amber: '#F59E0B', amber2: '#FCD34D',
  white: '#E8EDF8', dim: '#6B7899', muted: '#2D3550',
  border: '#161D2E', border2: '#1F2840',
}

const css = (obj: React.CSSProperties): React.CSSProperties => obj

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('hymnal')
  const [query, setQuery] = useState('')
  const [bibleQuery, setBibleQuery] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [bibleResults, setBibleResults] = useState<BibleVerse[]>([])
  const [selected, setSelected] = useState<Song | null>(null)
  const [selectedVerse, setSelectedVerse] = useState<BibleVerse | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [currentSection, setCurrentSection] = useState(0)
  const [live, setLive] = useState<string | null>(null)
  const [displays, setDisplays] = useState<Display[]>([])
  const [selectedDisplay, setSelectedDisplay] = useState<number | undefined>(undefined)
  const [dailyVerse, setDailyVerse] = useState<DailyVerse | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [blankScreen, setBlankScreen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [clock, setClock] = useState('')
  const [notification, setNotification] = useState('ShogunOS ready · JSON database loaded · Admin_10')
  const [mySongs, setMySongs] = useState<Song[]>([])
  const [timerSeconds, setTimerSeconds] = useState(300)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerInput, setTimerInput] = useState('5')
  const timerRef = useRef<any>(null)
  const [bgColor, setBgColor] = useState('#000000')
  const [bgPresets] = useState([
    { name: 'Pure Black', color: '#000000' },
    { name: 'Deep Navy', color: '#020B18' },
    { name: 'Dark Purple', color: '#0F0620' },
    { name: 'Forest', color: '#031A0A' },
    { name: 'Deep Red', color: '#1A0303' },
    { name: 'Charcoal', color: '#111111' },
  ])
  const [fontSize, setFontSize] = useState(48)
  const [textAlign, setTextAlign] = useState('center')
  const [fontColor, setFontColor] = useState('#FFFFFF')
  const [newTitle, setNewTitle] = useState('')
  const [newLanguage, setNewLanguage] = useState('en')
  const [newHymnNum, setNewHymnNum] = useState('')
  const [newSections, setNewSections] = useState([{ type: 'verse', content: '' }])
  const [addSongMsg, setAddSongMsg] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  const [settingsTab, setSettingsTab] = useState('display')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    async function load() {
      const d = await (window as any).shogunos.getDisplays()
      setDisplays(d)
      setSelectedDisplay(d.length > 1 ? d[1].id : d[0]?.id)
      const v = await (window as any).shogunos.getDailyVerse()
      setDailyVerse(v)
      const q = await (window as any).shogunos.getServiceQueue()
      setQueue(q.map((item: any) => ({ id: String(item.id), title: item.title, type: item.type })))
    }
    if (!showSplash) load()
  }, [showSplash])

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(s => {
          if (s <= 1) { setTimerRunning(false); clearInterval(timerRef.current); return 0 }
          return s - 1
        })
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [timerRunning])

  if (showSplash) return <Splash onDone={() => setShowSplash(false)} />

  async function handleSearch(val: string) {
    setQuery(val)
    if (val.trim().length < 2) { setResults([]); return }
    const found = await (window as any).shogunos.searchSongs(val)
    setResults(found)
  }

  async function handleBibleSearch(val: string) {
    setBibleQuery(val)
    if (val.trim().length < 2) { setBibleResults([]); return }
    const found = await (window as any).shogunos.searchBible(val)
    setBibleResults(found)
  }

  async function handleSelectSong(song: Song) {
    setSelected(song)
    setCurrentSection(0)
    const s = await (window as any).shogunos.getSongSections(song.id)
    setSections(s)
  }

  async function loadMySongs() {
    const found = await (window as any).shogunos.searchSongs('')
    setMySongs(found.filter((s: Song) => s.source === 'custom'))
  }

  async function goLive(title: string, lyrics: string) {
    setLive(title)
    setBlankScreen(false)
    await (window as any).shogunos.goLive({ title, lyrics, displayId: selectedDisplay, fontSize, textAlign, bgColor })
  }

  async function handleSectionClick(i: number) {
    setCurrentSection(i)
    if (live && selected) {
      await (window as any).shogunos.goLive({ title: selected.title, lyrics: sections[i].content, displayId: selectedDisplay, fontSize, textAlign, bgColor })
    }
  }

  async function handleClear() {
    setLive(null)
    setBlankScreen(false)
    await (window as any).shogunos.closeLive()
  }

  async function handleBlank() {
    const next = !blankScreen
    setBlankScreen(next)
    if (next) {
      await (window as any).shogunos.goLive({ title: '', lyrics: '', displayId: selectedDisplay, bgColor })
    }
  }

  async function addToQueue(title: string, type: string) {
    await (window as any).shogunos.addToQueue(title, type)
    setQueue(q => [...q, { id: Date.now().toString(), title, type }])
    notify(`"${title}" added to queue`)
  }

  async function removeFromQueue(id: string) {
    setQueue(q => q.filter(x => x.id !== id))
  }

  async function clearQueue() {
    await (window as any).shogunos.clearQueue()
    setQueue([])
  }

  function notify(msg: string) {
    setNotification(msg)
    setTimeout(() => setNotification(''), 3000)
  }

  async function handleSaveSong() {
    if (!newTitle.trim()) { setAddSongMsg('Please enter a title'); return }
    if (newSections.every(s => !s.content.trim())) { setAddSongMsg('Please add at least one section with content'); return }
    setAddSongMsg('Saving...')
    const songId = await (window as any).shogunos.addSong(newTitle.trim(), newLanguage, 'custom', newHymnNum ? parseInt(newHymnNum) : undefined)
    for (let i = 0; i < newSections.length; i++) {
      if (newSections[i].content.trim()) {
        await (window as any).shogunos.addSongSection(songId, newSections[i].type, i + 1, newSections[i].content.trim())
      }
    }
    setAddSongMsg('Song saved successfully!')
    setNewTitle('')
    setNewHymnNum('')
    setNewSections([{ type: 'verse', content: '' }])
    notify(`"${newTitle}" added to library`)
    setTimeout(() => setAddSongMsg(''), 3000)
  }

  function handleExport() {
    const data = { exported: new Date().toISOString(), app: 'ShogunOS', songs: results }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shogunos-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportMsg('Export complete!')
    setTimeout(() => setExportMsg(''), 3000)
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const section = sections[currentSection]

  const previewText = activeTab === 'daily' && dailyVerse
    ? { ref: `${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`, text: dailyVerse.text }
    : activeTab === 'bible' && selectedVerse
    ? { ref: `${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`, text: selectedVerse.text }
    : section
    ? { ref: `${section.type.toUpperCase()} · ${selected?.title || ''}`, text: section.content }
    : null

  const navGroups = [
    {
      label: 'LIBRARY',
      items: [
        { id: 'hymnal', icon: 'ti-music', label: 'Hymnal', badge: '695', badgeColor: C.teal4, badgeText: C.teal },
        { id: 'bible', icon: 'ti-book-2', label: 'Bible' },
        { id: 'songs', icon: 'ti-playlist', label: 'My Songs', badge: '12', badgeColor: C.purple3, badgeText: C.purple2 },
        { id: 'daily', icon: 'ti-sun', label: 'Daily Verse' },
      ]
    },
    {
      label: 'PRESENT',
      items: [
        { id: 'queue', icon: 'ti-list-check', label: 'Service Queue' },
        { id: 'timer', icon: 'ti-clock', label: 'Timer' },
        { id: 'backgrounds', icon: 'ti-photo', label: 'Backgrounds' },
        { id: 'stage', icon: 'ti-device-tv', label: 'Stage Display' },
        { id: 'themes', icon: 'ti-wand', label: 'Themes' },
      ]
    },
    {
      label: 'MANAGE',
      items: [
        { id: 'add', icon: 'ti-pencil-plus', label: 'Add Song' },
        { id: 'import', icon: 'ti-file-import', label: 'Import .qsp' },
        { id: 'export', icon: 'ti-file-export', label: 'Export' },
        { id: 'settings', icon: 'ti-settings', label: 'Settings' },
      ]
    }
  ]

  const inp: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border2}`, color: C.white, padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%', fontFamily: "'Segoe UI', sans-serif" }
  const lbl: React.CSSProperties = { fontSize: 9, color: C.teal, letterSpacing: '0.2em', fontWeight: 800, marginBottom: 5, display: 'block' }
  const secTitleStyle: React.CSSProperties = { fontSize: 9, color: C.teal, letterSpacing: '0.3em', fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }

  const switchTab = (id: string) => {
    setActiveTab(id as ActiveTab)
    if (id === 'songs') loadMySongs()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: "'Segoe UI', sans-serif", overflow: 'hidden', color: C.white }}>

      {/* ICON RAIL */}
      <div style={{ width: 52, background: C.s1, borderRight: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div onClick={() => setSidebarExpanded(e => !e)} style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${C.border2}`, cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: C.bg, position: 'relative' }}>
            将
            <div style={{ position: 'absolute', inset: -3, border: `1px solid ${C.teal3}`, pointerEvents: 'none' }} />
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 2, overflowY: 'auto' }}>
          {navGroups.flatMap(g => g.items).map(n => (
            <div key={n.id} onClick={() => switchTab(n.id)} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 17, color: activeTab === n.id ? C.teal : C.muted, position: 'relative' }}>
              <i className={`ti ${n.icon}`} />
              {activeTab === n.id && <div style={{ position: 'absolute', left: -8, width: 2, height: 20, background: C.teal, borderRadius: '0 2px 2px 0' }} />}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 0', borderTop: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 26, height: 26, background: C.purple3, border: `1px solid ${C.purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: C.purple2, cursor: 'pointer' }}>A</div>
        </div>
      </div>

      {/* EXPANDED SIDEBAR */}
      {sidebarExpanded && (
        <div style={{ width: 190, background: C.s1, borderRight: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${C.border2}` }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.white, letterSpacing: '0.2em' }}>SHOGUN<span style={{ color: C.teal }}>OS</span></div>
            <div style={{ fontSize: 8, color: C.teal2, letterSpacing: '0.4em', fontWeight: 600, marginTop: 2 }}>— RONIN EDITION —</div>
            <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>Worship Presentation · v1.0</div>
          </div>
          {navGroups.map(group => (
            <div key={group.label}>
              <div style={{ padding: '10px 14px 4px', fontSize: 8, color: C.teal, letterSpacing: '0.3em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                {group.label}
                <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${C.teal4}, transparent)` }} />
              </div>
              {group.items.map(n => (
                <div key={n.id} onClick={() => switchTab(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 11, color: activeTab === n.id ? C.white : C.dim, cursor: 'pointer', borderLeft: activeTab === n.id ? `2px solid ${C.teal}` : '2px solid transparent', background: activeTab === n.id ? C.s2 : 'transparent' }}>
                  <i className={`ti ${n.icon}`} style={{ fontSize: 13, color: activeTab === n.id ? C.teal : C.muted }} />
                  {n.label}
                  {(n as any).badge && <span style={{ marginLeft: 'auto', fontSize: 8, background: (n as any).badgeColor, color: (n as any).badgeText, padding: '1px 5px', fontWeight: 800 }}>{(n as any).badge}</span>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: `1px solid ${C.border2}` }}>
            <div style={{ fontSize: 12, color: C.teal, fontWeight: 700, letterSpacing: '0.15em', marginBottom: 4 }}>{clock}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal }} />
              <div style={{ fontSize: 9, color: C.dim }}>Admin_10 · Display ready</div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {notification && (
          <div style={{ background: `linear-gradient(to right, ${C.teal5}, ${C.s1})`, borderBottom: `1px solid ${C.teal4}`, padding: '4px 14px', fontSize: 9, color: C.teal2, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.06em', flexShrink: 0 }}>
            <i className="ti ti-sparkles" style={{ fontSize: 11 }} />
            {notification}
            <span onClick={() => setNotification('')} style={{ marginLeft: 'auto', cursor: 'pointer', color: C.muted, fontSize: 11 }}><i className="ti ti-x" /></span>
          </div>
        )}

        {/* Topbar */}
        <div style={{ height: 42, background: C.bg, borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'stretch', padding: '0 10px', flexShrink: 0 }}>
          {(['hymnal', 'bible', 'daily', 'queue'] as const).map(t => (
            <div key={t} onClick={() => setActiveTab(t)} style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', color: activeTab === t ? C.teal : C.muted, cursor: 'pointer', borderBottom: activeTab === t ? `2px solid ${C.teal}` : '2px solid transparent' }}>
              {t.toUpperCase()}
            </div>
          ))}
          <div style={{ width: 1, background: C.border2, margin: '10px 6px' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: C.s2, border: `1px solid ${C.border2}`, margin: '7px 0', padding: '0 10px', gap: 8 }}>
            <i className="ti ti-search" style={{ color: C.dim, fontSize: 14, flexShrink: 0 }} />
            <input
              value={activeTab === 'bible' ? bibleQuery : query}
              onChange={e => activeTab === 'bible' ? handleBibleSearch(e.target.value) : handleSearch(e.target.value)}
              placeholder={activeTab === 'bible' ? 'Search Bible by keyword or book...' : 'Search hymns, songs...'}
              style={{ flex: 1, background: 'none', border: 'none', color: C.white, fontSize: 12, outline: 'none' }}
            />
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', fontSize: 9, color: C.dim, cursor: 'pointer', borderLeft: `1px solid ${C.border2}`, background: 'none', border: 'none', fontWeight: 700, letterSpacing: '0.08em' }}>
            <i className="ti ti-language" style={{ fontSize: 13 }} /> EN
          </button>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* HYMNAL */}
          {activeTab === 'hymnal' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
              {!selected && (
                <div style={{ width: 230, background: C.s1, borderRight: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <div style={{ padding: '6px 10px', background: C.bg, borderBottom: `1px solid ${C.border2}` }}>
                    <span style={{ fontSize: 8, color: C.teal, fontWeight: 800, background: C.teal5, border: `1px solid ${C.teal4}`, padding: '2px 6px' }}>{results.length} FOUND</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
                    {results.map(song => (
                      <div key={song.id} onClick={() => handleSelectSong(song)} style={{ display: 'flex', alignItems: 'stretch', marginBottom: 3, cursor: 'pointer' }}>
                        <div style={{ width: 3, background: C.teal3, flexShrink: 0 }} />
                        <div style={{ padding: '7px 8px', flex: 1 }}>
                          <div style={{ fontSize: 8, color: C.teal, fontWeight: 800, letterSpacing: '0.12em', marginBottom: 2 }}>{song.hymn_number ? `HYM ${String(song.hymn_number).padStart(3, '0')}` : 'CUSTOM'}</div>
                          <div style={{ fontSize: 11, color: C.white, fontWeight: 600 }}>{song.title}</div>
                          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{song.source} · {song.language}</div>
                        </div>
                      </div>
                    ))}
                    {results.length === 0 && <div style={{ padding: 16, fontSize: 11, color: C.muted, textAlign: 'center' }}>Search hymns above...</div>}
                  </div>
                </div>
              )}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {selected && section ? (
                  <>
                    <div style={{ padding: '8px 12px', background: C.bg, borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => { setSelected(null); setSections([]) }} style={{ background: 'none', border: `1px solid ${C.border2}`, color: C.muted, padding: '4px 8px', fontSize: 9, cursor: 'pointer', fontWeight: 700 }}>← BACK</button>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, flex: 1 }}>{selected.title}</div>
                      <div style={{ fontSize: 8, border: `1px solid ${C.teal3}`, color: C.teal, padding: '2px 7px', fontWeight: 800 }}>{selected.hymn_number ? `HYM ${String(selected.hymn_number).padStart(3, '0')}` : 'CUSTOM'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 3, padding: '6px 10px', borderBottom: `1px solid ${C.border2}`, background: C.s2, flexWrap: 'wrap', flexShrink: 0 }}>
                      {sections.map((s, i) => (
                        <button key={s.id} onClick={() => handleSectionClick(i)} style={{ padding: '4px 10px', fontSize: 8, fontWeight: 800, cursor: 'pointer', border: i === currentSection ? `1px solid ${C.teal}` : `1px solid ${C.border2}`, color: i === currentSection ? C.bg : C.muted, background: i === currentSection ? C.teal : 'none', letterSpacing: '0.12em', borderLeft: s.type === 'chorus' ? `2px solid ${C.teal2}` : s.type === 'bridge' ? `2px solid ${C.rose}` : `2px solid ${C.purple}` }}>
                          {s.type === 'chorus' ? 'CHORUS' : s.type === 'bridge' ? 'BRIDGE' : `V${i + 1}`}
                        </button>
                      ))}
                    </div>
                    <div style={{ flex: 1, padding: '20px 22px', overflowY: 'auto' }}>
                      <div style={secTitleStyle}>{section.type.toUpperCase()}<div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${C.teal4}, transparent)` }} /></div>
                      <div style={{ fontSize: 15, lineHeight: 2.2, color: C.white, fontWeight: 300, whiteSpace: 'pre-line' }}>{section.content}</div>
                    </div>
                    <div style={{ padding: '7px 10px', borderTop: `1px solid ${C.border2}`, background: C.bg, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => addToQueue(selected.title, 'song')} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 9, fontWeight: 800, cursor: 'pointer', border: `1px solid ${C.teal3}`, color: C.teal, background: C.teal5, letterSpacing: '0.1em' }}>
                        <i className="ti ti-list-check" style={{ fontSize: 12 }} /> ADD TO QUEUE
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                    <i className="ti ti-music" style={{ fontSize: 32, color: C.muted }} />
                    <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em' }}>SEARCH FOR A HYMN ABOVE</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BIBLE */}
          {activeTab === 'bible' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
              {!selectedVerse && (
                <div style={{ width: 230, background: C.s1, borderRight: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <div style={{ padding: '6px 10px', background: C.bg, borderBottom: `1px solid ${C.border2}` }}>
                    <span style={{ fontSize: 8, color: C.purple2, fontWeight: 800, background: C.purple3, padding: '2px 6px' }}>{bibleResults.length} FOUND</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
                    {bibleResults.map(v => (
                      <div key={v.id} onClick={() => setSelectedVerse(v)} style={{ display: 'flex', alignItems: 'stretch', marginBottom: 3, cursor: 'pointer' }}>
                        <div style={{ width: 3, background: C.purple, flexShrink: 0 }} />
                        <div style={{ padding: '7px 8px', flex: 1 }}>
                          <div style={{ fontSize: 8, color: C.purple2, fontWeight: 800, letterSpacing: '0.1em', marginBottom: 2 }}>{v.book} {v.chapter}:{v.verse}</div>
                          <div style={{ fontSize: 11, color: C.white, lineHeight: 1.5 }}>{v.text.substring(0, 70)}...</div>
                        </div>
                      </div>
                    ))}
                    {bibleResults.length === 0 && <div style={{ padding: 16, fontSize: 11, color: C.muted, textAlign: 'center' }}>Try "grace", "John" or "strength"</div>}
                  </div>
                </div>
              )}
              <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
                {selectedVerse ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => setSelectedVerse(null)} style={{ background: 'none', border: `1px solid ${C.border2}`, color: C.muted, padding: '4px 8px', fontSize: 9, cursor: 'pointer', fontWeight: 700 }}>← BACK</button>
                      <div style={{ fontSize: 12, color: C.purple2, fontWeight: 800, letterSpacing: '0.15em' }}>{selectedVerse.book} {selectedVerse.chapter}:{selectedVerse.verse} — {selectedVerse.version}</div>
                    </div>
                    <div style={{ fontSize: 18, lineHeight: 1.9, color: C.white, fontStyle: 'italic', flex: 1 }}>"{selectedVerse.text}"</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => goLive(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`, selectedVerse.text)} style={{ padding: '10px 24px', background: C.rose, border: 'none', color: C.white, fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.15em', borderTop: `2px solid ${C.rose2}` }}>GO LIVE</button>
                      <button onClick={() => addToQueue(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`, 'verse')} style={{ padding: '10px 16px', background: C.teal5, border: `1px solid ${C.teal3}`, color: C.teal, fontSize: 9, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em' }}>ADD TO QUEUE</button>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                    <i className="ti ti-book-2" style={{ fontSize: 32, color: C.muted }} />
                    <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em' }}>SEARCH FOR A BIBLE VERSE ABOVE</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MY SONGS */}
          {activeTab === 'songs' && (
            <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              <div style={secTitleStyle}>MY SONGS <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${C.teal4}, transparent)` }} /></div>
              {mySongs.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                  <i className="ti ti-playlist" style={{ fontSize: 40, color: C.muted }} />
                  <div style={{ fontSize: 11, color: C.muted }}>No custom songs yet</div>
                  <button onClick={() => setActiveTab('add')} style={{ padding: '8px 20px', background: C.teal, border: 'none', color: C.bg, fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em' }}>ADD YOUR FIRST SONG</button>
                </div>
              ) : (
                mySongs.map(song => (
                  <div key={song.id} onClick={() => { handleSelectSong(song); setActiveTab('hymnal') }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.s2, border: `1px solid ${C.border2}`, cursor: 'pointer' }}>
                    <div style={{ width: 3, height: 32, background: C.purple, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{song.title}</div>
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{song.language} · custom</div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize: 14, color: C.muted }} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* DAILY VERSE */}
          {activeTab === 'daily' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              <div style={{ fontSize: 9, color: C.teal, letterSpacing: '0.25em', fontWeight: 800 }}>
                DAILY VERSE — {new Date().toLocaleDateString('en-ZW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
              </div>
              {dailyVerse && (
                <div style={{ background: C.s2, border: `1px solid ${C.border2}`, padding: 24, flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 1, background: `linear-gradient(to right, ${C.teal3}, transparent)` }} />
                  <div style={{ fontSize: 11, color: C.teal, fontWeight: 800, marginBottom: 16, letterSpacing: '0.15em' }}>{dailyVerse.book} {dailyVerse.chapter}:{dailyVerse.verse} — {dailyVerse.version}</div>
                  <div style={{ fontSize: 20, lineHeight: 1.9, color: C.white, fontStyle: 'italic' }}>"{dailyVerse.text}"</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                    <button onClick={() => goLive(`${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`, dailyVerse.text)} style={{ padding: '10px 24px', background: C.rose, border: 'none', color: C.white, fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.15em', borderTop: `2px solid ${C.rose2}` }}>GO LIVE</button>
                    <button onClick={() => addToQueue(`${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`, 'verse')} style={{ padding: '10px 16px', background: C.teal5, border: `1px solid ${C.teal3}`, color: C.teal, fontSize: 9, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em' }}>ADD TO QUEUE</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SERVICE QUEUE */}
          {activeTab === 'queue' && (
            <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={secTitleStyle}>SERVICE QUEUE — {queue.length} ITEMS</div>
                <button onClick={clearQueue} style={{ padding: '4px 10px', background: 'none', border: `1px solid ${C.border2}`, color: C.dim, fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em' }}>CLEAR ALL</button>
              </div>
              {queue.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                  <i className="ti ti-list-check" style={{ fontSize: 40, color: C.muted }} />
                  <div style={{ fontSize: 11, color: C.muted }}>Queue is empty — add songs or verses from the library</div>
                </div>
              ) : (
                queue.map((item, i) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.s2, border: `1px solid ${C.border2}` }}>
                    <span style={{ fontSize: 9, color: C.amber, fontWeight: 800, width: 16 }}>{i + 1}</span>
                    <div style={{ width: 3, height: 28, background: item.type === 'verse' ? C.purple : C.teal3, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: C.white, flex: 1 }}>{item.title}</span>
                    <span style={{ fontSize: 8, color: C.muted, background: C.s3, padding: '2px 6px', fontWeight: 700 }}>{item.type.toUpperCase()}</span>
                    <button onClick={() => removeFromQueue(item.id)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13 }}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TIMER */}
          {activeTab === 'timer' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
              <div style={secTitleStyle}>SERVICE TIMER</div>
              <div style={{ fontSize: 80, fontWeight: 200, color: timerSeconds <= 60 ? C.rose : C.teal, letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums' } as React.CSSProperties}>
                {formatTime(timerSeconds)}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" value={timerInput} onChange={e => setTimerInput(e.target.value)} placeholder="Minutes" style={{ ...inp, width: 80, textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: C.dim }}>minutes</span>
                <button onClick={() => { setTimerSeconds(parseInt(timerInput) * 60 || 300); setTimerRunning(false) }} style={{ padding: '8px 14px', background: C.s2, border: `1px solid ${C.border2}`, color: C.dim, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em' }}>SET</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setTimerRunning(r => !r)} style={{ padding: '10px 28px', background: timerRunning ? C.rose : C.teal, border: 'none', color: C.bg, fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.15em', borderTop: `2px solid ${timerRunning ? C.rose2 : C.white}` }}>
                  {timerRunning ? 'PAUSE' : 'START'}
                </button>
                <button onClick={() => { setTimerRunning(false); setTimerSeconds(parseInt(timerInput) * 60 || 300) }} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${C.border2}`, color: C.dim, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.12em' }}>RESET</button>
              </div>
            </div>
          )}

          {/* BACKGROUNDS */}
          {activeTab === 'backgrounds' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              <div style={secTitleStyle}>BACKGROUND SETTINGS</div>
              <div>
                <label style={lbl}>CURRENT BACKGROUND COLOR</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 48, height: 48, background: bgColor, border: `1px solid ${C.border2}` }} />
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 48, height: 48, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer', padding: 2 }} />
                  <input style={{ ...inp, width: 140 }} value={bgColor} onChange={e => setBgColor(e.target.value)} placeholder="#000000" />
                </div>
              </div>
              <div>
                <label style={lbl}>PRESETS</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {bgPresets.map(p => (
                    <div key={p.name} onClick={() => setBgColor(p.color)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 60, background: p.color, border: bgColor === p.color ? `2px solid ${C.teal}` : `1px solid ${C.border2}` }} />
                      <span style={{ fontSize: 9, color: C.dim, letterSpacing: '0.08em' }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: bgColor, border: `1px solid ${C.border2}`, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: fontColor, fontSize: 18, fontStyle: 'italic' }}>Preview text on background</span>
              </div>
              <button onClick={() => { if (live) goLive(live, section?.content || ''); notify('Background applied to live display') }} style={{ alignSelf: 'flex-start', padding: '9px 20px', background: C.teal, border: 'none', color: C.bg, fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.12em' }}>APPLY TO LIVE</button>
            </div>
          )}

          {/* STAGE DISPLAY */}
          {activeTab === 'stage' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              <div style={secTitleStyle}>STAGE DISPLAY</div>
              <div style={{ background: C.s2, border: `1px solid ${C.border2}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
                  The Stage Display is a simplified view shown on a monitor facing the worship team. It shows the current and next slide so singers know what's coming.
                </div>
                <div style={{ background: C.bg, border: `1px solid ${C.border2}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 9, color: C.teal, letterSpacing: '0.2em', fontWeight: 800 }}>CURRENT</div>
                  <div style={{ fontSize: 16, color: C.white, lineHeight: 1.8, fontStyle: 'italic' }}>{section?.content || 'Nothing presenting'}</div>
                  <div style={{ height: 1, background: C.border2 }} />
                  <div style={{ fontSize: 9, color: C.dim, letterSpacing: '0.2em', fontWeight: 800 }}>NEXT</div>
                  <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.8, fontStyle: 'italic' }}>{sections[currentSection + 1]?.content || '—'}</div>
                </div>
                <div style={{ fontSize: 10, color: C.amber }}>Coming soon: Send stage display to a separate monitor output</div>
              </div>
            </div>
          )}

          {/* THEMES */}
          {activeTab === 'themes' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              <div style={secTitleStyle}>DISPLAY THEMES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {[
                  { name: 'Default', fontSize: 48, color: '#FFFFFF', bg: '#000000' },
                  { name: 'Large', fontSize: 60, color: '#FFFFFF', bg: '#000000' },
                  { name: 'Small', fontSize: 36, color: '#FFFFFF', bg: '#000000' },
                  { name: 'Warm', fontSize: 48, color: '#FCD34D', bg: '#0D0800' },
                  { name: 'Cool', fontSize: 48, color: '#7DD3FC', bg: '#020B18' },
                  { name: 'Sacred', fontSize: 48, color: '#A78BFA', bg: '#0F0620' },
                ].map(theme => (
                  <div key={theme.name} onClick={() => { setFontSize(theme.fontSize); setFontColor(theme.color); setBgColor(theme.bg); notify(`Theme "${theme.name}" applied`) }} style={{ background: theme.bg, border: fontSize === theme.fontSize && fontColor === theme.color && bgColor === theme.bg ? `2px solid ${C.teal}` : `1px solid ${C.border2}`, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 9, color: C.teal, fontWeight: 800, letterSpacing: '0.15em' }}>{theme.name.toUpperCase()}</div>
                    <div style={{ fontSize: theme.fontSize * 0.3, color: theme.color, fontStyle: 'italic' }}>Holy, holy, holy...</div>
                    <div style={{ fontSize: 9, color: C.muted }}>{theme.fontSize}px · {theme.color}</div>
                  </div>
                ))}
              </div>
              <div>
                <label style={lbl}>CUSTOM FONT SIZE</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="range" min={24} max={96} value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} style={{ flex: 1, accentColor: C.teal } as React.CSSProperties} />
                  <span style={{ fontSize: 12, color: C.teal, fontWeight: 700, width: 40 }}>{fontSize}px</span>
                </div>
              </div>
              <div>
                <label style={lbl}>CUSTOM FONT COLOR</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} style={{ width: 40, height: 32, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer' }} />
                  <input style={{ ...inp, width: 140 }} value={fontColor} onChange={e => setFontColor(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ADD SONG */}
          {activeTab === 'add' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              <div style={secTitleStyle}>ADD NEW SONG</div>
              {addSongMsg && (
                <div style={{ background: addSongMsg.includes('success') ? C.teal5 : 'rgba(244,63,94,0.1)', border: `1px solid ${addSongMsg.includes('success') ? C.teal3 : C.rose}`, padding: '8px 12px', fontSize: 11, color: addSongMsg.includes('success') ? C.teal : C.rose2 }}>{addSongMsg}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>SONG TITLE *</label>
                  <input style={inp} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Enter song title..." />
                </div>
                <div>
                  <label style={lbl}>HYMN NUMBER (optional)</label>
                  <input style={inp} value={newHymnNum} onChange={e => setNewHymnNum(e.target.value)} placeholder="e.g. 142" type="number" />
                </div>
              </div>
              <div>
                <label style={lbl}>LANGUAGE</label>
                <select style={inp} value={newLanguage} onChange={e => setNewLanguage(e.target.value)}>
                  <option value="en">English</option>
                  <option value="sn">Shona</option>
                  <option value="nd">Ndebele</option>
                  <option value="fr">French</option>
                  <option value="pt">Portuguese</option>
                  <option value="sw">Swahili</option>
                </select>
              </div>
              <div>
                <label style={lbl}>SONG SECTIONS</label>
                {newSections.map((sec, i) => (
                  <div key={i} style={{ marginBottom: 10, border: `1px solid ${C.border2}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: C.s2, borderBottom: `1px solid ${C.border2}` }}>
                      <select value={sec.type} onChange={e => setNewSections(s => s.map((x, idx) => idx === i ? { ...x, type: e.target.value } : x))} style={{ background: C.s3, border: `1px solid ${C.border2}`, color: C.white, padding: '3px 6px', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', outline: 'none' }}>
                        <option value="verse">VERSE {i + 1}</option>
                        <option value="chorus">CHORUS</option>
                        <option value="bridge">BRIDGE</option>
                        <option value="intro">INTRO</option>
                        <option value="outro">OUTRO</option>
                      </select>
                      <div style={{ flex: 1 }} />
                      {newSections.length > 1 && <button onClick={() => setNewSections(s => s.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12 }}>✕</button>}
                    </div>
                    <textarea value={sec.content} onChange={e => setNewSections(s => s.map((x, idx) => idx === i ? { ...x, content: e.target.value } : x))} placeholder="Type lyrics here..." rows={4} style={{ ...inp, resize: 'vertical', border: 'none', borderRadius: 0 } as React.CSSProperties} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6 }}>
                  {['verse', 'chorus', 'bridge'].map(type => (
                    <button key={type} onClick={() => setNewSections(s => [...s, { type, content: '' }])} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border2}`, color: C.dim, fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em' }}>+ {type.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleSaveSong} style={{ alignSelf: 'flex-start', padding: '10px 24px', background: C.teal, border: 'none', color: C.bg, fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.12em', borderTop: `2px solid ${C.white}` }}>SAVE SONG</button>
            </div>
          )}

          {/* IMPORT */}
          {activeTab === 'import' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              <div style={secTitleStyle}>IMPORT SONGS</div>
              <div style={{ background: C.s2, border: `1px solid ${C.border2}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 9, color: C.teal, fontWeight: 800, letterSpacing: '0.2em' }}>QUELEA .QSP FORMAT</div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.8 }}>You can import your Quelea song library (.qsp files) into ShogunOS.</div>
                <div style={{ background: C.bg, border: `1px solid ${C.amber}`, padding: 12, fontSize: 10, color: C.amber, lineHeight: 1.7 }}>
                  ⚠ Full .qsp import will be available in ShogunOS v1.1. For now, use Add Song to add songs manually.
                </div>
                <button onClick={() => setActiveTab('add')} style={{ alignSelf: 'flex-start', padding: '8px 18px', background: C.teal, border: 'none', color: C.bg, fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.12em' }}>ADD SONGS MANUALLY →</button>
              </div>
              <div style={{ background: C.s2, border: `1px solid ${C.border2}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 9, color: C.teal, fontWeight: 800, letterSpacing: '0.2em' }}>SHOGUNOS JSON FORMAT</div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.8 }}>Import songs exported from another ShogunOS installation.</div>
                <input type="file" accept=".json" style={{ fontSize: 11, color: C.dim }} />
              </div>
            </div>
          )}

          {/* EXPORT */}
          {activeTab === 'export' && (
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              <div style={secTitleStyle}>EXPORT SONGS</div>
              {exportMsg && <div style={{ background: C.teal5, border: `1px solid ${C.teal3}`, padding: '8px 12px', fontSize: 11, color: C.teal }}>{exportMsg}</div>}
              <div style={{ background: C.s2, border: `1px solid ${C.border2}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 9, color: C.teal, fontWeight: 800, letterSpacing: '0.2em' }}>EXPORT AS JSON</div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.8 }}>Export your song library as a JSON file for backup or transfer to another ShogunOS installation.</div>
                <button onClick={handleExport} style={{ alignSelf: 'flex-start', padding: '9px 20px', background: C.teal, border: 'none', color: C.bg, fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.12em', borderTop: `2px solid ${C.white}` }}>EXPORT LIBRARY</button>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
              <div style={{ width: 160, background: C.bg, borderRight: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                {['display', 'about'].map(s => (
                  <div key={s} onClick={() => setSettingsTab(s)} style={{ padding: '10px 14px', fontSize: 11, color: settingsTab === s ? C.white : C.dim, cursor: 'pointer', borderLeft: settingsTab === s ? `2px solid ${C.teal}` : '2px solid transparent', background: settingsTab === s ? C.s1 : 'transparent', textTransform: 'capitalize' as any }}>
                    {s}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                {settingsTab === 'display' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={secTitleStyle}>DISPLAY SETTINGS</div>
                    <div>
                      <label style={lbl}>DEFAULT FONT SIZE</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="range" min={24} max={96} value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} style={{ flex: 1, accentColor: C.teal } as React.CSSProperties} />
                        <span style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>{fontSize}px</span>
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>TEXT ALIGNMENT</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['left', 'center', 'right'].map(a => (
                          <button key={a} onClick={() => setTextAlign(a)} style={{ padding: '6px 14px', background: textAlign === a ? C.teal : 'none', border: `1px solid ${textAlign === a ? C.teal : C.border2}`, color: textAlign === a ? C.bg : C.dim, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'capitalize' as any }}>{a}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>BACKGROUND COLOR</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 40, height: 32, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer' }} />
                        <input style={{ ...inp, width: 120 }} value={bgColor} onChange={e => setBgColor(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>FONT COLOR</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} style={{ width: 40, height: 32, border: `1px solid ${C.border2}`, background: 'none', cursor: 'pointer' }} />
                        <input style={{ ...inp, width: 120 }} value={fontColor} onChange={e => setFontColor(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === 'about' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={secTitleStyle}>ABOUT SHOGUNOS</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ width: 48, height: 48, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: C.bg }}>将</div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.white, letterSpacing: '0.15em' }}>SHOGUN<span style={{ color: C.teal }}>OS</span></div>
                        <div style={{ fontSize: 9, color: C.teal2, letterSpacing: '0.3em' }}>RONIN EDITION · v1.0</div>
                      </div>
                    </div>
                    {[
                      ['Developer', 'Admin_10 with Claude AI'],
                      ['Type', 'Worship Presentation Software'],
                      ['Platform', 'Windows · macOS · Linux'],
                      ['Stack', 'Electron · React · TypeScript'],
                      ['Database', 'JSON (local, offline-first)'],
                      ['License', 'Private — All rights reserved'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border2}` }}>
                        <div style={{ fontSize: 9, color: C.teal, fontWeight: 800, letterSpacing: '0.15em', width: 80, flexShrink: 0 }}>{k}</div>
                        <div style={{ fontSize: 11, color: C.dim }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: 225, background: C.s1, borderLeft: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${C.border2}`, minHeight: 0 }}>
          <div style={{ padding: '6px 10px', background: C.bg, borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.3em', color: C.purple2 }}>PREVIEW</span>
            <i className="ti ti-eye" style={{ fontSize: 11, color: C.muted }} />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
            {previewText ? (
              <div style={{ width: '100%', background: C.bg, border: `1px solid ${C.border2}`, padding: 10, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 1, background: `linear-gradient(to right, transparent, ${C.purple2}, transparent)` }} />
                <div style={{ fontSize: 8, color: C.purple2, marginBottom: 5, letterSpacing: '0.12em', fontWeight: 700 }}>{previewText.ref}</div>
                <div style={{ fontSize: 10, color: C.white, lineHeight: 1.8, fontStyle: 'italic', whiteSpace: 'pre-line' }}>{previewText.text}</div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: C.muted }}>Nothing selected</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${C.border2}`, minHeight: 0 }}>
          <div style={{ padding: '6px 10px', background: C.bg, borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.3em', color: live ? C.rose2 : C.muted }}>● LIVE</span>
            <span style={{ fontSize: 8, color: C.muted, letterSpacing: '0.1em' }}>{displays.length > 1 ? 'DISPLAY 2' : 'DISPLAY 1'}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
            {live ? (
              <div style={{ width: '100%', background: C.bg, border: `1px solid ${C.rose}`, padding: 10, textAlign: 'center', boxShadow: `0 0 12px rgba(244,63,94,0.15)` }}>
                <div style={{ fontSize: 10, color: C.white, lineHeight: 1.8 }}>{live}</div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: C.muted }}>Not presenting</div>
            )}
          </div>
        </div>

        <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${C.border2}`, minHeight: 0 }}>
          <div style={{ padding: '6px 10px', background: C.bg, borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.3em', color: C.amber }}>QUEUE</span>
            <span style={{ fontSize: 8, color: C.muted }}>{queue.length} items</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            {queue.slice(0, 4).map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', marginBottom: 2 }}>
                <span style={{ fontSize: 8, color: C.amber, fontWeight: 800, width: 10 }}>{i + 1}</span>
                <span style={{ fontSize: 9, color: C.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
              </div>
            ))}
            {queue.length === 0 && <div style={{ fontSize: 9, color: C.muted, padding: '6px', textAlign: 'center' }}>Empty</div>}
          </div>
        </div>

        <div style={{ padding: '10px', background: C.bg, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 7, color: C.teal, letterSpacing: '0.2em', fontWeight: 800, whiteSpace: 'nowrap' }}>OUTPUT</span>
            <select value={selectedDisplay} onChange={e => setSelectedDisplay(Number(e.target.value))} style={{ flex: 1, background: C.s2, border: `1px solid ${C.border2}`, color: C.white, padding: '5px 6px', fontSize: 9, outline: 'none' }}>
              {displays.map(d => <option key={d.id} value={d.id}>{d.label}{d.isPrimary ? ' · Primary' : ''}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => {
              if (activeTab === 'hymnal' && selected && section) goLive(selected.title, section.content)
              else if (activeTab === 'bible' && selectedVerse) goLive(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`, selectedVerse.text)
              else if (activeTab === 'daily' && dailyVerse) goLive(`${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`, dailyVerse.text)
            }} style={{ flex: 1, padding: '9px 0', background: C.rose, border: 'none', color: C.white, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', cursor: 'pointer', borderTop: `2px solid ${C.rose2}` }}>GO LIVE</button>
            <button onClick={handleClear} style={{ padding: '9px 10px', background: C.s2, border: `1px solid ${C.border2}`, color: C.dim, fontSize: 11, cursor: 'pointer' }}>✕</button>
          </div>
          <button onClick={() => { if (selected && section) goLive(selected.title, section.content) }} style={{ padding: '9px 0', background: C.teal, border: 'none', color: C.bg, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', cursor: 'pointer', width: '100%', borderTop: `2px solid ${C.white}` }}>PRESENT THIS VERSE</button>
          <div style={{ display: 'flex', border: `1px solid ${C.border2}`, overflow: 'hidden' }}>
            <button onClick={handleBlank} style={{ flex: 1, padding: '7px 0', background: blankScreen ? C.s4 : 'none', border: 'none', borderRight: `1px solid ${C.border2}`, color: blankScreen ? C.white : C.dim, fontSize: 8, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <i className="ti ti-square" style={{ fontSize: 10 }} /> BLANK
            </button>
            <button onClick={() => goLive('', '将  SHOGUNOS')} style={{ flex: 1, padding: '7px 0', background: 'none', border: 'none', borderRight: `1px solid ${C.border2}`, color: C.dim, fontSize: 8, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <i className="ti ti-brand-chrome" style={{ fontSize: 10 }} /> LOGO
            </button>
            <button onClick={() => setActiveTab('timer')} style={{ flex: 1, padding: '7px 0', background: timerRunning ? C.teal5 : 'none', border: 'none', color: timerRunning ? C.teal : C.dim, fontSize: 8, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <i className="ti ti-clock" style={{ fontSize: 10 }} /> {timerRunning ? formatTime(timerSeconds) : 'TIMER'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
