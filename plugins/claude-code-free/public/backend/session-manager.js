const { EventEmitter } = require('node:events')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { UsageTracker } = require('./usage-tracker')

const TRANSCRIPT_LIMIT = 250_000
const SESSION_SCHEMA_VERSION = 1
const USAGE_THROTTLE_MS = 1_500
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class SessionManager {
  /**
   * Creates a persistent PTY session manager.
   * @param {{ runtime: import('./runtime-manager').RuntimeManager, getFullAccess?: () => boolean }} options Runtime dependencies.
   */
  constructor(options) {
    this.runtime = options.runtime
    this.getFullAccess = typeof options.getFullAccess === 'function' ? options.getFullAccess : () => true
    this.events = new EventEmitter()
    this.sessions = new Map()
    this.storagePath = this.runtime.getSessionStoragePath()
    this.usage = new UsageTracker({ runtime: this.runtime })
    this.usageTimers = new Map()
    this.nextSessionNumber = 1
    this.loadSessions()
  }

  /**
   * Reads the current context usage for a session.
   * @param {string} sessionId Session id.
   * @returns {Promise<object|null>} Usage snapshot, or null when unavailable.
   */
  async getUsage(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return this.usage.read(session.id, session.cwd).catch(() => null)
  }

  /**
   * Schedules a throttled usage read. PTY output arrives far more often than
   * assistant turns, so reads are coalesced instead of following every chunk.
   * @param {object} session Session record.
   * @returns {void}
   */
  scheduleUsage(session) {
    if (this.usageTimers.has(session.id)) return
    const timer = setTimeout(() => {
      this.usageTimers.delete(session.id)
      if (session.deleted) return
      this.usage.read(session.id, session.cwd)
        .then((usage) => {
          if (usage && !session.deleted) this.events.emit('usage', { sessionId: session.id, usage })
        })
        .catch(() => undefined)
    }, USAGE_THROTTLE_MS)
    timer.unref?.()
    this.usageTimers.set(session.id, timer)
  }

  /** @param {string} sessionId Session id. @returns {void} Cancels any pending usage read. */
  clearUsageTimer(sessionId) {
    const timer = this.usageTimers.get(sessionId)
    if (!timer) return
    clearTimeout(timer)
    this.usageTimers.delete(sessionId)
  }

  /** @param {string} eventName Event name. @param {Function} listener Event listener. @returns {() => void} Unsubscribe callback. */
  on(eventName, listener) {
    this.events.on(eventName, listener)
    return () => this.events.off(eventName, listener)
  }

  /**
   * Starts Claude Code with a caller-owned conversation UUID.
   * @param {{ cwd?: string, title?: string, cols?: number, rows?: number }} options Session options.
   * @returns {object} Session information.
   */
  start(options = {}) {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const defaultTitle = this.getSuggestedTitle()
    this.nextSessionNumber += 1
    const session = {
      id,
      title: normalizeTitle(options.title, defaultTitle),
      cwd: normalizeCwd(options.cwd || os.homedir()),
      child: null,
      transcript: '',
      sequence: 0,
      startedAt: now,
      updatedAt: now,
      status: 'closed',
      deleted: false,
      closeRequested: false
    }
    this.sessions.set(id, session)
    try {
      this.launch(session, this.withAccessMode(['--session-id', id]), options)
      this.persistSessions()
      return this.toSessionInfo(session, true)
    } catch (error) {
      session.deleted = true
      this.sessions.delete(id)
      try { session.child?.kill() } catch {}
      throw error
    }
  }

  /** @returns {string} Default title for the next new session. */
  getSuggestedTitle() {
    return `会话 ${this.nextSessionNumber}`
  }

  /**
   * Reopens an existing Claude conversation in a new PTY.
   * @param {string} sessionId Persisted Claude conversation UUID.
   * @param {{ cols?: number, rows?: number }} options Terminal dimensions.
   * @returns {object} Session information.
   */
  resume(sessionId, options = {}) {
    const session = this.requireSession(sessionId)
    if (session.status === 'running' && session.child) return this.toSessionInfo(session, true)
    session.transcript = ''
    session.sequence = 0
    this.launch(session, this.withAccessMode(['--resume', session.id]), options)
    this.persistSessions()
    return this.toSessionInfo(session, true)
  }

  /**
   * Updates the plugin-side display name from a terminal title emitted by Claude Code.
   * @param {string} sessionId Session id.
   * @param {string} title Terminal title.
   * @returns {object} Updated session information.
   */
  rename(sessionId, title) {
    const session = this.requireSession(sessionId)
    const nextTitle = normalizeTerminalTitle(title)
    if (!nextTitle || nextTitle === session.title) return this.toSessionInfo(session, false)
    session.title = nextTitle
    this.persistSessions()
    return this.toSessionInfo(session, false)
  }

  /** @param {string[]} args Base Claude arguments. @returns {string[]} Arguments for the current access setting. */
  withAccessMode(args) {
    return this.getFullAccess() ? ['--dangerously-skip-permissions', ...args] : args
  }

  /** @returns {object[]} All sessions, most recently opened first. */
  list() {
    return Array.from(this.sessions.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => this.toSessionInfo(session, false))
  }

  /** @param {string} sessionId Session id. @param {string} data PTY input. @returns {void} Writes input to the PTY. */
  write(sessionId, data) {
    const session = this.requireSession(sessionId)
    if (session.status !== 'running' || !session.child) throw new Error('终端会话已结束')
    if (typeof data !== 'string' || data.length > 100_000) throw new Error('终端输入无效')
    session.child.write(data)
  }

  /** @param {string} sessionId Session id. @param {number} cols Column count. @param {number} rows Row count. @returns {void} Resizes the PTY. */
  resize(sessionId, cols, rows) {
    const session = this.requireSession(sessionId)
    if (session.status !== 'running' || !session.child) return
    session.child.resize(clampDimension(cols, 120), clampDimension(rows, 32))
  }

  /** @param {string} sessionId Session id. @returns {object} Session snapshot. */
  getSnapshot(sessionId) {
    const session = this.requireSession(sessionId)
    return {
      ...this.toSessionInfo(session, false),
      sessionId,
      transcript: session.transcript,
      sequence: session.sequence
    }
  }

  /** @param {string} sessionId Session id. @returns {void} Closes the PTY and keeps the resumable conversation record. */
  close(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'running' || !session.child) return
    session.closeRequested = true
    try { session.child.kill() } catch {}
  }

  /** @param {string} sessionId Session id. @returns {void} Removes a session and terminates it when needed. */
  delete(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.deleted = true
    this.sessions.delete(sessionId)
    this.clearUsageTimer(sessionId)
    if (session.status === 'running') {
      try { session.child?.kill() } catch {}
    }
    this.persistSessions()
    this.events.emit('deleted', { sessionId })
  }

  /** @returns {Promise<void>} Stops PTYs while retaining their resumable records. */
  async shutdown() {
    for (const sessionId of Array.from(this.usageTimers.keys())) {
      this.clearUsageTimer(sessionId)
    }
    for (const session of this.sessions.values()) {
      if (session.status !== 'running' || !session.child) continue
      session.closeRequested = true
      session.status = 'closed'
      const child = session.child
      session.child = null
      try { child.kill() } catch {}
    }
    this.persistSessions()
  }

  /** @param {object} session Session record. @param {string[]} args Claude CLI arguments. @param {object} options Terminal dimensions. */
  launch(session, args, options) {
    const launch = this.runtime.getLaunchContext()
    const cwd = normalizeCwd(session.cwd || launch.cwd)
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`工作目录不存在: ${cwd}`)
    }
    const pty = this.runtime.loadPty()
    const child = pty.spawn(launch.claudeBinary, args, {
      name: 'xterm-256color',
      cols: clampDimension(options.cols, 120),
      rows: clampDimension(options.rows, 32),
      cwd,
      env: launch.env,
      useConpty: process.platform === 'win32'
    })
    session.cwd = cwd
    session.child = child
    session.status = 'running'
    session.exitCode = undefined
    session.deleted = false
    session.closeRequested = false
    session.updatedAt = new Date().toISOString()

    child.onData((data) => {
      if (session.deleted) return
      session.transcript = trimTranscript(session.transcript + data)
      session.sequence += 1
      this.events.emit('data', { sessionId: session.id, data, sequence: session.sequence })
      this.scheduleUsage(session)
    })
    child.onExit(({ exitCode, signal }) => {
      if (session.deleted) return
      session.child = null
      session.status = session.closeRequested ? 'closed' : 'exited'
      session.exitCode = exitCode
      session.updatedAt = new Date().toISOString()
      const exitMessage = `\r\n\x1b[90m[Claude Code 已${session.closeRequested ? '终止' : '退出'}，退出码 ${exitCode}，再次打开将自动恢复]\x1b[0m\r\n`
      session.transcript = trimTranscript(session.transcript + exitMessage)
      session.sequence += 1
      this.persistSessions()
      this.events.emit('data', { sessionId: session.id, data: exitMessage, sequence: session.sequence })
      this.events.emit('exit', {
        sessionId: session.id,
        exitCode,
        signal,
        transcript: session.transcript,
        sequence: session.sequence,
        status: session.status
      })
    })
  }

  /** Loads safe session metadata. Any formerly running PTY is resumable after process restart. */
  loadSessions() {
    let saved
    try {
      saved = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'))
    } catch {
      return
    }
    if (saved?.schemaVersion !== SESSION_SCHEMA_VERSION || !Array.isArray(saved.sessions)) return
    this.nextSessionNumber = clampSessionNumber(saved.nextSessionNumber)
    for (const value of saved.sessions) {
      if (!isSavedSession(value)) continue
      const status = value.status === 'exited' ? 'exited' : 'closed'
      this.sessions.set(value.id, {
        id: value.id,
        title: value.title,
        cwd: normalizeCwd(value.cwd),
        child: null,
        transcript: '',
        sequence: 0,
        startedAt: value.startedAt,
        updatedAt: value.updatedAt || value.startedAt,
        status,
        exitCode: typeof value.exitCode === 'number' ? value.exitCode : undefined,
        deleted: false,
        closeRequested: false
      })
    }
  }

  /** Persists only metadata; Claude owns conversation data under the isolated CLAUDE_CONFIG_DIR. */
  persistSessions() {
    const payload = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      nextSessionNumber: this.nextSessionNumber,
      sessions: Array.from(this.sessions.values()).map((session) => ({
        id: session.id,
        title: session.title,
        cwd: session.cwd,
        status: session.status,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        exitCode: session.exitCode
      }))
    }
    const temporaryPath = `${this.storagePath}.${process.pid}.${crypto.randomUUID()}.tmp`
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true })
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      fs.renameSync(temporaryPath, this.storagePath)
    } finally {
      try { fs.rmSync(temporaryPath, { force: true }) } catch {}
    }
  }

  /** @param {string} sessionId Session id. @returns {object} Session. */
  requireSession(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('终端会话不存在或已删除')
    return session
  }

  /** @param {object} session Session record. @param {boolean} includeTranscript Include buffered output. @returns {object} Renderer-safe session information. */
  toSessionInfo(session, includeTranscript) {
    const info = {
      id: session.id,
      title: session.title,
      cwd: session.cwd,
      status: session.status,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      exitCode: session.exitCode
    }
    if (includeTranscript) info.transcript = session.transcript
    return info
  }
}

/** @param {unknown} value Candidate dimension. @param {number} fallback Fallback. @returns {number} Safe dimension. */
function clampDimension(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(400, Math.max(1, Math.round(value)))
    : fallback
}

/** @param {string} cwd Candidate directory. @returns {string} Normalized directory. */
function normalizeCwd(cwd) {
  const value = String(cwd || os.homedir()).trim()
  return value.length > 4096 ? value.slice(0, 4096) : value
}

/** @param {unknown} value Candidate title. @param {string} fallback Default title. @returns {string} Safe display name. */
function normalizeTitle(value, fallback) {
  const title = typeof value === 'string' ? value.trim() : ''
  return (title || fallback).slice(0, 80)
}

/** @param {unknown} value Terminal title. @returns {string} Safe meaningful display name, or an empty string when ignored. */
function normalizeTerminalTitle(value) {
  if (typeof value !== 'string') return ''
  const title = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!title || /^(?:claude(?:\s+code)?|claude-code)$/i.test(title)) return ''
  return title
}

/** @param {string} value Transcript. @returns {string} Bounded transcript. */
function trimTranscript(value) {
  return value.length <= TRANSCRIPT_LIMIT ? value : value.slice(-TRANSCRIPT_LIMIT)
}

/** @param {unknown} value Candidate next session number. @returns {number} Safe counter. */
function clampSessionNumber(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 1
}

/** @param {any} value Persisted session candidate. @returns {boolean} Whether the record is safe to load. */
function isSavedSession(value) {
  return value
    && UUID_PATTERN.test(value.id)
    && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 120
    && typeof value.cwd === 'string' && value.cwd.length > 0 && value.cwd.length <= 4096
    && typeof value.startedAt === 'string'
    && ['running', 'closed', 'exited'].includes(value.status)
}

module.exports = { SessionManager }
