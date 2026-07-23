import http from 'node:http'
import os from 'node:os'
import type { BrowserWindow } from 'electron'
import { searchSongs, getSongSections, getMediaFolders, getMediaItems, getBibleTranslations, getBibleBooks, getBibleChapters, getBibleChapterVerses, getBibleVerse, searchBibleVerses } from './database'

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

// ── LIVE PREVIEW ─────────────────────────────────────────────────────────
// The remote page shows a real screenshot of the live output (not just the
// text-style approximation it used to fall back to), the same way
// ProPresenter/FreeShow remotes do. capturePage() is a real render + JPEG
// encode, so it's throttled and cached rather than done on every phone poll
// — several connected devices polling in the same second all get the same
// cached frame instead of triggering a capture each.
let lastCapture: { buf: Buffer; ts: number } | null = null
const CAPTURE_MIN_INTERVAL_MS = 1200

async function capturePreview(getLiveWindow: () => BrowserWindow | undefined): Promise<Buffer | null> {
  const win = getLiveWindow()
  if (!win || win.isDestroyed()) { lastCapture = null; return null }
  if (lastCapture && Date.now() - lastCapture.ts < CAPTURE_MIN_INTERVAL_MS) return lastCapture.buf
  try {
    const image = await win.webContents.capturePage()
    const buf = image.toJPEG(70)
    lastCapture = { buf, ts: Date.now() }
    return buf
  } catch {
    return null
  }
}

// Tries PREFERRED_PORT, then a handful of ports after it, in case something
// else on the machine (or a leftover ShogunOS process from a dev hot-reload
// that didn't shut down cleanly) is already holding the port. Previously an
// EADDRINUSE here had no 'error' listener attached, which Node treats as an
// uncaught exception and crashes the *entire* Electron app on startup —
// that's the "JavaScript error occurred in the main process" dialog.
const PREFERRED_PORT = 51820
const MAX_PORT_ATTEMPTS = 10

export function startRemoteServer(getMainWindow: () => BrowserWindow | undefined, getLiveWindow: () => BrowserWindow | undefined, port = PREFERRED_PORT) {
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

    // ── SCRIPTURE ────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/api/bible-translations') {
      if (!authToken(url, null)) return unauthorized(res)
      return send(res, 200, JSON.stringify(getBibleTranslations()))
    }

    if (req.method === 'GET' && url.pathname === '/api/bible-books') {
      if (!authToken(url, null)) return unauthorized(res)
      const version = url.searchParams.get('version') || undefined
      return send(res, 200, JSON.stringify(getBibleBooks(version)))
    }

    if (req.method === 'GET' && url.pathname === '/api/bible-chapters') {
      if (!authToken(url, null)) return unauthorized(res)
      const book = url.searchParams.get('book') || ''
      const version = url.searchParams.get('version') || undefined
      return send(res, 200, JSON.stringify(getBibleChapters(book, version)))
    }

    if (req.method === 'GET' && url.pathname === '/api/bible-verses') {
      if (!authToken(url, null)) return unauthorized(res)
      const book = url.searchParams.get('book') || ''
      const chapter = Number(url.searchParams.get('chapter'))
      const version = url.searchParams.get('version') || undefined
      const verses = getBibleChapterVerses(book, chapter, version)
        .map((v: any) => ({ verse: v.verse, preview: String(v.text || '').slice(0, 90) }))
      return send(res, 200, JSON.stringify(verses))
    }

    if (req.method === 'GET' && url.pathname === '/api/bible-search') {
      if (!authToken(url, null)) return unauthorized(res)
      const q = url.searchParams.get('q') || ''
      const version = url.searchParams.get('version') || undefined
      if (q.trim().length < 2) return send(res, 200, JSON.stringify([]))
      const results = searchBibleVerses(q, version).slice(0, 50)
        .map((v: any) => ({ book: v.book, chapter: v.chapter, verse: v.verse, preview: String(v.text || '').slice(0, 90) }))
      return send(res, 200, JSON.stringify(results))
    }

    // ── LIVE PREVIEW ─────────────────────────────────────────────────────
    // <img> tags can't send an Authorization header, so the token travels
    // as a query param here the same way it does for /api/state.
    if (req.method === 'GET' && url.pathname === '/api/preview.jpg') {
      if (!authToken(url, null)) return unauthorized(res)
      capturePreview(getLiveWindow).then(buf => {
        if (!buf) return send(res, 404, JSON.stringify({ error: 'no live output' }))
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
        res.end(buf)
      })
      return
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

        if (action === 'verse-open') {
          const v = getBibleVerse(String(body.book || ''), Number(body.chapter), Number(body.verse), body.version || undefined)
          if (!v) return send(res, 404, JSON.stringify({ error: 'not found' }))
          win?.webContents.send('remote-command', {
            action: 'verse-live', book: v.book, chapter: v.chapter, verseNum: v.verse, text: v.text, version: v.version,
          })
          return send(res, 200, JSON.stringify({ ok: true }))
        }

        // Everything else (next/prev/blank/clear/queue-go/queue-remove/
        // queue-move/queue-add/announce) needs the renderer's own state
        // (current song, queue, display settings) rather than a server-side
        // lookup, so just forward it as-is. queue-add in particular relies
        // on the phone having already resolved a human title client-side
        // (it's right there in the list the person tapped) rather than
        // round-tripping back through the server to look it up again.
        win?.webContents.send('remote-command', {
          action, id: body.id, index: body.index, dir: body.dir, text: body.text,
          title: body.title, itemType: body.itemType,
        })
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
  /* Same Shogun palette as the desktop app's dark theme (src/index.css),
     so the phone remote reads as part of the same product, not a bolted-on
     web page. bg0/bg1/bg3 = layered dark backgrounds, b0/b1 = borders,
     p1/p2 = the brand pink used for "live"/primary actions, g2/g3 = the
     cyan secondary accent, t1..t4 = text from brightest to dimmest. */
  :root{
    color-scheme:dark;
    --bg0:#08060f; --bg1:#100c1e; --bg3:#1b1531; --bg4:#241c3f;
    --b0:#241c3f; --b1:#372a55;
    --p1:#d61a5c; --p2:#ff2e63;
    --g2:#12b8ec; --g3:#6fe8ff;
    --t1:#f5f1ff; --t2:#cec3ea; --t3:#9186b8; --t4:#5e5380;
    --warn:#ffd23f;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg0);color:var(--t1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-tap-highlight-color:transparent}
  #pinScreen{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:24px;gap:16px}
  #pinScreen input{font-size:28px;letter-spacing:0.4em;text-align:center;width:180px;padding:12px;border-radius:12px;border:1px solid var(--b1);background:var(--bg3);color:var(--t1)}
  button{font-family:inherit}
  #pinScreen button, #app button.primary{background:var(--p2);color:#fff;border:none;padding:14px 22px;border-radius:12px;font-size:16px;font-weight:600}
  #app{display:none}
  h1{font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:var(--t4);margin:0 0 4px}
  .panel{padding:16px;padding-bottom:12px}
  #liveTitle{font-size:20px;font-weight:600;margin-bottom:2px}
  #livePreviewBox{border-radius:12px;padding:18px;margin-bottom:16px;min-height:64px;display:flex;align-items:center;justify-content:center;text-align:center;transition:background .2s,color .2s}
  #livePreview{white-space:pre-line}
  .controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
  .controls button{padding:20px;border-radius:14px;border:1px solid var(--b1);background:var(--bg3);color:var(--t1);font-size:16px;font-weight:600}
  .controls button.wide{grid-column:1 / -1}
  .controls button.blank{background:var(--warn);border-color:var(--warn);color:var(--bg0)}
  .controls button.clear{background:var(--p1);border-color:var(--p1);color:#fff}
  #queue{list-style:none;padding:0;margin:0}
  #queue li{padding:14px;border:1px solid var(--b0);border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px}
  #queue li .t{font-size:14px}
  #queue li .type{font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--t4)}
  #queue li .btns{display:flex;gap:6px;flex-shrink:0}
  #queue li button{background:var(--bg4);border:1px solid var(--b1);color:var(--t1);padding:8px 10px;border-radius:8px;font-size:13px}
  #queue li button.danger{background:var(--p1);border-color:var(--p2);color:#fff}
  .err{color:var(--p2);font-size:13px;min-height:16px}
  .searchbox{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--b1);background:var(--bg3);color:var(--t1);font-size:15px;margin-bottom:14px}
  .listitem{padding:13px 14px;border:1px solid var(--b0);border-radius:10px;margin-bottom:8px;cursor:pointer}
  .listitem:active{background:var(--bg3)}
  .listitem .num{color:var(--t4);font-size:11px;margin-right:6px}
  .sectiontag{display:inline-block;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--t4);border:1px solid var(--b0);border-radius:6px;padding:2px 6px;margin-bottom:4px}
  .backbtn{background:none;border:1px solid var(--b1);color:var(--t2);padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}
  .itemrow{display:flex;align-items:stretch;gap:8px;margin-bottom:8px}
  .itemrow .listitem{flex:1;margin-bottom:0}
  .qbtn{flex-shrink:0;background:var(--bg4);border:1px solid var(--b1);color:var(--t2);padding:0 14px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap}
  .chaptergrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  .chaptergrid .chapnum{padding:14px 0;text-align:center;border:1px solid var(--b0);border-radius:8px;cursor:pointer;font-size:14px}
  .chaptergrid .chapnum:active{background:var(--bg3)}
  #livePreviewImg{width:100%;border-radius:12px;margin-bottom:16px;display:none;background:#000;aspect-ratio:16/9;object-fit:contain;border:1px solid var(--b1)}
  .tabbar{position:fixed;bottom:0;left:0;right:0;display:flex;background:var(--bg1);border-top:1px solid var(--b0);padding-bottom:env(safe-area-inset-bottom)}
  .tabbar button{flex:1;background:none;border:none;border-top:2px solid transparent;color:var(--t4);padding:12px 4px;font-size:11px;letter-spacing:0.04em}
  .tabbar button.active{color:var(--t1);border-top-color:var(--p2)}
  .tabpanel{display:none;padding-bottom:76px}
  .tabpanel.active{display:block}
  textarea.announceInput{width:100%;min-height:80px;border-radius:10px;border:1px solid var(--b1);background:var(--bg3);color:var(--t1);padding:12px;font-size:14px;font-family:inherit;margin-bottom:10px}
  .tplgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
  .tplgrid button{padding:14px 8px;border-radius:10px;border:1px solid var(--b1);background:var(--bg3);color:var(--t1);font-size:13px}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .brand .glyph{width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--p2),var(--g2));display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:var(--bg0);font-family:serif;flex-shrink:0}
  .brand .word{font-size:16px;font-weight:800;letter-spacing:0.1em;color:var(--t1)}
  .brand .word b{background:linear-gradient(135deg,var(--p2),var(--g2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
</style></head>
<body>
<div id="pinScreen">
  <div class="brand"><div class="glyph">将</div><div class="word">SHOGUN<b>OS</b></div></div>
  <h1 style="margin:0">Remote</h1>
  <input id="pinInput" inputmode="numeric" maxlength="4" placeholder="PIN"/>
  <button onclick="connectClick()">Connect</button>
  <div class="err" id="err"></div>
</div>
<div id="app">

  <div class="tabpanel active" id="tab-live">
    <div class="panel">
      <h1>Now Live</h1>
      <div id="liveTitle">Nothing live</div>
      <img id="livePreviewImg" alt=""/>
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
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
        <h1 id="hymnSectionsTitle" style="margin:0"></h1>
        <button class="qbtn" style="padding:8px 14px" onclick="queueOpenHymn()">+ Queue</button>
      </div>
      <div id="hymnSections"></div>
    </div>
  </div>

  <div class="tabpanel" id="tab-scripture">
    <div class="panel" id="scriptureBooksView">
      <h1>Scripture</h1>
      <input class="searchbox" id="bibleSearch" placeholder="Search verses…" oninput="searchBible()"/>
      <div id="bibleSearchResults"></div>
      <div id="bibleBooks"></div>
    </div>
    <div class="panel" id="scriptureChaptersView" style="display:none">
      <button class="backbtn" onclick="closeBibleBook()">← Back to books</button>
      <h1 id="scriptureBookTitle"></h1>
      <div id="bibleChapters" class="chaptergrid"></div>
    </div>
    <div class="panel" id="scriptureVersesView" style="display:none">
      <button class="backbtn" onclick="closeBibleChapter()">← Back to chapters</button>
      <h1 id="scriptureChapterTitle"></h1>
      <div id="bibleVerses"></div>
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
    <button data-tab="scripture" onclick="showTab('scripture')">Scripture</button>
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
var openHymnTitle = null
var openMediaFolder = null
var openBibleBook = null
var openBibleChapter = null
var bibleSearchTimer = null

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
    var img = document.getElementById('livePreviewImg')
    var st = s.style || {}
    box.style.background = s.blankScreen ? '#000' : (st.bgColor || '#000')
    box.style.color = st.fontColor || '#fff'
    box.style.fontFamily = st.fontFamily || 'inherit'
    box.style.fontSize = Math.max(12, Math.min(22, (st.fontSize||48)/2.4)) + 'px'
    box.style.textAlign = st.textAlign || 'center'
    // A real screenshot of the live window, when one's available — falls
    // back to the text/color approximation above (blank screen, nothing
    // live yet, or the capture failing for any reason).
    if(s.blankScreen || !s.live){
      img.style.display = 'none'
      box.style.display = 'flex'
    } else {
      img.onload = function(){ img.style.display='block'; box.style.display='none' }
      img.onerror = function(){ img.style.display='none'; box.style.display='flex' }
      img.src = '/api/preview.jpg?token='+encodeURIComponent(token)+'&_='+Date.now()
    }
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
  if(name==='scripture' && !openBibleBook) loadBibleBooks()
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
  openHymnTitle = data.title
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
function queueOpenHymn(){
  if(!openHymnTitle) return
  cmd('queue-add', { title: openHymnTitle, itemType: 'song' })
}
function closeHymn(){
  openHymnId = null
  openHymnTitle = null
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

// ── Scripture ────────────────────────────────────────────────────────────
// Same three-level browse as the desktop Bible tab (book → chapter → verse),
// plus a search box up top for jumping straight to a verse by text or
// reference. Fixed to KJV for now — same default the desktop app starts
// on — rather than exposing a translation picker on the phone too.
function renderVerseRows(box, verses){
  box.innerHTML = ''
  verses.forEach(function(v){
    var row = document.createElement('div')
    row.className = 'itemrow'
    var d = document.createElement('div')
    d.className = 'listitem'
    d.innerHTML = '<span class="num">'+v.verse+'</span>'+v.preview
    d.onclick = function(){ cmd('verse-open', { book:v.book, chapter:v.chapter, verse:v.verse, version:'KJV' }); showTab('live') }
    var q = document.createElement('button')
    q.className = 'qbtn'
    q.textContent = '+ Queue'
    q.onclick = function(e){ e.stopPropagation(); cmd('queue-add', { title: v.book+' '+v.chapter+':'+v.verse, itemType:'verse' }) }
    row.appendChild(d); row.appendChild(q)
    box.appendChild(row)
  })
}
async function loadBibleBooks(){
  var r = await fetch('/api/bible-books?token='+encodeURIComponent(token)+'&version=KJV')
  if(!r.ok) return
  var books = await r.json()
  var box = document.getElementById('bibleBooks')
  box.innerHTML = ''
  books.forEach(function(b){
    var d = document.createElement('div')
    d.className = 'listitem'
    d.textContent = b
    d.onclick = function(){ openBibleBookView(b) }
    box.appendChild(d)
  })
}
async function openBibleBookView(book){
  var r = await fetch('/api/bible-chapters?token='+encodeURIComponent(token)+'&book='+encodeURIComponent(book)+'&version=KJV')
  if(!r.ok) return
  var chapters = await r.json()
  openBibleBook = book
  document.getElementById('scriptureBooksView').style.display='none'
  document.getElementById('scriptureChaptersView').style.display='block'
  document.getElementById('scriptureBookTitle').textContent = book
  var box = document.getElementById('bibleChapters')
  box.innerHTML = ''
  chapters.forEach(function(c){
    var d = document.createElement('div')
    d.className = 'chapnum'
    d.textContent = c
    d.onclick = function(){ openBibleChapterView(c) }
    box.appendChild(d)
  })
}
async function openBibleChapterView(ch){
  var r = await fetch('/api/bible-verses?token='+encodeURIComponent(token)+'&book='+encodeURIComponent(openBibleBook)+'&chapter='+ch+'&version=KJV')
  if(!r.ok) return
  var verses = await r.json()
  openBibleChapter = ch
  document.getElementById('scriptureChaptersView').style.display='none'
  document.getElementById('scriptureVersesView').style.display='block'
  document.getElementById('scriptureChapterTitle').textContent = openBibleBook+' '+ch
  renderVerseRows(document.getElementById('bibleVerses'), verses.map(function(v){ return { book:openBibleBook, chapter:ch, verse:v.verse, preview:v.preview } }))
}
function closeBibleBook(){
  openBibleBook = null
  document.getElementById('scriptureBooksView').style.display='block'
  document.getElementById('scriptureChaptersView').style.display='none'
}
function closeBibleChapter(){
  openBibleChapter = null
  document.getElementById('scriptureChaptersView').style.display='block'
  document.getElementById('scriptureVersesView').style.display='none'
}
async function searchBible(){
  clearTimeout(bibleSearchTimer)
  bibleSearchTimer = setTimeout(async function(){
    var q = document.getElementById('bibleSearch').value.trim()
    var resultsBox = document.getElementById('bibleSearchResults')
    var booksBox = document.getElementById('bibleBooks')
    if(q.length<2){ resultsBox.innerHTML=''; booksBox.style.display='block'; return }
    booksBox.style.display='none'
    var r = await fetch('/api/bible-search?token='+encodeURIComponent(token)+'&q='+encodeURIComponent(q)+'&version=KJV')
    if(!r.ok) return
    renderVerseRows(resultsBox, await r.json())
  }, 250)
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