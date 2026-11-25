const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function transpile(filePath) {
  return ts
    .transpileModule(fs.readFileSync(filePath, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })
    .outputText.replace(/import\.meta\.env/g, "process.env")
}

function evaluate(filePath, requireImpl, globals = {}) {
  const exports = {}
  vm.runInNewContext(
    transpile(filePath),
    {
      exports,
      require: requireImpl,
      console,
      process: { env: {} },
      Blob,
      File,
      URL,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      DataView,
      DOMException,
      AbortSignal,
      setTimeout,
      clearTimeout,
      ...globals,
    },
    { filename: filePath },
  )
  return exports
}

function loadModule(name, requireImpl = require, globals = {}) {
  return evaluate(path.resolve("src", name), requireImpl, globals)
}

function loadServices() {
  const filePath = path.resolve("src/services.ts")
  const exports = {}
  const wrapper = `(function (exports, require, module) {\n${transpile(filePath)}\n})`
  const compiled = vm.runInThisContext(wrapper, { filename: filePath })
  const module = { exports }
  compiled(
    exports,
    (id) => (id === "./jobTypes" ? {} : require(id)),
    module,
  )
  return module.exports
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function word(text, x, y, width, confidence = 0.96, slope = 0) {
  const height = 14
  const center = x + width / 2
  const baseline = y + slope * (center - 350)
  return {
    text,
    confidence,
    boundingBox: {
      x,
      y: baseline - height * 0.75,
      width,
      height,
    },
    baseline,
  }
}

function visualLine(cells, y, options = {}) {
  const words = []
  const parts = []
  const slope = options.slope || 0
  const confidence = options.confidence ?? 0.96

  for (const cell of cells) {
    if (!cell?.text) continue
    parts.push(cell.text)
    const tokens = cell.text.split(/\s+/).filter(Boolean)
    const units = tokens.reduce((sum, token) => sum + token.length, 0)
    const gap = tokens.length > 1 ? 2 : 0
    const available = Math.max(10, cell.width - gap * (tokens.length - 1))
    let cursor = cell.align === "right" ? cell.x + cell.width - available : cell.x
    for (const token of tokens) {
      const width = Math.max(5, (token.length / units) * available)
      words.push(word(token, cursor, y, width, confidence, slope))
      cursor += width + gap
    }
  }

  const left = Math.min(...words.map((item) => item.boundingBox.x))
  const right = Math.max(...words.map((item) => item.boundingBox.x + item.boundingBox.width))
  const top = Math.min(...words.map((item) => item.boundingBox.y))
  const bottom = Math.max(...words.map((item) => item.boundingBox.y + item.boundingBox.height))
  return {
    text: parts.join(" "),
    confidence,
    boundingBox: { x: left, y: top, width: right - left, height: bottom - top },
    words,
  }
}

const STATEMENT_COLUMNS = [
  { x: 40, width: 70 },
  { x: 130, width: 170 },
  { x: 320, width: 80 },
  { x: 420, width: 80, align: "right" },
  { x: 520, width: 80, align: "right" },
  { x: 620, width: 100, align: "right" },
]

function statementPage(options = {}) {
  const slope = options.slope || 0
  const line = (values, y) =>
    visualLine(
      STATEMENT_COLUMNS.map((column, index) =>
        values[index] ? { ...column, text: values[index] } : null,
      ),
      y,
      { slope, confidence: options.confidence },
    )
  return {
    text: "Account statement",
    confidence: options.confidence ?? 0.96,
    lines: [
      visualLine([{ x: 40, width: 180, text: "Account statement" }], 10, { slope }),
      line(["Date", "Description", "Reference", "Debit", "Credit", "Balance"], 40),
      line(["01/02/2026", "Salary payment", "000123", "", "2,500.00", "2,500.00"], 90),
      line(["02/02/2026", "Tax deduction", "TAX-002", "250.00", "", "2,250.00"], 125),
      visualLine([{ x: 130, width: 170, text: "February payroll adjustment" }], 150, {
        slope,
        confidence: options.confidence,
      }),
      line(["03/02/2026", "Closing balance", "", "", "", "2,250.00"], 190),
      visualLine([{ x: 40, width: 100, text: "Page 1 of 1" }], 230, { slope }),
    ],
  }
}

function headerlessPage() {
  const columns = [
    { x: 30, width: 70 },
    { x: 120, width: 160 },
    { x: 320, width: 70, align: "right" },
    { x: 420, width: 70, align: "right" },
    { x: 520, width: 100, align: "right" },
  ]
  const line = (values, y) =>
    visualLine(
      columns.map((column, index) =>
        values[index] ? { ...column, text: values[index] } : null,
      ),
      y,
    )
  return {
    text: "Bank transactions",
    confidence: 0.95,
    lines: [
      visualLine([{ x: 30, width: 170, text: "Bank transactions" }], 15),
      line(["01/03/2026", "Transfer", "", "1,000.00", "1,000.00"], 80),
      line(["02/03/2026", "Card purchase", "125.50", "", "874.50"], 110),
      visualLine([{ x: 120, width: 160, text: "Pending bank adjustment" }], 135),
      line(["03/03/2026", "Deposit", "", "500.00", "1,374.50"], 175),
      visualLine([{ x: 30, width: 100, text: "Page 1 of 1" }], 210),
    ],
  }
}

test("OCR mapping preserves coordinates and converts confidence without inventing boxes", () => {
  const { mapRecognizedPage } = loadModule("browserOcr.ts")
  const page = mapRecognizedPage({
    text: "01/02/2026 2,500.00",
    confidence: 92,
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                text: "01/02/2026 2,500.00",
                confidence: 91,
                baseline: 31,
                bbox: { x0: 10, y0: 20, x1: 150, y1: 34 },
                words: [
                  {
                    text: "01/02/2026",
                    confidence: 93,
                    baseline: 30,
                    bbox: { x0: 10, y0: 20, x1: 80, y1: 32 },
                  },
                  {
                    text: "2,500.00",
                    confidence: 89,
                    bbox: { x: 100, y: 20, width: 50, height: 12 },
                  },
                  { text: "bad", confidence: 10, bbox: { x0: 1, y0: 2, x1: 1, y1: 9 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  assert.equal(page.confidence, 0.92)
  assert.equal(page.lines.length, 1)
  assert.deepEqual(plain(page.lines[0].boundingBox), { x: 10, y: 20, width: 140, height: 14 })
  assert.equal(page.lines[0].words.length, 2)
  assert.equal(page.lines[0].words[0].confidence, 0.93)
  assert.deepEqual(plain(page.lines[0].words[1].boundingBox), { x: 100, y: 20, width: 50, height: 12 })
  assert.equal(page.lines[0].baseline, 31)
})

test("OCR cancellation terminates the worker and rejects with AbortError", async () => {
  let terminated = 0
  const worker = {
    recognize: () => new Promise(() => {}),
    terminate: async () => {
      terminated++
    },
  }
  const ocr = loadModule(
    "browserOcr.ts",
    (id) => {
      if (id === "tesseract.js") return { createWorker: async () => worker }
      return require(id)
    },
    {
      document: {},
      Worker: class Worker {},
      WebAssembly: {},
    },
  )
  const controller = new AbortController()
  const result = ocr.recognizePage(new Blob(["image"]), 5000, controller.signal)
  await new Promise((resolve) => setTimeout(resolve, 0))
  controller.abort()
  await assert.rejects(result, (error) => error.name === "AbortError")
  assert.equal(terminated, 1)
})

test("statement reconstruction keeps financial columns, continuation text, and identifiers", () => {
  const { reconstructImageTable, assessImageTable } = loadModule(
    "imageTableReconstruction.ts",
  )
  const table = reconstructImageTable(statementPage())
  assert.deepEqual(
    plain(table.columns.map((column) => column.label)),
    ["Date", "Description", "Reference", "Debit", "Credit", "Balance"],
  )
  assert.equal(table.rows.length, 3)
  assert.equal(table.rows[0].cells[2].value, "000123")
  assert.equal(table.rows[0].cells[4].value, "2,500.00")
  assert.equal(table.rows[1].cells[3].value, "250.00")
  assert.equal(table.rows[1].cells[4].value, "")
  assert.equal(
    table.rows[1].cells[1].value,
    "Tax deduction\nFebruary payroll adjustment",
  )
  assert.equal(table.rows[2].cells[1].value, "Closing balance")
  assert.equal(table.rows[2].cells[5].value, "2,250.00")
  assert.equal(table.columns[5].kind, "amount")
  assert.equal(assessImageTable(table).usable, true)
  assert.ok(table.rows.every((row) => row.cells.length === 6))
})

test("statement reconstruction drops preamble text and OCR border artifacts", () => {
  const { reconstructImageTable } = loadModule("imageTableReconstruction.ts")
  const page = statementPage()
  page.lines.unshift(
    visualLine([{ x: 40, width: 180, text: "DEMO BANK" }], 0),
    visualLine([{ x: 40, width: 260, text: "MONTHLY STATEMENT" }], 20),
  )
  page.lines[4].words.push({
    text: "|",
    confidence: 0.99,
    boundingBox: { x: 110, y: 80, width: 2, height: 18 },
  })

  const table = reconstructImageTable(page)
  assert.equal(table.rows.length, 3)
  assert.equal(table.rows[0].cells[1].value, "Salary payment")
  assert.equal(table.rows[0].cells[5].value, "2,500.00")
  assert.ok(table.rows.every((row) => row.cells.every((cell) => cell.value !== "|")))
})

test("headerless reconstruction uses persistent gutters and right-aligned amounts", () => {
  const { reconstructImageTable } = loadModule("imageTableReconstruction.ts")
  const table = reconstructImageTable(headerlessPage())
  assert.equal(table.columns.length, 5)
  assert.deepEqual(plain(table.columns.slice(2).map((column) => column.kind)), [
    "amount",
    "amount",
    "amount",
  ])
  assert.equal(table.rows.length, 3)
  assert.equal(table.rows[1].cells[2].value, "125.50")
  assert.equal(table.rows[1].cells[3].value, "")
  assert.equal(table.rows[1].cells[4].value, "874.50")
  assert.equal(
    table.rows[1].cells[1].value,
    "Card purchase\nPending bank adjustment",
  )
  assert.equal(table.warnings[0].code, "inferred_columns")
})

test("modest skew is normalized while severe skew blocks unreliable output", () => {
  const { reconstructImageTable, assessImageTable } = loadModule(
    "imageTableReconstruction.ts",
  )
  const modest = reconstructImageTable(statementPage({ slope: 0.05 }))
  assert.ok(Math.abs(modest.skew - 0.05) < 0.01)
  assert.equal(modest.rows.length, 3)
  assert.equal(assessImageTable(modest).usable, true)

  const severe = reconstructImageTable(statementPage({ slope: 0.25 }))
  assert.equal(assessImageTable(severe).usable, false)
  assert.ok(assessImageTable(severe).messages.some((message) => /heavily skewed/.test(message)))
})

test("empty, single-column, and oversized tables are rejected for export", () => {
  const { reconstructImageTable, assessImageTable } = loadModule(
    "imageTableReconstruction.ts",
  )
  const empty = reconstructImageTable({ text: "", confidence: 0, lines: [] })
  assert.equal(assessImageTable(empty).usable, false)
  assert.equal(empty.warnings[0].code, "no_geometry")

  const singleColumn = reconstructImageTable({
    text: "one column",
    confidence: 0.9,
    lines: [
      visualLine([{ x: 20, width: 100, text: "first line" }], 20),
      visualLine([{ x: 20, width: 100, text: "second line" }], 50),
    ],
  })
  assert.equal(assessImageTable(singleColumn).usable, false)
  assert.equal(singleColumn.warnings[0].code, "no_columns")

  const table = reconstructImageTable(statementPage())
  const tooManyRows = { ...table, rows: Array.from({ length: 501 }, () => table.rows[0]) }
  assert.equal(assessImageTable(tooManyRows).usable, false)
  const tooManyColumns = {
    ...table,
    columns: Array.from({ length: 13 }, (_value, index) => ({
      ...table.columns[0],
      id: `c${index}`,
    })),
  }
  assert.equal(assessImageTable(tooManyColumns).usable, false)
})

test("table edits are immutable and preserve empty spreadsheet positions", () => {
  const {
    reconstructImageTable,
    updateImageTableCell,
    updateImageTableColumn,
    addImageTableRow,
    removeImageTableRow,
    toSpreadsheetData,
    imageTableMergeRanges,
  } = loadModule("imageTableReconstruction.ts")
  const original = reconstructImageTable(statementPage())
  const edited = updateImageTableCell(original, original.rows[0].id, 2, "000987")
  assert.equal(original.rows[0].cells[2].value, "000123")
  assert.equal(edited.rows[0].cells[2].value, "000987")
  assert.equal(edited.rows[0].cells[2].edited, true)
  assert.equal(edited.rows[0].cells[2].needsReview, false)

  const renamed = updateImageTableColumn(edited, 1, "Narration")
  assert.equal(renamed.columns[1].label, "Narration")
  const added = addImageTableRow(renamed)
  assert.equal(added.rows.length, 4)
  assert.equal(added.rows[3].cells.length, 6)
  const removed = removeImageTableRow(added, added.rows[0].id)
  assert.equal(removed.rows.length, 3)

  const data = toSpreadsheetData(removed)
  assert.equal(data[0][1], "Narration")
  assert.equal(data[1][2], "TAX-002")
  assert.equal(data[1][3], "250.00")
  assert.equal(data[1][4], "")
  assert.deepEqual(plain(imageTableMergeRanges(removed)), [])
})

test("clear horizontal section cells become merged spreadsheet ranges", () => {
  const {
    reconstructImageTable,
    toSpreadsheetData,
    imageTableMergeRanges,
  } = loadModule("imageTableReconstruction.ts")
  const page = statementPage()
  page.lines.splice(2, 0, visualLine([{ x: 130, width: 450, text: "EARNINGS" }], 65))
  const table = reconstructImageTable(page)
  assert.equal(table.rows[0].cells[1].value, "EARNINGS")
  assert.equal(table.rows[0].cells[1].colSpan, 4)
  assert.equal(toSpreadsheetData(table)[1][1], "EARNINGS")
  assert.deepEqual(plain(imageTableMergeRanges(table)), [
    { firstRow: 1, firstCol: 1, lastRow: 1, lastCol: 4 },
  ])
})

test("financial parsing is conservative around identifiers and ambiguous decimals", () => {
  const { parseFinancialAmount } = loadModule("imageTableReconstruction.ts")
  assert.equal(parseFinancialAmount("$1,234.56"), 1234.56)
  assert.equal(parseFinancialAmount("(250.00)"), -250)
  assert.equal(parseFinancialAmount("EUR 1 234,56"), 1234.56)
  assert.equal(parseFinancialAmount("1,234,567.89"), 1234567.89)
  assert.equal(parseFinancialAmount("+250.00"), 250)
  assert.equal(parseFinancialAmount("00123"), null)
  assert.equal(parseFinancialAmount("1234567890123456"), null)
  assert.equal(parseFinancialAmount("1,234"), null)
  assert.equal(parseFinancialAmount("1.234"), null)
  assert.equal(parseFinancialAmount("=1+1"), null)
  assert.equal(parseFinancialAmount("-"), null)
})

test("XLSX writer keeps formula-like text inline, supports AA, and merges ranges", async () => {
  const { createXlsxBlob, unzipEntries } = loadServices()
  const headings = Array.from({ length: 27 }, (_value, index) => `Column ${index + 1}`)
  headings[0] = "A & <B>"
  const values = Array.from({ length: 27 }, () => "")
  values[0] = "=1+1"
  values[1] = "00123"
  values[2] = "1234567890123456"
  values[26] = "$1,234.56"
  const numericColumns = Array.from({ length: 27 }, (_value, index) => index === 26)
  const blob = createXlsxBlob([headings, values], {
    sheetName: "Bad/Name:Test",
    numericColumns,
    parseNumeric: (value, columnIndex) =>
      columnIndex === 26 && value === "$1,234.56" ? 1234.56 : null,
    mergeRanges: [{ firstRow: 1, firstCol: 3, lastRow: 1, lastCol: 4 }],
  })
  const entries = await unzipEntries(new Uint8Array(await blob.arrayBuffer()))
  const sheet = entries["xl/worksheets/sheet1.xml"]
  const workbook = entries["xl/workbook.xml"]
  assert.match(workbook, /sheet name="Bad Name Test"/)
  assert.match(sheet, /<c r="A1" t="inlineStr"><is><t>A &amp; &lt;B&gt;<\/t><\/is><\/c>/)
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t>=1\+1<\/t><\/is><\/c>/)
  assert.match(sheet, /<c r="B2" t="inlineStr"><is><t>00123<\/t><\/is><\/c>/)
  assert.match(sheet, /<c r="C2" t="inlineStr"><is><t>1234567890123456<\/t><\/is><\/c>/)
  assert.match(sheet, /<c r="AA2"><v>1234\.56<\/v><\/c>/)
  assert.match(sheet, /<mergeCell ref="D2:E2"\/>/)
  assert.doesNotMatch(sheet, /<f>/)
})

test("XLSX generation honors cancellation", () => {
  const { createXlsxBlob } = loadServices()
  const controller = new AbortController()
  controller.abort()
  assert.throws(() => createXlsxBlob([["A"]], { signal: controller.signal }), /cancel/i)
})

test("cloud table validation preserves blanks, leading zeroes, and review flags", () => {
  const { createImageTableFromCloud, assessImageTable, toSpreadsheetData } =
    loadModule("imageTableReconstruction.ts")
  const table = createImageTableFromCloud({
    columns: [
      { label: "Date", kind: "date" },
      { label: "Reference", kind: "reference" },
      { label: "Amount", kind: "amount" },
      { label: "Note", kind: "invalid" },
    ],
    rows: [
      {
        cells: [
          { value: "01/02/2026", confidence: 1 },
          { value: "000123", confidence: 0.98 },
          { value: "1,234.56", confidence: 0.6 },
        ],
      },
    ],
  })

  assert.deepEqual(plain(table.columns.map((column) => column.label)), [
    "Date",
    "Reference",
    "Amount",
    "Note",
  ])
  assert.equal(table.columns[3].kind, "unknown")
  assert.equal(table.rows[0].cells[1].value, "000123")
  assert.equal(table.rows[0].cells[2].needsReview, true)
  assert.equal(table.rows[0].cells[3].value, "")
  assert.equal(table.rows[0].cells[3].needsReview, false)
  assert.deepEqual(plain(toSpreadsheetData(table)[1]), ["01/02/2026", "000123", "1,234.56", ""])
  assert.equal(assessImageTable(table).usable, true)
  assert.throws(() => createImageTableFromCloud(null), /no table/)
  assert.throws(
    () => createImageTableFromCloud({ columns: [{ label: "Only" }], rows: [{ cells: [] }] }),
    /unsupported number of columns/,
  )
  assert.throws(
    () =>
      createImageTableFromCloud({
        columns: [{ label: "A" }, { label: "B" }],
        rows: [{ cells: [{ value: "1" }, { value: "2" }, { value: "3" }] }],
      }),
    /does not match its columns/,
  )
})

test("cloud request sends consent and keeps local output usable when quota fails", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  )
  let sent
  const service = loadModule(
    "imageTableService.ts",
    (id) => {
      if (id === "./browserOcr") return { recognizePage: async () => null }
      if (id === "./imageTableReconstruction") return loadModule("imageTableReconstruction.ts")
      if (id === "./services") return loadServices()
      if (id === "./sessionService") return { authHeaders: () => ({ Authorization: "Bearer session" }) }
      return require(id)
    },
    {
      FileReader: class FileReader {
        readAsDataURL(blob) {
          blob.arrayBuffer().then((buffer) => {
            this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`
            this.onload()
          })
        }
      },
      AbortController,
      fetch: async (_url, init) => {
        sent = JSON.parse(init.body)
        return {
          ok: false,
          status: 429,
          json: async () => ({
            ok: false,
            code: "daily_service_limit",
            error: "Cloud extraction is at capacity right now.",
          }),
        }
      },
      createImageBitmap: async () => ({ width: 1, height: 1, close() {} }),
      document: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({ fillRect() {}, drawImage() {} }),
          toBlob: (callback) => callback(new Blob(["prepared"], { type: "image/jpeg" })),
        }),
      },
    },
  )

  const file = new File([png], "payslip.png", { type: "image/png" })
  const local = await service.extractImageTable(file)
  await assert.rejects(
    service.extractImageTableWithCloud(file),
    (error) =>
      error.name === "ImageTableCloudError" &&
      error.status === 429 &&
      /local table is still available/i.test(error.message),
  )
  assert.equal(sent.consent, true)
  assert.equal(sent.mimeType, "image/jpeg")
  assert.equal(local.source, "local")
  assert.equal(local.needsCloud, true)
})

test("poor local extraction offers consent-based cloud help without making a network request", async () => {
  const services = loadServices()
  const reconstruction = loadModule("imageTableReconstruction.ts")
  let fetchCalls = 0
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  )
  const service = loadModule(
    "imageTableService.ts",
    (id) => {
      if (id === "./browserOcr") {
        return {
          recognizePage: async () => ({ text: "", confidence: 0, lines: [], failed: true }),
        }
      }
      if (id === "./imageTableReconstruction") return reconstruction
      if (id === "./services") return services
      if (id === "./sessionService") return { authHeaders: () => ({}) }
      return require(id)
    },
    {
      fetch: async () => {
        fetchCalls++
        throw new Error("Network access forbidden")
      },
      createImageBitmap: async () => ({ width: 1, height: 1, close() {} }),
      document: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({ fillRect() {}, drawImage() {} }),
          toBlob: (callback) => callback(new Blob(["prepared"], { type: "image/png" })),
        }),
      },
    },
  )

  const file = new File([png], "payslip.png", { type: "image/png" })
  const run = await service.extractImageTable(file)
  assert.equal(run.assessment.usable, false)
  assert.equal(run.source, "local")
  assert.equal(run.needsCloud, true)
  assert.equal(run.table.warnings[0].code, "local_unavailable")
  assert.equal(fetchCalls, 0)
  assert.throws(
    () => service.validateImageFile(new File(["pdf"], "statement.pdf", { type: "application/pdf" })),
    /JPG, PNG, or WebP/,
  )
  assert.throws(
    () => service.validateImageFile(new File(["gif"], "statement.gif", { type: "image/gif" })),
    /JPG, PNG, or WebP/,
  )
  await assert.rejects(
    service.prepareImageForOcr(new File([png], "renamed.jpg", { type: "image/jpeg" })),
    /contents do not match/,
  )
})
