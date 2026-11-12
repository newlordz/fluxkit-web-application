/**
 * Challenger M4-R2-2: Independent Adversarial Stress & Boundary Test Suite
 *
 * This test suite stress-tests Milestone 4 tools and remediations:
 * 1. ZIP Archive Engine (`zipFiles`, `extractZipArchive`)
 *    - Empty archives, 0-byte entries, corrupted headers, bad signatures, truncated streams
 *    - Decompression limits (Zip bomb defense), Zip Slip path traversal & prototype injection sanitization
 *    - Concurrency and Unicode boundary stress
 * 2. OCR Text Recognition Engine (`scanOCR`, `loadBrowserCanvasPixels`)
 *    - Null, 0-byte, and malformed non-image binary inputs
 *    - Digital PDF fast-path multi-page text extraction
 *    - Browser canvas resource cleanup (URL.revokeObjectURL guaranteed in finally block)
 *    - Otsu binarization and inverted contrast handling
 * 3. Universal Format Converter (`universalConvert`, `detectFileType`)
 *    - Strict rejection of unsupported target formats
 *    - 0-byte inputs and invalid extensions
 *    - Bidirectional routing across documents and images
 * 4. Chained Multi-Action Pipelines
 *    - `convertAndCompress`: Stage weighting, progress monotonicity, metrics integrity
 *    - `mergeAndCompress`: Insufficient file count, 0-byte file detection, compression
 *    - `splitAndCompress`: Range validation, "all-pages" ZIP archive creation and nested PDF extraction
 *    - Bare Blob chaining safety via `ensureFile`
 * 5. Concurrent Pipeline Execution & Memory Stress
 *    - Parallel pipelines, repeated zip/extract cycles without state collision
 * 6. UI Route Rendering & Rapid Navigation Stress
 *    - All 6 M4 tool interfaces mount and render interactive options and action buttons
 *    - Rapid sequential router navigation between all M4 tools without crash
 */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib")

// ----------------------------------------------------------------------------
// Loader for `src/services.ts`
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// DOM Environment Simulation for React UI Components
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// Helper Utilities
// ----------------------------------------------------------------------------
async function createSamplePDF(pageCount = 2, content = "Sample Document") {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([500, 700])
    page.drawText(`${content} - Page ${i + 1}`, { x: 50, y: 650, size: 14, font, color: rgb(0, 0, 0) })
    page.drawText(`Line 2 item data: ${100 * (i + 1)}`, { x: 50, y: 620, size: 12, font, color: rgb(0, 0, 0) })
  }
  const bytes = await doc.save()
  return new File([bytes], "test-doc.pdf", { type: "application/pdf" })
}

function createTextFile(name, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  return new File([blob], name, { type: "text/plain;charset=utf-8" })
}

