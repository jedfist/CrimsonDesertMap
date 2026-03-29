/**
 * Slices public/map/pywel-map.jpg into a Leaflet-friendly pyramid for L.CRS.Simple.
 * One resize per zoom level, then extracts tiles (fast vs. re-decoding JPEG per tile).
 */
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const MAP_DIR = path.join(ROOT, 'public', 'map')
const srcName =
  process.argv[2] ||
  (existsSync(path.join(MAP_DIR, 'openworld-full.jpg'))
    ? 'openworld-full.jpg'
    : 'pywel-map.jpg')
const SRC = path.join(MAP_DIR, srcName)
const OUT = path.join(ROOT, 'public', 'map', 'tiles')
const TILE = 256

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

async function main() {
  try {
    await fs.access(SRC)
  } catch {
    console.error(`Source not found: ${SRC}`)
    console.error('Usage: node scripts/generate-map-tiles.mjs [filename-in-public-map]')
    process.exit(1)
  }
  const meta = await sharp(SRC).metadata()
  const W = meta.width
  const H = meta.height
  if (!W || !H) throw new Error('Could not read image dimensions')

  await fs.rm(OUT, { recursive: true, force: true })

  const maxDim = Math.max(W, H)
  const minNativeZoom = -Math.ceil(Math.log2(maxDim / TILE))
  const maxNativeZoom = 0

  let written = 0
  for (let z = minNativeZoom; z <= maxNativeZoom; z++) {
    const scale = 2 ** z
    const worldW = W * scale
    const worldH = H * scale
    const bw = Math.max(1, Math.round(worldW))
    const bh = Math.max(1, Math.round(worldH))

    const resized = await sharp(SRC)
      .resize(bw, bh, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
      .toBuffer()

    const txMin = -2
    const txMax = Math.ceil(worldW / TILE) + 2
    const tyMin = Math.floor(-worldH / TILE) - 2
    const tyMax = 1

    async function writeSolidTile(dest) {
      const buf = await sharp({
        create: {
          width: TILE,
          height: TILE,
          channels: 4,
          background: { r: 26, g: 26, b: 30, alpha: 1 },
        },
      })
        .webp({ quality: 82 })
        .toBuffer()
      await fs.writeFile(dest, buf)
    }

    for (let tx = txMin; tx <= txMax; tx++) {
      for (let ty = tyMin; ty <= tyMax; ty++) {
        const nx0 = tx * TILE
        const nx1 = (tx + 1) * TILE
        const ny0 = ty * TILE
        const ny1 = (ty + 1) * TILE
        const x0 = Math.max(nx0, 0)
        const x1 = Math.min(nx1, worldW)
        const y0 = Math.max(ny0, -worldH)
        const y1 = Math.min(ny1, 0)

        const dir = path.join(OUT, String(z), String(tx))
        await fs.mkdir(dir, { recursive: true })
        const dest = path.join(dir, `${ty}.webp`)

        if (x0 >= x1 || y0 >= y1) {
          await writeSolidTile(dest)
          written++
          continue
        }

        const el = clamp(Math.floor(x0), 0, bw - 1)
        const er = clamp(Math.ceil(x1), 0, bw)
        const et = clamp(Math.floor(y0 + bh), 0, bh - 1)
        const eb = clamp(Math.ceil(y1 + bh), 0, bh)
        const sw = Math.max(1, er - el)
        const sh = Math.max(1, eb - et)

        const outW = x1 - x0
        const outH = y1 - y0
        const padL = Math.round(x0 - nx0)
        const padT = Math.round(y0 - ny0)

        const buf = await sharp(resized)
          .extract({ left: el, top: et, width: sw, height: sh })
          .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
          .extend({
            top: padT,
            bottom: TILE - outH - padT,
            left: padL,
            right: TILE - outW - padL,
            background: { r: 26, g: 26, b: 30, alpha: 1 },
          })
          .webp({ quality: 82 })
          .toBuffer()

        await fs.writeFile(dest, buf)
        written++
      }
    }
  }

  const manifest = {
    width: W,
    height: H,
    tileSize: TILE,
    minNativeZoom,
    maxNativeZoom,
    format: 'webp',
    tileUrlPattern: '{base}map/tiles/{z}/{x}/{y}.webp',
  }
  await fs.writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )

  console.log(
    `Wrote ${written} tiles for ${W}x${H}, z=${minNativeZoom}..${maxNativeZoom} -> ${OUT}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
