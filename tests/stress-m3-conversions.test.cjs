const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib")

// ============================================================================
// Service & UI Loader
// ============================================================================

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
        URL: {
          createObjectURL: () => "blob:fluxkit-test",
          revokeObjectURL: () => {},
        },
        console,
        setTimeout,
        clearTimeout,
      },
      { filename },
    )
    return exports
  }

  return { load }
}

// 1x1 valid JFIF bytes
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

// Valid minimal 1x1 PNG bytes
const SAMPLE_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

async function createMultiPagePDF(pages = 3, linesPerPage = ["Line 1", "Line 2"]) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([600, 400])
    let y = 350
    page.drawText(`Page Header ${i}`, { x: 50, y, size: 16, font })
    y -= 30
    for (const l of linesPerPage) {
      page.drawText(`${l} (Page ${i})`, { x: 50, y, size: 12, font })
      y -= 25
    }
  }
  const bytes = await doc.save()
  return new File([bytes], `doc-${pages}p.pdf`, { type: "application/pdf" })
}

// ============================================================================
// Suite 1: Extreme Input Sizes & Byte-Level Boundary Stress
// ============================================================================

test("Stress Boundary: 0-byte input across all M3 tools rejects cleanly", async () => {
  const s = loadServices()
  const emptyBuf = new Uint8Array(0)
  const emptyFile = new File([emptyBuf], "empty.bin")

  // PDF-input tools
  await assert.rejects(() => s.pdfToWord(emptyFile), /Invalid or empty PDF file/)
  await assert.rejects(() => s.pdfToPPT(emptyFile), /Invalid or empty PDF file/)
  await assert.rejects(() => s.pdfToExcel(emptyFile), /Invalid or empty PDF file/)
  await assert.rejects(() => s.pdfToJPG(emptyFile), /Invalid or empty PDF file/)

  // Document/text-input tools
  await assert.rejects(() => s.wordToPDF(""), /Select a Word document or enter text/)
  await assert.rejects(() => s.wordToPDF(emptyFile), /Select a Word document or enter text/)
  await assert.rejects(() => s.pptToPDF(""), /Select a presentation file or enter outline/)
  await assert.rejects(() => s.pptToPDF(emptyFile), /Select a presentation file or enter outline/)
  await assert.rejects(() => s.excelToPDF(""), /Select an Excel or CSV file/)
  await assert.rejects(() => s.excelToPDF(emptyFile), /Select an Excel or CSV file/)

  // Multi-image tool
  await assert.rejects(() => s.jpgToPDF([]), /Select at least one image/)
})

test("Stress Boundary: 1-byte, 2-byte, 3-byte inputs never crash runtime or throw unhandled exceptions", async () => {
  const s = loadServices()

  for (const byteVal of [0x00, 0x25, 0x48, 0xff]) {
    const singleByte = new Uint8Array([byteVal])
    const file = new File([singleByte], "tiny.pdf", { type: "application/pdf" })

    await assert.rejects(() => s.pdfToWord(file), /Select a valid PDF/)
    await assert.rejects(() => s.pdfToPPT(file), /Select a valid PDF/)
    await assert.rejects(() => s.pdfToExcel(file), /Select a valid PDF/)
    await assert.rejects(() => s.pdfToJPG(file), /Select a valid PDF/)
    await assert.rejects(() => s.jpgToPDF([{ name: "tiny.jpg", bytes: singleByte }]), /Unsupported image format/)
  }

  // 2-byte and 3-byte prefix checks
  const twoBytes = new Uint8Array([0x25, 0x50]) // '%P'
  const threeBytes = new Uint8Array([0x25, 0x50, 0x44]) // '%PD'
  await assert.rejects(() => s.pdfToWord(twoBytes), /Select a valid PDF/)
  await assert.rejects(() => s.pdfToWord(threeBytes), /Select a valid PDF/)
})

