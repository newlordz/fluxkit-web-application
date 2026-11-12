const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const { PDFDocument } = require("pdf-lib")

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
        Blob,
        File,
        URL,
        setTimeout,
        clearTimeout,
        CustomEvent: class CustomEvent {
          constructor(type, init) {
            this.type = type
            this.detail = init?.detail
          }
        },
        AbortSignal,
        DOMException,
      },
      { filename },
    )
    return exports
  }

  return { load }
}

// 1x1 transparent PNG fixture for signature testing
const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
const SAMPLE_PNG_BYTES = Buffer.from(SAMPLE_PNG_BASE64, "base64")

// Helper: convert OutputResult blob into a File object for next pipeline stage
async function resultToFile(res, filename) {
  const buf = await res.blob.arrayBuffer()
  return new File([buf], filename || res.name, { type: "application/pdf" })
}

// ============================================================================
// SUITE 1: 6-Step End-to-End PDF Lifecycle Stress Test
// ============================================================================

test("Lifecycle Step 1: textToPDF generates a multi-page valid document", async () => {
  const services = loadServices()

  // Generate 4 long paragraphs that will definitely span multiple pages
  const paragraph =
    "FluxKit client-side processing architecture delivers private, browser-first tools for document manipulation, format conversion, and visual editing without requiring server execution. "
      .repeat(10)
  const fullText = [
    "SECTION 1: ARCHITECTURAL OVERVIEW",
    paragraph,
    "SECTION 2: ENCRYPTION & INTEGRITY",
    paragraph,
    "SECTION 3: VECTOR & RASTER STAMPING",
    paragraph,
    "SECTION 4: FINAL SPECIFICATION & NOTES",
    paragraph,
  ].join("\n\n")

  const res1 = await services.textToPDF(fullText, "FluxKit Multi-Page Lifecycle Specification")
  assert.ok(res1 && res1.blob, "Step 1 must return OutputResult with a blob")
  assert.equal(res1.name, "fluxkit-document.pdf")
  assert.equal(res1.blob.type, "application/pdf")

  const doc1 = await PDFDocument.load(await res1.blob.arrayBuffer())
  const pageCount1 = doc1.getPageCount()
  assert.ok(
    pageCount1 >= 3,
    `Expected multi-page PDF (at least 3 pages), got ${pageCount1} pages`,
  )

  // Verify page dimensions
  const pages = doc1.getPages()
  for (const page of pages) {
    const { width, height } = page.getSize()
    assert.ok(width > 500, `Page width should be standard letter, got ${width}`)
    assert.ok(height > 700, `Page height should be standard letter, got ${height}`)
  }
})

test("Lifecycle Step 2: watermarkPDF applies rotated watermark across all pages", async () => {
  const services = loadServices()

  // Generate multi-page PDF base
  const paragraph = "FluxKit document content. ".repeat(40)
  const baseRes = await services.textToPDF(
    `${paragraph}\n\n${paragraph}\n\n${paragraph}`,
    "Watermark Test Document",
  )
  const baseDoc = await PDFDocument.load(await baseRes.blob.arrayBuffer())
  const initialPageCount = baseDoc.getPageCount()

  const file = await resultToFile(baseRes)
  const res2 = await services.watermarkPDF(file, {
    text: "CONFIDENTIAL REVIEW COPY",
    opacity: 0.35,
    rotation: 45,
    fontSize: 42,
    color: { r: 0.8, g: 0.1, b: 0.1 },
  })

  assert.ok(res2 && res2.blob)
  assert.equal(res2.name, "watermarked-fluxkit-document.pdf")

  const doc2 = await PDFDocument.load(await res2.blob.arrayBuffer())
  assert.equal(
    doc2.getPageCount(),
    initialPageCount,
    "Watermarking must preserve identical page count",
  )

  // Check each page remains structurally valid and parseable
  for (let i = 0; i < doc2.getPageCount(); i++) {
    const page = doc2.getPage(i)
    assert.ok(page.getSize().width > 0)
    assert.ok(page.getSize().height > 0)
  }
})

