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
// Transpiler & Dynamic Loader for Services & React Components
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
  const code = ts
    .transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    })
    .outputText.replace(/import\.meta\.env/g, "process.env")
  const result = { code, filename: resolved }
  transpileCache.set(fullPath, result)
  return result
}

function loadServices() {
  const filePath = path.resolve("src", "services.ts")
  const raw = fs.readFileSync(filePath, "utf8")
  const code = ts
    .transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })
    .outputText.replace(/import\.meta\.env/g, "process.env")

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
async function generatePDFWithPages(count = 1, pagePrefix = "Page Content") {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`${pagePrefix} - Page ${i + 1}`, {
      x: 50,
      y: 780,
      size: 16,
      font,
    })
    page.drawText(`Transaction Ref: FLUX-${1000 + i}`, {
      x: 50,
      y: 740,
      size: 12,
      font,
    })
    page.drawText(`Status: Confirmed - Amount: $${(i + 1) * 125}.00`, {
      x: 50,
      y: 700,
      size: 12,
      font,
    })
  }
  return doc.save()
}

function makeFile(name, content, mime = "text/plain") {
  return new File([content], name, { type: mime })
}

// ============================================================================
// EMPIRICAL CHALLENGER TEST SUITE: MILESTONE 4
// ============================================================================

