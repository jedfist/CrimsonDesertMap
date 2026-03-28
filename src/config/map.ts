/**
 * Path relative to `public/` (served at `import.meta.env.BASE_URL` + this path).
 * Swap the file under public/map/ and keep this in sync, or use the same filename.
 */
export const MAP_IMAGE_PATH = 'map/pywel-map.svg'

export function mapImageUrl(): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${MAP_IMAGE_PATH}`
}
