const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shogunos', {
  // ── SONGS ──────────────────────────────────────────────────────────────────
  searchSongs:        (query: string) => ipcRenderer.invoke('search-songs', query),
  getSongSections:    (id: number) => ipcRenderer.invoke('get-song-sections', id),
  addSong:            (title: string, lang: string, src: string, num?: number) => ipcRenderer.invoke('add-song', title, lang, src, num),
  addSongSection:     (id: number, type: string, order: number, content: string) => ipcRenderer.invoke('add-song-section', id, type, order, content),
  deleteSong:         (id: number) => ipcRenderer.invoke('delete-song', id),

  // ── BIBLE ──────────────────────────────────────────────────────────────────
  getDailyVerse:      () => ipcRenderer.invoke('get-daily-verse'),
  searchBible:        (query: string, version?: string) => ipcRenderer.invoke('search-bible', query, version),
  getBibleVerse:      (book: string, ch: number, v: number) => ipcRenderer.invoke('get-bible-verse', book, ch, v),
  getBibleBooks:      (version?: string) => ipcRenderer.invoke('get-bible-books', version),
  getBibleChapters:   (book: string, version?: string) => ipcRenderer.invoke('get-bible-chapters', book, version),
  getBibleChapterVerses: (book: string, ch: number, version?: string) => ipcRenderer.invoke('get-bible-chapter-verses', book, ch, version),

  // ── DISPLAY ────────────────────────────────────────────────────────────────
  getDisplays:        () => ipcRenderer.invoke('get-displays'),
  goLive:             (data: any) => ipcRenderer.invoke('go-live', data),
  closeLive:          () => ipcRenderer.invoke('close-live'),
  onUpdateLive:       (callback: (data: any) => void) => ipcRenderer.on('update-live', (_e: any, data: any) => callback(data)),

  // ── QUEUE ──────────────────────────────────────────────────────────────────
  getServiceQueue:    () => ipcRenderer.invoke('get-service-queue'),
  addToQueue:         (title: string, type: string, songId?: number, verseRef?: string) => ipcRenderer.invoke('add-to-queue', title, type, songId, verseRef),
  clearQueue:         () => ipcRenderer.invoke('clear-queue'),

  // ── THEMES ─────────────────────────────────────────────────────────────────
  getThemes:          () => ipcRenderer.invoke('get-themes'),

  // ── SLIDES ─────────────────────────────────────────────────────────────────
  getSlides:          () => ipcRenderer.invoke('slides-get-all'),
  getSlide:           (id: number) => ipcRenderer.invoke('slides-get', id),
  createSlide:        (data: any) => ipcRenderer.invoke('slides-create', data),
  updateSlide:        (id: number, data: any) => ipcRenderer.invoke('slides-update', id, data),
  deleteSlide:        (id: number) => ipcRenderer.invoke('slides-delete', id),
  reorderSlides:      (orderedIds: number[]) => ipcRenderer.invoke('slides-reorder', orderedIds),
  duplicateSlide:     (id: number) => ipcRenderer.invoke('slides-duplicate', id),

  // ── IMPORT / EXPORT ────────────────────────────────────────────────────────
  exportData:         () => ipcRenderer.invoke('export-data'),
  importData:         (json: string) => ipcRenderer.invoke('import-data', json),
  getDatabaseStats:   () => ipcRenderer.invoke('get-db-stats'),
  importQSP:          (base64: string) => ipcRenderer.invoke('import-qsp', base64),
  getDisplaySettings: () => ipcRenderer.invoke('get-display-settings'),
  saveDisplaySettings:(settings: any) => ipcRenderer.invoke('save-display-settings', settings),

  // ── AUTH ───────────────────────────────────────────────────────────────────
  login:              (username: string, password: string) => ipcRenderer.invoke('auth-login', username, password),
  getUsers:           () => ipcRenderer.invoke('auth-get-users'),
  createUser:         (username: string, password: string, role: string, displayName: string) => ipcRenderer.invoke('auth-create-user', username, password, role, displayName),
  updateUserPassword: (userId: number, oldPassword: string, newPassword: string) => ipcRenderer.invoke('auth-update-password', userId, oldPassword, newPassword),
  deleteUser:         (userId: number) => ipcRenderer.invoke('auth-delete-user', userId),
  adminResetPassword: (userId: number, newPassword: string) => ipcRenderer.invoke('auth-admin-reset-password', userId, newPassword),
  updateUserRole:     (userId: number, role: string) => ipcRenderer.invoke('auth-update-role', userId, role),
})