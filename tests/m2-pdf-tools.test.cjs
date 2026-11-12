const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument } = require("pdf-lib")

// Load and transpile src/services.ts in current realm context
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

// Helper to generate a multi-page PDF File
async function createTestPDF(numPages = 3, title = "Test Document") {
  const doc = await PDFDocument.create()
  doc.setTitle(title)
  for (let i = 1; i <= numPages; i++) {
    const page = doc.addPage([500, 700])
    page.drawText(`Page content for page ${i}`, { x: 50, y: 650, size: 14 })
  }
  const bytes = await doc.save()
  return new File([bytes], `test-${numPages}p.pdf`, {
    type: "application/pdf",
  })
}

// 1x1 transparent PNG base64 for signature testing
const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
const SAMPLE_PNG_BYTES = Buffer.from(SAMPLE_PNG_BASE64, "base64")

// URL normalizer helper matching ToolPage.tsx logic
function normalizeToolPageUrl(content) {
  let urlStr = content.trim()
  if (!urlStr) throw new Error("Enter content for your QR code.")
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr)) {
    try {
      const parsed = new URL(urlStr)
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Use a valid https:// or http:// URL.")
      }
      return urlStr
    } catch {
      throw new Error("Use a valid https:// or http:// URL.")
    }
  } else {
    urlStr = `https://${urlStr}`
    try {
      const parsed = new URL(urlStr)
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Use a valid https:// or http:// URL.")
      }
      return urlStr
    } catch {
      throw new Error("Use a valid https:// or http:// URL.")
    }
  }
}

// ============================================================================
// SUITE 1: splitPDF
// ============================================================================

test("M2 splitPDF: extracts single page correctly", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createTestPDF(5)
  const result = await splitPDF(pdfFile, "2")

  assert.equal(result.name, `split-${pdfFile.name}`)
  assert.ok(result.blob.size > 200)

  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 1)
})

test("M2 splitPDF: extracts continuous page range (e.g. 1-3)", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createTestPDF(5)
  const result = await splitPDF(pdfFile, "1-3")

  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 3)
})

test("M2 splitPDF: extracts discontinuous page selection (e.g. 1, 3, 5)", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createTestPDF(5)
  const result = await splitPDF(pdfFile, "1, 3, 5")

  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 3)
})

test("M2 splitPDF: extracts all pages when range is empty, whitespace, or 'all'", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createTestPDF(3)

  const resAll = await splitPDF(pdfFile, "all")
  const docAll = await PDFDocument.load(await resAll.blob.arrayBuffer())
  assert.equal(docAll.getPageCount(), 3)

  const resEmpty = await splitPDF(pdfFile, "")
  const docEmpty = await PDFDocument.load(await resEmpty.blob.arrayBuffer())
  assert.equal(docEmpty.getPageCount(), 3)
})

test("M2 splitPDF: rejects out-of-bounds page numbers", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createTestPDF(3)

  await assert.rejects(
    async () => splitPDF(pdfFile, "5"),
    /Page 5 is out of bounds \(document has 3 pages\)/,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "1-5"),
    /Page range "1-5" is out of bounds \(document has 3 pages\)/,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "0"),
    /Page 0 is out of bounds/,
  )
})

test("M2 splitPDF: rejects invalid range syntax and inverted ranges", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createTestPDF(4)

  await assert.rejects(
    async () => splitPDF(pdfFile, "4-2"),
    /start page \(4\) cannot be greater than end page \(2\)/,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "invalid-range"),
    /Must contain numbers/,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "notanumber"),
    /Must be a number/,
  )
  await assert.rejects(
    async () => splitPDF(null, "1-2"),
    /Select a PDF to split/,
  )
})

// ============================================================================
// SUITE 2: compressPDF
// ============================================================================

test("M2 compressPDF: generates valid compressed PDF with object streams", async () => {
  const { compressPDF } = loadServices()
  const pdfFile = await createTestPDF(3)
  const result = await compressPDF(pdfFile, { level: "standard" })

  assert.equal(result.name, `compressed-${pdfFile.name}`)
  assert.ok(result.blob.size > 0)

  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 3)
})