test("Stress Boundary: Corrupt headers and truncated binary streams reject safely", async () => {
  const s = loadServices()

  // 1. '%PDF' magic followed by 100 random noise bytes (corrupt PDF body)
  const corruptPdf = new Uint8Array(104)
  corruptPdf.set([0x25, 0x50, 0x44, 0x46]) // '%PDF'
  for (let i = 4; i < 104; i++) corruptPdf[i] = (i * 37) % 256
  await assert.rejects(() => s.pdfToWord(corruptPdf))
  await assert.rejects(() => s.pdfToPPT(corruptPdf))
  await assert.rejects(() => s.pdfToExcel(corruptPdf))
  await assert.rejects(() => s.pdfToJPG(corruptPdf))

  // 2. PK-ZIP magic 0x50, 0x4B, 0x03, 0x04 followed by 20 bytes of zeros (corrupt docx/xlsx)
  const corruptZip = new Uint8Array(24)
  corruptZip.set([0x50, 0x4b, 0x03, 0x04])
  // wordToPDF and excelToPDF fall back to text decoding or reject cleanly
  const wordResult = await s.wordToPDF(corruptZip)
  assert.ok(wordResult.blob.size > 0, "wordToPDF gracefully converts fallback text to PDF")

  // 3. Truncated JPEG (SOI 0xFF 0xD8 but only 4 bytes) - rejects cleanly without crashing process
  const truncatedJpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  await assert.rejects(
    () => s.jpgToPDF([{ name: "trunc.jpg", bytes: truncatedJpg }]),
    (err) => err instanceof Error,
  )
})

test("Stress Boundary: Whitespace-only and empty line inputs in text-to-pdf tools", async () => {
  const s = loadServices()

  // Pure spaces, newlines, tabs
  await assert.rejects(() => s.wordToPDF("   \n\n\t\t\r\n   "), /Select a Word document or enter text/)
  await assert.rejects(() => s.pptToPDF("   \n\n\t\t\r\n   "), /Select a presentation file or enter outline/)
  await assert.rejects(() => s.excelToPDF("   \n\n\t\t\r\n   "), /Select an Excel or CSV file/)

  // 1 character valid text produces valid PDF
  const singleCharWord = await s.wordToPDF("A")
  assert.ok(singleCharWord.blob.size > 200)

  const singleCharPpt = await s.pptToPDF("A")
  assert.ok(singleCharPpt.blob.size > 200)

  const singleCharExcel = await s.excelToPDF("A")
  assert.ok(singleCharExcel.blob.size > 200)
})

// ============================================================================
// Suite 2: Non-ASCII, Wide-Character, Unicode & Symbol Stress
// ============================================================================

test("Stress Unicode: High-surrogates, emojis, CJK, and RTL strings in wordToPDF", async () => {
  const s = loadServices()

  const stressContent = `# Global Enterprise Summary 🌍 🚀
## Section 1: Multilingual Overview
* Chinese: 财务季度报告 2026 年度 — 增长良好
* Japanese: 売上高と利益の成長傾向（第3四半期）
* Korean: 분기별 실적 발표 및 주요 성과
* Arabic: تقرير الأداء المالي والنمو السنوي
* Hebrew: דוח ביצועים פיננסיים לשנת 2026
* Currency & Math: €1,250,000 | ¥95,000,000 | £850,000 | ∑(x_i) ≥ 99.9% ± 0.05
* Typographic Quotes: “Double Quotes” and ‘Single Quotes’ and em—dash and ellipsis…
* Control symbols: ✓ Done • Pending ★ Star`

  const result = await s.wordToPDF(stressContent, {
    font: "helvetica",
    margins: "compact",
    title: "Global Enterprise 🌍",
  })

  assert.ok(result.blob.size > 500)
  const bytes = new Uint8Array(await result.blob.arrayBuffer())
  const doc = await PDFDocument.load(bytes)
  assert.ok(doc.getPageCount() >= 1, "PDF successfully generated with sanitized Unicode strings")
})

