<template>
  <main class="snake-app" @pointerdown="focusGame">
    <header class="topbar">
      <div class="brand" aria-label="贪吃蛇">
        <span class="brand-mark" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </span>
        <div>
          <h1>贪吃蛇</h1>
          <p>吃掉果实，别撞上墙壁和自己</p>
        </div>
      </div>

      <div class="scoreboard" aria-label="游戏数据">
        <div class="score-item score-item--accent">
          <span>得分</span>
          <strong data-testid="score">{{ score }}</strong>
        </div>
        <div class="score-item">
          <span>最高</span>
          <strong data-testid="high-score">{{ stats.highScore }}</strong>
        </div>
        <div class="score-item score-item--compact">
          <span>等级</span>
          <strong>{{ level }}</strong>
        </div>
      </div>
    </header>

    <section class="game-layout">
      <div class="board-shell">
        <div
          ref="boardElement"
          class="game-board"
          :class="{ 'game-board--paused': status === 'paused' }"
          role="application"
          aria-label="贪吃蛇游戏区域"
          tabindex="0"
          data-testid="game-board"
          @keydown="handleKeydown"
        >
          <div
            v-for="cell in cells"
            :key="cell.key"
            class="board-cell"
            :class="cell.classes"
            aria-hidden="true"
          >
            <span v-if="cell.isFood" class="food-core"></span>
            <span v-if="cell.isHead" class="snake-eyes"></span>
          </div>

          <Transition name="overlay">
            <div v-if="status !== 'running'" class="game-overlay" data-testid="game-overlay">
              <div v-if="status === 'idle'" class="overlay-card">
                <span class="overlay-icon overlay-icon--play" aria-hidden="true">▶</span>
                <h2>准备好了吗？</h2>
                <p>使用方向键或 WASD 控制移动</p>
                <button class="primary-button" type="button" @click="startGame">开始游戏</button>
              </div>

              <div v-else-if="status === 'paused'" class="overlay-card">
                <span class="overlay-icon" aria-hidden="true">Ⅱ</span>
                <h2>游戏已暂停</h2>
                <p>按空格键或点击按钮继续</p>
                <button class="primary-button" type="button" @click="resumeGame">继续游戏</button>
              </div>

              <div v-else class="overlay-card">
                <span class="overlay-icon overlay-icon--danger" aria-hidden="true">×</span>
                <h2>游戏结束</h2>
                <p>本局得分 <strong>{{ score }}</strong><span v-if="isNewBest"> · 新纪录！</span></p>
                <button class="primary-button" type="button" @click="startGame">再来一局</button>
              </div>
            </div>
          </Transition>
        </div>

        <div class="board-footer">
          <span class="status-pill" :class="`status-pill--${status}`">
            <i aria-hidden="true"></i>{{ statusText }}
          </span>
          <span class="speed-label">速度 {{ speedLabel }}</span>
          <button
            v-if="status === 'running' || status === 'paused'"
            class="text-button"
            type="button"
            @click="togglePause"
          >
            {{ status === 'paused' ? '继续' : '暂停' }}
          </button>
          <button v-else-if="status === 'gameover'" class="text-button" type="button" @click="startGame">
            重新开始
          </button>
        </div>
      </div>

      <aside class="side-panel">
        <section class="panel-card controls-card">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">CONTROLS</span>
              <h2>方向控制</h2>
            </div>
            <span class="keyboard-hint">WASD</span>
          </div>

          <div class="direction-pad" aria-label="方向控制按钮">
            <button class="direction-key direction-key--up" type="button" aria-label="向上" @click="setDirection('up')">↑</button>
            <button class="direction-key direction-key--left" type="button" aria-label="向左" @click="setDirection('left')">←</button>
            <button class="direction-key direction-key--down" type="button" aria-label="向下" @click="setDirection('down')">↓</button>
            <button class="direction-key direction-key--right" type="button" aria-label="向右" @click="setDirection('right')">→</button>
          </div>

          <div class="shortcut-list">
            <div><kbd>Space</kbd><span>暂停 / 继续</span></div>
            <div><kbd>R</kbd><span>重新开始</span></div>
          </div>
        </section>

        <section class="panel-card progress-card">
          <div class="panel-heading panel-heading--compact">
            <div>
              <span class="eyebrow">NEXT LEVEL</span>
              <h2>升级进度</h2>
            </div>
            <strong>{{ levelProgress }}/5</strong>
          </div>
          <div class="progress-track" aria-label="升级进度">
            <span :style="{ width: `${levelProgress * 20}%` }"></span>
          </div>
          <p>再吃 {{ foodsUntilNextLevel }} 个果实提升速度</p>
        </section>

        <section class="panel-card stats-card">
          <div>
            <span class="eyebrow">HISTORY</span>
            <h2>累计游戏</h2>
          </div>
          <strong>{{ stats.gamesPlayed }}</strong>
          <button type="button" class="reset-button" :disabled="stats.gamesPlayed === 0" @click="resetStats">
            清空记录
          </button>
        </section>
      </aside>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const BOARD_COLUMNS = 24
