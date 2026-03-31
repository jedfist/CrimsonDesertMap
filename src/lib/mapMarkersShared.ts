export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function matchesMarkerSearch(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return texts.some((t) => t.toLowerCase().includes(q))
}
