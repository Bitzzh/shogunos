import http from 'node:http'
import os from 'node:os'
import type { BrowserWindow } from 'electron'
import { searchSongs, getSongSections, getMediaFolders, getMediaItems } from './database'

// ── ShogunOS Remote Control ─────────────────────────────────────────────────
// A dependency-free LAN server so a phone/tablet on the same Wi-Fi can drive
// the live output — the #1 feature gap versus FreeShow/ProPresenter. No
// websocket lib, no express: just node:http + short polling from the page,
// which is plenty responsive for "next slide" over a local network and keeps
// the main-process bundle free of extra dependencies to package.
//
// Security model: this is a LAN-only convenience tool, not a public server.
// Connecting requires the 4-digit PIN shown in Settings → Remote (regenerated
// every app start) or a QR code that encodes it — see qr-encode.ts, rendered
// on the Settings → Remote screen. A successful PIN check issues a per-device
// session token; every request after that carries the token instead of the
// PIN, so the operator can see who's connected and disconnect a specific
// device (Settings → Remote → Connected Devices) without having to change
// the PIN for everyone else in the room.

export interface RemoteStyle {
  bgColor?: string
  fontColor?: string
  fontSize?: number
  textAlign?: string
  fontFamily?: string
}

export interface RemoteState {
  live: string | null
  blankScreen: boolean
  currentSection: number
  totalSections: number
  sectionPreview: string
  queue: { id: string; title: string; type: string }[]
  style?: RemoteStyle
}

export interface RemoteDevice { token: string; label: string; lastSeen: number }

let server: http.Server | null = null
let pin = ''
let boundPort: number | null = null
let starting = false
let state: RemoteState = { live: null, blankScreen: false, currentSection: 0, totalSections: 0, sectionPreview: '', queue: [] }

// ── SESSIONS ─────────────────────────────────────────────────────────────────
// One token per connected device (issued after a correct PIN), not one PIN
// shared forever — this is what lets the operator kick a single phone.
interface Session { label: string; lastSeen: number }
const sessions = new Map<string, Session>()
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000 // a service, not a persistent login — stale sessions age out

function pruneSessions() {
  const cutoff = Date.now() - SESSION_MAX_AGE_MS
  for (const [token, s] of sessions) if (s.lastSeen < cutoff) sessions.delete(token)
}
function genToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function authToken(url: URL, body: any): string | null {
  const token = url.searchParams.get('token') || body?.token
  if (!token) return null
  const s = sessions.get(token)
  if (!s) return null
  s.lastSeen = Date.now()
  return token
}
export function kickDevice(token: string) { sessions.delete(token) }
export function listDevices(): RemoteDevice[] {
  pruneSessions()
  return Array.from(sessions.entries()).map(([token, s]) => ({ token, label: s.label, lastSeen: s.lastSeen }))
}

function genPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function lanAddresses(): string[] {
  const nets = os.networkInterfaces()
  const out: string[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

function send(res: http.ServerResponse, status: number, body: string, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' })
  res.end(body)
}
function unauthorized(res: http.ServerResponse) { send(res, 401, JSON.stringify({ error: 'unauthorized' })) }

export function updateRemoteState(next: RemoteState) {
  state = next
}

export function getRemoteInfo() {
  if (boundPort == null) return { port: null, pin: '', urls: [] as string[], devices: [] as RemoteDevice[] }
  return { port: boundPort, pin, urls: lanAddresses().map(ip => `http://${ip}:${boundPort}`), devices: listDevices() }
}

// Small DB-side helpers — the remote server runs in the main process, so it
// already shares the same in-memory database as the rest of the app and can
// resolve a song/media lookup itself instead of round-tripping into the
// renderer just to read data.
function findSongById(id: number) {
  return searchSongs('').find((s: any) => s.id === id) || null
}
function findMediaItemById(id: number): any | null {
  for (const folder of getMediaFolders()) {
    const item = getMediaItems(folder.id).find((it: any) => it.id === id)
    if (item) return item
  }
  return null
}

// Tries PREFERRED_PORT, then a handful of ports after it, in case something
// else on the machine (or a leftover ShogunOS process from a dev hot-reload
// that didn't shut down cleanly) is already holding the port. Previously an
// EADDRINUSE here had no 'error' listener attached, which Node treats as an
// uncaught exception and crashes the *entire* Electron app on startup —
// that's the "JavaScript error occurred in the main process" dialog.
const PREFERRED_PORT = 51820
const MAX_PORT_ATTEMPTS = 10

export function startRemoteServer(getMainWindow: () => BrowserWindow | undefined, port = PREFERRED_PORT) {
  // Idempotent: if we're already listening (or mid-attempt), don't spin up a
  // second server. This guards against the function ever being called twice
  // in one process.
  if (server || starting) return getRemoteInfo()
  starting = true
  pin = genPin()

  function readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise(resolve => {
      let raw = ''
      req.on('data', c => { raw += c })
      req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    })
  }

  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, REMOTE_HTML, 'text/html')
    }

    if (req.method === 'POST' && url.pathname === '/api/connect') {
      readBody(req).then(body => {
        if ((body?.pin || '') !== pin) return send(res, 401, JSON.stringify({ error: 'bad pin' }))
        const token = genToken()
        sessions.set(token, { label: String(body?.label || 'Device').slice(0, 40), lastSeen: Date.now() })
        send(res, 200, JSON.stringify({ token }))
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      if (!authToken(url, null)) return unauthorized(res)
      return send(res, 200, JSON.stringify(state))
    }

    if (req.method === 'GET' && url.pathname === '/api/songs') {
      if (!authToken(url, null)) return unauthorized(res)
      const q = url.searchParams.get('q') || ''
      const songs = searchSongs(q).slice(0, 50).map((s: any) => ({ id: s.id, title: s.title, hymn_number: s.hymn_number }))
      return send(res, 200, JSON.stringify(songs))
    }

    if (req.method === 'GET' && url.pathname === '/api/song-sections') {
      if (!authToken(url, null)) return unauthorized(res)
      const id = Number(url.searchParams.get('id'))
      const song = findSongById(id)
      if (!song) return send(res, 404, JSON.stringify({ error: 'not found' }))
      const sections = getSongSections(id).map((s: any, i: number) => ({ index: i, type: s.type, preview: String(s.content || '').slice(0, 90) }))
      return send(res, 200, JSON.stringify({ title: song.title, sections }))
    }

    if (req.method === 'GET' && url.pathname === '/api/media') {
      if (!authToken(url, null)) return unauthorized(res)
      const folderId = url.searchParams.get('folderId')
      if (folderId == null) {
        const folders = getMediaFolders().map((f: any) => ({ id: f.id, name: f.name }))
        return send(res, 200, JSON.stringify(folders))
      }
      const items = getMediaItems(Number(folderId)).map((it: any) => ({ id: it.id, name: it.name, mime_type: it.mime_type }))
      return send(res, 200, JSON.stringify(items))
    }

    if (req.method === 'POST' && url.pathname === '/api/command') {
      readBody(req).then(body => {
        const token = authToken(url, body)
        if (!token) return unauthorized(res)
        const win = getMainWindow()
        const action = body.action

        // Reads the server already has (song/media lookups) are resolved
        // here so the renderer just receives a ready-to-display payload —
        // one round trip instead of two, and it works even if the renderer
        // hasn't loaded that song into its own state yet.
        if (action === 'song-open') {
          const song = findSongById(Number(body.id))
          const sections = song ? getSongSections(song.id) : []
          if (!song || sections.length === 0) return send(res, 404, JSON.stringify({ error: 'not found' }))
          const index = Math.min(Math.max(Number(body.index) || 0, 0), sections.length - 1)
          win?.webContents.send('remote-command', {
            action: 'song-live', songId: song.id, title: song.title,
            sections: sections.map((s: any) => ({ id: s.id, type: s.type, content: s.content })),
            index,
          })
          return send(res, 200, JSON.stringify({ ok: true }))
        }

        if (action === 'media-open') {
          const item = findMediaItemById(Number(body.id))
          if (!item) return send(res, 404, JSON.stringify({ error: 'not found' }))
          win?.webContents.send('remote-command', {
            action: 'media-live', filePath: item.file_path,
            mediaType: String(item.mime_type || '').startsWith('video') ? 'video' : 'image',
            title: item.name,
          })
          return send(res, 200, JSON.stringify({ ok: true }))
        }

        // Everything else (next/prev/blank/clear/queue-go/queue-remove/
        // queue-move/announce) needs the renderer's own state (current
        // song, queue, display settings), so just forward it.
        win?.webContents.send('remote-command', { action, id: body.id, index: body.index, dir: body.dir, text: body.text })
        send(res, 200, JSON.stringify({ ok: true }))
      })
      return
    }

    send(res, 404, JSON.stringify({ error: 'not found' }))
  })

  tryListen(httpServer, port, 0)
  return getRemoteInfo()
}

