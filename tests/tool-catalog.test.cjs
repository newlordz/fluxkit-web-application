const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadSource(name, overrides = {}, globals = {}) {
  const cache = new Map()
  function load(id) {
    const full = path.resolve("src", id)
    if (cache.has(full)) return cache.get(full)
    const filename = fs.existsSync(full) ? full : fs.existsSync(`${full}.tsx`) ? `${full}.tsx` : `${full}.ts`
    const exports = {}
    cache.set(full, exports)
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    vm.runInNewContext(
      code,
      {
        exports,
        require: (request) => {
          if (overrides[request]) return overrides[request]
          if (!request.startsWith(".")) return require(request)
          return load(path.relative(path.resolve("src"), path.resolve(path.dirname(full), request)))
        },
        ...globals,
      },
      { filename },
    )
    return exports
  }
  return load(name)
}

const catalog = loadSource("toolCatalog")
const { tools } = loadSource("config")
const entries = catalog.catalogTools

test("the catalog exposes one card per merged group and standalone tool", () => {
  assert.equal(entries.length, 45)
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 45)
  assert.equal(entries.filter((entry) => entry.badge).length, 8)
})

test("merged cards carry their group label, blurb and badge", () => {
  const pair = entries.find((entry) => entry.id === "pdf-to-word")
  assert.equal(pair.name, "PDF ↔ Word")
  assert.equal(pair.badge, "2-WAY")
  assert.deepEqual(Array.from(pair.memberIds), ["pdf-to-word", "word-to-pdf"])

  const family = entries.find((entry) => entry.id === "merge-pdf")
  assert.equal(family.name, "Merge & Split")
  assert.equal(family.badge, "3 TOOLS")
  assert.deepEqual(
    Array.from(family.memberIds),
    ["merge-pdf", "split-pdf", "merge-word"],
  )

  const image = entries.find((entry) => entry.id === "image-crop")
  assert.equal(image.name, "Image Studio")
  assert.deepEqual(
    Array.from(image.memberIds),
    ["image-crop", "image-resize", "passport-photo"],
  )

  const qr = entries.find((entry) => entry.id === "qr-scanner")
  assert.equal(qr.name, "QR Codes & Passes")
  assert.equal(qr.badge, "5 TOOLS")
  assert.deepEqual(
    Array.from(qr.memberIds),
    ["qr-scanner", "qr-vcard", "qr-event", "qr-batch", "visitor-pass"],
  )

  const studio = entries.find((entry) => entry.id === "qr")
  assert.equal(studio.name, "QR Code Studio")
  assert.equal(studio.badge, undefined)
})

test("standalone tools keep their own name and members", () => {
  const compress = entries.find((entry) => entry.id === "compress")
  assert.equal(compress.name, "Compress PDF")
  assert.equal(compress.badge, undefined)
  assert.deepEqual(Array.from(compress.memberIds), ["compress"])
})

test("every tool id maps to a visible catalog card", () => {
  const ids = new Set(entries.map((entry) => entry.id))
  for (const tool of tools) {
    assert.ok(ids.has(catalog.catalogIdFor(tool.id)), tool.id)
  }
  assert.equal(catalog.catalogIdFor("word-to-pdf"), "pdf-to-word")
  assert.equal(catalog.catalogIdFor("merge-word"), "merge-pdf")
  assert.equal(catalog.catalogIdFor("passport-photo"), "image-crop")
  assert.equal(catalog.catalogIdFor("qr-vcard"), "qr-scanner")
  assert.equal(catalog.catalogIdFor("visitor-pass"), "qr-scanner")
  assert.equal(catalog.catalogIdFor("qr"), "qr")
  assert.equal(catalog.catalogIdFor("compress"), "compress")
})
