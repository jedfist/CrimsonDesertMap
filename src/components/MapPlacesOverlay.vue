<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import {
  landmarksGeoJsonUrl,
  OFFICIAL_MAP_NAMES,
  placesGeoJsonUrl,
  regionCentersGeoJsonUrl,
} from '../config/map'
import { escapeHtml, matchesMarkerSearch } from '../lib/mapMarkersShared'
import {
  buildThglFilterLookup,
  DEFAULT_USER_THGL_FILTER_KEY,
  OFFICIAL_PLACE_THGL_KEY,
  OFFICIAL_REGION_THGL_KEY,
  type ThglMapFiltersPayload,
  thglSpriteInlineStyle,
} from '../lib/thglMapFilters'

const props = defineProps<{
  map: object
  showPlaces: boolean
  showRegions: boolean
  searchQuery: string
  thglFilters: ThglMapFiltersPayload | null
}>()

const emit = defineEmits<{
  loaded: []
}>()

const map = props.map as L.Map

type PointProps = {
  name?: string
  layer?: string
  mapName?: string
  source?: string
}

let group: L.LayerGroup | null = null
let placeFeatures: GeoJSON.Feature<GeoJSON.Point, PointProps>[] = []
let regionFeatures: GeoJSON.Feature<GeoJSON.Point, PointProps>[] = []

function isAllowedMapName(mapName: unknown): boolean {
  return (
    typeof mapName === 'string' &&
    (OFFICIAL_MAP_NAMES as readonly string[]).includes(mapName)
  )
}

function lookupOrEmpty() {
  return props.thglFilters
    ? buildThglFilterLookup(props.thglFilters.groups)
    : new Map()
}

function officialSpriteIcon(
  thglKey: string,
  nameForAria: string,
): L.DivIcon {
  const payload = props.thglFilters
  const lookup = lookupOrEmpty()
  const key = lookup.has(thglKey) ? thglKey : DEFAULT_USER_THGL_FILTER_KEY
  const sprite =
    payload && thglSpriteInlineStyle(key, payload, lookup, 30)
  const displayPx = sprite?.displayPx ?? 28
  const aria = escapeHtml(nameForAria || 'Location')
  const inner = sprite
    ? `<span class="map-places-overlay__sprite" style="${sprite.css}"></span>`
    : `<span class="map-places-overlay__sprite-fallback" aria-hidden="true"></span>`
  const html = `<div class="map-places-overlay__icon-root" role="img" aria-label="${aria}">${inner}</div>`
  return L.divIcon({
    className: 'map-places-overlay__wrap',
    html,
    iconSize: [displayPx, displayPx],
    iconAnchor: [Math.round(displayPx / 2), displayPx],
  })
}

function featureVisible(
  f: GeoJSON.Feature<GeoJSON.Point, PointProps>,
  kind: 'place' | 'region',
): boolean {
  if (!isAllowedMapName(f.properties?.mapName)) return false
  const name = f.properties?.name ?? ''
  if (!matchesMarkerSearch(props.searchQuery, name)) return false
  if (kind === 'place' && !props.showPlaces) return false
  if (kind === 'region' && !props.showRegions) return false
  return true
}

function syncLayers() {
  group?.clearLayers()
  if (!group) return

  const addFeature = (
    f: GeoJSON.Feature<GeoJSON.Point, PointProps>,
    kind: 'place' | 'region',
  ) => {
    if (f.geometry?.type !== 'Point') return
    if (!featureVisible(f, kind)) return
    const [lng, lat] = f.geometry.coordinates
    const latlng = L.latLng(lat, lng)
    const name = f.properties?.name ?? ''
    const thglKey =
      kind === 'place' ? OFFICIAL_PLACE_THGL_KEY : OFFICIAL_REGION_THGL_KEY
    const m = L.marker(latlng, {
      icon: officialSpriteIcon(thglKey, name),
      interactive: true,
      zIndexOffset: kind === 'place' ? 400 : 350,
    })
    const layer = f.properties?.layer ?? ''
    const mapName = f.properties?.mapName ?? ''
    m.bindPopup(
      `<div class="map-places-overlay__popup"><strong>${escapeHtml(name)}</strong>${layer ? `<div class="map-places-overlay__popup-meta">${escapeHtml(layer)}</div>` : ''}${mapName ? `<div class="map-places-overlay__popup-meta">${escapeHtml(mapName)}</div>` : ''}</div>`,
    )
    m.addTo(group!)
  }

  for (const f of placeFeatures) addFeature(f, 'place')
  for (const f of regionFeatures) addFeature(f, 'region')
}