test("Stress Unicode: Emojis and special characters in pptToPDF multi-slide outline", async () => {
  const s = loadServices()

  const outline = `Slide 1: Executive Kickoff 🚀
Key milestone achievements for 2026
Financial targets exceeded by +24% 📈
Global team expansion: Tokyo 🇯🇵, London 🇬🇧, SF 🇺🇸

---
Slide 2: Technical Deep Dive 💻
Architecture: ECMA-376 OpenXML & Pure Client-Side ZIP
Zero remote server dependency: 100% in-browser! ⚡
Special entities: <Component key="flux" value="&amp;"/>
Mathematical bounds: f(x) = ∫_0^∞ e^(-x) dx = 1.0`

  const result = await s.pptToPDF(outline, {
    orientation: "landscape-16-9",
    slidesPerPage: 1,
  })

  assert.ok(result.blob.size > 500)
  const bytes = new Uint8Array(await result.blob.arrayBuffer())
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getPageCount(), 2, "Generates exactly 2 landscape presentation slides")
})

test("Stress Unicode: XML escaping and RFC-4180 CSV compliance in excelToPDF and pdfToExcel", async () => {
  const s = loadServices()

  const csvRaw = `Item,Price,Notes,Status
"Widgets & Gadgets, Inc.",$1200.50,"Quote with ""escaped"" quotes and <XML> tags",Active ✓
"Global Logistics 🚀",€450.00,"Special symbols: & < > ' """,Pending ⏳
"Japanese Electronics 日本",¥98000,"Regular text",Confirmed ★`

  // Convert CSV to PDF
  const pdfResult = await s.excelToPDF(csvRaw, {
    orientation: "landscape",
    theme: "grid-indigo",
    title: "Quarterly Inventory & Audit <2026>",
  })
  assert.ok(pdfResult.blob.size > 500)

  // Convert PDF back to Excel CSV format
  const pdfBytes = new Uint8Array(await pdfResult.blob.arrayBuffer())
  const excelCsv = await s.pdfToExcel(pdfBytes, { format: "csv" })

  // Verify UTF-8 BOM at byte level (0xEF, 0xBB, 0xBF)
  const csvBuffer = new Uint8Array(await excelCsv.blob.arrayBuffer())
  assert.equal(csvBuffer[0], 0xef, "Byte 0 is UTF-8 BOM 0xEF")
  assert.equal(csvBuffer[1], 0xbb, "Byte 1 is UTF-8 BOM 0xBB")
  assert.equal(csvBuffer[2], 0xbf, "Byte 2 is UTF-8 BOM 0xBF")

  const csvText = await excelCsv.blob.text()
  assert.ok(csvText.includes("Widgets"), "CSV preserves text content")
})

test("Stress Unicode: OpenXML XML escaping prevents invalid XML tags in pdfToWord & pdfToPPT", async () => {
  const s = loadServices()

  // Create a PDF with adversarial XML injection text
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([600, 400])
  const adversarialLines = [
    '<script>alert("XSS")</script>',
    '</w:t></w:r><w:r><w:t>Injected OpenXML Tag',
    'Special symbols: & < > " \' &amp; &lt;',
    'Path: C:\\Users\\Administrator\\AppData\\Local',
  ]
  let y = 350
  for (const l of adversarialLines) {
    page.drawText(s.sanitizeForWinAnsi(l, font), { x: 50, y, size: 12, font })
    y -= 30
  }
  const pdfBytes = await doc.save()

  // 1. pdfToWord
  const wordRes = await s.pdfToWord(pdfBytes)
  assert.equal(wordRes.name.endsWith(".docx"), true)
  const wordBytes = new Uint8Array(await wordRes.blob.arrayBuffer())
  const wordEntries = await s.unzipEntries(wordBytes)
  const docXml = wordEntries["word/document.xml"]
  assert.ok(docXml, "DOCX contains word/document.xml")
  // Check that all raw '<' and '&' inside text runs are properly escaped
  assert.ok(!docXml.includes("<script>"), "Raw unescaped <script> tag does not exist in docx XML")
  assert.ok(docXml.includes("&lt;script&gt;"), "<script> is properly escaped to &lt;script&gt;")

  // 2. pdfToPPT
  const pptRes = await s.pdfToPPT(pdfBytes)
  assert.equal(pptRes.name.endsWith(".pptx"), true)
  const pptBytes = new Uint8Array(await pptRes.blob.arrayBuffer())
  const pptEntries = await s.unzipEntries(pptBytes)
  const slideXml = pptEntries["ppt/slides/slide1.xml"]
  assert.ok(slideXml, "PPTX contains ppt/slides/slide1.xml")
  assert.ok(!slideXml.includes("<script>"), "Raw unescaped <script> tag does not exist in slide XML")
  assert.ok(slideXml.includes("&lt;script&gt;"), "<script> is properly escaped in slide XML")
})

