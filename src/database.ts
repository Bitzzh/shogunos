import { app } from 'electron'
import path from 'path'
import fs from 'fs'

interface Song {
  id: number
  title: string
  language: string
  source: string
  hymn_number: number | null
  created_at: string
}

interface SongSection {
  id: number
  song_id: number
  type: string
  order_num: number
  content: string
}

interface BibleVerse {
  id: number
  version: string
  book: string
  chapter: number
  verse: number
  text: string
  language: string
}

interface DailyVerse {
  id: number
  verse_id: number
  date: string
  region: string
}

interface ServiceQueueItem {
  id: number
  title: string
  type: string
  song_id: number | null
  verse_ref: string | null
  order_num: number
}

interface DB {
  songs: Song[]
  song_sections: SongSection[]
  bible_verses: BibleVerse[]
  daily_verses: DailyVerse[]
  service_queue: ServiceQueueItem[]
  meta: { last_id: number }
}

let dbPath: string
let db: DB

function nextId(): number {
  db.meta.last_id += 1
  return db.meta.last_id
}

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(db))
}

function load(): DB {
  if (fs.existsSync(dbPath)) {
    const raw = fs.readFileSync(dbPath, 'utf-8')
    return JSON.parse(raw)
  }
  return {
    songs: [], song_sections: [], bible_verses: [],
    daily_verses: [], service_queue: [],
    meta: { last_id: 0 }
  }
}

function loadBibleFromFile(): BibleVerse[] {
  const verses: BibleVerse[] = []
  // Try packaged app path first, then dev path
  const paths = [
    path.join(process.resourcesPath || '', 'data', 'kjv.json'),
    path.join(process.cwd(), 'data', 'kjv.json'),
    path.join(__dirname, '..', '..', 'data', 'kjv.json'),
  ]

  let bibleData: any[] | null = null
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8').replace(/^\uFEFF/, '')
        bibleData = JSON.parse(raw)
        break
      } catch (e) {}
    }
  }

  if (!bibleData) return []

  let id = 1
  for (const book of bibleData) {
    const bookName = book.abbrev ? capitalize(book.name || book.abbrev) : book.name
    const chapters = book.chapters || []
    for (let ci = 0; ci < chapters.length; ci++) {
      const chapter = chapters[ci]
      const verseArr = Array.isArray(chapter) ? chapter : chapter.verses || []
      for (let vi = 0; vi < verseArr.length; vi++) {
        const text = typeof verseArr[vi] === 'string' ? verseArr[vi] : verseArr[vi].text || ''
        if (text.trim()) {
          verses.push({
            id: id++,
            version: 'KJV',
            book: bookName,
            chapter: ci + 1,
            verse: vi + 1,
            text: text.trim(),
            language: 'en'
          })
        }
      }
    }
  }
  return verses
}

