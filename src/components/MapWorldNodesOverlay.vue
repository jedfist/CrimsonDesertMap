<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import { worldNodesGeoJsonUrl } from '../config/map'
import { matchesMarkerSearch } from '../lib/mapMarkersShared'
import {
  buildThglFilterLookup,
  DEFAULT_USER_THGL_FILTER_KEY,
  type ThglMapFiltersPayload,
  thglFilterLabel,
  thglSpriteInlineStyle,
} from '../lib/thglMapFilters'

const props = defineProps<{
  map: object
  showWorldNodes: boolean
  searchQuery: string
  thglFilters: ThglMapFiltersPayload | null
}>()

const emit = defineEmits<{
  loaded: []
}>()

const map = props.map as L.Map

type NodeProps = {
  nodeId?: string
  group?: string
  thglKey?: string
  source?: string
}

let layerGroup: L.LayerGroup | null = null
let nodeFeatures: GeoJSON.Feature<GeoJSON.Point, NodeProps>[] = []

function lookupOrEmpty() {
  return props.thglFilters
    ? buildThglFilterLookup(props.thglFilters.groups)
    : new Map()
}

function nodeIcon(thglKey: string, aria: string): L.DivIcon {
  const payload = props.thglFilters
  const lookup = lookupOrEmpty()
  const key = lookup.has(thglKey) ? thglKey : DEFAULT_USER_THGL_FILTER_KEY
  const sprite =
    payload && thglSpriteInlineStyle(key, payload, lookup, 22)
  const displayPx = sprite?.displayPx ?? 22
  const esc = aria
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
  const inner = sprite
    ? `<span class="map-world-nodes__sprite" style="${sprite.css}"></span>`
    : `<span class="map-world-nodes__fallback" aria-hidden="true"></span>`
  const html = `<div class="map-world-nodes__root" role="img" aria-label="${esc}">${inner}</div>`
  return L.divIcon({
    className: 'map-world-nodes__wrap',
    html,
    iconSize: [displayPx, displayPx],
    iconAnchor: [Math.round(displayPx / 2), displayPx],
  })
}

function featureVisible(f: GeoJSON.Feature<GeoJSON.Point, NodeProps>): boolean {
  if (!props.showWorldNodes) return false
  const id = f.properties?.nodeId ?? ''
  const g = f.properties?.group ?? ''
  const k = f.properties?.thglKey ?? ''
  return matchesMarkerSearch(props.searchQuery, id, g, k)
}

function popupHtml(f: GeoJSON.Feature<GeoJSON.Point, NodeProps>): string {
  const id = f.properties?.nodeId ?? ''
  const g = f.properties?.group ?? ''
  const parts = (f.properties?.thglKey ?? '').split('/')
  const kindLine =
    parts.length >= 2
      ? thglFilterLabel(parts[0]!, parts[1]!)
      : f.properties?.thglKey ?? id
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  return `<div class="map-world-nodes__popup"><div class="map-world-nodes__popup-kind">${esc(kindLine)}</div><strong>${esc(id)}</strong>${g ? `<div class="map-world-nodes__popup-meta">${esc(g)}</div>` : ''}</div>`
}

function syncLayers() {
  layerGroup?.clearLayers()
  if (!layerGroup) return

  for (const f of nodeFeatures) {
    if (f.geometry?.type !== 'Point') continue
    if (!featureVisible(f)) continue
    const [lng, lat] = f.geometry.coordinates
    const thglKey = f.properties?.thglKey ?? DEFAULT_USER_THGL_FILTER_KEY
    const name = f.properties?.nodeId ?? 'node'
    const m = L.marker(L.latLng(lat, lng), {
      icon: nodeIcon(thglKey, name),
      interactive: true,
      zIndexOffset: 300,
    })
    m.bindPopup(popupHtml(f), {
      className: 'map-world-nodes__popup-outer',
      maxWidth: 260,
    })
    m.addTo(layerGroup)
  }
}

async function loadGeoJson(): Promise<void> {
  const r = await fetch(worldNodesGeoJsonUrl())
  if (!r.ok) {
    nodeFeatures = []
    syncLayers()
    emit('loaded')
    return
  }
  const fc = (await r.json()) as GeoJSON.FeatureCollection
  nodeFeatures = (fc.features ?? []) as GeoJSON.Feature<GeoJSON.Point, NodeProps>[]
  syncLayers()
  emit('loaded')
}

onMounted(() => {
  layerGroup = L.layerGroup().addTo(map)
  void loadGeoJson()
})

onUnmounted(() => {
  layerGroup?.remove()
  layerGroup = null
  nodeFeatures = []
})

watch(
  () =>
    [props.showWorldNodes, props.searchQuery, props.thglFilters] as const,
  () => syncLayers(),
)

defineExpose({
  getWorldNodeCount(): number {
    return nodeFeatures.length
  },
  flyToNode(lat: number, lng: number) {
    const ll = L.latLng(lat, lng)
    const z = Math.min(
      map.getMaxZoom() - 1,
      Math.max(map.getMinZoom() + 2, map.getZoom() + 1),
    )
    map.flyTo(ll, z, { duration: 0.4 })
  },
  getWorldRows(): { nodeId: string; lat: number; lng: number; thglKey: string }[] {
    if (!props.showWorldNodes) return []
    const rows: { nodeId: string; lat: number; lng: number; thglKey: string }[] =
      []
    for (const f of nodeFeatures) {
      if (f.geometry?.type !== 'Point') continue
      if (!featureVisible(f)) continue
      const [lng, lat] = f.geometry.coordinates
      rows.push({
        nodeId: f.properties?.nodeId ?? '',
        lat,
        lng,
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
.leaflet-div-icon.map-world-nodes__wrap {
  border: none;
  background: transparent;
  overflow: visible;
}

.map-world-nodes__root {
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -100%);
  margin-left: 50%;
  pointer-events: auto;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}

.map-world-nodes__sprite {
  display: block;
  image-rendering: crisp-edges;
}

.map-world-nodes__fallback {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c9a227;
  box-shadow: 0 0 0 1px #1a1a1e;
}

.map-world-nodes__popup-outer .leaflet-popup-content-wrapper {
  background: #f4f0e8;
  border-radius: 5px;
  border: 1px solid #c4bdb0;
}

.map-world-nodes__popup-outer .leaflet-popup-tip {
  background: #f4f0e8;
  border: 1px solid #c4bdb0;
}

.map-world-nodes__popup {
  margin: 0.1rem;
  color: #1a1a1e;
  font-size: 0.85rem;
}

.map-world-nodes__popup-kind {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b2230;
  margin-bottom: 0.25rem;
}

.map-world-nodes__popup-meta {
  font-size: 0.78rem;
  opacity: 0.85;
  margin-top: 0.2rem;
}
</style>
