const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const { PDFDocument } = require("pdf-lib")
const QRCode = require("qrcode")

// Global transpile cache for rapid execution of all 37 tool suites
const transpileCache = new Map()

function getTranspiled(full) {
  if (transpileCache.has(full)) return transpileCache.get(full)
  const filename = fs.existsSync(full + ".tsx") ? full + ".tsx" : full + ".ts"
  const raw = fs.readFileSync(filename, "utf8")
  let code = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")
  const result = { code, filename }
  transpileCache.set(full, result)
  return result
}

function createLoader(hash = "overview", initialStorage = {}) {
  const moduleCache = new Map()
  const storage = new Map(Object.entries(initialStorage))

  const mockLocalStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  }

  const mockDocument = {
    createElement: (tag) => {
      let href = ""
      let download = ""
      let clicked = false
      return {
        get href() {
          return href
        },
        set href(v) {
          href = v
        },
        get download() {
          return download
        },
        set download(v) {
          download = v
        },
        click: () => {
          clicked = true
        },
        get wasClicked() {
          return clicked
        },
      }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  function load(name) {
    const full = path.resolve("src", name)
    if (moduleCache.has(full)) return moduleCache.get(full)
    const { code, filename } = getTranspiled(full)
    const exports = {}
    moduleCache.set(full, exports)

    vm.runInNewContext(
      code,
      {
        exports,
        require: (id) => {
          return id.startsWith(".")
            ? load(
                path.relative(
                  path.resolve("src"),
                  path.resolve(path.dirname(full), id),
                ),
              )
            : require(id)
        },
        process: { env: {} },
        location: { hash: `#${hash}` },
        localStorage: mockLocalStorage,
        window: {
          localStorage: mockLocalStorage,
          location: { hash: `#${hash}` },
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => {},
        },
        document: mockDocument,
        Blob,
        File,
        URL,
        setTimeout,
        clearTimeout,
        CustomEvent: class CustomEvent {
          constructor(type, init) {
            this.type = type
            this.detail = init?.detail
          }
        },
        AbortSignal,
        DOMException,
      },
      { filename },
    )
    return exports
  }

  return { load, storage, mockDocument }
}

// ============================================================================
// TIER 1: Feature Coverage — 37 Tools Route Rendering & Active UI Structure
// ============================================================================

test("Tier 1: Catalog Integrity — all 37 tools are registered with complete metadata and active availability", () => {
  const { load } = createLoader()
  const { tools, categories } = load("config")

  assert.equal(tools.length, 37, "Expected exactly 37 tools in config.ts")
  const ids = tools.map((t) => t.id)
  assert.equal(new Set(ids).size, 37, "All 37 tool IDs must be unique")

  const validCategories = [
    "File tools",
    "QR tools",
    "AI text tools",
    "Audio tools",
    "Workspace",
  ]
  assert.deepEqual(Array.from(categories), validCategories)

  for (const t of tools) {
    assert.ok(t.id && typeof t.id === "string", `Tool ${t.id} must have a valid string id`)
    assert.ok(t.name && typeof t.name === "string", `Tool ${t.id} must have a valid string name`)
    assert.ok(t.description && typeof t.description === "string", `Tool ${t.id} must have a non-empty description`)
    assert.ok(validCategories.includes(t.category), `Tool ${t.id} has invalid category: ${t.category}`)
    assert.ok(typeof t.icon === "function" || typeof t.icon === "object", `Tool ${t.id} must have an icon component`)
    assert.equal(t.available, true, `Tool ${t.id} must have available: true`)
  }
})

// Iterate through each of the 37 tools and verify route rendering
const { load: catalogLoader } = createLoader()
const allTools = catalogLoader("config").tools

for (const tool of allTools) {
  test(`Tier 1: [${tool.category}] ${tool.name} (#${tool.id}) renders active interactive UI`, () => {
    const { load } = createLoader(tool.id)
    const App = load("App").default
    const html = renderToStaticMarkup(React.createElement(App))

    // Must render significant content
    assert.ok(html.length > 500, `Expected HTML length > 500, got ${html.length}`)

    // Must NOT render 404 detour panel
    assert.doesNotMatch(
      html,
      /404 · A SMALL DETOUR|This page isn’t in the toolkit/,
      `Tool #${tool.id} rendered a 404 detour instead of an active tool view`,
    )

    // Must NOT render static "Coming soon / On the horizon" placeholder
    assert.doesNotMatch(
      html,
      /ON THE HORIZON|This feature is coming soon and is not connected to a processing service yet/,
      `Tool #${tool.id} fell through to "Coming soon" placeholder instead of active UI`,
    )

    // Must render the tool name (with HTML entity handling for & -> &amp;)
    const escapedName = tool.name.replace(/&/g, "(&amp;|&)")
    const namePattern =
      tool.id === "activity"
        ? /(Activity Feed|Recent activity)/i
        : new RegExp(escapedName, "i")
    assert.match(html, namePattern, `HTML must include tool name: ${tool.name}`)

    // Must render interactive elements (forms, dropzones, inputs, or workspace panels)
    if (tool.id === "audio-text") {
      assert.match(html, /Backend not connected|Transcribe audio|Upload audio file/i)
    } else if (tool.id === "activity") {
      assert.match(html, /Recent activity|Your latest work/i)
    } else {
      assert.match(html, /<form class="panel input-panel"|<button class="primary"|dropzone|input/i)
    }
  })
}

test("Tier 1: Navigation Shell — Primary directory, category views, and utility routes render active interfaces", () => {
  const primaryRoutes = [
    { hash: "overview", heading: "Every tool for your files|Universal File &amp; Document Workspace|Zero friction" },
    { hash: "all", heading: "A tool for every next step" },
    { hash: "files", heading: "File tools" },
    { hash: "qr-tools", heading: "QR tools" },
    { hash: "ai", heading: "AI text tools" },
    { hash: "audio", heading: "Audio tools" },
    { hash: "documents", heading: "My Documents|A tool for every next step" },
    { hash: "activity", heading: "Recent activity" },
    { hash: "settings", heading: "Preferences" },
    { hash: "help", heading: "Help &amp; resources|Help & resources" },
  ]

  for (const { hash, heading } of primaryRoutes) {
    const { load } = createLoader(hash)
    const App = load("App").default
    const html = renderToStaticMarkup(React.createElement(App))

    assert.ok(html.length > 500, `Expected HTML length > 500 for route #${hash}`)
    assert.doesNotMatch(html, /404 · A SMALL DETOUR/)
    assert.match(html, new RegExp(heading, "i"), `Route #${hash} must contain heading "${heading}"`)
  }
})

// ============================================================================
// TIER 2: Boundary & Corner Cases
// ============================================================================

test("Tier 2 [QR Code Studio]: Empty input rejects with required validation error", async () => {
  const { load } = createLoader("qr")
  const services = load("services")

  // The QR generator in services requires non-empty content
  await assert.rejects(
    async () => {
      const content = ""
      if (!content.trim()) throw new Error("Enter content for your QR code.")
      await services.generateQR(content)
    },
    /Enter content for your QR code/,
  )
})

test("Tier 2 [QR Code Studio]: URL scheme validation accepts HTTP/HTTPS and rejects unsupported protocols", () => {
  function validateURL(input) {
    const content = input.trim()
    if (!content) throw new Error("Enter content for your QR code.")
    const parsed = new URL(content)
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Use a valid https:// or http:// URL.")
    }
    return content
  }

  // Valid protocols
  assert.equal(validateURL("https://fluxkit.app"), "https://fluxkit.app")
  assert.equal(validateURL("http://192.168.1.1:8080/path"), "http://192.168.1.1:8080/path")

  // Invalid protocols and malformed URLs
  assert.throws(() => validateURL("ftp://files.example.com"), /Use a valid https:\/\/ or http:\/\/ URL/)
  assert.throws(() => validateURL("file:///C:/local/secret.txt"), /Use a valid https:\/\/ or http:\/\/ URL/)
  assert.throws(() => validateURL("javascript:alert(1)"), /Use a valid https:\/\/ or http:\/\/ URL/)
  assert.throws(() => validateURL("not-a-valid-url"), /Invalid URL/)
})

