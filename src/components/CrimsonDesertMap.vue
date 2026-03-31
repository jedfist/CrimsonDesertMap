<script setup lang="ts">
import { createApp, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { App } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MapRegionsEditor from './MapRegionsEditor.vue'
import MapCompassRose from './MapCompassRose.vue'
import MapPlacesOverlay from './MapPlacesOverlay.vue'
import MapWorldNodesOverlay from './MapWorldNodesOverlay.vue'
import MapUserMarkers from './MapUserMarkers.vue'
import MapMarkersPanel, {
  type PlacesOverlayExposed,
  type UserMarkersExposed,
  type WorldNodesExposed,
} from './MapMarkersPanel.vue'
import {
  mapTilesManifestUrl,
  publicAssetUrl,
  type MapTilesManifest,
} from '../config/map'
import { loadUserMarkers, saveUserMarkers } from '../lib/userMarkers'
import type { UserMarkerRecord } from '../lib/userMarkers'
import {
  DEFAULT_USER_THGL_FILTER_KEY,
  thglMapFiltersUrl,
  type ThglMapFiltersPayload,
} from '../lib/thglMapFilters'

const mapContainer = ref<HTMLElement | null>(null)
const leafletMap = ref<L.Map | null>(null)
const loadError = ref(false)
const manifestUrl = mapTilesManifestUrl()
const tileUrlTemplate = publicAssetUrl('map/tiles/{z}/{x}/{y}.webp')

const placesOverlayRef = ref<PlacesOverlayExposed | null>(null)
const worldNodesRef = ref<WorldNodesExposed | null>(null)
const userMarkersRef = ref<UserMarkersExposed | null>(null)

const markerUi = reactive({
  searchQuery: '',
  showPlaces: true,
  showRegions: false,
  showWorldNodes: true,
  showUser: true,
  placeMode: false,
  placeMarkerKind: DEFAULT_USER_THGL_FILTER_KEY,
  selectedUserId: null as string | null,
})

const userMarkers = ref<UserMarkerRecord[]>(loadUserMarkers())
const placesDataTick = ref(0)
const worldDataTick = ref(0)
const thglFilters = ref<ThglMapFiltersPayload | null>(null)

async function loadThglFiltersPayload() {
  try {
    const r = await fetch(thglMapFiltersUrl())
    if (r.ok) thglFilters.value = (await r.json()) as ThglMapFiltersPayload
  } catch {
    thglFilters.value = null
  }
}
void loadThglFiltersPayload()

function persistUserMarkers(next: UserMarkerRecord[]) {
  userMarkers.value = next
  saveUserMarkers(next)
}

let map: L.Map | null = null
let cancelled = false
let resizeObserver: ResizeObserver | null = null
let resizeFitRaf = 0
let compassVueApp: App<Element> | null = null

function fitMapCoverViewport(
  mapInstance: L.Map,
  imageBounds: L.LatLngBounds,
  zoomMin: number,
  zoomMax: number,
  padding: [number, number] = [4, 4],
): number | null {
  const center = imageBounds.getCenter()
  const pad = L.point(padding[0], padding[1])
  const need = mapInstance.getSize().subtract(pad.multiplyBy(2))
  if (need.x < 8 || need.y < 8) return null

  mapInstance.setMinZoom(zoomMin)
  let chosen = zoomMax
  for (let z = zoomMin; z <= zoomMax; z++) {
    mapInstance.setView(center, z, { animate: false })
    const sw = mapInstance.latLngToContainerPoint(imageBounds.getSouthWest())
    const ne = mapInstance.latLngToContainerPoint(imageBounds.getNorthEast())
    const coverW = Math.abs(ne.x - sw.x)
    const coverH = Math.abs(ne.y - sw.y)
    if (coverW >= need.x && coverH >= need.y) {
      chosen = z
      break
    }
  }
  mapInstance.setMinZoom(chosen)
  mapInstance.setView(center, chosen, { animate: false })
  return chosen
}

const CompassLeafletControl = L.Control.extend({
  options: {
    position: 'topleft',
  },
  onAdd() {
    const container = L.DomUtil.create('div', 'crimson-map-compass-control')
    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)
    compassVueApp = createApp(MapCompassRose)
    compassVueApp.mount(container)
    return container
  },
  onRemove() {
    compassVueApp?.unmount()
    compassVueApp = null
  },
})

async function loadManifest(): Promise<MapTilesManifest> {
  const r = await fetch(manifestUrl)
  if (!r.ok) throw new Error('Map tiles manifest not found')
  return r.json() as Promise<MapTilesManifest>
}

