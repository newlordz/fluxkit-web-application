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

// Generate multi-page PDF File fixture with customizable metadata and content
async function createEmpiricalPDF(options = {}) {
  const {
    numPages = 5,
    title = "Empirical Challenge Document",
    author = "FluxKit Adversary",
    subject = "Milestone 2 Stress Test",
    keywords = ["security", "stress", "pdf-lib", "fluxkit"],
  } = options

  const doc = await PDFDocument.create()
  doc.setTitle(title)
  doc.setAuthor(author)
  doc.setSubject(subject)
  doc.setKeywords(keywords)

  for (let i = 1; i <= numPages; i++) {
    const page = doc.addPage([600, 800])
    page.drawText(`Page ${i} content payload - ${"A".repeat(120)}`, {
      x: 40,
      y: 750,
      size: 11,
    })
    page.drawText(`Empirical marker for page index: ${i - 1}`, {
      x: 40,
      y: 720,
      size: 10,
    })
  }
  const bytes = await doc.save()
  return new File([bytes], `empirical-${numPages}p.pdf`, {
    type: "application/pdf",
  })
}

// Minimal 1x1 valid PNG
const VALID_1X1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
const VALID_1X1_PNG_BYTES = Buffer.from(VALID_1X1_PNG_BASE64, "base64")

// Minimal 8x8 valid PNG
const VALID_8X8_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg=="
const VALID_8X8_PNG_BYTES = Buffer.from(VALID_8X8_PNG_BASE64, "base64")

// Exact URL logic extracted from src/ToolPage.tsx lines 736-758
function evaluateToolPageUrl(content) {
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
// CHALLENGE 1: splitPDF Stress Harness
// ============================================================================

test("CHALLENGE: splitPDF boundary page ranges (first, last, full, single-point)", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 5 })

  // 1. Boundary: First page only ("1")
  const res1 = await splitPDF(pdfFile, "1")
  const doc1 = await PDFDocument.load(await res1.blob.arrayBuffer())
  assert.equal(doc1.getPageCount(), 1)

  // 2. Boundary: Last page only ("5")
  const res5 = await splitPDF(pdfFile, "5")
  const doc5 = await PDFDocument.load(await res5.blob.arrayBuffer())
  assert.equal(doc5.getPageCount(), 1)

  // 3. Boundary: Exact full range ("1-5")
  const resFull = await splitPDF(pdfFile, "1-5")
  const docFull = await PDFDocument.load(await resFull.blob.arrayBuffer())
  assert.equal(docFull.getPageCount(), 5)

  // 4. Boundary: Single point range ("3-3")
  const resPoint = await splitPDF(pdfFile, "3-3")
  const docPoint = await PDFDocument.load(await resPoint.blob.arrayBuffer())
  assert.equal(docPoint.getPageCount(), 1)

  // 5. Deduplication & overlap: "1, 1, 1-2, 2, 2-3"
  const resDedup = await splitPDF(pdfFile, "1, 1, 1-2, 2, 2-3")
  const docDedup = await PDFDocument.load(await resDedup.blob.arrayBuffer())
  assert.equal(docDedup.getPageCount(), 3)
})

test("CHALLENGE: splitPDF reverse ranges rejection", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 5 })

  const reverseRanges = ["5-1", "3-2", "4-2", "2-1"]
  for (const rng of reverseRanges) {
    await assert.rejects(
      async () => splitPDF(pdfFile, rng),
      (err) => {
        assert.match(err.message, /start page \(\d+\) cannot be greater than end page \(\d+\)/)
        return true
      },
      `Expected reverse range ${rng} to be rejected`,
    )
  }
})

test("CHALLENGE: splitPDF empty, whitespace, and case-insensitive 'all' ranges", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 4 })

  const allVariants = ["", "   ", "all", "ALL", "All", undefined]
  for (const variant of allVariants) {
    const res = await splitPDF(pdfFile, variant)
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(doc.getPageCount(), 4, `Variant "${variant}" must extract all 4 pages`)
  }
})

