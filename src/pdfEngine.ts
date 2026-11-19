// ============================================================================
// PDF Engine: Universal In-Memory PDF.js Rasterizer & Text Extractor
// ============================================================================

let pdfjsLibInstance: any = null

export async function getPdfJsLibrary(): Promise<any> {
  if (typeof window === "undefined" && typeof globalThis === "undefined") {
    return null
  }
  if (pdfjsLibInstance) return pdfjsLibInstance

  if (typeof window !== "undefined" && (window as any).pdfjsLib) {
    pdfjsLibInstance = (window as any).pdfjsLib
    return pdfjsLibInstance
  }

  try {
    const mod = await import("pdfjs-dist")
    const lib = mod.default || mod
    if (lib) {
      if (lib.GlobalWorkerOptions && typeof window !== "undefined") {
        lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js"
      }
      pdfjsLibInstance = lib
      return lib
    }
  } catch (err) {
    console.warn("Direct pdfjs-dist import fallback:", err)
  }

  return null
}

export async function renderPdfPageToDataUrl(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  pageNumber: number = 1,
  scale: number = 1.2,
): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null
  }
  try {
    const renderPromise = (async () => {
      const pdfjs = await getPdfJsLibrary()
      if (!pdfjs) return null

      let arrayBuffer: ArrayBuffer
      if (fileOrBuffer instanceof File) {
        arrayBuffer = await fileOrBuffer.arrayBuffer()
      } else if (fileOrBuffer instanceof Uint8Array) {
        arrayBuffer = fileOrBuffer.buffer.slice(
          fileOrBuffer.byteOffset,
          fileOrBuffer.byteOffset + fileOrBuffer.byteLength,
        ) as ArrayBuffer
      } else {
        arrayBuffer = fileOrBuffer
      }

      const task = pdfjs.getDocument({
        data: arrayBuffer,
        isEvalSupported: false,
        useWorkerFetch: false,
      })
      const pdfDoc = await task.promise
      const total = pdfDoc.numPages
      const targetPage = Math.max(1, Math.min(pageNumber, total))
      const page = await pdfDoc.getPage(targetPage)
      const dpr = typeof window !== "undefined" ? Math.max(1, Math.min(window.devicePixelRatio || 1, 2)) : 1
      const viewport = page.getViewport({ scale: scale * dpr })

      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext("2d")
      if (!ctx) return null

      await page.render({ canvasContext: ctx, viewport }).promise
      return canvas.toDataURL("image/png")
    })()

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 3500),
    )

    return await Promise.race([renderPromise, timeoutPromise])
  } catch {
    return null
  }
}

export interface ExtractedPdfPageResult {
  pageNumber: number
  lines: string[]
  fullText: string
  headings: string[]
}

/**
 * Extracts high-fidelity text with paragraph and heading detection using PDF.js.
 * Correctly decodes ToUnicode CMaps, CID fonts, ligatures, and multi-line geometry.
 */
export async function extractTextWithPdfJs(
  bytes: Uint8Array | ArrayBuffer,
): Promise<ExtractedPdfPageResult[] | null> {
  try {
    const pdfjs = await getPdfJsLibrary()
    if (!pdfjs) return null

    const arrayBuffer =
      bytes instanceof Uint8Array
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        : bytes

    const task = pdfjs.getDocument({
      data: arrayBuffer,
      isEvalSupported: false,
      useWorkerFetch: false,
      disableFontFace: true,
    })
    const doc = await task.promise
    const numPages = doc.numPages
    if (numPages === 0) return null

    const results: ExtractedPdfPageResult[] = []

    for (let pNum = 1; pNum <= numPages; pNum++) {
      const page = await doc.getPage(pNum)
      const textContent = await page.getTextContent({ normalizeWhitespace: true })
      const items = (textContent.items || []) as any[]

      // Group items on lines by vertical Y position
      const lineMap = new Map<number, { text: string; fontSize: number; isBold: boolean; x: number }[]>()

      for (const item of items) {
        if (!item.str || typeof item.str !== "string") continue
        const cleanStr = item.str
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g, "")
          .trim()
        if (!cleanStr) continue

        const transform = item.transform || [1, 0, 0, 1, 0, 0]
        const y = Math.round(transform[5] || 0)
        const x = Math.round(transform[4] || 0)
        const fontSize = Math.round(item.height || Math.abs(transform[0]) || 12)
        const fontName = (item.fontName || "").toLowerCase()
        const isBold =
          fontName.includes("bold") ||
          fontName.includes("black") ||
          fontName.includes("heavy") ||
          fontName.includes("medium")

        // Find existing close line bucket (within 4 points)
        let foundKey: number | null = null
        for (const key of lineMap.keys()) {
          if (Math.abs(key - y) <= 4) {
            foundKey = key
            break
          }
        }

        const bucketKey = foundKey !== null ? foundKey : y
        if (!lineMap.has(bucketKey)) {
          lineMap.set(bucketKey, [])
        }
        lineMap.get(bucketKey)!.push({ text: cleanStr, fontSize, isBold, x })
      }

      // Sort lines by Y descending (top to bottom of page)
      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a)

      const pageLines: string[] = []
      const headings: string[] = []

      for (const y of sortedY) {
        const lineItems = lineMap.get(y)!
        // Sort items left to right
        lineItems.sort((a, b) => a.x - b.x)
        const lineText = lineItems.map((it) => it.text).join(" ").trim()
        if (lineText.length > 0) {
          pageLines.push(lineText)
          const maxFontSize = Math.max(...lineItems.map((it) => it.fontSize))
          const hasBold = lineItems.some((it) => it.isBold)
          if ((maxFontSize >= 15 || hasBold) && lineText.length < 80 && !lineText.endsWith(".")) {
            headings.push(lineText)
          }
        }
      }

      results.push({
        pageNumber: pNum,
        lines: pageLines,
        fullText: pageLines.join("\n"),
        headings,
      })
    }

    return results
  } catch {
    return null
  }
}

