export interface BorderRegionLabel {
  lng: number
  lat: number
  fontSizePx: number
  rotationDeg?: number
}

export const DEFAULT_REGION_STROKE = '#7eb8da'
export const DEFAULT_REGION_FILL = '#3d5c73'
export const DEFAULT_REGION_FILL_OPACITY = 0.25

export interface BorderRegion {
  id: string
  name: string
  visible: boolean
  ring: [number, number][]
  label: BorderRegionLabel
  /** Polygon outline color (Leaflet `color`). */
  strokeColor?: string
  /** Polygon fill color (Leaflet `fillColor`). */
  fillColor?: string
  /** Fill alpha 0–1 (Leaflet `fillOpacity`). */
  fillOpacity?: number
}

export interface BorderRegionsFile {
  version: number
  regions: BorderRegion[]
}

const DEFAULT_FILE: BorderRegionsFile = { version: 1, regions: [] }

export function closeRingLngLat(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring
  const [a0, a1] = ring[0]
  const [b0, b1] = ring[ring.length - 1]
  if (a0 === b0 && a1 === b1) return ring
  return [...ring, [a0, a1] as [number, number]]
}

/** Open ring for editing (drops duplicate closing point). Points are [lng, lat]. */
export function ringOpenLngLat(ring: [number, number][]): [number, number][] {
  const closed = closeRingLngLat(ring)
  if (closed.length < 2) return [...closed]
  const [a0, a1] = closed[0]
  const [b0, b1] = closed[closed.length - 1]
  if (a0 === b0 && a1 === b1) return closed.slice(0, -1)
  return [...closed]
}

/** Close an open vertex list into a stored ring. */
export function closedRingFromOpen(open: [number, number][]): [number, number][] {
  return closeRingLngLat(open)
}

export function ringToLatLngTuples(
  ring: [number, number][]
): [number, number][] {
  return ring.map(([lng, lat]) => [lat, lng] as [number, number])
}

export function latLngsToRing(
  latlngs: { lng: number; lat: number }[]
): [number, number][] {
  return latlngs.map((p) => [p.lng, p.lat] as [number, number])
}

export function parseBorderRegions(raw: unknown): BorderRegionsFile {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FILE }
  const o = raw as Record<string, unknown>
  const version = typeof o.version === 'number' ? o.version : 1
  const regionsIn = o.regions
  if (!Array.isArray(regionsIn)) return { version, regions: [] }

  const regions: BorderRegion[] = []
  for (const item of regionsIn) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : crypto.randomUUID()
    const name = typeof r.name === 'string' ? r.name : 'Unnamed'
    const visible = typeof r.visible === 'boolean' ? r.visible : true
    const ringRaw = r.ring
    if (!Array.isArray(ringRaw)) continue
    const ring: [number, number][] = []
    for (const pt of ringRaw) {
      if (!Array.isArray(pt) || pt.length < 2) continue
      const lng = Number(pt[0])
      const lat = Number(pt[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      ring.push([lng, lat])
    }
    if (ring.length < 3) continue

    let strokeColor: string | undefined
    if (typeof r.strokeColor === 'string' && r.strokeColor.length >= 4) {
      strokeColor = r.strokeColor
    }
    let fillColor: string | undefined
    if (typeof r.fillColor === 'string' && r.fillColor.length >= 4) {
      fillColor = r.fillColor
    }
    let fillOpacity: number | undefined
    if (typeof r.fillOpacity === 'number' && Number.isFinite(r.fillOpacity)) {
      fillOpacity = Math.min(1, Math.max(0, r.fillOpacity))
    }

    const labelObj = r.label
    let label: BorderRegionLabel = {
      lng: 0,
      lat: 0,
      fontSizePx: 14,
    }
    if (labelObj && typeof labelObj === 'object') {
      const l = labelObj as Record<string, unknown>
      const lng = Number(l.lng)
      const lat = Number(l.lat)
      const fontSizePx = Number(l.fontSizePx)
      label = {
        lng: Number.isFinite(lng) ? lng : 0,
        lat: Number.isFinite(lat) ? lat : 0,
        fontSizePx:
          Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 14,
        rotationDeg:
          typeof l.rotationDeg === 'number' ? l.rotationDeg : undefined,
      }
    }
    regions.push({
      id,
      name,
      visible,
      ring: closeRingLngLat(ring),
      label,
      ...(strokeColor !== undefined ? { strokeColor } : {}),
      ...(fillColor !== undefined ? { fillColor } : {}),
      ...(fillOpacity !== undefined ? { fillOpacity } : {}),
    })
  }
  return { version, regions }
}

export function serializeBorderRegions(data: BorderRegionsFile): string {
  return JSON.stringify(data, null, 2)
}

export function regionPathStyle(region: BorderRegion): {
  color: string
  weight: number
  fillColor: string
  fillOpacity: number
} {
  const fillOpacity =
    typeof region.fillOpacity === 'number' && Number.isFinite(region.fillOpacity)
      ? Math.min(1, Math.max(0, region.fillOpacity))
      : DEFAULT_REGION_FILL_OPACITY
  return {
    color: region.strokeColor ?? DEFAULT_REGION_STROKE,
    weight: 2,
    fillColor: region.fillColor ?? DEFAULT_REGION_FILL,
    fillOpacity,
  }
}
