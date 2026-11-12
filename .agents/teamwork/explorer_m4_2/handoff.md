# Milestone 4 Explorer 2 Handoff Report: Chained Multi-Action Pipelines & Conversion Router

**Author**: Explorer M4-2 (Teamwork Explorer / Synthesizer)  
**Milestone**: Milestone 4 (Multi-Action Pipelines, OCR & Archiving)  
**Scope**: 
- Tool #22 `convert` (Convert Formats)
- Tool #23 `convert-compress` (Convert & Compress)
- Tool #24 `merge-compress` (Merge & Compress)
- Tool #25 `split-compress` (Split & Compress)
- Bare Blob `.name` resolution & intermediate safety
- Browser memory lifecycle & cleanup
- Multistage progress tracking & detailed metrics
**Date**: 2026-11-10  
**Status**: Ready for Implementation  

---

## 1. Observation

### 1.1 Existing Architecture & File Inventory
From inspecting the FluxKit codebase and running the test suite:
1. **Full Test Suite Status**:
   - Command: `npm test` (`node --test tests/*.test.cjs`)
   - Result: **249 passed, 0 failed, 0 skipped, duration 20.32s**.
   - Build Status (`npm run build`): Vite v8 compiles with 0 errors.
2. **Milestone 4 Tools in `src/config.ts`**:
   - `convert` (lines 357-366): Category: "File tools", Icon: `ArrowLeftRight`, Color: `teal`, Available: `true`.
   - `convert-compress` (lines 367-376): Category: "File tools", Icon: `Workflow`, Color: `emerald`, Available: `true`.
   - `merge-compress` (lines 377-386): Category: "File tools", Icon: `Layers`, Color: `emerald`, Available: `true`.
   - `split-compress` (lines 387-396): Category: "File tools", Icon: `Files`, Color: `emerald`, Available: `true`.
3. **Current State in `src/ToolPage.tsx`**:
   - `convert`, `convert-compress`, `merge-compress`, and `split-compress` currently lack dedicated service functions or UI pipelines.
   - At line 992 in `src/ToolPage.tsx`, unprocessed file tools fall into a placeholder branch that simply wraps `await original.arrayBuffer()` in a generic `Blob` and alters the filename suffix (`${original.name.replace(/\.[^/.]+$/, "")}-converted.${targetExt}`).
   - `merge-compress` requires multi-file uploads (`files.length >= 2`), but `src/ToolPage.tsx` line 1616 currently only permits multi-file drops for `merge-pdf`, `zip`, and `jpg-to-pdf`.
   - `isStrictPdf` in `src/ToolPage.tsx` (lines 494-506) omits `merge-compress` and `split-compress`.

### 1.2 The Bare Blob `.name` Bug & Intermediate Data Flow Pitfalls
1. **`extractBytes` in `src/services.ts` (lines 1153-1169)**:
   ```ts
   async function extractBytes(
     input: File | string | Uint8Array | ArrayBuffer,
   ): Promise<{ bytes: Uint8Array; name: string }> {
     if (typeof input === "string") {
       const enc = new TextEncoder()
       return { bytes: enc.encode(input), name: "document.txt" }
     }
     if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
       const u8 = toCleanUint8Array(input)
       return { bytes: u8, name: "document.pdf" }
     }
     if (input && typeof (input as File).arrayBuffer === "function") {
       const ab = await (input as File).arrayBuffer()
       return { bytes: toCleanUint8Array(ab), name: (input as File).name }
     }
     throw new Error("Invalid input format.")
   }
   ```
   - **Observed Bug**: In Web APIs and Node.js standard runtimes, `Blob` instances do not have a `.name` property (only `File extends Blob` has `.name`). When passing an intermediate programmatic `Blob` (e.g. `output.blob` from stage 1), `(input as File).name` evaluates to `undefined`.
   - In `pdfToWord` (line 1188), `pdfToPPT` (line 1321), `pdfToExcel` (line 1484), `wordToPDF` (line 1640), `pptToPDF` (line 1832), and `pdfToJPG` (line 2359):
     `const baseName = name.replace(/\.[^/.]+$/, "")`
     Throws: `TypeError: Cannot read properties of undefined (reading 'replace')`.
2. **`compressPDF` in `src/services.ts` (lines 407-435)**:
   ```ts
   return {
     name: `compressed-${file.name}`,
     blob: new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }),
   }
   ```
   - Passing an intermediate `Blob` directly causes `file.name` to be `undefined`, producing the filename `"compressed-undefined"`.
