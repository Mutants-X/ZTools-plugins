import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

interface TerminalViewProps {
  sessionId: string | null
  isRunning: boolean
  onReady: (dimensions: { cols: number; rows: number }) => void
  onExit: (sessionId: string) => void
  onTitleChange: (sessionId: string, title: string) => void
}

export function TerminalView({ sessionId, isRunning, onReady, onExit, onTitleChange }: TerminalViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef(sessionId)
  const isRunningRef = useRef(isRunning)
  const sequenceRef = useRef(0)
  const pendingOutputRef = useRef('')
  const outputFrameRef = useRef<number | null>(null)
  const onReadyRef = useRef(onReady)
  const onExitRef = useRef(onExit)
  const onTitleChangeRef = useRef(onTitleChange)

  onReadyRef.current = onReady
  onExitRef.current = onExit
  onTitleChangeRef.current = onTitleChange
  sessionIdRef.current = sessionId
  isRunningRef.current = isRunning

  useEffect(() => {
    const host = hostRef.current
    const api = window.claudeCodeFree
    if (!host || !api) return undefined

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily: '"SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.08,
      scrollback: 8000,
      theme: {
        background: '#111317',
        foreground: '#e6e9ef',
        cursor: '#f4a261',
        cursorAccent: '#111317',
        selectionBackground: 'rgba(244, 162, 97, 0.28)',
        black: '#111317',
        red: '#ef6f6c',
        green: '#75c69b',
        yellow: '#f4c95d',
        blue: '#79a8ff',
        magenta: '#c79bea',
        cyan: '#68c6c9',
        white: '#e6e9ef',
        brightBlack: '#646b78',
        brightWhite: '#ffffff'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon((_event, uri) => api.openExternal(uri)))
    terminal.open(host)
    terminalRef.current = terminal
    fitRef.current = fitAddon

    const flushOutput = () => {
      outputFrameRef.current = null
      const output = pendingOutputRef.current
      pendingOutputRef.current = ''
      if (output) terminal.write(output)
    }
    const queueOutput = (output: string) => {
      pendingOutputRef.current += output
      if (outputFrameRef.current === null) {
        outputFrameRef.current = window.requestAnimationFrame(flushOutput)
      }
    }
    const fit = () => {
      if (!host.isConnected || host.clientWidth <= 0 || host.clientHeight <= 0) return
      fitAddon.fit()
      onReadyRef.current({ cols: terminal.cols, rows: terminal.rows })
    }
    const resizeObserver = new ResizeObserver(fit)
    resizeObserver.observe(host)

    const offData = api.onSessionData((payload) => {
      if (payload.sessionId !== sessionIdRef.current) return
      if (payload.sequence <= sequenceRef.current) return
      sequenceRef.current = payload.sequence
      queueOutput(payload.data)
    })
    const offExit = api.onSessionExit((payload) => {
      if (payload.sessionId !== sessionIdRef.current) return
      sequenceRef.current = payload.sequence
      onExitRef.current(payload.sessionId)
    })
    const onData = terminal.onData((data) => {
      const activeId = sessionIdRef.current
      if (activeId && isRunningRef.current) api.writeSession(activeId, data)
    })
    const onResize = terminal.onResize(({ cols, rows }) => {
      const activeId = sessionIdRef.current
      if (activeId && isRunningRef.current) api.resizeSession(activeId, cols, rows)
    })
    const onTerminalTitleChange = terminal.onTitleChange((title) => {
      const activeId = sessionIdRef.current
      if (activeId) onTitleChangeRef.current(activeId, title)
    })
    const onFocus = () => terminal.focus()
    host.addEventListener('click', onFocus)
    window.addEventListener('resize', fit)
    window.requestAnimationFrame(fit)

    return () => {
      resizeObserver.disconnect()
      offData()
      offExit()
      onData.dispose()
      onResize.dispose()
      onTerminalTitleChange.dispose()
      host.removeEventListener('click', onFocus)
      window.removeEventListener('resize', fit)
      if (outputFrameRef.current !== null) window.cancelAnimationFrame(outputFrameRef.current)
      terminal.dispose()
      terminalRef.current = null
    }
  }, [])

  useEffect(() => {
    const terminal = terminalRef.current
    const api = window.claudeCodeFree
    if (!terminal || !api || !sessionId) {
      sessionIdRef.current = sessionId
      return
    }

    sessionIdRef.current = sessionId
    sequenceRef.current = 0
    pendingOutputRef.current = ''
    if (outputFrameRef.current !== null) {
      window.cancelAnimationFrame(outputFrameRef.current)
      outputFrameRef.current = null
    }
    terminal.reset()
    try {
      const snapshot = api.getSessionSnapshot(sessionId) as { transcript?: string; sequence?: number }
      if (snapshot.transcript) terminal.write(snapshot.transcript)
      sequenceRef.current = snapshot.sequence || 0
    } catch {
      terminal.write('\r\n\x1b[31m无法读取终端初始输出\x1b[0m\r\n')
    }
    window.requestAnimationFrame(() => {
      fitRef.current?.fit()
      terminal.focus()
    })
  }, [sessionId])

  return <div className="terminal-host" ref={hostRef} />
}