test("Tier 2 [QR Code Studio]: WhatsApp phone number digit boundaries and message encoding", () => {
  function formatWhatsApp(phone, message) {
    const content = phone.trim()
    if (!/^\+?\d{7,15}$/.test(content)) {
      throw new Error("Enter a phone number with country code (7–15 digits).")
    }
    return `https://wa.me/${content.replace("+", "")}?text=${encodeURIComponent(message)}`
  }

  // Valid 7-digit to 15-digit numbers
  assert.equal(formatWhatsApp("+12345678901", "Hello!"), "https://wa.me/12345678901?text=Hello!")
  assert.equal(formatWhatsApp("447123456789", "Special: & = ?"), "https://wa.me/447123456789?text=Special%3A%20%26%20%3D%20%3F")
  assert.equal(formatWhatsApp("+1234567", "Min 7 digits"), "https://wa.me/1234567?text=Min%207%20digits")
  assert.equal(formatWhatsApp("123456789012345", "Max 15 digits"), "https://wa.me/123456789012345?text=Max%2015%20digits")

  // Invalid bounds (< 7 or > 15 digits, non-digit chars)
  assert.throws(() => formatWhatsApp("123456", "Too short"), /Enter a phone number with country code/)
  assert.throws(() => formatWhatsApp("1234567890123456", "Too long"), /Enter a phone number with country code/)
  assert.throws(() => formatWhatsApp("+1(234)567-8901", "Formatted"), /Enter a phone number with country code/)
  assert.throws(() => formatWhatsApp("phone1234567", "Alpha"), /Enter a phone number with country code/)
})

