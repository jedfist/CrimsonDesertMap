/**
 * Builds region-borders.geojson from region center points in landmarks.geojson.
 * TH.GL version.json has empty `border` arrays; Voronoi cells are a stand-in until
 * real boundaries ship. Re-run after `npm run ingest-thgl-map-data`.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { Delaunay } from 'd3-delaunay'

const ROOT = path.resolve(import.meta.dirname, '..')
const LANDMARKS = path.join(ROOT, 'public', 'map', 'thgl-data', 'landmarks.geojson')
const MANIFEST = path.join(ROOT, 'public', 'map', 'tiles', 'manifest.json')
const OUT = path.join(ROOT, 'public', 'map', 'thgl-data', 'region-borders.geojson')

/** Promo / in-game names where they match TH region ids; others stay as ids. */
const DISPLAY_NAMES = {
  region_her: 'Hernand',
  region_dem: 'Demeniss',
  region_crim: 'Crimson Desert',
  region_del: 'Delesyia',
}

async function main() {
  const raw = await fs.readFile(LANDMARKS, 'utf8')
  const fc = JSON.parse(raw)
  const regionPoints = []
  for (const f of fc.features ?? []) {
    const layer = f.properties?.layer
    if (layer !== 'regions') continue
    const id = f.properties?.name
    const g = f.geometry
    if (g?.type !== 'Point' || !Array.isArray(g.coordinates)) continue
    const [x, y] = g.coordinates
    regionPoints.push({ id, x, y })
  }

  regionPoints.sort((a, b) => a.id.localeCompare(b.id))
  if (regionPoints.length < 2) {
    console.error('Need at least 2 region points in landmarks.geojson')
    process.exit(1)
  }

  let pyW = 8192
  let pyH = 8192
  try {
    const man = JSON.parse(await fs.readFile(MANIFEST, 'utf8'))
    pyW = man.width ?? pyW
    pyH = man.height ?? pyH
  } catch {
    console.warn('No map/tiles/manifest.json; using 8192 for Voronoi bounds')
  }

  const coords = regionPoints.map((p) => [p.x, p.y])
  const delaunay = Delaunay.from(coords)
  const voronoi = delaunay.voronoi([0, 0, pyW, pyH])

  const features = []
  for (let i = 0; i < regionPoints.length; i++) {
    const poly = voronoi.cellPolygon(i)
    if (!poly || poly.length < 3) continue
    const { id } = regionPoints[i]
    const ring = poly.map(([x, y]) => [x, y])
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])

    features.push({
      type: 'Feature',
      properties: {
        id,
        label: DISPLAY_NAMES[id] ?? id,
        layer: 'region-borders',
        source: 'voronoi-from-thgl-region-centers',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    })
  }

  await fs.writeFile(
    OUT,
    JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
    'utf8',
  )
  console.log(`Wrote ${features.length} polygons -> ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
