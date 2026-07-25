import http from 'node:http'
import os from 'node:os'
import type { BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import { searchAllSongs, getSongById, getSongSections, searchBibleVerses, getBibleVerse } from './database'

// ── ShogunOS Remote Control ─────────────────────────────────────────────────
// A dependency-free LAN server so a phone/tablet on the same Wi-Fi can drive
// the live output — the #1 feature gap versus FreeShow/ProPresenter. No
// websocket lib, no express: just node:http + short polling from the page,
// which is plenty responsive for "next slide" over a local network and keeps
// the main-process bundle free of extra dependencies to package. (QR-code
// generation is the one exception — see getRemoteQR below — since a hand
// rolled QR encoder is easy to get subtly, silently wrong.)
//
// Security model: this is a LAN-only convenience tool, not a public server.
// It binds to all interfaces (so phones can reach it) but every request must
// carry the 4-digit PIN shown in Settings → Remote, which is regenerated
// every time the app starts. That's enough to stop someone on the same café
// Wi-Fi from blanking your Sunday-service screen by accident.
//
// Song/Bible search runs directly against the database module here in the
// main process — no IPC round-trip needed for read-only lookups — but the
// actual "go live" action always resolves the title+content server-side
// first and hands the renderer a ready-to-display payload, so the phone
// never has to be trusted with anything beyond "here's an id/reference".

export interface RemoteState {
  live: string | null
  blankScreen: boolean
  currentSection: number
  totalSections: number
  sectionPreview: string
  queue: { id: string; title: string; type: string }[]
  bibleVersion?: string
}

let server: http.Server | null = null
let pin = ''
let boundPort: number | null = null
let starting = false
let state: RemoteState = { live: null, blankScreen: false, currentSection: 0, totalSections: 0, sectionPreview: '', queue: [] }

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

function checkPin(url: URL, body: any): boolean {
  const supplied = url.searchParams.get('pin') || body?.pin
  return supplied === pin
}

export function updateRemoteState(next: RemoteState) {
  state = next
}

export function getRemoteInfo() {
  if (boundPort == null) return { port: null, pin: '', urls: [] as string[] }
  return { port: boundPort, pin, urls: lanAddresses().map(ip => `http://${ip}:${boundPort}`) }
}

// Generates a scannable QR code (PNG data URL) encoding the first LAN URL
// with the PIN baked in as a query param, so scanning it connects instantly
// with no typing. Returns null if the server isn't up yet or has no
// reachable LAN address (e.g. Wi-Fi adapter disabled).
export async function getRemoteQR(): Promise<string | null> {
  const info = getRemoteInfo()
  if (!info.port || info.urls.length === 0) return null
  const target = `${info.urls[0]}/?pin=${info.pin}`
  try {
    return await QRCode.toDataURL(target, { margin: 1, width: 260, color: { dark: '#1b1a17', light: '#f3efe4' } })
  } catch (err) {
    console.error('[remote-server] QR generation failed:', err)
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

export function startRemoteServer(getMainWindow: () => BrowserWindow | undefined, port = PREFERRED_PORT) {
  // Idempotent: if we're already listening (or mid-attempt), don't spin up a
  // second server. This guards against the function ever being called twice
  // in one process.
  if (server || starting) return getRemoteInfo()
  starting = true
  pin = genPin()

  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/') {
      // If the URL carries the correct PIN (e.g. from scanning the QR code),
      // bake it into the page so it connects immediately with no typing.
      const qpPin = url.searchParams.get('pin') || ''
      const autoPin = qpPin === pin ? qpPin : ''
      return send(res, 200, REMOTE_HTML.replace('__AUTOPIN__', autoPin), 'text/html')
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      if (!checkPin(url, null)) return send(res, 401, JSON.stringify({ error: 'bad pin' }))
      return send(res, 200, JSON.stringify(state))
    }

    if (req.method === 'GET' && url.pathname === '/api/songs') {
      if (!checkPin(url, null)) return send(res, 401, JSON.stringify({ error: 'bad pin' }))
      const q = url.searchParams.get('q') || ''
      try {
        const results = searchAllSongs(q).slice(0, 20).map(s => ({ id: s.id, title: s.title, hymn_number: s.hymn_number, source: s.source }))
        return send(res, 200, JSON.stringify({ results }))
      } catch (err) {
        return send(res, 500, JSON.stringify({ error: 'search failed' }))
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/bible') {
      if (!checkPin(url, null)) return send(res, 401, JSON.stringify({ error: 'bad pin' }))
      const q = url.searchParams.get('q') || ''
      if (q.trim().length < 2) return send(res, 200, JSON.stringify({ results: [] }))
      try {
        const results = searchBibleVerses(q, state.bibleVersion).slice(0, 20).map(v => ({ book: v.book, chapter: v.chapter, verse: v.verse, text: v.text }))
        return send(res, 200, JSON.stringify({ results }))
      } catch (err) {
        return send(res, 500, JSON.stringify({ error: 'search failed' }))
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/command') {
      let raw = ''
      req.on('data', c => { raw += c })
      req.on('end', () => {
        let body: any = {}
        try { body = JSON.parse(raw || '{}') } catch { /* ignore */ }
        if (!checkPin(url, body)) return send(res, 401, JSON.stringify({ error: 'bad pin' }))
        const win = getMainWindow()

        // Song/verse selections from the phone's search are resolved fully
        // here (title + first-section content) before ever reaching the
        // renderer, so the phone only ever sends an id/reference, never
        // arbitrary text that ends up on the big screen unexamined.
        if (body.action === 'content-go' && body.kind === 'song' && body.id != null) {
          const song = getSongById(Number(body.id))
          if (!song) return send(res, 404, JSON.stringify({ error: 'song not found' }))
          const secs = getSongSections(song.id)
          if (!secs.length) return send(res, 404, JSON.stringify({ error: 'song has no sections' }))
          win?.webContents.send('remote-command', { action: 'content-go', title: song.title, content: secs[0].content })
          return send(res, 200, JSON.stringify({ ok: true }))
        }
        if (body.action === 'content-go' && body.kind === 'verse' && body.book) {
          const v = getBibleVerse(body.book, Number(body.chapter), Number(body.verse), state.bibleVersion)
          if (!v) return send(res, 404, JSON.stringify({ error: 'verse not found' }))
          win?.webContents.send('remote-command', { action: 'content-go', title: `${v.book} ${v.chapter}:${v.verse}`, content: v.text })
          return send(res, 200, JSON.stringify({ ok: true }))
        }

        win?.webContents.send('remote-command', { action: body.action, id: body.id })
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
}

// Self-contained page — no build step, no external assets, works on any
// phone browser the moment it's on the same Wi-Fi. Styled to match the
// ShogunOS desktop app's crimson/navy/parchment identity.
const REMOTE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"/>
<meta name="theme-color" content="#171613"/>
<title>ShogunOS Remote</title>
<style>
  :root{
    color-scheme:dark;
    --bg0:#171613;--bg1:#201f1b;--bg2:#1c1b18;--bg3:#2a2822;--bg4:#34322a;--bg5:#454136;
    --b1:#3a3730;--b2:#514c3f;
    --p1:#c22430;--p2:#dc4650;--p3:#ea6870;
    --g1:#145a9e;--g2:#2f86c4;--g3:#5cc4ea;
    --t1:#f3efe4;--t2:#cfc8b4;--t3:#9a927c;--t4:#6b6455;
    --live:#dc4650;--safe:#6a9160;--warn:#d4b62f;
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{
    margin:0;color:var(--t1);
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:
      radial-gradient(ellipse 900px 500px at 15% -10%, color-mix(in srgb, var(--p1) 20%, transparent), transparent),
      radial-gradient(ellipse 700px 500px at 100% 0%, color-mix(in srgb, var(--g1) 18%, transparent), transparent),
      var(--bg0);
    min-height:100vh;overflow-x:hidden;
  }
  button{font-family:inherit;-webkit-appearance:none;appearance:none;cursor:pointer}
  ::selection{background:color-mix(in srgb, var(--p1) 40%, transparent)}

  /* ── PIN SCREEN ─────────────────────────────────────────────────────── */
  #pinScreen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;gap:22px;text-align:center}
  .brand{display:flex;flex-direction:column;align-items:center;gap:10px}
  .brand .mark{
    width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,var(--p1),var(--g1));font-size:26px;font-weight:800;
    box-shadow:0 8px 30px color-mix(in srgb, var(--p1) 40%, transparent);
  }
  .brand h1{font-size:20px;font-weight:700;margin:0;letter-spacing:0.02em}
  .brand p{font-size:12px;color:var(--t3);margin:0;letter-spacing:0.05em}
  .pin-boxes{display:flex;gap:10px}
  .pin-boxes input{
    width:52px;height:64px;font-size:28px;font-weight:700;text-align:center;
    border-radius:14px;border:1px solid var(--b1);background:var(--bg2);color:var(--t1);
    outline:none;transition:border-color .15s, transform .1s, background .15s;
  }
  .pin-boxes input:focus{border-color:var(--p2);background:var(--bg3);transform:translateY(-2px)}
  .pin-boxes input.shake{animation:shake .35s}
  @keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
  #connectBtn{
    background:linear-gradient(135deg,var(--p1),var(--p2));color:#fff;border:none;
    padding:15px 36px;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:0.04em;
    box-shadow:0 6px 20px color-mix(in srgb, var(--p1) 35%, transparent);transition:transform .1s, opacity .15s;
  }
  #connectBtn:active{transform:scale(0.96)}
  #connectBtn:disabled{opacity:0.5}
  .err{color:var(--p3);font-size:12px;min-height:16px;font-weight:600}
  .hint{font-size:11px;color:var(--t4);max-width:240px;line-height:1.5}

  /* ── APP SHELL ──────────────────────────────────────────────────────── */
  #app{display:none;padding:14px 14px calc(90px + env(safe-area-inset-bottom));min-height:100vh}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:6px 4px 18px}
  .topbar .who{display:flex;align-items:center;gap:9px}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--safe);box-shadow:0 0 0 0 rgba(106,145,96,.6);animation:pulse 2s infinite}
  .dot.bad{background:var(--live);box-shadow:none;animation:none}
  @keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--safe) 55%, transparent)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
  .topbar .name{font-size:13px;font-weight:700;letter-spacing:0.02em}
  .topbar .sub{font-size:10px;color:var(--t4);letter-spacing:0.08em;text-transform:uppercase}
  .iconbtn{background:var(--bg3);border:1px solid var(--b1);color:var(--t3);width:34px;height:34px;border-radius:10px;font-size:14px;display:flex;align-items:center;justify-content:center}

  .eyebrow{font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--t4);margin:18px 2px 8px}

  /* Now Live hero card */
  .hero{
    position:relative;border-radius:20px;padding:20px 20px 18px;overflow:hidden;
    background:linear-gradient(160deg, var(--bg3), var(--bg2));border:1px solid var(--b1);
    transition:border-color .2s;
  }
  .hero.is-live{border-color:color-mix(in srgb, var(--p1) 55%, var(--b1))}
  .hero.is-blank{border-color:color-mix(in srgb, var(--warn) 45%, var(--b1))}
  .hero .badge{display:inline-flex;align-items:center;gap:6px;font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;padding:4px 9px;border-radius:20px;background:color-mix(in srgb, var(--t4) 15%, transparent);color:var(--t3);margin-bottom:10px}
  .hero.is-live .badge{background:color-mix(in srgb, var(--p1) 22%, transparent);color:var(--p3)}
  .hero.is-blank .badge{background:color-mix(in srgb, var(--warn) 20%, transparent);color:var(--warn)}
  .hero .badge .bdot{width:6px;height:6px;border-radius:50%;background:currentColor}
  #liveTitle{font-size:19px;font-weight:700;line-height:1.3;margin-bottom:6px;transition:opacity .15s}
  #livePreview{font-size:13px;color:var(--t3);white-space:pre-line;line-height:1.55;min-height:18px;transition:opacity .15s}
  .dots{display:flex;gap:5px;margin-top:14px;flex-wrap:wrap}
  .dots i{width:100%;max-width:22px;flex:1;height:4px;border-radius:3px;background:var(--b1);transition:background .2s}
  .dots i.on{background:var(--p2)}

  /* Controls */
  .controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
  .controls button{
    padding:18px 10px;border-radius:16px;border:1px solid var(--b1);background:var(--bg3);color:var(--t1);
    font-size:14px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:6px;
    transition:transform .08s, background .15s;
  }
  .controls button:active{transform:scale(0.95);background:var(--bg4)}
  .controls button .ic{font-size:19px}
  .controls button.wide{grid-column:1 / -1;flex-direction:row;justify-content:center;padding:15px}
  .controls button.blank{background:color-mix(in srgb, var(--warn) 14%, var(--bg3));border-color:color-mix(in srgb, var(--warn) 40%, var(--b1));color:var(--warn)}
  .controls button.clear{background:color-mix(in srgb, var(--p1) 14%, var(--bg3));border-color:color-mix(in srgb, var(--p1) 40%, var(--b1));color:var(--p3)}
  .swipe-hint{text-align:center;font-size:10px;color:var(--t4);margin-top:10px;letter-spacing:0.03em}

  /* Queue */
  #queue{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
  #queue li{
    padding:13px 14px;border:1px solid var(--b1);background:var(--bg2);border-radius:14px;
    display:flex;justify-content:space-between;align-items:center;gap:10px;
    border-left:3px solid var(--b2);transition:background .15s;
  }
  #queue li.k-song{border-left-color:var(--g2)}
  #queue li.k-scripture{border-left-color:var(--p2)}
  #queue li.k-announcement{border-left-color:var(--warn)}
  #queue li .t{font-size:13.5px;font-weight:600;line-height:1.3}
  #queue li .type{font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--t4);margin-top:2px}
  #queue li button{
    background:var(--bg4);border:1px solid var(--b1);color:var(--t1);padding:9px 14px;border-radius:10px;
    font-size:11.5px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;flex-shrink:0;
  }
  #queue li button:active{background:linear-gradient(135deg,var(--p1),var(--p2));color:#fff;border-color:transparent}
  #queueEmpty{font-size:12px;color:var(--t4);padding:18px 4px;text-align:center}

  /* Search (Hymnal / My Songs / Bible) */
  .search-tabs{display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:10px;border:1px solid var(--b1);margin-bottom:10px}
  .search-tabs button{flex:1;padding:8px 0;font-size:11px;font-weight:700;border-radius:7px;background:none;border:1px solid transparent;color:var(--t3)}
  .search-tabs button.on{background:var(--bg5);border-color:var(--b2);color:var(--t1)}
  #searchInput{
    width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--b1);background:var(--bg2);
    color:var(--t1);font-size:14px;outline:none;margin-bottom:10px;transition:border-color .15s;
  }
  #searchInput:focus{border-color:var(--p2)}
  #searchResults{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto}
  #searchResults li{
    padding:12px 14px;border:1px solid var(--b1);background:var(--bg2);border-radius:14px;
    display:flex;justify-content:space-between;align-items:center;gap:10px;
  }
  #searchResults li .t{font-size:13px;font-weight:600;line-height:1.35}
  #searchResults li .sub{font-size:10.5px;color:var(--t4);margin-top:2px;line-height:1.3}
  #searchResults li button{
    background:var(--bg4);border:1px solid var(--b1);color:var(--t1);padding:9px 13px;border-radius:10px;
    font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;
  }
  #searchResults li button:active{background:linear-gradient(135deg,var(--p1),var(--p2));color:#fff;border-color:transparent}
  #searchHint,#searchEmpty{font-size:12px;color:var(--t4);padding:14px 4px;text-align:center}

  /* Toast */
  #toast{
    position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(120%);
    background:var(--bg5);border:1px solid var(--b2);color:var(--t1);padding:11px 18px;border-radius:12px;
    font-size:12.5px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.4);transition:transform .25s ease;z-index:50;
  }
  #toast.show{transform:translateX(-50%) translateY(0)}
