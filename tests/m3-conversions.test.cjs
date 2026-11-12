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
        Blob,
        File,
        URL,
        setTimeout,
        clearTimeout,
        DecompressionStream,
        Response,
        TextDecoder,
        TextEncoder,
        Uint8Array,
        DataView,
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

// ============================================================================
// Fixtures & Helper Generators
// ============================================================================

async function createTestPDFWithText(pages = 2, customLines = []) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([600, 400])
    const lines = customLines[i - 1] || [
      `Heading for Page ${i}`,
      `First bullet point paragraph content for page ${i}`,
      `Second descriptive detail for page ${i}`,
    ]
    let y = 350
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 14, font })
      y -= 30
    }
  }
  const bytes = await doc.save()
  return new File([bytes], `test-${pages}p.pdf`, { type: "application/pdf" })
}

// 1x1 standard JFIF JPEG bytes with SOI 0xFF, 0xD8 and EOI 0xFF, 0xD9
const SAMPLE_JFIF_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0xff, 0xd9,
])

const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
const SAMPLE_PNG_BYTES = Buffer.from(SAMPLE_PNG_BASE64, "base64")

// ============================================================================
// SUITE 1: pdf-to-word Conversion
// ============================================================================

test("M3 pdfToWord: generates valid DOCX package from sample PDF", async () => {
  const { pdfToWord, unzipEntries } = loadServices()
  const pdfFile = await createTestPDFWithText(2, [
    ["Executive Summary", "This is the primary project overview."],
    ["Implementation Plan", "Milestone 3 focuses on format conversions."],
  ])

  const result = await pdfToWord(pdfFile)
  assert.ok(result && result.blob, "Result must contain valid blob")
  assert.match(result.name, /\.docx$/, "Default output must end with .docx")
  assert.equal(
    result.blob.type,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  )

  const buf = new Uint8Array(await result.blob.arrayBuffer())
  assert.equal(buf[0], 0x50, "First byte must be PK signature 0x50")
  assert.equal(buf[1], 0x4b, "Second byte must be PK signature 0x4B")
  assert.equal(buf[2], 0x03, "Third byte must be 0x03")
  assert.equal(buf[3], 0x04, "Fourth byte must be 0x04")

  const entries = await unzipEntries(buf)
  assert.ok(entries["[Content_Types].xml"], "Must contain [Content_Types].xml")
  assert.ok(entries["word/document.xml"], "Must contain word/document.xml")
  assert.match(
    entries["word/document.xml"],
    /Executive Summary/,
    "Document XML must contain extracted text",
  )
})

test("M3 pdfToWord: supports doc (HTML format) and txt output formats", async () => {
  const { pdfToWord } = loadServices()
  const pdfFile = await createTestPDFWithText(1, [
    ["Single Page Report", "Full content body text."],
  ])

  // 1. DOC output
  const docResult = await pdfToWord(pdfFile, { format: "doc" })
  assert.match(docResult.name, /\.doc$/)
  assert.equal(docResult.blob.type, "application/msword")
  const docHtml = await docResult.blob.text()
  assert.match(docHtml, /<html/)
  assert.match(docHtml, /Single Page Report/)

  // 2. TXT output
  const txtResult = await pdfToWord(pdfFile, { format: "txt" })
  assert.match(txtResult.name, /\.txt$/)
  assert.equal(txtResult.blob.type, "text/plain;charset=utf-8")
  const txtContent = await txtResult.blob.text()
  assert.match(txtContent, /Single Page Report/)
})

test("M3 pdfToWord: preserves text paragraphs across all pages", async () => {
  const { pdfToWord, unzipEntries } = loadServices()
  const pdfFile = await createTestPDFWithText(3, [
    ["Alpha Section", "Alpha content marker"],
    ["Beta Section", "Beta content marker"],
    ["Gamma Section", "Gamma content marker"],
  ])

  const res = await pdfToWord(pdfFile, { layout: "standard" })
  const buf = new Uint8Array(await res.blob.arrayBuffer())
  const entries = await unzipEntries(buf)
  const docXml = entries["word/document.xml"]

  assert.match(docXml, /Alpha Section/)
  assert.match(docXml, /Beta Section/)
  assert.match(docXml, /Gamma Section/)
  assert.match(docXml, /<w:br w:type="page"\/>/, "Must insert page breaks")
})

