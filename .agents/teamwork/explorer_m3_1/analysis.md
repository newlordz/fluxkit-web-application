# Technical Analysis & Implementation Blueprint: Office to PDF & Image to PDF (M3-1)

**Author**: Explorer M3-1  
**Milestone**: Milestone 3 — Document & Format Conversions  
**Scope**: In-Browser Client-Side Conversion Strategies for:
1. `word-to-pdf` (Word / DOCX / text to formatted PDF)
2. `ppt-to-pdf` (PowerPoint / presentation slides to landscape formatted PDF)
3. `excel-to-pdf` (Excel / spreadsheet / CSV to formatted table PDF)
4. `jpg-to-pdf` (Images to multi-page or single-page PDF)

---

## 1. Executive Summary & Architecture Context

FluxKit requires 100% in-browser, client-side execution for all 37 tools (Requirement R3). In Milestone 2, the PDF engine in `src/services.ts` was established using `pdf-lib` (1.17.1) for document manipulation, standard fonts, and WinAnsi encoding sanitization (`sanitizeForWinAnsi`).

In Milestone 3, tools #7 (`word-to-pdf`), #8 (`ppt-to-pdf`), #9 (`excel-to-pdf`), and #12 (`jpg-to-pdf`) transition from placeholder stubs to fully interactive, high-fidelity client-side conversion engines.

### Key Architectural Discoveries:
1. **Zero External Dependency Zip Extraction**: Modern browsers (Chrome 80+, Safari 16.4+, Firefox 113+, Edge) and Node.js (18+) natively support the Web Streams API `DecompressionStream('deflate-raw')`. We have verified empirically that a lightweight (~45 lines) pure JavaScript in-memory PK zip extractor can unpack OpenXML archives (`.docx`, `.pptx`, `.xlsx`) without installing `jszip` or heavy external dependencies.
2. **Hybrid Input Support**: Each tool supports both binary document upload (`.docx`, `.pptx`, `.xlsx`, `.jpg`, `.png`, `.csv`) AND formatted text input (typed/pasted document text, slide outlines with `---` separators, or delimited CSV/tabular data). This ensures 100% accessibility even when users do not have a binary file at hand.
3. **Critical `pdf-lib` JpegEmbedder Discovery & Fix**: In `pdf-lib` 1.17.1, `JpegEmbedder.js` instantiates `new DataView(imageData.buffer)` without passing `byteOffset`. When `imageData` is an unaligned slice or pooled Node.js `Buffer` where `byteOffset > 0`, `dataView.getUint16(0)` reads offset 0 of the entire underlying buffer rather than the start of the image, triggering `"SOI not found in JPEG"`. We have designed a clean buffer normalization helper `toCleanUint8Array()` that guarantees `byteOffset === 0` across all image buffers.
4. **WinAnsi Typography Sanitization**: All text rendering pipelines feed through `sanitizeForWinAnsi()` before drawing with `pdf-lib` standard fonts (`Helvetica`, `HelveticaBold`, `TimesRoman`, etc.) to eliminate crashes from typographic quotes (`“`, `”`), dashes (`—`, `–`), bullets (`•`), and non-WinAnsi symbols.

---

## 2. Technical Strategy: `word-to-pdf`

### 2.1 Problem & Input Handling
`word-to-pdf` converts Word documents into clean, paginated, professionally styled PDF documents.
Input can be:
- A binary `.docx` file (OpenXML PK zip archive)
- A plain text `.txt` file
- Formatted text entered directly into the hybrid textarea (supporting Markdown-like headings `# Title`, `## Section`, bullet items `* item`, and standard paragraphs)

### 2.2 OpenXML DOCX Parsing
A `.docx` file is a ZIP archive containing `word/document.xml`.
1. The file bytes are checked for the standard PK zip signature (`0x50, 0x4B, 0x03, 0x04`).
2. If ZIP:
   - Extract `word/document.xml` using the in-memory unzip extractor.
   - Parse paragraphs via regex / string traversal:
     `/<w:p[\s>][\s\S]*?<\/w:p>/g`
   - In each paragraph:
     - Check for heading style: `<w:pStyle\s+[^>]*w:val="(?:\w*Heading|Title)[^"]*"`
     - Extract text runs: `<w:t[^>]*>([^<]*)<\/w:t>`
     - Decode XML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`).
3. If plain text / Markdown:
   - Lines starting with `# ` are treated as Document Title / Heading 1.
   - Lines starting with `## ` or `### ` are treated as Section Headings (Heading 2).
   - Lines starting with `* ` or `- ` are treated as bullet points.
   - Remaining non-empty lines are paragraphs.