test("Challenger Suite 1: ZIP & Unzip Binary Round-Trip & Security Invariants", async (t) => {
  const services = loadServices()

  await t.test(
    "1.1 Full Round-Trip fidelity across mixed media, binary, and empty files",
    async () => {
      const textData =
        "FluxKit Pure Client-Side ZIP Packaging Engine\nLine 2 with UTF-8: ⚡ 🚀 📦\nEnd."
      const binaryData = new Uint8Array([
        0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04, 0x55, 0xaa,
      ])
      const emptyData = new Uint8Array(0)
      const deepNestedData = "Contents of nested file at level 4."

      const files = [
        { name: "readme.txt", data: textData },
        { name: "payload.bin", data: binaryData },
        { name: "empty.dat", data: emptyData },
        { name: "nested/folder/structure/deep.txt", data: deepNestedData },
        {
          name: "unicode_测试/données.json",
          data: JSON.stringify({ ok: true, items: [1, 2, 3] }),
        },
      ]

      // Pack into ZIP
      const packResult = await services.zipFiles(files, {
        archiveName: "challenge-bundle.zip",
        compressionLevel: 6,
      })
      assert.ok(
        packResult.blob instanceof Blob,
        "Result blob must be an instance of Blob",
      )
      assert.strictEqual(packResult.name, "challenge-bundle.zip")
      assert.strictEqual(packResult.totalFiles, 5)
      assert.ok(packResult.compressedSize > 0)
      assert.ok(packResult.blob.size > 0)

      // Verify ZIP magic header: 0x50 0x4B 0x03 0x04
      const zipBytes = new Uint8Array(await packResult.blob.arrayBuffer())
      assert.strictEqual(zipBytes[0], 0x50, "ZIP magic byte 0")
      assert.strictEqual(zipBytes[1], 0x4b, "ZIP magic byte 1")
      assert.strictEqual(zipBytes[2], 0x03, "ZIP magic byte 2")
      assert.strictEqual(zipBytes[3], 0x04, "ZIP magic byte 3")

      // Unpack ZIP and verify exact byte-for-byte equality
      const extracted = await services.extractZipArchive(packResult.blob)
      assert.strictEqual(extracted.length, 5, "Must extract all 5 entries")

      const map = new Map(extracted.map((e) => [e.name, e]))

      // 1. readme.txt
      const readmeEntry = map.get("readme.txt")
      assert.ok(readmeEntry, "readme.txt must exist")
      assert.strictEqual(readmeEntry.text(), textData)

      // 2. payload.bin
      const payloadEntry = map.get("payload.bin")
      assert.ok(payloadEntry, "payload.bin must exist")
      assert.deepStrictEqual(
        Array.from(payloadEntry.data),
        Array.from(binaryData),
      )

      // 3. empty.dat
      const emptyEntry = map.get("empty.dat")
      assert.ok(emptyEntry, "empty.dat must exist")
      assert.strictEqual(emptyEntry.size, 0)
      assert.strictEqual(emptyEntry.data.length, 0)

      // 4. nested/folder/structure/deep.txt
      const deepEntry = map.get("nested/folder/structure/deep.txt")
      assert.ok(deepEntry, "deep.txt must exist at exact relative path")
      assert.strictEqual(deepEntry.text(), deepNestedData)

      // 5. unicode_测试/données.json
      const unicodeEntry = map.get("unicode_测试/données.json")
      assert.ok(unicodeEntry, "unicode entry must exist")
      assert.deepStrictEqual(JSON.parse(unicodeEntry.text()), {
        ok: true,
        items: [1, 2, 3],
      })
    },
  )

  await t.test(
    "1.2 Compression ratio comparison: Store (0) vs Deflate (6)",
    async () => {
      // Generate highly compressible text
      const repetitiveText = "FluxKitHighCompressionTestStringRepeat_".repeat(
        500,
      ) // ~19.5 KB

      const storePack = await services.zipFiles(
        [{ name: "store.txt", data: repetitiveText }],
        { compressionLevel: 0 },
      )
      const deflatePack = await services.zipFiles(
        [{ name: "deflate.txt", data: repetitiveText }],
        { compressionLevel: 6 },
      )

      assert.ok(
        deflatePack.compressedSize < storePack.compressedSize / 5,
        `Deflate compressed size (${deflatePack.compressedSize}) should be dramatically smaller than Store (${storePack.compressedSize})`,
      )
      assert.ok(
        deflatePack.compressionRatio > 0.8,
        `Compression ratio should be > 80%, got ${deflatePack.compressionRatio}`,
      )

      // Verify both unpack identically
      const unpackedStore = await services.extractZipArchive(storePack.blob)
      const unpackedDeflate = await services.extractZipArchive(deflatePack.blob)
      assert.strictEqual(unpackedStore[0].text(), repetitiveText)
      assert.strictEqual(unpackedDeflate[0].text(), repetitiveText)
    },
  )

  await t.test(
    "1.3 Security: Zip-slip directory traversal sanitization",
    async () => {
      // Create an archive containing dangerous directory traversal paths
      const files = [
        { name: "../../etc/passwd", data: "root:x:0:0:root:/root:/bin/bash" },
        { name: "..\\..\\windows\\system32\\calc.exe", data: "MZ..." },
        { name: "/absolute/path/file.txt", data: "content" },
        { name: "__proto__", data: '{"polluted": true}' },
        { name: "constructor", data: "function() {}" },
      ]

      const packed = await services.zipFiles(files)
      const extracted = await services.extractZipArchive(packed.blob)

      for (const file of extracted) {
        assert.ok(
          !file.name.includes(".."),
          `File name "${file.name}" must not contain ".."`,
        )
        assert.ok(
          !file.name.startsWith("/"),
          `File name "${file.name}" must not start with "/"`,
        )
        assert.ok(
          file.name !== "__proto__",
          `File name must not be prototype pollution target`,
        )
        assert.ok(
          file.name !== "constructor",
          `File name must not be constructor`,
        )
      }

      const names = extracted.map((f) => f.name)
      assert.ok(
        names.includes("etc/passwd"),
        "Should sanitize ../../etc/passwd to etc/passwd",
      )
      assert.ok(
        names.includes("safe___proto__"),
        "Should sanitize __proto__ to safe___proto__",
      )
      assert.ok(
        names.includes("safe_constructor"),
        "Should sanitize constructor to safe_constructor",
      )
    },
  )

  await t.test(
    "1.4 Corrupted, truncated, and empty archives rejection",
    async () => {
      await assert.rejects(
        async () => services.extractZipArchive(new Uint8Array(0)),
        /Archive cannot be empty/,
      )

      const tooShort = new Uint8Array([0x50, 0x4b, 0x05, 0x06])
      await assert.rejects(
        async () => services.extractZipArchive(tooShort),
        /End of central directory record not found/,
      )

      // Archive with fake EOCD but corrupted central directory offset
      const fakeEOCD = new Uint8Array(22)
      const view = new DataView(fakeEOCD.buffer)
      view.setUint32(0, 0x06054b50, true) // EOCD signature
      view.setUint16(8, 1, true) // 1 entry
      view.setUint16(10, 1, true)
      view.setUint32(12, 100, true) // size
      view.setUint32(16, 99999, true) // cdOffset way out of range
      await assert.rejects(
        async () => services.extractZipArchive(fakeEOCD),
        /Central directory offset is out of range/,
      )
    },
  )

  await t.test(
    "1.5 Decompression bomb security threshold enforcement",
    async () => {
      const hugeRepeated = "A".repeat(50000)
      const packed = await services.zipFiles([
        { name: "bomb.txt", data: hugeRepeated },
      ])

      // Should throw if maxTotalBytes is smaller than the decompressed payload
      await assert.rejects(
        async () =>
          services.extractZipArchive(packed.blob, { maxTotalBytes: 1000 }),
        /exceeds.*limit/,
      )
    },
  )

  await t.test(
    "1.6 Packaging stress: 50 distinct file entries with filter callback",
    async () => {
      const entries = Array.from({ length: 50 }, (_, i) => ({
        name: `docs/file_${String(i).padStart(3, "0")}.txt`,
        data: `Content of file #${i}`,
      }))

      const packed = await services.zipFiles(entries, {
        archiveName: "batch-50.zip",
      })
      assert.strictEqual(packed.totalFiles, 50)

      // Extract only even numbered files using filter
      const extractedEven = await services.extractZipArchive(packed.blob, {
        filter: (name) => {
          const num = parseInt(name.replace(/[^0-9]/g, ""), 10)
          return num % 2 === 0
        },
      })
      assert.strictEqual(
        extractedEven.length,
        25,
        "Should extract exactly 25 even files",
      )
      assert.ok(
        extractedEven.every((f) => f.text().startsWith("Content of file #")),
      )
    },
  )

  await t.test(
    "1.7 Input validations: empty array and invalid types",
    async () => {
      await assert.rejects(
        async () => services.zipFiles([]),
        /Select at least one file to archive/,
      )
      await assert.rejects(
        async () => services.zipFiles([{ name: "bad.bin", data: 12345 }]),
        /Invalid data type/,
      )
    },
  )
})