test("M3 pdfToWord: rejects missing file or 0-byte corrupt file", async () => {
  const { pdfToWord } = loadServices()
  const emptyFile = new File([], "empty.pdf", { type: "application/pdf" })

  await assert.rejects(
    async () => pdfToWord(emptyFile),
    /Invalid or empty PDF file/,
  )

  const corruptFile = new File([new Uint8Array([1, 2, 3, 4])], "bad.pdf", {
    type: "application/pdf",
  })
  await assert.rejects(
    async () => pdfToWord(corruptFile),
    /Select a valid PDF to convert to Word/,
  )
})

// ============================================================================
// SUITE 2: pdf-to-ppt Conversion
// ============================================================================

test("M3 pdfToPPT: generates valid PPTX package with widescreen 16:9 slides", async () => {
  const { pdfToPPT, unzipEntries } = loadServices()
  const pdfFile = await createTestPDFWithText(2, [
    ["Quarterly Strategy", "Key goal 1", "Key goal 2"],
    ["Financial Trajectory", "Revenue growth +40%", "EBITDA margin 25%"],
  ])

  const result = await pdfToPPT(pdfFile)
  assert.ok(result && result.blob)
  assert.match(result.name, /\.pptx$/)
  assert.equal(
    result.blob.type,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  )

  const buf = new Uint8Array(await result.blob.arrayBuffer())
  assert.equal(buf[0], 0x50)
  assert.equal(buf[1], 0x4b)

  const entries = await unzipEntries(buf)
  assert.ok(entries["ppt/presentation.xml"])
  assert.ok(entries["ppt/slides/slide1.xml"])
  assert.ok(entries["ppt/slides/slide2.xml"])
  assert.match(entries["ppt/presentation.xml"], /cx="12192000"/)
  assert.match(entries["ppt/slides/slide1.xml"], /Quarterly Strategy/)
})

test("M3 pdfToPPT: supports standard 4:3 aspect ratio preset", async () => {
  const { pdfToPPT, unzipEntries } = loadServices()
  const pdfFile = await createTestPDFWithText(1, [
    ["Classic Deck", "Point 1", "Point 2"],
  ])

  const res = await pdfToPPT(pdfFile, { aspectRatio: "4:3" })
  const buf = new Uint8Array(await res.blob.arrayBuffer())
  const entries = await unzipEntries(buf)
  assert.match(
    entries["ppt/presentation.xml"],
    /cx="9144000"/,
    "4:3 aspect ratio must have 9144000 EMU width",
  )
})

test("M3 pdfToPPT: applies selected slide theme color styles", async () => {
  const { pdfToPPT, unzipEntries } = loadServices()
  const pdfFile = await createTestPDFWithText(1, [["Theme Test", "Point"]])

  const res = await pdfToPPT(pdfFile, { theme: "minimal-white" })
  const buf = new Uint8Array(await res.blob.arrayBuffer())
  const entries = await unzipEntries(buf)
  const slide1 = entries["ppt/slides/slide1.xml"]
  assert.match(slide1, /val="FFFFFF"/, "Minimal white theme uses white background")
})

test("M3 pdfToPPT: rejects non-PDF input files cleanly", async () => {
  const { pdfToPPT } = loadServices()
  const fakeFile = new File([new TextEncoder().encode("Not a PDF file")], "test.txt", {
    type: "text/plain",
  })

  await assert.rejects(
    async () => pdfToPPT(fakeFile),
    /Select a valid PDF to convert to PowerPoint/,
  )
})

// ============================================================================
// SUITE 3: pdf-to-excel Conversion
// ============================================================================