// ----------------------------------------------------------------------------
// SUITE 1: ZIP ARCHIVE ENGINE — ADVERSARIAL STRESS & CORRUPTION HARNESS
// ----------------------------------------------------------------------------
test("Suite 1: ZIP Archive Engine — Adversarial Stress & Boundaries", async (t) => {
  const services = loadServices()

  await t.test("1.1 zipFiles: Reject empty input and invalid data entries", async () => {
    await assert.rejects(
      async () => services.zipFiles([]),
      /Select at least one file to archive\./
    )

    await assert.rejects(
      async () => services.zipFiles(null),
      /Select at least one file to archive\./
    )

    await assert.rejects(
      async () => services.zipFiles([{ name: "invalid.dat", data: 12345 }]),
      /Invalid data type for entry "invalid\.dat"\./
    )
  })

  await t.test("1.2 extractZipArchive: Reject empty, truncated, or zero-byte archives", async () => {
    // 0-byte Buffer
    await assert.rejects(
      async () => services.extractZipArchive(new Uint8Array(0)),
      /Archive cannot be empty\./
    )

    // 0-byte Blob
    await assert.rejects(
      async () => services.extractZipArchive(new Blob([])),
      /Archive cannot be empty\./
    )

    // Less than 22 bytes (smaller than minimal EOCD)
    const smallGarbage = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00])
    await assert.rejects(
      async () => services.extractZipArchive(smallGarbage),
      /End of central directory record not found\./
    )

    // 100 bytes of random garbage without EOCD signature
    const garbage100 = new Uint8Array(100).fill(0xfe)
    await assert.rejects(
      async () => services.extractZipArchive(garbage100),
      /End of central directory record not found\./
    )
  })

  await t.test("1.3 extractZipArchive: Detect corrupted Central Directory offsets and signatures", async () => {
    // First craft a valid zip
    const validZip = await services.zipFiles([
      { name: "test.txt", data: "Hello World" }
    ])
    const bytes = new Uint8Array(await validZip.blob.arrayBuffer())
    const origView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const cdOffset = origView.getUint32(bytes.length - 6, true)

    // Corrupt Central Directory offset in EOCD (offset is at len - 6)
    const corruptedCDOffset = new Uint8Array(bytes)
    const view = new DataView(corruptedCDOffset.buffer, corruptedCDOffset.byteOffset, corruptedCDOffset.byteLength)
    view.setUint32(corruptedCDOffset.length - 6, 999999, true)

    await assert.rejects(
      async () => services.extractZipArchive(corruptedCDOffset),
      /Corrupted ZIP archive: Central directory offset is out of range\./
    )

    // Corrupt Central Directory header signature (change 0x02014b50 to 0xdeadbeef)
    const corruptedCDSig = new Uint8Array(bytes)
    const cdView = new DataView(corruptedCDSig.buffer, corruptedCDSig.byteOffset, corruptedCDSig.byteLength)
    cdView.setUint32(cdOffset, 0xdeadbeef, true)

    await assert.rejects(
      async () => services.extractZipArchive(corruptedCDSig),
      /Corrupted ZIP archive: Invalid central directory signature/
    )
  })

  await t.test("1.4 extractZipArchive: Truncated local file data detection", async () => {
    const validZip = await services.zipFiles([
      { name: "data.bin", data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) }
    ])
    const bytes = new Uint8Array(await validZip.blob.arrayBuffer())

    // Chop off 5 bytes from the local data area
    const truncated = new Uint8Array(bytes.length - 5)
    truncated.set(bytes.subarray(0, 35)) // header
    truncated.set(bytes.subarray(40), 35)

    await assert.rejects(
      async () => services.extractZipArchive(truncated),
      /Corrupted ZIP archive/
    )
  })

  await t.test("1.5 extractZipArchive: Decompression limit protection (Zip Bomb defense)", async () => {
    // Create an archive with 10KB repetitive data
    const bigData = "A".repeat(10000)
    const zipResult = await services.zipFiles([
      { name: "bomb.txt", data: bigData }
    ], { compressionLevel: 6 })

    // Extraction with maxTotalBytes set to 500 bytes must abort
    await assert.rejects(
      async () => services.extractZipArchive(zipResult.blob, { maxTotalBytes: 500 }),
      /(Decompressed data exceeds security limit|Archive exceeds maximum decompression limit) of 500 bytes\./
    )

    // Extraction with adequate limit must succeed
    const extracted = await services.extractZipArchive(zipResult.blob, { maxTotalBytes: 50000 })
    assert.strictEqual(extracted.length, 1)
    assert.strictEqual(extracted[0].text(), bigData)
  })

  await t.test("1.6 extractZipArchive: Security path sanitization (Zip Slip & Prototype Pollution)", async () => {
    // Craft zip entries with malicious filenames
    const maliciousFiles = [
      { name: "../../../etc/passwd", data: "root:x:0:0" },
      { name: "..\\..\\windows\\system32\\calc.exe", data: "calc" },
      { name: "/var/log/secret.log", data: "secret" },
      { name: "__proto__", data: "polluted" },
      { name: "constructor", data: "polluted" },
      { name: "prototype", data: "polluted" },
      { name: "__proto__/evil.txt", data: "evil" },
    ]

    const zipResult = await services.zipFiles(maliciousFiles, { compressionLevel: 0 })
    const extracted = await services.extractZipArchive(zipResult.blob)

    const names = extracted.map((e) => e.name)
    assert.ok(!names.some((n) => n.includes("..")), "Path traversal (..) must be completely stripped")
    assert.ok(!names.some((n) => n.startsWith("/")), "Absolute path leading slashes must be stripped")
    assert.ok(names.includes("etc/passwd"), "Should sanitize ../../../etc/passwd to etc/passwd")
    assert.ok(names.includes("windows/system32/calc.exe"), "Should sanitize windows path")
    assert.ok(names.includes("var/log/secret.log"), "Should strip leading slash")
    assert.ok(names.includes("safe___proto__"), "__proto__ must be prefixed with safe_")
    assert.ok(names.includes("safe_constructor"), "constructor must be prefixed with safe_")
    assert.ok(names.includes("safe_prototype"), "prototype must be prefixed with safe_")
    assert.ok(names.includes("safe___proto__/evil.txt"), "__proto__/ subpaths must be prefixed with safe_")
  })

  await t.test("1.7 zipFiles & extractZipArchive: High-volume concurrent entries (50 files)", async () => {
    const fileEntries = []
    for (let i = 0; i < 50; i++) {
      fileEntries.push({
        name: `dir_${i % 5}/file_${i}.txt`,
        data: `Content for file ${i}: ${"x".repeat(i * 10)}`
      })
    }

    const zipResult = await services.zipFiles(fileEntries, {
      archiveName: "stress-50.zip",
      compressionLevel: 6,
    })

    assert.strictEqual(zipResult.totalFiles, 50)
    assert.ok(zipResult.blob.size > 0)

    const extracted = await services.extractZipArchive(zipResult.blob)
    assert.strictEqual(extracted.length, 50)

    for (let i = 0; i < 50; i++) {
      const match = extracted.find((e) => e.name === `dir_${i % 5}/file_${i}.txt`)
      assert.ok(match, `Entry dir_${i % 5}/file_${i}.txt must exist`)
      assert.strictEqual(match.text(), `Content for file ${i}: ${"x".repeat(i * 10)}`)
    }
  })
})