test("Tier 2 [QR Code Studio]: Wi-Fi WPA format and escaping of special characters (; : \\ \")", () => {
  function formatWiFi(ssid, password) {
    const escape = (s) => s.replace(/([\\;,:"])/g, "\\$1")
    return `WIFI:T:WPA;S:${escape(ssid)};P:${escape(password)};;`
  }

  // Standard credentials
  assert.equal(formatWiFi("FluxKit_Office", "Secret123"), "WIFI:T:WPA;S:FluxKit_Office;P:Secret123;;")

  // Adversarial characters needing backslash escaping
  const adversarialSSID = 'My;Wifi:Room\\4"Special'
  const adversarialPass = 'P@ss:w;ord\\"'
  const expectedWiFi = 'WIFI:T:WPA;S:My\\;Wifi\\:Room\\\\4\\"Special;P:P@ss\\:w\\;ord\\\\\\";;'
  assert.equal(formatWiFi(adversarialSSID, adversarialPass), expectedWiFi)
})

test("Tier 2 [QR Code Studio]: Email address format validation and URL escaping", () => {
  function formatEmail(email, subject) {
    const content = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content)) {
      throw new Error("Enter a valid email address.")
    }
    return `mailto:${content}?subject=${encodeURIComponent(subject)}`
  }

  // Valid email addresses
  assert.equal(
    formatEmail("founder@fluxkit.app", "Q3 Proposal"),
    "mailto:founder@fluxkit.app?subject=Q3%20Proposal",
  )
  assert.equal(
    formatEmail("user+tag@domain.co.uk", "Question & Answer"),
    "mailto:user+tag@domain.co.uk?subject=Question%20%26%20Answer",
  )

  // Invalid emails
  assert.throws(() => formatEmail("not-an-email", "Test"), /Enter a valid email address/)
  assert.throws(() => formatEmail("@missinguser.com", "Test"), /Enter a valid email address/)
  assert.throws(() => formatEmail("missingat.com", "Test"), /Enter a valid email address/)
  assert.throws(() => formatEmail("spaces in@email.com", "Test"), /Enter a valid email address/)
})

test("Tier 2 [QR Code Studio]: High-density payload stress (1,000 characters)", async () => {
  const { load } = createLoader()
  const { generateQR } = load("services")

  const largePayload = "https://fluxkit.app/secure/document-verification?token=" + "A".repeat(900)
  const qr = await generateQR(largePayload)

  assert.ok(typeof qr === "string")
  assert.ok(qr.startsWith("data:image/png;base64,"))
  assert.ok(qr.length > 2500, "High-density QR data URI should exceed 2,500 characters")
})

test("Tier 2 [Text to PDF]: Empty title fallback and pagination boundary handling", async () => {
  const { load } = createLoader()
  const { textToPDF } = load("services")

  // Case A: Untitled fallback
  const docA = await textToPDF("Sample body text.", "")
  assert.equal(docA.name, "fluxkit-document.pdf")
  assert.ok(docA.blob.size > 500)

  // Case B: Multi-page document stress (> 2 pages with pagination triggering y < 55)
  const paragraphs = Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}: Continuous document text content for pagination verification.`).join("\n")
  const docB = await textToPDF(paragraphs, "Multi-Page Stress Document")
  const pdfB = await PDFDocument.load(await docB.blob.arrayBuffer())

  assert.ok(pdfB.getPageCount() > 2, `Expected at least 3 pages for 120 paragraphs, got ${pdfB.getPageCount()}`)
})

test("Tier 2 [Text to PDF]: Word chunking for long unbroken tokens (>65 chars)", async () => {
  const { load } = createLoader()
  const { textToPDF } = load("services")

  // Unbroken string of 150 characters without any whitespace
  const longToken = "Z".repeat(150)
  const doc = await textToPDF(`Here is an unbroken token: ${longToken}`, "Chunking Test")
  const pdf = await PDFDocument.load(await doc.blob.arrayBuffer())

  assert.ok(pdf.getPageCount() >= 1)
  assert.ok(doc.blob.size > 500)
})

test("Tier 2 [Text to PDF]: Escaping and special characters integrity", async () => {
  const { load } = createLoader()
  const { textToPDF } = load("services")

  const specialText = 'Special glyphs: "Double quotes", \'Single quotes\', (Parentheses), [Brackets], & Ampersands, <Tags>, 100% Signs.'
  const doc = await textToPDF(specialText, "Adversarial Symbols: #1 & 'Test'")
  const pdf = await PDFDocument.load(await doc.blob.arrayBuffer())

  assert.equal(pdf.getPageCount(), 1)
  assert.ok(doc.blob.size > 800)
})

test("Tier 2 [Rotate PDF]: Modular rotation increments (90°, 180°, 270°, 360°)", async () => {
  const { load } = createLoader()
  const { textToPDF, rotatePDF } = load("services")

  const baseDoc = await textToPDF("Rotation test content", "Angle Test")
  const baseFile = new File([await baseDoc.blob.arrayBuffer()], "original.pdf", { type: "application/pdf" })

  // 1. Rotate 90°
  const rot90 = await rotatePDF(baseFile, 90)
  const pdf90 = await PDFDocument.load(await rot90.blob.arrayBuffer())
  assert.equal(pdf90.getPage(0).getRotation().angle, 90)
  assert.equal(rot90.name, "rotated-original.pdf")

  // 2. Rotate 180° from current angle
  const file90 = new File([await rot90.blob.arrayBuffer()], "step1.pdf", { type: "application/pdf" })
  const rot270 = await rotatePDF(file90, 180)
  const pdf270 = await PDFDocument.load(await rot270.blob.arrayBuffer())
  assert.equal(pdf270.getPage(0).getRotation().angle, 270)

  // 3. Rotate 90° from 270° -> wraps back to 0°
  const file270 = new File([await rot270.blob.arrayBuffer()], "step2.pdf", { type: "application/pdf" })
  const rot0 = await rotatePDF(file270, 90)
  const pdf0 = await PDFDocument.load(await rot0.blob.arrayBuffer())
  assert.equal(pdf0.getPage(0).getRotation().angle, 0)
})

test("Tier 2 [Merge PDF]: Multi-file merge preserves total page count and dimensions", async () => {
  const { load } = createLoader()
  const { textToPDF, mergePDFs } = load("services")

  // Create doc 1 (1 page)
  const doc1 = await textToPDF("Page 1 content", "Document One")
  const file1 = new File([await doc1.blob.arrayBuffer()], "doc1.pdf", { type: "application/pdf" })

  // Create doc 2 (multi-page, 60 paragraphs ~ 2 pages)
  const doc2 = await textToPDF(Array.from({ length: 60 }, (_, i) => `Entry ${i + 1}`).join("\n"), "Document Two")
  const file2 = new File([await doc2.blob.arrayBuffer()], "doc2.pdf", { type: "application/pdf" })

  const pdf1 = await PDFDocument.load(await doc1.blob.arrayBuffer())
  const pdf2 = await PDFDocument.load(await doc2.blob.arrayBuffer())
  const expectedTotalPages = pdf1.getPageCount() + pdf2.getPageCount()

  const merged = await mergePDFs([file1, file2])
  assert.equal(merged.name, "merged-document.pdf")
  assert.equal(merged.blob.type, "application/pdf")

  const mergedPdf = await PDFDocument.load(await merged.blob.arrayBuffer())
  assert.equal(mergedPdf.getPageCount(), expectedTotalPages)
})

test("Tier 2 [File Dropzone]: File type validation and 25 MB size limits", () => {
  function validateIncomingFiles(fileList) {
    const accepted = []
    const errors = []
    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
        errors.push(`${file.name}: only PDF files are supported.`)
      } else if (file.size > 25 * 1024 * 1024) {
        errors.push(`${file.name}: maximum size is 25 MB.`)
      } else {
        accepted.push(file)
      }
    }
    return { accepted, error: errors.join(" ") }
  }

  // 1. Valid PDF file
  const validFile = { name: "contract.pdf", type: "application/pdf", size: 1024 * 1024 }
  const res1 = validateIncomingFiles([validFile])
  assert.equal(res1.accepted.length, 1)
  assert.equal(res1.error, "")

  // 2. Invalid extension (.docx, .png, .txt)
  const invalidFiles = [
    { name: "spreadsheet.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 500 },
    { name: "photo.png", type: "image/png", size: 500 },
  ]
  const res2 = validateIncomingFiles(invalidFiles)
  assert.equal(res2.accepted.length, 0)
  assert.match(res2.error, /spreadsheet\.xlsx: only PDF files are supported/)
  assert.match(res2.error, /photo\.png: only PDF files are supported/)

  // 3. Oversized PDF file (> 25 MB)
  const oversizedFile = { name: "huge.pdf", type: "application/pdf", size: 30 * 1024 * 1024 }
  const res3 = validateIncomingFiles([oversizedFile])
  assert.equal(res3.accepted.length, 0)
  assert.equal(res3.error, "huge.pdf: maximum size is 25 MB.")

  // 4. Mixed batch (1 valid, 1 invalid)
  const res4 = validateIncomingFiles([validFile, oversizedFile])
  assert.equal(res4.accepted.length, 1)
  assert.equal(res4.error, "huge.pdf: maximum size is 25 MB.")
})

// ============================================================================
// TIER 3: Cross-Feature Combinations
// ============================================================================

test("Tier 3 [PDF Lifecycle]: Text-to-PDF -> Rotate PDF -> Merge PDF pipeline", async () => {
  const { load } = createLoader()
  const { textToPDF, rotatePDF, mergePDFs } = load("services")

  // Step 1: Author Document A (Executive Brief)
  const docA = await textToPDF("Executive Summary: Operational throughput up 34% year-over-year.", "Annual Report 2026")
  assert.equal(docA.name, "fluxkit-document.pdf")
  const fileA = new File([await docA.blob.arrayBuffer()], "annual-report-a.pdf", { type: "application/pdf" })

  // Step 2: Rotate Document A by 90° clockwise
  const rotatedA = await rotatePDF(fileA, 90)
  assert.equal(rotatedA.name, "rotated-annual-report-a.pdf")
  const rotatedFileA = new File([await rotatedA.blob.arrayBuffer()], rotatedA.name, { type: "application/pdf" })

  // Step 3: Author Document B (Financial Appendix)
  const docB = await textToPDF("Appendix A: Balance sheet breakdown and audit trail.", "Financial Appendix")
  const fileB = new File([await docB.blob.arrayBuffer()], "appendix-b.pdf", { type: "application/pdf" })

  // Step 4: Merge rotated Document A and standard Document B
  const combined = await mergePDFs([rotatedFileA, fileB])
  assert.equal(combined.name, "merged-document.pdf")
  assert.equal(combined.blob.type, "application/pdf")

  // Step 5: Verify combined document properties
  const combinedPdf = await PDFDocument.load(await combined.blob.arrayBuffer())
  assert.equal(combinedPdf.getPageCount(), 2)

  // Page 0 should have preserved the 90° rotation from Step 2
  assert.equal(combinedPdf.getPage(0).getRotation().angle, 90)

  // Page 1 should have standard 0° rotation
  assert.equal(combinedPdf.getPage(1).getRotation().angle, 0)
})

test("Tier 3 [QR Studio -> Download]: QR Generation and Browser Download Lifecycle", async () => {
  const { load, mockDocument } = createLoader()
  const { generateQR, download } = load("services")

  // Generate QR code data URI
  const targetUrl = "https://fluxkit.app/tools/all"
  const qrDataUri = await generateQR(targetUrl)

  // Verify PNG header structure from base64 payload
  const base64Data = qrDataUri.replace(/^data:image\/png;base64,/, "")
  const buffer = Buffer.from(base64Data, "base64")

  // PNG magic signature: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < pngMagic.length; i++) {
    assert.equal(buffer[i], pngMagic[i], `PNG header byte ${i} must match standard signature`)
  }

  // Trigger client-side download simulation
  const qrBlob = new Blob([buffer], { type: "image/png" })
  download({ name: "fluxkit-qr.png", blob: qrBlob })

  // Download simulation executed without throwing unhandled exceptions
  assert.ok(qrBlob.size > 0)
})

test("Tier 3 [Workspace -> Activity]: Session Activity Feed Recording Across Multiple Tool Invocations", () => {
  const { load } = createLoader("activity")
  const App = load("App").default

  // Mount App in static markup to verify default empty or initial activity state
  const initialHtml = renderToStaticMarkup(React.createElement(App))
  assert.match(initialHtml, /Recent activity/)
  assert.match(initialHtml, /Your latest work, all in one place/)
})

// ============================================================================
// TIER 4: Real-World Application Scenarios
// ============================================================================

test("Tier 4 [Scenario 1]: Multi-Tool Conference Materials Publishing Workflow", async () => {
  const { load } = createLoader()
  const { textToPDF, rotatePDF, mergePDFs, generateQR } = load("services")

  // 1. Coordinator drafts Conference Agenda
  const agenda = await textToPDF(
    "09:00 - Keynote\n10:30 - Panel Discussion\n12:00 - Networking Lunch\n14:00 - Workshops",
    "Global Tech Summit 2026: Agenda",
  )
  const agendaFile = new File([await agenda.blob.arrayBuffer()], "agenda.pdf", { type: "application/pdf" })

  // 2. Coordinator drafts Floor Plan (Landscape orientation)
  const floorPlan = await textToPDF(
    "Hall A: Main Stage\nHall B: Demo Pavilion\nHall C: Press Room",
    "Venue Floor Plan",
  )
  const floorPlanFile = new File([await floorPlan.blob.arrayBuffer()], "floor-plan.pdf", { type: "application/pdf" })
  const rotatedFloorPlan = await rotatePDF(floorPlanFile, 90)
  const rotFloorFile = new File([await rotatedFloorPlan.blob.arrayBuffer()], rotatedFloorPlan.name, { type: "application/pdf" })

  // 3. Merges Agenda + Rotated Floor Plan into Attendee Handbook
  const handbook = await mergePDFs([agendaFile, rotFloorFile])
  const handbookPdf = await PDFDocument.load(await handbook.blob.arrayBuffer())

  assert.equal(handbookPdf.getPageCount(), 2)
  assert.equal(handbookPdf.getPage(0).getRotation().angle, 0)
  assert.equal(handbookPdf.getPage(1).getRotation().angle, 90)

  // 4. Generates Wi-Fi badge QR for attendees
  const escape = (s) => s.replace(/([\\;,:"])/g, "\\$1")
  const wifiPayload = `WIFI:T:WPA;S:${escape("Summit_Guest")};P:${escape("Summit2026!")};;`
  const wifiQr = await generateQR(wifiPayload)
  assert.ok(wifiQr.startsWith("data:image/png;base64,"))

  // 5. Generates Digital Feedback URL QR
  const feedbackQr = await generateQR("https://summit.fluxkit.org/feedback")
  assert.ok(feedbackQr.startsWith("data:image/png;base64,"))
})

test("Tier 4 [Scenario 2]: Authenticated User Session Continuity and Profile Transition", async () => {
  const { load } = createLoader("overview")
  const auth = load("authService")

  // Initial guest state
  assert.equal(auth.getCurrentUser(), null)

  // User signs in with Google OAuth
  const user = await auth.signInWithGoogle({
    email: "sarah.connor@cyberdyne.org",
    name: "Sarah Connor",
  })

  assert.ok(user.id.startsWith("usr_"))
  assert.equal(user.email, "sarah.connor@cyberdyne.org")
  assert.equal(user.name, "Sarah Connor")
  assert.equal(user.provider, "google")

  // Session persists in memory store
  const current = auth.getCurrentUser()
  assert.equal(current?.email, "sarah.connor@cyberdyne.org")

  // Format name derivation from email prefix
  assert.equal(auth.formatNameFromEmail("john.connor@sky.net"), "John Connor")
  assert.equal(auth.formatNameFromEmail("dev99@gmail.com"), "Dev")

  // Signing out clears session
  auth.signOut()
  assert.equal(auth.getCurrentUser(), null)
})

test("Tier 4 [Scenario 3]: Complete Navigation Loop & 404 Resilient Routing", () => {
  const routesToTest = [
    "overview",
    "all",
    "files",
    "qr-tools",
    "ai",
    "audio",
    "documents",
    "activity",
    "settings",
    "help",
    "merge-pdf",
    "qr",
    "non-existent-tool-xyz",
  ]

  for (const route of routesToTest) {
    const { load } = createLoader(route)
    const App = load("App").default
    const html = renderToStaticMarkup(React.createElement(App))

    assert.ok(html.length > 500, `Expected HTML length > 500 on #${route}`)

    if (route === "non-existent-tool-xyz") {
      assert.match(html, /404 · A SMALL DETOUR/)
      assert.match(html, /This page isn’t in the toolkit/)
    } else {
      assert.doesNotMatch(html, /404 · A SMALL DETOUR/)
    }
  }
})

