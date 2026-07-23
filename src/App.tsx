import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import QRCode from 'qrcode'
import Splash from './Splash'
import MediaTab from './MediaTab'
import CalendarTab from './CalendarTab'
import { ICONS, SlideIcon, iconPositionStyle, ICON_POSITIONS } from './icons'

type Song       = { id: number; title: string; hymn_number: number; source: string; language: string }
type Section    = { id: number; song_id: number; type: string; order_num: number; content: string }
type Display    = { id: number; label: string; isPrimary: boolean; bounds?: any }
type DailyVerse = { book: string; chapter: number; verse: number; text: string; version: string }
type BibleVerse = { id: number; book: string; chapter: number; verse: number; text: string; version: string }
type QueueItem  = { id: string; title: string; type: string }
type NavGroup   = 'library' | 'present' | 'media' | 'calendar' | 'service' | 'settings'
type LibTab     = 'hymnal' | 'bible' | 'daily' | 'songs'
type PresentTab = 'slides' | 'announce'
type SettingsTab = 'display' | 'import' | 'remote' | 'about'

// ── HYMNAL GROUPING (module-level — pure, never changes per-render) ────────
// Used to group songs by hymnal collection/language. Kept outside the
// component so grouping a song is a cheap function call, not something
// recreated on every render.
const HYMN_LANG_LABELS: Record<string,string> = {
  en:'English', sn:'Shona', nd:'Ndebele/IsiZulu', xh:'IsiXhosa', tn:'Tswana', st:'Sotho',
  ny:'Chichewa', toi:'Tonga', ve:'Venda', sw:'Swahili', ts:'Xitsonga', ki:'Kikuyu',
  guz:'Abagusii', luo:'Dholuo', rw:'Kinyarwanda', pt:'Português', es:'Español',
  fr:'Français', ru:'Русский', tum:'Tumbuka', nso:'Sepedi', bem:'Icibemba', tw:'Twi',
}
const hymnLangLabel = (l:string) => HYMN_LANG_LABELS[l] || (l.charAt(0).toUpperCase()+l.slice(1))
// Group key: 'sda' is one group; each CIS language is its own group ('cis-en','cis-sn',…)
const hymnGroupKey = (s:Song) => s.source==='hymnal-cis' ? `cis-${s.language}` : 'sda'
const hymnGroupLabel = (key:string) => key==='sda' ? 'SDA Hymnal' : `CIS · ${hymnLangLabel(key.slice(4))}`
const HYMN_GROUP_ORDER = ['sda','cis-en','cis-sn','cis-nd','cis-xh','cis-tn','cis-st','cis-ny','cis-toi',
  'cis-ve','cis-sw','cis-ts','cis-ki','cis-guz','cis-luo','cis-rw','cis-pt','cis-es','cis-fr',
  'cis-ru','cis-tum','cis-nso','cis-bem','cis-tw']

interface DisplaySettings {
  bgColor: string; bgImage: string | null
  fontColor: string; fontSize: number
  textAlign: 'left' | 'center' | 'right'
  fontFamily: string
  // Panel border — the box drawn around the live text, adjustable like Quelea's theme border
  borderWidth: number
  borderColor: string
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'double'
  borderRadius: number
  // "Sunlight Mode" — a one-flip override for rooms where daylight is
  // washing out the projector. We can't add lumens in software, so instead
  // this forces the highest-contrast rendering we can: pure black-on-white
  // (or vice versa), max font weight, a thin text stroke to keep letterforms
  // crisp at the edges, and a larger minimum size — plus it drops any
  // background image, since a photo behind the text only gives glare more
  // detail to wash out. Underlying bgColor/fontColor/etc. are left alone so
  // switching this off returns exactly to the operator's normal look.
  highVisibility: boolean
  highVisibilityInvert: boolean // false = black text on white; true = white text on black
  // Decorative icon overlay, set per-slide from the Slide Designer (never a
  // persistent global default — left null here so ordinary songs/scripture
  // never pick one up by accident).
  icon: string | null
  iconColor: string
  iconSize: number
  iconPos: string
}

// Shogun palette — modern minimal: paper canvas, ink text, indigo accent, red reserved for LIVE only
// Values are CSS custom properties (see index.css) so the whole app can flip
// between light/dark by toggling data-theme on <html>, without touching any
// of the individual C.xxx usages below.
const C = {
  bg0: 'var(--bg0)', bg1: 'var(--bg1)', bg2: 'var(--bg2)', bg3: 'var(--bg3)', bg4: 'var(--bg4)', bg5: 'var(--bg5)',
  tex0: 'var(--tbg0)', tex1: 'var(--tbg1)', tex2: 'var(--tbg2)', tex3: 'var(--tbg3)', tex4: 'var(--tbg4)',
  b0: 'var(--b0)', b1: 'var(--b1)', b2: 'var(--b2)',
  p1: 'var(--p1)', p2: 'var(--p2)', p3: 'var(--p3)',
  g1: 'var(--g1)', g2: 'var(--g2)', g3: 'var(--g3)',
  t1: 'var(--t1)', t2: 'var(--t2)', t3: 'var(--t3)', t4: 'var(--t4)',
  live: 'var(--live)', safe: 'var(--safe)', warn: 'var(--warn)',
}

type SlideType  = 'text' | 'scripture' | 'announcement' | 'blank'
type SlideAlign = 'left' | 'center' | 'right'

// ── DRAG & DROP ──────────────────────────────────────────────────────────────
// Shared MIME type used when dragging a song or verse out of the library onto the queue.
const DRAG_MIME = 'application/x-shogun-item'
// Parses a reference string like "John 3:16" or "1 Corinthians 13:4" into its parts.
// Book names can contain spaces/numbers, so we split off the trailing "chapter:verse" instead of the leading word.
function parseVerseRef(ref:string):{book:string;chapter:number;verse:number}|null{
  const m = ref.trim().match(/^(.+?)\s+(\d+):(\d+)$/)
  if(!m) return null
  return { book: m[1], chapter: parseInt(m[2],10), verse: parseInt(m[3],10) }
}
function dragSource(title: string, type: string) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ title, type }))
    },
  }
}

interface Slide {
  id: number; title: string; type: SlideType; content: string; notes: string
  bg_color: string; bg_image: string | null; font_color: string; font_size: number
  text_align: SlideAlign; order_num: number; tags: string[]
  created_at: string; updated_at: string
  icon: string | null; icon_color: string; icon_size: number; icon_pos: string
}

function SlideCanvas({ slide, small = false }: { slide: Partial<Slide>; small?: boolean }) {
  const bg   = slide.bg_color   || '#000'
  const fg   = slide.font_color || '#fff'
  const size = small ? Math.max(6, (slide.font_size || 48) * 0.115) : (slide.font_size || 48) * 0.32
  const align = slide.text_align || 'center'
  return (
    <div style={{ width:'100%', height:'100%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', padding:small?6:20, overflow:'hidden', position:'relative',
      backgroundImage:slide.bg_image?`url(${slide.bg_image})`:undefined, backgroundSize:'cover', backgroundPosition:'center' }}>
      {slide.bg_image && <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.38)' }} />}
      {slide.icon && (
        <SlideIcon id={slide.icon} color={slide.icon_color||'#fff'} size={small ? Math.max(8, (slide.icon_size||64)*0.14) : (slide.icon_size||64)} style={iconPositionStyle(slide.icon_pos, small)} />
      )}
      <div style={{ position:'relative', zIndex:1, width:'100%' }}>
        {slide.type==='blank'
          ? <div style={{ fontSize:small?8:14, color:'rgba(255,255,255,0.15)', letterSpacing:'0.3em', textAlign:'center' }}>BLANK</div>
          : slide.content
            ? <div style={{ fontSize:size, color:fg, textAlign:align, fontStyle:slide.type==='scripture'?'italic':'normal', lineHeight:1.55, whiteSpace:'pre-line', wordBreak:'break-word', fontWeight:300 }}>
                {small ? slide.content.substring(0,55) : slide.content}
              </div>
            : <div style={{ fontSize:small?8:12, color:'rgba(255,255,255,0.2)', textAlign:'center' }}>EMPTY SLIDE</div>
        }
      </div>
    </div>
  )
}

const SLIDE_TYPES: Record<SlideType,{label:string;color:string}> = {
  text:         { label:'TEXT',      color:C.g2   },
  scripture:    { label:'SCRIPTURE', color:C.p2   },
  announcement: { label:'ANNOUNCE',  color:C.warn },
  blank:        { label:'BLANK',     color:C.t3   },
}

