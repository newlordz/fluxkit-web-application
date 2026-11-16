import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { buildZipArchive } from "./services"

// ============================================================================
// 1. EDI (Electronic Data Interchange) ANSI X12 & EDIFACT CONVERSIONS
// ============================================================================

export interface EDISegment {
  tag: string
  elements: string[]
  raw: string
  line: number
  description?: string
}

export interface EDIParsedResult {
  standard: "X12" | "EDIFACT" | "UNKNOWN"
  elementDelimiter: string
  segmentTerminator: string
  subElementDelimiter: string
  interchangeControl?: {
    senderId?: string
    receiverId?: string
    date?: string
    time?: string
    controlNumber?: string
  }
  transactionSets: Array<{
    type: string
    controlNumber: string
    description: string
    segmentCount: number
    segments: EDISegment[]
  }>
  segments: EDISegment[]
  totalSegments: number
  validation: {
    isValid: boolean
    errors: string[]
    warnings: string[]
  }
}

// Well-known X12 segment definitions for human-readable labels
const X12_SEGMENT_NAMES: Record<string, string> = {
  ISA: "Interchange Control Header",
  GS: "Functional Group Header",
  ST: "Transaction Set Header",
  BEG: "Beginning Segment for Purchase Order",
  BIG: "Beginning Segment for Invoice",
  BSN: "Beginning Segment for Ship Notice",
  BHT: "Beginning Segment for Healthcare Claim",
  CUR: "Currency",
  REF: "Reference Information",
  PER: "Administrative Communications Contact",
  DTM: "Date/Time Reference",
  N1: "Party Identification (Name/Role)",
  N2: "Additional Name Information",
  N3: "Party Location (Street Address)",
  N4: "Geographic Location (City, State, Zip, Country)",
  PO1: "Purchase Order Baseline Item Data",
  IT1: "Invoice Baseline Item Data",
  PID: "Product/Item Description",
  MEA: "Measurements",
  QTY: "Quantity Information",
  AMT: "Monetary Amount Information",
  TDS: "Total Monetary Value Summary",
  CAD: "Carrier Details",
  SAC: "Service, Promotion, Allowance, or Charge",
  ISS: "Invoice Shipment Summary",
  CTT: "Transaction Totals",
  SE: "Transaction Set Trailer",
  GE: "Functional Group Trailer",
  IEA: "Interchange Control Trailer",
}

const X12_TRANSACTION_TYPES: Record<string, string> = {
  "850": "Purchase Order (PO)",
  "810": "Invoice",
  "856": "Ship Notice / Manifest (ASN)",
  "855": "Purchase Order Acknowledgment",
  "820": "Payment Order / Remittance Advice",
  "834": "Benefit Enrollment and Maintenance",
  "835": "Health Care Claim Payment / Advice",
  "837": "Health Care Claim",
  "846": "Inventory Inquiry / Advice",
  "997": "Functional Acknowledgment",
  "204": "Motor Carrier Load Tender",
  "210": "Motor Carrier Freight Details & Invoice",
  "214": "Transportation Carrier Shipment Status",
  "990": "Response to a Load Tender",
}

/**
 * Detect delimiters and parse an EDI X12 or EDIFACT string
 */
export function parseEDI(raw: string): EDIParsedResult {
  const cleanRaw = raw.trim()
  if (!cleanRaw) {
    throw new Error("EDI content is empty. Please provide valid EDI X12 or EDIFACT data.")
  }

  let elementDelimiter = "*"
  let segmentTerminator = "~"
  let subElementDelimiter = ">"
  let standard: "X12" | "EDIFACT" | "UNKNOWN" = "UNKNOWN"

  // Check for X12 Interchange Header (ISA)
  if (cleanRaw.startsWith("ISA")) {
    standard = "X12"
    elementDelimiter = cleanRaw[3] || "*"
    // In standard X12, ISA is 106 characters long (ISA + 16 elements = 105 chars, char at 105 is terminator)
    const isaSegment = cleanRaw.slice(0, 107)
    if (isaSegment.length >= 106) {
      subElementDelimiter = cleanRaw[104] || ">"
      segmentTerminator = cleanRaw[105] || "~"
      // If newline immediately follows, strip it or keep terminator
      if (segmentTerminator === "\r" || segmentTerminator === "\n") {
        segmentTerminator = "\n"
      }
    } else {
      // Fallback heuristics
      if (cleanRaw.includes("~")) segmentTerminator = "~"
      else if (cleanRaw.includes("\n")) segmentTerminator = "\n"
    }
  } else if (cleanRaw.startsWith("UNA") || cleanRaw.startsWith("UNB")) {
    standard = "EDIFACT"
    if (cleanRaw.startsWith("UNA") && cleanRaw.length >= 9) {
      subElementDelimiter = cleanRaw[3]
      elementDelimiter = cleanRaw[4]
      segmentTerminator = cleanRaw[8]
    } else {
      elementDelimiter = "+"
      subElementDelimiter = ":"
      segmentTerminator = "'"
    }
  } else {
    // Attempt best-guess delimiter detection
    if (cleanRaw.includes("~") && cleanRaw.includes("*")) {
      standard = "X12"
      elementDelimiter = "*"
      segmentTerminator = "~"
    } else if (cleanRaw.includes("'") && cleanRaw.includes("+")) {
      standard = "EDIFACT"
      elementDelimiter = "+"
      segmentTerminator = "'"
    }
  }

  // Split into raw segment strings
  const rawSegments = cleanRaw
    .split(segmentTerminator)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const segments: EDISegment[] = []
  const transactionSets: EDIParsedResult["transactionSets"] = []
  let currentTx: (typeof transactionSets)[0] | null = null

  const interchangeControl: EDIParsedResult["interchangeControl"] = {}
  const errors: string[] = []
  const warnings: string[] = []

  rawSegments.forEach((segStr, idx) => {
    // Strip carriage returns or leading newlines
    const sanitized = segStr.replace(/^[\r\n]+/, "")
    const parts = sanitized.split(elementDelimiter)
    const tag = (parts[0] || "").trim().toUpperCase()
    const elements = parts.slice(1).map((el) => el.trim())

    const segmentObj: EDISegment = {
      tag,
      elements,
      raw: sanitized,
      line: idx + 1,
      description: X12_SEGMENT_NAMES[tag] || tag,
    }
    segments.push(segmentObj)

    // Capture ISA Interchange details
    if (tag === "ISA") {
      interchangeControl.senderId = `${elements[4] || ""} ${elements[5] || ""}`.trim()
      interchangeControl.receiverId = `${elements[6] || ""} ${elements[7] || ""}`.trim()
      interchangeControl.date = elements[8] || ""
      interchangeControl.time = elements[9] || ""
      interchangeControl.controlNumber = elements[12] || ""
    }

    // Capture ST (Transaction Set Header)
    if (tag === "ST") {
      const txType = elements[0] || "Unknown"
      const txControl = elements[1] || ""
      currentTx = {
        type: txType,
        controlNumber: txControl,
        description: X12_TRANSACTION_TYPES[txType] || `Transaction Set ${txType}`,
        segmentCount: 0,
        segments: [],
      }
    }

    if (currentTx) {
      currentTx.segments.push(segmentObj)
      currentTx.segmentCount++
    }

    // Capture SE (Transaction Set Trailer)
    if (tag === "SE" && currentTx) {
      const declaredCount = parseInt(elements[0], 10)
      if (!isNaN(declaredCount) && declaredCount !== currentTx.segmentCount) {
        warnings.push(
          `Transaction ${currentTx.type} (${currentTx.controlNumber}): Declared segment count in SE (${declaredCount}) does not match actual count (${currentTx.segmentCount}).`
        )
      }
      transactionSets.push(currentTx)
      currentTx = null
    }
  })

  if (segments.length === 0) {
    errors.push("No valid EDI segments could be identified.")
  }

  return {
    standard,
    elementDelimiter,
    segmentTerminator,
    subElementDelimiter,
    interchangeControl,
    transactionSets,
    segments,
    totalSegments: segments.length,
    validation: {
      isValid: errors.length === 0,
      errors,
      warnings,
    },
  }
}

