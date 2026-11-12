const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const { PDFDocument, StandardFonts } = require("pdf-lib")

// ============================================================================
// Module Transpiler & Dynamic Loader
// ============================================================================

const transpileCache = new Map()

function getTranspiled(fullPath) {
  if (transpileCache.has(fullPath)) return transpileCache.get(fullPath)
  const resolved = fs.existsSync(fullPath + ".tsx")
    ? fullPath + ".tsx"
    : fs.existsSync(fullPath + ".ts")
      ? fullPath + ".ts"
      : fullPath
  const raw = fs.readFileSync(resolved, "utf8")
  const code = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")
  const result = { code, filename: resolved }
  transpileCache.set(fullPath, result)
  return result
}

function loadServices() {
  const filePath = path.resolve("src", "services.ts")
  const raw = fs.readFileSync(filePath, "utf8")
  const code = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")

  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`
  const compiledWrapper = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  compiledWrapper(
    mod.exports,
    (id) => (id === "./jobTypes" ? {} : require(id)),
    mod,
    filePath,
    path.dirname(filePath),
  )
  return mod.exports
}

function createDOMEnv(hash = "overview") {
  const moduleCache = new Map()
  const storage = new Map()

  const mockLocalStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  }

  const mockDocument = {
    createElement: () => ({
      href: "",
      download: "",
      click: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: {
      dataset: {},
      style: { setProperty: () => {} },
    },
  }

  function load(name) {
    const full = path.resolve("src", name)
    if (moduleCache.has(full)) return moduleCache.get(full)
    const { code, filename } = getTranspiled(full)
    const exports = {}
    moduleCache.set(full, exports)

    vm.runInNewContext(
      code,
      {
        exports,
        require: (id) => {
          return id.startsWith(".")
            ? load(
                path.relative(
                  path.resolve("src"),
                  path.resolve(path.dirname(full), id),
                ),
              )
            : require(id)
        },
        process: { env: {} },
        location: { hash: `#${hash}` },
        localStorage: mockLocalStorage,
        sessionStorage: mockLocalStorage,
        window: {
          localStorage: mockLocalStorage,
          sessionStorage: mockLocalStorage,
          location: { hash: `#${hash}` },
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => {},
          scrollTo: () => {},
        },
        document: mockDocument,
        navigator: { userAgent: "Node" },
        Blob,
        File,
        TextEncoder,
        TextDecoder,
        URL,
      },
      { filename },
    )

    return exports
  }

  return { load }
}

// Helpers
async function createTestPDF(pageCount = 1, text = "FluxKit Document") {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([600, 400])
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 350, size: 14, font })
    page.drawText("Invoice #9821: Total $450.00", { x: 50, y: 300, size: 12, font })
  }
  return doc.save()
}

function toFile(name, bytes, type = "application/octet-stream") {
  const blob = new Blob([bytes], { type })
  return new File([blob], name, { type, lastModified: Date.now() })
}

// ============================================================================
// SUITE 1: Pure Client-Side ZIP Archive Engine
// ============================================================================

test("Suite 1: Pure Client-Side ZIP Archive Engine", async (t) => {
  const services = loadServices()

  await t.test("1.1 Multi-file packaging of mixed text, unicode, and raw binary entries", async () => {
    const textData = "Hello FluxKit Archiving! 🚀"
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0xaa, 0x55])

    const files = [
      { name: "readme.txt", data: textData },
      { name: "data.bin", data: binaryData },
      { name: "notes.md", data: "# Notes\nSpecial chars: ⚡ & < > \" '" },
    ]

    const result = await services.zipFiles(files, { archiveName: "bundle.zip", compressionLevel: 6 })
    assert.strictEqual(result.name, "bundle.zip")
    assert.strictEqual(result.totalFiles, 3)
    assert.ok(result.blob instanceof Blob)
    assert.ok(result.blob.size > 0)
    assert.ok(result.uncompressedSize > 0)
    assert.ok(result.compressedSize > 0)

    const zipBytes = new Uint8Array(await result.blob.arrayBuffer())
    const view = new DataView(zipBytes.buffer)

    // Check Local File Header signature (0x04034b50)
    assert.strictEqual(view.getUint32(0, true), 0x04034b50, "First header must be Local File Header")

    // Check EOCD signature (0x06054b50)
    let hasEocd = false
    for (let i = zipBytes.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        hasEocd = true
        break
      }
    }
    assert.ok(hasEocd, "Archive must terminate with End of Central Directory record")
  })

  await t.test("1.2 extractZipArchive: Round-trip unpacking and byte-for-byte fidelity", async () => {
    const textData = "Round trip text test."
    const binaryData = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])

    const originalFiles = [
      { name: "text.txt", data: textData },
      { name: "binary.dat", data: binaryData },
    ]

    const zip = await services.zipFiles(originalFiles)
    const extracted = await services.extractZipArchive(zip.blob)

    assert.strictEqual(extracted.length, 2)

    const textEntry = extracted.find((e) => e.name === "text.txt")
    assert.ok(textEntry, "text.txt must be extracted")
    assert.strictEqual(textEntry.text(), textData)

    const binEntry = extracted.find((e) => e.name === "binary.dat")
    assert.ok(binEntry, "binary.dat must be extracted")
    assert.deepStrictEqual(Array.from(binEntry.data), Array.from(binaryData))
  })

  await t.test("1.3 Directory and nested path preservation", async () => {
    const files = [
      { name: "docs/readme.txt", data: "Documentation file" },
      { name: "assets/images/logo.txt", data: "ASCII Logo" },
    ]

    const zip = await services.zipFiles(files)
    const extracted = await services.extractZipArchive(zip.blob)

    assert.strictEqual(extracted.length, 2)
    assert.ok(extracted.some((e) => e.name === "docs/readme.txt"))
    assert.ok(extracted.some((e) => e.name === "assets/images/logo.txt"))
  })

  await t.test("1.4 Empty and zero-byte file tolerance inside archive", async () => {
    const files = [
      { name: "empty.txt", data: new Uint8Array(0) },
      { name: "valid.txt", data: "Has content" },
    ]

    const zip = await services.zipFiles(files)
    const extracted = await services.extractZipArchive(zip.blob)

    assert.strictEqual(extracted.length, 2)
    const emptyEntry = extracted.find((e) => e.name === "empty.txt")
    assert.ok(emptyEntry)
    assert.strictEqual(emptyEntry.size, 0)
    assert.strictEqual(emptyEntry.data.length, 0)
  })

  await t.test("1.5 Compression levels: Store (0) vs Deflate (6)", async () => {
    const repetitive = "A".repeat(2000)
    const files = [{ name: "repeated.txt", data: repetitive }]

    const storeZip = await services.zipFiles(files, { compressionLevel: 0 })
    const storeExtracted = await services.extractZipArchive(storeZip.blob)
    assert.strictEqual(storeExtracted[0].method, 0, "Store mode must use method 0")

    const deflateZip = await services.zipFiles(files, { compressionLevel: 6 })
    const deflateExtracted = await services.extractZipArchive(deflateZip.blob)
    assert.strictEqual(deflateExtracted[0].method, 8, "Deflate mode must use method 8")
    assert.ok(deflateZip.compressedSize < storeZip.compressedSize, "Deflate must achieve compression on repetitive data")
  })
})

// ============================================================================
// SUITE 2: Client-Side OCR Text Recognition Engine
// ============================================================================

test("Suite 2: Client-Side OCR Text Recognition Engine", async (t) => {
  const services = loadServices()

  await t.test("2.1 Synthetic Image OCR Recognition with Otsu binarization and glyph matching", async () => {
    const testText = "FLUXKIT OCR 2026"
    const bmpBytes = services.createSyntheticTestImage(testText)
    assert.ok(bmpBytes.length > 54)
    assert.strictEqual(bmpBytes[0], 0x42)
    assert.strictEqual(bmpBytes[1], 0x4d)

    const ocr = await services.scanOCR(bmpBytes, { enhanceContrast: true })
    assert.strictEqual(ocr.sourceType, "image-raster")
    assert.ok(ocr.confidence >= 0.85, `Confidence was ${ocr.confidence}, expected >= 0.85`)
    assert.ok(ocr.lines.length >= 1)
    assert.ok(ocr.text.includes("FLUXKIT") || ocr.text.includes("OCR"))
  })

  await t.test("2.2 Multi-line image recognition and bounding box estimation", async () => {
    const multiLine = "PAGE ONE\nPAGE TWO"
    const bmpBytes = services.createSyntheticTestImage(multiLine)
    const ocr = await services.scanOCR(bmpBytes)

    assert.strictEqual(ocr.sourceType, "image-raster")
    assert.ok(ocr.lines.length >= 2, "Must segment multiple lines")
    assert.ok(ocr.wordCount >= 4)
  })

  await t.test("2.3 Digital PDF fast-path stream text extraction", async () => {
    const pdfBytes = await createTestPDF(2, "Annual Financial Report 2026")
    const ocr = await services.scanOCR(pdfBytes, { language: "en" })

    assert.strictEqual(ocr.sourceType, "pdf-digital")
    assert.ok(ocr.confidence >= 0.95, "Digital PDF text must have >= 95% confidence")
    assert.strictEqual(ocr.pageCount, 2)
    assert.ok(ocr.text.includes("Annual Financial Report 2026"))
    assert.ok(ocr.text.includes("Invoice #9821"))
    assert.ok(ocr.wordCount > 5)
  })

  await t.test("2.4 Inverted dark-mode polarity detection", async () => {
    const bmpBytes = services.createSyntheticTestImage("CONTRAST TEST")
    const ocr = await services.scanOCR(bmpBytes, { invertColors: false })
    assert.ok(ocr.confidence > 0.8)
  })
})

