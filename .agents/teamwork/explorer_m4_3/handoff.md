# Milestone 4 Investigation & Design Report: ToolPage.tsx UI Integration & Automated Test Suite Specifications

**Author**: Explorer M4-3 (teamwork_explorer)  
**Date**: 2026-11-10  
**Scope**: UI Integration in `src/ToolPage.tsx` and Automated Test Specifications in `tests/m4-pipelines.test.cjs` for Milestone 4 (`zip`, `ocr`, `convert`, `convert-compress`, `merge-compress`, `split-compress`).

---

## 1. Observation

### 1.1 Existing Codebase & UI Architecture
1. **Catalog Registration**:
   In `src/config.ts` (lines 323–396), all 6 Milestone 4 tools are defined under the `"File tools"` category with `available: true`:
   - Tool #19: `ocr` ("OCR Scanner", icon: `FileScan`)
   - Tool #21: `zip` ("ZIP and Unzip", icon: `Archive`)
   - Tool #22: `convert` ("Convert Formats", icon: `ArrowLeftRight`)
   - Tool #23: `convert-compress` ("Convert & Compress", icon: `Workflow`)
   - Tool #24: `merge-compress` ("Merge & Compress", icon: `Layers`)
   - Tool #25: `split-compress` ("Split & Compress", icon: `Files`)

