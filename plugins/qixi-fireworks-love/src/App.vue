<template>
  <main class="love-app" :class="{ 'love-app--quiet': isPaused }" @pointerdown="handleStagePointer">
    <canvas ref="canvasElement" class="fireworks-canvas" aria-hidden="true"></canvas>

    <div class="sky" aria-hidden="true">
      <span v-for="star in stars" :key="star.id" class="star" :style="star.style"></span>
      <span class="shooting-star shooting-star--one"></span>
      <span class="shooting-star shooting-star--two"></span>
      <span class="moon"><i></i></span>
      <span class="cloud cloud--one"></span>
      <span class="cloud cloud--two"></span>
    </div>

    <header class="topbar">
      <div class="brand">
        <span class="brand-seal" aria-hidden="true">愿</span>
        <div>
          <strong>七夕星愿</strong>
          <span>QIXI · LOVE UNDER THE STARS</span>
        </div>
      </div>

      <nav class="top-actions" aria-label="场景控制">
        <button class="icon-button" type="button" :aria-label="musicEnabled ? '关闭音乐' : '开启音乐'" @click.stop="toggleMusic">
          <svg v-if="musicEnabled" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 18V5l10-2v13M9 9l10-2M6 21c1.7 0 3-1.1 3-2.5S7.7 16 6 16s-3 1.1-3 2.5S4.3 21 6 21Zm10-2c1.7 0 3-1.1 3-2.5S17.7 14 16 14s-3 1.1-3 2.5 1.3 2.5 3 2.5Z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 18V5l10-2v13M9 9l10-2M6 21c1.7 0 3-1.1 3-2.5S7.7 16 6 16s-3 1.1-3 2.5S4.3 21 6 21Zm10-2c1.7 0 3-1.1 3-2.5S17.7 14 16 14s-3 1.1-3 2.5 1.3 2.5 3 2.5Z" />
            <path class="slash" d="m3 3 18 18" />
          </svg>
        </button>
        <button class="icon-button" type="button" aria-label="编辑告白" @click.stop="openEditor">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m4 16-.7 4.7L8 20l11-11-4-4L4 16Zm9.5-9.5 4 4M12 20h9" />
          </svg>
        </button>
      </nav>
    </header>

    <section class="story" aria-live="polite">
      <div class="ornament ornament--top" aria-hidden="true"><i></i><span>✦</span><i></i></div>
      <p class="festival-kicker">岁岁七夕 · 今夕有你</p>
      <h1>
        <span class="small-line">TO MY ONLY LOVE</span>
        <span class="name">{{ config.recipient }}</span>
      </h1>
      <p class="love-letter">{{ config.message }}</p>
      <div class="forever-line">
        <span aria-hidden="true">♡</span>
        <strong>愿有岁月可回首，且以深情共白头</strong>
        <span aria-hidden="true">♡</span>
      </div>
      <div class="ornament ornament--bottom" aria-hidden="true"><i></i><span>七夕快乐</span><i></i></div>
    </section>

    <section class="bridge-scene" aria-hidden="true">
      <div class="magpie magpie--left"><i></i></div>
      <div class="magpie magpie--right"><i></i></div>
      <div class="bridge">
        <span
          v-for="index in 19"
          :key="index"
          :style="{ '--index': index, '--distance': Math.abs(10 - index) }"
        ></span>
      </div>
      <div class="river"></div>
      <div class="river-shine river-shine--one"></div>
      <div class="river-shine river-shine--two"></div>
      <div class="mountain mountain--back"></div>
      <div class="mountain mountain--front"></div>
    </section>

    <footer class="scene-footer">
      <button class="wish-button" type="button" @click.stop="replayCeremony">
        <span class="button-spark" aria-hidden="true">✦</span>
        为你再放一次烟花
        <span aria-hidden="true">♡</span>
      </button>
      <p>点击夜空，也能把心愿变成烟花</p>
    </footer>

    <Transition name="dialog">
      <div v-if="editorOpen" class="dialog-backdrop" @pointerdown.stop.self="closeEditor">
        <section class="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-title">
          <button class="close-button" type="button" aria-label="关闭" @click="closeEditor">×</button>
          <span class="editor-eyebrow">CUSTOMIZE YOUR LOVE</span>
          <h2 id="editor-title">把心里的话写进星河</h2>
          <p>文字只保存在本机 ZTools 中，下一次打开仍会为她绽放。</p>

          <label>
            <span>她的名字</span>
            <input v-model="draft.recipient" maxlength="20" placeholder="尹向前" />
          </label>
          <label>
            <span>想对她说</span>
            <textarea v-model="draft.message" maxlength="180" rows="5"></textarea>
            <small>{{ draft.message.length }} / 180</small>
          </label>

          <div class="editor-actions">
            <button class="secondary-button" type="button" @click="restoreDefaults">恢复这封情书</button>
            <button class="primary-button" type="button" @click="saveEditor">保存并绽放</button>
          </div>
        </section>
      </div>
    </Transition>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const DEFAULT_CONFIG = Object.freeze({
  recipient: '尹向前',
  message: '尹向前，山河远阔，人间烟火，\n无一是你，无一不是你。\n往后的每一个七夕，我都想陪你一起看。',
})
const FIREWORK_COLORS = ['#ff6f91', '#ffb2c7', '#ffd67d', '#f7a6ff', '#8bdfff', '#fff4cf']
const MAX_PARTICLES = 140
const MAX_FIREWORKS = 1
const FRAME_INTERVAL = 33
const canvasElement = ref(null)
const editorOpen = ref(false)
const musicEnabled = ref(false)
const isPaused = ref(false)
const config = reactive({ ...DEFAULT_CONFIG })
const draft = reactive({ ...DEFAULT_CONFIG })
const stars = computed(() => Array.from({ length: 34 }, (_, index) => ({
  id: index,
  style: {
    left: `${(index * 47 + 11) % 99}%`,
    top: `${(index * 67 + 7) % 72}%`,
    '--size': `${1 + (index % 4) * 0.55}px`,
    '--delay': `${(index % 13) * -0.37}s`,
    '--duration': `${2.1 + (index % 7) * 0.34}s`,
  },
})))

