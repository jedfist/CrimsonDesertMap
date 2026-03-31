<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { UserMarkerRecord } from '../lib/userMarkers'
import {
  exportUserMarkersJson,
  importUserMarkersJson,
} from '../lib/userMarkers'
import {
  buildThglFilterLookup,
  DEFAULT_USER_THGL_FILTER_KEY,
  thglFilterKey,
  thglFilterLabel,
  thglSpriteInlineStyle,
  type ThglMapFiltersPayload,
} from '../lib/thglMapFilters'

export type UserMarkersExposed = {
  flyToUser: (lat: number, lng: number) => void
}

export type TreasuresOverlayExposed = {
  flyToTreasure: (
    lat: number,
    lng: number,
    nodeId?: string,
    treasureStableKey?: string,
  ) => void
  getTreasureRows: () => {
    nodeId: string
    lat: number
    lng: number
    thglKey: string
    treasureStableKey?: string
  }[]
  getTreasureCount: () => number
}

const props = defineProps<{
  userMarkersRef: UserMarkersExposed | null
  treasuresOverlayRef: TreasuresOverlayExposed | null
  treasuresDataTick: number
  searchQuery: string
  showUser: boolean
  showTreasures: boolean
  placeMode: boolean
  placeMarkerKind: string
  thglFilters: ThglMapFiltersPayload | null
  userMarkers: UserMarkerRecord[]
  selectedUserId: string | null
}>()

const emit = defineEmits<{
  'update:searchQuery': [v: string]
  'update:showUser': [v: boolean]
  'update:showTreasures': [v: boolean]
  'update:placeMode': [v: boolean]
  'update:placeMarkerKind': [v: string]
  'update:userMarkers': [v: UserMarkerRecord[]]
  'update:selectedUserId': [v: string | null]
}>()

const importError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

function userKindSearchLine(kind: string): string {
  const p = kind.split('/')
  return p.length >= 2 ? thglFilterLabel(p[0]!, p[1]!) : kind
}

const treasureRows = computed(() => {
  void props.treasuresDataTick
  void props.searchQuery
  void props.showTreasures
  return props.treasuresOverlayRef?.getTreasureRows() ?? []
})

const treasureTotal = computed(() => {
  void props.treasuresDataTick
  return props.treasuresOverlayRef?.getTreasureCount() ?? 0
})

const filteredUserMarkers = computed(() => {
  const q = props.searchQuery.trim().toLowerCase()
  if (!q) return props.userMarkers
  return props.userMarkers.filter((m) => {
    const kindL = userKindSearchLine(m.kind).toLowerCase()
    return (
      m.title.toLowerCase().includes(q) ||
      m.notes.toLowerCase().includes(q) ||
      m.kind.toLowerCase().includes(q) ||
      kindL.includes(q)
    )
  })
})

const selectedMarker = computed(
  () => props.userMarkers.find((m) => m.id === props.selectedUserId) ?? null,
)

const draftTitle = ref('')
const draftNotes = ref('')
const draftKind = ref<string>(DEFAULT_USER_THGL_FILTER_KEY)

watch(
  selectedMarker,
  (m) => {
    if (m) {
      draftTitle.value = m.title
      draftNotes.value = m.notes
      draftKind.value = m.kind
    } else if (!props.selectedUserId) {
      draftTitle.value = ''
      draftNotes.value = ''
    }
  },
  { immediate: true },
)

function onSelectUser(id: string | null) {
  emit('update:selectedUserId', id)
}

function saveUserEdits() {
  const id = props.selectedUserId
  if (!id) return
  const next = props.userMarkers.map((m) =>
    m.id === id
      ? {
          ...m,
          kind: draftKind.value,
          title: draftTitle.value.trim() || 'Untitled',
          notes: draftNotes.value,
          updatedAt: new Date().toISOString(),
        }
      : m,
  )
  emit('update:userMarkers', next)
}

function deleteSelected() {
  const id = props.selectedUserId
  if (!id) return
  emit(
    'update:userMarkers',
    props.userMarkers.filter((m) => m.id !== id),
  )
  emit('update:selectedUserId', null)
}

function flyToUser(lat: number, lng: number) {
  props.userMarkersRef?.flyToUser(lat, lng)
}