// ----------------------------------------------------------------------------
// SUITE 2: OCR TEXT RECOGNITION ENGINE — BOUNDARIES & MEMORY HARNESS
// ----------------------------------------------------------------------------
test("Suite 2: OCR Text Recognition — Boundaries & Memory Harness", async (t) => {
  const services = loadServices()

  await t.test("2.1 scanOCR: Input validation boundaries (null, empty)", async () => {
    await assert.rejects(
      async () => services.scanOCR(null),
      /Select an image or PDF file to scan\./
    )

    await assert.rejects(
      async () => services.scanOCR(new Blob([])),
      /File cannot be empty\./
    )

    await assert.rejects(
      async () => services.scanOCR(new Uint8Array(0)),
      /File cannot be empty\./
    )
  })

  await t.test("2.2 scanOCR: Malformed non-image binary fallback", async () => {
    // Arbitrary binary data that is neither PDF nor BMP
    const randomBinary = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04])
    const result = await services.scanOCR(randomBinary)
    assert.ok(result)
    assert.strictEqual(typeof result.text, "string")
    assert.strictEqual(result.sourceType, "image-raster")
    assert.strictEqual(result.lines.length, 0)
    assert.ok(result.confidence >= 0.8)
  })

  await t.test("2.3 scanOCR: Digital PDF fast-path multi-page text extraction", async () => {
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const page1 = pdfDoc.addPage([500, 700])
    page1.drawText("INVOICE NUMBER: 2026-INV-9988", { x: 50, y: 650, size: 14, font })
    page1.drawText("Customer Name: Acme Global Corporation", { x: 50, y: 620, size: 12, font })

    const page2 = pdfDoc.addPage([500, 700])
    page2.drawText("Terms: Payment Due Within 30 Days", { x: 50, y: 650, size: 14, font })
    page2.drawText("Total Amount Due: $12,450.00 USD", { x: 50, y: 620, size: 12, font })

    const pdfBytes = await pdfDoc.save()
    const ocrResult = await services.scanOCR(pdfBytes)

    assert.strictEqual(ocrResult.sourceType, "pdf-digital")
    assert.strictEqual(ocrResult.pageCount, 2)
    assert.ok(ocrResult.text.includes("INVOICE NUMBER: 2026-INV-9988"))
    assert.ok(ocrResult.text.includes("Acme Global Corporation"))
    assert.ok(ocrResult.text.includes("Payment Due Within 30 Days"))
    assert.ok(ocrResult.text.includes("Total Amount Due: $12,450.00 USD"))
    assert.ok(ocrResult.confidence >= 0.85)
    assert.ok(ocrResult.wordCount > 10)
    assert.ok(ocrResult.characterCount > 50)
  })

  await t.test("2.4 loadBrowserCanvasPixels: Guaranteed URL.revokeObjectURL cleanup in finally", async () => {
    // Stress the single try...catch...finally construct in loadBrowserCanvasPixels
    // Emulate browser environment with custom URL.revokeObjectURL tracker
    let createdUrl = null
    let revokedUrl = null

    const fakeBlob = new Blob(["test"], { type: "image/png" })
    const mockURL = {
      createObjectURL: () => {
        createdUrl = "blob:http://localhost/mock-uuid-" + Math.random()
        return createdUrl
      },
      revokeObjectURL: (u) => {
        revokedUrl = u
      },
    }

    // Case A: Image onerror fires
    const mockWindowError = {
      Image: function () {
        setTimeout(() => {
          if (this.onerror) this.onerror(new Error("Simulated image failure"))
        }, 5)
      },
    }
    const mockDoc = {
      createElement: () => ({
        getContext: () => null,
      }),
    }

    const servicesCode = fs.readFileSync("src/services.ts", "utf8")
    const transpiled = ts.transpileModule(servicesCode, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace(/import\.meta\.env/g, "process.env")

    const sandbox = {
      exports: {},
      require: (id) => (id === "./jobTypes" ? {} : require(id)),
      process: { env: {} },
      document: mockDoc,
      window: mockWindowError,
      URL: mockURL,
      Blob,
      File,
      TextEncoder,
      TextDecoder,
      setTimeout,
      clearTimeout,
    }
    vm.runInNewContext(`(function(){\n${transpiled}\nexports.testLoad = loadBrowserCanvasPixels;\n})()`, sandbox)

    const resError = await sandbox.exports.testLoad(fakeBlob)
    assert.strictEqual(resError, null, "Should return null on image failure")
    assert.ok(createdUrl, "createObjectURL should have been called")
    assert.strictEqual(revokedUrl, createdUrl, "revokeObjectURL MUST be called when onerror triggers")

    // Case B: new Image() constructor throws exception immediately
    let createdUrl2 = null
    let revokedUrl2 = null
    const mockURL2 = {
      createObjectURL: () => {
        createdUrl2 = "blob:http://localhost/throw-" + Math.random()
        return createdUrl2
      },
      revokeObjectURL: (u) => {
        revokedUrl2 = u
      },
    }
    const mockWindowThrow = {
      Image: function () {
        throw new Error("Immediate constructor failure")
      },
    }
    sandbox.URL = mockURL2
    sandbox.window = mockWindowThrow

    const resThrow = await sandbox.exports.testLoad(fakeBlob)
    assert.strictEqual(resThrow, null, "Should catch and return null on constructor exception")
    assert.strictEqual(revokedUrl2, createdUrl2, "revokeObjectURL MUST be called even if Image() constructor throws")
  })
})

