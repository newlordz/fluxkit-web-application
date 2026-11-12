const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

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

function createLoader(hash = "overview") {
  const moduleCache = new Map()

  const mockLocalStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  }

  function load(name) {
    if (name.endsWith(".css")) return {}
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
          if (id.endsWith(".css")) return {}
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
        document: {
          createElement: () => ({ href: "", download: "", click: () => {} }),
          addEventListener: () => {},
          removeEventListener: () => {},
        },
        Blob,
        File,
        URL,
        setTimeout,
        clearTimeout,
      },
      { filename },
    )

    return exports
  }

  return load
}

test("Overview Smart Dropzone: renders initial dropzone bar with quick-launch text and upload button", () => {
  const load = createLoader("overview")
  const Overview = load("Overview").default

  let navigatedTo = null
  let navigatedFiles = null
  const element = React.createElement(Overview, {
    navigate: (id, files) => {
      navigatedTo = id
      navigatedFiles = files
    },
    activity: [],
  })

  const html = renderToStaticMarkup(element)
  assert.match(html, /overview-dropzone-bar/, "Must render overview dropzone bar")
  assert.match(html, /Drop a document, photo, or audio file here to quick-launch/i, "Must show dropzone guidance")
  assert.match(html, /Choose or drop file/i, "Must show choose file trigger")
})

test("Overview Smart Dropzone: recognizes dropped PDF file and mounts Conversion & Action Hub modal", () => {
  const load = createLoader("overview")
  const Overview = load("Overview").default

  const mockPdfFile = new File(["%PDF-1.4 report bytes"], "quarterly-report.pdf", {
    type: "application/pdf",
  })

  const element = React.createElement(Overview, {
    navigate: () => {},
    activity: [],
    initialStagedFile: mockPdfFile,
  })

  const html = renderToStaticMarkup(element)

  // 1. Dropzone recognized bar verification
  assert.match(html, /dropzone-recognized-bar/, "Must render recognized bar when file is present")
  assert.match(html, /quarterly-report\.pdf/, "Must show file name in recognized bar")
  assert.match(html, /Recognized as PDF Document/i, "Must visibly confirm that the file was recognized as PDF")
  assert.match(html, /Choose conversion or action/i, "Must show prompt button to choose conversion")

  // 2. Conversion & Action Hub Modal verification
  assert.match(html, /quick-action-modal/, "Must mount quick-action modal")
  assert.match(html, /What would you like to do with this PDF Document\?/i, "Must ask user which conversion or action they want to do")
  assert.match(html, /Convert to Format/i, "Must include Convert to Format category")
  assert.match(html, /Optimize &amp; Organize|Optimize & Organize/i, "Must include Optimize & Organize category")
  assert.match(html, /AI &amp; Intelligence|AI & Intelligence/i, "Must include AI & Intelligence category")

  // 3. Essential PDF conversion and action cards
  assert.match(html, /PDF to Word/i, "Must offer PDF to Word conversion")
  assert.match(html, /PDF to Excel/i, "Must offer PDF to Excel conversion")
  assert.match(html, /PDF to PowerPoint/i, "Must offer PDF to PowerPoint conversion")
  assert.match(html, /PDF to JPG/i, "Must offer PDF to JPG conversion")
  assert.match(html, /Compress PDF/i, "Must offer Compress PDF")
  assert.match(html, /Merge PDF/i, "Must offer Merge PDF")
  assert.match(html, /Split PDF/i, "Must offer Split PDF")
  assert.match(html, /Edit PDF/i, "Must offer Edit PDF")
  assert.match(html, /Sign PDF/i, "Must offer Sign PDF")
  assert.match(html, /Watermark/i, "Must offer Watermark")
  assert.match(html, /Summarize Document/i, "Must offer AI Document Summary")
  assert.match(html, /Ask Document AI/i, "Must offer Ask Document AI")

  // 4. Privacy badge
  assert.match(html, /100% Client-Side Privacy/i, "Must highlight client-side local privacy guarantee")
})

test("Overview Smart Dropzone: recognizes image file and offers JPG to PDF & OCR", () => {
  const load = createLoader("overview")
  const Overview = load("Overview").default

  const mockImgFile = new File(["fake-image-bytes"], "scan-receipt.png", {
    type: "image/png",
  })

  const element = React.createElement(Overview, {
    navigate: () => {},
    activity: [],
    initialStagedFile: mockImgFile,
  })

  const html = renderToStaticMarkup(element)
  assert.match(html, /Recognized as Image file/i, "Must recognize image file")
  assert.match(html, /JPG to PDF/i, "Must offer JPG to PDF for image")
  assert.match(html, /OCR Scanner/i, "Must offer OCR Scanner for image")
})

test("ToolPage pre-loading: accepts initialFiles and renders them into the tool state", () => {
  const load = createLoader("pdf-to-word")
  const ToolPage = load("ToolPage").default
  const { tools } = load("config")

  const pdfToWordTool = tools.find((t) => t.id === "pdf-to-word")
  assert.ok(pdfToWordTool, "pdf-to-word tool must exist in config")

  const mockFile = new File(["%PDF-1.4 dummy content"], "contract.pdf", {
    type: "application/pdf",
  })

  const element = React.createElement(ToolPage, {
    tool: pdfToWordTool,
    navigate: () => {},
    initialFiles: [mockFile],
  })

  const html = renderToStaticMarkup(element)
  assert.match(html, /contract\.pdf/, "ToolPage must immediately display the pre-loaded file name")
})

test("AudioToText pre-loading: accepts initialFile prop and mounts audio workspace", () => {
  const load = createLoader("audio-text")
  const AudioToText = load("AudioToText").default

  const mockAudioFile = new File(["dummy audio bytes"], "interview.mp3", {
    type: "audio/mp3",
  })

  const element = React.createElement(AudioToText, {
    initialFile: mockAudioFile,
  })

  const html = renderToStaticMarkup(element)
  assert.match(html, /interview\.mp3/, "AudioToText must immediately receive the pre-loaded audio file")
})