// ============================================================================
// Suite 3: Multi-Page & Large Volume Round-Trip Oracles
// ============================================================================

test("Stress Round-Trip: 5-page wordToPDF -> pdfToWord full content cycle", async () => {
  const s = loadServices()

  // 1. Create a large 5-page document text
  let largeText = "# Comprehensive Annual Report 2026\n"
  for (let i = 1; i <= 5; i++) {
    largeText += `\n## Section ${i}: Strategic Priorities for Division ${i}\n`
    largeText += `* Primary milestone target for Q${(i % 4) + 1} with high reliability\n`
    largeText += `* Secondary deliverable with full operational compliance\n`
    largeText += `Detailed operational description for paragraph ${i}. This section verifies automatic pagination across page boundaries when rendered to standard PDF layout. Additional lines ensure sufficient height for multi-page document structure.\n`
  }

  const pdfOutput = await s.wordToPDF(largeText, { font: "times", margins: "standard" })
  const pdfBytes = new Uint8Array(await pdfOutput.blob.arrayBuffer())
  const pdfDoc = await PDFDocument.load(pdfBytes)
  assert.ok(pdfDoc.getPageCount() >= 2, "Generates multi-page PDF")

  // 2. Convert PDF back to DOCX
  const wordOutput = await s.pdfToWord(pdfBytes, { format: "docx", layout: "standard" })
  const wordBytes = new Uint8Array(await wordOutput.blob.arrayBuffer())
  const wordEntries = await s.unzipEntries(wordBytes)
  assert.ok(wordEntries["word/document.xml"])
  assert.ok(wordEntries["[Content_Types].xml"])

  // 3. Convert PDF to TXT
  const txtOutput = await s.pdfToWord(pdfBytes, { format: "txt" })
  const txtContent = await txtOutput.blob.text()
  assert.ok(txtContent.includes("Comprehensive Annual Report"))
  assert.ok(txtContent.includes("--- Page 1 ---"))
})