function tryListen(httpServer: http.Server, port: number, attempt: number) {
  const onError = (err: NodeJS.ErrnoException) => {
    httpServer.removeListener('listening', onListening)
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
      tryListen(httpServer, port + 1, attempt + 1)
    } else {
      // Give up gracefully — remote control just won't be available this
      // session. The rest of the app (songs, live output, everything else)
      // keeps working; Settings → Remote will show it as unavailable via
      // getRemoteInfo() returning port:null instead of crashing the app.
      starting = false
      console.error('[remote-server] could not bind a port, remote control disabled:', err)
    }
  }
  const onListening = () => {
    httpServer.removeListener('error', onError)
    server = httpServer
    boundPort = port
    starting = false
  }
  httpServer.once('error', onError)
  httpServer.once('listening', onListening)
  httpServer.listen(port, '0.0.0.0')
}

export function stopRemoteServer() {
  server?.close()
  server = null
  boundPort = null
  starting = false
  sessions.clear()
}

// Quick-send announcement templates, mirrored from Announce.tsx — kept as
// full strings here (rather than just a key) so the phone doesn't need a
// round trip to look up the text, and a typed custom message works the
// same way through the same 'announce' action.
const ANNOUNCE_TEMPLATES: [string, string][] = [
  ['Welcome', 'Welcome to our service!\nWe are glad you are here.'],
  ['Offering', 'It is time for our tithes and offerings.\nThank you for your faithful giving.'],
  ['Silence', 'Please silence your mobile phones.\nThank you.'],
  ['Break', 'We will take a short break.\nPlease be back in 10 minutes.'],
  ['Communion', 'We will now observe Holy Communion.\nPlease prepare your hearts.'],
  ['Closing', 'Thank you for joining us today.\nGod bless you as you go.'],
]

