/**
 * Removes outer white matte: flood-fills from image edges through pixels that
 * are near-white, then makes those pixels transparent.
 *
 * Usage: node scripts/knock-out-white-png.mjs [path] [minRgb 0-255]
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rel = process.argv[2] ?? 'public/brand-mark.png'
const minRgb = Number(process.argv[3] ?? 253)

const root = path.resolve(__dirname, '..')
const inputPath = path.isAbsolute(rel) ? rel : path.resolve(root, rel)

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width: w, height: h, channels } = info
if (channels !== 4) {
  console.error('Expected RGBA')
  process.exit(1)
}

const idx = (x, y) => (y * w + x) * 4

const isWhiteMatte = (i) => {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  return r >= minRgb && g >= minRgb && b >= minRgb
}

const visited = new Uint8Array(w * h)
const queue = []

const pushEdge = (x, y) => {
  if (x < 0 || x >= w || y < 0 || y >= h) return
  const vi = y * w + x
  if (visited[vi]) return
  const i = idx(x, y)
  if (!isWhiteMatte(i)) return
  visited[vi] = 1
  queue.push(x, y)
}

for (let x = 0; x < w; x++) {
  pushEdge(x, 0)
  pushEdge(x, h - 1)
}
for (let y = 0; y < h; y++) {
  pushEdge(0, y)
  pushEdge(w - 1, y)
}

while (queue.length) {
  const y = queue.pop()
  const x = queue.pop()
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
    const vi = ny * w + nx
    if (visited[vi]) continue
    const i = idx(nx, ny)
    if (!isWhiteMatte(i)) continue
    visited[vi] = 1
    queue.push(nx, ny)
  }
}

let cleared = 0
for (let vi = 0; vi < visited.length; vi++) {
  if (!visited[vi]) continue
  const i = vi * 4
  data[i + 3] = 0
  cleared++
}

await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .png()
  .toFile(inputPath)

console.log(`Wrote ${inputPath} (${w}x${h}), edge-connected matte pixels cleared: ${cleared}`)
