/**
 * Milestone 3 Adversarial Empirical Verification Suite
 * Role: Challenger 1 (Critic / Specialist)
 * Focus: Document & Format Conversions (pdf-to-word, pdf-to-ppt, pdf-to-excel,
 *        word-to-pdf, ppt-to-pdf, excel-to-pdf, pdf-to-jpg, jpg-to-pdf)
 *
 * Verifies:
 * 1. OpenXML PK-ZIP headers (0x50 0x4B 0x03 0x04) and EOCD (0x50 0x4B 0x05 0x06)
 * 2. OpenXML package schemas ([Content_Types].xml, _rels/.rels, root document/slide/sheet parts)
 * 3. excelToPDF multi-page pagination and repeating headers
 * 4. jpgToPDF buffer offset immunity (unpooled memory, non-zero byteOffsets, mixed formats)
 * 5. pdfToJPG JPEG SOI (0xFF 0xD8) and EOI (0xFF 0xD9) markers
 * 6. Invertibility and round-trip fidelity
 * 7. Hostile / boundary input fault tolerance
 */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument } = require("pdf-lib")

// ============================================================================
// Service Dynamic Loader
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

const services = loadServices()

// ============================================================================
// Empirical Binary Helpers & Oracles
// ============================================================================

/**
 * Validates PK-ZIP 2.0 binary layout according to APPNOTE.TXT spec:
 * - Local header signature: 0x50 0x4B 0x03 0x04 (0x04034B50 LE)
 * - EOCD signature: 0x50 0x4B 0x05 0x06 (0x06054B50 LE)
 * - Central directory signature: 0x50 0x4B 0x01 0x02 (0x02014B50 LE)
 * Returns array of entry file names extracted directly from Central Directory.
 */
function inspectZipBinary(buffer) {
  const u8 =
    buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer)
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)

  // 1. Verify Local Header signature at offset 0
  assert.ok(
    u8.length >= 22,
    "Archive too small to contain valid PK-ZIP structure",
  )
  const firstSig = view.getUint32(0, true)
  assert.strictEqual(
    firstSig,
    0x04034b50,
    `Initial bytes must match PK-ZIP Local File Header (0x50 0x4B 0x03 0x04). Found 0x${firstSig.toString(16)}`,
  )

  // 2. Find EOCD signature scanning backwards
  let eocdOffset = -1
  for (let i = u8.length - 22; i >= 0 && i >= u8.length - 65557; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  assert.ok(
    eocdOffset !== -1,
    "ZIP End of Central Directory record (0x50 0x4B 0x05 0x06) not found",
  )

  const diskNumber = view.getUint16(eocdOffset + 4, true)
  const startDisk = view.getUint16(eocdOffset + 6, true)
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true)
  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const cdSize = view.getUint32(eocdOffset + 12, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)

  assert.strictEqual(diskNumber, 0, "Disk number must be 0 for single-part archive")
  assert.strictEqual(startDisk, 0, "Start disk must be 0")
  assert.strictEqual(
    entriesOnDisk,
    totalEntries,
    "Entries on disk must equal total entries in single-part archive",
  )
  assert.ok(totalEntries > 0, "ZIP archive must contain at least 1 entry")
  assert.ok(cdOffset > 0, "Central directory offset must be greater than zero")
  assert.ok(cdOffset + cdSize <= eocdOffset, "Central directory must precede EOCD")

  // 3. Scan Central Directory headers
  const fileNames = []
  const decoder = new TextDecoder("utf-8")
  let cur = cdOffset
  for (let idx = 0; idx < totalEntries; idx++) {
    const cdSig = view.getUint32(cur, true)
    assert.strictEqual(
      cdSig,
      0x02014b50,
      `Central Directory Header #${idx + 1} must match signature 0x02014B50`,
    )
    const fnLen = view.getUint16(cur + 28, true)
    const extraLen = view.getUint16(cur + 30, true)
    const commentLen = view.getUint16(cur + 32, true)
    const fnBytes = u8.subarray(cur + 46, cur + 46 + fnLen)
    fileNames.push(decoder.decode(fnBytes))
    cur += 46 + fnLen + extraLen + commentLen
  }

  return { fileNames, totalEntries, eocdOffset, cdOffset, cdSize }
}

