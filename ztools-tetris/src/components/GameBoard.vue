<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { COLS, ROWS } from '../tetris/constants'
import type { Board, GameStatus, PieceState } from '../tetris/types'

/**
 * 棋盘可视化组件：合成棋盘、幽灵落点与当前方块为网格单元渲染。
 */

/** 单个网格单元的渲染信息 */
interface RenderCell {
  /** 填充色；空单元为空字符串 */
  fill: string
  /** 幽灵方块的描边色 */
  border?: string
}

const props = defineProps<{
  board: Board
  current: PieceState | null
  ghostRow: number
  status: GameStatus
}>()

/** 棋盘外层容器引用，用于自适应尺寸计算 */
const wrapEl = ref<HTMLDivElement | null>(null)
/** 当前计算出的方块边长（像素） */
const blockSize = ref(26)
/** 方块边长下限 */
const BLOCK_MIN = 16
/** 方块边长上限 */
const BLOCK_MAX = 34

/**
 * 合成棋盘 + 幽灵落点 + 当前方块的可视化网格（按行优先展开为一维数组）。
 */
const cells = computed<RenderCell[]>(() => {
  const result: RenderCell[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const value = props.board[y][x]
      result.push(value ? { fill: value as string } : { fill: '' })
    }
  }
  // 幽灵落点：仅在进行中显示，填充半透明色并带描边
  if (props.current && props.status === 'playing' && props.ghostRow >= 0) {
    const piece = props.current
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (!piece.shape[y][x]) continue
        const idx = (props.ghostRow + y) * COLS + (piece.x + x)
        if (idx >= 0 && idx < result.length && !result[idx].fill) {
          result[idx] = { fill: piece.color + '33', border: piece.color }
        }
      }
    }
  }
  // 当前方块：覆盖在幽灵之上
  if (props.current) {
    const piece = props.current
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (!piece.shape[y][x]) continue
        const idx = (piece.y + y) * COLS + (piece.x + x)
        if (idx >= 0 && idx < result.length) {
          result[idx] = { fill: piece.color }
        }
      }
    }
  }
  return result
})

/**
 * 根据外层容器可用空间自适应方块尺寸。
 */
function updateBlockSize(): void {
  if (!wrapEl.value) return
  const rect = wrapEl.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const size = Math.floor(Math.min(rect.width / COLS, rect.height / ROWS))
  blockSize.value = Math.min(BLOCK_MAX, Math.max(BLOCK_MIN, size))
}

/** 尺寸监听器 */
let observer: ResizeObserver | null = null

onMounted(() => {
  updateBlockSize()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(updateBlockSize)
    if (wrapEl.value) observer.observe(wrapEl.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="wrapEl" class="board-wrap">
    <div class="game-board" :style="{ '--block': blockSize + 'px' }">
      <div
        v-for="(cell, index) in cells"
        :key="index"
        class="cell"
        :class="{ filled: !!cell.fill, ghost: !!cell.border }"
        :style="
          cell.fill
            ? {
                backgroundColor: cell.fill,
                boxShadow: cell.border ? 'inset 0 0 0 1.5px ' + cell.border : undefined
              }
            : undefined
        "
      ></div>
    </div>
  </div>
</template>

<style scoped>
.board-wrap {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.game-board {
  display: grid;
  grid-template-columns: repeat(10, var(--block, 26px));
  grid-template-rows: repeat(20, var(--block, 26px));
  background-color: var(--board-bg);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: var(--block, 26px) var(--block, 26px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.cell {
  width: var(--block, 26px);
  height: var(--block, 26px);
}

.cell.filled:not(.ghost) {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16), inset 0 0 6px rgba(255, 255, 255, 0.1);
}
</style>
