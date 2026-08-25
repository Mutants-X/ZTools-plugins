const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const TAIL_CHUNK_SIZE = 64 * 1024
const MAX_SCAN_BYTES = 4 * 1024 * 1024
const CONTEXT_LIMITS = [
  { pattern: 'fable', limit: 200_000 },
  { pattern: 'mythos', limit: 1_000_000 },
  { pattern: 'opus', limit: 200_000 },
  { pattern: 'sonnet', limit: 200_000 },
  { pattern: 'haiku', limit: 200_000 }
]
const DISPLAY_NAMES = [
  { pattern: 'fable', name: 'Fable' },
  { pattern: 'mythos', name: 'Mythos' },
  { pattern: 'opus', name: 'Opus' },
  { pattern: 'sonnet', name: 'Sonnet' },
  { pattern: 'haiku', name: 'Haiku' }
]

class UsageTracker {
  /**
   * Reads context usage from Claude's own conversation transcripts.
   * @param {{ runtime: import('./runtime-manager').RuntimeManager }} options Runtime dependency.
   */
  constructor(options) {
    this.runtime = options.runtime
  }

  /**
   * Reads the latest assistant token usage for a session.
   * @param {string} sessionId Claude conversation UUID.
   * @param {string} cwd Session working directory.
   * @returns {Promise<object|null>} Usage snapshot, or null when no assistant turn exists yet.
   */
  async read(sessionId, cwd) {
    const transcriptPath = this.resolveTranscriptPath(sessionId, cwd)
    if (!transcriptPath) return null
    const entry = await readLastAssistantEntry(transcriptPath)
    if (!entry) return null
    return buildUsage(entry)
  }

  /**
   * Builds the transcript path Claude writes for a conversation.
   * @param {string} sessionId Claude conversation UUID.
   * @param {string} cwd Session working directory.
   * @returns {string|null} Transcript path, or null when inputs are unusable.
   */
  resolveTranscriptPath(sessionId, cwd) {
    if (typeof sessionId !== 'string' || !sessionId || typeof cwd !== 'string' || !cwd) return null
    const configDir = this.runtime.getClaudeConfigDir()
    if (!configDir) return null
    return path.join(configDir, 'projects', encodeProjectDir(cwd), `${sessionId}.jsonl`)
  }
}

/**
 * Encodes a working directory the way Claude names its project folders.
 * @param {string} cwd Absolute working directory.
 * @returns {string} Encoded folder name.
 */
function encodeProjectDir(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * Scans a transcript backwards for the most recent assistant message.
 * Reads fixed-size chunks from the tail so long transcripts stay cheap.
 * @param {string} transcriptPath Transcript file path.
 * @returns {Promise<object|null>} Parsed assistant message, or null when absent.
 */
async function readLastAssistantEntry(transcriptPath) {
  let handle
  try {
    handle = await fsp.open(transcriptPath, 'r')
  } catch {
    return null
  }
  try {
    const { size } = await handle.stat()
    if (size <= 0) return null
    const floor = Math.max(0, size - MAX_SCAN_BYTES)
    let position = size
    // Carry stays a Buffer: a chunk boundary can split a multi-byte character,
    // so bytes must be rejoined before any UTF-8 decoding.
    let carry = Buffer.alloc(0)

    while (position > floor) {
      const length = Math.min(TAIL_CHUNK_SIZE, position - floor)
      const start = position - length
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, start)
      position = start

      const combined = Buffer.concat([buffer.subarray(0, bytesRead), carry])
      let offset = 0
      if (position > floor) {
        const newline = combined.indexOf(0x0a)
        if (newline === -1) {
          carry = combined
          continue
        }
        carry = combined.subarray(0, newline)
        offset = newline + 1
      } else {
        carry = Buffer.alloc(0)
      }

      // Decoding starts just past a newline, so no character is ever split here.
      const lines = combined.subarray(offset).toString('utf8').split('\n')
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const entry = parseAssistantLine(lines[index])
        if (entry) return entry
      }
    }
    return parseAssistantLine(carry.toString('utf8'))
  } catch {
    return null
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/**
 * Parses one transcript line and keeps it only when it carries assistant usage.
 * @param {string} line Raw JSONL line.
 * @returns {object|null} Assistant message, or null when not applicable.
 */
function parseAssistantLine(line) {
  const trimmed = typeof line === 'string' ? line.trim() : ''
  if (!trimmed || trimmed[0] !== '{' || !trimmed.includes('"assistant"')) return null
  let record
  try {
    record = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (record?.type !== 'assistant') return null
  const message = record.message
  return message?.usage ? message : null
}

/**
 * Converts a raw assistant message into a renderer-ready usage snapshot.
 * Cache reads occupy the context window, so every input class counts.
 * @param {object} message Assistant message with usage.
 * @returns {object} Usage snapshot.
 */
function buildUsage(message) {
  const usage = message.usage || {}
  const usedTokens = toCount(usage.input_tokens)
    + toCount(usage.cache_creation_input_tokens)
    + toCount(usage.cache_read_input_tokens)
    + toCount(usage.output_tokens)
  const modelId = typeof message.model === 'string' ? message.model : ''
  const contextLimit = resolveContextLimit(modelId)
  return {
    modelId,
    modelName: resolveDisplayName(modelId),
    usedTokens,
    contextLimit,
    // Percentages are omitted for unknown models rather than computed from a guessed divisor.
    usedPercent: contextLimit ? Math.min(100, (usedTokens / contextLimit) * 100) : null
  }
}

/** @param {unknown} value Candidate token count. @returns {number} Safe token count. */
function toCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/** @param {string} modelId Model identifier. @returns {number|null} Context window size, or null when unknown. */
function resolveContextLimit(modelId) {
  const id = modelId.toLowerCase()
  if (id.includes('[1m]')) return 1_000_000
  return CONTEXT_LIMITS.find((entry) => id.includes(entry.pattern))?.limit ?? null
}

/** @param {string} modelId Model identifier. @returns {string} Display name. */
function resolveDisplayName(modelId) {
  const id = modelId.toLowerCase()
  const family = DISPLAY_NAMES.find((entry) => id.includes(entry.pattern))
  if (!family) return modelId
  const version = id.match(new RegExp(`${family.pattern}-(\\d+(?:-\\d+)?)`))?.[1]
  return version ? `${family.name} ${version.replace('-', '.')}` : family.name
}

module.exports = { UsageTracker, encodeProjectDir }
