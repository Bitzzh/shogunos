const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shogunos', {
  // ── SONGS ──────────────────────────────────────────────────────────────────
  searchSongs:        (query: string) => ipcRenderer.invoke('search-songs', query),
  getSongSections:    (id: number) => ipcRenderer.invoke('get-song-sections', id),
  addSong:            (title: string, lang: string, src: string, num?: number) => ipcRenderer.invoke('add-song', title, lang, src, num),
  addSongSection:     (id: number, type: string, order: number, content: string) => ipcRenderer.invoke('add-song-section', id, type, order, content),
  deleteSong:         (id: number) => ipcRenderer.invoke('delete-song', id),

  // ── BIBLE ──────────────────────────────────────────────────────────────────
  getDailyVerse:         () => ipcRenderer.invoke('get-daily-verse'),
  getBibleTranslations:  () => ipcRenderer.invoke('get-bible-translations'),
  searchBible:           (query: string, version?: string) => ipcRenderer.invoke('search-bible', query, version),
  getBibleVerse:         (book: string, ch: number, v: number, version?: string) => ipcRenderer.invoke('get-bible-verse', book, ch, v, version),
  getBibleBooks:         (version?: string) => ipcRenderer.invoke('get-bible-books', version),
  getBibleChapters:      (book: string, version?: string) => ipcRenderer.invoke('get-bible-chapters', book, version),
  getBibleChapterVerses: (book: string, ch: number, version?: string) => ipcRenderer.invoke('get-bible-chapter-verses', book, ch, version),

  // ── DISPLAY ────────────────────────────────────────────────────────────────
  getDisplays:          () => ipcRenderer.invoke('get-displays'),
  goLive:               (data: any) => ipcRenderer.invoke('go-live', data),
  goLiveMedia:          (data: any) => ipcRenderer.invoke('go-live-media', data),
  closeLive:            () => ipcRenderer.invoke('close-live'),
  moveLiveToDisplay:    (displayId: number) => ipcRenderer.invoke('move-live-to-display', displayId),
  onUpdateLive:         (cb: (data: any) => void) => ipcRenderer.on('update-live', (_e: any, d: any) => cb(d)),
  onLiveClosed:         (cb: () => void) => ipcRenderer.on('live-closed', () => cb()),
  onDisplaysChanged:    (cb: (displays: any[]) => void) => ipcRenderer.on('displays-changed', (_e: any, d: any) => cb(d)),
  onLiveDisplayChanged: (cb: (info: any) => void) => ipcRenderer.on('live-display-changed', (_e: any, d: any) => cb(d)),

  // ── QUEUE ──────────────────────────────────────────────────────────────────
  getServiceQueue:    () => ipcRenderer.invoke('get-service-queue'),
  addToQueue:         (title: string, type: string, songId?: number, verseRef?: string) => ipcRenderer.invoke('add-to-queue', title, type, songId, verseRef),
  clearQueue:         () => ipcRenderer.invoke('clear-queue'),
  removeFromQueue:    (id: number) => ipcRenderer.invoke('remove-from-queue', id),
  reorderQueue:       (ids: number[]) => ipcRenderer.invoke('reorder-queue', ids),

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

  // ── MEDIA ──────────────────────────────────────────────────────────────────
  getMediaFolders:      () => ipcRenderer.invoke('media-get-folders'),
  createMediaFolder:    (name: string, eventDate?: string) => ipcRenderer.invoke('media-create-folder', name, eventDate),
  deleteMediaFolder:    (id: number) => ipcRenderer.invoke('media-delete-folder', id),
  getMediaItems:        (folderId: number) => ipcRenderer.invoke('media-get-items', folderId),
  deleteMediaItem:      (id: number) => ipcRenderer.invoke('media-delete-item', id),
  openMediaDialog:      (folderId: number) => ipcRenderer.invoke('media-open-file-dialog', folderId),

  // ── IMPORT / EXPORT ────────────────────────────────────────────────────────
  exportData:          () => ipcRenderer.invoke('export-data'),
  importData:          (json: string) => ipcRenderer.invoke('import-data', json),
  getDatabaseStats:    () => ipcRenderer.invoke('get-db-stats'),
  importQSP:           (base64: string, language?: string) => ipcRenderer.invoke('import-qsp', base64, language),
  getDisplaySettings:  () => ipcRenderer.invoke('get-display-settings'),
  saveDisplaySettings: (settings: any) => ipcRenderer.invoke('save-display-settings', settings),

  // ── AUTH ───────────────────────────────────────────────────────────────────
  login:              (username: string, password: string) => ipcRenderer.invoke('auth-login', username, password),
  logout:             () => ipcRenderer.invoke('auth-logout'),
  getUsers:           () => ipcRenderer.invoke('auth-get-users'),
  createUser:         (username: string, password: string, role: string, displayName: string) => ipcRenderer.invoke('auth-create-user', username, password, role, displayName),
  updateUserPassword: (userId: number, oldPassword: string, newPassword: string) => ipcRenderer.invoke('auth-update-password', userId, oldPassword, newPassword),
  deleteUser:         (userId: number) => ipcRenderer.invoke('auth-delete-user', userId),
  adminResetPassword: (userId: number, newPassword: string) => ipcRenderer.invoke('auth-admin-reset-password', userId, newPassword),
  updateUserRole:     (userId: number, role: string) => ipcRenderer.invoke('auth-update-role', userId, role),
  forcedChangePassword: (userId: number, newPassword: string) => ipcRenderer.invoke('auth-forced-change-password', userId, newPassword),
})