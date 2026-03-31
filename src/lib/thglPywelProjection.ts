/** TH.GL OpenWorld bounds: SW then NE in game coordinates. */
export type ThglBounds = [[number, number], [number, number]]

/**
 * Map TH.GL game (x, y) to Pywel raster pixel space using the same affine
 * `transformation` array as `tiles.json` OpenWorld, normalized to the map image size.
 * This matches how crimsondesert.th.gl places markers on their tile layer.
 */
export function thglGameToPywelPixels(
  gx: number,
  gy: number,
  bounds: ThglBounds,
  pyW: number,
  pyH: number,
  transformation: readonly [number, number, number, number],
): { px: number; py: number } {
  const [[xMin, yMin], [xMax, yMax]] = bounds
  const [a, b, c, d] = transformation

  const xt = a * gx + b
  const yt = c * gy + d

  const corners: [number, number][] = [
    [xMin, yMin],
    [xMax, yMin],
    [xMin, yMax],
    [xMax, yMax],
  ]

  let minXt = Infinity
  let maxXt = -Infinity
  let minYt = Infinity
  let maxYt = -Infinity
  for (const [x, y] of corners) {
    const xti = a * x + b
    const yti = c * y + d
    minXt = Math.min(minXt, xti)
    maxXt = Math.max(maxXt, xti)
    minYt = Math.min(minYt, yti)
    maxYt = Math.max(maxYt, yti)
  }

  const xSpanT = maxXt - minXt || 1
  const ySpanT = maxYt - minYt || 1

  const px = ((xt - minXt) / xSpanT) * pyW
  const py = ((yt - minYt) / ySpanT) * pyH
  return { px, py }
}

/** Linear bounds→Pywel mapping (drawings ingest); fallback when no transformation. */
export function linearGameToPywelPixels(
  gx: number,
  gy: number,
  bounds: ThglBounds,
  pyW: number,
  pyH: number,
): { px: number; py: number } {
  const [[xMin, yMin], [xMax, yMax]] = bounds
  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1
  return {
    px: ((gx - xMin) / xSpan) * pyW,
    py: ((gy - yMin) / ySpan) * pyH,
  }
}