test("M3 pdfToExcel: generates valid XLSX workbook with worksheet and table data", async () => {
  const { pdfToExcel, unzipEntries } = loadServices()
  const pdfFile = await createTestPDFWithText(1, [
    ["Item\tQty\tPrice", "Widget A\t10\t45.00", "Widget B\t5\t12.50"],
  ])

  const result = await pdfToExcel(pdfFile)
  assert.ok(result && result.blob)
  assert.match(result.name, /\.xlsx$/)
  assert.equal(
    result.blob.type,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )

  const buf = new Uint8Array(await result.blob.arrayBuffer())
  assert.equal(buf[0], 0x50)
  assert.equal(buf[1], 0x4b)

  const entries = await unzipEntries(buf)
  assert.ok(entries["xl/workbook.xml"])
  assert.ok(entries["xl/worksheets/sheet1.xml"])
  assert.match(entries["xl/worksheets/sheet1.xml"], /Widget A/)
})

test("M3 pdfToExcel: supports CSV export mode with proper quoting", async () => {
  const { pdfToExcel } = loadServices()
  const pdfFile = await createTestPDFWithText(1, [
    ["Product\tUnits\tNotes", "Super Widget\t100\tHigh quality, durable"],
  ])

  const result = await pdfToExcel(pdfFile, { format: "csv" })
  assert.match(result.name, /\.csv$/)
  assert.equal(result.blob.type, "text/csv;charset=utf-8")

  const ab = await result.blob.arrayBuffer()
  const bytes = new Uint8Array(ab)
  assert.equal(bytes[0], 0xef, "Byte 0 must be UTF-8 BOM 0xEF")
  assert.equal(bytes[1], 0xbb, "Byte 1 must be UTF-8 BOM 0xBB")
  assert.equal(bytes[2], 0xbf, "Byte 2 must be UTF-8 BOM 0xBF")

  const csv = await result.blob.text()
  assert.match(csv, /"High quality, durable"/)
})

test("M3 pdfToExcel: supports TSV export mode", async () => {
  const { pdfToExcel } = loadServices()
  const pdfFile = await createTestPDFWithText(1, [["ColA\tColB", "Val1\tVal2"]])

  const result = await pdfToExcel(pdfFile, { format: "tsv" })
  assert.match(result.name, /\.tsv$/)
  const tsv = await result.blob.text()
  assert.match(tsv, /ColA\tColB/)
})

test("M3 pdfToExcel: rejects missing or corrupt file", async () => {
  const { pdfToExcel } = loadServices()
  const corruptFile = new File([new Uint8Array([0, 1, 2])], "corrupt.pdf", {
    type: "application/pdf",
  })
  await assert.rejects(
    async () => pdfToExcel(corruptFile),
    /Select a valid PDF to extract into Excel/,
  )
})

// ============================================================================
// SUITE 4: word-to-pdf Conversion
// ============================================================================

test("M3 wordToPDF: converts text and DOCX content to formatted PDF document", async () => {
  const { wordToPDF } = loadServices()
  const sampleText = [
    "# Project Roadmap 2026",
    "## Phase 1: In-Browser Architecture",
    "* All 37 tools operate client-side without servers.",
    "* Complete memory isolation and safety.",
    "## Phase 2: Performance & Polish",
    "Tailwind v4 tokens deliver responsive fluidity.",
  ].join("\n\n")

  const res = await wordToPDF(sampleText, { title: "Roadmap Document" })
  assert.ok(res && res.blob)
  assert.match(res.name, /\.pdf$/)
  assert.equal(res.blob.type, "application/pdf")

  const doc = await PDFDocument.load(await res.blob.arrayBuffer())
  assert.ok(doc.getPageCount() >= 1)
  const page = doc.getPage(0)
  assert.equal(page.getSize().width, 612)
  assert.equal(page.getSize().height, 792)
})

test("M3 wordToPDF: respects margin presets (standard, compact, spacious)", async () => {
  const { wordToPDF } = loadServices()
  const text = "Body paragraph for margin testing. ".repeat(20)

  const resCompact = await wordToPDF(text, { margins: "compact" })
  const resSpacious = await wordToPDF(text, { margins: "spacious" })

  const docC = await PDFDocument.load(await resCompact.blob.arrayBuffer())
  const docS = await PDFDocument.load(await resSpacious.blob.arrayBuffer())

  assert.ok(docC.getPageCount() >= 1)
  assert.ok(docS.getPageCount() >= 1)
})

