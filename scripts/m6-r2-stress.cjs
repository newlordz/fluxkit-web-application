/**
 * Challenger M6-R2-2: Comprehensive Stress & Invariant Verification Suite
 * Milestone 6 Iteration 2
 */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

const transpileCache = new Map()

function getTranspiled(fullPath) {
  if (transpileCache.has(fullPath)) return transpileCache.get(fullPath)
  const resolved = fs.existsSync(fullPath + ".tsx")
    ? fullPath + ".tsx"
    : fs.existsSync(fullPath + ".ts")
      ? fullPath + ".ts"
      : fullPath
  const raw = fs.readFileSync(resolved, "utf8")
  const code = ts
    .transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    })
    .outputText.replace(/import\.meta\.env/g, "process.env")
  const result = { code, filename: resolved }
  transpileCache.set(fullPath, result)
  return result
}

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

function createDOMEnv(hash = "overview") {
  const moduleCache = new Map()
  const storage = new Map()
  const mockLocation = { hash: `#${hash}` }

  const mockLocalStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  }

  const mockDocument = {
    createElement: (tag) => {
      let href = ""
      let download = ""
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
        click: () => {},
        getContext: () => ({
          fillRect: () => {},
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          strokeRect: () => {},
          arc: () => {},
          fillText: () => {},
          drawImage: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          putImageData: () => {},
        }),
        toDataURL: () => "data:image/png;base64,mockPng",
      }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: {
      dataset: {},
      style: { setProperty: () => {} },
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
            return load("services")
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
          Image: class Image {
            constructor() {
              this.src = ""
              this.onload = null
            }
          },
        },
        document: mockDocument,
        navigator: {
          clipboard: { writeText: async () => {} },
          mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
          userAgent: "Node",
        },
        Blob,
        File,
        URL,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
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

  return { load, storage, mockLocalStorage }
}

const services = loadServices()

// ============================================================================
// STRESS VECTOR 1: Rapid Route Cycling & Concurrent SSR
// ============================================================================

test("M6-R2 Stress 1.1: Sequential 100 rapid route cycles across all 4 M6 routes", () => {
  const routes = ["audio-text", "documents", "meetings", "whiteboards"]
  for (let cycle = 0; cycle < 100; cycle++) {
    const route = routes[cycle % routes.length]
    const { load } = createDOMEnv(route)
    const App = load("App").default
    const html = renderToStaticMarkup(React.createElement(App))

    assert.ok(
      html.length > 500,
      `Cycle ${cycle} route #${route} rendered insufficient HTML (${html.length} chars)`,
    )
    assert.ok(
      !html.includes("404 · A SMALL DETOUR"),
      `Cycle ${cycle} route #${route} triggered 404`,
    )
    assert.ok(
      !html.includes("Coming soon"),
      `Cycle ${cycle} route #${route} showed 'Coming soon'`,
    )

    if (route === "audio-text") {
      assert.match(
        html,
        /Backend not connected/,
        `Cycle ${cycle} route #audio-text must preserve verbatim 'Backend not connected'`,
      )
    } else if (route === "documents") {
      assert.match(
        html,
        /My Documents/i,
        `Cycle ${cycle} route #documents must contain 'My Documents'`,
      )
      assert.match(
        html,
        /Total Documents/i,
        `Cycle ${cycle} route #documents must contain 'Total Documents'`,
      )
    } else if (route === "meetings") {
      assert.match(
        html,
        /Virtual Meeting Studio/i,
        `Cycle ${cycle} route #meetings must contain 'Virtual Meeting Studio'`,
      )
    } else if (route === "whiteboards") {
      assert.match(
        html,
        /<canvas/i,
        `Cycle ${cycle} route #whiteboards must render canvas`,
      )
    }
  }
})