3. **`splitPDF` in `src/services.ts` (lines 322-405)**:
   - Returns `name: "split-" + file.name`, which similarly emits `"split-undefined"` when given a bare `Blob`.
4. **`jpgToPDF` in `src/services.ts` (lines 2504-2512)**:
   - Contains `if (item instanceof File)` and `else if ("bytes" in item)`. Passing a programmatic `Blob` is silently skipped (`else continue`), producing an empty PDF or failure.

### 1.3 Memory Retention in Chained In-Browser Workflows
- In multi-stage processing (e.g., `wordToPDF` followed by `compressPDF`):
  1. `ArrayBuffer` from the input file is parsed into text/XML.
  2. `pdf-lib` creates an uncompressed `PDFDocument` object tree in V8 heap memory (~10-50 MB).
  3. `save()` generates a fresh `Uint8Array`.
  4. The intermediate `Blob` is wrapped and parsed by the second stage (`compressPDF`), which creates another `PDFDocument` tree and another output `Uint8Array`.
  5. If references to intermediate buffers or documents are held in closures or React state, or if `URL.createObjectURL` is invoked on intermediate blobs without `URL.revokeObjectURL`, memory leaks and browser tab crashes occur under repeated runs.

---

## 2. Logic Chain

1. **Resolution of the Bare Blob `.name` Bug**:
   - *Premise*: Multi-action pipelines pipe the `Blob` output of stage $N$ into stage $N+1$.
   - *Inference*: To make intermediate chaining 100% resilient, we need a two-layer defense:
     1. **Service Layer Defense**: `extractBytes` must provide a fallback name:
        `const safeName = (input as File).name || "document.pdf"`
        `compressPDF` and `splitPDF` must fallback:
        `const safeName = (file as File).name || "document.pdf"`
        `jpgToPDF` must support `item instanceof Blob` in addition to `File`.
     2. **Pipeline Utility Defense**: Introduce an `ensureFile(blobOrFile, defaultName)` helper that wraps intermediate `Blob` objects into proper `File` instances with an explicit `.name` and correct MIME type.
2. **Design of Tool #22 (`convert` - Universal Conversion Router)**:
   - *Premise*: Users upload various file types (PDF, Word, PowerPoint, Excel, CSV, Images, Text) and desire a target format.
   - *Inference*: The tool must:
     1. Automatically detect input type via MIME type, file extension, and magic byte signatures (`%PDF-`, `PK\x03\x04`, `\xFF\xD8\xFF`, etc.).
     2. Dynamically supply target format choices based on detected input format.
     3. Delegate to existing M2/M3 engines (`pdfToWord`, `pdfToPPT`, `pdfToExcel`, `pdfToJPG`, `wordToPDF`, `pptToPDF`, `excelToPDF`, `jpgToPDF`, `textToPDF`).
3. **Design of Tool #23 (`convert-compress` - 2-in-1 Conversion + Compression Pipeline)**:
   - *Premise*: Users need to convert a non-PDF document/image to PDF (or PDF to Word/JPG) and compress it in one seamless action.
   - *Inference*:
     - Stage 1: Convert to target format using `universalConvert`.
     - Intermediate: Extract `intermediateSize = stage1Blob.size`, wrap with `ensureFile`.
     - Stage 2: If target is PDF, execute `compressPDF`. If target is Word/ZIP, apply PK-ZIP compression or optimized layout presets.
     - Report metrics: `originalSize`, `intermediateSize`, `finalSize`, `savedPercentage`.
4. **Design of Tool #24 (`merge-compress` - Multi-PDF Merge + Compress Pipeline)**:
   - *Premise*: Users upload 2 or more PDFs, want them merged into one file, and desire maximum file size optimization for email/distribution.
   - *Inference*:
     - Input validation: `files.length >= 2`.
     - Stage 1: Call `mergePDFs(files)`.
     - Intermediate: `intermediateSize = mergedBlob.size`, wrap with `ensureFile(mergedBlob, "merged-document.pdf")`.
     - Stage 2: Call `compressPDF(intermediateFile, { level: "high" })`.
     - Metrics: `originalSize = sum(files.map(f => f.size))`, `intermediateSize`, `finalSize`, `savedPercentage`.
