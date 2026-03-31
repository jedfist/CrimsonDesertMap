import { publicAssetUrl } from '../config/map'

export const THGL_MAP_FILTERS_PATH = 'map/thgl-data/map-filters.json'

export function thglMapFiltersUrl(): string {
  return publicAssetUrl(THGL_MAP_FILTERS_PATH)
}

export type ThglIconRef = {
  url: string
  x: number
  y: number
  width: number
  height: number
}

export type ThglFilterValue = {
  id: string
  icon: ThglIconRef
  size?: number
}

export type ThglFilterGroup = {
  group: string
  values: ThglFilterValue[]
  defaultOpen?: boolean
  defaultOn?: boolean
}

export type ThglMapFiltersPayload = {
  source?: string
  iconSheet: {
    file: string
    width: number
    height: number
  }
  groups: ThglFilterGroup[]
}

/** Same key shape used in storage: `group/id` (e.g. `treasures/chest`). */
export function thglFilterKey(group: string, id: string): string {
  return `${group}/${id}`
}

export function parseThglFilterKey(key: string): { group: string; id: string } | null {
  const i = key.indexOf('/')
  if (i <= 0 || i === key.length - 1) return null
  return { group: key.slice(0, i), id: key.slice(i + 1) }
}

export function buildThglFilterLookup(
  groups: ThglFilterGroup[],
): Map<string, { group: string; value: ThglFilterValue }> {
  const m = new Map<string, { group: string; value: ThglFilterValue }>()
  for (const g of groups) {
    for (const v of g.values ?? []) {
      m.set(thglFilterKey(g.group, v.id), { group: g.group, value: v })
    }
  }
  return m
}

export function isThglSpriteIcon(
  icon: ThglFilterValue['icon'],
): icon is ThglIconRef {
  return (
    icon !== null &&
    typeof icon === 'object' &&
    'x' in icon &&
    'width' in icon &&
    typeof (icon as ThglIconRef).x === 'number'
  )
}

/** Icon rect for sprite sheet, or fallback to `locations/camp` in `lookup`. */
export function resolveThglSpriteIcon(
  value: ThglFilterValue | undefined,
  lookup: Map<string, { group: string; value: ThglFilterValue }>,
): ThglIconRef | null {
  if (!value) return null
  if (isThglSpriteIcon(value.icon)) return value.icon
  const fb = lookup.get(DEFAULT_USER_THGL_FILTER_KEY)?.value
  if (fb && isThglSpriteIcon(fb.icon)) return fb.icon
  return null
}

export function thglSpriteBackground(
  icon: ThglIconRef,
  sheetPathRelativeToPublic: string,
  sheetW: number,
  sheetH: number,
  displayPx: number,
): { backgroundImage: string; backgroundPosition: string; backgroundSize: string; width: string; height: string } {
  const url = publicAssetUrl(sheetPathRelativeToPublic.replace(/^\/?/, ''))
  const scale = displayPx / icon.width
  const bgW = sheetW * scale
  const bgH = sheetH * scale
  const posX = -(icon.x * scale)
  const posY = -(icon.y * scale)
  return {
    backgroundImage: `url("${url}")`,
    backgroundPosition: `${posX}px ${posY}px`,
    backgroundSize: `${bgW}px ${bgH}px`,
    width: `${displayPx}px`,
    height: `${displayPx}px`,
  }
}

/** CSS inline style for a TH.GL sprite marker + pixel size for Leaflet anchor. */
export function thglSpriteInlineStyle(
  filterKey: string,
  payload: ThglMapFiltersPayload,
  lookup: Map<string, { group: string; value: ThglFilterValue }>,
  displayBasePx: number,
): { css: string; displayPx: number; vueStyle: Record<string, string> } | null {
  const k = lookup.has(filterKey) ? filterKey : DEFAULT_USER_THGL_FILTER_KEY
  const entry = lookup.get(k)
  const icon = resolveThglSpriteIcon(entry?.value, lookup)
  if (!icon) return null
  const sizeMul = entry?.value.size ?? 1.3
  const displayPx = Math.round(
    Math.min(44, Math.max(22, displayBasePx * (sizeMul / 1.3))),
  )
  const bg = thglSpriteBackground(
    icon,
    payload.iconSheet.file,
    payload.iconSheet.width,
    payload.iconSheet.height,
    displayPx,
  )
  const css = [
    `background-image:${bg.backgroundImage}`,
    `background-position:${bg.backgroundPosition}`,
    `background-size:${bg.backgroundSize}`,
    `width:${bg.width}`,
    `height:${bg.height}`,
    'background-repeat:no-repeat',
  ].join(';')
  const vueStyle: Record<string, string> = {
    backgroundImage: bg.backgroundImage,
    backgroundPosition: bg.backgroundPosition,
    backgroundSize: bg.backgroundSize,
    width: bg.width,
    height: bg.height,
    backgroundRepeat: 'no-repeat',
  }
  return { css, displayPx, vueStyle }
}

export function thglFilterLabel(group: string, id: string): string {
  const g = group.replace(/_/g, ' ')
  const i = id.replace(/_/g, ' ')
  return `${g} · ${i}`
}

/** Pre-TH.GL `kind` strings from older app versions → `group/id`. */
export const LEGACY_USER_MARKER_KIND_TO_THGL: Record<string, string> = {
  treasure: 'treasures/chest',
  cave: 'exploration/cave',
  beacon: 'locations/beacon',
  camp: 'locations/camp',
  boss: 'exploration/dungeon',
  resource: 'gathering/jijeongta_leaf',
  dungeon: 'exploration/dungeon',
  shrine: 'exploration/greymane_shrine',
  npc: 'locations/faction_node',
  other: 'exploration/rest_area',
}

export const DEFAULT_USER_THGL_FILTER_KEY = 'locations/camp'

export const OFFICIAL_PLACE_THGL_KEY = 'locations/castle'
export const OFFICIAL_REGION_THGL_KEY = 'locations/camp'