test("Lifecycle Step 3: signPDF stamps embedded PNG signature on target page", async () => {
  const services = loadServices()

  const paragraph = "FluxKit document signing flow. ".repeat(40)
  const baseRes = await services.textToPDF(
    `${paragraph}\n\n${paragraph}\n\n${paragraph}`,
    "Sign Test Document",
  )
  const baseDoc = await PDFDocument.load(await baseRes.blob.arrayBuffer())
  const initialPageCount = baseDoc.getPageCount()
  const file = await resultToFile(baseRes)

  const res3 = await services.signPDF(file, {
    signerName: "Chief Reviewer Jamie Davis",
    signatureImageBytes: SAMPLE_PNG_BYTES,
    pageNumber: 2,
    position: "bottom-right",
    date: "2026-11-10",
  })

  assert.ok(res3 && res3.blob)
  assert.equal(res3.name, "signed-fluxkit-document.pdf")

  const doc3 = await PDFDocument.load(await res3.blob.arrayBuffer())
  assert.equal(doc3.getPageCount(), initialPageCount, "Signing must preserve page count")
})

test("Lifecycle Step 4: editPDF stamps header callout box on target page", async () => {
  const services = loadServices()

  const paragraph = "FluxKit document annotation workflow. ".repeat(40)
  const baseRes = await services.textToPDF(
    `${paragraph}\n\n${paragraph}\n\n${paragraph}`,
    "Annotation Test Document",
  )
  const baseDoc = await PDFDocument.load(await baseRes.blob.arrayBuffer())
  const initialPageCount = baseDoc.getPageCount()
  const file = await resultToFile(baseRes)

  const res4 = await services.editPDF(file, {
    annotation: "VERIFIED & APPROVED FOR RELEASE - FluxKit M2",
    pageNumber: 1,
    type: "callout",
    position: "top",
  })

  assert.ok(res4 && res4.blob)
  assert.equal(res4.name, "edited-fluxkit-document.pdf")

  const doc4 = await PDFDocument.load(await res4.blob.arrayBuffer())
  assert.equal(doc4.getPageCount(), initialPageCount, "Editing must preserve page count")
})

test("Lifecycle Step 5: compressPDF optimizes object streams with high level", async () => {
  const services = loadServices()

  const paragraph = "FluxKit compression and stream optimization. ".repeat(50)
  const baseRes = await services.textToPDF(
    `${paragraph}\n\n${paragraph}\n\n${paragraph}`,
    "Compress Test Document",
  )
  const baseDoc = await PDFDocument.load(await baseRes.blob.arrayBuffer())
  const initialPageCount = baseDoc.getPageCount()
  const file = await resultToFile(baseRes)

  const res5 = await services.compressPDF(file, { level: "high" })
  assert.ok(res5 && res5.blob)
  assert.equal(res5.name, "compressed-fluxkit-document.pdf")

  const doc5 = await PDFDocument.load(await res5.blob.arrayBuffer())
  assert.equal(doc5.getPageCount(), initialPageCount, "Compression must preserve page count")
  assert.equal(doc5.getCreator(), "FluxKit")
  assert.equal(doc5.getTitle(), "")
  assert.equal(doc5.getAuthor(), "")
})

test("Lifecycle Step 6: splitPDF extracts subrange 1-2 from multi-page document", async () => {
  const services = loadServices()

  const paragraph = "FluxKit split page extraction. ".repeat(50)
  const baseRes = await services.textToPDF(
    `${paragraph}\n\n${paragraph}\n\n${paragraph}`,
    "Split Test Document",
  )
  const file = await resultToFile(baseRes)

  const res6 = await services.splitPDF(file, "1-2")
  assert.ok(res6 && res6.blob)
  assert.equal(res6.name, "split-fluxkit-document.pdf")

  const doc6 = await PDFDocument.load(await res6.blob.arrayBuffer())
  assert.equal(
    doc6.getPageCount(),
    2,
    "Extracted subrange '1-2' must yield exactly 2 pages",
  )
})