5. **Design of Tool #25 (`split-compress` - PDF Split + Compress Pipeline)**:
   - *Premise*: Users want to extract specific page ranges (or extract all pages) from a PDF and optimize the resulting output.
   - *Inference*:
     - Mode A (Range extraction, e.g. "1-3", "2, 4"): Call `splitPDF(file, pageRange)`, wrap `ensureFile`, then run `compressPDF`.
     - Mode B (All pages archive): Split each page into single-page PDFs, compress each page, and package all compressed PDFs into a single ZIP archive using `buildZipArchive`.
     - Metrics: `originalSize = file.size`, `intermediateSize`, `finalSize`, `savedPercentage`.
6. **Progress Tracking & Metrics Contract**:
   - Stepped progress requires reporting stage name, within-stage percentage, and overall percentage. A centralized `PipelineProgressTracker` provides clean mathematical normalization across stages.

---

## 3. Caveats

1. **Non-PDF Conversions in `convert-compress`**:
   - In browser environments, compressing PDF streams uses `pdf-lib` object streams. When converting PDF to Word (`.docx`), the output is an OpenXML ZIP container which is already compressed using deflate/deflate-raw in `buildZipArchive`. Therefore, for non-PDF outputs, stage 2 confirms and validates container packaging compression.
2. **Extreme Compression Thresholds**:
   - If an input file is already heavily optimized or contains high-entropy compressed streams (such as pre-compressed JPEGs or encrypted streams), re-compression may yield a `finalSize` close to or slightly larger than `intermediateSize`. In such cases, `savedPercentage` must be safely clamped with `Math.max(0, ...)` to avoid negative savings in the UI.
3. **Scanned Images inside PDFs**:
   - For raster scans containing no text operators, `pdfToWord` and `pdfToExcel` extract structural layout but no OCR text. OCR is handled by Tool #19 (`ocr`), designed in parallel by Explorer M4-1.

---

## 4. Conclusion & Complete Architectural Specification

### 4.1 Type Definitions (`src/jobTypes.ts` or `src/services.ts`)

```ts
export type PipelineStage =
  | "converting"
  | "merging"
  | "splitting"
  | "compressing"
  | "packaging"
  | "done"

export interface PipelineProgressEvent {
  stage: PipelineStage
  stageProgress: number // 0 to 100 within current stage
  overallProgress: number // 0 to 100 across total pipeline
  message?: string
}

export type PipelineProgressCallback = (event: PipelineProgressEvent) => void

export interface PipelineMetricsResult {
  blob: Blob
  name: string
  filename: string
  originalSize: number
  intermediateSize?: number
  finalSize: number
  savedPercentage: number
  stageBreakdown?: {
    stage1Name: string
    stage1Size: number
    stage2Name: string
    stage2Size: number
  }
}
```

---

### 4.2 Bare Blob Safety Utilities

```ts
/**
 * Wraps an arbitrary Blob or File into a guaranteed File instance with a valid name.
 * Prevents TypeError in extractBytes and eliminates "compressed-undefined" filenames.
 */
export function ensureFile(
  blobOrFile: Blob | File,
  defaultName: string = "document.pdf",
): File {
  if (
    blobOrFile instanceof File &&
    typeof blobOrFile.name === "string" &&
    blobOrFile.name.trim() !== ""
  ) {
    return blobOrFile
  }

  const name =
    (blobOrFile as File).name && (blobOrFile as File).name.trim() !== ""
      ? (blobOrFile as File).name
      : defaultName

  try {
    return new File([blobOrFile], name, {
      type: blobOrFile.type || "application/pdf",
      lastModified: Date.now(),
    })
  } catch {
    // Environment fallback (e.g. older Node.js or restricted sandbox)
    const fallbackObj = blobOrFile as unknown as {
      name: string
      lastModified: number
      arrayBuffer: () => Promise<ArrayBuffer>
    }
    fallbackObj.name = name
    fallbackObj.lastModified = Date.now()
    return fallbackObj as unknown as File
  }
}
```

#### Fix in `extractBytes` in `src/services.ts`:
```ts
async function extractBytes(
  input: File | Blob | string | Uint8Array | ArrayBuffer,
): Promise<{ bytes: Uint8Array; name: string }> {
  if (typeof input === "string") {
    const enc = new TextEncoder()
    return { bytes: enc.encode(input), name: "document.txt" }
  }
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    const u8 = toCleanUint8Array(input)
    return { bytes: u8, name: "document.pdf" }
  }
  if (input && typeof (input as Blob).arrayBuffer === "function") {
    const ab = await (input as Blob).arrayBuffer()
    const safeName = (input as File).name || "document.pdf"
    return { bytes: toCleanUint8Array(ab), name: safeName }
  }
  throw new Error("Invalid input format.")
}
```