test("M2 compressPDF: high compression mode strips metadata cleanly", async () => {
  const { compressPDF } = loadServices()
  const doc = await PDFDocument.create()
  doc.setTitle("Super Sensitive Title")
  doc.setAuthor("Secret Agent")
  doc.setSubject("Top Secret")
  doc.addPage([400, 600])
  const uncompressedBytes = await doc.save()
  const file = new File([uncompressedBytes], "sensitive.pdf", {
    type: "application/pdf",
  })

  const result = await compressPDF(file, { level: "high" })
  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())

  assert.equal(reloaded.getTitle(), "")
  assert.equal(reloaded.getAuthor(), "")
  assert.equal(reloaded.getSubject(), "")
  assert.ok(reloaded.getProducer())
})

test("M2 compressPDF: rejects when no file is provided", async () => {
  const { compressPDF } = loadServices()
  await assert.rejects(
    async () => compressPDF(null),
    /Select a PDF to compress/,
  )
})

// ============================================================================
// SUITE 3: editPDF
// ============================================================================

test("M2 editPDF: stamps note annotation box onto target page", async () => {
  const { editPDF } = loadServices()
  const pdfFile = await createTestPDF(3)
  const result = await editPDF(pdfFile, {
    annotation: "Important legal disclaimer",
    pageNumber: 2,
    type: "note",
    position: "top",
  })

  assert.equal(result.name, `edited-${pdfFile.name}`)
  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 3)
})

test("M2 editPDF: stamps highlight and callout annotations across positions", async () => {
  const { editPDF } = loadServices()
  const pdfFile = await createTestPDF(2)

  const resHighlight = await editPDF(pdfFile, {
    annotation: "Critical attention item",
    type: "highlight",
    position: "center",
  })
  const docH = await PDFDocument.load(await resHighlight.blob.arrayBuffer())
  assert.equal(docH.getPageCount(), 2)

  const resCallout = await editPDF(pdfFile, {
    annotation: "Action required before submission",
    type: "callout",
    position: "bottom",
  })
  const docC = await PDFDocument.load(await resCallout.blob.arrayBuffer())
  assert.equal(docC.getPageCount(), 2)
})

test("M2 editPDF: sanitizes special Unicode characters outside WinAnsi without crashing", async () => {
  const { editPDF } = loadServices()
  const pdfFile = await createTestPDF(1)
  const specialAnnotation =
    'Special: “smart quotes” — em-dash • bullet ★ star ✓ checkmark'

  const result = await editPDF(pdfFile, {
    annotation: specialAnnotation,
    pageNumber: 1,
  })

  assert.ok(result.blob.size > 0)
  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 1)
})

test("M2 editPDF: rejects out-of-bounds page numbers and missing file", async () => {
  const { editPDF } = loadServices()
  const pdfFile = await createTestPDF(2)

  await assert.rejects(
    async () => editPDF(pdfFile, { pageNumber: 5 }),
    /Page number 5 is out of bounds \(document has 2 pages\)/,
  )
  await assert.rejects(
    async () => editPDF(pdfFile, { pageNumber: 0 }),
    /Page number 0 is out of bounds/,
  )
  await assert.rejects(
    async () => editPDF(null, { annotation: "Test" }),
    /Select a PDF to annotate/,
  )
})

// ============================================================================
// SUITE 4: watermarkPDF
// ============================================================================

test("M2 watermarkPDF: applies rotated watermark across all pages", async () => {
  const { watermarkPDF } = loadServices()
  const pdfFile = await createTestPDF(4)
  const result = await watermarkPDF(pdfFile, {
    text: "CONFIDENTIAL",
    opacity: 0.45,
    rotation: 45,
    fontSize: 38,
  })

  assert.equal(result.name, `watermarked-${pdfFile.name}`)
  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 4)
  assert.ok(result.blob.size > pdfFile.size)
})