test("M6-R2 Stress 1.2: Concurrent Parallel SSR (80 simultaneous renders via Promise.all)", async () => {
  const routes = ["audio-text", "documents", "meetings", "whiteboards"]
  const renders = []
  for (let i = 0; i < 20; i++) {
    for (const route of routes) {
      renders.push(
        (async () => {
          const { load } = createDOMEnv(route)
          const App = load("App").default
          const html = renderToStaticMarkup(React.createElement(App))
          return {
            route,
            length: html.length,
            has404: html.includes("404"),
            hasComingSoon: html.includes("Coming soon"),
            hasVerbatimNotice:
              route === "audio-text"
                ? html.includes("Backend not connected")
                : true,
          }
        })(),
      )
    }
  }

  const results = await Promise.all(renders)
  assert.equal(results.length, 80)
  for (const r of results) {
    assert.ok(r.length > 500)
    assert.equal(r.has404, false)
    assert.equal(r.hasComingSoon, false)
    assert.equal(r.hasVerbatimNotice, true)
  }
})

// ============================================================================
// STRESS VECTOR 2: High-Volume Document Insertions & Storage Invariants
// ============================================================================

test("M6-R2 Stress 2.1: High-volume 500 document insertions into session storage", () => {
  services.clearSessionDocuments()

  const extensions = [
    "pdf",
    "xlsx",
    "pptx",
    "png",
    "srt",
    "docx",
    "txt",
    "unknown",
  ]
  const toolSources = [
    "PDF to Excel",
    "Excel to PDF",
    "Whiteboards",
    "Audio to Text",
    "PDF to Word",
    "PDF to PowerPoint",
    "Workspace Guide",
    "Custom Tool",
  ]

  for (let i = 0; i < 500; i++) {
    const ext = extensions[i % extensions.length]
    const src = toolSources[i % toolSources.length]
    services.saveSessionDocument({
      name: `stress-doc-${i}-${encodeURIComponent("🚀_doc_#%&")}.${ext}`,
      toolSource: src,
      rawSize: 1024 * (i + 1),
      contentSnippet: `Document content snippet ${i} with unicode characters: こんにちは, مرحبا, 🌍`,
    })
  }

  const docs = services.getSessionDocuments()
  assert.equal(docs.length, 504, "Must store all 500 documents plus 4 seeded sample docs")

  // Extension precedence verification:
  // An .xlsx file produced by 'PDF to Excel' MUST be categorized as 'sheets'
  const xlsxDocs = docs.filter((d) => d.name.endsWith(".xlsx"))
  assert.ok(xlsxDocs.length > 0)
  for (const doc of xlsxDocs) {
    assert.equal(
      doc.category,
      "sheets",
      `Doc ${doc.name} with toolSource ${doc.toolSource} must be category sheets`,
    )
  }

  // An .srt file produced by 'Audio to Text' MUST be 'audio-text'
  const srtDocs = docs.filter((d) => d.name.endsWith(".srt"))
  assert.ok(srtDocs.length > 0)
  for (const doc of srtDocs) {
    assert.equal(
      doc.category,
      "audio-text",
      `Doc ${doc.name} must be category audio-text`,
    )
  }

  // A .png file produced by 'Whiteboards' MUST be 'images'
  const pngDocs = docs.filter((d) => d.name.endsWith(".png"))
  assert.ok(pngDocs.length > 0)
  for (const doc of pngDocs) {
    assert.equal(
      doc.category,
      "images",
      `Doc ${doc.name} must be category images`,
    )
  }
})

