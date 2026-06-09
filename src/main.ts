import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'
import {
  initDatabase,
  searchSongs, addSong, addSongSection, getSongSections, deleteSong,
  getDailyVerse, searchBibleVerses, getBibleVerse, getBibleBooks, getBibleChapters, getBibleChapterVerses,
  getServiceQueue, addToServiceQueue, clearServiceQueue,
  getThemes,
  getSlides, getSlide, createSlide, updateSlide, deleteSlide, reorderSlides, duplicateSlide,
  exportDatabase, importDatabase, getDatabaseStats,
  loginUser, getUsers, createUser, updateUserPassword, deleteUser, adminResetPassword, updateUserRole,
  importQSPSongs,
  getDisplaySettings, saveDisplaySettings,
} from './database'
import { parseQSP } from './qsp-parser'

if (started) { app.quit() }

let mainWindow: BrowserWindow
let liveWindow: BrowserWindow | null = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 640,
    backgroundColor: '#040508',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

const createLiveWindow = (displayId?: number) => {
  const displays = screen.getAllDisplays()
  let targetDisplay = displays[0]
  if (displayId !== undefined) {
    targetDisplay = displays.find(d => d.id === displayId) || displays[displays.length - 1]
  } else if (displays.length > 1) {
    targetDisplay = displays[1]
  }
  const { x, y, width, height } = targetDisplay.bounds
  liveWindow = new BrowserWindow({
    x, y, width, height, fullscreen: true, backgroundColor: '#000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  liveWindow.loadFile(path.join(__dirname, '../../src/live.html'))
  liveWindow.on('closed', () => { liveWindow = null })
}

app.on('ready', async () => {
  await initDatabase()

  // ── SONGS ────────────────────────────────────────────────────────────────
  ipcMain.handle('search-songs',      (_e, query: string) => searchSongs(query))
  ipcMain.handle('get-song-sections', (_e, id: number) => getSongSections(id))
  ipcMain.handle('add-song',          (_e, title: string, lang: string, src: string, num?: number) => addSong(title, lang, src, num))
  ipcMain.handle('add-song-section',  (_e, id: number, type: string, order: number, content: string) => addSongSection(id, type, order, content))
  ipcMain.handle('delete-song',       (_e, id: number) => deleteSong(id))

  // ── BIBLE ────────────────────────────────────────────────────────────────
  ipcMain.handle('get-daily-verse',   () => getDailyVerse())
  ipcMain.handle('search-bible',      (_e, query: string, version?: string) => searchBibleVerses(query, version))
  ipcMain.handle('get-bible-verse',   (_e, book: string, ch: number, v: number) => getBibleVerse(book, ch, v))
  ipcMain.handle('get-bible-books',         (_e, version?: string) => getBibleBooks(version))
  ipcMain.handle('get-bible-chapters',      (_e, book: string, version?: string) => getBibleChapters(book, version))
  ipcMain.handle('get-bible-chapter-verses',(_e, book: string, ch: number, version?: string) => getBibleChapterVerses(book, ch, version))

  // ── QUEUE ────────────────────────────────────────────────────────────────
  ipcMain.handle('get-service-queue', () => getServiceQueue())
  ipcMain.handle('add-to-queue',      (_e, title: string, type: string, songId?: number, verseRef?: string) => addToServiceQueue(title, type, songId, verseRef))
  ipcMain.handle('clear-queue',       () => clearServiceQueue())

  // ── THEMES ───────────────────────────────────────────────────────────────
  ipcMain.handle('get-themes',        () => getThemes())

  // ── DISPLAY ──────────────────────────────────────────────────────────────
  ipcMain.handle('get-displays', () =>
    screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Display ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
      isPrimary: i === 0,
    }))
  )
  ipcMain.handle('go-live', (_e, data: any) => {
    if (!liveWindow) {
      createLiveWindow(data.displayId)
      setTimeout(() => liveWindow?.webContents.send('update-live', data), 1000)
    } else {
      liveWindow.webContents.send('update-live', data)
    }
  })
  ipcMain.handle('close-live', () => liveWindow?.close())

  // ── SLIDES ───────────────────────────────────────────────────────────────
  ipcMain.handle('slides-get-all',   () => getSlides())
  ipcMain.handle('slides-get',       (_e, id: number) => getSlide(id))
  ipcMain.handle('slides-create',    (_e, data: any) => createSlide(data))
  ipcMain.handle('slides-update',    (_e, id: number, data: any) => updateSlide(id, data))
  ipcMain.handle('slides-delete',    (_e, id: number) => deleteSlide(id))
  ipcMain.handle('slides-reorder',   (_e, orderedIds: number[]) => reorderSlides(orderedIds))
  ipcMain.handle('slides-duplicate', (_e, id: number) => duplicateSlide(id))

  // ── IMPORT / EXPORT ──────────────────────────────────────────────────────
  ipcMain.handle('export-data',  () => exportDatabase())
  ipcMain.handle('import-data',  (_e, json: string) => importDatabase(json))
  ipcMain.handle('get-db-stats',            () => getDatabaseStats())
  ipcMain.handle('get-display-settings',    () => getDisplaySettings())
  ipcMain.handle('save-display-settings',   (_e, settings: any) => { saveDisplaySettings(settings); return { success: true } })
  ipcMain.handle('import-qsp',   (_e, base64: string) => {
    try {
      const buf    = Buffer.from(base64, 'base64')
      const parsed = parseQSP(buf)
      if (!parsed.success || parsed.songs.length === 0) {
        return { success: false, error: `No songs found. ${parsed.errors.join(', ')}` }
      }
      const result = importQSPSongs(parsed.songs)
      return { success: true, parsed: parsed.parsed, ...result, errors: parsed.errors }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ── AUTH ─────────────────────────────────────────────────────────────────
  ipcMain.handle('auth-login',           (_e, username: string, password: string) => loginUser(username, password))
  ipcMain.handle('auth-get-users',       () => getUsers())
  ipcMain.handle('auth-create-user',     (_e, username: string, password: string, role: string, displayName: string) => createUser(username, password, role as any, displayName))
  ipcMain.handle('auth-update-password', (_e, userId: number, oldPw: string, newPw: string) => updateUserPassword(userId, oldPw, newPw))
  ipcMain.handle('auth-delete-user',     (_e, userId: number) => deleteUser(userId))
  ipcMain.handle('auth-admin-reset-password', (_e, userId: number, newPw: string) => adminResetPassword(userId, newPw))
  ipcMain.handle('auth-update-role',     (_e, userId: number, role: string) => updateUserRole(userId, role as any))

  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })