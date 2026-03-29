/**
 * Builds one full-raster map from mirrored OpenWorld tiles (TH.GL extent).
 * z=4 → 16×16×512 = 8192² JPEG (full continent; avoids pywel-map corner crop).
 *
 * Requires: npm run ingest-thgl-map-tiles
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const TILE_ROOT = path.join(ROOT, 'public', 'map', 'thgl-openworld')
const OUT = path.join(ROOT, 'public', 'map', 'openworld-full.jpg')

const Z = 4
const N = 2 ** Z
const TS = 512

async function mergeRow(y) {
  const composites = []
  for (let x = 0; x < N; x++) {
    const p = path.join(TILE_ROOT, String(Z), String(y), `${x}.webp`)
    await fs.access(p)
    composites.push({ input: p, left: x * TS, top: 0 })
  }
  const w = N * TS
  return sharp({
    create: {
      width: w,
      height: TS,
      channels: 4,
      background: { r: 26, g: 26, b: 30, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer()
}

async function main() {
  const rowBufs = []
  for (let y = 0; y < N; y++) {
    rowBufs.push(await mergeRow(y))
    console.log(`Row ${y + 1}/${N}`)
  }

  const w = N * TS
  const h = N * TS
  const composites = rowBufs.map((input, yi) => ({
    input,
    left: 0,
    top: yi * TS,
  }))

  await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 26, g: 26, b: 30, alpha: 1 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(OUT)

  console.log(`Wrote ${w}x${h} -> ${OUT}`)
  console.log('Next: npm run generate-map-tiles:openworld')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
