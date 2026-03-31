<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import {
  mapTilesManifestUrl,
  publicAssetUrl,
  treasuresGeoJsonUrl,
} from '../config/map'
import { escapeHtml, matchesMarkerSearch } from '../lib/mapMarkersShared'
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

const props = defineProps<{
  map: object
  showTreasures: boolean
  searchQuery: string
  thglFilters: ThglMapFiltersPayload | null
}>()

const emit = defineEmits<{
  loaded: []
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

let layerGroup: L.LayerGroup | null = null
let features: GeoJSON.Feature<GeoJSON.Point, TreasureProps>[] = []

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

function treasureIcon(thglKey: string, aria: string): L.DivIcon {
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

function featureVisible(
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
  const parts = (f.properties?.thglKey ?? '').split('/')
  const kindLine =
    parts.length >= 2
      ? thglFilterLabel(parts[0]!, parts[1]!)
      : f.properties?.thglKey ?? id
  return `<div class="map-treasures__popup"><div class="map-treasures__popup-kind">${escapeHtml(kindLine)}</div><strong>${escapeHtml(id)}</strong>${g ? `<div class="map-treasures__popup-meta">${escapeHtml(g)}</div>` : ''}</div>`
}

function syncLayers() {
  layerGroup?.clearLayers()
  if (!layerGroup) return

  for (const f of features) {
    if (f.geometry?.type !== 'Point') continue
    if (!featureVisible(f)) continue
    const ll = latLngForFeature(f)
    const thglKey = f.properties?.thglKey ?? DEFAULT_USER_THGL_FILTER_KEY
    const name = f.properties?.nodeId ?? 'treasure'
    const m = L.marker(ll, {
      icon: treasureIcon(thglKey, name),
      interactive: true,
      zIndexOffset: 800,
      bubblingMouseEvents: false,
    })
    m.bindPopup(popupHtml(f), {
      className: 'map-treasures__popup-outer',
      maxWidth: 260,
    })
    m.addTo(layerGroup)
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
})

watch(() => props.showTreasures, () => syncLayers())
watch(() => props.searchQuery, () => syncLayers())
watch(() => props.thglFilters, () => syncLayers(), { deep: true })
watch([pywelW, pywelH], () => syncLayers())

defineExpose({
  getTreasureCount(): number {
    return features.length
  },
  flyToTreasure(lat: number, lng: number) {
    const ll = L.latLng(lat, lng)
    const z = Math.min(
      map.getMaxZoom() - 1,
      Math.max(map.getMinZoom() + 2, map.getZoom() + 1),
    )
    map.flyTo(ll, z, { duration: 0.28 })
  },
  getTreasureRows(): {
    nodeId: string
    lat: number
    lng: number
    thglKey: string
  }[] {
    if (!props.showTreasures) return []
    const rows: {
      nodeId: string
      lat: number
      lng: number
      thglKey: string
    }[] = []
    for (const f of features) {
      if (f.geometry?.type !== 'Point') continue
      if (!featureVisible(f)) continue
      const ll = latLngForFeature(f)
      rows.push({
        nodeId: f.properties?.nodeId ?? '',
        lat: ll.lat,
        lng: ll.lng,
        thglKey: f.properties?.thglKey ?? '',
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
</style>