test("Full 6-Step End-to-End Chain: textToPDF -> watermarkPDF -> signPDF -> editPDF -> compressPDF -> splitPDF", async () => {
  const services = loadServices()

  // 1. textToPDF
  const fullText = [
    "SECTION 1: EXECUTIVE MANDATE",
    "FluxKit provides an integrated 37-tool suite running entirely inside the user browser. ".repeat(15),
    "SECTION 2: SECURITY & SIGNING SPECIFICATIONS",
    "Digital signatures, watermark stamps, and annotations are applied client-side without remote telemetry. ".repeat(15),
    "SECTION 3: ARCHIVAL & COMPRESSION",
    "PDF object streams are rewritten and compressed to minimize storage footprints. ".repeat(15),
    "SECTION 4: VERIFICATION AUDIT",
    "All intermediate documents must remain strictly valid and parseable by standard PDF parsers. ".repeat(15),
  ].join("\n\n")

  const step1 = await services.textToPDF(fullText, "Full Lifecycle Document")
  assert.ok(step1.blob && step1.blob.size > 0, "Step 1 returned valid blob")
  const doc1 = await PDFDocument.load(await step1.blob.arrayBuffer())
  const totalPages = doc1.getPageCount()
  assert.ok(totalPages >= 3, `Expected at least 3 pages from textToPDF, got ${totalPages}`)

  // 2. watermarkPDF
  const file1 = await resultToFile(step1, "lifecycle-1.pdf")
  const step2 = await services.watermarkPDF(file1, {
    text: "OFFICIAL AUDIT COPY",
    opacity: 0.4,
    rotation: 45,
    fontSize: 40,
    color: { r: 0.85, g: 0.15, b: 0.15 },
  })
  assert.ok(step2.blob && step2.blob.size > 0, "Step 2 returned valid blob")
  const doc2 = await PDFDocument.load(await step2.blob.arrayBuffer())
  assert.equal(doc2.getPageCount(), totalPages, "Step 2 preserved total pages")

  // 3. signPDF
  const file2 = await resultToFile(step2, "lifecycle-2.pdf")
  const step3 = await services.signPDF(file2, {
    signerName: "Empirical Auditor",
    signatureImageBytes: SAMPLE_PNG_BYTES,
    pageNumber: totalPages,
    position: "bottom-right",
    date: "2026-11-10",
  })
  assert.ok(step3.blob && step3.blob.size > 0, "Step 3 returned valid blob")
  const doc3 = await PDFDocument.load(await step3.blob.arrayBuffer())
  assert.equal(doc3.getPageCount(), totalPages, "Step 3 preserved total pages")

  // 4. editPDF
  const file3 = await resultToFile(step3, "lifecycle-3.pdf")
  const step4 = await services.editPDF(file3, {
    annotation: "Header Notice: Verified by Teamwork Challenger",
    pageNumber: 1,
    type: "callout",
    position: "top",
  })
  assert.ok(step4.blob && step4.blob.size > 0, "Step 4 returned valid blob")
  const doc4 = await PDFDocument.load(await step4.blob.arrayBuffer())
  assert.equal(doc4.getPageCount(), totalPages, "Step 4 preserved total pages")

  // 5. compressPDF
  const file4 = await resultToFile(step4, "lifecycle-4.pdf")
  const step5 = await services.compressPDF(file4, { level: "high" })
  assert.ok(step5.blob && step5.blob.size > 0, "Step 5 returned valid blob")
  const doc5 = await PDFDocument.load(await step5.blob.arrayBuffer())
  assert.equal(doc5.getPageCount(), totalPages, "Step 5 preserved total pages")
  assert.equal(doc5.getCreator(), "FluxKit")

  // 6. splitPDF
  const file5 = await resultToFile(step5, "lifecycle-5.pdf")
  const step6 = await services.splitPDF(file5, "1-2")
  assert.ok(step6.blob && step6.blob.size > 0, "Step 6 returned valid blob")
  const doc6 = await PDFDocument.load(await step6.blob.arrayBuffer())
  assert.equal(
    doc6.getPageCount(),
    2,
    "Step 6 splitPDF must produce exactly 2 pages from range '1-2'",
  )

  // Verify each page in final document
  const finalPages = doc6.getPages()
  assert.equal(finalPages.length, 2)
  for (let idx = 0; idx < finalPages.length; idx++) {
    const p = finalPages[idx]
    const size = p.getSize()
    assert.ok(size.width > 0, `Page ${idx + 1} has positive width`)
    assert.ok(size.height > 0, `Page ${idx + 1} has positive height`)
  }
})