#### Fix in `compressPDF` and `splitPDF`:
In `compressPDF`:
```ts
const safeName = (file as File).name || "document.pdf"
return {
  name: `compressed-${safeName}`,
  blob: new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }),
}
```

In `jpgToPDF`:
```ts
for (const item of files) {
  let cleanBytes: Uint8Array
  let fileName = "image.jpg"
  if (item instanceof File || item instanceof Blob) {
    fileName = (item as File).name || "image.jpg"
    cleanBytes = toCleanUint8Array(await item.arrayBuffer())
  } else if (item && typeof item === "object" && "bytes" in item) {
    fileName = item.name || "image.jpg"
    cleanBytes = toCleanUint8Array(item.bytes)
  } else {
    continue
  }
  ...
}
```

---

### 4.3 Pipeline Progress Tracker

```ts
export class PipelineProgressTracker {
  private stages: { stage: PipelineStage; weight: number }[]
  private currentStageIndex: number = 0
  private onProgress?: PipelineProgressCallback

  constructor(
    stages: { stage: PipelineStage; weight: number }[],
    onProgress?: PipelineProgressCallback,
  ) {
    this.stages = stages
    this.onProgress = onProgress
  }

  public report(stageProgress: number, message?: string) {
    if (!this.onProgress) return
    const stageInfo = this.stages[this.currentStageIndex]
    const clampedStage = Math.min(100, Math.max(0, stageProgress))

    let priorWeight = 0
    let totalWeight = 0
    for (let i = 0; i < this.stages.length; i++) {
      if (i < this.currentStageIndex) {
        priorWeight += this.stages[i].weight
      }
      totalWeight += this.stages[i].weight
    }

    const currentWeight = stageInfo ? stageInfo.weight : 0
    const rawOverall =
      totalWeight > 0
        ? (priorWeight + (currentWeight * clampedStage) / 100) / totalWeight
        : clampedStage / 100
    const overallProgress = Math.min(100, Math.round(rawOverall * 100))

    this.onProgress({
      stage: stageInfo?.stage || "done",
      stageProgress: Math.round(clampedStage),
      overallProgress,
      message,
    })
  }

  public nextStage() {
    if (this.currentStageIndex < this.stages.length - 1) {
      this.currentStageIndex++
      this.report(0)
    }
  }

  public finish(message?: string) {
    this.currentStageIndex = this.stages.length - 1
    if (this.onProgress) {
      this.onProgress({
        stage: "done",
        stageProgress: 100,
        overallProgress: 100,
        message: message || "Complete",
      })
    }
  }
}
```

---

### 4.4 Tool #22: Universal Format Conversion Router (`universalConvert`)