### 2.3 Page Layout & Typography Engine
- **Page Size**: Standard US Letter `[612, 792] pt` or A4 `[595, 842] pt`.
- **Margin Options**:
  - `"standard"`: 54 pt (0.75 in) — default
  - `"narrow"`: 36 pt (0.5 in)
  - `"wide"`: 72 pt (1.0 in)
- **Font Families**:
  - `"helvetica"`: `StandardFonts.Helvetica`, `StandardFonts.HelveticaBold`, `StandardFonts.HelveticaOblique`
  - `"times"`: `StandardFonts.TimesRoman`, `StandardFonts.TimesRomanBold`, `StandardFonts.TimesRomanItalic`
  - `"courier"`: `StandardFonts.Courier`, `StandardFonts.CourierBold`, `StandardFonts.CourierOblique`
- **Visual Styles**:
  - **Document Title / Heading 1**: 20 pt bold, dark navy/slate (`rgb(0.12, 0.23, 0.54)`), 16 pt top spacing, 8 pt bottom spacing.
  - **Heading 2**: 14 pt bold, dark charcoal (`rgb(0.15, 0.2, 0.28)`), subtle underline rule (`rgb(0.85, 0.88, 0.92)`).
  - **Body Paragraphs**: 11 pt regular, slate (`rgb(0.25, 0.3, 0.38)`), line height 16 pt, line-wrapped to printable width.
  - **Bullet Items**: 11 pt regular, indented by 16 pt, marked with bullet dot `*` or square badge.
  - **Running Header & Footer**:
    - Header: Document Title (8.5 pt, muted grey `rgb(0.5, 0.55, 0.6)`), top right/left.
    - Footer: "Page X of Y | Created with FluxKit" (8.5 pt, muted grey), bottom center.
    - Header / Footer dividing lines: subtle 0.5 pt rule.
- **Pagination**:
  - Starts at `y = pageHeight - margin - 20`.
  - When `y < margin + 30`, a new page is allocated (`doc.addPage([width, height])`).
  - Running header and page numbers are dynamically stamped on all pages during post-pass.

---

## 3. Technical Strategy: `ppt-to-pdf`

### 3.1 Problem & Landscape Slide Canvas
`ppt-to-pdf` converts PowerPoint presentations or slide outlines into landscape PDF slides.
Input can be:
- A binary `.pptx` file (OpenXML PK zip archive containing `ppt/slides/slide1.xml`, `slide2.xml`, etc.)
- Slide outline text where individual slides are delimited by `---` or `===` or `Slide \d+:`
- General multi-paragraph text (automatically grouped into slides of 3-5 items).

### 3.2 OpenXML PPTX Parsing
1. Check file for PK signature.
2. In the central directory, find all entries matching `ppt/slides/slide\d+\.xml`.
3. Sort entries numerically by slide index (`slide1.xml`, `slide2.xml`, `slide3.xml`, ...).
4. For each slide XML:
   - Extract `<a:p>[\s\S]*?<\/a:p>` (paragraphs).
   - In each paragraph, extract `<a:t>([^<]*)<\/a:t>`.
   - The first paragraph is the Slide Title; remaining paragraphs become bullet points.

### 3.3 Slide Visual Design & Templates
- **Dimensions**: True 16:9 widescreen `[960, 540] pt` or A4 landscape `[842, 595] pt` (default: `[960, 540]`).
- **Brand Themes**:
  - `"orange"`: PowerPoint identity default (Primary: `#EA580C`, Accent: `#C2410C`, Card: `#FFF7ED`)
  - `"navy"`: Executive Blue (Primary: `#1E3A8A`, Accent: `#3B82F6`, Card: `#EFF6FF`)
  - `"slate"`: Modern Tech (Primary: `#334155`, Accent: `#64748B`, Card: `#F8FAFC`)
  - `"minimal"`: Monochrome (Primary: `#18181B`, Accent: `#71717A`, Card: `#FAFAFA`)