/**
 * Convert EDI to structured, human-readable JSON
 */
export function convertEDIToJSON(ediText: string, pretty = true): string {
  const parsed = parseEDI(ediText)
  const output = {
    meta: {
      standard: parsed.standard,
      elementDelimiter: parsed.elementDelimiter,
      segmentTerminator: parsed.segmentTerminator,
      totalSegments: parsed.totalSegments,
      interchange: parsed.interchangeControl,
    },
    transactionSets: parsed.transactionSets.map((tx) => ({
      transactionType: tx.type,
      description: tx.description,
      controlNumber: tx.controlNumber,
      segmentCount: tx.segmentCount,
      segments: tx.segments.map((seg) => ({
        tag: seg.tag,
        description: seg.description,
        elements: seg.elements,
      })),
    })),
    rawSegments: parsed.segments.map((seg) => ({
      tag: seg.tag,
      description: seg.description,
      elements: seg.elements,
    })),
  }

  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)
}

/**
 * Convert EDI to tabular CSV
 */
export function convertEDIToCSV(ediText: string): string {
  const parsed = parseEDI(ediText)
  const rows: string[][] = [
    ["Line", "Segment", "Description", "Element_Index", "Element_Value", "Raw_Segment"],
  ]

  parsed.segments.forEach((seg) => {
    if (seg.elements.length === 0) {
      rows.push([
        String(seg.line),
        seg.tag,
        seg.description || "",
        "0",
        "",
        `"${seg.raw.replace(/"/g, '""')}"`,
      ])
    } else {
      seg.elements.forEach((val, elIdx) => {
        rows.push([
          String(seg.line),
          seg.tag,
          seg.description || "",
          String(elIdx + 1),
          `"${val.replace(/"/g, '""')}"`,
          elIdx === 0 ? `"${seg.raw.replace(/"/g, '""')}"` : "",
        ])
      })
    }
  })

  return rows.map((r) => r.join(",")).join("\n")
}

/**
 * Convert EDI to formatted OpenXML .xlsx Excel workbook
 */