// Self-contained page — no build step, no external assets, works on any
// phone browser the moment it's on the same Wi-Fi.
const REMOTE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>ShogunOS Remote</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0d0c0a;color:#f6f2e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-tap-highlight-color:transparent}
  #pinScreen{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:24px;gap:16px}
  #pinScreen input{font-size:28px;letter-spacing:0.4em;text-align:center;width:180px;padding:12px;border-radius:12px;border:1px solid #4c5a94;background:#1b2340;color:#fff}
  button{font-family:inherit}
  #pinScreen button, #app button.primary{background:#7a1b1f;color:#fff;border:none;padding:14px 22px;border-radius:12px;font-size:16px;font-weight:600}
  #app{display:none}
  h1{font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:#8b8072;margin:0 0 4px}
  .panel{padding:16px;padding-bottom:12px}
  #liveTitle{font-size:20px;font-weight:600;margin-bottom:2px}
  #livePreviewBox{border-radius:12px;padding:18px;margin-bottom:16px;min-height:64px;display:flex;align-items:center;justify-content:center;text-align:center;transition:background .2s,color .2s}
  #livePreview{white-space:pre-line}
  .controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
  .controls button{padding:20px;border-radius:14px;border:1px solid #4c5a94;background:#1b2340;color:#fff;font-size:16px;font-weight:600}
  .controls button.wide{grid-column:1 / -1}
  .controls button.blank{background:#b8862f;border-color:#b8862f}
  .controls button.clear{background:#7a1b1f;border-color:#7a1b1f}
  #queue{list-style:none;padding:0;margin:0}
  #queue li{padding:14px;border:1px solid #2a2820;border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px}
  #queue li .t{font-size:14px}
  #queue li .type{font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#8b8072}
  #queue li .btns{display:flex;gap:6px;flex-shrink:0}
  #queue li button{background:#26305c;border:1px solid #4c5a94;color:#fff;padding:8px 10px;border-radius:8px;font-size:13px}
  #queue li button.danger{background:#5c1a1a;border-color:#7a1b1f}
  .err{color:#c23b3b;font-size:13px;min-height:16px}
  .searchbox{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #4c5a94;background:#1b2340;color:#fff;font-size:15px;margin-bottom:14px}
  .listitem{padding:13px 14px;border:1px solid #2a2820;border-radius:10px;margin-bottom:8px;cursor:pointer}
  .listitem:active{background:#1b2340}
  .listitem .num{color:#8b8072;font-size:11px;margin-right:6px}
  .sectiontag{display:inline-block;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#8b8072;border:1px solid #2a2820;border-radius:6px;padding:2px 6px;margin-bottom:4px}
  .backbtn{background:none;border:1px solid #4c5a94;color:#cfd6ee;padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}
  .tabbar{position:fixed;bottom:0;left:0;right:0;display:flex;background:#141310;border-top:1px solid #2a2820;padding-bottom:env(safe-area-inset-bottom)}
  .tabbar button{flex:1;background:none;border:none;color:#8b8072;padding:12px 4px;font-size:11px;letter-spacing:0.04em}
  .tabbar button.active{color:#f6f2e7}
  .tabpanel{display:none;padding-bottom:76px}
  .tabpanel.active{display:block}
  textarea.announceInput{width:100%;min-height:80px;border-radius:10px;border:1px solid #4c5a94;background:#1b2340;color:#fff;padding:12px;font-size:14px;font-family:inherit;margin-bottom:10px}
  .tplgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
  .tplgrid button{padding:14px 8px;border-radius:10px;border:1px solid #4c5a94;background:#1b2340;color:#fff;font-size:13px}
</style></head>
<body>
<div id="pinScreen">
  <h1 style="margin:0">ShogunOS Remote</h1>
  <input id="pinInput" inputmode="numeric" maxlength="4" placeholder="PIN"/>
  <button onclick="connectClick()">Connect</button>
  <div class="err" id="err"></div>
</div>
<div id="app">

  <div class="tabpanel active" id="tab-live">
    <div class="panel">
      <h1>Now Live</h1>
      <div id="liveTitle">Nothing live</div>
      <div id="livePreviewBox"><div id="livePreview"></div></div>
      <div class="controls">
        <button onclick="cmd('prev')">◀ Prev</button>
        <button onclick="cmd('next')">Next ▶</button>
        <button class="wide blank" onclick="cmd('blank')">Blank / Unblank</button>
        <button class="wide clear" onclick="cmd('clear')">Clear Screen</button>
      </div>
    </div>
  </div>

  <div class="tabpanel" id="tab-hymns">
    <div class="panel" id="hymnsListView">
      <h1>Hymns</h1>
      <input class="searchbox" id="hymnSearch" placeholder="Search or browse hymns…" oninput="searchHymns()"/>
      <div id="hymnResults"></div>
    </div>
    <div class="panel" id="hymnSectionsView" style="display:none">
      <button class="backbtn" onclick="closeHymn()">← Back to hymns</button>
      <h1 id="hymnSectionsTitle"></h1>
      <div id="hymnSections"></div>
    </div>
  </div>

  <div class="tabpanel" id="tab-queue">
    <div class="panel">
      <h1>Queue</h1>
      <ul id="queue"></ul>
    </div>
  </div>

  <div class="tabpanel" id="tab-announce">
    <div class="panel">
      <h1>Quick Announce</h1>
      <div class="tplgrid" id="announceTemplates"></div>
      <h1>Custom</h1>
      <textarea class="announceInput" id="announceCustom" placeholder="Type an announcement…"></textarea>
      <button class="primary" style="width:100%" onclick="sendCustomAnnounce()">Send to Screen</button>
    </div>
  </div>

  <div class="tabpanel" id="tab-media">
    <div class="panel" id="mediaFoldersView">
      <h1>Media</h1>
      <div id="mediaFolders"></div>
    </div>
    <div class="panel" id="mediaItemsView" style="display:none">
      <button class="backbtn" onclick="closeMediaFolder()">← Back to folders</button>
      <div id="mediaItems"></div>
    </div>
  </div>

  <div class="tabbar">
    <button class="active" data-tab="live" onclick="showTab('live')">Live</button>
    <button data-tab="hymns" onclick="showTab('hymns')">Hymns</button>
    <button data-tab="queue" onclick="showTab('queue')">Queue</button>
    <button data-tab="announce" onclick="showTab('announce')">Announce</button>
    <button data-tab="media" onclick="showTab('media')">Media</button>
  </div>
</div>
<script>
var ANNOUNCE_TEMPLATES = ${JSON.stringify(ANNOUNCE_TEMPLATES)}
var token = localStorage.getItem('shogun_remote_token') || ''
var pin = localStorage.getItem('shogun_remote_pin') || ''
var hymnSearchTimer = null
var openHymnId = null
var openMediaFolder = null

function guessLabel(){
  var ua = navigator.userAgent || ''
  var base = 'Device'
  if(/iPhone/.test(ua)) base='iPhone'
  else if(/iPad/.test(ua)) base='iPad'
  else if(/Android/.test(ua)) base='Android'
  else if(/Macintosh/.test(ua)) base='Mac'
  else if(/Windows/.test(ua)) base='Windows'
  var id = localStorage.getItem('shogun_remote_devid')
  if(!id){ id = Math.random().toString(36).slice(2,6); localStorage.setItem('shogun_remote_devid', id) }
  return base + ' ' + id
}

function showApp(){
  document.getElementById('pinScreen').style.display='none'
  document.getElementById('app').style.display='block'
  renderAnnounceTemplates()
}

async function doConnect(pinVal){
  try{
    var r = await fetch('/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:pinVal,label:guessLabel()})})
    if(!r.ok){ document.getElementById('err').textContent = 'Wrong PIN'; return false }
    var j = await r.json()
    token = j.token; pin = pinVal
    localStorage.setItem('shogun_remote_token', token)
    localStorage.setItem('shogun_remote_pin', pin)
    showApp()
    poll(false)
    return true
  }catch(e){ document.getElementById('err').textContent = 'Cannot reach ShogunOS'; return false }
}
function connectClick(){
  var v = document.getElementById('pinInput').value.trim()
  doConnect(v)
}

async function poll(isConnectAttempt){
  try{
    var r = await fetch('/api/state?token='+encodeURIComponent(token))
    if(!r.ok){
      if(isConnectAttempt){ document.getElementById('err').textContent = 'Wrong PIN' }
      else if(pin){ var ok = await doConnect(pin); if(!ok){ document.getElementById('pinScreen').style.display='flex'; document.getElementById('app').style.display='none' } }
      return
    }
    if(document.getElementById('app').style.display==='none') showApp()
    var s = await r.json()
    document.getElementById('liveTitle').textContent = s.blankScreen ? 'Screen blanked' : (s.live || 'Nothing live')
    document.getElementById('livePreview').textContent = s.blankScreen ? '' : (s.sectionPreview || '')
    var box = document.getElementById('livePreviewBox')
    var st = s.style || {}
    box.style.background = s.blankScreen ? '#000' : (st.bgColor || '#000')
    box.style.color = st.fontColor || '#fff'
    box.style.fontFamily = st.fontFamily || 'inherit'
    box.style.fontSize = Math.max(12, Math.min(22, (st.fontSize||48)/2.4)) + 'px'
    box.style.textAlign = st.textAlign || 'center'
    var ul = document.getElementById('queue')
    ul.innerHTML = ''
    ;(s.queue||[]).forEach(function(item, i){
      var li = document.createElement('li')
      var left = document.createElement('div')
      left.innerHTML = '<div class="t">'+item.title+'</div><div class="type">'+item.type+'</div>'
      var btns = document.createElement('div')
      btns.className = 'btns'
      var up = document.createElement('button'); up.textContent='↑'; up.onclick=function(){ cmd('queue-move',{id:item.id,dir:'up'}) }
      var down = document.createElement('button'); down.textContent='↓'; down.onclick=function(){ cmd('queue-move',{id:item.id,dir:'down'}) }
      var go = document.createElement('button'); go.textContent='Go Live'; go.onclick=function(){ cmd('queue-go',{id:item.id}) }
      var rm = document.createElement('button'); rm.textContent='✕'; rm.className='danger'; rm.onclick=function(){ cmd('queue-remove',{id:item.id}) }
      btns.appendChild(up); btns.appendChild(down); btns.appendChild(go); btns.appendChild(rm)
      li.appendChild(left); li.appendChild(btns)
      ul.appendChild(li)
    })
  }catch(e){ if(isConnectAttempt) document.getElementById('err').textContent = 'Cannot reach ShogunOS' }
}

async function cmd(action, params){
  var body = Object.assign({ token:token, action:action }, params||{})
  await fetch('/api/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
  poll(false)
}

function showTab(name){
  document.querySelectorAll('.tabpanel').forEach(function(p){ p.classList.remove('active') })
  document.getElementById('tab-'+name).classList.add('active')
  document.querySelectorAll('.tabbar button').forEach(function(b){ b.classList.toggle('active', b.dataset.tab===name) })
  if(name==='media' && !openMediaFolder) loadMediaFolders()
  if(name==='hymns' && !openHymnId) searchHymns()
}

// ── Hymns ────────────────────────────────────────────────────────────────
async function searchHymns(){
  clearTimeout(hymnSearchTimer)
  hymnSearchTimer = setTimeout(async function(){
    var q = document.getElementById('hymnSearch').value.trim()
    var r = await fetch('/api/songs?token='+encodeURIComponent(token)+'&q='+encodeURIComponent(q))
    if(!r.ok) return
    var songs = await r.json()
    var box = document.getElementById('hymnResults')
    box.innerHTML = ''
    songs.forEach(function(s){
      var d = document.createElement('div')
      d.className = 'listitem'
      d.innerHTML = (s.hymn_number ? '<span class="num">#'+s.hymn_number+'</span>' : '') + s.title
      d.onclick = function(){ openHymn(s.id, s.title) }
      box.appendChild(d)
    })
  }, 200)
}
async function openHymn(id, title){
  var r = await fetch('/api/song-sections?token='+encodeURIComponent(token)+'&id='+id)
  if(!r.ok) return
  var data = await r.json()
  openHymnId = id
  document.getElementById('hymnsListView').style.display='none'
  document.getElementById('hymnSectionsView').style.display='block'
  document.getElementById('hymnSectionsTitle').textContent = data.title
  var box = document.getElementById('hymnSections')
  box.innerHTML = ''
  data.sections.forEach(function(sec){
    var d = document.createElement('div')
    d.className = 'listitem'
    d.innerHTML = '<div class="sectiontag">'+sec.type+'</div><div>'+sec.preview+'</div>'
    d.onclick = function(){ cmd('song-open', { id: id, index: sec.index }); showTab('live') }
    box.appendChild(d)
  })
}
function closeHymn(){
  openHymnId = null
  document.getElementById('hymnsListView').style.display='block'
  document.getElementById('hymnSectionsView').style.display='none'
}

// ── Announce ─────────────────────────────────────────────────────────────
function renderAnnounceTemplates(){
  var box = document.getElementById('announceTemplates')
  if(box.children.length) return
  ANNOUNCE_TEMPLATES.forEach(function(t){
    var b = document.createElement('button')
    b.textContent = t[0]
    b.onclick = function(){ cmd('announce', { text: t[1] }); showTab('live') }
    box.appendChild(b)
  })
}
function sendCustomAnnounce(){
  var t = document.getElementById('announceCustom').value.trim()
  if(!t) return
  cmd('announce', { text: t })
  showTab('live')
}

// ── Media ────────────────────────────────────────────────────────────────
async function loadMediaFolders(){
  var r = await fetch('/api/media?token='+encodeURIComponent(token))
  if(!r.ok) return
  var folders = await r.json()
  var box = document.getElementById('mediaFolders')
  box.innerHTML = ''
  if(folders.length===0){ box.innerHTML = '<div style="color:#8b8072;font-size:13px">No media folders yet.</div>'; return }
  folders.forEach(function(f){
    var d = document.createElement('div')
    d.className = 'listitem'
    d.textContent = f.name
    d.onclick = function(){ openMediaFolderView(f.id, f.name) }
    box.appendChild(d)
  })
}
async function openMediaFolderView(id, name){
  var r = await fetch('/api/media?token='+encodeURIComponent(token)+'&folderId='+id)
  if(!r.ok) return
  var items = await r.json()
  openMediaFolder = id
  document.getElementById('mediaFoldersView').style.display='none'
  document.getElementById('mediaItemsView').style.display='block'
  var box = document.getElementById('mediaItems')
  box.innerHTML = ''
  items.forEach(function(it){
    var d = document.createElement('div')
    d.className = 'listitem'
    d.textContent = it.name
    d.onclick = function(){ cmd('media-open', { id: it.id }); showTab('live') }
    box.appendChild(d)
  })
}
function closeMediaFolder(){
  openMediaFolder = null
  document.getElementById('mediaFoldersView').style.display='block'
  document.getElementById('mediaItemsView').style.display='none'
}

// ── Bootstrap ────────────────────────────────────────────────────────────
var qsPin = new URLSearchParams(location.search).get('pin')
if(qsPin){
  document.getElementById('pinInput').value = qsPin
  doConnect(qsPin)
} else if(token){
  showApp()
  poll(true)
} else if(pin){
  document.getElementById('pinInput').value = pin
  doConnect(pin)
}
setInterval(function(){ poll(false) }, 1500)
</script>
</body></html>`