/**
 * ShogunOS Data Setup
 * Run once from your project root: node setup-data.js
 * Downloads KJV, ASV, WEB Bibles + SDA Hymnal into data/
 */

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const DATA = path.join(__dirname, 'data')
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA)

function get(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { headers: { 'User-Agent': 'ShogunOS/1.0' } }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) return get(res.headers.location).then(resolve).catch(reject)
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

function log(msg) { console.log(msg) }

// ── KJV ──────────────────────────────────────────────────────────────────────
async function downloadKJV() {
  const out = path.join(DATA, 'kjv.json')
  if (fs.existsSync(out)) { log('✓ KJV already exists'); return }
  log('⬇ Downloading KJV...')
  const buf  = await get('https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/Bible.json')
  const data = JSON.parse(buf.toString('utf-8'))
  const verses = []
  let id = 1
  for (const book of data) {
    const name = book.name || book.abbrev || 'Unknown'
    for (let ci = 0; ci < book.chapters.length; ci++) {
      const ch = book.chapters[ci]
      const arr = Array.isArray(ch) ? ch : ch.verses || []
      for (let vi = 0; vi < arr.length; vi++) {
        const text = typeof arr[vi] === 'string' ? arr[vi] : arr[vi].text || ''
        if (text.trim()) verses.push({ id: id++, version: 'KJV', book: name, chapter: ci+1, verse: vi+1, text: text.trim() })
      }
    }
  }
  fs.writeFileSync(out, JSON.stringify(verses))
  log(`✓ KJV: ${verses.length} verses`)
}

// ── SCROLLMAPPER FORMAT LOADER ────────────────────────────────────────────────
const BOOK_NAMES = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
  'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
  'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
  'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
  'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
  '2 Corinthians','Galatians','Ephesians','Philippians','Colossians',
  '1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon',
  'Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'
]

function parseScrollmapper(raw, version) {
  const data   = JSON.parse(raw)
  const rows   = data.resultset?.row || data
  const verses = []
  let id = 1
  for (const row of rows) {
    const f = row.field || row
    if (!Array.isArray(f) || f.length < 5) continue
    const bookId = parseInt(f[1]) - 1
    const bookName = BOOK_NAMES[bookId] || `Book ${f[1]}`
    const text = String(f[4] || '').trim()
    if (text) verses.push({ id: id++, version, book: bookName, chapter: Number(f[2]), verse: Number(f[3]), text })
  }
  return verses
}

async function downloadASV() {
  const out = path.join(DATA, 'asv.json')
  if (fs.existsSync(out)) { log('✓ ASV already exists'); return }
  log('⬇ Downloading ASV...')
  // Use Bolls Life API - free Bible API, no key required
  const books = [
    'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
    '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
    'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
    'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
    'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
    'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
    '2 Corinthians','Galatians','Ephesians','Philippians','Colossians',
    '1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon',
    'Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'
  ]
  const verses = []
  let id = 1
  for (let b = 1; b <= 66; b++) {
    process.stdout.write(`\r  ASV: book ${b}/66...`)
    try {
      const buf  = await get(`https://bolls.life/get-text/ASV/${b}/`)
      const data = JSON.parse(buf.toString('utf-8'))
      for (const v of data) {
        if (v.text) verses.push({ id: id++, version: 'ASV', book: books[b-1], chapter: v.chapter, verse: v.verse, text: v.text.trim() })
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  fs.writeFileSync(out, JSON.stringify(verses))
  log(`\n✓ ASV: ${verses.length} verses`)
}

async function downloadWEB() {
  const out = path.join(DATA, 'web.json')
  if (fs.existsSync(out)) { log('✓ WEB already exists'); return }
  log('⬇ Downloading WEB...')
  const books = [
    'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
    '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
    'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
    'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
    'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
    'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
    '2 Corinthians','Galatians','Ephesians','Philippians','Colossians',
    '1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon',
    'Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'
  ]
  const verses = []
  let id = 1
  for (let b = 1; b <= 66; b++) {
    process.stdout.write(`\r  WEB: book ${b}/66...`)
    try {
      const buf  = await get(`https://bolls.life/get-text/WEB/${b}/`)
      const data = JSON.parse(buf.toString('utf-8'))
      for (const v of data) {
        if (v.text) verses.push({ id: id++, version: 'WEB', book: books[b-1], chapter: v.chapter, verse: v.verse, text: v.text.trim() })
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  fs.writeFileSync(out, JSON.stringify(verses))
  log(`\n✓ WEB: ${verses.length} verses`)
}

// ── SDA HYMNAL ───────────────────────────────────────────────────────────────
async function downloadSDAHymnal() {
  const out = path.join(DATA, 'sda_hymnal.json')
  if (fs.existsSync(out)) { log('✓ SDA Hymnal already exists'); return }
  log('⬇ Downloading SDA Hymnal (695 hymns)...')
  const hymns = []
  let ok = 0, fail = 0
  for (let i = 1; i <= 695; i++) {
    process.stdout.write(`\r  Hymn ${i}/695...`)
    try {
      const url = `https://cdn.jsdelivr.net/npm/sda-hymnal@1.0.2/data/${String(i).padStart(3,'0')}.json`
      const buf = await get(url)
      hymns.push(JSON.parse(buf.toString('utf-8')))
      ok++
    } catch { fail++ }
    await new Promise(r => setTimeout(r, 30))
  }
  fs.writeFileSync(out, JSON.stringify(hymns))
  log(`\n✓ SDA Hymnal: ${ok} hymns (${fail} failed)`)
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('\n⚔  ShogunOS Data Setup\n')
  const tasks = [
    ['KJV Bible',    downloadKJV],
    ['ASV Bible',    downloadASV],
    ['WEB Bible',    downloadWEB],
    ['SDA Hymnal',   downloadSDAHymnal],
  ]
  for (const [name, fn] of tasks) {
    try { await fn() }
    catch (e) { log(`✗ ${name}: ${e.message}`) }
  }
  log('\n✓ Done! Restart ShogunOS to load the new data.\n')
}

main()