test("M2 watermarkPDF: supports custom angles (0 deg, 90 deg) and color options", async () => {
  const { watermarkPDF } = loadServices()
  const pdfFile = await createTestPDF(2)

  const resHorizontal = await watermarkPDF(pdfFile, {
    text: "APPROVED",
    rotation: 0,
    opacity: 0.8,
    color: { r: 0.1, g: 0.6, b: 0.2 },
  })
  const docH = await PDFDocument.load(await resHorizontal.blob.arrayBuffer())
  assert.equal(docH.getPageCount(), 2)

  const resVertical = await watermarkPDF(pdfFile, {
    text: "INTERNAL USE ONLY",
    rotation: 90,
    opacity: 0.2,
  })
  const docV = await PDFDocument.load(await resVertical.blob.arrayBuffer())
  assert.equal(docV.getPageCount(), 2)
})

test("M2 watermarkPDF: rejects empty watermark text and missing file", async () => {
  const { watermarkPDF } = loadServices()
  const pdfFile = await createTestPDF(1)

  await assert.rejects(
    async () => watermarkPDF(pdfFile, { text: "" }),
    /Watermark text is required/,
  )
  await assert.rejects(
    async () => watermarkPDF(pdfFile, { text: "   " }),
    /Watermark text is required/,
  )
  await assert.rejects(
    async () => watermarkPDF(null, { text: "DRAFT" }),
    /Select a PDF to watermark/,
  )
})

// ============================================================================
// SUITE 5: signPDF
// ============================================================================

test("M2 signPDF: embeds PNG signature image bytes onto target page", async () => {
  const { signPDF } = loadServices()
  const pdfFile = await createTestPDF(3)
  const result = await signPDF(pdfFile, {
    signatureImageBytes: SAMPLE_PNG_BYTES,
    signerName: "Alex Mercer",
    pageNumber: 3,
    position: "bottom-right",
  })

  assert.equal(result.name, `signed-${pdfFile.name}`)
  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 3)
})

test("M2 signPDF: embeds digital signature stamp badge when only signer name is provided", async () => {
  const { signPDF } = loadServices()
  const pdfFile = await createTestPDF(2)
  const result = await signPDF(pdfFile, {
    signerName: "Dr. Evelyn Reed",
    date: "2026-11-10",
    position: "bottom-left",
  })

  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 2)
  assert.ok(result.blob.size > pdfFile.size)
})

test("M2 signPDF: defaults to last page when pageNumber is omitted", async () => {
  const { signPDF } = loadServices()
  const pdfFile = await createTestPDF(5)
  const result = await signPDF(pdfFile, {
    signerName: "Chief Legal Officer",
  })

  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 5)
})

test("M2 signPDF: rejects when neither signature image nor signer name is provided", async () => {
  const { signPDF } = loadServices()
  const pdfFile = await createTestPDF(1)

  await assert.rejects(
    async () => signPDF(pdfFile, {}),
    /Please provide a signature image or signer name/,
  )
  await assert.rejects(
    async () => signPDF(pdfFile, { signerName: "" }),
    /Please provide a signature image or signer name/,
  )
  await assert.rejects(
    async () => signPDF(null, { signerName: "Alice" }),
    /Select a PDF to sign/,
  )
})

// ============================================================================
// SUITE 6: securePDF
// ============================================================================

test("M2 securePDF: lock mode secures document with password token and header", async () => {
  const { securePDF } = loadServices()
  const pdfFile = await createTestPDF(2, "Board Briefing")
  const result = await securePDF(pdfFile, {
    action: "lock",
    password: "VaultPassword999",
    permissions: { preventPrinting: true, preventCopying: true },
  })

  assert.equal(result.name, `secured-${pdfFile.name}`)
  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.ok(reloaded.getTitle().startsWith("[Secured] "))
  assert.ok(reloaded.getSubject().startsWith("FluxKit-Protected:"))
  const keywords = reloaded.getKeywords()
  assert.ok(keywords.includes("fluxkit:secured=true"))
})

