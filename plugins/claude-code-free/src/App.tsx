import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  HardDriveDownload,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCw,
  Settings,
  Square,
  TerminalSquare,
  Trash2,
  X
} from 'lucide-react'
import { StatusBar } from './components/StatusBar'
import { TerminalView } from './components/TerminalView'
import type { RuntimeStatus, SessionInfo } from './types'

const initialStatus: RuntimeStatus = {
  phase: 'idle',
  progress: 0,
  message: '等待安装运行环境',
  ready: false,
  rootDir: '',
  defaultCwd: '',
  versions: { node: '24.18.0', claudeCode: '2.1.220', nodePty: '1.1.0' }
}

export function App() {
  const api = window.claudeCodeFree
  const [status, setStatus] = useState<RuntimeStatus>(api?.getStatus() || initialStatus)
  const [cwd, setCwd] = useState(status.defaultCwd || '')
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [terminalReady, setTerminalReady] = useState(false)
  const [terminalEpoch, setTerminalEpoch] = useState(0)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fullAccess, setFullAccess] = useState(() => api?.getPreferences().fullAccess ?? false)
  const [newSessionCwd, setNewSessionCwd] = useState('')
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [terminalDimensions, setTerminalDimensions] = useState({ cols: 120, rows: 32 })
  const startingRef = useRef(false)
  const autoResumeAttemptedRef = useRef(false)
  const cwdRef = useRef(cwd)
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  const dimensionsRef = useRef(terminalDimensions)

  cwdRef.current = cwd
  sessionsRef.current = sessions
  activeSessionIdRef.current = activeSessionId
  dimensionsRef.current = terminalDimensions

  const refreshSessions = useCallback(() => {
    if (!api) return []
    const next = api.listSessions()
    sessionsRef.current = next
    setSessions(next)
    setSessionsLoaded(true)
    setActiveSessionId((current) => {
      const selected = current && next.some((session) => session.id === current) ? current : next[0]?.id || null
      activeSessionIdRef.current = selected
      return selected
    })
    return next
  }, [api])

  useEffect(() => {
    if (!api) return undefined
    const offProgress = api.onProgress(setStatus)
    const current = api.getStatus()
    setStatus(current)
    setCwd((value) => value || api.getLaunchDirectory() || current.defaultCwd)
    if (current.ready) refreshSessions()
    if (!current.ready) {
      api.install().then(setStatus).catch(() => undefined)
    }
    return offProgress
  }, [api, refreshSessions])

  const startSession = useCallback((nextCwd = cwdRef.current, title?: string) => {
    if (!api || !status.ready || startingRef.current) return false
    startingRef.current = true
    try {
      const result = api.startSession({ cwd: nextCwd || status.defaultCwd, title, ...dimensionsRef.current })
      const next = api.listSessions()
      sessionsRef.current = next
      setSessions(next)
      activeSessionIdRef.current = result.id
      setActiveSessionId(result.id)
      setCwd(result.cwd)
      return true
    } catch (error) {
      setStatus((current) => ({ ...current, phase: 'error', ready: false, error: error instanceof Error ? error.message : String(error), message: 'Claude Code 启动失败' }))
      return false
    } finally {
      startingRef.current = false
    }
  }, [api, status.ready, status.defaultCwd])

  const resumeSession = useCallback((session: SessionInfo) => {
    if (!api || !status.ready || startingRef.current) return
    if (session.status === 'running') {
      activeSessionIdRef.current = session.id
      setActiveSessionId(session.id)
      setCwd(session.cwd)
      return
    }
    startingRef.current = true
    try {
      const result = api.resumeSession(session.id, dimensionsRef.current)
      const next = api.listSessions()
      sessionsRef.current = next
      setSessions(next)
      activeSessionIdRef.current = result.id
      setActiveSessionId(result.id)
      setCwd(result.cwd)
      setTerminalEpoch((value) => value + 1)
    } catch (error) {
      setStatus((current) => ({ ...current, phase: 'error', ready: false, error: error instanceof Error ? error.message : String(error), message: 'Claude Code 会话恢复失败' }))
    } finally {
      startingRef.current = false
    }
  }, [api, status.ready])

  useEffect(() => {
    if (!api || !status.ready) return undefined
    refreshSessions()
    const offExit = api.onSessionExit(refreshSessions)
    const offDeleted = api.onSessionDeleted(refreshSessions)
    return () => {
      offExit()
      offDeleted()
    }
  }, [api, status.ready, refreshSessions])

  useEffect(() => {
    if (!status.ready || !terminalReady || !sessionsLoaded || autoResumeAttemptedRef.current) return
    autoResumeAttemptedRef.current = true
    const selected = sessionsRef.current.find((session) => session.id === activeSessionIdRef.current)
    if (selected && selected.status !== 'running') {
      resumeSession(selected)
    }
  }, [sessionsLoaded, status.ready, terminalReady, resumeSession])

  const closeSession = useCallback((sessionId: string) => {
    if (!api) return
    api.closeSession(sessionId)
  }, [api])

  const deleteSession = useCallback((sessionId: string) => {
    if (!api) return
    api.deleteSession(sessionId)
    refreshSessions()
  }, [api, refreshSessions])

  const selectSession = useCallback((session: SessionInfo) => {
    if (session.status !== 'running') {
      resumeSession(session)
      return
    }
    activeSessionIdRef.current = session.id
    setActiveSessionId(session.id)
    setCwd(session.cwd)
  }, [resumeSession])

  const openNewSessionDialog = useCallback((initialCwd = cwdRef.current) => {
    if (!api) return
    setNewSessionCwd(initialCwd || status.defaultCwd)
    setNewSessionTitle(api.getSuggestedSessionTitle())
    setNewSessionOpen(true)
  }, [api, status.defaultCwd])

  const selectNewSessionDirectory = useCallback(async () => {
    if (!api) return
    const selected = await api.selectDirectory(newSessionCwd || cwdRef.current)
    if (selected) setNewSessionCwd(selected)
  }, [api, newSessionCwd])

  const createSession = useCallback(() => {
    const title = newSessionTitle.trim()
    if (!title || !newSessionCwd) return
    if (startSession(newSessionCwd, title)) setNewSessionOpen(false)
  }, [newSessionCwd, newSessionTitle, startSession])

  useEffect(() => {
    if (!newSessionOpen && !settingsOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setNewSessionOpen(false)
      setSettingsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [newSessionOpen, settingsOpen])

  const openSettings = useCallback(() => {
    if (!api) return
    setFullAccess(api.getPreferences().fullAccess)
    setSettingsOpen(true)
  }, [api])

  const toggleFullAccess = useCallback(() => {
    if (!api) return
    setFullAccess((current) => api.setFullAccess(!current).fullAccess)
  }, [api])

  const handleTerminalReady = useCallback((dimensions: { cols: number; rows: number }) => {
    setTerminalDimensions(dimensions)
    dimensionsRef.current = dimensions
    setTerminalReady(true)
  }, [])

  const handleTerminalTitleChange = useCallback((sessionId: string, title: string) => {
    if (!api) return
    try {
      const updated = api.renameSession(sessionId, title)
      setSessions((current) => {
        const next = current.map((session) => session.id === updated.id ? updated : session)
        sessionsRef.current = next
        return next
      })
    } catch {
      // The session may have been deleted while queued terminal output was still being parsed.
    }
  }, [api])

  const handleRetry = useCallback(() => {
    if (!api) return
    setStatus((current) => ({ ...current, phase: 'checking', progress: 0, error: undefined, message: '正在重试安装' }))
    api.install().then(setStatus).catch(() => undefined)
  }, [api])

  if (!api) return <UnavailableView />
  if (!status.ready) return <RuntimeView status={status} onRetry={handleRetry} onRepair={() => api.repair().then(setStatus).catch(() => undefined)} />

  const activeSession = sessions.find((session) => session.id === activeSessionId) || null
  const activeCwd = activeSession?.cwd || cwd || status.defaultCwd
  const recentDirectories = Array.from(new Set([
    newSessionCwd,
    ...sessions.map((session) => session.cwd),
    cwd,
    status.defaultCwd
  ].filter(Boolean))).slice(0, 10)

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="icon-button" onClick={() => setSidebarVisible((value) => !value)} title={sidebarVisible ? '隐藏会话列表' : '显示会话列表'} aria-label={sidebarVisible ? '隐藏会话列表' : '显示会话列表'}>
          {sidebarVisible ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <div className="brand-lockup">
          <strong>Claude Code Free</strong>
        </div>
        <div className="workspace-inline" title={activeCwd}>
          <FolderOpen size={16} />
          <code>{activeCwd}</code>
        </div>
        <div className="runtime-chip"><span className="status-dot" />Node {status.versions.node}</div>
        <button className="icon-button settings-button" onClick={openSettings} title="设置" aria-label="设置"><Settings size={17} /></button>
      </header>
      <div className="workspace-shell">
        {sidebarVisible && (
          <aside className="session-sidebar">
            <div className="session-sidebar-header">
              <span>会话</span>
              <button className="icon-button compact" onClick={() => openNewSessionDialog(activeCwd)} title="新建会话" aria-label="新建会话"><Plus size={16} /></button>
            </div>
            <div className="session-list">
              {sessions.map((session) => (
                <div key={session.id} className={`session-item${session.id === activeSessionId ? ' active' : ''}`}>
                  <button className="session-select" onClick={() => selectSession(session)} title={`${session.title} · ${formatSessionStatus(session.status)}`}>
                    <span className={`session-state ${session.status}`} />
                    <span className="session-copy">
                      <strong>{session.title}</strong>
                      <span title={session.cwd}>{session.cwd}</span>
                    </span>
                  </button>
                  <span className="session-actions">
                    {session.status === 'running' && <button className="session-action" title="终止会话" aria-label={`终止${session.title}`} onClick={() => closeSession(session.id)}><Square size={12} fill="currentColor" /></button>}
                    <button className="session-action delete" title="删除会话" aria-label={`删除${session.title}`} onClick={() => deleteSession(session.id)}><Trash2 size={14} /></button>
                  </span>
                </div>
              ))}
              {sessions.length === 0 && <div className="session-list-empty">暂无会话</div>}
            </div>
          </aside>
        )}
        <section className="terminal-frame">
          <div className="terminal-surface">
            <TerminalView key={`${activeSessionId || 'empty'}:${terminalEpoch}`} sessionId={activeSessionId} isRunning={activeSession?.status === 'running'} onReady={handleTerminalReady} onExit={refreshSessions} onTitleChange={handleTerminalTitleChange} />
            {!activeSessionId && <div className="terminal-empty">暂无会话</div>}
          </div>
          <StatusBar sessionId={activeSessionId} />
        </section>
      </div>
      {newSessionOpen && (
        <div className="dialog-backdrop" onMouseDown={() => setNewSessionOpen(false)}>
          <form className="new-session-dialog" role="dialog" aria-modal="true" aria-labelledby="new-session-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); createSession() }}>
            <div className="dialog-header">
              <strong id="new-session-title">新建会话</strong>
              <button type="button" className="icon-button compact dialog-close" onClick={() => setNewSessionOpen(false)} title="关闭" aria-label="关闭"><X size={16} /></button>
            </div>
            <label className="field-label" htmlFor="session-name">会话名称</label>
            <input id="session-name" className="dialog-input" value={newSessionTitle} onChange={(event) => setNewSessionTitle(event.target.value)} maxLength={80} autoFocus />
            <label className="field-label" htmlFor="session-directory">项目文件夹</label>
            <div className="directory-field">
              <select id="session-directory" className="dialog-select" value={newSessionCwd} onChange={(event) => setNewSessionCwd(event.target.value)}>
                {recentDirectories.map((directory) => <option key={directory} value={directory}>{directory}</option>)}
              </select>
              <button type="button" className="directory-browse" onClick={selectNewSessionDirectory} title="选择项目文件夹" aria-label="选择项目文件夹"><FolderOpen size={17} /></button>
            </div>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setNewSessionOpen(false)}>取消</button>
              <button type="submit" className="primary-button" disabled={!newSessionTitle.trim() || !newSessionCwd}><Plus size={16} />创建会话</button>
            </div>
          </form>
        </div>
      )}
      {settingsOpen && (
        <div className="dialog-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="new-session-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <strong id="settings-title">设置</strong>
              <button type="button" className="icon-button compact dialog-close" onClick={() => setSettingsOpen(false)} title="关闭" aria-label="关闭"><X size={16} /></button>
            </div>
            <div className="setting-row">
              <span>完全访问</span>
              <button type="button" className={`switch-control${fullAccess ? ' enabled' : ''}`} role="switch" aria-checked={fullAccess} aria-label="完全访问" onClick={toggleFullAccess}>
                <span className="switch-thumb" />
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function RuntimeView({ status, onRetry, onRepair }: { status: RuntimeStatus; onRetry: () => void; onRepair: () => void }) {
  const downloading = status.phase !== 'idle' && status.phase !== 'error'
  const transfer = status.transfer
  return (
    <main className="runtime-shell">
      <div className="runtime-header">
        <span className="brand-mark large"><TerminalSquare size={24} /></span>
        <div><strong>Claude Code Free</strong><span>隔离运行环境</span></div>
      </div>
      {status.phase === 'error' ? <AlertTriangle className="state-icon error" size={28} /> : downloading ? <LoaderCircle className="state-icon spin" size={28} /> : <HardDriveDownload className="state-icon" size={28} />}
      <h1>{status.phase === 'error' ? '运行环境安装失败' : downloading ? status.message : '准备 Claude Code 运行环境'}</h1>
      <p className="runtime-message">{status.error || status.message}</p>
      {downloading && <div className="progress-track"><span style={{ width: `${Math.max(2, status.progress)}%` }} /></div>}
      {downloading && <div className="progress-meta"><span>{status.progress}%</span>{transfer && <span>{formatBytes(transfer.received)} / {formatBytes(transfer.total)}</span>}</div>}
      <div className="runtime-actions">
        {status.phase === 'error' ? <><button className="primary-button" onClick={onRetry}><RotateCw size={16} />重试</button><button className="secondary-button" onClick={onRepair}><HardDriveDownload size={16} />修复环境</button></> : <span className="phase-note"><CheckCircle2 size={15} />首次安装只需执行一次</span>}
      </div>
    </main>
  )
}

function UnavailableView() {
  return <main className="runtime-shell"><AlertTriangle className="state-icon error" size={28} /><h1>请在 ZTools 中打开</h1><p className="runtime-message">Claude Code Free 需要 Electron preload 能力。</p></main>
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatSessionStatus(status: SessionInfo['status']) {
  if (status === 'running') return '运行中'
  if (status === 'closed') return '已终止'
  return '已退出'
}
