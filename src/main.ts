import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  initDatabase, searchSongs, addSong, addSongSection,
  getSongSections, getDailyVerse, searchBibleVerses,
  getBibleVerse, deleteSong, getServiceQueue,
  addToServiceQueue, clearServiceQueue, getThemes
} from './database';

if (started) { app.quit(); }

let mainWindow: BrowserWindow
let liveWindow: BrowserWindow | null = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#040508',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

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
    x, y, width, height,
    fullscreen: true,
    backgroundColor: '#000',
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

  ipcMain.handle('search-songs', (_e, query: string) => searchSongs(query))
  ipcMain.handle('get-song-sections', (_e, id: number) => getSongSections(id))
  ipcMain.handle('add-song', (_e, title: string, lang: string, src: string, num?: number) => addSong(title, lang, src, num))
  ipcMain.handle('add-song-section', (_e, id: number, type: string, order: number, content: string) => addSongSection(id, type, order, content))
  ipcMain.handle('delete-song', (_e, id: number) => deleteSong(id))
  ipcMain.handle('get-daily-verse', () => getDailyVerse())
  ipcMain.handle('search-bible', (_e, query: string) => searchBibleVerses(query))
  ipcMain.handle('get-bible-verse', (_e, book: string, ch: number, v: number) => getBibleVerse(book, ch, v))
  ipcMain.handle('get-service-queue', () => getServiceQueue())
  ipcMain.handle('add-to-queue', (_e, title: string, type: string, songId?: number, verseRef?: string) => addToServiceQueue(title, type, songId, verseRef))
  ipcMain.handle('clear-queue', () => clearServiceQueue())
  ipcMain.handle('get-themes', () => getThemes())

  ipcMain.handle('get-displays', () =>
    screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Display ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
      isPrimary: i === 0
    }))
  )

  ipcMain.handle('go-live', (_e, data: { title: string; lyrics: string; displayId?: number; fontSize?: number; textAlign?: string; bgColor?: string }) => {
    if (!liveWindow) {
      createLiveWindow(data.displayId)
      setTimeout(() => liveWindow?.webContents.send('update-live', data), 1000)
    } else {
      liveWindow.webContents.send('update-live', data)
    }
  })

  ipcMain.handle('close-live', () => liveWindow?.close())

  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })