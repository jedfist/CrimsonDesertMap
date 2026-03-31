<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import {
  mapTilesManifestUrl,
  publicAssetUrl,
  TREASURE_BOX_MARKER_PNG_PATH,
  treasuresGeoJsonUrl,
} from '../config/map'
import { escapeHtml, matchesMarkerSearch } from '../lib/mapMarkersShared'
import {
  getTreasureBoxDragPosition,
  setTreasureBoxDragPosition,
  treasureBoxDragKey,
} from '../lib/treasureBoxDragPositions'
import {
  linearGameToPywelPixels,
  thglGameToPywelPixels,
  type ThglBounds,
} from '../lib/thglPywelProjection'
import {
  buildThglFilterLookup,
  DEFAULT_USER_THGL_FILTER_KEY,
  type ThglMapFiltersPayload,
  thglFilterLabel,
  thglSpriteInlineStyle,
} from '../lib/thglMapFilters'

/** Sprite in popup (slightly larger than map pin for readability). */
const POPUP_SPRITE_BASE_PX = 40

const props = defineProps<{
  map: object
  showTreasures: boolean
  searchQuery: string
  thglFilters: ThglMapFiltersPayload | null
}>()

const emit = defineEmits<{
  loaded: []
  treasurePositionsChanged: []
}>()

const map = props.map as L.Map

type TreasureProps = {
  nodeId?: string
  group?: string
  thglKey?: string
  source?: string
  gameX?: number
  gameY?: number
}

const TREASURE_MARKER_PANE = 'crimsonTreasureMarkers'

/** Native pixel size of `treasure-box-marker.png` (keep in sync with asset). */
const TREASURE_BOX_PNG_SIZE: [number, number] = [22, 23]

const TREASURE_BOX_THGL_KEY = 'treasures/treasure_box'

let layerGroup: L.LayerGroup | null = null
let treasureBoxLeafletIcon: L.Icon | null = null

function isTreasureBox(
  thglKey: string | undefined,
  nodeId: string | undefined,
): boolean {
  return (
    thglKey === TREASURE_BOX_THGL_KEY ||
    (nodeId ?? '') === 'treasure_box'
  )
}

function treasureBoxPngIcon(): L.Icon {
  if (!treasureBoxLeafletIcon) {
    const [iw, ih] = TREASURE_BOX_PNG_SIZE
    treasureBoxLeafletIcon = L.icon({
      iconUrl: publicAssetUrl(TREASURE_BOX_MARKER_PNG_PATH),
      iconSize: [iw, ih],
      iconAnchor: [Math.round(iw / 2), ih],
      popupAnchor: [0, -ih],
      className: 'map-treasures__png-wrap',
    })
  }
  return treasureBoxLeafletIcon
}

let features: GeoJSON.Feature<GeoJSON.Point, TreasureProps>[] = []
/** Matches list row → Leaflet marker for fly-to + popup. */
const markerByRowKey = new Map<string, L.Marker>()

function treasureRowKey(nodeId: string, lat: number, lng: number): string {
  return `${nodeId}|${lat}|${lng}`
}

/** Stable map key so dragged treasure_box markers still match the sidebar + fly-to. */
function markerMapKey(
  f: GeoJSON.Feature<GeoJSON.Point, TreasureProps>,
  name: string,
  ll: L.LatLng,
): string {
  const dk = treasureBoxDragKey(f)
  if (dk) return `${name}|${dk}`
  return treasureRowKey(name, ll.lat, ll.lng)
}

const pywelW = ref(8192)
const pywelH = ref(8192)
let thglBounds: ThglBounds | null = null
let transformation: [number, number, number, number] | null = null

function lookupOrEmpty() {
  return props.thglFilters
    ? buildThglFilterLookup(props.thglFilters.groups)
    : new Map()
}

/**
 * World-node coords from TH.GL follow the same `transformation` as their live map
 * (tiles.json OpenWorld). Simple linear bounds→pixel puts chests hundreds of px off
 * (e.g. 0 vs 157 inside the HERNAND bbox). Use the affine map when we have gameX/Y +
 * transformation; fall back to GeoJSON coordinates for older files.
 */
function latLngForFeature(
  f: GeoJSON.Feature<GeoJSON.Point, TreasureProps>,
): L.LatLng {
  const gx = f.properties?.gameX
  const gy = f.properties?.gameY
  const w = pywelW.value
  const h = pywelH.value
  if (
    typeof gx === 'number' &&
    typeof gy === 'number' &&
    thglBounds &&
    transformation
  ) {
    const { px, py } = thglGameToPywelPixels(
      gx,
      gy,
      thglBounds,
      w,
      h,
      transformation,
    )
    return L.latLng(py, px)
  }
  if (typeof gx === 'number' && typeof gy === 'number' && thglBounds) {
    const { px, py } = linearGameToPywelPixels(gx, gy, thglBounds, w, h)
    return L.latLng(py, px)
  }
  const [px, py] = f.geometry.coordinates as [number, number]
  return L.latLng(py, px)
}

/** Map position after optional user drag override (treasure_box only). */
function markerLatLngForFeature(
  f: GeoJSON.Feature<GeoJSON.Point, TreasureProps>,
): L.LatLng {
  const dragKey = treasureBoxDragKey(f)
  if (dragKey) {
    const o = getTreasureBoxDragPosition(dragKey)
    if (o) return L.latLng(o.lat, o.lng)
  }
  return latLngForFeature(f)
}

function treasureIcon(
  thglKey: string,
  nodeId: string,
  aria: string,
): L.Icon | L.DivIcon {
  if (isTreasureBox(thglKey, nodeId)) {
    return treasureBoxPngIcon()
  }
  const payload = props.thglFilters
  const lookup = lookupOrEmpty()
  const key = lookup.has(thglKey) ? thglKey : DEFAULT_USER_THGL_FILTER_KEY
  const sprite =
    payload && thglSpriteInlineStyle(key, payload, lookup, 32)
  const displayPx = sprite?.displayPx ?? 30
  const esc = escapeHtml(aria)
  const inner = sprite
    ? `<span class="map-treasures__sprite" style="${sprite.css}"></span>`
    : `<span class="map-treasures__fallback" aria-hidden="true"></span>`
  const html = `<div class="map-treasures__root" role="img" aria-label="${esc}">${inner}</div>`
  return L.divIcon({
    className: 'map-treasures__wrap',
    html,
    iconSize: [displayPx, displayPx],
    iconAnchor: [Math.round(displayPx / 2), displayPx],
  })
}

function popupTreasureSpriteHtml(thglKey: string): string {
  const payload = props.thglFilters
  const lookup = lookupOrEmpty()
  const key = lookup.has(thglKey) ? thglKey : DEFAULT_USER_THGL_FILTER_KEY
  const sprite =
    payload &&
    thglSpriteInlineStyle(key, payload, lookup, POPUP_SPRITE_BASE_PX)
  if (sprite) {
    return `<span class="map-treasures__popup-sprite" style="${sprite.css}"></span>`
  }
  return `<span class="map-treasures__popup-fallback" aria-hidden="true"></span>`
}

/** TH.GL-style: every treasure pin stays on the map when the layer is on. */
function treasureMatchesPanelSearch(
  f: GeoJSON.Feature<GeoJSON.Point, TreasureProps>,
): boolean {
  if (!props.showTreasures) return false
  const id = f.properties?.nodeId ?? ''
  const g = f.properties?.group ?? ''
  const k = f.properties?.thglKey ?? ''
  return matchesMarkerSearch(props.searchQuery, id, g, k)
}

function popupHtml(f: GeoJSON.Feature<GeoJSON.Point, TreasureProps>): string {
  const id = f.properties?.nodeId ?? ''
  const g = f.properties?.group ?? ''
  const rawKey = f.properties?.thglKey ?? ''
  const parts = rawKey.split('/')
  const kindLine =
    parts.length >= 2
      ? thglFilterLabel(parts[0]!, parts[1]!)
      : rawKey || id
  const spriteKey = rawKey || DEFAULT_USER_THGL_FILTER_KEY
  let iconWrap: string
  if (isTreasureBox(rawKey || undefined, id || undefined)) {
    const src = escapeHtml(publicAssetUrl(TREASURE_BOX_MARKER_PNG_PATH))
    const [pw, ph] = TREASURE_BOX_PNG_SIZE
    iconWrap = `<div class="map-treasures__popup-icon-wrap" aria-hidden="true"><img class="map-treasures__popup-png" src="${src}" width="${pw * 2}" height="${ph * 2}" alt="" /></div><p class="map-treasures__popup-drag-hint">Drag the marker on the map to fine-tune position (saved in this browser).</p>`
  } else {
    iconWrap = `<div class="map-treasures__popup-icon-wrap" aria-hidden="true">${popupTreasureSpriteHtml(spriteKey)}</div>`
  }
  return `<div class="map-treasures__popup"><div class="map-treasures__popup-kind">${escapeHtml(kindLine)}</div><strong>${escapeHtml(id)}</strong>${g ? `<div class="map-treasures__popup-meta">${escapeHtml(g)}</div>` : ''}${iconWrap}</div>`
}

function syncLayers() {
  layerGroup?.clearLayers()
  markerByRowKey.clear()
  if (!layerGroup) return

  for (const f of features) {
    if (f.geometry?.type !== 'Point') continue
    if (!props.showTreasures) continue
    const ll = markerLatLngForFeature(f)
    const thglKey = f.properties?.thglKey ?? DEFAULT_USER_THGL_FILTER_KEY
    const name = f.properties?.nodeId ?? 'treasure'
    const boxDragKey = treasureBoxDragKey(f)
    const draggable = boxDragKey != null
    const m = L.marker(ll, {
      icon: treasureIcon(thglKey, name, name),
      pane: TREASURE_MARKER_PANE,
      interactive: true,
      zIndexOffset: 800,
      bubblingMouseEvents: false,
      draggable,
    })
    m.bindPopup(popupHtml(f), {
      className: 'map-treasures__popup-outer',
      maxWidth: 260,
    })
    if (draggable && boxDragKey) {
      m.on('dragstart', () => {
        m.closePopup()
      })
      m.on('dragend', () => {
        const p = m.getLatLng()
        setTreasureBoxDragPosition(boxDragKey, p.lat, p.lng)
        emit('treasurePositionsChanged')
      })
    }
    m.addTo(layerGroup)
    markerByRowKey.set(markerMapKey(f, name, ll), m)
  }
}

async function loadProjection(): Promise<void> {
  const [manRes, tilesRes] = await Promise.all([
    fetch(mapTilesManifestUrl()),
    fetch(publicAssetUrl('map/thgl-data/tiles.json')),
  ])
  if (manRes.ok) {
    const man = (await manRes.json()) as { width?: number; height?: number }
    if (typeof man.width === 'number') pywelW.value = man.width
    if (typeof man.height === 'number') pywelH.value = man.height
  }
  if (tilesRes.ok) {
    const cfg = (await tilesRes.json()) as {
      OpenWorld?: {
        options?: { bounds?: ThglBounds }
        fitBounds?: ThglBounds
        transformation?: number[]
      }
    }
    const ow = cfg.OpenWorld
    const b = ow?.options?.bounds ?? ow?.fitBounds
    const tr = ow?.transformation
    if (Array.isArray(b) && b.length === 2) thglBounds = b as ThglBounds
    if (Array.isArray(tr) && tr.length === 4) {
      transformation = tr as [number, number, number, number]
    }
  }
}

async function loadGeoJson(): Promise<void> {
  const r = await fetch(treasuresGeoJsonUrl())
  if (!r.ok) {
    features = []
    return
  }
  const fc = (await r.json()) as GeoJSON.FeatureCollection
  features = (fc.features ?? []) as GeoJSON.Feature<GeoJSON.Point, TreasureProps>[]
}

onMounted(() => {
  if (!map.getPane(TREASURE_MARKER_PANE)) {
    const pane = map.createPane(TREASURE_MARKER_PANE)
    pane.style.zIndex = '650'
  }
  layerGroup = L.layerGroup().addTo(map)
  void (async () => {
    await Promise.all([loadProjection(), loadGeoJson()])
    syncLayers()
    emit('loaded')
  })()
})

onUnmounted(() => {
  layerGroup?.remove()
  layerGroup = null
  features = []
  markerByRowKey.clear()
})

watch(() => props.showTreasures, () => syncLayers())
watch(() => props.thglFilters, () => syncLayers(), { deep: true })
watch([pywelW, pywelH], () => syncLayers())

