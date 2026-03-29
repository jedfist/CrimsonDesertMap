<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import { borderRegionsDataUrl } from '../config/map'
import type { BorderGeometryKind, BorderRegion } from '../lib/borderRegions'
import {
  DEFAULT_LABEL_FONT_ID,
  fontsInCategory,
  labelFontCssFamily,
  labelIconWidthFactor,
  MAP_LABEL_FONT_GROUPS,
} from '../lib/mapLabelFonts'
import {
  closeRingLngLat,
  DEFAULT_LINE_HIGHLIGHT_COLOR,
  DEFAULT_REGION_FILL,
  DEFAULT_REGION_FILL_OPACITY,
  DEFAULT_REGION_STROKE,
  isPolylineRegion,
  latLngsToRing,
  parseBorderRegions,
  pathFromOpenVertices,
  pathVerticesOpen,
  polylineClosedFillRingLngLat,
  polylineFillPolygonStyle,
  polylineHighlightStyle,
  polylineStrokeStyle,
  regionPathStyle,
  ringToLatLngTuples,
  serializeBorderRegions,
} from '../lib/borderRegions'

const props = defineProps<{ map: object }>()
/** Leaflet `L.map()` return type is structurally incompatible with `L.Map` under vue-tsc. */
const map = props.map as L.Map

const regions = ref<BorderRegion[]>([])
const editMode = ref(false)
const sketch = ref<{
  name: string
  vertices: L.LatLng[]
  kind: BorderGeometryKind
} | null>(null)
/** When true, "Add region" creates an open polyline (≥2 points, no fill, no auto-close). */
const drawOpenLine = ref(false)
const selectedId = ref<string | null>(null)
const loadFailed = ref(false)
const isDev = import.meta.env.DEV
/** Dev-only: LowDB persists to public/map/thgl-data/border-regions.json */
const persistStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

let regionsGroup: L.LayerGroup | null = null
let vertexHandlesGroup: L.LayerGroup | null = null
let sketchLine: L.Polyline | null = null
const layersById = new Map<
  string,
  {
    path: L.Polygon | L.Polyline
    lineHighlight?: L.Polyline
    interiorFill?: L.Polygon
    marker: L.Marker
  }
>()
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

function geometryKindOf(r: BorderRegion): BorderGeometryKind {
  return isPolylineRegion(r) ? 'polyline' : 'polygon'
}

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
  fontSizePx: number,
  widthFactor = 1
): { w: number; h: number } {
  const padX = 10
  const approxChar = fontSizePx * 0.58 * widthFactor
  const textW = name.length * approxChar + padX * 2
  const w = Math.min(560, Math.max(28, Math.ceil(textW)))
  const h = Math.ceil(fontSizePx * 1.45)
  return { w, h }
}

