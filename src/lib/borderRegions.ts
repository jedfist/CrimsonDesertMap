import { normalizeLabelFontId } from './mapLabelFonts'

export interface BorderRegionLabel {
  lng: number
  lat: number
  fontSizePx: number
  rotationDeg?: number
  /** Preset id from `mapLabelFonts` (e.g. cinzel, unifraktur). */
  fontFamilyId?: string
}

export const DEFAULT_REGION_STROKE = '#7eb8da'
export const DEFAULT_REGION_FILL = '#3d5c73'
export const DEFAULT_REGION_FILL_OPACITY = 0.25

/** Closed filled region vs open stroke-only path (stored in `ring` without closing duplicate). */
export type BorderGeometryKind = 'polygon' | 'polyline'

export interface BorderRegion {
  id: string
  name: string
  visible: boolean
  ring: [number, number][]
  label: BorderRegionLabel
  /** Default `polygon` when omitted (legacy JSON). */
  geometryKind?: BorderGeometryKind
  /** Polygon outline color (Leaflet `color`). */
  strokeColor?: string
  /** Polygon fill color (Leaflet `fillColor`). */
  fillColor?: string
  /** Fill alpha 0–1 (Leaflet `fillOpacity`). */
  fillOpacity?: number
  /**
   * Polyline only: wider semi-transparent stroke drawn under the main line to
   * highlight the band along the path.
   */
  lineHighlight?: boolean
  lineHighlightColor?: string
  lineHighlightOpacity?: number
  /** Pixel stroke width of the highlight (main line stays on top). */
  lineHighlightWeight?: number
  /**
   * Polyline only: fill the interior by closing the path from last vertex back
   * to the first (needs at least three vertices). Uses `fillColor` / `fillOpacity`.
   */
  polylineFill?: boolean
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

export function isPolylineRegion(r: BorderRegion): boolean {
  return r.geometryKind === 'polyline'
}

/** Vertices for editing: open list (polygon drops closing duplicate; polyline uses stored points). */
export function pathVerticesOpen(
  ring: [number, number][],
  kind: BorderGeometryKind
): [number, number][] {
  if (kind === 'polyline') return [...ring]
  return ringOpenLngLat(ring)
}

/** Persist edited open vertex list into `ring`. */
export function pathFromOpenVertices(
  open: [number, number][],
  kind: BorderGeometryKind
): [number, number][] {
  if (kind === 'polyline') return [...open]
  return closedRingFromOpen(open)
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
    const rawKind = r.geometryKind
    const geometryKind: BorderGeometryKind =
      rawKind === 'polyline' ? 'polyline' : 'polygon'

    if (geometryKind === 'polyline') {
      if (ring.length < 2) continue
    } else if (ring.length < 3) {
      continue
    }

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

    const lineHighlight =
      typeof r.lineHighlight === 'boolean' ? r.lineHighlight : undefined
    let lineHighlightColor: string | undefined
    if (
      typeof r.lineHighlightColor === 'string' &&
      r.lineHighlightColor.length >= 4
    ) {
      lineHighlightColor = r.lineHighlightColor
    }
    let lineHighlightOpacity: number | undefined
    if (
      typeof r.lineHighlightOpacity === 'number' &&
      Number.isFinite(r.lineHighlightOpacity)
    ) {
      lineHighlightOpacity = Math.min(1, Math.max(0, r.lineHighlightOpacity))
    }
    let lineHighlightWeight: number | undefined
    if (
      typeof r.lineHighlightWeight === 'number' &&
      Number.isFinite(r.lineHighlightWeight)
    ) {
      lineHighlightWeight = Math.min(48, Math.max(4, r.lineHighlightWeight))
    }

    const polylineFill =
      typeof r.polylineFill === 'boolean' ? r.polylineFill : undefined

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
      const fontFamilyId = normalizeLabelFontId(l.fontFamilyId)
      label = {
        lng: Number.isFinite(lng) ? lng : 0,
        lat: Number.isFinite(lat) ? lat : 0,
        fontSizePx:
          Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 14,
        rotationDeg:
          typeof l.rotationDeg === 'number' ? l.rotationDeg : undefined,
        ...(fontFamilyId ? { fontFamilyId } : {}),
      }
    }
    const storedRing =
      geometryKind === 'polyline' ? [...ring] : closeRingLngLat(ring)

    regions.push({
      id,
      name,
      visible,
      ring: storedRing,
      label,
      ...(geometryKind === 'polyline' ? { geometryKind: 'polyline' as const } : {}),
      ...(strokeColor !== undefined ? { strokeColor } : {}),
      ...(fillColor !== undefined ? { fillColor } : {}),
      ...(fillOpacity !== undefined ? { fillOpacity } : {}),
      ...(geometryKind === 'polyline'
        ? {
            ...(lineHighlight === true ? { lineHighlight: true } : {}),
            ...(lineHighlightColor !== undefined ? { lineHighlightColor } : {}),
            ...(lineHighlightOpacity !== undefined
              ? { lineHighlightOpacity }
              : {}),
            ...(lineHighlightWeight !== undefined ? { lineHighlightWeight } : {}),
            ...(polylineFill === true ? { polylineFill: true } : {}),
          }
        : {}),
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

/** Stroke options for `L.polyline` (open paths). */
export function polylineStrokeStyle(region: BorderRegion): {
  color: string
  weight: number
} {
  return {
    color: region.strokeColor ?? DEFAULT_REGION_STROKE,
    weight: 2,
  }
}

export const DEFAULT_LINE_HIGHLIGHT_COLOR = '#d4a024'

/** Wider underlay polyline options, or `null` if disabled / not a polyline. */
export function polylineHighlightStyle(region: BorderRegion): {
  color: string
  weight: number
  opacity: number
  lineCap: 'round'
  lineJoin: 'round'
} | null {
  if (!isPolylineRegion(region) || !region.lineHighlight) return null
  const color = region.lineHighlightColor ?? DEFAULT_LINE_HIGHLIGHT_COLOR
  const opacity =
    typeof region.lineHighlightOpacity === 'number' &&
    Number.isFinite(region.lineHighlightOpacity)
      ? Math.min(1, Math.max(0, region.lineHighlightOpacity))
      : 0.42
  const weight =
    typeof region.lineHighlightWeight === 'number' &&
    Number.isFinite(region.lineHighlightWeight)
      ? Math.min(48, Math.max(4, region.lineHighlightWeight))
      : 16
  return {
    color,
    weight,
    opacity,
    lineCap: 'round',
    lineJoin: 'round',
  }
}

/** Closed [lng,lat] ring for a filled polyline interior, or `null` if disabled / too few points. */
export function polylineClosedFillRingLngLat(
  region: BorderRegion
): [number, number][] | null {
  if (!isPolylineRegion(region) || !region.polylineFill) return null
  const open = pathVerticesOpen(region.ring, 'polyline')
  if (open.length < 3) return null
  return closeRingLngLat(open)
}

/** Fill-only polygon style for closed polyline interior, or `null` if none. */
export function polylineFillPolygonStyle(region: BorderRegion): {
  stroke: boolean
  weight: number
  fillColor: string
  fillOpacity: number
} | null {
  if (!polylineClosedFillRingLngLat(region)) return null
  const fillOpacity =
    typeof region.fillOpacity === 'number' && Number.isFinite(region.fillOpacity)
      ? Math.min(1, Math.max(0, region.fillOpacity))
      : DEFAULT_REGION_FILL_OPACITY
  return {
    stroke: false,
    weight: 0,
    fillColor: region.fillColor ?? DEFAULT_REGION_FILL,
    fillOpacity,
  }
}
