/**
 * Local map tiles (see `npm run generate-map-tiles`) and optional TH.GL mirror paths.
 * Paths are relative to `public/` (served at `import.meta.env.BASE_URL` + path).
 */
export const MAP_TILES_MANIFEST_PATH = 'map/tiles/manifest.json'

/** User-drawn border regions (not overwritten by ingest-thgl-map-data). */
export const BORDER_REGIONS_DATA_PATH = 'map/thgl-data/border-regions.json'

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

export interface MapTilesManifest {
  width: number
  height: number
  tileSize: number
  minNativeZoom: number
  maxNativeZoom: number
  format: string
  tileUrlPattern: string
}