- **Slide 1: Title Slide**:
  - Background: Crisp off-white card `rgb(0.98, 0.98, 0.99)`.
  - Accent Title Banner: Rounded/beveled banner `x: 60, y: 190, width: 840, height: 210` filled with primary theme color.
  - Main Title: 30-34 pt bold, white text.
  - Subtitle: 16 pt regular, soft white / light tint (`rgb(0.94, 0.96, 0.98)`).
  - Footer pill: "FluxKit Presentation Deck | Generated In-Browser".
- **Slide 2..N: Content Slides**:
  - Slide Header:
    - Slide Title: 22 pt bold, primary theme color, `x: 60, y: 470`.
    - Horizontal accent rule: thickness 2.5 pt, spans `x: 60` to `x: 900`, `y: 452`.
  - Content Area (`y = 400` downward):
    - Bullet points with solid circular badge `slide.drawCircle({ x: 75, y: curY + 4, size: 3.5, color: themePrimary })`.
    - Bullet text: 14 pt regular, charcoal (`rgb(0.2, 0.25, 0.3)`), line-wrapped to 780 pt width.
    - Generous line spacing (28 pt per line, 38 pt between separate bullet items).
  - Slide Footer:
    - Presentation title: 9 pt muted slate on bottom-left (`x: 60, y: 30`).
    - Slide Counter: "Slide N of Total" on bottom-right (`x: 820, y: 30`).
    - Subtle 0.5 pt footer divider line at `y: 50`.

---

## 4. Technical Strategy: `excel-to-pdf`

### 4.1 Problem & Grid Architecture
`excel-to-pdf` transforms spreadsheet workbooks, CSV files, and tabular data into crisp, readable, printable PDF tables.
Input can be:
- A binary `.xlsx` file (OpenXML PK zip archive containing `xl/sharedStrings.xml` and `xl/worksheets/sheet1.xml`)
- A `.csv` or `.tsv` file
- Plain text / pasted CSV data in the textarea.

### 4.2 Spreadsheet Parsing
1. **XLSX OpenXML Extraction**:
   - Extract `xl/sharedStrings.xml` -> parse `<si>[\s\S]*?<\/si>` to collect string lookup array `sharedStrings[]`.
   - Extract `xl/worksheets/sheet1.xml` -> parse rows `<row r="(\d+)">[\s\S]*?<\/row>`.
   - In each row, match cell elements `<c r="([A-Z]+)(\d+)"(?:\s+t="([^"]*)")?>[\s\S]*?<\/c>`.
   - Decode column index from letter coordinate (e.g. `A` -> 0, `B` -> 1, `AA` -> 26).
   - If `t="s"`, lookup string in `sharedStrings[parseInt(v)]`. If inline string `<is><t>`, use text. Otherwise use raw `<v>`.
2. **CSV / Delimited Parsing (RFC 4180)**:
   - Handle quoted fields with embedded commas: `"Smith, Jr.", 45, "City, State"`.
   - Auto-detect delimiter: analyze first row for `,`, `\t`, `;`, `|`.
   - Strip trailing empty rows and normalize ragged row lengths.

### 4.3 Table Layout Engine
- **Page Dimensions**:
  - Landscape (default for spreadsheets): `[792, 612] pt` (US Letter) or `[842, 595] pt` (A4).
  - Portrait (optional for narrow tables <= 4 cols): `[612, 792] pt`.
- **Margin**: 40 pt on all sides. Printable width = `792 - 80 = 712 pt`.
- **Proportional Column Width Calculation**:
  - For each column $c$, find maximum character length across headers and first 100 rows.
  - Natural width $w_c = \text{clamp}(\text{maxChars}_c \times 7.5 + 16, 45, 240)$.
  - Scaling factor: $\alpha = \frac{\text{printableWidth}}{\sum w_c}$.
  - Allocated column width: $\text{colWidth}_c = w_c \times \alpha$.
- **Header Row Styling**:
  - Height: 26 pt.
  - Fill: Excel Emerald `#059669` (`rgb(0.02, 0.47, 0.34)`) or Executive Navy `#1E3A8A`.
  - Text: 10 pt bold, pure white (`rgb(1, 1, 1)`), left-aligned with 8 pt cell padding.
