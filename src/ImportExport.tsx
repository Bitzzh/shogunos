import React, { useState, useEffect, useRef } from 'react'

interface Props {
  notify: (msg: string) => void
}

const C = {
  void: '#020305', ash: '#07090F', ember: '#0C0F18', coal: '#111520',
  crimson: '#CC1A1A', blood: '#FF2020', fire: '#FF6020',
  amber: '#FF9A00', gold: '#FFB800',
  ivory: '#F5EED8', bone: '#C8BEA8', ghost: '#7A8099',
  mist: '#3A4258', border2: '#1E2535',
  green: '#22C55E', purple: '#A78BFA',
}

interface Stats {
  songs: number; custom_songs: number; hymns: number
  sections: number; bible_verses: number; slides: number
  queue_items: number; users: number; db_path: string
}

export default function ImportExport({ notify }: Props) {
  const [stats, setStats]           = useState<Stats | null>(null)
  const [importing, setImporting]   = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [dragOver, setDragOver]     = useState(false)
  const fileRef                     = useRef<HTMLInputElement>(null)
  const api                         = (window as any).shogunos

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try { setStats(await api.getDatabaseStats()) } catch {}
  }

  async function handleExport() {
    setExporting(true)
    try {
      const json = await api.exportData()
      const blob = new Blob([json], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `shogunos-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      notify('Database exported successfully')
    } catch { notify('Export failed') }
    setExporting(false)
  }

  async function handleFileImport(file: File) {
    if (!file.name.endsWith('.json')) {
      setImportResult({ success: false, message: 'Please select a .json file exported from ShogunOS' })
      return
    }
    setImporting(true)
    setImportResult(null)
    try {
      const text   = await file.text()
      const result = await api.importData(text)
      if (result.success) {
        const c = result.counts
        setImportResult({ success: true, message: `Import complete — ${c.songs} songs, ${c.slides} slides added` })
        notify('Import successful')
        loadStats()
      } else {
        setImportResult({ success: false, message: result.error || 'Import failed' })
      }
    } catch { setImportResult({ success: false, message: 'Failed to read file' }) }
    setImporting(false)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileImport(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileImport(file)
  }

  const lbl: React.CSSProperties = { fontSize: 8, color: 'rgba(255,184,0,0.7)', letterSpacing: '0.25em', fontWeight: 800, marginBottom: 6, display: 'block' }
  const card: React.CSSProperties = { background: C.coal, border: `1px solid ${C.border2}`, padding: 20, marginBottom: 12 }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

      {/* ── LEFT: EXPORT ── */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', borderRight: `1px solid ${C.border2}` }}>
        <div style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.35em', fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          EXPORT DATA <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right,rgba(255,184,0,0.1),transparent)' }} />
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.25em', fontWeight: 900, marginBottom: 14 }}>DATABASE CONTENTS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'HYMNS',        val: stats.hymns,        color: C.amber  },
                { label: 'CUSTOM SONGS', val: stats.custom_songs, color: C.gold   },
                { label: 'SLIDES',       val: stats.slides,       color: C.purple },
                { label: 'BIBLE VERSES', val: stats.bible_verses, color: '#7DD3FC'},
                { label: 'USERS',        val: stats.users,        color: C.fire   },
                { label: 'QUEUE ITEMS',  val: stats.queue_items,  color: C.mist   },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: C.ember, border: `1px solid ${C.border2}`, padding: '10px 14px' }}>
                  <div style={{ fontSize: 22, fontWeight: 200, color, fontVariantNumeric: 'tabular-nums' } as any}>{val}</div>
                  <div style={{ fontSize: 7, color: C.mist, letterSpacing: '0.15em', fontWeight: 800, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: '8px 10px', background: C.ember, border: `1px solid ${C.border2}` }}>
              <div style={{ fontSize: 7, color: C.mist, letterSpacing: '0.1em', marginBottom: 3 }}>DATABASE FILE</div>
              <div style={{ fontSize: 9, color: C.ghost, fontFamily: 'monospace', wordBreak: 'break-all' }}>{stats.db_path}</div>
            </div>
          </div>
        )}

        {/* Export button */}
        <div style={card}>
          <div style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.25em', fontWeight: 900, marginBottom: 10 }}>EXPORT BACKUP</div>
          <div style={{ fontSize: 11, color: C.mist, lineHeight: 1.6, marginBottom: 16 }}>
            Exports all songs, slides, and settings to a <span style={{ color: C.bone }}>.json</span> file you can back up or transfer to another device.
          </div>
          <div style={{ fontSize: 9, color: C.mist, marginBottom: 16 }}>
            <div style={{ marginBottom: 4 }}>✓ All hymns and custom songs</div>
            <div style={{ marginBottom: 4 }}>✓ All slides</div>
            <div style={{ marginBottom: 4 }}>✓ Service queue</div>
            <div style={{ opacity: 0.5 }}>✗ Bible data (too large — reloads automatically)</div>
            <div style={{ opacity: 0.5 }}>✗ User passwords (security)</div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ width: '100%', padding: '12px 0', background: `linear-gradient(to right,${C.brass},#7A5500)`, border: 'none', borderTop: `2px solid ${C.gold}`, color: C.void, fontSize: 10, fontWeight: 900, letterSpacing: '0.25em', cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? 'EXPORTING...' : '⬇ EXPORT DATABASE'}
          </button>
        </div>
      </div>

      {/* ── RIGHT: IMPORT ── */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.35em', fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          IMPORT DATA <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right,rgba(255,184,0,0.1),transparent)' }} />
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? C.gold : C.border2}`,
            background: dragOver ? 'rgba(255,184,0,0.04)' : C.coal,
            padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
            marginBottom: 16, transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12, opacity: dragOver ? 1 : 0.4 }}>📂</div>
          <div style={{ fontSize: 12, color: dragOver ? C.gold : C.bone, fontWeight: 600, marginBottom: 6 }}>
            {importing ? 'Importing...' : 'Drop your backup file here'}
          </div>
          <div style={{ fontSize: 10, color: C.mist }}>or click to browse</div>
          <div style={{ fontSize: 8, color: C.mist, marginTop: 8, letterSpacing: '0.1em' }}>Accepts .json files exported from ShogunOS</div>
        </div>
        <input ref={fileRef} type="file" accept=".json" onChange={onFileChange} style={{ display: 'none' }} />

        {/* Result */}
        {importResult && (
          <div style={{ padding: '12px 16px', background: importResult.success ? 'rgba(34,197,94,0.08)' : 'rgba(255,32,32,0.08)', border: `1px solid ${importResult.success ? C.green : C.blood}`, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: importResult.success ? C.green : C.blood, fontWeight: 700 }}>
              {importResult.success ? '✓ ' : '✗ '}{importResult.message}
            </div>
          </div>
        )}

        {/* Info */}
        <div style={card}>
          <div style={{ fontSize: 8, color: 'rgba(255,184,0,0.6)', letterSpacing: '0.25em', fontWeight: 900, marginBottom: 10 }}>HOW IMPORT WORKS</div>
          {[
            ['Safe merge', 'Existing data is never deleted. Only new items are added.'],
            ['Duplicate handling', 'Songs and slides with matching titles are skipped.'],
            ['Bible data', 'Bible verses are not imported — they load from the built-in KJV file.'],
            ['Users', 'User accounts are not imported for security reasons.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: C.amber, fontWeight: 800, marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 10, color: C.mist, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Refresh stats button */}
        <button
          onClick={loadStats}
          style={{ width: '100%', padding: '9px 0', background: 'none', border: `1px solid ${C.border2}`, color: C.mist, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}
        >↻ REFRESH STATS</button>
      </div>
    </div>
  )
}