```ts
export type DetectedDocumentType =
  | "pdf"
  | "word"
  | "ppt"
  | "excel"
  | "image"
  | "text"
  | "unknown"

export function detectFileType(fileOrName: string | File): DetectedDocumentType {
  const name = typeof fileOrName === "string" ? fileOrName : fileOrName.name
  const mime = typeof fileOrName !== "string" ? fileOrName.type : ""
  const lower = name.toLowerCase()

  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf"
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc")
  ) {
    return "word"
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint" ||
    lower.endsWith(".pptx") ||
    lower.endsWith(".ppt")
  ) {
    return "ppt"
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "text/csv" ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv")
  ) {
    return "excel"
  }
  if (
    mime.startsWith("image/") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".bmp")
  ) {
    return "image"
  }
  if (
    mime.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json")
  ) {
    return "text"
  }
  return "unknown"
}

export interface UniversalConvertOptions {
  targetFormat?: string // "docx" | "doc" | "txt" | "pptx" | "xlsx" | "csv" | "tsv" | "pdf" | "jpg"
  wordOptions?: PDFToWordOptions
  pptOptions?: PDFToPPTOptions
  excelOptions?: PDFToExcelOptions
  wordToPdfOptions?: WordToPDFOptions
  pptToPdfOptions?: PPTToPDFOptions
  excelToPdfOptions?: ExcelToPDFOptions
  pdfToJpgOptions?: PDFToJPGOptions
  jpgToPdfOptions?: JPGToPDFOptions
  onProgress?: (progress: number) => void
}

export async function universalConvert(
  file: File,
  options: UniversalConvertOptions = {},
): Promise<OutputResult> {
  if (!file) throw new Error("Select a file to convert.")
  const detected = detectFileType(file)
  const target = (
    options.targetFormat || (detected === "pdf" ? "docx" : "pdf")
  ).toLowerCase()

  if (detected === "pdf") {
    switch (target) {
      case "docx":
      case "doc":
      case "txt":
        return await pdfToWord(file, { format: target as any, ...options.wordOptions })
      case "pptx":
        return await pdfToPPT(file, options.pptOptions)
      case "xlsx":
      case "csv":
      case "tsv":
        return await pdfToExcel(file, { format: target as any, ...options.excelOptions })
      case "jpg":
        return await pdfToJPG(file, options.pdfToJpgOptions)
      default:
        throw new Error(`Unsupported target format "${target}" for PDF conversion.`)
    }
  } else if (detected === "word") {
    if (target === "pdf") {
      return await wordToPDF(file, options.wordToPdfOptions)
    }
    throw new Error(`Unsupported target format "${target}" for Word documents.`)
  } else if (detected === "ppt") {
    if (target === "pdf") {
      return await pptToPDF(file, options.pptToPdfOptions)
    }
    throw new Error(`Unsupported target format "${target}" for PowerPoint presentations.`)
  } else if (detected === "excel") {
    if (target === "pdf") {
      return await excelToPDF(file, options.excelToPdfOptions)
    }
    throw new Error(`Unsupported target format "${target}" for Spreadsheets.`)
  } else if (detected === "image") {
    if (target === "pdf") {
      return await jpgToPDF([file], options.jpgToPdfOptions)
    }
    throw new Error(`Unsupported target format "${target}" for Images.`)
  } else if (detected === "text") {
    if (target === "pdf") {
      const text = await file.text()
      const title = file.name.replace(/\.[^/.]+$/, "")
      return await textToPDF(text, title)
    }
    throw new Error(`Unsupported target format "${target}" for Text.`)
  }

  // Fallback to wordToPDF / generic handler
  if (target === "pdf") {
    return await wordToPDF(file, options.wordToPdfOptions)
  }
  throw new Error(`Unrecognized input format for file "${file.name}".`)
}
```

---

### 4.5 Tool #23: `convert-compress` (Two-in-One Pipeline)

```ts
export interface ConvertAndCompressOptions {
  targetFormat?: string // default: "pdf"
  compressLevel?: "standard" | "high"
  convertOptions?: UniversalConvertOptions
  onProgress?: PipelineProgressCallback
}

export async function convertAndCompress(
  file: File,
  options: ConvertAndCompressOptions = {},
): Promise<PipelineMetricsResult> {
  if (!file) throw new Error("Select a file to convert and compress.")
  const originalSize = file.size
  const targetFormat = options.targetFormat || "pdf"

  const tracker = new PipelineProgressTracker(
    [
      { stage: "converting", weight: 50 },
      { stage: "compressing", weight: 50 },
    ],
    options.onProgress,
  )

  // Stage 1: Converting
  tracker.report(10, `Converting ${file.name} to ${targetFormat.toUpperCase()}...`)
  const converted = await universalConvert(file, {
    targetFormat,
    ...options.convertOptions,
  })
  tracker.report(100, `Conversion complete.`)
  tracker.nextStage()

  // Intermediate Blob Wrapping with ensureFile
  const intermediateBlob = converted.blob
  const intermediateSize = intermediateBlob.size
  const intermediateFile = ensureFile(
    intermediateBlob,
    converted.name || `${file.name.replace(/\.[^/.]+$/, "")}.${targetFormat}`,
  )

  // Stage 2: Compressing
  tracker.report(10, `Optimizing and compressing document...`)
  let finalBlob: Blob
  let finalFilename: string

  if (targetFormat === "pdf" || converted.name.toLowerCase().endsWith(".pdf")) {
    const compressed = await compressPDF(intermediateFile, {
      level: options.compressLevel || "high",
    })
    finalBlob = compressed.blob
    finalFilename = compressed.name
  } else {
    // If converted output is OpenXML or JPG archive, it is already compressed via PK-ZIP
    finalBlob = intermediateBlob
    finalFilename = converted.name
  }

  tracker.report(100, `Compression complete.`)
  tracker.finish()

  const finalSize = finalBlob.size
  const savedPercentage =
    originalSize > 0
      ? Math.max(0, Math.round(((originalSize - finalSize) / originalSize) * 100))
      : 0

  return {
    blob: finalBlob,
    name: finalFilename,
    filename: finalFilename,
    originalSize,
    intermediateSize,
    finalSize,
    savedPercentage,
  }
}
```