test("M3 wordToPDF: applies font family presets (Helvetica, Times, Courier)", async () => {
  const { wordToPDF } = loadServices()
  const text = "Font family testing text paragraph."

  for (const font of ["helvetica", "times", "courier"]) {
    const res = await wordToPDF(text, { font })
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.ok(doc.getPageCount() >= 1)
  }
})

test("M3 wordToPDF: rejects empty document content or missing file", async () => {
  const { wordToPDF } = loadServices()
  await assert.rejects(
    async () => wordToPDF("   "),
    /Select a Word document or enter text to convert to PDF/,
  )
})

// ============================================================================
// SUITE 5: ppt-to-pdf Conversion
// ============================================================================

test("M3 pptToPDF: converts presentation slides into landscape 16:9 PDF", async () => {
  const { pptToPDF } = loadServices()
  const outline = [
    "Slide 1: Executive Overview\n* Vision and Core Values\n* Market Opportunity",
    "Slide 2: Technical Strategy\n* Zero remote telemetry\n* 100% client-side computing",
  ].join("\n---\n")

  const res = await pptToPDF(outline)
  assert.ok(res && res.blob)
  assert.match(res.name, /\.pdf$/)

  const doc = await PDFDocument.load(await res.blob.arrayBuffer())
  assert.equal(doc.getPageCount(), 2)
  const p0 = doc.getPage(0)
  assert.ok(p0.getSize().width > p0.getSize().height, "16:9 must be landscape")
  assert.equal(p0.getSize().width, 842)
  assert.equal(p0.getSize().height, 474)
})

test("M3 pptToPDF: supports 4:3 landscape and portrait handout modes", async () => {
  const { pptToPDF } = loadServices()
  const outline = "Slide 1\n* Bullet item"

  const res43 = await pptToPDF(outline, { orientation: "landscape-4-3" })
  const doc43 = await PDFDocument.load(await res43.blob.arrayBuffer())
  assert.equal(doc43.getPage(0).getSize().width, 792)
  assert.equal(doc43.getPage(0).getSize().height, 595)

  const resPort = await pptToPDF(outline, { orientation: "portrait" })
  const docPort = await PDFDocument.load(await resPort.blob.arrayBuffer())
  assert.equal(docPort.getPage(0).getSize().width, 595)
  assert.equal(docPort.getPage(0).getSize().height, 842)
})

test("M3 pptToPDF: supports multi-slide per page handout layouts (1, 2, 4 per page)", async () => {
  const { pptToPDF } = loadServices()
  const slides = Array.from(
    { length: 4 },
    (_, i) => `Slide ${i + 1}\n* Content line for slide ${i + 1}`,
  ).join("\n---\n")

  const res2 = await pptToPDF(slides, { slidesPerPage: 2 })
  const doc2 = await PDFDocument.load(await res2.blob.arrayBuffer())
  assert.equal(doc2.getPageCount(), 2, "4 slides @ 2 per page must yield 2 pages")

  const res4 = await pptToPDF(slides, { slidesPerPage: 4 })
  const doc4 = await PDFDocument.load(await res4.blob.arrayBuffer())
  assert.equal(doc4.getPageCount(), 1, "4 slides @ 4 per page must yield 1 page")
})

test("M3 pptToPDF: rejects empty presentation or missing input", async () => {
  const { pptToPDF } = loadServices()
  await assert.rejects(
    async () => pptToPDF(""),
    /Select a presentation file or enter outline text to convert to PDF/,
  )
})

// ============================================================================
// SUITE 6: excel-to-pdf Conversion
// ============================================================================

test("M3 excelToPDF: converts CSV spreadsheet data into styled PDF table with gridlines", async () => {
  const { excelToPDF } = loadServices()
  const csv = [
    "ID,Product,Department,Price",
    "101,Smart Notebook,Stationery,$14.99",
    "102,Gel Pen Set,Stationery,$8.50",
    "103,Wireless Mouse,Electronics,$29.99",
  ].join("\n")

  const res = await excelToPDF(csv)
  assert.ok(res && res.blob)
  assert.match(res.name, /\.pdf$/)

  const doc = await PDFDocument.load(await res.blob.arrayBuffer())
  assert.ok(doc.getPageCount() >= 1)
  const p0 = doc.getPage(0)
  assert.equal(p0.getSize().width, 792, "Spreadsheet default is landscape 792 pt")
})