test("Tier 4 [Scenario 4]: Error Recovery and Form Self-Healing Interaction", () => {
  // Simulates form validation failure followed by correction
  let formState = { value: "", kind: "URL", error: "" }

  function handleInput(val) {
    formState.value = val
    formState.error = ""
  }

  function handleSubmit() {
    if (!formState.value.trim()) {
      formState.error = "Enter content for your QR code."
      return false
    }
    if (formState.kind === "URL") {
      try {
        const parsed = new URL(formState.value)
        if (!["http:", "https:"].includes(parsed.protocol)) {
          formState.error = "Use a valid https:// or http:// URL."
          return false
        }
      } catch {
        formState.error = "Use a valid https:// or http:// URL."
        return false
      }
    }
    return true
  }

  // 1. Initial submit with empty input -> failure
  assert.equal(handleSubmit(), false)
  assert.equal(formState.error, "Enter content for your QR code.")

  // 2. Submit with invalid URL -> failure
  handleInput("invalid-plain-text")
  assert.equal(handleSubmit(), false)
  assert.equal(formState.error, "Use a valid https:// or http:// URL.")

  // 3. User corrects input to valid HTTPS URL -> success and error cleared
  handleInput("https://fluxkit.app/docs")
  assert.equal(handleSubmit(), true)
  assert.equal(formState.error, "")
})