function labelDivIcon(region: BorderRegion): L.DivIcon {
  const fs = region.label.fontSizePx
  const factor = labelIconWidthFactor(region.label.fontFamilyId)
  const { w, h } = estimateLabelIconSize(region.name, fs, factor)
  const ax = Math.round(w / 2)
  const ay = Math.round(h / 2)
  const family = labelFontCssFamily(region.label.fontFamilyId)
  const safeFamily = family.replace(/"/g, '&quot;')
  return L.divIcon({
    className: 'map-regions-editor__label-wrap',
    html: `<span class="map-regions-editor__label-inner" style="font-size:${fs}px;font-family:${safeFamily}">${escapeHtml(region.name)}</span>`,
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

function onPathDblClick(e: L.LeafletMouseEvent, region: BorderRegion) {
  if (!editMode.value || selectedId.value !== region.id || sketch.value) return
  L.DomEvent.stopPropagation(e)
  const ll = e.latlng
  const kind = geometryKindOf(region)
  const open = pathVerticesOpen(region.ring, kind)
  const minVerts = kind === 'polyline' ? 2 : 3
  if (open.length < minVerts) return
  const p = map.latLngToLayerPoint(ll)
  const n = open.length
  const maxDistSq = 22 * 22
  let bestD = Infinity
  let bestI = 0
  let bestT = 0
  const useClosingPolylineSeg =
    kind === 'polyline' && !!region.polylineFill && n >= 3
  const segCount =
    kind === 'polyline' ? (useClosingPolylineSeg ? n : n - 1) : n
  for (let i = 0; i < segCount; i++) {
    let j: number
    if (kind === 'polygon') {
      j = (i + 1) % n
    } else if (useClosingPolylineSeg && i === n - 1) {
      j = 0
    } else {
      j = i + 1
    }
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
  let j: number
  if (kind === 'polygon') {
    j = (bestI + 1) % n
  } else if (useClosingPolylineSeg && bestI === n - 1) {
    j = 0
  } else {
    j = bestI + 1
  }
  const lng = open[bestI][0] + bestT * (open[j][0] - open[bestI][0])
  const lat = open[bestI][1] + bestT * (open[j][1] - open[bestI][1])
  const insert: [number, number] = [lng, lat]
  const next = [
    ...open.slice(0, bestI + 1),
    insert,
    ...open.slice(bestI + 1),
  ]
  region.ring = pathFromOpenVertices(next, kind)
  setPathLatLngsForRegion(region)
  refreshVertexHandles()
  schedulePersistToDatabase()
}

function bindRegionPathEvents(
  layer: L.Polyline | L.Polygon,
  region: BorderRegion
) {
  layer.on('click', (e: L.LeafletMouseEvent) => {
    if (!editMode.value) return
    L.DomEvent.stopPropagation(e)
    selectedId.value = region.id
  })
  layer.on('dblclick', (e: L.LeafletMouseEvent) => {
    onPathDblClick(e, region)
  })
}

function restackPolylineStack(layers: {
  lineHighlight?: L.Polyline
  interiorFill?: L.Polygon
  path: L.Polygon | L.Polyline
  marker: L.Marker
}) {
  const bringUp = (ly: unknown) =>
    (ly as { bringToFront(): void }).bringToFront()
  const bringDown = (ly: unknown) =>
    (ly as { bringToBack(): void }).bringToBack()
  if (layers.interiorFill) bringDown(layers.interiorFill)
  if (layers.lineHighlight) bringDown(layers.lineHighlight)
  bringUp(layers.path)
  bringUp(layers.marker)
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
  const kind = geometryKindOf(region)
  const open = pathVerticesOpen(region.ring, kind)
  open.forEach((pt, i) => {
    const m = L.marker(L.latLng(pt[1], pt[0]), {
      icon: vertexHandleIcon(),
      draggable: true,
      zIndexOffset: 2500,
    })
    m.on('drag', () => {
      const ll = m.getLatLng()
      const o = pathVerticesOpen(region.ring, kind)
      if (i >= o.length) return
      o[i] = [ll.lng, ll.lat]
      region.ring = pathFromOpenVertices(o, kind)
      setPathLatLngsForRegion(region)
    })
    m.on('dragend', () => {
      schedulePersistToDatabase()
    })
    m.addTo(vg)
  })
}

function setPathLatLngsForRegion(region: BorderRegion) {
  const ll = ringToLatLngTuples(region.ring)
  const layers = layersById.get(region.id)
  if (!layers) return
  layers.path.setLatLngs(ll)
  layers.lineHighlight?.setLatLngs(ll)
  const closedFill = polylineClosedFillRingLngLat(region)
  if (closedFill) {
    layers.interiorFill?.setLatLngs(ringToLatLngTuples(closedFill))
  }
  if (isPolylineRegion(region) && region.polylineFill) {
    const want = polylineFillPolygonStyle(region)
    if ((!want && layers.interiorFill) || (want && !layers.interiorFill)) {
      syncPolylineInteriorFill(region)
    }
  }
}

function syncPolylineHighlightLayer(region: BorderRegion) {
  const layers = layersById.get(region.id)
  if (!layers || !regionsGroup || !isPolylineRegion(region)) return
  const ll = ringToLatLngTuples(region.ring)
  const want = polylineHighlightStyle(region)

  if (layers.lineHighlight) {
    regionsGroup.removeLayer(layers.lineHighlight)
    layers.lineHighlight = undefined
  }
  if (want) {
    const h = L.polyline(ll, { ...want, interactive: false })
    layers.lineHighlight = h
    h.addTo(regionsGroup)
    restackPolylineStack(layers)
  }
}

function syncPolylineInteriorFill(region: BorderRegion) {
  const layers = layersById.get(region.id)
  if (!layers || !regionsGroup || !isPolylineRegion(region)) return
  const want = polylineFillPolygonStyle(region)

  if (layers.interiorFill) {
    regionsGroup.removeLayer(layers.interiorFill)
    layers.interiorFill = undefined
  }
  if (want) {
    const closed = polylineClosedFillRingLngLat(region)
    if (!closed) return
    const poly = L.polygon(ringToLatLngTuples(closed), {
      ...want,
      interactive: true,
    })
    bindRegionPathEvents(poly, region)
    layers.interiorFill = poly
    poly.addTo(regionsGroup)
    restackPolylineStack(layers)
  }
}

function vertexHandleIcon(): L.DivIcon {
  return L.divIcon({
    className: 'map-regions-vertex-handle',
    html: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function applyRegionPathStyle(region: BorderRegion) {
  const layers = layersById.get(region.id)
  if (!layers) return
  if (isPolylineRegion(region)) {
    layers.path.setStyle(polylineStrokeStyle(region))
    const want = polylineHighlightStyle(region)
    if (want && layers.lineHighlight) {
      layers.lineHighlight.setStyle({ ...want, interactive: false })
    } else if (want && !layers.lineHighlight) {
      syncPolylineHighlightLayer(region)
    } else if (!want && layers.lineHighlight) {
      syncPolylineHighlightLayer(region)
    }
    const fillWant = polylineFillPolygonStyle(region)
    if (fillWant && layers.interiorFill) {
      layers.interiorFill.setStyle({ ...fillWant, interactive: true })
    } else if (fillWant && !layers.interiorFill) {
      syncPolylineInteriorFill(region)
    } else if (!fillWant && layers.interiorFill) {
      syncPolylineInteriorFill(region)
    }
  } else {
    layers.path.setStyle(regionPathStyle(region))
  }
}

function mountRegionLayers(region: BorderRegion) {
  const latlngs = ringToLatLngTuples(region.ring)
  let lineHighlight: L.Polyline | undefined
  let interiorFill: L.Polygon | undefined
  if (isPolylineRegion(region)) {
    const hl = polylineHighlightStyle(region)
    if (hl) {
      lineHighlight = L.polyline(latlngs, { ...hl, interactive: false })
    }
    const fillSt = polylineFillPolygonStyle(region)
    if (fillSt) {
      const closed = polylineClosedFillRingLngLat(region)
      if (closed) {
        interiorFill = L.polygon(ringToLatLngTuples(closed), {
          ...fillSt,
          interactive: true,
        })
        bindRegionPathEvents(interiorFill, region)
      }
    }
  }
  const path = isPolylineRegion(region)
    ? L.polyline(latlngs, {
        ...polylineStrokeStyle(region),
        interactive: true,
      })
    : L.polygon(latlngs, {
        ...regionPathStyle(region),
        interactive: true,
      })
  bindRegionPathEvents(path, region)
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
  layersById.set(region.id, {
    path,
    marker,
    ...(lineHighlight && { lineHighlight }),
    ...(interiorFill && { interiorFill }),
  })
  if (region.visible && regionsGroup) {
    if (lineHighlight) lineHighlight.addTo(regionsGroup)
    if (interiorFill) interiorFill.addTo(regionsGroup)
    path.addTo(regionsGroup)
    marker.addTo(regionsGroup)
    if (isPolylineRegion(region)) {
      const stacked = layersById.get(region.id)
      if (stacked) restackPolylineStack(stacked)
    }
  }
}

function setRegionVisible(region: BorderRegion, visible: boolean) {
  region.visible = visible
  const layers = layersById.get(region.id)
  if (!layers || !regionsGroup) return
  if (visible) {
    if (
      layers.lineHighlight &&
      !regionsGroup.hasLayer(layers.lineHighlight)
    ) {
      layers.lineHighlight.addTo(regionsGroup)
    }
    if (
      layers.interiorFill &&
      !regionsGroup.hasLayer(layers.interiorFill)
    ) {
      layers.interiorFill.addTo(regionsGroup)
    }
    if (!regionsGroup.hasLayer(layers.path)) layers.path.addTo(regionsGroup)
    if (!regionsGroup.hasLayer(layers.marker)) layers.marker.addTo(regionsGroup)
    if (isPolylineRegion(region)) restackPolylineStack(layers)
  } else {
    if (layers.lineHighlight) regionsGroup.removeLayer(layers.lineHighlight)
    if (layers.interiorFill) regionsGroup.removeLayer(layers.interiorFill)
    regionsGroup.removeLayer(layers.path)
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
  if (!s) return
  const isLine = s.kind === 'polyline'
  if (isLine) {
    if (s.vertices.length < 2) return
  } else if (s.vertices.length < 3) {
    return
  }
  const ring = isLine
    ? latLngsToRing(s.vertices)
    : closeRingLngLat(latLngsToRing(s.vertices))
  const boundsLayer = isLine
    ? L.polyline(s.vertices.map((v) => [v.lat, v.lng] as [number, number]))
    : L.polygon(ringToLatLngTuples(ring))
  const center = boundsLayer.getBounds().getCenter()
  const region: BorderRegion = isLine
    ? {
        id: crypto.randomUUID(),
        name: s.name,
        visible: true,
        geometryKind: 'polyline',
        ring,
        label: { lng: center.lng, lat: center.lat, fontSizePx: 14 },
        strokeColor: sketchLineColor.value,
      }
    : {
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
  const isLine = drawOpenLine.value
  const name = window.prompt(isLine ? 'Line name' : 'Region name')?.trim() ?? ''
  if (!name) return
  clearSketch()
  sketch.value = {
    name,
    vertices: [],
    kind: isLine ? 'polyline' : 'polygon',
  }
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

function onRegionLabelNameInput() {
  const r = selectedRegion.value
  if (!r) return
  const layers = layersById.get(r.id)
  if (layers) layers.marker.setIcon(labelDivIcon(r))
  schedulePersistToDatabase()
}

function onRegionNameBlur() {
  const r = selectedRegion.value
  if (!r) return
  const t = r.name.trim()
  if (t !== r.name) r.name = t
  if (!r.name) r.name = 'Unnamed'
  const layers = layersById.get(r.id)
  if (layers) layers.marker.setIcon(labelDivIcon(r))
  schedulePersistToDatabase()
}

function onLabelFontSelect(e: Event) {
  const r = selectedRegion.value
  if (!r) return
  const v = (e.target as HTMLSelectElement).value
  if (v === DEFAULT_LABEL_FONT_ID) {
    delete r.label.fontFamilyId
  } else {
    r.label.fontFamilyId = v
  }
  const layers = layersById.get(r.id)
  if (layers) layers.marker.setIcon(labelDivIcon(r))
  schedulePersistToDatabase()
}

function onRegionStrokeColor(hex: string) {
  const r = selectedRegion.value
  if (!r) return
  r.strokeColor = hex
  applyRegionPathStyle(r)
  schedulePersistToDatabase()
}

function onRegionFillColor(hex: string) {
  const r = selectedRegion.value
  if (!r) return
  r.fillColor = hex
  applyRegionPathStyle(r)
  schedulePersistToDatabase()
}

function onRegionFillOpacity(alpha: number) {
  const r = selectedRegion.value
  if (!r) return
  r.fillOpacity = Math.min(1, Math.max(0, alpha))
  applyRegionPathStyle(r)
  schedulePersistToDatabase()
}

function onPolylineFillToggle(e: Event) {
  const r = selectedRegion.value
  if (!r || !isPolylineRegion(r)) return
  r.polylineFill = (e.target as HTMLInputElement).checked
  syncPolylineInteriorFill(r)
  schedulePersistToDatabase()
}

function onLineHighlightToggle(e: Event) {
  const r = selectedRegion.value
  if (!r || !isPolylineRegion(r)) return
  r.lineHighlight = (e.target as HTMLInputElement).checked
  syncPolylineHighlightLayer(r)
  schedulePersistToDatabase()
}

function onLineHighlightColorHex(hex: string) {
  const r = selectedRegion.value
  if (!r || !isPolylineRegion(r)) return
  r.lineHighlightColor = hex
  applyRegionPathStyle(r)
  schedulePersistToDatabase()
}

function onLineHighlightOpacityInput(alpha: number) {
  const r = selectedRegion.value
  if (!r || !isPolylineRegion(r)) return
  r.lineHighlightOpacity = Math.min(1, Math.max(0, alpha))
  applyRegionPathStyle(r)
  schedulePersistToDatabase()
}

function onLineHighlightWeightInput(px: number) {
  const r = selectedRegion.value
  if (!r || !isPolylineRegion(r)) return
  r.lineHighlightWeight = Math.min(48, Math.max(4, Math.round(px)))
  applyRegionPathStyle(r)
  schedulePersistToDatabase()
}

function deleteRegion(region: BorderRegion) {
  if (!window.confirm(`Delete region "${region.name}"?`)) return
  const layers = layersById.get(region.id)
  if (layers && regionsGroup) {
    if (layers.lineHighlight) regionsGroup.removeLayer(layers.lineHighlight)
    if (layers.interiorFill) regionsGroup.removeLayer(layers.interiorFill)
    regionsGroup.removeLayer(layers.path)
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
        <label class="map-regions-editor__row map-regions-editor__row--tools">
          <input v-model="drawOpenLine" type="checkbox" />
          <span>Open line only (no closed border / no fill)</span>
        </label>
        <label class="map-regions-editor__color-field">
          <span>Stroke</span>
          <input
            type="color"
            :value="sketchLineColor"
            title="Stroke color while placing points"
            @input="setSketchLineColor(($event.target as HTMLInputElement).value)"
          />
        </label>
        <button type="button" class="map-regions-editor__btn" @click="startAddRegion">
          {{ drawOpenLine ? 'Add line' : 'Add region' }}
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
          <template v-if="sketch.kind === 'polyline'">
            Click points along the path (at least 2), then Finish or double-click. Stays open — no
            fill, last point is not joined to the first.
          </template>
          <template v-else>
            Click vertices, then Finish or double-click. Ring auto-closes.
          </template>
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
          <span class="map-regions-editor__item-name">
            <span v-if="isPolylineRegion(r)" class="map-regions-editor__kind-tag" title="Open line"
              >╱</span
            >
            {{ r.name }}
          </span>
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
        <template v-if="isPolylineRegion(selectedRegion)">
          <template v-if="selectedRegion.polylineFill">
            Drag handles to move points. Double-click near any edge to insert a point, including the
            closing segment from the last point back to the first (area fill needs at least three
            points).
          </template>
          <template v-else>
            Drag handles to move points. Double-click a segment to insert a point (open path — no
            segment from last point back to the first).
          </template>
        </template>
        <template v-else>
          Drag yellow handles to move corners. Double-click an edge (near the line) to add a vertex.
        </template>
      </p>

      <div v-if="selectedRegion" class="map-regions-editor__style">
        <p class="map-regions-editor__style-title">
          {{ isPolylineRegion(selectedRegion) ? 'Line colors' : 'Region colors' }}
        </p>
        <label class="map-regions-editor__color-field">
          <span>Stroke</span>
          <input
            type="color"
            :value="selectedRegion.strokeColor ?? DEFAULT_REGION_STROKE"
            @input="onRegionStrokeColor(($event.target as HTMLInputElement).value)"
          />
        </label>
        <template
          v-if="!isPolylineRegion(selectedRegion) || selectedRegion.polylineFill"
        >
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
        </template>
      </div>

      <div
        v-if="selectedRegion && isPolylineRegion(selectedRegion)"
        class="map-regions-editor__line-hl"
      >
        <p class="map-regions-editor__style-title">Area inside path</p>
        <label class="map-regions-editor__row map-regions-editor__row--tools">
          <input
            type="checkbox"
            :checked="!!selectedRegion.polylineFill"
            @change="onPolylineFillToggle($event)"
          />
          <span>Highlight interior (closes last point to first; ≥3 points)</span>
        </label>
        <p class="map-regions-editor__style-title">Line highlight</p>
        <label class="map-regions-editor__row map-regions-editor__row--tools">
          <input
            type="checkbox"
            :checked="!!selectedRegion.lineHighlight"
            @change="onLineHighlightToggle($event)"
          />
          <span>Highlight band along path</span>
        </label>
        <template v-if="selectedRegion.lineHighlight">
          <label class="map-regions-editor__color-field">
            <span>Highlight color</span>
            <input
              type="color"
              :value="
                selectedRegion.lineHighlightColor ?? DEFAULT_LINE_HIGHLIGHT_COLOR
              "
              @input="
                onLineHighlightColorHex(($event.target as HTMLInputElement).value)
              "
            />
          </label>
          <label class="map-regions-editor__opacity-field">
            <span>
              Highlight opacity ({{
                Math.round(
                  100 * (selectedRegion.lineHighlightOpacity ?? 0.42)
                )
              }}%)
            </span>
            <input
              type="range"
              min="5"
              max="100"
              :value="
                Math.round(100 * (selectedRegion.lineHighlightOpacity ?? 0.42))
              "
              @input="
                onLineHighlightOpacityInput(
                  Number(($event.target as HTMLInputElement).value) / 100
                )
              "
            />
          </label>
          <label class="map-regions-editor__opacity-field">
            <span>
              Highlight width ({{ selectedRegion.lineHighlightWeight ?? 16 }}px)
            </span>
            <input
              type="range"
              min="4"
              max="48"
              :value="selectedRegion.lineHighlightWeight ?? 16"
              @input="
                onLineHighlightWeightInput(
                  Number(($event.target as HTMLInputElement).value)
                )
              "
            />
          </label>
          <p class="map-regions-editor__hint map-regions-editor__hint--nested">
            A wider, soft stroke under the line emphasizes the route (not a closed fill).
          </p>
        </template>
      </div>

      <div v-if="selectedRegion" class="map-regions-editor__label-meta">
        <label class="map-regions-editor__name-field">
          <span>Name</span>
          <input
            v-model="selectedRegion.name"
            type="text"
            class="map-regions-editor__name-input"
            maxlength="96"
            spellcheck="true"
            @input="onRegionLabelNameInput"
            @blur="onRegionNameBlur"
          />
        </label>
        <label class="map-regions-editor__font-select">
          <span>Label font</span>
          <select
            class="map-regions-editor__font-select-input"
            :value="
              selectedRegion.label.fontFamilyId ?? DEFAULT_LABEL_FONT_ID
            "
            @change="onLabelFontSelect($event)"
          >
            <template
              v-for="g in MAP_LABEL_FONT_GROUPS"
              :key="g.category"
            >
              <optgroup :label="g.label">
                <option
                  v-for="f in fontsInCategory(g.category)"
                  :key="f.id"
                  :value="f.id"
                >
                  {{ f.name }}
                </option>
              </optgroup>
            </template>
          </select>
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

.map-regions-editor__row--tools {
  width: 100%;
  margin-bottom: 0.35rem;
  font-size: 0.72rem;
  opacity: 0.95;
}

.map-regions-editor__kind-tag {
  display: inline-block;
  margin-right: 0.15rem;
  opacity: 0.75;
  font-size: 0.85em;
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

.map-regions-editor__line-hl {
  margin-bottom: 0.5rem;
  padding-top: 0.35rem;
  border-top: 1px solid #2d2d32;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.map-regions-editor__hint--nested {
  margin-top: 0.15rem;
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

.map-regions-editor__label-meta {
  margin-bottom: 0.5rem;
  padding-top: 0.35rem;
  border-top: 1px solid #2d2d32;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.map-regions-editor__name-field,
.map-regions-editor__font-select {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  opacity: 0.95;
}

.map-regions-editor__name-input,
.map-regions-editor__font-select-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem 0.4rem;
  border-radius: 4px;
  border: 1px solid #4a4a52;
  background: #1e1e22;
  color: #e8e6e3;
  font-size: 0.78rem;
}

.map-regions-editor__font-select-input {
  cursor: pointer;
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