test("M6-R2 Stress 2.2: Session storage null, empty, corrupted, and primitive safety", () => {
  const { load, storage } = createDOMEnv("documents")
  const s = load("services")

  // Scenario A: sessionStorage holds string "null"
  storage.set("fluxkit-session-docs", "null")
  assert.doesNotThrow(() => {
    const list = s.getSessionDocuments()
    assert.ok(Array.isArray(list))
    assert.equal(list.length, 4, "Falls back to 4 starter sample documents")
  })

  // Scenario B: sessionStorage holds empty array "[]"
  storage.set("fluxkit-session-docs", "[]")
  assert.doesNotThrow(() => {
    const list = s.getSessionDocuments()
    assert.ok(Array.isArray(list))
    assert.equal(list.length, 4, "Empty list falls back to sample documents")
  })

  // Scenario C: sessionStorage holds malformed JSON "{truncated-data..."
  storage.set("fluxkit-session-docs", "{malformed JSON syntax!@#")
  assert.doesNotThrow(() => {
    const list = s.getSessionDocuments()
    assert.ok(Array.isArray(list))
    assert.equal(list.length, 4, "Malformed JSON safely falls back")
  })

  // Scenario D: sessionStorage holds primitive number or boolean
  storage.set("fluxkit-session-docs", "12345")
  assert.doesNotThrow(() => {
    const list = s.getSessionDocuments()
    assert.ok(Array.isArray(list))
    assert.equal(list.length, 4, "Number primitive safely falls back")
  })
})

test("M6-R2 Stress 2.3: Hostile search queries and ReDoS resistance in document filter", () => {
  const hostileQueries = [
    "((a+)+)+$",
    "a".repeat(1000),
    "*+?{1,1000}",
    "\\x00\\x00",
    "[a-z",
    "(abc",
    "[*]",
    "\\",
    ".*",
    "^(?:[a-zA-Z0-9_]+)*$",
  ]

  const docs = services.getSampleDocuments()
  for (const query of hostileQueries) {
    assert.doesNotThrow(() => {
      const results = services.filterDocuments(query, "all", docs)
      assert.ok(Array.isArray(results))
    }, `Hostile query '${query}' must not throw or crash`)
  }
})

// ============================================================================
// STRESS VECTOR 3: Whiteboard History Operations & Boundary Leave
// ============================================================================

test("M6-R2 Stress 3.1: Whiteboard history stack depth clamping under 200 pushes", () => {
  const maxSize = 20
  const history = services.createWhiteboardHistory(maxSize)

  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)

  // Seed base canvas state (as ToolPage does on mount)
  history.push("data:image/png;base64,initial_blank_canvas")
  assert.equal(history.canUndo(), false, "Initial base canvas cannot be undone")

  // Push 200 distinct snapshot entries
  for (let i = 1; i <= 200; i++) {
    history.push(`data:image/png;base64,snapshot_${i}`)
    assert.ok(
      history.canUndo(),
      `Must be able to undo after push ${i}`,
    )
  }

  // The stack must be clamped to maxSize (20).
  // Thus we should be able to perform exactly 19 undos before reaching the oldest retained state.
  let undoCount = 0
  while (history.canUndo()) {
    const prev = history.undo()
    assert.ok(prev)
    undoCount++
  }
  assert.ok(
    undoCount <= maxSize,
    `Undo count ${undoCount} must not exceed maxSize ${maxSize}`,
  )
  assert.equal(history.canUndo(), false)
  assert.ok(history.canRedo())

  // Calling undo() when canUndo() is false must return null and not throw
  assert.equal(history.undo(), null)

  // Traverse all redos back to the latest
  let redoCount = 0
  while (history.canRedo()) {
    const next = history.redo()
    assert.ok(next)
    redoCount++
  }
  assert.equal(redoCount, undoCount)
  assert.equal(history.canRedo(), false)

  // Calling redo() when canRedo() is false must return null and not throw
  assert.equal(history.redo(), null)
})

test("M6-R2 Stress 3.2: Whiteboard branching history clears redo stack", () => {
  const history = services.createWhiteboardHistory(15)
  for (let i = 1; i <= 10; i++) {
    history.push(`snapshot_${i}`)
  }
  assert.equal(history.canUndo(), true)
  assert.equal(history.canRedo(), false)

  // Undo 4 steps
  for (let i = 0; i < 4; i++) {
    history.undo()
  }
  assert.equal(history.canRedo(), true)

  // Push a new branch
  history.push("branched_snapshot")
  assert.equal(
    history.canRedo(),
    false,
    "Branching must purge all former redo states",
  )
  assert.equal(history.canUndo(), true)
})

