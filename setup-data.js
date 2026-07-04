/**
 * ShogunOS Data Setup
 * Run once from your project root: node setup-data.js
 * Downloads public-domain Bible translations (KJV, ASV, WEB, YLT, BBE,
 * Webster, Douay-Rheims) + SDA Hymnal into data/
 * (English Darby isn't available from any free public-domain source we
 * could find, so it's not included — see note near the task list below.)
 *
 * Only public-domain / freely-redistributable translations are included —
 * copyrighted versions (NIV, ESV, NKJV, etc.) require a license and are not
 * downloaded here. If a translation code below is unavailable from the
 * source API, that download is skipped automatically and everything else
 * still runs.
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

// A file only counts as "already downloaded" if it actually has verses in it —
// a previous failed/offline run can leave behind an empty `[]` file, which
// would otherwise block all future retries forever.
function isPopulated(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(data) && data.length > 0
  } catch { return false }
}

// ── KJV ──────────────────────────────────────────────────────────────────────
async function downloadKJV() {
  const out = path.join(DATA, 'kjv.json')
  if (isPopulated(out)) { log('✓ KJV already exists'); return }
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
  if (verses.length === 0) { log('✗ KJV: no verses downloaded, leaving unwritten so it retries next run'); return }
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

// ── GETBIBLE.NET LOADER ─────────────────────────────────────────────────────
// api.getbible.net/v2/<code>.json returns an ENTIRE translation in one request
// (books -> chapters -> verses), so there's no per-book/chapter looping and
// no risk of a missing-parameter bug like the old bolls.life endpoint had.
// `code` is getbible's own translation id; `versionTag` is what we tag our
// stored verse rows with (kept the same as before for compatibility with the
// rest of the app).
async function downloadGetBible(code, filename, versionTag, displayName) {
  const out = path.join(DATA, filename)
  if (isPopulated(out)) { log(`✓ ${displayName} already exists`); return }
  log(`⬇ Downloading ${displayName}...`)
  try {
    const buf  = await get(`https://api.getbible.net/v2/${code}.json`)
    const data = JSON.parse(buf.toString('utf-8'))
    const verses = []
    let id = 1
    for (const book of data.books || []) {
      for (const chapter of book.chapters || []) {
        for (const v of chapter.verses || []) {
          // getbible wraps italics/inserted-word markup in tags like <FI>...<Fi>; strip all tags.
          const text = String(v.text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          if (text) verses.push({ id: id++, version: versionTag, book: book.name, chapter: v.chapter, verse: v.verse, text })
        }
      }
    }
    if (verses.length === 0) { log(`✗ ${displayName}: no verses downloaded, will retry next run`); return }
    fs.writeFileSync(out, JSON.stringify(verses))
    log(`✓ ${displayName}: ${verses.length} verses`)
  } catch (e) {
    log(`✗ ${displayName}: ${e.message}, will retry next run`)
  }
}

// ── SDA HYMNAL ───────────────────────────────────────────────────────────────
async function downloadSDAHymnal() {
  const out = path.join(DATA, 'sda_hymnal.json')
  if (isPopulated(out)) { log('✓ SDA Hymnal already exists'); return }
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
    ['ASV Bible',    () => downloadGetBible('asv', 'asv.json', 'ASV', 'ASV Bible')],
    ['WEB Bible',    () => downloadGetBible('web', 'web.json', 'WEB', 'WEB Bible')],
    ['YLT Bible',    () => downloadGetBible('ylt', 'ylt.json', 'YLT', 'YLT Bible')],
    ['BBE Bible',    () => downloadGetBible('basicenglish', 'bbe.json', 'BBE', 'BBE Bible')],
    ['Webster Bible',() => downloadGetBible('wb', 'webster.json', 'WBS', 'Webster Bible')],
    ['Douay-Rheims', () => downloadGetBible('douayrheims', 'drc.json', 'DRC', 'Douay-Rheims')],
    // NOTE: An English Darby (1890) translation isn't available from any free
    // public-domain JSON/API source we could find (bolls.life's "DARBY" code
    // is the *French* Darby; getbible.net's is French too). Skipped for now —
    // if you find a source, add it back the same way as the entries above.
    ['SDA Hymnal',   downloadSDAHymnal],
  ]
  for (const [name, fn] of tasks) {
    try { await fn() }
    catch (e) { log(`✗ ${name}: ${e.message}`) }
  }
  log('\n✓ Done! Restart ShogunOS to load the new data.\n')
}

main()