</style></head>
<body>

<div id="pinScreen">
  <div class="brand">
    <div class="mark">将</div>
    <h1>ShogunOS Remote</h1>
    <p>Enter the 4-digit PIN shown in Settings → Remote</p>
  </div>
  <div class="pin-boxes" id="pinBoxes">
    <input inputmode="numeric" maxlength="1" data-i="0"/>
    <input inputmode="numeric" maxlength="1" data-i="1"/>
    <input inputmode="numeric" maxlength="1" data-i="2"/>
    <input inputmode="numeric" maxlength="1" data-i="3"/>
  </div>
  <div class="err" id="err"></div>
  <button id="connectBtn" onclick="connect()">Connect</button>
  <div class="hint">Make sure this device is on the same Wi-Fi network as the laptop running ShogunOS.</div>
</div>

<div id="app">
  <div class="topbar">
    <div class="who">
      <div class="dot" id="statusDot"></div>
      <div>
        <div class="name">ShogunOS Remote</div>
        <div class="sub" id="statusText">Connected</div>
      </div>
    </div>
    <button class="iconbtn" onclick="disconnect()" title="Disconnect">⏻</button>
  </div>

  <div class="eyebrow">Now Live</div>
  <div class="hero" id="hero">
    <div class="badge" id="heroBadge"><span class="bdot"></span><span id="heroBadgeText">Idle</span></div>
    <div id="liveTitle">Nothing live</div>
    <div id="livePreview"></div>
    <div class="dots" id="dots"></div>
  </div>

  <div class="controls" id="controlArea">
    <button onclick="cmd('prev')" ontouchstart=""><span class="ic">◀</span>Prev</button>
    <button onclick="cmd('next')" ontouchstart=""><span class="ic">▶</span>Next</button>
    <button class="wide blank" onclick="cmd('blank')" ontouchstart=""><span class="ic">◐</span>&nbsp;Blank / Unblank</button>
    <button class="wide clear" onclick="cmd('clear')" ontouchstart=""><span class="ic">✕</span>&nbsp;Clear Screen</button>
  </div>
  <div class="swipe-hint">Swipe left/right on the card above to change slides</div>

  <div class="eyebrow">Up Next</div>
  <ul id="queue"></ul>
  <div id="queueEmpty" style="display:none">Queue is empty</div>

  <div class="eyebrow">Search &amp; Send Live</div>
  <div class="search-tabs">
    <button id="tabSongs" class="on" onclick="setSearchMode('song')">🎵 Songs</button>
    <button id="tabBible" onclick="setSearchMode('verse')">📖 Bible</button>
  </div>
  <input id="searchInput" placeholder="Search hymns and songs…" oninput="onSearchInput()"/>
  <ul id="searchResults"></ul>
  <div id="searchHint">Start typing a title, hymn number, or verse reference</div>
  <div id="searchEmpty" style="display:none">No matches</div>