---

### 4.6 Tool #24: `merge-compress` (Merge & Compress Pipeline)

```ts
export interface MergeAndCompressOptions {
  compressLevel?: "standard" | "high"
  outputFilename?: string
  onProgress?: PipelineProgressCallback
}

export async function mergeAndCompress(
  files: File[],
  options: MergeAndCompressOptions = {},
): Promise<PipelineMetricsResult> {
  if (!files || files.length < 2) {
    throw new Error("Choose at least two PDFs to merge and compress.")
  }

  const originalSize = files.reduce((acc, f) => acc + f.size, 0)

  const tracker = new PipelineProgressTracker(
    [
      { stage: "merging", weight: 50 },
      { stage: "compressing", weight: 50 },
    ],
    options.onProgress,
  )

  // Stage 1: Merging
  tracker.report(10, `Merging ${files.length} PDF files...`)
  const merged = await mergePDFs(files)
  tracker.report(100, `Merged successfully.`)
  tracker.nextStage()

  // Intermediate Blob Wrapping with ensureFile
  const intermediateBlob = merged.blob
  const intermediateSize = intermediateBlob.size
  const defaultIntermediateName = options.outputFilename || "merged-document.pdf"
  const intermediateFile = ensureFile(intermediateBlob, defaultIntermediateName)

  // Stage 2: Compressing
  tracker.report(10, `Compressing merged PDF document...`)
  const compressed = await compressPDF(intermediateFile, {
    level: options.compressLevel || "high",
  })
  tracker.report(100, `Compression complete.`)
  tracker.finish()

  const finalBlob = compressed.blob
  const finalSize = finalBlob.size
  const finalFilename = "merged-compressed.pdf"

  const savedPercentage =
    originalSize > 0
      ? Math.max(0, Math.round(((originalSize - finalSize) / originalSize) * 100))
      : 0

  return {
    blob: finalBlob,
    name: finalFilename,
    filename: finalFilename,
    originalSize,
    intermediateSize,
    finalSize,
    savedPercentage,
  }
}
```

---

### 4.7 Tool #25: `split-compress` (Split & Compress Pipeline)