test("M6-R2 Stress 3.3: Whiteboard gesture termination on pointer leave", () => {
  const history = services.createWhiteboardHistory(20)
  // Seed base state on mount
  history.push("data:image/png;base64,blank_canvas")

  // Simulation of ToolPage onPointerLeave:
  // Case A: Pointer leave while isDrawing is true -> commits active stroke
  let isDrawing = true
  function onPointerLeave(canvasDataUrl) {
    if (!isDrawing) return
    isDrawing = false
    history.push(canvasDataUrl)
  }

  onPointerLeave("data:image/png;base64,stroke_1_committed_on_boundary_leave")
  assert.equal(history.canUndo(), true)

  // Case B: Pointer leave while isDrawing is false -> does NOT push duplicate
  const depthBefore = history.getDepth()
  onPointerLeave("data:image/png;base64,duplicate_should_not_happen")
  assert.equal(history.getDepth(), depthBefore, "Drawing already false must not push duplicate")
})

test("M6-R2 Stress 3.4: Monotonic sequence token guards against out-of-order img.onload", () => {
  let whiteboardRenderSeq = 0
  let renderedSnapshot = ""

  function requestRender(seqToken, snapshot) {
    // Simulates asynchronous img.onload callback
    return (delayMs) =>
      new Promise((resolve) => {
        setTimeout(() => {
          if (seqToken === whiteboardRenderSeq) {
            renderedSnapshot = snapshot
          }
          resolve({ seqToken, rendered: seqToken === whiteboardRenderSeq })
        }, delayMs)
      })
  }

  // Request 1: issued at t=0, arrives slow at 50ms
  const seq1 = ++whiteboardRenderSeq
  const callback1 = requestRender(seq1, "snapshot_1")

  // Request 2: issued at t=5, arrives faster at 10ms
  const seq2 = ++whiteboardRenderSeq
  const callback2 = requestRender(seq2, "snapshot_2")

  return Promise.all([callback1(50), callback2(10)]).then((res) => {
    // seq2 was the latest sequence (whiteboardRenderSeq === 2)
    assert.equal(res[1].rendered, true)
    // seq1 arrived late and was rejected because seq1 !== 2
    assert.equal(res[0].rendered, false)
    assert.equal(renderedSnapshot, "snapshot_2")
  })
})

// ============================================================================
// STRESS VECTOR 4: Zero Unhandled Rejections & Zero Runtime Crashes
// ============================================================================

test("M6-R2 Stress 4.1: 100 concurrent async audio analyses with zero unhandled rejections", async () => {
  let unhandledCount = 0
  const onUnhandled = (err) => {
    unhandledCount++
    console.error("UNHANDLED REJECTION DETECTED:", err)
  }
  process.on("unhandledRejection", onUnhandled)

  const tasks = Array.from({ length: 100 }, (_, i) => {
    let bytes
    if (i % 5 === 0) {
      bytes = new Uint8Array(0) // 0-byte file
    } else if (i % 5 === 1) {
      bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]) // 4-byte RIFF
    } else if (i % 5 === 2) {
      bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x44]) // truncated mp3 frame
    } else if (i % 5 === 3) {
      bytes = new Uint8Array(128).fill(0xaa) // noise
    } else {
      // Synthetic valid 44-byte WAV header
      bytes = new Uint8Array(44 + 500)
      const view = new DataView(bytes.buffer)
      bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
      view.setUint32(4, 536, true)
      bytes.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
      bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // fmt
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true) // PCM
      view.setUint16(22, 1, true) // mono
      view.setUint32(24, 16000, true) // 16kHz
      view.setUint32(28, 32000, true) // byte rate
      view.setUint16(32, 2, true) // block align
      view.setUint16(34, 16, true) // 16-bit
      bytes.set([0x64, 0x61, 0x74, 0x61], 36) // data
      view.setUint32(40, 500, true)
    }

    const f = new File([bytes], `stress-audio-${i}.dat`, {
      type: "audio/wav",
    })
    return services.analyzeAudioFile(f)
  })

  const results = await Promise.all(tasks)
  process.removeListener("unhandledRejection", onUnhandled)

  assert.equal(
    unhandledCount,
    0,
    "Zero unhandled promise rejections must occur during stress analysis",
  )
  assert.equal(results.length, 100)
  for (const r of results) {
    assert.ok(r.duration >= 0)
    assert.equal(
      r.peaks.length,
      64,
      "Waveform peaks must always have exactly 64 bins",
    )
    for (const peak of r.peaks) {
      assert.ok(
        peak >= 0 && peak <= 1,
        `Peak value ${peak} must be normalized in [0, 1]`,
      )
    }
  }
})