- **Data Rows & Zebra Striping**:
  - Height: 22 pt.
  - Alternating row background: even rows white (`rgb(1, 1, 1)`), odd rows soft mint/tint (`rgb(0.96, 0.98, 0.96)`).
  - Gridlines: horizontal rule 0.5 pt (`rgb(0.86, 0.89, 0.91)`), vertical cell divider lines 0.5 pt (`rgb(0.90, 0.92, 0.94)`).
  - Text clipping: if cell text exceeds column width minus padding, truncate and append `...`.
- **Multi-Page Pagination**:
  - Header re-printing: When `currentY - rowHeight < margin + 35`, a new page is added and the full header row is re-printed at the top of the new page.
  - Running footer: "Page X of Y | FluxKit Spreadsheet Table (Total N rows)" stamped at `y = 22`.

---

## 5. Technical Strategy: `jpg-to-pdf`

### 5.1 Problem & Multi-Image Pipeline
`jpg-to-pdf` converts one or multiple JPG/PNG images into a single-page or multi-page PDF document.
Input:
- Array of `File` objects or image data descriptors `{ name: string, bytes: Uint8Array | ArrayBuffer | string }`.

### 5.2 Critical `pdf-lib` JpegEmbedder Bug Resolution
In `pdf-lib 1.17.1`, line 56 of `JpegEmbedder.js`:
```js
dataView = new DataView(imageData.buffer);
soi = dataView.getUint16(0);
if (soi !== 0xFFD8) throw new Error("SOI not found in JPEG");
```
Because `imageData.byteOffset` is ignored, any pooled Node.js `Buffer` or sliced `Uint8Array` throws `"SOI not found in JPEG"`.
**Guaranteed Fix**:
We implement `toCleanUint8Array(input)`:
```ts
function toCleanUint8Array(input: Uint8Array | ArrayBuffer | string): Uint8Array {
  let u8: Uint8Array;
  if (input instanceof Uint8Array) {
    u8 = input;
  } else if (input instanceof ArrayBuffer) {
    u8 = new Uint8Array(input);
  } else if (typeof input === "string") {
    // Data URI or base64 string
    const base64 = input.includes(",") ? input.split(",")[1] : input;
    if (typeof atob === "function") {
      const binary = atob(base64);
      u8 = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
    } else {
      u8 = new Uint8Array(Buffer.from(base64, "base64"));
    }
  } else {
    throw new Error("Invalid image buffer input.");
  }

  // Ensure clean unpooled buffer with byteOffset === 0
  if (u8.byteOffset === 0 && u8.buffer.byteLength === u8.byteLength) {
    return u8;
  }
  const clean = new Uint8Array(u8.byteLength);
  clean.set(u8);
  return clean;
}
```

### 5.3 Embedding & Format Auto-Detection
For each image:
1. Detect magic bytes:
   - JPEG: `bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF`
   - PNG: `bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47`
2. If JPEG: call `await pdfDoc.embedJpg(cleanBytes)`.
3. If PNG: call `await pdfDoc.embedPng(cleanBytes)`.
4. If format is ambiguous: try `embedJpg`, catch and try `embedPng`. If both fail in a browser environment, render onto an off-screen `<canvas>` and export as PNG. In headless tests, throw descriptive error: `"Unsupported image format. Please select JPEG or PNG images."`

### 5.4 Page Sizing, Orientation & Margins
- **Page Size Modes**:
  - `"letter"`: `[612, 792] pt`
  - `"a4"`: `[595, 842] pt`
  - `"fit"`: Page dimensions match the image aspect ratio exactly (`pageWidth = img.width, pageHeight = img.height`), margin = 0.
- **Orientation Modes**:
  - `"auto"`: If `img.width > img.height`, allocate landscape page; otherwise portrait page.
  - `"landscape"`: Force landscape (`792 x 612` or `842 x 595`).
  - `"portrait"`: Force portrait (`612 x 792` or `595 x 842`).
- **Margin Presets**:
  - `"none"`: 0 pt (full bleed)
  - `"small"`: 18 pt (0.25 in)
  - `"standard"`: 36 pt (0.5 in) — default
  - `"large"`: 72 pt (1.0 in)