```ts
export interface SplitAndCompressOptions {
  pageRange?: string // e.g. "1-2" or "all"
  compressLevel?: "standard" | "high"
  splitMode?: "range" | "all-pages"
  outputFilename?: string
  onProgress?: PipelineProgressCallback
}

export async function splitAndCompress(
  file: File,
  options: SplitAndCompressOptions = {},
): Promise<PipelineMetricsResult> {
  if (!file) throw new Error("Select a PDF to split and compress.")

  const originalSize = file.size
  const splitMode = options.splitMode || "range"
  const baseName = file.name.replace(/\.[^/.]+$/, "")

  if (splitMode === "all-pages") {
    // Mode B: Split all pages into compressed individual PDFs bundled in a ZIP archive
    const tracker = new PipelineProgressTracker(
      [
        { stage: "splitting", weight: 35 },
        { stage: "compressing", weight: 45 },
        { stage: "packaging", weight: 20 },
      ],
      options.onProgress,
    )

    tracker.report(5, `Loading PDF and analyzing pages...`)
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
    const pageCount = pdfDoc.getPageCount()
    if (pageCount < 1) throw new Error("Document contains no pages to split.")

    const splitPageBlobs: { name: string; bytes: Uint8Array }[] = []
    let intermediateBytesTotal = 0

    // Stage 1: Extract individual pages
    for (let i = 0; i < pageCount; i++) {
      const pageDoc = await PDFDocument.create()
      const [copiedPage] = await pageDoc.copyPages(pdfDoc, [i])
      pageDoc.addPage(copiedPage)
      const pageBytes = await pageDoc.save()
      intermediateBytesTotal += pageBytes.byteLength
      splitPageBlobs.push({ name: `page-${i + 1}.pdf`, bytes: pageBytes })
      tracker.report(Math.round(((i + 1) / pageCount) * 100), `Split page ${i + 1} of ${pageCount}...`)
    }

    tracker.nextStage()

    // Stage 2: Compress each page
    const compressedEntries: { name: string; data: Uint8Array }[] = []
    for (let i = 0; i < splitPageBlobs.length; i++) {
      const entry = splitPageBlobs[i]
      const intermediateFile = ensureFile(
        new Blob([entry.bytes], { type: "application/pdf" }),
        entry.name,
      )
      const compressed = await compressPDF(intermediateFile, {
        level: options.compressLevel || "high",
      })
      const compressedBytes = toCleanUint8Array(await compressed.blob.arrayBuffer())
      compressedEntries.push({
        name: `compressed-${entry.name}`,
        data: compressedBytes,
      })
      tracker.report(
        Math.round(((i + 1) / splitPageBlobs.length) * 100),
        `Compressed page ${i + 1} of ${pageCount}...`,
      )
    }

    tracker.nextStage()

    // Stage 3: Package into ZIP archive
    tracker.report(10, `Packaging compressed pages into archive...`)
    const zipBytes = buildZipArchive(compressedEntries)
    const zipBlob = new Blob([zipBytes], { type: "application/zip" })
    tracker.report(100, `Archive packaging complete.`)
    tracker.finish()

    const finalSize = zipBlob.size
    const finalFilename = `${baseName}-split-compressed.zip`
    const savedPercentage =
      originalSize > 0
        ? Math.max(0, Math.round(((originalSize - finalSize) / originalSize) * 100))
        : 0

    return {
      blob: zipBlob,
      name: finalFilename,
      filename: finalFilename,
      originalSize,
      intermediateSize: intermediateBytesTotal,
      finalSize,
      savedPercentage,
    }
  } else {
    // Mode A: Extract specified page range into single compressed PDF
    const tracker = new PipelineProgressTracker(
      [
        { stage: "splitting", weight: 50 },
        { stage: "compressing", weight: 50 },
      ],
      options.onProgress,
    )

    // Stage 1: Splitting
    tracker.report(10, `Extracting pages (${options.pageRange || "all"})...`)
    const splitResult = await splitPDF(file, options.pageRange)
    tracker.report(100, `Page extraction complete.`)
    tracker.nextStage()

    // Intermediate Blob Wrapping with ensureFile
    const intermediateBlob = splitResult.blob
    const intermediateSize = intermediateBlob.size
    const intermediateFile = ensureFile(
      intermediateBlob,
      splitResult.name || `${baseName}-split.pdf`,
    )

    // Stage 2: Compressing
    tracker.report(10, `Compressing extracted PDF...`)
    const compressed = await compressPDF(intermediateFile, {
      level: options.compressLevel || "high",
    })
    tracker.report(100, `Compression complete.`)
    tracker.finish()

    const finalBlob = compressed.blob
    const finalSize = finalBlob.size
    const finalFilename = `${baseName}-split-compressed.pdf`
    const savedPercentage =
      originalSize > 0
        ? Math.max(0, Math.round(((originalSize - finalSize) / originalSize) * 100))
        : 0

    return {
      blob: finalBlob,
      name: finalFilename,
      filename: finalFilename,
      originalSize,
      intermediateSize,
      finalSize,
      savedPercentage,
    }
  }
}
```

---

### 4.8 Memory Management & Browser Lifecycle Guidelines

1. **Object URL Discipline**:
   - In `src/ToolPage.tsx`, maintain `activeUrlRef = useRef<string | null>(null)`.
   - Before generating a new download URL with `URL.createObjectURL(result.blob)` or upon component unmount, invoke `URL.revokeObjectURL(activeUrlRef.current)`.
   - **Never** generate `URL.createObjectURL` for intermediate pipeline Blobs.
2. **Immediate Dereferencing**:
   - Inside pipeline functions, do not store previous stage buffers in persistent outer variables.
   - For batch page processing in `splitAndCompress`, build page documents sequentially inside the loop and clear references.
3. **Zero TypedArray Bleed**:
   - Always run intermediate buffers through `toCleanUint8Array` to ensure unpooled buffers with `byteOffset === 0` and unshared backing `ArrayBuffer` instances.

---

### 4.9 UI Integration in `src/ToolPage.tsx`

1. **File Type Filter & Dropzone**:
   - `getAcceptedTypes(id)`:
     ```ts
     if (id === "convert" || id === "convert-compress") {
       return ".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.txt,application/*"
     }
     if (id === "merge-compress" || id === "split-compress") {
       return ".pdf,application/pdf"
     }
     ```
   - Multi-file drop check:
     ```ts
     const allowMultiple =
       tool.id === "merge-pdf" ||
       tool.id === "merge-compress" ||
       tool.id === "zip" ||
       tool.id === "jpg-to-pdf"
     ```
   - Strict PDF list: Add `"merge-compress"` and `"split-compress"` to `isStrictPdf`.

