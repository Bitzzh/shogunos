import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

// ── INTERFACES ────────────────────────────────────────────────────────────

interface Song {
  id: number; title: string; language: string; source: string
  hymn_number: number | null; created_at: string
}
interface SongSection {
  id: number; song_id: number; type: string; order_num: number; content: string
}
interface BibleVerse {
  id: number; version: string; book: string; chapter: number; verse: number; text: string; language: string
}
interface DailyVerse {
  id: number; verse_id: number; date: string; region: string
}
interface ServiceQueueItem {
  id: number; title: string; type: string; song_id: number | null; verse_ref: string | null; order_num: number
}
export interface Slide {
  id: number; title: string; type: 'text'|'scripture'|'announcement'|'blank'
  content: string; notes: string; bg_color: string; font_color: string
  font_size: number; text_align: 'left'|'center'|'right'; order_num: number
  tags: string[]; created_at: string; updated_at: string
}
interface User {
  id: number; username: string; password_hash: string
  role: 'ADMIN'|'OPERATOR'|'PRESENTER'|'VIEWER'
  display_name: string; created_at: string; last_login: string | null
}
export interface MediaFolder {
  id: number; name: string; event_date: string | null; created_at: string
}
export interface MediaItem {
  id: number; folder_id: number; name: string; path: string
  mime_type: string; size: number; created_at: string
}
export interface DisplaySettings {
  [key: string]: any
}
interface DB {
  songs: Song[]; song_sections: SongSection[]; bible_verses: BibleVerse[]
  daily_verses: DailyVerse[]; service_queue: ServiceQueueItem[]
  users: User[]; slides: Slide[]
  media_folders: MediaFolder[]; media_items: MediaItem[]
  display_settings: DisplaySettings
  meta: { last_id: number; bible_loaded?: string }
}

// ── CORE ──────────────────────────────────────────────────────────────────

let dbPath: string
let db: DB

function hashPassword(p: string) {
  return crypto.createHash('sha256').update(p + 'shogunos_salt_2024').digest('hex')
}
function nextId() { db.meta.last_id += 1; return db.meta.last_id }
function save() { fs.writeFileSync(dbPath, JSON.stringify(db)) }

function load(): DB {
  if (fs.existsSync(dbPath)) {
    const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
    if (!parsed.users)  parsed.users  = []
    if (!parsed.slides) parsed.slides = []
    if (!parsed.media_folders) parsed.media_folders = []
    if (!parsed.media_items)   parsed.media_items   = []
    if (!parsed.display_settings) parsed.display_settings = {}
    if (!parsed.meta)   parsed.meta   = { last_id: 0 }
    return parsed
  }
  return { songs:[], song_sections:[], bible_verses:[], daily_verses:[], service_queue:[], users:[], slides:[], media_folders:[], media_items:[], display_settings:{}, meta:{ last_id:0 } }
}

function findData(file: string): string | null {
  const tries = [
    path.join(process.resourcesPath || '', 'data', file),
    path.join(process.cwd(), 'data', file),
    path.join(__dirname, '..', '..', 'data', file),
  ]
  return tries.find(p => fs.existsSync(p)) || null
}

function capitalize(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s }

// ── BIBLE LOADING ─────────────────────────────────────────────────────────

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

function loadAllBibles(): BibleVerse[] {
  const all: BibleVerse[] = []
  let gid = 1

  const configs = [
    { file: 'kjv.json', version: 'KJV' },
    { file: 'asv.json', version: 'ASV' },
    { file: 'web.json', version: 'WEB' },
  ]

  for (const { file, version } of configs) {
    const p = findData(file)
    if (!p) { console.log(`${version} not found — run setup-data.js`); continue }
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^\uFEFF/, ''))

      if (Array.isArray(data) && data[0]?.book && data[0]?.chapter) {
        for (const v of data) {
          if (v.text?.trim()) all.push({ id: gid++, version, book: v.book, chapter: +v.chapter, verse: +v.verse, text: v.text.trim(), language: 'en' })
        }
      }
      else if (data.resultset?.row) {
        for (const row of data.resultset.row) {
          const f = row.field
          if (!f || f.length < 5) continue
          const bookName = BOOK_NAMES[parseInt(f[1]) - 1] || `Book ${f[1]}`
          const text = String(f[4]).trim()
          if (text) all.push({ id: gid++, version, book: bookName, chapter: +f[2], verse: +f[3], text, language: 'en' })
        }
      }
      else if (Array.isArray(data) && data[0]?.chapters) {
        for (const book of data) {
          const bname = capitalize(book.name || book.abbrev || 'Unknown')
          for (let ci = 0; ci < book.chapters.length; ci++) {
            const arr = Array.isArray(book.chapters[ci]) ? book.chapters[ci] : book.chapters[ci].verses || []
            for (let vi = 0; vi < arr.length; vi++) {
              const text = typeof arr[vi] === 'string' ? arr[vi] : arr[vi].text || ''
              if (text.trim()) all.push({ id: gid++, version, book: bname, chapter: ci+1, verse: vi+1, text: text.trim(), language: 'en' })
            }
          }
        }
      }
      console.log(`Loaded ${version}: ${all.filter(v => v.version === version).length} verses`)
    } catch(e) { console.log(`Error loading ${version}:`, e) }
  }
  return all
}

// ── SDA HYMNAL LOADING ────────────────────────────────────────────────────

function loadSDAHymnal() {
  const p = findData('sda_hymnal.json')
  if (!p) { console.log('SDA Hymnal not found — run setup-data.js'); return [] }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^\uFEFF/, ''))
    const hymns: { title: string; hymn: number; sections: { type: string; order: number; content: string }[] }[] = []
    for (const item of data) {
      if (!item.hymnTitle || !item.hymnNumber) continue
      const sections: { type: string; order: number; content: string }[] = []
      let order = 1
      for (const v of item.verses || []) {
        if (!v.text) continue
        const vn = (v.verseName || '').toLowerCase()
        const type = vn.includes('refrain') || vn.includes('chorus') ? 'chorus' : 'verse'
        sections.push({ type, order: order++, content: v.text.trim() })
      }
      if (sections.length > 0) hymns.push({ title: item.hymnTitle, hymn: item.hymnNumber, sections })
    }
    console.log(`Loaded SDA Hymnal: ${hymns.length} hymns`)
    return hymns
  } catch(e) { console.log('SDA Hymnal error:', e); return [] }
}

// ── SEED DATA ─────────────────────────────────────────────────────────────

function seedUsers() {
  if (db.users.length > 0) return
  for (const u of [
    { username:'admin',     password:'Admin@2024',  role:'ADMIN',     display_name:'Administrator'    },
    { username:'operator',  password:'Operator@1',  role:'OPERATOR',  display_name:'Default Operator' },
    { username:'presenter', password:'Present@1',   role:'PRESENTER', display_name:'Presenter'        },
    { username:'Admin_10',  password:'Shogun@2024', role:'ADMIN',     display_name:'Admin_10'         },
  ] as any[]) {
    db.users.push({ id: nextId(), username: u.username, password_hash: hashPassword(u.password), role: u.role, display_name: u.display_name, created_at: new Date().toISOString(), last_login: null })
  }
  save()
}

