import React, { useState, useEffect, useCallback, useMemo } from 'react'

// Same design tokens as App.tsx/MediaTab.tsx, pointed at the shared CSS
// variables (see index.css) so dark mode applies here too.
const C = {
  bg0:'var(--bg0)', bg1:'var(--bg1)', bg2:'var(--bg2)', bg3:'var(--bg3)', bg4:'var(--bg4)', bg5:'var(--bg5)',
  b0:'var(--b0)', b1:'var(--b1)', b2:'var(--b2)',
  accent:'var(--g2)', accentL:'var(--g3)', accentD:'var(--g1)',
  gold:'var(--gold)', goldL:'var(--goldL)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)', t4:'var(--t4)',
  red:'var(--live)', green:'var(--safe)',
}

export interface CalendarEvent {
  id: number; title: string; date: string; time: string | null
  notes: string; color: string; created_at: string
}

const SWATCHES = ['#c22430','#145a9e','#47623f','#b3941f','#8f1620','#6e5115','#374a86','#a3242e']

function fmtDate(iso: string) {
  // iso is YYYY-MM-DD — parse manually to avoid timezone shifting the day
  const [y,m,d] = iso.split('-').map(Number)
  const dt = new Date(y, (m||1)-1, d||1)
  return dt.toLocaleDateString('en-ZW', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
}
function monthLabel(iso: string) {
  const [y,m] = iso.split('-').map(Number)
  return new Date(y, (m||1)-1, 1).toLocaleDateString('en-ZW', { month:'long', year:'numeric' })
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function daysUntil(iso: string) {
  const [y,m,d] = iso.split('-').map(Number)
  const target = new Date(y,(m||1)-1,d||1).getTime()
  const now = new Date(); now.setHours(0,0,0,0)
  return Math.round((target - now.getTime()) / 86400000)
}

interface Props { notify: (msg:string) => void }

export default function CalendarTab({ notify }: Props) {
  const [events, setEvents]           = useState<CalendarEvent[]>([])
  const [loading, setLoading]         = useState(false)
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState<CalendarEvent|null>(null)
  const [title, setTitle]             = useState('')
  const [date, setDate]               = useState(todayISO())
  const [time, setTime]               = useState('')
  const [notes, setNotes]             = useState('')
  const [color, setColor]             = useState(SWATCHES[0])
  const [confirmDelete, setConfirmDelete] = useState<number|null>(null)
  const [showPast, setShowPast]       = useState(false)

  const api = (window as any).shogunos

  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents(await api.getCalendarEvents()) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null); setTitle(''); setDate(todayISO()); setTime(''); setNotes(''); setColor(SWATCHES[0])
    setShowForm(true)
  }
  function openEdit(ev: CalendarEvent) {
    setEditing(ev); setTitle(ev.title); setDate(ev.date); setTime(ev.time||''); setNotes(ev.notes||''); setColor(ev.color||SWATCHES[0])
    setShowForm(true)
  }

  async function save() {
    if (!title.trim() || !date) { notify('Give the event a title and date'); return }
    const data = { title: title.trim(), date, time: time || null, notes: notes.trim(), color }
    if (editing) await api.updateCalendarEvent(editing.id, data)
    else await api.createCalendarEvent(data)
    setShowForm(false)
    await load()
    notify(editing ? 'Event updated' : 'Event saved')
  }

  async function remove(id: number) {
    await api.deleteCalendarEvent(id)
    setConfirmDelete(null)
    await load()
    notify('Event removed')
  }

  const { upcoming, past } = useMemo(() => {
    const today = todayISO()
    const up: CalendarEvent[] = [], pa: CalendarEvent[] = []
    for (const e of events) (e.date >= today ? up : pa).push(e)
    pa.sort((a,b) => b.date.localeCompare(a.date))
    return { upcoming: up, past: pa }
  }, [events])

  const grouped = useMemo(() => {
    const list = showPast ? past : upcoming
    const groups: { label:string; items:CalendarEvent[] }[] = []
    for (const e of list) {
      const label = monthLabel(e.date)
      let g = groups.find(g => g.label === label)
      if (!g) { g = { label, items: [] }; groups.push(g) }
      g.items.push(e)
    }
    return groups
  }, [upcoming, past, showPast])

  const inp: React.CSSProperties = { width:'100%', background:C.bg2, border:`1px solid ${C.b1}`, color:C.t1, padding:'9px 12px', fontSize:13, outline:'none', fontFamily:'inherit', borderRadius:8 }
  const lbl: React.CSSProperties = { fontSize:10, color:C.t3, fontWeight:700, marginBottom:6, display:'block', letterSpacing:'0.06em', textTransform:'uppercase' as const }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden', background:C.bg1 }}>
      <div style={{ padding:'16px 28px', borderBottom:`1px solid ${C.b0}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.2em', color:C.t4, textTransform:'uppercase' as const, marginBottom:4 }}>Events Calendar</div>
          <div style={{ fontSize:12, color:C.t3 }}>Keep track of services, rehearsals and important dates</div>
        </div>
        <button onClick={openNew} style={{ padding:'10px 18px', background:`linear-gradient(135deg,${C.accent},${C.accentD})`, border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', borderRadius:8, letterSpacing:'0.03em' }}>+ Add Event</button>
      </div>

      <div style={{ padding:'12px 28px 0', display:'flex', gap:6, flexShrink:0 }}>
        <button onClick={()=>setShowPast(false)} style={{ padding:'6px 14px', fontSize:11, fontWeight:700, border:`1px solid ${!showPast?C.accent:C.b1}`, color:!showPast?C.accent:C.t3, background:!showPast?`color-mix(in srgb, ${C.accent} 8%, transparent)`:'none', cursor:'pointer', fontFamily:'inherit', borderRadius:7 }}>
          Upcoming {upcoming.length>0 && `(${upcoming.length})`}
        </button>
        <button onClick={()=>setShowPast(true)} style={{ padding:'6px 14px', fontSize:11, fontWeight:700, border:`1px solid ${showPast?C.accent:C.b1}`, color:showPast?C.accent:C.t3, background:showPast?`color-mix(in srgb, ${C.accent} 8%, transparent)`:'none', cursor:'pointer', fontFamily:'inherit', borderRadius:7 }}>
          Past {past.length>0 && `(${past.length})`}
        </button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px 28px 28px' }}>
        {!loading && grouped.length===0 && (
          <div style={{ padding:'60px 20px', textAlign:'center', color:C.t4 }}>
            <div style={{ fontSize:32, opacity:0.15, marginBottom:10 }}>暦</div>
            <div style={{ fontSize:13 }}>{showPast ? 'No past events' : 'No upcoming events yet — add one to get started'}</div>
          </div>
        )}
        {grouped.map(group => (
          <div key={group.label} style={{ marginBottom:22 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.14em', color:C.t4, textTransform:'uppercase' as const, marginBottom:10 }}>{group.label}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {group.items.map(ev => {
                const dleft = daysUntil(ev.date)
                return (
                  <div key={ev.id} onClick={()=>openEdit(ev)}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', background:C.bg2, border:`1px solid ${C.b1}`, borderRadius:10, cursor:'pointer', transition:'border-color 0.1s' }}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.b2}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.b1}}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:ev.color, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, color:C.t1, fontWeight:600, marginBottom:2 }}>{ev.title}</div>
                      <div style={{ fontSize:11, color:C.t3 }}>
                        {fmtDate(ev.date)}{ev.time && ` · ${ev.time}`}
                        {ev.notes && ` — ${ev.notes}`}
                      </div>
                    </div>
                    {!showPast && dleft>=0 && (
                      <div style={{ fontSize:10, fontWeight:700, color:dleft===0?C.red:C.t4, flexShrink:0, letterSpacing:'0.04em' }}>
                        {dleft===0?'TODAY':dleft===1?'TOMORROW':`IN ${dleft} DAYS`}
                      </div>
                    )}
                    {confirmDelete===ev.id ? (
                      <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>remove(ev.id)} style={{ padding:'5px 10px', background:C.red, border:'none', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', borderRadius:6 }}>Delete</button>
                        <button onClick={()=>setConfirmDelete(null)} style={{ padding:'5px 10px', background:'none', border:`1px solid ${C.b1}`, color:C.t3, fontSize:10, cursor:'pointer', borderRadius:6 }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={e=>{e.stopPropagation();setConfirmDelete(ev.id)}} style={{ background:'none', border:'none', color:C.t4, cursor:'pointer', fontSize:16, padding:4, flexShrink:0 }}>×</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(4,5,8,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }} onClick={()=>setShowForm(false)}>
          <div style={{ background:C.bg1, border:`1px solid ${C.b1}`, borderRadius:12, width:420, maxWidth:'90vw', padding:24, display:'flex', flexDirection:'column', gap:14 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{editing ? 'Edit Event' : 'New Event'}</div>
            <div>
              <label style={lbl}>Title</label>
              <input style={inp} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Youth Rally, Choir Rehearsal…" autoFocus/>
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Date</label>
                <input type="date" style={inp} value={date} onChange={e=>setDate(e.target.value)}/>
              </div>
              <div style={{ flex:1 }}>
                <label style={lbl}>Time (optional)</label>
                <input type="time" style={inp} value={time} onChange={e=>setTime(e.target.value)}/>
              </div>
            </div>
            <div>
              <label style={lbl}>Notes (optional)</label>
              <textarea style={{ ...inp, resize:'vertical' as const }} rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Location, who's involved, anything to remember…"/>
            </div>
            <div>
              <label style={lbl}>Color</label>
              <div style={{ display:'flex', gap:6 }}>
                {SWATCHES.map(sw => (
                  <div key={sw} onClick={()=>setColor(sw)} style={{ width:26, height:26, borderRadius:'50%', background:sw, cursor:'pointer', border:color===sw?`2px solid ${C.t1}`:'2px solid transparent', boxShadow:color===sw?`0 0 0 2px ${C.bg1}`:'none' }}/>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:6 }}>
              {editing && (
                <button onClick={()=>{remove(editing.id);setShowForm(false)}} style={{ padding:'9px 16px', background:'none', border:`1px solid ${C.b1}`, color:C.red, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', borderRadius:8, marginRight:'auto' }}>Delete</button>
              )}
              <button onClick={()=>setShowForm(false)} style={{ padding:'9px 16px', background:'none', border:`1px solid ${C.b1}`, color:C.t3, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', borderRadius:8 }}>Cancel</button>
              <button onClick={save} style={{ padding:'9px 18px', background:`linear-gradient(135deg,${C.accent},${C.accentD})`, border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', borderRadius:8 }}>{editing?'Save Changes':'Add Event'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