function SlidesTab({ goLive, addToQueue, notify }: {
  goLive: (t:string, l:string, ds?:Partial<DisplaySettings>) => void
  addToQueue: (t:string, type:string) => void
  notify: (m:string) => void
}) {
  const [slides,setSlides]         = useState<Slide[]>([])
  const [selected,setSelected]     = useState<Slide|null>(null)
  const [editing,setEditing]       = useState<Partial<Slide>|null>(null)
  const [isNew,setIsNew]           = useState(false)
  const [filter,setFilter]         = useState<SlideType|'all'>('all')
  const [search,setSearch]         = useState('')
  const [loading,setLoading]       = useState(true)
  const [saving,setSaving]         = useState(false)
  const [dragId,setDragId]         = useState<number|null>(null)
  const [dragOverId,setDragOverId] = useState<number|null>(null)
  const [themes,setThemes]         = useState<any[]>([])
  const [showLibraryPicker,setShowLibraryPicker] = useState(false)
  const [libFolders,setLibFolders] = useState<any[]>([])
  const [libItems,setLibItems]     = useState<any[]>([])
  const contentRef                 = useRef<HTMLTextAreaElement>(null)
  const api = (window as any).shogunos

  useEffect(()=>{
    api.getSlides().then((d:Slide[])=>{ setSlides(d.sort((a,b)=>a.order_num-b.order_num)); setLoading(false) }).catch(()=>setLoading(false))
    api.getThemes?.().then((t:any[])=>setThemes(t||[])).catch(()=>{})
  },[])

  async function openLibraryPicker(){
    setShowLibraryPicker(true)
    const folders = await api.getMediaFolders()
    setLibFolders(folders||[])
    const all = (await Promise.all((folders||[]).map((f:any)=>api.getMediaItems(f.id)))).flat()
    setLibItems(all.filter((it:any)=>it.mime_type?.startsWith('image/')))
  }
  function pickFromLibrary(item:any){
    set('bg_image', api.mediaUrl(item.file_path))
    setShowLibraryPicker(false)
  }

  const visible = slides.filter(s=>{
    if(filter!=='all'&&s.type!==filter) return false
    if(search){const q=search.toLowerCase();return s.title.toLowerCase().includes(q)||s.content.toLowerCase().includes(q)}
    return true
  })

  function startNew(type:SlideType='text'){
    setIsNew(true);setSelected(null)
    setEditing({title:'',type,content:'',notes:'',bg_color:'#000000',bg_image:null,font_color:'#ffffff',font_size:48,text_align:'center',tags:[],icon:null,icon_color:'#ffffff',icon_size:64,icon_pos:'top-center'})
    setTimeout(()=>contentRef.current?.focus(),80)
  }
  function startEdit(s:Slide){setIsNew(false);setSelected(s);setEditing({...s})}

  async function save2(){
    if(!editing)return;setSaving(true)
    try{
      if(isNew){const c:Slide=await api.createSlide(editing);setSlides(s=>[...s,c].sort((a,b)=>a.order_num-b.order_num));setSelected(c);setIsNew(false);setEditing(null);notify('Slide created')}
      else if(selected){const u:Slide=await api.updateSlide(selected.id,editing);setSlides(s=>s.map(x=>x.id===u.id?u:x));setSelected(u);setEditing(null);notify('Saved')}
    }catch{notify('Save failed')}
    setSaving(false)
  }

  async function del(id:number){
    if(!confirm('Delete slide?'))return
    await api.deleteSlide(id);setSlides(s=>s.filter(x=>x.id!==id))
    if(selected?.id===id){setSelected(null);setEditing(null)};notify('Deleted')
  }
  async function dup(id:number){const c:Slide=await api.duplicateSlide(id);setSlides(s=>[...s,c].sort((a,b)=>a.order_num-b.order_num));notify('Duplicated')}
  function sendLive(s:Slide){goLive(s.title||s.type,s.content,{bgColor:s.bg_color,bgImage:s.bg_image||undefined,fontColor:s.font_color,fontSize:s.font_size,textAlign:s.text_align,icon:s.icon,iconColor:s.icon_color,iconSize:s.icon_size,iconPos:s.icon_pos});notify(`Sent live`)}

  function onDragStart(id:number){setDragId(id)}
  function onDragOver(e:React.DragEvent,id:number){e.preventDefault();setDragOverId(id)}
  function onDragEnd(){setDragId(null);setDragOverId(null)}
  async function onDrop(tid:number){
    if(dragId===null||dragId===tid){onDragEnd();return}
    const list=[...slides],fi=list.findIndex(s=>s.id===dragId),ti=list.findIndex(s=>s.id===tid)
    const [m]=list.splice(fi,1);list.splice(ti,0,m)
    const r=list.map((s,i)=>({...s,order_num:i+1}));setSlides(r);onDragEnd()
    await api.reorderSlides(r.map((s:Slide)=>s.id))
  }
  function set(k:string,v:any){setEditing(e=>e?{...e,[k]:v}:e)}
  function pickBgImage(){
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*'
    inp.onchange=(e:any)=>{
      const f=e.target.files[0];if(!f)return
      const r=new FileReader()
      r.onload=async(ev:any)=>{
        try{
          const ab=ev.target.result as ArrayBuffer
          const u8=new Uint8Array(ab)
          let bin='';for(let i=0;i<u8.length;i++)bin+=String.fromCharCode(u8[i])
          const b64=btoa(bin)
          const ext='.'+(f.name.split('.').pop()||'png').toLowerCase()
          const res=await api.saveSlideBgImage(b64,ext)
          if(res.success)set('bg_image',res.path)
          else notify('Failed to set background image')
        }catch{notify('Failed to set background image')}
      }
      r.readAsArrayBuffer(f)
    }
    inp.click()
  }

  const disp = editing||selected
  const inp: React.CSSProperties = {width:'100%',background:C.tex4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}
  const lbl: React.CSSProperties = {fontSize:10,color:C.t3,fontWeight:600,marginBottom:6,display:'block',letterSpacing:'0.05em',textTransform:'uppercase' as const}
  const secHd: React.CSSProperties = {padding:'10px 14px',background:C.tex1,borderBottom:`1px solid ${C.b0}`,flexShrink:0}
  const secLbl: React.CSSProperties = {fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}

  return (
    <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
      {/* Library panel */}
      <div style={{width:260,background:C.tex2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{...secHd,display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={secLbl}>Slides</span>
            <span style={{fontSize:10,color:C.t4}}>{slides.length}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',background:C.tex4,border:`1px solid ${C.b1}`,borderRadius:8,padding:'0 10px',gap:6}}>
            <span style={{color:C.t3,fontSize:14}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{flex:1,background:'none',border:'none',color:C.t1,fontSize:12,outline:'none',padding:'7px 0',fontFamily:'inherit'}} />
          </div>
          <div style={{display:'flex',gap:3,flexWrap:'wrap' as const}}>
            {(['all','text','scripture','announcement','blank'] as (SlideType|'all')[]).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:'2px 7px',fontSize:8,fontWeight:700,border:`1px solid ${filter===f?C.p1:C.b0}`,color:filter===f?C.p2:C.t4,background:filter===f?`color-mix(in srgb, ${C.p1} 13%, transparent)`:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:4,letterSpacing:'0.05em'}}>{f.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{padding:'8px 10px',borderBottom:`1px solid ${C.b0}`,display:'flex',gap:4,flexWrap:'wrap' as const}}>
          {(['text','scripture','announcement','blank'] as SlideType[]).map(t=>(
            <button key={t} onClick={()=>startNew(t)} style={{padding:'4px 8px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:9,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:5}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=SLIDE_TYPES[t].color;(e.currentTarget as HTMLElement).style.color=SLIDE_TYPES[t].color}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.b1;(e.currentTarget as HTMLElement).style.color=C.t3}}
            >+ {t.toUpperCase()}</button>
          ))}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
          {loading&&<div style={{padding:20,textAlign:'center',color:C.t3,fontSize:12}}>Loading...</div>}
          {!loading&&visible.length===0&&<div style={{padding:24,textAlign:'center',color:C.t3,fontSize:12}}>{search?'No matches':'No slides — click + above'}</div>}
          {visible.map(s=>{
            const m=SLIDE_TYPES[s.type],active=selected?.id===s.id
            return(
              <div key={s.id} draggable onDragStart={()=>onDragStart(s.id)} onDragOver={e=>onDragOver(e,s.id)} onDrop={()=>onDrop(s.id)} onDragEnd={onDragEnd} onClick={()=>startEdit(s)}
                style={{marginBottom:4,borderRadius:8,border:`1px solid ${active?C.p1:dragOverId===s.id?C.b2:C.b0}`,background:active?`color-mix(in srgb, ${C.p1} 7%, transparent)`:C.bg3,cursor:'pointer',overflow:'hidden',opacity:dragId===s.id?0.35:1,transition:'all 0.1s'}}>
                <div style={{height:48,overflow:'hidden'}}><SlideCanvas slide={s} small /></div>
                <div style={{padding:'6px 8px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                    <span style={{fontSize:7,fontWeight:800,letterSpacing:'0.08em',color:m.color,padding:'1px 4px',border:`1px solid ${m.color}44`,background:`${m.color}12`,borderRadius:3}}>{m.label}</span>
                    <span style={{fontSize:10,color:active?C.t1:C.t2,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{s.title||'Untitled'}</span>
                  </div>
                  <div style={{display:'flex',gap:3,justifyContent:'flex-end'}}>
                    <button onClick={e=>{e.stopPropagation();sendLive(s)}} style={{padding:'2px 6px',background:`color-mix(in srgb, ${C.live} 9%, transparent)`,border:`1px solid color-mix(in srgb, ${C.live} 27%, transparent)`,color:C.live,fontSize:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:4}}>LIVE</button>
                    <button onClick={e=>{e.stopPropagation();dup(s.id)}} style={{padding:'2px 5px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,cursor:'pointer',borderRadius:4}}>⧉</button>
                    <button onClick={e=>{e.stopPropagation();del(s.id)}} style={{padding:'2px 5px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,cursor:'pointer',borderRadius:4}}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{padding:'5px 12px',borderTop:`1px solid ${C.b0}`,fontSize:9,color:C.t4}}>{visible.length}/{slides.length} · drag to reorder</div>
      </div>

      {/* Preview */}
      <div style={{flex:1,display:'flex',flexDirection:'column',background:C.tex1,minWidth:0}}>
        <div style={{...secHd,display:'flex',alignItems:'center',gap:10}}>
          <span style={secLbl}>Preview</span>
          {disp?.title&&<span style={{fontSize:13,color:C.t2,fontWeight:500}}>{disp.title}</span>}
        </div>
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:28}}>
          {disp
            ?<div style={{width:'100%',maxWidth:640,aspectRatio:'16/9',overflow:'hidden',borderRadius:10,boxShadow:'0 12px 60px rgba(0,0,0,0.7),0 0 0 1px rgba(124,58,237,0.1)'}}><SlideCanvas slide={disp as Slide}/></div>
            :<div style={{textAlign:'center',color:C.t4}}><div style={{fontSize:40,marginBottom:10,opacity:0.2}}>⊞</div><div style={{fontSize:13,letterSpacing:'0.05em'}}>Select or create a slide</div></div>
          }
        </div>
        {(selected||isNew)&&(
          <div style={{padding:'12px 20px',background:C.tex0,borderTop:`1px solid ${C.b0}`,display:'flex',gap:8}}>
            <button className="shimmer-btn" onClick={()=>selected&&!isNew&&sendLive(selected)} disabled={!selected||isNew} style={{flex:1,padding:'12px 0',background:C.live,border:'none',color:'#fff',fontSize:12,fontWeight:700,letterSpacing:'0.08em',cursor:selected&&!isNew?'pointer':'not-allowed',fontFamily:'inherit',borderRadius:8,opacity:selected&&!isNew?1:0.35}}>GO LIVE</button>
            <button onClick={()=>selected&&!isNew&&addToQueue(selected.title||'Slide','slide')} disabled={!selected||isNew} style={{padding:'12px 18px',background:C.tex4,border:`1px solid ${C.b2}`,color:C.t1,fontSize:11,fontWeight:600,cursor:selected&&!isNew?'pointer':'not-allowed',fontFamily:'inherit',borderRadius:8,opacity:selected&&!isNew?1:0.35}}>+ Queue</button>
          </div>
        )}
      </div>

      {/* Editor */}
      <div style={{width:280,background:C.tex2,borderLeft:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{...secHd,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={secLbl}>{editing?(isNew?'New Slide':'Editing'):'Properties'}</span>
          {editing&&(
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>{setEditing(null);if(isNew)setSelected(null);setIsNew(false)}} style={{padding:'5px 10px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:6}}>Cancel</button>
              <button onClick={save2} disabled={saving} style={{padding:'5px 10px',background:C.p1,border:'none',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:6,opacity:saving?0.6:1}}>{saving?'…':'Save'}</button>
            </div>
          )}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:14,display:'flex',flexDirection:'column',gap:14}}>
          {!editing&&!selected&&<div style={{paddingTop:40,textAlign:'center',color:C.t4,fontSize:12}}>Select a slide</div>}
          {!editing&&selected&&<>
            <div><label style={lbl}>Title</label><div style={{fontSize:14,color:C.t1,fontWeight:600}}>{selected.title||'Untitled'}</div></div>
            <div><label style={lbl}>Type</label><div style={{fontSize:11,color:SLIDE_TYPES[selected.type].color,fontWeight:700}}>{SLIDE_TYPES[selected.type].label}</div></div>
            <div><label style={lbl}>Content</label><div style={{fontSize:11,color:C.t2,lineHeight:1.6,whiteSpace:'pre-line'}}>{selected.content||'—'}</div></div>
            <div style={{display:'flex',gap:10}}>
              <div><label style={lbl}>Background</label><div style={{width:32,height:32,background:selected.bg_color,borderRadius:6,border:`1px solid ${C.b2}`}}/></div>
              <div><label style={lbl}>Text</label><div style={{width:32,height:32,background:selected.font_color,borderRadius:6,border:`1px solid ${C.b2}`}}/></div>
            </div>
            <button onClick={()=>startEdit(selected)} style={{padding:'10px 0',background:C.p1,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:8,width:'100%'}}>Edit Slide</button>
          </>}
          {editing&&<>
            <div>
              <label style={lbl}>Type</label>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {(['text','scripture','announcement','blank'] as SlideType[]).map(t=>(
                  <button key={t} onClick={()=>set('type',t)} style={{padding:'4px 8px',fontSize:9,fontWeight:700,border:`1px solid ${editing.type===t?SLIDE_TYPES[t].color:C.b1}`,color:editing.type===t?SLIDE_TYPES[t].color:C.t3,background:editing.type===t?`${SLIDE_TYPES[t].color}15`:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:5}}>{t.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Design Template</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                {themes.map(th=>(
                  <div key={th.id} onClick={()=>setEditing(e=>e?{...e,bg_color:th.bg_color,font_color:th.font_color,font_size:th.font_size,text_align:th.text_align,icon:th.icon,icon_color:th.icon_color,icon_pos:th.icon_pos||'top-center'}:e)}
                    title={th.name} style={{cursor:'pointer',width:38,height:38,borderRadius:7,background:th.bg_color,border:`1px solid ${C.b1}`,display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                    {th.icon ? <SlideIcon id={th.icon} color={th.icon_color} size={16}/> : <div style={{width:14,height:3,background:th.font_color,borderRadius:1}}/>}
                  </div>
                ))}
              </div>
            </div>
            <div><label style={lbl}>Title</label><input style={inp} value={editing.title||''} onChange={e=>set('title',e.target.value)} placeholder="Slide title..."/></div>
            <div><label style={lbl}>Content</label><textarea ref={contentRef} value={editing.content||''} onChange={e=>set('content',e.target.value)} rows={5} placeholder="Type content..." style={{...inp,resize:'vertical',lineHeight:1.55}}/></div>
            <div><label style={lbl}>Presenter Notes</label><textarea value={editing.notes||''} onChange={e=>set('notes',e.target.value)} rows={2} placeholder="Notes..." style={{...inp,resize:'vertical',fontSize:11}}/></div>
            <div>
              <label style={lbl}>Background Color</label>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                <input type="color" value={editing.bg_color||'#000'} onChange={e=>set('bg_color',e.target.value)} style={{width:36,height:32,border:`1px solid ${C.b2}`,borderRadius:6,background:'none',cursor:'pointer'}}/>
                <input style={{...inp,width:90}} value={editing.bg_color||'#000'} onChange={e=>set('bg_color',e.target.value)}/>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {['#000000','#0a0814','#140a0a','#0a0a14','#060609','#111111','#1a0a2e','#0a1a2e'].map(col=>(
                  <div key={col} onClick={()=>set('bg_color',col)} style={{width:24,height:24,background:col,border:`1px solid ${editing.bg_color===col?C.g2:C.b2}`,borderRadius:4,cursor:'pointer'}}/>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Background Image</label>
              {editing.bg_image
                ?<div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{width:52,height:36,backgroundImage:`url(${editing.bg_image})`,backgroundSize:'cover',borderRadius:6,border:`1px solid ${C.b2}`}}/>
                  <button onClick={()=>set('bg_image',null)} style={{padding:'6px 10px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:6}}>Remove</button>
                </div>
                :<div style={{display:'flex',gap:6}}>
                  <button onClick={pickBgImage} style={{flex:1,padding:'9px 0',background:'none',border:`1px dashed ${C.b2}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>Upload...</button>
                  <button onClick={openLibraryPicker} style={{flex:1,padding:'9px 0',background:'none',border:`1px dashed ${C.b2}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>From Library...</button>
                </div>
              }
            </div>
            <div>
              <label style={lbl}>Text Color</label>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                <input type="color" value={editing.font_color||'#fff'} onChange={e=>set('font_color',e.target.value)} style={{width:36,height:32,border:`1px solid ${C.b2}`,borderRadius:6,background:'none',cursor:'pointer'}}/>
                <input style={{...inp,width:90}} value={editing.font_color||'#fff'} onChange={e=>set('font_color',e.target.value)}/>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {['#ffffff','#f8f4e8','#f59e0b','#a78bfa','#7dd3fc','#86efac','#f87171','#ff2e63','#6fe8ff','#b967ff'].map(col=>(
                  <div key={col} onClick={()=>set('font_color',col)} style={{width:24,height:24,background:col,border:`1px solid ${editing.font_color===col?C.g2:C.b2}`,borderRadius:4,cursor:'pointer'}}/>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Font Size — {editing.font_size||48}px</label>
              <input type="range" min={16} max={96} value={editing.font_size||48} onChange={e=>set('font_size',parseInt(e.target.value))} style={{width:'100%',accentColor:C.p1,marginBottom:6}}/>
              <div style={{display:'flex',gap:4}}>
                {[24,36,48,60,72].map(sz=>(
                  <button key={sz} onClick={()=>set('font_size',sz)} style={{flex:1,padding:'4px 0',fontSize:9,fontWeight:700,border:`1px solid ${editing.font_size===sz?C.g2:C.b1}`,color:editing.font_size===sz?C.g2:C.t3,background:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:4}}>{sz}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Alignment</label>
              <div style={{display:'flex',gap:4}}>
                {(['left','center','right'] as SlideAlign[]).map(a=>(
                  <button key={a} onClick={()=>set('text_align',a)} style={{flex:1,padding:'8px 0',fontSize:13,border:`1px solid ${editing.text_align===a?C.g2:C.b1}`,color:editing.text_align===a?C.g2:C.t3,background:editing.text_align===a?`color-mix(in srgb, ${C.g2} 7%, transparent)`:'none',cursor:'pointer',borderRadius:5}}>
                    {a==='left'?'⫷':a==='center'?'≡':'⫸'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Icon</label>
              <div style={{display:'flex',gap:4,flexWrap:'wrap' as const,marginBottom:8}}>
                <button onClick={()=>set('icon',null)} title="None" style={{width:30,height:30,borderRadius:6,border:`1px solid ${!editing.icon?C.g2:C.b1}`,background:!editing.icon?`color-mix(in srgb, ${C.g2} 10%, transparent)`:'none',color:C.t3,fontSize:10,cursor:'pointer'}}>—</button>
                {ICONS.map(ic=>(
                  <button key={ic.id} onClick={()=>set('icon',ic.id)} title={ic.label} style={{width:30,height:30,borderRadius:6,border:`1px solid ${editing.icon===ic.id?C.g2:C.b1}`,background:editing.icon===ic.id?`color-mix(in srgb, ${C.g2} 10%, transparent)`:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <SlideIcon id={ic.id} color={editing.icon===ic.id?C.g2:C.t3} size={16}/>
                  </button>
                ))}
              </div>
              {editing.icon && <>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                  <input type="color" value={editing.icon_color||'#ffffff'} onChange={e=>set('icon_color',e.target.value)} style={{width:36,height:32,border:`1px solid ${C.b2}`,borderRadius:6,background:'none',cursor:'pointer'}}/>
                  <input style={{...inp,width:90}} value={editing.icon_color||'#ffffff'} onChange={e=>set('icon_color',e.target.value)}/>
                  <span style={{fontSize:9,color:C.t3,flex:1,textAlign:'right' as const}}>{editing.icon_size||64}px</span>
                </div>
                <input type="range" min={24} max={220} value={editing.icon_size||64} onChange={e=>set('icon_size',parseInt(e.target.value))} style={{width:'100%',accentColor:C.p1,marginBottom:8}}/>
                <div style={{display:'flex',gap:4,flexWrap:'wrap' as const}}>
                  {ICON_POSITIONS.map(p=>(
                    <button key={p.id} onClick={()=>set('icon_pos',p.id)} title={p.id} style={{flex:'1 0 40px',padding:'6px 0',fontSize:13,border:`1px solid ${editing.icon_pos===p.id?C.g2:C.b1}`,color:editing.icon_pos===p.id?C.g2:C.t3,background:editing.icon_pos===p.id?`color-mix(in srgb, ${C.g2} 7%, transparent)`:'none',cursor:'pointer',borderRadius:5}}>{p.label}</button>
                  ))}
                </div>
              </>}
            </div>
            <div style={{display:'flex',gap:6,paddingTop:4}}>
              <button className="glass-primary" onClick={save2} disabled={saving} style={{flex:1,padding:'11px 0',background:`linear-gradient(135deg,${C.p1},${C.g1})`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:saving?0.6:1}}>{saving?'Saving…':isNew?'Create Slide':'Save Changes'}</button>
              <button onClick={()=>{setEditing(null);if(isNew)setSelected(null);setIsNew(false)}} style={{padding:'11px 14px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:14,cursor:'pointer',borderRadius:8}}>✕</button>
            </div>
          </>}
        </div>
      </div>

      {showLibraryPicker && (
        <div onClick={()=>setShowLibraryPicker(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{width:560,maxHeight:'70vh',background:C.tex1,border:`1px solid ${C.b1}`,borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{...secHd,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={secLbl}>Choose from Media Library</span>
              <button onClick={()=>setShowLibraryPicker(false)} style={{background:'none',border:'none',color:C.t3,fontSize:16,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:14,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              {libItems.length===0 && <div style={{gridColumn:'1/-1',textAlign:'center',color:C.t3,fontSize:12,padding:30}}>No images in your Media Library yet — add some in the Media tab, or upload directly.</div>}
              {libItems.map((it:any)=>(
                <div key={it.id} onClick={()=>pickFromLibrary(it)} style={{cursor:'pointer',aspectRatio:'16/9',borderRadius:8,overflow:'hidden',border:`1px solid ${C.b1}`,backgroundImage:`url(${api.mediaUrl(it.file_path)})`,backgroundSize:'cover',backgroundPosition:'center'}} title={it.name}/>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnnounceTab({ goLive, notify }: { goLive:(t:string,l:string)=>void; notify:(m:string)=>void }) {
  const [text,setText]         = useState('')
  const [title,setTitle]       = useState('')
  const [bgColor,setBgColor]   = useState('#000000')
  const [fgColor,setFgColor]   = useState('#ffffff')
  const [fontSize,setFontSize] = useState(48)
  const [align,setAlign]       = useState<'left'|'center'|'right'>('center')
  const [bgImage,setBgImage]   = useState<string|null>(null)
  const [history,setHistory]   = useState<{title:string;text:string;ts:string}[]>([])

  const TEMPLATES = [
    {label:'Welcome',  text:'Welcome to our service!\nWe are glad you are here.'},
    {label:'Offering', text:'It is time for our tithes and offerings.\nThank you for your faithful giving.'},
    {label:'Silence',  text:'Please silence your mobile phones.\nThank you.'},
    {label:'Break',    text:'Short break — please return in 10 minutes.'},
    {label:'Communion',text:'We will now observe Holy Communion.\nPlease prepare your hearts.'},
    {label:'Closing',  text:'Thank you for joining us.\nGod bless you.'},
  ]

  function send(){
    if(!text.trim()){notify('Type a message first');return}
    goLive(title||'Announcement',text)
    setHistory(h=>[{title:title||'Announcement',text,ts:new Date().toLocaleTimeString('en-ZW',{hour:'2-digit',minute:'2-digit'})},...h].slice(0,10))
    notify('Announcement sent live')
  }
  function pickBgImage(){
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*'
    inp.onchange=(e:any)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev:any)=>setBgImage(ev.target.result);r.readAsDataURL(f)}
    inp.click()
  }

  const inp: React.CSSProperties = {width:'100%',background:C.tex4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}
  const lbl: React.CSSProperties = {fontSize:10,color:C.t3,fontWeight:600,marginBottom:6,display:'block',letterSpacing:'0.05em',textTransform:'uppercase' as const}

  // Neon Tokyo one-click looks — sets bg+text together so an operator can
  // reach for a whole signage style instead of picking two colors by hand.
  const NEON_PRESETS = [
    {label:'Shibuya Pink',  bg:'#0a0612', fg:'#ff2e63'},
    {label:'Cyber Cyan',    bg:'#060b14', fg:'#6fe8ff'},
    {label:'Vaporwave',     bg:'#12081f', fg:'#ff8fe0'},
    {label:'Akiba Yellow',  bg:'#0c0a04', fg:'#ffd23f'},
    {label:'Neon Noir',     bg:'#000000', fg:'#ffffff'},
    {label:'Midori Glow',   bg:'#04120a', fg:'#39ff8f'},
  ]

  return (
    <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',borderRight:`1px solid ${C.b0}`}}>
        <div style={{padding:'10px 20px',background:C.tex1,borderBottom:`1px solid ${C.b0}`,flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Compose Announcement</span>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:24,display:'flex',flexDirection:'column',gap:18}}>
          <div>
            <label style={lbl}>Quick Templates</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {TEMPLATES.map(t=>(
                <button key={t.label} onClick={()=>{setText(t.text);setTitle(t.label)}}
                  style={{padding:'6px 12px',background:C.tex4,border:`1px solid ${C.b1}`,color:C.t2,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:7}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.p1;(e.currentTarget as HTMLElement).style.color=C.p2}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.b1;(e.currentTarget as HTMLElement).style.color=C.t2}}
                >{t.label}</button>
              ))}
            </div>
          </div>
          <div><label style={lbl}>Title (optional)</label><input style={inp} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Welcome"/></div>
          <div><label style={lbl}>Message</label><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Type your announcement..." rows={6} style={{...inp,resize:'vertical',lineHeight:1.7}}/></div>
          <div style={{display:'flex',gap:20}}>
            <div style={{flex:1}}>
              <label style={lbl}>Background</label>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input type="color" value={bgColor} onChange={e=>setBgColor(e.target.value)} style={{width:36,height:32,border:`1px solid ${C.b2}`,borderRadius:6,background:'none',cursor:'pointer'}}/>
                <input style={{...inp,width:90}} value={bgColor} onChange={e=>setBgColor(e.target.value)}/>
              </div>
            </div>
            <div style={{flex:1}}>
              <label style={lbl}>Text Color</label>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input type="color" value={fgColor} onChange={e=>setFgColor(e.target.value)} style={{width:36,height:32,border:`1px solid ${C.b2}`,borderRadius:6,background:'none',cursor:'pointer'}}/>
                <input style={{...inp,width:90}} value={fgColor} onChange={e=>setFgColor(e.target.value)}/>
              </div>
            </div>
          </div>
          <div>
            <label style={lbl}>Neon Presets</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {NEON_PRESETS.map(p=>(
                <button key={p.label} onClick={()=>{setBgColor(p.bg);setFgColor(p.fg)}}
                  title={p.label}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px 6px 6px',background:p.bg,border:`1px solid ${bgColor===p.bg&&fgColor===p.fg?p.fg:C.b1}`,color:p.fg,fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:7,letterSpacing:'0.02em'}}>
                  <span style={{width:14,height:14,borderRadius:4,background:p.fg,boxShadow:`0 0 8px ${p.fg}`,flexShrink:0}}/>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Background Image</label>
            {bgImage
              ?<div style={{display:'flex',gap:8,alignItems:'center'}}>
                <div style={{width:60,height:36,backgroundImage:`url(${bgImage})`,backgroundSize:'cover',borderRadius:6,border:`1px solid ${C.b2}`}}/>
                <button onClick={()=>setBgImage(null)} style={{padding:'6px 10px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:6}}>Remove</button>
              </div>
              :<button onClick={pickBgImage} style={{width:'100%',padding:'9px 0',background:'none',border:`1px dashed ${C.b2}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>Choose Image...</button>
            }
          </div>
          <div style={{display:'flex',gap:20}}>
            <div style={{flex:1}}>
              <label style={lbl}>Font Size — {fontSize}px</label>
              <input type="range" min={20} max={96} value={fontSize} onChange={e=>setFontSize(parseInt(e.target.value))} style={{width:'100%',accentColor:C.p1}}/>
            </div>
            <div>
              <label style={lbl}>Align</label>
              <div style={{display:'flex',gap:4}}>
                {(['left','center','right'] as const).map(a=>(
                  <button key={a} onClick={()=>setAlign(a)} style={{padding:'6px 10px',fontSize:13,border:`1px solid ${align===a?C.g2:C.b1}`,color:align===a?C.g2:C.t3,background:align===a?`color-mix(in srgb, ${C.g2} 7%, transparent)`:'none',cursor:'pointer',borderRadius:5}}>{a==='left'?'⫷':a==='center'?'≡':'⫸'}</button>
                ))}
              </div>
            </div>
          </div>
          <button className="glass-primary" onClick={send} style={{padding:'14px 0',background:`linear-gradient(135deg,${C.live},${C.p1})`,border:'none',color:'#fff',fontSize:13,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',fontFamily:'inherit'}}>● SEND LIVE</button>
        </div>
      </div>
      <div style={{width:340,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'10px 16px',background:C.tex1,borderBottom:`1px solid ${C.b0}`,flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Preview</span>
        </div>
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:C.tex2}}>
          <div style={{width:'100%',aspectRatio:'16/9',background:bgColor,borderRadius:8,overflow:'hidden',border:`1px solid ${C.b1}`,boxShadow:'0 8px 32px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,position:'relative',
            backgroundImage:bgImage?`url(${bgImage})`:undefined,backgroundSize:'cover',backgroundPosition:'center'}}>
            {bgImage&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.4)'}}/>}
            <div style={{position:'relative',zIndex:1}}>
              {text?<div style={{fontSize:fontSize*0.22,color:fgColor,textAlign:align,lineHeight:1.6,whiteSpace:'pre-line',wordBreak:'break-word',fontWeight:300}}>{text}</div>
                   :<div style={{fontSize:12,color:'rgba(255,255,255,0.2)',textAlign:'center'}}>Preview</div>}
            </div>
          </div>
        </div>
        <div style={{borderTop:`1px solid ${C.b0}`,flexShrink:0}}>
          <div style={{padding:'8px 14px',background:C.tex1,borderBottom:`1px solid ${C.b0}`}}>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.15em',color:C.t4,textTransform:'uppercase' as const}}>Recent</span>
          </div>
          <div style={{maxHeight:180,overflowY:'auto'}}>
            {history.length===0&&<div style={{padding:'14px 16px',fontSize:11,color:C.t4}}>No announcements sent yet</div>}
            {history.map((h,i)=>(
              <div key={i} onClick={()=>{setText(h.text);setTitle(h.title)}}
                style={{padding:'8px 14px',borderBottom:`1px solid ${C.b0}`,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=C.bg3}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,color:C.g2,fontWeight:700,marginBottom:2}}>{h.title}</div>
                  <div style={{fontSize:10,color:C.t3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.text}</div>
                </div>
                <div style={{fontSize:9,color:C.t4,flexShrink:0}}>{h.ts}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SongsTab({ goLive, addToQueue, notify }: { goLive:(t:string,l:string)=>void; addToQueue:(t:string,type:string)=>void; notify:(m:string)=>void }) {
  const [songs,setSongs]             = useState<Song[]>([])
  const [selected,setSelected]       = useState<Song|null>(null)
  const [sections,setSections]       = useState<Section[]>([])
  const [cur,setCur]                 = useState(0)
  const [search,setSearch]           = useState('')
  const [filter,setFilter]           = useState<'all'|'hymnal'|'hymnal-cis'|'custom'>('all')
  const [loading,setLoading]         = useState(true)
  const [expandedLangs,setExpandedLangs] = useState<Record<string,boolean>>({})
  const [showAddForm,setShowAddForm]     = useState(false)
  const [newTitle,setNewTitle]           = useState('')
  const [newHymnNum,setNewHymnNum]       = useState('')
  const [newLang,setNewLang]             = useState('en')
  const [newSections,setNewSections]     = useState<{type:string;content:string}[]>([{type:'verse',content:''}])
  const [saving,setSaving]               = useState(false)
  const api = (window as any).shogunos

  const LANG_LABELS: Record<string,string> = {
    en:'English', sn:'Shona', nd:'Ndebele/IsiZulu', xh:'IsiXhosa', tn:'Tswana', st:'Sotho',
    ny:'Chichewa', toi:'Tonga', ve:'Venda', sw:'Swahili', ts:'Xitsonga', ki:'Kikuyu',
    guz:'Abagusii', luo:'Dholuo', rw:'Kinyarwanda', pt:'Português', es:'Español',
    fr:'Français', ru:'Русский', tum:'Tumbuka', nso:'Sepedi', bem:'Icibemba', tw:'Twi',
  }
  const langLabel = (l:string) => LANG_LABELS[l] || (l.charAt(0).toUpperCase()+l.slice(1))
  // Group key: SDA hymns form one group, CIS hymns split by language, custom songs by language
  const groupKey = (s:Song) => s.source==='hymnal-cis' ? `cis-${s.language}` : s.source==='hymnal' ? 'sda' : `custom-${s.language||'en'}`
  const groupLabel = (key:string) => key==='sda' ? 'SDA Hymnal' : key.startsWith('cis-') ? `CIS · ${langLabel(key.slice(4))}` : `Custom · ${langLabel(key.slice(7))}`
  const GROUP_ORDER = ['sda','cis-en','cis-sn','cis-nd','cis-xh','cis-tn','cis-st','cis-ny','cis-toi',
    'cis-ve','cis-sw','cis-ts','cis-ki','cis-guz','cis-luo','cis-rw','cis-pt','cis-es','cis-fr',
    'cis-ru','cis-tum','cis-nso','cis-bem','cis-tw']
  // Raw language codes (for the "add custom song" language picker — unrelated to hymnal grouping)
  const LANG_ORDER = ['en','sn','nd','xh','tn','st','ny','toi','ve','sw','ts','ki','guz','luo','rw','pt','es','fr','ru','tum','nso','bem','tw']

  async function loadSongs(){
    try{
      const all:Song[] = await api.searchSongs('')
      const sorted = all.sort((a,b)=>(a.hymn_number||9999)-(b.hymn_number||9999))
      setSongs(sorted)
      const songGroups = Array.from(new Set(sorted.map(groupKey)))
        .sort((a,b)=>GROUP_ORDER.indexOf(a)-GROUP_ORDER.indexOf(b) || a.localeCompare(b))
      setExpandedLangs(e=>Object.keys(e).length>0?e:(songGroups.length>0?{[songGroups[0]]:true}:e))
      setLoading(false)
      return sorted
    }catch{ setLoading(false); return [] }
  }

  useEffect(()=>{ loadSongs() },[])

  function resetAddForm(){
    setNewTitle('');setNewHymnNum('');setNewLang('en');setNewSections([{type:'verse',content:''}])
  }

  function updateNewSection(i:number,patch:Partial<{type:string;content:string}>){
    setNewSections(s=>s.map((sec,idx)=>idx===i?{...sec,...patch}:sec))
  }
  function addNewSection(){
    setNewSections(s=>[...s,{type:s.length===0?'verse':'chorus',content:''}])
  }
  function removeNewSection(i:number){
    setNewSections(s=>s.length<=1?s:s.filter((_,idx)=>idx!==i))
  }

  const canSaveNewSong = newTitle.trim().length>0 && newSections.some(s=>s.content.trim().length>0)

  async function saveNewSong(){
    if(!canSaveNewSong||saving) return
    setSaving(true)
    try{
      const songId = await api.addSong(newTitle.trim(), newLang, 'custom', newHymnNum?parseInt(newHymnNum):undefined)
      let order=1
      for(const sec of newSections){
        if(!sec.content.trim()) continue
        await api.addSongSection(songId, sec.type, order++, sec.content.trim())
      }
      const reloaded = await loadSongs()
      setExpandedLangs(e=>({...e,[`custom-${newLang}`]:true}))
      const created = reloaded.find((s:Song)=>s.id===songId)
      if(created) await selectSong(created)
      notify(`"${newTitle.trim()}" added to ${langLabel(newLang)}`)
      setShowAddForm(false)
      resetAddForm()
    }catch(e:any){
      notify('Failed to save song — '+(e?.message||'unknown error'))
    }
    setSaving(false)
  }

  async function selectSong(song:Song){
    setShowAddForm(false)
    setSelected(song); setCur(0)
    setSections(await api.getSongSections(song.id))
  }

  const visible = useMemo(() => songs.filter(s=>{
    if(filter!=='all'&&s.source!==filter) return false
    if(search) return s.title.toLowerCase().includes(search.toLowerCase()) ||
      String(s.hymn_number||'').includes(search)
    return true
  }), [songs, filter, search])

  const langs = useMemo(() => Array.from(new Set(songs.map(groupKey)))
    .sort((a,b)=>GROUP_ORDER.indexOf(a)-GROUP_ORDER.indexOf(b) || a.localeCompare(b)), [songs])

  const byLang = useMemo(() => langs.reduce((acc,key)=>{
    acc[key]=visible.filter(s=>groupKey(s)===key)
    return acc
  },{} as Record<string,Song[]>), [langs, visible])

  const sec=sections[cur]
  const btn: React.CSSProperties = {cursor:'pointer',fontFamily:'inherit',border:'none',outline:'none',transition:'all 0.15s'}
  const LANG_COLORS = [C.p1, C.g1, C.live+'cc', C.safe+'cc', C.p2]

  return (
    <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
      {/* ── LEFT PANEL ── */}
      <div style={{width:280,background:C.tex2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'14px 16px',background:C.tex0,borderBottom:`1px solid ${C.b0}`,flexShrink:0}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,marginBottom:6}}>SONG LIBRARY</div>
          <div style={{display:'flex',alignItems:'center',background:C.tex4,border:`1px solid ${C.b1}`,borderRadius:6,padding:'0 10px',gap:6,marginBottom:10}}>
            <span style={{color:C.t3,fontSize:13}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search songs or hymn #…"
              style={{flex:1,background:'none',border:'none',color:C.t1,fontSize:12,outline:'none',padding:'8px 0',fontFamily:'inherit'}}/>
            {search&&<span onClick={()=>setSearch('')} style={{color:C.t3,cursor:'pointer',fontSize:12,lineHeight:1}}>✕</span>}
          </div>
          <div style={{display:'flex',gap:4,marginBottom:10}}>
            {([['all','ALL'],['hymnal','SDA'],['hymnal-cis','CIS'],['custom','CUSTOM']] as const).map(([f,label])=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{...btn,flex:1,padding:'5px 0',fontSize:9,fontWeight:700,letterSpacing:'0.06em',
                  border:`1px solid ${filter===f?C.g2:C.b1}`,
                  color:filter===f?C.g2:C.t4,
                  background:filter===f?`color-mix(in srgb, ${C.g2} 8%, transparent)`:'transparent',borderRadius:4}}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={()=>{setShowAddForm(true);setSelected(null)}}
            style={{...btn,width:'100%',padding:'8px 0',fontSize:10,fontWeight:700,letterSpacing:'0.08em',
              border:`1px solid color-mix(in srgb, ${C.p1} 33%, transparent)`,color:C.p2,background:`color-mix(in srgb, ${C.p1} 7%, transparent)`,borderRadius:6}}>
            + ADD SONG
          </button>
        </div>

        <div style={{flex:1,overflowY:'auto'}}>
          {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:12}}>Loading songs…</div>}
          {!loading&&visible.length===0&&(
            <div style={{padding:32,textAlign:'center',color:C.t3,fontSize:12}}>
              <div style={{fontSize:32,opacity:0.15,marginBottom:8}}>♪</div>
              {search?'No songs match your search':'No songs found'}
            </div>
          )}
          {!loading&&langs.map((lang,li)=>{
            const group=byLang[lang]
            if(!group||group.length===0) return null
            const isOpen=expandedLangs[lang]===true
            const accent=LANG_COLORS[li%LANG_COLORS.length]
            return (
              <div key={lang}>
                <button onClick={()=>setExpandedLangs(e=>({...e,[lang]:!isOpen}))}
                  style={{...btn,width:'100%',padding:'9px 14px 9px 12px',
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    background:C.tex1,borderLeft:`3px solid ${accent}`,
                    borderBottom:`1px solid ${C.b0}`,color:C.t2,textAlign:'left' as const}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:accent}}>{groupLabel(lang).toUpperCase()}</span>
                    <span style={{fontSize:9,color:C.t4,background:C.tex3,padding:'1px 6px',borderRadius:10,border:`1px solid ${C.b1}`}}>{group.length}</span>
                  </div>
                  <span style={{fontSize:9,color:C.t4}}>{isOpen?'▾':'▸'}</span>
                </button>
                {isOpen&&group.map(song=>{
                  const active=selected?.id===song.id
                  return (
                    <div key={song.id} onClick={()=>selectSong(song)}
                      {...dragSource(song.title,'song')}
                      style={{padding:'9px 14px 9px 15px',borderLeft:`3px solid ${active?accent:'transparent'}`,
                        borderBottom:`1px solid ${C.b0}`,background:active?`${accent}0f`:C.tex2,
                        cursor:'grab',transition:'all 0.1s'}}
                      onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLElement).style.background=C.bg3}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=active?`${accent}0f`:C.bg2}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                        <span style={{color:C.t4,fontSize:9,flexShrink:0,opacity:0.6}}>⠿</span>
                        {song.hymn_number>0&&(
                          <span style={{fontSize:8,color:C.g1,fontWeight:700,padding:'1px 5px',background:`color-mix(in srgb, ${C.g1} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${C.g1} 20%, transparent)`,borderRadius:3}}>
                            #{String(song.hymn_number).padStart(3,'0')}
                          </span>
                        )}
                        {(()=>{
                          const badgeCol = song.source==='hymnal'?C.g2:song.source==='hymnal-cis'?C.p1:C.p2
                          const badgeText = song.source==='hymnal'?'SDA':song.source==='hymnal-cis'?'CIS':'CUSTOM'
                          return (
                            <span style={{fontSize:8,color:badgeCol,fontWeight:600,
                              padding:'1px 5px',background:`${badgeCol}12`,
                              border:`1px solid ${badgeCol}33`,borderRadius:3,
                              textTransform:'uppercase' as const,letterSpacing:'0.04em'}}>
                              {badgeText}
                            </span>
                          )
                        })()}
                      </div>
                      <div style={{fontSize:12,color:active?C.t1:C.t2,fontWeight:active?600:400,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                        {song.title}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <div style={{padding:'10px 16px',borderTop:`1px solid ${C.b0}`,background:C.tex0,display:'flex',flexShrink:0}}>
          {[['SDA',songs.filter(s=>s.source==='hymnal').length,C.g2],
            ['CIS',songs.filter(s=>s.source==='hymnal-cis').length,C.p1],
            ['Custom',songs.filter(s=>s.source==='custom').length,C.p2],
            ['Total',songs.length,C.t2]].map(([l,v,col],i)=>(
            <div key={l as string} style={{flex:1,textAlign:'center' as const,borderRight:i<3?`1px solid ${C.b0}`:'none'}}>
              <div style={{fontSize:17,fontWeight:300,color:col as string}}>{v as number}</div>
              <div style={{fontSize:8,color:C.t4,letterSpacing:'0.1em',marginTop:2}}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: DETAIL ── */}
      {showAddForm ? (
        <div style={{flex:1,overflowY:'auto',background:C.tex1,padding:'28px 40px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
            <div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.p2,marginBottom:6}}>NEW SONG</div>
              <div style={{fontSize:20,fontWeight:700,color:C.t1}}>Add a hymn or song</div>
            </div>
            <button onClick={()=>{setShowAddForm(false);resetAddForm()}}
              style={{...btn,padding:'7px 14px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,borderRadius:7}}>
              Cancel
            </button>
          </div>

          <div style={{display:'flex',gap:14,marginBottom:18}}>
            <div style={{flex:1}}>
              <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.06em',display:'block',marginBottom:6}}>TITLE</label>
              <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="e.g. Amazing Grace" autoFocus
                style={{width:'100%',background:C.tex3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:8}}/>
            </div>
            <div style={{width:110}}>
              <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.06em',display:'block',marginBottom:6}}>HYMN #</label>
              <input value={newHymnNum} onChange={e=>setNewHymnNum(e.target.value.replace(/[^0-9]/g,''))} placeholder="Optional"
                style={{width:'100%',background:C.tex3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:8}}/>
            </div>
            <div style={{width:170}}>
              <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.06em',display:'block',marginBottom:6}}>LANGUAGE</label>
              <select value={newLang} onChange={e=>setNewLang(e.target.value)}
                style={{width:'100%',background:C.tex3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:8}}>
                {LANG_ORDER.map(l=><option key={l} value={l}>{langLabel(l)}</option>)}
              </select>
            </div>
          </div>

          <div style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.06em'}}>SECTIONS</label>
            <button onClick={addNewSection}
              style={{...btn,padding:'5px 12px',background:'none',border:`1px solid ${C.b1}`,color:C.t2,fontSize:10,fontWeight:600,borderRadius:6}}>
              + Add Section
            </button>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
            {newSections.map((sec,i)=>(
              <div key={i} style={{background:C.tex2,border:`1px solid ${C.b1}`,borderRadius:10,padding:14}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <select value={sec.type} onChange={e=>updateNewSection(i,{type:e.target.value})}
                    style={{background:C.tex4,border:`1px solid ${C.b1}`,color:C.p2,padding:'5px 8px',fontSize:10,fontWeight:700,letterSpacing:'0.05em',outline:'none',fontFamily:'inherit',borderRadius:5,textTransform:'uppercase' as const}}>
                    {['verse','chorus','bridge','intro','outro'].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                  <div style={{flex:1}}/>
                  {newSections.length>1&&(
                    <button onClick={()=>removeNewSection(i)} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:14,padding:0}}>✕</button>
                  )}
                </div>
                <textarea value={sec.content} onChange={e=>updateNewSection(i,{content:e.target.value})}
                  placeholder="Lyrics for this section…" rows={4}
                  style={{width:'100%',background:C.tex3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:7,resize:'vertical' as const,lineHeight:1.6}}/>
              </div>
            ))}
          </div>

          <button onClick={saveNewSong} disabled={!canSaveNewSong||saving} className="shimmer-btn glass-primary"
            style={{padding:'12px 32px',background:canSaveNewSong&&!saving?`linear-gradient(135deg,${C.p1},${C.g1})`:C.bg4,
              border:'none',color:canSaveNewSong&&!saving?'#fff':C.t4,fontSize:12,fontWeight:700,
              cursor:canSaveNewSong&&!saving?'pointer':'not-allowed',fontFamily:'inherit',letterSpacing:'0.06em',transition:'all 0.15s'}}>
            {saving?'Saving…':'Save Song'}
          </button>
        </div>
      ) : !selected ? (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
          flexDirection:'column',gap:10,color:C.t4,background:C.tex1}}>
          <div style={{fontSize:52,opacity:0.07}}>♪</div>
          <div style={{fontSize:12,letterSpacing:'0.12em',fontWeight:500}}>SELECT A SONG TO BEGIN</div>
        </div>
      ) : (
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          <div style={{padding:'16px 24px',background:C.tex0,borderBottom:`1px solid ${C.b0}`,
            display:'flex',alignItems:'flex-start',gap:14,flexShrink:0}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:18,fontWeight:600,color:C.t1,overflow:'hidden',
                textOverflow:'ellipsis',whiteSpace:'nowrap' as const,letterSpacing:'-0.01em'}}>
                {selected.title}
              </div>
              <div style={{fontSize:11,color:C.t4,marginTop:5,display:'flex',gap:8,alignItems:'center'}}>
                <span style={{color:LANG_COLORS[langs.indexOf(groupKey(selected))%LANG_COLORS.length]}}>
                  {groupLabel(groupKey(selected))}
                </span>
                <span style={{color:C.b2}}>•</span>
                <span>{selected.source==='hymnal'||selected.source==='hymnal-cis'?`Hymn #${selected.hymn_number}`:'Custom'}</span>
                <span style={{color:C.b2}}>•</span>
                <span>{sections.length} sections</span>
              </div>
            </div>
            <button onClick={()=>addToQueue(selected.title,'song')}
              style={{...btn,padding:'8px 14px',fontSize:10,fontWeight:700,letterSpacing:'0.06em',
                border:`1px solid ${C.g2}`,color:C.g2,background:`color-mix(in srgb, ${C.g2} 6%, transparent)`,borderRadius:5}}>
              + QUEUE
            </button>
            {selected.source==='custom'&&(
              <button onClick={async()=>{
                  if(!confirm(`Delete "${selected.title}"? This can't be undone.`))return
                  await api.deleteSong(selected.id)
                  setSelected(null);setSections([])
                  await loadSongs()
                  notify('Song deleted')
                }}
                style={{...btn,padding:'8px 14px',fontSize:10,fontWeight:700,letterSpacing:'0.06em',
                  border:`1px solid color-mix(in srgb, ${C.live} 33%, transparent)`,color:C.live,background:`color-mix(in srgb, ${C.live} 6%, transparent)`,borderRadius:5}}>
                DELETE
              </button>
            )}
          </div>

          <div style={{display:'flex',gap:6,padding:'10px 16px',background:C.tex2,
            borderBottom:`1px solid ${C.b0}`,flexShrink:0,overflowX:'auto'}}>
            {sections.map((s,i)=>(
              <button key={s.id} onClick={()=>setCur(i)}
                style={{...btn,padding:'5px 12px',fontSize:10,fontWeight:600,letterSpacing:'0.04em',
                  border:`1px solid ${i===cur?C.p1:C.b1}`,
                  color:i===cur?C.p2:C.t4,
                  background:i===cur?`color-mix(in srgb, ${C.p1} 8%, transparent)`:'transparent',borderRadius:4,
                  flexShrink:0,whiteSpace:'nowrap' as const,
                  boxShadow:i===cur?`0 0 10px color-mix(in srgb, ${C.p1} 19%, transparent)`:'none'}}>
                {s.type==='verse'?`Verse ${i+1}`:s.type.charAt(0).toUpperCase()+s.type.slice(1)}
              </button>
            ))}
          </div>

          <div style={{flex:1,padding:'40px 56px',overflowY:'auto',background:C.tex1,position:'relative'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:1,
              background:`linear-gradient(to right,${C.p1},${C.g1},transparent)`}} />
            {sec&&(
              <>
                <div style={{fontSize:9,color:C.t4,letterSpacing:'0.2em',fontWeight:700,marginBottom:20,textTransform:'uppercase' as const}}>
                  {sec.type}{sec.type==='verse'?` ${cur+1}`:''}
                </div>
                <div style={{fontSize:22,lineHeight:2.0,color:C.t1,fontWeight:300,
                  whiteSpace:'pre-line' as const,letterSpacing:'0.01em'}}>
                  {sec.content}
                </div>
              </>
            )}
          </div>

          <div style={{padding:'12px 20px',background:C.tex0,borderTop:`1px solid ${C.b0}`,
            display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <button onClick={()=>cur>0&&setCur(i=>i-1)} disabled={cur===0}
              style={{...btn,padding:'10px 14px',background:'transparent',border:`1px solid ${C.b1}`,
                color:C.t2,fontSize:16,borderRadius:6,opacity:cur===0?0.25:1,cursor:cur===0?'not-allowed':'pointer'}}>
              ‹
            </button>
            <div style={{fontSize:11,color:C.t3,flex:1,textAlign:'center' as const}}>
              {cur+1} <span style={{color:C.t4}}>of</span> {sections.length}
            </div>
            <button onClick={()=>cur<sections.length-1&&setCur(i=>i+1)} disabled={cur===sections.length-1}
              style={{...btn,padding:'10px 14px',background:'transparent',border:`1px solid ${C.b1}`,
                color:C.t2,fontSize:16,borderRadius:6,
                opacity:cur===sections.length-1?0.25:1,
                cursor:cur===sections.length-1?'not-allowed':'pointer'}}>
              ›
            </button>
            <button onClick={()=>sec&&goLive(selected.title,sec.content)} className="shimmer-btn glass-primary"
              style={{...btn,padding:'11px 32px',
                background:`linear-gradient(135deg,${C.live},${C.p1})`,
                border:`1px solid color-mix(in srgb, ${C.live} 33%, transparent)`,
                color:'#fff',fontSize:11,fontWeight:700,
                letterSpacing:'0.08em'}}>
              GO LIVE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type RemoteDevice = { token:string; label:string; lastSeen:number }
type RemoteInfo   = { port:number|null; pin:string; urls:string[]; devices:RemoteDevice[] }

function relativeTime(ms:number):string{
  const secs = Math.max(0, Math.round((Date.now()-ms)/1000))
  if(secs<10) return 'just now'
  if(secs<60) return `${secs}s ago`
  const mins = Math.round(secs/60)
  if(mins<60) return `${mins}m ago`
  const hrs = Math.round(mins/60)
  return `${hrs}h ago`
}

function RemoteTab() {
  const [info,setInfo]     = useState<RemoteInfo|null>(null)
  const [loading,setLoading] = useState(true)
  const [qrSvg,setQrSvg]    = useState<string>('')
  const [kicking,setKicking] = useState<string|null>(null)

  // Keep polling (not just a one-shot load) so a freshly-connected phone
  // shows up in "Connected Devices" without the operator having to reopen
  // this tab, and so a device that times out drops off the list on its own.
  useEffect(()=>{
    let cancelled = false
    async function load(attempt=0){
      try{
        const i = await (window as any).shogunos.getRemoteInfo()
        if(cancelled) return
        // The server binds its port asynchronously right at app startup, so
        // if Settings→Remote is opened in that first instant, port can
        // still be null even though it'll succeed a moment later. Retry a
        // few times before concluding it's genuinely unavailable.
        if(i.port==null && attempt<6){ setTimeout(()=>load(attempt+1),400); return }
        setInfo(i)
      } finally{ if(!cancelled) setLoading(false) }
    }
    load()
    const iv = setInterval(load, 3000)
    return ()=>{ cancelled = true; clearInterval(iv) }
  },[])

  // The remote page already knows how to auto-connect from a `?pin=` query
  // param (see REMOTE_HTML in remote-server.ts), so the QR just needs to
  // encode that same URL — scanning it is then equivalent to typing in the
  // IP and PIN by hand, just without the typing.
  useEffect(()=>{
    const url = info?.urls?.[0]
    if(!url || !info?.pin){ setQrSvg(''); return }
    let cancelled = false
    QRCode.toString(`${url}/?pin=${info.pin}`, { type:'svg', margin:1, width:176, color:{ dark:'#100c1e', light:'#ffffff' } })
      .then(svg=>{ if(!cancelled) setQrSvg(svg) })
      .catch(()=>{ if(!cancelled) setQrSvg('') })
    return ()=>{ cancelled = true }
  },[info?.urls?.[0], info?.pin])

  async function disconnectDevice(token:string){
    setKicking(token)
    try{
      await (window as any).shogunos.kickRemoteDevice(token)
      const i = await (window as any).shogunos.getRemoteInfo()
      setInfo(i)
    } finally{ setKicking(null) }
  }

  return (
    <div style={{flex:1,padding:40,overflowY:'auto',background:C.tex1}}>
      <div style={{maxWidth:640}}>
        <div style={{fontSize:20,fontWeight:700,color:C.t1,marginBottom:6}}>Remote Control</div>
        <div style={{fontSize:13,color:C.t3,lineHeight:1.6,marginBottom:24}}>
          Drive the live screen from a phone or tablet on the same Wi-Fi network — advance slides, blank the screen, or send a queued item live, without touching this computer.
        </div>

        {loading && <div style={{fontSize:12,color:C.t3}}>Starting remote server…</div>}

        {!loading && (!info || info.port==null) && (
          <div style={{background:C.tex3,borderRadius:12,padding:'16px 18px',border:`1px solid ${C.b1}`,fontSize:12,color:C.t2}}>
            Remote control isn't available right now — its network port couldn't be opened (something else on this computer may be using it). Everything else in ShogunOS is unaffected; try restarting the app if you need the remote.
          </div>
        )}

        {info && info.port!=null && (
          <>
            <div style={{display:'flex',gap:16,marginBottom:16,flexWrap:'wrap'}}>
              <div style={{background:C.tex3,borderRadius:12,padding:18,border:`1px solid ${C.b1}`,display:'flex',alignItems:'center',justifyContent:'center',width:176+36,height:176+36,flexShrink:0}}>
                {qrSvg
                  ? <div style={{width:176,height:176,borderRadius:6,overflow:'hidden'}} dangerouslySetInnerHTML={{__html:qrSvg}}/>
                  : <div style={{fontSize:11,color:C.t4,textAlign:'center',width:176}}>QR unavailable — connect this computer to Wi-Fi first</div>}
              </div>

              <div style={{flex:1,minWidth:220,display:'flex',flexDirection:'column',gap:12}}>
                <div style={{background:C.tex3,borderRadius:12,padding:'14px 18px',border:`1px solid ${C.b1}`}}>
                  <div style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.15em',marginBottom:8,textTransform:'uppercase' as const}}>Scan, or connect manually to</div>
                  {info.urls.length===0 && <div style={{fontSize:13,color:C.t3}}>No network connection detected.</div>}
                  {info.urls.map(u=>(
                    <div key={u} style={{fontSize:16,fontWeight:700,color:C.g2,fontFamily:'monospace',marginBottom:2}}>{u}</div>
                  ))}
                </div>
                <div style={{background:C.tex3,borderRadius:12,padding:'14px 18px',border:`1px solid ${C.b1}`}}>
                  <div style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.15em',marginBottom:8,textTransform:'uppercase' as const}}>PIN (only needed for manual entry)</div>
                  <div style={{fontSize:28,fontWeight:900,letterSpacing:'0.3em',color:C.p2,fontFamily:'monospace'}}>{info.pin}</div>
                </div>
              </div>
            </div>

            <div style={{fontSize:11,color:C.t4,lineHeight:1.6,marginBottom:24}}>
              Works over your local Wi-Fi only — no internet or account needed. Both devices must be on the same network. A new PIN is generated every time ShogunOS starts.
            </div>

            <div style={{background:C.tex3,borderRadius:12,padding:'18px 20px',border:`1px solid ${C.b1}`}}>
              <div style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.15em',marginBottom:12,textTransform:'uppercase' as const}}>
                Connected Devices {info.devices.length>0 && `(${info.devices.length})`}
              </div>
              {info.devices.length===0 && (
                <div style={{fontSize:12,color:C.t3}}>No devices connected yet — scan the QR code above from a phone to connect one.</div>
              )}
              {info.devices.map(d=>(
                <div key={d.token} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderTop:`1px solid ${C.b1}`}}>
                  <div>
                    <div style={{fontSize:13,color:C.t1,fontWeight:600}}>{d.label}</div>
                    <div style={{fontSize:11,color:C.t4}}>Active {relativeTime(d.lastSeen)}</div>
                  </div>
                  <button
                    onClick={()=>disconnectDevice(d.token)}
                    disabled={kicking===d.token}
                    style={{background:'transparent',border:`1px solid ${C.live}`,color:C.live,fontSize:11,fontWeight:700,letterSpacing:'0.05em',padding:'6px 12px',borderRadius:8,cursor:kicking===d.token?'default':'pointer',opacity:kicking===d.token?0.5:1}}>
                    {kicking===d.token ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AboutTab() {
  return (
    <div style={{flex:1,padding:40,overflowY:'auto',background:C.tex1}}>
      <div style={{maxWidth:560}}>
        <div style={{display:'flex',alignItems:'center',gap:20,marginBottom:36}}>
          <svg width="64" height="64" viewBox="0 0 100 100">
            <defs>
              <radialGradient id="ab1" cx="50%" cy="30%" r="70%"><stop offset="0%" stopColor="#1e1b4b"/><stop offset="100%" stopColor="#0f0e2b"/></radialGradient>
              <linearGradient id="ab2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={C.p2}/><stop offset="50%" stopColor={C.g2}/><stop offset="100%" stopColor={C.p2}/></linearGradient>
              <linearGradient id="ab3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.g3}/><stop offset="100%" stopColor={C.g1}/></linearGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="url(#ab1)" stroke="url(#ab2)" strokeWidth="2"/>
            <text x="50" y="66" textAnchor="middle" fontSize="44" fill="url(#ab3)" fontFamily="serif" fontWeight="700">将</text>
          </svg>
          <div>
            <div style={{fontSize:32,fontWeight:900,letterSpacing:'-0.02em',color:C.t1}}>
              SHOGUN<span style={{background:`linear-gradient(135deg,${C.p1},${C.g2})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>OS</span>
            </div>
            <div style={{fontSize:11,color:C.t3,letterSpacing:'0.3em',marginTop:4}}>MULTIMEDIA PRESENTATION SYSTEM</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:24}}>
          {[
            ['Version','v1.0 · Ronin Edition'],
            ['Year','2024 — 2025'],
            ['Developer','Ngaatendwe Manjeya'],
            ['School','Lingfield Advent High School'],
            ['Platform','Windows · macOS · Linux'],
            ['Stack','Electron · React · TypeScript'],
            ['Built with','Claude AI (Anthropic)'],
            ['License','Private — All rights reserved'],
          ].map(([k,v])=>(
            <div key={k} style={{background:C.tex3,borderRadius:10,padding:'14px 16px',border:`1px solid ${C.b1}`}}>
              <div style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.15em',marginBottom:5,textTransform:'uppercase' as const}}>{k}</div>
              <div style={{fontSize:12,color:C.t1,fontWeight:500}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{background:C.tex3,borderRadius:12,padding:'18px 20px',border:`1px solid ${C.b1}`}}>
          <div style={{fontSize:10,color:C.t4,fontWeight:700,letterSpacing:'0.15em',marginBottom:8,textTransform:'uppercase' as const}}>About</div>
          <div style={{fontSize:13,color:C.t2,lineHeight:1.75}}>ShogunOS is a professional multimedia presentation system built for church services, schools and events. Designed and developed by Ngaatendwe Manjeya as a former student of Lingfield Advent High School, this application combines the precision of professional broadcast tools with the simplicity needed for real-world worship environments.</div>
        </div>
      </div>
    </div>
  )
}

function ImportTab({ notify }: { notify:(m:string)=>void }) {
  const [importing,setImporting] = useState(false)
  const [result,setResult]       = useState<{success:boolean;message:string}|null>(null)
  const [mode,setMode]           = useState<'json'|'qsp'>('json')
  const [dragOver,setDragOver]   = useState(false)
  const [qspLang,setQspLang]     = useState('en')
  const fileRef  = useRef<HTMLInputElement>(null)
  const qspRef   = useRef<HTMLInputElement>(null)
  const api = (window as any).shogunos

  const QSP_LANGS: { id:string; label:string }[] = [
    { id:'en', label:'English' }, { id:'sn', label:'Shona' }, { id:'nd', label:'Ndebele' },
    { id:'fr', label:'French' }, { id:'pt', label:'Portuguese' }, { id:'sw', label:'Swahili' },
    { id:'zu', label:'Zulu' }, { id:'xh', label:'Xhosa' }, { id:'st', label:'Sotho' },
  ]

  async function handleJson(file:File){
    if(!file.name.endsWith('.json')){setResult({success:false,message:'Please select a .json ShogunOS backup file'});return}
    setImporting(true);setResult(null)
    try{
      const text=await file.text()
      const r=await api.importData(text)
      if(r.success){setResult({success:true,message:`Imported — ${r.counts.songs} songs, ${r.counts.slides} slides added`});notify('Import successful')}
      else setResult({success:false,message:r.error||'Import failed'})
    }catch{setResult({success:false,message:'Failed to read file'})}
    setImporting(false)
  }

  async function handleQSP(file:File){
    if(!file.name.toLowerCase().endsWith('.qsp')){setResult({success:false,message:'Please select a .qsp Quelea file'});return}
    setImporting(true);setResult(null)
    try{
      const ab=await file.arrayBuffer()
      const u8=new Uint8Array(ab)
      let bin='';for(let i=0;i<u8.length;i++)bin+=String.fromCharCode(u8[i])
      const b64=btoa(bin)
      const r=await api.importQSP(b64,qspLang)
      if(r.success){
        const msg=`Quelea import — ${r.counts.songs} songs added${r.skipped>0?`, ${r.skipped} duplicates skipped`:''}`
        setResult({success:true,message:msg});notify(`QSP: ${r.counts.songs} songs imported`)
      }else setResult({success:false,message:r.error||'QSP import failed'})
    }catch(e:any){setResult({success:false,message:e.message})}
    setImporting(false)
  }

  function onDrop(e:React.DragEvent){
    e.preventDefault();setDragOver(false)
    const f=e.dataTransfer.files[0];if(!f)return
    const lower=f.name.toLowerCase()
    if(lower.endsWith('.qsp'))handleQSP(f)
    else handleJson(f)
  }

  return (
    <div style={{flex:1,padding:36,overflowY:'auto',background:C.tex1,display:'flex',flexDirection:'column',gap:20,maxWidth:560}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Import Data</div>
      <div style={{display:'flex',gap:4,background:C.tex3,padding:4,borderRadius:10,border:`1px solid ${C.b1}`}}>
        {(['json','qsp'] as const).map(m=>(
          <button key={m} onClick={()=>{setMode(m);setResult(null)}} style={{flex:1,padding:'9px 0',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:7,background:mode===m?C.bg5:'none',border:`1px solid ${mode===m?C.b2:'transparent'}`,color:mode===m?C.t1:C.t3}}>
            {m==='json'?'ShogunOS Backup (.json)':'Quelea Song Pack (.qsp)'}
          </button>
        ))}
      </div>
      {mode==='qsp'&&(
        <div style={{padding:'12px 16px',background:`color-mix(in srgb, ${C.p1} 7%, transparent)`,border:`1px solid color-mix(in srgb, ${C.p1} 27%, transparent)`,borderRadius:10}}>
          <div style={{fontSize:11,color:C.p2,fontWeight:700,marginBottom:4}}>Quelea Song Pack Import</div>
          <div style={{fontSize:12,color:C.t3,lineHeight:1.6,marginBottom:12}}>In Quelea, go to <strong style={{color:C.t2}}>Database → Export → Song Pack (.qsp)</strong>, then drop the file below.</div>
          <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase' as const,display:'block',marginBottom:6}}>Tag all songs in this pack as</label>
          <select value={qspLang} onChange={e=>setQspLang(e.target.value)}
            style={{width:'100%',background:C.tex4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}}>
            {QSP_LANGS.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <div style={{fontSize:10,color:C.t4,marginTop:6,lineHeight:1.5}}>Quelea song packs don't store a language, so pick the one that matches this pack — it'll be used to group these songs in the Hymnal and My Songs views.</div>
        </div>
      )}
      <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop} onClick={()=>mode==='qsp'?qspRef.current?.click():fileRef.current?.click()}
        style={{border:`2px dashed ${dragOver?C.p1:C.b1}`,background:dragOver?`color-mix(in srgb, ${C.p1} 3%, transparent)`:C.tex2,borderRadius:12,padding:'40px 24px',textAlign:'center',cursor:'pointer',transition:'all 0.15s'}}>
        <div style={{fontSize:28,marginBottom:10,opacity:0.4}}>{mode==='qsp'?'🎵':'📂'}</div>
        <div style={{fontSize:14,color:dragOver?C.p2:C.t2,fontWeight:600,marginBottom:4}}>{importing?'Importing…':mode==='qsp'?'Drop your .qsp file':'Drop your backup file'}</div>
        <div style={{fontSize:11,color:C.t4}}>or click to browse</div>
      </div>
      <input ref={fileRef} type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(f)handleJson(f);e.target.value=''}} style={{display:'none'}}/>
      <input ref={qspRef} type="file" accept=".qsp" onChange={e=>{const f=e.target.files?.[0];if(f)handleQSP(f);e.target.value=''}} style={{display:'none'}}/>
      {result&&(
        <div style={{padding:'14px 18px',background:result.success?`color-mix(in srgb, ${C.safe} 6%, transparent)`:`color-mix(in srgb, ${C.live} 6%, transparent)`,border:`1px solid ${result.success?C.safe:C.live}44`,borderRadius:10}}>
          <div style={{fontSize:12,color:result.success?C.safe:C.live,fontWeight:600}}>{result.success?'✓ ':'✗ '}{result.message}</div>
        </div>
      )}
    </div>
  )
}

function DisplaySettingsTab({ settings, onChange, notify }: { settings:DisplaySettings; onChange:(s:DisplaySettings)=>void; notify:(m:string)=>void }) {
  function set(k:keyof DisplaySettings,v:any){onChange({...settings,[k]:v})}
  const lbl: React.CSSProperties = {fontSize:10,color:C.t3,fontWeight:600,marginBottom:6,display:'block',letterSpacing:'0.05em',textTransform:'uppercase' as const}
  const inp: React.CSSProperties = {width:'100%',background:C.tex4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}

  const FONTS = [
    // Serif — classic worship feel
    { label:'Georgia',             value:'Georgia, serif'                           },
    { label:'Lora',                value:"'Lora', serif"                            },
    { label:'Playfair Display',    value:"'Playfair Display', serif"                },
    { label:'EB Garamond',         value:"'EB Garamond', serif"                     },
    { label:'Cormorant Garamond',  value:"'Cormorant Garamond', serif"              },
    { label:'Libre Baskerville',   value:"'Libre Baskerville', serif"               },
    { label:'Source Serif 4',      value:"'Source Serif 4', serif"                  },
    { label:'Palatino',            value:"'Palatino Linotype', Palatino, serif"     },
    { label:'Times New Roman',     value:"'Times New Roman', serif"                 },
    { label:'Garamond',            value:'Garamond, serif'                          },
    // Sans — clean modern projection
    { label:'Inter',               value:"'Inter', sans-serif"                      },
    { label:'Raleway',             value:"'Raleway', sans-serif"                    },
    { label:'Montserrat',          value:"'Montserrat', sans-serif"                 },
    { label:'Open Sans',           value:"'Open Sans', sans-serif"                  },
    { label:'Nunito',              value:"'Nunito', sans-serif"                     },
    { label:'Lato',                value:"'Lato', sans-serif"                       },
    { label:'Helvetica',           value:"'Helvetica Neue', Helvetica, sans-serif"  },
    { label:'Trebuchet MS',        value:"'Trebuchet MS', sans-serif"               },
    { label:'Verdana',             value:'Verdana, sans-serif'                      },
    // Display / Decorative
    { label:'Cinzel',              value:"'Cinzel', serif"                          },
    { label:'Cinzel Decorative',   value:"'Cinzel Decorative', serif"               },
    { label:'Uncial Antiqua',      value:"'Uncial Antiqua', serif"                  },
    { label:'MedievalSharp',       value:"'MedievalSharp', serif"                   },
    { label:'Impact',              value:'Impact, fantasy'                          },
    // Monospace
    { label:'Courier New',         value:"'Courier New', monospace"                 },
  ]

  // Inject Google Fonts once
  React.useEffect(()=>{
    const id='shogun-gfonts'
    if(document.getElementById(id))return
    const families=[
      'Lora','Playfair+Display','EB+Garamond','Cormorant+Garamond',
      'Libre+Baskerville','Source+Serif+4','Inter','Raleway','Montserrat',
      'Open+Sans','Nunito','Lato','Cinzel','Cinzel+Decorative','Uncial+Antiqua'
    ].join('|')
    const link=document.createElement('link')
    link.id=id; link.rel='stylesheet'
    link.href=`https://fonts.googleapis.com/css2?family=${families}&display=swap`
    document.head.appendChild(link)
  },[])

  async function handleSave(){
    try{
      await(window as any).shogunos.saveDisplaySettings(settings)
      notify('Display settings saved')
    }catch{notify('Failed to save settings')}
  }

  return (
    <div style={{flex:1,padding:32,overflowY:'auto',background:C.tex1,display:'flex',flexDirection:'column',gap:20,maxWidth:520}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Display Settings</div>
      <div style={{fontSize:12,color:C.t3,lineHeight:1.6,padding:'12px 16px',background:C.tex3,borderRadius:10,border:`1px solid ${C.b1}`}}>These settings apply to hymns and Bible verses sent live. Slides use their own individual settings.</div>

      <div style={{padding:'16px',background:settings.highVisibility?`color-mix(in srgb, ${C.warn} 10%, transparent)`:C.bg3,border:`1px solid ${settings.highVisibility?C.warn:C.b1}`,borderRadius:10,display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.t1}}>☀ Sunlight Mode</div>
            <div style={{fontSize:10,color:C.t3,marginTop:2,maxWidth:340,lineHeight:1.5}}>Maximizes contrast for rooms fighting daylight glare on the projector — a bright, high-contrast, bold-weight look with no background image. This can't add brightness a projector doesn't have, but it's the closest software gets to fighting a washed-out screen.</div>
          </div>
          <div onClick={()=>set('highVisibility',!settings.highVisibility)} style={{width:44,height:24,borderRadius:12,background:settings.highVisibility?C.warn:C.b2,position:'relative',cursor:'pointer',flexShrink:0,transition:'background 0.15s'}}>
            <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:settings.highVisibility?23:3,transition:'left 0.15s'}}/>
          </div>
        </div>
        {settings.highVisibility && (
          <div>
            <label style={lbl}>Polarity</label>
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>set('highVisibilityInvert',false)} style={{flex:1,padding:'8px 0',fontSize:10,fontWeight:700,border:`1px solid ${!settings.highVisibilityInvert?C.warn:C.b1}`,color:!settings.highVisibilityInvert?C.warn:C.t3,background:!settings.highVisibilityInvert?`color-mix(in srgb, ${C.warn} 10%, transparent)`:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:6}}>Black on White</button>
              <button onClick={()=>set('highVisibilityInvert',true)} style={{flex:1,padding:'8px 0',fontSize:10,fontWeight:700,border:`1px solid ${settings.highVisibilityInvert?C.warn:C.b1}`,color:settings.highVisibilityInvert?C.warn:C.t3,background:settings.highVisibilityInvert?`color-mix(in srgb, ${C.warn} 10%, transparent)`:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:6}}>White on Black</button>
            </div>
            <div style={{fontSize:9,color:C.t4,marginTop:6,lineHeight:1.5}}>Black-on-white usually reads best in bright rooms — a projector's "black" is never fully dark, so a light background hides that better than a dark one.</div>
          </div>
        )}
      </div>
      <div>
        <label style={lbl}>Background Color</label>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
          <input type="color" value={settings.bgColor} onChange={e=>set('bgColor',e.target.value)} style={{width:40,height:36,border:`1px solid ${C.b2}`,borderRadius:8,background:'none',cursor:'pointer'}}/>
          <input style={{...inp,width:110}} value={settings.bgColor} onChange={e=>set('bgColor',e.target.value)}/>
        </div>
        <div style={{display:'flex',gap:4}}>
          {['#000000','#0a0814','#140a0a','#0a0a14','#060609','#111111','#1a0a2e','#0a1a2e'].map(c=>(
            <div key={c} onClick={()=>set('bgColor',c)} style={{width:28,height:28,background:c,border:`1px solid ${settings.bgColor===c?C.g2:C.b2}`,borderRadius:5,cursor:'pointer'}}/>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Background Image</label>
        {settings.bgImage
          ?<div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{width:80,height:48,backgroundImage:`url(${settings.bgImage})`,backgroundSize:'cover',borderRadius:8,border:`1px solid ${C.b2}`}}/>
            <button onClick={()=>set('bgImage',null)} style={{padding:'7px 12px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:12,cursor:'pointer',fontFamily:'inherit',borderRadius:7}}>Remove</button>
          </div>
          :<button onClick={()=>{
            const i=document.createElement('input');i.type='file';i.accept='image/*'
            i.onchange=(e:any)=>{
              const f=e.target.files[0];if(!f)return
              const r=new FileReader()
              r.onload=async(ev:any)=>{
                try{
                  const ab=ev.target.result as ArrayBuffer
                  const u8=new Uint8Array(ab)
                  let bin='';for(let j=0;j<u8.length;j++)bin+=String.fromCharCode(u8[j])
                  const b64=btoa(bin)
                  const ext='.'+(f.name.split('.').pop()||'png').toLowerCase()
                  const res=await (window as any).shogunos.saveSlideBgImage(b64,ext)
                  if(res.success)set('bgImage',res.path)
                  else notify('Failed to set background image')
                }catch{notify('Failed to set background image')}
              }
              r.readAsArrayBuffer(f)
            }
            i.click()
          }} style={{width:'100%',padding:'11px 0',background:'none',border:`1px dashed ${C.b2}`,color:C.t3,fontSize:12,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>Choose Image...</button>
        }
      </div>
      <div>
        <label style={lbl}>Text Color</label>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
          <input type="color" value={settings.fontColor} onChange={e=>set('fontColor',e.target.value)} style={{width:40,height:36,border:`1px solid ${C.b2}`,borderRadius:8,background:'none',cursor:'pointer'}}/>
          <input style={{...inp,width:110}} value={settings.fontColor} onChange={e=>set('fontColor',e.target.value)}/>
        </div>
        <div style={{display:'flex',gap:4}}>
          {['#ffffff','#f8f4e8','#f59e0b','#a78bfa','#7dd3fc','#86efac','#ff2e63','#6fe8ff','#b967ff'].map(c=>(
            <div key={c} onClick={()=>set('fontColor',c)} style={{width:28,height:28,background:c,border:`1px solid ${settings.fontColor===c?C.g2:C.b2}`,borderRadius:5,cursor:'pointer'}}/>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Font Family</label>
        <div style={{fontSize:10.5,color:C.t4,marginBottom:8,lineHeight:1.5}}>These styles are fetched the first time you're online, then cached for offline use. Without that first connection, slides fall back to your system's default font.</div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {FONTS.map(f=>(
            <div key={f.value} onClick={()=>set('fontFamily',f.value)}
              style={{padding:'9px 14px',borderRadius:8,border:`1px solid ${settings.fontFamily===f.value?C.p1:C.b1}`,background:settings.fontFamily===f.value?`color-mix(in srgb, ${C.p1} 9%, transparent)`:C.bg3,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',transition:'all 0.1s'}}>
              <span style={{fontSize:14,fontFamily:f.value,color:settings.fontFamily===f.value?C.t1:C.t2}}>{f.label}</span>
              <span style={{fontSize:10,fontFamily:f.value,color:C.t4,fontStyle:'italic'}}>Amazing Grace</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Font Size — {settings.fontSize}px</label>
        <input type="range" min={20} max={96} value={settings.fontSize} onChange={e=>set('fontSize',parseInt(e.target.value))} style={{width:'100%',accentColor:C.p1,marginBottom:8}}/>
        <div style={{display:'flex',gap:4}}>
          {[24,32,40,48,56,64,72].map(sz=>(
            <button key={sz} onClick={()=>set('fontSize',sz)} style={{flex:1,padding:'5px 0',fontSize:9,fontWeight:700,border:`1px solid ${settings.fontSize===sz?C.g2:C.b1}`,color:settings.fontSize===sz?C.g2:C.t3,background:settings.fontSize===sz?`color-mix(in srgb, ${C.g2} 7%, transparent)`:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:5}}>{sz}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Alignment</label>
        <div style={{display:'flex',gap:4}}>
          {(['left','center','right'] as const).map(a=>(
            <button key={a} onClick={()=>set('textAlign',a)} style={{flex:1,padding:'10px 0',fontSize:15,border:`1px solid ${settings.textAlign===a?C.g2:C.b1}`,color:settings.textAlign===a?C.g2:C.t3,background:settings.textAlign===a?`color-mix(in srgb, ${C.g2} 7%, transparent)`:'none',cursor:'pointer',borderRadius:7}}>
              {a==='left'?'⫷':a==='center'?'≡':'⫸'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Panel Border — {settings.borderWidth}px</label>
        <input type="range" min={0} max={20} value={settings.borderWidth} onChange={e=>set('borderWidth',parseInt(e.target.value))} style={{width:'100%',accentColor:C.p1,marginBottom:8}}/>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
          <input type="color" value={settings.borderColor} onChange={e=>set('borderColor',e.target.value)} style={{width:40,height:36,border:`1px solid ${C.b2}`,borderRadius:8,background:'none',cursor:'pointer'}}/>
          <input style={{...inp,width:110}} value={settings.borderColor} onChange={e=>set('borderColor',e.target.value)}/>
          <select value={settings.borderStyle} onChange={e=>set('borderStyle',e.target.value)} style={{...inp,flex:1}}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </div>
        <label style={lbl}>Corner Radius — {settings.borderRadius}px</label>
        <input type="range" min={0} max={60} value={settings.borderRadius} onChange={e=>set('borderRadius',parseInt(e.target.value))} style={{width:'100%',accentColor:C.p1}}/>
      </div>
      <div>
        <label style={lbl}>Preview</label>
        {(() => {
          const hv = settings.highVisibility
          const effBg = hv ? (settings.highVisibilityInvert ? '#000000' : '#ffffff') : settings.bgColor
          const effFont = hv ? (settings.highVisibilityInvert ? '#ffffff' : '#000000') : settings.fontColor
          const effWeight = hv ? 900 : 300
          return (
            <div style={{aspectRatio:'16/9',borderRadius:10,overflow:'hidden',border:`1px solid ${C.b1}`,background:effBg,display:'flex',alignItems:'center',justifyContent:'center',padding:16,position:'relative',
              backgroundImage:(!hv && settings.bgImage)?`url(${settings.bgImage})`:undefined,backgroundSize:'cover',backgroundPosition:'center'}}>
              {!hv && settings.bgImage&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.3)'}}/>}
              <div style={{position:'relative',zIndex:1,fontSize:settings.fontSize*0.22,color:effFont,textAlign:settings.textAlign,fontFamily:settings.fontFamily,fontWeight:effWeight,lineHeight:1.6,
                WebkitTextStroke:hv?`0.4px ${effFont}`:undefined,
                padding:settings.borderWidth?14:0,
                border:settings.borderWidth?`${settings.borderWidth}px ${settings.borderStyle} ${settings.borderColor}`:'none',
                borderRadius:settings.borderRadius} as any}>
                "Amazing grace! How sweet the sound<br/>That saved a wretch like me!"
              </div>
            </div>
          )
        })()}
      </div>
      <button className="glass-primary" onClick={handleSave} style={{padding:'12px 0',background:`linear-gradient(135deg,${C.p1},${C.g1})`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.05em'}}>Save Settings</button>
    </div>
  )
}

// The header clock used to be App-level state ticking every second with
// setInterval, which meant App — and every heavy child reachable from its
// render tree, including whichever library/present tab was currently mounted
// (e.g. thousands of song list rows) — re-rendered once a second regardless
// of what was on screen. React re-runs a function component's body on every
// parent re-render unless that component is isolated, so a list of a few
// thousand rows with fresh inline style objects each time is real, continuous
// CPU work — enough to visibly compete with (and delay) whatever click the
// person actually made, which is what read as "lag when navigating." Giving
// the clock its own component with its own state means only this one small
// element re-renders each tick; everything else stops paying that tax.
function Clock() {
  const [clock, setClock] = useState('')
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])
  return <div style={{fontSize:12,color:C.t2,fontVariantNumeric:'tabular-nums',minWidth:50,textAlign:'right',paddingLeft:20,paddingRight:24,borderLeft:`1px solid ${C.b0}`,height:'100%',display:'flex',alignItems:'center',fontFamily:"'IBM Plex Mono',monospace",fontWeight:600}}>{clock}</div>
}

export default function App() {
  const [showSplash,setShowSplash]       = useState(true)
  const [currentUser,setCurrentUser]     = useState<{display_name:string}|null>(null)
  const [navGroup,setNavGroup]           = useState<NavGroup>('library')
  const [queueCollapsed,setQueueCollapsed] = useState(false)
  const [libTab,setLibTab]               = useState<LibTab>('hymnal')
  const [presentTab,setPresentTab]       = useState<PresentTab>('slides')
  const [settingsTab,setSettingsTab]     = useState<SettingsTab>('display')
  const [query,setQuery]                 = useState('')
  const [bibleQuery,setBibleQuery]       = useState('')
  const [bibleVersion,setBibleVersion]   = useState('KJV')
  const [availableVersions,setAvailableVersions] = useState<string[]>(['KJV'])
  const [results,setResults]             = useState<Song[]>([])
  const [allSongs,setAllSongs]           = useState<Song[]>([])

  // Grouping/filtering thousands of hymns by language used to happen inline
  // in the render function, which reran on every App re-render — including
  // the once-a-second clock tick — regardless of which tab was even open.
  // With 20+ hymnal languages that's a real, continuous cost. Memoizing it
  // means this only recomputes when the songs or search term actually change.
  const hymnSearchFiltered = useMemo(
    () => query.trim().length>0 ? results : allSongs,
    [query, results, allSongs]
  )
  const hymnLangsMemo = useMemo(
    () => Array.from(new Set(allSongs.map(hymnGroupKey)))
      .sort((a,b)=>HYMN_GROUP_ORDER.indexOf(a)-HYMN_GROUP_ORDER.indexOf(b)),
    [allSongs]
  )
  const hymnByLangMemo = useMemo(() => {
    const acc: Record<string,Song[]> = {}
    for (const key of hymnLangsMemo) acc[key] = hymnSearchFiltered.filter(s=>hymnGroupKey(s)===key)
    return acc
  }, [hymnLangsMemo, hymnSearchFiltered])
  const [bibleResults,setBibleResults]   = useState<BibleVerse[]>([])
  const [selected,setSelected]           = useState<Song|null>(null)
  const [selectedVerse,setSelectedVerse] = useState<BibleVerse|null>(null)
  const [sections,setSections]           = useState<Section[]>([])
  const [currentSection,setCurrentSection] = useState(0)
  const [live,setLive]                   = useState<string|null>(null)
  const [displays,setDisplays]           = useState<Display[]>([])
  const [selectedDisplay,setSelectedDisplay] = useState<number|undefined>(undefined)
  const [dailyVerse,setDailyVerse]       = useState<DailyVerse|null>(null)
  const [queue,setQueue]                 = useState<QueueItem[]>([])
  const [blankScreen,setBlankScreen]     = useState(false)
  const [showShortcuts,setShowShortcuts] = useState(false)
  const [toast,setToast]                 = useState('')
  const [displaySettings,setDisplaySettings] = useState<DisplaySettings>({bgColor:'#000000',bgImage:null,fontColor:'#ffffff',fontSize:52,textAlign:'center',fontFamily:'Georgia, serif',borderWidth:0,borderColor:'#ffffff',borderStyle:'solid',borderRadius:0,highVisibility:false,highVisibilityInvert:false,icon:null,iconColor:'#ffffff',iconSize:64,iconPos:'top-center'})
  const toastTimer = useRef<any>(null)
  // Bible chapter browser state
  const [hymnLangFilter,setHymnLangFilter] = useState<string>('all')
  const [expandedHymnLangs,setExpandedHymnLangs] = useState<Record<string,boolean>>({})
  const [bibleMode,setBibleMode]         = useState<'search'|'browse'>('browse')
  const [bibleBooks,setBibleBooks]       = useState<string[]>([])
  const [selectedBook,setSelectedBook]   = useState<string|null>(null)
  const [bibleChapters,setBibleChapters] = useState<number[]>([])
  const [selectedChapter,setSelectedChapter] = useState<number|null>(null)
  const [chapterVerses,setChapterVerses] = useState<BibleVerse[]>([])
  const [loadingChapter,setLoadingChapter] = useState(false)
  // Drag-and-drop queue state
  const [draggedQueueIdx,setDraggedQueueIdx] = useState<number|null>(null)
  const [queueDragOver,setQueueDragOver]     = useState(false)
  const [showDailyPopup,setShowDailyPopup]   = useState(false)
  const [showTimerModal,setShowTimerModal]   = useState(false)
  const [timerMinutes,setTimerMinutes]       = useState(5)
  const [timerLabel,setTimerLabel]           = useState('Service starts in')
  const [previewDragOver,setPreviewDragOver] = useState(false)
  const [liveDragOver,setLiveDragOver]       = useState(false)

  // ── KEYBOARD SHORTCUTS ──────────────────────────────────────────────────
  // Operator shortcuts for running a live service without reaching for the
  // mouse. Disabled while typing in any field so search/inputs work normally.
  useEffect(()=>{
    function isTypingTarget(el: EventTarget | null){
      if(!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||el.isContentEditable
    }
    function onKeyDown(e: KeyboardEvent){
      if(isTypingTarget(e.target)) return
      if(e.metaKey||e.ctrlKey||e.altKey) return // leave OS/app-level shortcuts alone
      switch(e.key){
        case ' ':
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          if(sections.length){ e.preventDefault(); handleSectionClick(Math.min(currentSection+1,sections.length-1)) }
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          if(sections.length){ e.preventDefault(); handleSectionClick(Math.max(currentSection-1,0)) }
          break
        case 'Enter': {
          e.preventDefault()
          const sec=sections[currentSection]
          if(sec) goLive(selected?.title||'',sec.content)
          else if(selectedVerse) goLive(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`,selectedVerse.text)
          break
        }
        case 'b': case 'B':
          e.preventDefault(); handleBlank()
          break
        case 'Escape':
          e.preventDefault()
          if(showDailyPopup) setShowDailyPopup(false)
          else if(showShortcuts) setShowShortcuts(false)
          else handleClear()
          break
        case '?':
          e.preventDefault(); setShowShortcuts(s=>!s)
          break
      }
    }
    window.addEventListener('keydown',onKeyDown)
    return ()=>window.removeEventListener('keydown',onKeyDown)
  },[sections,currentSection,selected,selectedVerse,showDailyPopup,showShortcuts])

  // ── Resizable panels (Library / Preview / Live) — Quelea-style draggable dividers ──
  const bodyRef       = useRef<HTMLDivElement>(null)
  const leftColRef     = useRef<HTMLDivElement>(null)
  const previewColRef  = useRef<HTMLDivElement>(null)
  const [leftWidth,setLeftWidth]       = useState<number>(()=>{
    try{ const v=localStorage.getItem('shogun_left_width'); return v?parseInt(v):340 }catch{return 340}
  })
  const [previewWidth,setPreviewWidth] = useState<number|null>(()=>{
    try{ const v=localStorage.getItem('shogun_preview_width'); return v?parseInt(v):null }catch{return null}
  })
  const [theme,setTheme] = useState<'light'|'dark'>(()=>{
    try{ return (localStorage.getItem('shogun_theme') as 'light'|'dark') || 'dark' }catch{ return 'dark' }
  })
  useEffect(()=>{
    document.documentElement.setAttribute('data-theme',theme)
    try{ localStorage.setItem('shogun_theme',theme) }catch{}
  },[theme])

  function beginResize(kind:'left'|'preview',e:React.MouseEvent){
    e.preventDefault()
    const leftEl=leftColRef.current, previewEl=previewColRef.current
    if(!leftEl||!previewEl)return
    const startX=e.clientX
    const startLeftW=leftEl.getBoundingClientRect().width
    const startPreviewW=previewEl.getBoundingClientRect().width
    document.body.style.cursor='col-resize'
    document.body.style.userSelect='none'

    function onMove(ev:MouseEvent){
      const dx=ev.clientX-startX
      if(kind==='left'){
        const next=Math.min(1000,Math.max(240,startLeftW+dx))
        leftEl!.style.width=next+'px'
      }else{
        const next=Math.max(240,startPreviewW+dx)
        previewEl!.style.width=next+'px'
        previewEl!.style.flex='0 0 auto'
      }
    }
    function onUp(){
      window.removeEventListener('mousemove',onMove)
      window.removeEventListener('mouseup',onUp)
      document.body.style.cursor=''
      document.body.style.userSelect=''
      if(kind==='left'){
        const w=leftEl!.getBoundingClientRect().width
        setLeftWidth(w)
        try{localStorage.setItem('shogun_left_width',String(Math.round(w)))}catch{}
      }else{
        const w=previewEl!.getBoundingClientRect().width
        setPreviewWidth(w)
        try{localStorage.setItem('shogun_preview_width',String(Math.round(w)))}catch{}
      }
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
  }
  function resetResize(kind:'left'|'preview'){
    if(kind==='left'){ setLeftWidth(340); try{localStorage.removeItem('shogun_left_width')}catch{} }
    else{ setPreviewWidth(null); try{localStorage.removeItem('shogun_preview_width')}catch{} }
  }
  const dividerStyle=(): React.CSSProperties=>({width:6,flexShrink:0,cursor:'col-resize',background:'transparent',position:'relative',zIndex:2})

  useEffect(()=>{
    if(showSplash)return
    async function load(){
      const d=await(window as any).shogunos.getDisplays()
      setDisplays(d);setSelectedDisplay(d.find((x:Display)=>!x.isPrimary)?.id ?? d[0]?.id)
      setDailyVerse(await(window as any).shogunos.getDailyVerse())
      const q=await(window as any).shogunos.getServiceQueue()
      setQueue(q.map((x:any)=>({id:String(x.id),title:x.title,type:x.type})))
      try{const v=await(window as any).shogunos.getBibleTranslations();if(v?.length)setAvailableVersions(v)}catch{}
      // Load saved display settings
      try{const ds=await(window as any).shogunos.getDisplaySettings();if(ds)setDisplaySettings(s=>({...s,...ds}))}catch{}
      // Load all hymns for default browse view
      try{const all=await(window as any).shogunos.searchSongs('');setAllSongs(all.sort((a:Song,b:Song)=>(a.hymn_number||9999)-(b.hymn_number||9999)))}catch{}
      // Load bible books for chapter browser
      try{const books=await(window as any).shogunos.getBibleBooks('KJV');setBibleBooks(books)}catch{}
    }
    load()
  },[showSplash])

  // ── DISPLAY HOTPLUG ──────────────────────────────────────────────────────
  // If a projector/monitor is connected (or disconnected) after the app has
  // already loaded, refresh the list and, if the previously-selected display
  // no longer exists, re-pick a genuine external one instead of silently
  // falling back to whatever display index used to be at that slot.
  useEffect(()=>{
    if(showSplash)return
    ;(window as any).shogunos.onDisplaysChanged((d:Display[])=>{
      setDisplays(d)
      setSelectedDisplay(cur=>{
        if(cur!=null && d.some(x=>x.id===cur)) return cur
        return d.find(x=>!x.isPrimary)?.id ?? d[0]?.id
      })
    })
  },[showSplash])

  // ── REMOTE CONTROL: push state out ──────────────────────────────────────
  // The main process caches whatever we send here and answers phone polls
  // from that cache, so this doesn't need to be fast — just current.
  useEffect(()=>{
    if(showSplash)return
    ;(window as any).shogunos.pushRemoteState({
      live, blankScreen,
      currentSection, totalSections: sections.length,
      sectionPreview: (sections[currentSection]?.content || selectedVerse?.text || '').slice(0,240),
      queue,
      // The text preview box on the remote page falls back to this (colors +
      // font) whenever a real screenshot isn't available yet — e.g. right
      // after connecting, or if capturing the live window ever fails.
      style: { bgColor: displaySettings.bgColor, fontColor: displaySettings.fontColor, fontSize: displaySettings.fontSize, textAlign: displaySettings.textAlign, fontFamily: displaySettings.fontFamily },
    })
  },[showSplash,live,blankScreen,currentSection,sections,selectedVerse,queue,displaySettings])

  // ── REMOTE CONTROL: receive commands ────────────────────────────────────
  // Mirrors the keyboard shortcuts above (Space/Arrows/B/Escape) so a phone
  // behaves exactly like an operator standing at the booth. Previously this
  // only wired up next/prev/blank/clear/queue-go — the remote page could
  // already *send* song-live/media-live/announce/queue-remove/queue-move
  // (see remote-server.ts), but nothing here was listening for them, so
  // opening a hymn, sending an announcement, or reordering the queue from a
  // phone silently did nothing. All of those are handled now, plus the new
  // verse-live/queue-add actions for Scripture control and add-to-queue.
  useEffect(()=>{
    (window as any).shogunos.onRemoteCommand(async (data:any)=>{
      const {action,id,dir,text}=data
      if(action==='next'&&sections.length) handleSectionClick(Math.min(currentSection+1,sections.length-1))
      else if(action==='prev'&&sections.length) handleSectionClick(Math.max(currentSection-1,0))
      else if(action==='blank') handleBlank()
      else if(action==='clear') handleClear()
      else if(action==='queue-go'&&id) goLiveFromQueueItem(id)
      else if(action==='queue-remove'&&id) removeFromQueue(id)
      else if(action==='queue-add'&&data.title) addToQueue(data.title,data.itemType||'song')
      else if(action==='queue-move'&&id&&dir){
        const idx=queue.findIndex(q=>q.id===id)
        const swapWith=dir==='up'?idx-1:idx+1
        if(idx===-1||swapWith<0||swapWith>=queue.length) return
        const next=[...queue]
        ;[next[idx],next[swapWith]]=[next[swapWith],next[idx]]
        reorderQueueItems(next)
      }
      else if(action==='announce'&&text) goLive('Announcement',text)
      else if(action==='song-live'){
        const song:Song={id:data.songId,title:data.title,hymn_number:0,source:'hymnal',language:''}
        setSelected(song);setSections(data.sections||[]);setCurrentSection(data.index||0)
        goLive(data.title,data.sections?.[data.index]?.content||'')
      }
      else if(action==='media-live'){
        setLive(data.title);setBlankScreen(false)
        await (window as any).shogunos.goLiveMedia({type:data.mediaType,filePath:data.filePath,title:data.title,loop:false,muted:false,fitMode:'contain'})
      }
      else if(action==='verse-live'){
        setSelectedVerse({id:0,book:data.book,chapter:data.chapter,verse:data.verseNum,text:data.text,version:data.version||bibleVersion} as BibleVerse)
        goLive(`${data.book} ${data.chapter}:${data.verseNum}`,data.text)
      }
    })
  },[sections,currentSection,queue,bibleVersion])

  async function goLiveFromQueueItem(id:string){
    const item = queue.find(q=>q.id===id)
    if(!item) return
    if(item.type==='verse'){
      const ref = parseVerseRef(item.title)
      const v = ref ? await (window as any).shogunos.getBibleVerse(ref.book,ref.chapter,ref.verse,bibleVersion) : null
      if(v) goLive(`${v.book} ${v.chapter}:${v.verse}`,v.text)
    } else {
      const songs = await (window as any).shogunos.searchSongs(item.title)
      if(songs&&songs.length>0){
        const song = songs[0]
        const secs = await (window as any).shogunos.getSongSections(song.id)
        if(secs.length>0) goLive(song.title,secs[0].content)
      }
    }
  }

  if(showSplash) return <Splash onDone={user=>{setCurrentUser(user);setShowSplash(false)}}/>

  async function handleSearch(val:string){
    setQuery(val)
    if(val.trim().length<1){setResults([]);return}
    const q=val.trim().toLowerCase()
    // Accept a bare number ("32"), a zero-padded number ("032"), or a
    // "#32"/"no. 32"/"hymn 32" style query as a hymn-number lookup, in
    // addition to the existing title-text search.
    const numMatch=q.match(/^(?:#|no\.?\s*|hymn\s*)?0*(\d+)$/)
    const asNumber=numMatch?parseInt(numMatch[1],10):null
    setResults(allSongs.filter(s=>
      s.title.toLowerCase().includes(q) ||
      (asNumber!=null && s.hymn_number===asNumber) ||
      String(s.hymn_number||'').includes(q)
    ))
  }

  async function handleBibleSearch(val:string){
    setBibleQuery(val)
    if(val.trim().length<2){setBibleResults([]);return}
    setBibleResults(await(window as any).shogunos.searchBible(val,bibleVersion))
  }

  async function handleBookSelect(book:string){
    setSelectedBook(book);setSelectedChapter(null);setChapterVerses([]);setSelectedVerse(null)
    const chs=await(window as any).shogunos.getBibleChapters(book,bibleVersion)
    setBibleChapters(chs)
  }

  async function handleChapterSelect(ch:number){
    setSelectedChapter(ch);setSelectedVerse(null);setLoadingChapter(true)
    const verses=await(window as any).shogunos.getBibleChapterVerses(selectedBook,ch,bibleVersion)
    setChapterVerses(verses);setLoadingChapter(false)
  }

  async function handleSelectSong(song:Song){
    setSelected(song);setCurrentSection(0);setSelectedVerse(null)
    setSections(await(window as any).shogunos.getSongSections(song.id))
  }

  // Every place that pushes content to the live window should include the
  // full display-settings payload (font, colors, border, and — critically —
  // bgImage). Building this in one place means a chosen background image
  // can't quietly get dropped from one call site while sticking on another,
  // which is what used to make it disappear the moment the operator clicked
  // to the next verse/section while live.
  function liveDisplayFields(overrides?: Partial<DisplaySettings>) {
    const s = { ...displaySettings, ...overrides }
    return { fontSize:s.fontSize, textAlign:s.textAlign, bgColor:s.bgColor, bgImage:s.bgImage, fontColor:s.fontColor, fontFamily:s.fontFamily, borderWidth:s.borderWidth, borderColor:s.borderColor, borderStyle:s.borderStyle, borderRadius:s.borderRadius, highVisibility:s.highVisibility, highVisibilityInvert:s.highVisibilityInvert, icon:s.icon, iconColor:s.iconColor, iconSize:s.iconSize, iconPos:s.iconPos }
  }

  async function goLive(title:string,lyrics:string,ds?:Partial<DisplaySettings>){
    const s={...displaySettings,...ds}
    setLive(title);setBlankScreen(false)
    await(window as any).shogunos.goLive({title,lyrics,displayId:selectedDisplay,...liveDisplayFields(ds)})
  }

  async function startCountdown(){
    const targetTime = Date.now() + timerMinutes*60000
    setLive(`⏱ ${timerLabel || 'Countdown'}`);setBlankScreen(false)
    await (window as any).shogunos.goLiveTimer({type:'timer',targetTime,label:timerLabel,displayId:selectedDisplay})
    setShowTimerModal(false)
  }

  async function handleSectionClick(i:number){
    setCurrentSection(i)
    if(live&&selected) await(window as any).shogunos.goLive({title:selected.title,lyrics:sections[i].content,displayId:selectedDisplay,...liveDisplayFields()})
  }

  async function handleClear(){setLive(null);setBlankScreen(false);await(window as any).shogunos.closeLive()}

  async function handleBlank(){
    const next=!blankScreen;setBlankScreen(next)
    if(next) await(window as any).shogunos.goLive({title:'',lyrics:'',displayId:selectedDisplay,bgColor:'#000000'})
    else if(live) await(window as any).shogunos.goLive({title:live,lyrics:sections[currentSection]?.content||'',displayId:selectedDisplay,...liveDisplayFields()})
    notify(next?'Screen blanked':'Screen restored')
  }

  async function sendScreenImage(){
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*'
    inp.onchange=(e:any)=>{
      const f=e.target.files[0];if(!f)return
      const r=new FileReader()
      r.onload=(ev:any)=>{(window as any).shogunos.goLive({title:'',lyrics:'',displayId:selectedDisplay,bgColor:'#000',bgImage:ev.target.result});notify('Image sent to screen')}
      r.readAsDataURL(f)
    }
    inp.click()
  }

  async function addToQueue(title:string,type:string){
    const item=await(window as any).shogunos.addToQueue(title,type)
    setQueue(q=>[...q,{id:String(item.id),title,type}])
    notify('Added to queue')
  }

  async function removeFromQueue(id:string){
    await(window as any).shogunos.removeFromQueue(Number(id))
    setQueue(q=>q.filter(x=>x.id!==id))
  }
  async function clearQueue(){await(window as any).shogunos.clearQueue();setQueue([])}

  async function reorderQueueItems(next:QueueItem[]){
    setQueue(next)
    await(window as any).shogunos.reorderQueue(next.map(x=>Number(x.id)))
  }

  // Drop a song/verse dragged from the library onto the queue
  function onQueueZoneDragOver(e:React.DragEvent){
    if(e.dataTransfer.types.includes(DRAG_MIME)){
      e.preventDefault();e.dataTransfer.dropEffect='copy';setQueueDragOver(true)
    }
  }
  function onQueueZoneDragLeave(){ setQueueDragOver(false) }
  async function onQueueZoneDrop(e:React.DragEvent){
    e.preventDefault();setQueueDragOver(false)
    const raw=e.dataTransfer.getData(DRAG_MIME)
    if(!raw)return
    try{ const {title,type}=JSON.parse(raw); await addToQueue(title,type) }catch{}
  }
  // Reordering existing queue items by dragging them over each other
  function onQueueItemDragStart(e:React.DragEvent,idx:number){
    e.dataTransfer.effectAllowed='move'
    e.dataTransfer.setData('application/x-queue-reorder',String(idx))
    setDraggedQueueIdx(idx)
  }
  function onQueueItemDragOver(e:React.DragEvent){
    if(e.dataTransfer.types.includes('application/x-queue-reorder')){
      e.preventDefault();e.dataTransfer.dropEffect='move'
    }else if(e.dataTransfer.types.includes(DRAG_MIME)){
      e.preventDefault();e.dataTransfer.dropEffect='copy';setQueueDragOver(true)
    }
  }
  async function onQueueItemDrop(e:React.DragEvent,idx:number){
    e.preventDefault();setQueueDragOver(false)
    if(e.dataTransfer.types.includes('application/x-queue-reorder')){
      const from=draggedQueueIdx
      setDraggedQueueIdx(null)
      if(from==null||from===idx)return
      const next=[...queue]
      const [moved]=next.splice(from,1)
      next.splice(idx,0,moved)
      await reorderQueueItems(next)
    }else{
      const raw=e.dataTransfer.getData(DRAG_MIME)
      if(!raw)return
      try{ const {title,type}=JSON.parse(raw); await addToQueue(title,type) }catch{}
    }
  }
  function onQueueItemDragEnd(){ setDraggedQueueIdx(null);setQueueDragOver(false) }

  // Preview panel drop — sets the preview without going live
  function onPreviewDragOver(e:React.DragEvent){
    if(e.dataTransfer.types.includes(DRAG_MIME)){e.preventDefault();e.dataTransfer.dropEffect='copy';setPreviewDragOver(true)}
  }
  function onPreviewDragLeave(){ setPreviewDragOver(false) }
  async function onPreviewDrop(e:React.DragEvent){
    e.preventDefault();setPreviewDragOver(false)
    const raw=e.dataTransfer.getData(DRAG_MIME); if(!raw)return
    try{
      const {title,type}=JSON.parse(raw)
      if(type==='verse'){
        // Bible verses carry their reference in the title, e.g. "John 3:16" — look it up
        // exactly rather than full-text searching (the reference string won't match any verse body).
        const ref=parseVerseRef(title)
        const v=ref?await(window as any).shogunos.getBibleVerse(ref.book,ref.chapter,ref.verse,bibleVersion):null
        if(v){
          setSelectedVerse(v)
          setSelected(null); setSections([]); setCurrentSection(0)
          notify(`Preview: ${v.book} ${v.chapter}:${v.verse}`)
        }
      } else {
        // Show in preview — find the song and set section
        const songs=await(window as any).shogunos.searchSongs(title)
        if(songs&&songs.length>0){
          const song=songs[0]
          setSelected(song)
          setSelectedVerse(null)
          const secs=await(window as any).shogunos.getSongSections(song.id)
          setSections(secs); if(secs.length>0)setSection(secs[0]); setCurrentSection(0)
        }
        notify(`Preview: ${title}`)
      }
    }catch{}
  }

  // Live panel drop — goes live immediately
  function onLiveDragOver(e:React.DragEvent){
    if(e.dataTransfer.types.includes(DRAG_MIME)){e.preventDefault();e.dataTransfer.dropEffect='copy';setLiveDragOver(true)}
  }
  function onLiveDragLeave(){ setLiveDragOver(false) }
  async function onLiveDrop(e:React.DragEvent){
    e.preventDefault();setLiveDragOver(false)
    const raw=e.dataTransfer.getData(DRAG_MIME); if(!raw)return
    try{
      const {title,type}=JSON.parse(raw)
      if(type==='verse'){
        // For bible verses the content is in the title string like "John 3:16" —
        // look it up exactly rather than full-text searching.
        const ref=parseVerseRef(title)
        const v=ref?await(window as any).shogunos.getBibleVerse(ref.book,ref.chapter,ref.verse,bibleVersion):null
        if(v)goLive(`${v.book} ${v.chapter}:${v.verse}`,v.text)
      } else {
        const songs=await(window as any).shogunos.searchSongs(title)
        if(songs&&songs.length>0){
          const song=songs[0]
          const secs=await(window as any).shogunos.getSongSections(song.id)
          if(secs.length>0)goLive(song.title,secs[0].content)
        }
      }
    }catch{}
  }

  function notify(msg:string){
    setToast(msg)
    if(toastTimer.current)clearTimeout(toastTimer.current)
    toastTimer.current=setTimeout(()=>setToast(''),2500)
  }

  const section=sections[currentSection]

  const NAV:[NavGroup,string,string][] = [
    ['library','Library','♫'],
    ['present','Present','▣'],
    ['media','Media','◈'],
    ['calendar','Calendar','暦'],
    ['service','Service','☰'],
    ['settings','Settings','⚙'],
  ]

  const activeSubId = navGroup==='library'?libTab:navGroup==='present'?presentTab:navGroup==='service'?'queue':navGroup==='media'?'media':navGroup==='calendar'?'calendar':settingsTab

  const renderContent = () => {
    if(navGroup==='media'){
      return <MediaTab goLive={(t,l,type,extra)=>{ (window as any).shogunos?.goLiveMedia?.(extra||{type:'image'}) }} notify={notify}/>
    }
    if(navGroup==='calendar'){
      return <CalendarTab notify={notify}/>
    }
    if(navGroup==='present'){
      if(presentTab==='slides') return <SlidesTab goLive={goLive} addToQueue={addToQueue} notify={notify}/>
      return <AnnounceTab goLive={(t,l)=>goLive(t,l)} notify={notify}/>
    }
    if(navGroup==='service'){
      return (
        <div onDragOver={onQueueZoneDragOver} onDragLeave={onQueueZoneDragLeave} onDrop={onQueueZoneDrop}
          style={{flex:1,padding:32,overflowY:'auto',background:C.tex1,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Service Queue — {queue.length} items</div>
            {queue.length>0&&<button onClick={clearQueue} style={{padding:'5px 12px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:6}}>Clear All</button>}
          </div>
          {queue.length===0&&(
            <div style={{padding:40,textAlign:'center',color:queueDragOver?C.p2:C.t4,fontSize:13,border:`1.5px dashed ${queueDragOver?C.p1:C.b1}`,borderRadius:12,background:queueDragOver?`color-mix(in srgb, ${C.p1} 5%, transparent)`:'transparent',transition:'all 0.15s'}}>
              {queueDragOver?'Drop to add to queue':'Queue is empty — drag a hymn or verse here, or add from Hymnal, Bible or Slides'}
            </div>
          )}
          {queue.map((item,i)=>{
            const typeMeta: Record<string,{icon:string;color:string;label:string}> = {
              song:  { icon:'music', color:C.g2,  label:'Song'  },
              verse: { icon:'book',  color:C.p1,  label:'Verse' },
              slide: { icon:'frame', color:C.gold,label:'Slide' },
            }
            const meta = typeMeta[item.type] || { icon:'frame', color:C.t3, label:item.type.toUpperCase() }
            return (
            <div key={item.id}
              draggable onDragStart={e=>onQueueItemDragStart(e,i)} onDragOver={onQueueItemDragOver} onDrop={e=>onQueueItemDrop(e,i)} onDragEnd={onQueueItemDragEnd}
              style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',background:i===0?C.bg3:C.tex2,borderRadius:10,border:`1px solid ${i===0?C.b2:C.b1}`,cursor:'grab',opacity:draggedQueueIdx===i?0.35:1,transition:'opacity 0.15s, border-color 0.15s, background 0.15s'}}
              onMouseEnter={e=>{if(i!==0)(e.currentTarget as HTMLElement).style.borderColor=C.b2}}
              onMouseLeave={e=>{if(i!==0)(e.currentTarget as HTMLElement).style.borderColor=C.b1}}>
              <span style={{color:C.t4,fontSize:13,opacity:0.6,flexShrink:0}}>⠿</span>
              <div style={{width:28,height:28,borderRadius:'50%',background:i===0?C.p1:C.bg4,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontSize:11,color:i===0?'#fff':C.t3,fontWeight:700}}>{i+1}</span>
              </div>
              <div style={{width:26,height:26,borderRadius:7,background:`color-mix(in srgb, ${meta.color} 14%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <SlideIcon id={meta.icon} color={meta.color} size={14}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.t1,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.title}</div>
                <div style={{fontSize:10,color:meta.color,marginTop:2,fontWeight:700,letterSpacing:'0.06em'}}>{meta.label.toUpperCase()}</div>
              </div>
              <button onClick={()=>removeFromQueue(item.id)} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18,padding:0,flexShrink:0}}>×</button>
            </div>
          )})}
        </div>
      )
    }
    if(navGroup==='settings'){
      if(settingsTab==='display') return <DisplaySettingsTab settings={displaySettings} onChange={setDisplaySettings} notify={notify}/>
      if(settingsTab==='import') return <ImportTab notify={notify}/>
      if(settingsTab==='remote') return <RemoteTab/>
      if(settingsTab==='about')  return <AboutTab/>
    }
    // Library
    if(libTab==='songs') return <SongsTab goLive={(t,l)=>goLive(t,l)} addToQueue={addToQueue} notify={notify}/>
    if(libTab==='bible') {
      const displayedVerses = bibleMode==='search' ? bibleResults : chapterVerses
      return (
        <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
          {/* Left panel: Book list or Chapter list */}
          <div style={{width:160,background:C.tex2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
            <div style={{padding:'8px',background:C.tex1,borderBottom:`1px solid ${C.b0}`,display:'flex',gap:4}}>
              <button className="glass-seg" onClick={()=>setBibleMode('browse')} style={{flex:1,padding:'5px 0',fontSize:9,fontWeight:700,letterSpacing:'0.08em',border:'none',borderRadius:5,cursor:'pointer',background:bibleMode==='browse'?C.p1:'transparent',color:bibleMode==='browse'?'#fff':C.t3,transition:'all 0.15s'}}>BROWSE</button>
              <button className="glass-seg" onClick={()=>setBibleMode('search')} style={{flex:1,padding:'5px 0',fontSize:9,fontWeight:700,letterSpacing:'0.08em',border:'none',borderRadius:5,cursor:'pointer',background:bibleMode==='search'?C.p1:'transparent',color:bibleMode==='search'?'#fff':C.t3,transition:'all 0.15s'}}>SEARCH</button>
            </div>
            {bibleMode==='browse'&&(
              <div style={{flex:1,overflowY:'auto'}}>
                {/* Book list */}
                {bibleBooks.map(book=>(
                  <div key={book} onClick={()=>handleBookSelect(book)}
                    style={{padding:'7px 10px',cursor:'pointer',fontSize:11,borderLeft:`2px solid ${selectedBook===book?C.p1:'transparent'}`,background:selectedBook===book?C.bg4:'none',color:selectedBook===book?C.t1:C.t2,transition:'all 0.1s'}}
                    onMouseEnter={e=>{if(selectedBook!==book)(e.currentTarget as HTMLElement).style.background=C.bg3}}
                    onMouseLeave={e=>{if(selectedBook!==book)(e.currentTarget as HTMLElement).style.background='none'}}>
                    {book}
                  </div>
                ))}
                {bibleBooks.length===0&&<div style={{padding:16,fontSize:11,color:C.t4,textAlign:'center'}}>Loading books…</div>}
              </div>
            )}
            {bibleMode==='search'&&(
              <div style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
                {bibleResults.map(v=>(
                  <div key={v.id} onClick={()=>{setSelectedVerse(v);setSelected(null);setSections([])}}
                    {...dragSource(`${v.book} ${v.chapter}:${v.verse}`,'verse')}
                    style={{padding:'9px 10px',marginBottom:3,cursor:'grab',borderRadius:7,border:`1px solid ${selectedVerse?.id===v.id?C.b2:'transparent'}`,background:selectedVerse?.id===v.id?C.bg4:'none',transition:'all 0.1s'}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=C.bg3}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=selectedVerse?.id===v.id?C.bg4:'none'}>
                    <div style={{fontSize:9,color:C.p2,fontWeight:700,marginBottom:3}}>{v.book} {v.chapter}:{v.verse}</div>
                    <div style={{fontSize:11,color:C.t2,lineHeight:1.4}}>{v.text.substring(0,55)}…</div>
                  </div>
                ))}
                {bibleResults.length===0&&<div style={{padding:'20px 8px',textAlign:'center',color:C.t4,fontSize:11}}>Search above</div>}
              </div>
            )}
          </div>

          {/* Middle panel: Chapters (browse mode) or empty (search mode) */}
          {bibleMode==='browse'&&(
            <div style={{width:130,background:C.tex2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
              <div style={{padding:'8px 10px',background:C.tex1,borderBottom:`1px solid ${C.b0}`}}>
                <span style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.1em'}}>{selectedBook||'SELECT BOOK'}</span>
              </div>
              <div style={{flex:1,overflowY:'auto',display:'flex',flexWrap:'wrap',alignContent:'flex-start',padding:6,gap:4}}>
                {bibleChapters.map(ch=>(
                  <div key={ch} onClick={()=>handleChapterSelect(ch)}
                    style={{width:36,height:32,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,borderRadius:6,cursor:'pointer',
                      background:selectedChapter===ch?C.p1:C.bg4,color:selectedChapter===ch?'#fff':C.t2,border:`1px solid ${selectedChapter===ch?C.p1:C.b1}`,transition:'all 0.1s'}}
                    onMouseEnter={e=>{if(selectedChapter!==ch)(e.currentTarget as HTMLElement).style.background=C.bg5}}
                    onMouseLeave={e=>{if(selectedChapter!==ch)(e.currentTarget as HTMLElement).style.background=C.bg4}}>
                    {ch}
                  </div>
                ))}
                {selectedBook&&bibleChapters.length===0&&<div style={{padding:12,fontSize:11,color:C.t4}}>Loading…</div>}
                {!selectedBook&&<div style={{padding:12,fontSize:11,color:C.t4}}>Select a book</div>}
              </div>
            </div>
          )}

          {/* Verse list panel */}
          {bibleMode==='browse'&&(
            <div style={{width:230,background:C.tex2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
              <div style={{padding:'8px 10px',background:C.tex1,borderBottom:`1px solid ${C.b0}`}}>
                <span style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.1em'}}>
                  {selectedBook&&selectedChapter?`${selectedBook} ${selectedChapter} · ${chapterVerses.length}v`:'SELECT CHAPTER'}
                </span>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'4px 6px'}}>
                {loadingChapter&&<div style={{padding:20,textAlign:'center',color:C.t4,fontSize:11}}>Loading…</div>}
                {!loadingChapter&&chapterVerses.map(v=>(
                  <div key={v.id} onClick={()=>{setSelectedVerse(v);setSelected(null);setSections([])}}
                    {...dragSource(`${v.book} ${v.chapter}:${v.verse}`,'verse')}
                    style={{padding:'8px 10px',marginBottom:2,cursor:'grab',borderRadius:7,border:`1px solid ${selectedVerse?.id===v.id?C.b2:'transparent'}`,background:selectedVerse?.id===v.id?C.bg4:'none',transition:'all 0.1s'}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=C.bg3}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=selectedVerse?.id===v.id?C.bg4:'none'}>
                    <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                      <span style={{fontSize:9,color:C.p2,fontWeight:700,minWidth:18,marginTop:2}}>{v.verse}</span>
                      <span style={{fontSize:11,color:C.t2,lineHeight:1.5}}>{v.text}</span>
                    </div>
                  </div>
                ))}
                {!loadingChapter&&selectedChapter&&chapterVerses.length===0&&<div style={{padding:20,textAlign:'center',color:C.t4,fontSize:11}}>No verses</div>}
                {!selectedChapter&&!loadingChapter&&<div style={{padding:20,textAlign:'center',color:C.t4,fontSize:11}}>Select a chapter</div>}
              </div>
            </div>
          )}

          {/* Detail panel */}
          <div style={{flex:1,padding:32,display:'flex',flexDirection:'column',gap:16,overflowY:'auto',background:C.tex1}}>
            {selectedVerse?<>
              <div style={{fontSize:13,color:C.p2,fontWeight:700}}>{selectedVerse.book} {selectedVerse.chapter}:{selectedVerse.verse} — {selectedVerse.version}</div>
              <div style={{fontSize:24,lineHeight:1.9,color:C.t1,fontWeight:300,fontStyle:'italic',flex:1,fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',Georgia,serif"}}>"{selectedVerse.text}"</div>
              <div style={{display:'flex',gap:10}}>
                <button className="shimmer-btn glass-primary" onClick={()=>goLive(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`,selectedVerse.text)} style={{padding:'11px 28px',background:`linear-gradient(135deg,${C.live},${C.p1})`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>GO LIVE</button>
                <button onClick={()=>addToQueue(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`,'verse')} style={{padding:'11px 18px',background:C.tex4,border:`1px solid ${C.b2}`,color:C.t1,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:9}}>+ Queue</button>
              </div>
            </>:(
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:C.t4}}>
                <div style={{fontSize:40,opacity:0.15}}>✦</div>
                <div style={{fontSize:13}}>{bibleMode==='browse'?'Select a verse from the chapter':'Search and select a verse'}</div>
              </div>
            )}
          </div>
        </div>
      )
    }
    // Hymnal
    if(selected) return (
      <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
        <div style={{padding:'12px 24px',background:C.tex0,borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
          <button onClick={()=>{setSelected(null);setSections([])}} style={{background:'none',border:`1px solid ${C.b1}`,color:C.t3,padding:'5px 12px',fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:7}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700,color:C.t1}}>{selected.title}</div>
            <div style={{fontSize:11,color:C.t4,marginTop:2}}>{selected.hymn_number?`Hymn #${selected.hymn_number}`:'Custom'} · {sections.length} sections</div>
          </div>
          <button onClick={()=>addToQueue(selected.title,'song')} style={{padding:'7px 16px',background:C.tex4,border:`1px solid ${C.b2}`,color:C.t1,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>+ Queue</button>
        </div>
        <div style={{display:'flex',gap:8,padding:'12px 20px',background:C.tex2,borderBottom:`1px solid ${C.b0}`,flexShrink:0,overflowX:'auto'}}>
          {sections.map((s,i)=>(
            <div key={s.id} onClick={()=>handleSectionClick(i)} style={{width:94,height:60,borderRadius:8,overflow:'hidden',border:`2px solid ${i===currentSection?C.p1:C.b1}`,flexShrink:0,cursor:'pointer',background:'#000',position:'relative',boxShadow:i===currentSection?`0 0 12px color-mix(in srgb, ${C.p1} 27%, transparent)`:'none',transition:'all 0.15s'}}>
              <div style={{position:'absolute',top:3,left:5,fontSize:7,color:i===currentSection?C.p2:C.t4,fontWeight:700,letterSpacing:'0.04em'}}>{s.type.toUpperCase()} {s.type==='verse'?i+1:''}</div>
              <div style={{position:'absolute',bottom:3,left:5,right:5,fontSize:7,color:i===currentSection?C.t2:C.t4,lineHeight:1.3}}>{s.content.substring(0,28)}…</div>
            </div>
          ))}
        </div>
        <div style={{flex:1,padding:'36px 52px',overflowY:'auto',background:C.tex1}}>
          {section&&<>
            <div style={{fontSize:10,color:C.t4,letterSpacing:'0.2em',fontWeight:600,marginBottom:24,textTransform:'uppercase' as const}}>{section.type} {section.type==='verse'?currentSection+1:''}</div>
            <div style={{fontSize:24,lineHeight:2.1,color:C.t1,fontWeight:300,whiteSpace:'pre-line',letterSpacing:'0.01em',fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',Georgia,serif"}}>{section.content}</div>
          </>}
        </div>
        <div style={{padding:'14px 24px',background:C.tex0,borderTop:`1px solid ${C.b0}`,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <button onClick={()=>currentSection>0&&handleSectionClick(currentSection-1)} disabled={currentSection===0} style={{padding:'9px 18px',background:'none',border:`1px solid ${C.b1}`,color:C.t2,cursor:currentSection===0?'not-allowed':'pointer',fontSize:20,borderRadius:8,opacity:currentSection===0?0.3:1}}>‹</button>
          <div style={{fontSize:12,color:C.t3,flex:1,textAlign:'center'}}>{currentSection+1} / {sections.length}</div>
          <button onClick={()=>currentSection<sections.length-1&&handleSectionClick(currentSection+1)} disabled={currentSection===sections.length-1} style={{padding:'9px 18px',background:'none',border:`1px solid ${C.b1}`,color:C.t2,cursor:currentSection===sections.length-1?'not-allowed':'pointer',fontSize:20,borderRadius:8,opacity:currentSection===sections.length-1?0.3:1}}>›</button>
          <button className="shimmer-btn glass-primary" onClick={()=>section&&goLive(selected.title,section.content)} style={{padding:'11px 28px',background:`linear-gradient(135deg,${C.live},${C.p1})`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.06em'}}>GO LIVE</button>
        </div>
      </div>
    )
    // Default: show hymnal grouped by collection (SDA vs CIS), then by language within CIS
    const langLabel = hymnLangLabel
    const groupKey = hymnGroupKey
    const groupLabel = hymnGroupLabel
    const GROUP_ORDER = HYMN_GROUP_ORDER
    const LANG_COLORS = [C.g2, C.p1, C.g1, C.live+'cc', C.safe+'cc', C.p2]
    const searchFiltered = hymnSearchFiltered
    const hymnLangs = hymnLangsMemo
    // Auto-expand first group on first load
    if(Object.keys(expandedHymnLangs).length===0 && hymnLangs.length>0) {
      setTimeout(()=>setExpandedHymnLangs({[hymnLangs[0]]:true}),0)
    }
    const byLang = hymnByLangMemo
    const btn2: React.CSSProperties = {cursor:'pointer',fontFamily:'inherit',border:'none',outline:'none',transition:'all 0.15s'}
    return (
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
        {/* Left: grouped song list */}
        <div style={{width:300,background:C.tex2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{padding:'8px 14px',background:C.tex0,borderBottom:`1px solid ${C.b0}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.15em',color:C.t4}}>HYMNAL</span>
            <span style={{fontSize:10,color:C.t4}}>{searchFiltered.length} hymns</span>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {allSongs.length===0 && <div style={{padding:32,textAlign:'center',color:C.t3,fontSize:12}}>Loading hymns…</div>}
            {searchFiltered.length===0 && query.trim() && (
              <div style={{padding:32,textAlign:'center',color:C.t3,fontSize:12}}>No hymns match "{query}"</div>
            )}
            {hymnLangs.map((lang,li)=>{
              const group = byLang[lang]
              if(!group||group.length===0) return null
              const isOpen = expandedHymnLangs[lang]===true
              const accent = LANG_COLORS[li%LANG_COLORS.length]
              return (
                <div key={lang}>
                  <button
                    onClick={()=>setExpandedHymnLangs(e=>({...e,[lang]:!isOpen}))}
                    style={{...btn2,width:'100%',padding:'10px 14px 10px 12px',
                      display:'flex',alignItems:'center',justifyContent:'space-between',
                      background:C.tex1,borderLeft:`3px solid ${accent}`,
                      borderBottom:`1px solid ${C.b0}`,color:C.t2,textAlign:'left' as const}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',color:accent}}>{groupLabel(lang).toUpperCase()}</span>
                      <span style={{fontSize:9,color:C.t4,background:C.tex3,padding:'1px 7px',borderRadius:10,border:`1px solid ${C.b1}`}}>{group.length}</span>
                    </div>
                    <span style={{fontSize:9,color:C.t4}}>{isOpen?'▾':'▸'}</span>
                  </button>
                  {isOpen && group.map(song=>(
                    <div key={song.id} onClick={()=>handleSelectSong(song)}
                      {...dragSource(song.title,'song')}
                      style={{padding:'9px 14px 9px 15px',
                        borderLeft:`3px solid transparent`,
                        borderBottom:`1px solid ${C.b0}`,
                        background:C.tex2,cursor:'grab',transition:'all 0.1s'}}
                      onMouseEnter={e=>{
                        const el=e.currentTarget as HTMLElement
                        el.style.background=C.bg3
                        el.style.borderLeftColor=accent
                      }}
                      onMouseLeave={e=>{
                        const el=e.currentTarget as HTMLElement
                        el.style.background=C.bg2
                        el.style.borderLeftColor='transparent'
                      }}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{color:C.t4,fontSize:10,flexShrink:0,opacity:0.6}}>⠿</span>
                        {song.hymn_number>0 && (
                          <span style={{fontSize:9,color:C.g1,fontWeight:700,minWidth:28,textAlign:'right' as const,flexShrink:0,
                            padding:'1px 5px',background:`color-mix(in srgb, ${C.g1} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${C.g1} 20%, transparent)`,borderRadius:3}}>
                            #{String(song.hymn_number).padStart(3,'0')}
                          </span>
                        )}
                        <span style={{fontSize:12,color:C.t1,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{song.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        {/* Right: empty state */}
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:C.t4,background:C.tex1}}>
          <div style={{fontSize:48,opacity:0.08}}>♪</div>
          <div style={{fontSize:12,letterSpacing:'0.1em',fontWeight:500}}>SELECT A HYMN TO PREVIEW</div>
        </div>
      </div>
    )
  }

  const subItems: Record<NavGroup,{id:string;label:string}[]> = {
    library:  [{id:'hymnal',label:'Hymnal'},{id:'bible',label:'Bible'},{id:'songs',label:'My Songs'}],
    present:  [{id:'slides',label:'Slides'},{id:'announce',label:'Announce'}],
    media:    [],
    calendar: [],
    service:  [{id:'queue',label:'Queue'}],
    settings: [{id:'display',label:'Display'},{id:'import',label:'Import'},{id:'remote',label:'Remote'},{id:'about',label:'About'}],
  }

  const NAV_ICONS: Record<NavGroup,string> = {
    library:'♪', present:'▶', media:'◫', calendar:'暦', service:'☰', settings:'⚙'
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'transparent',fontFamily:"-apple-system,'Segoe UI',system-ui,'Inter',sans-serif",overflow:'hidden',color:C.t1,fontSize:13,position:'relative'}}>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:8px;height:8px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.b2};border-radius:5px}
        ::-webkit-scrollbar-thumb:hover{background:${C.t3}}
        input::placeholder,textarea::placeholder{color:${C.t4}}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${C.g3}!important;box-shadow:0 0 0 3px color-mix(in srgb, ${C.g3} 10%, transparent)!important}
        @keyframes pulseGlow{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmerSweep{0%{left:-100%}60%,100%{left:150%}}
        .live-dot{animation:pulseGlow 1.8s ease-in-out infinite}
        .shimmer-btn{position:relative;overflow:hidden}
        .shimmer-btn::after{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,0.14),transparent);transform:skewX(-20deg);animation:shimmerSweep 4s ease infinite;pointer-events:none}
        .toast-anim{animation:slideDown 0.2s ease}
        .queue-anim{animation:slideUp 0.2s ease}
        .nav-icon:hover{background:${C.bg3}!important;color:${C.t1}!important}
        .sub-btn:hover{background:${C.bg3}!important;color:${C.t1}!important}
      `}</style>

      {/* Quiet hairline — a single restrained rule instead of the old ornamental gradient */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:1,background:C.b1,zIndex:100,pointerEvents:'none'}}/>

      {/* ── TOPBAR — 3-column grid: [brand] [centered search] [utilities] ── */}
      <div className="glass-bar" style={{height:68,borderBottom:`1px solid ${C.b0}`,display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',flexShrink:0,zIndex:10,position:'relative'}}>
        {/* Brand */}
        <div style={{display:'flex',alignItems:'center',height:'100%'}}>
          <div style={{width:76,height:'100%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,borderRight:`1px solid ${C.b0}`}}>
            <svg width="26" height="26" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.g3}/><stop offset="100%" stopColor={C.g1}/></linearGradient>
                <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={C.p2}/><stop offset="100%" stopColor={C.g1}/></linearGradient>
              </defs>
              <circle cx="50" cy="50" r="46" fill="none" stroke="url(#lg2)" strokeWidth="2.5"/>
              <text x="50" y="66" textAnchor="middle" fontSize="46" fill="url(#lg1)" fontFamily="'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',serif" fontWeight="700">将</text>
            </svg>
          </div>
          <div style={{padding:'0 24px',borderRight:`1px solid ${C.b0}`,height:'100%',display:'flex',alignItems:'center',flexShrink:0}}>
            <span style={{fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',serif",fontSize:14,color:C.t1,letterSpacing:'0.05em'}}>将軍OS</span>
          </div>
        </div>
        {/* Search — centered in the bar regardless of how wide the utilities column ends up */}
        <div style={{display:'flex',justifyContent:'center',minWidth:0,padding:'0 20px'}}>
        <div style={{width:'100%',maxWidth:440,display:'flex',alignItems:'center',background:C.tex2,border:`1px solid ${C.b1}`,borderRadius:999,padding:'0 16px',gap:10}}>
          <span style={{color:C.t3,fontSize:14,lineHeight:1}}>⌕</span>
          <input
            value={navGroup==='library'&&libTab==='bible'?bibleQuery:query}
            onChange={e=>navGroup==='library'&&libTab==='bible'?handleBibleSearch(e.target.value):handleSearch(e.target.value)}
            placeholder={navGroup==='library'&&libTab==='bible'?`Search ${bibleVersion}…`:navGroup==='library'&&libTab==='hymnal'?'Search title or hymn #…':'Search…'}
            style={{flex:1,background:'none',border:'none',color:C.t1,fontSize:13,outline:'none',padding:'9px 0',fontFamily:'inherit'}}
          />
          {navGroup==='library'&&libTab==='bible'&&(
            <select value={bibleVersion} onChange={async e=>{
              const v=e.target.value;setBibleVersion(v)
              if(bibleQuery)handleBibleSearch(bibleQuery)
              try{const books=await(window as any).shogunos.getBibleBooks(v);setBibleBooks(books)}catch{}
              if(selectedBook){
                try{const chs=await(window as any).shogunos.getBibleChapters(selectedBook,v);setBibleChapters(chs)}catch{}
                if(selectedChapter){try{const vv=await(window as any).shogunos.getBibleChapterVerses(selectedBook,selectedChapter,v);setChapterVerses(vv)}catch{}}
              }
            }} style={{background:'none',border:'none',color:C.g2,fontSize:12,fontWeight:600,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
              {availableVersions.map(v=><option key={v} value={v} style={{background:C.tex2}}>{v}</option>)}
            </select>
          )}
        </div>
        </div>
        {/* Utilities */}
        <div style={{display:'flex',alignItems:'center',height:'100%',paddingRight:20}}>
        {/* Countdown timer */}
        <button className="glass-btn" onClick={()=>setShowTimerModal(true)} title="Countdown Timer"
          style={{color:C.g2,fontSize:14,width:38,height:38,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginRight:10}}>⏱</button>
        {/* Dark mode toggle */}
        <button className="glass-btn" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
          style={{color:C.g2,fontSize:14,width:38,height:38,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginRight:10}}>{theme==='dark'?'☀':'☾'}</button>
        {/* Verse of day */}
        <button className="glass-btn" onClick={()=>setShowDailyPopup(true)} title="Verse of the Day"
          style={{color:C.g2,fontSize:13,width:38,height:38,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginRight:20}}>✦</button>
        {currentUser&&(
          <div style={{display:'flex',alignItems:'center',gap:10,paddingLeft:20,paddingRight:20,borderLeft:`1px solid ${C.b0}`,height:'100%'}}>
            <div style={{width:5,height:5,borderRadius:'50%',background:C.safe,flexShrink:0}}/>
            <span style={{fontSize:12,color:C.t2}}>{currentUser.display_name}</span>
          </div>
        )}
        <Clock/>
        </div>
      </div>

      {/* ── SECTION NAV — floating glass pill segmented control ── */}
      <div className="glass-bar" style={{height:56,borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',flexShrink:0,padding:'8px 20px',gap:14,overflowX:'auto'}}>
        <div className="glass-pill" style={{display:'flex',alignItems:'center',gap:2,padding:4,flexShrink:0}}>
          {NAV.filter(([gid])=>gid!=='service').map(([gid,gLabel])=>{
            const active=navGroup===gid
            return (
              <button key={gid} onClick={()=>setNavGroup(gid as NavGroup)} className={active?'':'nav-icon'}
                style={{display:'flex',alignItems:'center',gap:7,padding:'8px 15px',background:active?`linear-gradient(135deg,${C.g2},${C.g1})`:'none',border:'none',borderRadius:999,color:active?'#fff':C.t3,cursor:'pointer',fontSize:12.5,fontWeight:active?600:500,letterSpacing:'0.02em',whiteSpace:'nowrap' as const,transition:'all 0.15s',flexShrink:0,boxShadow:active?'inset 0 1px 0 rgba(255,255,255,0.3)':'none'}}>
                <span style={{fontSize:13,color:active?'#fff':C.t3}}>{(NAV_ICONS as any)[gid as string]}</span>
                {gLabel}
              </button>
            )
          })}
        </div>
        {subItems[navGroup].length>0&&(
          <div className="glass-pill" style={{display:'flex',alignItems:'center',gap:2,padding:4,flexShrink:0}}>
            {subItems[navGroup].map(sub=>{
              const active=activeSubId===sub.id
              return (
                <button key={sub.id} className={active?'':'sub-btn'}
                  onClick={()=>{
                    if(navGroup==='library'){setLibTab(sub.id as LibTab);if(sub.id!=='bible')setSelectedVerse(null)}
                    if(navGroup==='present')setPresentTab(sub.id as PresentTab)
                    if(navGroup==='settings')setSettingsTab(sub.id as SettingsTab)
                  }}
                  style={{padding:'7px 14px',background:active?C.bg4:'none',border:'none',borderRadius:999,color:active?C.g2:C.t3,cursor:'pointer',fontFamily:'inherit',fontSize:11.5,fontWeight:active?600:500,whiteSpace:'nowrap' as const,flexShrink:0,transition:'all 0.1s'}}>
                  {sub.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── BODY — three open panels, Quelea-style: Order of Service+Library / Preview / Live ── */}
      <div ref={bodyRef} style={{flex:1,display:'flex',minHeight:0,overflow:'hidden'}}>

        {/* ── LEFT COLUMN ── */}
        <div ref={leftColRef} style={navGroup==='media'||navGroup==='calendar'
          ? {flex:1,background:C.tex0,display:'flex',flexDirection:'column',minHeight:0,minWidth:0}
          : {width:leftWidth,flexShrink:0,background:C.tex0,display:'flex',flexDirection:'column',minHeight:0}}>

          {/* Order of Service — pinned, collapsible */}
          <div style={{flexShrink:0,display:'flex',flexDirection:'column',maxHeight:queueCollapsed?44:340,overflow:'hidden',borderBottom:`1px solid ${C.b0}`,transition:'max-height 0.15s ease'}}>
            <div style={{padding:queueCollapsed?'12px 20px':'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:9}}>
                <span style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase' as const}}>Order of Service</span>
                {queue.length>0&&<span style={{fontSize:10,color:C.g2,padding:'2px 7px',border:`1px solid ${C.b2}`,borderRadius:4}}>{queue.length}</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                {!queueCollapsed&&queue.length>0&&<button onClick={clearQueue} style={{background:'none',border:'none',color:C.t4,cursor:'pointer',fontSize:11,fontFamily:'inherit',padding:'2px 6px'}}>clear</button>}
                <button onClick={()=>setQueueCollapsed(v=>!v)} title={queueCollapsed?'Expand':'Collapse'}
                  style={{background:'none',border:`1px solid ${C.b1}`,color:C.t3,cursor:'pointer',fontSize:11,width:22,height:22,borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {queueCollapsed?'▾':'▴'}
                </button>
              </div>
            </div>
            {!queueCollapsed&&(
              <div onDragOver={onQueueZoneDragOver} onDragLeave={onQueueZoneDragLeave} onDrop={onQueueZoneDrop}
                style={{overflowY:'auto',padding:'0 20px 16px',minHeight:60,background:queueDragOver?`color-mix(in srgb, ${C.g3} 6%, transparent)`:'transparent',transition:'background 0.15s'}}>
                {queue.length===0&&(
                  <div style={{padding:'24px 16px',fontSize:12,color:queueDragOver?C.g2:C.t4,textAlign:'center',lineHeight:1.7,border:`1.5px dashed ${queueDragOver?C.g3:C.b1}`,borderRadius:10}}>
                    {queueDragOver?'Drop to add to queue':'Drag hymns, verses or slides here to build the order of service'}
                  </div>
                )}
                {queue.map((item,i)=>(
                  <div key={item.id}
                    draggable onDragStart={e=>onQueueItemDragStart(e,i)} onDragOver={onQueueItemDragOver} onDrop={e=>onQueueItemDrop(e,i)} onDragEnd={onQueueItemDragEnd}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',marginBottom:6,borderRadius:8,background:i===0?C.bg3:C.tex2,border:`1px solid ${i===0?C.b2:C.b0}`,cursor:'grab',opacity:draggedQueueIdx===i?0.3:1,transition:'opacity 0.12s'}}>
                    <span style={{fontSize:10,color:i===0?C.g2:C.t4,width:16,flexShrink:0,fontVariantNumeric:'tabular-nums',fontWeight:600}}>{i+1}</span>
                    <span style={{fontSize:12,color:C.t1,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.title}</span>
                    <button onClick={()=>removeFromQueue(item.id)} style={{background:'none',border:'none',color:C.t4,cursor:'pointer',fontSize:15,padding:0,flexShrink:0,lineHeight:1}}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Library / group content — always-visible bottom pane, like Quelea's Songs/Bibles/Images */}
          <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
            {toast&&(
              <div className="toast-anim" style={{padding:'6px 14px',background:C.tex3,borderBottom:`1px solid ${C.b0}`,fontSize:11,color:C.t2,flexShrink:0,display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:4,height:4,borderRadius:'50%',background:C.g2,flexShrink:0}}/>
                {toast}
              </div>
            )}
            <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
              {renderContent()}
            </div>
          </div>
        </div>

        {navGroup!=='media'&&navGroup!=='calendar' && <>
        {/* ── DIVIDER: Library ↔ Preview ── */}
        <div onMouseDown={e=>beginResize('left',e)} onDoubleClick={()=>resetResize('left')} title="Drag to resize · double-click to reset"
          style={dividerStyle()}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`color-mix(in srgb, ${C.g2} 33%, transparent)`}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
          <div style={{position:'absolute',top:0,bottom:0,left:2,width:1,background:C.b0}}/>
        </div>

        {/* ── CENTRE — PREVIEW (full-height open panel) ── */}
        <div ref={previewColRef} style={{...(previewWidth!=null?{width:previewWidth,flex:'0 0 auto'}:{flex:1}),display:'flex',flexDirection:'column',minWidth:0,background:C.tex0}}>
          <div style={{padding:'12px 20px',borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <span style={{fontSize:11,color:C.t2,letterSpacing:'0.08em',fontWeight:600,textTransform:'uppercase' as const}}>Preview</span>
            <button onClick={()=>{
              if(section) goLive(selected?.title||'',section.content)
              else if(selectedVerse) goLive(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`,selectedVerse.text)
            }} className="shimmer-btn"
              style={{padding:'7px 20px',background:C.p2,border:`1px solid ${C.p1}`,color:'#fff',fontSize:11.5,fontWeight:700,cursor:'pointer',fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP','Inter',sans-serif",borderRadius:5,letterSpacing:'0.04em',flexShrink:0,transition:'background 0.15s'}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=C.p1}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=C.p2}}>
              Go Live
            </button>
          </div>
          <div
            onDragOver={onPreviewDragOver} onDragLeave={onPreviewDragLeave} onDrop={onPreviewDrop}
            style={{flex:1,background:'#0a0606',overflow:'hidden',border:`1px solid ${previewDragOver?C.g2:'transparent'}`,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s',boxShadow:previewDragOver?`inset 0 0 24px color-mix(in srgb, ${C.g2} 13%, transparent)`:'none',margin:10,borderRadius:6}}>
            {section
              ?<div style={{fontSize:15,color:C.t2,lineHeight:1.8,padding:32,textAlign:'center',fontStyle:'italic',fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',Georgia,serif"}}>{section.content.substring(0,200)}…</div>
              :selectedVerse
              ?<div style={{padding:32,textAlign:'center'}}>
                <div style={{fontSize:11,color:C.p2,fontWeight:700,letterSpacing:'0.08em',marginBottom:10}}>{selectedVerse.book} {selectedVerse.chapter}:{selectedVerse.verse} · {selectedVerse.version}</div>
                <div style={{fontSize:15,color:C.t2,lineHeight:1.8,fontStyle:'italic',fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',Georgia,serif"}}>{selectedVerse.text.substring(0,200)}…</div>
              </div>
              :<div style={{fontSize:12,color:previewDragOver?C.g2:C.t4}}>{previewDragOver?'Drop to preview':'Nothing selected'}</div>
            }
          </div>
        </div>

        {/* ── DIVIDER: Preview ↔ Live ── */}
        <div onMouseDown={e=>beginResize('preview',e)} onDoubleClick={()=>resetResize('preview')} title="Drag to resize · double-click to reset"
          style={dividerStyle()}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`color-mix(in srgb, ${C.g2} 33%, transparent)`}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
          <div style={{position:'absolute',top:0,bottom:0,left:2,width:1,background:C.b0}}/>
        </div>

        {/* ── RIGHT — LIVE (full-height open panel) ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,background:C.tex0}}>
          <div style={{padding:'12px 20px',borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <span style={{fontSize:11,color:C.t2,letterSpacing:'0.08em',fontWeight:600,textTransform:'uppercase' as const}}>Live</span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              {live&&<div className="live-dot" style={{width:6,height:6,borderRadius:'50%',background:C.live,boxShadow:`0 0 6px ${C.live}`}}/>}
              <span style={{fontSize:10,color:live?C.live:C.t4,fontWeight:live?600:400}}>{live?'On air':'Standby'}</span>
            </div>
          </div>
          <div
            onDragOver={onLiveDragOver} onDragLeave={onLiveDragLeave} onDrop={onLiveDrop}
            style={{flex:1,background:'#000',overflow:'hidden',border:`1px solid ${liveDragOver?C.live+'cc':live?C.live+'55':'transparent'}`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:live?`inset 0 0 40px color-mix(in srgb, ${C.live} 13%, transparent)`:'none',transition:'all 0.2s',margin:10,borderRadius:6}}>
            {liveDragOver
              ?<div style={{fontSize:13,color:C.live,fontWeight:600}}>Drop to go live</div>
              :live
                ?<div style={{fontSize:15,color:'#fff',padding:32,textAlign:'center',lineHeight:1.7,fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',Georgia,serif"}}>{live}</div>
                :<div style={{fontSize:12,color:C.t4}}>Not presenting</div>
            }
          </div>
        </div>
        </>}

      </div>

      {/* ── FOOTER CONTROL BAR ── */}
      <div style={{height:56,background:C.tex1,borderTop:`1px solid ${C.b0}`,display:'flex',alignItems:'center',gap:14,padding:'0 20px',flexShrink:0}}>
        <button onClick={handleBlank}
          style={{padding:'8px 16px',background:blankScreen?C.bg4:'none',border:`1px solid ${blankScreen?C.b2:C.b1}`,color:blankScreen?C.t1:C.t3,fontSize:12,cursor:'pointer',fontFamily:'inherit',borderRadius:5,transition:'all 0.15s',flexShrink:0}}>
          {blankScreen?'● Blank':'Blank'}
        </button>
        <button onClick={sendScreenImage}
          style={{padding:'8px 16px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:12,cursor:'pointer',fontFamily:'inherit',borderRadius:5,flexShrink:0}}>
          Image
        </button>
        <button onClick={handleClear} title="Clear output"
          style={{padding:'8px 14px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:13,cursor:'pointer',borderRadius:5,flexShrink:0}}>✕</button>
        <button onClick={()=>setShowShortcuts(true)} title="Keyboard shortcuts (?)"
          style={{padding:'8px 14px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:13,cursor:'pointer',borderRadius:5,flexShrink:0}}>⌨</button>

        <div style={{flex:1}}/>

        <select value={selectedDisplay} onChange={e=>setSelectedDisplay(Number(e.target.value))}
          style={{background:C.tex2,border:`1px solid ${C.b1}`,color:C.t2,padding:'8px 12px',fontSize:11,outline:'none',fontFamily:'inherit',borderRadius:5,flexShrink:0}}>
          {displays.map(d=><option key={d.id} value={d.id}>{d.label}{d.isPrimary?' (Primary)':''}</option>)}
        </select>
      </div>

      {/* ── KEYBOARD SHORTCUTS OVERLAY ── */}
      {showShortcuts&&(
        <div onClick={()=>setShowShortcuts(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(6px)'}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.tex2,border:`1px solid ${C.b2}`,borderRadius:8,padding:36,maxWidth:420,width:'90%',position:'relative',boxShadow:'0 40px 80px rgba(0,0,0,0.9)'}}>
            <button onClick={()=>setShowShortcuts(false)}
              style={{position:'absolute',top:14,right:16,background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18,lineHeight:1,padding:4}}>×</button>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
              <span style={{fontSize:18,color:C.g2}}>⌨</span>
              <span style={{fontSize:15,fontWeight:700,color:C.t1}}>Keyboard Shortcuts</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {[
                ['Space / →','Next slide'],
                ['←','Previous slide'],
                ['Enter','Send current selection live'],
                ['B','Toggle blank screen'],
                ['Esc','Clear live output'],
                ['?','Show this panel'],
              ].map(([key,desc])=>(
                <div key={key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:12.5}}>
                  <span style={{color:C.t2}}>{desc}</span>
                  <span style={{padding:'3px 10px',background:C.tex3,border:`1px solid ${C.b1}`,borderRadius:5,color:C.t1,fontSize:11,fontWeight:600,fontFamily:'ui-monospace,monospace'}}>{key}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:10.5,color:C.t4,marginTop:20,lineHeight:1.6}}>Shortcuts are disabled while typing in a search box or text field.</div>
          </div>
        </div>
      )}

      {/* ── DAILY VERSE POPUP ── */}
      {showTimerModal&&(
        <div onClick={()=>setShowTimerModal(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.tex2,border:`1px solid ${C.b2}`,borderRadius:8,padding:40,maxWidth:420,width:'90%',position:'relative',boxShadow:`0 40px 80px rgba(0,0,0,0.9)`}}>
            <div style={{position:'absolute',top:0,left:40,right:40,height:1,background:`linear-gradient(to right,transparent,${C.g2},transparent)`}}/>
            <button onClick={()=>setShowTimerModal(false)}
              style={{position:'absolute',top:14,right:16,background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18,lineHeight:1,padding:4}}>×</button>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
              <span style={{fontSize:22,color:C.g2}}>⏱</span>
              <div style={{fontSize:10,color:C.g2,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase' as const}}>Countdown Timer</div>
            </div>
            <div style={{fontSize:11,color:C.t3,marginBottom:6,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase' as const}}>Label</div>
            <input value={timerLabel} onChange={e=>setTimerLabel(e.target.value)} placeholder="e.g. Service starts in"
              style={{width:'100%',padding:'10px 12px',background:C.tex3,border:`1px solid ${C.b1}`,borderRadius:5,color:C.t1,fontSize:13,fontFamily:'inherit',marginBottom:18}}/>
            <div style={{fontSize:11,color:C.t3,marginBottom:6,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase' as const}}>Duration (minutes)</div>
            <div style={{display:'flex',gap:8,marginBottom:24}}>
              {[1,5,10,15,30].map(m=>(
                <button key={m} onClick={()=>setTimerMinutes(m)}
                  style={{flex:1,padding:'9px 0',borderRadius:5,fontSize:13,cursor:'pointer',fontFamily:'inherit',
                    background:timerMinutes===m?C.g2:'none',color:timerMinutes===m?'#fff':C.t1,
                    border:`1px solid ${timerMinutes===m?C.g2:C.b1}`}}>{m}</button>
              ))}
              <input type="number" min={1} value={timerMinutes} onChange={e=>setTimerMinutes(Math.max(1,Number(e.target.value)||1))}
                style={{width:60,padding:'9px 6px',background:C.tex3,border:`1px solid ${C.b1}`,borderRadius:5,color:C.t1,fontSize:13,fontFamily:'inherit',textAlign:'center'}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={startCountdown}
                style={{flex:1,padding:'11px 0',background:C.live,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:5}}>Start Countdown</button>
              <button onClick={()=>setShowTimerModal(false)}
                style={{padding:'11px 18px',background:'none',border:`1px solid ${C.b2}`,color:C.t1,fontSize:12,cursor:'pointer',fontFamily:'inherit',borderRadius:5}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDailyPopup&&(
        <div onClick={()=>setShowDailyPopup(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.tex2,border:`1px solid ${C.b2}`,borderRadius:8,padding:40,maxWidth:540,width:'90%',position:'relative',boxShadow:`0 40px 80px rgba(0,0,0,0.9)`}}>
            <div style={{position:'absolute',top:0,left:40,right:40,height:1,background:`linear-gradient(to right,transparent,${C.g2},transparent)`}}/>
            <button onClick={()=>setShowDailyPopup(false)}
              style={{position:'absolute',top:14,right:16,background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18,lineHeight:1,padding:4}}>×</button>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
              <span style={{fontSize:22,color:C.g2,fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',serif"}}>✦</span>
              <div>
                <div style={{fontSize:10,color:C.g2,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase' as const,marginBottom:2}}>Verse of the Day</div>
                <div style={{fontSize:11,color:C.t3}}>{new Date().toLocaleDateString('en-ZW',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
              </div>
            </div>
            {dailyVerse?(
              <>
                <div style={{fontSize:11,color:C.g2,marginBottom:12}}>{dailyVerse.book} {dailyVerse.chapter}:{dailyVerse.verse} — {dailyVerse.version}</div>
                <div style={{fontSize:20,lineHeight:1.9,color:C.t1,fontStyle:'italic',fontWeight:300,fontFamily:"'Yu Mincho','Hiragino Mincho ProN','MS Mincho','Noto Serif CJK JP',Georgia,serif",marginBottom:20}}>"{dailyVerse.text}"</div>
                <div style={{padding:'12px 16px',background:C.tex3,borderRadius:5,border:`1px solid ${C.b1}`,marginBottom:24,fontSize:12,color:C.t3,lineHeight:1.7,fontStyle:'italic'}}>
                  May this word guide your service today. You are doing good work.
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{goLive(`${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`,dailyVerse.text);setShowDailyPopup(false)}}
                    style={{flex:1,padding:'11px 0',background:C.live,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:5}}>Go Live</button>
                  <button onClick={()=>{addToQueue(`${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`,'verse');setShowDailyPopup(false)}}
                    style={{flex:1,padding:'11px 0',background:'none',border:`1px solid ${C.b2}`,color:C.t1,fontSize:12,cursor:'pointer',fontFamily:'inherit',borderRadius:5}}>+ Queue</button>
                  <button {...dragSource(`${dailyVerse.book} ${dailyVerse.chapter}:${dailyVerse.verse}`,'verse')}
                    style={{width:44,padding:'11px 0',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:16,cursor:'grab',borderRadius:5}} title="Drag to live or preview">⠿</button>
                </div>
              </>
            ):(
              <div style={{textAlign:'center',padding:'40px 0',color:C.t3,fontSize:13}}>Loading…</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}