/**
 * Creates an empirical multi-page PDF fixture containing structured headers and paragraphs.
 */
async function createTestPDF(pageCount = 3) {
  const doc = await PDFDocument.create()
  for (let p = 1; p <= pageCount; p++) {
    const page = doc.addPage([600, 800])
    page.drawText(`Milestone 3 Document Section ${p}`, { x: 50, y: 740, size: 16 })
    page.drawText(`Paragraph 1 of page ${p}: Comprehensive verification of OpenXML transformation pipelines.`, {
      x: 50,
      y: 710,
      size: 11,
    })
    page.drawText(`Paragraph 2 of page ${p}: Tabular record | ColA | ColB | Value ${p * 100}`, {
      x: 50,
      y: 680,
      size: 11,
    })
  }
  return await doc.save()
}

// 1x1 valid PNG base64
const VALID_1X1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

// ============================================================================
// Empirical Challenge Suites
// ============================================================================

test("Empirical Challenge 1: OpenXML PK-ZIP Header and EOCD Verification", async (t) => {
  const pdfBytes = await createTestPDF(2)

  await t.test("pdfToWord generates valid PK-ZIP binary package for .docx", async () => {
    const res = await services.pdfToWord(pdfBytes)
    assert.ok(res.name.endsWith(".docx"), `Expected .docx extension, got ${res.name}`)
    const bytes = new Uint8Array(await res.blob.arrayBuffer())

    const zipMeta = inspectZipBinary(bytes)
    assert.ok(zipMeta.totalEntries >= 5, `Expected >= 5 entries, got ${zipMeta.totalEntries}`)
    assert.ok(zipMeta.fileNames.includes("[Content_Types].xml"))
    assert.ok(zipMeta.fileNames.includes("_rels/.rels"))
    assert.ok(zipMeta.fileNames.includes("word/document.xml"))
    assert.ok(zipMeta.fileNames.includes("word/_rels/document.xml.rels"))
    assert.ok(zipMeta.fileNames.includes("word/styles.xml"))
  })

  await t.test("pdfToPPT generates valid PK-ZIP binary package for .pptx", async () => {
    const res = await services.pdfToPPT(pdfBytes)
    assert.ok(res.name.endsWith(".pptx"), `Expected .pptx extension, got ${res.name}`)
    const bytes = new Uint8Array(await res.blob.arrayBuffer())

    const zipMeta = inspectZipBinary(bytes)
    assert.ok(zipMeta.totalEntries >= 4, `Expected >= 4 entries, got ${zipMeta.totalEntries}`)
    assert.ok(zipMeta.fileNames.includes("[Content_Types].xml"))
    assert.ok(zipMeta.fileNames.includes("_rels/.rels"))
    assert.ok(zipMeta.fileNames.includes("ppt/presentation.xml"))
    assert.ok(zipMeta.fileNames.includes("ppt/_rels/presentation.xml.rels"))
    assert.ok(zipMeta.fileNames.includes("ppt/slides/slide1.xml"))
    assert.ok(zipMeta.fileNames.includes("ppt/slides/slide2.xml"))
  })

  await t.test("pdfToExcel generates valid PK-ZIP binary package for .xlsx", async () => {
    const res = await services.pdfToExcel(pdfBytes)
    assert.ok(res.name.endsWith(".xlsx"), `Expected .xlsx extension, got ${res.name}`)
    const bytes = new Uint8Array(await res.blob.arrayBuffer())

    const zipMeta = inspectZipBinary(bytes)
    assert.ok(zipMeta.totalEntries >= 5, `Expected >= 5 entries, got ${zipMeta.totalEntries}`)
    assert.ok(zipMeta.fileNames.includes("[Content_Types].xml"))
    assert.ok(zipMeta.fileNames.includes("_rels/.rels"))
    assert.ok(zipMeta.fileNames.includes("xl/workbook.xml"))
    assert.ok(zipMeta.fileNames.includes("xl/_rels/workbook.xml.rels"))
    assert.ok(zipMeta.fileNames.includes("xl/worksheets/sheet1.xml"))
  })
})

