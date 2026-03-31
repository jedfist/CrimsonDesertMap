<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import type { UserMarkerRecord } from '../lib/userMarkers'
import { escapeHtml, matchesMarkerSearch } from '../lib/mapMarkersShared'
import {
  buildThglFilterLookup,
  DEFAULT_USER_THGL_FILTER_KEY,
  type ThglMapFiltersPayload,
  thglFilterLabel,
  thglSpriteInlineStyle,
} from '../lib/thglMapFilters'

const props = defineProps<{
  map: object
  markers: UserMarkerRecord[]
  showUser: boolean
  searchQuery: string
  placeMode: boolean
  placeMarkerKind: string
  selectedUserId: string | null
  thglFilters: ThglMapFiltersPayload | null
}>()

const emit = defineEmits<{
  'update:markers': [markers: UserMarkerRecord[]]
  'update:placeMode': [v: boolean]
  'update:selectedUserId': [id: string | null]
}>()

const map = props.map as L.Map

let group: L.LayerGroup | null = null
const leafletById = new Map<string, L.Marker>()
const PLACE_MODE_CLASS = 'crimson-map--place-mode'

function lookupOrEmpty() {
  return props.thglFilters
    ? buildThglFilterLookup(props.thglFilters.groups)
    : new Map()
}

function userSpriteDivIcon(filterKey: string, selected: boolean): L.DivIcon {
  const payload = props.thglFilters
  const lookup = lookupOrEmpty()
  const key = lookup.has(filterKey) ? filterKey : DEFAULT_USER_THGL_FILTER_KEY
  const parsed = key.split('/')
  const aria = escapeHtml(
    parsed.length >= 2 ? thglFilterLabel(parsed[0]!, parsed[1]!) : key,
  )
  const sel = selected ? ' map-user-marker__sprite-root--selected' : ''
  const sprite =
    payload && thglSpriteInlineStyle(key, payload, lookup, 32)
  const displayPx = sprite?.displayPx ?? 32
  const inner = sprite
    ? `<span class="map-user-marker__sprite" style="${sprite.css}"></span>`
    : `<span class="map-user-marker__sprite-fallback" aria-hidden="true"></span>`
  const html = `<div class="map-user-marker__sprite-root${sel}" role="img" aria-label="${aria}">${inner}</div>`
  return L.divIcon({
    className: 'map-user-marker__wrap',
    html,
    iconSize: [displayPx, displayPx],
    iconAnchor: [Math.round(displayPx / 2), displayPx],
  })
}

function popupHtml(m: UserMarkerRecord): string {
  const parts = m.kind.split('/')
  const kindLine =
    parts.length >= 2
      ? escapeHtml(thglFilterLabel(parts[0]!, parts[1]!))
      : escapeHtml(m.kind)
  const title = escapeHtml(m.title || 'Untitled')
  const notesBlock = m.notes
    ? `<p class="map-user-marker__popup-notes">${escapeHtml(m.notes)}</p>`
    : ''
  return `<div class="map-user-marker__popup"><div class="map-user-marker__popup-kind">${kindLine}</div><strong class="map-user-marker__popup-title">${title}</strong>${notesBlock}</div>`
}

function visible(m: UserMarkerRecord): boolean {
  if (!props.showUser) return false
  const parts = m.kind.split('/')
  const kindSearch =
    parts.length >= 2 ? thglFilterLabel(parts[0]!, parts[1]!) : m.kind
  return matchesMarkerSearch(
    props.searchQuery,
    m.title,
    m.notes,
    m.kind,
    kindSearch,
  )
}

function setMarkers(next: UserMarkerRecord[]) {
  emit('update:markers', next)
}

function onMapClickPlace(e: L.LeafletMouseEvent) {
  if (!props.placeMode) return
  const id = crypto.randomUUID()
  const rec: UserMarkerRecord = {
    id,
    lat: e.latlng.lat,
    lng: e.latlng.lng,
    kind: props.placeMarkerKind,
    title: 'New marker',
    notes: '',
    updatedAt: new Date().toISOString(),
  }
  setMarkers([...props.markers, rec])
  emit('update:selectedUserId', id)
  emit('update:placeMode', false)
}