export async function convertEDIToExcel(
  ediText: string,
  baseName = "edi-conversion"
): Promise<{ blob: Blob; name: string }> {
  const parsed = parseEDI(ediText)
  const rows: string[][] = [
    ["Line", "Segment Tag", "Segment Description", "Element Index", "Value", "Raw EDI Segment"],
  ]

  parsed.segments.forEach((seg) => {
    if (seg.elements.length === 0) {
      rows.push([String(seg.line), seg.tag, seg.description || "", "-", "", seg.raw])
    } else {
      seg.elements.forEach((val, elIdx) => {
        rows.push([
          String(seg.line),
          seg.tag,
          seg.description || "",
          `E${String(elIdx + 1).padStart(2, "0")}`,
          val,
          elIdx === 0 ? seg.raw : "",
        ])
      })
    }
  })

  let sheetDataXml = ""
  rows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 1
    let rowCellsXml = ""
    row.forEach((cellVal, colIdx) => {
      const colLetter = String.fromCharCode(65 + (colIdx % 26))
      const cellRef = `${colLetter}${rowNum}`
      rowCellsXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(cellVal)}</t></is></c>`
    })
    sheetDataXml += `<row r="${rowNum}">${rowCellsXml}</row>`
  })

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="EDI Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetDataXml}</sheetData>
</worksheet>`

  const zipBytes = buildZipArchive([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: relsXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/worksheets/sheet1.xml", data: sheet1Xml },
  ])

  return {
    name: `${baseName}.xlsx`,
    blob: new Blob([zipBytes as any], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  }
}

/**
 * Convert EDI to standard XML document
 */
export function convertEDIToXML(ediText: string): string {
  const parsed = parseEDI(ediText)
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<EDIDocument standard="${parsed.standard}">`,
    `  <ControlHeader>`,
    `    <Sender>${escapeXml(parsed.interchangeControl?.senderId || "")}</Sender>`,
    `    <Receiver>${escapeXml(parsed.interchangeControl?.receiverId || "")}</Receiver>`,
    `    <Date>${escapeXml(parsed.interchangeControl?.date || "")}</Date>`,
    `    <Time>${escapeXml(parsed.interchangeControl?.time || "")}</Time>`,
    `    <ControlNumber>${escapeXml(parsed.interchangeControl?.controlNumber || "")}</ControlNumber>`,
    `  </ControlHeader>`,
    `  <Segments total="${parsed.totalSegments}">`,
  ]

  parsed.segments.forEach((seg) => {
    lines.push(`    <Segment tag="${seg.tag}" line="${seg.line}" description="${escapeXml(seg.description || "")}">`)
    seg.elements.forEach((el, idx) => {
      lines.push(`      <Element index="${idx + 1}">${escapeXml(el)}</Element>`)
    })
    lines.push(`    </Segment>`)
  })

  lines.push(`  </Segments>`)
  lines.push(`</EDIDocument>`)
  return lines.join("\n")
}

/**
 * Generate a clean human-readable business document summary report (Purchase Order, Invoice, ASN)
 */
export function convertEDIToReadableReport(ediText: string): string {
  const parsed = parseEDI(ediText)
  const lines: string[] = []

  lines.push("================================================================================")
  lines.push(`FLUXKIT EDI BUSINESS DOCUMENT REPORT (${parsed.standard})`)
  lines.push("================================================================================")
  lines.push(`Sender ID   : ${parsed.interchangeControl?.senderId || "N/A"}`)
  lines.push(`Receiver ID : ${parsed.interchangeControl?.receiverId || "N/A"}`)
  lines.push(`Date / Time : ${parsed.interchangeControl?.date || "N/A"} ${parsed.interchangeControl?.time || ""}`)
  lines.push(`Control No. : ${parsed.interchangeControl?.controlNumber || "N/A"}`)
  lines.push(`Delimiters  : Segment [${parsed.segmentTerminator}]  Element [${parsed.elementDelimiter}]`)
  lines.push("--------------------------------------------------------------------------------\n")

  if (parsed.transactionSets.length > 0) {
    parsed.transactionSets.forEach((tx, idx) => {
      lines.push(`TRANSACTION SET #${idx + 1}: ${tx.type} - ${tx.description}`)
      lines.push(`Control Number : ${tx.controlNumber}`)
      lines.push(`Total Segments : ${tx.segmentCount}`)
      lines.push("--------------------------------------------------------------------------------")

      // Check for PO number or Invoice number in BEG / BIG
      const beg = tx.segments.find((s) => s.tag === "BEG")
      const big = tx.segments.find((s) => s.tag === "BIG")
      if (beg) {
        lines.push(`PO Number      : ${beg.elements[2] || "N/A"} (Date: ${beg.elements[4] || "N/A"})`)
      }
      if (big) {
        lines.push(`Invoice Number : ${big.elements[1] || "N/A"} (Date: ${big.elements[0] || "N/A"})`)
      }

      // Check for party roles (N1)
      const parties = tx.segments.filter((s) => s.tag === "N1")
      if (parties.length > 0) {
        lines.push("Parties Involved:")
        parties.forEach((p) => {
          const role = p.elements[0] === "BY" ? "Buyer" : p.elements[0] === "ST" ? "Ship To" : p.elements[0] === "SU" ? "Supplier" : p.elements[0]
          lines.push(`  * [${role}] ${p.elements[1] || ""}`)
        })
      }

      // Line items
      const poItems = tx.segments.filter((s) => s.tag === "PO1" || s.tag === "IT1")
      if (poItems.length > 0) {
        lines.push("\nItemized Line Items:")
        lines.push("  Line | Qty | Unit | Unit Price | Item Number / SKU")
        lines.push("  -------------------------------------------------------------")
        poItems.forEach((item) => {
          const lineNum = item.elements[0] || "-"
          const qty = item.elements[1] || "-"
          const unit = item.elements[2] || "-"
          const price = item.elements[3] || "-"
          const sku = item.elements[6] || item.elements[5] || "Item"
          lines.push(`  ${lineNum.padEnd(4)} | ${qty.padEnd(3)} | ${unit.padEnd(4)} | $${price.padEnd(9)} | ${sku}`)
        })
      }

      lines.push("\nAll Segments in Transaction:")
      tx.segments.forEach((seg) => {
        lines.push(`  ${seg.tag.padEnd(4)} [${(seg.description || "").slice(0, 30).padEnd(30)}] -> ${seg.elements.join(" | ")}`)
      })
      lines.push("\n")
    })
  } else {
    lines.push("ALL SEGMENTS:")
    parsed.segments.forEach((seg) => {
      lines.push(`  ${seg.tag.padEnd(4)} [${(seg.description || "").slice(0, 30).padEnd(30)}] -> ${seg.elements.join(" | ")}`)
    })
  }

  if (parsed.validation.warnings.length > 0) {
    lines.push("--------------------------------------------------------------------------------")
    lines.push("VALIDATION NOTICES:")
    parsed.validation.warnings.forEach((w) => lines.push(`  [!] ${w}`))
  }

  return lines.join("\n")
}

/**
 * Reverse conversion: Convert JSON or CSV to standard EDI X12 syntax
 */