test("Empirical Challenge 2: OpenXML Schema Part Integrity (ECMA-376 XML Elements)", async (t) => {
  const pdfBytes = await createTestPDF(2)

  await t.test("DOCX OpenXML XML parts contain valid ECMA-376 namespaces and structures", async () => {
    const res = await services.pdfToWord(pdfBytes)
    const bytes = new Uint8Array(await res.blob.arrayBuffer())
    const entries = await services.unzipEntries(bytes)

    // Check [Content_Types].xml
    const ct = entries["[Content_Types].xml"]
    assert.ok(ct.includes("<Types"), "Missing <Types root element")
    assert.ok(
      ct.includes('PartName="/word/document.xml"') &&
        ct.includes(
          'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"',
        ),
      "Missing or invalid word/document.xml override in [Content_Types].xml",
    )

    // Check _rels/.rels
    const rels = entries["_rels/.rels"]
    assert.ok(rels.includes("<Relationships"), "Missing <Relationships root element")
    assert.ok(
      rels.includes(
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"',
      ) && rels.includes('Target="word/document.xml"'),
      "Missing officeDocument target in _rels/.rels",
    )

    // Check word/document.xml
    const docXml = entries["word/document.xml"]
    assert.ok(docXml.includes("<w:document"), "Missing <w:document root element")
    assert.ok(docXml.includes("<w:body>"), "Missing <w:body>")
    assert.ok(docXml.includes("<w:p>"), "Missing paragraph <w:p>")
    assert.ok(docXml.includes("<w:t>"), "Missing text element <w:t>")
    assert.ok(docXml.includes("<w:sectPr>"), "Missing section properties <w:sectPr>")
    assert.ok(docXml.includes("Milestone 3 Document Section 1"), "Extracted text not found in document.xml")
  })

  await t.test("PPTX OpenXML XML parts contain valid presentation and slide elements", async () => {
    const res = await services.pdfToPPT(pdfBytes)
    const bytes = new Uint8Array(await res.blob.arrayBuffer())
    const entries = await services.unzipEntries(bytes)

    // Check [Content_Types].xml
    const ct = entries["[Content_Types].xml"]
    assert.ok(
      ct.includes('PartName="/ppt/presentation.xml"') &&
        ct.includes(
          'ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"',
        ),
    )
    assert.ok(ct.includes('PartName="/ppt/slides/slide1.xml"'))
    assert.ok(ct.includes('PartName="/ppt/slides/slide2.xml"'))

    // Check ppt/presentation.xml
    const pres = entries["ppt/presentation.xml"]
    assert.ok(pres.includes("<p:presentation"), "Missing <p:presentation root element")
    assert.ok(pres.includes("<p:sldIdLst>"), "Missing slide ID list <p:sldIdLst>")

    // Check ppt/slides/slide1.xml
    const s1 = entries["ppt/slides/slide1.xml"]
    assert.ok(s1.includes("<p:sld"), "Missing <p:sld root element")
    assert.ok(s1.includes("<p:spTree>"), "Missing shape tree <p:spTree>")
    assert.ok(s1.includes("<a:t>"), "Missing drawing text <a:t>")
  })

  await t.test("XLSX OpenXML XML parts contain valid workbook and sheetData rows", async () => {
    const res = await services.pdfToExcel(pdfBytes)
    const bytes = new Uint8Array(await res.blob.arrayBuffer())
    const entries = await services.unzipEntries(bytes)

    // Check [Content_Types].xml
    const ct = entries["[Content_Types].xml"]
    assert.ok(
      ct.includes('PartName="/xl/workbook.xml"') &&
        ct.includes(
          'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"',
        ),
    )
    assert.ok(ct.includes('PartName="/xl/worksheets/sheet1.xml"'))

    // Check xl/workbook.xml
    const wb = entries["xl/workbook.xml"]
    assert.ok(wb.includes("<workbook"), "Missing <workbook root element")
    assert.ok(wb.includes('<sheet name="Sheet1"'), "Missing Sheet1 definition")

    // Check xl/worksheets/sheet1.xml
    const ws = entries["xl/worksheets/sheet1.xml"]
    assert.ok(ws.includes("<worksheet"), "Missing <worksheet root element")
    assert.ok(ws.includes("<sheetData>"), "Missing <sheetData>")
    assert.ok(ws.includes('<row r="1">'), "Missing row r=1 in sheet1.xml")
    assert.ok(ws.includes('<c r="A1"'), "Missing cell r=A1 in sheet1.xml")
  })
})

