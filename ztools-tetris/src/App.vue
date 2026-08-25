<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from './tetris/useGame'
import GameBoard from './components/GameBoard.vue'
import NextPiece from './components/NextPiece.vue'
import Overlay from './components/Overlay.vue'
import ControlButtons from './components/ControlButtons.vue'

/**
 * 俄罗斯方块插件根组件：编排棋盘、侧栏与覆盖层。
 */
const {
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
  actions
} = useGame()

/** 标题栏展示的最高分：进行中实时取当前分与历史最高分的较大者 */
const displayHighScore = computed(() => Math.max(highScore.value, score.value))

/** preload 桥接可用时才显示“保存战绩截图”按钮 */
const canSaveSnapshot = computed(() => !!(window as any).tetrisServices?.saveSnapshot)
</script>

<template>
  <div class="app">
    <header class="header">
      <h1 class="title">俄罗斯方块</h1>
      <div class="stats">
        <div class="stat">
          <span class="label">分数</span>
          <span class="value">{{ score }}</span>
        </div>
        <div class="stat">
          <span class="label">等级</span>
          <span class="value">{{ level }}</span>
        </div>
        <div class="stat">
          <span class="label">行数</span>
          <span class="value">{{ lines }}</span>
        </div>
        <div class="stat">
          <span class="label">最高分</span>
          <span class="value">{{ displayHighScore }}</span>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="board-area">
        <GameBoard :board="board" :current="current" :ghost-row="ghostRow" :status="status" />
        <Overlay
          v-if="status !== 'playing'"
          :status="status"
          :score="score"
          :high-score="highScore"
          :is-new-record="isNewRecord"
          @start="actions.start"
          @resume="actions.resume"
          @restart="actions.restart"
        />
      </div>

      <aside class="panel">
        <section class="card">
          <h2 class="card-title">下一块</h2>
          <NextPiece :piece="next" />
        </section>

        <section class="card">
          <h2 class="card-title">操作</h2>
          <ControlButtons
            :status="status"
            @move-left="actions.moveLeft"
            @move-right="actions.moveRight"
            @soft-drop="actions.softDrop"
            @rotate="actions.rotate"
            @hard-drop="actions.hardDrop"
            @toggle-pause="actions.togglePause"
          />
        </section>

        <ul class="keys">
          <li>
            <span class="keys-item"><kbd>←</kbd><kbd>→</kbd></span>
            <span>移动</span>
          </li>
          <li>
            <span class="keys-item"><kbd>↑</kbd><span class="slash">/</span><kbd>W</kbd></span>
            <span>旋转</span>
          </li>
          <li>
            <span class="keys-item"><kbd>↓</kbd><span class="slash">/</span><kbd>S</kbd></span>
            <span>软降</span>
          </li>
          <li>
            <span class="keys-item"><kbd>空格</kbd></span>
            <span>直落</span>
          </li>
          <li>
            <span class="keys-item"><kbd>P</kbd></span>
            <span>暂停</span>
          </li>
          <li>
            <span class="keys-item"><kbd>R</kbd></span>
            <span>重新开始</span>
          </li>
        </ul>

        <button v-if="canSaveSnapshot" class="save-btn" @click="actions.saveSnapshot">
          保存战绩截图
        </button>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 16px;
}

.header {
  width: 100%;
  max-width: 520px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.stats {
  display: flex;
  gap: 10px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.stat .label {
  font-size: 10px;
  color: var(--text-tertiary);
}

.stat .value {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.main {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 520px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: center;
}

.board-area {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.panel {
  width: 148px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.card-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.keys {
  margin: 0;
  padding: 8px 12px;
  list-style: none;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
}

.keys li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.keys-item {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.slash {
  color: var(--text-tertiary);
  font-size: 10px;
}

.save-btn {
  padding: 8px 0;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 12px;
}

.save-btn:hover {
  filter: brightness(1.08);
}
</style>
