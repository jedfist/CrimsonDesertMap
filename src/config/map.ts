/**
 * Local map tiles (see `npm run generate-map-tiles`) and optional TH.GL mirror paths.
 * Paths are relative to `public/` (served at `import.meta.env.BASE_URL` + path).
 */
export const MAP_TILES_MANIFEST_PATH = 'map/tiles/manifest.json'

/** User-drawn border regions (not overwritten by ingest-thgl-map-data). */
export const BORDER_REGIONS_DATA_PATH = 'map/thgl-data/border-regions.json'

/** TH.GL-sourced drawing labels (places), split by ingest-thgl-map-data. */
export const PLACES_GEOJSON_PATH = 'map/thgl-data/places.geojson'

/** TH.GL-sourced region center points. */
export const REGION_CENTERS_GEOJSON_PATH = 'map/thgl-data/region-centers.geojson'

/** Combined landmarks (fallback if split files are missing). */
export const LANDMARKS_GEOJSON_PATH = 'map/thgl-data/landmarks.geojson'

/** TH.GL world nodes extracted from nodes/*.raw (see extract-thgl-world-nodes). */
export const WORLD_NODES_GEOJSON_PATH = 'map/thgl-data/world-nodes.geojson'

/** Treasure nodes (subset of world nodes, thglKey treasures/*; see extract-thgl-treasures). */
export const TREASURES_GEOJSON_PATH = 'map/thgl-data/treasures.geojson'

/** `mapName` values from GeoJSON features to show as official overlays. */
export const OFFICIAL_MAP_NAMES = ['OpenWorld'] as const

/** Legacy full image; kept for regenerating tiles from source. */
export const MAP_IMAGE_PATH = 'map/pywel-map.jpg'

export function publicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${relativePath.replace(/^\//, '')}`
}

export function mapImageUrl(): string {
  return publicAssetUrl(MAP_IMAGE_PATH)
}

export function mapTilesManifestUrl(): string {
  return publicAssetUrl(MAP_TILES_MANIFEST_PATH)
}

export function borderRegionsDataUrl(): string {
  return publicAssetUrl(BORDER_REGIONS_DATA_PATH)
}

export function placesGeoJsonUrl(): string {
  return publicAssetUrl(PLACES_GEOJSON_PATH)
}

export function regionCentersGeoJsonUrl(): string {
  return publicAssetUrl(REGION_CENTERS_GEOJSON_PATH)
}

export function landmarksGeoJsonUrl(): string {
  return publicAssetUrl(LANDMARKS_GEOJSON_PATH)
}

export function worldNodesGeoJsonUrl(): string {
  return publicAssetUrl(WORLD_NODES_GEOJSON_PATH)
}

export function treasuresGeoJsonUrl(): string {
  return publicAssetUrl(TREASURES_GEOJSON_PATH)
}

export interface MapTilesManifest {
  width: number
  height: number
  tileSize: number
  minNativeZoom: number
  maxNativeZoom: number
  format: string
  tileUrlPattern: string
}