let canvasContext = null
let animationFrame = 0
let resizeObserver = null
let ceremonyTimers = []
let audioContext = null
let melodyTimer = 0
let melodyIndex = 0
let fireworks = []
let particles = []
let shockwaves = []
let flashes = []
let canvasHasDrawing = false
let lastFrameTime = 0

/**
 * 获取 preload 提供的持久化服务，并为普通浏览器开发模式提供回退实现。
 * @returns {{getConfig: Function, saveConfig: Function}} 配置服务。
 */
function getLoveService() {
  return window.qixiLove || {
    getConfig: () => ({ ...DEFAULT_CONFIG }),
    saveConfig: (value) => ({ ...value }),
  }
}

/**
 * 将服务返回的设置应用到当前页面。
 * @param {{recipient?: unknown, message?: unknown}} value 设置对象。
 * @returns {void}
 */
function applyConfig(value = {}) {
  config.recipient = typeof value.recipient === 'string' && value.recipient.trim()
    ? value.recipient.trim().slice(0, 20)
    : DEFAULT_CONFIG.recipient
  config.message = typeof value.message === 'string' && value.message.trim()
    ? value.message.trim().slice(0, 180)
    : DEFAULT_CONFIG.message
}

/**
 * 打开告白编辑器并复制当前内容。
 * @returns {void}
 */
function openEditor() {
  draft.recipient = config.recipient
  draft.message = config.message
  editorOpen.value = true
  void nextTick(() => document.querySelector('.editor-card input')?.focus())
}

/**
 * 关闭告白编辑器。
 * @returns {void}
 */
function closeEditor() {
  editorOpen.value = false
}

/**
 * 把编辑草稿恢复为为尹向前准备的默认情书。
 * @returns {void}
 */
function restoreDefaults() {
  draft.recipient = DEFAULT_CONFIG.recipient
  draft.message = DEFAULT_CONFIG.message
}

/**
 * 保存告白内容并播放一轮心形烟花。
 * @returns {void}
 */
function saveEditor() {
  const saved = getLoveService().saveConfig({ ...draft })
  applyConfig(saved)
  editorOpen.value = false
  replayCeremony()
}

/**
 * 按画布显示尺寸和设备像素比同步绘图缓冲区。
 * @returns {void}
 */