test("CHALLENGE: splitPDF malformed, non-numeric, and out-of-bounds inputs", async () => {
  const { splitPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 4 })

  // Out of bounds high
  await assert.rejects(
    async () => splitPDF(pdfFile, "5"),
    /Page 5 is out of bounds \(document has 4 pages\)/,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "2-6"),
    /Page range "2-6" is out of bounds \(document has 4 pages\)/,
  )

  // Out of bounds low
  await assert.rejects(
    async () => splitPDF(pdfFile, "0"),
    /Page 0 is out of bounds/,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "-1"),
    /Invalid page range: "-1"\. Must contain numbers\./,
  )

  // Malformed syntax
  await assert.rejects(
    async () => splitPDF(pdfFile, "abc"),
    /Invalid page number: "abc"\. Must be a number\./,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "1-abc"),
    /Invalid page range: "1-abc"\. Must contain numbers\./,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, "1-2-3"),
    /Invalid page range syntax: "1-2-3"/,
  )
  await assert.rejects(
    async () => splitPDF(pdfFile, " , , "),
    /Please specify valid page numbers or ranges to extract\./,
  )
})

// ============================================================================
// CHALLENGE 2: compressPDF Standard vs High Stream Savings
// ============================================================================

test("CHALLENGE: compressPDF standard vs high stream savings & metadata stripping", async () => {
  const { compressPDF } = loadServices()

  // Build a test PDF with metadata, multiple pages and content streams
  const originalFile = await createEmpiricalPDF({
    numPages: 6,
    title: "Large Metadata Document",
    author: "Original Author Full Name",
    subject: "Detailed Subject Line For Testing Stream Compression",
    keywords: ["compaction", "metadata", "streams", "payload", "fluxkit"],
  })
  const originalSize = originalFile.size

  // Standard compression
  const resStd = await compressPDF(originalFile, { level: "standard" })
  const stdDoc = await PDFDocument.load(await resStd.blob.arrayBuffer())
  const stdSize = resStd.blob.size

  // High compression
  const resHigh = await compressPDF(originalFile, { level: "high" })
  const highDoc = await PDFDocument.load(await resHigh.blob.arrayBuffer())
  const highSize = resHigh.blob.size

  // Assertions:
  // 1. Both outputs are valid PDFs with identical page count
  assert.equal(stdDoc.getPageCount(), 6)
  assert.equal(highDoc.getPageCount(), 6)

  // 2. High compression strips metadata
  assert.equal(highDoc.getTitle(), "")
  assert.equal(highDoc.getAuthor(), "")
  assert.equal(highDoc.getSubject(), "")
  assert.ok(!highDoc.getKeywords() || highDoc.getKeywords() === "")
  assert.ok(highDoc.getProducer())
  assert.equal(highDoc.getCreator(), "FluxKit")

  // 3. High compression size is less than or equal to standard compression size
  assert.ok(
    highSize <= stdSize,
    `High size (${highSize}) should be <= Standard size (${stdSize})`,
  )
  assert.ok(
    stdSize > 0 && highSize > 0,
    "Compressed outputs must contain valid non-zero byte payloads",
  )
})

// ============================================================================
// CHALLENGE 3: editPDF Unicode & Non-ASCII WinAnsi Crash Prevention
// ============================================================================

test("CHALLENGE: editPDF handles massive strings and hostile Unicode without WinAnsi crash", async () => {
  const { editPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 3 })

  // 1. Hostile Unicode payload with smart quotes, dashes, bullets, emojis, diacritics, CJK
  const hostileUnicode =
    "“Smart Quotes” & ‘Single Quotes’ — EmDash – EnDash… • Bullet ● Disc ○ Circle ✓ Check " +
    "Emojis: 🚀 🔥 🎉 💡 🤖 🏆 💻 🎨 📦 " +
    "Accents: café, naïve, résumé, façade, jalapeño " +
    "CJK & Cyrillic: 你好世界, Привет мир, 日本語"

  const resUnicode = await editPDF(pdfFile, {
    annotation: hostileUnicode,
    type: "note",
    pageNumber: 1,
    position: "top",
  })

  // Must not throw WinAnsi crash and must produce valid PDF
  assert.ok(resUnicode.blob.size > 500)
  const docUnicode = await PDFDocument.load(await resUnicode.blob.arrayBuffer())
  assert.equal(docUnicode.getPageCount(), 3)

  // 2. Massive length string stress (2,000 characters)
  const longText = "FluxKit Enterprise Annotation Stress Test. ".repeat(45)
  const resLong = await editPDF(pdfFile, {
    annotation: longText,
    type: "callout",
    pageNumber: 2,
    position: "center",
  })
  assert.ok(resLong.blob.size > 500)
  const docLong = await PDFDocument.load(await resLong.blob.arrayBuffer())
  assert.equal(docLong.getPageCount(), 3)

  // 3. Highlight annotation on bottom position
  const resHighlight = await editPDF(pdfFile, {
    annotation: "Highlighted bottom banner ✓ verified",
    type: "highlight",
    pageNumber: 3,
    position: "bottom",
  })
  assert.ok(resHighlight.blob.size > 500)
})