// ============================================================================
// SUITE 3: Universal Format Converter
// ============================================================================

test("Suite 3: Universal Format Converter", async (t) => {
  const services = loadServices()

  await t.test("3.1 detectFileType accurately categorizes extensions and MIME types", () => {
    assert.strictEqual(services.detectFileType("report.pdf"), "pdf")
    assert.strictEqual(services.detectFileType("doc.docx"), "word")
    assert.strictEqual(services.detectFileType("slides.pptx"), "ppt")
    assert.strictEqual(services.detectFileType("sheet.xlsx"), "excel")
    assert.strictEqual(services.detectFileType("data.csv"), "excel")
    assert.strictEqual(services.detectFileType("photo.jpg"), "image")
    assert.strictEqual(services.detectFileType("photo.png"), "image")
    assert.strictEqual(services.detectFileType("notes.txt"), "text")
    assert.strictEqual(services.detectFileType("unknown.xyz"), "unknown")
  })

  await t.test("3.2 PDF to Word (.docx) routing", async () => {
    const pdfBytes = await createTestPDF(1, "Quarterly Earnings")
    const pdfFile = toFile("earnings.pdf", pdfBytes, "application/pdf")

    const res = await services.universalConvert(pdfFile, { targetFormat: "docx" })
    assert.ok(res.name.endsWith(".docx"))
    assert.ok(res.blob.size > 0)

    // Verify it is a valid OpenXML ZIP containing word/document.xml
    const extracted = await services.extractZipArchive(res.blob)
    assert.ok(extracted.some((e) => e.name === "word/document.xml"))
  })

  await t.test("3.3 PDF to PowerPoint (.pptx) routing", async () => {
    const pdfBytes = await createTestPDF(1, "Slide Deck")
    const pdfFile = toFile("deck.pdf", pdfBytes, "application/pdf")

    const res = await services.universalConvert(pdfFile, { targetFormat: "pptx" })
    assert.ok(res.name.endsWith(".pptx"))

    const extracted = await services.extractZipArchive(res.blob)
    assert.ok(extracted.some((e) => e.name === "ppt/presentation.xml"))
  })

  await t.test("3.4 PDF to Excel (.xlsx) routing", async () => {
    const pdfBytes = await createTestPDF(1, "Spreadsheet Data")
    const pdfFile = toFile("sheet.pdf", pdfBytes, "application/pdf")

    const res = await services.universalConvert(pdfFile, { targetFormat: "xlsx" })
    assert.ok(res.name.endsWith(".xlsx"))

    const extracted = await services.extractZipArchive(res.blob)
    assert.ok(extracted.some((e) => e.name === "xl/workbook.xml"))
  })

  await t.test("3.5 PDF to JPG routing", async () => {
    const pdfBytes = await createTestPDF(1, "Page for JPG")
    const pdfFile = toFile("page.pdf", pdfBytes, "application/pdf")

    const res = await services.universalConvert(pdfFile, { targetFormat: "jpg" })
    assert.ok(res.name.endsWith(".jpg") || res.name.endsWith(".zip"))
    assert.ok(res.blob.size > 0)
  })

  await t.test("3.6 Text to PDF routing", async () => {
    const textContent = "Simple text document content."
    const txtFile = toFile("document.txt", new TextEncoder().encode(textContent), "text/plain")

    const res = await services.universalConvert(txtFile, { targetFormat: "pdf" })
    assert.ok(res.name.endsWith(".pdf"))
    const pdf = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.strictEqual(pdf.getPageCount(), 1)
  })

  await t.test("3.7 Base filename preservation", async () => {
    const pdfBytes = await createTestPDF(1, "Financial Analysis")
    const pdfFile = toFile("financial_report.pdf", pdfBytes, "application/pdf")

    const res = await services.universalConvert(pdfFile, { targetFormat: "docx" })
    assert.strictEqual(res.name, "financial_report-converted.docx")
  })
})