const FALLBACK_SONGS = [
  { title:'Holy Holy Holy', hymn:1, sections:[
    {type:'verse',order:1,content:'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty!\nGod in three persons, blessed Trinity!'},
    {type:'verse',order:2,content:'Holy, holy, holy! All the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWhich wert, and art, and evermore shalt be.'},
    {type:'verse',order:3,content:'Holy, holy, holy! Though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see;\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.'},
    {type:'verse',order:4,content:'Holy, holy, holy! Lord God Almighty!\nAll Thy works shall praise Thy name, in earth and sky and sea;\nHoly, holy, holy! Merciful and mighty!\nGod in three persons, blessed Trinity!'},
  ]},
  { title:'Amazing Grace', hymn:2, sections:[
    {type:'verse',order:1,content:"Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see."},
    {type:'verse',order:2,content:"'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed."},
    {type:'verse',order:3,content:"Through many dangers, toils and snares,\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home."},
    {type:'verse',order:4,content:"When we've been there ten thousand years,\nBright shining as the sun,\nWe've no less days to sing God's praise\nThan when we'd first begun."},
  ]},
  { title:'Great Is Thy Faithfulness', hymn:3, sections:[
    {type:'verse',order:1,content:'Great is Thy faithfulness, O God my Father,\nThere is no shadow of turning with Thee;\nThou changest not, Thy compassions, they fail not\nAs Thou hast been Thou forever wilt be.'},
    {type:'chorus',order:2,content:'Great is Thy faithfulness!\nGreat is Thy faithfulness!\nMorning by morning new mercies I see;\nAll I have needed Thy hand hath provided,\nGreat is Thy faithfulness, Lord, unto me!'},
  ]},
  { title:'How Great Thou Art', hymn:4, sections:[
    {type:'verse',order:1,content:'O Lord my God, when I in awesome wonder\nConsider all the worlds Thy hands have made,\nI see the stars, I hear the rolling thunder,\nThy power throughout the universe displayed.'},
    {type:'chorus',order:2,content:'Then sings my soul, my Saviour God, to Thee:\nHow great Thou art, how great Thou art!\nThen sings my soul, my Saviour God, to Thee:\nHow great Thou art, how great Thou art!'},
  ]},
  { title:'What A Friend We Have In Jesus', hymn:5, sections:[
    {type:'verse',order:1,content:'What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!'},
    {type:'verse',order:2,content:'Have we trials and temptations?\nIs there trouble anywhere?\nWe should never be discouraged;\nTake it to the Lord in prayer!'},
  ]},
  { title:'Blessed Assurance', hymn:6, sections:[
    {type:'verse',order:1,content:'Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.'},
    {type:'chorus',order:2,content:'This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.'},
  ]},
  { title:'It Is Well With My Soul', hymn:7, sections:[
    {type:'verse',order:1,content:"When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul."},
    {type:'chorus',order:2,content:'It is well with my soul,\nIt is well, it is well with my soul.'},
  ]},
  { title:'Abide With Me', hymn:8, sections:[
    {type:'verse',order:1,content:'Abide with me; fast falls the eventide;\nThe darkness deepens; Lord, with me abide;\nWhen other helpers fail and comforts flee,\nHelp of the helpless, oh, abide with me.'},
    {type:'verse',order:2,content:"Swift to its close ebbs out life's little day;\nEarth's joys grow dim, its glories pass away;\nChange and decay in all around I see;\nO Thou who changest not, abide with me."},
  ]},
]

const FALLBACK_VERSES = [
  {book:'John',chapter:3,verse:16,text:'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.'},
  {book:'Psalm',chapter:23,verse:1,text:'The Lord is my shepherd, I lack nothing.'},
  {book:'Romans',chapter:8,verse:28,text:'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.'},
  {book:'Philippians',chapter:4,verse:13,text:'I can do all this through him who gives me strength.'},
  {book:'Jeremiah',chapter:29,verse:11,text:'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.'},
  {book:'Proverbs',chapter:3,verse:5,text:'Trust in the Lord with all your heart and lean not on your own understanding.'},
  {book:'Isaiah',chapter:40,verse:31,text:'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.'},
  {book:'Matthew',chapter:6,verse:33,text:'But seek first his kingdom and his righteousness, and all these things will be given to you as well.'},
  {book:'Psalm',chapter:46,verse:1,text:'God is our refuge and strength, an ever-present help in trouble.'},
  {book:'Joshua',chapter:1,verse:9,text:'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.'},
  {book:'2 Timothy',chapter:1,verse:7,text:'For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.'},
  {book:'Lamentations',chapter:3,verse:23,text:'They are new every morning; great is your faithfulness.'},
]

// ── INIT ──────────────────────────────────────────────────────────────────