// ============================================================================
// CHALLENGER SUITE 2: OCR SCANNER ENGINE
// ============================================================================

test("Challenger Suite 2: Client-Side OCR Scanner Engine Verification", async (t) => {
  const services = loadServices()

  await t.test(
    "2.1 Synthetic Raster BMP: Single line alphanumeric recognition",
    async () => {
      const sampleText = "FLUXKIT 2026"
      const bmpBytes = services.createSyntheticTestImage(sampleText)

      assert.ok(bmpBytes.length > 54, "BMP must be larger than 54 header bytes")
      assert.strictEqual(bmpBytes[0], 0x42, "BMP signature 'B'")
      assert.strictEqual(bmpBytes[1], 0x4d, "BMP signature 'M'")

      const result = await services.scanOCR(bmpBytes)
      assert.strictEqual(result.sourceType, "image-raster")
      assert.ok(result.lines.length >= 1, "Must recognize at least 1 line")
      assert.ok(
        result.confidence > 0.8,
        `Confidence should be high, got ${result.confidence}`,
      )
      assert.ok(
        result.text.includes("FLUXKIT"),
        `Recognized text should contain 'FLUXKIT', got: "${result.text}"`,
      )
      assert.ok(
        result.text.includes("2026"),
        `Recognized text should contain '2026', got: "${result.text}"`,
      )
      assert.strictEqual(result.wordCount, 2)
    },
  )

  await t.test(
    "2.2 Synthetic Raster BMP: Multi-line invoice data recognition",
    async () => {
      const multiLine = "INVOICE 901\nTOTAL $450\nPAID YES"
      const bmpBytes = services.createSyntheticTestImage(multiLine)

      const result = await services.scanOCR(bmpBytes)
      assert.strictEqual(result.sourceType, "image-raster")
      assert.strictEqual(result.lines.length, 3, "Should detect 3 line bands")
      assert.ok(result.text.includes("INVOICE"), "Recognizes INVOICE")
      assert.ok(result.text.includes("TOTAL"), "Recognizes TOTAL")
      assert.ok(result.text.includes("PAID"), "Recognizes PAID")
      assert.ok(
        result.wordCount >= 5,
        `Word count should be >= 5, got ${result.wordCount}`,
      )
    },
  )

  await t.test(
    "2.3 Optical Polarity Inversion (Dark background / Light ink)",
    async () => {
      const originalBmp = services.createSyntheticTestImage("WHITE ON BLACK")
      const invertedBmp = new Uint8Array(originalBmp.length)
      invertedBmp.set(originalBmp)
      // Invert pixel bytes from offset 54 onwards
      for (let i = 54; i < invertedBmp.length; i++) {
        invertedBmp[i] = 255 - invertedBmp[i]
      }

      const result = await services.scanOCR(invertedBmp)
      assert.strictEqual(result.sourceType, "image-raster")
      assert.ok(
        result.text.includes("WHITE"),
        `Should recognize white ink on black background: got "${result.text}"`,
      )
      assert.ok(
        result.text.includes("BLACK"),
        `Should recognize black: got "${result.text}"`,
      )
    },
  )

  await t.test("2.4 Digital PDF Fast-Path Stream Extraction", async () => {
    const pdfBytes = await generatePDFWithPages(2, "Accounting Report Q4")
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" })

    const result = await services.scanOCR(pdfBlob)
    assert.strictEqual(result.sourceType, "pdf-digital")
    assert.strictEqual(result.pageCount, 2)
    assert.ok(result.text.includes("Accounting Report Q4 - Page 1"))
    assert.ok(result.text.includes("Accounting Report Q4 - Page 2"))
    assert.ok(result.text.includes("Transaction Ref: FLUX-1000"))
    assert.ok(result.text.includes("Status: Confirmed"))
    assert.ok(
      result.confidence >= 0.9,
      `Confidence should be >= 0.9, got ${result.confidence}`,
    )
    assert.ok(result.wordCount > 10, "Word count should be > 10")
    assert.ok(result.characterCount > 50, "Char count should be > 50")
  })

  await t.test(
    "2.5 Edge cases: 0-byte input rejection and blank image tolerance",
    async () => {
      await assert.rejects(
        async () => services.scanOCR(new Uint8Array(0)),
        /File cannot be empty/,
      )

      // Completely white 20x20 BMP with no ink
      const blankBmp = new Uint8Array(54 + 20 * 20 * 3)
      const view = new DataView(blankBmp.buffer)
      blankBmp[0] = 0x42
      blankBmp[1] = 0x4d
      view.setUint32(2, blankBmp.length, true)
      view.setUint32(10, 54, true)
      view.setUint32(14, 40, true)
      view.setInt32(18, 20, true)
      view.setInt32(22, 20, true)
      view.setUint16(26, 1, true)
      view.setUint16(28, 24, true)
      for (let i = 54; i < blankBmp.length; i++) blankBmp[i] = 255

      const blankResult = await services.scanOCR(blankBmp)
      assert.strictEqual(blankResult.text, "")
      assert.strictEqual(blankResult.lines.length, 0)
      assert.strictEqual(blankResult.wordCount, 0)
    },
  )

  await t.test("2.6 Threshold modes & language options", async () => {
    const text = "OPTIONS TEST"
    const bmpBytes = services.createSyntheticTestImage(text)

    const resultHighContrast = await services.scanOCR(bmpBytes, {
      thresholdMode: "high-contrast",
      language: "es",
    })
    assert.strictEqual(resultHighContrast.language, "es")
    assert.ok(resultHighContrast.text.includes("OPTIONS"))

    // Random non-image bytes fallback
    const randomGarbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const fallbackResult = await services.scanOCR(randomGarbage)
    assert.strictEqual(fallbackResult.text, "")
    assert.strictEqual(fallbackResult.lines.length, 0)
  })
})

