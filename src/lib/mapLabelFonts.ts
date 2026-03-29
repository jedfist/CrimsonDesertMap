/** Preset ids for map label typography (loaded via Google Fonts in index.html). */
export const DEFAULT_LABEL_FONT_ID = 'default'

export type MapLabelFontCategory = 'medieval' | 'fantasy' | 'classic'

export interface MapLabelFontOption {
  id: string
  name: string
  /** Full CSS `font-family` stack (safe: from this file only). */
  cssFamily: string
  category: MapLabelFontCategory
}

export const MAP_LABEL_FONT_OPTIONS: MapLabelFontOption[] = [
  {
    id: DEFAULT_LABEL_FONT_ID,
    name: 'Default (UI sans)',
    cssFamily:
      "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    category: 'classic',
  },
  {
    id: 'cinzel',
    name: 'Cinzel — Roman inscription',
    cssFamily: "'Cinzel', 'Times New Roman', serif",
    category: 'medieval',
  },
  {
    id: 'medieval-sharp',
    name: 'MedievalSharp',
    cssFamily: "'MedievalSharp', cursive",
    category: 'medieval',
  },
  {
    id: 'unifraktur',
    name: 'Unifraktur Maguntia — blackletter',
    cssFamily: "'UnifrakturMaguntia', 'Times New Roman', serif",
    category: 'medieval',
  },
  {
    id: 'uncial',
    name: 'Uncial Antiqua',
    cssFamily: "'Uncial Antiqua', fantasy",
    category: 'medieval',
  },
  {
    id: 'metal-mania',
    name: 'Metal Mania',
    cssFamily: "'Metal Mania', fantasy",
    category: 'fantasy',
  },
  {
    id: 'almendra',
    name: 'Almendra',
    cssFamily: "'Almendra', Georgia, serif",
    category: 'fantasy',
  },
  {
    id: 'metamorphous',
    name: 'Metamorphous',
    cssFamily: "'Metamorphous', Georgia, serif",
    category: 'fantasy',
  },
  {
    id: 'fell-english',
    name: 'IM Fell English',
    cssFamily: "'IM Fell English', 'Times New Roman', serif",
    category: 'classic',
  },
  {
    id: 'cormorant',
    name: 'Cormorant Garamond',
    cssFamily: "'Cormorant Garamond', Garamond, serif",
    category: 'classic',
  },
  {
    id: 'libre-baskerville',
    name: 'Libre Baskerville',
    cssFamily: "'Libre Baskerville', Georgia, serif",
    category: 'classic',
  },
]

const FONT_IDS = new Set(MAP_LABEL_FONT_OPTIONS.map((f) => f.id))

/** Valid stored id, or `undefined` to omit (default font). */
export function normalizeLabelFontId(id: unknown): string | undefined {
  if (typeof id !== 'string' || !FONT_IDS.has(id)) return undefined
  if (id === DEFAULT_LABEL_FONT_ID) return undefined
  return id
}

export function labelFontCssFamily(fontFamilyId: string | undefined): string {
  const opt = MAP_LABEL_FONT_OPTIONS.find(
    (f) => f.id === (fontFamilyId ?? DEFAULT_LABEL_FONT_ID)
  )
  return opt?.cssFamily ?? MAP_LABEL_FONT_OPTIONS[0].cssFamily
}

/** Widen icon box for wide/blackletter glyphs (rough heuristic). */
export function labelIconWidthFactor(fontFamilyId: string | undefined): number {
  switch (fontFamilyId) {
    case 'unifraktur':
    case 'metal-mania':
      return 1.3
    case 'medieval-sharp':
    case 'uncial':
    case 'fell-english':
      return 1.14
    case 'cinzel':
    case 'metamorphous':
    case 'almendra':
      return 1.06
    default:
      return 1
  }
}

export const MAP_LABEL_FONT_GROUPS: {
  category: MapLabelFontCategory
  label: string
}[] = [
  { category: 'medieval', label: 'Medieval' },
  { category: 'fantasy', label: 'Fantasy' },
  { category: 'classic', label: 'Classic & default' },
]

export function fontsInCategory(
  category: MapLabelFontCategory
): MapLabelFontOption[] {
  return MAP_LABEL_FONT_OPTIONS.filter((f) => f.category === category)
}
