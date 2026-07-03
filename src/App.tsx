import React, { useState, useEffect, useRef, useCallback } from 'react'
import Splash from './Splash'
import UsersTab from './UsersTab'
import MediaTab from './MediaTab'

type Song       = { id: number; title: string; hymn_number: number; source: string; language: string }
type Section    = { id: number; song_id: number; type: string; order_num: number; content: string }
type Display    = { id: number; label: string; isPrimary: boolean; bounds?: any }
type DailyVerse = { book: string; chapter: number; verse: number; text: string; version: string }
type BibleVerse = { id: number; book: string; chapter: number; verse: number; text: string; version: string }
type QueueItem  = { id: string; title: string; type: string }
type NavGroup   = 'library' | 'present' | 'media' | 'service' | 'settings'
type LibTab     = 'hymnal' | 'bible' | 'daily' | 'songs'
type PresentTab = 'slides' | 'announce'
type SettingsTab = 'display' | 'import' | 'users' | 'about'

interface DisplaySettings {
  bgColor: string; bgImage: string | null
  fontColor: string; fontSize: number
  textAlign: 'left' | 'center' | 'right'
  fontFamily: string
}

// Shogun palette — ink, lacquer, aged gold
const C = {
  // Backgrounds — near-black ink, layered
  bg0: '#060406', bg1: '#0b090b', bg2: '#100e10', bg3: '#151215', bg4: '#1b181b', bg5: '#211e21',
  // Borders — subtle stone
  b0: '#1e1a1e', b1: '#272227', b2: '#332e33',
  // Lacquer red — live states only
  p1: '#8b1a1a', p2: '#b22222', p3: '#d44',
  // Aged gold — active/selected states
  g1: '#7a6218', g2: '#b8952a', g3: '#d4af5a',
  // Text — warm stone scale
  t1: '#e8e2d8', t2: '#a89e8e', t3: '#5a5048', t4: '#322c28',
  // Status
  live: '#b22222', safe: '#4a7c59', warn: '#b8952a',
}

type SlideType  = 'text' | 'scripture' | 'announcement' | 'blank'
type SlideAlign = 'left' | 'center' | 'right'