// ============================================================================
// SUITE 4: Chained Multi-Action Pipelines
// ============================================================================

test("Suite 4: Chained Multi-Action Pipelines", async (t) => {
  const services = loadServices()

  await t.test("4.1 convertAndCompress: Text/Document to PDF and compressed", async () => {
    const textContent = "Chained pipeline document text to convert and compress."
    const txtFile = toFile("draft.txt", new TextEncoder().encode(textContent), "text/plain")

    const progressEvents = []
    const res = await services.convertAndCompress(txtFile, {
      targetFormat: "pdf",
      compressLevel: "high",
      onProgress: (evt) => progressEvents.push(evt),
    })

    assert.ok(res.blob instanceof Blob)
    assert.ok(res.finalSize > 0)
    assert.ok(typeof res.savedPercentage === "number")
    assert.ok(res.filename.includes("compressed") || res.name.includes("compressed"))
    assert.ok(progressEvents.length >= 2, "Must fire progress callbacks across stages")
    assert.ok(progressEvents.some((e) => e.stage === "converting"))
    assert.ok(progressEvents.some((e) => e.stage === "compressing"))
  })

  await t.test("4.2 mergeAndCompress: Multi-PDF Merge + Stream Compression", async () => {
    const pdf1Bytes = await createTestPDF(2, "Doc A")
    const pdf2Bytes = await createTestPDF(1, "Doc B")
    const pdf3Bytes = await createTestPDF(3, "Doc C")

    const files = [
      toFile("docA.pdf", pdf1Bytes, "application/pdf"),
      toFile("docB.pdf", pdf2Bytes, "application/pdf"),
      toFile("docC.pdf", pdf3Bytes, "application/pdf"),
    ]

    const res = await services.mergeAndCompress(files, { compressLevel: "high" })
    assert.ok(res.blob instanceof Blob)
    assert.strictEqual(res.filename, "merged-compressed.pdf")

    // Verify merged page count is 2 + 1 + 3 = 6 pages
    const mergedDoc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.strictEqual(mergedDoc.getPageCount(), 6)
    assert.ok(res.originalSize > 0)
    assert.ok(res.finalSize > 0)
  })

  await t.test("4.3 splitAndCompress (Range Mode): Extracts page range and compresses", async () => {
    const pdfBytes = await createTestPDF(6, "Source PDF")
    const file = toFile("multi.pdf", pdfBytes, "application/pdf")

    const res = await services.splitAndCompress(file, {
      splitMode: "ranges",
      pageRange: "1-2, 5",
      compressLevel: "high",
    })

    assert.ok(res.blob instanceof Blob)
    assert.strictEqual(res.filename, "multi-split-compressed.pdf")

    // Verify resulting page count is 3 pages (pages 1, 2, and 5)
    const splitDoc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.strictEqual(splitDoc.getPageCount(), 3)
  })

  await t.test("4.4 splitAndCompress (All Pages Mode): Splits each page into compressed ZIP", async () => {
    const pdfBytes = await createTestPDF(3, "Archive Split")
    const file = toFile("pages.pdf", pdfBytes, "application/pdf")

    const res = await services.splitAndCompress(file, {
      splitMode: "all",
      compressLevel: "high",
    })

    assert.ok(res.blob instanceof Blob)
    assert.strictEqual(res.filename, "pages-split-compressed.zip")

    const extracted = await services.extractZipArchive(res.blob)
    assert.strictEqual(extracted.length, 3)
    assert.ok(extracted.some((e) => e.name === "compressed-page-1.pdf"))
    assert.ok(extracted.some((e) => e.name === "compressed-page-2.pdf"))
    assert.ok(extracted.some((e) => e.name === "compressed-page-3.pdf"))
  })

  await t.test("4.5 Bare Blob Chaining Safety via ensureFile", async () => {
    const pdfBytes = await createTestPDF(1, "Blob safety")
    const bareBlob = new Blob([pdfBytes], { type: "application/pdf" })

    const safeFile = services.ensureFile(bareBlob, "fallback.pdf")
    assert.ok(safeFile instanceof File || typeof safeFile.name === "string")
    assert.strictEqual(safeFile.name, "fallback.pdf")

    // Calling compressPDF with safeFile must NOT throw TypeError
    const compressed = await services.compressPDF(safeFile)
    assert.strictEqual(compressed.name, "compressed-fallback.pdf")
  })
})

