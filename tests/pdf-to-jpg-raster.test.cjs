const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib")

// services.ts is transpiled to CJS and executed in this realm, so a relative
// dynamic import (./pdfEngine) lands in the require map below and the browser
// globals it guards on are swapped in per test.
function loadServices(requireMap) {
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
      if (requireMap && Object.prototype.hasOwnProperty.call(requireMap, id)) {
        return requireMap[id]
      }
      if (id === "./jobTypes") return {}
      return require(id)
    },
    mod,
    filePath,
    path.dirname(filePath),
  )
  return mod.exports
}

async function makeFixturePdf(pages) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792])
    page.drawRectangle({ x: 100, y: 100, width: 200, height: 200, color: rgb(0.9, 0.1, 0.2) })
    page.drawText(`RASTER PAGE ${i + 1}`, {
      x: 60,
      y: 700,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    })
  }
  const bytes = await doc.save()
  return new File([new Uint8Array(bytes)], "raster.pdf", { type: "application/pdf" })
}

function createRasterProbe() {
  const calls = { getPage: [], render: [], fillText: 0, destroy: 0, toBlob: [] }

  const makeCanvas = () => {
    const ctx = {
      fillStyle: "",
      fillRect: () => {},
      fillText: () => {
        calls.fillText += 1
      },
      drawImage: () => {},
    }
    return {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb, type, quality) => {
        calls.toBlob.push({ type, quality })
        // A JPEG the test can distinguish from the synthetic fallback blob.
        cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9])], { type: "image/jpeg" }))
      },
    }
  }

  const fakeDocument = {
    createElement: () => makeCanvas(),
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  const fakePage = (pageNumber) => ({
    getViewport: ({ scale }) => ({
      width: Math.round(612 * scale),
      height: Math.round(792 * scale),
    }),
    render: ({ canvasContext, viewport }) => {
      calls.render.push({
        pageNumber,
        hasContext: !!canvasContext,
        width: viewport.width,
        height: viewport.height,
      })
      return { promise: Promise.resolve() }
    },
  })

  const fakePdfDoc = {
    numPages: 3,
    getPage: async (n) => {
      calls.getPage.push(n)
      return fakePage(n)
    },
    destroy: async () => {
      calls.destroy += 1
    },
  }

  const fakePdfJs = {
    getDocument: () => ({ promise: Promise.resolve(fakePdfDoc) }),
  }

  return { calls, fakeDocument, fakePdfJs }
}

async function withBrowserGlobals(document, fn) {
  const hadDocument = "document" in globalThis
  const previous = globalThis.document
  globalThis.document = document
  try {
    return await fn()
  } finally {
    if (hadDocument) globalThis.document = previous
    else delete globalThis.document
  }
}

test("pdfToJPG rasterizes the page through pdf.js instead of painting extracted text", async () => {
  const { calls, fakeDocument, fakePdfJs } = createRasterProbe()
  const services = loadServices({
    "./pdfEngine": { getPdfJsLibrary: async () => fakePdfJs },
  })
  const file = await makeFixturePdf(3)

  const res = await withBrowserGlobals(fakeDocument, () =>
    services.pdfToJPG(file, { quality: "high", pageSelection: "first" }),
  )

  assert.deepEqual(calls.getPage, [1], "must ask pdf.js for the requested page (1-indexed)")
  assert.equal(calls.render.length, 1, "must paint the page with pdf.js render()")
  assert.equal(calls.render[0].hasContext, true, "render() needs the canvas 2d context")
  // 612x792 pt at 300 DPI -> 2550x3300 px
  assert.equal(calls.render[0].width, 2550, "must rasterize at the DPI the quality preset promises")
  assert.equal(calls.render[0].height, 3300)
  assert.equal(calls.fillText, 0, "a real page render must not fall back to drawing text lines")
  assert.deepEqual(calls.toBlob, [{ type: "image/jpeg", quality: 0.95 }])
  assert.equal(res.blob.type, "image/jpeg")
  assert.match(res.name, /-page-1\.jpg$/)
  assert.equal(calls.destroy, 1, "the pdf.js document must be released after the job")
})

test("pdfToJPG renders every page once when page selection is all", async () => {
  const { calls, fakeDocument, fakePdfJs } = createRasterProbe()
  const services = loadServices({
    "./pdfEngine": { getPdfJsLibrary: async () => fakePdfJs },
  })
  const file = await makeFixturePdf(3)

  const res = await withBrowserGlobals(fakeDocument, () =>
    services.pdfToJPG(file, { quality: "standard", pageSelection: "all" }),
  )

  assert.deepEqual(calls.getPage, [1, 2, 3])
  assert.equal(calls.render.length, 3)
  assert.equal(calls.render[0].width, 1275, "standard preset is 150 DPI")
  assert.match(res.name, /\.zip$/)
  assert.equal(res.blob.type, "application/zip")
  assert.equal(calls.destroy, 1, "one document is reused for the whole batch")
})

test("pdfToJPG releases the pdf.js document when the job is cancelled", async () => {
  const { calls, fakeDocument, fakePdfJs } = createRasterProbe()
  const services = loadServices({
    "./pdfEngine": { getPdfJsLibrary: async () => fakePdfJs },
  })
  const file = await makeFixturePdf(3)
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    withBrowserGlobals(fakeDocument, () =>
      services.pdfToJPG(file, { pageSelection: "all", signal: controller.signal }),
    ),
    /Cancelled/i,
  )
  assert.equal(calls.destroy, 1, "an aborted job must not leave the worker open")
})

test("pdfToJPG still returns a JPEG when pdf.js is unavailable", async () => {
  const services = loadServices({
    "./pdfEngine": { getPdfJsLibrary: async () => null },
  })
  const file = await makeFixturePdf(1)

  const res = await services.pdfToJPG(file, { quality: "compact" })
  const bytes = new Uint8Array(await res.blob.arrayBuffer())
  assert.equal(res.blob.type, "image/jpeg")
  assert.equal(bytes[0], 0xff)
  assert.equal(bytes[1], 0xd8)
  assert.equal(bytes[bytes.length - 1], 0xd9)
})
