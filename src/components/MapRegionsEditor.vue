<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import { borderRegionsDataUrl } from '../config/map'
import type { BorderRegion } from '../lib/borderRegions'
import {
  closeRingLngLat,
  closedRingFromOpen,
  DEFAULT_REGION_FILL,
  DEFAULT_REGION_FILL_OPACITY,
  DEFAULT_REGION_STROKE,
  latLngsToRing,
  parseBorderRegions,
  regionPathStyle,
  ringOpenLngLat,
  ringToLatLngTuples,
  serializeBorderRegions,
} from '../lib/borderRegions'

const props = defineProps<{ map: object }>()
/** Leaflet `L.map()` return type is structurally incompatible with `L.Map` under vue-tsc. */
const map = props.map as L.Map

const regions = ref<BorderRegion[]>([])
const editMode = ref(false)
const sketch = ref<{ name: string; vertices: L.LatLng[] } | null>(null)
const selectedId = ref<string | null>(null)
const loadFailed = ref(false)
const isDev = import.meta.env.DEV
/** Dev-only: LowDB persists to public/map/thgl-data/border-regions.json */
const persistStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

let regionsGroup: L.LayerGroup | null = null
let vertexHandlesGroup: L.LayerGroup | null = null
let sketchLine: L.Polyline | null = null
const layersById = new Map<string, { polygon: L.Polygon; marker: L.Marker }>()
let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null
let persistSavedClearTimer: ReturnType<typeof setTimeout> | null = null

const SKETCH_LINE_COLOR_KEY = 'crimson-map-sketch-line-color'
const DEFAULT_SKETCH_LINE_COLOR = '#e8c547'

function readStoredSketchLineColor(): string {
  try {
    const s = localStorage.getItem(SKETCH_LINE_COLOR_KEY)
    if (typeof s === 'string' && s.startsWith('#') && s.length >= 4) return s
  } catch {
    /* private mode */
  }
  return DEFAULT_SKETCH_LINE_COLOR
}

const sketchLineColor = ref(readStoredSketchLineColor())

const selectedRegion = computed(() =>
  regions.value.find((r) => r.id === selectedId.value) ?? null
)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Leaflet needs a real iconSize + centered iconAnchor. A 1×1px icon with CSS
 * translate(-50%,-50%) drifts under zoom because zoom transforms don't compose
 * cleanly with percentage offsets on the divIcon.
 */
function estimateLabelIconSize(
  name: string,
  fontSizePx: number
): { w: number; h: number } {
  const padX = 10
  const approxChar = fontSizePx * 0.58
  const textW = name.length * approxChar + padX * 2
  const w = Math.min(560, Math.max(28, Math.ceil(textW)))
  const h = Math.ceil(fontSizePx * 1.45)
  return { w, h }
}

function labelDivIcon(region: BorderRegion): L.DivIcon {
  const fs = region.label.fontSizePx
  const { w, h } = estimateLabelIconSize(region.name, fs)
  const ax = Math.round(w / 2)
  const ay = Math.round(h / 2)
  return L.divIcon({
    className: 'map-regions-editor__label-wrap',
    html: `<span class="map-regions-editor__label-inner" style="font-size:${fs}px">${escapeHtml(region.name)}</span>`,
    iconSize: [w, h],
    iconAnchor: [ax, ay],
  })
}

