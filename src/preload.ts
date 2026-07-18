const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shogunos', {
  // Turns a raw absolute file path into a shogun-media:// URL that can be
  // used as an <img>/<video> src or CSS background-image — see the matching
  // protocol.handle('shogun-media', ...) registration in main.ts. Local
  // file:// URLs referenced from a page that isn't itself file:// (e.g. the
  // Vite dev server during development) get silently blocked by Chromium,
  // which is what made picked images render blank.
  mediaUrl: (filePath: string) => `shogun-media://local/${encodeURIComponent(filePath)}`,

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
  goLiveTimer:          (data: any) => ipcRenderer.invoke('go-live-media', data),
  closeLive:            () => ipcRenderer.invoke('close-live'),
  moveLiveToDisplay:    (displayId: number) => ipcRenderer.invoke('move-live-to-display', displayId),
  // removeAllListeners here only clears this window's own local listeners
  // (each BrowserWindow/webContents has an isolated ipcRenderer) — safe to
  // call even though live.html registers its own onUpdateLive independently.
  // It just stops a tab like MediaTab from stacking a fresh listener every
  // time it remounts on tab switches.
  onUpdateLive:         (cb: (data: any) => void) => { ipcRenderer.removeAllListeners('update-live'); ipcRenderer.on('update-live', (_e: any, d: any) => cb(d)) },
  onLiveClosed:         (cb: () => void) => { ipcRenderer.removeAllListeners('live-closed'); ipcRenderer.on('live-closed', () => cb()) },
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
  saveSlideBgImage:   (base64: string, ext: string) => ipcRenderer.invoke('slides-save-bg-image', base64, ext),

  // ── MEDIA ──────────────────────────────────────────────────────────────────
  getMediaFolders:      () => ipcRenderer.invoke('media-get-folders'),
  createMediaFolder:    (name: string, eventDate?: string) => ipcRenderer.invoke('media-create-folder', name, eventDate),
  deleteMediaFolder:    (id: number) => ipcRenderer.invoke('media-delete-folder', id),
  getMediaItems:        (folderId: number) => ipcRenderer.invoke('media-get-items', folderId),
  deleteMediaItem:      (id: number) => ipcRenderer.invoke('media-delete-item', id),
  openMediaDialog:      (folderId: number) => ipcRenderer.invoke('media-open-file-dialog', folderId),
  startMediaPlaylist:   (data: any) => ipcRenderer.invoke('media-start-playlist', data),
  stopMediaPlaylist:    () => ipcRenderer.invoke('media-stop-playlist'),
  playlistNext:         () => ipcRenderer.invoke('media-playlist-next'),
  playlistPrev:         () => ipcRenderer.invoke('media-playlist-prev'),
  onMediaPlaylistUpdate:(cb: (data: any) => void) => { ipcRenderer.removeAllListeners('media-playlist-update'); ipcRenderer.on('media-playlist-update', (_e: any, d: any) => cb(d)) },
  notifyVideoEnded:     () => ipcRenderer.send('video-ended'),

  // ── IMPORT / EXPORT ────────────────────────────────────────────────────────
  exportData:          () => ipcRenderer.invoke('export-data'),
  importData:          (json: string) => ipcRenderer.invoke('import-data', json),
  getDatabaseStats:    () => ipcRenderer.invoke('get-db-stats'),
  importQSP:           (base64: string, language?: string) => ipcRenderer.invoke('import-qsp', base64, language),
  importPPTX:          (base64: string, sourceName?: string) => ipcRenderer.invoke('import-pptx', base64, sourceName),
  getDisplaySettings:  () => ipcRenderer.invoke('get-display-settings'),
  saveDisplaySettings: (settings: any) => ipcRenderer.invoke('save-display-settings', settings),

  // ── LOCAL OPERATOR ───────────────────────────────────────────────────────────
  getCurrentUser:     () => ipcRenderer.invoke('get-current-user'),
  updateDisplayName:  (displayName: string) => ipcRenderer.invoke('update-display-name', displayName),

  // ── REMOTE CONTROL ───────────────────────────────────────────────────────────
  getRemoteInfo:      () => ipcRenderer.invoke('get-remote-info'),
  pushRemoteState:    (state: any) => ipcRenderer.send('remote-state-update', state),
  onRemoteCommand:    (cb: (data: { action: string; id?: string }) => void) => ipcRenderer.on('remote-command', (_e: any, d: any) => cb(d)),

  // ── CALENDAR ───────────────────────────────────────────────────────────────
  getCalendarEvents:    () => ipcRenderer.invoke('calendar-get-events'),
  createCalendarEvent:  (data: any) => ipcRenderer.invoke('calendar-create-event', data),
  updateCalendarEvent:  (id: number, data: any) => ipcRenderer.invoke('calendar-update-event', id, data),
  deleteCalendarEvent:  (id: number) => ipcRenderer.invoke('calendar-delete-event', id),
})