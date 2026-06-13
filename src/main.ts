import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
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
  getMediaFolders, createMediaFolder, deleteMediaFolder, addMediaItem, deleteMediaItem, getMediaItems,
} from './database'
import { parseQSP } from './qsp-parser'

if (started) { app.quit() }

let mainWindow: BrowserWindow
let liveWindow: BrowserWindow | null = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1100, minHeight: 680,
    backgroundColor: '#05050a',
    frame: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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

function getLiveHtmlPath(): string {
  // In packaged app: resources/app/.vite/build/ → live.html is in renderer dir
  const candidates = [
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/live.html`),
    path.join(__dirname, '../../src/live.html'),          // dev fallback
    path.join(process.resourcesPath || '', 'live.html'),  // asar fallback
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[1] // dev default
}

const createLiveWindow = (displayId?: number) => {
  const displays = screen.getAllDisplays()

  // Pick the non-primary display if available, else fallback to primary
  let targetDisplay = displays.find(d => !d.bounds.x === false) || displays[0]
  if (displays.length > 1) {
    targetDisplay = displays.find(d => d.id !== screen.getPrimaryDisplay().id) || displays[0]
  }
  if (displayId !== undefined) {
    targetDisplay = displays.find(d => d.id === displayId) || targetDisplay
  }

  const { x, y, width, height } = targetDisplay.bounds

  liveWindow = new BrowserWindow({
    x, y, width, height,
    fullscreen: true,
    alwaysOnTop: true,
    backgroundColor: '#000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const liveHtml = getLiveHtmlPath()
  liveWindow.loadFile(liveHtml)

  liveWindow.once('ready-to-show', () => {
    liveWindow?.show()
    // Notify renderer about the display being used
    mainWindow?.webContents.send('live-display-changed', {
      displayId: targetDisplay.id,
      bounds: targetDisplay.bounds,
    })
  })

  liveWindow.on('closed', () => {
    liveWindow = null
    mainWindow?.webContents.send('live-closed')
  })
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
  ipcMain.handle('get-daily-verse',             () => getDailyVerse())
  ipcMain.handle('search-bible',                (_e, query: string, version?: string) => searchBibleVerses(query, version))
  ipcMain.handle('get-bible-verse',             (_e, book: string, ch: number, v: number) => getBibleVerse(book, ch, v))
  ipcMain.handle('get-bible-books',             (_e, version?: string) => getBibleBooks(version))
  ipcMain.handle('get-bible-chapters',          (_e, book: string, version?: string) => getBibleChapters(book, version))
  ipcMain.handle('get-bible-chapter-verses',    (_e, book: string, ch: number, version?: string) => getBibleChapterVerses(book, ch, version))

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
      label: `${i === 0 ? 'Primary' : 'Display ' + (i + 1)} — ${d.bounds.width}×${d.bounds.height}`,
      isPrimary: d.id === screen.getPrimaryDisplay().id,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
    }))
  )
  ipcMain.handle('go-live', (_e, data: any) => {
    if (!liveWindow) {
      createLiveWindow(data.displayId)
      setTimeout(() => liveWindow?.webContents.send('update-live', data), 800)
    } else {
      liveWindow.webContents.send('update-live', data)
    }
  })
  ipcMain.handle('close-live', () => { liveWindow?.close(); liveWindow = null })
  ipcMain.handle('move-live-to-display', (_e, displayId: number) => {
    if (!liveWindow) return
    const d = screen.getAllDisplays().find(x => x.id === displayId)
    if (!d) return
    liveWindow.setBounds(d.bounds)
    liveWindow.setFullScreen(true)
  })

  // ── SLIDES ───────────────────────────────────────────────────────────────
  ipcMain.handle('slides-get-all',   () => getSlides())
  ipcMain.handle('slides-get',       (_e, id: number) => getSlide(id))
  ipcMain.handle('slides-create',    (_e, data: any) => createSlide(data))
  ipcMain.handle('slides-update',    (_e, id: number, data: any) => updateSlide(id, data))
  ipcMain.handle('slides-delete',    (_e, id: number) => deleteSlide(id))
  ipcMain.handle('slides-reorder',   (_e, orderedIds: number[]) => reorderSlides(orderedIds))
  ipcMain.handle('slides-duplicate', (_e, id: number) => duplicateSlide(id))

  // ── MEDIA ────────────────────────────────────────────────────────────────
  ipcMain.handle('media-get-folders',  () => getMediaFolders())
  ipcMain.handle('media-create-folder',(_e, name: string, eventDate?: string) => createMediaFolder(name, eventDate))
  ipcMain.handle('media-delete-folder',(_e, id: number) => deleteMediaFolder(id))
  ipcMain.handle('media-get-items',    (_e, folderId: number) => getMediaItems(folderId))
  ipcMain.handle('media-delete-item',  (_e, id: number) => deleteMediaItem(id))
  ipcMain.handle('media-add-item', async (_e, folderId: number, filePaths: string[]) => {
    const results = []
    for (const fp of filePaths) {
      const ext = path.extname(fp).toLowerCase()
      const name = path.basename(fp)
      const stat = fs.statSync(fp)
      const mime = getMimeType(ext)
      const item = addMediaItem(folderId, name, fp, mime, stat.size)
      results.push(item)
    }
    return results
  })
  ipcMain.handle('media-open-file-dialog', async (_e, folderId: number) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Media', extensions: ['jpg','jpeg','png','gif','webp','bmp','svg','mp4','webm','mov','avi','mkv','mp3','wav','ogg','aac','flac','m4a','pdf','pptx','docx','txt'] },
        { name: 'Images', extensions: ['jpg','jpeg','png','gif','webp','bmp','svg'] },
        { name: 'Videos', extensions: ['mp4','webm','mov','avi','mkv'] },
        { name: 'Audio', extensions: ['mp3','wav','ogg','aac','flac','m4a'] },
        { name: 'Documents', extensions: ['pdf','pptx','docx','txt'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false }
    const items = []
    for (const fp of result.filePaths) {
      const ext = path.extname(fp).toLowerCase()
      const name = path.basename(fp)
      const stat = fs.statSync(fp)
      const item = addMediaItem(folderId, name, fp, getMimeType(ext), stat.size)
      items.push(item)
    }
    return { success: true, items }
  })

  // Media: go live with video/image
  ipcMain.handle('go-live-media', (_e, data: any) => {
    if (!liveWindow) {
      createLiveWindow(data.displayId)
      setTimeout(() => liveWindow?.webContents.send('update-live', data), 800)
    } else {
      liveWindow.webContents.send('update-live', data)
    }
  })

  // ── IMPORT / EXPORT ──────────────────────────────────────────────────────
  ipcMain.handle('export-data',             () => exportDatabase())
  ipcMain.handle('import-data',             (_e, json: string) => importDatabase(json))
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
  ipcMain.handle('auth-login',                (_e, username: string, password: string) => loginUser(username, password))
  ipcMain.handle('auth-get-users',            () => getUsers())
  ipcMain.handle('auth-create-user',          (_e, username: string, password: string, role: string, displayName: string) => createUser(username, password, role as any, displayName))
  ipcMain.handle('auth-update-password',      (_e, userId: number, oldPw: string, newPw: string) => updateUserPassword(userId, oldPw, newPw))
  ipcMain.handle('auth-delete-user',          (_e, userId: number) => deleteUser(userId))
  ipcMain.handle('auth-admin-reset-password', (_e, userId: number, newPw: string) => adminResetPassword(userId, newPw))
  ipcMain.handle('auth-update-role',          (_e, userId: number, role: string) => updateUserRole(userId, role as any))

  createWindow()

  // Watch for display changes and notify renderer
  screen.on('display-added',   () => mainWindow?.webContents.send('displays-changed', screen.getAllDisplays()))
  screen.on('display-removed', () => mainWindow?.webContents.send('displays-changed', screen.getAllDisplays()))
})

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.avi': 'video/avi', '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.aac': 'audio/aac', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
  }
  return map[ext] || 'application/octet-stream'
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })