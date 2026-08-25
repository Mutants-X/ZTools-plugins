export type RuntimePhase =
  | 'idle'
  | 'checking'
  | 'downloading-node'
  | 'extracting-node'
  | 'installing-packages'
  | 'verifying'
  | 'ready'
  | 'error'

export interface RuntimeStatus {
  phase: RuntimePhase
  progress: number
  message: string
  error?: string
  ready: boolean
  rootDir: string
  defaultCwd: string
  transfer?: { received: number; total: number }
  versions: { node: string; claudeCode: string; nodePty: string }
}

export interface SessionStartResult {
  id: string
  title: string
  transcript: string
  cwd: string
  status: SessionStatus
  startedAt: string
  updatedAt: string
}

export type SessionStatus = 'running' | 'closed' | 'exited'

export interface SessionInfo {
  id: string
  title: string
  cwd: string
  status: SessionStatus
  startedAt: string
  updatedAt: string
  exitCode?: number
}

export interface SessionSnapshot extends SessionInfo {
  transcript: string
  sequence: number
}

export interface SessionUsage {
  modelId: string
  modelName: string
  usedTokens: number
  /** Null when the model's context window is unknown; percentages are then hidden. */
  contextLimit: number | null
  usedPercent: number | null
}

export interface PluginPreferences {
  fullAccess: boolean
}

export interface ClaudeCodeFreeApi {
  platform: string
  arch: string
  getStatus(): RuntimeStatus
  getLaunchDirectory(): string | null
  getPreferences(): PluginPreferences
  setFullAccess(enabled: boolean): PluginPreferences
  install(): Promise<RuntimeStatus>
  repair(): Promise<RuntimeStatus>
  onProgress(listener: (status: RuntimeStatus) => void): () => void
  openDataDirectory(): Promise<void>
  selectDirectory(defaultPath?: string): Promise<string | null>
  startSession(options: { cwd: string; title?: string; cols: number; rows: number }): SessionStartResult
  getSuggestedSessionTitle(): string
  resumeSession(sessionId: string, options: { cols: number; rows: number }): SessionStartResult
  renameSession(sessionId: string, title: string): SessionInfo
  listSessions(): SessionInfo[]
  writeSession(sessionId: string, data: string): void
  resizeSession(sessionId: string, cols: number, rows: number): void
  getSessionSnapshot(sessionId: string): SessionSnapshot
  getSessionUsage(sessionId: string): Promise<SessionUsage | null>
  closeSession(sessionId: string): void
  deleteSession(sessionId: string): void
  onSessionData(listener: (payload: { sessionId: string; data: string; sequence: number }) => void): () => void
  onSessionExit(listener: (payload: { sessionId: string; exitCode: number; signal?: number; transcript: string; sequence: number; status: SessionStatus }) => void): () => void
  onSessionDeleted(listener: (payload: { sessionId: string }) => void): () => void
  onSessionUsage(listener: (payload: { sessionId: string; usage: SessionUsage }) => void): () => void
  readClipboardText(): string
  writeClipboardText(text: string): void
  openExternal(url: string): void
}

declare global {
  interface Window {
    claudeCodeFree?: ClaudeCodeFreeApi
    ztools?: {
      getPath?: (name: string) => string
      showOpenDialog?: (options: Record<string, unknown>) => Promise<string[] | undefined> | string[] | undefined
      onPluginOut?: (callback: (isKill?: boolean) => void) => void
      onPluginEnter?: (callback: (action: { code?: string; type?: string; payload?: unknown }) => void) => void
    }
  }
}

export {}
