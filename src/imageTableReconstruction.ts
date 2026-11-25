import type { LocalOcrPage, OcrBoundingBox } from "./browserOcr"

export type ImageTableColumnKind =
  | "text"
  | "date"
  | "reference"
  | "amount"
  | "currency"
  | "unknown"

export interface ImageTableCell {
  id: string
  value: string
  confidence: number
  assignmentConfidence: number
  edited: boolean
  needsReview: boolean
  colSpan?: number
}

export interface ImageTableRow {
  id: string
  cells: ImageTableCell[]
  confidence: number
}

export interface ImageTableColumn {
  id: string
  label: string
  kind: ImageTableColumnKind
  confidence: number
}

export interface ImageTableWarning {
  code: string
  message: string
  severity: "info" | "warning" | "error"
}

export interface ImageTable {
  columns: ImageTableColumn[]
  rows: ImageTableRow[]
  confidence: number
  structureConfidence: number
  warnings: ImageTableWarning[]
  sourceWidth: number
  sourceHeight: number
  skew: number
}

export interface ImageTableAssessment {
  usable: boolean
  confidence: number
  reviewCellCount: number
  messages: string[]
}

export interface CloudImageTablePayload {
  columns: Array<{ label: string; kind: ImageTableColumnKind }>
  rows: Array<{
    cells: Array<{ value: string; confidence: number }>
  }>
}

interface PositionedWord {
  id: string
  lineId: string
  text: string
  confidence: number
  box: OcrBoundingBox
  baseline?: number
  x: number
  y: number
}

interface PositionedLine {
  id: string
  words: PositionedWord[]
  text: string
  confidence: number
  box?: OcrBoundingBox
}

interface HeaderColumn {
  label: string
  kind: ImageTableColumnKind
  start: number
  end: number
  confidence: number
}

interface Gap {
  x: number
  width: number
  support: number
}

const DATE_PATTERN =
  /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|(?:\d{1,2}\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4})\b/i

const AMOUNT_PATTERN =
  /^(?:[A-Za-z]{3}\s*)?[$€£¥₹]?\s*[+-]?(?:\d[\d, .]*\d|\d)(?:\.\d+)?\s*(?:[A-Za-z]{3})?$/

const SECTION_PATTERN =
  /^(?:earnings?|deductions?|allowances?|benefits?|salary details?|pay details?|summary|tax details?|net pay|gross pay)$/i

const HEADER_KINDS: Array<{ kind: ImageTableColumnKind; pattern: RegExp }> = [
  { kind: "date", pattern: /\b(?:date|transaction date|trans date|value date)\b/i },
  {
    kind: "text",
    pattern: /\b(?:description|narration|details|particulars|transaction|memo)\b/i,
  },
  {
    kind: "reference",
    pattern: /\b(?:reference|ref|cheque|check|transaction id|transaction no)\b/i,
  },
  {
    kind: "amount",
    pattern: /\b(?:debit|withdrawal|withdrawals|paid out|money out|credit|deposit|paid in|money in|amount|balance|running balance)\b/i,
  },
  { kind: "currency", pattern: /\b(?:currency|ccy)\b/i },
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + clamp(value, 0, 1), 0) / values.length
    : 0
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function isRuleArtifact(value: string): boolean {
  return /^[|¦∣│┃║╎╏┆┇┊┋]+$/.test(normalizeText(value))
}

function positionLines(page: LocalOcrPage): PositionedLine[] {
  const lines: PositionedLine[] = []

  page.lines.forEach((line, lineIndex) => {
    const words: PositionedWord[] = []

    for (const word of line.words || []) {
      const box = word.boundingBox
      if (!box || !word.text.trim() || isRuleArtifact(word.text)) continue
      if (
        !Number.isFinite(box.x) ||
        !Number.isFinite(box.y) ||
        !Number.isFinite(box.width) ||
        !Number.isFinite(box.height) ||
        box.width <= 0 ||
        box.height <= 0
      ) {
        continue
      }

      words.push({
        id: `l${lineIndex + 1}w${words.length + 1}`,
        lineId: `l${lineIndex + 1}`,
        text: normalizeText(word.text),
        confidence: clamp(word.confidence, 0, 1),
        box,
        baseline: word.baseline,
        x: box.x + box.width / 2,
        y: word.baseline !== undefined ? word.baseline - box.height * 0.35 : box.y + box.height / 2,
      })
    }

    if (!words.length) return

    words.sort((a, b) => a.box.x - b.box.x)
    lines.push({
      id: `l${lineIndex + 1}`,
      words,
      text: normalizeText(words.map((word) => word.text).join(" ")),
      confidence: clamp(line.confidence, 0, 1),
      box: line.boundingBox,
    })
  })

  return lines
}