test("M3 excelToPDF: supports landscape and portrait page orientations", async () => {
  const { excelToPDF } = loadServices()
  const csv = "A,B,C\n1,2,3"

  const resPort = await excelToPDF(csv, { orientation: "portrait" })
  const docPort = await PDFDocument.load(await resPort.blob.arrayBuffer())
  assert.equal(docPort.getPage(0).getSize().width, 612)
  assert.equal(docPort.getPage(0).getSize().height, 792)
})

test("M3 excelToPDF: applies table themes (indigo headers, zebra stripes, minimal)", async () => {
  const { excelToPDF } = loadServices()
  const csv = "ColA,ColB\nVal1,Val2\nVal3,Val4"

  for (const theme of ["grid-indigo", "zebra", "minimal"]) {
    const res = await excelToPDF(csv, { theme })
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.ok(doc.getPageCount() >= 1)
  }
})

test("M3 excelToPDF: handles multi-page pagination for large datasets (60+ rows)", async () => {
  const { excelToPDF } = loadServices()
  const header = "RowID,ItemName,Category,StockLevel,UnitCost"
  const rows = [header]
  for (let i = 1; i <= 60; i++) {
    rows.push(`${i},Item ${i},General,${i * 10},${(i * 1.5).toFixed(2)}`)
  }

  const res = await excelToPDF(rows.join("\n"))
  const doc = await PDFDocument.load(await res.blob.arrayBuffer())
  assert.ok(
    doc.getPageCount() >= 2,
    `60 rows must paginate across multiple pages (got ${doc.getPageCount()})`,
  )
})

// ============================================================================
// SUITE 7: pdf-to-jpg Conversion
// ============================================================================

test("M3 pdfToJPG: converts PDF first page to high-resolution JPEG image", async () => {
  const { pdfToJPG } = loadServices()
  const pdfFile = await createTestPDFWithText(2)

  const res = await pdfToJPG(pdfFile)
  assert.ok(res && res.blob)
  assert.match(res.name, /\.jpg$/)
  assert.equal(res.blob.type, "image/jpeg")

  const buf = new Uint8Array(await res.blob.arrayBuffer())
  assert.equal(buf[0], 0xff, "JPEG SOI byte 0 must be 0xFF")
  assert.equal(buf[1], 0xd8, "JPEG SOI byte 1 must be 0xD8")
  assert.equal(buf[buf.length - 2], 0xff, "JPEG EOI byte must be 0xFF")
  assert.equal(buf[buf.length - 1], 0xd9, "JPEG EOI byte must be 0xD9")
})

test("M3 pdfToJPG: supports page selection (first page, all pages, custom page)", async () => {
  const { pdfToJPG, unzipEntries } = loadServices()
  const pdfFile = await createTestPDFWithText(3)

  // 1. Custom page
  const customRes = await pdfToJPG(pdfFile, {
    pageSelection: "custom",
    pageNumber: 2,
  })
  assert.match(customRes.name, /-page-2\.jpg$/)

  // 2. All pages -> ZIP
  const allRes = await pdfToJPG(pdfFile, { pageSelection: "all" })
  assert.match(allRes.name, /\.zip$/)
  const zipBuf = new Uint8Array(await allRes.blob.arrayBuffer())
  assert.equal(zipBuf[0], 0x50)
  assert.equal(zipBuf[1], 0x4b)
})

test("M3 pdfToJPG: supports image quality presets (high, standard, compact)", async () => {
  const { pdfToJPG } = loadServices()
  const pdfFile = await createTestPDFWithText(1)

  for (const quality of ["high", "standard", "compact"]) {
    const res = await pdfToJPG(pdfFile, { quality })
    assert.equal(res.blob.type, "image/jpeg")
  }
})

test("M3 pdfToJPG: rejects out-of-range page numbers", async () => {
  const { pdfToJPG } = loadServices()
  const pdfFile = await createTestPDFWithText(2)

  await assert.rejects(
    async () =>
      pdfToJPG(pdfFile, { pageSelection: "custom", pageNumber: 99 }),
    /out of range/,
  )
})