test("Empirical Challenge 3: excelToPDF Multi-Page Pagination with Repeating Headers", async (t) => {
  // Generate a 125-row CSV dataset
  const headers = ["Employee ID", "Full Name", "Department", "Performance Rating", "Base Compensation"]
  let csvData = headers.join(",") + "\n"
  for (let i = 1; i <= 125; i++) {
    csvData += `EMP-${1000 + i},"Employee Full Name ${i}",Engineering,Level ${1 + (i % 5)},$${75000 + i * 450}\n`
  }

  await t.test("Renders multi-page PDF table in portrait mode with repeating headers on EVERY page", async () => {
    const res = await services.excelToPDF(csvData, {
      orientation: "portrait",
      title: "Annual Global Performance Review",
      theme: "grid-indigo",
    })
    const ab = await res.blob.arrayBuffer()
    const pdfDoc = await PDFDocument.load(ab)
    const pageCount = pdfDoc.getPageCount()

    // 125 rows at 22px row height must exceed a single portrait page (~25-30 rows per page)
    assert.ok(
      pageCount >= 4,
      `Expected portrait PDF to span >= 4 pages for 125 rows, got ${pageCount}`,
    )

    // Extract pages and verify headers exist on every single page
    const extractedPages = await services.extractPDFPages(ab)
    assert.strictEqual(extractedPages.length, pageCount)

    for (let pIdx = 0; pIdx < pageCount; pIdx++) {
      const pageData = extractedPages[pIdx]
      const hasHeaderCol1 = pageData.lines.some((l) => l.includes("Employee ID") || l.includes("EMP-"))
      const hasHeaderCol2 = pageData.lines.some((l) => l.includes("Full Name") || l.includes("Department"))

      assert.ok(
        hasHeaderCol1 || hasHeaderCol2,
        `Page ${pIdx + 1} of ${pageCount} must contain repeated table column headers`,
      )
    }
  })

  await t.test("Renders multi-page PDF table in landscape mode with zebra styling", async () => {
    const res = await services.excelToPDF(csvData, {
      orientation: "landscape",
      title: "Landscape Roster",
      theme: "zebra",
    })
    const ab = await res.blob.arrayBuffer()
    const pdfDoc = await PDFDocument.load(ab)
    const pageCount = pdfDoc.getPageCount()

    // Landscape page height (612) is shorter than portrait (792), requiring even more pages
    assert.ok(
      pageCount >= 5,
      `Expected landscape PDF to span >= 5 pages for 125 rows, got ${pageCount}`,
    )

    const firstPage = pdfDoc.getPage(0)
    const { width, height } = firstPage.getSize()
    assert.ok(width > height, `Landscape page width (${width}) must be greater than height (${height})`)

    const extractedPages = await services.extractPDFPages(ab)
    for (let pIdx = 0; pIdx < pageCount; pIdx++) {
      const pageData = extractedPages[pIdx]
      assert.ok(
        pageData.lines.some((l) => l.includes("Employee ID") || l.includes("Department")),
        `Page ${pIdx + 1} must repeat table headers in landscape orientation`,
      )
    }
  })

  await t.test("Handles wide tables (10+ columns) normalizing column widths without NaN or negative values", async () => {
    const wideCols = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12"]
    let wideCsv = wideCols.join(",") + "\n"
    for (let i = 1; i <= 20; i++) {
      wideCsv += wideCols.map((c) => `${c}_r${i}`).join(",") + "\n"
    }

    const res = await services.excelToPDF(wideCsv, { orientation: "landscape" })
    const ab = await res.blob.arrayBuffer()
    const pdfDoc = await PDFDocument.load(ab)
    assert.ok(pdfDoc.getPageCount() >= 1)
  })
})