export function convertDataToEDIX12(
  input: string,
  mode: "json" | "csv" = "json"
): string {
  const segTerm = "~"
  const elemSep = "*"

  if (mode === "json") {
    try {
      const data = JSON.parse(input)
      const segments: string[] = []

      // If array of segments
      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (typeof item === "string") {
            segments.push(item)
          } else if (item.tag && Array.isArray(item.elements)) {
            segments.push([item.tag, ...item.elements].join(elemSep))
          }
        })
      } else if (data.segments && Array.isArray(data.segments)) {
        data.segments.forEach((item: any) => {
          if (item.tag && Array.isArray(item.elements)) {
            segments.push([item.tag, ...item.elements].join(elemSep))
          }
        })
      } else if (data.transactionSets && Array.isArray(data.transactionSets)) {
        data.transactionSets.forEach((tx: any) => {
          if (Array.isArray(tx.segments)) {
            tx.segments.forEach((item: any) => {
              if (item.tag && Array.isArray(item.elements)) {
                segments.push([item.tag, ...item.elements].join(elemSep))
              }
            })
          }
        })
      }

      if (segments.length > 0) {
        return segments.join(segTerm + "\n") + segTerm
      }
    } catch {
      // Fall through
    }
  }

  // Fallback CSV to EDI
  const parsedCsv = parseCSV(input)
  const segments: string[] = []
  parsedCsv.rows.forEach((row) => {
    if (row.length > 0 && row[0].trim()) {
      segments.push(row.filter((c) => c !== "").join(elemSep))
    }
  })

  if (segments.length > 0) {
    return segments.join(segTerm + "\n") + segTerm
  }

  // Synthesize sample EDI 850 PO template if empty
  return [
    `ISA*00*          *00*          *ZZ*FLUXKITSENDER  *ZZ*RECEIVERPARTNER*260101*1200*U*00401*000000001*0*P*>~`,
    `GS*PO*FLUXKIT*RECEIVER*20260101*1200*1*X*004010~`,
    `ST*850*0001~`,
    `BEG*00*NE*PO-784920**20260101~`,
    `CUR*BY*USD~`,
    `N1*BY*ENTERPRISE CORP*92*987654321~`,
    `N3*450 MERCANTILE WAY~`,
    `N4*SAN FRANCISCO*CA*94105*US~`,
    `PO1*1*100*EA*24.50*PE*CB*SKU-9902~`,
    `PID*F****COMMERCIAL DATA TRANSIT HUB~`,
    `CTT*1~`,
    `SE*10*0001~`,
    `GE*1*1~`,
    `IEA*1*000000001~`,
  ].join("\n")
}

// ============================================================================
// 2. CSV CONVERSIONS & DATA STUDIO
// ============================================================================

export interface CSVParseResult {
  headers: string[]
  rows: string[][]
  delimiter: string
  totalRows: number
  totalColumns: number
}

/**
 * Autodetect delimiter and parse CSV / TSV text with robust quote handling
 */
export function parseCSV(rawText: string, customDelimiter?: string): CSVParseResult {
  const clean = rawText.replace(/^\uFEFF/, "") // strip BOM
  const firstLine = clean.split(/[\r\n]+/)[0] || ""

  let delimiter = customDelimiter || ","
  if (!customDelimiter) {
    const commaCount = (firstLine.match(/,/g) || []).length
    const semicolonCount = (firstLine.match(/;/g) || []).length
    const tabCount = (firstLine.match(/\t/g) || []).length
    const pipeCount = (firstLine.match(/\|/g) || []).length

    if (tabCount > commaCount && tabCount > semicolonCount) delimiter = "\t"
    else if (semicolonCount > commaCount) delimiter = ";"
    else if (pipeCount > commaCount && pipeCount > semicolonCount) delimiter = "|"
    else delimiter = ","
  }

  // Parse lines with quoted strings support
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]
    const nextChar = clean[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"'
        i++ // Skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim())
      currentField = ""
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++
      currentRow.push(currentField.trim())
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentField = ""
    } else {
      currentField += char
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow)
    }
  }

  if (rows.length === 0) {
    return {
      headers: [],
      rows: [],
      delimiter,
      totalRows: 0,
      totalColumns: 0,
    }
  }

  const headers = rows[0]
  const dataRows = rows.slice(1)
  const maxCols = Math.max(...rows.map((r) => r.length), headers.length)

  return {
    headers,
    rows: dataRows,
    delimiter,
    totalRows: dataRows.length,
    totalColumns: maxCols,
  }
}

/**
 * Convert CSV to JSON format (array of objects or 2D array)
 */
export function convertCSVToJSON(
  csvText: string,
  mode: "objects" | "arrays" = "objects"
): string {
  const { headers, rows } = parseCSV(csvText)

  if (mode === "arrays") {
    return JSON.stringify([headers, ...rows], null, 2)
  }

  const objects = rows.map((row) => {
    const obj: Record<string, any> = {}
    headers.forEach((h, idx) => {
      const key = h || `Column_${idx + 1}`
      const val = row[idx] !== undefined ? row[idx] : ""
      // Auto-cast numbers or booleans if unambiguous
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        obj[key] = Number(val)
      } else if (val.toLowerCase() === "true") {
        obj[key] = true
      } else if (val.toLowerCase() === "false") {
        obj[key] = false
      } else {
        obj[key] = val
      }
    })
    return obj
  })

  return JSON.stringify(objects, null, 2)
}

/**
 * Convert CSV to native Excel .xlsx OpenXML format
 */
