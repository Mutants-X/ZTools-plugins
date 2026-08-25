/** 方块种类标识 */
export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'L' | 'J'

/** 棋盘单元格：0 表示空，字符串为方块颜色 */
export type Cell = 0 | string

/** 棋盘：ROWS 行 x COLS 列 */
export type Board = Cell[][]

/** 正在下落的一个方块 */
export interface PieceState {
  kind: PieceKind
  /** 当前旋转后的形状矩阵，1 表示有方块 */
  shape: number[][]
  /** 方块颜色 */
  color: string
  /** 形状矩阵左上角所在列 */
  x: number
  /** 形状矩阵左上角所在行 */
  y: number
}

/** 游戏状态 */
export type GameStatus = 'ready' | 'playing' | 'paused' | 'over'