function estimateSkew(lines: PositionedLine[]): number {
  const slopes: number[] = []

  for (const line of lines) {
    if (line.words.length < 2) continue
    const first = line.words[0]
    const last = line.words[line.words.length - 1]
    const dx = last.x - first.x
    if (dx < 20) continue
    slopes.push((last.y - first.y) / dx)
  }

  return median(slopes)
}

function normalizeSkew(lines: PositionedLine[], slope: number): void {
  if (!slope) return
  const origin = median(lines.flatMap((line) => line.words.map((word) => word.x)))

  for (const line of lines) {
    for (const word of line.words) {
      const correctedY = word.y - slope * (word.x - origin)
      word.box = {
        ...word.box,
        y: correctedY - word.box.height / 2,
      }
      word.y = correctedY
    }
  }
}

function metadataText(text: string): boolean {
  const value = normalizeText(text)
  if (!value) return true
  if (/^page\s+\d+(?:\s+of\s+\d+)?$/i.test(value)) return true
  if (
    /^(?:(?:bank\s+)?statement(?:\s+of\s+account)?|account\s+statement|bank\s+transactions?|transaction\s+history|account\s+activity|payslip|salary\s+slip|payment\s+advice)$/i.test(
      value,
    )
  ) {
    return true
  }
  if (/^(?:account|a\/c|acct)(?:\s*(?:number|no\.?|name))?\s*[:#-]/i.test(value)) return true
  if (/^(?:statement\s+period|statement\s+date|issue\s+date|sort\s+code|iban|swift)\s*:/i.test(value)) {
    return true
  }
  if (
    /^(?:this\s+(?:document|statement)\s+is|generated\s+on|printed\s+on|authori[sz]ed|signature|for\s+bank\s+use|end\s+of\s+statement)/i.test(
      value,
    )
  ) {
    return true
  }
  return false
}

function headerKind(text: string): ImageTableColumnKind | null {
  const value = normalizeText(text).toLowerCase().replace(/\s+/g, " ")
  for (const entry of HEADER_KINDS) {
    if (entry.pattern.test(value)) return entry.kind
  }
  return null
}

function standardHeaderLabel(kind: ImageTableColumnKind, original: string): string {
  if (kind === "date") return "Date"
  if (kind === "text") return "Description"
  if (kind === "reference") return "Reference"
  if (kind === "currency") return "Currency"
  if (kind === "amount") {
    if (/\b(?:debit|withdrawal|paid out|money out)\b/i.test(original)) return "Debit"
    if (/\b(?:credit|deposit|paid in|money in)\b/i.test(original)) return "Credit"
    if (/\bbalance\b/i.test(original)) return "Balance"
    return "Amount"
  }
  return normalizeText(original)
}

function headerColumns(line: PositionedLine, medianHeight: number): HeaderColumn[] | null {
  const groups: PositionedWord[][] = []
  let current: PositionedWord[] = []

  for (const word of line.words) {
    const previous = current[current.length - 1]
    const gap = previous ? word.box.x - (previous.box.x + previous.box.width) : 0
    if (previous && gap > Math.max(9, medianHeight * 0.85)) {
      groups.push(current)
      current = []
    }
    current.push(word)
  }
  if (current.length) groups.push(current)

  const recognized = groups
    .map((group) => headerKind(group.map((word) => word.text).join(" ")))
    .filter((kind): kind is ImageTableColumnKind => kind !== null)

  if (groups.length < 2 || groups.length > 8 || recognized.length < 2) return null
  if (groups.some((group) => headerKind(group.map((word) => word.text).join(" ")) === null)) {
    return null
  }

  const starts = groups.map((group) => Math.min(...group.map((word) => word.box.x)))
  const ends = groups.map((group) =>
    Math.max(...group.map((word) => word.box.x + word.box.width)),
  )

  return groups.map((group, index) => {
    const original = group.map((word) => word.text).join(" ")
    const kind = headerKind(original) || "unknown"
    return {
      label: standardHeaderLabel(kind, original),
      kind,
      start: index === 0 ? starts[0] - medianHeight : (ends[index - 1] + starts[index]) / 2,
      end:
        index === groups.length - 1
          ? ends[index] + medianHeight
          : (ends[index] + starts[index + 1]) / 2,
      confidence: average(group.map((word) => word.confidence)),
    }
  })
}

function findGaps(
  lines: PositionedLine[],
  medianHeight: number,
  quietThreshold = 0,
): Gap[] {
  const allWords = lines.flatMap((line) => line.words)
  if (!allWords.length) return []

  const minX = Math.min(...allWords.map((word) => word.box.x))
  const maxX = Math.max(...allWords.map((word) => word.box.x + word.box.width))
  const binSize = Math.max(2, medianHeight / 6)
  const binCount = Math.ceil((maxX - minX) / binSize)
  const occupancy = new Uint32Array(binCount)

  for (const line of lines) {
    const covered = new Set<number>()
    for (const word of line.words) {
      const first = Math.max(0, Math.floor((word.box.x - minX) / binSize))
      const last = Math.min(binCount - 1, Math.floor((word.box.x + word.box.width - minX) / binSize))
      for (let bin = first; bin <= last; bin++) covered.add(bin)
    }
    for (const bin of covered) occupancy[bin]++
  }

  const gaps: Gap[] = []
  let startBin = -1
  for (let bin = 0; bin <= binCount; bin++) {
    const quiet = bin < binCount && occupancy[bin] <= quietThreshold
    if (quiet && startBin < 0) startBin = bin
    if (!quiet && startBin >= 0) {
      const endBin = bin - 1
      const start = minX + startBin * binSize
      const end = minX + (endBin + 1) * binSize
      const width = end - start
      if (startBin > 0 && endBin < binCount - 1 && width >= Math.max(5, medianHeight * 0.3)) {
        let support = 0
        for (const line of lines) {
          const hasLeft = line.words.some(
            (word) => word.box.x + word.box.width <= start + binSize,
          )
          const hasRight = line.words.some((word) => word.box.x >= end - binSize)
          if (hasLeft && hasRight) support++
        }
        if (support >= 2) gaps.push({ x: (start + end) / 2, width, support })
      }
      startBin = -1
    }
  }

  return gaps
}

function rightEdgeAnchors(lines: PositionedLine[], medianHeight: number): number[] {
  const edges = lines
    .flatMap((line) => line.words.map((word) => word.box.x + word.box.width))
    .sort((a, b) => a - b)
  const clusters: number[][] = []
  const tolerance = Math.max(4, medianHeight * 0.45)

  for (const edge of edges) {
    const cluster = clusters[clusters.length - 1]
    if (cluster && edge - cluster[cluster.length - 1] <= tolerance) {
      cluster.push(edge)
    } else {
      clusters.push([edge])
    }
  }

  const minimumSupport = Math.max(2, Math.ceil(lines.length * 0.25))
  return clusters
    .filter((cluster) => cluster.length >= minimumSupport)
    .map((cluster) => average(cluster))
    .filter((anchor, index, anchors) => index === 0 || anchor - anchors[index - 1] > medianHeight * 1.2)
}

function inferBoundaries(lines: PositionedLine[], medianHeight: number): {
  boundaries: number[]
  confidence: number
} {
  const strictGaps = findGaps(lines, medianHeight)
  const gaps = strictGaps.length
    ? strictGaps
    : findGaps(lines, medianHeight, Math.max(1, Math.floor(lines.length * 0.18)))
  const strong = gaps.filter(
    (gap) => gap.width >= medianHeight * 0.45 && gap.support / lines.length >= 0.35,
  )
  const relaxed = gaps.filter(
    (gap) => gap.width >= medianHeight * 0.3 && gap.support / lines.length >= 0.2,
  )
  let candidates = strong.length ? strong : relaxed

  if (!candidates.length) {
    const anchors = rightEdgeAnchors(lines, medianHeight)
    if (anchors.length >= 2 && anchors.length <= 9) {
      return {
        boundaries: anchors.slice(0, -1).map((anchor, index) => (anchor + anchors[index + 1]) / 2),
        confidence: 0.42,
      }
    }
    return { boundaries: [], confidence: 0 }
  }

  candidates = [...candidates].sort(
    (a, b) =>
      (b.support / lines.length) * Math.min(2, b.width / medianHeight) -
      (a.support / lines.length) * Math.min(2, a.width / medianHeight),
  )
  const selected: number[] = []
  for (const gap of candidates) {
    if (selected.length >= 7) break
    if (selected.every((boundary) => Math.abs(boundary - gap.x) >= medianHeight * 1.2)) {
      selected.push(gap.x)
    }
  }
  selected.sort((a, b) => a - b)

  return {
    boundaries: selected,
    confidence: clamp(
      average(
        selected.map(
          (boundary) =>
            candidates.find((gap) => gap.x === boundary)!.support / lines.length,
        ),
      ),
      0,
      1,
    ),
  }
}

function amountLike(value: string): boolean {
  const text = normalizeText(value)
  if (!text || text.length > 40) return false
  return AMOUNT_PATTERN.test(text) || /^\(?[$€£¥₹]?\s*\d[\d, .]*\d\)?$/.test(text)
}

function dateLike(value: string): boolean {
  return DATE_PATTERN.test(normalizeText(value))
}

function referenceLike(value: string): boolean {
  const text = normalizeText(value)
  return (
    text.length >= 2 &&
    text.length <= 32 &&
    /\d/.test(text) &&
    /^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(text) &&
    !amountLike(text)
  )
}

function emptyCell(id: string): ImageTableCell {
  return {
    id,
    value: "",
    confidence: 0,
    assignmentConfidence: 0,
    edited: false,
    needsReview: false,
  }
}

function appendCellText(cell: ImageTableCell, value: string, confidence: number): void {
  cell.value = cell.value ? `${cell.value}\n${value}` : value
  cell.confidence = cell.value
    ? (cell.confidence + confidence) / 2
    : confidence
}

function inferColumnKinds(columns: ImageTableColumn[], rows: ImageTableRow[]): void {
  columns.forEach((column, columnIndex) => {
    if (column.kind !== "unknown") return
    const values = rows
      .map((row) => row.cells[columnIndex]?.value || "")
      .filter(Boolean)
    if (!values.length) {
      column.kind = "text"
      return
    }
    const dateCount = values.filter(dateLike).length
    const amountCount = values.filter(amountLike).length
    const currencyCount = values.filter((value) => /^[A-Za-z]{3}$/.test(value.trim())).length
    if (dateCount / values.length >= 0.5) column.kind = "date"
    else if (amountCount / values.length >= 0.5) column.kind = "amount"
    else if (currencyCount / values.length >= 0.8) column.kind = "currency"
    else column.kind = "text"
  })
}

function buildRows(
  lines: PositionedLine[],
  columns: ImageTableColumn[],
  boundaries: number[],
): ImageTableRow[] {
  const rows: ImageTableRow[] = []
  const minX = Math.min(...lines.flatMap((line) => line.words.map((word) => word.box.x)))
  const maxX = Math.max(
    ...lines.flatMap((line) => line.words.map((word) => word.box.x + word.box.width)),
  )
  const ranges = columns.map((_column, index) => ({
    start: index === 0 ? minX - 1 : boundaries[index - 1],
    end: index === columns.length - 1 ? maxX + 1 : boundaries[index],
  }))

  const assembled = lines.map((line) => {
    const cells = columns.map((_column, index) => emptyCell(`pending-${index}`))
    const wordsByColumn: PositionedWord[][] = columns.map(() => [])

    for (const word of line.words) {
      let columnIndex = ranges.findIndex(
        (range) => word.x >= range.start && (word.x < range.end || range.end === maxX + 1),
      )
      if (columnIndex < 0) columnIndex = word.x < ranges[0].start ? 0 : columns.length - 1
      wordsByColumn[columnIndex].push(word)
    }

    cells.forEach((cell, columnIndex) => {
      const words = wordsByColumn[columnIndex]
      if (!words.length) return
      const value = words.map((word) => word.text).join(" ")
      const range = ranges[columnIndex]
      const nearestEdge = Math.min(
        ...words.map((word) => Math.min(word.x - range.start, range.end - word.x)),
      )
      const halfWidth = Math.max(1, (range.end - range.start) / 2)
      cell.value = value
      cell.confidence = average(words.map((word) => word.confidence))
      cell.assignmentConfidence = clamp(0.58 + nearestEdge / halfWidth / 2, 0.35, 0.98)
    })

    const nonempty = cells.filter((cell) => cell.value)
    const firstWord = line.words[0]
    const lastWord = line.words[line.words.length - 1]
    const section = SECTION_PATTERN.test(line.text)
    if (section && nonempty.length === 1) {
      const startColumn = ranges.findIndex(
        (range) =>
          range.start < lastWord.box.x + lastWord.box.width && range.end > firstWord.box.x,
      )
      const lastColumn = ranges.reduce(
        (found, range, index) =>
          range.start < lastWord.box.x + lastWord.box.width && range.end > firstWord.box.x
            ? index
            : found,
        startColumn,
      )
      if (lastColumn > startColumn) {
        const sourceIndex = cells.findIndex((cell) => cell.value)
        const [sectionCell] = cells.splice(sourceIndex, 1)
        cells.splice(sourceIndex, 0, emptyCell(sectionCell.id))
        sectionCell.colSpan = lastColumn - startColumn + 1
        cells[startColumn] = sectionCell
      }
    }

    const dateAnchor =
      dateLike(line.text) ||
      cells.some((cell, index) => columns[index].kind === "date" && dateLike(cell.value))
    const amountAnchor = cells.some(
      (cell, index) =>
        (columns[index].kind === "amount" || columns[index].kind === "unknown") &&
        amountLike(cell.value),
    )
    const referenceAnchor = cells.some(
      (cell, index) => columns[index].kind === "reference" && referenceLike(cell.value),
    )
    const totalAnchor = /\b(?:total|balance brought|opening balance|closing balance|b\/f|carried forward)\b/i.test(
      line.text,
    )
    const anchor =
      (dateAnchor && (nonempty.length >= 2 || columns.some((column) => column.kind === "date"))) ||
      (amountAnchor && nonempty.length >= 2) ||
      (referenceAnchor && nonempty.length >= 2) ||
      (totalAnchor && amountAnchor)

    return { line, cells, nonempty, anchor }
  })

  const hasAnchors = assembled.some((item) => item.anchor)
  let nextRowId = 1

  for (const item of assembled) {
    const isRow = item.anchor || !hasAnchors || item.nonempty.length >= 2
    const previous = rows[rows.length - 1]

    if (!isRow && previous && item.nonempty.length) {
      for (const cell of item.cells) {
        if (!cell.value) continue
        const target = previous.cells[Number(cell.id.replace("pending-", ""))]
        if (target) {
          appendCellText(target, cell.value, cell.confidence)
          target.assignmentConfidence = Math.min(
            target.assignmentConfidence,
            cell.assignmentConfidence,
          )
        }
      }
      previous.confidence = average([
        previous.confidence,
        ...previous.cells.filter((cell) => cell.value).map((cell) => cell.confidence),
      ])
      continue
    }

    if (!item.nonempty.length) continue
    const rowId = nextRowId++
    const cells = item.cells.map((cell, columnIndex) => ({
      ...cell,
      id: `r${rowId}c${columnIndex + 1}`,
      needsReview:
        cell.value.length > 0 &&
        (cell.confidence < 0.75 || cell.assignmentConfidence < 0.65),
    }))
    rows.push({
      id: `r${rowId}`,
      cells,
      confidence: average(cells.filter((cell) => cell.value).map((cell) => cell.confidence)),
    })
  }

  return rows
}

function tableConfidence(table: ImageTable): number {
  const cells = table.rows.flatMap((row) => row.cells).filter((cell) => cell.value)
  if (!cells.length) return 0
  return average(
    cells.map(
      (cell) =>
        cell.confidence * 0.6 + cell.assignmentConfidence * 0.25 + table.structureConfidence * 0.15,
    ),
  )
}

export function reconstructImageTable(page: LocalOcrPage): ImageTable {
  const positioned = positionLines(page)
  const sourceWidth = Math.max(
    0,
    ...positioned.flatMap((line) => line.words.map((word) => word.box.x + word.box.width)),
  )
  const sourceHeight = Math.max(
    0,
    ...positioned.flatMap((line) => line.words.map((word) => word.box.y + word.box.height)),
  )
  const empty: ImageTable = {
    columns: [],
    rows: [],
    confidence: 0,
    structureConfidence: 0,
    warnings: [],
    sourceWidth,
    sourceHeight,
    skew: 0,
  }

  if (!positioned.length) {
    empty.warnings.push({
      code: "no_geometry",
      message: "No readable word positions were found. Try a sharper, straighter photo.",
      severity: "error",
    })
    return empty
  }

  const heights = positioned.flatMap((line) => line.words.map((word) => word.box.height))
  const medianHeight = Math.max(4, median(heights))
  const skew = estimateSkew(positioned)
  normalizeSkew(positioned, skew)

  let detectedHeader: HeaderColumn[] | null = null
  const body: PositionedLine[] = []
  for (const line of [...positioned].sort(
    (a, b) => median(a.words.map((word) => word.y)) - median(b.words.map((word) => word.y)),
  )) {
    const header = headerColumns(line, medianHeight)
    if (!detectedHeader && header) {
      detectedHeader = header
      body.length = 0
      continue
    }
    if (metadataText(line.text)) continue
    body.push(line)
  }

  if (detectedHeader) {
    const columns: ImageTableColumn[] = detectedHeader.map((column, index) => ({
      id: `c${index + 1}`,
      label: column.label,
      kind: column.kind,
      confidence: column.confidence,
    }))
    const boundaries = detectedHeader.slice(0, -1).map((column) => column.end)
    const rows = buildRows(body, columns, boundaries)
    inferColumnKinds(columns, rows)
    const table: ImageTable = {
      columns,
      rows,
      confidence: 0,
      structureConfidence: 0.88,
      warnings: [],
      sourceWidth,
      sourceHeight,
      skew,
    }
    table.confidence = tableConfidence(table)
    return table
  }

  if (body.length < 2) {
    empty.warnings.push({
      code: "too_little_text",
      message: "Only one readable line was found. Include the full table in the photo.",
      severity: "error",
    })
    return empty
  }

  const { boundaries, confidence: structureConfidence } = inferBoundaries(body, medianHeight)
  if (!boundaries.length) {
    empty.warnings.push({
      code: "no_columns",
      message: "No reliable column gutters were found. Crop closely around the table and retake the photo.",
      severity: "error",
    })
    return empty
  }

  const columns: ImageTableColumn[] = Array.from({ length: boundaries.length + 1 }, (_value, index) => ({
    id: `c${index + 1}`,
    label: `Column ${index + 1}`,
    kind: "unknown",
    confidence: structureConfidence,
  }))
  const rows = buildRows(body, columns, boundaries)
  inferColumnKinds(columns, rows)
  const table: ImageTable = {
    columns,
    rows,
    confidence: 0,
    structureConfidence,
    warnings: [
      {
        code: "inferred_columns",
        message: "Column headings were inferred from spacing. Check and rename them before export.",
        severity: "info",
      },
    ],
    sourceWidth,
    sourceHeight,
    skew,
  }
  table.confidence = tableConfidence(table)
  return table
}

export function parseFinancialAmount(value: string): number | null {
  let text = normalizeText(value)
  if (!text || text.length > 40) return null

  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1).trim()
  }

  text = text
    .replace(/^(?:[A-Za-z]{3}|[$€£¥₹])\s*/, "")
    .replace(/\s*[A-Za-z]{3}$/, "")
    .replace(/\s+/g, "")
  if (/^[+-]/.test(text)) {
    negative = text[0] === "-"
    text = text.slice(1)
  }
  if (!/^(?:\d[\d,.]*|\.\d+)$/.test(text)) return null

  const digits = text.replace(/[,.]/g, "")
  if (/^0\d+/.test(digits) || digits.length > 15) return null

  const lastComma = text.lastIndexOf(",")
  const lastDot = text.lastIndexOf(".")
  let decimalSeparator = -1
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = Math.max(lastComma, lastDot)
  } else if (lastDot >= 0) {
    const fraction = text.slice(lastDot + 1)
    if (fraction.length === 3) return null
    decimalSeparator = lastDot
  } else if (lastComma >= 0) {
    const fraction = text.slice(lastComma + 1)
    if (fraction.length === 3 && text.split(",").length === 2) return null
    if (fraction.length !== 3 && !/^\d{1,3}(?:,\d{3})+$/.test(text)) {
      decimalSeparator = lastComma
    }
  }

  let normalized = text
  if (decimalSeparator >= 0) {
    normalized = `${text.slice(0, decimalSeparator).replace(/[,.]/g, "")}.${text.slice(decimalSeparator + 1)}`
  } else {
    normalized = text.replace(/[,.]/g, "")
  }

  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}