function devSavePath(): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}__save/border-regions`
}

function schedulePersistToDatabase() {
  if (!isDev) return
  if (persistDebounceTimer) clearTimeout(persistDebounceTimer)
  persistDebounceTimer = setTimeout(() => {
    persistDebounceTimer = null
    void flushPersistToDatabase()
  }, 450)
}

async function flushPersistToDatabase() {
  persistStatus.value = 'saving'
  try {
    const r = await fetch(devSavePath(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializeBorderRegions({
        version: 1,
        regions: regions.value,
      }),
    })
    if (r.ok) {
      persistStatus.value = 'saved'
      if (persistSavedClearTimer) clearTimeout(persistSavedClearTimer)
      persistSavedClearTimer = setTimeout(() => {
        if (persistStatus.value === 'saved') persistStatus.value = 'idle'
        persistSavedClearTimer = null
      }, 2500)
    } else {
      persistStatus.value = 'error'
    }
  } catch {
    persistStatus.value = 'error'
  }
}

function syncSketchLine() {
  const s = sketch.value
  if (!sketchLine || !s) return
  sketchLine.setLatLngs(s.vertices.map((v) => [v.lat, v.lng]))
}

function undoSketchVertex() {
  const s = sketch.value
  if (!s || s.vertices.length === 0) return
  s.vertices.pop()
  syncSketchLine()
}

function setSketchLineColor(hex: string) {
  sketchLineColor.value = hex
}

watch(sketchLineColor, (c) => {
  try {
    localStorage.setItem(SKETCH_LINE_COLOR_KEY, c)
  } catch {
    /* ignore */
  }
  sketchLine?.setStyle({ color: c })
})

function updateMapDoubleClickZoom() {
  if (sketch.value) {
    map.doubleClickZoom.disable()
    return
  }
  if (editMode.value && selectedId.value) {
    map.doubleClickZoom.disable()
    return
  }
  map.doubleClickZoom.enable()
}

function clearSketch() {
  if (sketchLine) {
    map.removeLayer(sketchLine)
    sketchLine = null
  }
  sketch.value = null
  updateMapDoubleClickZoom()
}

function clearVertexHandles() {
  vertexHandlesGroup?.clearLayers()
}

function distPointSegPx(
  p: L.Point,
  a: L.Point,
  b: L.Point
): { distSq: number; t: number } {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const wx = p.x - a.x
  const wy = p.y - a.y
  const c2 = vx * vx + vy * vy
  let t = c2 > 1e-10 ? (wx * vx + wy * vy) / c2 : 0
  t = Math.max(0, Math.min(1, t))
  const qx = a.x + t * vx
  const qy = a.y + t * vy
  const dx = p.x - qx
  const dy = p.y - qy
  return { distSq: dx * dx + dy * dy, t }
}

function onPolygonDblClick(e: L.LeafletMouseEvent, region: BorderRegion) {
  if (!editMode.value || selectedId.value !== region.id || sketch.value) return
  L.DomEvent.stopPropagation(e)
  const ll = e.latlng
  const open = ringOpenLngLat(region.ring)
  if (open.length < 3) return
  const p = map.latLngToLayerPoint(ll)
  const n = open.length
  const maxDistSq = 22 * 22
  let bestD = Infinity
  let bestI = 0
  let bestT = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const a = L.latLng(open[i][1], open[i][0])
    const b = L.latLng(open[j][1], open[j][0])
    const pa = map.latLngToLayerPoint(a)
    const pb = map.latLngToLayerPoint(b)
    const { distSq, t } = distPointSegPx(p, pa, pb)
    if (distSq < bestD) {
      bestD = distSq
      bestI = i
      bestT = t
    }
  }
  if (bestD > maxDistSq) return
  const j = (bestI + 1) % n
  const lng = open[bestI][0] + bestT * (open[j][0] - open[bestI][0])
  const lat = open[bestI][1] + bestT * (open[j][1] - open[bestI][1])
  const insert: [number, number] = [lng, lat]
  const next = [
    ...open.slice(0, bestI + 1),
    insert,
    ...open.slice(bestI + 1),
  ]
  region.ring = closedRingFromOpen(next)
  const layers = layersById.get(region.id)
  layers?.polygon.setLatLngs(ringToLatLngTuples(region.ring))
  refreshVertexHandles()
  schedulePersistToDatabase()
}

function refreshVertexHandles() {
  clearVertexHandles()
  if (
    !vertexHandlesGroup ||
    !editMode.value ||
    !selectedId.value ||
    sketch.value
  ) {
    return
  }
  const region = regions.value.find((r) => r.id === selectedId.value)
  if (!region || !region.visible) return
  const layers = layersById.get(region.id)
  if (!layers) return

  const vg = vertexHandlesGroup
  const open = ringOpenLngLat(region.ring)
  open.forEach((pt, i) => {
    const m = L.marker(L.latLng(pt[1], pt[0]), {
      icon: vertexHandleIcon(),
      draggable: true,
      zIndexOffset: 2500,
    })
    m.on('drag', () => {
      const ll = m.getLatLng()
      const o = ringOpenLngLat(region.ring)
      if (i >= o.length) return
      o[i] = [ll.lng, ll.lat]
      region.ring = closedRingFromOpen(o)
      const lyr = layersById.get(region.id)
      lyr?.polygon.setLatLngs(ringToLatLngTuples(region.ring))
    })
    m.on('dragend', () => {
      schedulePersistToDatabase()
    })
    m.addTo(vg)
  })
}

function vertexHandleIcon(): L.DivIcon {
  return L.divIcon({
    className: 'map-regions-vertex-handle',
    html: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function applyRegionPolygonStyle(region: BorderRegion) {
  const layers = layersById.get(region.id)
  if (layers) layers.polygon.setStyle(regionPathStyle(region))
}

function mountRegionLayers(region: BorderRegion) {
  const poly = L.polygon(ringToLatLngTuples(region.ring), {
    ...regionPathStyle(region),
    interactive: true,
  })
  poly.on('click', (e: L.LeafletMouseEvent) => {
    if (!editMode.value) return
    L.DomEvent.stopPropagation(e)
    selectedId.value = region.id
  })
  poly.on('dblclick', (e: L.LeafletMouseEvent) => {
    onPolygonDblClick(e, region)
  })
  const marker = L.marker([region.label.lat, region.label.lng], {
    icon: labelDivIcon(region),
    draggable: true,
    zIndexOffset: 1000,
  })
  marker.on('dragend', () => {
    const ll = marker.getLatLng()
    region.label.lng = ll.lng
    region.label.lat = ll.lat
    schedulePersistToDatabase()
  })
  marker.on('click', (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e)
    selectedId.value = region.id
  })
  layersById.set(region.id, { polygon: poly, marker })
  if (region.visible && regionsGroup) {
    poly.addTo(regionsGroup)
    marker.addTo(regionsGroup)
  }
}

function setRegionVisible(region: BorderRegion, visible: boolean) {
  region.visible = visible
  const layers = layersById.get(region.id)
  if (!layers || !regionsGroup) return
  if (visible) {
    if (!regionsGroup.hasLayer(layers.polygon)) layers.polygon.addTo(regionsGroup)
    if (!regionsGroup.hasLayer(layers.marker)) layers.marker.addTo(regionsGroup)
  } else {
    regionsGroup.removeLayer(layers.polygon)
    regionsGroup.removeLayer(layers.marker)
  }
  schedulePersistToDatabase()
}

function teardownRegions() {
  clearVertexHandles()
  layersById.clear()
  regionsGroup?.clearLayers()
}

function onMapClick(e: L.LeafletMouseEvent) {
  if (!editMode.value || !sketch.value) return
  sketch.value.vertices.push(e.latlng)
  syncSketchLine()
}

function onMapDblClick(e: L.LeafletMouseEvent) {
  if (!editMode.value || !sketch.value) return
  L.DomEvent.stopPropagation(e)
  finishSketch()
}

function finishSketch() {
  const s = sketch.value
  if (!s || s.vertices.length < 3) return
  const ring = closeRingLngLat(latLngsToRing(s.vertices))
  const poly = L.polygon(ringToLatLngTuples(ring))
  const center = poly.getBounds().getCenter()
  const region: BorderRegion = {
    id: crypto.randomUUID(),
    name: s.name,
    visible: true,
    ring,
    label: { lng: center.lng, lat: center.lat, fontSizePx: 14 },
    strokeColor: sketchLineColor.value,
    fillColor: DEFAULT_REGION_FILL,
    fillOpacity: DEFAULT_REGION_FILL_OPACITY,
  }
  regions.value = [...regions.value, region]
  mountRegionLayers(region)
  clearSketch()
  schedulePersistToDatabase()
}

function startAddRegion() {
  if (!editMode.value) return
  const name = window.prompt('Region name')?.trim() ?? ''
  if (!name) return
  clearSketch()
  sketch.value = { name, vertices: [] }
  updateMapDoubleClickZoom()
  sketchLine = L.polyline([], {
    color: sketchLineColor.value,
    weight: 2,
    dashArray: '6 4',
  }).addTo(map)
}

function cancelSketch() {
  clearSketch()
}

function onFontSizeInput(px: number) {
  const r = selectedRegion.value
  if (!r) return
  r.label.fontSizePx = Math.min(32, Math.max(10, Math.round(px)))
  const layers = layersById.get(r.id)
  if (layers) layers.marker.setIcon(labelDivIcon(r))
  schedulePersistToDatabase()
}

function onRegionStrokeColor(hex: string) {
  const r = selectedRegion.value
  if (!r) return
  r.strokeColor = hex
  applyRegionPolygonStyle(r)
  schedulePersistToDatabase()
}

function onRegionFillColor(hex: string) {
  const r = selectedRegion.value
  if (!r) return
  r.fillColor = hex
  applyRegionPolygonStyle(r)
  schedulePersistToDatabase()
}

function onRegionFillOpacity(alpha: number) {
  const r = selectedRegion.value
  if (!r) return
  r.fillOpacity = Math.min(1, Math.max(0, alpha))
  applyRegionPolygonStyle(r)
  schedulePersistToDatabase()
}

function deleteRegion(region: BorderRegion) {
  if (!window.confirm(`Delete region "${region.name}"?`)) return
  const layers = layersById.get(region.id)
  if (layers && regionsGroup) {
    regionsGroup.removeLayer(layers.polygon)
    regionsGroup.removeLayer(layers.marker)
  }
  layersById.delete(region.id)
  regions.value = regions.value.filter((x) => x.id !== region.id)
  if (selectedId.value === region.id) selectedId.value = null
  schedulePersistToDatabase()
}

function downloadJson() {
  const data = { version: 1 as const, regions: regions.value }
  const blob = new Blob([serializeBorderRegions(data)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'border-regions.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

function selectRow(id: string) {
  selectedId.value = id
}

async function loadRegions() {
  loadFailed.value = false
  try {
    const res = await fetch(borderRegionsDataUrl())
    if (!res.ok) throw new Error('fetch failed')
    const parsed = parseBorderRegions(await res.json())
    teardownRegions()
    regions.value = parsed.regions
    for (const r of regions.value) mountRegionLayers(r)
    refreshVertexHandles()
  } catch {
    loadFailed.value = true
  }
}

watch(editMode, (on) => {
  if (!on) clearSketch()
  updateMapDoubleClickZoom()
  refreshVertexHandles()
})

watch(selectedId, () => {
  updateMapDoubleClickZoom()
  refreshVertexHandles()
})

watch(
  () => sketch.value,
  () => {
    updateMapDoubleClickZoom()
    refreshVertexHandles()
  }
)

onMounted(() => {
  regionsGroup = L.layerGroup().addTo(map)
  vertexHandlesGroup = L.layerGroup().addTo(map)
  map.on('click', onMapClick)
  map.on('dblclick', onMapDblClick)
  void loadRegions()
  updateMapDoubleClickZoom()
})

onUnmounted(() => {
  if (persistDebounceTimer) clearTimeout(persistDebounceTimer)
  if (persistSavedClearTimer) clearTimeout(persistSavedClearTimer)
  map.off('click', onMapClick)
  map.off('dblclick', onMapDblClick)
  clearSketch()
  teardownRegions()
  regionsGroup?.remove()
  regionsGroup = null
  vertexHandlesGroup?.remove()
  vertexHandlesGroup = null
})
</script>

<template>
  <div class="map-regions-editor" @click.stop @pointerdown.stop>
    <div class="map-regions-editor__panel">
      <h2 class="map-regions-editor__title">Border regions</h2>
      <p v-if="loadFailed" class="map-regions-editor__warn">
        Could not load border-regions.json.
      </p>

      <label class="map-regions-editor__row">
        <input v-model="editMode" type="checkbox" />
        <span>Edit mode</span>
      </label>

      <div v-if="editMode" class="map-regions-editor__tools">
        <label class="map-regions-editor__color-field">
          <span>Draw line</span>
          <input
            type="color"
            :value="sketchLineColor"
            title="Color while placing vertices"
            @input="setSketchLineColor(($event.target as HTMLInputElement).value)"
          />
        </label>
        <button type="button" class="map-regions-editor__btn" @click="startAddRegion">
          Add region
        </button>
        <button
          v-if="sketch"
          type="button"
          class="map-regions-editor__btn"
          @click="finishSketch"
        >
          Finish
        </button>
        <button
          v-if="sketch && sketch.vertices.length > 0"
          type="button"
          class="map-regions-editor__btn map-regions-editor__btn--ghost"
          @click="undoSketchVertex"
        >
          Undo point
        </button>
        <button
          v-if="sketch"
          type="button"
          class="map-regions-editor__btn map-regions-editor__btn--ghost"
          @click="cancelSketch"
        >
          Cancel draw
        </button>
        <p v-if="sketch" class="map-regions-editor__hint">
          Click vertices, then Finish or double-click. Ring auto-closes.
        </p>
      </div>

      <div class="map-regions-editor__list">
        <div
          v-for="r in regions"
          :key="r.id"
          class="map-regions-editor__item"
          :class="{ 'map-regions-editor__item--active': r.id === selectedId }"
          @click="selectRow(r.id)"
        >
          <label class="map-regions-editor__item-vis" @click.stop>
            <input
              type="checkbox"
              :checked="r.visible"
              @change="setRegionVisible(r, ($event.target as HTMLInputElement).checked)"
            />
          </label>
          <span class="map-regions-editor__item-name">{{ r.name }}</span>
          <button
            v-if="editMode"
            type="button"
            class="map-regions-editor__btn map-regions-editor__btn--danger map-regions-editor__btn--icon"
            title="Delete region"
            @click.stop="deleteRegion(r)"
          >
            ×
          </button>
        </div>
      </div>

      <p
        v-if="editMode && selectedRegion && !sketch"
        class="map-regions-editor__shape-hint"
      >
        Drag yellow handles to move corners. Double-click an edge (near the line)
        to add a vertex.
      </p>

      <div v-if="selectedRegion" class="map-regions-editor__style">
        <p class="map-regions-editor__style-title">Region colors</p>
        <label class="map-regions-editor__color-field">
          <span>Border</span>
          <input
            type="color"
            :value="selectedRegion.strokeColor ?? DEFAULT_REGION_STROKE"
            @input="onRegionStrokeColor(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="map-regions-editor__color-field">
          <span>Fill</span>
          <input
            type="color"
            :value="selectedRegion.fillColor ?? DEFAULT_REGION_FILL"
            @input="onRegionFillColor(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="map-regions-editor__opacity-field">
          <span>
            Fill opacity ({{
              Math.round(
                100 *
                  (selectedRegion.fillOpacity ?? DEFAULT_REGION_FILL_OPACITY)
              )
            }}%)
          </span>
          <input
            type="range"
            min="0"
            max="100"
            :value="
              Math.round(
                100 * (selectedRegion.fillOpacity ?? DEFAULT_REGION_FILL_OPACITY)
              )
            "
            @input="
              onRegionFillOpacity(
                Number(($event.target as HTMLInputElement).value) / 100
              )
            "
          />
        </label>
      </div>

      <div v-if="selectedRegion" class="map-regions-editor__font">
        <label class="map-regions-editor__font-label">
          Label size ({{ selectedRegion.label.fontSizePx }}px)
          <input
            type="range"
            min="10"
            max="32"
            :value="selectedRegion.label.fontSizePx"
            @input="onFontSizeInput(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>

      <div class="map-regions-editor__save">
        <p v-if="isDev" class="map-regions-editor__persist">
          <span v-if="persistStatus === 'idle'" class="map-regions-editor__persist-idle">
            LowDB: edits auto-save to <code>border-regions.json</code> (commit to keep).
          </span>
          <span v-else-if="persistStatus === 'saving'" class="map-regions-editor__persist-saving">
            Saving…
          </span>
          <span v-else-if="persistStatus === 'saved'" class="map-regions-editor__persist-saved">
            Saved to repo file.
          </span>
          <span v-else class="map-regions-editor__persist-err">
            Save failed — use Download or check the dev server.
          </span>
        </p>
        <button type="button" class="map-regions-editor__btn" @click="downloadJson">
          Download border-regions.json
        </button>
        <p v-if="isDev" class="map-regions-editor__hint">
          Production builds cannot write disk; use dev or Download.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-regions-editor {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 1000;
  max-width: min(18rem, calc(100% - 3rem));
  pointer-events: none;
}

.map-regions-editor__panel {
  pointer-events: auto;
  padding: 0.65rem 0.75rem;
  border-radius: 6px;
  border: 1px solid #3d3d44;
  background: rgba(18, 18, 20, 0.92);
  color: #e8e6e3;
  font-size: 0.8rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.map-regions-editor__title {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.map-regions-editor__warn {
  margin: 0 0 0.5rem;
  color: #e8a598;
  font-size: 0.75rem;
}

.map-regions-editor__row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.45rem;
  cursor: pointer;
  user-select: none;
}

.map-regions-editor__tools {
  margin-bottom: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.map-regions-editor__btn {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #5a7a8f;
  background: #2a3d4a;
  color: #e8e6e3;
  font-size: 0.75rem;
  cursor: pointer;
}

.map-regions-editor__btn:hover {
  background: #354e5e;
}

.map-regions-editor__btn--ghost {
  border-color: #4a4a52;
  background: transparent;
}

.map-regions-editor__btn--danger {
  border-color: #6b3a38;
  color: #f0c4c0;
  background: rgba(120, 48, 48, 0.35);
  padding: 0.1rem 0.35rem;
  min-width: 1.5rem;
  line-height: 1.2;
}

.map-regions-editor__btn--danger:hover {
  background: rgba(140, 56, 56, 0.5);
}

.map-regions-editor__btn--icon {
  flex-shrink: 0;
  font-size: 1rem;
  font-weight: 700;
}

.map-regions-editor__color-field,
.map-regions-editor__opacity-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  font-size: 0.72rem;
  opacity: 0.95;
}

.map-regions-editor__color-field input[type='color'] {
  width: 2rem;
  height: 1.35rem;
  padding: 0;
  border: 1px solid #4a4a52;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.map-regions-editor__opacity-field input[type='range'] {
  flex: 1;
  min-width: 0;
}

.map-regions-editor__style {
  margin-bottom: 0.5rem;
  padding-top: 0.35rem;
  border-top: 1px solid #2d2d32;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.map-regions-editor__style-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.9;
}

.map-regions-editor__shape-hint {
  margin: 0 0 0.45rem;
  padding: 0.35rem 0.4rem;
  border-radius: 4px;
  background: rgba(126, 184, 218, 0.1);
  border: 1px solid rgba(126, 184, 218, 0.25);
  font-size: 0.68rem;
  line-height: 1.35;
  color: #c9dde8;
}

.map-regions-editor__hint {
  margin: 0.35rem 0 0;
  width: 100%;
  font-size: 0.7rem;
  opacity: 0.8;
  line-height: 1.35;
}

.map-regions-editor__hint code {
  font-size: 0.68em;
  word-break: break-all;
}

.map-regions-editor__list {
  max-height: 10rem;
  overflow-y: auto;
  margin-bottom: 0.45rem;
  border-top: 1px solid #2d2d32;
  padding-top: 0.35rem;
}

.map-regions-editor__item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.15rem;
  border-radius: 4px;
  cursor: pointer;
}

.map-regions-editor__item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.map-regions-editor__item--active {
  background: rgba(126, 184, 218, 0.12);
}

.map-regions-editor__item-vis {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.map-regions-editor__item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-regions-editor__font {
  margin-bottom: 0.5rem;
  padding-top: 0.35rem;
  border-top: 1px solid #2d2d32;
}

.map-regions-editor__font-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  opacity: 0.95;
}

.map-regions-editor__font-label input {
  width: 100%;
}

.map-regions-editor__save {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid #2d2d32;
}

.map-regions-editor__persist {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  line-height: 1.35;
  opacity: 0.9;
}

.map-regions-editor__persist-saved {
  color: #9bc99b;
}

.map-regions-editor__persist-saving {
  color: #c9c5bd;
}

.map-regions-editor__persist-err {
  color: #e8a598;
}

.map-regions-editor__persist code {
  font-size: 0.68em;
  word-break: break-all;
}
</style>

<style>
/* Global: Leaflet divIcon is not scoped */
.leaflet-div-icon.map-regions-editor__label-wrap {
  border: none;
  background: transparent;
  display: flex !important;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  pointer-events: auto;
  cursor: grab;
}

.map-regions-editor__label-inner {
  display: block;
  white-space: nowrap;
  line-height: 1.15;
  font-weight: 600;
  color: #f0e6d2;
  text-shadow:
    0 0 4px #1a1a1e,
    0 1px 2px #1a1a1e;
  pointer-events: none;
}

.leaflet-div-icon.map-regions-editor__label-wrap:active {
  cursor: grabbing;
}

.leaflet-div-icon.map-regions-vertex-handle {
  border-radius: 50%;
  background: #fff;
  border: 2px solid #e8c547;
  box-sizing: border-box;
  box-shadow: 0 0 0 1px rgba(26, 26, 30, 0.9);
  cursor: grab;
}

.leaflet-div-icon.map-regions-vertex-handle:active {
  cursor: grabbing;
}
</style>
