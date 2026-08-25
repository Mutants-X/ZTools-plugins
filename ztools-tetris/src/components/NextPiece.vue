<script setup lang="ts">
import { computed } from 'vue'
import type { PieceState } from '../tetris/types'

/** 下一块预览组件：在 4x4 网格内居中显示下一块形状 */

const props = defineProps<{ piece: PieceState | null }>()

/** 4x4 网格，每个元素为颜色或空字符串 */
const cells = computed<string[]>(() => {
  const grid: string[] = Array(16).fill('')
  if (!props.piece) return grid
  const shape = props.piece.shape
  const ox = Math.floor((4 - shape[0].length) / 2)
  const oy = Math.floor((4 - shape.length) / 2)
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) grid[(oy + y) * 4 + (ox + x)] = props.piece.color
    }
  }
  return grid
})
</script>

<template>
  <div class="next-piece">
    <div
      v-for="(color, index) in cells"
      :key="index"
      class="mini-cell"
      :class="{ filled: !!color }"
      :style="color ? { backgroundColor: color } : undefined"
    ></div>
  </div>
</template>

<style scoped>
.next-piece {
  display: grid;
  grid-template-columns: repeat(4, 20px);
  grid-template-rows: repeat(4, 20px);
  gap: 2px;
  justify-content: center;
  padding: 8px 0;
}

.mini-cell {
  width: 20px;
  height: 20px;
  border-radius: 3px;
}

.mini-cell.filled {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18), inset 0 0 4px rgba(255, 255, 255, 0.1);
}
</style>