export async function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'shogunos.json')
  db = load()
  seedUsers()

  // ── Songs / Hymnal ────────────────────────────────────────────────────
  const sdaHymns = loadSDAHymnal()
  const hasSDA = sdaHymns.length > 0
  const needsHymnalReload = db.songs.length === 0 || (hasSDA && db.songs.length <= 10)

  if (needsHymnalReload) {
    db.songs = []
    db.song_sections = []
    const songs = hasSDA ? sdaHymns : FALLBACK_SONGS
    for (const song of songs) {
      const id = nextId()
      db.songs.push({ id, title: song.title, language: 'en', source: 'hymnal', hymn_number: song.hymn, created_at: new Date().toISOString() })
      for (const s of song.sections) {
        db.song_sections.push({ id: nextId(), song_id: id, type: s.type, order_num: s.order, content: s.content })
      }
    }
    console.log(`Songs loaded: ${db.songs.length} (${hasSDA ? 'SDA Hymnal' : 'fallback'})`)
    save()
  }

  // ── Bible ────────────────────────────────────────────────────────────
  const hasKJVFile = !!findData('kjv.json')
  const currentBibleLoaded = db.meta.bible_loaded || ''
  const targetBible = [hasKJVFile && 'kjv', !!findData('asv.json') && 'asv', !!findData('web.json') && 'web'].filter(Boolean).join(',')
  const needsBibleReload = db.bible_verses.length === 0 || (targetBible !== currentBibleLoaded && targetBible !== '')

  if (needsBibleReload) {
    console.log('Loading Bible data...')
    const verses = loadAllBibles()
    if (verses.length > 0) {
      db.bible_verses = verses
      db.meta.bible_loaded = targetBible
      console.log(`Bible loaded: ${verses.length} verses across ${targetBible}`)
    } else {
      db.bible_verses = FALLBACK_VERSES.map((v, i) => ({ id: nextId(), version: 'KJV', ...v, language: 'en' }))
    }

    const pool = db.bible_verses.filter(v => v.version === 'KJV')
    const src  = pool.length > 0 ? pool : db.bible_verses
    db.daily_verses = []
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i)
      db.daily_verses.push({ id: nextId(), verse_id: src[i % src.length].id, date: d.toISOString().split('T')[0], region: 'ZW' })
    }
    save()
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────

export function loginUser(u: string, p: string): { success: boolean; user?: Omit<User,'password_hash'>; error?: string } {
  const user = db.users.find(x => x.username.toLowerCase() === u.toLowerCase())
  if (!user) return { success: false, error: 'User not found' }
  if (hashPassword(p) !== user.password_hash) return { success: false, error: 'Incorrect password' }
  user.last_login = new Date().toISOString(); save()
  const { password_hash, ...safe } = user
  return { success: true, user: safe }
}
export function getUsers() { return db.users.map(({ password_hash, ...u }) => u) }
export function createUser(username: string, password: string, role: User['role'], displayName: string): { success: boolean; error?: string } {
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) return { success: false, error: 'Username already exists' }
  if (password.length < 6) return { success: false, error: 'Password must be at least 6 characters' }
  db.users.push({ id: nextId(), username, password_hash: hashPassword(password), role, display_name: displayName || username, created_at: new Date().toISOString(), last_login: null })
  save(); return { success: true }
}
export function updateUserPassword(userId: number, oldPw: string, newPw: string): { success: boolean; error?: string } {
  const user = db.users.find(u => u.id === userId)
  if (!user) return { success: false, error: 'User not found' }
  if (hashPassword(oldPw) !== user.password_hash) return { success: false, error: 'Current password incorrect' }
  if (newPw.length < 6) return { success: false, error: 'New password must be at least 6 characters' }
  user.password_hash = hashPassword(newPw); save(); return { success: true }
}
export function deleteUser(userId: number): { success: boolean; error?: string } {
  const user = db.users.find(u => u.id === userId)
  if (!user) return { success: false, error: 'User not found' }
  if (user.role === 'ADMIN' && db.users.filter(u => u.role === 'ADMIN').length <= 1) return { success: false, error: 'Cannot delete the last admin' }
  db.users = db.users.filter(u => u.id !== userId); save(); return { success: true }
}
export function adminResetPassword(userId: number, newPw: string): { success: boolean; error?: string } {
  const user = db.users.find(u => u.id === userId)
  if (!user) return { success: false, error: 'User not found' }
  if (newPw.length < 6) return { success: false, error: 'New password must be at least 6 characters' }
  user.password_hash = hashPassword(newPw); save(); return { success: true }
}
export function updateUserRole(userId: number, role: User['role']): { success: boolean; error?: string } {
  const user = db.users.find(u => u.id === userId)
  if (!user) return { success: false, error: 'User not found' }
  if (user.role === 'ADMIN' && role !== 'ADMIN' && db.users.filter(u => u.role === 'ADMIN').length <= 1) {
    return { success: false, error: 'Cannot demote the last admin' }
  }
  user.role = role; save(); return { success: true }
}
export function forcedChangePassword(userId: number, newPw: string): { success: boolean; error?: string } {
  // Same as adminResetPassword — no "must change on next login" flag exists yet on User.
  // If you need that behavior, add a `must_change_password: boolean` field to the User interface.
  const user = db.users.find(u => u.id === userId)
  if (!user) return { success: false, error: 'User not found' }
  if (newPw.length < 6) return { success: false, error: 'New password must be at least 6 characters' }
  user.password_hash = hashPassword(newPw); save(); return { success: true }
}