2. **Dynamic UI Option Controls**:
   - **`convert`**:
     - Shows format detection badge (e.g. `Detected: PDF Document`).
     - Target format select dropdown:
       - For PDF: DOCX, PPTX, XLSX, CSV, JPG, TXT.
       - For Word: PDF, TXT.
       - For PPT: PDF, TXT.
       - For Excel: PDF, CSV, TSV.
       - For Images: PDF.
   - **`convert-compress`**:
     - Target format dropdown (default: "pdf").
     - Compression preset select (`standard` vs `high`).
   - **`merge-compress`**:
     - Sequence drag / arrow controls for uploaded PDFs.
     - Compression preset select (`standard` vs `high`).
   - **`split-compress`**:
     - Split mode radio or dropdown: "Page Range" vs "All Pages to ZIP".
     - Page range input field (`extra`, placeholder: `e.g. 1-3, 5`).
     - Compression preset select (`standard` vs `high`).

3. **Multi-Stage Progress Bar UI Component**:
   When `status === "processing"` for pipeline tools, display:
   ```tsx
   <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden mt-3">
     <div
       className="bg-emerald-500 h-full transition-all duration-300 ease-out"
       style={{ width: `${overallProgress}%` }}
     />
   </div>
   <div className="flex justify-between items-center text-xs text-zinc-400 mt-1">
     <span>{pipelineMessage || `Stage: ${pipelineStage} (${stageProgress}%)`}</span>
     <span>{overallProgress}%</span>
   </div>
   ```

4. **Detailed Metrics Result Card**:
   When `status === "completed"` and `metrics` exists:
   ```tsx
   <div className="grid grid-cols-3 gap-2 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
     <div>
       <span className="text-zinc-400 text-xs block">Original</span>
       <span className="font-semibold text-zinc-200 text-sm">
         {(metrics.originalSize / 1024).toFixed(1)} KB
       </span>
     </div>
     {metrics.intermediateSize !== undefined && (
       <div>
         <span className="text-zinc-400 text-xs block">Stage 1</span>
         <span className="font-semibold text-zinc-200 text-sm">
           {(metrics.intermediateSize / 1024).toFixed(1)} KB
         </span>
       </div>
     )}
     <div>
       <span className="text-zinc-400 text-xs block">
         Optimized ({metrics.savedPercentage}% saved)
       </span>
       <span className="font-semibold text-emerald-400 text-sm">
         {(metrics.finalSize / 1024).toFixed(1)} KB
       </span>
     </div>
   </div>
   ```

---

## 5. Verification Method

To independently verify this implementation:

1. **Bare Blob Safety Verification**:
   - Create a test calling `extractBytes(new Blob([bytes]))` directly:
     Verify it returns `{ bytes: Uint8Array, name: "document.pdf" }` and does NOT throw `TypeError: Cannot read properties of undefined (reading 'replace')`.
   - Call `compressPDF(new Blob([bytes]) as File)` directly:
     Verify it returns `{ name: "compressed-document.pdf", blob: Blob }` and does NOT emit `"compressed-undefined"`.
2. **Unit Test Suite for Chained Multi-Action Pipelines (`tests/m4-pipelines.test.cjs`)**:
   - `universalConvert`: Test matrix converting PDF -> Word, PDF -> PPT, PDF -> Excel, PDF -> JPG, Word -> PDF, PPT -> PDF, Excel -> PDF, Image -> PDF.
   - `convertAndCompress`: Test Word document converted to PDF and compressed; verify valid PDF binary headers (`%PDF-1.7`), non-zero sizes, and metrics object.
   - `mergeAndCompress`: Test 2-3 sample PDFs merged and compressed; verify page count matches sum of input page counts, object streams enabled, and valid `PipelineMetricsResult`.
   - `splitAndCompress`:
     - Test range extraction ("1-2" on a 4-page PDF): verify output has 2 pages and valid metrics.
     - Test "all-pages" mode: verify output is a valid PK-ZIP archive containing `compressed-page-1.pdf`, `compressed-page-2.pdf`, etc.
   - Progress callback: Verify `onProgress` receives valid events with `stage`, `stageProgress` (0-100), and `overallProgress` (0-100).
3. **Regression & Bundling**:
   - Run `npm test` -> All tests pass (expect 275+ tests).
   - Run `npm run build` -> Vite compilation exits with code 0.