function resizeCanvas() {
  const canvas = canvasElement.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  // 粒子背景不需要 Retina 全分辨率，限制到 1 倍能显著降低 Electron GPU 压力。
  const ratio = 1
  canvas.width = Math.max(1, Math.round(rect.width * ratio))
  canvas.height = Math.max(1, Math.round(rect.height * ratio))
  canvasContext = canvas.getContext('2d')
  canvasContext.setTransform(ratio, 0, 0, ratio, 0, 0)
}

/**
 * 创建一枚向目标位置飞行的烟花。
 * @param {number} targetX 目标横坐标。
 * @param {number} targetY 目标纵坐标。
 * @param {'round'|'heart'} shape 爆炸形状。
 * @param {string | null} preferredColor 指定颜色。
 * @param {number} size 爆炸尺寸倍率。
 * @returns {void}
 */
function launchFirework(targetX, targetY, shape = 'round', preferredColor = null, size = 1) {
  const canvas = canvasElement.value
  if (!canvas || isPaused.value || fireworks.length >= MAX_FIREWORKS || particles.length > MAX_PARTICLES * 0.7) return
  canvasHasDrawing = true
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const startX = width * (0.38 + Math.random() * 0.24)
  const startY = height + 12
  const distance = Math.hypot(targetX - startX, targetY - startY)
  const duration = Math.max(38, distance / 12)
  fireworks.push({
    x: startX,
    y: startY,
    previousX: startX,
    previousY: startY,
    targetX,
    targetY,
    step: 0,
    duration,
    shape,
    size: Math.max(0.7, Math.min(1.8, size)),
    color: preferredColor || FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
    sparks: [],
  })
}

/**
 * 向画布粒子队列加入一颗具有短拖尾和发光核心的粒子。
 * @param {number} x 起始横坐标。
 * @param {number} y 起始纵坐标。
 * @param {number} velocityX 水平速度。
 * @param {number} velocityY 垂直速度。
 * @param {string} color 粒子颜色。
 * @param {Record<string, number | string | boolean>} options 粒子外观和物理参数。
 * @returns {void}
 */
function addParticle(x, y, velocityX, velocityY, color, options = {}) {
  if (particles.length >= MAX_PARTICLES) return
  particles.push({
    x,
    y,
    previousX: x,
    previousY: y,
    velocityX,
    velocityY,
    alpha: Number(options.alpha ?? 1),
    decay: Number(options.decay ?? 0.014),
    gravity: Number(options.gravity ?? 0.025),
    drag: Number(options.drag ?? 0.985),
    color,
    width: Number(options.width ?? 1.8),
    radius: Number(options.radius ?? 1.6),
    glow: Number(options.glow ?? 8),
    twinkle: Boolean(options.twinkle),
    trail: options.trail !== false,
  })
}

/**
 * 创建轮廓清晰、内部闪烁并伴随向外喷射的爱心粒子爆炸。
 * @param {{targetX: number, targetY: number, color: string, size: number}} firework 烟花数据。
 * @returns {void}
 */