async function loadGeoJson(): Promise<void> {
  let places: GeoJSON.Feature<GeoJSON.Point, PointProps>[] = []
  let regions: GeoJSON.Feature<GeoJSON.Point, PointProps>[] = []

  const pRes = await fetch(placesGeoJsonUrl())
  if (pRes.ok) {
    const fc = (await pRes.json()) as GeoJSON.FeatureCollection
    places = (fc.features ?? []) as GeoJSON.Feature<GeoJSON.Point, PointProps>[]
  }

  const rRes = await fetch(regionCentersGeoJsonUrl())
  if (rRes.ok) {
    const fc = (await rRes.json()) as GeoJSON.FeatureCollection
    regions = (fc.features ?? []) as GeoJSON.Feature<GeoJSON.Point, PointProps>[]
  }

  if (places.length === 0 && regions.length === 0) {
    const lRes = await fetch(landmarksGeoJsonUrl())
    if (lRes.ok) {
      const fc = (await lRes.json()) as GeoJSON.FeatureCollection
      for (const f of fc.features ?? []) {
        if (f.geometry?.type !== 'Point') continue
        const pf = f as GeoJSON.Feature<GeoJSON.Point, PointProps>
        if (pf.properties?.layer === 'regions') regions.push(pf)
        else places.push(pf)
      }
    }
  }

  placeFeatures = places
  regionFeatures = regions
  syncLayers()
  emit('loaded')
}

onMounted(() => {
  group = L.layerGroup().addTo(map)
  void loadGeoJson()
})

onUnmounted(() => {
  group?.remove()
  group = null
  placeFeatures = []
  regionFeatures = []
})

watch(
  () =>
    [
      props.showPlaces,
      props.showRegions,
      props.searchQuery,
      props.thglFilters,
    ] as const,
  () => syncLayers(),
)

defineExpose({
  flyToFeature(lat: number, lng: number) {
    const ll = L.latLng(lat, lng)
    const z = Math.min(
      map.getMaxZoom() - 1,
      Math.max(map.getMinZoom() + 2, map.getZoom() + 1),
    )
    map.flyTo(ll, z, { duration: 0.45 })
  },
  getPlaceRows(): { name: string; lat: number; lng: number }[] {
    return placeFeatures
      .filter((f) => featureVisible(f, 'place'))
      .map((f) => {
        const [lng, lat] = f.geometry.coordinates
        return { name: f.properties?.name ?? '', lat, lng }
      })
  },
  getRegionRows(): { name: string; lat: number; lng: number }[] {
    return regionFeatures
      .filter((f) => featureVisible(f, 'region'))
      .map((f) => {
        const [lng, lat] = f.geometry.coordinates
        return { name: f.properties?.name ?? '', lat, lng }
      })
  },
})
</script>

<template>
  <!-- Markers render on the Leaflet map only -->
</template>

<style>
.leaflet-div-icon.map-places-overlay__wrap {
  border: none;
  background: transparent;
  overflow: visible;
}

.map-places-overlay__icon-root {
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -100%);
  margin-left: 50%;
  pointer-events: auto;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
}

.map-places-overlay__sprite {
  display: block;
  image-rendering: crisp-edges;
}

.map-places-overlay__sprite-fallback {
  display: block;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(145deg, #e8dcc4, #a68b5b);
  box-shadow: 0 0 0 2px #1a1a1e;
}

.map-places-overlay__popup {
  font-family: inherit;
  color: #1a1a1e;
}

.map-places-overlay__popup-meta {
  font-size: 0.85em;
  opacity: 0.85;
  margin-top: 0.25rem;
}
</style>
