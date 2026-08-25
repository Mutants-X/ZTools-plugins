/**
 * 生成俄罗斯方块插件 Logo（512x512 PNG，无第三方依赖）。
 * 运行：node scripts/generate-logo.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 512
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/logo.png')

// ------------------------------------------------------------
// 极简 PNG 编码器
// ------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const source = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter none
    source.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ------------------------------------------------------------
// 绘制
// ------------------------------------------------------------
const pixels = new Uint8Array(SIZE * SIZE * 4)

/** 判断点是否在圆角矩形内 */
function inRoundedRect(x, y, rx, ry, rw, rh, radius) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false
  const cx = Math.max(rx + radius, Math.min(x, rx + rw - radius))
  const cy = Math.max(ry + radius, Math.min(y, ry + rh - radius))
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/** 以 alpha 混合方式绘制一个像素 */
function blend(x, y, r, g, b, a) {
  const idx = (y * SIZE + x) * 4
  const sa = a / 255
  const da = pixels[idx + 3] / 255
  const outA = sa + da * (1 - sa)
  if (outA <= 0) return
  pixels[idx] = Math.round((r * sa + pixels[idx] * da * (1 - sa)) / outA)
  pixels[idx + 1] = Math.round((g * sa + pixels[idx + 1] * da * (1 - sa)) / outA)
  pixels[idx + 2] = Math.round((b * sa + pixels[idx + 2] * da * (1 - sa)) / outA)
  pixels[idx + 3] = Math.round(outA * 255)
}

/** 填充圆角矩形 */
function fillRoundedRect(rx, ry, rw, rh, radius, [r, g, b, a]) {
  for (let y = Math.floor(ry); y < ry + rh; y++) {
    for (let x = Math.floor(rx); x < rx + rw; x++) {
      if (inRoundedRect(x, y, rx, ry, rw, rh, radius)) blend(x, y, r, g, b, a)
    }
  }
}

/** 绘制一个带 3D 斜面效果的方块 */
function drawBlock(cx, cy, size, [r, g, b]) {
  fillRoundedRect(cx, cy, size, size, size * 0.18, [r, g, b, 255])
  // 顶部与左侧提亮，底部与右侧压暗，模拟立体感
  const edge = size * 0.12
  fillRoundedRect(cx, cy, size, edge, edge * 0.5, [255, 255, 255, 42])
  fillRoundedRect(cx, cy, edge, size, edge * 0.5, [255, 255, 255, 42])
  fillRoundedRect(cx, cy + size - edge, size, edge, edge * 0.5, [0, 0, 0, 46])
  fillRoundedRect(cx + size - edge, cy, edge, size, edge * 0.5, [0, 0, 0, 46])
}

// 背景：深色圆角方块
fillRoundedRect(12, 12, SIZE - 24, SIZE - 24, 92, [23, 28, 38, 255])

// T 形四格方块（每格不同颜色）
const CELL = 108
const GAP = 10
const gridX = Math.floor((SIZE - CELL * 3 - GAP * 2) / 2)
const gridY = Math.floor((SIZE - CELL * 2 - GAP) / 2)
const COLORS = [
  [0, 200, 232], // I 青色
  [255, 210, 63], // O 黄色
  [180, 92, 255], // T 紫色
  [62, 214, 122] // S 绿色
]
const shape = [
  [0, 1, 0],
  [1, 1, 1]
]
let colorIndex = 0
for (let y = 0; y < shape.length; y++) {
  for (let x = 0; x < shape[y].length; x++) {
    if (!shape[y][x]) continue
    const px = gridX + x * (CELL + GAP)
    const py = gridY + y * (CELL + GAP)
    drawBlock(px, py, CELL, COLORS[colorIndex++ % COLORS.length])
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, encodePng(SIZE, SIZE, pixels))
console.log(`logo written: ${OUT}`)
