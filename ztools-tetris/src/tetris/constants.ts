import type { PieceKind } from './types'

/** 棋盘列数 */
export const COLS = 10

/** 棋盘行数 */
export const ROWS = 20

/** 七种方块的基础形状矩阵 */
export const SHAPES: Record<PieceKind, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ]
}

/** 每种方块的固定颜色 */
export const COLORS: Record<PieceKind, string> = {
  I: '#00c8e8',
  O: '#ffd23f',
  T: '#b45cff',
  S: '#3ed67a',
  Z: '#ff5a5a',
  L: '#ff9f2e',
  J: '#4f7dff'
}

/** 方块种类列表 */
export const PIECE_KINDS: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'L', 'J']

/** 1 级时的基础下落间隔（毫秒） */
export const BASE_DROP_INTERVAL = 800

/** 下落间隔下限（毫秒） */
export const MIN_DROP_INTERVAL = 90

/** 每升一级下落间隔的衰减比例 */
export const DROP_INTERVAL_DECAY = 0.82

/** 一次性消除 n 行（n=1..4）的基础得分，乘以当前等级 */
export const LINE_SCORE = [0, 100, 300, 500, 800]

/** 硬降每下落一格得分 */
export const HARD_DROP_SCORE = 2

/** 软降每下落一格得分 */
export const SOFT_DROP_SCORE = 1

/** 每升一级需要消除的行数 */
export const LINES_PER_LEVEL = 10

/** 旋转时依次尝试的横向踢墙偏移 */
export const ROTATION_KICKS = [0, -1, 1, -2, 2]