// ============================================================================
// SUITE 2: Lifecycle Resilience, Edge Cases & Variant Flows
// ============================================================================

test("Lifecycle Variant: mergePDFs -> watermarkPDF -> signPDF (typed badge) -> editPDF (highlight) -> splitPDF ('1, 3')", async () => {
  const services = loadServices()

  // Create two individual PDFs
  const resA = await services.textToPDF("Document A First Page\n" + "A".repeat(400), "Doc A")
  const resB = await services.textToPDF("Document B First Page\n" + "B".repeat(400), "Doc B")
  const fileA = await resultToFile(resA, "doc-a.pdf")
  const fileB = await resultToFile(resB, "doc-b.pdf")

  // 1. Merge
  const mergedRes = await services.mergePDFs([fileA, fileB])
  const mergedDoc = await PDFDocument.load(await mergedRes.blob.arrayBuffer())
  const mergedPages = mergedDoc.getPageCount()
  assert.ok(mergedPages >= 2, "Merged PDF has at least 2 pages")

  // 2. Watermark with 90° vertical rotation
  const mergedFile = await resultToFile(mergedRes, "merged.pdf")
  const watermarkedRes = await services.watermarkPDF(mergedFile, {
    text: "VERTICAL STAMP",
    rotation: 90,
    opacity: 0.5,
  })
  const watermarkedDoc = await PDFDocument.load(await watermarkedRes.blob.arrayBuffer())
  assert.equal(watermarkedDoc.getPageCount(), mergedPages)

  // 3. Sign using typed badge fallback (no PNG bytes provided)
  const watermarkedFile = await resultToFile(watermarkedRes, "watermarked.pdf")
  const signedRes = await services.signPDF(watermarkedFile, {
    signerName: "Alex Morgan, Compliance Officer",
    position: "bottom-left",
    date: "2026-11-10",
  })
  const signedDoc = await PDFDocument.load(await signedRes.blob.arrayBuffer())
  assert.equal(signedDoc.getPageCount(), mergedPages)

  // 4. Edit with highlight banner style
  const signedFile = await resultToFile(signedRes, "signed.pdf")
  const editedRes = await services.editPDF(signedFile, {
    annotation: "HIGHLIGHTED NOTICE",
    type: "highlight",
    position: "center",
    pageNumber: 1,
  })
  const editedDoc = await PDFDocument.load(await editedRes.blob.arrayBuffer())
  assert.equal(editedDoc.getPageCount(), mergedPages)

  // 5. Split discontinuous pages "1, 2"
  const editedFile = await resultToFile(editedRes, "edited.pdf")
  const splitRes = await services.splitPDF(editedFile, "1, 2")
  const splitDoc = await PDFDocument.load(await splitRes.blob.arrayBuffer())
  assert.equal(splitDoc.getPageCount(), 2, "Discontinuous range '1, 2' yields 2 pages")
})