- **Aspect Ratio Scaling & Centering**:
  ```ts
  const availW = pageWidth - 2 * margin;
  const availH = pageHeight - 2 * margin;
  const scale = Math.min(availW / img.width, availH / img.height);
  const renderW = img.width * scale;
  const renderH = img.height * scale;
  const x = margin + (availW - renderW) / 2;
  const y = margin + (availH - renderH) / 2;
  page.drawImage(img, { x, y, width: renderW, height: renderH });
  ```

---

## 6. Pure-JS In-Memory ZIP Reader Specification

To support `.docx`, `.pptx`, and `.xlsx` without adding npm dependencies, we specify the following pure JavaScript ZIP parser:

```ts
/**
 * Lightweight pure-JS PK zip extractor for OpenXML documents.
 * Extracts text files (XML, rels) using browser-native DecompressionStream.
 */
export async function unzipEntries(
  buffer: ArrayBuffer | Uint8Array,
): Promise<Record<string, string>> {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)

  // Find End of Central Directory (EOCD) signature 0x06054b50 from end
  let eocdOffset = -1
  for (let i = u8.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid archive: End of central directory not found.")
  }

  const cdCount = view.getUint16(eocdOffset + 10, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)
  const entries: Record<string, string> = {}
  const textDecoder = new TextDecoder("utf-8")
  let cur = cdOffset

  for (let idx = 0; idx < cdCount; idx++) {
    if (cur + 46 > u8.length) break
    if (view.getUint32(cur, true) !== 0x02014b50) break

    const method = view.getUint16(cur + 10, true)
    const compSize = view.getUint32(cur + 20, true)
    const fnLen = view.getUint16(cur + 28, true)
    const extraLen = view.getUint16(cur + 30, true)
    const commentLen = view.getUint16(cur + 32, true)
    const localOffset = view.getUint32(cur + 42, true)

    const fnBytes = u8.subarray(cur + 46, cur + 46 + fnLen)
    const fileName = textDecoder.decode(fnBytes)

    if (localOffset + 30 <= u8.length) {
      const localFnLen = view.getUint16(localOffset + 26, true)
      const localExtraLen = view.getUint16(localOffset + 28, true)
      const dataOffset = localOffset + 30 + localFnLen + localExtraLen
      const compData = u8.subarray(dataOffset, dataOffset + compSize)

      if (method === 0) {
        entries[fileName] = textDecoder.decode(compData)
      } else if (method === 8) {
        if (typeof DecompressionStream !== "undefined") {
          const ds = new DecompressionStream("deflate-raw")
          const writer = ds.writable.getWriter()
          writer.write(compData)
          writer.close()
          const res = new Response(ds.readable)
          const uncompressed = new Uint8Array(await res.arrayBuffer())
          entries[fileName] = textDecoder.decode(uncompressed)
        }
      }
    }
    cur += 46 + fnLen + extraLen + commentLen
  }

  return entries
}
```

---

## 7. Service Interface Blueprint for `src/services.ts`

### 7.1 Type Definitions
```ts
export interface WordToPDFOptions {
  margin?: "standard" | "narrow" | "wide"
  fontFamily?: "helvetica" | "times" | "courier"
  title?: string
  showPageNumbers?: boolean
  lineSpacing?: number
}

export interface PptToPDFOptions {
  aspectRatio?: "16:9" | "landscape"
  theme?: "orange" | "navy" | "slate" | "minimal"
  title?: string
  subtitle?: string
  showSlideNumbers?: boolean
}

export interface ExcelToPDFOptions {
  orientation?: "landscape" | "portrait"
  theme?: "emerald" | "navy" | "classic" | "minimal"
  showGrid?: boolean
  zebraStriping?: boolean
  title?: string
  pageSize?: "letter" | "a4"
}

export interface JpgToPDFOptions {
  pageSize?: "letter" | "a4" | "fit"
  orientation?: "auto" | "portrait" | "landscape"
  margin?: "none" | "small" | "standard" | "large"
  title?: string
}
```