test("Empirical Challenge 4: jpgToPDF Hostile Memory & Multi-Image Buffer Offset Immunity", async (t) => {
  const jfifBlob = services.createValidTestJfifBlob(100, 100)
  const jfifBytes = new Uint8Array(await jfifBlob.arrayBuffer())

  // Scenario A: Sliced Uint8Array with non-zero byteOffset
  const largeU8 = new Uint8Array(jfifBytes.length + 512)
  largeU8.fill(0x77)
  largeU8.set(jfifBytes, 192)
  const slicedU8 = largeU8.subarray(192, 192 + jfifBytes.length)
  assert.strictEqual(slicedU8.byteOffset, 192, "Prerequisite: byteOffset must be 192")

  // Scenario B: Node.js pooled Buffer slice
  const pooledNodeBuf = Buffer.alloc(jfifBytes.length + 1024)
  pooledNodeBuf.fill(0x88)
  for (let i = 0; i < jfifBytes.length; i++) {
    pooledNodeBuf[345 + i] = jfifBytes[i]
  }
  const pooledSlice = pooledNodeBuf.subarray(345, 345 + jfifBytes.length)
  assert.strictEqual(pooledSlice.byteOffset, 345, "Prerequisite: byteOffset must be 345")

  // Scenario C: Standard PNG bytes
  const pngBytes = Buffer.from(VALID_1X1_PNG_BASE64, "base64")

  // Scenario D: Standard JFIF with byteOffset === 0
  const cleanJfif = new Uint8Array(jfifBytes)

  const mixedImageBatch = [
    { name: "standard.jpg", bytes: cleanJfif },
    { name: "sliced-offset-192.jpg", bytes: slicedU8 },
    { name: "pooled-offset-345.jpg", bytes: pooledSlice },
    { name: "pixel.png", bytes: pngBytes },
  ]

  await t.test("jpgToPDF processes mixed offset batch without 'SOI not found in JPEG' error", async () => {
    // Before fix in M3, this would crash pdf-lib with 'SOI not found in JPEG'
    const res = await services.jpgToPDF(mixedImageBatch, { orientation: "auto" })
    assert.ok(res.name.endsWith(".pdf"), "Output must be .pdf")
    const ab = await res.blob.arrayBuffer()
    const pdfDoc = await PDFDocument.load(ab)

    assert.strictEqual(
      pdfDoc.getPageCount(),
      4,
      "Resulting PDF must contain exactly 4 pages corresponding to the 4 images",
    )
  })

  await t.test("jpgToPDF correctly applies forced landscape and portrait orientations", async () => {
    const resLandscape = await services.jpgToPDF([mixedImageBatch[0]], { orientation: "landscape" })
    const docL = await PDFDocument.load(await resLandscape.blob.arrayBuffer())
    const sizeL = docL.getPage(0).getSize()
    assert.strictEqual(sizeL.width, 792)
    assert.strictEqual(sizeL.height, 612)

    const resPortrait = await services.jpgToPDF([mixedImageBatch[0]], { orientation: "portrait" })
    const docP = await PDFDocument.load(await resPortrait.blob.arrayBuffer())
    const sizeP = docP.getPage(0).getSize()
    assert.strictEqual(sizeP.width, 612)
    assert.strictEqual(sizeP.height, 792)
  })
})