export async function convertCSVToExcel(
  csvText: string,
  baseName = "converted-spreadsheet"
): Promise<{ blob: Blob; name: string }> {
  const { headers, rows } = parseCSV(csvText)
  const allRows = [headers, ...rows]

  let sheetDataXml = ""
  allRows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 1
    let rowCellsXml = ""
    row.forEach((cellVal, colIdx) => {
      const colLetter = String.fromCharCode(65 + (colIdx % 26))
      const cellRef = `${colLetter}${rowNum}`
      const numVal = parseFloat(cellVal.replace(/^[$,]/, ""))
      if (!isNaN(numVal) && /^-?\$?[\d,]+(\.\d+)?%?$/.test(cellVal.trim())) {
        rowCellsXml += `<c r="${cellRef}"><v>${numVal}</v></c>`
      } else {
        rowCellsXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(cellVal)}</t></is></c>`
      }
    })
    sheetDataXml += `<row r="${rowNum}">${rowCellsXml}</row>`
  })

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetDataXml}</sheetData>
</worksheet>`

  const zipBytes = buildZipArchive([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: relsXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/worksheets/sheet1.xml", data: sheet1Xml },
  ])

  return {
    name: `${baseName}.xlsx`,
    blob: new Blob([zipBytes as any], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  }
}

/**
 * Convert CSV to PDF with clean paginated table layout
 */
export async function convertCSVToPDF(
  csvText: string,
  baseName = "converted-table"
): Promise<{ blob: Blob; name: string }> {
  const { headers, rows } = parseCSV(csvText)
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const numCols = Math.max(headers.length, 1)
  const pageWidth = 612 // Letter
  const pageHeight = 792
  const margin = 40
  const usableWidth = pageWidth - margin * 2
  const colWidth = usableWidth / numCols
  const rowHeight = 22
  const rowsPerPage = Math.floor((pageHeight - 140) / rowHeight)

  const allData = [headers, ...rows]
  let currentRowIdx = 0

  while (currentRowIdx < allData.length) {
    const page = pdfDoc.addPage([pageWidth, pageHeight])
    let y = pageHeight - margin

    // Title / header
    page.drawText(`FluxKit CSV Document · ${baseName}`, {
      x: margin,
      y,
      size: 14,
      font: boldFont,
      color: rgb(0.1, 0.15, 0.3),
    })
    y -= 18

    page.drawText(`Exported Table: ${headers.length} Columns · ${rows.length} Data Rows`, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.45, 0.55),
    })
    y -= 25

    // Rows for this page
    const pageRows = allData.slice(currentRowIdx, currentRowIdx + rowsPerPage)
    pageRows.forEach((row, rIdx) => {
      const isHeader = currentRowIdx === 0 && rIdx === 0
      const isEven = rIdx % 2 === 0

      // Row background
      if (isHeader) {
        page.drawRectangle({
          x: margin,
          y: y - 5,
          width: usableWidth,
          height: rowHeight,
          color: rgb(0.9, 0.93, 0.98),
        })
      } else if (isEven) {
        page.drawRectangle({
          x: margin,
          y: y - 5,
          width: usableWidth,
          height: rowHeight,
          color: rgb(0.97, 0.98, 0.99),
        })
      }

      // Draw cell values
      row.forEach((cell, cIdx) => {
        const textVal = String(cell || "")
        const truncated = textVal.length > 24 ? textVal.slice(0, 22) + "…" : textVal
        page.drawText(truncated, {
          x: margin + cIdx * colWidth + 5,
          y: y + 2,
          size: isHeader ? 8.5 : 8,
          font: isHeader ? boldFont : font,
          color: isHeader ? rgb(0.1, 0.2, 0.4) : rgb(0.15, 0.15, 0.2),
        })
      })

      // Border line
      page.drawLine({
        start: { x: margin, y: y - 5 },
        end: { x: margin + usableWidth, y: y - 5 },
        thickness: 0.5,
        color: rgb(0.85, 0.88, 0.92),
      })

      y -= rowHeight
    })

    currentRowIdx += rowsPerPage
  }

  const pdfBytes = await pdfDoc.save()
  return {
    name: `${baseName}.pdf`,
    blob: new Blob([pdfBytes as any], { type: "application/pdf" }),
  }
}

/**
 * Convert CSV to XML schema
 */
export function convertCSVToXML(csvText: string): string {
  const { headers, rows } = parseCSV(csvText)
  const lines: string[] = [`<?xml version="1.0" encoding="UTF-8"?>`, `<dataset totalRows="${rows.length}">`]

  rows.forEach((row, rIdx) => {
    lines.push(`  <record row="${rIdx + 1}">`)
    headers.forEach((h, cIdx) => {
      const tag = (h || `col_${cIdx + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_")
      const val = row[cIdx] !== undefined ? row[cIdx] : ""
      lines.push(`    <${tag}>${escapeXml(val)}</${tag}>`)
    })
    lines.push(`  </record>`)
  })

  lines.push(`</dataset>`)
  return lines.join("\n")
}

/**
 * Convert CSV to SQL CREATE TABLE and INSERT statements
 */
export function convertCSVToSQL(csvText: string, tableName = "imported_data"): string {
  const { headers, rows } = parseCSV(csvText)
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_")
  const sanitizedCols = headers.map((h, i) => (h || `col_${i + 1}`).replace(/[^a-zA-Z0-9_]/g, "_"))

  const createTable = [
    `CREATE TABLE ${safeTable} (`,
    `  id INT PRIMARY KEY AUTO_INCREMENT,`,
    ...sanitizedCols.map((c) => `  ${c} VARCHAR(255)`),
    `);\n`,
  ].join("\n")

  const inserts: string[] = []
  rows.forEach((row) => {
    const values = sanitizedCols.map((_, i) => {
      const val = row[i] !== undefined ? row[i] : ""
      return `'${val.replace(/'/g, "''")}'`
    })
    inserts.push(`INSERT INTO ${safeTable} (${sanitizedCols.join(", ")}) VALUES (${values.join(", ")});`)
  })

  return `${createTable}\n-- Data Inserts (${rows.length} rows)\n${inserts.join("\n")}`
}

/**
 * Convert CSV to Markdown table
 */
export function convertCSVToMarkdown(csvText: string): string {
  const { headers, rows } = parseCSV(csvText)
  if (headers.length === 0) return ""

  const headerRow = `| ${headers.join(" | ")} |`
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`
  const dataRows = rows.map((r) => `| ${headers.map((_, i) => r[i] || "").join(" | ")} |`)

  return [headerRow, separatorRow, ...dataRows].join("\n")
}

/**
 * Reformat CSV delimiters (e.g. Comma to Semicolon, Tab, Pipe)
 */
export function reformatCSVDelimiter(
  csvText: string,
  targetDelimiter: "," | ";" | "\t" | "|"
): string {
  const { headers, rows } = parseCSV(csvText)
  const allRows = [headers, ...rows]

  return allRows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(targetDelimiter) || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`
          }
          return cell
        })
        .join(targetDelimiter)
    )
    .join("\n")
}