// ── SONGS ─────────────────────────────────────────────────────────────────

export function searchSongs(query: string) {
  const q = query.toLowerCase().trim()
  return db.songs
    .filter(s => s.source === 'hymnal' && (q === '' || s.title.toLowerCase().includes(q)))
    .sort((a,b) => (a.hymn_number||999) - (b.hymn_number||999))
}
export function getSongSections(songId: number) {
  return db.song_sections.filter(s => s.song_id === songId).sort((a,b) => a.order_num - b.order_num)
}
export function addSong(title: string, language: string, source: string, hymnNumber?: number) {
  const id = nextId()
  db.songs.push({ id, title, language, source, hymn_number: hymnNumber || null, created_at: new Date().toISOString() })
  save(); return id
}
export function addSongSection(songId: number, type: string, orderNum: number, content: string) {
  db.song_sections.push({ id: nextId(), song_id: songId, type, order_num: orderNum, content }); save()
}
export function deleteSong(songId: number) {
  db.songs = db.songs.filter(s => s.id !== songId)
  db.song_sections = db.song_sections.filter(s => s.song_id !== songId); save()
}

// ── BIBLE ─────────────────────────────────────────────────────────────────

export function getDailyVerse() {
  const today = new Date().toISOString().split('T')[0]
  const dv = db.daily_verses.find(v => v.date === today)
  if (!dv) return null
  return db.bible_verses.find(v => v.id === dv.verse_id) || null
}
export function searchBibleVerses(query: string, version?: string) {
  const q = query.toLowerCase().trim()
  const filtered = db.bible_verses.filter(v =>
    (version ? v.version === version : true) &&
    (v.text.toLowerCase().includes(q) || v.book.toLowerCase().includes(q))
  )
  filtered.sort((a, b) => {
    const aBook  = a.book.toLowerCase().startsWith(q) ? 0 : 1
    const bBook  = b.book.toLowerCase().startsWith(q) ? 0 : 1
    const aExact = a.text.toLowerCase().includes(q) ? 0 : 1
    const bExact = b.text.toLowerCase().includes(q) ? 0 : 1
    return (aBook + aExact) - (bBook + bExact)
  })
  return filtered.slice(0, 200)
}
export function getBibleVerse(book: string, chapter: number, verse: number) {
  return db.bible_verses.find(v => v.book.toLowerCase().includes(book.toLowerCase()) && v.chapter === chapter && v.verse === verse) || null
}
export function getBibleTranslations() {
  return Array.from(new Set(db.bible_verses.map(v => v.version)))
}
export function getBibleBooks(version?: string) {
  const verses = version ? db.bible_verses.filter(v => v.version === version) : db.bible_verses
  const present = new Set(verses.map(v => v.book))
  const ordered = BOOK_NAMES.filter(b => present.has(b))
  const extras = Array.from(present).filter(b => !BOOK_NAMES.includes(b))
  return [...ordered, ...extras]
}
export function getBibleChapters(book: string, version?: string) {
  const verses = db.bible_verses.filter(v =>
    v.book === book && (version ? v.version === version : true)
  )
  const chapters = Array.from(new Set(verses.map(v => v.chapter)))
  return chapters.sort((a, b) => a - b)
}
export function getBibleChapterVerses(book: string, chapter: number, version?: string) {
  return db.bible_verses
    .filter(v => v.book === book && v.chapter === chapter && (version ? v.version === version : true))
    .sort((a, b) => a.verse - b.verse)
}

// ── QUEUE ─────────────────────────────────────────────────────────────────

export function getServiceQueue() { return db.service_queue.sort((a,b) => a.order_num - b.order_num) }
export function addToServiceQueue(title: string, type: string, songId?: number, verseRef?: string) {
  db.service_queue.push({ id: nextId(), title, type, song_id: songId||null, verse_ref: verseRef||null, order_num: db.service_queue.length+1 }); save()
}
export function clearServiceQueue() { db.service_queue = []; save() }
export function removeFromServiceQueue(id: number) {
  db.service_queue = db.service_queue.filter(q => q.id !== id)
  db.service_queue.forEach((q, i) => { q.order_num = i + 1 })
  save()
}
export function reorderServiceQueue(orderedIds: number[]) {
  orderedIds.forEach((id, i) => {
    const item = db.service_queue.find(q => q.id === id)
    if (item) item.order_num = i + 1
  })
  save()
}

// ── THEMES ────────────────────────────────────────────────────────────────

export function getThemes() {
  return [
    {id:1, name:'Default', font_size:48, font_color:'#FFFFFF', text_align:'center', bg_color:'#000000'},
    {id:2, name:'Large',   font_size:60, font_color:'#FFFFFF', text_align:'center', bg_color:'#000000'},
    {id:3, name:'Crimson', font_size:48, font_color:'#FF9A00', text_align:'center', bg_color:'#1A0303'},
    {id:4, name:'Sacred',  font_size:48, font_color:'#A78BFA', text_align:'center', bg_color:'#0F0620'},
    {id:5, name:'Arctic',  font_size:48, font_color:'#7DD3FC', text_align:'center', bg_color:'#020B18'},
    {id:6, name:'Ember',   font_size:48, font_color:'#FFB800', text_align:'center', bg_color:'#0C0F18'},
  ]
}

// ── SLIDES ────────────────────────────────────────────────────────────────

export function getSlides() { return db.slides.sort((a,b) => a.order_num - b.order_num) }
export function getSlide(id: number) { return db.slides.find(s => s.id === id) }
export function createSlide(data: Partial<Slide>): Slide {
  const maxOrder = db.slides.reduce((m,s) => Math.max(m,s.order_num), 0)
  const slide: Slide = { id:nextId(), title:data.title||'Untitled', type:data.type||'text', content:data.content||'', notes:data.notes||'', bg_color:data.bg_color||'#000000', font_color:data.font_color||'#FFFFFF', font_size:data.font_size||48, text_align:data.text_align||'center', order_num:maxOrder+1, tags:data.tags||[], created_at:new Date().toISOString(), updated_at:new Date().toISOString() }
  db.slides.push(slide); save(); return slide
}
export function updateSlide(id: number, data: Partial<Slide>): Slide {
  const idx = db.slides.findIndex(s => s.id === id)
  if (idx === -1) throw new Error('Slide not found')
  db.slides[idx] = { ...db.slides[idx], ...data, id, updated_at: new Date().toISOString() }
  save(); return db.slides[idx]
}
export function deleteSlide(id: number) { db.slides = db.slides.filter(s => s.id !== id); save() }
export function reorderSlides(orderedIds: number[]) {
  orderedIds.forEach((id,i) => { const s = db.slides.find(x => x.id===id); if(s) s.order_num=i+1 }); save()
}
export function duplicateSlide(id: number): Slide {
  const orig = db.slides.find(s => s.id === id)
  if (!orig) throw new Error('Slide not found')
  const maxOrder = db.slides.reduce((m,s) => Math.max(m,s.order_num), 0)
  const copy: Slide = { ...orig, id:nextId(), title:orig.title+' (copy)', order_num:maxOrder+1, created_at:new Date().toISOString(), updated_at:new Date().toISOString() }
  db.slides.push(copy); save(); return copy
}

// ── DISPLAY SETTINGS ──────────────────────────────────────────────────────