const CLOUD_COLUMN_KINDS = new Set<ImageTableColumnKind>([
  "text",
  "date",
  "reference",
  "amount",
  "currency",
  "unknown",
])

function cloudString(value: unknown, fallback: string, maxLength: number): string {
  return (typeof value === "string" ? value : fallback).replace(/\u0000/g, "").slice(0, maxLength)
}

export function createImageTableFromCloud(payload: unknown): ImageTable {
  if (!payload || typeof payload !== "object") {
    throw new Error("Cloud extraction returned no table.")
  }

  const raw = payload as { columns?: unknown; rows?: unknown }
  if (!Array.isArray(raw.columns) || !Array.isArray(raw.rows)) {
    throw new Error("Cloud extraction returned an invalid table.")
  }
  if (raw.columns.length < 2 || raw.columns.length > 12) {
    throw new Error("Cloud extraction returned an unsupported number of columns.")
  }
  if (raw.rows.length < 1 || raw.rows.length > 500) {
    throw new Error("Cloud extraction returned an unsupported number of rows.")
  }

  const columns: ImageTableColumn[] = raw.columns.map((value, index) => {
    const column = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
    const kind = CLOUD_COLUMN_KINDS.has(column.kind as ImageTableColumnKind)
      ? (column.kind as ImageTableColumnKind)
      : "unknown"
    return {
      id: `c${index + 1}`,
      label: cloudString(column.label, `Column ${index + 1}`, 120).trim() || `Column ${index + 1}`,
      kind,
      confidence: 0.9,
    }
  })

  const rows: ImageTableRow[] = raw.rows.map((value, rowIndex) => {
    const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
    if (!Array.isArray(row.cells) || row.cells.length > columns.length) {
      throw new Error("Cloud extraction returned a row that does not match its columns.")
    }

    const rawCells = Array.isArray(row.cells) ? row.cells : []
    const cells: ImageTableCell[] = columns.map((_column, columnIndex) => {
      const rawCell = rawCells[columnIndex]
      const cell = rawCell && typeof rawCell === "object" ? (rawCell as Record<string, unknown>) : {}
      const text = cloudString(cell.value, "", 32000)
      const measured = typeof cell.confidence === "number" ? cell.confidence : 0.5
      const confidence = Number.isFinite(measured) ? clamp(measured, 0, 1) : 0.5
      return {
        id: `r${rowIndex + 1}c${columnIndex + 1}`,
        value: text,
        confidence,
        assignmentConfidence: 0.9,
        edited: false,
        needsReview: text.length > 0 && confidence < 0.75,
      }
    })

    return {
      id: `r${rowIndex + 1}`,
      cells,
      confidence: average(cells.filter((cell) => cell.value).map((cell) => cell.confidence)),
    }
  })

  const table: ImageTable = {
    columns,
    rows,
    confidence: 0,
    structureConfidence: 0.9,
    warnings: [
      {
        code: "cloud_extraction",
        message: "Cloud extraction assisted with this table. Verify every amount before use.",
        severity: "info",
      },
    ],
    sourceWidth: 0,
    sourceHeight: 0,
    skew: 0,
  }
  table.confidence = tableConfidence(table)
  return table
}

