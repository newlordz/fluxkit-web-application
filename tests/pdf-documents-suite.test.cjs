const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument, StandardFonts } = require("pdf-lib")

function loadServices() {
  const Module = require("node:module")
  const filePath = path.join(__dirname, "../src/services.ts")
  const servicesSrc = fs.readFileSync(filePath, "utf8")
  const transpiled = ts
    .transpileModule(servicesSrc, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replaceAll("import.meta.env", "(typeof process !== 'undefined' ? process.env : {})")

  const m = new Module(filePath)
  m.filename = filePath
  m.paths = Module._nodeModulePaths(path.dirname(filePath))
  const customRequire = (id) => (id.startsWith(".") ? {} : require(id))
  const fn = new Function("exports", "require", "module", "__filename", "__dirname", transpiled)
  fn(m.exports, customRequire, m, filePath, path.dirname(filePath))
  return m.exports
}

async function makeSamplePdf(pageCount = 3, withMetadata = false) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pageCount; i++) {
    const p = doc.addPage([600, 800])
    p.drawText(`Sample Page ${i}`, { x: 50, y: 740, size: 18, font })
  }
  if (withMetadata) {
    doc.setTitle("Confidential Budget")
    doc.setAuthor("Jane Doe")
    doc.setSubject("Q4 Numbers")
    doc.setCreator("Internal App")
    doc.setProducer("Custom Producer")
  }
  return new Uint8Array(await doc.save())
}

test("PDF & Documents Suite - All 7 tools registered in config.ts and shared/insights.ts", () => {
  const configSrc = fs.readFileSync(path.join(__dirname, "../src/config.ts"), "utf8")
  const insightsSrc = fs.readFileSync(path.join(__dirname, "../shared/insights.ts"), "utf8")
  const expectedIds = [
    "organize-pdf",
    "page-numbers-pdf",
    "redact-pdf",
    "metadata-pdf",
    "crop-pdf",
    "flatten-pdf",
    "markdown-pdf",
  ]
  for (const id of expectedIds) {
    assert.ok(configSrc.includes(`"${id}"`), `config.ts missing ${id}`)
    assert.ok(insightsSrc.includes(`"${id}"`), `shared/insights.ts missing ${id}`)
  }
})

test("organizePDF reorders, duplicates, and deletes pages accurately", async () => {
  const { organizePDF } = loadServices()
  const pdfBytes = await makeSamplePdf(3)

  const res = await organizePDF(pdfBytes, { pageOrder: [3, 1, 1] })
  assert.equal(res.pageCount, 3)
  assert.ok(res.name.endsWith("-organized.pdf"))

  const loaded = await PDFDocument.load(new Uint8Array(await res.blob.arrayBuffer()))
  assert.equal(loaded.getPageCount(), 3)

  await assert.rejects(() => organizePDF(pdfBytes, { pageOrder: [] }), /Keep at least one valid page/)
})

test("addPageNumbersPDF stamps numbering and respects skipFirstPage", async () => {
  const { addPageNumbersPDF } = loadServices()
  const pdfBytes = await makeSamplePdf(3)

  const res = await addPageNumbersPDF(pdfBytes, {
    format: "bates",
    position: "bottom-right",
    startNumber: 5,
    skipFirstPage: true,
    batesPrefix: "EX-",
  })
  assert.equal(res.pageCount, 3)
  assert.ok(res.name.endsWith("-numbered.pdf"))
  assert.match(res.previewSnippet, /across 2 pages/)
})

test("redactPDF applies redaction boxes and rejects empty redaction list", async () => {
  const { redactPDF } = loadServices()
  const pdfBytes = await makeSamplePdf(2)

  await assert.rejects(
    () => redactPDF(pdfBytes, { regions: [] }),
    /Draw at least one redaction box/,
  )

  const res = await redactPDF(pdfBytes, {
    regions: [{ pageNumber: 1, xPct: 0.1, yPct: 0.1, wPct: 0.3, hPct: 0.1 }],
  })
  assert.equal(res.pageCount, 2)
  assert.ok(res.name.endsWith("-redacted.pdf"))
  const outDoc = await PDFDocument.load(new Uint8Array(await res.blob.arrayBuffer()))
  assert.equal(outDoc.getPageCount(), 2)
})

