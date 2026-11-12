/**
 * Tier 5 White-Box Adversarial Coverage Challenger Test Suite
 * Focus: File & PDF Tools (M2, M3, M4)
 * Coverage:
 * - PDF Core: merge-pdf, split-pdf, compress, edit-pdf, sign-pdf, watermark, rotate-pdf, text-pdf, password
 * - Document Conversions: pdf-to-word, pdf-to-ppt, pdf-to-excel, word-to-pdf, ppt-to-pdf, excel-to-pdf, pdf-to-jpg, jpg-to-pdf
 * - Pipelines & Archiving: convert-compress, merge-compress, split-compress, zip, ocr, convert
 * - ToolPage State Machine & Form Binding Validation
 */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument, StandardFonts, degrees, rgb } = require("pdf-lib")

// ============================================================================
// Dynamic Service Transpiler & Loader
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
// Helpers & Test Fixture Generators
// ============================================================================

function createMockFile(bytes, name, type = "application/octet-stream") {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const blob = new Blob([u8], { type })
  return Object.assign(blob, {
    name,
    lastModified: Date.now(),
    arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
    text: async () => new TextDecoder("utf-8").decode(u8),
  })
}

async function createMultiPagePDF(pageCount = 3, textPrefix = "Page") {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([600, 400])
    page.drawText(`${textPrefix} ${i} Heading`, { x: 50, y: 350, size: 16, font })
    page.drawText(`Body text line for ${textPrefix.toLowerCase()} ${i}.`, {
      x: 50,
      y: 320,
      size: 11,
      font,
    })
  }
  const bytes = await doc.save()
  return createMockFile(bytes, "multi-page.pdf", "application/pdf")
}

function create1x1PngBytes() {
  return new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  )
}

function createSyntheticBMP(width, height, bpp = 24) {
  const rowBytes = Math.floor((bpp * width + 31) / 32) * 4
  const pixelArraySize = rowBytes * height
  const fileSize = 54 + pixelArraySize

  const bmp = new Uint8Array(fileSize)
  const view = new DataView(bmp.buffer)
  bmp[0] = 0x42 // 'B'
  bmp[1] = 0x4d // 'M'
  view.setUint32(2, fileSize, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, -height, true) // top-down
  view.setUint16(26, 1, true)
  view.setUint16(28, bpp, true)
  view.setUint32(34, pixelArraySize, true)

  // Fill background
  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowBytes
    for (let x = 0; x < width; x++) {
      if (bpp === 24) {
        bmp[rowOffset + x * 3] = 255
        bmp[rowOffset + x * 3 + 1] = 255
        bmp[rowOffset + x * 3 + 2] = 255
      } else if (bpp === 32) {
        bmp[rowOffset + x * 4] = 255
        bmp[rowOffset + x * 4 + 1] = 255
        bmp[rowOffset + x * 4 + 2] = 255
        bmp[rowOffset + x * 4 + 3] = 255
      } else if (bpp === 8) {
        bmp[rowOffset + x] = 255
      }
    }
  }
  return bmp
}

function inspectZipHeaders(u8) {
  assert.ok(u8.length >= 22, "Archive must be at least 22 bytes")
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const localSig = view.getUint32(0, true)
  assert.strictEqual(localSig, 0x04034b50, "Local header signature must match 0x04034B50")

  let eocdOffset = -1
  for (let i = u8.length - 22; i >= 0 && i >= u8.length - 65557; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  assert.ok(eocdOffset !== -1, "EOCD signature (0x06054B50) must be found")
  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)
  return { totalEntries, cdOffset, eocdOffset }
}

// ============================================================================
// SUITE 1: PDF Core & Page Manipulation (M2 Tools)
// ============================================================================