// ============================================================================
// CHALLENGER SUITE 3: UNIVERSAL FORMAT CONVERTER
// ============================================================================

test("Challenger Suite 3: Universal Format Converter", async (t) => {
  const services = loadServices()

  await t.test(
    "3.1 detectFileType comprehensive matrix across extensions & MIME types",
    () => {
      assert.strictEqual(services.detectFileType("report.pdf"), "pdf")
      assert.strictEqual(services.detectFileType("DOCUMENT.DOCX"), "word")
      assert.strictEqual(services.detectFileType("legacy.doc"), "word")
      assert.strictEqual(services.detectFileType("slides.pptx"), "ppt")
      assert.strictEqual(services.detectFileType("old_slides.ppt"), "ppt")
      assert.strictEqual(services.detectFileType("data.xlsx"), "excel")
      assert.strictEqual(services.detectFileType("table.csv"), "excel")
      assert.strictEqual(services.detectFileType("matrix.tsv"), "excel")
      assert.strictEqual(services.detectFileType("photo.jpg"), "image")
      assert.strictEqual(services.detectFileType("graphic.png"), "image")
      assert.strictEqual(services.detectFileType("banner.webp"), "image")
      assert.strictEqual(services.detectFileType("scan.bmp"), "image")
      assert.strictEqual(services.detectFileType("notes.txt"), "text")
      assert.strictEqual(services.detectFileType("spec.md"), "text")
      assert.strictEqual(services.detectFileType("unknown.xyz"), "unknown")

      // MIME type detection
      const mimePdf = new File(["dummy"], "unnamed", {
        type: "application/pdf",
      })
      assert.strictEqual(services.detectFileType(mimePdf), "pdf")
      const mimeCsv = new File(["a,b\n1,2"], "unnamed", { type: "text/csv" })
      assert.strictEqual(services.detectFileType(mimeCsv), "excel")
    },
  )

  await t.test(
    "3.2 PDF to DOCX: Generates valid OpenXML ZIP package with [Content_Types].xml",
    async () => {
      const pdfBytes = await generatePDFWithPages(1, "Quarterly Earnings")
      const pdfFile = makeFile("earnings.pdf", pdfBytes, "application/pdf")

      const result = await services.universalConvert(pdfFile, {
        targetFormat: "docx",
      })
      assert.ok(result.name.endsWith(".docx"), "Must return a docx file name")
      assert.strictEqual(
        result.blob.type,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      )

      // Verify DOCX is a valid ZIP package containing OpenXML files
      const extracted = await services.extractZipArchive(result.blob)
      const fileNames = extracted.map((e) => e.name)
      assert.ok(
        fileNames.includes("[Content_Types].xml"),
        "DOCX must contain [Content_Types].xml",
      )
      assert.ok(
        fileNames.includes("word/document.xml"),
        "DOCX must contain word/document.xml",
      )
    },
  )

  await t.test(
    "3.3 PDF to PPTX: Generates valid OpenXML PPTX presentation package",
    async () => {
      const pdfBytes = await generatePDFWithPages(2, "Pitch Deck")
      const pdfFile = makeFile("deck.pdf", pdfBytes, "application/pdf")

      const result = await services.universalConvert(pdfFile, {
        targetFormat: "pptx",
      })
      assert.ok(result.name.endsWith(".pptx"), "Must return a pptx file name")
      assert.strictEqual(
        result.blob.type,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      )

      const extracted = await services.extractZipArchive(result.blob)
      const fileNames = extracted.map((e) => e.name)
      assert.ok(
        fileNames.includes("[Content_Types].xml"),
        "PPTX must contain [Content_Types].xml",
      )
      assert.ok(
        fileNames.includes("ppt/presentation.xml"),
        "PPTX must contain ppt/presentation.xml",
      )
    },
  )

  await t.test(
    "3.4 PDF to XLSX: Generates valid OpenXML XLSX spreadsheet package",
    async () => {
      const pdfBytes = await generatePDFWithPages(1, "Balance Sheet")
      const pdfFile = makeFile("balance.pdf", pdfBytes, "application/pdf")

      const result = await services.universalConvert(pdfFile, {
        targetFormat: "xlsx",
      })
      assert.ok(result.name.endsWith(".xlsx"), "Must return an xlsx file name")
      assert.strictEqual(
        result.blob.type,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )

      const extracted = await services.extractZipArchive(result.blob)
      const fileNames = extracted.map((e) => e.name)
      assert.ok(
        fileNames.includes("[Content_Types].xml"),
        "XLSX must contain [Content_Types].xml",
      )
      assert.ok(
        fileNames.includes("xl/workbook.xml"),
        "XLSX must contain xl/workbook.xml",
      )
    },
  )

  await t.test(
    "3.5 PDF to CSV / TXT tabular and text conversions",
    async () => {
      const pdfBytes = await generatePDFWithPages(1, "Table Data")
      const pdfFile = makeFile("table.pdf", pdfBytes, "application/pdf")

      // CSV
      const csvResult = await services.universalConvert(pdfFile, {
        targetFormat: "csv",
      })
      assert.ok(csvResult.name.endsWith(".csv"), "Must return a csv file name")
      const csvText = await csvResult.blob.text()
      assert.ok(csvText.length > 0, "CSV text must not be empty")

      // TXT
      const txtResult = await services.universalConvert(pdfFile, {
        targetFormat: "txt",
      })
      assert.ok(txtResult.name.endsWith(".txt"), "Must return a txt file name")
      const txtContent = await txtResult.blob.text()
      assert.ok(
        txtContent.includes("Table Data"),
        "TXT content should retain text",
      )
    },
  )

  await t.test("3.6 Plain Text to PDF conversion", async () => {
    const textContent =
      "FluxKit Automated Conversion\nAuthor: Empirical Challenger\nDate: 2026-11-10"
    const textFile = makeFile("summary.txt", textContent, "text/plain")

    const result = await services.universalConvert(textFile, {
      targetFormat: "pdf",
    })
    assert.ok(result.name.endsWith(".pdf"), "Output must be a PDF")
    assert.strictEqual(result.blob.type, "application/pdf")

    // Load resulting PDF and verify it is readable
    const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer())
    assert.strictEqual(pdfDoc.getPageCount(), 1)
  })

  await t.test(
    "3.7 Unsupported conversion paths reject gracefully",
    async () => {
      const pdfBytes = await generatePDFWithPages(1)
      const pdfFile = makeFile("test.pdf", pdfBytes, "application/pdf")

      await assert.rejects(
        async () =>
          services.universalConvert(pdfFile, {
            targetFormat: "unsupported_fmt",
          }),
        /Unsupported target format/,
      )

      const textFile = makeFile("test.txt", "some text", "text/plain")
      await assert.rejects(
        async () =>
          services.universalConvert(textFile, { targetFormat: "pptx" }),
        /Unsupported target format/,
      )
    },
  )
})