// ============================================================================
// SUITE 8: jpg-to-pdf Conversion
// ============================================================================

test("M3 jpgToPDF: embeds single JPG image into single-page PDF", async () => {
  const { jpgToPDF } = loadServices()
  const imgFile = new File([SAMPLE_JFIF_BYTES], "sample.jpg", {
    type: "image/jpeg",
  })

  const res = await jpgToPDF([imgFile])
  assert.ok(res && res.blob)
  assert.match(res.name, /\.pdf$/)

  const doc = await PDFDocument.load(await res.blob.arrayBuffer())
  assert.equal(doc.getPageCount(), 1)
})

test("M3 jpgToPDF: merges multiple images into multi-page PDF preserving sequence", async () => {
  const { jpgToPDF } = loadServices()
  const img1 = new File([SAMPLE_JFIF_BYTES], "img1.jpg", { type: "image/jpeg" })
  const img2 = new File([SAMPLE_PNG_BYTES], "img2.png", { type: "image/png" })
  const img3 = new File([SAMPLE_JFIF_BYTES], "img3.jpg", { type: "image/jpeg" })

  const res = await jpgToPDF([img1, img2, img3])
  const doc = await PDFDocument.load(await res.blob.arrayBuffer())
  assert.equal(doc.getPageCount(), 3, "Must create 3 pages for 3 images")
})

test("M3 jpgToPDF: supports orientation presets and margin settings", async () => {
  const { jpgToPDF } = loadServices()
  const img = new File([SAMPLE_JFIF_BYTES], "test.jpg", { type: "image/jpeg" })

  const resP = await jpgToPDF([img], { orientation: "portrait" })
  const docP = await PDFDocument.load(await resP.blob.arrayBuffer())
  assert.equal(docP.getPage(0).getSize().width, 612)

  const resL = await jpgToPDF([img], { orientation: "landscape" })
  const docL = await PDFDocument.load(await resL.blob.arrayBuffer())
  assert.equal(docL.getPage(0).getSize().width, 792)

  const resNoM = await jpgToPDF([img], { margins: "no-margins" })
  const docNoM = await PDFDocument.load(await resNoM.blob.arrayBuffer())
  assert.ok(docNoM.getPageCount() >= 1)
})

test("M3 jpgToPDF: rejects empty file list or non-image files", async () => {
  const { jpgToPDF } = loadServices()
  await assert.rejects(
    async () => jpgToPDF([]),
    /Select at least one image to convert to PDF/,
  )
})

// ============================================================================
// SUITE 9: Round-Trip & Pipeline Lifecycle Tests
// ============================================================================

test("M3 Round-Trip: wordToPDF -> pdfToWord preserves text integrity", async () => {
  const { wordToPDF, pdfToWord, unzipEntries } = loadServices()
  const originalText = [
    "# Universal Document Pipeline",
    "FluxKit converts documents client-side without data loss.",
    "Round-trip text integrity verified.",
  ].join("\n\n")

  const pdfRes = await wordToPDF(originalText, { title: "RoundTrip Test" })
  const pdfBytes = new Uint8Array(await pdfRes.blob.arrayBuffer())
  const pdfFile = new File([pdfBytes], "roundtrip.pdf", { type: "application/pdf" })

  const docxRes = await pdfToWord(pdfFile)
  const docxBytes = new Uint8Array(await docxRes.blob.arrayBuffer())
  const entries = await unzipEntries(docxBytes)
  const docXml = entries["word/document.xml"]

  assert.match(docXml, /Round-trip text integrity verified/)
})

test("M3 Round-Trip: excelToPDF -> pdfToExcel extracts structured cell data", async () => {
  const { excelToPDF, pdfToExcel } = loadServices()
  const csvData = [
    "ID,Product,Price",
    "1,Alpha,19.99",
    "2,Beta,29.99",
  ].join("\n")

  const pdfRes = await excelToPDF(csvData)
  const pdfFile = new File([await pdfRes.blob.arrayBuffer()], "table.pdf", {
    type: "application/pdf",
  })

  const excelRes = await pdfToExcel(pdfFile, { format: "csv" })
  const extractedCsv = await excelRes.blob.text()
  assert.match(extractedCsv, /Alpha/)
  assert.match(extractedCsv, /Beta/)
})