function flyToTreasure(
  lat: number,
  lng: number,
  nodeId?: string,
  treasureStableKey?: string,
) {
  props.treasuresOverlayRef?.flyToTreasure(
    lat,
    lng,
    nodeId,
    treasureStableKey,
  )
}

function triggerImport() {
  importError.value = ''
  fileInputRef.value?.click()
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const text = String(reader.result ?? '')
      const imported = importUserMarkersJson(text)
      const merged = [...props.userMarkers]
      for (const m of imported) {
        if (!merged.some((x) => x.id === m.id)) merged.push(m)
      }
      emit('update:userMarkers', merged)
    } catch {
      importError.value = 'Could not read that file.'
    }
  }
  reader.readAsText(file)
}

function exportMarkers() {
  const blob = new Blob([exportUserMarkersJson(props.userMarkers)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'crimson-desert-user-markers.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

function togglePlaceMode() {
  const next = !props.placeMode
  emit('update:placeMode', next)
  if (next) emit('update:selectedUserId', null)
}

function onPlaceModeEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !props.placeMode) return
  e.preventDefault()
  emit('update:placeMode', false)
}

watch(
  () => props.placeMode,
  (active) => {
    if (active) window.addEventListener('keydown', onPlaceModeEscape, true)
    else window.removeEventListener('keydown', onPlaceModeEscape, true)
  },
  { flush: 'post' },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onPlaceModeEscape, true)
})

function listMiniVueStyle(kind: string): Record<string, string> {
  const payload = props.thglFilters
  if (!payload) return {}
  const lookup = buildThglFilterLookup(payload.groups)
  return thglSpriteInlineStyle(kind, payload, lookup, 16)?.vueStyle ?? {}
}
</script>