export function getDisplaySettings(): DisplaySettings {
  return db.display_settings || {}
}
export function saveDisplaySettings(settings: DisplaySettings) {
  db.display_settings = { ...db.display_settings, ...settings }
  save()
  return db.display_settings
}

// ── MEDIA LIBRARY ─────────────────────────────────────────────────────────

export function getMediaFolders() {
  return db.media_folders.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
export function createMediaFolder(name: string, eventDate?: string): MediaFolder {
  const folder: MediaFolder = { id: nextId(), name, event_date: eventDate || null, created_at: new Date().toISOString() }
  db.media_folders.push(folder); save(); return folder
}
export function deleteMediaFolder(id: number) {
  db.media_folders = db.media_folders.filter(f => f.id !== id)
  db.media_items = db.media_items.filter(i => i.folder_id !== id)
  save()
}
export function getMediaItems(folderId: number) {
  return db.media_items.filter(i => i.folder_id === folderId).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
export function addMediaItem(folderId: number, name: string, filePath: string, mimeType: string, size: number): MediaItem {
  const item: MediaItem = { id: nextId(), folder_id: folderId, name, path: filePath, mime_type: mimeType, size, created_at: new Date().toISOString() }
  db.media_items.push(item); save(); return item
}
export function deleteMediaItem(id: number) {
  db.media_items = db.media_items.filter(i => i.id !== id); save()
}

// ── IMPORT / EXPORT ───────────────────────────────────────────────────────

export function exportDatabase() {
  return JSON.stringify({ version:'1.0', exported_at:new Date().toISOString(), app:'ShogunOS', songs:db.songs, song_sections:db.song_sections, slides:db.slides, service_queue:db.service_queue }, null, 2)
}
export function importDatabase(json: string): { success: boolean; error?: string; counts?: Record<string,number> } {
  try {
    const data = JSON.parse(json)
    if (data.app !== 'ShogunOS') return { success:false, error:'Not a valid ShogunOS export file' }
    let songsAdded=0, sectionsAdded=0, slidesAdded=0
    for (const song of data.songs||[]) {
      if (db.songs.find(s => s.title.toLowerCase()===song.title.toLowerCase())) continue
      const newId=nextId(), oldId=song.id
      db.songs.push({ ...song, id:newId })
      for (const sec of data.song_sections||[]) {
        if (sec.song_id===oldId) { db.song_sections.push({ ...sec, id:nextId(), song_id:newId }); sectionsAdded++ }
      }
      songsAdded++
    }
    for (const slide of data.slides||[]) {
      if (db.slides.find(s => s.title.toLowerCase()===slide.title.toLowerCase())) continue
      db.slides.push({ ...slide, id:nextId(), order_num:db.slides.length+1 }); slidesAdded++
    }
    save(); return { success:true, counts:{ songs:songsAdded, sections:sectionsAdded, slides:slidesAdded } }
  } catch(e:any) { return { success:false, error:`Parse error: ${e.message}` } }
}
export function importQSPSongs(songs: { title:string; author:string; language:string; sections:{type:string;order:number;content:string}[] }[]) {
  let songsAdded=0, sectionsAdded=0, skipped=0
  for (const song of songs) {
    if (db.songs.find(s => s.title.toLowerCase()===song.title.toLowerCase())) { skipped++; continue }
    const id=nextId()
    db.songs.push({ id, title:song.title, language:song.language||'en', source:'custom', hymn_number:null, created_at:new Date().toISOString() })
    for (const sec of song.sections) { db.song_sections.push({ id:nextId(), song_id:id, type:sec.type, order_num:sec.order, content:sec.content }); sectionsAdded++ }
    songsAdded++
  }
  save(); return { success:true, counts:{ songs:songsAdded, sections:sectionsAdded }, skipped }
}
export function getDatabaseStats() {
  return { songs:db.songs.length, custom_songs:db.songs.filter(s=>s.source==='custom').length, hymns:db.songs.filter(s=>s.source==='hymnal').length, sections:db.song_sections.length, bible_verses:db.bible_verses.length, bible_translations:getBibleTranslations(), slides:db.slides.length, queue_items:db.service_queue.length, users:db.users.length, db_path:dbPath }
}

export default {}