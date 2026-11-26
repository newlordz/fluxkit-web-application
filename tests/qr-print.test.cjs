const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const QRCode = require("qrcode")
const { PDFDocument } = require("pdf-lib")

function loadQrPrintModule() {
  const filePath = path.resolve(__dirname, "../src/QRPrintModal.tsx")
  const source = fs.readFileSync(filePath, "utf8")
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`
  const compiled = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  compiled(mod.exports, require, mod, filePath, path.dirname(filePath))
  return mod.exports
}

test("QR A4 layout uses exact millimetres and keeps the code centred", () => {
  const { A4_WIDTH_MM, A4_HEIGHT_MM, getQrPrintLayout } = loadQrPrintModule()
  assert.equal(A4_WIDTH_MM, 210)
  assert.equal(A4_HEIGHT_MM, 297)

  const layout = getQrPrintLayout(80, false)
  assert.deepEqual(layout, { x: 65, y: 108.5, size: 80, captionY: null })

  const captioned = getQrPrintLayout(80, true)
  assert.equal(captioned.x, 65)
  assert.equal(captioned.y, 115.5)
  assert.equal(captioned.captionY, 105.5)
  assert.equal(getQrPrintLayout(10, false).size, 30)
  assert.equal(getQrPrintLayout(500, false).size, 150)
})

test("QR A4 export creates a true A4 PDF with the selected artwork", async () => {
  const { createQrA4Pdf } = loadQrPrintModule()
  const qrDataUrl = await QRCode.toDataURL("https://masterfilepro.com", {
    width: 320,
    margin: 2,
    errorCorrectionLevel: "H",
  })
  const blob = await createQrA4Pdf(qrDataUrl, {
    sizeMm: 100,
    caption: "Scan to open",
    cutGuides: true,
  })
  assert.equal(blob.type, "application/pdf")
  assert.ok(blob.size > 1000)

  const pdf = await PDFDocument.load(await blob.arrayBuffer())
  assert.equal(pdf.getPageCount(), 1)
  const { width, height } = pdf.getPage(0).getSize()
  assert.ok(Math.abs(width - 595.28) < 0.1)
  assert.ok(Math.abs(height - 841.89) < 0.1)
})

test("QR result exposes A4 printing and accurate lifetime guidance", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/ToolPage.tsx"), "utf8")
  assert.match(source, /A4 Print Preview/)
  assert.match(source, /<QRPrintModal/)
  assert.match(source, /Hosted page: 30 days/)
  assert.match(source, /No QR expiry/)
  assert.match(source, /pointing to a page you control/)
})