### 7.2 Exported Function Signatures
```ts
export async function wordToPDF(
  fileOrText: File | string | Uint8Array | ArrayBuffer,
  options?: WordToPDFOptions,
): Promise<OutputResult>

export async function pptToPDF(
  fileOrText: File | string | Uint8Array | ArrayBuffer,
  options?: PptToPDFOptions,
): Promise<OutputResult>

export async function excelToPDF(
  fileOrText: File | string | Uint8Array | ArrayBuffer,
  options?: ExcelToPDFOptions,
): Promise<OutputResult>

export async function jpgToPDF(
  files: (File | { name: string; bytes: Uint8Array | ArrayBuffer | string })[],
  options?: JpgToPDFOptions,
): Promise<OutputResult>
```

---

## 8. UI Integration Blueprint for `src/ToolPage.tsx`

For each tool, `src/ToolPage.tsx` will mount distinct interactive controls:

| Tool ID | Input Controls | Customization Options | Primary Action Button |
|---|---|---|---|
| `word-to-pdf` | File dropzone (`.docx`, `.doc`, `.txt`) + Hybrid document textarea | Margin dropdown (`Standard 0.75"`, `Narrow 0.5"`, `Wide 1.0"`), Font Family (`Helvetica Modern`, `Times Editorial`, `Courier Tech`), Page Numbers toggle | `"Convert Word to PDF"` |
| `ppt-to-pdf` | File dropzone (`.pptx`, `.ppt`, `.txt`) + Slide outline textarea (`---` delimited) | Aspect Ratio (`16:9 Widescreen`, `A4 Landscape`), Theme (`PowerPoint Orange`, `Executive Navy`, `Modern Slate`), Slide Numbers toggle | `"Convert Slides to PDF"` |
| `excel-to-pdf` | File dropzone (`.xlsx`, `.xls`, `.csv`, `.tsv`) + Tabular CSV textarea | Orientation (`Landscape Table`, `Portrait`), Theme (`Excel Emerald`, `Corporate Navy`, `Classic Charcoal`), Zebra Striping toggle | `"Convert Sheet to PDF"` |
| `jpg-to-pdf` | Multi-image dropzone + Re-orderable image list (Up/Down/Delete) | Page Size (`Letter`, `A4`, `Fit to Image`), Orientation (`Auto`, `Portrait`, `Landscape`), Margins (`None`, `Small`, `Standard`, `Large`) | `"Convert Images to PDF"` |

---

## 9. Verification & Automated Test Matrix

The companion test suite `tests/m3-conversions.test.cjs` should cover the following unit & integration tests:

1. **`wordToPDF`**:
   - Generates valid multi-page PDF from formatted text with `# Title`, `## Section`, and bullet points.
   - Extracts and renders text from simulated `.docx` ZIP archive containing `word/document.xml`.
   - Respects margin presets (`standard`, `narrow`, `wide`).
   - Normalizes non-WinAnsi typographical characters (`“`, `”`, `—`, `•`) without crashing.
   - Rejects empty input with descriptive error message.
2. **`pptToPDF`**:
   - Generates landscape 16:9 slides (`[960, 540]`) with title slide and content slides.
   - Splits outline text on `---` delimiters into separate pages.
   - Renders slides with theme colors (Orange, Navy, Slate).
   - Stamps slide numbers ("Slide X of Y") and divider lines.
   - Rejects empty input with descriptive error message.
3. **`excelToPDF`**:
   - Parses CSV string with comma delimiters and quoted fields.
   - Generates landscape table PDF with header row and alternating zebra stripes.
   - Truncates oversized cell content with ellipsis.
   - Multi-page pagination re-prints table headers on overflow pages.
   - Rejects empty tabular input with descriptive error message.
4. **`jpgToPDF`**:
   - Converts single JPEG image to Letter-sized PDF page.
   - Converts single PNG image to Letter-sized PDF page.
   - Converts multi-image batch (2+ mixed JPG & PNG files) into a multi-page PDF document.
   - Verifies aspect ratio scaling and centering.
   - Verifies clean unpooled buffer handling to prevent `pdf-lib` JpegEmbedder SOI crash.
   - Rejects empty image array with descriptive error message.
5. **Multi-Tool Pipeline**:
   - Validates that output PDF from `wordToPDF`, `pptToPDF`, `excelToPDF`, or `jpgToPDF` can be piped into M2 tools (e.g. `watermarkPDF`, `signPDF`, `compressPDF`, `splitPDF`).
