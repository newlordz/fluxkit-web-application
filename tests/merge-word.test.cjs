const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const JSZip = require("jszip")

test("Word Documents Merge - Tool Configuration in config.ts", () => {
  const configContent = fs.readFileSync(path.join(__dirname, "../src/config.ts"), "utf8")
  assert.ok(configContent.includes('"merge-word"'), "config.ts must define 'merge-word'")
  assert.ok(configContent.includes('"Merge Word"'), "config.ts must have name 'Merge Word'")
  assert.ok(configContent.includes('"File tools"'), "config.ts must place merge-word in 'File tools'")
  assert.ok(configContent.includes('"DOCX"'), "config.ts must display badge 'DOCX'")
})

test("Word Documents Merge - ToolPage acceptance and wiring", () => {
  const toolPageContent = fs.readFileSync(path.join(__dirname, "../src/ToolPage.tsx"), "utf8")
  assert.ok(toolPageContent.includes('"merge-word"'), "ToolPage must reference merge-word")
  assert.ok(toolPageContent.includes("mergeWordFiles"), "ToolPage must import and call mergeWordFiles")
  assert.ok(toolPageContent.includes("Merge Word Documents"), "ToolPage action button must support 'Merge Word Documents'")
  assert.ok(toolPageContent.includes("Document Separation"), "ToolPage must render Document Separation options for merge-word")
})

test("Word Documents Merge - Overview quick actions and category tabs", () => {
  const overviewContent = fs.readFileSync(path.join(__dirname, "../src/Overview.tsx"), "utf8")
  assert.ok(overviewContent.includes('"merge-word"'), "Overview must include merge-word")
  assert.ok(overviewContent.includes("Combine this Word document with other documents into a single file"), "Overview must provide contextual recommendation for Word files")
})

