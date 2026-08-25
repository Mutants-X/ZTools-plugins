<script setup lang="ts">
import type { GameStatus } from '../tetris/types'

/** 覆盖层组件：开始、暂停与结束三个状态的面板 */

defineProps<{
  status: GameStatus
  score: number
  highScore: number
  isNewRecord: boolean
}>()

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'resume'): void
  (e: 'restart'): void
}>()
</script>

<template>
  <div class="overlay">
    <div v-if="status === 'ready'" class="overlay-card">
      <h2 class="overlay-title">俄罗斯方块</h2>
      <p class="overlay-sub">消除满行得分，等级越高下落越快</p>
      <button class="primary-btn" @click="emit('start')">开始游戏</button>
    </div>

    <div v-else-if="status === 'paused'" class="overlay-card">
      <h2 class="overlay-title">已暂停</h2>
      <div class="btn-row">
        <button class="primary-btn" @click="emit('resume')">继续</button>
        <button class="ghost-btn" @click="emit('restart')">重新开始</button>
      </div>
    </div>

    <div v-else-if="status === 'over'" class="overlay-card">
      <h2 class="overlay-title">游戏结束</h2>
      <p v-if="isNewRecord" class="record-tip">🎉 新纪录！</p>
      <div class="overlay-stats">
        <div class="overlay-stat">
          <span>最终得分</span>
          <strong>{{ score }}</strong>
        </div>
        <div class="overlay-stat">
          <span>最高分</span>
          <strong>{{ highScore }}</strong>
        </div>
      </div>
      <button class="primary-btn" @click="emit('restart')">再来一局</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-bg);
  backdrop-filter: blur(3px);
  border-radius: var(--radius);
  z-index: 10;
}

.overlay-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 22px 28px;
  border-radius: var(--radius);
  background: var(--bg-surface-strong);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow);
  text-align: center;
}

.overlay-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.overlay-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.record-tip {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

.overlay-stats {
  display: flex;
  gap: 20px;
}

.overlay-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.overlay-stat span {
  font-size: 11px;
  color: var(--text-tertiary);
}

.overlay-stat strong {
  font-family: var(--mono);
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}

.btn-row {
  display: flex;
  gap: 10px;
}

.primary-btn {
  padding: 9px 26px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.primary-btn:hover {
  filter: brightness(1.08);
}

.primary-btn:active {
  transform: translateY(1px);
}

.ghost-btn {
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 14px;
}

.ghost-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