// ============================================================================
// 3. BATCH FILE (.bat / .cmd) SCRIPT CONVERSIONS & STUDIO
// ============================================================================

export interface BatchAnalysisResult {
  warnings: string[]
  dangerousCommands: string[]
  lineCount: number
  commandCount: number
  hasLoops: boolean
  hasConditionals: boolean
}

/**
 * Scan a Windows Batch file for dangerous or destructive commands
 */
export function analyzeBatchScript(batText: string): BatchAnalysisResult {
  const lines = batText.split(/[\r\n]+/)
  const warnings: string[] = []
  const dangerousCommands: string[] = []
  let hasLoops = false
  let hasConditionals = false
  let commandCount = 0

  const dangerousPatterns = [
    { pattern: /\bformat\b/i, desc: "Drive format command" },
    { pattern: /\bdel\s+(\/[a-z\s]+)*(\*|\/s|\/q|[a-z]:\\)/i, desc: "Recursive or silent file deletion (del /s /q)" },
    { pattern: /\brd\s+(\/[a-z\s]+)*(\/s|\/q|[a-z]:\\)/i, desc: "Recursive folder removal (rd /s /q)" },
    { pattern: /\brmdir\s+(\/[a-z\s]+)*(\/s|\/q)/i, desc: "Recursive directory removal" },
    { pattern: /\breg\s+delete\b/i, desc: "Windows Registry deletion" },
    { pattern: /\bdiskpart\b/i, desc: "Partition management utility" },
    { pattern: /\bshutdown\b/i, desc: "System shutdown/restart instruction" },
  ]

  lines.forEach((line, idx) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("::") || trimmed.startsWith("rem ")) return
    commandCount++

    if (/^for\b/i.test(trimmed)) hasLoops = true
    if (/^if\b/i.test(trimmed)) hasConditionals = true

    dangerousPatterns.forEach(({ pattern, desc }) => {
      if (pattern.test(trimmed)) {
        dangerousCommands.push(`Line ${idx + 1}: ${desc} ("${trimmed}")`)
        warnings.push(`Caution: ${desc} detected on line ${idx + 1}. Verify intended behavior before running.`)
      }
    })
  })

  return {
    warnings,
    dangerousCommands,
    lineCount: lines.length,
    commandCount,
    hasLoops,
    hasConditionals,
  }
}

/**
 * Transpile Windows Batch (.bat/.cmd) to modern PowerShell (.ps1)
 */
export function convertBatchToPowerShell(batText: string): string {
  const lines = batText.split(/[\r\n]+/)
  const psLines: string[] = [
    `# =====================================================================`,
    `# Converted from Windows Batch (.bat) to PowerShell (.ps1)`,
    `# Transpiled with FluxKit Batch Script Studio`,
    `# =====================================================================`,
    `$ErrorActionPreference = "Stop"\n`,
  ]

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      psLines.push("")
      return
    }

    // Comments
    if (trimmed.startsWith("::") || /^rem\b/i.test(trimmed)) {
      const comment = trimmed.replace(/^(::|rem\s*)/i, "")
      psLines.push(`# ${comment}`)
      return
    }

    // Echo off
    if (/^@?echo\s+off\b/i.test(trimmed)) {
      return // Not needed in PowerShell
    }

    // Echo
    if (/^@?echo\./i.test(trimmed)) {
      psLines.push(`Write-Host ""`)
      return
    }
    if (/^@?echo\s+/i.test(trimmed)) {
      const message = trimmed.replace(/^@?echo\s+/i, "")
      const psVarMessage = message.replace(/%([^%]+)%/g, '$$$1')
      psLines.push(`Write-Host "${psVarMessage.replace(/"/g, '`"')}"`)
      return
    }

    // Set variable: set VAR=VAL or set /p VAR=Prompt
    if (/^set\s+\/p\s+/i.test(trimmed)) {
      const match = trimmed.match(/^set\s+\/p\s+([^=]+)=(.*)$/i)
      if (match) {
        const varName = match[1].trim()
        const prompt = match[2].trim().replace(/^"/, "").replace(/"$/, "")
        psLines.push(`$${varName} = Read-Host "${prompt}"`)
        return
      }
    } else if (/^set\s+"?([a-zA-Z0-9_]+)=(.*?)"?$/i.test(trimmed)) {
      const match = trimmed.match(/^set\s+"?([a-zA-Z0-9_]+)=(.*?)"?$/i)
      if (match) {
        const varName = match[1].trim()
        const val = match[2].trim().replace(/^"/, "").replace(/"$/, "")
        const psVal = val.replace(/%([^%]+)%/g, '$$$1')
        psLines.push(`$${varName} = "${psVal}"`)
        return
      }
    }

    // Pause
    if (/^pause\b/i.test(trimmed)) {
      psLines.push(`Read-Host "Press Enter to continue..."`)
      return
    }

    // Mkdir
    if (/^(mkdir|md)\s+(.*)$/i.test(trimmed)) {
      const target = trimmed.replace(/^(mkdir|md)\s+/i, "").trim()
      psLines.push(`if (-not (Test-Path ${target})) { New-Item -ItemType Directory -Path ${target} -Force | Out-Null }`)
      return
    }

    // Del / Erase
    if (/^(del|erase)\s+(.*)$/i.test(trimmed)) {
      const rest = trimmed.replace(/^(del|erase)\s+/i, "").replace(/\/f|\/q|\/s/gi, "").trim()
      psLines.push(`Remove-Item -Path ${rest} -Force -ErrorAction SilentlyContinue`)
      return
    }

    // Move
    if (/^move\s+(.*)$/i.test(trimmed)) {
      const parts = trimmed.replace(/^move\s+/i, "").trim().split(/\s+/)
      if (parts.length >= 2) {
        psLines.push(`Move-Item -Path ${parts[0]} -Destination ${parts[1]} -Force`)
        return
      }
    }

    // Copy
    if (/^copy\s+(.*)$/i.test(trimmed)) {
      const parts = trimmed.replace(/^copy\s+/i, "").trim().split(/\s+/)
      if (parts.length >= 2) {
        psLines.push(`Copy-Item -Path ${parts[0]} -Destination ${parts[1]} -Force`)
        return
      }
    }

    // If exist
    if (/^if\s+exist\s+(.*?)\s+(.*)$/i.test(trimmed)) {
      const match = trimmed.match(/^if\s+exist\s+(.*?)\s+(.*)$/i)
      if (match) {
        const path = match[1].trim()
        const thenCmd = match[2].trim()
        psLines.push(`if (Test-Path ${path}) {`)
        psLines.push(`    # ${thenCmd}`)
        psLines.push(`}`)
        return
      }
    }

    // Exit
    if (/^exit\s*(\/b\s*(\d+)?)?/i.test(trimmed)) {
      const match = trimmed.match(/\b\d+\b/)
      const code = match ? match[0] : "0"
      psLines.push(`exit ${code}`)
      return
    }

    // General fallback: transpile %VAR% to $env:VAR or $var
    let trans = trimmed.replace(/%([^%]+)%/g, '$$$1')
    psLines.push(trans)
  })

  return psLines.join("\n")
}