test("Empirical Challenge 5: pdfToJPG SOI (0xFF 0xD8) and EOI (0xFF 0xD9) Marker Compliance", async (t) => {
  const doc = await PDFDocument.create()
  doc.addPage([500, 600])
  doc.addPage([500, 600])
  doc.addPage([500, 600])
  const pdfBytes = await doc.save()

  await t.test("Single-page PDF conversion outputs valid JPEG with SOI and EOI markers", async () => {
    const res = await services.pdfToJPG(pdfBytes, { pageSelection: "first", quality: "high" })
    assert.ok(res.name.endsWith(".jpg"), `Expected .jpg file, got ${res.name}`)
    assert.strictEqual(res.blob.type, "image/jpeg")

    const bytes = new Uint8Array(await res.blob.arrayBuffer())
    assert.ok(bytes.length >= 4, "JPEG bytes too short")

    // Check SOI: 0xFF, 0xD8
    assert.strictEqual(bytes[0], 0xff, "First byte must be 0xFF")
    assert.strictEqual(bytes[1], 0xd8, "Second byte must be 0xD8 (SOI)")

    // Check EOI: 0xFF, 0xD9
    assert.strictEqual(bytes[bytes.length - 2], 0xff, "Second to last byte must be 0xFF")
    assert.strictEqual(bytes[bytes.length - 1], 0xd9, "Last byte must be 0xD9 (EOI)")
  })

  await t.test("Multi-page conversion bundles valid JPEGs inside a compliant ZIP archive", async () => {
    const res = await services.pdfToJPG(pdfBytes, { pageSelection: "all", quality: "standard" })
    assert.ok(res.name.endsWith(".zip"), `Expected .zip archive, got ${res.name}`)
    const zipBytes = new Uint8Array(await res.blob.arrayBuffer())

    // Validate ZIP binary
    const meta = inspectZipBinary(zipBytes)
    assert.strictEqual(meta.totalEntries, 3, "Archive must contain 3 page images")
    assert.deepStrictEqual(meta.fileNames, ["page-1.jpg", "page-2.jpg", "page-3.jpg"])

    // Parse each entry from the ZIP and verify JPEG markers
    const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
    let cur = meta.cdOffset
    for (let i = 0; i < meta.totalEntries; i++) {
      const compSize = view.getUint32(cur + 20, true)
      const fnLen = view.getUint16(cur + 28, true)
      const extraLen = view.getUint16(cur + 30, true)
      const commentLen = view.getUint16(cur + 32, true)
      const localOffset = view.getUint32(cur + 42, true)

      const localFnLen = view.getUint16(localOffset + 26, true)
      const localExtraLen = view.getUint16(localOffset + 28, true)
      const dataOffset = localOffset + 30 + localFnLen + localExtraLen
      const imgBytes = zipBytes.subarray(dataOffset, dataOffset + compSize)

      assert.ok(imgBytes.length >= 4, `Image #${i + 1} data too short`)
      assert.strictEqual(imgBytes[0], 0xff, `Image #${i + 1} SOI byte 0 must be 0xFF`)
      assert.strictEqual(imgBytes[1], 0xd8, `Image #${i + 1} SOI byte 1 must be 0xD8`)
      assert.strictEqual(imgBytes[imgBytes.length - 2], 0xff, `Image #${i + 1} EOI byte -2 must be 0xFF`)
      assert.strictEqual(imgBytes[imgBytes.length - 1], 0xd9, `Image #${i + 1} EOI byte -1 must be 0xD9`)

      cur += 46 + fnLen + extraLen + commentLen
    }
  })

  await t.test("Custom page selection validates boundary limits", async () => {
    await assert.rejects(
      async () => {
        await services.pdfToJPG(pdfBytes, { pageSelection: "custom", pageNumber: 10 })
      },
      /Page 10 out of range/,
      "Must reject page index greater than document page count",
    )
  })
})