<template>
  <aside
    class="map-markers-panel"
    aria-label="Map markers and treasures"
  >
    <h2 class="map-markers-panel__title">Markers</h2>

    <label class="map-markers-panel__field">
      <span class="map-markers-panel__label">Search</span>
      <input
        class="map-markers-panel__input"
        type="search"
        placeholder="Filter markers and treasures…"
        :value="searchQuery"
        @input="
          emit('update:searchQuery', ($event.target as HTMLInputElement).value)
        "
      />
    </label>

    <fieldset class="map-markers-panel__filters">
      <legend class="map-markers-panel__legend">Show on map</legend>
      <label class="map-markers-panel__check">
        <input
          type="checkbox"
          :checked="showUser"
          @change="
            emit('update:showUser', ($event.target as HTMLInputElement).checked)
          "
        />
        My markers
      </label>
      <label class="map-markers-panel__check">
        <input
          type="checkbox"
          :checked="showTreasures"
          @change="
            emit(
              'update:showTreasures',
              ($event.target as HTMLInputElement).checked,
            )
          "
        />
        Treasures (TH.GL)
      </label>
    </fieldset>

    <label class="map-markers-panel__field map-markers-panel__field--type">
      <span class="map-markers-panel__label">New marker type</span>
      <select
        class="map-markers-panel__select"
        :value="placeMarkerKind"
        :disabled="placeMode"
        @change="
          emit(
            'update:placeMarkerKind',
            ($event.target as HTMLSelectElement).value,
          )
        "
      >
        <template v-if="thglFilters?.groups?.length">
          <optgroup
            v-for="g in thglFilters.groups"
            :key="g.group"
            :label="g.group.replace(/_/g, ' ')"
          >
            <option
              v-for="v in g.values"
              :key="thglFilterKey(g.group, v.id)"
              :value="thglFilterKey(g.group, v.id)"
            >
              {{ v.id.replace(/_/g, ' ') }}
            </option>
          </optgroup>
        </template>
        <option
          v-else
          :value="DEFAULT_USER_THGL_FILTER_KEY"
        >
          camp
        </option>
      </select>
    </label>

    <div class="map-markers-panel__user-tools">
      <button
        type="button"
        class="map-markers-panel__btn"
        :class="{ 'map-markers-panel__btn--active': placeMode }"
        @click="togglePlaceMode"
      >
        {{ placeMode ? 'Click map to place…' : 'Place marker' }}
      </button>
      <button
        type="button"
        class="map-markers-panel__btn map-markers-panel__btn--ghost"
        @click="exportMarkers"
      >
        Export
      </button>
      <button
        type="button"
        class="map-markers-panel__btn map-markers-panel__btn--ghost"
        @click="triggerImport"
      >
        Import
      </button>
      <input
        ref="fileInputRef"
        type="file"
        accept="application/json,.json"
        class="map-markers-panel__file"
        @change="onImportFile"
      />
    </div>
    <p
      v-if="importError"
      class="map-markers-panel__err"
      role="alert"
    >
      {{ importError }}
    </p>

    <div
      v-if="selectedUserId && selectedMarker"
      class="map-markers-panel__editor"
    >
      <h3 class="map-markers-panel__subtitle">Edit marker</h3>
      <label class="map-markers-panel__field">
        <span class="map-markers-panel__label">Type</span>
        <select
          v-model="draftKind"
          class="map-markers-panel__select"
        >
          <template v-if="thglFilters?.groups?.length">
            <optgroup
              v-for="g in thglFilters.groups"
              :key="'e-' + g.group"
              :label="g.group.replace(/_/g, ' ')"
            >
              <option
                v-for="v in g.values"
                :key="'e-' + thglFilterKey(g.group, v.id)"
                :value="thglFilterKey(g.group, v.id)"
              >
                {{ v.id.replace(/_/g, ' ') }}
              </option>
            </optgroup>
          </template>
          <option
            v-else
            :value="DEFAULT_USER_THGL_FILTER_KEY"
          >
            camp
          </option>
        </select>
      </label>
      <label class="map-markers-panel__field">
        <span class="map-markers-panel__label">Title</span>
        <input
          v-model="draftTitle"
          class="map-markers-panel__input"
          type="text"
          autocomplete="off"
        />
      </label>
      <label class="map-markers-panel__field">
        <span class="map-markers-panel__label">Notes</span>
        <textarea
          v-model="draftNotes"
          class="map-markers-panel__textarea"
          rows="3"
        />
      </label>
      <div class="map-markers-panel__row">
        <button
          type="button"
          class="map-markers-panel__btn"
          @click="saveUserEdits"
        >
          Save
        </button>
        <button
          type="button"
          class="map-markers-panel__btn map-markers-panel__btn--danger"
          @click="deleteSelected"
        >
          Delete
        </button>
      </div>
    </div>

    <div class="map-markers-panel__lists">
      <section
        v-if="showTreasures && treasureRows.length"
        class="map-markers-panel__section"
      >
        <h3 class="map-markers-panel__subtitle">
          Treasures ({{ treasureTotal }})
        </h3>
        <p class="map-markers-panel__list-note">
          Icons match
          <a
            class="map-markers-panel__ext"
            href="https://crimsondesert.th.gl/maps/Continent%20of%20Pywel"
            target="_blank"
            rel="noopener noreferrer"
            >TH.GL Crimson Desert</a
          >
          (sprite from ingested map-filters).
        </p>
        <ul class="map-markers-panel__list">
          <li
            v-for="(row, ti) in treasureRows"
            :key="
              't-' +
              (row.treasureStableKey ?? row.nodeId + '-' + row.lat + '-' + row.lng) +
              '-' +
              ti
            "
          >
            <button
              type="button"
              class="map-markers-panel__link map-markers-panel__link--user"
              @click="
                flyToTreasure(
                  row.lat,
                  row.lng,
                  row.nodeId,
                  row.treasureStableKey,
                )
              "
            >
              <span
                class="map-markers-panel__mini-icon"
                aria-hidden="true"
                :style="listMiniVueStyle(row.thglKey)"
              />
              <span class="map-markers-panel__link-text">
                <span class="map-markers-panel__link-kind">{{
                  userKindSearchLine(row.thglKey)
                }}</span>
                {{ row.nodeId }}
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section
        v-if="showUser && filteredUserMarkers.length"
        class="map-markers-panel__section"
      >
        <h3 class="map-markers-panel__subtitle">Yours</h3>
        <ul class="map-markers-panel__list">
          <li
            v-for="m in filteredUserMarkers"
            :key="m.id"
          >
            <button
              type="button"
              class="map-markers-panel__link map-markers-panel__link--user"
              :class="{
                'map-markers-panel__link--on': m.id === selectedUserId,
              }"
              @click="
                onSelectUser(m.id);
                flyToUser(m.lat, m.lng);
              "
            >
              <span
                class="map-markers-panel__mini-icon"
                aria-hidden="true"
                :style="listMiniVueStyle(m.kind)"
              />
              <span class="map-markers-panel__link-text">
                <span class="map-markers-panel__link-kind">{{
                  userKindSearchLine(m.kind)
                }}</span>
                {{ m.title || 'Untitled' }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.map-markers-panel {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  width: min(18rem, calc(100vw - 5.5rem));
  z-index: 1200;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem;
  background: rgba(18, 18, 20, 0.94);
  border: 1px solid #2d2d32;
  border-radius: 6px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  color: #e8e6e3;
  font-size: 0.8125rem;
  overflow: hidden;
}

.map-markers-panel__title {
  margin: 0;
  font-family: Cinzel, 'Times New Roman', serif;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #e8e6e3;
}

.map-markers-panel__subtitle {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #8a8680;
}

.map-markers-panel__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.map-markers-panel__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7a7670;
}

