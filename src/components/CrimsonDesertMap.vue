<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  mapTilesManifestUrl,
  publicAssetUrl,
  type MapTilesManifest,
} from '../config/map'

const mapContainer = ref<HTMLElement | null>(null)
const loadError = ref(false)
const manifestUrl = mapTilesManifestUrl()
const tileUrlTemplate = publicAssetUrl('map/tiles/{z}/{x}/{y}.webp')
const landmarksUrl = publicAssetUrl('map/thgl-data/landmarks.geojson')
const regionBordersUrl = publicAssetUrl('map/thgl-data/region-borders.geojson')

/** "Regions of Pywel" style: thick brown rim + thin light center line (SVG stroke). */
const REGION_BORDER_OUTER = {
  color: '#8a4b2d',
  weight: 4,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  opacity: 1,
  fillOpacity: 0,
}
const REGION_BORDER_INNER = {
  color: '#f2f2f2',
  weight: 1.25,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  opacity: 1,
  fillOpacity: 0,
}

let map: L.Map | null = null
let cancelled = false
let resizeObserver: ResizeObserver | null = null
let resizeFitRaf = 0

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

      const bounds: L.LatLngBoundsExpression = [
        [0, 0],
        [h, w],
      ]

      map = L.map(el, {
        crs: L.CRS.Simple,
        minZoom: minNativeZoom,
        maxZoom: maxNativeZoom + 4,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        zoomControl: true,
        attributionControl: false,
        preferCanvas: false,
      })

      L.tileLayer(tileUrlTemplate, {
        tileSize,
        noWrap: true,
        minZoom: minNativeZoom,
        maxZoom: maxNativeZoom + 4,
        maxNativeZoom,
      }).addTo(map)

      const lg = await fetch(landmarksUrl)
      if (lg.ok) {
        const geo = (await lg.json()) as GeoJSON.GeoJSON
        L.geoJSON(geo, {
          pointToLayer(feature, latlng) {
            const layerName = (feature.properties as { layer?: string })?.layer
            const isRegion = layerName === 'regions'
            return L.circleMarker(latlng, {
              radius: isRegion ? 5 : 4,
              color: isRegion ? '#7eb8da' : '#a68b5b',
              weight: 1,
              fillColor: isRegion ? '#3d5c73' : '#f0e6d2',
              fillOpacity: 0.9,
            })
          },
          onEachFeature(feature, layer) {
            const name = (feature.properties as { name?: string })?.name
            if (name) layer.bindPopup(name)
          },
        }).addTo(map)
      }

      const rb = await fetch(regionBordersUrl)
      if (rb.ok) {
        const borderGeo = (await rb.json()) as GeoJSON.GeoJSON
        L.geoJSON(borderGeo, {
          style: () => ({
            ...REGION_BORDER_OUTER,
            interactive: false,
          }),
        }).addTo(map)
        L.geoJSON(borderGeo, {
          style: () => ({
            ...REGION_BORDER_INNER,
            interactive: true,
          }),
          onEachFeature(feature, layer) {
            const label = (feature.properties as { label?: string })?.label
            if (label) layer.bindPopup(label)
          },
        }).addTo(map)
      }

      const fit = () => {
        if (!map || cancelled) return
        const pane = mapContainer.value
        if (!pane) return
        const { width, height } = pane.getBoundingClientRect()
        if (width < 32 || height < 32) return
        map.invalidateSize()
        map.fitBounds(bounds, { animate: false, padding: [8, 8] })
      }

      map.fitBounds(bounds)

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