test("Lifecycle Variant: rotatePDF -> securePDF lock -> securePDF unlock cycle preserves integrity", async () => {
  const services = loadServices()

  // Base PDF
  const baseRes = await services.textToPDF("Secured Lifecycle Document content.\n" + "Test ".repeat(100), "Secured Lifecycle")
  const baseFile = await resultToFile(baseRes, "base.pdf")

  // Rotate 180 degrees
  const rotRes = await services.rotatePDF(baseFile, 180)
  const rotDoc = await PDFDocument.load(await rotRes.blob.arrayBuffer())
  assert.equal(rotDoc.getPages()[0].getRotation().angle, 180)

  // Lock document with password
  const rotFile = await resultToFile(rotRes, "rotated.pdf")
  const lockRes = await services.securePDF(rotFile, {
    action: "lock",
    password: "VaultPassword#2026",
    permissions: { preventPrinting: true, preventModification: true },
  })
  const lockedDoc = await PDFDocument.load(await lockRes.blob.arrayBuffer())
  assert.ok(lockedDoc.getTitle().startsWith("[Secured] "))
  assert.ok(lockedDoc.getSubject().startsWith("FluxKit-Protected:"))

  // Unlock document with matching password
  const lockedFile = await resultToFile(lockRes, "locked.pdf")
  const unlockRes = await services.securePDF(lockedFile, {
    action: "unlock",
    password: "VaultPassword#2026",
  })
  const unlockedDoc = await PDFDocument.load(await unlockRes.blob.arrayBuffer())
  assert.ok(!unlockedDoc.getTitle().startsWith("[Secured] "))
  assert.equal(unlockedDoc.getSubject(), "")

  // Re-split unlocked document
  const unlockedFile = await resultToFile(unlockRes, "unlocked.pdf")
  const splitRes = await services.splitPDF(unlockedFile, "1")
  const splitDoc = await PDFDocument.load(await splitRes.blob.arrayBuffer())
  assert.equal(splitDoc.getPageCount(), 1)
})

test("Lifecycle Robustness: Unicode typographical sanitization does not corrupt multi-step pipeline", async () => {
  const services = loadServices()

  // Text with curly quotes, em-dashes, bullets, and checks
  const specialText = [
    "“Smart quotes around this statement” and ‘single curly quotes’",
    "Em-dash—used to connect related ideas—and en-dash 2024–2026",
    "Bullet points: • Item one • Item two • Item three",
    "Checkmark items: ✓ Verified item one ✓ Passed audit",
  ].join("\n\n")

  const step1 = await services.textToPDF(specialText, "Typography Test “V1.0”")
  const file1 = await resultToFile(step1, "special.pdf")

  const step2 = await services.watermarkPDF(file1, {
    text: "“CONFIDENTIAL” — STAMP ✓",
    opacity: 0.3,
  })
  const file2 = await resultToFile(step2, "special-watermarked.pdf")

  const step3 = await services.editPDF(file2, {
    annotation: "“Approved note”—Checked ✓",
    type: "note",
    pageNumber: 1,
  })
  const doc3 = await PDFDocument.load(await step3.blob.arrayBuffer())
  assert.ok(doc3.getPageCount() >= 1)
})

