import React, { useState, useEffect, useCallback, useMemo } from 'react'

// Same design tokens as App.tsx/MediaTab.tsx, pointed at the shared CSS
// variables (see index.css) so dark mode applies here too.
const C = {
  bg0:'var(--bg0)', bg1:'var(--bg1)', bg2:'var(--bg2)', bg3:'var(--bg3)', bg4:'var(--bg4)', bg5:'var(--bg5)',
  tex0:'var(--tbg0)', tex1:'var(--tbg1)', tex2:'var(--tbg2)', tex3:'var(--tbg3)',
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
const WEEKDAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT']

function fmtDate(iso: string) {
  // iso is YYYY-MM-DD — parse manually to avoid timezone shifting the day
  const [y,m,d] = iso.split('-').map(Number)
  const dt = new Date(y, (m||1)-1, d||1)
  return dt.toLocaleDateString('en-ZW', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
}
function fmtDateShort(iso: string) {
  const [y,m,d] = iso.split('-').map(Number)
  const dt = new Date(y, (m||1)-1, d||1)
  return dt.toLocaleDateString('en-ZW', { weekday:'long', month:'long', day:'numeric' })
}
function monthLabel(iso: string) {
  const [y,m] = iso.split('-').map(Number)
  return new Date(y, (m||1)-1, 1).toLocaleDateString('en-ZW', { month:'long', year:'numeric' })
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayISO() { return toISO(new Date()) }
function daysUntil(iso: string) {
  const [y,m,d] = iso.split('-').map(Number)
  const target = new Date(y,(m||1)-1,d||1).getTime()
  const now = new Date(); now.setHours(0,0,0,0)
  return Math.round((target - now.getTime()) / 86400000)
}

// Builds the visible grid of day cells for a given month (Sun-start weeks,
// padded with the trailing days of the previous/next month so every row
// is a full week — no ragged edges on a "paper calendar page").
function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks = Math.ceil((startOffset + daysInMonth) / 7)
  const today = todayISO()
  const cells: { iso: string; day: number; inMonth: boolean; isToday: boolean }[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i)
    const iso = toISO(d)
    cells.push({ iso, day: d.getDate(), inMonth: d.getMonth() === month, isToday: iso === today })
  }
  return cells
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

  const now = new Date()
  const [viewYear, setViewYear]   = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string|null>(null)

  const api = (window as any).shogunos

  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents(await api.getCalendarEvents()) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [])

  function openNew(prefillDate?: string) {
    setEditing(null); setTitle(''); setDate(prefillDate || selectedDate || todayISO()); setTime(''); setNotes(''); setColor(SWATCHES[0])
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

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return map
  }, [events])

  const gridCells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  function shiftMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    setViewMonth(m); setViewYear(y)
  }
  function jumpToday() {
    setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); setSelectedDate(todayISO())
  }
  function clickDay(iso: string, inMonth: boolean) {
    if (!inMonth) {
      // Clicking a faded lead-in/trail day jumps the grid to that month too.
      const [y,m] = iso.split('-').map(Number)
      setViewYear(y); setViewMonth((m||1)-1)
    }
    setSelectedDate(prev => prev === iso ? null : iso)
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

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : []

  const inp: React.CSSProperties = { width:'100%', background:C.tex2, border:`1px solid ${C.b1}`, color:C.t1, padding:'9px 12px', fontSize:13, outline:'none', fontFamily:'inherit', borderRadius:8 }
  const lbl: React.CSSProperties = { fontSize:10, color:C.t3, fontWeight:700, marginBottom:6, display:'block', letterSpacing:'0.06em', textTransform:'uppercase' as const }

  function EventRow({ ev, dense = false }: { ev: CalendarEvent; dense?: boolean }) {
    const dleft = daysUntil(ev.date)
    return (
      <div onClick={()=>openEdit(ev)}
        style={{ display:'flex', alignItems:'center', gap:14, padding: dense ? '10px 14px' : '13px 16px', background:C.tex2, border:`1px solid ${C.b1}`, borderRadius:10, cursor:'pointer', transition:'border-color 0.1s' }}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.b2}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.b1}}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:ev.color, flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, color:C.t1, fontWeight:600, marginBottom:2 }}>{ev.title}</div>
          <div style={{ fontSize:11, color:C.t3 }}>
            {dense ? (ev.time || 'All day') : fmtDate(ev.date)}{!dense && ev.time && ` · ${ev.time}`}
            {ev.notes && ` — ${ev.notes}`}
          </div>
        </div>
        {!dense && !showPast && dleft>=0 && (
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
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden', background:C.tex1 }}>
      <div style={{ padding:'16px 28px', borderBottom:`1px solid ${C.b0}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.2em', color:C.t4, textTransform:'uppercase' as const, marginBottom:4 }}>Events Calendar</div>
          <div style={{ fontSize:12, color:C.t3 }}>Keep track of services, rehearsals and important dates</div>
        </div>
        <button className="glass-primary" onClick={()=>openNew()} style={{ padding:'10px 18px', background:`linear-gradient(135deg,${C.accent},${C.accentD})`, border:'none', color:'#fff', fontSize:12, fontWeight:700, fontFamily:'inherit', letterSpacing:'0.03em' }}>+ Add Event</button>
      </div>

      <div style={{ flex:1, display:'flex', gap:24, overflow:'hidden', padding:'20px 28px 28px' }}>

        {/* ── Month grid — the "paper calendar page" ─────────────────────── */}
        <div style={{ width:400, flexShrink:0, display:'flex', flexDirection:'column', background:C.tex2, border:`1px solid ${C.b1}`, borderRadius:14, padding:18, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <button onClick={()=>shiftMonth(-1)} style={{ width:28, height:28, background:'none', border:`1px solid ${C.b1}`, color:C.t2, fontSize:14, cursor:'pointer', borderRadius:7, fontFamily:'inherit' }}>‹</button>
            <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
              <div style={{ fontSize:17, fontWeight:700, color:C.t1, fontFamily:'Georgia, serif', letterSpacing:'0.01em' }}>
                {new Date(viewYear, viewMonth, 1).toLocaleDateString('en-ZW', { month:'long' })}
              </div>
              <div style={{ fontSize:13, color:C.t3, fontFamily:'Georgia, serif' }}>{viewYear}</div>
            </div>
            <button onClick={()=>shiftMonth(1)} style={{ width:28, height:28, background:'none', border:`1px solid ${C.b1}`, color:C.t2, fontSize:14, cursor:'pointer', borderRadius:7, fontFamily:'inherit' }}>›</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ textAlign:'center', fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:C.t4, padding:'2px 0 8px' }}>{w[0]}</div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridAutoRows:'1fr', gap:4, flex:1 }}>
            {gridCells.map(cell => {
              const dayEvents = eventsByDate.get(cell.iso) || []
              const isSelected = selectedDate === cell.iso
              return (
                <div key={cell.iso} onClick={()=>clickDay(cell.iso, cell.inMonth)}
                  style={{
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', gap:3,
                    padding:'6px 2px', borderRadius:8, cursor:'pointer', minHeight:44,
                    background: isSelected ? `color-mix(in srgb, ${C.accent} 16%, transparent)` : cell.isToday ? `color-mix(in srgb, ${C.gold} 14%, transparent)` : 'transparent',
                    border: isSelected ? `1px solid ${C.accent}` : cell.isToday ? `1px solid ${C.gold}` : '1px solid transparent',
                    opacity: cell.inMonth ? 1 : 0.35,
                    transition:'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e=>{ if(!isSelected && !cell.isToday) (e.currentTarget as HTMLElement).style.background = C.bg3 }}
                  onMouseLeave={e=>{ if(!isSelected && !cell.isToday) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ fontSize:12, fontWeight: cell.isToday ? 800 : 500, color: isSelected ? C.accent : cell.isToday ? C.gold : C.t1 }}>{cell.day}</div>
                  <div style={{ display:'flex', gap:2, height:5, alignItems:'center' }}>
                    {dayEvents.slice(0,3).map(e => (
                      <div key={e.id} style={{ width:5, height:5, borderRadius:'50%', background:e.color }}/>
                    ))}
                    {dayEvents.length > 3 && <div style={{ fontSize:7, color:C.t4, fontWeight:700 }}>+{dayEvents.length-3}</div>}
                  </div>
                </div>
              )
            })}
          </div>

          <button onClick={jumpToday} style={{ marginTop:14, padding:'8px 0', background:'none', border:`1px solid ${C.b1}`, color:C.t3, fontSize:11, fontWeight:600, cursor:'pointer', borderRadius:8, fontFamily:'inherit' }}>Jump to Today</button>
        </div>

        {/* ── Agenda / detail panel ───────────────────────────────────────── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
          {selectedDate ? (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.14em', color:C.t4, textTransform:'uppercase' as const, marginBottom:3 }}>Selected Day</div>
                  <div style={{ fontSize:15, fontWeight:700, color:C.t1, fontFamily:'Georgia, serif' }}>{fmtDateShort(selectedDate)}</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>openNew(selectedDate)} style={{ padding:'7px 14px', background:C.bg3, border:`1px solid ${C.b1}`, color:C.t1, fontSize:11, fontWeight:600, cursor:'pointer', borderRadius:7, fontFamily:'inherit' }}>+ Add Here</button>
                  <button onClick={()=>setSelectedDate(null)} style={{ padding:'7px 14px', background:'none', border:`1px solid ${C.b1}`, color:C.t3, fontSize:11, cursor:'pointer', borderRadius:7, fontFamily:'inherit' }}>Show All ×</button>
                </div>
              </div>
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                {selectedEvents.length===0 && (
                  <div style={{ padding:'50px 20px', textAlign:'center', color:C.t4 }}>
                    <div style={{ fontSize:13 }}>Nothing on the calendar for this day</div>
                  </div>
                )}
                {selectedEvents.map(ev => <EventRow key={ev.id} ev={ev} dense/>)}
              </div>
            </>
          ) : (
            <>
              <div style={{ display:'flex', gap:6, marginBottom:14, flexShrink:0 }}>
                <button className="glass-seg" onClick={()=>setShowPast(false)} style={{ padding:'6px 14px', fontSize:11, fontWeight:700, border:`1px solid ${!showPast?C.accent:C.b1}`, color:!showPast?C.accent:C.t3, background:!showPast?`color-mix(in srgb, ${C.accent} 8%, transparent)`:'none', cursor:'pointer', fontFamily:'inherit', borderRadius:7 }}>
                  Upcoming {upcoming.length>0 && `(${upcoming.length})`}
                </button>
                <button className="glass-seg" onClick={()=>setShowPast(true)} style={{ padding:'6px 14px', fontSize:11, fontWeight:700, border:`1px solid ${showPast?C.accent:C.b1}`, color:showPast?C.accent:C.t3, background:showPast?`color-mix(in srgb, ${C.accent} 8%, transparent)`:'none', cursor:'pointer', fontFamily:'inherit', borderRadius:7 }}>
                  Past {past.length>0 && `(${past.length})`}
                </button>
              </div>
              <div style={{ flex:1, overflowY:'auto' }}>
                {!loading && grouped.length===0 && (
                  <div style={{ padding:'60px 20px', textAlign:'center', color:C.t4 }}>
                    <div style={{ fontSize:32, opacity:0.15, marginBottom:10 }}>暦</div>
                    <div style={{ fontSize:13 }}>{showPast ? 'No past events' : 'No upcoming events yet — add one, or click a date on the calendar'}</div>
                  </div>
                )}
                {grouped.map(group => (
                  <div key={group.label} style={{ marginBottom:22 }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.14em', color:C.t4, textTransform:'uppercase' as const, marginBottom:10 }}>{group.label}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {group.items.map(ev => <EventRow key={ev.id} ev={ev}/>)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(4,5,8,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }} onClick={()=>setShowForm(false)}>
          <div style={{ background:C.tex1, border:`1px solid ${C.b1}`, borderRadius:12, width:420, maxWidth:'90vw', padding:24, display:'flex', flexDirection:'column', gap:14 }} onClick={e=>e.stopPropagation()}>
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
              <button className="glass-primary" onClick={save} style={{ padding:'9px 18px', background:`linear-gradient(135deg,${C.accent},${C.accentD})`, border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{editing?'Save Changes':'Add Event'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