function syncLayers() {
  if (!group) return

  for (const [, ly] of leafletById) {
    group.removeLayer(ly)
    ly.remove()
  }
  leafletById.clear()

  for (const m of props.markers) {
    if (!visible(m)) continue
    const latlng = L.latLng(m.lat, m.lng)
    const selected = m.id === props.selectedUserId
    const marker = L.marker(latlng, {
      icon: userSpriteDivIcon(m.kind, selected),
      draggable: true,
      zIndexOffset: selected ? 2500 : 2000,
    })
    marker.bindPopup(popupHtml(m), {
      className: 'map-user-marker__popup-wrap',
      maxWidth: 280,
    })
    marker.on('click', (ev: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(ev.originalEvent)
      emit('update:selectedUserId', m.id)
      marker.openPopup()
    })
    marker.on('dragend', () => {
      const ll = marker.getLatLng()
      const next = props.markers.map((x) =>
        x.id === m.id
          ? {
              ...x,
              lat: ll.lat,
              lng: ll.lng,
              updatedAt: new Date().toISOString(),
            }
          : x,
      )
      setMarkers(next)
    })
    marker.addTo(group)
    leafletById.set(m.id, marker)
  }
}

function syncPlaceModeClass() {
  const el = map.getContainer()
  if (props.placeMode) el.classList.add(PLACE_MODE_CLASS)
  else el.classList.remove(PLACE_MODE_CLASS)
}

onMounted(() => {
  group = L.layerGroup().addTo(map)
  map.on('click', onMapClickPlace)
  syncLayers()
  syncPlaceModeClass()
})

onUnmounted(() => {
  map.off('click', onMapClickPlace)
  map.getContainer().classList.remove(PLACE_MODE_CLASS)
  leafletById.clear()
  group?.remove()
  group = null
})

watch(
  () =>
    [
      props.markers,
      props.showUser,
      props.searchQuery,
      props.selectedUserId,
      props.thglFilters,
    ] as const,
  () => syncLayers(),
  { deep: true },
)

watch(
  () => props.placeMode,
  () => syncPlaceModeClass(),
)

defineExpose({
  flyToUser(lat: number, lng: number) {
    const ll = L.latLng(lat, lng)
    const z = Math.min(
      map.getMaxZoom() - 1,
      Math.max(map.getMinZoom() + 2, map.getZoom() + 1),
    )
    map.flyTo(ll, z, { duration: 0.45 })
  },
})
</script>

<template>
  <!-- Leaflet-only -->
</template>

<style>
.leaflet-container.crimson-map--place-mode {
  cursor: crosshair !important;
}

.leaflet-div-icon.map-user-marker__wrap {
  border: none;
  background: transparent;
  overflow: visible;
}

.map-user-marker__sprite-root {
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -100%);
  margin-left: 50%;
  pointer-events: auto;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.55));
}

.map-user-marker__sprite-root--selected .map-user-marker__sprite,
.map-user-marker__sprite-root--selected .map-user-marker__sprite-fallback {
  outline: 2px solid #b91c3c;
  outline-offset: 1px;
  border-radius: 4px;
}

.map-user-marker__sprite {
  display: block;
  flex-shrink: 0;
  image-rendering: crisp-edges;
}

.map-user-marker__sprite-fallback {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #e85a6e, #8f1228);
  box-shadow: 0 0 0 2px #1a1a1e;
}

.map-user-marker__popup-wrap .leaflet-popup-content-wrapper {
  background: #f4f0e8;
  border-radius: 6px;
  border: 1px solid #c4bdb0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.map-user-marker__popup-wrap .leaflet-popup-tip {
  background: #f4f0e8;
  border: 1px solid #c4bdb0;
}

.map-user-marker__popup {
  margin: 0.15rem 0.1rem;
  color: #1a1a1e;
  min-width: 10rem;
}

.map-user-marker__popup-kind {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #6b2230;
  margin-bottom: 0.35rem;
}

.map-user-marker__popup-title {
  display: block;
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.map-user-marker__popup-notes {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  line-height: 1.35;
  white-space: pre-wrap;
}
</style>