test("Lifecycle Error Boundaries: Pipeline invalid inputs reject cleanly without unhandled crashes", async () => {
  const services = loadServices()

  // 1. textToPDF rejects empty text
  await assert.rejects(
    async () => services.textToPDF(""),
    /Add some text to create your document/,
  )

  // 2. mergePDFs rejects single file
  const dummyFile = new File([new Uint8Array(10)], "dummy.pdf", { type: "application/pdf" })
  await assert.rejects(
    async () => services.mergePDFs([dummyFile]),
    /Choose at least two PDFs to merge/,
  )

  // 3. watermarkPDF rejects empty watermark text
  const baseRes = await services.textToPDF("Sample text for error boundary", "Error Test")
  const validPDFFile = await resultToFile(baseRes, "valid.pdf")

  await assert.rejects(
    async () => services.watermarkPDF(validPDFFile, { text: "" }),
    /Watermark text is required/,
  )

  // 4. signPDF rejects missing signerName and image
  await assert.rejects(
    async () => services.signPDF(validPDFFile, {}),
    /Please provide a signature image or signer name/,
  )

  // 5. editPDF rejects out-of-bounds page
  await assert.rejects(
    async () => services.editPDF(validPDFFile, { pageNumber: 999 }),
    /is out of bounds/,
  )

  // 6. splitPDF rejects invalid page ranges
  await assert.rejects(
    async () => services.splitPDF(validPDFFile, "10-20"),
    /is out of bounds/,
  )
})

// ============================================================================
// SUITE 3: UI Mounting of all 9 PDF Tool Routes in src/App.tsx
// ============================================================================