export function assessImageTable(table: ImageTable): ImageTableAssessment {
  const messages = table.warnings.map((warning) => warning.message)
  const reviewCellCount = table.rows
    .flatMap((row) => row.cells)
    .filter((cell) => cell.needsReview).length
  const populatedCells = table.rows.flatMap((row) => row.cells).filter((cell) => cell.value)

  if (!populatedCells.length) messages.push("No table rows could be reconstructed.")
  if (table.columns.length < 2) messages.push("At least two columns are required.")
  if (table.rows.length > 500) messages.push("The table exceeds the 500-row export limit.")
  if (table.columns.length > 12) messages.push("The table exceeds the 12-column export limit.")
  if (Math.abs(table.skew) > 0.18) {
    messages.push("The photo is heavily skewed. Retake it squarely before using these figures.")
  } else if (Math.abs(table.skew) > 0.08) {
    messages.push("The photo has noticeable skew. Check row boundaries carefully.")
  }
  if (table.confidence < 0.75) {
    messages.push("Some text has low recognition confidence and needs manual review.")
  }
  if (reviewCellCount > 0) {
    messages.push(`${reviewCellCount} cell${reviewCellCount === 1 ? "" : "s"} marked for review.`)
  }
  if (table.structureConfidence < 0.55) {
    messages.push("Column alignment is weak. Compare every value with the source image.")
  }

  const usable =
    populatedCells.length > 0 &&
    table.columns.length >= 2 &&
    table.columns.length <= 12 &&
    table.rows.length <= 500 &&
    Math.abs(table.skew) <= 0.18 &&
    table.confidence >= 0.42

  return { usable, confidence: table.confidence, reviewCellCount, messages }
}