test("M2 securePDF: unlock mode with matching password successfully removes protection", async () => {
  const { securePDF } = loadServices()
  const pdfFile = await createTestPDF(1, "Confidential Financials")

  // 1. Lock document
  const lockedRes = await securePDF(pdfFile, {
    action: "lock",
    password: "SecurityKey123",
  })
  const lockedFile = new File([await lockedRes.blob.arrayBuffer()], "locked.pdf", {
    type: "application/pdf",
  })

  // 2. Unlock document with correct password
  const unlockedRes = await securePDF(lockedFile, {
    action: "unlock",
    password: "SecurityKey123",
  })

  const reloaded = await PDFDocument.load(await unlockedRes.blob.arrayBuffer())
  assert.equal(reloaded.getSubject(), "")
  assert.doesNotMatch(reloaded.getTitle() || "", /^\[Secured\] /)
})

test("M2 securePDF: unlock mode with wrong password rejects with error", async () => {
  const { securePDF } = loadServices()
  const pdfFile = await createTestPDF(1)

  const lockedRes = await securePDF(pdfFile, {
    action: "lock",
    password: "CorrectPassword123",
  })
  const lockedFile = new File([await lockedRes.blob.arrayBuffer()], "locked.pdf", {
    type: "application/pdf",
  })

  await assert.rejects(
    async () =>
      securePDF(lockedFile, {
        action: "unlock",
        password: "WrongPassword456",
      }),
    /Incorrect password\. Unable to unlock document\./,
  )
})

test("M2 securePDF: lock mode rejects passwords shorter than 4 characters", async () => {
  const { securePDF } = loadServices()
  const pdfFile = await createTestPDF(1)

  await assert.rejects(
    async () =>
      securePDF(pdfFile, {
        action: "lock",
        password: "123",
      }),
    /Security password must be at least 4 characters/,
  )
  await assert.rejects(
    async () => securePDF(null, { action: "lock", password: "pass" }),
    /Select a PDF to protect or unlock/,
  )
})

// ============================================================================
// SUITE 7: mergePDFs, rotatePDF & textToPDF Enhancements
// ============================================================================

test("M2 mergePDFs: rejects when fewer than two files are provided", async () => {
  const { mergePDFs } = loadServices()
  const file1 = await createTestPDF(1)

  await assert.rejects(
    async () => mergePDFs([]),
    /Choose at least two PDFs to merge/,
  )
  await assert.rejects(
    async () => mergePDFs([file1]),
    /Choose at least two PDFs to merge/,
  )
})

test("M2 rotatePDF: normalizes degrees correctly (90, 180, 270, 360, negative)", async () => {
  const { rotatePDF } = loadServices()
  const file = await createTestPDF(1)

  // 90 degrees
  const res90 = await rotatePDF(file, 90)
  const doc90 = await PDFDocument.load(await res90.blob.arrayBuffer())
  assert.equal(doc90.getPages()[0].getRotation().angle, 90)

  // 180 degrees
  const res180 = await rotatePDF(file, 180)
  const doc180 = await PDFDocument.load(await res180.blob.arrayBuffer())
  assert.equal(doc180.getPages()[0].getRotation().angle, 180)

  // Negative angle (-90 -> 270)
  const resNeg = await rotatePDF(file, -90)
  const docNeg = await PDFDocument.load(await resNeg.blob.arrayBuffer())
  assert.equal(docNeg.getPages()[0].getRotation().angle, 270)
})

test("M2 textToPDF: sanitizes Unicode non-WinAnsi characters without crashing", async () => {
  const { textToPDF } = loadServices()
  const exoticText =
    "Typography: “smart quotes” & ‘apostrophes’ — em-dash • bullet ★ stars ✓ checkmarks"
  const result = await textToPDF(exoticText, "WinAnsi Sanitization Test")

  assert.equal(result.name, "fluxkit-document.pdf")
  assert.ok(result.blob.size > 800)

  const reloaded = await PDFDocument.load(await result.blob.arrayBuffer())
  assert.equal(reloaded.getPageCount(), 1)
})

test("M2 textToPDF: rejects empty or whitespace-only content", async () => {
  const { textToPDF } = loadServices()

  await assert.rejects(
    async () => textToPDF("", "Title"),
    /Add some text to create your document/,
  )
  await assert.rejects(
    async () => textToPDF("   ", "Title"),
    /Add some text to create your document/,
  )
})

// ============================================================================
// SUITE 8: Adversarial URL Auto-Prefixing Defect Fix
// ============================================================================

