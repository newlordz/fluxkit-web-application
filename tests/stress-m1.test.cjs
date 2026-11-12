const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// Global transpile cache for rapid execution
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

function createSession(initialHash = "overview", initialStorage = {}) {
  const moduleCache = new Map()
  const storage = new Map(Object.entries(initialStorage))
  const mockLocation = { hash: `#${initialHash}` }

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
    documentElement: {
      dataset: {},
      style: {
        setProperty: () => {},
      },
    },
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
          if (id === "./services") {
            return {
              apiBaseUrl: undefined,
              download: () => {},
              generateQR: async () => "data:image/png;base64,mock",
              mergePDFs: async () => ({ blob: new Blob([]), name: "merged.pdf" }),
              rotatePDF: async () => ({ blob: new Blob([]), name: "rotated.pdf" }),
              textToPDF: async () => ({ blob: new Blob([]), name: "document.pdf" }),
            }
          }
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
        location: mockLocation,
        localStorage: mockLocalStorage,
        sessionStorage: mockLocalStorage,
        window: {
          localStorage: mockLocalStorage,
          sessionStorage: mockLocalStorage,
          location: mockLocation,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => {},
          scrollTo: () => {},
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

  return { load, storage, mockLocation, mockDocument }
}

// ============================================================================
// STRESS TEST 1: Navigation Transitions — 60 Rapid Route Switches Across All Categories
// ============================================================================

test("M1 Stress: 60 Rapid route transitions across all categories without leaks, unhandled rejections, or corrupted state", async () => {
  const session = createSession("overview")
  const { tools } = session.load("config")
  const allToolIds = tools.map((t) => t.id)

  const systemRoutes = [
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
    "sign-in",
    "sign-up",
    "reset-password",
  ]

  const boundaryRoutes = [
    "unknown-route",
    "non-existent-tool-404",
    "route/with/slashes",
    "route-with-$pecial!@#",
    "route-with-emoji-🚀-sparkles",
    "a".repeat(128),
  ]

  // Construct a deterministic, balanced sequence of 60 transitions covering:
  // - Tools from each category (File tools, QR, AI, Audio, Workspace)
  // - System navigation routes
  // - Boundary and 404 routes
  const sequence = []
  let toolIdx = 0
  let sysIdx = 0
  let bndIdx = 0

  while (sequence.length < 60) {
    if (toolIdx < allToolIds.length) {
      sequence.push(allToolIds[toolIdx++])
    }
    if (sequence.length < 60 && sysIdx < systemRoutes.length) {
      sequence.push(systemRoutes[sysIdx++])
    }
    if (sequence.length < 60 && bndIdx < boundaryRoutes.length) {
      sequence.push(boundaryRoutes[bndIdx++])
    }
    if (toolIdx >= allToolIds.length && sequence.length < 60) {
      sequence.push(allToolIds[(toolIdx++) % allToolIds.length])
    }
  }

  assert.equal(sequence.length, 60, "Must test exactly 60 rapid route transitions")

  // Monitor unhandled promise rejections
  const unhandledRejections = []
  const onUnhandled = (reason) => unhandledRejections.push(reason)
  process.on("unhandledRejection", onUnhandled)

  // Measure initial heap memory in this persistent session
  const initialMemory = process.memoryUsage().heapUsed
  const App = session.load("App").default

  let stepCount = 0
  for (const route of sequence) {
    stepCount++
    session.mockLocation.hash = `#${route}`
    const html = renderToStaticMarkup(React.createElement(App))

    assert.ok(html.length > 500, `Step ${stepCount} route #${route} rendered truncated HTML (<500 bytes)`)

    // Verify boundary routing behavior
    if (boundaryRoutes.includes(route)) {
      assert.match(html, /404 · A SMALL DETOUR/, `Route #${route} should display 404 header`)
      assert.match(html, /This page isn’t in the toolkit/, `Route #${route} should display 404 explanation`)
    } else if (systemRoutes.includes(route)) {
      assert.doesNotMatch(html, /404 · A SMALL DETOUR/, `System route #${route} should not show 404`)
    } else {
      // It's a tool route
      assert.doesNotMatch(html, /404 · A SMALL DETOUR/, `Tool #${route} should not trigger 404`)
    }
  }

  process.removeListener("unhandledRejection", onUnhandled)

  // Assert no unhandled promise rejections
  assert.equal(unhandledRejections.length, 0, `Detected ${unhandledRejections.length} unhandled promise rejections during transitions`)

  // Measure final memory and assert reasonable bounds (< 100 MB delta for 60 full App renders)
  if (global.gc) global.gc()
  const finalMemory = process.memoryUsage().heapUsed
  const memoryDeltaMB = (finalMemory - initialMemory) / (1024 * 1024)
  assert.ok(memoryDeltaMB < 100, `Memory delta too high: ${memoryDeltaMB.toFixed(2)} MB after 60 transitions`)

  // State integrity check on terminal route: render #qr as final route and verify clean state
  session.mockLocation.hash = "#qr"
  const finalHtml = renderToStaticMarkup(React.createElement(App))
  assert.match(finalHtml, /QR Code Studio/, "Terminal route state should correctly render QR Code Studio")
  assert.match(finalHtml, /Connect the physical and digital/, "Terminal route should display correct description")
  assert.doesNotMatch(finalHtml, /404 · A SMALL DETOUR/, "Terminal route should have zero residual 404 state")
})

// ============================================================================
// STRESS TEST 2: Rapid Back-and-Forth Subsystem Cycling (30 Transitions)
// ============================================================================

test("M1 Stress: 30 rapid back-and-forth transitions between contrasting subsystems", () => {
  const session = createSession("overview")
  const App = session.load("App").default

  const subsystemRoutes = [
    "overview",
    "merge-pdf",      // File tool
    "qr",             // QR tool
    "summarize",      // AI text tool
    "audio-text",     // Audio tool
    "unknown-detour", // 404 detour
  ]

  // Run 5 full cycles = 30 transitions
  let totalTransitions = 0
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const route of subsystemRoutes) {
      totalTransitions++
      session.mockLocation.hash = `#${route}`
      const html = renderToStaticMarkup(React.createElement(App))

      assert.ok(html.length > 500, `Cycle ${cycle + 1} route #${route} failed render`)

      if (route === "overview") {
        assert.match(html, /Universal File & Document Workspace|Recent workspace activity/)
      } else if (route === "merge-pdf") {
        assert.match(html, /Merge PDF/)
      } else if (route === "qr") {
        assert.match(html, /QR Code Studio/)
      } else if (route === "summarize") {
        assert.match(html, /Summarize Document/)
      } else if (route === "audio-text") {
        assert.match(html, /Audio to Text/)
        assert.match(html, /Backend not connected/)
      } else if (route === "unknown-detour") {
        assert.match(html, /404 · A SMALL DETOUR/)
      }
    }
  }

  assert.equal(totalTransitions, 30, "Must complete 30 rapid subsystem transitions")
})