</div>

<div id="toast"></div>

<script>
let pin = '__AUTOPIN__' || localStorage.getItem('shogun_remote_pin') || ''
let connected = false
let lastQueueSig = ''

// ── PIN box behavior: type-to-advance, backspace-to-retreat, paste support ──
const boxes = [...document.querySelectorAll('#pinBoxes input')]
boxes.forEach((b,i)=>{
  b.addEventListener('input', ()=>{
    b.value = b.value.replace(/[^0-9]/g,'').slice(0,1)
    if(b.value && i<3) boxes[i+1].focus()
    if(boxes.every(x=>x.value)) connect()
  })
  b.addEventListener('keydown', e=>{
    if(e.key==='Backspace' && !b.value && i>0) boxes[i-1].focus()
  })
  b.addEventListener('paste', e=>{
    const text=(e.clipboardData||window.clipboardData).getData('text').replace(/[^0-9]/g,'').slice(0,4)
    if(text.length===4){ text.split('').forEach((d,j)=>boxes[j].value=d); connect() }
    e.preventDefault()
  })
})

function shakePins(){ boxes.forEach(b=>{ b.classList.add('shake'); setTimeout(()=>b.classList.remove('shake'),350) }) }
function vibrate(ms){ if(navigator.vibrate) navigator.vibrate(ms) }
function toast(msg){
  const t=document.getElementById('toast')
  t.textContent=msg; t.classList.add('show')
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'), 1800)
}