test("M3 Round-Trip: jpgToPDF -> pdfToJPG image conversion pipeline", async () => {
  const { jpgToPDF, pdfToJPG } = loadServices()
  const imgFile = new File([SAMPLE_JFIF_BYTES], "input.jpg", { type: "image/jpeg" })

  const pdfRes = await jpgToPDF([imgFile])
  const pdfFile = new File([await pdfRes.blob.arrayBuffer()], "embedded.pdf", {
    type: "application/pdf",
  })

  const jpgRes = await pdfToJPG(pdfFile)
  assert.match(jpgRes.name, /\.jpg$/)
  assert.equal(jpgRes.blob.type, "image/jpeg")

  const jfifBuf = new Uint8Array(await jpgRes.blob.arrayBuffer())
  assert.equal(jfifBuf[0], 0xff)
  assert.equal(jfifBuf[1], 0xd8)
})

// ============================================================================
// SUITE 10: UI Mounting & Interactive Controls in ToolPage.tsx
// ============================================================================

test("UI Mounting #pdf-to-word: mounts dropzone (.pdf), format dropdown, layout dropdown, and 'Convert to Word' button", () => {
  const { load } = createDOMEnv("pdf-to-word")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /PDF to Word/)
  assert.match(html, /File tools/)
  assert.match(html, /accept="\.pdf,application\/pdf"/)
  assert.match(html, /Output Format/)
  assert.match(html, /Word Document \(\.docx - OpenXML\)/)
  assert.match(html, /Layout Preservation/)
  assert.match(html, /Standard Flow \(Headings &amp; Paragraphs\)/)
  assert.match(html, /Convert to Word/)
})

test("UI Mounting #pdf-to-ppt: mounts dropzone (.pdf), aspect ratio selector, slide theme selector, and 'Convert to PowerPoint' button", () => {
  const { load } = createDOMEnv("pdf-to-ppt")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /PDF to PowerPoint/)
  assert.match(html, /accept="\.pdf,application\/pdf"/)
  assert.match(html, /Slide Aspect Ratio/)
  assert.match(html, /Widescreen 16:9/)
  assert.match(html, /Slide Theme/)
  assert.match(html, /FluxKit Dark/)
  assert.match(html, /Convert to PowerPoint/)
})

test("UI Mounting #pdf-to-excel: mounts dropzone (.pdf), format dropdown, table detection dropdown, and 'Convert to Excel' button", () => {
  const { load } = createDOMEnv("pdf-to-excel")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /PDF to Excel/)
  assert.match(html, /accept="\.pdf,application\/pdf"/)
  assert.match(html, /Output Format/)
  assert.match(html, /Excel Workbook \(\.xlsx\)/)
  assert.match(html, /Table Detection Strategy/)
  assert.match(html, /Auto-detect Tables &amp; Columns/)
  assert.match(html, /Convert to Excel/)
})