function createHeartExplosion(firework) {
  const { targetX, targetY, color, size } = firework
  const outlineCount = Math.round(62 * size)
  const fillCount = Math.round(18 * size)
  const sprayCount = Math.round(20 * size)
  const accentColors = [color, '#ffb2c7', '#fff4f7', '#ffd67d']

  // 高密度轮廓粒子严格沿心形参数方程运动，爆开后仍能保持完整爱心轮廓。
  for (let index = 0; index < outlineCount; index += 1) {
    const angle = (Math.PI * 2 * index) / outlineCount
    const heartX = 16 * Math.sin(angle) ** 3
    const heartY = -(13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle))
    const jitter = 0.96 + Math.random() * 0.08
    const speed = 0.175 * size * jitter
    addParticle(targetX, targetY, heartX * speed, heartY * speed, accentColors[index % accentColors.length], {
      decay: 0.0055 + Math.random() * 0.003,
      gravity: 0.004,
      drag: 0.991,
      width: 2.2 + Math.random() * 1.3,
      radius: 1.7 + Math.random() * 1.6,
      glow: 13,
      twinkle: index % 3 === 0,
    })
  }

  // 内部粒子使用不同半径填充，让爱心不是只有一圈线条。
  for (let index = 0; index < fillCount; index += 1) {
    const angle = Math.random() * Math.PI * 2
    const heartX = 16 * Math.sin(angle) ** 3
    const heartY = -(13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle))
    const fillScale = 0.035 + Math.sqrt(Math.random()) * 0.125
    addParticle(targetX, targetY, heartX * fillScale * size, heartY * fillScale * size, index % 4 === 0 ? '#fff4f7' : color, {
      decay: 0.009 + Math.random() * 0.006,
      gravity: 0.009,
      drag: 0.987,
      width: 1.5,
      radius: 1.4 + Math.random() * 1.8,
      glow: 11,
      twinkle: true,
      trail: false,
    })
  }

  // 外层高速碎星制造真正“炸开”的冲击感，并与稳定爱心轮廓形成层次。
  for (let index = 0; index < sprayCount; index += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = (2.8 + Math.random() * 5.8) * size
    addParticle(targetX, targetY, Math.cos(angle) * speed, Math.sin(angle) * speed, accentColors[index % accentColors.length], {
      decay: 0.017 + Math.random() * 0.014,
      gravity: 0.055,
      drag: 0.972,
      width: 1.2 + Math.random() * 1.9,
      radius: 1 + Math.random() * 1.7,
      glow: 9,
    })
  }

  flashes.push({ x: targetX, y: targetY, radius: 8, alpha: 1, color })
  shockwaves.push({ x: targetX, y: targetY, radius: 8, alpha: 0.9, speed: 3.7 * size, color })
}

/**
 * 创建带中心闪光和冲击波的普通圆形烟花。
 * @param {{targetX: number, targetY: number, color: string, size: number}} firework 烟花数据。
 * @returns {void}
 */
function createRoundExplosion(firework) {
  const count = Math.round((30 + Math.random() * 12) * firework.size)
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = (1.8 + Math.random() * 4.8) * firework.size
    addParticle(
      firework.targetX,
      firework.targetY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      index % 7 === 0 ? '#fff8e7' : firework.color,
      {
        decay: 0.012 + Math.random() * 0.012,
        gravity: 0.048,
        drag: 0.98,
        width: 1.4 + Math.random() * 1.8,
        radius: 1.1 + Math.random() * 1.5,
        glow: 9,
        twinkle: index % 5 === 0,
      },
    )
  }
  flashes.push({ x: firework.targetX, y: firework.targetY, radius: 6, alpha: 0.8, color: firework.color })
  shockwaves.push({ x: firework.targetX, y: firework.targetY, radius: 5, alpha: 0.55, speed: 2.8, color: firework.color })
}

/**
 * 将到达目标的烟花拆分成多层带衰减的粒子。
 * @param {{targetX: number, targetY: number, color: string, shape: string, size: number}} firework 烟花数据。
 * @returns {void}
 */
function explodeFirework(firework) {
  if (firework.shape === 'heart') createHeartExplosion(firework)
  else createRoundExplosion(firework)
}

/**
 * 更新并绘制当前所有烟花和粒子。
 * @param {number} timestamp 浏览器动画时间戳。
 * @returns {void}
 */
