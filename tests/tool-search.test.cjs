const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadModule(name) {
  const filePath = path.resolve("src", name)
  const code = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, console, RegExp, Map, Set, Array, String }, {
    filename: filePath,
  })
  return exports
}

const {
  expandSearchTerms,
  getHighlightTerms,
  highlightSegments,
  rankToolSearch,
  tokenizeSearchQuery,
} = loadModule("toolSearch.ts")

const sampleTools = [
  {
    id: "merge-pdf",
    name: "Merge PDF",
    description: "Combine PDFs in the order you want with the easiest PDF merger available.",
    category: "File tools",
    formatBadge: "PDF",
    popular: true,
  },
  {
    id: "merge-compress",
    name: "Merge & Compress",
    description: "Package documents in a smaller, email-ready bundle.",
    category: "File tools",
  },
  {
    id: "split-pdf",
    name: "Split PDF",
    description: "Separate one page or a whole set into independent PDF files.",
    category: "File tools",
    formatBadge: "PDF",
  },
  {
    id: "compress",
    name: "Compress PDF",
    description: "Reduce file size while optimizing for maximal PDF quality and quick sharing.",
    category: "File tools",
    formatBadge: "-70% SIZE",
    popular: true,
  },
  {
    id: "sign-pdf",
    name: "Sign PDF",
    description: "Place a drawn or typed signature on a page. A visual stamp, not a verified e-signature.",
    category: "File tools",
    formatBadge: "PDF",
  },
  {
    id: "pdf-to-word",
    name: "PDF to Word",
    description: "Easily convert your PDF files into editable DOC and DOCX documents with high accuracy.",
    category: "File tools",
  },
  {
    id: "qr-generate",
    name: "QR Generator",
    description: "Create a QR code for a link, text, or contact card.",
    category: "QR tools",
    formatBadge: "PNG",
  },
]

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function ids(matches) {
  return plain(matches.map((match) => match.tool.id))
}

test("search tokens drop filler words and normalize plurals", () => {
  assert.deepEqual(plain(tokenizeSearchQuery("How do I merge PDFs?")), ["merge", "pdf"])
  assert.deepEqual(plain(tokenizeSearchQuery("  ")), [])
})

test("exact tool-name matches rank above description-only matches", () => {
  const matches = rankToolSearch(sampleTools, "merge pdf")
  assert.equal(matches[0].tool.id, "merge-pdf")
  assert.equal(matches[0].matchedOn, "name")
  assert.ok(!ids(matches).includes("qr-generate"))
})

test("synonyms find tools by the words people actually type", () => {
  assert.equal(ids(rankToolSearch(sampleTools, "combine"))[0], "merge-pdf")
  assert.equal(ids(rankToolSearch(sampleTools, "shrink"))[0], "compress")
  assert.equal(ids(rankToolSearch(sampleTools, "signature"))[0], "sign-pdf")
  assert.equal(ids(rankToolSearch(sampleTools, "make smaller"))[0], "compress")
})

test("every query token must match, so mixed queries stay focused", () => {
  const matches = ids(rankToolSearch(sampleTools, "merge qr"))
  assert.deepEqual(matches, [])
  assert.deepEqual(ids(rankToolSearch(sampleTools, "split pdf")), ["split-pdf"])
})

test("phrase queries boost the tool whose name reads like the query", () => {
  const matches = rankToolSearch(sampleTools, "pdf to word")
  assert.equal(matches[0].tool.id, "pdf-to-word")
  assert.ok(matches[0].score > (matches[1]?.score ?? 0))
})

test("empty and unmatched queries return no ranked matches", () => {
  assert.deepEqual(plain(rankToolSearch(sampleTools, "")), [])
  assert.deepEqual(plain(rankToolSearch(sampleTools, "   ")), [])
  assert.deepEqual(plain(rankToolSearch(sampleTools, "spaceship")), [])
})

test("highlight terms expand synonyms but skip single letters", () => {
  const terms = getHighlightTerms("shrink")
  assert.ok(terms.includes("shrink"))
  assert.ok(terms.includes("compress"))
  assert.ok(terms.includes("reduce"))
  assert.ok(expandSearchTerms("a merge").includes("merge"))
  assert.ok(!getHighlightTerms("a merge").includes("a"))
})

test("highlight segments mark matched text and respect word boundaries", () => {
  const merged = highlightSegments("Merge PDF", ["merge", "pdf"])
  assert.deepEqual(
    plain(merged.map((segment) => [segment.text, segment.match])),
    [
      ["Merge", true],
      [" ", false],
      ["PDF", true],
    ],
  )

  const password = highlightSegments("password", ["word"])
  assert.deepEqual(plain(password), [{ text: "password", match: false }])

  const signature = highlightSegments("typed signature", ["sign"])
  assert.deepEqual(
    plain(signature.map((segment) => segment.text)),
    ["typed ", "sign", "ature"],
  )
})