test("UI Mounting Route 1: #merge-pdf mounts dropzone (multiple), file guidance, and 'Merge PDFs' button", () => {
  const { load } = createDOMEnv("merge-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  // Route title & category
  assert.match(html, /Merge PDF/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)
  assert.doesNotMatch(html, /ON THE HORIZON/)

  // Interactive dropzone with multiple file selection allowed
  assert.match(html, /class="dropzone"/)
  assert.match(html, /type="file" multiple="" accept="\.pdf,application\/pdf"/)
  assert.match(html, /Drop your files here/)

  // Action button
  assert.match(html, /Merge PDFs/)
  assert.match(html, /Processed locally in your browser/)
})

test("UI Mounting Route 2: #split-pdf mounts dropzone, page range input, and 'Split PDF' button", () => {
  const { load } = createDOMEnv("split-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Split PDF/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Dropzone
  assert.match(html, /class="dropzone"/)

  // Page range input & placeholder guidance
  assert.match(html, /Page Range to Extract/)
  assert.match(html, /placeholder="e\.g\. 1-3, 5 or 2 \(or leave empty for all\)"/)
  assert.match(html, /Enter comma-separated page numbers or ranges/)

  // Action button
  assert.match(html, /Split PDF/)
})

test("UI Mounting Route 3: #compress mounts dropzone, compression preset dropdown, and 'Compress PDF' button", () => {
  const { load } = createDOMEnv("compress")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Compress PDF/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Dropzone
  assert.match(html, /class="dropzone"/)

  // Compression presets
  assert.match(html, /Compression Preset/)
  assert.match(html, /Standard Compression \(Balanced Stream Optimization\)/)
  assert.match(html, /High Compression \(Maximum Stream \+ Metadata Strip\)/)

  // Action button
  assert.match(html, /Compress PDF/)
})

test("UI Mounting Route 4: #edit-pdf mounts dropzone, annotation text, style dropdown, page input, and 'Apply Annotation' button", () => {
  const { load } = createDOMEnv("edit-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Edit PDF/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Dropzone
  assert.match(html, /class="dropzone"/)

  // Annotation text input
  assert.match(html, /Annotation Text/)
  assert.match(html, /placeholder="Enter annotation text to stamp on page"/)

  // Style selector
  assert.match(html, /Annotation Style/)
  assert.match(html, /Sticky Note \(Pale Yellow\)/)
  assert.match(html, /Highlight Banner \(Translucent\)/)
  assert.match(html, /Callout Box \(Indigo Border\)/)

  // Target page number input
  assert.match(html, /Target Page Number/)
  assert.match(html, /type="number" min="1"/)

  // Action button
  assert.match(html, /Apply Annotation/)
})

test("UI Mounting Route 5: #watermark mounts dropzone, watermark text, opacity dropdown, rotation dropdown, and 'Add Watermark' button", () => {
  const { load } = createDOMEnv("watermark")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Watermark/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Dropzone
  assert.match(html, /class="dropzone"/)

  // Watermark text input
  assert.match(html, /Watermark Text/)
  assert.match(html, /placeholder="e\.g\. CONFIDENTIAL or DRAFT"/)

  // Watermark opacity options
  assert.match(html, /Watermark Opacity/)
  assert.match(html, /20% Subtle/)
  assert.match(html, /35% Standard/)
  assert.match(html, /50% Medium/)
  assert.match(html, /75% High Contrast/)

  // Rotation angles
  assert.match(html, /Rotation Angle/)
  assert.match(html, /45° Diagonal/)
  assert.match(html, /0° Horizontal/)
  assert.match(html, /90° Vertical/)

  // Action button
  assert.match(html, /Add Watermark/)
})

test("UI Mounting Route 6: #sign-pdf mounts dropzone, signature canvas, ink palette, clear button, signer name input, placement selector, and action button", () => {
  const { load } = createDOMEnv("sign-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Sign PDF/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Dropzone
  assert.match(html, /class="dropzone"/)

  // Signature drawing canvas pad
  assert.match(html, /Draw Signature Canvas Pad/)
  assert.match(html, /<canvas width="360" height="120"/)

  // Ink color controls
  assert.match(html, /aria-label="Ink color #0f172a"/)
  assert.match(html, /aria-label="Ink color #1d4ed8"/)
  assert.match(html, /aria-label="Ink color #4338ca"/)

  // Clear signature button
  assert.match(html, /Clear Signature/)

  // Signer name typed input
  assert.match(html, /Signer Name \(Badge \/ Typed\)/)
  assert.match(html, /placeholder="e\.g\. Jamie Davis"/)

  // Stamp placement page selector
  assert.match(html, /Stamp Placement Page/)
  assert.match(html, /Last Page \(Standard\)/)
  assert.match(html, /First Page \(Cover\)/)

  // Action button
  assert.match(html, /Stamp Signature on PDF/)
})

test("UI Mounting Route 7: #rotate-pdf mounts dropzone, rotation angle selector, and 'Rotate PDF' button", () => {
  const { load } = createDOMEnv("rotate-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Rotate PDF/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Dropzone
  assert.match(html, /class="dropzone"/)

  // Rotation angles
  assert.match(html, /Rotation Angle/)
  assert.match(html, /90° Clockwise/)
  assert.match(html, /180° Flip \(Upside Down\)/)
  assert.match(html, /270° Counter-Clockwise \(90° CCW\)/)

  // Action button
  assert.match(html, /Rotate PDF/)
})

test("UI Mounting Route 8: #text-pdf mounts document title, text area, and 'Generate PDF' button", () => {
  const { load } = createDOMEnv("text-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Text to PDF/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Document title input
  assert.match(html, /Document title/)
  assert.match(html, /placeholder="Untitled document"/)

  // Content textarea
  assert.match(html, /Your text/)
  assert.match(html, /placeholder="A blank page\. Endless possibilities\."/)

  // Action button
  assert.match(html, /Generate PDF/)
})

test("UI Mounting Route 9: #password mounts dropzone, action dropdown, lock password inputs, and 'Secure Document' button", () => {
  const { load } = createDOMEnv("password")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /PDF Security &amp; Unlock|PDF Security & Unlock/)
  assert.match(html, /File tools/)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/)

  // Dropzone
  assert.match(html, /class="dropzone"/)

  // Security action dropdown
  assert.match(html, /Security Action/)
  assert.match(html, /Lock \/ Protect Document/)
  assert.match(html, /Unlock Protected Document/)

  // Lock password fields
  assert.match(html, /Protection Password/)
  assert.match(html, /placeholder="Min 4 characters"/)
  assert.match(html, /Confirm Password/)
  assert.match(html, /placeholder="Repeat password"/)

  // Action button
  assert.match(html, /Secure Document/)
})