/**
 * Transpile Windows Batch to POSIX / Linux Bash script (.sh)
 */
export function convertBatchToBash(batText: string): string {
  const lines = batText.split(/[\r\n]+/)
  const shLines: string[] = [
    `#!/usr/bin/env bash`,
    `# =====================================================================`,
    `# Converted from Windows Batch (.bat) to POSIX Bash (.sh)`,
    `# Transpiled with FluxKit Batch Script Studio`,
    `# =====================================================================`,
    `set -euo pipefail\n`,
  ]

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      shLines.push("")
      return
    }

    // Comments
    if (trimmed.startsWith("::") || /^rem\b/i.test(trimmed)) {
      const comment = trimmed.replace(/^(::|rem\s*)/i, "")
      shLines.push(`# ${comment}`)
      return
    }

    // Echo off
    if (/^@?echo\s+off\b/i.test(trimmed)) return

    // Echo
    if (/^@?echo\./i.test(trimmed)) {
      shLines.push(`echo ""`)
      return
    }
    if (/^@?echo\s+/i.test(trimmed)) {
      const message = trimmed.replace(/^@?echo\s+/i, "")
      const bashMsg = message.replace(/%([^%]+)%/g, '$$$1').replace(/\\/g, "/")
      shLines.push(`echo "${bashMsg.replace(/"/g, '\\"')}"`)
      return
    }

    // Set variable
    if (/^set\s+\/p\s+/i.test(trimmed)) {
      const match = trimmed.match(/^set\s+\/p\s+([^=]+)=(.*)$/i)
      if (match) {
        const varName = match[1].trim()
        const prompt = match[2].trim().replace(/^"/, "").replace(/"$/, "")
        shLines.push(`read -r -p "${prompt} " ${varName}`)
        return
      }
    } else if (/^set\s+"?([a-zA-Z0-9_]+)=(.*?)"?$/i.test(trimmed)) {
      const match = trimmed.match(/^set\s+"?([a-zA-Z0-9_]+)=(.*?)"?$/i)
      if (match) {
        const varName = match[1].trim()
        const val = match[2].trim().replace(/^"/, "").replace(/"$/, "").replace(/\\/g, "/")
        const bashVal = val.replace(/%([^%]+)%/g, '$$$1')
        shLines.push(`${varName}="${bashVal}"`)
        return
      }
    }

    // Pause
    if (/^pause\b/i.test(trimmed)) {
      shLines.push(`read -r -p "Press Enter to continue..."`)
      return
    }

    // Mkdir
    if (/^(mkdir|md)\s+(.*)$/i.test(trimmed)) {
      const target = trimmed.replace(/^(mkdir|md)\s+/i, "").replace(/\\/g, "/").trim()
      shLines.push(`mkdir -p ${target}`)
      return
    }

    // Del
    if (/^(del|erase)\s+(.*)$/i.test(trimmed)) {
      const rest = trimmed.replace(/^(del|erase)\s+/i, "").replace(/\/f|\/q|\/s/gi, "").replace(/\\/g, "/").trim()
      shLines.push(`rm -f ${rest}`)
      return
    }

    // Move
    if (/^move\s+(.*)$/i.test(trimmed)) {
      const rest = trimmed.replace(/^move\s+/i, "").replace(/\\/g, "/").trim()
      shLines.push(`mv ${rest}`)
      return
    }

    // Copy
    if (/^copy\s+(.*)$/i.test(trimmed)) {
      const rest = trimmed.replace(/^copy\s+/i, "").replace(/\\/g, "/").trim()
      shLines.push(`cp ${rest}`)
      return
    }

    // If exist
    if (/^if\s+exist\s+(.*?)\s+(.*)$/i.test(trimmed)) {
      const match = trimmed.match(/^if\s+exist\s+(.*?)\s+(.*)$/i)
      if (match) {
        const p = match[1].trim().replace(/\\/g, "/")
        const thenCmd = match[2].trim().replace(/\\/g, "/")
        shLines.push(`if [ -e "${p}" ]; then`)
        shLines.push(`  ${thenCmd}`)
        shLines.push(`fi`)
        return
      }
    }

    // Exit
    if (/^exit\s*(\/b\s*(\d+)?)?/i.test(trimmed)) {
      const match = trimmed.match(/\b\d+\b/)
      const code = match ? match[0] : "0"
      shLines.push(`exit ${code}`)
      return
    }

    // Fallback variable replacement
    const trans = trimmed.replace(/%([^%]+)%/g, '$$$1').replace(/\\/g, "/")
    shLines.push(trans)
  })

  return shLines.join("\n")
}

/**
 * Transpile Windows Batch to Python script (.py)
 */