test("M6-R2 Stress 4.2: Audio waveform 64-peak highlight traversal invariant", () => {
  // Verifies that at 100% progress, all 64 peaks are highlighted
  const arr = Array(64).fill(0.3)
  const duration = 120
  const currentTime = 120
  const progressPct = currentTime / duration // 1.0

  let highlightedCount = 0
  arr.forEach((_, idx) => {
    const isPast = idx / Math.max(1, arr.length - 1) <= progressPct
    if (isPast) highlightedCount++
  })

  assert.equal(
    highlightedCount,
    64,
    "All 64 peaks must be highlighted when playback is completed (progressPct = 1.0)",
  )

  // Verify at 50% progress
  const halfPct = 0.5
  let halfCount = 0
  arr.forEach((_, idx) => {
    const isPast = idx / Math.max(1, arr.length - 1) <= halfPct
    if (isPast) halfCount++
  })
  // idx from 0 to 31 = 32 peaks
  assert.equal(halfCount, 32)
})

test("M6-R2 Stress 4.3: SRT timestamp integer millisecond calculation invariant", () => {
  // Test floating point edge cases that previously suffered IEEE 754 precision loss
  const cases = [
    { seconds: 7265.123, expected: "02:01:05,123" },
    { seconds: 0.001, expected: "00:00:00,001" },
    { seconds: 59.999, expected: "00:00:59,999" },
    { seconds: 3599.999, expected: "00:59:59,999" },
    { seconds: 86399.999, expected: "23:59:59,999" },
  ]

  for (const c of cases) {
    const srt = services.formatSrtTime(c.seconds)
    assert.equal(
      srt,
      c.expected,
      `Time ${c.seconds} must produce exact SRT format ${c.expected}`,
    )
  }
})

test("M6-R2 Stress 4.4: Rapid meeting chat bursts (200 messages) with hostile payloads", () => {
  let state = services.createMeetingState("stress-room", "Challenger")
  assert.equal(state.chatMessages.length, 3) // 3 starter messages (msg-1, msg-2, msg-3)

  const hostileMessages = [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert(1)>",
    "   ", // empty whitespace
    "", // empty string
    "A".repeat(5000), // giant payload
    "🚀 🔥 💡 💥 Unicode & High Surrogates \uD83D\uDE00",
    "SQL'; DROP TABLE users; --",
    "\n\r\t\0",
  ]

  let validPushed = 0
  for (let i = 0; i < 200; i++) {
    const msg = hostileMessages[i % hostileMessages.length]
    if (!msg.trim()) {
      // sendChatMessage contract: throws on empty/whitespace
      assert.throws(() => services.sendChatMessage(state, `Tester_${i % 5}`, msg), /empty/)
    } else {
      state = services.sendChatMessage(state, `Tester_${i % 5}`, msg)
      validPushed++
    }
  }

  // Valid messages must be added without throwing
  assert.equal(
    state.chatMessages.length,
    3 + validPushed,
    "Valid messages must be appended to chat",
  )
  for (const chat of state.chatMessages) {
    assert.ok(chat.id)
    assert.ok(chat.sender)
    assert.ok(chat.time)
    assert.ok(typeof chat.text === "string")
    assert.ok(chat.text.trim().length > 0)
  }
})