defineExpose({
  getTreasureCount(): number {
    return features.length
  },
  flyToTreasure(
    lat: number,
    lng: number,
    nodeId?: string,
    treasureStableKey?: string,
  ) {
    const ll = L.latLng(lat, lng)
    const id = nodeId ?? 'treasure'
    const key =
      treasureStableKey != null && treasureStableKey !== ''
        ? `${id}|${treasureStableKey}`
        : treasureRowKey(id, lat, lng)
    let marker = markerByRowKey.get(key)
    if (!marker) {
      let best: L.Marker | undefined
      let bestD = Infinity
      markerByRowKey.forEach((m, k) => {
        if (!k.startsWith(`${id}|`)) return
        const d = ll.distanceTo(m.getLatLng())
        if (d < bestD) {
          bestD = d
          best = m
        }
      })
      marker = best
    }

    const maxZ = map.getMaxZoom()
    const minZ = map.getMinZoom()
    // Native zoom (0) or best available so DivIcons are clearly visible on the art.
    const targetZ = Math.min(maxZ, Math.max(minZ, Math.min(1, maxZ)))

    const reveal = () => {
      marker?.openPopup()
    }
    map.once('moveend', reveal)
    map.flyTo(ll, targetZ, { duration: 0.4 })
    window.setTimeout(reveal, 450)
  },
  getTreasureRows(): {
    nodeId: string
    lat: number
    lng: number
    thglKey: string
    /** Present for `treasure_box`: stable id for fly-to after drag. */
    treasureStableKey?: string
  }[] {
    if (!props.showTreasures) return []
    const rows: {
      nodeId: string
      lat: number
      lng: number
      thglKey: string
      treasureStableKey?: string
    }[] = []
    for (const f of features) {
      if (f.geometry?.type !== 'Point') continue
      if (!treasureMatchesPanelSearch(f)) continue
      const ll = markerLatLngForFeature(f)
      const sk = treasureBoxDragKey(f) ?? undefined
      rows.push({
        nodeId: f.properties?.nodeId ?? '',
        lat: ll.lat,
        lng: ll.lng,
        thglKey: f.properties?.thglKey ?? '',
        ...(sk ? { treasureStableKey: sk } : {}),
      })
    }
    return rows.slice(0, 300)
  },
})
</script>

<template>
  <!-- Leaflet-only -->
</template>

<style>
.leaflet-div-icon.map-treasures__wrap {
  border: none;
  background: transparent;
  overflow: visible;
}

.map-treasures__root {
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -100%);
  margin-left: 50%;
  pointer-events: auto;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55));
  min-width: 8px;
  min-height: 8px;
}

.map-treasures__sprite {
  display: block;
  image-rendering: crisp-edges;
  flex-shrink: 0;
  /* Visible if icon sheet is missing (404); sprite paints on top when loaded */
  background-color: #9a7828;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.map-treasures__fallback {
  display: block;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f0d080, #a07020);
  box-shadow:
    0 0 0 2px #1a1a1e,
    0 2px 6px rgba(0, 0, 0, 0.45);
}

.map-treasures__popup-outer .leaflet-popup-content-wrapper {
  background: #f4f0e8;
  border-radius: 5px;
  border: 1px solid #c4bdb0;
}

.map-treasures__popup-outer .leaflet-popup-tip {
  background: #f4f0e8;
  border: 1px solid #c4bdb0;
}

.map-treasures__popup {
  margin: 0.1rem;
  color: #1a1a1e;
  font-size: 0.85rem;
}

.map-treasures__popup-kind {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b2230;
  margin-bottom: 0.25rem;
}

.map-treasures__popup-meta {
  font-size: 0.78rem;
  opacity: 0.85;
  margin-top: 0.2rem;
}

.map-treasures__popup-icon-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 0.55rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(26, 26, 30, 0.12);
}

.map-treasures__popup-sprite {
  display: block;
  image-rendering: crisp-edges;
  flex-shrink: 0;
  background-color: #9a7828;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.map-treasures__popup-fallback {
  display: block;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f0d080, #a07020);
  box-shadow:
    0 0 0 2px #1a1a1e,
    0 2px 6px rgba(0, 0, 0, 0.35);
}

.leaflet-marker-icon.map-treasures__png-wrap {
  border: none;
  background: transparent;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55));
}

.leaflet-marker-draggable.map-treasures__png-wrap {
  cursor: grab;
}

.leaflet-dragging .leaflet-marker-draggable.map-treasures__png-wrap {
  cursor: grabbing;
}

.map-treasures__popup-png {
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.map-treasures__popup-drag-hint {
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #5c564c;
  font-style: italic;
}
</style>