const BOARD_ROWS = 18
const INITIAL_LENGTH = 4
const FOOD_SCORE = 10
const FOODS_PER_LEVEL = 5
const BASE_TICK_MS = 170
const MIN_TICK_MS = 72
const SPEED_STEP_MS = 12

const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
})

const OPPOSITES = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' })
const KEY_DIRECTIONS = Object.freeze({
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
})

const boardElement = ref(null)
const snake = ref(createInitialSnake())
const food = ref(createFood(snake.value))
const direction = ref('right')
const queuedDirection = ref('right')
const score = ref(0)
const status = ref('idle')
const stats = ref({ highScore: 0, gamesPlayed: 0 })
const isNewBest = ref(false)
let tickTimer = null
let hasRecordedGame = false

const level = computed(() => Math.floor(score.value / (FOOD_SCORE * FOODS_PER_LEVEL)) + 1)
const speedMs = computed(() => Math.max(MIN_TICK_MS, BASE_TICK_MS - (level.value - 1) * SPEED_STEP_MS))
const speedLabel = computed(() => `${(BASE_TICK_MS / speedMs.value).toFixed(1)}×`)
const foodsEaten = computed(() => Math.floor(score.value / FOOD_SCORE))
const levelProgress = computed(() => foodsEaten.value % FOODS_PER_LEVEL)
const foodsUntilNextLevel = computed(() => FOODS_PER_LEVEL - levelProgress.value)
const statusText = computed(() => ({ idle: '等待开始', running: '游戏中', paused: '已暂停', gameover: '本局结束' })[status.value])

const cells = computed(() => {
  const snakeIndexes = new Map(snake.value.map((segment, index) => [`${segment.x}:${segment.y}`, index]))
  const result = []

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const key = `${x}:${y}`
      const segmentIndex = snakeIndexes.get(key)
      const isSnake = segmentIndex !== undefined
      const isHead = segmentIndex === 0
      const isTail = segmentIndex === snake.value.length - 1
      const isFood = food.value.x === x && food.value.y === y
      result.push({
        key,
        isFood,
        isHead,
        classes: {
          'board-cell--snake': isSnake,
          'board-cell--head': isHead,
          'board-cell--tail': isTail,
          'board-cell--food': isFood,
        },
      })
    }
  }
  return result
})

/**
 * 创建一条位于棋盘中央的初始蛇。
 * @returns {Array<{x: number, y: number}>} 初始蛇身坐标。
 */
function createInitialSnake() {
  const centerX = Math.floor(BOARD_COLUMNS / 2)
  const centerY = Math.floor(BOARD_ROWS / 2)
  return Array.from({ length: INITIAL_LENGTH }, (_, index) => ({ x: centerX - index, y: centerY }))
}

/**
 * 在未被蛇身占用的格子内随机生成食物。
 * @param {Array<{x: number, y: number}>} occupied 当前蛇身。
 * @returns {{x: number, y: number}} 食物坐标。
 */
function createFood(occupied) {
  const occupiedKeys = new Set(occupied.map((segment) => `${segment.x}:${segment.y}`))
  const available = []
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      if (!occupiedKeys.has(`${x}:${y}`)) available.push({ x, y })
    }
  }
  return available[Math.floor(Math.random() * available.length)] || { x: 0, y: 0 }
}

/**
 * 返回开发浏览器和 ZTools 环境都可用的统计服务。
 * @returns {{getStats: Function, recordGame: Function, resetStats: Function}} 统计服务。
 */
function getStatsService() {
  if (window.snakeGame) return window.snakeGame
  const key = 'snake-game:dev-stats'
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key)) || { highScore: 0, gamesPlayed: 0 }
    } catch {
      return { highScore: 0, gamesPlayed: 0 }
    }
  }
  return {
    getStats: read,
    recordGame(value) {
      const current = read()
      const next = { highScore: Math.max(current.highScore, value), gamesPlayed: current.gamesPlayed + 1 }
      localStorage.setItem(key, JSON.stringify(next))
      return next
    },
    resetStats() {
      const next = { highScore: 0, gamesPlayed: 0 }
      localStorage.setItem(key, JSON.stringify(next))
      return next
    },
  }
}

/**
 * 将焦点放回游戏棋盘，确保键盘控制可用。
 * @returns {void}
 */
function focusGame() {
  boardElement.value?.focus({ preventScroll: true })
}

/**
 * 启动全新一局游戏。
 * @returns {void}
 */