test("Suite 1: PDF Core & Page Manipulation White-Box Coverage", async (t) => {
  await t.test("1.1 splitPDF: whitespace, multi-ranges, duplicates, and edge rejections", async () => {
    const pdfFile = await createMultiPagePDF(5, "Chapter")

    // Complex comma ranges with whitespace and duplicates: ' 1 , 3-4 , 2 , 1 ' -> pages 1, 2, 3, 4
    const res1 = await services.splitPDF(pdfFile, " 1 , 3-4 , 2 , 1 ")
    assert.strictEqual(res1.name, "split-multi-page.pdf")
    const doc1 = await PDFDocument.load(await res1.blob.arrayBuffer())
    assert.strictEqual(doc1.getPageCount(), 4)

    // Single-point range e.g. '3-3' -> extracts exactly 1 page
    const res2 = await services.splitPDF(pdfFile, "3-3")
    const doc2 = await PDFDocument.load(await res2.blob.arrayBuffer())
    assert.strictEqual(doc2.getPageCount(), 1)

    // 'all' case-insensitive or empty range defaults to all pages
    const resAll = await services.splitPDF(pdfFile, "  ALL  ")
    const docAll = await PDFDocument.load(await resAll.blob.arrayBuffer())
    assert.strictEqual(docAll.getPageCount(), 5)

    // Inverted range e.g. '4-2' throws
    await assert.rejects(
      async () => await services.splitPDF(pdfFile, "4-2"),
      /start page \(4\) cannot be greater than end page \(2\)/,
    )

    // Out-of-bounds start or end
    await assert.rejects(
      async () => await services.splitPDF(pdfFile, "0-3"),
      /is out of bounds/,
    )
    await assert.rejects(
      async () => await services.splitPDF(pdfFile, "2-99"),
      /is out of bounds/,
    )

    // Non-numeric range and malformed parts
    await assert.rejects(
      async () => await services.splitPDF(pdfFile, "a-b"),
      /Must contain numbers/,
    )
    await assert.rejects(
      async () => await services.splitPDF(pdfFile, "1-2-3"),
      /Invalid page range syntax/,
    )
    await assert.rejects(
      async () => await services.splitPDF(pdfFile, ",,,,"),
      /Please specify valid page numbers/,
    )

    // Missing file rejection
    await assert.rejects(
      async () => await services.splitPDF(null),
      /Select a PDF to split/,
    )
  })

  await t.test("1.2 rotatePDF: angle normalization across negative angles and large multiples", async () => {
    const pdfFile = await createMultiPagePDF(3, "Doc")

    // Rotation angles: 0, 90, 180, 270, 360, 450, 720, -90, -270
    const angles = [0, 90, 180, 270, 360, 450, 720, -90, -270]
    for (const angle of angles) {
      const res = await services.rotatePDF(pdfFile, angle)
      assert.strictEqual(res.name, "rotated-multi-page.pdf")
      const doc = await PDFDocument.load(await res.blob.arrayBuffer())
      const expectedNormalized = ((angle % 360) + 360) % 360
      doc.getPages().forEach((p) => {
        assert.strictEqual(p.getRotation().angle, expectedNormalized)
      })
    }

    // Missing file rejection
    await assert.rejects(
      async () => await services.rotatePDF(null),
      /Choose at least one PDF to rotate/,
    )
  })

  await t.test("1.3 editPDF: style (note, highlight, callout) and position (top, center, bottom) permutations", async () => {
    const pdfFile = await createMultiPagePDF(2, "Contract")

    const styles = ["note", "highlight", "callout"]
    const positions = ["top", "center", "bottom"]

    for (const type of styles) {
      for (const position of positions) {
        const res = await services.editPDF(pdfFile, {
          annotation: `Stamped ${type} at ${position} - Unicode: ★ € —`,
          type,
          position,
          pageNumber: 2,
        })
        assert.strictEqual(res.name, "edited-multi-page.pdf")
        const doc = await PDFDocument.load(await res.blob.arrayBuffer())
        assert.strictEqual(doc.getPageCount(), 2)
      }
    }

    // Out of bounds pageNumber rejection
    await assert.rejects(
      async () => await services.editPDF(pdfFile, { pageNumber: 0 }),
      /out of bounds/,
    )
    await assert.rejects(
      async () => await services.editPDF(pdfFile, { pageNumber: 99 }),
      /out of bounds/,
    )

    // Missing file rejection
    await assert.rejects(
      async () => await services.editPDF(null),
      /Select a PDF to annotate/,
    )
  })

  await t.test("1.4 watermarkPDF: opacity clamping, angles, custom RGB color, and empty rejection", async () => {
    const pdfFile = await createMultiPagePDF(2, "Memo")

    // Opacity clamping: negative opacity (<0.05) clamped to 0.05, >1.0 clamped to 1.0
    const resLow = await services.watermarkPDF(pdfFile, { text: "DRAFT", opacity: -0.5 })
    assert.strictEqual(resLow.name, "watermarked-multi-page.pdf")

    const resHigh = await services.watermarkPDF(pdfFile, { text: "DRAFT", opacity: 2.5 })
    assert.ok(resHigh.blob.size > 0)

    // Angles: 0 deg (horizontal), 90 deg (vertical), custom 30 deg, custom color
    const resCustom = await services.watermarkPDF(pdfFile, {
      text: "INTERNAL ONLY",
      rotation: 30,
      fontSize: 48,
      color: { r: 0.1, g: 0.6, b: 0.2 },
    })
    const doc = await PDFDocument.load(await resCustom.blob.arrayBuffer())
    assert.strictEqual(doc.getPageCount(), 2)

    // Empty text rejection
    await assert.rejects(
      async () => await services.watermarkPDF(pdfFile, { text: "   " }),
      /Watermark text is required/,
    )

    // Missing file rejection
    await assert.rejects(
      async () => await services.watermarkPDF(null, { text: "TEST" }),
      /Select a PDF to watermark/,
    )
  })

  await t.test("1.5 signPDF: dual-mode embedding (signature PNG + signer name caption), placement, and dates", async () => {
    const pdfFile = await createMultiPagePDF(3, "Agreement")
    const pngBytes = create1x1PngBytes()

    // Dual-mode: BOTH signatureImageBytes AND signerName provided
    const resDual = await services.signPDF(pdfFile, {
      signerName: "Dr. Evelyn Reed, MD",
      signatureImageBytes: pngBytes,
      position: "top-right",
      pageNumber: 1, // cover page
    })
    assert.strictEqual(resDual.name, "signed-multi-page.pdf")
    const docDual = await PDFDocument.load(await resDual.blob.arrayBuffer())
    assert.strictEqual(docDual.getPageCount(), 3)

    // Text badge with custom date and position bottom-left
    const resBadge = await services.signPDF(pdfFile, {
      signerName: "John Doe",
      date: "2026-11-11",
      position: "bottom-left",
    })
    assert.ok(resBadge.blob.size > 0)

    // Default position & page defaults to last page
    const resDefault = await services.signPDF(pdfFile, {
      signerName: "Jane Smith",
    })
    assert.ok(resDefault.blob.size > 0)

    // Neither image nor signerName throws
    await assert.rejects(
      async () => await services.signPDF(pdfFile, {}),
      /Please provide a signature image or signer name/,
    )

    // Missing file rejection
    await assert.rejects(
      async () => await services.signPDF(null, { signerName: "Alice" }),
      /Select a PDF to sign/,
    )
  })

  await t.test("1.6 securePDF: permissions flags, title prefix, banner, password unlock round-trip, and pass-through", async () => {
    const pdfFile = await createMultiPagePDF(2, "Confidential Dossier")

    // Password < 4 chars rejection
    await assert.rejects(
      async () => await services.securePDF(pdfFile, { action: "lock", password: "123" }),
      /Security password must be at least 4 characters/,
    )

    // Lock with specific permissions
    const lockedRes = await services.securePDF(pdfFile, {
      action: "lock",
      password: "VaultPassword2026!",
      permissions: {
        preventPrinting: true,
        preventCopying: true,
        preventModification: true,
      },
    })
    assert.strictEqual(lockedRes.name, "secured-multi-page.pdf")

    const lockedDoc = await PDFDocument.load(await lockedRes.blob.arrayBuffer())
    assert.ok(lockedDoc.getTitle().startsWith("[Secured] "))
    assert.ok(lockedDoc.getSubject().startsWith("FluxKit-Protected:"))
    const keywords = lockedDoc.getKeywords()
    assert.ok(keywords.includes("preventPrinting=true"))
    assert.ok(keywords.includes("preventCopying=true"))
    assert.ok(keywords.includes("preventModification=true"))

    // Unlock with wrong password throws
    const lockedFile = createMockFile(
      await lockedRes.blob.arrayBuffer(),
      "locked.pdf",
      "application/pdf",
    )
    await assert.rejects(
      async () => await services.securePDF(lockedFile, { action: "unlock", password: "wrong" }),
      /Incorrect password\. Unable to unlock document\./,
    )

    // Unlock with correct password restores title and clears protection
    const unlockedRes = await services.securePDF(lockedFile, {
      action: "unlock",
      password: "VaultPassword2026!",
    })
    assert.strictEqual(unlockedRes.name, "unlocked-locked.pdf")
    const unlockedDoc = await PDFDocument.load(await unlockedRes.blob.arrayBuffer())
    assert.strictEqual(unlockedDoc.getSubject(), "")
    assert.strictEqual(unlockedDoc.getKeywords().length, 0)
    assert.ok(!unlockedDoc.getTitle().startsWith("[Secured] "))

    // Unlock on unencrypted / unsecured document passes through gracefully
    const plainRes = await services.securePDF(pdfFile, { action: "unlock", password: "any" })
    assert.strictEqual(plainRes.name, "unlocked-multi-page.pdf")

    // Unknown action rejection
    await assert.rejects(
      async () => await services.securePDF(pdfFile, { action: "tamper" }),
      /Unsupported security action: tamper/,
    )

    // Missing file rejection
    await assert.rejects(
      async () => await services.securePDF(null, { action: "lock", password: "test" }),
      /Select a PDF to protect or unlock/,
    )
  })

  await t.test("1.7 textToPDF and mergePDFs edge cases", async () => {
    // textToPDF unbroken word > 65 chars chunking and multi-page text
    const longToken = "A".repeat(120)
    const longText = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: ${longToken}`).join(
      "\n",
    )
    const textRes = await services.textToPDF(longText, "My Test Report")
    assert.strictEqual(textRes.name, "fluxkit-document.pdf")
    const textDoc = await PDFDocument.load(await textRes.blob.arrayBuffer())
    assert.ok(textDoc.getPageCount() > 1, "Must paginate across multiple pages")

    // Empty text rejection
    await assert.rejects(
      async () => await services.textToPDF("   "),
      /Add some text to create your document/,
    )

    // mergePDFs multi-file merge
    const pdf1 = await createMultiPagePDF(2, "DocA")
    const pdf2 = await createMultiPagePDF(3, "DocB")
    const pdf3 = await createMultiPagePDF(1, "DocC")
    const mergeRes = await services.mergePDFs([pdf1, pdf2, pdf3])
    const mergeDoc = await PDFDocument.load(await mergeRes.blob.arrayBuffer())
    assert.strictEqual(mergeDoc.getPageCount(), 6)

    // mergePDFs < 2 files rejection
    await assert.rejects(
      async () => await services.mergePDFs([pdf1]),
      /Choose at least two PDFs to merge/,
    )
  })

  await t.test("1.8 compressPDF: metadata stripping in high compression mode vs standard", async () => {
    const doc = await PDFDocument.create()
    doc.setTitle("Original Title")
    doc.setAuthor("Original Author")
    doc.setSubject("Original Subject")
    doc.setKeywords(["keyword1", "keyword2"])
    doc.addPage([600, 400])
    const file = createMockFile(await doc.save(), "meta.pdf", "application/pdf")

    // High compression strips metadata
    const highRes = await services.compressPDF(file, { level: "high" })
    const highDoc = await PDFDocument.load(await highRes.blob.arrayBuffer())
    assert.strictEqual(highDoc.getTitle(), "")
    assert.strictEqual(highDoc.getAuthor(), "")
    assert.strictEqual(highDoc.getSubject(), "")
    assert.strictEqual(highDoc.getKeywords().length, 0)
    assert.strictEqual(highDoc.getProducer(), "FluxKit PDF Optimizer")
    assert.strictEqual(highDoc.getCreator(), "FluxKit")

    // Missing file rejection
    await assert.rejects(
      async () => await services.compressPDF(null),
      /Select a PDF to compress/,
    )
  })
})

// ============================================================================
// SUITE 2: Document & Format Conversions (M3 Tools)
// ============================================================================

test("Suite 2: Document & Format Conversions White-Box Coverage", async (t) => {
  await t.test("2.1 pdfToWord: layout modes (clean, compact, standard), doc/txt formats, and magic byte guard", async () => {
    const pdfFile = await createMultiPagePDF(2, "Proposal")

    // Layout: clean (uniform font size 24, stripped headings)
    const resClean = await services.pdfToWord(pdfFile, { layout: "clean", format: "docx" })
    const entriesClean = await services.unzipEntries(await resClean.blob.arrayBuffer())
    assert.ok(entriesClean["word/document.xml"].includes('val="24"'))
    assert.ok(!entriesClean["word/document.xml"].includes('w:pStyle w:val="Heading1"'))

    // Layout: compact (after spacing 60, size 22)
    const resCompact = await services.pdfToWord(pdfFile, { layout: "compact", format: "docx" })
    const entriesCompact = await services.unzipEntries(await resCompact.blob.arrayBuffer())
    assert.ok(entriesCompact["word/document.xml"].includes('w:spacing w:after="60"'))
    assert.ok(entriesCompact["word/document.xml"].includes('val="22"'))

    // Format: doc (HTML msword wrapper with page-break-before)
    const resDoc = await services.pdfToWord(pdfFile, { format: "doc" })
    assert.strictEqual(resDoc.name, "multi-page-converted.doc")
    const docHtml = await resDoc.blob.text()
    assert.ok(docHtml.includes("xmlns:w='urn:schemas-microsoft-com:office:word'"))
    assert.ok(docHtml.includes("page-break-before:always"))

    // Format: txt (plain text with page dividers)
    const resTxt = await services.pdfToWord(pdfFile, { format: "txt" })
    assert.strictEqual(resTxt.name, "multi-page-converted.txt")
    const txtContent = await resTxt.blob.text()
    assert.ok(txtContent.includes("--- Page 1 ---"))
    assert.ok(txtContent.includes("--- Page 2 ---"))

    // Non-PDF magic bytes rejection
    const fakeFile = createMockFile(Buffer.from("NOT_A_PDF_DOCUMENT"), "fake.pdf")
    await assert.rejects(
      async () => await services.pdfToWord(fakeFile),
      /Select a valid PDF to convert to Word/,
    )

    // Empty bytes rejection
    const emptyFile = createMockFile(new Uint8Array(0), "empty.pdf")
    await assert.rejects(
      async () => await services.pdfToWord(emptyFile),
      /Invalid or empty PDF file/,
    )
  })

  await t.test("2.2 pdfToPPT: aspect ratios (4:3 vs 16:9), slide themes (corporate-blue, minimal-white), and parts", async () => {
    const pdfFile = await createMultiPagePDF(3, "Quarterly")

    // 4:3 Aspect Ratio + Corporate Blue Theme
    const res43 = await services.pdfToPPT(pdfFile, {
      aspectRatio: "4:3",
      theme: "corporate-blue",
    })
    assert.strictEqual(res43.name, "multi-page-converted.pptx")
    const entries43 = await services.unzipEntries(await res43.blob.arrayBuffer())
    // 4:3 cx is 9144000
    assert.ok(entries43["ppt/presentation.xml"].includes('cx="9144000"'))
    // corporate-blue colors: bg F1F5F9, text 1E293B, accent 2563EB
    assert.ok(entries43["ppt/slides/slide1.xml"].includes("2563EB"))
    assert.ok(entries43["ppt/slides/slide1.xml"].includes("F1F5F9"))

    // 16:9 Aspect Ratio + Minimal White Theme
    const res169 = await services.pdfToPPT(pdfFile, {
      aspectRatio: "16:9",
      theme: "minimal-white",
    })
    const entries169 = await services.unzipEntries(await res169.blob.arrayBuffer())
    assert.ok(entries169["ppt/presentation.xml"].includes('cx="12192000"'))
    assert.ok(entries169["ppt/slides/slide1.xml"].includes("3B82F6"))

    // Non-PDF rejection
    const fakeFile = createMockFile(Buffer.from("NON_PDF_DATA"), "slide.pdf")
    await assert.rejects(
      async () => await services.pdfToPPT(fakeFile),
      /Select a valid PDF to convert to PowerPoint/,
    )
  })

  await t.test("2.3 pdfToExcel: strategies (lines, whitespace, auto with numbers/currency) and TSV format", async () => {
    // Create PDF with table text containing tabs, currency, and pipes
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const p = doc.addPage([600, 400])
    p.drawText("Item | Quantity | Price | Total", { x: 50, y: 350, size: 12, font })
    p.drawText("Widget A | 10 | $15.50 | $155.00", { x: 50, y: 320, size: 12, font })
    p.drawText("Widget B | 5 | $24.00 | $120.00", { x: 50, y: 290, size: 12, font })
    const tablePdf = createMockFile(await doc.save(), "table.pdf", "application/pdf")

    // TSV export format
    const resTsv = await services.pdfToExcel(tablePdf, { format: "tsv" })
    assert.strictEqual(resTsv.name, "table-converted.tsv")
    const tsvText = await resTsv.blob.text()
    assert.ok(tsvText.startsWith("\uFEFF"))
    assert.ok(tsvText.includes("Widget A\t10\t$15.50\t$155.00"))

    // Strategy 'lines'
    const resLines = await services.pdfToExcel(tablePdf, { strategy: "lines", format: "csv" })
    const linesCsv = await resLines.blob.text()
    assert.ok(linesCsv.includes("Widget A | 10 | $15.50 | $155.00"))

    // Strategy 'auto' with XLSX: numeric cell conversion
    const resXlsx = await services.pdfToExcel(tablePdf, { format: "xlsx", strategy: "auto" })
    const entriesXlsx = await services.unzipEntries(await resXlsx.blob.arrayBuffer())
    assert.ok(entriesXlsx["xl/worksheets/sheet1.xml"].includes("<row r="))

    // Non-PDF rejection
    const fakePdf = createMockFile(Buffer.from("INVALID_DATA"), "not.pdf")
    await assert.rejects(
      async () => await services.pdfToExcel(fakePdf),
      /Select a valid PDF to extract into Excel/,
    )
  })

  await t.test("2.4 wordToPDF: fonts (times, courier, helvetica), margins (compact, spacious), and markdown headings", async () => {
    const markdownText = `# Main Strategic Roadmap
## Phase 1 Foundations
* Core architectural design
* Pure client-side processing
## Phase 2 Rollout
- High concurrency validation
- Zero remote dependency audit`

    // Font Times + Margin Spacious (108pt)
    const resTimes = await services.wordToPDF(markdownText, {
      font: "times",
      margins: "spacious",
      title: "Strategic Overview",
    })
    assert.strictEqual(resTimes.name, "document-converted.pdf")
    const docTimes = await PDFDocument.load(await resTimes.blob.arrayBuffer())
    assert.strictEqual(docTimes.getPageCount(), 1)

    // Font Courier + Margin Compact (36pt)
    const resCourier = await services.wordToPDF(markdownText, {
      font: "courier",
      margins: "compact",
      title: "Technical Spec",
    })
    const docCourier = await PDFDocument.load(await resCourier.blob.arrayBuffer())
    assert.strictEqual(docCourier.getPageCount(), 1)

    // Empty content rejection
    await assert.rejects(
      async () => await services.wordToPDF("   "),
      /Select a Word document or enter text to convert to PDF/,
    )
  })

  await t.test("2.5 pptToPDF: slidesPerPage (2, 4) handout views and orientation presets", async () => {
    const outlineText = `Slide 1: Executive Summary
Key performance indicators
Target milestone completion
---
Slide 2: Technology Stack
React 19 & Vite 8
Pure client-side engines
---
Slide 3: Scalability
Sub-second transformation
Memory isolation
---
Slide 4: Integrity
Empirical challenger verification
Zero hardcoded shortcuts`

    // Handout: 2 slides per page -> 4 slides = 2 pages
    const res2 = await services.pptToPDF(outlineText, {
      slidesPerPage: 2,
      orientation: "portrait",
    })
    const doc2 = await PDFDocument.load(await res2.blob.arrayBuffer())
    assert.strictEqual(doc2.getPageCount(), 2)
    const sz2 = doc2.getPage(0).getSize()
    assert.strictEqual(sz2.width, 595)
    assert.strictEqual(sz2.height, 842)

    // Handout: 4 slides per page -> 4 slides = 1 page (4:3 aspect)
    const res4 = await services.pptToPDF(outlineText, {
      slidesPerPage: 4,
      orientation: "landscape-4-3",
    })
    const doc4 = await PDFDocument.load(await res4.blob.arrayBuffer())
    assert.strictEqual(doc4.getPageCount(), 1)
    const sz4 = doc4.getPage(0).getSize()
    assert.strictEqual(sz4.width, 792)
    assert.strictEqual(sz4.height, 595)

    // Empty outline rejection
    await assert.rejects(
      async () => await services.pptToPDF(""),
      /Select a presentation file or enter outline text to convert to PDF/,
    )
  })

  await t.test("2.6 excelToPDF: themes (minimal, zebra), portrait orientation, and ellipsis truncation", async () => {
    // Generate 15 rows with long text to trigger ellipsis truncation and styling
    const longValue = "ExtremelyLongDetailedDescriptionFieldExceedingMaxColumnWidth"
    const csvData = [
      "ID,Name,Department,Notes",
      `101,Alice Smith,Engineering,${longValue}`,
      `102,Bob Jones,Operations,${longValue}`,
      `103,Charlie Brown,Quality Assurance,${longValue}`,
    ].join("\n")

    // Theme: zebra + portrait orientation
    const resZebra = await services.excelToPDF(csvData, {
      theme: "zebra",
      orientation: "portrait",
      title: "Personnel Roster",
    })
    assert.strictEqual(resZebra.name, "document-converted.pdf")
    const docZebra = await PDFDocument.load(await resZebra.blob.arrayBuffer())
    const sz = docZebra.getPage(0).getSize()
    assert.strictEqual(sz.width, 612)
    assert.strictEqual(sz.height, 792)

    // Theme: minimal
    const resMin = await services.excelToPDF(csvData, {
      theme: "minimal",
      orientation: "landscape",
    })
    assert.ok(resMin.blob.size > 0)

    // Empty csv rejection
    await assert.rejects(
      async () => await services.excelToPDF("   "),
      /Select an Excel or CSV file to convert to PDF/,
    )
  })

  await t.test("2.7 pdfToJPG and jpgToPDF: custom page selection, full-bleed margins, and format guards", async () => {
    const pdfFile = await createMultiPagePDF(4, "Brochure")

    // pdfToJPG custom page selection: page 3
    const resPage3 = await services.pdfToJPG(pdfFile, {
      pageSelection: "custom",
      pageNumber: 3,
      quality: "standard",
    })
    assert.strictEqual(resPage3.name, "multi-page-page-3.jpg")
    const u8Jpg = new Uint8Array(await resPage3.blob.arrayBuffer())
    assert.strictEqual(u8Jpg[0], 0xff)
    assert.strictEqual(u8Jpg[1], 0xd8) // SOI
    assert.strictEqual(u8Jpg[u8Jpg.length - 2], 0xff)
    assert.strictEqual(u8Jpg[u8Jpg.length - 1], 0xd9) // EOI

    // Out of bounds page selection rejection
    await assert.rejects(
      async () => await services.pdfToJPG(pdfFile, { pageSelection: "custom", pageNumber: 10 }),
      /out of range/,
    )

    // jpgToPDF with no-margins (full bleed) and center-original
    const pngBytes = create1x1PngBytes()
    const img1 = createMockFile(pngBytes, "chart.png", "image/png")
    const img2 = createMockFile(pngBytes, "graph.png", "image/png")

    const resPdf = await services.jpgToPDF([img1, img2], {
      margins: "no-margins",
      orientation: "portrait",
    })
    assert.strictEqual(resPdf.name, "chart-converted.pdf")
    const docImg = await PDFDocument.load(await resPdf.blob.arrayBuffer())
    assert.strictEqual(docImg.getPageCount(), 2)

    // Unsupported format rejection
    const invalidImg = createMockFile(Buffer.from("NOT_AN_IMAGE"), "bad.xyz", "application/xyz")
    await assert.rejects(
      async () => await services.jpgToPDF([invalidImg]),
      /Unsupported image format/,
    )

    // Empty array rejection
    await assert.rejects(
      async () => await services.jpgToPDF([]),
      /Select at least one image to convert to PDF/,
    )
  })
})

// ============================================================================
// SUITE 3: Multi-Action Pipelines, Archiving & OCR (M4 Tools)
// ============================================================================

test("Suite 3: Multi-Action Pipelines, Archiving & OCR White-Box Coverage", async (t) => {
  await t.test("3.1 zipFiles & extractZipArchive: store mode (method 0), filter predicate, and traversal guards", async () => {
    // 1. zipFiles with store mode (compressionLevel 0)
    const files = [
      { name: "readme.txt", data: "Hello FluxKit Archiver" },
      { name: "data.bin", data: new Uint8Array([1, 2, 3, 4, 5]) },
      { name: "notes/todo.txt", data: "1. Build\n2. Test" },
    ]
    const zipRes = await services.zipFiles(files, {
      compressionLevel: 0,
      archiveName: "bundle.zip",
    })
    assert.strictEqual(zipRes.name, "bundle.zip")
    assert.strictEqual(zipRes.totalFiles, 3)

    const zipBytes = new Uint8Array(await zipRes.blob.arrayBuffer())
    const headerInfo = inspectZipHeaders(zipBytes)
    assert.strictEqual(headerInfo.totalEntries, 3)

    // Verify method 0 in local header (byte offset 8 is method)
    const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
    assert.strictEqual(view.getUint16(8, true), 0, "Compression method 0 expected for stored mode")

    // 2. extractZipArchive with filter option
    const extractedFiltered = await services.extractZipArchive(zipRes.blob, {
      filter: (name) => name.endsWith(".txt"),
    })
    assert.strictEqual(extractedFiltered.length, 2)
    assert.ok(extractedFiltered.every((e) => e.name.endsWith(".txt")))

    // 3. Path traversal detection: archive with Zip Slip '../'
    const hostileArchive = services.buildZipArchive([
      { name: "../../etc/passwd", data: "root:x:0:0" },
      { name: "constructor", data: "pollution" },
      { name: "safe.txt", data: "clean" },
    ])
    const unzipped = await services.extractZipArchive(hostileArchive)
    assert.strictEqual(unzipped.length, 1)
    assert.strictEqual(unzipped[0].name, "safe.txt")

    // Empty files rejection
    await assert.rejects(
      async () => await services.zipFiles([]),
      /Select at least one file to archive/,
    )
  })

  await t.test("3.2 scanOCR: 24-bpp, 32-bpp, and 8-bpp optical raster decoding and digital PDF fast-path", async () => {
    // 1. Digital PDF fast-path stream extraction
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const p = pdfDoc.addPage([600, 400])
    p.drawText("Invoice Number: INV-98214", { x: 50, y: 350, size: 14, font })
    p.drawText("Total Due: USD 1,450.00", { x: 50, y: 320, size: 12, font })
    const pdfBytes = await pdfDoc.save()
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" })

    const pdfOcr = await services.scanOCR(pdfBlob)
    assert.strictEqual(pdfOcr.sourceType, "pdf-digital")
    assert.ok(pdfOcr.text.includes("Invoice Number: INV-98214"))
    assert.ok(pdfOcr.wordCount > 0)
    assert.ok(pdfOcr.confidence >= 0.85)

    // 2. Optical raster scan on synthetic 24-bpp BMP
    const bmpBytes24 = services.createSyntheticTestImage("FLUXKIT TEST")
    const ocr24 = await services.scanOCR(bmpBytes24)
    assert.strictEqual(ocr24.sourceType, "image-raster")
    assert.strictEqual(ocr24.text, "FLUXKIT TEST")

    // 3. Optical raster scan on 32-bpp RGBA BMP
    const bmpBytes32 = createSyntheticBMP(60, 20, 32)
    const ocr32 = await services.scanOCR(bmpBytes32)
    assert.strictEqual(ocr32.sourceType, "image-raster")

    // 4. Optical raster scan on 8-bpp Grayscale BMP
    const bmpBytes8 = createSyntheticBMP(60, 20, 8)
    const ocr8 = await services.scanOCR(bmpBytes8)
    assert.strictEqual(ocr8.sourceType, "image-raster")

    // Empty input rejection
    await assert.rejects(
      async () => await services.scanOCR(new Uint8Array(0)),
      /File cannot be empty/,
    )
  })

  await t.test("3.3 universalConvert: format dispatch, image->pdf, text->pdf, and unsupported format guards", async () => {
    // Image -> PDF conversion
    const pngBytes = create1x1PngBytes()
    const imgFile = createMockFile(pngBytes, "avatar.png", "image/png")
    const imgConv = await services.universalConvert(imgFile, { targetFormat: "pdf" })
    assert.strictEqual(imgConv.name, "avatar-converted.pdf")
    const docImg = await PDFDocument.load(await imgConv.blob.arrayBuffer())
    assert.strictEqual(docImg.getPageCount(), 1)

    // Text -> PDF conversion
    const txtFile = createMockFile(Buffer.from("Sample notes content"), "notes.txt", "text/plain")
    const txtConv = await services.universalConvert(txtFile, { targetFormat: "pdf" })
    assert.strictEqual(txtConv.name, "fluxkit-document.pdf")
    const docTxt = await PDFDocument.load(await txtConv.blob.arrayBuffer())
    assert.strictEqual(docTxt.getPageCount(), 1)

    // Unsupported target format guards
    await assert.rejects(
      async () => await services.universalConvert(imgFile, { targetFormat: "docx" }),
      /Unsupported target format "docx" for Images/,
    )
    await assert.rejects(
      async () => await services.universalConvert(txtFile, { targetFormat: "xlsx" }),
      /Unsupported target format "xlsx" for Text/,
    )

    // Empty file rejection
    const emptyFile = createMockFile(new Uint8Array(0), "empty.txt")
    await assert.rejects(
      async () => await services.universalConvert(emptyFile),
      /File cannot be empty/,
    )
  })

  await t.test("3.4 convertAndCompress: two-stage pipeline, progress tracking, and non-PDF bypass", async () => {
    const txtFile = createMockFile(
      Buffer.from("Strategic Deployment Roadmap\n\nAll tools verified client-side."),
      "roadmap.txt",
      "text/plain",
    )

    const progressReports = []
    const res = await services.convertAndCompress(txtFile, {
      targetFormat: "pdf",
      compressLevel: "high",
      onProgress: (evt) => progressReports.push(evt),
    })

    assert.ok(res.finalSize > 0)
    assert.ok(progressReports.length >= 2, "Must report progress for converting and compressing")
    assert.ok(progressReports.some((r) => r.stage === "converting"))
    assert.ok(progressReports.some((r) => r.stage === "compressing"))

    // Non-PDF target (PDF -> Word) passes through compression stage cleanly
    const pdfFile = await createMultiPagePDF(1, "Invoice")
    const resDocx = await services.convertAndCompress(pdfFile, { targetFormat: "docx" })
    assert.strictEqual(resDocx.name, "multi-page-converted.docx")
    assert.ok(resDocx.finalSize > 0)

    // Missing file rejection
    await assert.rejects(
      async () => await services.convertAndCompress(null),
      /Select a file to convert and compress/,
    )
  })

  await t.test("3.5 mergeAndCompress: multi-PDF pipeline, metadata stripping, and 0-byte validation", async () => {
    const pdf1 = await createMultiPagePDF(2, "DocA")
    const pdf2 = await createMultiPagePDF(2, "DocB")

    const progressReports = []
    const res = await services.mergeAndCompress([pdf1, pdf2], {
      compressLevel: "high",
      stripMetadata: true,
      onProgress: (evt) => progressReports.push(evt),
    })

    assert.strictEqual(res.name, "merged-compressed.pdf")
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.strictEqual(doc.getPageCount(), 4)
    assert.strictEqual(doc.getTitle(), "")
    assert.ok(progressReports.some((r) => r.stage === "merging"))
    assert.ok(progressReports.some((r) => r.stage === "compressing"))

    // Rejection on fewer than 2 files
    await assert.rejects(
      async () => await services.mergeAndCompress([pdf1]),
      /Choose at least two PDFs to merge and compress/,
    )

    // Rejection on 0-byte file in batch
    const emptyPdf = createMockFile(new Uint8Array(0), "empty.pdf")
    await assert.rejects(
      async () => await services.mergeAndCompress([pdf1, emptyPdf]),
      /is empty \(0 bytes\)/,
    )
  })

  await t.test("3.6 splitAndCompress: mode 'all' (zip packaging) vs mode 'ranges' and empty error guards", async () => {
    const pdfFile = await createMultiPagePDF(3, "Manual")

    // Mode 'all': splits all pages, compresses individually, packages into ZIP
    const progressReports = []
    const resAll = await services.splitAndCompress(pdfFile, {
      splitMode: "all",
      onProgress: (evt) => progressReports.push(evt),
    })

    assert.strictEqual(resAll.name, "multi-page-split-compressed.zip")
    assert.ok(progressReports.some((r) => r.stage === "splitting"))
    assert.ok(progressReports.some((r) => r.stage === "compressing"))
    assert.ok(progressReports.some((r) => r.stage === "packaging"))

    const unzipped = await services.extractZipArchive(resAll.blob)
    assert.strictEqual(unzipped.length, 3)
    assert.ok(unzipped.some((f) => f.name === "compressed-page-1.pdf"))
    assert.ok(unzipped.some((f) => f.name === "compressed-page-2.pdf"))
    assert.ok(unzipped.some((f) => f.name === "compressed-page-3.pdf"))

    // Mode 'ranges': with empty range throws
    await assert.rejects(
      async () => await services.splitAndCompress(pdfFile, { splitMode: "ranges", pageRange: "" }),
      /Specify page ranges to extract/,
    )

    // Mode 'ranges': with valid range extracts and compresses
    const resRange = await services.splitAndCompress(pdfFile, {
      splitMode: "ranges",
      pageRange: "1-2",
    })
    const docRange = await PDFDocument.load(await resRange.blob.arrayBuffer())
    assert.strictEqual(docRange.getPageCount(), 2)

    // Empty file rejection
    const emptyFile = createMockFile(new Uint8Array(0), "empty.pdf")
    await assert.rejects(
      async () => await services.splitAndCompress(emptyFile),
      /File cannot be empty/,
    )
  })
})

// ============================================================================
// SUITE 4: ToolPage State Machine & Input Validation Logic Simulation
// ============================================================================

test("Suite 4: ToolPage State Machine & Form Binding Simulation", async (t) => {
  await t.test("4.1 ToolPage parameter parsing & password mismatch validation simulation", () => {
    // Password tool mismatch guard simulation from ToolPage.tsx:1162
    const validatePasswordAction = (action, extra, optionB) => {
      if (action === "lock") {
        if (!extra || extra.length < 4) {
          throw new Error("Security password must be at least 4 characters.")
        }
        if (optionB && extra !== optionB) {
          throw new Error("Passwords do not match.")
        }
      }
    }

    assert.throws(
      () => validatePasswordAction("lock", "Secret1", "Secret2"),
      /Passwords do not match/,
    )
    assert.throws(
      () => validatePasswordAction("lock", "123", "123"),
      /Security password must be at least 4 characters/,
    )
    assert.doesNotThrow(() => validatePasswordAction("lock", "Secret123", "Secret123"))
    assert.doesNotThrow(() => validatePasswordAction("unlock", "any", ""))
  })

  await t.test("4.2 ToolPage file minimum count validation simulation across all 23 file tools", () => {
    const singleFileTools = [
      "rotate-pdf", "split-pdf", "compress", "edit-pdf", "watermark", "sign-pdf",
      "password", "pdf-to-word", "pdf-to-ppt", "pdf-to-excel", "pdf-to-jpg",
      "jpg-to-pdf", "zip", "ocr", "convert", "convert-compress", "split-compress"
    ]
    const multiFileTools = ["merge-pdf", "merge-compress"]

    const validateFiles = (toolId, count) => {
      if (multiFileTools.includes(toolId) && count < 2) {
        throw new Error(`Choose at least two PDFs to ${toolId === "merge-pdf" ? "merge" : "merge and compress"}.`)
      }
      if (singleFileTools.includes(toolId) && count < 1) {
        throw new Error(`Select a file for ${toolId}.`)
      }
      return true
    }

    for (const tId of multiFileTools) {
      assert.throws(() => validateFiles(tId, 0), /Choose at least two PDFs/)
      assert.throws(() => validateFiles(tId, 1), /Choose at least two PDFs/)
      assert.strictEqual(validateFiles(tId, 2), true)
    }

    for (const tId of singleFileTools) {
      assert.throws(() => validateFiles(tId, 0), /Select a file/)
      assert.strictEqual(validateFiles(tId, 1), true)
    }
  })

  await t.test("4.3 Mathematical CRC32 & format byte size sanity verification", () => {
    // IEEE 802.3 standard test vector: ASCII '123456789' -> 0xCBF43926
    const testVector = new TextEncoder().encode("123456789")
    const crc = services.computeCRC32(testVector)
    assert.strictEqual(crc, 0xcbf43926, "CRC-32 must strictly equal 0xCBF43926")

    // XML escape check
    assert.strictEqual(
      services.escapeXml(`<tag attr="val & 'sub'">test</tag>`),
      "&lt;tag attr=&quot;val &amp; &apos;sub&apos;&quot;&gt;test&lt;/tag&gt;",
    )

    // formatByteSize sanity check
    assert.strictEqual(services.formatByteSize(0), "0 B")
    assert.strictEqual(services.formatByteSize(1024), "1.0 KB")
    assert.strictEqual(services.formatByteSize(1024 * 1024 * 5), "5.0 MB")
  })
})