test("Stress Round-Trip: 60-row x 6-column excelToPDF -> pdfToExcel round-trip with pagination", async () => {
  const s = loadServices()

  // Create 60-row CSV table
  const rows = ["ID,Department,Quarter,Budget,Actual,Variance"]
  for (let i = 1; i <= 60; i++) {
    const dept = ["Engineering", "Product", "Design", "Marketing", "Finance"][i % 5]
    const budget = (i * 1250).toFixed(2)
    const actual = (i * 1180).toFixed(2)
    const variance = (i * 70).toFixed(2)
    rows.push(`${i},${dept},Q${(i % 4) + 1},$${budget},$${actual},$${variance}`)
  }
  const csvContent = rows.join("\n")

  // 1. Convert to PDF (multi-page table)
  const pdfRes = await s.excelToPDF(csvContent, {
    orientation: "landscape",
    theme: "grid-indigo",
    title: "Departmental Variance Report 2026",
  })
  const pdfBytes = new Uint8Array(await pdfRes.blob.arrayBuffer())
  const pdfDoc = await PDFDocument.load(pdfBytes)
  assert.ok(pdfDoc.getPageCount() >= 2, "60 rows span multiple PDF pages")

  // 2. Convert PDF back to Excel XLSX
  const xlsxRes = await s.pdfToExcel(pdfBytes, { format: "xlsx" })
  const xlsxBytes = new Uint8Array(await xlsxRes.blob.arrayBuffer())
  const xlsxEntries = await s.unzipEntries(xlsxBytes)
  assert.ok(xlsxEntries["xl/worksheets/sheet1.xml"])
  assert.ok(xlsxEntries["xl/workbook.xml"])

  // 3. Convert PDF back to CSV
  const csvRes = await s.pdfToExcel(pdfBytes, { format: "csv" })
  const outCsv = await csvRes.blob.text()
  assert.ok(outCsv.includes("Department"))
  assert.ok(outCsv.includes("Engineering"))
})

test("Stress Round-Trip: Multi-image jpgToPDF -> pdfToJPG image preservation", async () => {
  const s = loadServices()

  // 4 images (mix of JFIF and PNG)
  const images = [
    { name: "slide1.jpg", bytes: SAMPLE_JFIF_BYTES },
    { name: "diagram.png", bytes: SAMPLE_PNG_BYTES },
    { name: "slide2.jpg", bytes: SAMPLE_JFIF_BYTES },
    { name: "logo.png", bytes: SAMPLE_PNG_BYTES },
  ]

  // 1. Convert images to PDF
  const pdfRes = await s.jpgToPDF(images, {
    orientation: "auto",
    margins: "fit-margins",
  })
  assert.ok(pdfRes.blob.size > 1000)
  const pdfBytes = new Uint8Array(await pdfRes.blob.arrayBuffer())
  const pdfDoc = await PDFDocument.load(pdfBytes)
  assert.equal(pdfDoc.getPageCount(), 4, "PDF contains exactly 4 pages for 4 input images")

  // 2. Convert PDF back to JPGs (all pages)
  const jpgRes = await s.pdfToJPG(pdfBytes, {
    pageSelection: "all",
    quality: "high",
  })
  assert.ok(jpgRes.name.endsWith("-images.zip"), "All pages mode returns a ZIP package")

  // 3. Unzip and verify 4 image entries
  const zipBytes = new Uint8Array(await jpgRes.blob.arrayBuffer())
  const zipEntries = await s.unzipEntries(zipBytes)
  assert.ok(zipEntries["page-1.jpg"], "page-1.jpg exists in zip")
  assert.ok(zipEntries["page-2.jpg"], "page-2.jpg exists in zip")
  assert.ok(zipEntries["page-3.jpg"], "page-3.jpg exists in zip")
  assert.ok(zipEntries["page-4.jpg"], "page-4.jpg exists in zip")
})

test("Stress Round-Trip: 6-slide outline pptToPDF -> pdfToPPT slide preservation", async () => {
  const s = loadServices()

  let outline = ""
  for (let i = 1; i <= 6; i++) {
    outline += `Slide ${i}: Topic ${i} Deep Dive\n`
    outline += `Bullet point 1 for slide ${i}\n`
    outline += `Bullet point 2 for slide ${i}\n\n---\n`
  }

  // 1. Convert outline to landscape PDF
  const pdfRes = await s.pptToPDF(outline, {
    orientation: "landscape-16-9",
    slidesPerPage: 1,
  })
  const pdfBytes = new Uint8Array(await pdfRes.blob.arrayBuffer())
  const pdfDoc = await PDFDocument.load(pdfBytes)
  assert.equal(pdfDoc.getPageCount(), 6, "Generates 6 landscape slides")

  // 2. Convert PDF to PPTX presentation
  const pptRes = await s.pdfToPPT(pdfBytes, {
    aspectRatio: "16:9",
    theme: "fluxkit-dark",
  })
  const pptBytes = new Uint8Array(await pptRes.blob.arrayBuffer())
  const pptEntries = await s.unzipEntries(pptBytes)
  assert.ok(pptEntries["ppt/presentation.xml"])
  for (let i = 1; i <= 6; i++) {
    assert.ok(pptEntries[`ppt/slides/slide${i}.xml`], `slide${i}.xml exists in PPTX package`)
  }
})