// ============================================================================
// CHALLENGER SUITE 4: CHAINED MULTI-ACTION PIPELINES
// ============================================================================

test("Challenger Suite 4: Chained Multi-Action Pipelines", async (t) => {
  const services = loadServices()

  await t.test(
    "4.1 convertAndCompress: Text -> PDF -> Compressed PDF with progress events",
    async () => {
      const textData = "Line 1 of large document\n".repeat(200)
      const textFile = makeFile("contract.txt", textData, "text/plain")

      const progressReports = []
      const onProgress = (report) => progressReports.push(report)

      const result = await services.convertAndCompress(textFile, {
        targetFormat: "pdf",
        compressLevel: "high",
        onProgress,
      })

      assert.ok(result.blob instanceof Blob)
      assert.strictEqual(result.blob.type, "application/pdf")
      assert.ok(result.name.endsWith(".pdf"), "Must produce a PDF filename")
      assert.ok(result.originalSize > 0)
      assert.ok(result.intermediateSize > 0)
      assert.ok(result.finalSize > 0)
      assert.ok(typeof result.savedPercentage === "number")

      // Verify progress tracker transitioned across stages
      assert.ok(
        progressReports.length >= 2,
        "Progress reports must be generated",
      )
      const stages = progressReports.map((p) => p.stage)
      assert.ok(stages.includes("converting"), "Must have converting stage")
      assert.ok(stages.includes("compressing"), "Must have compressing stage")

      // Verify final blob is a valid loadable PDF
      const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer())
      assert.ok(pdfDoc.getPageCount() >= 1)
    },
  )

  await t.test(
    "4.2 mergeAndCompress: 3 PDFs merged and compressed with accurate page preservation",
    async () => {
      const pdf1Bytes = await generatePDFWithPages(1, "Doc Alpha")
      const pdf2Bytes = await generatePDFWithPages(2, "Doc Beta")
      const pdf3Bytes = await generatePDFWithPages(3, "Doc Gamma")

      const file1 = makeFile("alpha.pdf", pdf1Bytes, "application/pdf")
      const file2 = makeFile("beta.pdf", pdf2Bytes, "application/pdf")
      const file3 = makeFile("gamma.pdf", pdf3Bytes, "application/pdf")

      const progressReports = []
      const result = await services.mergeAndCompress([file1, file2, file3], {
        compressLevel: "high",
        stripMetadata: true,
        onProgress: (p) => progressReports.push(p),
      })

      assert.strictEqual(result.name, "merged-compressed.pdf")
      assert.strictEqual(
        result.originalSize,
        file1.size + file2.size + file3.size,
      )
      assert.ok(result.finalSize > 0)

      // Load final PDF and confirm total page count = 1 + 2 + 3 = 6
      const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer())
      assert.strictEqual(
        pdfDoc.getPageCount(),
        6,
        "Merged PDF must preserve all 6 pages",
      )

      const stages = progressReports.map((p) => p.stage)
      assert.ok(stages.includes("merging"))
      assert.ok(stages.includes("compressing"))
    },
  )

  await t.test(
    "4.3 splitAndCompress (Range Mode): Extract pages 2-4 from 5-page PDF and compress",
    async () => {
      const pdf5Bytes = await generatePDFWithPages(5, "Five Page Spec")
      const file = makeFile("spec5.pdf", pdf5Bytes, "application/pdf")

      const result = await services.splitAndCompress(file, {
        splitMode: "ranges",
        pageRange: "2-4",
        compressLevel: "high",
      })

      assert.strictEqual(result.name, "spec5-split-compressed.pdf")
      assert.ok(result.finalSize > 0)

      // Verify page count of extracted range is exactly 3 pages (pages 2, 3, 4)
      const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer())
      assert.strictEqual(
        pdfDoc.getPageCount(),
        3,
        "Extracted range 2-4 must have exactly 3 pages",
      )
    },
  )

  await t.test(
    "4.4 splitAndCompress (All Pages Mode): Unpack generated ZIP and verify all individual PDFs",
    async () => {
      const pdf3Bytes = await generatePDFWithPages(3, "Triple Split")
      const file = makeFile("triple.pdf", pdf3Bytes, "application/pdf")

      const result = await services.splitAndCompress(file, {
        splitMode: "all-pages",
        compressLevel: "high",
      })

      assert.strictEqual(result.name, "triple-split-compressed.zip")
      assert.strictEqual(result.blob.type, "application/zip")

      // Unpack ZIP archive with extractZipArchive
      const extracted = await services.extractZipArchive(result.blob)
      assert.strictEqual(
        extracted.length,
        3,
        "ZIP must contain 3 split PDF files",
      )

      // Verify each extracted entry is a valid 1-page PDF
      for (let i = 0; i < 3; i++) {
        const entry = extracted[i]
        assert.strictEqual(entry.name, `compressed-page-${i + 1}.pdf`)
        const pageDoc = await PDFDocument.load(entry.data)
        assert.strictEqual(
          pageDoc.getPageCount(),
          1,
          `Extracted ${entry.name} must be a 1-page PDF`,
        )
      }
    },
  )

  await t.test("4.5 High-concurrency parallel pipeline stress", async () => {
    // Run 5 simultaneous multi-action pipelines in parallel
    const pdfBytes = await generatePDFWithPages(2, "Concurrency Test")
    const jobs = Array.from({ length: 5 }, (_, idx) => {
      const f = makeFile(`concur_${idx}.pdf`, pdfBytes, "application/pdf")
      return services.splitAndCompress(f, {
        splitMode: "range",
        pageRange: "1",
      })
    })

    const results = await Promise.all(jobs)
    assert.strictEqual(results.length, 5)
    for (const res of results) {
      assert.ok(res.blob.size > 0)
      const doc = await PDFDocument.load(await res.blob.arrayBuffer())
      assert.strictEqual(doc.getPageCount(), 1)
    }
  })

  await t.test(
    "4.6 Hostile pipeline inputs: zero-byte, insufficient files, invalid ranges",
    async () => {
      const emptyFile = makeFile(
        "empty.pdf",
        new Uint8Array(0),
        "application/pdf",
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
        async () => services.mergeAndCompress([emptyFile]),
        /Choose at least two PDFs/,
      )

      const validBytes = await generatePDFWithPages(2)
      const validFile = makeFile("valid.pdf", validBytes, "application/pdf")

      // Invalid range
      await assert.rejects(
        async () =>
          services.splitAndCompress(validFile, {
            splitMode: "ranges",
            pageRange: "55-90",
          }),
        /out of bounds/,
      )
    },
  )
})

