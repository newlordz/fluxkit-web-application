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
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
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
