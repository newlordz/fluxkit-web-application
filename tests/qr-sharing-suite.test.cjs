const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")
const JSZip = require("jszip")
const QRCode = require("qrcode")

function loadServices() {
  const filePath = path.join(__dirname, "../src/services.ts")
  const servicesSrc = fs.readFileSync(filePath, "utf8")
  const transpiled = ts
    .transpileModule(servicesSrc, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
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

test("QR & Sharing Suite - All 4 tools registered in config.ts and shared/insights.ts", () => {
  const configSrc = fs.readFileSync(path.join(__dirname, "../src/config.ts"), "utf8")
  const insightsSrc = fs.readFileSync(path.join(__dirname, "../shared/insights.ts"), "utf8")
  for (const id of ["qr-scanner", "qr-vcard", "qr-batch", "qr-event"]) {
    assert.ok(configSrc.includes(`"${id}"`), `config.ts missing ${id}`)
    assert.ok(insightsSrc.includes(`"${id}"`), `shared/insights.ts missing ${id}`)
  }
})

test("generateVCardQR builds valid vCard 3.0 payload, QR PNG, and .vcf file", async () => {
  const { generateVCardQR } = loadServices()

  await assert.rejects(() => generateVCardQR({ fullName: "  " }), /Enter a full name/)

  const res = await generateVCardQR({
    fullName: "Jordan Taylor",
    organization: "Acme Studio",
    title: "Product Lead",
    phone: "+1 555 234 5678",
    email: "jordan@acme.co",
    website: "acme.co",
  })

  assert.ok(res.payload.includes("BEGIN:VCARD"))
  assert.ok(res.payload.includes("FN:Jordan Taylor"))
  assert.ok(res.payload.includes("ORG:Acme Studio"))
  assert.ok(res.payload.includes("URL:https://acme.co"))
  assert.ok(res.payload.includes("END:VCARD"))
  assert.ok(res.qrDataUrl.startsWith("data:image/png;base64,"))
  assert.equal(res.result.name, "jordan-taylor.vcf")
})

test("generateEventQR builds valid ICS calendar payload, QR PNG, and .ics file", async () => {
  const { generateEventQR } = loadServices()

  await assert.rejects(() => generateEventQR({ summary: "", start: "2026-12-01T10:00" }), /Enter an event title/)
  await assert.rejects(() => generateEventQR({ summary: "Launch", start: "invalid-date" }), /valid start date/)

  const res = await generateEventQR({
    summary: "Annual Product Launch",
    start: "2026-12-01T10:00",
    location: "Hall B",
    description: "Main keynote",
  })

  assert.ok(res.payload.includes("BEGIN:VCALENDAR"))
  assert.ok(res.payload.includes("BEGIN:VEVENT"))
  assert.ok(res.payload.includes("SUMMARY:Annual Product Launch"))
  assert.ok(res.payload.includes("LOCATION:Hall B"))
  assert.ok(res.payload.includes("END:VCALENDAR"))
  assert.ok(res.qrDataUrl.startsWith("data:image/png;base64,"))
  assert.equal(res.result.name, "annual-product-launch.ics")
})

test("generateBatchQRs parses CSV and plain lines and packages PNGs + manifest.csv in ZIP", async () => {
  const { generateBatchQRs, parseBatchQRInput } = loadServices()

  await assert.rejects(() => generateBatchQRs("   \n  "), /Enter at least one URL/)

  const parsed = parseBatchQRInput("Label,URL\nTable-1,https://example.com/1\nTable-1,https://example.com/2\nhttps://example.com/3")
  assert.equal(parsed.length, 3)

  const res = await generateBatchQRs(parsed)
  assert.equal(res.name, "qr-batch-codes.zip")
  assert.equal(res.pageCount, 3)

  const zip = await JSZip.loadAsync(new Uint8Array(await res.blob.arrayBuffer()))
  const files = Object.keys(zip.files)
  assert.ok(files.includes("table-1.png"))
  assert.ok(files.includes("table-1-2.png"))
  assert.ok(files.includes("qr-3.png"))
  assert.ok(files.includes("manifest.csv"))

  const manifest = await zip.file("manifest.csv").async("string")
  assert.ok(manifest.includes("https://example.com/1"))
  assert.ok(manifest.includes("https://example.com/3"))
})

test("decodeQRFromImageData decodes a generated QR pixel matrix back to exact payload", async () => {
  const { decodeQRFromImageData } = loadServices()
  const expected = "https://masterfilepro.com/verify/12345"
  const qr = QRCode.create(expected, { errorCorrectionLevel: "M" })
  const size = qr.modules.size
  const scale = 4
  const quiet = 4
  const dim = (size + quiet * 2) * scale
  const rgba = new Uint8ClampedArray(dim * dim * 4)

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const mx = Math.floor(x / scale) - quiet
      const my = Math.floor(y / scale) - quiet
      const dark = mx >= 0 && my >= 0 && mx < size && my < size && qr.modules.get(my, mx)
      const val = dark ? 0 : 255
      const idx = (y * dim + x) * 4
      rgba[idx] = val
      rgba[idx + 1] = val
      rgba[idx + 2] = val
      rgba[idx + 3] = 255
    }
  }

  const decoded = await decodeQRFromImageData(rgba, dim, dim)
  assert.equal(decoded, expected)
})