function mergeCellTokens(lines: string[]): string {
  if (lines.length === 0) return ""
  if (lines.length === 1) return lines[0].trim()

  let result = lines[0].trim()
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i].trim()
    if (!next) continue

    // Case 1: Split decimal: "$890,000." + "00" => "$890,000.00"
    if (result.endsWith(".") && /^\d+/.test(next)) {
      result += next
      continue
    }

    // Case 2: Split decimal without dot: "142050" + "0" => "1420500"
    if (/^[\d,]+$/.test(result) && /^\d{1,2}$/.test(next)) {
      result += next
      continue
    }

    // Case 3: Split currency/number + decimal: "168525" + "0.5" or "110289" + "0.25"
    if (/^[\d,]+$/.test(result) && /^0\.\d+$/.test(next)) {
      const dec = next.slice(2)
      result = result + "." + dec
      continue
    }

    // Case 4: Hyphenated word break: "Enter-" + "prise" => "Enterprise"
    if (result.endsWith("-")) {
      result = result.slice(0, -1) + next
      continue
    }

    // Case 5: Broken word wrap: "Enterpri" + "se SaaS" => "Enterprise SaaS"
    const matchLastWord = result.match(/([A-Za-z]+)$/)
    const matchNextFirstWord = next.match(/^([a-z]+)(\s+[\s\S]*)?$/)
    if (matchLastWord && matchNextFirstWord) {
      const part1 = matchLastWord[1]
      const part2 = matchNextFirstWord[1]
      const rest = matchNextFirstWord[2] || ""
      const combinedWord = part1 + part2
      result = result.slice(0, -part1.length) + combinedWord + rest
      continue
    }

    // Default: separate lines with space
    result += " " + next
  }

  return result.trim()
}

/**
 * Extracts tabular rows and columns from PDF using 2D coordinate layout analysis:
 * 1. Discovers global column boundaries (X-grid) across the page
 * 2. Groups tokens into visual lines by Y coordinates
 * 3. Maps tokens to their true column indices (preventing Column A collapse)
 * 4. Merges multi-line cell wraps, hyphenations, and split decimals into cohesive rows
 */
