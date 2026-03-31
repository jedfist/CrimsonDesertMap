import {
  DEFAULT_USER_THGL_FILTER_KEY,
  LEGACY_USER_MARKER_KIND_TO_THGL,
} from './thglMapFilters'

const STORAGE_KEY = 'crimson-desert-map-user-markers'

export type UserMarkerRecord = {
  id: string
  lat: number
  lng: number
  /** TH.GL filter key: `group/id` (e.g. `treasures/chest`). */
  kind: string
  title: string
  notes: string
  updatedAt: string
}

export type UserMarkersDocument = {
  version: 1 | 2
  markers: UserMarkerRecord[]
}

function normalizeMarker(m: Record<string, unknown>): UserMarkerRecord | null {
  if (
    typeof m.id !== 'string' ||
    typeof m.lat !== 'number' ||
    typeof m.lng !== 'number' ||
    typeof m.title !== 'string' ||
    typeof m.notes !== 'string' ||
    typeof m.updatedAt !== 'string'
  ) {
    return null
  }
  return {
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    kind: normalizeMarkerKind(m.kind),
    title: m.title,
    notes: m.notes,
    updatedAt: m.updatedAt,
  }
}

function normalizeMarkerKind(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return DEFAULT_USER_THGL_FILTER_KEY
  if (raw.includes('/')) return raw
  return LEGACY_USER_MARKER_KIND_TO_THGL[raw] ?? DEFAULT_USER_THGL_FILTER_KEY
}

export function loadUserMarkers(): UserMarkerRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const o = parsed as Record<string, unknown>
    if ((o.version !== 1 && o.version !== 2) || !Array.isArray(o.markers)) {
      return []
    }
    const out: UserMarkerRecord[] = []
    for (const x of o.markers) {
      if (!x || typeof x !== 'object') continue
      const n = normalizeMarker(x as Record<string, unknown>)
      if (n) out.push(n)
    }
    return out
  } catch {
    return []
  }
}

export function saveUserMarkers(markers: UserMarkerRecord[]): void {
  if (typeof localStorage === 'undefined') return
  const doc: UserMarkersDocument = { version: 2, markers }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
}

export function exportUserMarkersJson(markers: UserMarkerRecord[]): string {
  return JSON.stringify(
    { version: 2, markers } satisfies UserMarkersDocument,
    null,
    2,
  )
}

export function importUserMarkersJson(text: string): UserMarkerRecord[] {
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object') return []
  const o = parsed as Record<string, unknown>
  if (!Array.isArray(o.markers)) return []
  const out: UserMarkerRecord[] = []
  for (const x of o.markers) {
    if (!x || typeof x !== 'object') continue
    const n = normalizeMarker(x as Record<string, unknown>)
    if (n) out.push(n)
  }
  return out
}