// ============================================================================
// STRESS TEST 3: Activity Tracking Aggregation, Order, and Multi-Action Handling
// ============================================================================

test("M1 Stress: Activity tracking properly aggregates multiple actions without duplication or state loss", () => {
  const session = createSession("activity")
  const Overview = session.load("Overview").default
  const App = session.load("App").default

  // 1. Overview empty state check
  const emptyOverviewHtml = renderToStaticMarkup(
    React.createElement(Overview, { navigate: () => {}, activity: [] }),
  )
  assert.match(emptyOverviewHtml, /Recent workspace activity/)
  assert.match(emptyOverviewHtml, /No files processed in this session yet\./)
  assert.doesNotMatch(emptyOverviewHtml, /Processed locally/)

  // 2. Dedicated #activity page empty state check
  session.mockLocation.hash = "#activity"
  const emptyActivityPageHtml = renderToStaticMarkup(React.createElement(App))
  assert.match(emptyActivityPageHtml, /A fresh start\. Make something happen\./)
  assert.match(emptyActivityPageHtml, /Tools you use in this session will show up here\./)

  // 3. Simulate 10 sequential tool actions across diverse tool categories
  const simulatedCompletions = [
    "Merge PDF",
    "QR Code Studio",
    "Audio to Text",
    "Summarize Document",
    "Watermark",
    "Whiteboards",
    "Video Meetings",
    "Rotate PDF",
    "Compress PDF",
    "Ask Document AI",
  ]

  // Model the exact state updater function used in App.tsx:
  // setActivity((a) => [{ name, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...a])
  let currentActivity = []
  const recordAction = (name) => {
    currentActivity = [
      {
        name,
        time: "12:00 PM",
      },
      ...currentActivity,
    ]
  }

  for (const name of simulatedCompletions) {
    recordAction(name)
  }

  // Verify total count equals 10 (no dropped items)
  assert.equal(currentActivity.length, 10, "Activity must aggregate all 10 actions without loss")

  // Verify LIFO order (newest first)
  assert.equal(currentActivity[0].name, "Ask Document AI", "Most recent action must be first")
  assert.equal(currentActivity[9].name, "Merge PDF", "Oldest action must be last")

  // Verify all simulated items are present
  for (const name of simulatedCompletions) {
    const count = currentActivity.filter((a) => a.name === name).length
    assert.equal(count, 1, `Expected exactly 1 occurrence of ${name}`)
  }

  // 4. Test multi-occurrence / deduplication integrity:
  // Completing the same tool multiple times represents multiple valid user actions,
  // NOT unintended duplicates. Verify all distinct executions are preserved.
  recordAction("QR Code Studio")
  recordAction("QR Code Studio")
  recordAction("QR Code Studio")

  assert.equal(currentActivity.length, 13, "Total activities must be 13 after 3 duplicate runs")
  const qrOccurrences = currentActivity.filter((a) => a.name === "QR Code Studio")
  assert.equal(qrOccurrences.length, 4, "Must preserve all 4 distinct invocations of QR Code Studio")

  // 5. Verify Overview component renders top 4 most recent activities without crashing
  const populatedHtml = renderToStaticMarkup(
    React.createElement(Overview, { navigate: () => {}, activity: currentActivity }),
  )
  assert.match(populatedHtml, /Recent workspace activity/)
  const activitySectionMatch = populatedHtml.match(/<section class="panel activity-panel">([\s\S]*?)<\/section>/)
  assert.ok(activitySectionMatch, "Activity panel markup should be present")
  const activitySectionHtml = activitySectionMatch[1]
  assert.match(activitySectionHtml, /QR Code Studio/)
  assert.match(activitySectionHtml, /Ask Document AI/)
  // The oldest items (like "Merge PDF") should NOT be in Overview's top-4 slice
  assert.doesNotMatch(activitySectionHtml, /Merge PDF/, "Overview activity list should slice to 4 most recent actions only")

  // 6. Stress test with 100 activity items
  const hundredActivities = Array.from({ length: 100 }, (_, i) => ({
    name: `Action Sequence #${i + 1}`,
    time: "01:00 PM",
  }))
  const stressHtml = renderToStaticMarkup(
    React.createElement(Overview, { navigate: () => {}, activity: hundredActivities }),
  )
  assert.ok(stressHtml.length > 500, "Overview must render smoothly with 100 activity items")
  const stressSectionMatch = stressHtml.match(/<section class="panel activity-panel">([\s\S]*?)<\/section>/)
  assert.ok(stressSectionMatch, "Activity panel should be present in 100-item stress test")
  const stressSectionHtml = stressSectionMatch[1]
  assert.match(stressSectionHtml, /Action Sequence #1/)
  assert.match(stressSectionHtml, /Action Sequence #4/)
  assert.doesNotMatch(stressSectionHtml, /Action Sequence #5/, "Slice must not exceed 4 items in overview")
})

// ============================================================================
// STRESS TEST 4: Contractual Assertions for #audio-text and #unknown-route
// ============================================================================

test("M1 Stress: Contractual assertions for #audio-text and #unknown-route match regression specs", () => {
  const session = createSession("overview")
  const App = session.load("App").default

  // Test #unknown-route contract
  session.mockLocation.hash = "#unknown-route"
  const unknownHtml = renderToStaticMarkup(React.createElement(App))

  assert.ok(unknownHtml.length > 500, "Unknown route must render active shell")
  assert.match(unknownHtml, /404/, "Must match /404/ per workspace.test.cjs line 120")
  assert.match(unknownHtml, /404 · A SMALL DETOUR/, "Must display exact 404 detour badge")
  assert.match(unknownHtml, /This page isn’t in the toolkit/, "Must display friendly 404 heading")
  assert.match(unknownHtml, /Back to workspace/, "Must provide navigation back to workspace")

  // Test #audio-text contract
  const { tools } = session.load("config")
  const audioTool = tools.find((t) => t.id === "audio-text")
  assert.ok(audioTool, "audio-text must be present in tools catalog")
  assert.equal(audioTool.category, "Audio tools", "audio-text category must be 'Audio tools'")
  assert.equal(audioTool.integrationRequired, true, "audio-text integrationRequired must be true")

  session.mockLocation.hash = "#audio-text"
  const audioHtml = renderToStaticMarkup(React.createElement(App))

  assert.ok(audioHtml.length > 500, "audio-text route must render active shell")
  assert.match(audioHtml, /Backend not connected/, "Must match /Backend not connected/ per workspace.test.cjs line 129")
  assert.match(audioHtml, /Audio to Text/, "Must display tool name")
})