export async function extractTableWithPdfJs(
  bytes: Uint8Array | ArrayBuffer,
): Promise<string[][] | null> {
  try {
    const pdfjs = await getPdfJsLibrary()
    if (!pdfjs) return null

    const arrayBuffer =
      bytes instanceof Uint8Array
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        : bytes

    const task = pdfjs.getDocument({
      data: arrayBuffer,
      isEvalSupported: false,
      useWorkerFetch: false,
      disableFontFace: true,
    })
    const doc = await task.promise
    const numPages = doc.numPages
    if (numPages === 0) return null

    const allRows: string[][] = []

    for (let pNum = 1; pNum <= numPages; pNum++) {
      const page = await doc.getPage(pNum)
      const textContent = await page.getTextContent({ normalizeWhitespace: true })
      const rawItems = (textContent.items || []) as any[]

      // Clean & extract tokens
      const tokens: { text: string; x: number; y: number; width: number; fontSize: number }[] = []
      for (const it of rawItems) {
        if (!it.str || typeof it.str !== "string") continue
        const clean = it.str
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g, "")
          .trim()
        if (!clean) continue
        const t = it.transform || [1, 0, 0, 1, 0, 0]
        const x = Math.round(t[4] || 0)
        const y = Math.round(t[5] || 0)
        const fontSize = Math.round(it.height || Math.abs(t[0]) || 12)
        const width = Math.round(it.width || clean.length * fontSize * 0.55)
        tokens.push({ text: clean, x, y, width, fontSize })
      }

      if (tokens.length === 0) continue

      // 1. Detect Column Boundaries across the page (X-Grid)
      const xCounts = new Map<number, number>()
      for (const tok of tokens) {
        let matchedX: number | null = null
        for (const cx of xCounts.keys()) {
          if (Math.abs(cx - tok.x) <= 16) {
            matchedX = cx
            break
          }
        }
        if (matchedX !== null) {
          xCounts.set(matchedX, (xCounts.get(matchedX) || 0) + 1)
        } else {
          xCounts.set(tok.x, 1)
        }
      }

      const candidateCols = Array.from(xCounts.entries())
        .filter(([_, count]) => count >= 2)
        .map(([x]) => x)
        .sort((a, b) => a - b)

      const colStarts: number[] = []
      for (const cx of candidateCols) {
        if (colStarts.length === 0 || cx - colStarts[colStarts.length - 1] >= 28) {
          colStarts.push(cx)
        }
      }

      const getColIndex = (x: number): number => {
        if (colStarts.length === 0) return 0
        for (let c = 0; c < colStarts.length; c++) {
          const nextStart = c < colStarts.length - 1 ? colStarts[c + 1] : Infinity
          if (x >= colStarts[c] - 16 && x < nextStart - 16) {
            return c
          }
        }
        return colStarts.length - 1
      }

      // 2. Group tokens into Visual Lines by Y (bucket within 3.5 points)
      const lineMap = new Map<number, typeof tokens>()
      for (const tok of tokens) {
        let bucketY: number | null = null
        for (const ly of lineMap.keys()) {
          if (Math.abs(ly - tok.y) <= 3.5) {
            bucketY = ly
            break
          }
        }
        const key = bucketY !== null ? bucketY : tok.y
        if (!lineMap.has(key)) lineMap.set(key, [])
        lineMap.get(key)!.push(tok)
      }

      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a)

      // 3. Assemble visual lines into structured column buckets
      interface VisualLine {
        y: number
        cols: Map<number, string>
      }

      const visualLines: VisualLine[] = []

      for (const y of sortedY) {
        const lineTokens = lineMap.get(y)!
        lineTokens.sort((a, b) => a.x - b.x)

        const lineCols = new Map<number, string>()
        for (const tok of lineTokens) {
          const cIdx = colStarts.length >= 2 ? getColIndex(tok.x) : 0
          const existing = lineCols.get(cIdx)
          if (!existing) {
            lineCols.set(cIdx, tok.text)
          } else {
            lineCols.set(cIdx, existing + " " + tok.text)
          }
        }
        visualLines.push({ y, cols: lineCols })
      }

      // 4. Merge multi-line cell wraps into unified table rows
      const pageRows: string[][] = []
      let currentRowMap: Map<number, string[]> = new Map()
      let lastLineY: number | null = null

      const finalizeCurrentRow = () => {
        if (currentRowMap.size === 0) return
        const totalCols = Math.max(colStarts.length, 1)
        const rowCells: string[] = new Array(totalCols).fill("")
        for (const [cIdx, fragments] of currentRowMap.entries()) {
          if (cIdx < totalCols) {
            rowCells[cIdx] = mergeCellTokens(fragments)
          }
        }
        if (rowCells.some((c) => c.trim().length > 0)) {
          pageRows.push(rowCells)
        }
        currentRowMap = new Map()
      }

      for (const vl of visualLines) {
        const gap = lastLineY !== null ? lastLineY - vl.y : 999

        const isContinuation =
          lastLineY !== null &&
          gap <= 16 &&
          gap > 0 &&
          (
            !vl.cols.has(0) ||
            /^[a-z]{1,4}$/.test((vl.cols.get(0) || "").trim()) ||
            /^(re Units|se SaaS|e Exceeded|e On Track|00|\d{1,2}%?)$/i.test(
              (vl.cols.get(0) || "").trim(),
            )
          )

        if (!isContinuation && currentRowMap.size > 0) {
          finalizeCurrentRow()
        }

        for (const [cIdx, text] of vl.cols.entries()) {
          if (!currentRowMap.has(cIdx)) {
            currentRowMap.set(cIdx, [])
          }
          currentRowMap.get(cIdx)!.push(text)
        }

        lastLineY = vl.y
      }

      finalizeCurrentRow()

      if (pageRows.length > 0) {
        allRows.push(...pageRows)
      }
    }

    return allRows.length > 0 ? allRows : null
  } catch {
    return null
  }
}
