import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  BASE_DROP_INTERVAL,
  COLS,
  DROP_INTERVAL_DECAY,
  HARD_DROP_SCORE,
  LINE_SCORE,
  LINES_PER_LEVEL,
  MIN_DROP_INTERVAL,
  ROWS,
  SOFT_DROP_SCORE
} from './constants'
import {
  clearFullLines,
  collides,
  createEmptyBoard,
  createPiece,
  ghostY,
  mergePiece,
  randomKind,
  tryMove,
  tryRotate
} from './engine'
import type { Board, GameStatus, PieceState } from './types'

/** 最高分在 ztools.dbStorage / localStorage 中的键 */
const HIGH_SCORE_KEY = 'ztools-tetris:high-score'

/**
 * 读取历史最高分：优先 ztools.dbStorage，浏览器环境兜底 localStorage。
 * @returns 最高分，非法或异常值按 0 处理
 */
function readHighScore(): number {
  try {
    const ztools = (window as any).ztools
    if (ztools?.dbStorage?.getItem) {
      const value = ztools.dbStorage.getItem(HIGH_SCORE_KEY)
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
      return 0
    }
  } catch {
    // 存储读取异常时忽略，按 0 处理
  }
  try {
    return Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * 写入历史最高分。
 * @param score 需要持久化的分数
 */
function writeHighScore(score: number): void {
  try {
    const ztools = (window as any).ztools
    if (ztools?.dbStorage?.setItem) {
      ztools.dbStorage.setItem(HIGH_SCORE_KEY, score)
      return
    }
  } catch {
    // 存储写入异常时忽略，降级 localStorage
  }
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(score))
  } catch {
    // 存储写入异常时忽略
  }
}

/**
 * 俄罗斯方块游戏核心组合式函数：管理棋盘、下落方块、计分、等级与生命周期。
 * @returns 响应式游戏状态与操作集合
 */
export function useGame() {
  /** 当前游戏状态 */
  const status = ref<GameStatus>('ready')
  /** 已落定方块的棋盘 */
  const board = ref<Board>(createEmptyBoard())
  /** 当前正在下落的方块 */
  const current = ref<PieceState | null>(null)
  /** 下一块预览 */
  const next = ref<PieceState | null>(null)
  /** 当前得分 */
  const score = ref(0)
  /** 当前等级 */
  const level = ref(1)
  /** 已消除行数 */
  const lines = ref(0)
  /** 历史最高分 */
  const highScore = ref(readHighScore())
  /** 本局是否刷新最高分纪录 */
  const isNewRecord = ref(false)

  /** requestAnimationFrame 循环句柄 */
  let rafId: number | null = null
  /** 上一帧时间戳 */
  let lastTime = 0
  /** 距上次重力下落累计的时间 */
  let dropCounter = 0
  /** 组件是否已卸载 */
  let disposed = false

  /** 当前等级对应的下落间隔（毫秒） */
  const dropInterval = computed(() =>
    Math.max(MIN_DROP_INTERVAL, BASE_DROP_INTERVAL * Math.pow(DROP_INTERVAL_DECAY, level.value - 1))
  )

  /** 幽灵方块（直落落点提示）所在行号，无下落方块时为 -1 */
  const ghostRow = computed(() =>
    current.value && status.value !== 'over' ? ghostY(board.value, current.value) : -1
  )

  /** 停止主循环 */
  function stopLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  /** 启动主循环 */
  function startLoop(): void {
    stopLoop()
    rafId = requestAnimationFrame(loop)
  }

  /**
   * 结算一局：停止循环、更新最高分并进入结束状态。
   */
  function endGame(): void {
    status.value = 'over'
    stopLoop()
    if (score.value > highScore.value) {
      highScore.value = score.value
      isNewRecord.value = true
      writeHighScore(score.value)
    }
  }

  /**
   * 将当前方块落定到棋盘，消除满行并生成下一块；出界时结算游戏。
   */
  function lockPiece(): void {
    const piece = current.value
    if (!piece) return
    const merged = mergePiece(board.value, piece)
    if (merged.topOut) {
      endGame()
      return
    }
    const cleared = clearFullLines(merged.board)
    board.value = cleared.board
    if (cleared.cleared > 0) {
      lines.value += cleared.cleared
      score.value += LINE_SCORE[cleared.cleared] * level.value
      level.value = Math.floor(lines.value / LINES_PER_LEVEL) + 1
    }
    current.value = next.value
    next.value = createPiece(randomKind())
    if (current.value && collides(board.value, current.value, 0, 0)) {
      endGame()
    }
  }

  /**
   * 重力下落一步；无法下落时落定方块。
   */
  function stepDown(): void {
    if (status.value !== 'playing' || !current.value) return
    const moved = tryMove(board.value, current.value, 0, 1)
    if (moved) {
      current.value = moved
    } else {
      lockPiece()
    }
  }

  /**
   * 开启一局新游戏（同时重置计分与棋盘）。
   */
  function start(): void {
    board.value = createEmptyBoard()
    score.value = 0
    level.value = 1
    lines.value = 0
    isNewRecord.value = false
    current.value = createPiece(randomKind())
    next.value = createPiece(randomKind())
    status.value = 'playing'
    dropCounter = 0
    lastTime = performance.now()
    startLoop()
  }

  /**
   * 重新开始：停止循环后开启新局。
   */
  function restart(): void {
    stopLoop()
    start()
  }

  /**
   * 暂停游戏（仅在进行中有效）。
   */
  function pause(): void {
    if (status.value !== 'playing') return
    status.value = 'paused'
    stopLoop()
  }

  /**
   * 恢复游戏，重置计时避免恢复瞬间掉落。
   */
  function resume(): void {
    if (status.value !== 'paused') return
    status.value = 'playing'
    dropCounter = 0
    lastTime = performance.now()
    startLoop()
  }

  /**
   * 切换暂停与继续。
   */
  function togglePause(): void {
    if (status.value === 'playing') pause()
    else if (status.value === 'paused') resume()
  }

  /**
   * 左移当前方块一格。
   */
  function moveLeft(): void {
    if (status.value !== 'playing' || !current.value) return
    const moved = tryMove(board.value, current.value, -1, 0)
    if (moved) current.value = moved
  }

  /**
   * 右移当前方块一格。
   */
  function moveRight(): void {
    if (status.value !== 'playing' || !current.value) return
    const moved = tryMove(board.value, current.value, 1, 0)
    if (moved) current.value = moved
  }

  /**
   * 软降一格：每格得 1 分；无法下落时立即落定。
   */
  function softDrop(): void {
    if (status.value !== 'playing' || !current.value) return
    const moved = tryMove(board.value, current.value, 0, 1)
    if (moved) {
      current.value = moved
      score.value += SOFT_DROP_SCORE
      dropCounter = 0
    } else {
      lockPiece()
    }
  }

  /**
   * 硬降到底：每格得 2 分后落定。
   */
  function hardDrop(): void {
    if (status.value !== 'playing' || !current.value) return
    let piece = current.value
    let distance = 0
    let moved = tryMove(board.value, piece, 0, 1)
    while (moved) {
      piece = moved
      distance++
      moved = tryMove(board.value, piece, 0, 1)
    }
    current.value = piece
    score.value += distance * HARD_DROP_SCORE
    dropCounter = 0
    lockPiece()
  }

  /**
   * 旋转当前方块（带简易踢墙）。
   */
  function rotate(): void {
    if (status.value !== 'playing' || !current.value) return
    const rotated = tryRotate(board.value, current.value)
    if (rotated) current.value = rotated
  }

  /**
   * 将当前棋盘渲染为 PNG 并保存到下载目录（依赖 preload 桥接）。
   */
  function saveSnapshot(): void {
    const ztools = (window as any).ztools
    const services = (window as any).tetrisServices
    if (!services?.saveSnapshot) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = COLS * 12
      canvas.height = ROWS * 12
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const cell = board.value[y][x]
          if (cell) {
            ctx.fillStyle = cell as string
            ctx.fillRect(x * 12, y * 12, 12, 12)
          }
        }
      }
      const filePath = services.saveSnapshot(canvas.toDataURL('image/png'))
      if (filePath && ztools?.showNotification) {
        ztools.showNotification(`战绩已保存：${filePath}`)
      }
    } catch {
      // 截图失败时静默忽略
    }
  }

  /**
   * requestAnimationFrame 主循环：按等级间隔推进重力下落。
   * @param time 当前帧时间戳
   */
  function loop(time: number): void {
    if (disposed) return
    rafId = requestAnimationFrame(loop)
    if (status.value !== 'playing') {
      lastTime = time
      return
    }
    const dt = time - lastTime
    lastTime = time
    dropCounter += dt
    if (dropCounter >= dropInterval.value) {
      dropCounter = 0
      stepDown()
    }
  }

  /**
   * 处理键盘输入：方向键/WASD 移动与旋转，空格硬降，P/Escape 暂停，R 重开，回车开始。
   * @param event 键盘事件
   */
  function handleKeyDown(event: KeyboardEvent): void {
    // 点击屏幕按钮后按钮会保持焦点，空格/回车会重复触发按钮；先移焦避免误触
    const target = event.target as HTMLElement | null
    if (target && target.tagName === 'BUTTON' && typeof target.blur === 'function') {
      target.blur()
    }
    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        event.preventDefault()
        moveLeft()
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        event.preventDefault()
        moveRight()
        break
      case 'ArrowDown':
      case 's':
      case 'S':
        event.preventDefault()
        softDrop()
        break
      case 'ArrowUp':
      case 'w':
      case 'W':
      case 'x':
      case 'X':
        event.preventDefault()
        rotate()
        break
      case ' ':
        event.preventDefault()
        hardDrop()
        break
      case 'p':
      case 'P':
      case 'Escape':
        event.preventDefault()
        togglePause()
        break
      case 'r':
      case 'R':
        event.preventDefault()
        if (status.value === 'playing' || status.value === 'paused' || status.value === 'over') {
          restart()
        }
        break
      case 'Enter':
        if (status.value === 'ready' || status.value === 'over') {
          event.preventDefault()
          start()
        }
        break
    }
  }

  /**
   * 页面隐藏时自动暂停，避免后台继续下落。
   */
  function handleVisibilityChange(): void {
    if (document.hidden && status.value === 'playing') pause()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const ztools = (window as any).ztools
    if (ztools?.onPluginEnter) {
      // 每次进入插件都开启一局新游戏
      ztools.onPluginEnter(() => {
        restart()
      })
    }
    if (ztools?.onPluginOut) {
      // 退出插件时暂停并保留现场，避免后台继续下落
      ztools.onPluginOut(() => {
        pause()
      })
    }
    if (ztools?.onPluginDetach) {
      // 分离为独立窗口时保持游戏继续运行，无需额外处理
      ztools.onPluginDetach(() => {})
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    stopLoop()
    window.removeEventListener('keydown', handleKeyDown)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    status,
    board,
    current,
    next,
    score,
    level,
    lines,
    highScore,
    isNewRecord,
    ghostRow,
    actions: {
      start,
      restart,
      pause,
      resume,
      togglePause,
      moveLeft,
      moveRight,
      softDrop,
      hardDrop,
      rotate,
      saveSnapshot
    }
  }
}
