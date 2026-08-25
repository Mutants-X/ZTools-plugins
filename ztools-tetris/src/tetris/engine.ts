import { COLS, COLORS, PIECE_KINDS, ROTATION_KICKS, ROWS, SHAPES } from './constants'
import type { Board, Cell, PieceKind, PieceState } from './types'

/**
 * 创建一块空棋盘。
 * @returns ROWS 行 x COLS 列、全部为空的棋盘
 */
export function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0))
}

/**
 * 均匀随机返回一种方块种类。
 * @returns 方块种类
 */
export function randomKind(): PieceKind {
  return PIECE_KINDS[Math.floor(Math.random() * PIECE_KINDS.length)]
}

/**
 * 创建指定种类的初始方块，横向居中、位于棋盘顶部。
 * @param kind 方块种类
 * @returns 初始方块状态
 */
export function createPiece(kind: PieceKind): PieceState {
  const shape = SHAPES[kind].map((row) => [...row])
  return {
    kind,
    shape,
    color: COLORS[kind],
    x: Math.floor((COLS - shape[0].length) / 2),
    y: 0
  }
}

/**
 * 将矩阵顺时针旋转 90 度。
 * @param matrix 二维矩阵
 * @returns 旋转后的新矩阵
 */
export function rotateMatrix(matrix: number[][]): number[][] {
  return matrix[0].map((_, col) => matrix.map((row) => row[col]).reverse())
}

/**
 * 判断方块在给定偏移下是否与棋盘已落定方块或边界碰撞。
 * @param board 当前棋盘
 * @param piece 方块状态
 * @param dx 横向偏移
 * @param dy 纵向偏移
 * @param shape 参与检测的形状矩阵，默认使用方块当前形状
 * @returns 发生碰撞时返回 true
 */
export function collides(
  board: Board,
  piece: PieceState,
  dx: number,
  dy: number,
  shape: number[][] = piece.shape
): boolean {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue
      const nx = piece.x + x + dx
      const ny = piece.y + y + dy
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true
      if (ny >= 0 && board[ny][nx] !== 0) return true
    }
  }
  return false
}

/**
 * 尝试将方块移动到指定偏移位置。
 * @param board 当前棋盘
 * @param piece 方块状态
 * @param dx 横向偏移
 * @param dy 纵向偏移
 * @returns 移动成功时返回新方块状态，碰撞时返回 null
 */
export function tryMove(board: Board, piece: PieceState, dx: number, dy: number): PieceState | null {
  if (collides(board, piece, dx, dy)) return null
  return { ...piece, x: piece.x + dx, y: piece.y + dy }
}

/**
 * 尝试旋转方块，依次尝试横向踢墙偏移。
 * @param board 当前棋盘
 * @param piece 方块状态
 * @returns 旋转成功时返回新方块状态，全部偏移均碰撞时返回 null
 */
export function tryRotate(board: Board, piece: PieceState): PieceState | null {
  const rotated = rotateMatrix(piece.shape)
  for (const kick of ROTATION_KICKS) {
    if (!collides(board, piece, kick, 0, rotated)) {
      return { ...piece, shape: rotated, x: piece.x + kick }
    }
  }
  return null
}

/**
 * 将方块合并进棋盘并返回新棋盘；方块超出顶部时标记 topOut。
 * @param board 当前棋盘
 * @param piece 方块状态
 * @returns 合并后的棋盘与是否出界
 */
export function mergePiece(board: Board, piece: PieceState): { board: Board; topOut: boolean } {
  const next = board.map((row) => [...row])
  let topOut = false
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (!piece.shape[y][x]) continue
      const by = piece.y + y
      const bx = piece.x + x
      if (by < 0) {
        topOut = true
        continue
      }
      next[by][bx] = piece.color
    }
  }
  return { board: next, topOut }
}

/**
 * 消除所有满行并返回新棋盘与消除行数。
 * @param board 当前棋盘
 * @returns 消除后的棋盘与消除行数
 */
export function clearFullLines(board: Board): { board: Board; cleared: number } {
  const remaining = board.filter((row) => row.some((cell) => cell === 0))
  const cleared = ROWS - remaining.length
  while (remaining.length < ROWS) {
    remaining.unshift(Array<Cell>(COLS).fill(0))
  }
  return { board: remaining, cleared }
}

/**
 * 计算幽灵方块（直落落点提示）所在的行号。
 * @param board 当前棋盘
 * @param piece 方块状态
 * @returns 方块直落到底时的行号
 */
export function ghostY(board: Board, piece: PieceState): number {
  let y = piece.y
  while (!collides(board, { ...piece, y: y + 1 }, 0, 0)) {
    y++
  }
  return y
}
