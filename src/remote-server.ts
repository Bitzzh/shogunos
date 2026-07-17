import http from 'node:http'
import os from 'node:os'
import type { BrowserWindow } from 'electron'

// ── ShogunOS Remote Control ─────────────────────────────────────────────────
// A dependency-free LAN server so a phone/tablet on the same Wi-Fi can drive
// the live output — the #1 feature gap versus FreeShow/ProPresenter. No
// websocket lib, no express: just node:http + short polling from the page,
// which is plenty responsive for "next slide" over a local network and keeps
// the main-process bundle free of extra dependencies to package.
//
// Security model: this is a LAN-only convenience tool, not a public server.
// It binds to all interfaces (so phones can reach it) but every request must
// carry the 4-digit PIN shown in Settings → Remote, which is regenerated
// every time the app starts. That's enough to stop someone on the same café
// Wi-Fi from blanking your Sunday-service screen by accident.

export interface RemoteState {
  live: string | null
  blankScreen: boolean
  currentSection: number
  totalSections: number
  sectionPreview: string
  queue: { id: string; title: string; type: string }[]
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
      return send(res, 200, REMOTE_HTML, 'text/html')
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      if (!checkPin(url, null)) return send(res, 401, JSON.stringify({ error: 'bad pin' }))
      return send(res, 200, JSON.stringify(state))
    }

    if (req.method === 'POST' && url.pathname === '/api/command') {
      let raw = ''
      req.on('data', c => { raw += c })
      req.on('end', () => {
        let body: any = {}
        try { body = JSON.parse(raw || '{}') } catch { /* ignore */ }
        if (!checkPin(url, body)) return send(res, 401, JSON.stringify({ error: 'bad pin' }))
        const win = getMainWindow()
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
  #app{display:none;padding:16px;padding-bottom:100px}
  h1{font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:#8b8072;margin:0 0 4px}
  #liveTitle{font-size:20px;font-weight:600;margin-bottom:2px}
  #livePreview{font-size:14px;color:#b3a690;white-space:pre-line;min-height:20px;margin-bottom:16px}
  .controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
  .controls button{padding:20px;border-radius:14px;border:1px solid #4c5a94;background:#1b2340;color:#fff;font-size:16px;font-weight:600}
  .controls button.wide{grid-column:1 / -1}
  .controls button.blank{background:#b8862f;border-color:#b8862f}
  .controls button.clear{background:#7a1b1f;border-color:#7a1b1f}
  #queue{list-style:none;padding:0;margin:0}
  #queue li{padding:14px;border:1px solid #2a2820;border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
  #queue li .t{font-size:14px}
  #queue li .type{font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#8b8072}
  #queue li button{background:#26305c;border:1px solid #4c5a94;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px}
  .err{color:#c23b3b;font-size:13px;min-height:16px}
</style></head>
<body>
<div id="pinScreen">
  <h1 style="margin:0">ShogunOS Remote</h1>
  <input id="pinInput" inputmode="numeric" maxlength="4" placeholder="PIN"/>
  <button onclick="connect()">Connect</button>
  <div class="err" id="err"></div>
</div>
<div id="app">
  <h1>Now Live</h1>
  <div id="liveTitle">Nothing live</div>
  <div id="livePreview"></div>
  <div class="controls">
    <button onclick="cmd('prev')">◀ Prev</button>
    <button onclick="cmd('next')">Next ▶</button>
    <button class="wide blank" onclick="cmd('blank')">Blank / Unblank</button>
    <button class="wide clear" onclick="cmd('clear')">Clear Screen</button>
  </div>
  <h1>Queue</h1>
  <ul id="queue"></ul>
</div>
<script>
let pin = localStorage.getItem('shogun_remote_pin') || ''
function connect(){
  pin = document.getElementById('pinInput').value.trim()
  poll(true)
}
async function poll(isConnectAttempt){
  try{
    const r = await fetch('/api/state?pin='+pin)
    if(!r.ok){ if(isConnectAttempt) document.getElementById('err').textContent = 'Wrong PIN'; return }
    localStorage.setItem('shogun_remote_pin', pin)
    document.getElementById('pinScreen').style.display='none'
    document.getElementById('app').style.display='block'
    const s = await r.json()
    document.getElementById('liveTitle').textContent = s.blankScreen ? 'Screen blanked' : (s.live || 'Nothing live')
    document.getElementById('livePreview').textContent = s.blankScreen ? '' : (s.sectionPreview || '')
    const ul = document.getElementById('queue')
    ul.innerHTML = ''
    s.queue.forEach(item=>{
      const li = document.createElement('li')
      li.innerHTML = '<div><div class="t">'+item.title+'</div><div class="type">'+item.type+'</div></div>'
      const b = document.createElement('button')
      b.textContent = 'Go Live'
      b.onclick = ()=>cmd('queue-go', item.id)
      li.appendChild(b)
      ul.appendChild(li)
    })
  }catch(e){ if(isConnectAttempt) document.getElementById('err').textContent = 'Cannot reach ShogunOS' }
}
async function cmd(action, id){
  await fetch('/api/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pin, action, id }) })
  poll(false)
}
if(pin){ document.getElementById('pinInput').value = pin; poll(true) }
setInterval(()=>poll(false), 1500)
</script>
</body></html>`
