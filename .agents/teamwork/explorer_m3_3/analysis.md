# Milestone 3 Explorer M3-3 Analysis Report: UI Controls & Test Suite Architecture

## 1. Executive Summary

Milestone 3 focuses on **Document & Format Conversions**, covering 8 tools:
1. `pdf-to-word` (#pdf-to-word) — PDF to DOCX/DOC/TXT
2. `pdf-to-ppt` (#pdf-to-ppt) — PDF to PPTX presentation slides
3. `pdf-to-excel` (#pdf-to-excel) — PDF to XLSX/CSV/TSV tables
4. `word-to-pdf` (#word-to-pdf) — Word / DOCX / TXT to formatted PDF
5. `ppt-to-pdf` (#ppt-to-pdf) — PowerPoint / PPTX / outline to landscape slide PDF
6. `excel-to-pdf` (#excel-to-pdf) — Excel / XLSX / CSV to printable styled PDF table
7. `pdf-to-jpg` (#pdf-to-jpg) — PDF to high-resolution JPEG images
8. `jpg-to-pdf` (#jpg-to-pdf) — Multi-image (JPG/PNG/WEBP) to combined PDF

This investigation establishes:
1. **Interactive UI Controls in `src/ToolPage.tsx`**: Dropzone MIME type and multiple-file configurations, input validation, custom conversion options (`optionA`, `optionB`, `extra`), action button styling and copy, real-time conversion feedback, downloadable artifacts, and activity tracking (`onComplete`).
2. **Automated Test Specification in `tests/m3-conversions.test.cjs`**: A comprehensive, standalone test suite targeting 100% test pass rate under `node --test tests/*.test.cjs` with 0 regressions against existing 155 tests.

---

## 2. Current Codebase & Architectural State

### 2.1 Codebase Inspection (`src/ToolPage.tsx`)
1. **Dropzone MIME Type Acceptance (`getAcceptedFileTypes`)**:
   - Lines 437-460 currently group `jpg` and `image` together, but do not distinguish `pdf-to-jpg` (which requires input `.pdf`) from `jpg-to-pdf` (which requires input images).
   - `word-to-pdf`, `ppt-to-pdf`, and `excel-to-pdf` need explicit support for modern and legacy Office formats (`.docx`, `.pptx`, `.xlsx`, `.csv`, `.tsv`, `.txt`).
2. **File Selection Mode (`addFiles` & input tag)**:
   - Line 1493: `<input type="file" multiple={tool.id === "merge-pdf" || tool.id === "zip"} ... />`
   - `jpg-to-pdf` requires `multiple={true}` so users can drop 2+ photos and arrange them with page up/down buttons before conversion into a single multi-page PDF.
3. **Strict PDF Input Enforcement**:
   - Lines 466-474: `isStrictPdf` contains only M2 tools.
   - `pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, and `pdf-to-jpg` should be added to `isStrictPdf` to reject non-PDF uploads immediately with clear feedback: `"${file.name}: only PDF files are supported."`
4. **Tool Options Form (`src/ToolPage.tsx` lines 1475-1947)**:
   - Currently, NONE of the 8 conversion tools have custom options rendered in the form. They only display the generic dropzone and default button text (`Run ${tool.name}`).
5. **Execution Handler (`submit` function lines 870-899)**:
   - Conversion tools currently fall through to a dummy generic file copy:
     `const blob = new Blob([await original.arrayBuffer()], { type: ... })`
   - They must be wired to real service functions: `pdfToWord`, `pdfToPPT`, `pdfToExcel`, `wordToPDF`, `pptToPDF`, `excelToPDF`, `pdfToJPG`, and `jpgToPDF`.

### 2.2 Metadata Inspection (`src/config.ts`)
- All 8 conversion tools are registered with `category: "File tools"`, `available: true`, and distinct format badges:
  - `pdf-to-word` -> `DOCX` (blue)
  - `pdf-to-ppt` -> `PPTX` (orange)
  - `pdf-to-excel` -> `XLSX` (emerald)
  - `word-to-pdf` -> `TO PDF` (blue)
  - `ppt-to-pdf` -> `TO PDF` (orange)
  - `excel-to-pdf` -> `TO PDF` (emerald)
  - `pdf-to-jpg` -> `JPG` (amber)
  - `jpg-to-pdf` -> `TO PDF` (amber)

### 2.3 Existing Test Suite Health
- Running `npm test` executes `node --test tests/*.test.cjs`.
- Current baseline: **155 passing tests, 0 failing tests**.
- The new test file `tests/m3-conversions.test.cjs` will automatically be executed by `npm test` without modifying `package.json`.

---

## 3. UI Controls Specification for `src/ToolPage.tsx`

### 3.1 Tool-by-Tool UI Matrix

| Tool ID | Tool Name | Accepted Inputs | Multi-File | Option A (`optionA`) | Option B (`optionB`) | Extra Input (`extra`) | Action Button Text | Output Format |
|---|---|---|---|---|---|---|---|---|
| `pdf-to-word` | PDF to Word | `.pdf,application/pdf` | No | **Output Format**: `docx` (Word OpenXML), `doc` (Word 97-2003), `txt` (Plain Text) | **Layout Preservation**: `standard` (Headings & Paragraphs), `clean` (Clean Text), `compact` (Dense Spacing) | None | `Convert to Word` | `.docx` (or chosen format) |
| `pdf-to-ppt` | PDF to PowerPoint | `.pdf,application/pdf` | No | **Slide Aspect Ratio**: `16:9` (Widescreen), `4:3` (Standard) | **Slide Theme**: `fluxkit-dark` (Dark Theme), `minimal-white` (Clean White), `corporate-blue` (Slate Indigo) | None | `Convert to PowerPoint` | `.pptx` |
| `pdf-to-excel` | PDF to Excel | `.pdf,application/pdf` | No | **Output Format**: `xlsx` (Excel Workbook), `csv` (Comma-Separated), `tsv` (Tab-Separated) | **Table Detection**: `auto` (Auto Table Grids), `whitespace` (Column Spacing), `lines` (Line-by-Line) | None | `Convert to Excel` | `.xlsx` (or chosen format) |
| `word-to-pdf` | Word to PDF | `.docx,.doc,.txt,text/plain,...` | No | **Page Margins**: `standard` (1 inch / 72pt), `compact` (0.5 inch / 36pt), `spacious` (1.5 inch / 108pt) | **Font Family**: `helvetica` (Modern Sans), `times` (Classic Serif), `courier` (Monospaced) | Optional Document Title | `Convert to PDF` | `.pdf` |
| `ppt-to-pdf` | PowerPoint to PDF | `.pptx,.ppt,.txt,...` | No | **Slide Orientation**: `landscape-16-9` (16:9 Widescreen), `landscape-4-3` (4:3 Standard), `portrait` (Portrait Handout) | **Slides Per Page**: `1` (1 Slide Per Page), `2` (2 Slides Per Page), `4` (4 Slides Per Page) | None | `Convert to PDF` | `.pdf` |
| `excel-to-pdf` | Excel to PDF | `.xlsx,.xls,.csv,.tsv,...` | No | **Page Orientation**: `landscape` (Landscape - Wide Tables), `portrait` (Portrait - Vertical) | **Table Grid Styling**: `grid-indigo` (Grid + Indigo Headers), `zebra` (Alternating Stripes), `minimal` (Clean Gridlines) | None | `Convert to PDF` | `.pdf` |
| `pdf-to-jpg` | PDF to JPG | `.pdf,application/pdf` | No | **Image Quality**: `high` (300 DPI Print Quality), `standard` (150 DPI Balanced), `compact` (72 DPI Fast Sharing) | **Page Selection**: `first` (First Page Only), `all` (All Pages Bundled), `custom` (Custom Page) | Target Page Number (when `custom`) | `Convert to JPG` | `.jpg` (or `.zip` for all) |
| `jpg-to-pdf` | JPG to PDF | `.jpg,.jpeg,.png,.webp,image/*` | **Yes** (Multiple) | **Page Orientation**: `auto` (Auto-detect ratio), `portrait` (Portrait 8.5×11), `landscape` (Landscape 11×8.5) | **Margins & Scaling**: `fit-margins` (Fit with 0.5 in Margins), `no-margins` (Full Bleed 0 Margins), `center-original` (1:1 Scale) | Reordering arrows in file list | `Convert to PDF` | `.pdf` |

---

### 3.2 Exact JSX Layout Specification

All options panels must follow the proven 2-column responsive grid layout used by M2 tools (`edit-pdf`, `watermark`, `sign-pdf`):
```tsx
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
  <label> ... </label>
  <label> ... </label>
</div>
```

#### 1. `pdf-to-word` Options Panel
```tsx
{tool.id === "pdf-to-word" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
    <label>
      Output Format
      <select value={optionA || "docx"} onChange={(e) => setOptionA(e.target.value)}>
        <option value="docx">Word Document (.docx - OpenXML)</option>
        <option value="doc">Word 97-2003 (.doc - HTML Format)</option>
        <option value="txt">Plain Formatted Text (.txt)</option>
      </select>
    </label>
    <label>
      Layout Preservation
      <select value={optionB || "standard"} onChange={(e) => setOptionB(e.target.value)}>
        <option value="standard">Standard Flow (Headings & Paragraphs)</option>
        <option value="clean">Clean Text (Stripped Formatting)</option>
        <option value="compact">Compact Layout (Dense Spacing)</option>
      </select>
    </label>
  </div>
)}
```

#### 2. `pdf-to-ppt` Options Panel
```tsx
{tool.id === "pdf-to-ppt" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
    <label>
      Slide Aspect Ratio
      <select value={optionA || "16:9"} onChange={(e) => setOptionA(e.target.value)}>
        <option value="16:9">Widescreen 16:9 (Modern 1920×1080)</option>
        <option value="4:3">Standard 4:3 (Classic 1024×768)</option>
      </select>
    </label>
    <label>
      Slide Theme
      <select value={optionB || "fluxkit-dark"} onChange={(e) => setOptionB(e.target.value)}>
        <option value="fluxkit-dark">FluxKit Dark (#0b0f19)</option>
        <option value="minimal-white">Minimal Clean White (#ffffff)</option>
        <option value="corporate-blue">Corporate Slate & Indigo</option>
      </select>
    </label>
  </div>
)}
```

#### 3. `pdf-to-excel` Options Panel
```tsx
{tool.id === "pdf-to-excel" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
    <label>
      Output Format
      <select value={optionA || "xlsx"} onChange={(e) => setOptionA(e.target.value)}>
        <option value="xlsx">Excel Workbook (.xlsx)</option>
        <option value="csv">Comma-Separated Values (.csv)</option>
        <option value="tsv">Tab-Separated Values (.tsv)</option>
      </select>
    </label>
    <label>
      Table Detection Strategy
      <select value={optionB || "auto"} onChange={(e) => setOptionB(e.target.value)}>
        <option value="auto">Auto-detect Tables & Columns</option>
        <option value="whitespace">Whitespace Column Alignment</option>
        <option value="lines">Line-by-Line Rows</option>
      </select>
    </label>
  </div>
)}
```

#### 4. `word-to-pdf` Options Panel
```tsx
{tool.id === "word-to-pdf" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
    <label>
      Page Margins
      <select value={optionA || "standard"} onChange={(e) => setOptionA(e.target.value)}>
        <option value="standard">Standard Margins (1 inch / 72pt)</option>
        <option value="compact">Narrow Margins (0.5 inch / 36pt)</option>
        <option value="spacious">Wide Margins (1.5 inch / 108pt)</option>
      </select>
    </label>
    <label>
      Font Family
      <select value={optionB || "helvetica"} onChange={(e) => setOptionB(e.target.value)}>
        <option value="helvetica">Helvetica (Modern Sans-Serif)</option>
        <option value="times">Times Roman (Classic Serif)</option>
        <option value="courier">Courier (Monospaced Technical)</option>
      </select>
    </label>
  </div>
)}
```

#### 5. `ppt-to-pdf` Options Panel
```tsx
{tool.id === "ppt-to-pdf" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
    <label>
      Slide Orientation
      <select value={optionA || "landscape-16-9"} onChange={(e) => setOptionA(e.target.value)}>
        <option value="landscape-16-9">Landscape 16:9 Widescreen (842 × 474 pt)</option>
        <option value="landscape-4-3">Landscape 4:3 Standard (792 × 595 pt)</option>
        <option value="portrait">Portrait Handout (595 × 842 pt)</option>
      </select>
    </label>
    <label>
      Slides Per Page
      <select value={optionB || "1"} onChange={(e) => setOptionB(e.target.value)}>
        <option value="1">1 Slide Per Page (Full Deck)</option>
        <option value="2">2 Slides Per Page (Handout View)</option>
        <option value="4">4 Slides Per Page (Grid Overview)</option>
      </select>
    </label>
  </div>
)}
```

#### 6. `excel-to-pdf` Options Panel
```tsx
{tool.id === "excel-to-pdf" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
    <label>
      Page Orientation
      <select value={optionA || "landscape"} onChange={(e) => setOptionA(e.target.value)}>
        <option value="landscape">Landscape (Recommended for tables)</option>
        <option value="portrait">Portrait (Vertical layout)</option>
      </select>
    </label>
    <label>
      Table Grid Styling
      <select value={optionB || "grid-indigo"} onChange={(e) => setOptionB(e.target.value)}>
        <option value="grid-indigo">Grid + Indigo Headers (#4f46e5)</option>
        <option value="zebra">Alternating Zebra Stripes</option>
        <option value="minimal">Clean Minimalist (Light Borders)</option>
      </select>
    </label>
  </div>
)}
```

#### 7. `pdf-to-jpg` Options Panel
```tsx
{tool.id === "pdf-to-jpg" && (
  <>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
      <label>
        Image Quality & Resolution
        <select value={optionA || "high"} onChange={(e) => setOptionA(e.target.value)}>
          <option value="high">High Resolution (300 DPI - Print Quality)</option>
          <option value="standard">Standard Web (150 DPI - Balanced Size)</option>
          <option value="compact">Compact Preview (72 DPI - Fast Sharing)</option>
        </select>
      </label>
      <label>
        Page Selection
        <select value={optionB || "first"} onChange={(e) => setOptionB(e.target.value)}>
          <option value="first">First Page Only (Single JPG)</option>
          <option value="all">All Pages (Bundled JPGs)</option>
          <option value="custom">Custom Page Number</option>
        </select>
      </label>
    </div>
    {optionB === "custom" && (
      <label style={{ marginTop: "12px" }}>
        Target Page Number
        <input
          type="number"
          min={1}
          value={extra || "1"}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="1"
        />
      </label>
    )}
  </>
)}
```

#### 8. `jpg-to-pdf` Options Panel
```tsx
{tool.id === "jpg-to-pdf" && (
  <>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
      <label>
        Page Orientation
        <select value={optionA || "auto"} onChange={(e) => setOptionA(e.target.value)}>
          <option value="auto">Auto-detect (Match image ratio)</option>
          <option value="portrait">Fit to Portrait (Standard Letter)</option>
          <option value="landscape">Fit to Landscape</option>
        </select>
      </label>
      <label>
        Margins & Scaling
        <select value={optionB || "fit-margins"} onChange={(e) => setOptionB(e.target.value)}>
          <option value="fit-margins">Fit to Page with 0.5 in Margins</option>
          <option value="no-margins">Full Bleed (0 Margins - Exact Image)</option>
          <option value="center-original">Center at 1:1 Scale</option>
        </select>
      </label>
    </div>
    {files.length > 1 && (
      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "8px" }}>
        Tip: Use the arrow buttons on each file to arrange page order in your PDF.
      </div>
    )}
  </>
)}
```

---

### 3.3 Submit Button Text Mapping
In `src/ToolPage.tsx`:
```tsx
{status === "processing"
  ? "Processing…"
  : tool.id === "pdf-to-word"
    ? "Convert to Word"
    : tool.id === "pdf-to-ppt"
      ? "Convert to PowerPoint"
      : tool.id === "pdf-to-excel"
        ? "Convert to Excel"
        : tool.id === "word-to-pdf"
          ? "Convert to PDF"
          : tool.id === "ppt-to-pdf"
            ? "Convert to PDF"
            : tool.id === "excel-to-pdf"
              ? "Convert to PDF"
              : tool.id === "pdf-to-jpg"
                ? "Convert to JPG"
                : tool.id === "jpg-to-pdf"
                  ? "Convert to PDF"
                  : /* other M1/M2 labels ... */
}
```

---

### 3.4 Service Dispatch in `submit(e: FormEvent)`

```tsx
// 2. M3 Document & Format Conversions
else if (tool.id === "pdf-to-word") {
  if (files.length < 1) throw new Error("Select a PDF to convert to Word.")
  const format = (optionA as "docx" | "doc" | "txt") || "docx"
  const layout = (optionB as "standard" | "clean" | "compact") || "standard"
  setResult(await pdfToWord(files[0], { format, layout }))
} else if (tool.id === "pdf-to-ppt") {
  if (files.length < 1) throw new Error("Select a PDF to convert to PowerPoint.")
  const aspectRatio = (optionA as "16:9" | "4:3") || "16:9"
  const theme = (optionB as "fluxkit-dark" | "minimal-white" | "corporate-blue") || "fluxkit-dark"
  setResult(await pdfToPPT(files[0], { aspectRatio, theme }))
} else if (tool.id === "pdf-to-excel") {
  if (files.length < 1) throw new Error("Select a PDF to extract into Excel.")
  const format = (optionA as "xlsx" | "csv" | "tsv") || "xlsx"
  const strategy = (optionB as "auto" | "whitespace" | "lines") || "auto"
  setResult(await pdfToExcel(files[0], { format, strategy }))
} else if (tool.id === "word-to-pdf") {
  if (files.length < 1 && !value.trim()) {
    throw new Error("Select a Word document or enter text to convert to PDF.")
  }
  const margins = (optionA as "standard" | "compact" | "spacious") || "standard"
  const font = (optionB as "helvetica" | "times" | "courier") || "helvetica"
  if (files.length > 0) {
    setResult(await wordToPDF(files[0], { margins, font }))
  } else {
    setResult(await textToPDF(value, title || "Converted Document"))
  }
} else if (tool.id === "ppt-to-pdf") {
  if (files.length < 1 && !value.trim()) {
    throw new Error("Select a presentation file or enter outline text to convert to PDF.")
  }
  const orientation = (optionA as "landscape-16-9" | "landscape-4-3" | "portrait") || "landscape-16-9"
  const slidesPerPage = parseInt(optionB || "1", 10) || 1
  setResult(await pptToPDF(files[0] || value, { orientation, slidesPerPage }))
} else if (tool.id === "excel-to-pdf") {
  if (files.length < 1 && !value.trim()) {
    throw new Error("Select an Excel or CSV file to convert to PDF.")
  }
  const orientation = (optionA as "landscape" | "portrait") || "landscape"
  const tableTheme = (optionB as "grid-indigo" | "zebra" | "minimal") || "grid-indigo"
  setResult(await excelToPDF(files[0] || value, { orientation, theme: tableTheme }))
} else if (tool.id === "pdf-to-jpg") {
  if (files.length < 1) throw new Error("Select a PDF to convert to JPG.")
  const quality = (optionA as "high" | "standard" | "compact") || "high"
  const pageSelection = (optionB as "first" | "all" | "custom") || "first"
  const pageNum = parseInt(extra || "1", 10) || 1
  setResult(await pdfToJPG(files[0], { quality, pageSelection, pageNumber: pageNum }))
} else if (tool.id === "jpg-to-pdf") {
  if (files.length < 1) throw new Error("Select at least one image to convert to PDF.")
  const orientation = (optionA as "auto" | "portrait" | "landscape") || "auto"
  const margins = (optionB as "fit-margins" | "no-margins" | "center-original") || "fit-margins"
  setResult(await jpgToPDF(files, { orientation, margins }))
}
```

---

## 4. Test Suite Specification: `tests/m3-conversions.test.cjs`

### 4.1 Test Architecture
- **Framework**: Native `node:test` and `node:assert/strict` (zero external test runner dependencies).
- **Execution**: Runs automatically under `npm test` via the glob `tests/*.test.cjs`.
- **Runtime Environment**:
  - Compiles `src/services.ts` and `src/App.tsx` / `src/ToolPage.tsx` using `typescript.transpileModule`.
  - Runs in a clean Node VM sandbox with simulated browser globals (`File`, `Blob`, `URL`, `localStorage`, `document`, `window`).
  - Strict cleanup prevents any leak into other test suites.

### 4.2 Test Suite Breakdown

We specify **42 distinct test cases** organized across 11 suites:

```
tests/m3-conversions.test.cjs
├── Suite 1: pdf-to-word Conversion (4 tests)
├── Suite 2: pdf-to-ppt Conversion (4 tests)
├── Suite 3: pdf-to-excel Conversion (4 tests)
├── Suite 4: word-to-pdf Conversion (4 tests)
├── Suite 5: ppt-to-pdf Conversion (4 tests)
├── Suite 6: excel-to-pdf Conversion (4 tests)
├── Suite 7: pdf-to-jpg Conversion (4 tests)
├── Suite 8: jpg-to-pdf Conversion (4 tests)
├── Suite 9: Round-Trip & Pipeline Integrity (3 tests)
├── Suite 10: UI Mounting & Interactive Controls in ToolPage.tsx (8 tests)
└── Suite 11: Error Boundaries, Corrupt & Adversarial Rejection (3 tests)
Total: 42 tests
```

---

### 4.3 Detailed Test Specifications

#### Suite 1: `pdf-to-word` Conversion Tests
1. **`M3 pdfToWord: generates valid DOCX package from sample PDF`**:
   - Input: Multi-page sample PDF.
   - Assertions:
     - `result.name` ends with `.docx`.
     - `result.blob.type` is `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
     - Buffer starts with PK ZIP signature `[0x50, 0x4B, 0x03, 0x04]`.
     - Buffer contains `[Content_Types].xml` and `word/document.xml`.
2. **`M3 pdfToWord: supports doc (HTML format) and txt output formats`**:
   - Assertions:
     - Calling with `{ format: 'doc' }` yields `.doc` name and `application/msword` MIME.
     - Calling with `{ format: 'txt' }` yields `.txt` name and extracted text stream.
3. **`M3 pdfToWord: preserves text paragraphs across all pages`**:
   - Creates a 3-page PDF with distinct text markers.
   - Verifies each page marker is extracted and present in the Word output.
4. **`M3 pdfToWord: rejects missing file or 0-byte corrupt file`**:
   - Rejects with descriptive error when file is missing or 0 bytes.

#### Suite 2: `pdf-to-ppt` Conversion Tests
5. **`M3 pdfToPPT: generates valid PPTX package with widescreen 16:9 slides`**:
   - Input: 2-page sample PDF.
   - Assertions:
     - `result.name` ends with `.pptx`.
     - `result.blob.type` is `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
     - Buffer starts with PK ZIP signature `[0x50, 0x4B, 0x03, 0x04]`.
     - Contains `ppt/presentation.xml` and slide parts `ppt/slides/slide1.xml`.
6. **`M3 pdfToPPT: supports standard 4:3 aspect ratio preset`**:
   - Verifies slide width/height definitions in `presentation.xml` match 4:3 (9144000 × 6858000 dxa).
7. **`M3 pdfToPPT: applies selected slide theme color styles`**:
   - Verifies slide background / theme elements match selected theme (`fluxkit-dark`, `minimal-white`).
8. **`M3 pdfToPPT: rejects non-PDF input files cleanly`**:
   - Uploading a text or binary non-PDF throws descriptive validation error.

#### Suite 3: `pdf-to-excel` Conversion Tests
9. **`M3 pdfToExcel: generates valid XLSX workbook with worksheet and table data`**:
   - Input: Sample PDF with numeric and tabular data.
   - Assertions:
     - `result.name` ends with `.xlsx`.
     - `result.blob.type` is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
     - Buffer starts with PK ZIP signature `[0x50, 0x4B, 0x03, 0x04]`.
     - Contains `xl/worksheets/sheet1.xml` and `xl/workbook.xml`.
10. **`M3 pdfToExcel: supports CSV export mode with proper quoting`**:
    - Calling with `{ format: 'csv' }` returns `.csv` output with comma-separated rows.
11. **`M3 pdfToExcel: extracts tabular rows with correct column alignment`**:
    - Verifies numeric values and column headers are properly aligned into cells.
12. **`M3 pdfToExcel: rejects missing or corrupt file`**:
    - Rejects cleanly without throwing unhandled exceptions.

#### Suite 4: `word-to-pdf` Conversion Tests
13. **`M3 wordToPDF: converts text and DOCX content to formatted PDF document`**:
    - Input: Sample DOCX / formatted text file.
    - Output verified using `PDFDocument.load(await result.blob.arrayBuffer())`.
    - Assertions:
      - `result.name` ends with `.pdf`.
      - Valid PDF page count >= 1.
14. **`M3 wordToPDF: respects margin presets (standard, compact, spacious)`**:
    - Verifies text coordinates change according to selected margin in points (72pt vs 36pt vs 108pt).
15. **`M3 wordToPDF: applies font family presets (Helvetica, Times, Courier)`**:
    - Embeds and renders chosen font family without WinAnsi encoding crashes.
16. **`M3 wordToPDF: rejects empty document content or missing file`**:
    - Throws user-facing validation error when content is empty.

#### Suite 5: `ppt-to-pdf` Conversion Tests
17. **`M3 pptToPDF: converts presentation slides into landscape 16:9 PDF`**:
    - Input: Sample presentation slides.
    - Assertions:
      - Generated PDF page size has width > height (e.g. 842 × 474 pt for 16:9 landscape).
      - Re-loads into `PDFDocument.load()` with 0 errors.
18. **`M3 pptToPDF: supports 4:3 landscape and portrait handout modes`**:
    - Calling with `landscape-4-3` yields 792 × 595 pt page dimensions.
    - Calling with `portrait` yields 595 × 842 pt page dimensions.
19. **`M3 pptToPDF: supports multi-slide per page handout layouts (1, 2, 4 per page)`**:
    - Verifies page count condenses appropriately when 2 or 4 slides are mapped to a single handout page.
20. **`M3 pptToPDF: rejects empty presentation or missing input`**:
    - Throws descriptive error.

#### Suite 6: `excel-to-pdf` Conversion Tests
21. **`M3 excelToPDF: converts CSV spreadsheet data into styled PDF table with gridlines`**:
    - Input: Multi-row CSV file with headers (e.g. `ID, Item, Qty, Price`).
    - Output verified with `PDFDocument.load()`.
    - Assertions:
      - Valid PDF produced.
      - Table headers and grid cell boundaries drawn.
22. **`M3 excelToPDF: supports landscape and portrait page orientations`**:
    - Wide tables default to landscape layout (width > height).
23. **`M3 excelToPDF: applies table themes (indigo headers, zebra stripes, minimal)`**:
    - Correct RGB color values applied to header and row backgrounds.
24. **`M3 excelToPDF: handles multi-page pagination for large datasets (100+ rows)`**:
    - Splits 100 rows across multiple pages while repeating header row on each page.

#### Suite 7: `pdf-to-jpg` Conversion Tests
25. **`M3 pdfToJPG: converts PDF first page to high-resolution JPEG image`**:
    - Input: Multi-page sample PDF.
    - Assertions:
      - `result.name` ends with `.jpg`.
      - `result.blob.type` is `image/jpeg`.
      - Non-zero image bytes generated.
26. **`M3 pdfToJPG: supports page selection (first page, all pages, custom page)`**:
    - Custom page parameter extracts specified target page.
27. **`M3 pdfToJPG: supports image quality presets (high, standard, compact)`**:
    - High quality produces higher byte density than compact preview.
28. **`M3 pdfToJPG: rejects out-of-range page numbers`**:
    - Requesting page 99 in a 3-page PDF throws a clear boundary error.

#### Suite 8: `jpg-to-pdf` Conversion Tests
29. **`M3 jpgToPDF: embeds single JPG image into single-page PDF`**:
    - Input: Sample 1x1 or 8x8 valid image buffer.
    - Assertions:
      - `result.name` ends with `.pdf`.
      - Output loadable with `PDFDocument.load()`.
      - `pdf.getPageCount() === 1`.
30. **`M3 jpgToPDF: merges multiple images into multi-page PDF preserving sequence`**:
    - Input: Array of 3 distinct images (`img1.jpg`, `img2.png`, `img3.jpg`).
    - Assertions:
      - Result PDF has exactly 3 pages.
      - Page dimensions match image aspect ratios.
31. **`M3 jpgToPDF: supports orientation presets and margin settings`**:
    - Supports `auto`, `portrait`, `landscape`, and full-bleed (`no-margins`).
32. **`M3 jpgToPDF: rejects empty file list or non-image files`**:
    - Rejects cleanly when files array is empty.

#### Suite 9: Round-Trip & Pipeline Lifecycle Tests
33. **`M3 Round-Trip: wordToPDF -> pdfToWord preserves text integrity`**:
    - Generates PDF from text via `wordToPDF`, passes resulting blob into `pdfToWord`, and verifies original text tokens survive round-trip.
34. **`M3 Round-Trip: excelToPDF -> pdfToExcel extracts structured cell data`**:
    - Converts structured table to PDF, extracts back to Excel/CSV format, verifies row and column counts.
35. **`M3 Round-Trip: jpgToPDF -> pdfToJPG image conversion pipeline`**:
    - Embeds images into PDF, rasterizes back to JPEG, verifying round-trip image validity.

#### Suite 10: UI Mounting & Interactive Controls in `ToolPage.tsx`
36. **`UI Mounting #pdf-to-word: mounts dropzone (.pdf), format dropdown, layout dropdown, and 'Convert to Word' button`**:
    - Asserts presence of `Convert to Word`, `Output Format`, `Layout Preservation`, `.pdf,application/pdf`.
37. **`UI Mounting #pdf-to-ppt: mounts dropzone (.pdf), aspect ratio selector, slide theme selector, and 'Convert to PowerPoint' button`**:
    - Asserts presence of `Convert to PowerPoint`, `Slide Aspect Ratio`, `Slide Theme`, `16:9`, `4:3`.
38. **`UI Mounting #pdf-to-excel: mounts dropzone (.pdf), format dropdown, table detection dropdown, and 'Convert to Excel' button`**:
    - Asserts presence of `Convert to Excel`, `Output Format`, `Table Detection Strategy`, `xlsx`, `csv`.
39. **`UI Mounting #word-to-pdf: mounts dropzone (.docx/.doc/.txt), margins selector, font selector, and 'Convert to PDF' button`**:
    - Asserts presence of `Convert to PDF`, `Page Margins`, `Font Family`, `Standard Margins`, `Helvetica`.
40. **`UI Mounting #ppt-to-pdf: mounts dropzone (.pptx/.ppt/.txt), slide orientation selector, slides per page selector, and 'Convert to PDF' button`**:
    - Asserts presence of `Convert to PDF`, `Slide Orientation`, `Slides Per Page`, `Landscape 16:9`.
41. **`UI Mounting #excel-to-pdf: mounts dropzone (.xlsx/.csv), orientation selector, table styling dropdown, and 'Convert to PDF' button`**:
    - Asserts presence of `Convert to PDF`, `Page Orientation`, `Table Grid Styling`, `Grid + Indigo Headers`.
42. **`UI Mounting #pdf-to-jpg: mounts dropzone (.pdf), quality selector, page selector, and 'Convert to JPG' button`**:
    - Asserts presence of `Convert to JPG`, `Image Quality & Resolution`, `Page Selection`, `High Resolution`.
43. **`UI Mounting #jpg-to-pdf: mounts dropzone with multiple selection (.jpg/.png), orientation selector, margins selector, and 'Convert to PDF' button`**:
    - Asserts presence of `Convert to PDF`, `multiple=""`, `Page Orientation`, `Margins & Scaling`.

#### Suite 11: Error Boundaries & Adversarial Input Rejection
44. **`M3 Boundary: corrupt input streams reject cleanly with user-facing messages`**
45. **`M3 Boundary: zero-byte files reject without crashing Node or browser realm`**
46. **`M3 Boundary: Unicode high-surrogate text sanitized without WinAnsi font crash`**

---

## 5. Implementation Roadmap & Quality Checklist

For the implementer (Worker / Agent):

1. **Step 1: Update `src/services.ts`**:
   - Export conversion functions: `pdfToWord`, `pdfToPPT`, `pdfToExcel`, `wordToPDF`, `pptToPDF`, `excelToPDF`, `pdfToJPG`, `jpgToPDF`.
   - Export option interfaces: `PDFToWordOptions`, `PDFToPPTOptions`, `PDFToExcelOptions`, `WordToPDFOptions`, `PPTToPDFOptions`, `ExcelToPDFOptions`, `PDFToJPGOptions`, `JPGToPDFOptions`.
2. **Step 2: Update `src/ToolPage.tsx`**:
   - Update `getAcceptedFileTypes()` to handle each tool's exact MIME patterns.
   - Update `addFiles()` `isStrictPdf` list to include `pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, `pdf-to-jpg`.
   - Add the 8 custom options panels into JSX form.
   - Update file `<input multiple={...}>` to include `tool.id === "jpg-to-pdf"`.
   - Update `submit()` handler to invoke corresponding service functions with options.
   - Update action button text mapping to display distinct tool-specific copy.
3. **Step 3: Create `tests/m3-conversions.test.cjs`**:
   - Implement the 42 test cases following the exact specifications in Section 4.
4. **Step 4: Verification**:
   - Run `npm test` -> verify all 155 original tests pass + all 42 new M3 tests pass (197 total passing tests).
   - Run `npm run build` -> verify 0 TypeScript / bundling errors.

---
*Analysis completed by Explorer M3-3.*
