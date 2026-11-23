const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument, StandardFonts } = require("pdf-lib")

// ============================================================================
// Merge resilience & split progress (services.ts engine, no DOM needed)
// ============================================================================

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

const services = loadServices()

async function createTestPDF(pageCount = 1, text = "Resilient Merge") {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([600, 400])
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 350, size: 14, font })
  }
  return doc.save()
}

function toFile(name, bytes, type = "application/pdf") {
  const blob = new Blob([bytes], { type })
  return new File([blob], name, { type, lastModified: Date.now() })
}

test("Suite: merge skip-and-report & split progress", async (t) => {
  await t.test("M.1 one corrupt file does not destroy the other pages", async () => {
    const good = [
      toFile("alpha.pdf", await createTestPDF(2, "Alpha")),
      toFile("beta.pdf", await createTestPDF(3, "Beta")),
      toFile("gamma.pdf", await createTestPDF(1, "Gamma")),
    ]

    const corrupt = toFile("broken.pdf", new Uint8Array([1, 2, 3, 4, 5]))
    const empty = toFile("blank.pdf", new Uint8Array(0))

    const res = await services.mergePDFs([...good, corrupt, empty])

    assert.equal(res.pageCount, 6, "the three readable documents are merged")
    assert.equal(res.breakdown.length, 3)
    assert.deepEqual(
      res.breakdown.map((b) => b.name),
      ["alpha.pdf", "beta.pdf", "gamma.pdf"],
    )

    assert.equal(res.skipped.length, 2, "both unreadable files are reported")
    assert.deepEqual(
      res.skipped.map((s) => s.name),
      ["broken.pdf", "blank.pdf"],
    )
    assert.match(res.skipped[1].reason, /empty/i)
    for (const item of res.skipped) assert.ok(item.reason.length > 0)

    const out = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(out.getPageCount(), 6, "the merged output is still valid")
  })

  await t.test("M.2 clean merge reports no skipped files", async () => {
    const files = [
      toFile("one.pdf", await createTestPDF(1, "One")),
      toFile("two.pdf", await createTestPDF(2, "Two")),
    ]

    const res = await services.mergePDFs(files)

    assert.equal(res.skipped, undefined)
    assert.equal(res.pageCount, 3)
  })

  await t.test("M.3 when nothing can be read the job fails with a real reason", async () => {
    const files = [
      toFile("junk-a.pdf", new Uint8Array([0, 1, 2, 3])),
      toFile("junk-b.pdf", new Uint8Array([9, 8, 7])),
    ]

    await assert.rejects(() => services.mergePDFs(files), (err) => {
      assert.match(err.message, /None of the 2 PDFs could be read/)
      return true
    })
  })

  await t.test("M.4 cancellation still aborts instead of skipping the rest", async () => {
    const controller = new AbortController()

    const files = [
      toFile("first.pdf", await createTestPDF(1, "First")),
      toFile("second.pdf", await createTestPDF(1, "Second")),
      toFile("third.pdf", await createTestPDF(1, "Third")),
    ]

    const originalLoad = PDFDocument.load

    let seen = 0

    PDFDocument.load = async (...args) => {
      const rows = await originalLoad(...args)
      seen += 1
      if (seen === 2) controller.abort()
      return rows
    }

    try {
      await assert.rejects(
        () => services.mergePDFs(files, undefined, controller.signal),
        /Cancelled\./,
      )
    } finally {
      PDFDocument.load = originalLoad
    }
  })

  await t.test("M.5 Merge & Compress keeps readable files and honest numbers", async () => {
    const good = [
      toFile("keep-a.pdf", await createTestPDF(3, "KeepA")),
      toFile("keep-b.pdf", await createTestPDF(2, "KeepB")),
    ]

    const junk = toFile("junk.pdf", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))

    const res = await services.mergeAndCompress([...good, junk], {
      compressLevel: "standard",

      stripMetadata: true,
    })

    assert.equal(res.skipped.length, 1, "the unreadable file is reported")
    assert.equal(res.skipped[0].name, "junk.pdf")

    const mergedBytes = good.reduce((acc, f) => acc + f.size, 0)

    assert.equal(
      res.originalSize,
      mergedBytes,
      "the baseline excludes bytes that never reached the compressor",
    )
    assert.ok(res.savedPercentage <= 100)

    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(doc.getPageCount(), 5, "both readable documents survived")
  })

  await t.test("M.6 an oversized merge is refused before parsing starts", async () => {
    const huge = (name) => ({
      name,

      type: "application/pdf",

      size: 55 * 1024 * 1024,

      arrayBuffer: async () => new ArrayBuffer(0),
    })

    await assert.rejects(
      () => services.mergePDFs([huge("huge-a.pdf"), huge("huge-b.pdf")]),
      (err) => {
        assert.match(err.message, /total 110\.0 MB/)
        assert.match(err.message, /batches of up to 100 MB/)
        return true
      },
    )

    // the guard only refuses, it never silently trims
    const res = await services.mergePDFs([
      toFile("small-a.pdf", await createTestPDF(1, "Small")),
      toFile("small-b.pdf", await createTestPDF(1, "Small")),
    ])
    assert.equal(res.pageCount, 2)
  })

  await t.test("S.1 split reports progress from 0 to 100", async () => {
    const file = toFile("pages.pdf", await createTestPDF(6, "Progress"))

    const events = []

    const res = await services.splitPDF(file, "all", undefined, {
      onProgress: (p) => events.push(p),
    })

    assert.ok(events.length >= 6, "each part reports a step")
    assert.equal(events[0].percentage, 5)
    assert.equal(events[events.length - 1].percentage, 100)

    const percentages = events.map((e) => e.percentage)
    assert.deepEqual(
      percentages,
      [...percentages].sort((a, b) => a - b),
      "progress never moves backwards",
    )

    for (const e of events) {
      assert.equal(e.total, 6)
      assert.ok(e.current <= e.total)
      assert.ok(e.stage.length > 0)
    }

    assert.equal(res.pieces.length, 6)
    const combined = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(combined.getPageCount(), 6)
  })

  await t.test("S.2 chained pipelines skip the pieces they never read", async () => {
    const file = toFile("pages.pdf", await createTestPDF(5, "Chain"))

    const res = await services.splitPDF(file, "all", undefined, {
      buildPieces: false,
    })

    assert.equal(res.pieces, undefined, "no per-page documents are built")

    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(doc.getPageCount(), 5, "the combined output is unchanged")
  })

  await t.test("S.3 split-compress range path skips the throwaway piece builds", async () => {
    const file = toFile("pages.pdf", await createTestPDF(6, "SplitCompress"))

    const events = []

    const res = await services.splitAndCompress(file, {
      splitMode: "range",

      pageRange: "2-4",

      compressLevel: "standard",

      onProgress: (evt) => events.push(evt),
    })

    const doc = await PDFDocument.load(await res.blob.arrayBuffer())
    assert.equal(doc.getPageCount(), 3, "pages 2 through 4 are extracted")
    assert.equal(res.finalSize > 0, true)

    const splitting = events.filter((e) => e.stage === "splitting")
    assert.ok(splitting.length >= 3, "the splitting stage reports real steps")

    const stageProgress = splitting.map((e) => e.stageProgress)
    assert.deepEqual(
      stageProgress,
      [...stageProgress].sort((a, b) => a - b),
      "the chain's progress never moves backwards",
    )

    assert.ok(
      splitting.some((e) => /assembling/i.test(e.message || "")),
      "the combined document is reported as its own step",
    )
  })
})