export function updateImageTableCell(
  table: ImageTable,
  rowId: string,
  columnIndex: number,
  value: string,
): ImageTable {
  return {
    ...table,
    rows: table.rows.map((row) =>
      row.id !== rowId
        ? row
        : {
            ...row,
            cells: row.cells.map((cell, index) =>
              index === columnIndex
                ? { ...cell, value, edited: true, needsReview: false }
                : cell,
            ),
          },
    ),
  }
}

export function updateImageTableColumn(
  table: ImageTable,
  columnIndex: number,
  label: string,
): ImageTable {
  return {
    ...table,
    columns: table.columns.map((column, index) =>
      index === columnIndex ? { ...column, label } : column,
    ),
  }
}

export function addImageTableRow(table: ImageTable): ImageTable {
  const nextId =
    Math.max(0, ...table.rows.map((row) => Number(row.id.replace(/\D/g, "")) || 0)) + 1
  return {
    ...table,
    rows: [
      ...table.rows,
      {
        id: `r${nextId}`,
        confidence: 1,
        cells: table.columns.map((_column, index) => ({
          ...emptyCell(`r${nextId}c${index + 1}`),
          edited: true,
        })),
      },
    ],
  }
}

export function removeImageTableRow(table: ImageTable, rowId: string): ImageTable {
  return { ...table, rows: table.rows.filter((row) => row.id !== rowId) }
}

export function toSpreadsheetData(table: ImageTable): string[][] {
  return [
    table.columns.map((column) => column.label),
    ...table.rows.map((row) => {
      const values: string[] = []
      row.cells.forEach((cell, index) => {
        values.push(cell.value)
        for (let span = 1; span < (cell.colSpan || 1); span++) values.push("")
      })
      return values.slice(0, table.columns.length)
    }),
  ]
}

export function imageTableMergeRanges(table: ImageTable): Array<{
  firstRow: number
  firstCol: number
  lastRow: number
  lastCol: number
}> {
  const ranges: Array<{
    firstRow: number
    firstCol: number
    lastRow: number
    lastCol: number
  }> = []
  table.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, columnIndex) => {
      if ((cell.colSpan || 1) > 1) {
        ranges.push({
          firstRow: rowIndex + 1,
          firstCol: columnIndex,
          lastRow: rowIndex + 1,
          lastCol: columnIndex + (cell.colSpan || 1) - 1,
        })
      }
    })
  })
  return ranges
}