2. **Current `ToolPage.tsx` Handling**:
   - **Dropzone File Types** (`src/ToolPage.tsx`, lines 480–486):
     ```typescript
     if (
       id === "zip" ||
       id === "convert" ||
       id === "ocr" ||
       id === "documents"
     ) {
       return "*/*"
     }
     ```
     `merge-compress` and `split-compress` currently fall through to default `".pdf,application/pdf"`. However, `zip` lacks a mode toggle to switch between `*/*` (create archive) and `.zip` (extract archive), and `ocr` does not restrict to `.jpg,.jpeg,.png,.webp,image/*,.pdf`.
   - **Strict PDF Filtering** (`src/ToolPage.tsx`, lines 494–506):
     `isStrictPdf` contains M2 and M3 PDF tools, but currently omits `merge-compress` and `split-compress`.
   - **Dropzone Multiple Files** (`src/ToolPage.tsx`, lines 1615–1619):
     ```typescript
     multiple={
       tool.id === "merge-pdf" ||
       tool.id === "zip" ||
       tool.id === "jpg-to-pdf"
     }
     ```
     `merge-compress` is omitted from `multiple`, preventing users from selecting multiple PDFs to merge and compress in one selection.
   - **Execution Fallthrough** (`src/ToolPage.tsx`, lines 992–1020):
     None of the 6 M4 tools have dedicated execution branches in `try { ... }`. They fall through to:
     ```typescript
     else if (tool.category === "File tools") {
       // General conversion / document packaging
       ...
     }
     ```
     This fallback simply copies original bytes into a renamed Blob without executing real archiving, OCR, conversion, or compression pipelines.
   - **Options Panels Missing** (`src/ToolPage.tsx`, lines 1690–2445):
     Dedicated options panels exist for M2 tools (`rotate-pdf`, `split-pdf`, `compress`, `edit-pdf`, `watermark`, `sign-pdf`, `password`) and M3 tools (`pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, `word-to-pdf`, `ppt-to-pdf`, `excel-to-pdf`, `pdf-to-jpg`, `jpg-to-pdf`), but **none** exist for the 6 M4 tools.
   - **Action Button Copy** (`src/ToolPage.tsx`, lines 2464–2502):
     M4 tools fall through to the default ``Run ${tool.name}``, rather than user-friendly action verbs like `"Create ZIP Archive"`, `"Scan & Extract Text"`, `"Merge & Compress PDFs"`, etc.
   - **Pipeline Metrics UI** (`src/ToolPage.tsx`, lines 2588–2610):
     Compression metrics badge only activates for `tool.id === "compress"` and assumes a single file input:
     `{tool.id === "compress" && files[0] && ( ... )}`. Chained pipelines (`convert-compress`, `merge-compress`, `split-compress`) have no stats badge.

3. **Existing Test Framework**:
   - `package.json` runs `node --test tests/*.test.cjs`.
   - All 249 existing automated tests currently pass (`tests 249, pass 249, fail 0`).
   - `tests/m3-conversions.test.cjs` and `tests/m3-challenger-empirical.test.cjs` establish test patterns:
     - `ts.transpileModule` + `vm.runInThisContext` to load `src/services.ts`.
     - `react-dom/server` (`renderToStaticMarkup`) to test UI route rendering and DOM element matching without browser dependencies.

4. **Challenger 1 Caveat on Bare Blobs**:
   In `src/services.ts`, `compressPDF` (line 430) executes `name: 'compressed-${file.name}'`. If an intermediate programmatic `Blob` (which lacks a `.name` property) is passed from Step 1 to Step 2, `file.name` is `undefined`, and functions calling `.name.replace()` throw a runtime `TypeError`.

---

## 2. Logic Chain

### 2.1 File Dropzones Architecture
Each of the 6 tools requires specific dropzone behavior:

| Tool ID | Tool Name | Mode / Behavior | Accepted File Types (`accept`) | Multi-File (`multiple`) | Re-ordering & Preview |
|---|---|---|---|---|---|
| `zip` | ZIP and Unzip | Mode Toggle: **Create** vs **Extract** | Create: `*/*`<br>Extract: `.zip,application/zip,application/x-zip-compressed` | Create: `true`<br>Extract: `false` | In Create mode: show file list with remove buttons.<br>In Extract mode: show extracted tree after parsing. |
| `merge-compress` | Merge & Compress | Multi-PDF Pipeline | `.pdf,application/pdf` | `true` | Show file list with `ArrowUp`/`ArrowDown` re-ordering, page count preview, and remove `X` buttons. |
| `convert` | Convert Formats | Universal Converter | All supported: `.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp` | `false` | Single file badge with detected format indicator. |
| `ocr` | OCR Scanner | Scanned Image / PDF | `.jpg,.jpeg,.png,.webp,image/*,.pdf,application/pdf` | `false` | Single file preview. |
| `convert-compress` | Convert & Compress | Document / Image to PDF/Office + Compress | `.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp` | `false` | Single file preview with target format options. |
| `split-compress` | Split & Compress | Single PDF to Split + Compress | `.pdf,application/pdf` | `false` | Single PDF preview with page range inputs. |

### 2.2 Interactive Options Panels Design

#### 1. `zip` (Tool #21)
- **Mode Toggle**: Segmented pill/button group at top of form:
  - `[Create Archive]` (Default):
    - **Archive Filename**: Text input (`extra`, default: `archive.zip` or custom name).
    - **Compression Preset**: Select (`optionA`):
      - `standard` -> "Standard (Deflate Level 6 - Balanced)"
      - `maximum` -> "Maximum (Deflate Level 9 - Best Compression)"
      - `store` -> "Store (No Compression - Instant Packaging)"
    - Action button: `"Create ZIP Archive"`
  - `[Extract Archive]`:
    - Dropzone accepts single `.zip` file.
    - Action button: `"Extract ZIP Files"`
    - **Extracted Items Result View**:
      - Table or tree listing each extracted file: Icon, Filename, Size (`KB`).
      - Individual `"Download"` button for each entry.
      - Top toolbar button: `"Download All as ZIP"` or batch extract.

#### 2. `ocr` (Tool #19)
- **Language Selector** (`optionA`):
  - English (`en`), Spanish (`es`), French (`fr`), German (`de`), Chinese (`zh`), Japanese (`ja`), Auto-detect (`auto`).
- **Scan Preprocessing Toggles** (boolean switches/checkboxes):
  - Auto Contrast Enhancement & Binarization (default: `true`)
  - Invert Colors / Dark Mode Scan (default: `false`)
  - Clean Background Speckle & Noise (default: `true`)
- **Action Button**: `"Scan & Extract Text"`
- **Interactive OCR Result Panel**:
  - Live Statistics Bar:
    `Word count: 142 | Character count: 890 | Recognition Confidence: 96%`
  - Large editable `<textarea>` so user can inspect and edit recognized text directly before saving.
  - Action buttons:
    - `<button className="primary"><Copy size={16}/> Copy Text</button>` (triggers toast notification)
    - `<button className="primary"><Download size={16}/> Download TXT</button>` (saves `${basename}-ocr.txt`)

#### 3. `convert` (Tool #22)
- **Detected Source Format Badge**:
  Renders automatically when a file is selected:
  `Detected Source: PDF Document` or `Detected Source: Word DOCX`, etc.
- **Dynamic Target Format Dropdown** (`optionA`):
  - If source is PDF: `docx` (Word), `pptx` (PowerPoint), `xlsx` (Excel), `jpg` (JPEG), `txt` (Plain text).
  - If source is Word / PPT / Excel / Image: `pdf` (PDF Document).
- **Conversion Quality / Preset** (`optionB`):
  - `high` -> "High Quality (Preserve layout, typography & vector graphics)"
  - `balanced` -> "Balanced (Optimized for web distribution & sharing)"
  - `compact` -> "Compact (Minimal file size)"
- **Action Button**: `"Convert File"`

#### 4. `convert-compress` (Tool #23)
- **Target Format Selector** (`optionA`):
  - `pdf` (PDF Document - Default)
  - `docx` (Word Document)
  - `jpg` (High-Res JPEG)
- **Compression Profile Selector** (`optionB`):
  - `recommended` -> "Recommended (Balanced size & visual clarity - up to 50% savings)"
  - `extreme` -> "Extreme (Maximum size reduction - up to 75% savings)"
  - `low` -> "Low (Lossless stream optimization - 100% fidelity)"
- **Action Button**: `"Convert & Compress"`

#### 5. `merge-compress` (Tool #24)
- **Multi-File PDF List**:
  - Drag-and-drop or file picker with re-ordering arrows (`ArrowUp` / `ArrowDown`).
  - Total input size badge and page count estimation.
- **Compression Profile Selector** (`optionA`):
  - `recommended` -> "Recommended (Balanced 50% reduction)"
  - `extreme` -> "Extreme (Aggressive stream optimization & object deduplication)"
  - `low` -> "Low (Light optimization)"
- **Metadata Toggle** (`optionB` or checkbox):
  - Checkbox: "Strip PDF metadata (Author, Producer, Creation Date) for extra compression & privacy" (default: `true`).
- **Action Button**: `"Merge & Compress PDFs"`

#### 6. `split-compress` (Tool #25)
- **Extract Mode Selector** (`optionA`):
  - `ranges` -> "Selected Page Ranges"
  - `all` -> "Split All Pages into Compressed Archive"
- **Page Ranges Input** (`extra`):
  - Text input: `placeholder="e.g. 1-5, 8, 11-14"`
  - Helper note explaining range syntax and out-of-range boundaries.
- **Compression Profile Selector** (`optionB`):
  - `recommended` -> "Recommended Compression"
  - `extreme` -> "Extreme Compression"
  - `low` -> "Low Compression"
- **Action Button**: `"Split & Compress PDF"`

### 2.3 Multistage Pipeline Progress & Metrics UI

1. **Stepped Progress Visualizer State**:
   Add a progress state to `ToolPage.tsx`:
   `pipelineStep: { current: number, total: number, label: string } | null`
   When executing chained pipelines:
   - For `merge-compress`:
     - Step 1: `setPipelineStep({ current: 1, total: 2, label: "Step 1: Merging PDFs..." })`
     - Step 2: `setPipelineStep({ current: 2, total: 2, label: "Step 2: Compressing merged PDF..." })`
     - Completion: `setPipelineStep(null)`, `setStatus("completed")`
   - For `convert-compress`:
     - Step 1: `setPipelineStep({ current: 1, total: 2, label: "Step 1: Converting to target format..." })`
     - Step 2: `setPipelineStep({ current: 2, total: 2, label: "Step 2: Compressing converted document..." })`
   - For `split-compress`:
     - Step 1: `setPipelineStep({ current: 1, total: 2, label: "Step 1: Splitting PDF pages..." })`
     - Step 2: `setPipelineStep({ current: 2, total: 2, label: "Step 2: Compressing split PDF..." })`
   - The primary action button displays the active step during processing:
     `{status === "processing" ? (pipelineStep ? pipelineStep.label : "Processing…") : actionButtonText}`

2. **Unified Metrics Stats Badge**:
   Store pipeline metrics in state:
   ```typescript
   interface PipelineMetrics {
     originalSize: number
     intermediateSize?: number
     finalSize: number
     savedPercentage: number
   }
   ```
   In the result panel, when any compression or pipeline tool completes (`compress`, `convert-compress`, `merge-compress`, `split-compress`), render:
   ```tsx
   {pipelineMetrics && (
     <div
       className="pipeline-stats-badge"
       style={{
         margin: "12px 0",
         padding: "10px 14px",
         borderRadius: "8px",
         background: "rgba(16, 185, 129, 0.1)",
         border: "1px solid rgba(16, 185, 129, 0.25)",
         color: "var(--text)",
         fontSize: "12px",
       }}
     >
       <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
         <strong style={{ color: "#10b981" }}>Pipeline Complete</strong>
         <span style={{ fontWeight: 700, color: "#10b981" }}>
           Saved {pipelineMetrics.savedPercentage}%
         </span>
       </div>
       <div style={{ display: "flex", gap: "8px", color: "var(--muted)", fontSize: "11px" }}>
         <span>Original: {(pipelineMetrics.originalSize / 1024).toFixed(1)} KB</span>
         {pipelineMetrics.intermediateSize && (
           <>
             <span>&rarr;</span>
             <span>Stage 1: {(pipelineMetrics.intermediateSize / 1024).toFixed(1)} KB</span>
           </>
         )}
         <span>&rarr;</span>
         <strong style={{ color: "var(--text)" }}>Final: {(pipelineMetrics.finalSize / 1024).toFixed(1)} KB</strong>
       </div>
     </div>
   )}
   ```

### 2.4 Dynamic Action Button Copy Mapping
In `ToolPage.tsx`, replace the static button text ternary with a dedicated lookup:
```typescript
function getActionButtonLabel(): string {
  if (status === "processing") {
    return pipelineStep ? pipelineStep.label : "Processing…"
  }
  switch (tool.id) {
    case "zip":
      return zipMode === "extract" ? "Extract ZIP Files" : "Create ZIP Archive"
    case "ocr":
      return "Scan & Extract Text"
    case "convert":
      return "Convert File"
    case "convert-compress":
      return "Convert & Compress"
    case "merge-compress":
      return "Merge & Compress PDFs"
    case "split-compress":
      return "Split & Compress PDF"
    // ... preserve existing cases
    default:
      return `Run ${tool.name}`
  }
}
```

---

## 3. Automated Test Suite Specifications (`tests/m4-pipelines.test.cjs`)

To provide 100% automated coverage for Milestone 4, `tests/m4-pipelines.test.cjs` will contain 6 focused test suites with a total of **25+ comprehensive test cases**.

### 3.1 Suite 1: Pure Client-Side ZIP Archive Engine
1. **`zipFiles`: Multi-file packaging of mixed text and binary entries**:
   - Create 3 files: a UTF-8 text file, an emoji-bearing markdown file, and a raw binary Uint8Array (0x00 to 0xFF).
   - Package via `zipFiles`.
   - Verify returned object `{ blob: Blob, filename: string }`.
   - Verify PK-ZIP binary header: local header signature `0x04034B50`, central directory signature `0x02014B50`, EOCD `0x06054B50`.
2. **`extractZipArchive`: Round-trip unpacking and byte-for-byte fidelity**:
   - Unpack the archive created in test 1.
   - Verify all 3 entries are recovered with exact filenames, exact sizes, and identical binary contents.
3. **Directory and path preservation**:
   - Package files with nested directory paths (`docs/readme.txt`, `images/logo.png`).
   - Extract archive and verify paths and contents are preserved without corruption.
4. **Empty and zero-byte file tolerance**:
   - Archive containing a 0-byte file (`empty.txt`) creates valid ZIP and extracts to a 0-byte Uint8Array.
5. **Hostile / Corrupt Archive Boundary**:
   - Empty input (0 bytes) throws `"Archive cannot be empty"` or `"End of central directory not found"`.
   - Truncated ZIP data throws descriptive error without hanging or throwing unhandled exceptions.

### 3.2 Suite 2: Client-Side OCR Text Recognition Engine
1. **Synthetic Image OCR Recognition**:
   - Generate synthetic image bytes (e.g. BMP / PNG data with high-contrast glyph pattern for `"FLUXKIT OCR 2026"`).
   - Run `scanOCR(imageFile, { enhanceContrast: true })`.
   - Verify result object has `{ text: string, confidence: number, lines: Array<{ text: string, confidence: number }> }`.
   - Verify confidence > 0.8 and recognized string contains keywords.
2. **Text-Layer Scanned PDF Text Extraction**:
   - Generate a PDF with `pdf-lib` containing text headers and invoice paragraphs (`"Invoice #9821"`, `"Total: $450.00"`).
   - Run `scanOCR(pdfFile, { language: "en" })`.
   - Verify all text lines are accurately extracted into formatted text output.
3. **Preprocessing Toggle Fidelity**:
   - Verify `invertColors: true` correctly handles inverted scans.
   - Verify `language: "es"` / `"fr"` / `"de"` / `"zh"` / `"ja"` sets appropriate recognition dictionary.
4. **Plain Text Export**:
   - Verify generated OCR result can be downloaded as a clean UTF-8 `.txt` file with accurate filename (`${baseName}-ocr.txt`).

### 3.3 Suite 3: Universal Format Converter (`convert`)
1. **Format Detection Oracle**:
   - Test detection function on `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.jpg`, `.png`, `.txt`.
   - Verify each file is correctly mapped to its canonical type.
2. **PDF -> Word DOCX conversion**:
   - Input test PDF -> `convertFormat(pdf, "docx")` -> produces valid OpenXML PK-ZIP with `word/document.xml`.
3. **PDF -> PowerPoint PPTX conversion**:
   - Input test PDF -> `convertFormat(pdf, "pptx")` -> produces valid OpenXML PK-ZIP with `ppt/presentation.xml`.
4. **PDF -> Excel XLSX conversion**:
   - Input test PDF -> `convertFormat(pdf, "xlsx")` -> produces valid OpenXML PK-ZIP with `xl/workbook.xml`.
5. **PDF -> JPG conversion**:
   - Input test PDF -> `convertFormat(pdf, "jpg")` -> produces JPEG with SOI `0xFF, 0xD8` and EOI `0xFF, 0xD9`.
6. **Office / Images -> PDF conversion**:
   - Input Word DOCX / Excel CSV / JPG -> `convertFormat(doc, "pdf")` -> produces valid PDF with `%PDF-` header.
7. **Base filename preservation**:
   - Input `financial_report.pdf` -> `financial_report-converted.docx`.

### 3.4 Suite 4: Chained Multi-Action Pipelines
1. **`convertAndCompress` (Word/Image -> PDF -> Compressed PDF)**:
   - Input test image or Word document.
   - Converts to PDF, then immediately passes output to `compressPDF`.
   - Verify intermediate `Blob` without `.name` property does NOT crash (`(input as File).name || "document"` safe resolution).
   - Verify final output is a valid PDF.
   - Verify return object contains `{ blob, filename, originalSize, intermediateSize, finalSize, savedPercentage }`.
2. **`mergeAndCompressPDFs` (Multi-PDF Merge + Stream Compression)**:
   - Input 3 test PDFs (e.g. 2 pages, 1 page, 3 pages).
   - Merges into 6-page PDF, then compresses with metadata stripping.
   - Load resulting PDF with `PDFDocument.load()`:
     - Verify page count is exactly 6.
     - Verify metadata properties (title, author, creator) are stripped.
   - Verify metrics: `originalSize` (sum of 3 inputs) > `finalSize`.
3. **`splitAndCompressPDF` (PDF Range Split + Stream Compression)**:
   - Input 6-page test PDF.
   - Split pages `"1-2, 5"` (extracts 3 pages).
   - Immediately compresses the extracted pages.
   - Load resulting PDF with `PDFDocument.load()`:
     - Verify page count is exactly 3.
     - Verify compression metrics returned.

### 3.5 Suite 5: Error Boundaries & Hostile Scenarios
1. **0-byte file inputs**:
   - Passing 0-byte file to `zipFiles`, `scanOCR`, `convertFormat`, `convertAndCompress`, `mergeAndCompressPDFs`, `splitAndCompressPDF` rejects with clean descriptive errors.
2. **`split-compress` Page Range Boundaries**:
   - Malformed range syntax (`"abc"`, `"-1-5"`, `",,"`) throws `"Invalid page range syntax"`.
   - Out-of-bounds page range (`"99"` on a 5-page PDF) throws `"Page 99 is out of range (document has 5 pages)"`.
   - Empty range string when in `"ranges"` mode throws `"Specify page ranges to extract"`.
3. **Insufficient file count**:
   - `merge-compress` with < 2 PDFs throws `"Choose at least two PDFs to merge"`.
   - `convert`, `convert-compress`, `split-compress`, `ocr` with 0 files throws descriptive selection error.
4. **Corrupt ZIP Archive**:
   - Corrupted central directory signature throws clean error without uncaught exceptions.

### 3.6 Suite 6: Route Rendering & UI Options Panel Mounting
Using `renderToStaticMarkup`:
1. **`#zip` route**:
   - Renders "ZIP and Unzip".
   - Renders "Create Archive" and "Extract Archive" mode buttons.
   - In Create mode: dropzone has `multiple=""`, archive filename input, compression level dropdown, action button has `"Create ZIP Archive"`.
2. **`#ocr` route**:
   - Renders "OCR Scanner".
   - Dropzone has `accept=".jpg,.jpeg,.png,.webp,image/*,.pdf,application/pdf"`.
   - Renders language selector dropdown with Latin/Spanish/French/German/Chinese/Japanese.
   - Renders contrast and preprocessing checkboxes.
   - Action button has `"Scan & Extract Text"`.
3. **`#convert` route**:
   - Renders "Convert Formats".
   - Renders target format dropdown and conversion quality preset.
   - Action button has `"Convert File"`.
4. **`#convert-compress` route**:
   - Renders "Convert & Compress".
   - Renders target format selector and compression profile (Recommended, Extreme, Low).
   - Action button has `"Convert & Compress"`.
5. **`#merge-compress` route**:
   - Renders "Merge & Compress".
   - Dropzone has `multiple=""` and accepts `.pdf`.
   - Renders compression profile and remove metadata toggle.
   - Action button has `"Merge & Compress PDFs"`.
6. **`#split-compress` route**:
   - Renders "Split & Compress".
   - Single PDF dropzone.
   - Renders page range input with placeholder `"e.g. 1-5, 8, 11-14"` and compression profile.
   - Action button has `"Split & Compress PDF"`.

---

## 4. Caveats

1. **Read-Only Explorer Constraint**:
   As Explorer M4-3, no source files or tests outside `.agents/teamwork/explorer_m4_3` have been edited. The implementer (Worker M4) will apply these designs to `src/ToolPage.tsx`, `src/services.ts`, and `tests/m4-pipelines.test.cjs`.
2. **In-Browser OCR Approach**:
   Requirement R3 strictly mandates client-side processing without external backend servers or paid API keys. Optical character analysis and PDF text extraction must be performed directly in browser memory (using Canvas image processing, glyph feature extraction, and `pdf-lib` text streams).
3. **Intermediate `Blob` Name Safety**:
   When chaining `mergePDFs` -> `compressPDF` or `pdfToWord` -> `compressPDF`, intermediate programmatic `Blob` instances do not have a `.name` property. All chained functions and `extractBytes` must use `(input as File).name || "document"` to avoid `TypeError: Cannot read properties of undefined (reading 'replace')`.

---

## 5. Conclusion

Milestone 4 completes the interactive capabilities of FluxKit's archiving, text scanning, and chained multi-action workflows.
- `src/ToolPage.tsx` requires:
  1. Updated `getAcceptedFileTypes()` and `multiple` attribute for M4 tools (especially `zip` mode toggle and `merge-compress` multi-file support).
  2. Dedicated options panels for `zip`, `ocr`, `convert`, `convert-compress`, `merge-compress`, and `split-compress`.
  3. Multistage progress visualizer (`pipelineStep`) and compression metrics badge (`pipelineMetrics`).
  4. Precise dynamic action button copy.
- `tests/m4-pipelines.test.cjs` provides complete automated regression verification across 25+ test cases covering binary round-tripping, OCR recognition, universal routing, chained pipelines, error boundaries, and static route rendering.

---

## 6. Verification Method

To verify the implementation once Worker M4 applies the changes:
1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
   Must pass all existing 249 tests plus all new Milestone 4 tests in `tests/m4-pipelines.test.cjs` with 0 failures.
2. **Build Verification**:
   ```powershell
   npm run build
   ```
   Must compile TypeScript and build the Vite bundle with 0 errors.
3. **Route Mounting & Options Panel Inspection**:
   Inspect HTML generated by `renderToStaticMarkup(React.createElement(App))` for hashes `#zip`, `#ocr`, `#convert`, `#convert-compress`, `#merge-compress`, `#split-compress` to confirm options panels, dropzone configurations, and action button labels mount correctly.
