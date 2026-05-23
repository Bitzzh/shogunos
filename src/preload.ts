const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shogunos', {
  searchSongs: (query: string) => ipcRenderer.invoke('search-songs', query),
  getSongSections: (id: number) => ipcRenderer.invoke('get-song-sections', id),
  addSong: (title: string, lang: string, src: string, num?: number) => ipcRenderer.invoke('add-song', title, lang, src, num),
  addSongSection: (id: number, type: string, order: number, content: string) => ipcRenderer.invoke('add-song-section', id, type, order, content),
  deleteSong: (id: number) => ipcRenderer.invoke('delete-song', id),
  getDailyVerse: () => ipcRenderer.invoke('get-daily-verse'),
  searchBible: (query: string) => ipcRenderer.invoke('search-bible', query),
  getBibleVerse: (book: string, ch: number, v: number) => ipcRenderer.invoke('get-bible-verse', book, ch, v),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getServiceQueue: () => ipcRenderer.invoke('get-service-queue'),
  addToQueue: (title: string, type: string, songId?: number, verseRef?: string) => ipcRenderer.invoke('add-to-queue', title, type, songId, verseRef),
  clearQueue: () => ipcRenderer.invoke('clear-queue'),
  getThemes: () => ipcRenderer.invoke('get-themes'),
  goLive: (data: { title: string; lyrics: string; displayId?: number; fontSize?: number; textAlign?: string; bgColor?: string }) => ipcRenderer.invoke('go-live', data),
  closeLive: () => ipcRenderer.invoke('close-live'),
  onUpdateLive: (callback: (data: any) => void) => ipcRenderer.on('update-live', (_e, data) => callback(data)),
})