function connect(){
  pin = boxes.map(b=>b.value).join('') || pin
  poll(true)
}
function disconnect(){
  localStorage.removeItem('shogun_remote_pin')
  connected=false; pin=''
  document.getElementById('app').style.display='none'
  document.getElementById('pinScreen').style.display='flex'
  boxes.forEach(b=>b.value=''); boxes[0].focus()
}

async function poll(isConnectAttempt){
  const btn=document.getElementById('connectBtn')
  if(isConnectAttempt && btn) btn.disabled=true
  try{
    const r = await fetch('/api/state?pin='+pin)
    if(!r.ok){
      if(isConnectAttempt){ document.getElementById('err').textContent='Wrong PIN — check Settings → Remote'; shakePins() }
      setStatus(false)
      if(btn) btn.disabled=false
      return
    }
    localStorage.setItem('shogun_remote_pin', pin)
    document.getElementById('pinScreen').style.display='none'
    document.getElementById('app').style.display='block'
    setStatus(true)
    const s = await r.json()
    renderState(s)
  }catch(e){
    if(isConnectAttempt){ document.getElementById('err').textContent='Cannot reach ShogunOS on this network'; shakePins() }
    setStatus(false)
  }
  if(btn) btn.disabled=false
}

function setStatus(ok){
  connected = ok
  const dot=document.getElementById('statusDot'), txt=document.getElementById('statusText')
  if(!dot) return
  dot.className = ok ? 'dot' : 'dot bad'
  txt.textContent = ok ? 'Connected' : 'Reconnecting…'
}

function renderState(s){
  const hero = document.getElementById('hero')
  const badgeText = document.getElementById('heroBadgeText')
  hero.classList.remove('is-live','is-blank')
  if(s.blankScreen){ hero.classList.add('is-blank'); badgeText.textContent='Blanked' }
  else if(s.live){ hero.classList.add('is-live'); badgeText.textContent='Live' }
  else { badgeText.textContent='Idle' }

  document.getElementById('liveTitle').textContent = s.blankScreen ? 'Screen blanked' : (s.live || 'Nothing live')
  document.getElementById('livePreview').textContent = s.blankScreen ? '' : (s.sectionPreview || '')

  const dotsEl = document.getElementById('dots')
  dotsEl.innerHTML = ''
  const total = s.totalSections||0
  if(total>1){
    for(let i=0;i<total;i++){
      const d=document.createElement('i')
      if(i===s.currentSection) d.className='on'
      dotsEl.appendChild(d)
    }
  }

  const sig = JSON.stringify(s.queue)
  if(sig!==lastQueueSig){
    lastQueueSig = sig
    const ul = document.getElementById('queue')
    const empty = document.getElementById('queueEmpty')
    ul.innerHTML = ''
    empty.style.display = s.queue.length ? 'none' : 'block'
    s.queue.forEach(item=>{
      const li = document.createElement('li')
      li.className = 'k-'+(item.type||'')
      li.innerHTML = '<div><div class="t">'+escapeHtml(item.title)+'</div><div class="type">'+escapeHtml(item.type)+'</div></div>'
      const b = document.createElement('button')
      b.textContent = 'Go Live'
      b.onclick = ()=>{ vibrate(15); cmd('queue-go', item.id) }
      li.appendChild(b)
      ul.appendChild(li)
    })
  }
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

async function cmd(action, id){
  vibrate(action==='clear'?[10,40,10]:12)
  try{
    await fetch('/api/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pin, action, id }) })
  }catch{ toast('Command failed — check connection') }
  poll(false)
}

// ── Search & Send Live (Songs / Bible) ────────────────────────────────────
let searchMode = 'song'
let searchDebounce = null
function setSearchMode(mode){
  searchMode = mode
  document.getElementById('tabSongs').classList.toggle('on', mode==='song')
  document.getElementById('tabBible').classList.toggle('on', mode==='verse')
  document.getElementById('searchInput').placeholder = mode==='song' ? 'Search hymns and songs…' : 'e.g. John 3:16, or "grace"'
  document.getElementById('searchInput').value = ''
  renderSearchResults([])
  document.getElementById('searchHint').style.display = 'block'
  document.getElementById('searchEmpty').style.display = 'none'
}
function onSearchInput(){
  clearTimeout(searchDebounce)
  const q = document.getElementById('searchInput').value.trim()
  if(q.length < 2){
    renderSearchResults([])
    document.getElementById('searchHint').style.display = 'block'
    document.getElementById('searchEmpty').style.display = 'none'
    return
  }
  document.getElementById('searchHint').style.display = 'none'
  searchDebounce = setTimeout(()=>runSearch(q), 300)
}
async function runSearch(q){
  try{
    const endpoint = searchMode==='song' ? '/api/songs' : '/api/bible'
    const r = await fetch(endpoint+'?q='+encodeURIComponent(q)+'&pin='+pin)
    if(!r.ok) return
    const data = await r.json()
    renderSearchResults(data.results||[])
  }catch{ /* silent — poll loop will surface the disconnect */ }
}
function renderSearchResults(results){
  const ul = document.getElementById('searchResults')
  const empty = document.getElementById('searchEmpty')
  const hint = document.getElementById('searchHint')
  ul.innerHTML = ''
  if(results.length===0){
    empty.style.display = hint.style.display==='none' ? 'block' : 'none'
    return
  }
  empty.style.display = 'none'
  results.forEach(item=>{
    const li = document.createElement('li')
    if(searchMode==='song'){
      li.innerHTML = '<div><div class="t">'+escapeHtml(item.title)+'</div><div class="sub">'+(item.hymn_number?('Hymn #'+item.hymn_number+' · '):'')+(item.source==='custom'?'My Songs':'Hymnal')+'</div></div>'
    } else {
      li.innerHTML = '<div><div class="t">'+escapeHtml(item.book)+' '+item.chapter+':'+item.verse+'</div><div class="sub">'+escapeHtml((item.text||'').slice(0,60))+'…</div></div>'
    }
    const b = document.createElement('button')
    b.textContent = 'Go Live'
    b.onclick = ()=>sendContentLive(item)
    li.appendChild(b)
    ul.appendChild(li)
  })
}
async function sendContentLive(item){
  vibrate(15)
  const body = searchMode==='song'
    ? { pin, action:'content-go', kind:'song', id:item.id }
    : { pin, action:'content-go', kind:'verse', book:item.book, chapter:item.chapter, verse:item.verse }
  try{
    const r = await fetch('/api/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    if(!r.ok) toast('Could not send that live')
    else toast(searchMode==='song' ? 'Song sent live' : 'Verse sent live')
  }catch{ toast('Command failed — check connection') }
  poll(false)
}

// ── Swipe gestures on the hero card: swipe left = next, right = prev ──────
let touchX=null, touchY=null
const heroEl = document.getElementById('hero')
heroEl.addEventListener('touchstart', e=>{ touchX=e.touches[0].clientX; touchY=e.touches[0].clientY }, {passive:true})
heroEl.addEventListener('touchend', e=>{
  if(touchX==null) return
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)*1.5){
    vibrate(12)
    cmd(dx < 0 ? 'next' : 'prev')
  }
  touchX = null
}, {passive:true})

if(pin){ pin.split('').forEach((d,i)=>{ if(boxes[i]) boxes[i].value=d }); poll(true) }
else boxes[0].focus()
setInterval(()=>{ if(pin) poll(false) }, 1500)
</script>
</body></html>`
