/**
 * Downloads raster map tiles from TH.GL CDN (data only; no site code).
 * Template from page/CDN config: {z}/{y}/{x}.webp
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public', 'map', 'thgl-openworld')
const BASE =
  'https://cdn.th.gl/crimson-desert/map-tiles/OpenWorld-41e5ec09378ad9807546b88f380b04c3'
const MAX_Z = 5
const CONCURRENCY = 8

async function fetchToFile(url, dest) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()))
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true })
  const jobs = []
  for (let z = 0; z <= MAX_Z; z++) {
    const n = 2 ** z
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        jobs.push({
          url: `${BASE}/${z}/${y}/${x}.webp`,
          dest: path.join(OUT, String(z), String(y), `${x}.webp`),
        })
      }
    }
  }
  let i = 0
  async function worker() {
    while (i < jobs.length) {
      const j = jobs[i++]
      await fetchToFile(j.url, j.dest)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  await fs.writeFile(
    path.join(OUT, 'README.txt'),
    [
      'OpenWorld tiles mirrored from TH.GL CDN.',
      `URL: ${BASE}/{z}/{y}/{x}.webp`,
      'Verify licensing/terms before redistributing.',
      '',
    ].join('\n'),
    'utf8',
  )
  console.log(`Downloaded ${jobs.length} tiles -> ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