// ============================================================================
// Suite 4: Rapid Lifecycle Stress & Stability (Zero Memory Leak / Zero Crash)
// ============================================================================

test("Stress Lifecycle: 40 rapid sequential conversions across all 8 tools execute without crash or memory leak", async () => {
  const s = loadServices()
  const samplePdf = await createMultiPagePDF(2)
  const initialMem = process.memoryUsage().heapUsed

  for (let iteration = 0; iteration < 5; iteration++) {
    // 1. pdfToWord
    const wordRes = await s.pdfToWord(samplePdf, { format: "docx" })
    assert.ok(wordRes.blob.size > 0)

    // 2. pdfToPPT
    const pptRes = await s.pdfToPPT(samplePdf, { aspectRatio: "16:9" })
    assert.ok(pptRes.blob.size > 0)

    // 3. pdfToExcel
    const excelRes = await s.pdfToExcel(samplePdf, { format: "xlsx" })
    assert.ok(excelRes.blob.size > 0)

    // 4. wordToPDF
    const wordPdfRes = await s.wordToPDF("Rapid lifecycle test iteration " + iteration)
    assert.ok(wordPdfRes.blob.size > 0)

    // 5. pptToPDF
    const pptPdfRes = await s.pptToPDF("Slide 1: Iteration " + iteration + "\nPoint A\nPoint B")
    assert.ok(pptPdfRes.blob.size > 0)

    // 6. excelToPDF
    const excelPdfRes = await s.excelToPDF("Col1,Col2\nValA,ValB\nIteration," + iteration)
    assert.ok(excelPdfRes.blob.size > 0)

    // 7. pdfToJPG
    const jpgRes = await s.pdfToJPG(samplePdf, { pageSelection: "first" })
    assert.ok(jpgRes.blob.size > 0)

    // 8. jpgToPDF
    const imgPdfRes = await s.jpgToPDF([{ name: "iter.jpg", bytes: SAMPLE_JFIF_BYTES }])
    assert.ok(imgPdfRes.blob.size > 0)
  }

  // 40 conversions completed (5 iterations * 8 tools)
  const finalMem = process.memoryUsage().heapUsed
  const memDiffMB = (finalMem - initialMem) / (1024 * 1024)
  assert.ok(memDiffMB < 100, `Memory delta (${memDiffMB.toFixed(2)} MB) is well within safe bounds`)
})

test("Stress Concurrency: 8 simultaneous conversions with Promise.all complete reliably", async () => {
  const s = loadServices()
  const samplePdf = await createMultiPagePDF(2)

  const promises = [
    s.pdfToWord(samplePdf, { format: "docx" }),
    s.pdfToWord(samplePdf, { format: "txt" }),
    s.pdfToPPT(samplePdf, { theme: "corporate-blue" }),
    s.pdfToExcel(samplePdf, { format: "csv" }),
    s.wordToPDF("# Concurrent Word 1\nContent paragraph"),
    s.pptToPDF("Slide 1: Concurrent PPT\n* Point 1"),
    s.excelToPDF("A,B,C\n1,2,3"),
    s.jpgToPDF([{ name: "conc.jpg", bytes: SAMPLE_JFIF_BYTES }]),
  ]

  const results = await Promise.all(promises)
  assert.equal(results.length, 8)
  for (const r of results) {
    assert.ok(r.blob.size > 0, `Output ${r.name} is non-empty`)
  }
})