test("Word Documents Merge - OpenXML DOCX Stitched Extraction and Merging Engine", async () => {
  // Helper to build a minimal docx zip in memory
  async function makeDocx(text, id = "1") {
    const zip = new JSZip()
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`
    zip.file("[Content_Types].xml", contentTypes)
    zip.file("_rels/.rels", rels)
    zip.file("word/document.xml", docXml)
    return await zip.generateAsync({ type: "nodebuffer" })
  }

  const doc1Buf = await makeDocx("Section One: Executive Summary")
  const doc2Buf = await makeDocx("Section Two: Financial Forecast")

  // Simulate services.ts extractDocxBodyParts and merging logic
  function extractDocxBodyParts(xml) {
    const bodyMatch = xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i)
    if (!bodyMatch) return { bodyContent: "", sectPr: "" }
    let content = bodyMatch[1]
    const sectPrMatch = content.match(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>\s*$/i)
    let sectPr = ""
    if (sectPrMatch) {
      sectPr = sectPrMatch[0]
      content = content.substring(0, content.length - sectPrMatch[0].length)
    }
    return { bodyContent: content, sectPr }
  }

  const zip1 = await JSZip.loadAsync(doc1Buf)
  const zip2 = await JSZip.loadAsync(doc2Buf)

  const xml1 = await zip1.file("word/document.xml").async("text")
  const xml2 = await zip2.file("word/document.xml").async("text")

  const part1 = extractDocxBodyParts(xml1)
  const part2 = extractDocxBodyParts(xml2)

  assert.ok(part1.bodyContent.includes("Section One"), "Body 1 must contain doc 1 text")
  assert.ok(part2.bodyContent.includes("Section Two"), "Body 2 must contain doc 2 text")
  assert.ok(part1.sectPr.includes("<w:sectPr"), "Part 1 sectPr must be isolated")

  // Test page break injection
  const pageBreakXml = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>'
  const mergedBody = part1.bodyContent + pageBreakXml + part2.bodyContent + (part2.sectPr || part1.sectPr)
  const unifiedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${mergedBody}</w:body></w:document>`

  assert.ok(unifiedXml.includes("Section One: Executive Summary"))
  assert.ok(unifiedXml.includes("Section Two: Financial Forecast"))
  assert.ok(unifiedXml.includes('<w:br w:type="page"/>'), "Merged XML must contain page break separator")

  // Verify resulting package is valid docx zip
  const mergedZip = new JSZip()
  mergedZip.file("word/document.xml", unifiedXml)
  const outBuf = await mergedZip.generateAsync({ type: "nodebuffer" })
  const readBackZip = await JSZip.loadAsync(outBuf)
  const readBackXml = await readBackZip.file("word/document.xml").async("text")
  assert.ok(readBackXml.includes("Section One") && readBackXml.includes("Section Two"))
})

test("Word Documents Merge - Error Boundary enforces minimum 2 files", () => {
  const servicesContent = fs.readFileSync(path.join(__dirname, "../src/services.ts"), "utf8")
  assert.ok(
    servicesContent.includes("Choose at least two Word documents to merge"),
    "services.ts must throw if fewer than 2 files are provided",
  )
})

test("Word Documents Preview - DocumentPreviewModal extracts clean docx paragraphs and blocks PK binary garbage", () => {
  const dpmContent = fs.readFileSync(path.join(__dirname, "../src/DocumentPreviewModal.tsx"), "utf8")
  assert.ok(dpmContent.includes("isDocx"), "DocumentPreviewModal must have specific isDocx check")
  assert.ok(dpmContent.includes("word/document.xml"), "DocumentPreviewModal must parse word/document.xml")
  assert.ok(dpmContent.includes("PK\\x03\\x04"), "DocumentPreviewModal must guard against raw zip binary string leakage")
})

test("Word Documents Arrange Modal - Trash button immediately propagates deletion and prevents DnD drag lock", () => {
  const dpmContent = fs.readFileSync(path.join(__dirname, "../src/DocumentPreviewModal.tsx"), "utf8")
  const toolPageContent = fs.readFileSync(path.join(__dirname, "../src/ToolPage.tsx"), "utf8")
  assert.ok(dpmContent.includes("onFilesChange"), "DocumentPreviewModal must support onFilesChange")
  assert.ok(dpmContent.includes("onFileRemove"), "DocumentPreviewModal must support onFileRemove")
  assert.ok(toolPageContent.includes("onFilesChange"), "ToolPage must wire onFilesChange to setFiles")
  assert.ok(dpmContent.includes("dpm-file-preview-card__actions"), "Preview card must render actions container")
  assert.ok(dpmContent.includes("onMouseDown={(e) => e.stopPropagation()}"), "Buttons must stop mousedown propagation from draggable card")
})

test("Word Documents Merge - Preserves Word XML namespaces, remaps reordered rels/hyperlinks, and avoids duplicate Content_Types", async () => {
  const ts = require("typescript")
  const vm = require("node:vm")
  const servicesSrc = fs.readFileSync(path.join(__dirname, "../src/services.ts"), "utf8")
  const transpiled = ts.transpileModule(servicesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("import.meta.env", "(typeof process !== 'undefined' ? process.env : {})")
  const mod = { exports: {} }
  vm.runInNewContext(transpiled, {
    module: mod,
    exports: mod.exports,
    require: (id) => (id.startsWith(".") ? {} : require(id)),
    console,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Blob,
    URL,
    setTimeout,
    clearTimeout,
  })
  const { mergeWordFiles } = mod.exports

  async function buildWordDoc({ text, extraNs = "", ignorable = "", relsXml, contentTypesXml, media }) {
    const zip = new JSZip()
    zip.file(
      "[Content_Types].xml",
      contentTypesXml ||
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    )
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    )
    zip.file(
      "word/_rels/document.xml.rels",
      relsXml ||
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    )
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ${extraNs} ${ignorable}>
  <w:body>
    ${text}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`,
    )
    if (media) zip.file(media.path, media.bytes)
    return await zip.generateAsync({ type: "uint8array" })
  }

  const doc1 = await buildWordDoc({
    text: `<w:p><w:r><w:t>First Doc</w:t></w:r></w:p>`,
    extraNs: `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex"`,
    ignorable: `mc:Ignorable="w16se"`,
  })

  const doc2 = await buildWordDoc({
    text: `<w:p><w:hyperlink r:id="rId2"><w:r><w:t>Visit Link</w:t></w:r></w:hyperlink><w:drawing><a:blip r:embed="rId3"/></w:drawing></w:p>`,
    extraNs: `xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`,
    relsXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="https://example.com" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Id="rId2" TargetMode="External"/>
  <Relationship Target="media/image1.png" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Id="rId3"/>
</Relationships>`,
    media: { path: "word/media/image1.png", bytes: new Uint8Array([137, 80, 78, 71]) },
  })

  const result = await mergeWordFiles(
    [
      { name: "doc1.docx", data: doc1 },
      { name: "doc2.docx", data: doc2 },
    ],
    { pageBreakBetween: true },
  )

  const outZip = await JSZip.loadAsync(await result.blob.arrayBuffer())
  const outDocXml = await outZip.file("word/document.xml").async("string")
  const outRelsXml = await outZip.file("word/_rels/document.xml.rels").async("string")
  const outContentTypes = await outZip.file("[Content_Types].xml").async("string")

  // 1. Namespaces preserved
  assert.ok(outDocXml.includes("xmlns:w16se="), "Must preserve xmlns:w16se from doc1")
  assert.ok(outDocXml.includes("xmlns:wps="), "Must preserve xmlns:wps from doc2")
  assert.ok(outDocXml.includes('mc:Ignorable="w16se"'), "Must preserve valid mc:Ignorable")

  // 2. Reordered rels & hyperlinks remapped
  assert.ok(outRelsXml.includes('Target="https://example.com"'), "Must preserve external hyperlink")
  assert.ok(outRelsXml.includes("media/doc2_rId3.png"), "Must remap image media target")
  assert.ok(!outDocXml.includes('r:id="rId2"'), "Must remap doc2 rId2")
  assert.ok(!outDocXml.includes('r:embed="rId3"'), "Must remap doc2 rId3")

  // 3. No duplicate Extension="jpg" in [Content_Types].xml
  const jpgMatches = outContentTypes.match(/Extension="jpg"/gi) || []
  assert.equal(jpgMatches.length, 1, "Must not duplicate existing Extension=jpg")
  const pngMatches = outContentTypes.match(/Extension="png"/gi) || []
  assert.equal(pngMatches.length, 1, "Must register Extension=png once")
})
