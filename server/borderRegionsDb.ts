/**
 * LowDB-backed store for drawable border regions.
 * The JSON file under public/ is served statically and is the canonical repo copy.
 *
 * Payload shape matches `src/lib/borderRegions.ts` (validated on the client before POST).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSONFilePreset } from 'lowdb/node'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

export const BORDER_REGIONS_DATABASE_FILE = path.join(
  projectRoot,
  'public/map/thgl-data/border-regions.json'
)

export type BorderRegionsDocument = {
  version: number
  regions: unknown[]
}

const defaultData: BorderRegionsDocument = { version: 1, regions: [] }

function normalizePayload(raw: unknown): BorderRegionsDocument {
  if (!raw || typeof raw !== 'object') return { ...defaultData }
  const o = raw as Record<string, unknown>
  const version = typeof o.version === 'number' ? o.version : 1
  const regions = Array.isArray(o.regions) ? o.regions : []
  return { version, regions }
}

let writeChain: Promise<void> = Promise.resolve()

/**
 * Replaces the on-disk document. Writes are serialized so rapid UI updates
 * do not corrupt the JSON file.
 */
export async function saveBorderRegionsDocument(
  raw: unknown
): Promise<BorderRegionsDocument> {
  const normalized = normalizePayload(raw)

  const run = writeChain.then(async () => {
    const db = await JSONFilePreset<BorderRegionsDocument>(
      BORDER_REGIONS_DATABASE_FILE,
      defaultData
    )
    db.data = normalized
    await db.write()
  })

  writeChain = run.catch(() => {})
  await run
  return normalized
}