test("CHALLENGE: editPDF boundary page verification", async () => {
  const { editPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 2 })

  // Page 0 is out of bounds
  await assert.rejects(
    async () => editPDF(pdfFile, { pageNumber: 0 }),
    /Page number 0 is out of bounds \(document has 2 pages\)/,
  )

  // Page 3 is out of bounds on a 2-page document
  await assert.rejects(
    async () => editPDF(pdfFile, { pageNumber: 3 }),
    /Page number 3 is out of bounds \(document has 2 pages\)/,
  )
})

// ============================================================================
// CHALLENGE 4: watermarkPDF Rotation Angles and Opacity Clamping
// ============================================================================

test("CHALLENGE: watermarkPDF rotation angles (0, 45, 90, 180, 270) & extreme angles", async () => {
  const { watermarkPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 2 })

  const testAngles = [0, 45, 90, 180, 270, 360, -45, 720]
  for (const rotation of testAngles) {
    const res = await watermarkPDF(pdfFile, {
      text: `CONFIDENTIAL ${rotation}°`,
      rotation,
    })
    assert.ok(res.blob.size > 500)
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(doc.getPageCount(), 2, `Angle ${rotation}° must preserve all pages`)
  }
})

test("CHALLENGE: watermarkPDF opacity clamping (negative, standard, > 1.0)", async () => {
  const { watermarkPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 2 })

  // Negative opacity (should be clamped to min 0.05)
  const resMin = await watermarkPDF(pdfFile, {
    text: "Subtle Watermark",
    opacity: -0.5,
  })
  assert.ok(resMin.blob.size > 500)

  // Over-unity opacity (should be clamped to max 1.0)
  const resMax = await watermarkPDF(pdfFile, {
    text: "Opaque Watermark",
    opacity: 2.5,
  })
  assert.ok(resMax.blob.size > 500)

  // Empty string rejection
  await assert.rejects(
    async () => watermarkPDF(pdfFile, { text: "" }),
    /Watermark text is required\./,
  )
  await assert.rejects(
    async () => watermarkPDF(pdfFile, { text: "   " }),
    /Watermark text is required\./,
  )
})

// ============================================================================
// CHALLENGE 5: signPDF Real PNG Embedding and Typed Name Fallback
// ============================================================================

test("CHALLENGE: signPDF real PNG binary embedding and position permutations", async () => {
  const { signPDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 3 })

  // 1. Embed valid 8x8 PNG bytes at top-right on page 1
  const res1 = await signPDF(pdfFile, {
    signatureImageBytes: VALID_8X8_PNG_BYTES,
    signerName: "Chief Legal Officer",
    pageNumber: 1,
    position: "top-right",
  })
  assert.ok(res1.blob.size > 500)
  const doc1 = await PDFDocument.load(await res1.blob.arrayBuffer())
  assert.equal(doc1.getPageCount(), 3)

  // 2. Embed 1x1 PNG data URL at bottom-left on last page
  const res2 = await signPDF(pdfFile, {
    signatureImageBytes: `data:image/png;base64,${VALID_1X1_PNG_BASE64}`,
    position: "bottom-left",
  })
  assert.ok(res2.blob.size > 500)

  // 3. Typed name fallback with rich Unicode name
  const resTyped = await signPDF(pdfFile, {
    signerName: "Dr. María-José Nuñez-François “Lead” 🖋",
    date: "2026-11-10",
  })
  assert.ok(resTyped.blob.size > 500)
  const docTyped = await PDFDocument.load(await resTyped.blob.arrayBuffer())
  assert.equal(docTyped.getPageCount(), 3)

  // 4. Missing both image and name rejection
  await assert.rejects(
    async () => signPDF(pdfFile, {}),
    /Please provide a signature image or signer name\./,
  )
})

// ============================================================================
// CHALLENGE 6: securePDF Lock, Correct Unlock, and Wrong Unlock
// ============================================================================