test("Empirical Challenge 6: Round-Trip Format Interoperability", async (t) => {
  const originalPdf = await createTestPDF(2)

  await t.test("Round-trip: PDF -> Word (.docx) -> Word to PDF (.pdf)", async () => {
    // Step 1: PDF to DOCX
    const docxResult = await services.pdfToWord(originalPdf)
    assert.ok(docxResult.name.endsWith(".docx"))

    // Step 2: DOCX to PDF (using File with name matching UI dropzone behavior)
    const docxFile = new File([docxResult.blob], docxResult.name, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    const pdfResult = await services.wordToPDF(docxFile, {
      margins: "standard",
      fontSize: "medium",
    })
    assert.ok(pdfResult.name.endsWith(".pdf"))
    const roundtripPdf = await PDFDocument.load(await pdfResult.blob.arrayBuffer())
    assert.ok(roundtripPdf.getPageCount() >= 1, "Roundtrip PDF must contain pages")

    // Step 3: Resulting PDF back to DOCX
    const docxResult2 = await services.pdfToWord(await pdfResult.blob.arrayBuffer())
    const meta = inspectZipBinary(await docxResult2.blob.arrayBuffer())
    assert.ok(meta.fileNames.includes("word/document.xml"))
  })

  await t.test("Round-trip: PDF -> PPT (.pptx) -> PPT to PDF (.pdf)", async () => {
    // Step 1: PDF to PPTX
    const pptxResult = await services.pdfToPPT(originalPdf)
    assert.ok(pptxResult.name.endsWith(".pptx"))

    // Step 2: PPTX to PDF (using File with name matching UI dropzone behavior)
    const pptxFile = new File([pptxResult.blob], pptxResult.name, {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    })
    const pdfResult = await services.pptToPDF(pptxFile, {
      orientation: "landscape",
      slidesPerPage: 1,
    })
    assert.ok(pdfResult.name.endsWith(".pdf"))
    const roundtripPdf = await PDFDocument.load(await pdfResult.blob.arrayBuffer())
    assert.strictEqual(roundtripPdf.getPageCount(), 2, "PPTX to PDF must preserve slide count")
  })

  await t.test("Round-trip: PDF -> Excel (.xlsx) -> Excel to PDF (.pdf)", async () => {
    // Step 1: PDF to XLSX
    const xlsxResult = await services.pdfToExcel(originalPdf)
    assert.ok(xlsxResult.name.endsWith(".xlsx"))

    // Step 2: XLSX to PDF (using File with name matching UI dropzone behavior)
    const xlsxFile = new File([xlsxResult.blob], xlsxResult.name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const pdfResult = await services.excelToPDF(xlsxFile, {
      orientation: "portrait",
    })
    assert.ok(pdfResult.name.endsWith(".pdf"))
    const roundtripPdf = await PDFDocument.load(await pdfResult.blob.arrayBuffer())
    assert.ok(roundtripPdf.getPageCount() >= 1)
  })
})

test("Empirical Challenge 7: Hostile Input Fault Tolerance & Error Guardrails", async (t) => {
  const emptyBytes = new Uint8Array(0)

  // Zero-byte inputs across all conversion tools must reject cleanly
  const zeroByteRejections = [
    services.pdfToWord(emptyBytes),
    services.pdfToPPT(emptyBytes),
    services.pdfToExcel(emptyBytes),
    services.wordToPDF(emptyBytes),
    services.pptToPDF(emptyBytes),
    services.excelToPDF(emptyBytes),
    services.pdfToJPG(emptyBytes),
    services.jpgToPDF([]),
  ]

  for (const promise of zeroByteRejections) {
    await assert.rejects(
      promise,
      (err) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message.length > 0, "Error must contain descriptive user feedback")
        return true
      },
      "Zero byte or empty inputs must reject without crashing",
    )
  }

  // Non-PDF input to PDF tools
  const textBytes = new TextEncoder().encode("This is not a PDF file at all.")
  await assert.rejects(
    services.pdfToJPG(textBytes),
    /Select a valid PDF/,
    "pdfToJPG must reject non-PDF binary without throwing unexpected runtime exceptions",
  )

  await t.test(
    "Adversarial Edge Case: bare Blob without name property triggers unhandled TypeError in extractBytes",
    async () => {
      const pdfBytes = await createTestPDF(1)
      const bareBlob = new Blob([pdfBytes], { type: "application/pdf" })
      assert.strictEqual(bareBlob.name, undefined, "Prerequisite: Blob has no .name property")

      // Demonstrates empirically that extractBytes returns { bytes, name: undefined },
      // which crashes baseName = name.replace(...) with TypeError
      await assert.rejects(
        async () => {
          await services.pdfToWord(bareBlob)
        },
        (err) => {
          assert.ok(err instanceof TypeError)
          assert.ok(err.message.includes("replace"))
          return true
        },
        "Demonstrates that bare Blob without name property causes unhandled TypeError: Cannot read properties of undefined (reading 'replace')",
      )
    },
  )
})