function renderFrame(timestamp) {
  animationFrame = window.requestAnimationFrame(renderFrame)
  if (!canvasContext || isPaused.value || document.hidden) return
  if (!canvasHasDrawing && fireworks.length === 0 && particles.length === 0) return
  const canvas = canvasElement.value
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const elapsed = timestamp - lastFrameTime
  if (elapsed < FRAME_INTERVAL) return
  const deltaScale = Math.min(2, Math.max(0.5, elapsed / 16.67 || 1))
  lastFrameTime = timestamp

  canvasContext.globalCompositeOperation = 'source-over'
  canvasContext.fillStyle = 'rgba(8, 3, 22, 0.18)'
  canvasContext.fillRect(0, 0, width, height)
  canvasContext.globalCompositeOperation = 'lighter'

  fireworks = fireworks.filter((firework) => {
    firework.previousX = firework.x
    firework.previousY = firework.y
    firework.step += deltaScale
    const progress = Math.min(1, firework.step / firework.duration)
    const eased = 1 - (1 - progress) ** 3
    firework.x += (firework.targetX - firework.x) * Math.min(1, 0.075 * deltaScale + eased * 0.02)
    firework.y += (firework.targetY - firework.y) * Math.min(1, 0.075 * deltaScale + eased * 0.02)

    // 升空阶段持续掉落金粉，避免烟花只是一条突兀的直线。
    if (Math.floor(firework.step) % 2 === 0) {
      addParticle(
        firework.x,
        firework.y + 4,
        (Math.random() - 0.5) * 0.8,
        1.2 + Math.random() * 1.4,
        Math.random() > 0.45 ? firework.color : '#fff4cf',
        {
          decay: 0.032 + Math.random() * 0.018,
          gravity: 0.018,
          drag: 0.965,
          width: 1.2,
          radius: 1.1 + Math.random(),
          glow: 8,
          twinkle: true,
          trail: false,
        },
      )
    }

    canvasContext.save()
    canvasContext.beginPath()
    canvasContext.moveTo(firework.previousX, firework.previousY)
    canvasContext.lineTo(firework.x, firework.y)
    canvasContext.strokeStyle = firework.color
    canvasContext.lineWidth = firework.shape === 'heart' ? 3.2 : 2.4
    canvasContext.stroke()
    canvasContext.beginPath()
    canvasContext.arc(firework.x, firework.y, firework.shape === 'heart' ? 3.8 : 3, 0, Math.PI * 2)
    canvasContext.fillStyle = '#fffaf1'
    canvasContext.fill()
    canvasContext.restore()

    if (progress >= 1 || Math.hypot(firework.targetX - firework.x, firework.targetY - firework.y) < 8) {
      explodeFirework(firework)
      return false
    }
    return true
  })

  flashes = flashes.filter((flash) => {
    flash.radius += 5.5 * deltaScale
    flash.alpha -= 0.055 * deltaScale
    if (flash.alpha <= 0) return false
    const gradient = canvasContext.createRadialGradient(
      flash.x,
      flash.y,
      0,
      flash.x,
      flash.y,
      flash.radius,
    )
    gradient.addColorStop(0, `rgba(255,255,255,${flash.alpha})`)
    gradient.addColorStop(0.22, flash.color)
    gradient.addColorStop(1, 'rgba(255,111,145,0)')
    canvasContext.globalAlpha = Math.max(0, flash.alpha)
    canvasContext.fillStyle = gradient
    canvasContext.beginPath()
    canvasContext.arc(flash.x, flash.y, flash.radius, 0, Math.PI * 2)
    canvasContext.fill()
    return true
  })

  shockwaves = shockwaves.filter((wave) => {
    wave.radius += wave.speed * deltaScale
    wave.alpha -= 0.012 * deltaScale
    if (wave.alpha <= 0) return false
    canvasContext.globalAlpha = Math.max(0, wave.alpha)
    canvasContext.strokeStyle = wave.color
    canvasContext.lineWidth = Math.max(0.8, 2.6 * wave.alpha)
    canvasContext.beginPath()
    canvasContext.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2)
    canvasContext.stroke()
    return true
  })

  particles = particles.filter((particle) => {
    particle.previousX = particle.x
    particle.previousY = particle.y
    particle.velocityX *= particle.drag ** deltaScale
    particle.velocityY = particle.velocityY * (particle.drag ** deltaScale) + particle.gravity * deltaScale
    particle.x += particle.velocityX * deltaScale
    particle.y += particle.velocityY * deltaScale
    particle.alpha -= particle.decay * deltaScale
    if (particle.alpha <= 0) return false

    const flicker = particle.twinkle ? 0.55 + Math.random() * 0.65 : 1
    canvasContext.globalAlpha = Math.max(0, particle.alpha * flicker)
    // 不对每颗粒子设置 shadowBlur；大量阴影是 Electron Canvas 卡顿的主要来源。
    if (particle.trail) {
      canvasContext.beginPath()
      canvasContext.moveTo(particle.previousX, particle.previousY)
      canvasContext.lineTo(particle.x, particle.y)
      canvasContext.strokeStyle = particle.color
      canvasContext.lineWidth = particle.width
      canvasContext.stroke()
    }
    canvasContext.beginPath()
    canvasContext.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    canvasContext.fillStyle = particle.color
    canvasContext.fill()
    return true
  })
  canvasContext.globalAlpha = 1
  canvasContext.shadowBlur = 0
  if (fireworks.length === 0 && particles.length === 0 && flashes.length === 0 && shockwaves.length === 0) {
    canvasContext.clearRect(0, 0, width, height)
    canvasHasDrawing = false
  }
}