// ============================================================================
// CHALLENGER SUITE 5: REACT ROUTE RENDERING & INTERACTIVE OPTIONS PANEL
// ============================================================================

test("Challenger Suite 5: React Route Mounting & Interactive Controls", async (t) => {
  const m4Tools = [
    {
      hash: "zip",
      expectedControls: [
        "Create Archive",
        "Extract Archive",
        "Compression Level",
      ],
    },
    {
      hash: "ocr",
      expectedControls: [
        "Recognition Language & Script",
        "Auto Contrast Enhancement",
        "Scan & Extract Text",
      ],
    },
    {
      hash: "convert",
      expectedControls: [
        "Target Format",
        "Word (.docx)",
        "Conversion Quality",
        "Convert File",
      ],
    },
    {
      hash: "convert-compress",
      expectedControls: [
        "Target Format",
        "Compression Profile",
        "Convert & Compress",
      ],
    },
    {
      hash: "merge-compress",
      expectedControls: [
        "Merge & Compress PDFs",
        "Compression Profile",
        "Strip PDF metadata",
      ],
    },
    {
      hash: "split-compress",
      expectedControls: ["Extract Mode", "Page Range", "Split & Compress PDF"],
    },
  ]

  for (const tool of m4Tools) {
    await t.test(
      `Route #${tool.hash} renders active options panel and controls`,
      () => {
        const { load } = createDOMEnv(tool.hash)
        const App = load("App").default
        const html = renderToStaticMarkup(React.createElement(App))

        for (const ctrl of tool.expectedControls) {
          const escaped = ctrl.replace(/&/g, "&amp;")
          assert.ok(
            html.includes(ctrl) || html.includes(escaped),
            `Route #${tool.hash} must render interactive control containing "${ctrl}"`,
          )
        }
      },
    )
  }
})