export function convertBatchToPython(batText: string): string {
  const lines = batText.split(/[\r\n]+/)
  const pyLines: string[] = [
    `#!/usr/bin/env python3`,
    `# =====================================================================`,
    `# Converted from Windows Batch (.bat) to Python (.py)`,
    `# Transpiled with FluxKit Batch Script Studio`,
    `# =====================================================================`,
    `import os`,
    `import sys`,
    `import shutil`,
    `from pathlib import Path\n`,
    `def main():`,
  ]

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      pyLines.push(`    pass`)
      return
    }

    if (trimmed.startsWith("::") || /^rem\b/i.test(trimmed)) {
      const comment = trimmed.replace(/^(::|rem\s*)/i, "")
      pyLines.push(`    # ${comment}`)
      return
    }

    if (/^@?echo\s+off\b/i.test(trimmed)) return

    if (/^@?echo\./i.test(trimmed)) {
      pyLines.push(`    print("")`)
      return
    }

    if (/^@?echo\s+/i.test(trimmed)) {
      const msg = trimmed.replace(/^@?echo\s+/i, "")
      const pyMsg = msg.replace(/%([^%]+)%/g, '{$1}')
      pyLines.push(`    print(f"${pyMsg.replace(/"/g, '\\"')}")`)
      return
    }

    if (/^set\s+"?([a-zA-Z0-9_]+)=(.*?)"?$/i.test(trimmed)) {
      const match = trimmed.match(/^set\s+"?([a-zA-Z0-9_]+)=(.*?)"?$/i)
      if (match) {
        const varName = match[1].trim()
        const val = match[2].trim().replace(/^"/, "").replace(/"$/, "")
        pyLines.push(`    ${varName} = "${val.replace(/"/g, '\\"')}"`)
        return
      }
    }

    if (/^pause\b/i.test(trimmed)) {
      pyLines.push(`    input("Press Enter to continue...")`)
      return
    }

    if (/^(mkdir|md)\s+(.*)$/i.test(trimmed)) {
      const target = trimmed.replace(/^(mkdir|md)\s+/i, "").trim().replace(/\\/g, "/")
      pyLines.push(`    Path("${target}").mkdir(parents=True, exist_ok=True)`)
      return
    }

    if (/^(del|erase)\s+(.*)$/i.test(trimmed)) {
      const target = trimmed.replace(/^(del|erase)\s+/i, "").replace(/\/f|\/q|\/s/gi, "").trim().replace(/\\/g, "/")
      pyLines.push(`    if Path("${target}").exists(): Path("${target}").unlink()`)
      return
    }

    if (/^exit\s*(\/b\s*(\d+)?)?/i.test(trimmed)) {
      const match = trimmed.match(/\b\d+\b/)
      const code = match ? match[0] : "0"
      pyLines.push(`    sys.exit(${code})`)
      return
    }

    pyLines.push(`    # Unconverted: ${trimmed}`)
  })

  pyLines.push(`\nif __name__ == "__main__":\n    main()`)
  return pyLines.join("\n")
}

/**
 * Generate standard robust Windows Batch automation templates
 */
export function generateBatchTemplate(
  type: "backup" | "cleanup" | "launcher" | "system_info"
): string {
  switch (type) {
    case "backup":
      return [
        `@echo off`,
        `:: FluxKit Automated File Backup Script`,
        `setlocal enabledelayedexpansion`,
        ``,
        `set "SOURCE_DIR=%USERPROFILE%\\Documents"`,
        `set "BACKUP_DIR=D:\\Backups\\FluxKit_%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%"`,
        ``,
        `echo ========================================================`,
        `echo Starting Directory Backup to %BACKUP_DIR%`,
        `echo ========================================================`,
        `if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"`,
        ``,
        `robocopy "%SOURCE_DIR%" "%BACKUP_DIR%" /E /Z /R:3 /W:5 /LOG:"%BACKUP_DIR%\\backup.log"`,
        ``,
        `if %ERRORLEVEL% LEQ 4 (`,
        `    echo Backup completed successfully!`,
        `) else (`,
        `    echo Errors occurred during backup. Check log for details.`,
        `)`,
        `pause`,
      ].join("\r\n")

    case "cleanup":
      return [
        `@echo off`,
        `:: FluxKit System Temp & Cache Cleanup Script`,
        `echo Cleaning temporary files and caches...`,
        ``,
        `del /f /s /q "%TEMP%\\*.*" 2>nul`,
        `for /d %%p in ("%TEMP%\\*.*") do rmdir "%%p" /s /q 2>nul`,
        ``,
        `echo Cleaned user temp directory.`,
        `echo Cleanup complete!`,
        `pause`,
      ].join("\r\n")

    case "launcher":
      return [
        `@echo off`,
        `:: FluxKit Workspace Application Launcher`,
        `title Workspace Launcher`,
        `echo Initializing workspace environment...`,
        ``,
        `set "PROJECT_DIR=%~dp0"`,
        `cd /d "%PROJECT_DIR%"`,
        ``,
        `echo Current directory: %CD%`,
        `if exist "package.json" (`,
        `    echo Starting Node/Vite development server...`,
        `    npm run dev`,
        `) else (`,
        `    echo Ready.`,
        `)`,
        `pause`,
      ].join("\r\n")

    case "system_info":
      return [
        `@echo off`,
        `:: FluxKit System Diagnostics & Environment Info`,
        `echo ========================================================`,
        `echo SYSTEM DIAGNOSTIC REPORT`,
        `echo ========================================================`,
        `echo Date/Time: %DATE% %TIME%`,
        `echo Computer : %COMPUTERNAME%`,
        `echo User     : %USERNAME%`,
        `echo OS       : %OS%`,
        `echo Processor: %PROCESSOR_ARCHITECTURE%`,
        `echo ========================================================`,
        `systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"Total Physical Memory"`,
        `pause`,
      ].join("\r\n")
  }
}

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------
function escapeXml(unsafe: string): string {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