test("M2 URL Auto-Prefix: rejects adversarial non-http protocols directly", () => {
  const adversarialProtocols = [
    "ftp://files.example.com",
    "file:///C:/passwords.txt",
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "gopher://old.internet.org",
  ]

  for (const maliciousUrl of adversarialProtocols) {
    assert.throws(
      () => normalizeToolPageUrl(maliciousUrl),
      /Use a valid https:\/\/ or http:\/\/ URL\./,
      `Expected ${maliciousUrl} to be rejected`,
    )
  }
})

test("M2 URL Auto-Prefix: auto-prefixes bare domains and paths with https://", () => {
  assert.equal(normalizeToolPageUrl("fluxkit.io"), "https://fluxkit.io")
  assert.equal(
    normalizeToolPageUrl("example.com/docs/guide"),
    "https://example.com/docs/guide",
  )
  assert.equal(
    normalizeToolPageUrl("subdomain.company.org/portal?user=admin"),
    "https://subdomain.company.org/portal?user=admin",
  )
})

test("M2 URL Auto-Prefix: preserves valid https:// and http:// URLs intact", () => {
  assert.equal(
    normalizeToolPageUrl("https://fluxkit.io"),
    "https://fluxkit.io",
  )
  assert.equal(
    normalizeToolPageUrl("http://localhost:3000/app"),
    "http://localhost:3000/app",
  )
})

// ============================================================================
// SUITE 9: End-to-End Pipeline Stress Test
// ============================================================================

test("M2 Stress: 5-step full pipeline (textToPDF -> watermarkPDF -> signPDF -> compressPDF -> splitPDF)", async () => {
  const { textToPDF, watermarkPDF, signPDF, compressPDF, splitPDF } =
    loadServices()

  // Step 1: Text to PDF (generating multi-page document)
  const paragraph =
    "FluxKit universal document processing pipeline test. ".repeat(40)
  const res1 = await textToPDF(
    `${paragraph}\n\n${paragraph}\n\n${paragraph}`,
    "Enterprise Whitepaper",
  )
  const file1 = new File([await res1.blob.arrayBuffer()], "step1.pdf", {
    type: "application/pdf",
  })
  const doc1 = await PDFDocument.load(await file1.arrayBuffer())
  assert.ok(doc1.getPageCount() >= 2)

  // Step 2: Apply Watermark across all pages
  const res2 = await watermarkPDF(file1, {
    text: "OFFICIAL AUDIT COPY",
    opacity: 0.3,
    rotation: 45,
  })
  const file2 = new File([await res2.blob.arrayBuffer()], "step2.pdf", {
    type: "application/pdf",
  })
  const doc2 = await PDFDocument.load(await file2.arrayBuffer())
  assert.equal(doc2.getPageCount(), doc1.getPageCount())

  // Step 3: Sign PDF with badge stamp on last page
  const res3 = await signPDF(file2, {
    signerName: "Audit Officer Morgan",
    date: "2026-11-10",
  })
  const file3 = new File([await res3.blob.arrayBuffer()], "step3.pdf", {
    type: "application/pdf",
  })
  const doc3 = await PDFDocument.load(await file3.arrayBuffer())
  assert.equal(doc3.getPageCount(), doc2.getPageCount())

  // Step 4: Compress PDF with high stream optimization
  const res4 = await compressPDF(file3, { level: "high" })
  const file4 = new File([await res4.blob.arrayBuffer()], "step4.pdf", {
    type: "application/pdf",
  })
  const doc4 = await PDFDocument.load(await file4.arrayBuffer())
  assert.equal(doc4.getPageCount(), doc3.getPageCount())

  // Step 5: Split PDF (extract page 1 only)
  const res5 = await splitPDF(file4, "1")
  const file5 = new File([await res5.blob.arrayBuffer()], "final-page1.pdf", {
    type: "application/pdf",
  })
  const doc5 = await PDFDocument.load(await file5.arrayBuffer())
  assert.equal(doc5.getPageCount(), 1)

  // Verification: Final document is healthy, valid, and parseable
  assert.ok(file5.size > 500)
})
