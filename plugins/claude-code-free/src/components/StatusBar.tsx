import { useEffect, useState } from 'react'
import { Cpu, Gauge } from 'lucide-react'
import type { SessionUsage } from '../types'

interface StatusBarProps {
  sessionId: string | null
}

const PLACEHOLDER = '—'

export function StatusBar({ sessionId }: StatusBarProps) {
  const [usage, setUsage] = useState<SessionUsage | null>(null)

  useEffect(() => {
    const api = window.claudeCodeFree
    setUsage(null)
    if (!api || !sessionId) return undefined

    let active = true
    api.getSessionUsage(sessionId)
      .then((value) => { if (active) setUsage(value) })
      .catch(() => undefined)
    const offUsage = api.onSessionUsage((payload) => {
      if (!active || payload.sessionId !== sessionId) return
      setUsage(payload.usage)
    })
    return () => {
      active = false
      offUsage()
    }
  }, [sessionId])

  const percent = usage?.usedPercent ?? null
  const remaining = percent === null ? null : Math.max(0, 100 - percent)

  return (
    <footer className="status-bar">
      <span className="status-cell" title={usage?.modelId || '等待模型信息'}>
        <Cpu size={13} />
        <span>{usage?.modelName || PLACEHOLDER}</span>
      </span>
      <span className="status-cell status-meter" title={remaining === null ? '未知上下文窗口' : `剩余 ${formatPercent(remaining)}`}>
        <Gauge size={13} />
        <span className="meter-track">
          <span className={`meter-fill ${loadLevel(percent)}`} style={{ width: percent === null ? '0%' : `${Math.max(1.5, percent)}%` }} />
        </span>
        <span className="meter-value">{remaining === null ? PLACEHOLDER : `剩余 ${formatPercent(remaining)}`}</span>
      </span>
      <span className="status-cell status-tokens">
        {usage ? `${formatTokens(usage.usedTokens)} / ${usage.contextLimit ? formatTokens(usage.contextLimit) : PLACEHOLDER} tokens` : `${PLACEHOLDER} tokens`}
      </span>
    </footer>
  )
}

/** @param percent Consumed share of the context window, or null when unknown. */
function loadLevel(percent: number | null) {
  if (percent === null) return 'unknown'
  if (percent >= 90) return 'critical'
  if (percent >= 70) return 'warn'
  return 'normal'
}

function formatPercent(value: number) {
  return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`
  return String(value)
}