test("inspectPDFMetadata and cleanPDFMetadata inspect and strip metadata", async () => {
  const { inspectPDFMetadata, cleanPDFMetadata } = loadServices()
  const pdfBytes = await makeSamplePdf(2, true)

  const meta = await inspectPDFMetadata(pdfBytes)
  assert.equal(meta.title, "Confidential Budget")
  assert.equal(meta.author, "Jane Doe")
  assert.equal(meta.pageCount, 2)

  const cleaned = await cleanPDFMetadata(pdfBytes, { stripAll: true })
  assert.ok(cleaned.name.endsWith("-cleaned.pdf"))

  const after = await inspectPDFMetadata(new Uint8Array(await cleaned.blob.arrayBuffer()))
  assert.equal(after.title, "")
  assert.equal(after.author, "")
  assert.equal(after.subject, "")
  assert.equal(after.creator, "")
})

test("cropResizePDF standardizes page size to A4 and crops margins", async () => {
  const { cropResizePDF } = loadServices()
  const pdfBytes = await makeSamplePdf(2)

  const resized = await cropResizePDF(pdfBytes, { mode: "resize", targetSize: "a4" })
  const resizedDoc = await PDFDocument.load(new Uint8Array(await resized.blob.arrayBuffer()))
  const { width, height } = resizedDoc.getPage(0).getSize()
  assert.ok(Math.abs(width - 595.28) < 0.5)
  assert.ok(Math.abs(height - 841.89) < 0.5)

  const cropped = await cropResizePDF(pdfBytes, {
    mode: "crop",
    marginTop: 50,
    marginRight: 50,
    marginBottom: 50,
    marginLeft: 50,
  })
  const croppedDoc = await PDFDocument.load(new Uint8Array(await cropped.blob.arrayBuffer()))
  const cSize = croppedDoc.getPage(0).getSize()
  assert.equal(cSize.width, 500)
  assert.equal(cSize.height, 700)
})

test("flattenPDF flattens interactive form fields into static content", async () => {
  const { flattenPDF } = loadServices()
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])
  const form = doc.getForm()
  const tf = form.createTextField("signer_name")
  tf.setText("Alice")
  tf.addToPage(page, { x: 50, y: 300, width: 150, height: 24 })
  const bytes = new Uint8Array(await doc.save())

  const res = await flattenPDF(bytes)
  assert.ok(res.name.endsWith("-flattened.pdf"))
  assert.match(res.previewSnippet, /Flattened 1 interactive form field/)

  const outDoc = await PDFDocument.load(new Uint8Array(await res.blob.arrayBuffer()))
  assert.equal(outDoc.getForm().getFields().length, 0)
})

test("markdownHtmlToPDF converts Markdown and HTML into valid PDFs", async () => {
  const { markdownHtmlToPDF } = loadServices()

  await assert.rejects(() => markdownHtmlToPDF("   "), /Paste Markdown or HTML content/)

  const mdRes = await markdownHtmlToPDF("# Spec\n\n- Item **one**\n- Item two\n\n> Note", {
    mode: "markdown",
    title: "Project Spec",
    pageSize: "a4",
  })
  assert.equal(mdRes.name, "project-spec.pdf")
  const mdDoc = await PDFDocument.load(new Uint8Array(await mdRes.blob.arrayBuffer()))
  assert.ok(mdDoc.getPageCount() >= 1)

  const htmlRes = await markdownHtmlToPDF("<h1>Report</h1><p>Summary &amp; details.</p>", {
    mode: "html",
    pageSize: "letter",
  })
  const htmlDoc = await PDFDocument.load(new Uint8Array(await htmlRes.blob.arrayBuffer()))
  assert.equal(htmlDoc.getPage(0).getSize().width, 612)
})