// ── DRAG & DROP ──────────────────────────────────────────────────────────────
// Shared MIME type used when dragging a song or verse out of the library onto the queue.
const DRAG_MIME = 'application/x-shogun-item'
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
  const contentRef                 = useRef<HTMLTextAreaElement>(null)
  const api = (window as any).shogunos

  useEffect(()=>{
    api.getSlides().then((d:Slide[])=>{ setSlides(d.sort((a,b)=>a.order_num-b.order_num)); setLoading(false) }).catch(()=>setLoading(false))
  },[])

  const visible = slides.filter(s=>{
    if(filter!=='all'&&s.type!==filter) return false
    if(search){const q=search.toLowerCase();return s.title.toLowerCase().includes(q)||s.content.toLowerCase().includes(q)}
    return true
  })

  function startNew(type:SlideType='text'){
    setIsNew(true);setSelected(null)
    setEditing({title:'',type,content:'',notes:'',bg_color:'#000000',bg_image:null,font_color:'#ffffff',font_size:48,text_align:'center',tags:[]})
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
  function sendLive(s:Slide){goLive(s.title||s.type,s.content,{bgColor:s.bg_color,bgImage:s.bg_image||undefined,fontColor:s.font_color,fontSize:s.font_size,textAlign:s.text_align});notify(`Sent live`)}

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
    inp.onchange=(e:any)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev:any)=>set('bg_image',ev.target.result);r.readAsDataURL(f)}
    inp.click()
  }

  const disp = editing||selected
  const inp: React.CSSProperties = {width:'100%',background:C.bg4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}
  const lbl: React.CSSProperties = {fontSize:10,color:C.t3,fontWeight:600,marginBottom:6,display:'block',letterSpacing:'0.05em',textTransform:'uppercase' as const}
  const secHd: React.CSSProperties = {padding:'10px 14px',background:C.bg1,borderBottom:`1px solid ${C.b0}`,flexShrink:0}
  const secLbl: React.CSSProperties = {fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}

  return (
    <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
      {/* Library panel */}
      <div style={{width:260,background:C.bg2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{...secHd,display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={secLbl}>Slides</span>
            <span style={{fontSize:10,color:C.t4}}>{slides.length}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',background:C.bg4,border:`1px solid ${C.b1}`,borderRadius:8,padding:'0 10px',gap:6}}>
            <span style={{color:C.t3,fontSize:14}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{flex:1,background:'none',border:'none',color:C.t1,fontSize:12,outline:'none',padding:'7px 0',fontFamily:'inherit'}} />
          </div>
          <div style={{display:'flex',gap:3,flexWrap:'wrap' as const}}>
            {(['all','text','scripture','announcement','blank'] as (SlideType|'all')[]).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:'2px 7px',fontSize:8,fontWeight:700,border:`1px solid ${filter===f?C.p1:C.b0}`,color:filter===f?C.p2:C.t4,background:filter===f?`${C.p1}20`:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:4,letterSpacing:'0.05em'}}>{f.toUpperCase()}</button>
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
                style={{marginBottom:4,borderRadius:8,border:`1px solid ${active?C.p1:dragOverId===s.id?C.b2:C.b0}`,background:active?`${C.p1}12`:C.bg3,cursor:'pointer',overflow:'hidden',opacity:dragId===s.id?0.35:1,transition:'all 0.1s'}}>
                <div style={{height:48,overflow:'hidden'}}><SlideCanvas slide={s} small /></div>
                <div style={{padding:'6px 8px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                    <span style={{fontSize:7,fontWeight:800,letterSpacing:'0.08em',color:m.color,padding:'1px 4px',border:`1px solid ${m.color}44`,background:`${m.color}12`,borderRadius:3}}>{m.label}</span>
                    <span style={{fontSize:10,color:active?C.t1:C.t2,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{s.title||'Untitled'}</span>
                  </div>
                  <div style={{display:'flex',gap:3,justifyContent:'flex-end'}}>
                    <button onClick={e=>{e.stopPropagation();sendLive(s)}} style={{padding:'2px 6px',background:`${C.live}18`,border:`1px solid ${C.live}44`,color:C.live,fontSize:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:4}}>LIVE</button>
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
      <div style={{flex:1,display:'flex',flexDirection:'column',background:C.bg1,minWidth:0}}>
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
          <div style={{padding:'12px 20px',background:C.bg0,borderTop:`1px solid ${C.b0}`,display:'flex',gap:8}}>
            <button className="shimmer-btn" onClick={()=>selected&&!isNew&&sendLive(selected)} disabled={!selected||isNew} style={{flex:1,padding:'12px 0',background:C.live,border:'none',color:'#fff',fontSize:12,fontWeight:700,letterSpacing:'0.08em',cursor:selected&&!isNew?'pointer':'not-allowed',fontFamily:'inherit',borderRadius:8,opacity:selected&&!isNew?1:0.35}}>GO LIVE</button>
            <button onClick={()=>selected&&!isNew&&addToQueue(selected.title||'Slide','slide')} disabled={!selected||isNew} style={{padding:'12px 18px',background:C.bg4,border:`1px solid ${C.b2}`,color:C.t1,fontSize:11,fontWeight:600,cursor:selected&&!isNew?'pointer':'not-allowed',fontFamily:'inherit',borderRadius:8,opacity:selected&&!isNew?1:0.35}}>+ Queue</button>
          </div>
        )}
      </div>

      {/* Editor */}
      <div style={{width:280,background:C.bg2,borderLeft:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
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
                {['#000000','#0a0814','#140a0a','#0a0a14','#060609','#111111'].map(col=>(
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
                :<button onClick={pickBgImage} style={{width:'100%',padding:'9px 0',background:'none',border:`1px dashed ${C.b2}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>Choose Image...</button>
              }
            </div>
            <div>
              <label style={lbl}>Text Color</label>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                <input type="color" value={editing.font_color||'#fff'} onChange={e=>set('font_color',e.target.value)} style={{width:36,height:32,border:`1px solid ${C.b2}`,borderRadius:6,background:'none',cursor:'pointer'}}/>
                <input style={{...inp,width:90}} value={editing.font_color||'#fff'} onChange={e=>set('font_color',e.target.value)}/>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {['#ffffff','#f8f4e8','#f59e0b','#a78bfa','#7dd3fc','#86efac','#f87171'].map(col=>(
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
                  <button key={a} onClick={()=>set('text_align',a)} style={{flex:1,padding:'8px 0',fontSize:13,border:`1px solid ${editing.text_align===a?C.g2:C.b1}`,color:editing.text_align===a?C.g2:C.t3,background:editing.text_align===a?`${C.g2}12`:'none',cursor:'pointer',borderRadius:5}}>
                    {a==='left'?'⫷':a==='center'?'≡':'⫸'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:'flex',gap:6,paddingTop:4}}>
              <button onClick={save2} disabled={saving} style={{flex:1,padding:'11px 0',background:`linear-gradient(135deg,${C.p1},#5b21b6)`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:8,opacity:saving?0.6:1}}>{saving?'Saving…':isNew?'Create Slide':'Save Changes'}</button>
              <button onClick={()=>{setEditing(null);if(isNew)setSelected(null);setIsNew(false)}} style={{padding:'11px 14px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:14,cursor:'pointer',borderRadius:8}}>✕</button>
            </div>
          </>}
        </div>
      </div>
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

  const inp: React.CSSProperties = {width:'100%',background:C.bg4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}
  const lbl: React.CSSProperties = {fontSize:10,color:C.t3,fontWeight:600,marginBottom:6,display:'block',letterSpacing:'0.05em',textTransform:'uppercase' as const}

  return (
    <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',borderRight:`1px solid ${C.b0}`}}>
        <div style={{padding:'10px 20px',background:C.bg1,borderBottom:`1px solid ${C.b0}`,flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Compose Announcement</span>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:24,display:'flex',flexDirection:'column',gap:18}}>
          <div>
            <label style={lbl}>Quick Templates</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {TEMPLATES.map(t=>(
                <button key={t.label} onClick={()=>{setText(t.text);setTitle(t.label)}}
                  style={{padding:'6px 12px',background:C.bg4,border:`1px solid ${C.b1}`,color:C.t2,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:7}}
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
                  <button key={a} onClick={()=>setAlign(a)} style={{padding:'6px 10px',fontSize:13,border:`1px solid ${align===a?C.g2:C.b1}`,color:align===a?C.g2:C.t3,background:align===a?`${C.g2}12`:'none',cursor:'pointer',borderRadius:5}}>{a==='left'?'⫷':a==='center'?'≡':'⫸'}</button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={send} style={{padding:'14px 0',background:`linear-gradient(135deg,${C.live},#b91c1c)`,border:'none',color:'#fff',fontSize:13,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',fontFamily:'inherit',borderRadius:10}}>● SEND LIVE</button>
        </div>
      </div>
      <div style={{width:340,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'10px 16px',background:C.bg1,borderBottom:`1px solid ${C.b0}`,flexShrink:0}}>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Preview</span>
        </div>
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:C.bg2}}>
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
          <div style={{padding:'8px 14px',background:C.bg1,borderBottom:`1px solid ${C.b0}`}}>
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
  const [filter,setFilter]           = useState<'all'|'hymnal'|'custom'>('all')
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
    en:'English', sn:'Shona', nd:'Ndebele', fr:'French',
    pt:'Portuguese', sw:'Swahili', zu:'Zulu', xh:'Xhosa', st:'Sotho',
  }
  const LANG_ORDER = ['en','sn','nd','fr','pt','sw','zu','xh','st']
  const langLabel = (l:string) => LANG_LABELS[l] || (l.charAt(0).toUpperCase()+l.slice(1))

  async function loadSongs(){
    try{
      const all:Song[] = await api.searchSongs('')
      const sorted = all.sort((a,b)=>(a.hymn_number||9999)-(b.hymn_number||9999))
      setSongs(sorted)
      const songLangs = Array.from(new Set(sorted.map((s:Song)=>s.language).filter(Boolean)))
        .sort((a:any,b:any)=>LANG_ORDER.indexOf(a)-LANG_ORDER.indexOf(b))
      setExpandedLangs(e=>Object.keys(e).length>0?e:(songLangs.length>0?{[songLangs[0] as string]:true}:e))
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
      setExpandedLangs(e=>({...e,[newLang]:true}))
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

  const visible = songs.filter(s=>{
    if(filter!=='all'&&s.source!==filter) return false
    if(search) return s.title.toLowerCase().includes(search.toLowerCase()) ||
      String(s.hymn_number||'').includes(search)
    return true
  })

  const langs = Array.from(new Set(songs.map(s=>s.language).filter(Boolean)))
    .sort((a,b)=>LANG_ORDER.indexOf(a)-LANG_ORDER.indexOf(b))

  const byLang = langs.reduce((acc,lang)=>{
    acc[lang]=visible.filter(s=>s.language===lang)
    return acc
  },{} as Record<string,Song[]>)

  const sec=sections[cur]
  const btn: React.CSSProperties = {cursor:'pointer',fontFamily:'inherit',border:'none',outline:'none',transition:'all 0.15s'}
  const LANG_COLORS = [C.p1, C.g1, C.live+'cc', C.safe+'cc', C.p2]

  return (
    <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
      {/* ── LEFT PANEL ── */}
      <div style={{width:280,background:C.bg2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'14px 16px',background:C.bg0,borderBottom:`1px solid ${C.b0}`,flexShrink:0}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,marginBottom:6}}>SONG LIBRARY</div>
          <div style={{display:'flex',alignItems:'center',background:C.bg4,border:`1px solid ${C.b1}`,borderRadius:6,padding:'0 10px',gap:6,marginBottom:10}}>
            <span style={{color:C.t3,fontSize:13}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search songs or hymn #…"
              style={{flex:1,background:'none',border:'none',color:C.t1,fontSize:12,outline:'none',padding:'8px 0',fontFamily:'inherit'}}/>
            {search&&<span onClick={()=>setSearch('')} style={{color:C.t3,cursor:'pointer',fontSize:12,lineHeight:1}}>✕</span>}
          </div>
          <div style={{display:'flex',gap:4,marginBottom:10}}>
            {(['all','hymnal','custom'] as const).map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{...btn,flex:1,padding:'5px 0',fontSize:9,fontWeight:700,letterSpacing:'0.06em',
                  border:`1px solid ${filter===f?C.g2:C.b1}`,
                  color:filter===f?C.g2:C.t4,
                  background:filter===f?`${C.g2}15`:'transparent',borderRadius:4}}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={()=>{setShowAddForm(true);setSelected(null)}}
            style={{...btn,width:'100%',padding:'8px 0',fontSize:10,fontWeight:700,letterSpacing:'0.08em',
              border:`1px solid ${C.p1}55`,color:C.p2,background:`${C.p1}12`,borderRadius:6}}>
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
            const isOpen=expandedLangs[lang]!==false
            const accent=LANG_COLORS[li%LANG_COLORS.length]
            return (
              <div key={lang}>
                <button onClick={()=>setExpandedLangs(e=>({...e,[lang]:!isOpen}))}
                  style={{...btn,width:'100%',padding:'9px 14px 9px 12px',
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    background:C.bg1,borderLeft:`3px solid ${accent}`,
                    borderBottom:`1px solid ${C.b0}`,color:C.t2,textAlign:'left' as const}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:accent}}>{langLabel(lang).toUpperCase()}</span>
                    <span style={{fontSize:9,color:C.t4,background:C.bg3,padding:'1px 6px',borderRadius:10,border:`1px solid ${C.b1}`}}>{group.length}</span>
                  </div>
                  <span style={{fontSize:9,color:C.t4}}>{isOpen?'▾':'▸'}</span>
                </button>
                {isOpen&&group.map(song=>{
                  const active=selected?.id===song.id
                  return (
                    <div key={song.id} onClick={()=>selectSong(song)}
                      {...dragSource(song.title,'song')}
                      style={{padding:'9px 14px 9px 15px',borderLeft:`3px solid ${active?accent:'transparent'}`,
                        borderBottom:`1px solid ${C.b0}`,background:active?`${accent}0f`:C.bg2,
                        cursor:'grab',transition:'all 0.1s'}}
                      onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLElement).style.background=C.bg3}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=active?`${accent}0f`:C.bg2}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                        <span style={{color:C.t4,fontSize:9,flexShrink:0,opacity:0.6}}>⠿</span>
                        {song.hymn_number>0&&(
                          <span style={{fontSize:8,color:C.g1,fontWeight:700,padding:'1px 5px',background:`${C.g1}15`,border:`1px solid ${C.g1}33`,borderRadius:3}}>
                            #{String(song.hymn_number).padStart(3,'0')}
                          </span>
                        )}
                        <span style={{fontSize:8,color:song.source==='hymnal'?C.g2:C.p2,fontWeight:600,
                          padding:'1px 5px',background:song.source==='hymnal'?`${C.g2}12`:`${C.p2}12`,
                          border:`1px solid ${song.source==='hymnal'?C.g2:C.p2}33`,borderRadius:3,
                          textTransform:'uppercase' as const,letterSpacing:'0.04em'}}>
                          {song.source}
                        </span>
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

        <div style={{padding:'10px 16px',borderTop:`1px solid ${C.b0}`,background:C.bg0,display:'flex',flexShrink:0}}>
          {[['Hymns',songs.filter(s=>s.source==='hymnal').length,C.g2],
            ['Custom',songs.filter(s=>s.source==='custom').length,C.p2],
            ['Total',songs.length,C.t2]].map(([l,v,col],i)=>(
            <div key={l as string} style={{flex:1,textAlign:'center' as const,borderRight:i<2?`1px solid ${C.b0}`:'none'}}>
              <div style={{fontSize:17,fontWeight:300,color:col as string}}>{v as number}</div>
              <div style={{fontSize:8,color:C.t4,letterSpacing:'0.1em',marginTop:2}}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: DETAIL ── */}
      {showAddForm ? (
        <div style={{flex:1,overflowY:'auto',background:C.bg1,padding:'28px 40px'}}>
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
                style={{width:'100%',background:C.bg3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:8}}/>
            </div>
            <div style={{width:110}}>
              <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.06em',display:'block',marginBottom:6}}>HYMN #</label>
              <input value={newHymnNum} onChange={e=>setNewHymnNum(e.target.value.replace(/[^0-9]/g,''))} placeholder="Optional"
                style={{width:'100%',background:C.bg3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:8}}/>
            </div>
            <div style={{width:170}}>
              <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.06em',display:'block',marginBottom:6}}>LANGUAGE</label>
              <select value={newLang} onChange={e=>setNewLang(e.target.value)}
                style={{width:'100%',background:C.bg3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:8}}>
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
              <div key={i} style={{background:C.bg2,border:`1px solid ${C.b1}`,borderRadius:10,padding:14}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <select value={sec.type} onChange={e=>updateNewSection(i,{type:e.target.value})}
                    style={{background:C.bg4,border:`1px solid ${C.b1}`,color:C.p2,padding:'5px 8px',fontSize:10,fontWeight:700,letterSpacing:'0.05em',outline:'none',fontFamily:'inherit',borderRadius:5,textTransform:'uppercase' as const}}>
                    {['verse','chorus','bridge','intro','outro'].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                  <div style={{flex:1}}/>
                  {newSections.length>1&&(
                    <button onClick={()=>removeNewSection(i)} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:14,padding:0}}>✕</button>
                  )}
                </div>
                <textarea value={sec.content} onChange={e=>updateNewSection(i,{content:e.target.value})}
                  placeholder="Lyrics for this section…" rows={4}
                  style={{width:'100%',background:C.bg3,border:`1px solid ${C.b1}`,color:C.t1,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'inherit',borderRadius:7,resize:'vertical' as const,lineHeight:1.6}}/>
              </div>
            ))}
          </div>

          <button onClick={saveNewSong} disabled={!canSaveNewSong||saving} className="shimmer-btn"
            style={{padding:'12px 32px',background:canSaveNewSong&&!saving?`linear-gradient(135deg,${C.p1},#5b21b6)`:C.bg4,
              border:'none',color:canSaveNewSong&&!saving?'#fff':C.t4,fontSize:12,fontWeight:700,
              cursor:canSaveNewSong&&!saving?'pointer':'not-allowed',fontFamily:'inherit',borderRadius:9,letterSpacing:'0.06em',transition:'all 0.15s'}}>
            {saving?'Saving…':'Save Song'}
          </button>
        </div>
      ) : !selected ? (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
          flexDirection:'column',gap:10,color:C.t4,background:C.bg1}}>
          <div style={{fontSize:52,opacity:0.07}}>♪</div>
          <div style={{fontSize:12,letterSpacing:'0.12em',fontWeight:500}}>SELECT A SONG TO BEGIN</div>
        </div>
      ) : (
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          <div style={{padding:'16px 24px',background:C.bg0,borderBottom:`1px solid ${C.b0}`,
            display:'flex',alignItems:'flex-start',gap:14,flexShrink:0}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:18,fontWeight:600,color:C.t1,overflow:'hidden',
                textOverflow:'ellipsis',whiteSpace:'nowrap' as const,letterSpacing:'-0.01em'}}>
                {selected.title}
              </div>
              <div style={{fontSize:11,color:C.t4,marginTop:5,display:'flex',gap:8,alignItems:'center'}}>
                <span style={{color:LANG_COLORS[langs.indexOf(selected.language)%LANG_COLORS.length]}}>
                  {langLabel(selected.language)}
                </span>
                <span style={{color:C.b2}}>•</span>
                <span>{selected.source==='hymnal'?`Hymn #${selected.hymn_number}`:'Custom'}</span>
                <span style={{color:C.b2}}>•</span>
                <span>{sections.length} sections</span>
              </div>
            </div>
            <button onClick={()=>addToQueue(selected.title,'song')}
              style={{...btn,padding:'8px 14px',fontSize:10,fontWeight:700,letterSpacing:'0.06em',
                border:`1px solid ${C.g2}`,color:C.g2,background:`${C.g2}10`,borderRadius:5}}>
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
                  border:`1px solid ${C.live}55`,color:C.live,background:`${C.live}10`,borderRadius:5}}>
                DELETE
              </button>
            )}
          </div>

          <div style={{display:'flex',gap:6,padding:'10px 16px',background:C.bg2,
            borderBottom:`1px solid ${C.b0}`,flexShrink:0,overflowX:'auto'}}>
            {sections.map((s,i)=>(
              <button key={s.id} onClick={()=>setCur(i)}
                style={{...btn,padding:'5px 12px',fontSize:10,fontWeight:600,letterSpacing:'0.04em',
                  border:`1px solid ${i===cur?C.p1:C.b1}`,
                  color:i===cur?C.p2:C.t4,
                  background:i===cur?`${C.p1}15`:'transparent',borderRadius:4,
                  flexShrink:0,whiteSpace:'nowrap' as const,
                  boxShadow:i===cur?`0 0 10px ${C.p1}30`:'none'}}>
                {s.type==='verse'?`Verse ${i+1}`:s.type.charAt(0).toUpperCase()+s.type.slice(1)}
              </button>
            ))}
          </div>

          <div style={{flex:1,padding:'40px 56px',overflowY:'auto',background:C.bg1,position:'relative'}}>
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

          <div style={{padding:'12px 20px',background:C.bg0,borderTop:`1px solid ${C.b0}`,
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
            <button onClick={()=>sec&&goLive(selected.title,sec.content)} className="shimmer-btn"
              style={{...btn,padding:'11px 32px',
                background:`linear-gradient(135deg,${C.live},#b91c1c)`,
                border:`1px solid ${C.live}55`,
                color:'#fff',fontSize:11,fontWeight:700,borderRadius:6,
                letterSpacing:'0.08em',boxShadow:`0 4px 16px ${C.live}40`}}>
              GO LIVE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AboutTab() {
  return (
    <div style={{flex:1,padding:40,overflowY:'auto',background:C.bg1}}>
      <div style={{maxWidth:560}}>
        <div style={{display:'flex',alignItems:'center',gap:20,marginBottom:36}}>
          <svg width="64" height="64" viewBox="0 0 100 100">
            <defs>
              <radialGradient id="ab1" cx="50%" cy="30%" r="70%"><stop offset="0%" stopColor="#1a0a2e"/><stop offset="100%" stopColor="#060609"/></radialGradient>
              <linearGradient id="ab2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7c3aed"/><stop offset="50%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient>
              <linearGradient id="ab3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fcd34d"/><stop offset="100%" stopColor="#d97706"/></linearGradient>
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
            <div key={k} style={{background:C.bg3,borderRadius:10,padding:'14px 16px',border:`1px solid ${C.b1}`}}>
              <div style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.15em',marginBottom:5,textTransform:'uppercase' as const}}>{k}</div>
              <div style={{fontSize:12,color:C.t1,fontWeight:500}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{background:C.bg3,borderRadius:12,padding:'18px 20px',border:`1px solid ${C.b1}`}}>
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
    f.name.toLowerCase().endsWith('.qsp')?handleQSP(f):handleJson(f)
  }

  return (
    <div style={{flex:1,padding:36,overflowY:'auto',background:C.bg1,display:'flex',flexDirection:'column',gap:20,maxWidth:560}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Import Data</div>
      <div style={{display:'flex',gap:4,background:C.bg3,padding:4,borderRadius:10,border:`1px solid ${C.b1}`}}>
        {(['json','qsp'] as const).map(m=>(
          <button key={m} onClick={()=>{setMode(m);setResult(null)}} style={{flex:1,padding:'9px 0',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:7,background:mode===m?C.bg5:'none',border:`1px solid ${mode===m?C.b2:'transparent'}`,color:mode===m?C.t1:C.t3}}>
            {m==='json'?'ShogunOS Backup (.json)':'Quelea Song Pack (.qsp)'}
          </button>
        ))}
      </div>
      {mode==='qsp'&&(
        <div style={{padding:'12px 16px',background:`${C.p1}12`,border:`1px solid ${C.p1}44`,borderRadius:10}}>
          <div style={{fontSize:11,color:C.p2,fontWeight:700,marginBottom:4}}>Quelea Song Pack Import</div>
          <div style={{fontSize:12,color:C.t3,lineHeight:1.6,marginBottom:12}}>In Quelea, go to <strong style={{color:C.t2}}>Database → Export → Song Pack (.qsp)</strong>, then drop the file below.</div>
          <label style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase' as const,display:'block',marginBottom:6}}>Tag all songs in this pack as</label>
          <select value={qspLang} onChange={e=>setQspLang(e.target.value)}
            style={{width:'100%',background:C.bg4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}}>
            {QSP_LANGS.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <div style={{fontSize:10,color:C.t4,marginTop:6,lineHeight:1.5}}>Quelea song packs don't store a language, so pick the one that matches this pack — it'll be used to group these songs in the Hymnal and My Songs views.</div>
        </div>
      )}
      <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop} onClick={()=>mode==='qsp'?qspRef.current?.click():fileRef.current?.click()}
        style={{border:`2px dashed ${dragOver?C.p1:C.b1}`,background:dragOver?`${C.p1}08`:C.bg2,borderRadius:12,padding:'40px 24px',textAlign:'center',cursor:'pointer',transition:'all 0.15s'}}>
        <div style={{fontSize:28,marginBottom:10,opacity:0.4}}>{mode==='qsp'?'🎵':'📂'}</div>
        <div style={{fontSize:14,color:dragOver?C.p2:C.t2,fontWeight:600,marginBottom:4}}>{importing?'Importing…':mode==='qsp'?'Drop your .qsp file':'Drop your backup file'}</div>
        <div style={{fontSize:11,color:C.t4}}>or click to browse</div>
      </div>
      <input ref={fileRef} type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(f)handleJson(f);e.target.value=''}} style={{display:'none'}}/>
      <input ref={qspRef} type="file" accept=".qsp" onChange={e=>{const f=e.target.files?.[0];if(f)handleQSP(f);e.target.value=''}} style={{display:'none'}}/>
      {result&&(
        <div style={{padding:'14px 18px',background:result.success?`${C.safe}10`:`${C.live}10`,border:`1px solid ${result.success?C.safe:C.live}44`,borderRadius:10}}>
          <div style={{fontSize:12,color:result.success?C.safe:C.live,fontWeight:600}}>{result.success?'✓ ':'✗ '}{result.message}</div>
        </div>
      )}
    </div>
  )
}

function DisplaySettingsTab({ settings, onChange, notify }: { settings:DisplaySettings; onChange:(s:DisplaySettings)=>void; notify:(m:string)=>void }) {
  function set(k:keyof DisplaySettings,v:any){onChange({...settings,[k]:v})}
  const lbl: React.CSSProperties = {fontSize:10,color:C.t3,fontWeight:600,marginBottom:6,display:'block',letterSpacing:'0.05em',textTransform:'uppercase' as const}
  const inp: React.CSSProperties = {width:'100%',background:C.bg4,border:`1px solid ${C.b1}`,color:C.t1,padding:'9px 12px',fontSize:12,outline:'none',fontFamily:'inherit',borderRadius:8}

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
    <div style={{flex:1,padding:32,overflowY:'auto',background:C.bg1,display:'flex',flexDirection:'column',gap:20,maxWidth:520}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Display Settings</div>
      <div style={{fontSize:12,color:C.t3,lineHeight:1.6,padding:'12px 16px',background:C.bg3,borderRadius:10,border:`1px solid ${C.b1}`}}>These settings apply to hymns and Bible verses sent live. Slides use their own individual settings.</div>
      <div>
        <label style={lbl}>Background Color</label>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
          <input type="color" value={settings.bgColor} onChange={e=>set('bgColor',e.target.value)} style={{width:40,height:36,border:`1px solid ${C.b2}`,borderRadius:8,background:'none',cursor:'pointer'}}/>
          <input style={{...inp,width:110}} value={settings.bgColor} onChange={e=>set('bgColor',e.target.value)}/>
        </div>
        <div style={{display:'flex',gap:4}}>
          {['#000000','#0a0814','#140a0a','#0a0a14','#060609','#111111'].map(c=>(
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
            i.onchange=(e:any)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev:any)=>set('bgImage',ev.target.result);r.readAsDataURL(f)}
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
          {['#ffffff','#f8f4e8','#f59e0b','#a78bfa','#7dd3fc','#86efac'].map(c=>(
            <div key={c} onClick={()=>set('fontColor',c)} style={{width:28,height:28,background:c,border:`1px solid ${settings.fontColor===c?C.g2:C.b2}`,borderRadius:5,cursor:'pointer'}}/>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Font Family</label>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {FONTS.map(f=>(
            <div key={f.value} onClick={()=>set('fontFamily',f.value)}
              style={{padding:'9px 14px',borderRadius:8,border:`1px solid ${settings.fontFamily===f.value?C.p1:C.b1}`,background:settings.fontFamily===f.value?`${C.p1}18`:C.bg3,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',transition:'all 0.1s'}}>
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
            <button key={sz} onClick={()=>set('fontSize',sz)} style={{flex:1,padding:'5px 0',fontSize:9,fontWeight:700,border:`1px solid ${settings.fontSize===sz?C.g2:C.b1}`,color:settings.fontSize===sz?C.g2:C.t3,background:settings.fontSize===sz?`${C.g2}12`:'none',cursor:'pointer',fontFamily:'inherit',borderRadius:5}}>{sz}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Alignment</label>
        <div style={{display:'flex',gap:4}}>
          {(['left','center','right'] as const).map(a=>(
            <button key={a} onClick={()=>set('textAlign',a)} style={{flex:1,padding:'10px 0',fontSize:15,border:`1px solid ${settings.textAlign===a?C.g2:C.b1}`,color:settings.textAlign===a?C.g2:C.t3,background:settings.textAlign===a?`${C.g2}12`:'none',cursor:'pointer',borderRadius:7}}>
              {a==='left'?'⫷':a==='center'?'≡':'⫸'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={lbl}>Preview</label>
        <div style={{aspectRatio:'16/9',borderRadius:10,overflow:'hidden',border:`1px solid ${C.b1}`,background:settings.bgColor,display:'flex',alignItems:'center',justifyContent:'center',padding:16,position:'relative',
          backgroundImage:settings.bgImage?`url(${settings.bgImage})`:undefined,backgroundSize:'cover',backgroundPosition:'center'}}>
          {settings.bgImage&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.3)'}}/>}
          <div style={{position:'relative',zIndex:1,fontSize:settings.fontSize*0.22,color:settings.fontColor,textAlign:settings.textAlign,fontFamily:settings.fontFamily,fontWeight:300,lineHeight:1.6}}>
            "Amazing grace! How sweet the sound<br/>That saved a wretch like me!"
          </div>
        </div>
      </div>
      <button onClick={handleSave} style={{padding:'12px 0',background:`linear-gradient(135deg,${C.p1},#5b21b6)`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:8,letterSpacing:'0.05em'}}>Save Settings</button>
    </div>
  )
}

export default function App() {
  const [showSplash,setShowSplash]       = useState(true)
  const [currentUser,setCurrentUser]     = useState<{username:string;role:string;display_name:string}|null>(null)
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
  const [clock,setClock]                 = useState('')
  const [toast,setToast]                 = useState('')
  const [displaySettings,setDisplaySettings] = useState<DisplaySettings>({bgColor:'#000000',bgImage:null,fontColor:'#ffffff',fontSize:52,textAlign:'center',fontFamily:'Georgia, serif'})
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
  const [previewDragOver,setPreviewDragOver] = useState(false)
  const [liveDragOver,setLiveDragOver]       = useState(false)

  useEffect(()=>{
    const tick=()=>setClock(new Date().toLocaleTimeString('en-ZW',{hour:'2-digit',minute:'2-digit'}))
    tick();const t=setInterval(tick,1000);return()=>clearInterval(t)
  },[])

  useEffect(()=>{
    if(showSplash)return
    async function load(){
      const d=await(window as any).shogunos.getDisplays()
      setDisplays(d);setSelectedDisplay(d.length>1?d[1].id:d[0]?.id)
      setDailyVerse(await(window as any).shogunos.getDailyVerse())
      const q=await(window as any).shogunos.getServiceQueue()
      setQueue(q.map((x:any)=>({id:String(x.id),title:x.title,type:x.type})))
      try{const v=await(window as any).shogunos.getBibleTranslations();if(v?.length)setAvailableVersions(v)}catch{}
      // Load saved display settings
      try{const ds=await(window as any).shogunos.getDisplaySettings();if(ds)setDisplaySettings(ds)}catch{}
      // Load all hymns for default browse view
      try{const all=await(window as any).shogunos.searchSongs('');setAllSongs(all.sort((a:Song,b:Song)=>(a.hymn_number||9999)-(b.hymn_number||9999)))}catch{}
      // Load bible books for chapter browser
      try{const books=await(window as any).shogunos.getBibleBooks('KJV');setBibleBooks(books)}catch{}
    }
    load()
  },[showSplash])

  if(showSplash) return <Splash onDone={user=>{setCurrentUser(user);setShowSplash(false);notify(`Welcome, ${user.display_name}`)}}/>

  async function handleSearch(val:string){
    setQuery(val)
    if(val.trim().length<1){setResults([]);return}
    setResults(allSongs.filter(s=>s.title.toLowerCase().includes(val.toLowerCase())))
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
    setSelected(song);setCurrentSection(0)
    setSections(await(window as any).shogunos.getSongSections(song.id))
  }

  async function goLive(title:string,lyrics:string,ds?:Partial<DisplaySettings>){
    const s={...displaySettings,...ds}
    setLive(title);setBlankScreen(false)
    await(window as any).shogunos.goLive({title,lyrics,displayId:selectedDisplay,fontSize:s.fontSize,textAlign:s.textAlign,bgColor:s.bgColor,fontColor:s.fontColor,bgImage:s.bgImage,fontFamily:s.fontFamily})
  }

  async function handleSectionClick(i:number){
    setCurrentSection(i)
    if(live&&selected) await(window as any).shogunos.goLive({title:selected.title,lyrics:sections[i].content,displayId:selectedDisplay,fontSize:displaySettings.fontSize,textAlign:displaySettings.textAlign,bgColor:displaySettings.bgColor})
  }

  async function handleClear(){setLive(null);setBlankScreen(false);await(window as any).shogunos.closeLive()}

  async function handleBlank(){
    const next=!blankScreen;setBlankScreen(next)
    if(next) await(window as any).shogunos.goLive({title:'',lyrics:'',displayId:selectedDisplay,bgColor:'#000000'})
    else if(live) await(window as any).shogunos.goLive({title:live,lyrics:sections[currentSection]?.content||'',displayId:selectedDisplay,bgColor:displaySettings.bgColor})
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
      const {title}=JSON.parse(raw)
      // Show in preview — find the song or verse and set section
      const songs=await(window as any).shogunos.searchSongs(title)
      if(songs&&songs.length>0){
        const song=songs[0]
        setSelected(song)
        const secs=await(window as any).shogunos.getSongSections(song.id)
        setSections(secs); if(secs.length>0)setSection(secs[0]); setCurrentSection(0)
      }
      notify(`Preview: ${title}`)
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
        // For bible verses the content is in the title string like "John 3:16"
        // Find it and go live
        const results=await(window as any).shogunos.searchBible(title,bibleVersion)
        if(results&&results.length>0){const v=results[0];goLive(`${v.book} ${v.chapter}:${v.verse}`,v.text)}
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
    ['service','Service','☰'],
    ['settings','Settings','⚙'],
  ]

  const activeSubId = navGroup==='library'?libTab:navGroup==='present'?presentTab:navGroup==='service'?'queue':navGroup==='media'?'media':settingsTab

  const renderContent = () => {
    if(navGroup==='media'){
      return <MediaTab goLive={(t,l,type,extra)=>{ (window as any).shogunos?.goLiveMedia?.(extra||{type:'image'}) }} notify={notify}/>
    }
    if(navGroup==='present'){
      if(presentTab==='slides') return <SlidesTab goLive={goLive} addToQueue={addToQueue} notify={notify}/>
      return <AnnounceTab goLive={(t,l)=>goLive(t,l)} notify={notify}/>
    }
    if(navGroup==='service'){
      return (
        <div onDragOver={onQueueZoneDragOver} onDragLeave={onQueueZoneDragLeave} onDrop={onQueueZoneDrop}
          style={{flex:1,padding:32,overflowY:'auto',background:C.bg1,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',color:C.t4,textTransform:'uppercase' as const}}>Service Queue — {queue.length} items</div>
            {queue.length>0&&<button onClick={clearQueue} style={{padding:'5px 12px',background:'none',border:`1px solid ${C.b1}`,color:C.t3,fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:6}}>Clear All</button>}
          </div>
          {queue.length===0&&(
            <div style={{padding:40,textAlign:'center',color:queueDragOver?C.p2:C.t4,fontSize:13,border:`1.5px dashed ${queueDragOver?C.p1:C.b1}`,borderRadius:12,background:queueDragOver?`${C.p1}0c`:'transparent',transition:'all 0.15s'}}>
              {queueDragOver?'Drop to add to queue':'Queue is empty — drag a hymn or verse here, or add from Hymnal, Bible or Slides'}
            </div>
          )}
          {queue.map((item,i)=>(
            <div key={item.id}
              draggable onDragStart={e=>onQueueItemDragStart(e,i)} onDragOver={onQueueItemDragOver} onDrop={e=>onQueueItemDrop(e,i)} onDragEnd={onQueueItemDragEnd}
              style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',background:i===0?C.bg3:C.bg2,borderRadius:10,border:`1px solid ${i===0?C.b2:C.b1}`,cursor:'grab',opacity:draggedQueueIdx===i?0.35:1,transition:'opacity 0.15s'}}>
              <span style={{color:C.t4,fontSize:13,opacity:0.6,flexShrink:0}}>⠿</span>
              <div style={{width:28,height:28,borderRadius:'50%',background:i===0?C.p1:C.bg4,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontSize:11,color:i===0?'#fff':C.t3,fontWeight:700}}>{i+1}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:C.t1,fontWeight:500}}>{item.title}</div>
                <div style={{fontSize:10,color:C.t4,marginTop:2}}>{item.type.toUpperCase()}</div>
              </div>
              <button onClick={()=>removeFromQueue(item.id)} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18,padding:0}}>×</button>
            </div>
          ))}
        </div>
      )
    }
    if(navGroup==='settings'){
      if(settingsTab==='display') return <DisplaySettingsTab settings={displaySettings} onChange={setDisplaySettings} notify={notify}/>
      if(settingsTab==='import') return <ImportTab notify={notify}/>
      if(settingsTab==='about')  return <AboutTab/>
      if(settingsTab==='users')  return <UsersTab currentUser={currentUser!} notify={notify}/>
    }
    // Library
    if(libTab==='songs') return <SongsTab goLive={(t,l)=>goLive(t,l)} addToQueue={addToQueue} notify={notify}/>
    if(libTab==='bible') {
      const displayedVerses = bibleMode==='search' ? bibleResults : chapterVerses
      return (
        <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
          {/* Left panel: Book list or Chapter list */}
          <div style={{width:160,background:C.bg2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
            <div style={{padding:'8px',background:C.bg1,borderBottom:`1px solid ${C.b0}`,display:'flex',gap:4}}>
              <button onClick={()=>setBibleMode('browse')} style={{flex:1,padding:'5px 0',fontSize:9,fontWeight:700,letterSpacing:'0.08em',border:'none',borderRadius:5,cursor:'pointer',background:bibleMode==='browse'?C.p1:'transparent',color:bibleMode==='browse'?'#fff':C.t3,transition:'all 0.15s'}}>BROWSE</button>
              <button onClick={()=>setBibleMode('search')} style={{flex:1,padding:'5px 0',fontSize:9,fontWeight:700,letterSpacing:'0.08em',border:'none',borderRadius:5,cursor:'pointer',background:bibleMode==='search'?C.p1:'transparent',color:bibleMode==='search'?'#fff':C.t3,transition:'all 0.15s'}}>SEARCH</button>
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
                  <div key={v.id} onClick={()=>setSelectedVerse(v)}
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
            <div style={{width:130,background:C.bg2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
              <div style={{padding:'8px 10px',background:C.bg1,borderBottom:`1px solid ${C.b0}`}}>
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
            <div style={{width:230,background:C.bg2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
              <div style={{padding:'8px 10px',background:C.bg1,borderBottom:`1px solid ${C.b0}`}}>
                <span style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.1em'}}>
                  {selectedBook&&selectedChapter?`${selectedBook} ${selectedChapter} · ${chapterVerses.length}v`:'SELECT CHAPTER'}
                </span>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'4px 6px'}}>
                {loadingChapter&&<div style={{padding:20,textAlign:'center',color:C.t4,fontSize:11}}>Loading…</div>}
                {!loadingChapter&&chapterVerses.map(v=>(
                  <div key={v.id} onClick={()=>setSelectedVerse(v)}
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
          <div style={{flex:1,padding:32,display:'flex',flexDirection:'column',gap:16,overflowY:'auto',background:C.bg1}}>
            {selectedVerse?<>
              <div style={{fontSize:13,color:C.p2,fontWeight:700}}>{selectedVerse.book} {selectedVerse.chapter}:{selectedVerse.verse} — {selectedVerse.version}</div>
              <div style={{fontSize:24,lineHeight:1.9,color:C.t1,fontWeight:300,fontStyle:'italic',flex:1}}>"{selectedVerse.text}"</div>
              <div style={{display:'flex',gap:10}}>
                <button className="shimmer-btn" onClick={()=>goLive(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`,selectedVerse.text)} style={{padding:'11px 28px',background:`linear-gradient(135deg,${C.live},#b91c1c)`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:9}}>GO LIVE</button>
                <button onClick={()=>addToQueue(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`,'verse')} style={{padding:'11px 18px',background:C.bg4,border:`1px solid ${C.b2}`,color:C.t1,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:9}}>+ Queue</button>
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
        <div style={{padding:'12px 24px',background:C.bg0,borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
          <button onClick={()=>{setSelected(null);setSections([])}} style={{background:'none',border:`1px solid ${C.b1}`,color:C.t3,padding:'5px 12px',fontSize:11,cursor:'pointer',fontFamily:'inherit',borderRadius:7}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700,color:C.t1}}>{selected.title}</div>
            <div style={{fontSize:11,color:C.t4,marginTop:2}}>{selected.hymn_number?`Hymn #${selected.hymn_number}`:'Custom'} · {sections.length} sections</div>
          </div>
          <button onClick={()=>addToQueue(selected.title,'song')} style={{padding:'7px 16px',background:C.bg4,border:`1px solid ${C.b2}`,color:C.t1,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>+ Queue</button>
        </div>
        <div style={{display:'flex',gap:8,padding:'12px 20px',background:C.bg2,borderBottom:`1px solid ${C.b0}`,flexShrink:0,overflowX:'auto'}}>
          {sections.map((s,i)=>(
            <div key={s.id} onClick={()=>handleSectionClick(i)} style={{width:94,height:60,borderRadius:8,overflow:'hidden',border:`2px solid ${i===currentSection?C.p1:C.b1}`,flexShrink:0,cursor:'pointer',background:'#000',position:'relative',boxShadow:i===currentSection?`0 0 12px ${C.p1}44`:'none',transition:'all 0.15s'}}>
              <div style={{position:'absolute',top:3,left:5,fontSize:7,color:i===currentSection?C.p2:C.t4,fontWeight:700,letterSpacing:'0.04em'}}>{s.type.toUpperCase()} {s.type==='verse'?i+1:''}</div>
              <div style={{position:'absolute',bottom:3,left:5,right:5,fontSize:7,color:i===currentSection?C.t2:C.t4,lineHeight:1.3}}>{s.content.substring(0,28)}…</div>
            </div>
          ))}
        </div>
        <div style={{flex:1,padding:'36px 52px',overflowY:'auto',background:C.bg1}}>
          {section&&<>
            <div style={{fontSize:10,color:C.t4,letterSpacing:'0.2em',fontWeight:600,marginBottom:24,textTransform:'uppercase' as const}}>{section.type} {section.type==='verse'?currentSection+1:''}</div>
            <div style={{fontSize:24,lineHeight:2.1,color:C.t1,fontWeight:300,whiteSpace:'pre-line',letterSpacing:'0.01em'}}>{section.content}</div>
          </>}
        </div>
        <div style={{padding:'14px 24px',background:C.bg0,borderTop:`1px solid ${C.b0}`,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <button onClick={()=>currentSection>0&&handleSectionClick(currentSection-1)} disabled={currentSection===0} style={{padding:'9px 18px',background:'none',border:`1px solid ${C.b1}`,color:C.t2,cursor:currentSection===0?'not-allowed':'pointer',fontSize:20,borderRadius:8,opacity:currentSection===0?0.3:1}}>‹</button>
          <div style={{fontSize:12,color:C.t3,flex:1,textAlign:'center'}}>{currentSection+1} / {sections.length}</div>
          <button onClick={()=>currentSection<sections.length-1&&handleSectionClick(currentSection+1)} disabled={currentSection===sections.length-1} style={{padding:'9px 18px',background:'none',border:`1px solid ${C.b1}`,color:C.t2,cursor:currentSection===sections.length-1?'not-allowed':'pointer',fontSize:20,borderRadius:8,opacity:currentSection===sections.length-1?0.3:1}}>›</button>
          <button className="shimmer-btn" onClick={()=>section&&goLive(selected.title,section.content)} style={{padding:'11px 28px',background:`linear-gradient(135deg,${C.live},#b91c1c)`,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:9,letterSpacing:'0.06em'}}>GO LIVE</button>
        </div>
      </div>
    )
    // Default: show hymnal grouped by language
    const LANG_LABELS: Record<string,string> = {
      en:'English', sn:'Shona', nd:'Ndebele', fr:'French',
      pt:'Portuguese', sw:'Swahili', zu:'Zulu', xh:'Xhosa', st:'Sotho',
    }
    const LANG_ORDER = ['en','sn','nd','fr','pt','sw','zu','xh','st']
    const LANG_COLORS = [C.p1, C.g1, C.live+'cc', C.safe+'cc', C.p2]
    const langLabel = (l:string) => LANG_LABELS[l] || (l.charAt(0).toUpperCase()+l.slice(1))
    const searchFiltered = query.trim().length>0 ? results : allSongs
    const hymnLangs = Array.from(new Set(allSongs.map(s=>s.language).filter(Boolean)))
      .sort((a,b)=>LANG_ORDER.indexOf(a)-LANG_ORDER.indexOf(b))
    // Auto-expand first lang on first load
    if(Object.keys(expandedHymnLangs).length===0 && hymnLangs.length>0) {
      setTimeout(()=>setExpandedHymnLangs({[hymnLangs[0]]:true}),0)
    }
    const byLang = hymnLangs.reduce((acc,lang)=>{
      acc[lang]=searchFiltered.filter(s=>s.language===lang)
      return acc
    },{} as Record<string,Song[]>)
    const btn2: React.CSSProperties = {cursor:'pointer',fontFamily:'inherit',border:'none',outline:'none',transition:'all 0.15s'}
    return (
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
        {/* Left: grouped song list */}
        <div style={{width:300,background:C.bg2,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{padding:'8px 14px',background:C.bg0,borderBottom:`1px solid ${C.b0}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
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
              const isOpen = expandedHymnLangs[lang]!==false
              const accent = LANG_COLORS[li%LANG_COLORS.length]
              return (
                <div key={lang}>
                  <button
                    onClick={()=>setExpandedHymnLangs(e=>({...e,[lang]:!isOpen}))}
                    style={{...btn2,width:'100%',padding:'10px 14px 10px 12px',
                      display:'flex',alignItems:'center',justifyContent:'space-between',
                      background:C.bg1,borderLeft:`3px solid ${accent}`,
                      borderBottom:`1px solid ${C.b0}`,color:C.t2,textAlign:'left' as const}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',color:accent}}>{langLabel(lang).toUpperCase()}</span>
                      <span style={{fontSize:9,color:C.t4,background:C.bg3,padding:'1px 7px',borderRadius:10,border:`1px solid ${C.b1}`}}>{group.length}</span>
                    </div>
                    <span style={{fontSize:9,color:C.t4}}>{isOpen?'▾':'▸'}</span>
                  </button>
                  {isOpen && group.map(song=>(
                    <div key={song.id} onClick={()=>handleSelectSong(song)}
                      {...dragSource(song.title,'song')}
                      style={{padding:'9px 14px 9px 15px',
                        borderLeft:`3px solid transparent`,
                        borderBottom:`1px solid ${C.b0}`,
                        background:C.bg2,cursor:'grab',transition:'all 0.1s'}}
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
                            padding:'1px 5px',background:`${C.g1}15`,border:`1px solid ${C.g1}33`,borderRadius:3}}>
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
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:C.t4,background:C.bg1}}>
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
    service:  [{id:'queue',label:'Queue'}],
    settings: [{id:'display',label:'Display'},{id:'import',label:'Import'},{id:'users',label:'Users'},{id:'about',label:'About'}],
  }

  const NAV_ICONS: Record<NavGroup,string> = {
    library:'♪', present:'▶', media:'◫', service:'☰', settings:'⚙'
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:C.bg0,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",overflow:'hidden',color:C.t1,fontSize:13,position:'relative'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;700&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.b2};border-radius:1px}
        input::placeholder,textarea::placeholder{color:${C.t4}}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${C.g2}88!important}
        @keyframes pulseGlow{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmerSweep{0%{left:-100%}60%,100%{left:150%}}
        .live-dot{animation:pulseGlow 1.8s ease-in-out infinite}
        .shimmer-btn{position:relative;overflow:hidden}
        .shimmer-btn::after{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,0.08),transparent);transform:skewX(-20deg);animation:shimmerSweep 4s ease infinite;pointer-events:none}
        .toast-anim{animation:slideDown 0.2s ease}
        .queue-anim{animation:slideUp 0.2s ease}
        .nav-icon:hover{background:${C.bg3}!important;color:${C.t2}!important}
        .sub-btn:hover{background:${C.bg3}!important;color:${C.t1}!important}
      `}</style>

      {/* Gold hairline */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:1,background:`linear-gradient(to right,transparent 0%,${C.g2}88 30%,${C.g3} 50%,${C.g2}88 70%,transparent 100%)`,zIndex:100,pointerEvents:'none'}}/>

      {/* ── TOPBAR ─────────────────────────────────────── */}
      <div style={{height:60,background:C.bg1,borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',flexShrink:0,zIndex:10,position:'relative'}}>
        {/* Logo */}
        <div style={{width:68,height:'100%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,borderRight:`1px solid ${C.b0}`}}>
          <svg width="27" height="27" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.g3}/><stop offset="100%" stopColor={C.g1}/></linearGradient>
              <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={C.p2}/><stop offset="100%" stopColor={C.g1}/></linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="none" stroke="url(#lg2)" strokeWidth="3"/>
            <text x="50" y="66" textAnchor="middle" fontSize="46" fill="url(#lg1)" fontFamily="'Noto Serif JP',serif" fontWeight="700">将</text>
          </svg>
        </div>
        <div style={{padding:'0 20px',borderRight:`1px solid ${C.b0}`,height:'100%',display:'flex',alignItems:'center',flexShrink:0}}>
          <span style={{fontFamily:"'Noto Serif JP',serif",fontSize:14,color:C.t1,letterSpacing:'0.05em'}}>将軍OS</span>
        </div>
        {/* Search */}
        <div style={{flex:1,maxWidth:400,display:'flex',alignItems:'center',background:C.bg2,border:`1px solid ${C.b1}`,borderRadius:5,padding:'0 14px',gap:10,margin:'0 22px'}}>
          <span style={{color:C.t3,fontSize:14,lineHeight:1}}>⌕</span>
          <input
            value={navGroup==='library'&&libTab==='bible'?bibleQuery:query}
            onChange={e=>navGroup==='library'&&libTab==='bible'?handleBibleSearch(e.target.value):handleSearch(e.target.value)}
            placeholder={navGroup==='library'&&libTab==='bible'?`Search ${bibleVersion}…`:navGroup==='library'&&libTab==='hymnal'?'Filter hymns…':'Search…'}
            style={{flex:1,background:'none',border:'none',color:C.t1,fontSize:13,outline:'none',padding:'8px 0',fontFamily:'inherit'}}
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
              {availableVersions.map(v=><option key={v} value={v} style={{background:C.bg2}}>{v}</option>)}
            </select>
          )}
        </div>
        <div style={{flex:1}}/>
        {/* Verse of day */}
        <button onClick={()=>setShowDailyPopup(true)} title="Verse of the Day"
          style={{background:'none',border:`1px solid ${C.b1}`,color:C.g2,cursor:'pointer',fontSize:13,width:36,height:36,borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginRight:16}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.g2}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.b1}}>✦</button>
        {currentUser&&(
          <div style={{display:'flex',alignItems:'center',gap:10,paddingLeft:18,paddingRight:18,borderLeft:`1px solid ${C.b0}`,height:'100%'}}>
            <div style={{width:5,height:5,borderRadius:'50%',background:C.safe,flexShrink:0}}/>
            <span style={{fontSize:12,color:C.t2}}>{currentUser.display_name}</span>
            <span style={{fontSize:10,color:C.t3,padding:'2px 8px',border:`1px solid ${C.b2}`,borderRadius:3}}>{currentUser.role}</span>
          </div>
        )}
        <div style={{fontSize:12,color:C.g2,fontVariantNumeric:'tabular-nums',minWidth:46,textAlign:'right',paddingLeft:18,paddingRight:20,borderLeft:`1px solid ${C.b0}`,height:'100%',display:'flex',alignItems:'center',fontFamily:"'Noto Serif JP',serif"}}>{clock}</div>
      </div>

      {/* ── SECTION NAV (horizontal — echoes Quelea's flat top menu, keeps our icon+label identity) ── */}
      <div style={{height:42,background:C.bg1,borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',flexShrink:0,padding:'0 14px',gap:2,overflowX:'auto'}}>
        {NAV.filter(([gid])=>gid!=='service').map(([gid,gLabel])=>{
          const active=navGroup===gid
          return (
            <button key={gid} onClick={()=>setNavGroup(gid as NavGroup)} className="nav-icon"
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:'none',border:'none',borderBottom:`2px solid ${active?C.g2:'transparent'}`,color:active?C.t1:C.t3,cursor:'pointer',fontSize:12.5,fontWeight:active?600:500,letterSpacing:'0.02em',whiteSpace:'nowrap' as const,transition:'all 0.12s',flexShrink:0}}>
              <span style={{fontSize:13,color:active?C.g2:C.t3}}>{(NAV_ICONS as any)[gid as string]}</span>
              {gLabel}
            </button>
          )
        })}
        {subItems[navGroup].length>0&&(
          <>
            <div style={{width:1,height:18,background:C.b1,margin:'0 8px',flexShrink:0}}/>
            {subItems[navGroup].map(sub=>{
              const active=activeSubId===sub.id
              return (
                <button key={sub.id} className="sub-btn"
                  onClick={()=>{
                    if(navGroup==='library'){setLibTab(sub.id as LibTab);if(sub.id!=='bible')setSelectedVerse(null)}
                    if(navGroup==='present')setPresentTab(sub.id as PresentTab)
                    if(navGroup==='settings')setSettingsTab(sub.id as SettingsTab)
                  }}
                  style={{padding:'6px 13px',background:active?C.bg4:'none',border:`1px solid ${active?C.b2:'transparent'}`,borderRadius:5,color:active?C.g2:C.t4,cursor:'pointer',fontFamily:'inherit',fontSize:11.5,fontWeight:active?600:400,whiteSpace:'nowrap' as const,flexShrink:0,transition:'all 0.1s'}}>
                  {sub.label}
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* ── BODY — three open panels, Quelea-style: Order of Service+Library / Preview / Live ── */}
      <div style={{flex:1,display:'flex',minHeight:0,overflow:'hidden'}}>

        {/* ── LEFT COLUMN ── */}
        <div style={{width:340,background:C.bg0,borderRight:`1px solid ${C.b0}`,display:'flex',flexDirection:'column',minHeight:0,flexShrink:0}}>

          {/* Order of Service — pinned, collapsible */}
          <div style={{flexShrink:0,display:'flex',flexDirection:'column',maxHeight:queueCollapsed?40:340,overflow:'hidden',borderBottom:`1px solid ${C.b0}`,transition:'max-height 0.15s ease'}}>
            <div style={{padding:queueCollapsed?'10px 16px':'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:9}}>
                <span style={{fontSize:9,color:C.t4,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase' as const}}>Order of Service</span>
                {queue.length>0&&<span style={{fontSize:10,color:C.g2,padding:'2px 7px',border:`1px solid ${C.b2}`,borderRadius:3}}>{queue.length}</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                {!queueCollapsed&&queue.length>0&&<button onClick={clearQueue} style={{background:'none',border:'none',color:C.t4,cursor:'pointer',fontSize:11,fontFamily:'inherit',padding:'2px 6px'}}>clear</button>}
                <button onClick={()=>setQueueCollapsed(v=>!v)} title={queueCollapsed?'Expand':'Collapse'}
                  style={{background:'none',border:`1px solid ${C.b1}`,color:C.t3,cursor:'pointer',fontSize:11,width:20,height:20,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {queueCollapsed?'▾':'▴'}
                </button>
              </div>
            </div>
            {!queueCollapsed&&(
              <div onDragOver={onQueueZoneDragOver} onDragLeave={onQueueZoneDragLeave} onDrop={onQueueZoneDrop}
                style={{overflowY:'auto',padding:'0 14px 12px',minHeight:60,background:queueDragOver?`${C.g2}08`:'transparent',transition:'background 0.15s'}}>
                {queue.length===0&&(
                  <div style={{padding:'22px 14px',fontSize:12,color:queueDragOver?C.g2:C.t4,textAlign:'center',lineHeight:1.7,border:`1.5px dashed ${queueDragOver?C.g2:C.b1}`,borderRadius:8}}>
                    {queueDragOver?'Drop to add to queue':'Drag hymns, verses or slides here to build the order of service'}
                  </div>
                )}
                {queue.map((item,i)=>(
                  <div key={item.id}
                    draggable onDragStart={e=>onQueueItemDragStart(e,i)} onDragOver={onQueueItemDragOver} onDrop={e=>onQueueItemDrop(e,i)} onDragEnd={onQueueItemDragEnd}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',marginBottom:6,borderRadius:6,background:i===0?C.bg3:C.bg2,border:`1px solid ${i===0?C.b2:C.b0}`,cursor:'grab',opacity:draggedQueueIdx===i?0.3:1,transition:'opacity 0.12s'}}>
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
              <div className="toast-anim" style={{padding:'6px 14px',background:C.bg3,borderBottom:`1px solid ${C.b0}`,fontSize:11,color:C.t2,flexShrink:0,display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:4,height:4,borderRadius:'50%',background:C.g2,flexShrink:0}}/>
                {toast}
              </div>
            )}
            <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
              {renderContent()}
            </div>
          </div>
        </div>

        {/* ── CENTRE — PREVIEW (full-height open panel) ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',borderRight:`1px solid ${C.b0}`,minWidth:0,background:C.bg0}}>
          <div style={{padding:'12px 20px',borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <span style={{fontSize:11,color:C.t2,letterSpacing:'0.08em',fontWeight:600,textTransform:'uppercase' as const}}>Preview</span>
            <button onClick={()=>{
              if(navGroup==='library'){
                if(libTab==='hymnal'&&selected&&section) goLive(selected.title,section.content)
                else if(libTab==='bible'&&selectedVerse) goLive(`${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`,selectedVerse.text)
              }
            }} className="shimmer-btn"
              style={{padding:'7px 20px',background:C.p2,border:`1px solid ${C.p1}`,color:'#fff',fontSize:11.5,fontWeight:700,cursor:'pointer',fontFamily:"'Noto Serif JP','Inter',sans-serif",borderRadius:5,letterSpacing:'0.04em',flexShrink:0,transition:'background 0.15s'}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=C.p1}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=C.p2}}>
              Go Live
            </button>
          </div>
          <div
            onDragOver={onPreviewDragOver} onDragLeave={onPreviewDragLeave} onDrop={onPreviewDrop}
            style={{flex:1,background:'#0a0606',overflow:'hidden',border:`1px solid ${previewDragOver?C.g2:'transparent'}`,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s',boxShadow:previewDragOver?`inset 0 0 24px ${C.g2}22`:'none',margin:10,borderRadius:6}}>
            {section
              ?<div style={{fontSize:15,color:C.t2,lineHeight:1.8,padding:32,textAlign:'center',fontStyle:'italic',fontFamily:"'Noto Serif JP',Georgia,serif"}}>{section.content.substring(0,200)}…</div>
              :<div style={{fontSize:12,color:previewDragOver?C.g2:C.t4}}>{previewDragOver?'Drop to preview':'Nothing selected'}</div>
            }
          </div>
        </div>

        {/* ── RIGHT — LIVE (full-height open panel) ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,background:C.bg0}}>
          <div style={{padding:'12px 20px',borderBottom:`1px solid ${C.b0}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <span style={{fontSize:11,color:C.t2,letterSpacing:'0.08em',fontWeight:600,textTransform:'uppercase' as const}}>Live</span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              {live&&<div className="live-dot" style={{width:6,height:6,borderRadius:'50%',background:C.live,boxShadow:`0 0 6px ${C.live}`}}/>}
              <span style={{fontSize:10,color:live?C.live:C.t4,fontWeight:live?600:400}}>{live?'On air':'Standby'}</span>
            </div>
          </div>
          <div
            onDragOver={onLiveDragOver} onDragLeave={onLiveDragLeave} onDrop={onLiveDrop}
            style={{flex:1,background:'#000',overflow:'hidden',border:`1px solid ${liveDragOver?C.live+'cc':live?C.live+'55':'transparent'}`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:live?`inset 0 0 40px ${C.live}22`:'none',transition:'all 0.2s',margin:10,borderRadius:6}}>
            {liveDragOver
              ?<div style={{fontSize:13,color:C.live,fontWeight:600}}>Drop to go live</div>
              :live
                ?<div style={{fontSize:15,color:'#fff',padding:32,textAlign:'center',lineHeight:1.7,fontFamily:"'Noto Serif JP',Georgia,serif"}}>{live}</div>
                :<div style={{fontSize:12,color:C.t4}}>Not presenting</div>
            }
          </div>
        </div>

      </div>

      {/* ── FOOTER CONTROL BAR ── */}
      <div style={{height:56,background:C.bg1,borderTop:`1px solid ${C.b0}`,display:'flex',alignItems:'center',gap:14,padding:'0 20px',flexShrink:0}}>
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

        <div style={{flex:1}}/>

        <select value={selectedDisplay} onChange={e=>setSelectedDisplay(Number(e.target.value))}
          style={{background:C.bg2,border:`1px solid ${C.b1}`,color:C.t2,padding:'8px 12px',fontSize:11,outline:'none',fontFamily:'inherit',borderRadius:5,flexShrink:0}}>
          {displays.map(d=><option key={d.id} value={d.id}>{d.label}{d.isPrimary?' (Primary)':''}</option>)}
        </select>
      </div>

      {/* ── DAILY VERSE POPUP ── */}
      {showDailyPopup&&(
        <div onClick={()=>setShowDailyPopup(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.bg2,border:`1px solid ${C.b2}`,borderRadius:8,padding:40,maxWidth:540,width:'90%',position:'relative',boxShadow:`0 40px 80px rgba(0,0,0,0.9)`}}>
            <div style={{position:'absolute',top:0,left:40,right:40,height:1,background:`linear-gradient(to right,transparent,${C.g2},transparent)`}}/>
            <button onClick={()=>setShowDailyPopup(false)}
              style={{position:'absolute',top:14,right:16,background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18,lineHeight:1,padding:4}}>×</button>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
              <span style={{fontSize:22,color:C.g2,fontFamily:"'Noto Serif JP',serif"}}>✦</span>
              <div>
                <div style={{fontSize:10,color:C.g2,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase' as const,marginBottom:2}}>Verse of the Day</div>
                <div style={{fontSize:11,color:C.t3}}>{new Date().toLocaleDateString('en-ZW',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
              </div>
            </div>
            {dailyVerse?(
              <>
                <div style={{fontSize:11,color:C.g2,marginBottom:12}}>{dailyVerse.book} {dailyVerse.chapter}:{dailyVerse.verse} — {dailyVerse.version}</div>
                <div style={{fontSize:20,lineHeight:1.9,color:C.t1,fontStyle:'italic',fontWeight:300,fontFamily:"'Noto Serif JP',Georgia,serif",marginBottom:20}}>"{dailyVerse.text}"</div>
                <div style={{padding:'12px 16px',background:C.bg3,borderRadius:5,border:`1px solid ${C.b1}`,marginBottom:24,fontSize:12,color:C.t3,lineHeight:1.7,fontStyle:'italic'}}>
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