// ----------------------------------------------------------------------------
// SUITE 3: UNIVERSAL FORMAT CONVERTER — BOUNDARIES & TARGET FORMAT STRICTNESS
// ----------------------------------------------------------------------------
test("Suite 3: Universal Format Converter — Boundaries & Strictness", async (t) => {
  const services = loadServices()

  await t.test("3.1 universalConvert: Rejects null and 0-byte files", async () => {
    await assert.rejects(
      async () => services.universalConvert(null),
      /Select a file to convert\./
    )

    const zeroFile = new File([new Blob([])], "empty.pdf", { type: "application/pdf" })
    await assert.rejects(
      async () => services.universalConvert(zeroFile),
      /File cannot be empty\./
    )
  })

  await t.test("3.2 universalConvert: Strict rejection of unsupported target formats", async () => {
    const samplePdf = await createSamplePDF(1, "Test")

    await assert.rejects(
      async () => services.universalConvert(samplePdf, { targetFormat: "mp4" }),
      /Unsupported target format "mp4" for PDF conversion\./
    )

    await assert.rejects(
      async () => services.universalConvert(samplePdf, { targetFormat: "exe" }),
      /Unsupported target format "exe" for PDF conversion\./
    )

    const sampleDocx = new File([new Blob(["test"])], "doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    await assert.rejects(
      async () => services.universalConvert(sampleDocx, { targetFormat: "jpg" }),
      /Unsupported target format "jpg" for Word documents\./
    )

    const samplePptx = new File([new Blob(["test"])], "slides.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    })
    await assert.rejects(
      async () => services.universalConvert(samplePptx, { targetFormat: "excel" }),
      /Unsupported target format "excel" for PowerPoint presentations\./
    )

    const sampleXlsx = new File([new Blob(["test"])], "data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    await assert.rejects(
      async () => services.universalConvert(sampleXlsx, { targetFormat: "word" }),
      /Unsupported target format "word" for Spreadsheets\./
    )
  })

  await t.test("3.3 universalConvert: Valid routing produces genuine artifacts", async () => {
    const samplePdf = await createSamplePDF(2, "Universal Convert Test")

    // PDF -> DOCX
    const docxResult = await services.universalConvert(samplePdf, { targetFormat: "docx" })
    assert.ok(docxResult.name.endsWith(".docx"))
    assert.ok(docxResult.blob.size > 0)
    const docxEntries = await services.extractZipArchive(docxResult.blob)
    assert.ok(docxEntries.some((e) => e.name === "word/document.xml"))

    // PDF -> PPTX
    const pptxResult = await services.universalConvert(samplePdf, { targetFormat: "pptx" })
    assert.ok(pptxResult.name.endsWith(".pptx"))
    assert.ok(pptxResult.blob.size > 0)
    const pptxEntries = await services.extractZipArchive(pptxResult.blob)
    assert.ok(pptxEntries.some((e) => e.name === "ppt/presentation.xml"))

    // PDF -> XLSX
    const xlsxResult = await services.universalConvert(samplePdf, { targetFormat: "xlsx" })
    assert.ok(xlsxResult.name.endsWith(".xlsx"))
    assert.ok(xlsxResult.blob.size > 0)
    const xlsxEntries = await services.extractZipArchive(xlsxResult.blob)
    assert.ok(xlsxEntries.some((e) => e.name === "xl/workbook.xml"))

    // Text -> PDF
    const textFile = createTextFile("notes.txt", "Title: My Meeting Notes\nPoint 1: Discuss budget.\nPoint 2: Timeline.")
    const pdfResult = await services.universalConvert(textFile, { targetFormat: "pdf" })
    assert.ok(pdfResult.name.endsWith(".pdf"))
    assert.ok(pdfResult.blob.size > 0)
    const parsedPdf = await PDFDocument.load(await pdfResult.blob.arrayBuffer())
    assert.strictEqual(parsedPdf.getPageCount(), 1)
  })
})

// ----------------------------------------------------------------------------
// SUITE 4: CHAINED MULTI-ACTION PIPELINES & PROGRESS TRACKING
// ----------------------------------------------------------------------------
test("Suite 4: Chained Multi-Action Pipelines & Progress Tracking", async (t) => {
  const services = loadServices()

  await t.test("4.1 convertAndCompress: End-to-end execution and monotonic progress callback", async () => {
    const textFile = createTextFile("report.txt", "Annual Report 2026\n" + "Financial Data Summary\n".repeat(20))

    const progressReports = []
    const result = await services.convertAndCompress(textFile, {
      targetFormat: "pdf",
      compressLevel: "high",
      onProgress: (p) => {
        progressReports.push({ progress: p.overallProgress, stage: p.stage, message: p.message })
      },
    })

    assert.ok(result.blob instanceof Blob)
    assert.ok(result.name.endsWith(".pdf"))
    assert.ok(result.originalSize > 0)
    assert.ok(result.finalSize > 0)

    // Progress verification: at least 2 reports, monotonically increasing, finishing at 100
    assert.ok(progressReports.length >= 2, "Must produce multiple progress events")
    for (let i = 1; i < progressReports.length; i++) {
      assert.ok(
        progressReports[i].progress >= progressReports[i - 1].progress,
        `Progress must not decrease: ${progressReports[i - 1].progress} -> ${progressReports[i].progress}`
      )
    }
    assert.strictEqual(progressReports[progressReports.length - 1].progress, 100)
  })

  await t.test("4.2 mergeAndCompress: Rejections and valid multi-PDF pipeline", async () => {
    // Insufficient files
    await assert.rejects(
      async () => services.mergeAndCompress([]),
      /Choose at least two PDFs to merge and compress\./
    )

    const pdf1 = await createSamplePDF(1, "Doc 1")
    await assert.rejects(
      async () => services.mergeAndCompress([pdf1]),
      /Choose at least two PDFs to merge and compress\./
    )

    // Contains 0-byte file
    const zeroPdf = new File([new Blob([])], "zero.pdf", { type: "application/pdf" })
    await assert.rejects(
      async () => services.mergeAndCompress([pdf1, zeroPdf]),
      /zero\.pdf is empty \(0 bytes\)\./
    )

    // Valid 3-file merge + compression
    const pdf2 = await createSamplePDF(1, "Doc 2")
    const pdf3 = await createSamplePDF(1, "Doc 3")

    const progressReports = []
    const result = await services.mergeAndCompress([pdf1, pdf2, pdf3], {
      compressLevel: "high",
      onProgress: (p) => progressReports.push(p.overallProgress),
    })

    assert.ok(result.blob instanceof Blob)
    assert.strictEqual(result.filename, "merged-compressed.pdf")
    assert.ok(result.originalSize > 0)
    assert.ok(result.finalSize > 0)

    // Load resulting PDF to verify it has 3 pages
    const mergedDoc = await PDFDocument.load(await result.blob.arrayBuffer())
    assert.strictEqual(mergedDoc.getPageCount(), 3)
    assert.strictEqual(progressReports[progressReports.length - 1], 100)
  })

  await t.test("4.3 splitAndCompress (Range Mode): Page range boundary validation", async () => {
    const multiPagePdf = await createSamplePDF(4, "Multi Page")

    // Empty ranges in 'ranges' mode
    await assert.rejects(
      async () => services.splitAndCompress(multiPagePdf, { splitMode: "ranges", pageRange: "" }),
      /Specify page ranges to extract\./
    )

    // Extract pages 2-3
    const result = await services.splitAndCompress(multiPagePdf, {
      splitMode: "range",
      pageRange: "2-3",
    })

    assert.ok(result.blob instanceof Blob)
    const extractedPdf = await PDFDocument.load(await result.blob.arrayBuffer())
    assert.strictEqual(extractedPdf.getPageCount(), 2)
  })

  await t.test("4.4 splitAndCompress (All Pages Mode): Splits, compresses, and packages into valid ZIP", async () => {
    const multiPagePdf = await createSamplePDF(3, "All Pages Split Test")

    const stagesReported = new Set()
    const result = await services.splitAndCompress(multiPagePdf, {
      splitMode: "all-pages",
      compressLevel: "high",
      onProgress: (p) => {
        stagesReported.add(p.stage)
      },
    })

    assert.ok(result.blob instanceof Blob)
    assert.ok(result.name.endsWith("-split-compressed.zip"))
    assert.ok(stagesReported.has("splitting"))
    assert.ok(stagesReported.has("compressing"))
    assert.ok(stagesReported.has("packaging"))

    // Extract the resulting ZIP archive and verify every single nested PDF
    const entries = await services.extractZipArchive(result.blob)
    assert.strictEqual(entries.length, 3, "ZIP must contain exactly 3 split pages")

    for (let i = 0; i < 3; i++) {
      const entry = entries.find((e) => e.name === `compressed-page-${i + 1}.pdf`)
      assert.ok(entry, `Entry compressed-page-${i + 1}.pdf must exist in archive`)
      const pageDoc = await PDFDocument.load(entry.data)
      assert.strictEqual(pageDoc.getPageCount(), 1, `Extracted page ${i + 1} must be a valid 1-page PDF`)
    }
  })

  await t.test("4.5 Bare Blob Chaining Safety: Functions accept Blob without File interface", async () => {
    const samplePdf = await createSamplePDF(2, "Bare Blob Test")
    const bareBlob = new Blob([await samplePdf.arrayBuffer()], { type: "application/pdf" })

    assert.ok(typeof services.ensureFile === "function")
    const wrapped = services.ensureFile(bareBlob, "fallback.pdf")
    assert.ok(wrapped instanceof File)
    assert.strictEqual(wrapped.name, "fallback.pdf")
    assert.strictEqual(wrapped.size, bareBlob.size)
  })
})

// ----------------------------------------------------------------------------
// SUITE 5: CONCURRENT PIPELINE EXECUTION & STRESS HARNESS
// ----------------------------------------------------------------------------
test("Suite 5: Concurrent Pipeline Execution & Memory Stress", async (t) => {
  const services = loadServices()

  await t.test("5.1 Parallel execution of 10 simultaneous convertAndCompress jobs", async () => {
    const jobs = []
    for (let i = 0; i < 10; i++) {
      const file = createTextFile(`parallel_${i}.txt`, `Document ${i} content\n` + "Line data\n".repeat(10))
      jobs.push(services.convertAndCompress(file, { targetFormat: "pdf", compressLevel: "standard" }))
    }

    const results = await Promise.all(jobs)
    assert.strictEqual(results.length, 10)
    for (let i = 0; i < 10; i++) {
      assert.ok(results[i].blob.size > 0)
      assert.ok(results[i].name.endsWith(".pdf"))
      assert.ok(results[i].name.startsWith("compressed-"))
    }
  })

  await t.test("5.2 Repeated Zip & Unzip cycles without memory or buffer corruption", async () => {
    for (let cycle = 0; cycle < 15; cycle++) {
      const payload = {
        name: `cycle_${cycle}.json`,
        data: JSON.stringify({ cycle, timestamp: Date.now(), items: [1, 2, 3, 4, 5] }),
      }
      const zipRes = await services.zipFiles([payload], { compressionLevel: 6 })
      const unzipped = await services.extractZipArchive(zipRes.blob)
      assert.strictEqual(unzipped.length, 1)
      const parsed = JSON.parse(unzipped[0].text())
      assert.strictEqual(parsed.cycle, cycle)
    }
  })
})

// ----------------------------------------------------------------------------
// SUITE 6: UI ROUTE RENDERING & RAPID ROUTER TRANSITIONS
// ----------------------------------------------------------------------------
test("Suite 6: UI Route Rendering & Rapid Navigation Stress", async (t) => {
  const m4Tools = [
    { hash: "zip", name: "ZIP and Unzip", actionBtn: "Create ZIP Archive" },
    { hash: "ocr", name: "OCR Scanner", actionBtn: "Scan & Extract Text" },
    { hash: "convert", name: "Convert Formats", actionBtn: "Convert File" },
    { hash: "convert-compress", name: "Convert & Compress", actionBtn: "Convert & Compress" },
    { hash: "merge-compress", name: "Merge & Compress", actionBtn: "Merge & Compress PDFs" },
    { hash: "split-compress", name: "Split & Compress", actionBtn: "Split & Compress PDF" },
  ]

  for (const tool of m4Tools) {
    await t.test(`6.1 UI route #${tool.hash} renders active options panel and "${tool.actionBtn}"`, () => {
      const { load } = createDOMEnv(tool.hash)
      const App = load("App").default
      const html = renderToStaticMarkup(React.createElement(App))

      const escapedName = tool.name.replace(/&/g, "&amp;")
      const escapedAction = tool.actionBtn.replace(/&/g, "&amp;")
      assert.ok(
        html.includes(tool.name) || html.includes(escapedName),
        `Must render title "${tool.name}"`,
      )
      assert.ok(
        html.includes(tool.actionBtn) || html.includes(escapedAction),
        `Must render action button "${tool.actionBtn}"`,
      )
    })
  }

  await t.test("6.2 Rapid sequential transitions across all M4 routes without crash or memory leak", () => {
    for (let i = 0; i < 20; i++) {
      const target = m4Tools[i % m4Tools.length]
      const { load } = createDOMEnv(target.hash)
      const App = load("App").default
      const html = renderToStaticMarkup(React.createElement(App))
      assert.ok(html.length > 500)
    }
  })
})