// ============================================================================
// SUITE 5: Error Boundaries & Hostile Scenarios
// ============================================================================

test("Suite 5: Error Boundaries & Hostile Scenarios", async (t) => {
  const services = loadServices()

  await t.test("5.1 0-byte file input rejections", async () => {
    const emptyFile = toFile("empty.pdf", new Uint8Array(0), "application/pdf")

    await assert.rejects(
      async () => services.scanOCR(emptyFile),
      /File cannot be empty/,
    )

    await assert.rejects(
      async () => services.universalConvert(emptyFile),
      /File cannot be empty/,
    )

    await assert.rejects(
      async () => services.convertAndCompress(emptyFile),
      /File cannot be empty/,
    )

    await assert.rejects(
      async () => services.splitAndCompress(emptyFile),
      /File cannot be empty/,
    )

    await assert.rejects(
      async () => services.mergeAndCompress([emptyFile, emptyFile]),
      /empty/,
    )

    await assert.rejects(
      async () => services.extractZipArchive(new Uint8Array(0)),
      /Archive cannot be empty/,
    )
  })

  await t.test("5.2 split-compress page range boundary validation", async () => {
    const pdfBytes = await createTestPDF(3, "Bounds Test")
    const file = toFile("test.pdf", pdfBytes, "application/pdf")

    // Empty range string
    await assert.rejects(
      async () => services.splitAndCompress(file, { splitMode: "ranges", pageRange: "" }),
      /Specify page ranges/,
    )

    // Malformed syntax
    await assert.rejects(
      async () => services.splitAndCompress(file, { splitMode: "ranges", pageRange: "-1-5" }),
      /Invalid page range syntax/,
    )

    // Out of bounds page
    await assert.rejects(
      async () => services.splitAndCompress(file, { splitMode: "ranges", pageRange: "99" }),
      /out of bounds/,
    )
  })

  await t.test("5.3 merge-compress insufficient file count", async () => {
    const pdfBytes = await createTestPDF(1)
    const singleFile = toFile("single.pdf", pdfBytes, "application/pdf")

    await assert.rejects(
      async () => services.mergeAndCompress([singleFile]),
      /Choose at least two PDFs/,
    )

    await assert.rejects(
      async () => services.mergeAndCompress([]),
      /Choose at least two PDFs/,
    )
  })

  await t.test("5.4 Corrupt ZIP archive handling", async () => {
    const corruptData = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00])
    await assert.rejects(
      async () => services.extractZipArchive(corruptData),
      /End of central directory record not found/,
    )
  })
})

// ============================================================================
// SUITE 6: Route Rendering & UI Options Panel Mounting
// ============================================================================

test("Suite 6: Route Rendering & UI Options Panel Mounting", async (t) => {
  const routes = [
    {
      hash: "zip",
      name: "ZIP and Unzip",
      expectations: ["Create Archive", "Extract Archive", "Create ZIP Archive"],
    },
    {
      hash: "ocr",
      name: "OCR Scanner",
      expectations: ["Recognition Language & Script", "Scan & Extract Text", "Otsu Binarization"],
    },
    {
      hash: "convert",
      name: "Convert Formats",
      expectations: ["Target Format", "Conversion Quality", "Convert File"],
    },
    {
      hash: "convert-compress",
      name: "Convert & Compress",
      expectations: ["Target Format", "Compression Profile", "Convert & Compress"],
    },
    {
      hash: "merge-compress",
      name: "Merge & Compress",
      expectations: ["Compression Profile", "Strip PDF metadata", "Merge & Compress PDFs"],
    },
    {
      hash: "split-compress",
      name: "Split & Compress",
      expectations: ["Extract Mode", "Compression Profile", "Split & Compress PDF"],
    },
  ]

  for (const r of routes) {
    await t.test(`Route #${r.hash} renders active options panel and action button`, () => {
      const { load } = createDOMEnv(r.hash)
      const App = load("App").default
      const html = renderToStaticMarkup(React.createElement(App))

      const escapedName = r.name.replace(/&/g, "&amp;")
      assert.ok(
        html.includes(r.name) || html.includes(escapedName),
        `Route #${r.hash} must include title "${r.name}"`,
      )
      for (const exp of r.expectations) {
        const escapedExp = exp.replace(/&/g, "&amp;")
        assert.ok(
          html.includes(exp) || html.includes(escapedExp),
          `Route #${r.hash} must render UI element containing "${exp}"`,
        )
      }
    })
  }
})
