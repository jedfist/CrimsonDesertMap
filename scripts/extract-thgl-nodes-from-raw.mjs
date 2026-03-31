/**
 * Extracts id@x:y world nodes embedded as ASCII in TH.GL OpenWorld .raw blobs.
 * Output: public/map/thgl-data/world-nodes.geojson (points in TH game XY; ingest maps to Pywel).
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'map', 'thgl-data')

function isIdByte(c) {
  return (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95
}

function parseCoordsAfterAt(buf, at) {
  const max = Math.min(buf.length, at + 64)
  const s = buf.slice(at, max).toString('utf8')
  const m = s.match(/^(-?\d+\.\d+):(-?\d+\.\d+)/)
  if (!m) return null
  return { x: +m[1], y: +m[2], end: at + m[0].length }
}

async function main() {
  const nodesDir = path.join(OUT_DIR, 'nodes')
  const files = await fs.readdir(nodesDir).catch(() => [])
  const raw = files.find((f) => f.endsWith('.raw'))
  if (!raw) {
    console.error('No .raw under', nodesDir, '— run npm run ingest-thgl-map-data')
    process.exit(1)
  }
  const buf = await fs.readFile(path.join(nodesDir, raw))

  const seen = new Set()
  const features = []

  for (let at = 0; at < buf.length; at++) {
    if (buf[at] !== 0x40) continue
    let s = at - 1
    while (s >= 0 && isIdByte(buf[s])) s--
    s++
    if (s >= at) continue
    const id = buf.slice(s, at).toString('utf8')
    if (id.length < 2 || id.length > 48) continue
    if (!/^[a-z][a-z0-9_]*$/.test(id)) continue

    const coords = parseCoordsAfterAt(buf, at + 1)
    if (!coords) continue

    const key = `${id}@${coords.x}:${coords.y}`
    if (seen.has(key)) continue
    seen.add(key)

    const group = inferGroup(id)
    features.push({
      type: 'Feature',
      properties: {
        nodeId: id,
        group,
        thglKey: group ? `${group}/${id}` : id,
        source: 'thgl-nodes-raw-ascii',
      },
      geometry: {
        type: 'Point',
        coordinates: [coords.x, coords.y],
      },
    })
  }

  const manPath = path.join(ROOT, 'public', 'map', 'tiles', 'manifest.json')
  let pyW = 8192
  let pyH = 8192
  try {
    const man = JSON.parse(await fs.readFile(manPath, 'utf8'))
    pyW = man.width
    pyH = man.height
  } catch {
    console.warn('No manifest; using 8192 for projection')
  }

  const tilesPath = path.join(OUT_DIR, 'tiles.json')
  const tilesText = await fs.readFile(tilesPath, 'utf8')
  const tilesCfg = JSON.parse(tilesText)
  const ow = tilesCfg.OpenWorld
  const bounds = ow?.options?.bounds ?? ow?.fitBounds
  if (!bounds) throw new Error('Missing OpenWorld bounds in tiles.json')

  const [[xMin, yMin], [xMax, yMax]] = bounds
  const xSpan = xMax - xMin
  const ySpan = yMax - yMin
  const mx = xSpan * 0.08
  const my = ySpan * 0.08
  const gxLo = xMin - mx
  const gxHi = xMax + mx
  const gyLo = yMin - my
  const gyHi = yMax + my

  const inWorld = (gx, gy) =>
    gx >= gxLo && gx <= gxHi && gy >= gyLo && gy <= gyHi

  const filtered = features.filter((f) => {
    const [gx, gy] = f.geometry.coordinates
    return inWorld(gx, gy)
  })

  for (const f of filtered) {
    const [gx, gy] = f.geometry.coordinates
    const lng = ((gx - xMin) / xSpan) * pyW
    const lat = ((gy - yMin) / ySpan) * pyH
    f.geometry.coordinates = [lng, lat]
  }

  const fc = { type: 'FeatureCollection', features: filtered }
  const outPath = path.join(OUT_DIR, 'world-nodes.geojson')
  await fs.writeFile(outPath, JSON.stringify(fc), 'utf8')
  console.log(
    `Wrote ${filtered.length} nodes (${features.length - filtered.length} out-of-bounds dropped) -> ${outPath}`,
  )
}

/** Best-effort group for sprite lookup (matches version.json filter groups). */
function inferGroup(id) {
  if (id.startsWith('mine_')) return 'mining'
  if (id.startsWith('abyss_') || id === 'sealed_artifact') return 'abyss'
  if (
    [
      'treasure_box',
      'chest',
      'treasure_chest_level',
      'collection_chest',
      'weapon_display',
      'puzzle_chest',
    ].includes(id)
  )
    return 'treasures'
  if (id === 'faction_quest' || id === 'main_quest') return 'quests'
  if (
    [
      'mercury',
      'rubber',
      'jijeongta_leaf',
      'kudzu_vine',
      'opuntia',
      'chaya',
      'ensete',
      'chlorella',
      'dulse',
      'amaranth',
      'taro',
    ].includes(id)
  )
    return 'gathering'
  if (
    [
      'bell',
      'tunnel',
      'teleport_gate',
      'dungeon',
      'greymane_shrine',
      'religion_box',
      'cave',
      'watchtower',
      'ruins',
      'shipwreck',
      'rest_area',
      'abandoned_cabin',
      'skill_learning',
    ].includes(id)
  )
    return 'exploration'
  if (
    [
      'camp',
      'castle',
      'gate',
      'faction_node',
      'beacon',
      'village',
      'farm',
      'port',
      'temple',
      'town',
      'bridge',
    ].includes(id)
  )
    return 'locations'
  if (
    [
      'shop',
      'warehouse',
      'smithy',
      'furniture_shop',
      'dye_shop',
      'general_shop',
      'grocer',
      'street_vendor',
      'black_market',
      'church',
      'smuggler',
      'bank',
      'inn',
      'tannery',
      'saddlery',
      'fishing_shop',
      'butcher',
      'research_institute',
      'contribution_shop',
      'witch_shop',
      'stoneshop',
      'pet_shop',
    ].includes(id)
  )
    return 'services'
  if (
    ['bonfire', 'crafting_anvil', 'alchemy_station', 'cooking_station'].includes(
      id,
    )
  )
    return 'crafting'
  return 'exploration'
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