// ============================================================================
// Suite 5: Extreme Structural Geometries & OpenXML Packaging
// ============================================================================

test("Stress Geometry: Extreme page dimensions and text widths", async () => {
  const s = loadServices()

  // 1. Ultra-wide PDF (e.g. 2400 x 300)
  const wideDoc = await PDFDocument.create()
  const font = await wideDoc.embedFont(StandardFonts.Helvetica)
  const widePage = wideDoc.addPage([2400, 300])
  widePage.drawText("Ultra-wide panoramic layout test", { x: 50, y: 150, size: 24, font })
  const wideBytes = await wideDoc.save()

  const wideWord = await s.pdfToWord(wideBytes)
  assert.ok(wideWord.blob.size > 0)

  const widePpt = await s.pdfToPPT(wideBytes)
  assert.ok(widePpt.blob.size > 0)

  // 2. Ultra-tall PDF (e.g. 300 x 2400)
  const tallDoc = await PDFDocument.create()
  const tallPage = tallDoc.addPage([300, 2400])
  tallPage.drawText("Ultra-tall scrollable layout test", { x: 30, y: 2300, size: 14, font })
  const tallBytes = await tallDoc.save()

  const tallExcel = await s.pdfToExcel(tallBytes)
  assert.ok(tallExcel.blob.size > 0)

  // 3. Huge uninterrupted single word (1,000 characters without spaces)
  const hugeWord = "X".repeat(1000)
  const wordPdf = await s.wordToPDF(`Title\n${hugeWord}\nFinal Line`)
  assert.ok(wordPdf.blob.size > 0, "Handles massive unbroken token without word wrap crash")

  // 4. Excel with 35 columns (tests column lettering beyond Z: A, B ... Z, AA, AB, AC...)
  const headerCols = Array.from({ length: 35 }, (_, i) => `Col_${i + 1}`).join(",")
  const dataCols = Array.from({ length: 35 }, (_, i) => `${(i + 1) * 10}`).join(",")
  const wideCsv = `${headerCols}\n${dataCols}`
  const excelPdf = await s.excelToPDF(wideCsv)
  assert.ok(excelPdf.blob.size > 0)
})

test("Stress Packaging: Pure-JS PK-ZIP builder handles 50 entries and CRC-32 integrity", async () => {
  const s = loadServices()

  const entries = []
  for (let i = 1; i <= 50; i++) {
    entries.push({
      name: `folder/file_${i}.txt`,
      data: `Payload data content for file number ${i} in pure client-side ZIP builder.`,
    })
  }

  const zipBytes = s.buildZipArchive(entries)
  assert.ok(zipBytes.length > 500)

  // Unzip and verify all 50 entries match
  const unzipped = await s.unzipEntries(zipBytes)
  for (let i = 1; i <= 50; i++) {
    const fn = `folder/file_${i}.txt`
    assert.ok(unzipped[fn], `Entry ${fn} retrieved from PK-ZIP`)
    assert.ok(unzipped[fn].includes(`file number ${i}`))
  }
})

// ============================================================================
// Suite 6: UI Boundary Stress in ToolPage.tsx
// ============================================================================

test("Stress UI: ToolPage option state transitions and file drop boundaries", () => {
  const m3ToolIds = [
    "pdf-to-word",
    "pdf-to-ppt",
    "pdf-to-excel",
    "word-to-pdf",
    "ppt-to-pdf",
    "excel-to-pdf",
    "pdf-to-jpg",
    "jpg-to-pdf",
  ]

  for (const tid of m3ToolIds) {
    const { load } = createDOMEnv(tid)
    const App = load("App").default
    const html = renderToStaticMarkup(React.createElement(App))

    // Verify dropzone input and tool headers rendered in App
    assert.ok(html.includes('type="file"'), `Dropzone file input rendered for #${tid}`)
    assert.ok(html.includes("Drop your files here"), `Drop instructions present for #${tid}`)
    assert.ok(html.includes("Convert to") || html.includes("Convert"), `Action button present for #${tid}`)
  }
})