test("UI Mounting #word-to-pdf: mounts dropzone (.docx/.doc/.txt), margins selector, font selector, and 'Convert to PDF' button", () => {
  const { load } = createDOMEnv("word-to-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Word to PDF/)
  assert.match(html, /\.docx/)
  assert.match(html, /Page Margins/)
  assert.match(html, /Standard Margins/)
  assert.match(html, /Font Family/)
  assert.match(html, /Helvetica \(Modern Sans-Serif\)/)
  assert.match(html, /Convert to PDF/)
})

test("UI Mounting #ppt-to-pdf: mounts dropzone (.pptx/.ppt/.txt), slide orientation selector, slides per page selector, and 'Convert to PDF' button", () => {
  const { load } = createDOMEnv("ppt-to-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /PowerPoint to PDF/)
  assert.match(html, /\.pptx/)
  assert.match(html, /Slide Orientation/)
  assert.match(html, /Landscape 16:9 Widescreen/)
  assert.match(html, /Slides Per Page/)
  assert.match(html, /1 Slide Per Page \(Full Deck\)/)
  assert.match(html, /Convert to PDF/)
})

test("UI Mounting #excel-to-pdf: mounts dropzone (.xlsx/.csv), orientation selector, table styling dropdown, and 'Convert to PDF' button", () => {
  const { load } = createDOMEnv("excel-to-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Excel to PDF/)
  assert.match(html, /\.xlsx/)
  assert.match(html, /Page Orientation/)
  assert.match(html, /Landscape \(Recommended for tables\)/)
  assert.match(html, /Table Grid Styling/)
  assert.match(html, /Grid \+ Indigo Headers/)
  assert.match(html, /Convert to PDF/)
})

test("UI Mounting #pdf-to-jpg: mounts dropzone (.pdf), quality selector, page selector, and 'Convert to JPG' button", () => {
  const { load } = createDOMEnv("pdf-to-jpg")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /PDF to JPG/)
  assert.match(html, /accept="\.pdf,application\/pdf"/)
  assert.match(html, /Image Quality &amp; Resolution/)
  assert.match(html, /High Resolution \(300 DPI - Print Quality\)/)
  assert.match(html, /Page Selection/)
  assert.match(html, /First Page Only \(Single JPG\)/)
  assert.match(html, /Convert to JPG/)
})

test("UI Mounting #jpg-to-pdf: mounts dropzone with multiple selection (.jpg/.png), orientation selector, margins selector, and 'Convert to PDF' button", () => {
  const { load } = createDOMEnv("jpg-to-pdf")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /JPG to PDF/)
  assert.match(html, /multiple=""/)
  assert.match(html, /Page Orientation/)
  assert.match(html, /Auto-detect \(Match image ratio\)/)
  assert.match(html, /Margins &amp; Scaling/)
  assert.match(html, /Fit to Page with 0\.5 in Margins/)
  assert.match(html, /Convert to PDF/)
})

// ============================================================================
// SUITE 11: Error Boundaries & Adversarial Input Rejection
// ============================================================================

test("M3 Boundary: corrupt input streams reject cleanly with user-facing messages", async () => {
  const { pdfToWord, pdfToPPT, pdfToExcel, pdfToJPG } = loadServices()
  const garbageBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
  const garbageFile = new File([garbageBytes], "bad.pdf", { type: "application/pdf" })

  await assert.rejects(async () => pdfToWord(garbageFile), /Select a valid PDF/)
  await assert.rejects(async () => pdfToPPT(garbageFile), /Select a valid PDF/)
  await assert.rejects(async () => pdfToExcel(garbageFile), /Select a valid PDF/)
  await assert.rejects(async () => pdfToJPG(garbageFile), /Select a valid PDF/)
})

test("M3 Boundary: zero-byte files reject without crashing Node or browser realm", async () => {
  const { pdfToWord, wordToPDF, pptToPDF, excelToPDF, jpgToPDF } = loadServices()
  const zeroFile = new File([], "zero.pdf", { type: "application/pdf" })

  await assert.rejects(async () => pdfToWord(zeroFile), /Invalid or empty PDF/)
  await assert.rejects(async () => wordToPDF(zeroFile), /Select a Word document/)
  await assert.rejects(async () => pptToPDF(zeroFile), /Select a presentation file/)
  await assert.rejects(async () => excelToPDF(zeroFile), /Select an Excel or CSV file/)
  await assert.rejects(async () => jpgToPDF([zeroFile]), /No valid images/)
})

test("M3 Boundary: Unicode high-surrogate text sanitized without WinAnsi font crash", async () => {
  const { wordToPDF, pptToPDF, excelToPDF } = loadServices()
  const trickyText =
    "“Smart quotes” — dashes — bullet • check ✓ emoji 🚀 special symbols § ¶"

  const wRes = await wordToPDF(trickyText)
  assert.ok(wRes && wRes.blob)

  const pRes = await pptToPDF(trickyText)
  assert.ok(pRes && pRes.blob)

  const eRes = await excelToPDF(`Col1,Col2\n${trickyText},${trickyText}`)
  assert.ok(eRes && eRes.blob)
})
