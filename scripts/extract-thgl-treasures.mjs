/**
 * Subset of world-nodes.geojson: features whose thglKey starts with "treasures/".
 * Run after: npm run extract-thgl-world-nodes
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const NODES = path.join(ROOT, 'public', 'map', 'thgl-data', 'world-nodes.geojson')
const OUT = path.join(ROOT, 'public', 'map', 'thgl-data', 'treasures.geojson')

const raw = fs.readFileSync(NODES, 'utf8')
const fc = JSON.parse(raw)
const features = (fc.features ?? []).filter((f) =>
  String(f?.properties?.thglKey ?? '').startsWith('treasures/'),
)
fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`Wrote ${features.length} treasure features -> ${OUT}`)
