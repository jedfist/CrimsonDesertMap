/**
 * Phase 2: fetch TH.GL JSON + binary node blob from CDN (data only).
 * Builds landmarks.geojson from version.json drawing labels for use on the local Pywel tile map.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public', 'map', 'thgl-data')
const CDN = 'https://cdn.th.gl/crimson-desert'

async function fetchText(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}

async function fetchBytes(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return Buffer.from(await r.arrayBuffer())
}

function thXYToGeoJsonLngLat(x, y, bounds, pyW, pyH) {
  const [[xMin, yMin], [xMax, yMax]] = bounds
  const xSpan = xMax - xMin
  const ySpan = yMax - yMin
  const lng = ((x - xMin) / xSpan) * pyW
  const lat = ((y - yMin) / ySpan) * pyH
  return [lng, lat]
}

async function main() {
  await fs.mkdir(OUT, { recursive: true })

  const [versionText, tilesText] = await Promise.all([
    fetchText(`${CDN}/version.json`),
    fetchText(`${CDN}/config/tiles.json`),
  ])

  await fs.writeFile(path.join(OUT, 'version.json'), versionText, 'utf8')
  await fs.writeFile(path.join(OUT, 'tiles.json'), tilesText, 'utf8')

  const version = JSON.parse(versionText)
  const nodesPath = version?.more?.nodes?.OpenWorld
  if (nodesPath) {
    const rawUrl = `${CDN}${nodesPath}`
    const raw = await fetchBytes(rawUrl)
    const base = path.basename(nodesPath)
    const nodeDir = path.join(OUT, 'nodes')
    await fs.mkdir(nodeDir, { recursive: true })
    await fs.writeFile(path.join(nodeDir, base), raw)
    console.log('Wrote nodes', base, raw.length, 'bytes')
  }

  const tilesCfg = JSON.parse(tilesText)
  const ow = tilesCfg.OpenWorld
  const bounds = ow?.options?.bounds ?? ow?.fitBounds
  if (!bounds) throw new Error('Missing OpenWorld bounds in tiles.json')

  const manPath = path.join(ROOT, 'public', 'map', 'tiles', 'manifest.json')
  let pyW = 8192
  let pyH = 8192
  try {
    const man = JSON.parse(await fs.readFile(manPath, 'utf8'))
    pyW = man.width
    pyH = man.height
  } catch {
    console.warn('No local map/tiles/manifest.json; using 8192 for landmark projection')
  }

  const meta = {
    source: `${CDN}/version.json`,
    thBounds: { sw: bounds[0], ne: bounds[1] },
    pywelSize: { width: pyW, height: pyH },
    note: 'Landmark positions are linearly mapped from TH game coords to Pywel pixel space; alignment depends on pywel-map matching OpenWorld extent.',
  }
  await fs.writeFile(path.join(OUT, 'coords-meta.json'), JSON.stringify(meta, null, 2), 'utf8')

  const features = []
  const drawings = version?.data?.drawings ?? []
  for (const block of drawings) {
    const name = block?.name ?? 'drawing'
    const texts = block?.drawing?.texts ?? []
    for (const t of texts) {
      const pos = t?.position
      if (!Array.isArray(pos) || pos.length < 2) continue
      const [gx, gy] = pos
      const [lng, lat] = thXYToGeoJsonLngLat(gx, gy, bounds, pyW, pyH)
      features.push({
        type: 'Feature',
        properties: {
          name: t.text ?? '',
          layer: name,
          mapName: t.mapName ?? 'OpenWorld',
          source: 'thgl-version.json-drawings',
        },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      })
    }
  }

  const regions = version?.data?.regions ?? []
  for (const r of regions) {
    const c = r?.center
    if (!Array.isArray(c) || c.length < 2) continue
    const [lng, lat] = thXYToGeoJsonLngLat(c[0], c[1], bounds, pyW, pyH)
    features.push({
      type: 'Feature',
      properties: {
        name: r.id ?? 'region',
        layer: 'regions',
        mapName: r.mapName ?? 'OpenWorld',
        source: 'thgl-version.json-regions',
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    })
  }

  const fc = { type: 'FeatureCollection', features }
  await fs.writeFile(
    path.join(OUT, 'landmarks.geojson'),
    JSON.stringify(fc),
    'utf8',
  )

  await fs.writeFile(
    path.join(OUT, 'README.txt'),
    [
      'Ingested from TH.GL CDN (data only).',
      '- version.json — full site map config (filters, tiles, drawings, regions).',
      '- tiles.json — tile layer config.',
      '- nodes/*.raw — binary spawn/marker blob (format proprietary; for archival).',
      '- landmarks.geojson — Points from drawings + region centers, projected onto local Pywel pixel space.',
      '- coords-meta.json — bounds used for projection.',
      '',
    ].join('\n'),
    'utf8',
  )

  console.log(`Wrote ${features.length} features -> ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