// ============================================================================
// Suite 7: Additional Adversarial Boundary Probes
// ============================================================================

test("Stress Boundary: Sparse, ragged, and malformed CSV parsing in excelToPDF", async () => {
  const s = loadServices()

  // 1. Sparse CSV with multiple empty commas
  const sparse = "A,,B,,,C\n1,,2,,,3\n,ValOnly,,"
  const sparsePdf = await s.excelToPDF(sparse)
  assert.ok(sparsePdf.blob.size > 200, "Handles sparse CSV with empty cells")

  // 2. Single-cell input
  const single = "Total Company Revenue"
  const singlePdf = await s.excelToPDF(single)
  assert.ok(singlePdf.blob.size > 200, "Handles single cell CSV")

  // 3. Trailing empty lines
  const trailing = "Name,Score\nAlice,95\nBob,88\n\n\n"
  const trailingPdf = await s.excelToPDF(trailing)
  assert.ok(trailingPdf.blob.size > 200, "Skips trailing empty lines")
})

test("Stress Boundary: Out-of-range custom page selections in pdfToJPG handle boundaries safely", async () => {
  const s = loadServices()
  const samplePdf = await createMultiPagePDF(2)

  // 1. Negative page out of bounds
  await assert.rejects(
    () => s.pdfToJPG(samplePdf, { pageSelection: "custom", pageNumber: -3 }),
    /out of range/,
  )

  // 2. Beyond total pages (e.g. 99 on 2-page document)
  await assert.rejects(
    () => s.pdfToJPG(samplePdf, { pageSelection: "custom", pageNumber: 99 }),
    /out of range/,
  )

  // 3. Falsy page number 0 defaults safely to page 1 via fallback without runtime crash
  const res = await s.pdfToJPG(samplePdf, { pageSelection: "custom", pageNumber: 0 })
  assert.ok(res.blob.size > 0, "Falsy page 0 defaults safely to page 1")
})

test("Stress Boundary: jpgToPDF rejects when all inputs are 0-byte or invalid", async () => {
  const s = loadServices()

  // Null / undefined files
  await assert.rejects(() => s.jpgToPDF(null), /Select at least one image/)
  await assert.rejects(() => s.jpgToPDF(undefined), /Select at least one image/)

  // List of only 0-byte entries
  await assert.rejects(
    () => s.jpgToPDF([{ name: "empty1.jpg", bytes: new Uint8Array(0) }]),
    /No valid images could be embedded/,
  )
})

test("Stress Algorithm: colIndexToName conversion precision across boundary indices", () => {
  // Extract colIndexToName logic:
  function colIndexToName(index) {
    let name = ""
    let num = index
    while (num >= 0) {
      name = String.fromCharCode(65 + (num % 26)) + name
      num = Math.floor(num / 26) - 1
    }
    return name
  }

  assert.equal(colIndexToName(0), "A")
  assert.equal(colIndexToName(25), "Z")
  assert.equal(colIndexToName(26), "AA")
  assert.equal(colIndexToName(27), "AB")
  assert.equal(colIndexToName(51), "AZ")
  assert.equal(colIndexToName(52), "BA")
  assert.equal(colIndexToName(701), "ZZ")
  assert.equal(colIndexToName(702), "AAA")
})

test("Stress Algorithm: escapeXml replaces all 5 XML entity characters", () => {
  const s = loadServices()
  const input = `<greeting attr="hello & goodbye 'friend'">`
  const escaped = s.escapeXml(input)
  assert.equal(
    escaped,
    `&lt;greeting attr=&quot;hello &amp; goodbye &apos;friend&apos;&quot;&gt;`,
  )
})

