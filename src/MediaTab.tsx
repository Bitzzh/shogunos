import React, { useState, useEffect, useCallback } from 'react'

// ── Design tokens (matches new App palette) ───────────────────────────────────
// Same design tokens as App.tsx, under MediaTab's own key names — pointed at
// the shared CSS variables (see index.css) so dark mode applies here too.
const C = {
  bg0:'var(--bg0)', bg1:'var(--bg1)', bg2:'var(--bg2)', bg3:'var(--bg3)', bg4:'var(--bg4)', bg5:'var(--bg5)',
  b0:'var(--b0)', b1:'var(--b1)', b2:'var(--b2)',
  accent:'var(--g2)', accentL:'var(--g3)', accentD:'var(--g1)',
  gold:'var(--gold)', goldL:'var(--goldL)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)', t4:'var(--t4)',
  red:'var(--live)', green:'var(--safe)',
}

interface MediaFolder { id:number; name:string; eventDate:string|null; item_count:number; created_at:string }
interface MediaItem   { id:number; folder_id:number; name:string; file_path:string; mime_type:string; file_size:number; loop:boolean; muted:boolean; order_num:number }

function fileIcon(mime:string) {
  if (mime.startsWith('video/')) return '▶'
  if (mime.startsWith('image/')) return '◻'
  if (mime.startsWith('audio/')) return '♪'
  return '⊞'
}
function fileSizeLabel(bytes:number) {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/(1024*1024)).toFixed(1)} MB`
}

interface Props {
  goLive: (title:string, lyrics:string, type?:string, extra?:any) => void
  notify: (msg:string) => void
}

export default function MediaTab({ goLive, notify }:Props) {
  const [folders, setFolders]         = useState<MediaFolder[]>([])
  const [selected, setSelected]       = useState<MediaFolder|null>(null)
  const [items, setItems]             = useState<MediaItem[]>([])
  const [activeItem, setActiveItem]   = useState<MediaItem|null>(null)
  const [creating, setCreating]       = useState(false)
  const [newName, setNewName]         = useState('')
  const [newDate, setNewDate]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [loop, setLoop]               = useState(true)
  const [muted, setMuted]             = useState(false)
  const [fitMode, setFitMode]         = useState<'contain'|'fill'>('contain')
  const [confirmDelete, setConfirmDelete] = useState<number|null>(null)

  const api = (window as any).shogunos

  const loadFolders = useCallback(async () => {
    try { setFolders(await api.getMediaFolders()) } catch {}
  }, [])

  const loadItems = useCallback(async (folderId:number) => {
    setLoading(true)
    try { setItems(await api.getMediaItems(folderId)) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadFolders() }, [])
  useEffect(() => { if (selected) loadItems(selected.id) }, [selected])

  async function createFolder() {
    if (!newName.trim()) return
    await api.createMediaFolder(newName.trim(), newDate || undefined)
    setNewName(''); setNewDate(''); setCreating(false)
    await loadFolders()
    notify('Folder created')
  }

  async function deleteFolder(id:number) {
    await api.deleteMediaFolder(id)
    if (selected?.id === id) { setSelected(null); setItems([]) }
    await loadFolders()
    notify('Folder deleted')
  }

  async function addFiles() {
    if (!selected) return
    const result = await api.openMediaDialog(selected.id)
    if (result?.success) { await loadItems(selected.id); await loadFolders(); notify(`${result.items.length} file(s) added`) }
  }

  async function deleteItem(id:number) {
    await api.deleteMediaItem(id)
    if (activeItem?.id === id) setActiveItem(null)
    await loadItems(selected!.id)
    await loadFolders()
    setConfirmDelete(null)
    notify('File removed')
  }

  function liveItem(item:MediaItem) {
    const isVideo = item.mime_type.startsWith('video/')
    const isImage = item.mime_type.startsWith('image/')
    const isAudio = item.mime_type.startsWith('audio/')
    if (isVideo) {
      api.goLiveMedia({ type:'video', filePath:item.file_path, loop, muted, title:item.name })
    } else if (isImage) {
      api.goLiveMedia({ type:'image', filePath:item.file_path, fitMode, title:item.name })
    } else if (isAudio) {
      notify('Audio playback coming soon — use with a slide background')
    } else {
      notify('This file type cannot be projected directly')
    }
    notify(`Live: ${item.name}`)
  }

  const btn = (label:string, onClick:()=>void, variant:'primary'|'ghost'|'danger'='ghost', small=false) => (
    <button onClick={onClick} style={{
      padding: small ? '5px 10px' : '7px 14px',
      fontSize: small ? 10 : 11,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
      borderRadius: 7,
      border: variant==='primary' ? 'none' : `1px solid ${variant==='danger'?C.red:C.b2}`,
      background: variant==='primary' ? C.accent : variant==='danger' ? `color-mix(in srgb, ${C.red} 13%, transparent)` : 'transparent',
      color: variant==='primary' ? '#fff' : variant==='danger' ? C.red : C.t2,
      transition: 'all 0.12s',
    }}>{label}</button>
  )

  return (
    <div style={{ flex:1, display:'flex', overflowX:'auto', overflowY:'hidden', minHeight:0 }}>

      {/* ── FOLDER PANEL ──────────────────────────────────────────────── */}
      <div style={{ width:240, background:C.bg1, borderRight:`1px solid ${C.b0}`, display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'10px 12px', borderBottom:`1px solid ${C.b0}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:10, color:C.t3, fontWeight:700, letterSpacing:'0.12em' }}>EVENT FOLDERS</span>
          <button onClick={()=>setCreating(true)} style={{ background:'none', border:`1px solid ${C.b1}`, color:C.accentL, fontSize:16, width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', borderRadius:6, fontFamily:'inherit' }}>+</button>
        </div>

        {creating && (
          <div style={{ padding:'10px 12px', background:C.bg2, borderBottom:`1px solid ${C.b0}` }}>
            <input
              autoFocus
              value={newName} onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') createFolder(); if(e.key==='Escape') setCreating(false) }}
              placeholder="Folder name"
              style={{ width:'100%', background:C.bg3, border:`1px solid ${C.b2}`, color:C.t1, padding:'6px 8px', fontSize:12, borderRadius:6, outline:'none', fontFamily:'inherit', marginBottom:6 }}
            />
            <input
              type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
              style={{ width:'100%', background:C.bg3, border:`1px solid ${C.b2}`, color:C.t2, padding:'6px 8px', fontSize:11, borderRadius:6, outline:'none', fontFamily:'inherit', marginBottom:8 }}
            />
            <div style={{ display:'flex', gap:6 }}>
              {btn('Create', createFolder, 'primary', true)}
              {btn('Cancel', ()=>setCreating(false), 'ghost', true)}
            </div>
          </div>
        )}

        <div style={{ flex:1, overflowY:'auto', padding:'4px 6px' }}>
          {folders.length === 0 && (
            <div style={{ padding:'20px 12px', textAlign:'center', color:C.t4, fontSize:12 }}>No folders yet</div>
          )}
          {folders.map(f => (
            <div key={f.id}
              onClick={()=>{ setSelected(f); setActiveItem(null) }}
              style={{
                padding:'9px 10px', borderRadius:8, cursor:'pointer', marginBottom:2,
                background: selected?.id===f.id ? C.bg3 : 'transparent',
                border: `1px solid ${selected?.id===f.id ? C.b1 : 'transparent'}`,
                transition:'all 0.1s',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14, color: selected?.id===f.id ? C.accentL : C.t3 }}>⊟</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:C.t1, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize:10, color:C.t4, marginTop:1 }}>
                    {f.item_count} file{f.item_count!==1?'s':''}
                    {f.eventDate ? ` · ${f.eventDate}` : ''}
                  </div>
                </div>
                {confirmDelete===f.id ? (
                  <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>deleteFolder(f.id)} style={{fontSize:9,padding:'2px 6px',background:`color-mix(in srgb, ${C.red} 13%, transparent)`,border:`1px solid color-mix(in srgb, ${C.red} 27%, transparent)`,color:C.red,borderRadius:4,cursor:'pointer',fontFamily:'inherit'}}>Del</button>
                    <button onClick={()=>setConfirmDelete(null)} style={{fontSize:9,padding:'2px 6px',background:'none',border:`1px solid ${C.b2}`,color:C.t3,borderRadius:4,cursor:'pointer',fontFamily:'inherit'}}>×</button>
                  </div>
                ) : (
                  <button onClick={e=>{e.stopPropagation();setConfirmDelete(f.id)}} style={{opacity:0.4,background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:14,padding:0,lineHeight:1}}>⊗</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FILE LIST ─────────────────────────────────────────────────── */}
      <div style={{ width:280, background:C.bg2, borderRight:`1px solid ${C.b0}`, display:'flex', flexDirection:'column', flexShrink:0 }}>
        {!selected ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:C.t4 }}>
            <div style={{ fontSize:32, opacity:0.15 }}>⊟</div>
            <div style={{ fontSize:12 }}>Select a folder</div>
          </div>
        ) : (
          <>
            <div style={{ padding:'10px 12px', borderBottom:`1px solid ${C.b0}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:10, color:C.t3, fontWeight:700, letterSpacing:'0.12em' }}>{selected.name.toUpperCase()} · {items.length}</span>
              <button onClick={addFiles} style={{ padding:'5px 10px', background:C.accent, border:'none', color:'#fff', fontSize:10, fontWeight:700, borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>+ Add Files</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'4px 6px' }}>
              {loading && <div style={{ padding:20, textAlign:'center', color:C.t4, fontSize:11 }}>Loading…</div>}
              {!loading && items.length===0 && (
                <div style={{ padding:'24px 12px', textAlign:'center', color:C.t4, fontSize:12 }}>
                  <div style={{ marginBottom:8, opacity:0.3, fontSize:28 }}>⊞</div>
                  Drop files here or click "Add Files"
                </div>
              )}
              {items.map(item => {
                const isV = item.mime_type.startsWith('video/')
                const isI = item.mime_type.startsWith('image/')
                return (
                  <div key={item.id}
                    onClick={()=>setActiveItem(item)}
                    style={{
                      padding:'8px 10px', borderRadius:8, cursor:'pointer', marginBottom:2,
                      background: activeItem?.id===item.id ? C.bg4 : 'transparent',
                      border: `1px solid ${activeItem?.id===item.id ? C.b2 : 'transparent'}`,
                      transition:'all 0.1s',
                      display:'flex', alignItems:'center', gap:10,
                    }}>
                    <span style={{ fontSize:16, color: isV ? C.accentL : isI ? C.goldL : C.t3, flexShrink:0 }}>{fileIcon(item.mime_type)}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, color:C.t1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize:9, color:C.t4, marginTop:1 }}>{item.mime_type.split('/')[1]?.toUpperCase()} · {fileSizeLabel(item.file_size)}</div>
                    </div>
                    <button onClick={e=>{e.stopPropagation();deleteItem(item.id)}} style={{ background:'none',border:'none',color:C.t4,cursor:'pointer',fontSize:14,padding:0,opacity:0.5,lineHeight:1 }}>×</button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── DETAIL / CONTROLS ─────────────────────────────────────────── */}
      <div style={{ flex:1, minWidth:380, background:C.bg1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {!activeItem ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:C.t4 }}>
            <div style={{ fontSize:40, opacity:0.1 }}>▶</div>
            <div style={{ fontSize:13 }}>Select a file to preview options</div>
          </div>
        ) : (
          <>
            {/* Preview area */}
            <div style={{ padding:24, borderBottom:`1px solid ${C.b0}`, display:'flex', gap:20, alignItems:'flex-start' }}>
              <div style={{ width:160, aspectRatio:'16/9', background:'#000', borderRadius:8, overflow:'hidden', flexShrink:0, border:`1px solid ${C.b1}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {activeItem.mime_type.startsWith('image/') ? (
                  <img src={(window as any).shogunos.mediaUrl(activeItem.file_path)} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                ) : activeItem.mime_type.startsWith('video/') ? (
                  <video src={(window as any).shogunos.mediaUrl(activeItem.file_path)} style={{ width:'100%', height:'100%', objectFit:'contain' }} muted />
                ) : (
                  <span style={{ fontSize:28, color:C.t3 }}>{fileIcon(activeItem.mime_type)}</span>
                )}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:600, color:C.t1, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeItem.name}</div>
                <div style={{ fontSize:11, color:C.t4, marginBottom:12 }}>
                  {activeItem.mime_type} · {fileSizeLabel(activeItem.file_size)}
                </div>
                <button
                  onClick={()=>liveItem(activeItem)}
                  style={{ padding:'10px 28px', background:`linear-gradient(135deg,${C.red},#b91c1c)`, border:'none', color:'#fff', fontSize:12, fontWeight:700, borderRadius:8, cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.06em' }}>
                  GO LIVE
                </button>
              </div>
            </div>

            {/* Playback options */}
            <div style={{ padding:24, flex:1, overflowY:'auto' }}>
              <div style={{ fontSize:10, color:C.t3, fontWeight:700, letterSpacing:'0.15em', marginBottom:16 }}>PLAYBACK OPTIONS</div>

              {activeItem.mime_type.startsWith('video/') && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', userSelect:'none' as const }}>
                    <div
                      onClick={()=>setLoop(v=>!v)}
                      style={{ width:36, height:20, borderRadius:10, background: loop ? C.accent : C.b2, position:'relative', transition:'background 0.2s', cursor:'pointer', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:2, left: loop?18:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                    </div>
                    <div>
                      <div style={{ fontSize:12, color:C.t1, fontWeight:500 }}>Loop video</div>
                      <div style={{ fontSize:10, color:C.t4 }}>Repeat until manually stopped</div>
                    </div>
                  </label>
                  <label style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', userSelect:'none' as const }}>
                    <div
                      onClick={()=>setMuted(v=>!v)}
                      style={{ width:36, height:20, borderRadius:10, background: muted ? C.accent : C.b2, position:'relative', transition:'background 0.2s', cursor:'pointer', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:2, left: muted?18:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                    </div>
                    <div>
                      <div style={{ fontSize:12, color:C.t1, fontWeight:500 }}>Mute audio</div>
                      <div style={{ fontSize:10, color:C.t4 }}>Play video without sound</div>
                    </div>
                  </label>
                </div>
              )}

              {activeItem.mime_type.startsWith('image/') && (
                <div>
                  <div style={{ fontSize:11, color:C.t2, marginBottom:8 }}>Fit mode</div>
                  <div style={{ display:'flex', gap:8 }}>
                    {(['contain','fill'] as const).map(m=>(
                      <button key={m} onClick={()=>setFitMode(m)} style={{
                        padding:'7px 16px', fontSize:11, fontWeight:500, borderRadius:7, cursor:'pointer', fontFamily:'inherit',
                        background: fitMode===m ? C.accent : C.bg3,
                        border: `1px solid ${fitMode===m ? C.accent : C.b2}`,
                        color: fitMode===m ? '#fff' : C.t2,
                        textTransform:'capitalize',
                      }}>{m}</button>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:C.t4, marginTop:8 }}>
                    {fitMode==='contain' ? 'Show full image with letterboxing' : 'Fill screen, may crop edges'}
                  </div>
                </div>
              )}

              {!activeItem.mime_type.startsWith('video/') && !activeItem.mime_type.startsWith('image/') && (
                <div style={{ color:C.t4, fontSize:12, lineHeight:1.7 }}>
                  {activeItem.mime_type.startsWith('audio/') ?
                    'Audio files play in the background. Pair with a slide or image for projection.' :
                    'This file type is stored for reference. Use images or videos for live projection.'}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}