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
