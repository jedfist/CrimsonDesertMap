const STORAGE_KEY = 'crimson-desert-map-treasure-box-drag-positions'

type TreasureBoxFeature = {
  geometry?: { type: string; coordinates?: unknown }
  properties?: {
    nodeId?: string
    thglKey?: string
    gameX?: number
    gameY?: number
  }
}

type PositionsDoc = Record<string, { lat: number; lng: number }>

function readDoc(): PositionsDoc {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return {}
    return p as PositionsDoc
  } catch {
    return {}
  }
}

function writeDoc(doc: PositionsDoc) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
  } catch {
    /* quota / private mode */
  }
}

/** Stable id per chest from game coords or GeoJSON geometry (many share nodeId `treasure_box`). */
export function treasureBoxDragKey(f: TreasureBoxFeature): string | null {
  const id = f.properties?.nodeId
  const k = f.properties?.thglKey ?? ''
  if (k !== 'treasures/treasure_box' && id !== 'treasure_box') return null
  const gx = f.properties?.gameX
  const gy = f.properties?.gameY
  if (
    typeof gx === 'number' &&
    typeof gy === 'number' &&
    Number.isFinite(gx) &&
    Number.isFinite(gy)
  ) {
    return `tb:${gx}:${gy}`
  }
  const c = f.geometry?.coordinates
  if (Array.isArray(c) && c.length >= 2) {
    const px = c[0]
    const py = c[1]
    if (typeof px === 'number' && typeof py === 'number')
      return `tb:g:${px}:${py}`
  }
  return null
}

export function getTreasureBoxDragPosition(
  key: string,
): { lat: number; lng: number } | null {
  const doc = readDoc()
  const e = doc[key]
  if (
    !e ||
    typeof e.lat !== 'number' ||
    typeof e.lng !== 'number' ||
    !Number.isFinite(e.lat) ||
    !Number.isFinite(e.lng)
  ) {
    return null
  }
  return { lat: e.lat, lng: e.lng }
}

export function setTreasureBoxDragPosition(
  key: string,
  lat: number,
  lng: number,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  const doc = readDoc()
  doc[key] = { lat, lng }
  writeDoc(doc)
}
