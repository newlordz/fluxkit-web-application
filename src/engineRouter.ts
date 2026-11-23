// Engine policy for every tool lives here: the in-browser engine always does the
// work first, and a billed cloud provider is contacted only when the local result
// is not good enough or the format is beyond what the page can do. One file
// decides when project credits are spent.

// A credit is not worth burning on a file the browser already handles, and a
// small upload buys almost nothing in savings.
export const MIN_BYTES_FOR_CLOUD = 200_000

// Below this the local engine is taken to have failed at the job.
export const MIN_LOCAL_SAVING_RATIO = 0.1

export function compressNeedsCloud(options: {
  level?: string
  originalSize: number
  outSize: number
}): boolean {
  // "low" is the stream-only profile: it stops before rasterizing on purpose, so
  // a modest saving is the expected answer rather than a failure.
  if (options.level === "low") return false

  if (options.originalSize < MIN_BYTES_FOR_CLOUD) return false

  const savedRatio =
    (options.originalSize - options.outSize) / options.originalSize

  return savedRatio < MIN_LOCAL_SAVING_RATIO
}

// A page with almost no extractable characters is scanned or image-only: no
// in-page converter can rebuild it, but the document APIs can.
export function textNeedsCloud(options: {
  chars: number
  pageCount: number
}): boolean {
  if (options.pageCount <= 0) return true

  return options.chars / options.pageCount < 120
}

// A real table survives local layout analysis as several columns across rows; a
// single collapsed column means the coordinate grid never resolved.
export function tableNeedsCloud(rows: string[][]): boolean {
  if (rows.length < 2) return true

  const widest = Math.max(...rows.map((row) => row.length))

  return widest < 2
}

// PowerPoint is the one input a page genuinely cannot render: the legacy binary
// .ppt container has no JavaScript reader, and a deck whose XML yielded no shapes
// or media has nothing left for the local builder to draw.
export function deckNeedsCloud(options: {
  slideCount: number
  hasContent: boolean
  isLegacyBinaryPpt: boolean
}): boolean {
  if (options.isLegacyBinaryPpt) return true

  if (options.slideCount === 0) return true

  return !options.hasContent
}