.map-markers-panel__input,
.map-markers-panel__textarea,
.map-markers-panel__select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem 0.45rem;
  border: 1px solid #3d3d42;
  border-radius: 4px;
  background: #121214;
  color: #e8e6e3;
  font: inherit;
}

.map-markers-panel__field--type {
  margin-bottom: 0;
}

.map-markers-panel__textarea {
  resize: vertical;
  min-height: 3.5rem;
}

.map-markers-panel__filters {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid #2d2d32;
  border-radius: 4px;
}

.map-markers-panel__legend {
  padding: 0 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #8a8680;
}

.map-markers-panel__check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.35rem;
  cursor: pointer;
}

.map-markers-panel__user-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.map-markers-panel__btn {
  padding: 0.35rem 0.55rem;
  border: 1px solid #4a2a32;
  border-radius: 4px;
  background: linear-gradient(180deg, #6b2230 0%, #4a1620 100%);
  color: #f5e6e9;
  font: inherit;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
}

.map-markers-panel__btn:hover {
  filter: brightness(1.08);
}

.map-markers-panel__btn--active {
  outline: 2px solid #b91c3c;
  outline-offset: 1px;
}

.map-markers-panel__btn--ghost {
  background: #1e1e22;
  border-color: #3d3d42;
  color: #c9c4bc;
}

.map-markers-panel__btn--danger {
  background: #2a1818;
  border-color: #5c2a2a;
  color: #e8a8a8;
}

.map-markers-panel__file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.map-markers-panel__err {
  margin: 0;
  font-size: 0.75rem;
  color: #e8a8a8;
}

.map-markers-panel__editor {
  padding: 0.5rem 0;
  border-top: 1px solid #2d2d32;
  border-bottom: 1px solid #2d2d32;
}

.map-markers-panel__row {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.map-markers-panel__lists {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.15rem;
}

.map-markers-panel__section {
  margin-bottom: 0.65rem;
}

.map-markers-panel__list-note {
  margin: 0 0 0.35rem;
  font-size: 0.68rem;
  line-height: 1.3;
  color: #7a7670;
}

.map-markers-panel__ext {
  color: #c9a87a;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.map-markers-panel__ext:hover {
  color: #e8dcc4;
}

.map-markers-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.map-markers-panel__list li {
  margin: 0.15rem 0;
}

.map-markers-panel__link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.25rem 0.35rem;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: #c9c4bc;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.map-markers-panel__link:hover {
  background: rgba(185, 28, 60, 0.12);
  color: #f0e6d2;
}

.map-markers-panel__link--on {
  background: rgba(185, 28, 60, 0.2);
  color: #f5e6e9;
}

.map-markers-panel__link--user {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.map-markers-panel__mini-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(160deg, #2e2a26 0%, #1a1816 100%);
  border: 1px solid #4a4238;
  color: #e8dcc4;
}

.map-markers-panel__mini-icon :deep(svg) {
  width: 13px;
  height: 13px;
  display: block;
}

.map-markers-panel__link-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.08rem;
  min-width: 0;
  text-align: left;
}

.map-markers-panel__link-kind {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7a7670;
}
</style>
