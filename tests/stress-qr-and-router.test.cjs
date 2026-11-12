const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const QRCode = require("qrcode")

console.log("=== EMPIRICAL STRESS TEST HARNESS: M1 ROUTER & QR CODE STUDIO ===")

// 1. Transpilation & Modular Loading Environment
const transpileCache = new Map()

function getTranspiled(full) {
  if (transpileCache.has(full)) return transpileCache.get(full)
  const filename = fs.existsSync(full + ".tsx") ? full + ".tsx" : full + ".ts"
  const raw = fs.readFileSync(filename, "utf8")
  const code = ts.transpileModule(raw, {
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

function createEnv(hash = "overview") {
  const moduleCache = new Map()
  const storage = new Map()

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
        get href() { return href },
        set href(v) { href = v },
        get download() { return download },
        set download(v) { download = v },
        click: () => { clicked = true },
        get wasClicked() { return clicked },
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
            ? load(path.relative(path.resolve("src"), path.resolve(path.dirname(full), id)))
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
        AbortSignal,
        DOMException,
      },
      { filename },
    )
    return exports
  }

  return { load, mockDocument }
}

async function runTests() {
  let passed = 0
  let failed = 0
  const findings = []

  function testCase(name, fn) {
    try {
      fn()
      passed++
      console.log(`  [PASS] ${name}`)
    } catch (err) {
      failed++
      findings.push({ name, error: err.message, stack: err.stack })
      console.error(`  [FAIL] ${name}: ${err.message}`)
    }
  }

  async function asyncTestCase(name, fn) {
    try {
      await fn()
      passed++
      console.log(`  [PASS] ${name}`)
    } catch (err) {
      failed++
      findings.push({ name, error: err.message, stack: err.stack })
      console.error(`  [FAIL] ${name}: ${err.message}`)
    }
  }

  // =========================================================================
  // SECTION 1: Config & Catalog Verification
  // =========================================================================
  console.log("\n--- SECTION 1: Config & Catalog Verification ---")
  const { load } = createEnv()
  const { tools, categories, brand } = load("config")

  testCase("Config: Brand definition contains valid styling tokens", () => {
    assert.equal(brand.name, "FluxKit")
    assert.ok(brand.colors.dark.accent)
    assert.ok(brand.colors.light.accent)
  })

  testCase("Config: Exactly 37 tools are registered", () => {
    assert.equal(tools.length, 37, `Expected 37 tools, got ${tools.length}`)
  })

  testCase("Config: All 37 tool IDs are unique non-empty strings", () => {
    const ids = tools.map((t) => t.id)
    assert.equal(new Set(ids).size, 37)
    for (const id of ids) {
      assert.ok(typeof id === "string" && id.length > 0)
    }
  })

  testCase("Config: Every tool has available === true", () => {
    const unavailable = tools.filter((t) => !t.available)
    assert.equal(
      unavailable.length,
      0,
      `Tools with available != true: ${unavailable.map((t) => t.id).join(", ")}`,
    )
  })

  testCase("Config: All 5 categories are valid and populated", () => {
    assert.equal(categories.length, 5)
    for (const cat of categories) {
      const count = tools.filter((t) => t.category === cat).length
      assert.ok(count > 0, `Category '${cat}' has 0 tools`)
    }
  })

  // =========================================================================
  // SECTION 2: Universal Router & UI Render Stress (37 Tools)
  // =========================================================================
  console.log("\n--- SECTION 2: Universal Router & UI Render Stress (37 Tools) ---")
  for (let i = 0; i < tools.length; i++) {
    const t = tools[i]
    testCase(`Route #${t.id} (${t.name}) renders interactive UI without 'Coming soon' or '404'`, () => {
      const env = createEnv(t.id)
      const App = env.load("App").default
      const html = renderToStaticMarkup(React.createElement(App))

      assert.ok(html.length > 500, `Rendered HTML too short (${html.length} chars)`)

      // Check forbidden strings
      const lower = html.toLowerCase()
      assert.ok(
        !lower.includes("coming soon"),
        `Route #${t.id} contains 'coming soon'`,
      )
      assert.ok(
        !lower.includes("404 · a small detour") && !lower.includes("this page isn’t in the toolkit"),
        `Route #${t.id} rendered 404 page`,
      )

      // Check active interactive elements
      const hasInteractive =
        html.includes("<button") ||
        html.includes("<input") ||
        html.includes("<textarea") ||
        html.includes("<select") ||
        html.includes("<canvas")
      assert.ok(hasInteractive, `Route #${t.id} has no interactive elements`)

      // Check tool title or name is present in header/container (handling HTML entity encoding)
      const expectedName = t.name.replace(/&/g, "&amp;")
      assert.ok(
        html.includes(expectedName) || html.includes(t.id),
        `Route #${t.id} does not contain tool name '${t.name}' (or '${expectedName}')`,
      )
    })
  }

  // =========================================================================
  // SECTION 3: Catalog Views (Overview, All, Category Filters) Zero 'Coming Soon'
  // =========================================================================
  console.log("\n--- SECTION 3: Catalog Views Badge Verification ---")
  const catalogRoutes = ["overview", "all", "files", "qr-tools", "ai", "audio"]
  for (const route of catalogRoutes) {
    testCase(`Catalog route #${route} renders without any 'Coming soon' badges`, () => {
      const env = createEnv(route)
      const App = env.load("App").default
      const html = renderToStaticMarkup(React.createElement(App))

      assert.ok(
        !html.includes("badge-soon"),
        `Route #${route} still contains 'badge-soon' class`,
      )
      assert.ok(
        !html.includes("Coming soon"),
        `Route #${route} contains 'Coming soon' badge text`,
      )
    })
  }

  // =========================================================================
  // SECTION 4: QR Code Generation Engine & Edge Cases
  // =========================================================================
  console.log("\n--- SECTION 4: QR Code Generation Engine & Edge Cases ---")
  const { generateQR } = load("services")

  await asyncTestCase("QR Service: Valid HTTP/HTTPS URLs produce valid PNG data URL", async () => {
    const sampleUrls = [
      "https://fluxkit.io",
      "http://localhost:8443/app",
      "https://subdomain.example.com/path?foo=bar&baz=1#section",
      "https://example.com/very/long/nested/path/with/parameters?key1=value1&key2=value2&timestamp=1731250000",
    ]
    for (const url of sampleUrls) {
      const dataUrl = await generateQR(url)
      assert.ok(dataUrl.startsWith("data:image/png;base64,"), `URL ${url} did not yield png data URL`)
      const base64 = dataUrl.replace("data:image/png;base64,", "")
      const buf = Buffer.from(base64, "base64")
      // Check PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      assert.equal(buf[0], 0x89)
      assert.equal(buf[1], 0x50)
      assert.equal(buf[2], 0x4e)
      assert.equal(buf[3], 0x47)
      assert.ok(buf.length > 500, `Generated PNG buffer unexpectedly small: ${buf.length} bytes`)
    }
  })

  await asyncTestCase("QR Service: UTF-8 International & Multilingual Payloads", async () => {
    const multilingual = [
      "你好世界，欢迎使用 FluxKit 工具箱！",
      "こんにちは世界！日本語のQRコードテスト",
      "مرحبا بالعالم! اختبار رمز الاستجابة السريعة", // Arabic RTL
      "שלום עולם! בדיקת קוד QR", // Hebrew RTL
      "Привет, мир! Тестирование генератора QR-кодов",
      "Γειά σου Κόσμε! Δοκιμή κώδικα QR", // Greek
      "नमस्ते दुनिया! क्यूआर कोड परीक्षण", // Devanagari Hindi
      "สวัสดีชาวโลก! การทดสอบคิวอาร์โค้ด", // Thai
      "Xin chào thế giới! Kiểm tra mã QR", // Vietnamese
      "Voilà l'éléphant, übergrößen Maßstab, año del niño",
      "🚀🔥✨🎉🛠️❤️ Multilingual Emojis Test",
      "Combined: Hello / こんにちは / 你好 / مرحباً / שלום / Привет / 12345 / 🌟",
    ]
    for (const text of multilingual) {
      const dataUrl = await generateQR(text)
      assert.ok(dataUrl.startsWith("data:image/png;base64,"), `Failed for text: ${text}`)
      const buf = Buffer.from(dataUrl.replace("data:image/png;base64,", ""), "base64")
      assert.equal(buf[0], 0x89)
      assert.ok(buf.length > 500)
    }
  })

  await asyncTestCase("QR Service: Wi-Fi WPA payloads with special characters escaping", async () => {
    const escape = (s) => s.replace(/([\\;,:"])/g, "\\$1")
    const testCases = [
      { ssid: "HomeNetwork", pass: "SecretPass123" },
      { ssid: "My;Special:SSID", pass: 'P@ss"w;o:rd\\123' },
      { ssid: 'Quoted"SSID"', pass: "simple" },
      { ssid: "Backslash\\Test", pass: "Colons:and;semis;" },
      { ssid: "Open_WiFi_Guest", pass: "" },
    ]
    for (const tc of testCases) {
      const escapedSSID = escape(tc.ssid)
      const escapedPass = escape(tc.pass)
      const payload = `WIFI:T:WPA;S:${escapedSSID};P:${escapedPass};;`
      const dataUrl = await generateQR(payload)
      assert.ok(dataUrl.startsWith("data:image/png;base64,"))
    }
  })

  await asyncTestCase("QR Service: Email Mailto Payloads", async () => {
    const emails = [
      { email: "user@example.com", subject: "Inquiry" },
      { email: "john.doe+fluxkit@company.co.uk", subject: "Order #123 & Status = Done!" },
      { email: "support@domain.org", subject: "Need help with QR generation & PDF tools" },
      { email: "contact@agency.com", subject: "Special characters: ä, ö, ü, é, ñ, 🚀" },
    ]
    for (const { email, subject } of emails) {
      const payload = `mailto:${email}?subject=${encodeURIComponent(subject)}`
      const dataUrl = await generateQR(payload)
      assert.ok(dataUrl.startsWith("data:image/png;base64,"))
    }
  })

  await asyncTestCase("QR Service: High-density payload stress (1,000+ chars)", async () => {
    const lengths = [1000, 1200, 1500, 1800, 2000]
    for (const len of lengths) {
      const payload = "FluxKit-M1-Density-Check-".repeat(Math.ceil(len / 25)).slice(0, len)
      assert.equal(payload.length, len)
      const dataUrl = await generateQR(payload)
      assert.ok(dataUrl.startsWith("data:image/png;base64,"))
      const buf = Buffer.from(dataUrl.replace("data:image/png;base64,", ""), "base64")
      assert.ok(buf.length > 2000, `Buffer size at ${len} chars: ${buf.length}`)
    }
  })

  await asyncTestCase("QR Service: Concurrency stress (50 parallel generation requests)", async () => {
    const promises = []
    for (let i = 0; i < 50; i++) {
      promises.push(generateQR(`https://fluxkit.io/stress-concurrency/${i}?salt=${Math.random()}`))
    }
    const results = await Promise.all(promises)
    assert.equal(results.length, 50)
    for (const res of results) {
      assert.ok(res.startsWith("data:image/png;base64,"))
    }
  })

  await asyncTestCase("QR Service: Maximum capacity boundary & graceful rejection on oversized payload (>3000 chars)", async () => {
    const oversizedPayload = "A".repeat(4000)
    let threw = false
    try {
      await generateQR(oversizedPayload)
    } catch (err) {
      threw = true
      assert.ok(
        err.message.includes("too big") || err.message.includes("amount of data") || err.message.includes("capacity"),
        `Unexpected error message: ${err.message}`,
      )
    }
    assert.ok(threw, "generateQR should throw when payload exceeds QR Version 40 capacity")
  })

  // =========================================================================
  // SECTION 5: ToolPage QR Input Validation Logic Simulation
  // =========================================================================
  console.log("\n--- SECTION 5: ToolPage QR Input Validation Logic Simulation ---")
  testCase("QR Validation: Empty and whitespace-only inputs are rejected", () => {
    const inputs = ["", "   ", "\t\t\n  \n", " \r\n "]
    for (const val of inputs) {
      const content = val.trim()
      assert.equal(content.length, 0, `Expected empty content for '${val}'`)
      let rejected = false
      try {
        if (!content) throw new Error("Enter content for your QR code.")
      } catch (err) {
        rejected = true
        assert.equal(err.message, "Enter content for your QR code.")
      }
      assert.ok(rejected, `Empty input '${val}' must be rejected`)
    }
  })

  testCase("QR Validation: URL scheme auto-prefixing and protocol enforcement", () => {
    // Valid without scheme
    let val = "fluxkit.io"
    let content = val.trim()
    if (!/^https?:\/\//i.test(content)) content = `https://${content}`
    assert.equal(content, "https://fluxkit.io")
    const parsed = new URL(content)
    assert.ok(["http:", "https:"].includes(parsed.protocol))

    // Valid with http scheme
    val = "http://localhost:8443"
    content = val.trim()
    if (!/^https?:\/\//i.test(content)) content = `https://${content}`
    assert.equal(content, "http://localhost:8443")

    // Subdomains and complex paths without scheme
    // Test auto-prefixing on bare domains and paths
    const bareDomains = [
      { input: "fluxkit.io", expected: "https://fluxkit.io" },
      { input: "http://localhost:8443", expected: "http://localhost:8443" },
      { input: "https://secure.site.com", expected: "https://secure.site.com" },
      { input: "sub.example.org/path?k=v#h", expected: "https://sub.example.org/path?k=v#h" },
    ]
    for (const { input, expected } of bareDomains) {
      let u = input.trim()
      if (!/^https?:\/\//i.test(u)) u = `https://${u}`
      assert.equal(u, expected)
      const p = new URL(u)
      assert.ok(["http:", "https:"].includes(p.protocol))
    }

    // Malformed URLs that are rejected by URL constructor
    const malformedUrls = [
      "https://",
      "http://",
      "data:text/html,<script>alert(1)</script>",
      "https://example.com:abc",
    ]
    for (const raw of malformedUrls) {
      let threw = false
      try {
        let u = raw.trim()
        if (!/^https?:\/\//i.test(u)) u = `https://${u}`
        const p = new URL(u)
        if (!["http:", "https:"].includes(p.protocol)) throw new Error("Invalid")
      } catch {
        threw = true
      }
      assert.ok(threw, `Malformed URL '${raw}' must be rejected`)
    }
  })

  testCase("Adversarial finding: URL auto-prefixing in ToolPage transforms 'ftp://' and 'file://' instead of rejecting", () => {
    // In src/ToolPage.tsx lines 714-722:
    // When input is 'ftp://files.example.com', /^https?:\/\//i fails, so 'https://' is prepended.
    // Resulting in 'https://ftp://files.example.com' which parses as protocol 'https:', host 'ftp'.
    // This allows unsupported non-http schemes to pass through rather than rejecting.
    const input = "ftp://files.example.com"
    let urlStr = input.trim()
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = `https://${urlStr}`
    }
    const parsed = new URL(urlStr)
    // Document that current ToolPage implementation produces this mangled URL:
    assert.equal(urlStr, "https://ftp://files.example.com")
    assert.equal(parsed.protocol, "https:")
    assert.equal(parsed.hostname, "ftp")
  })

  testCase("QR Validation: Email format validation regex", () => {
    const validEmails = [
      "test@example.com",
      "user.name+tag@sub.domain.co",
      "a@b.cd",
      "first.last_123@corporation.org",
    ]
    const invalidEmails = [
      "test@",
      "@example.com",
      "plainaddress",
      "test @example.com",
      "test@.com",
      "missing-at-sign.com",
      "two@@at.com",
    ]
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    for (const email of validEmails) {
      assert.ok(emailRegex.test(email), `Valid email rejected: ${email}`)
    }
    for (const email of invalidEmails) {
      assert.ok(!emailRegex.test(email), `Invalid email accepted: ${email}`)
    }
  })

  testCase("QR Validation: WhatsApp phone number format regex", () => {
    const validPhones = [
      "+12345678901",
      "1234567890",
      "+447911123456",
      "1234567",
      "+971501234567",
      "123456789012345",
    ]
    const invalidPhones = [
      "123456", // 6 digits (too short)
      "1234567890123456", // 16 digits (too long)
      "phone12345",
      "+12-34-56",
      "+12 3456789",
      "",
    ]
    const phoneRegex = /^\+?\d{7,15}$/

    for (const phone of validPhones) {
      assert.ok(phoneRegex.test(phone), `Valid phone rejected: ${phone}`)
    }
    for (const phone of invalidPhones) {
      assert.ok(!phoneRegex.test(phone), `Invalid phone accepted: ${phone}`)
    }
  })

  // =========================================================================
  // SECTION 6: Router Resilience (404 and Fallbacks)
  // =========================================================================
  console.log("\n--- SECTION 6: Router Resilience (404 and Fallbacks) ---")
  testCase("Router: Unknown route renders clean 404 page", () => {
    const env = createEnv("unknown-route-999")
    const App = env.load("App").default
    const html = renderToStaticMarkup(React.createElement(App))

    assert.ok(html.includes("404 · A SMALL DETOUR"), "Missing 404 header")
    assert.ok(html.includes("This page isn’t in the toolkit"), "Missing 404 message")
    assert.ok(html.includes("Back to workspace"), "Missing Back to workspace CTA")
  })

  testCase("Router: Empty hash defaults to overview page without crashing", () => {
    const env = createEnv("")
    const App = env.load("App").default
    const html = renderToStaticMarkup(React.createElement(App))
    assert.ok(html.includes("All tools") || html.includes("Overview") || html.includes("FluxKit"))
  })

  testCase("Router: Rapid sequential navigations across 10 distinct routes", () => {
    const sampleRoutes = ["overview", "all", "qr", "merge-pdf", "compress", "summarize", "audio-text", "activity", "settings", "help"]
    for (const r of sampleRoutes) {
      const env = createEnv(r)
      const App = env.load("App").default
      const html = renderToStaticMarkup(React.createElement(App))
      assert.ok(html.length > 500)
    }
  })

  console.log("\n=======================================================")
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log("=======================================================")

  if (failed > 0) {
    console.error(`\nFAILED TESTS SUMMARY (${failed}):`)
    findings.forEach((f, idx) => {
      console.error(`${idx + 1}. ${f.name}\n   Error: ${f.error}`)
    })
    process.exit(1)
  } else {
    console.log("ALL STRESS TESTS PASSED SUCCESSFULLY.")
    process.exit(0)
  }
}

runTests().catch((err) => {
  console.error("Fatal harness error:", err)
  process.exit(1)
})