onMounted(() => {
  const el = mapContainer.value
  if (!el) return

  void (async () => {
    try {
      const manifest = await loadManifest()
      if (cancelled || mapContainer.value !== el) return

      const { width: w, height: h, tileSize, minNativeZoom, maxNativeZoom } =
        manifest
      const zoomMax = maxNativeZoom + 4

      const bounds: L.LatLngBoundsExpression = [
        [0, 0],
        [h, w],
      ]
      const imageBounds = L.latLngBounds(bounds)

      map = L.map(el, {
        crs: L.CRS.Simple,
        minZoom: minNativeZoom,
        maxZoom: zoomMax,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false,
      })

      L.control.zoom({ position: 'topleft' }).addTo(map)
      new CompassLeafletControl().addTo(map)

      const baseTileLayer = L.tileLayer(tileUrlTemplate, {
        tileSize,
        noWrap: true,
        minZoom: minNativeZoom,
        maxZoom: zoomMax,
        maxNativeZoom,
      }).addTo(map)

      const applyCoverFit = () => {
        if (!map || cancelled) return
        const zCover = fitMapCoverViewport(
          map,
          imageBounds,
          minNativeZoom,
          zoomMax,
          [4, 4],
        )
        if (zCover != null) baseTileLayer.options.minZoom = zCover
      }

      const fit = () => {
        if (!map || cancelled) return
        const pane = mapContainer.value
        if (!pane) return
        const { width, height } = pane.getBoundingClientRect()
        if (width < 32 || height < 32) return
        map.invalidateSize()
        applyCoverFit()
      }

      applyCoverFit()

      await nextTick()
      requestAnimationFrame(() => {
        fit()
        requestAnimationFrame(fit)
      })

      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFitRaf)
        resizeFitRaf = requestAnimationFrame(fit)
      })
      resizeObserver.observe(el)

      if (cancelled || mapContainer.value !== el) return
      leafletMap.value = map
    } catch {
      loadError.value = true
    }
  })()
})

onUnmounted(() => {
  cancelled = true
  resizeObserver?.disconnect()
  resizeObserver = null
  cancelAnimationFrame(resizeFitRaf)
  leafletMap.value = null
  map?.remove()
  map = null
})
</script>

<template>
  <div class="crimson-map">
    <div
      v-if="loadError"
      class="crimson-map__error"
      role="alert"
    >
      <p>Could not load the map tiles.</p>
      <p class="crimson-map__hint">
        Run <code>npm run generate-map-tiles</code> and ensure
        <code>{{ manifestUrl }}</code> exists (see <code>public/map/</code> and
        <code>SOURCE.txt</code>).
      </p>
    </div>
    <div
      v-show="!loadError"
      ref="mapContainer"
      class="crimson-map__pane"
      aria-hidden="true"
    />
    <template v-if="leafletMap">
      <MapPlacesOverlay
        ref="placesOverlayRef"
        :map="leafletMap"
        :show-places="markerUi.showPlaces"
        :show-regions="markerUi.showRegions"
        :search-query="markerUi.searchQuery"
        :thgl-filters="thglFilters"
        @loaded="placesDataTick += 1"
      />
      <MapWorldNodesOverlay
        ref="worldNodesRef"
        :map="leafletMap"
        :show-world-nodes="markerUi.showWorldNodes"
        :search-query="markerUi.searchQuery"
        :thgl-filters="thglFilters"
        @loaded="worldDataTick += 1"
      />
      <MapRegionsEditor :map="leafletMap" />
      <MapUserMarkers
        ref="userMarkersRef"
        :map="leafletMap"
        :markers="userMarkers"
        :show-user="markerUi.showUser"
        :search-query="markerUi.searchQuery"
        :place-mode="markerUi.placeMode"
        :place-marker-kind="markerUi.placeMarkerKind"
        :selected-user-id="markerUi.selectedUserId"
        :thgl-filters="thglFilters"
        @update:markers="persistUserMarkers"
        @update:place-mode="markerUi.placeMode = $event"
        @update:selected-user-id="markerUi.selectedUserId = $event"
      />
      <MapMarkersPanel
        :places-overlay-ref="placesOverlayRef"
        :user-markers-ref="userMarkersRef"
        :world-nodes-ref="worldNodesRef"
        :places-data-tick="placesDataTick"
        :world-data-tick="worldDataTick"
        :search-query="markerUi.searchQuery"
        :show-places="markerUi.showPlaces"
        :show-regions="markerUi.showRegions"
        :show-world-nodes="markerUi.showWorldNodes"
        :show-user="markerUi.showUser"
        :place-mode="markerUi.placeMode"
        :place-marker-kind="markerUi.placeMarkerKind"
        :thgl-filters="thglFilters"
        :user-markers="userMarkers"
        :selected-user-id="markerUi.selectedUserId"
        @update:search-query="markerUi.searchQuery = $event"
        @update:show-places="markerUi.showPlaces = $event"
        @update:show-regions="markerUi.showRegions = $event"
        @update:show-world-nodes="markerUi.showWorldNodes = $event"
        @update:show-user="markerUi.showUser = $event"
        @update:place-mode="markerUi.placeMode = $event"
        @update:place-marker-kind="markerUi.placeMarkerKind = $event"
        @update:user-markers="persistUserMarkers"
        @update:selected-user-id="markerUi.selectedUserId = $event"
      />
    </template>
  </div>
</template>

<style scoped>
.crimson-map {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 0;
}

.crimson-map__pane {
  position: absolute;
  inset: 0;
  background: #1a1a1e;
}

.crimson-map__error {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  flex: 1;
  min-height: 0;
  padding: 1.25rem 1.5rem;
  color: #e8e6e3;
  background: #1a1a1e;
}

.crimson-map__error p {
  margin: 0 0 0.75rem;
}

.crimson-map__hint {
  font-size: 0.9rem;
  opacity: 0.85;
}

.crimson-map__error code {
  font-size: 0.85em;
  word-break: break-all;
}
</style>

<style>
/* Leaflet injects the compass outside SFC scoped boundaries */
.leaflet-container .crimson-map-compass-control {
  background: transparent;
  border: none;
  box-shadow: none;
  /* Southeast of zoom: below it in the stack, shifted east past the zoom bar */
  margin-top: 10px !important;
  margin-left: 52px !important;
}
</style>
