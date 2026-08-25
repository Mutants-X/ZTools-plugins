const { RuntimeManager } = require('./backend/runtime-manager')
const { SessionManager } = require('./backend/session-manager')
const fs = require('node:fs')
const path = require('node:path')

const SETTINGS_STORAGE_KEY = 'claude-code-free.settings'
const runtime = new RuntimeManager({ ztools: window.ztools })
const sessions = new SessionManager({ runtime, getFullAccess: () => readPreferences().fullAccess })
let launchDirectory = null

window.claudeCodeFree = {
  platform: process.platform,
  arch: process.arch,
  getStatus: () => runtime.getStatus(),
  getLaunchDirectory: () => launchDirectory,
  getPreferences: () => readPreferences(),
  setFullAccess: (enabled) => savePreferences({ fullAccess: enabled === true }),
  install: () => runtime.ensureReady(),
  repair: () => runtime.ensureReady({ force: true }),
  onProgress: (listener) => runtime.onProgress(listener),
  openDataDirectory: () => runtime.openDataDirectory(),
  selectDirectory: async (defaultPath) => {
    const result = await Promise.resolve(window.ztools?.showOpenDialog?.({
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    }))
    return Array.isArray(result) && result.length ? result[0] : null
  },
  startSession: (options) => sessions.start(options),
  getSuggestedSessionTitle: () => sessions.getSuggestedTitle(),
  resumeSession: (sessionId, options) => sessions.resume(sessionId, options),
  renameSession: (sessionId, title) => sessions.rename(sessionId, title),
  listSessions: () => sessions.list(),
  writeSession: (sessionId, data) => sessions.write(sessionId, data),
  resizeSession: (sessionId, cols, rows) => sessions.resize(sessionId, cols, rows),
  getSessionSnapshot: (sessionId) => sessions.getSnapshot(sessionId),
  closeSession: (sessionId) => sessions.close(sessionId),
  deleteSession: (sessionId) => sessions.delete(sessionId),
  getSessionUsage: (sessionId) => sessions.getUsage(sessionId),
  onSessionData: (listener) => sessions.on('data', listener),
  onSessionExit: (listener) => sessions.on('exit', listener),
  onSessionDeleted: (listener) => sessions.on('deleted', listener),
  onSessionUsage: (listener) => sessions.on('usage', listener),
  readClipboardText: () => readClipboardText(),
  writeClipboardText: (text) => writeClipboardText(text),
  openExternal: (url) => openExternal(url)
}

function readPreferences() {
  try {
    const saved = window.ztools?.dbStorage?.getItem?.(SETTINGS_STORAGE_KEY)
    return { fullAccess: saved?.fullAccess !== false }
  } catch {
    return { fullAccess: true }
  }
}

function savePreferences(preferences) {
  const next = { fullAccess: preferences?.fullAccess === true }
  try {
    window.ztools?.dbStorage?.setItem?.(SETTINGS_STORAGE_KEY, next)
  } catch {}
  return next
}

if (window.ztools?.onPluginEnter) {
  window.ztools.onPluginEnter((action) => {
    const payload = typeof action?.payload === 'string' ? action.payload.trim() : ''
    if (!payload || payload.length > 4096) return
    try {
      if (fs.existsSync(payload) && fs.statSync(payload).isDirectory()) {
        launchDirectory = path.normalize(payload)
      }
    } catch {}
  })
}

function readClipboardText() {
  try {
    return require('electron')?.clipboard?.readText?.() || ''
  } catch {
    return ''
  }
}

function writeClipboardText(text) {
  const value = String(text || '')
  try {
    require('electron')?.clipboard?.writeText?.(value)
  } catch {
    // Clipboard permissions are optional; the renderer can fall back to navigator.clipboard.
  }
}

function openExternal(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return
  try {
    require('electron')?.shell?.openExternal?.(url)
  } catch {}
}

if (window.ztools?.onPluginOut) {
  window.ztools.onPluginOut((isKill) => {
    if (isKill) void sessions.shutdown()
  })
}

process.once('exit', () => {
  void sessions.shutdown()
})