/**
 * 清理尚未执行的庆典定时任务。
 * @returns {void}
 */
function clearCeremonyTimers() {
  ceremonyTimers.forEach((timer) => window.clearTimeout(timer))
  ceremonyTimers = []
}

/**
 * 播放由多枚烟花组成的七夕告白庆典。
 * @returns {void}
 */
function replayCeremony() {
  const canvas = canvasElement.value
  if (!canvas) return
  isPaused.value = false
  clearCeremonyTimers()
  fireworks = []
  particles = []
  shockwaves = []
  flashes = []
  canvasContext?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  canvasHasDrawing = false
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const plan = [
    [0, width * 0.5, height * 0.27, 'heart', '#ff5f91', 1.35],

  ]
  plan.forEach(([delay, x, y, shape, color, size]) => {
    ceremonyTimers.push(window.setTimeout(() => launchFirework(x, y, shape, color, size), delay))
  })
}

/**
 * 在用户点击天空时发射一枚对应位置的烟花。
 * @param {PointerEvent} event 指针事件。
 * @returns {void}
 */
function handleStagePointer(event) {
  if (editorOpen.value || event.target.closest('button, input, textarea, .editor-card')) return
  const canvas = canvasElement.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  launchFirework(
    event.clientX - rect.left,
    event.clientY - rect.top,
    Math.random() > 0.48 ? 'heart' : 'round',
    null,
    Math.random() > 0.7 ? 1.28 : 0.92,
  )
}

/**
 * 播放一颗轻柔的五声音阶音符。
 * @param {number} frequency 音符频率。
 * @param {number} startTime Web Audio 开始时间。
 * @returns {void}
 */
function playTone(frequency, startTime) {
  if (!audioContext) return
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, startTime)
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(0.055, startTime + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.7)
  oscillator.connect(gain).connect(audioContext.destination)
  oscillator.start(startTime)
  oscillator.stop(startTime + 1.8)
}

/**
 * 启动循环的程序化星河旋律。
 * @returns {Promise<void>} 音频上下文准备完成后结束。
 */
async function startMusic() {
  audioContext ||= new AudioContext()
  await audioContext.resume()
  const melody = [392, 440, 523.25, 659.25, 523.25, 440, 349.23, 392, 523.25, 587.33, 659.25, 783.99]
  const playNext = () => {
    if (!musicEnabled.value || !audioContext) return
    playTone(melody[melodyIndex % melody.length], audioContext.currentTime + 0.02)
    melodyIndex += 1
    melodyTimer = window.setTimeout(playNext, 820)
  }
  playNext()
}

/**
 * 停止背景旋律的后续音符。
 * @returns {void}
 */
function stopMusic() {
  window.clearTimeout(melodyTimer)
  melodyTimer = 0
}

/**
 * 根据当前状态开启或关闭背景旋律。
 * @returns {void}
 */
function toggleMusic() {
  musicEnabled.value = !musicEnabled.value
  if (musicEnabled.value) void startMusic()
  else stopMusic()
}

/**
 * 响应插件重复进入并重放开场。
 * @returns {void}
 */
function handlePluginEnter() {
  isPaused.value = false
  lastFrameTime = performance.now()
  replayCeremony()
}

/**
 * 响应插件退出并暂停后台活动。
 * @returns {void}
 */
function handlePluginOut() {
  isPaused.value = true
  stopMusic()
  musicEnabled.value = false
  clearCeremonyTimers()
}

onMounted(() => {
  applyConfig(getLoveService().getConfig())
  resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(canvasElement.value)
  resizeCanvas()
  lastFrameTime = performance.now()
  animationFrame = window.requestAnimationFrame(renderFrame)
  window.addEventListener('qixi-love-enter', handlePluginEnter)
  window.addEventListener('qixi-love-out', handlePluginOut)
  replayCeremony()
})

onBeforeUnmount(() => {
  isPaused.value = true
  window.cancelAnimationFrame(animationFrame)
  clearCeremonyTimers()
  stopMusic()
  resizeObserver?.disconnect()
  window.removeEventListener('qixi-love-enter', handlePluginEnter)
  window.removeEventListener('qixi-love-out', handlePluginOut)
  if (audioContext) void audioContext.close()
})
</script>