test("CHALLENGE: securePDF lock, unlock with matching password, and wrong password rejection", async () => {
  const { securePDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({
    numPages: 2,
    title: "Financial Statement",
  })

  // 1. Password shorter than 4 chars rejected
  await assert.rejects(
    async () => securePDF(pdfFile, { action: "lock", password: "abc" }),
    /Security password must be at least 4 characters\./,
  )

  // 2. Lock with valid password
  const lockResult = await securePDF(pdfFile, {
    action: "lock",
    password: "VaultPassword#2026",
    permissions: {
      preventPrinting: true,
      preventCopying: true,
      preventModification: true,
    },
  })
  assert.ok(lockResult.blob.size > 500)

  const lockedDoc = await PDFDocument.load(await lockResult.blob.arrayBuffer())
  assert.ok(lockedDoc.getTitle().startsWith("[Secured] "))
  assert.ok(lockedDoc.getSubject().startsWith("FluxKit-Protected:"))
  const keywords = lockedDoc.getKeywords()
  assert.ok(keywords.includes("fluxkit:secured=true"))
  assert.ok(keywords.includes("preventPrinting=true"))

  // Create a File from the locked PDF bytes
  const lockedFile = new File(
    [await lockResult.blob.arrayBuffer()],
    "locked-doc.pdf",
    { type: "application/pdf" },
  )

  // 3. Unlock with INCORRECT password -> must reject
  await assert.rejects(
    async () =>
      securePDF(lockedFile, {
        action: "unlock",
        password: "WrongPassword999",
      }),
    /Incorrect password\. Unable to unlock document\./,
  )

  // 4. Unlock with CORRECT password -> must succeed
  const unlockResult = await securePDF(lockedFile, {
    action: "unlock",
    password: "VaultPassword#2026",
  })
  assert.ok(unlockResult.blob.size > 500)

  const unlockedDoc = await PDFDocument.load(
    await unlockResult.blob.arrayBuffer(),
  )
  assert.equal(unlockedDoc.getSubject(), "")
  assert.ok(!unlockedDoc.getKeywords() || unlockedDoc.getKeywords() === "")
  assert.equal(unlockedDoc.getTitle(), "Financial Statement")
})

// ============================================================================
// CHALLENGE 7: Adversarial URL Scheme Attacks
// ============================================================================

test("CHALLENGE: Adversarial URL Auto-Prefix strictly blocks dangerous schemes", () => {
  const dangerousUrls = [
    "ftp://malicious.org/download/trojan.exe",
    "FTP://SERVER.NET/RESOURCE",
    "file:///etc/passwd",
    "file://C:/Windows/System32/drivers/etc/hosts",
    "javascript:alert(document.domain)",
    "javascript://https://legit.com/%0Aalert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
    "vbscript:msgbox('pwned')",
    "gopher://gopher.floodgap.com/0/",
    "ldap://127.0.0.1:389/dc=corp",
    "blob:https://evil.com/4bf0be58-3958-450b-8d07-a3f2db7265be",
    "ws://evil-c2.com/socket",
    "wss://evil-c2.com/socket",
    "chrome://settings",
    "about:blank",
  ]

  for (const maliciousUrl of dangerousUrls) {
    assert.throws(
      () => evaluateToolPageUrl(maliciousUrl),
      /Use a valid https:\/\/ or http:\/\/ URL\./,
      `Expected dangerous scheme URL "${maliciousUrl}" to be rejected`,
    )
  }
})

test("CHALLENGE: Adversarial URL Auto-Prefix accepts legitimate URLs and auto-prefixes bare targets", () => {
  // 1. Valid URLs preserved
  assert.equal(
    evaluateToolPageUrl("https://example.com"),
    "https://example.com",
  )
  assert.equal(
    evaluateToolPageUrl("http://localhost:8443/preview"),
    "http://localhost:8443/preview",
  )
  assert.equal(
    evaluateToolPageUrl("https://fluxkit.io/tools/qr?lang=en#options"),
    "https://fluxkit.io/tools/qr?lang=en#options",
  )

  // 2. Bare domains and paths correctly prefixed with https://
  assert.equal(
    evaluateToolPageUrl("fluxkit.dev"),
    "https://fluxkit.dev",
  )
  assert.equal(
    evaluateToolPageUrl("www.google.com/search?q=pdf"),
    "https://www.google.com/search?q=pdf",
  )
  assert.equal(
    evaluateToolPageUrl("api.service.io/v1/endpoint"),
    "https://api.service.io/v1/endpoint",
  )

  // 3. Whitespace & empty inputs rejected
  assert.throws(
    () => evaluateToolPageUrl(""),
    /Enter content for your QR code\./,
  )
  assert.throws(
    () => evaluateToolPageUrl("   "),
    /Enter content for your QR code\./,
  )
})

// ============================================================================
// CHALLENGE 8: mergePDFs, rotatePDF, textToPDF Deep Stress
// ============================================================================

test("CHALLENGE: mergePDFs rejects single or empty inputs, accurately combines multi-PDFs", async () => {
  const { mergePDFs } = loadServices()
  const p1 = await createEmpiricalPDF({ numPages: 2, title: "Doc 1" })
  const p2 = await createEmpiricalPDF({ numPages: 3, title: "Doc 2" })
  const p3 = await createEmpiricalPDF({ numPages: 1, title: "Doc 3" })

  // Less than 2 files rejected
  await assert.rejects(
    async () => mergePDFs([]),
    /Choose at least two PDFs to merge\./,
  )
  await assert.rejects(
    async () => mergePDFs([p1]),
    /Choose at least two PDFs to merge\./,
  )

  // Merge 3 PDFs (2 + 3 + 1 = 6 pages)
  const mergedRes = await mergePDFs([p1, p2, p3])
  assert.equal(mergedRes.name, "merged-document.pdf")
  assert.ok(mergedRes.blob.size > 1000)

  const mergedDoc = await PDFDocument.load(await mergedRes.blob.arrayBuffer())
  assert.equal(mergedDoc.getPageCount(), 6)
})

test("CHALLENGE: rotatePDF handles negative angles and large multiples", async () => {
  const { rotatePDF } = loadServices()
  const pdfFile = await createEmpiricalPDF({ numPages: 2 })

  const rotationCases = [
    { input: -90, expected: 270 },
    { input: -180, expected: 180 },
    { input: -270, expected: 90 },
    { input: 360, expected: 0 },
    { input: 720, expected: 0 },
    { input: 450, expected: 90 },
  ]

  for (const { input, expected } of rotationCases) {
    const res = await rotatePDF(pdfFile, input)
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    const pageRot = doc.getPage(0).getRotation().angle
    assert.equal(pageRot, expected, `Rotation ${input}° should result in ${expected}°`)
  }

  // Missing file rejection
  await assert.rejects(
    async () => rotatePDF(null),
    /Choose at least one PDF to rotate\./,
  )
})

test("CHALLENGE: textToPDF pagination, unbroken words, and empty text rejection", async () => {
  const { textToPDF } = loadServices()

  // 1. Empty or whitespace rejected
  await assert.rejects(
    async () => textToPDF(""),
    /Add some text to create your document\./,
  )
  await assert.rejects(
    async () => textToPDF("   \n\t   "),
    /Add some text to create your document\./,
  )

  // 2. Unbroken 200-character word without spaces (must be chunked without throwing)
  const unbrokenWord = "Z".repeat(200)
  const resChunked = await textToPDF(unbrokenWord, "Unbroken Word Stress")
  assert.ok(resChunked.blob.size > 500)

  // 3. Multi-page document generation (150 paragraphs)
  const multiPageText = Array.from(
    { length: 150 },
    (_, i) => `Paragraph ${i + 1}: Line with symbols “smart quotes” and — em-dash.`,
  ).join("\n")
  const resMulti = await textToPDF(multiPageText, "Multi Page Report")
  const multiDoc = await PDFDocument.load(await resMulti.blob.arrayBuffer())
  assert.ok(multiDoc.getPageCount() > 2, "150 lines should produce multiple pages")
})

// ============================================================================
// CHALLENGE 9: Repeated Compression Idempotency
// ============================================================================

test("CHALLENGE: Repeated compressPDF iterations remain stable and valid", async () => {
  const { compressPDF } = loadServices()
  let currentFile = await createEmpiricalPDF({ numPages: 4 })

  for (let round = 1; round <= 3; round++) {
    const res = await compressPDF(currentFile, { level: "high" })
    assert.ok(res.blob.size > 200, `Round ${round} output must be non-empty`)
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(doc.getPageCount(), 4, `Round ${round} must preserve all 4 pages`)

    currentFile = new File(
      [await res.blob.arrayBuffer()],
      `compressed-round-${round}.pdf`,
      { type: "application/pdf" },
    )
  }
})

// ============================================================================
// CHALLENGE 10: sanitizeForWinAnsi Stress & Direct Glyphs
// ============================================================================

test("CHALLENGE: sanitizeForWinAnsi handles typographic and exotic Unicode glyphs", () => {
  const { sanitizeForWinAnsi } = loadServices()

  // Typography mappings
  assert.equal(sanitizeForWinAnsi("“quote”"), '"quote"')
  assert.equal(sanitizeForWinAnsi("‘quote’"), "'quote'")
  assert.equal(sanitizeForWinAnsi("A—B–C…"), "A--B-C...")
  assert.equal(sanitizeForWinAnsi("• list ● disc ○ circ"), "* list * disc * circ")
  assert.equal(sanitizeForWinAnsi("✓ pass ✔ done"), "[x] pass [x] done")

  // Emojis replaced with '?'
  const emojiStr = "Fast 🚀 Fire 🔥 Rocket"
  const sanitized = sanitizeForWinAnsi(emojiStr)
  assert.ok(!sanitized.includes("🚀"))
  assert.ok(!sanitized.includes("🔥"))
  assert.ok(sanitized.includes("Fast"))
  assert.ok(sanitized.includes("Rocket"))

  // Empty string handling
  assert.equal(sanitizeForWinAnsi(""), "")
  assert.equal(sanitizeForWinAnsi(null), "")
  assert.equal(sanitizeForWinAnsi(undefined), "")
})

// ============================================================================
// CHALLENGE 11: Full End-to-End Adversarial Pipeline
// ============================================================================

test("CHALLENGE: Full 7-stage PDF toolchain round-trip pipeline", async () => {
  const {
    textToPDF,
    watermarkPDF,
    signPDF,
    securePDF,
    splitPDF,
    compressPDF,
    rotatePDF,
  } = loadServices()

  // Stage 1: textToPDF with typographic characters
  const stage1 = await textToPDF(
    "Contract Document\nClient: ACME Corp.\nTerms: “Strictly Confidential” — Do not distribute • Priority 1.",
    "Master Agreement",
  )
  let currentFile = new File([await stage1.blob.arrayBuffer()], "stage1.pdf", {
    type: "application/pdf",
  })

  // Stage 2: watermarkPDF with 45° angle
  const stage2 = await watermarkPDF(currentFile, {
    text: "RESTRICTED",
    rotation: 45,
    opacity: 0.25,
  })
  currentFile = new File([await stage2.blob.arrayBuffer()], "stage2.pdf", {
    type: "application/pdf",
  })

  // Stage 3: signPDF with typed name fallback
  const stage3 = await signPDF(currentFile, {
    signerName: "Chief Executive Officer",
    position: "bottom-right",
  })
  currentFile = new File([await stage3.blob.arrayBuffer()], "stage3.pdf", {
    type: "application/pdf",
  })

  // Stage 4: securePDF lock with password
  const stage4 = await securePDF(currentFile, {
    action: "lock",
    password: "PipelinePass@2026",
  })
  currentFile = new File([await stage4.blob.arrayBuffer()], "stage4.pdf", {
    type: "application/pdf",
  })

  // Stage 5: securePDF unlock with correct password
  const stage5 = await securePDF(currentFile, {
    action: "unlock",
    password: "PipelinePass@2026",
  })
  currentFile = new File([await stage5.blob.arrayBuffer()], "stage5.pdf", {
    type: "application/pdf",
  })

  // Stage 6: rotatePDF 90 degrees
  const stage6 = await rotatePDF(currentFile, 90)
  currentFile = new File([await stage6.blob.arrayBuffer()], "stage6.pdf", {
    type: "application/pdf",
  })

  // Stage 7: compressPDF high level
  const stage7 = await compressPDF(currentFile, { level: "high" })
  const finalDoc = await PDFDocument.load(await stage7.blob.arrayBuffer())

  // Assert pipeline integrity
  assert.equal(finalDoc.getPageCount(), 1)
  assert.equal(finalDoc.getPage(0).getRotation().angle, 90)
  assert.equal(finalDoc.getSubject(), "") // Unlocked and stripped
  assert.ok(stage7.blob.size > 500)
})