function capitalize(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

export async function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'shogunos.json')
  db = load()

  if (db.songs.length > 0) return

  const songs = [
    {
      title: 'Holy Holy Holy', hymn: 1, sections: [
        { type: 'verse', order: 1, content: 'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty!\nGod in three persons, blessed Trinity!' },
        { type: 'verse', order: 2, content: 'Holy, holy, holy! All the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWhich wert, and art, and evermore shalt be.' },
        { type: 'verse', order: 3, content: 'Holy, holy, holy! Though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see;\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.' },
        { type: 'verse', order: 4, content: 'Holy, holy, holy! Lord God Almighty!\nAll Thy works shall praise Thy name, in earth and sky and sea;\nHoly, holy, holy! Merciful and mighty!\nGod in three persons, blessed Trinity!' },
      ]
    },
    {
      title: 'Amazing Grace', hymn: 2, sections: [
        { type: 'verse', order: 1, content: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.' },
        { type: 'verse', order: 2, content: "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed." },
        { type: 'verse', order: 3, content: "Through many dangers, toils and snares,\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home." },
        { type: 'verse', order: 4, content: "When we've been there ten thousand years,\nBright shining as the sun,\nWe've no less days to sing God's praise\nThan when we'd first begun." },
      ]
    },
    {
      title: 'Great Is Thy Faithfulness', hymn: 3, sections: [
        { type: 'verse', order: 1, content: 'Great is Thy faithfulness, O God my Father,\nThere is no shadow of turning with Thee;\nThou changest not, Thy compassions, they fail not\nAs Thou hast been Thou forever wilt be.' },
        { type: 'chorus', order: 2, content: 'Great is Thy faithfulness!\nGreat is Thy faithfulness!\nMorning by morning new mercies I see;\nAll I have needed Thy hand hath provided,\nGreat is Thy faithfulness, Lord, unto me!' },
        { type: 'verse', order: 3, content: 'Summer and winter, and springtime and harvest,\nSun, moon and stars in their courses above\nJoin with all nature in manifold witness\nTo Thy great faithfulness, mercy and love.' },
        { type: 'verse', order: 4, content: 'Pardon for sin and a peace that endureth,\nThine own dear presence to cheer and to guide;\nStrength for today and bright hope for tomorrow,\nBlessings all mine, with ten thousand beside!' },
      ]
    },
    {
      title: 'How Great Thou Art', hymn: 4, sections: [
        { type: 'verse', order: 1, content: 'O Lord my God, when I in awesome wonder\nConsider all the worlds Thy hands have made,\nI see the stars, I hear the rolling thunder,\nThy power throughout the universe displayed.' },
        { type: 'chorus', order: 2, content: 'Then sings my soul, my Saviour God, to Thee:\nHow great Thou art, how great Thou art!\nThen sings my soul, my Saviour God, to Thee:\nHow great Thou art, how great Thou art!' },
        { type: 'verse', order: 3, content: 'And when I think that God, His Son not sparing,\nSent Him to die, I scarce can take it in;\nThat on the cross, my burden gladly bearing,\nHe bled and died to take away my sin.' },
        { type: 'verse', order: 4, content: 'When Christ shall come with shout of acclamation\nAnd take me home, what joy shall fill my heart!\nThen I shall bow in humble adoration,\nAnd there proclaim, my God, how great Thou art!' },
      ]
    },
    {
      title: 'What A Friend We Have In Jesus', hymn: 5, sections: [
        { type: 'verse', order: 1, content: 'What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!' },
        { type: 'verse', order: 2, content: 'Have we trials and temptations?\nIs there trouble anywhere?\nWe should never be discouraged;\nTake it to the Lord in prayer!' },
        { type: 'verse', order: 3, content: 'Are we weak and heavy laden,\nCumbered with a load of care?\nPrecious Savior, still our refuge;\nTake it to the Lord in prayer!' },
      ]
    },
    {
      title: 'To God Be The Glory', hymn: 6, sections: [
        { type: 'verse', order: 1, content: 'To God be the glory, great things He hath taught us,\nGreat things He hath done, and great our rejoicing\nThrough Jesus the Son; but purer and higher\nAnd greater will be our wonder and praise.' },
        { type: 'chorus', order: 2, content: 'Praise the Lord, Praise the Lord,\nLet the earth hear His voice!\nPraise the Lord, Praise the Lord,\nLet the people rejoice!\nO come to the Father, through Jesus the Son,\nAnd give Him the glory, great things He hath done.' },
      ]
    },
    {
      title: 'Blessed Assurance', hymn: 7, sections: [
        { type: 'verse', order: 1, content: 'Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.' },
        { type: 'chorus', order: 2, content: 'This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.' },
        { type: 'verse', order: 3, content: 'Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels descending bring from above\nEchoes of mercy, whispers of love.' },
      ]
    },
    {
      title: 'It Is Well With My Soul', hymn: 8, sections: [
        { type: 'verse', order: 1, content: "When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul." },
        { type: 'chorus', order: 2, content: 'It is well with my soul,\nIt is well, it is well with my soul.' },
        { type: 'verse', order: 3, content: 'Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ hath regarded my helpless estate,\nAnd hath shed His own blood for my soul.' },
      ]
    },
    {
      title: 'A Mighty Fortress Is Our God', hymn: 9, sections: [
        { type: 'verse', order: 1, content: 'A mighty fortress is our God,\nA bulwark never failing;\nOur helper He amid the flood\nOf mortal ills prevailing.' },
        { type: 'verse', order: 2, content: "Did we in our own strength confide,\nOur striving would be losing;\nWere not the right Man on our side,\nThe Man of God's own choosing." },
      ]
    },
    {
      title: 'Abide With Me', hymn: 10, sections: [
        { type: 'verse', order: 1, content: 'Abide with me; fast falls the eventide;\nThe darkness deepens; Lord, with me abide;\nWhen other helpers fail and comforts flee,\nHelp of the helpless, oh, abide with me.' },
        { type: 'verse', order: 2, content: "Swift to its close ebbs out life's little day;\nEarth's joys grow dim, its glories pass away;\nChange and decay in all around I see;\nO Thou who changest not, abide with me." },
      ]
    },
  ]

  for (const song of songs) {
    const id = nextId()
    db.songs.push({ id, title: song.title, language: 'en', source: 'hymnal', hymn_number: song.hymn, created_at: new Date().toISOString() })
    for (const sec of song.sections) {
      db.song_sections.push({ id: nextId(), song_id: id, type: sec.type, order_num: sec.order, content: sec.content })
    }
  }

  console.log('Loading full KJV Bible...')
  const bibleVerses = loadBibleFromFile()
  if (bibleVerses.length > 0) {
    db.bible_verses = bibleVerses
    db.meta.last_id = Math.max(db.meta.last_id, bibleVerses[bibleVerses.length - 1].id + 1000)
    console.log(`Loaded ${bibleVerses.length} Bible verses`)
  } else {
    const fallbackVerses = [
      { book: 'John', chapter: 3, verse: 16, text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.' },
      { book: 'Psalm', chapter: 23, verse: 1, text: 'The Lord is my shepherd, I lack nothing.' },
      { book: 'Romans', chapter: 8, verse: 28, text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.' },
      { book: 'Philippians', chapter: 4, verse: 13, text: 'I can do all this through him who gives me strength.' },
      { book: 'Jeremiah', chapter: 29, verse: 11, text: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.' },
      { book: 'Proverbs', chapter: 3, verse: 5, text: 'Trust in the Lord with all your heart and lean not on your own understanding.' },
      { book: 'Isaiah', chapter: 40, verse: 31, text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.' },
      { book: 'Matthew', chapter: 6, verse: 33, text: 'But seek first his kingdom and his righteousness, and all these things will be given to you as well.' },
      { book: 'Psalm', chapter: 46, verse: 1, text: 'God is our refuge and strength, an ever-present help in trouble.' },
      { book: 'Joshua', chapter: 1, verse: 9, text: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.' },
      { book: '2 Timothy', chapter: 1, verse: 7, text: 'For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.' },
      { book: 'Lamentations', chapter: 3, verse: 23, text: 'They are new every morning; great is your faithfulness.' },
    ]
    for (const v of fallbackVerses) {
      db.bible_verses.push({ id: nextId(), version: 'KJV', book: v.book, chapter: v.chapter, verse: v.verse, text: v.text, language: 'en' })
    }
  }

  const today = new Date()
  const verseCount = db.bible_verses.length
  for (let i = 0; i < 365; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]
    const verseId = db.bible_verses[i % verseCount].id
    db.daily_verses.push({ id: nextId(), verse_id: verseId, date: dateStr, region: 'ZW' })
  }

  save()
}

function save2() {
  fs.writeFileSync(dbPath, JSON.stringify(db))
}

export function searchSongs(query: string) {
  const q = query.toLowerCase()
  return db.songs
    .filter(s => s.title.toLowerCase().includes(q))
    .sort((a, b) => (a.hymn_number || 999) - (b.hymn_number || 999))
    .slice(0, 50)
}

export function getSongSections(songId: number) {
  return db.song_sections
    .filter(s => s.song_id === songId)
    .sort((a, b) => a.order_num - b.order_num)
}

export function getDailyVerse() {
  const today = new Date().toISOString().split('T')[0]
  const dv = db.daily_verses.find(v => v.date === today)
  if (!dv) return null
  return db.bible_verses.find(v => v.id === dv.verse_id) || null
}

export function searchBibleVerses(query: string) {
  const q = query.toLowerCase()
  return db.bible_verses
    .filter(v => v.text.toLowerCase().includes(q) || v.book.toLowerCase().includes(q))
    .slice(0, 50)
}

export function getBibleVerse(book: string, chapter: number, verse: number) {
  return db.bible_verses.find(v =>
    v.book.toLowerCase().includes(book.toLowerCase()) &&
    v.chapter === chapter && v.verse === verse
  ) || null
}

export function addSong(title: string, language: string, source: string, hymnNumber?: number) {
  const id = nextId()
  db.songs.push({ id, title, language, source, hymn_number: hymnNumber || null, created_at: new Date().toISOString() })
  save()
  return id
}

export function addSongSection(songId: number, type: string, orderNum: number, content: string) {
  db.song_sections.push({ id: nextId(), song_id: songId, type, order_num: orderNum, content })
  save()
}

export function deleteSong(songId: number) {
  db.songs = db.songs.filter(s => s.id !== songId)
  db.song_sections = db.song_sections.filter(s => s.song_id !== songId)
  save()
}

export function getServiceQueue() {
  return db.service_queue.sort((a, b) => a.order_num - b.order_num)
}

export function addToServiceQueue(title: string, type: string, songId?: number, verseRef?: string) {
  const order = db.service_queue.length + 1
  db.service_queue.push({ id: nextId(), title, type, song_id: songId || null, verse_ref: verseRef || null, order_num: order })
  save()
}

export function clearServiceQueue() {
  db.service_queue = []
  save()
}

export function getThemes() {
  return [
    { id: 1, name: 'Default', font_size: 48, font_color: '#FFFFFF', text_align: 'center', bg_color: '#000000' },
    { id: 2, name: 'Large', font_size: 60, font_color: '#FFFFFF', text_align: 'center', bg_color: '#000000' },
    { id: 3, name: 'Small', font_size: 36, font_color: '#FFFFFF', text_align: 'center', bg_color: '#000000' },
  ]
}

export default {}