<script setup lang="ts">
import type { GameStatus } from '../tetris/types'

/** 屏幕操作按钮组件：供鼠标/触屏玩家控制方块 */

defineProps<{ status: GameStatus }>()

const emit = defineEmits<{
  (e: 'move-left'): void
  (e: 'move-right'): void
  (e: 'soft-drop'): void
  (e: 'rotate'): void
  (e: 'hard-drop'): void
  (e: 'toggle-pause'): void
}>()
</script>

<template>
  <div class="controls">
    <div class="controls-row">
      <button class="ctrl-btn" title="左移" @click="emit('move-left')">←</button>
      <button class="ctrl-btn" title="旋转" @click="emit('rotate')">↻</button>
      <button class="ctrl-btn" title="右移" @click="emit('move-right')">→</button>
    </div>
    <div class="controls-row">
      <button class="ctrl-btn" title="软降" @click="emit('soft-drop')">↓</button>
      <button class="ctrl-btn ctrl-btn-wide" title="直落" @click="emit('hard-drop')">⤓ 直落</button>
      <button
        class="ctrl-btn"
        :title="status === 'paused' ? '继续' : '暂停'"
        @click="emit('toggle-pause')"
      >
        {{ status === 'paused' ? '▶' : '⏸' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.controls-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.ctrl-btn {
  flex: 1;
  min-width: 34px;
  padding: 8px 0;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-strong);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1;
}

.ctrl-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ctrl-btn:active {
  transform: translateY(1px);
}

.ctrl-btn-wide {
  font-size: 12px;
}
</style>