function startGame() {
  clearTick()
  snake.value = createInitialSnake()
  food.value = createFood(snake.value)
  direction.value = 'right'
  queuedDirection.value = 'right'
  score.value = 0
  isNewBest.value = false
  hasRecordedGame = false
  status.value = 'running'
  void nextTick(focusGame)
  scheduleTick()
}

/**
 * 恢复已暂停的游戏。
 * @returns {void}
 */
function resumeGame() {
  if (status.value !== 'paused') return
  status.value = 'running'
  focusGame()
  scheduleTick()
}

/**
 * 切换暂停状态。
 * @returns {void}
 */
function togglePause() {
  if (status.value === 'running') {
    status.value = 'paused'
    clearTick()
    return
  }
  resumeGame()
}

/**
 * 接收键盘方向并阻止蛇直接反向。
 * @param {'up'|'down'|'left'|'right'} nextDirection 目标方向。
 * @returns {void}
 */
function setDirection(nextDirection) {
  if (!DIRECTIONS[nextDirection]) return
  if (status.value === 'idle' || status.value === 'gameover') startGame()
  if (OPPOSITES[direction.value] === nextDirection) return
  queuedDirection.value = nextDirection
  focusGame()
}

/**
 * 处理棋盘上的游戏快捷键。
 * @param {KeyboardEvent} event 键盘事件。
 * @returns {void}
 */
function handleKeydown(event) {
  const nextDirection = KEY_DIRECTIONS[event.key]
  if (nextDirection) {
    event.preventDefault()
    setDirection(nextDirection)
    return
  }
  if (event.code === 'Space') {
    event.preventDefault()
    if (status.value === 'idle' || status.value === 'gameover') startGame()
    else togglePause()
    return
  }
  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault()
    startGame()
  }
}

/**
 * 调度下一次蛇身移动。
 * @returns {void}
 */
function scheduleTick() {
  clearTick()
  if (status.value !== 'running') return
  tickTimer = window.setTimeout(runTick, speedMs.value)
}

/**
 * 清理尚未执行的移动计时器。
 * @returns {void}
 */
function clearTick() {
  if (tickTimer === null) return
  window.clearTimeout(tickTimer)
  tickTimer = null
}

/**
 * 执行一次移动、进食和碰撞判断。
 * @returns {void}
 */
function runTick() {
  if (status.value !== 'running') return
  direction.value = queuedDirection.value
  const vector = DIRECTIONS[direction.value]
  const currentHead = snake.value[0]
  const nextHead = { x: currentHead.x + vector.x, y: currentHead.y + vector.y }
  const ateFood = nextHead.x === food.value.x && nextHead.y === food.value.y
  const collisionBody = ateFood ? snake.value : snake.value.slice(0, -1)
  const hitWall = nextHead.x < 0 || nextHead.x >= BOARD_COLUMNS || nextHead.y < 0 || nextHead.y >= BOARD_ROWS
  const hitSelf = collisionBody.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)

  if (hitWall || hitSelf) {
    finishGame()
    return
  }

  const nextSnake = [nextHead, ...snake.value]
  if (ateFood) {
    score.value += FOOD_SCORE
    food.value = createFood(nextSnake)
  } else {
    nextSnake.pop()
  }
  snake.value = nextSnake
  scheduleTick()
}

/**
 * 结束本局并持久化统计，防止重复记录。
 * @returns {void}
 */
function finishGame() {
  clearTick()
  status.value = 'gameover'
  if (hasRecordedGame) return
  hasRecordedGame = true
  const previousBest = stats.value.highScore
  stats.value = getStatsService().recordGame(score.value)
  isNewBest.value = score.value > previousBest && score.value === stats.value.highScore
}

/**
 * 清空历史统计但不影响当前棋局。
 * @returns {void}
 */
function resetStats() {
  stats.value = getStatsService().resetStats()
  isNewBest.value = false
  focusGame()
}

/**
 * 在插件离开时暂停游戏，避免后台持续运行。
 * @returns {void}
 */
function handlePluginOut() {
  if (status.value === 'running') {
    status.value = 'paused'
    clearTick()
  }
}

/**
 * 在插件重复进入时恢复焦点，不隐式重置当前棋局。
 * @returns {void}
 */
function handlePluginEnter() {
  void nextTick(focusGame)
}

onMounted(() => {
  stats.value = getStatsService().getStats()
  window.addEventListener('snake-game-enter', handlePluginEnter)
  window.addEventListener('snake-game-out', handlePluginOut)
  void nextTick(focusGame)
})

onBeforeUnmount(() => {
  clearTick()
  window.removeEventListener('snake-game-enter', handlePluginEnter)
  window.removeEventListener('snake-game-out', handlePluginOut)
})
</script>
