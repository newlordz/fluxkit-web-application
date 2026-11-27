const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument } = require("pdf-lib")

// ============================================================================
// Loader: services.ts with a stubbed session and API pool
// ============================================================================

const TOKEN = "a".repeat(64)

function loadServices(session) {
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
  const compiled = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  compiled(
    mod.exports,
    (id) => {
      if (id === "./jobTypes") return {}
      if (id === "./sessionService") return session
      if (id === "./apiPoolService") {
        throw new Error("apiPoolService must not load while window is stubbed")
      }
      return require(id)
    },
    mod,
    filePath,
    path.dirname(filePath),
  )
  return mod.exports
}

function withBrowserGlobals(fetchImpl) {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch

  const ilove = {
    id: "ilovepdf-cloud",
    provider: "ilovepdf",
    enabled: true,
    status: "active",
  }

  globalThis.window = {
    __masterfileproApiPool: {
      getCloudApis: () => [
        { id: "adobe-pdf-services", provider: "adobe", enabled: true, status: "active" },
        ilove,
      ],
      // The Word path must skip Adobe and ask for iLovePDF specifically.
      getNextAvailableApi: (_category, excluded = []) =>
        excluded.includes(ilove.id) ? null : ilove,
      recordApiOutcome: () => {},
    },
  }
  globalThis.fetch = fetchImpl

  return () => {
    globalThis.window = previousWindow
    globalThis.fetch = previousFetch
  }
}

// A4 with a right-aligned return address written with a line break — the exact
// shape the local renderer used to re-flow.
function buildA4Docx(services) {
  const docXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
      <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>P.O. Box 123</w:t><w:br/><w:t>Takoradi, Ghana</w:t></w:r></w:p>
      <w:p><w:r><w:t>Subject: A4 layout fidelity</w:t></w:r></w:p>
      <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
    </w:body>
  </w:document>`

  const zipBytes = services.buildZipArchive([
    { name: "word/document.xml", data: new TextEncoder().encode(docXml) },
  ])

  return new File([zipBytes], "Letterhead.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })
}

async function a4PdfBytes() {
  const pdf = await PDFDocument.create()
  pdf.addPage([595.28, 841.89])
  return pdf.save()
}

// ============================================================================
// Tests
// ============================================================================

test("wordToPDF: A4 DOCX is converted by the iLovePDF Office engine, not re-laid out", async () => {
  const providerPdf = await a4PdfBytes()
  const providerBase64 = Buffer.from(providerPdf).toString("base64")
  const requests = []

  const restore = withBrowserGlobals(async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(
      JSON.stringify({ ok: true, success: true, base64: providerBase64 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  })

  try {
    const services = loadServices({
      getSessionToken: () => TOKEN,
      authHeaders: () => ({ Authorization: `Bearer ${TOKEN}` }),
    })

    const res = await services.wordToPDF(buildA4Docx(services))

    assert.equal(requests.length, 1)
    assert.match(requests[0].url, /\/api\/ilovepdf\/officepdf$/)
    assert.equal(requests[0].init.headers.Authorization, `Bearer ${TOKEN}`)

    const body = JSON.parse(requests[0].init.body)
    assert.equal(body.fileName, "Letterhead.docx")
    assert.ok(body.fileBase64.length > 100)

    // The engine's own PDF is returned verbatim: A4 survives, nothing is redrawn.
    const out = Buffer.from(await res.blob.arrayBuffer())
    assert.deepEqual(out, Buffer.from(providerPdf))
    assert.equal(res.name, "Letterhead-converted.pdf")

    const doc = await PDFDocument.load(out)
    assert.equal(Math.round(doc.getPage(0).getSize().width), 595)
    assert.equal(Math.round(doc.getPage(0).getSize().height), 842)
  } finally {
    restore()
  }
})

test("wordToPDF: falls back to the in-page engine when the Office engine refuses", async () => {
  const requests = []

  const restore = withBrowserGlobals(async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(JSON.stringify({ error: "upstream unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  })

  try {
    const services = loadServices({
      getSessionToken: () => TOKEN,
      authHeaders: () => ({ Authorization: `Bearer ${TOKEN}` }),
    })

    const res = await services.wordToPDF(buildA4Docx(services))

    assert.equal(requests.length, 1)
    const local = Buffer.from(await res.blob.arrayBuffer())
    assert.equal(local.subarray(0, 5).toString("latin1"), "%PDF-")

    // The local renderer is Letter-sized, which is why it is only the fallback.
    const doc = await PDFDocument.load(local)
    assert.equal(doc.getPage(0).getSize().width, 612)
    assert.equal(doc.getPage(0).getSize().height, 792)
  } finally {
    restore()
  }
})

test("wordToPDF: signed-out visitors never upload the document", async () => {
  let fetched = false

  const restore = withBrowserGlobals(async () => {
    fetched = true
    return new Response("{}", { status: 200 })
  })

  try {
    const services = loadServices({
      getSessionToken: () => null,
      authHeaders: () => ({}),
    })

    const res = await services.wordToPDF(buildA4Docx(services))

    assert.equal(fetched, false)
    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.ok(doc.getPageCount() >= 1)
  } finally {
    restore()
  }
})

test("wordToPDF: pasted text still renders locally without a network call", async () => {
  let fetched = false

  const restore = withBrowserGlobals(async () => {
    fetched = true
    return new Response("{}", { status: 200 })
  })

  try {
    const services = loadServices({
      getSessionToken: () => TOKEN,
      authHeaders: () => ({ Authorization: `Bearer ${TOKEN}` }),
    })

    const res = await services.wordToPDF("# Notes\n\nPlain text stays offline.")

    assert.equal(fetched, false)
    assert.ok((await res.blob.arrayBuffer()).byteLength > 0)
  } finally {
    restore()
  }
})
