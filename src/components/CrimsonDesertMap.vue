<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { mapImageUrl } from '../config/map'

const mapContainer = ref<HTMLElement | null>(null)
const loadError = ref(false)
const imageUrl = mapImageUrl()

let map: L.Map | null = null
let cancelled = false

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Map image failed to load'))
    img.src = src
  })
}

onMounted(() => {
  const el = mapContainer.value
  if (!el) return

  void (async () => {
    try {
      const { width, height } = await loadImageDimensions(imageUrl)
      if (cancelled || mapContainer.value !== el) return

      const bounds: L.LatLngBoundsExpression = [
        [0, 0],
        [height, width],
      ]

      map = L.map(el, {
        crs: L.CRS.Simple,
        minZoom: -4,
        maxZoom: 6,
        zoomControl: true,
        attributionControl: false,
      })

      L.imageOverlay(imageUrl, bounds).addTo(map)
      map.fitBounds(bounds)
      map.setMaxBounds(bounds)

      await nextTick()
      requestAnimationFrame(() => {
        map?.invalidateSize()
        map?.fitBounds(bounds)
      })
    } catch {
      loadError.value = true
    }
  })()
})

onUnmounted(() => {
  cancelled = true
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
      <p>Could not load the map image.</p>
      <p class="crimson-map__hint">
        Expected file at <code>{{ imageUrl }}</code> (see <code>public/map/</code> and
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
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-height: 0;
}

.crimson-map__pane {
  flex: 1;
  width: 100%;
  min-height: 0;
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
