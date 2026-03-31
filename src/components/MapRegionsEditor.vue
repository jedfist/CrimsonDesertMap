<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import { borderRegionsDataUrl } from '../config/map'
import type { BorderRegion } from '../lib/borderRegions'
import { labelFontCssFamily, labelIconWidthFactor } from '../lib/mapLabelFonts'
import {
  isPolylineRegion,
  parseBorderRegions,
  polylineClosedFillRingLngLat,
  polylineFillPolygonStyle,
  polylineHighlightStyle,
  polylineStrokeStyle,
  regionPathStyle,
  ringToLatLngTuples,
} from '../lib/borderRegions'

const props = defineProps<{ map: object }>()
/** Leaflet `L.map()` return type is structurally incompatible with `L.Map` under vue-tsc. */
const map = props.map as L.Map

let regionsGroup: L.LayerGroup | null = null

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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
    className: 'map-regions-overlay__label-wrap',
    html: `<span class="map-regions-overlay__label-inner" style="font-size:${fs}px;font-family:${safeFamily}">${escapeHtml(region.name)}</span>`,
    iconSize: [w, h],
    iconAnchor: [ax, ay],
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
          interactive: false,
        })
      }
    }
  }
  const path = isPolylineRegion(region)
    ? L.polyline(latlngs, {
        ...polylineStrokeStyle(region),
        interactive: false,
      })
    : L.polygon(latlngs, {
        ...regionPathStyle(region),
        interactive: false,
      })
  const marker = L.marker([region.label.lat, region.label.lng], {
    icon: labelDivIcon(region),
    draggable: false,
    interactive: false,
    zIndexOffset: 1000,
  })
  if (region.visible && regionsGroup) {
    if (lineHighlight) lineHighlight.addTo(regionsGroup)
    if (interiorFill) interiorFill.addTo(regionsGroup)
    path.addTo(regionsGroup)
    marker.addTo(regionsGroup)
    if (isPolylineRegion(region)) {
      restackPolylineStack({
        path,
        marker,
        ...(lineHighlight && { lineHighlight }),
        ...(interiorFill && { interiorFill }),
      })
    }
  }
}

function teardownRegions() {
  regionsGroup?.clearLayers()
}

async function loadRegions() {
  try {
    const res = await fetch(borderRegionsDataUrl())
    if (!res.ok) throw new Error('fetch failed')
    const parsed = parseBorderRegions(await res.json())
    teardownRegions()
    for (const r of parsed.regions) mountRegionLayers(r)
  } catch {
    console.error('Could not load border-regions data')
  }
}

onMounted(() => {
  regionsGroup = L.layerGroup().addTo(map)
  void loadRegions()
})

onUnmounted(() => {
  teardownRegions()
  regionsGroup?.remove()
  regionsGroup = null
})
</script>

<template>
  <!-- Geometry and labels render on the Leaflet map only -->
</template>

<style>
/* Global: Leaflet divIcon is not scoped */
.leaflet-div-icon.map-regions-overlay__label-wrap {
  border: none;
  background: transparent;
  display: flex !important;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  pointer-events: none;
}

.map-regions-overlay__label-inner {
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
</style>
