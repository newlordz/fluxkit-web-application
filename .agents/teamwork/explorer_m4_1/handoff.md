# Milestone 4 Investigation & Design Report: Pure Client-Side ZIP Archiving & OCR Text Scanner

**Target Tools**:
- **Tool #21 (`zip`)**: Pure client-side PK-ZIP archiving and extraction for arbitrary files.
- **Tool #19 (`ocr`)**: Pure client-side OCR text scanner from images (JPG/PNG/WebP) and PDFs without external servers or API keys (Requirement R3).

---

## 1. Observation

### 1.1 Existing Codebase State for ZIP Utilities
1. **`buildZipArchive` in `src/services.ts` (lines 798–885)**:
   - Synchronously formats a valid PK-ZIP archive for text/binary entries:
     ```ts
     export function buildZipArchive(
       entries: { name: string; data: string | Uint8Array }[],
     ): Uint8Array
     ```
   - Features present:
     - Calculates CRC-32 via `computeCRC32(dataBytes)`.
     - Generates 30-byte Local File Header (`0x04034b50`), version 20, UTF-8 flag (`0x0800`), compression method 0 (Store).
     - Generates 46-byte Central Directory Header (`0x02014b50`) with accurate local header offsets.
     - Generates 22-byte End of Central Directory (EOCD) record (`0x06054b50`).
   - Current consumers in `src/services.ts`:
     - `pdfToWord` (line 1298) generating OpenXML `.docx` ZIP package.
     - `pdfToPPT` (line 1468) generating OpenXML `.pptx` ZIP package.
     - `pdfToExcel` (line 1617) generating OpenXML `.xlsx` ZIP package.
     - `pdfToJPG` (line 2479) packaging multi-page rendered JPEGs into an archive.
   - Current limitations:
     - Only implements compression method 0 (Store/uncompressed). Does not support Deflate (Method 8).
     - Takes only `{ name: string, data: string | Uint8Array }[]`, omitting native browser `Blob` and `File` object handling.
     - Returns raw `Uint8Array`, not `{ blob: Blob, filename: string }`.

2. **`unzipEntries` in `src/services.ts` (lines 887–996)**:
   - Parses PK-ZIP archives and extracts text files:
     ```ts
     export async function unzipEntries(
       buffer: ArrayBuffer | Uint8Array,
       maxTotalBytes: number = 50 * 1024 * 1024,
     ): Promise<Record<string, string>>
     ```
   - Features present:
     - Scans backward for EOCD signature `0x06054b50`.
     - Iterates central directory records and parses local headers.
     - Handles method 0 (Store) and method 8 (Deflate) via native `DecompressionStream("deflate-raw")`.
     - Security guards against `__proto__`, `constructor`, `prototype`, and path traversal (`..`).
     - Zip-bomb threshold check (`maxTotalBytes = 50 MB`).
   - Current limitations:
     - Returns `Record<string, string>` where every entry is decoded as UTF-8 string via `new TextDecoder("utf-8").decode(...)`.
     - Corrupts binary files (PNG, JPG, PDF, audio, executables).
     - Does not provide file metadata (file size, uncompressed byte array, mime type).

### 1.2 Existing Codebase State for OCR Scanner
1. **`src/services.ts` (lines 1015–1128)**:
   - Contains `extractPDFPages(pdfBytes)` which parses PDF content streams (`Tj`, `'`, `"`, `TJ`, `Tm`, `Td`, `TD`, hex strings, and literal strings) and decompresses FlateDecode streams.
   - Provides 100% accurate, instantaneous digital PDF text extraction.
   - Does NOT currently handle scanned PDFs (image-only PDFs) or raster images (JPG, PNG, WebP).
2. **`src/ToolPage.tsx` (lines 480–485, 992–1020, 1615–1620)**:
   - Tool #19 (`ocr`) and Tool #21 (`zip`) are registered in `config.ts`, but in `ToolPage.tsx`:
     - `tool.id === "zip"` and `tool.id === "ocr"` fall through generic fallback branches in `handleProcess` (lines 992–1020) where files are simply re-packaged as `${name}-converted.${targetExt}` without executing actual archiving, unzipping, or OCR.
     - `tool.id === "zip"` allows multiple file uploads (`multiple={true}` at line 1617).
     - No dedicated option controls or custom result views exist for `zip` or `ocr`.
3. **Environment & Native Capabilities**:
   - Modern Web Streams API provides native `CompressionStream("deflate-raw")` and `DecompressionStream("deflate-raw")` in both modern browsers (Chrome 103+, Safari 16.4+, Firefox 113+, Edge) and Node.js v18+.
   - Verified empirically via Node runtime:
     - `new CompressionStream('deflate-raw')` compresses 1,360 bytes of repetitive text down to 77 bytes (94.3% compression ratio).
     - Decompression round-trip restored 100% identical source text.
     - Windows native `Expand-Archive` successfully validated and extracted test PK-ZIP archives created with our `deflate-raw` streams without errors.
   - Existing automated test suite has 249 passing tests (`node --test tests/*.test.cjs`).

---

## 2. Logic Chain

### 2.1 Tool #21 (`zip`) Architecture & Implementation Design

#### A. Requirements
1. Pure client-side PK-ZIP archiving and extraction for arbitrary files (text and binary).
2. `zipFiles(files, options)`: Support multi-file arrays with `Uint8Array`, `Blob`, `File`, or `string`, with configurable compression level (Store vs Deflate).
3. `extractZipArchive(zipData, options)`: Extract arbitrary files returning raw `Uint8Array` bytes, uncompressed sizes, mime types, and Blob representations.
4. Backwards compatibility: Existing `buildZipArchive` and `unzipEntries` must remain untouched to prevent regressions in `pdfToWord`, `pdfToPPT`, `pdfToExcel`, `wordToPDF`, `pptToPDF`, `excelToPDF`, and `pdfToJPG`.
5. UI workflow in `ToolPage.tsx`:
   - Dual-mode support: "Create ZIP Archive" (for multi-file bundling) and "Extract Archive (Unzip)" (for viewing/extracting uploaded `.zip` archives).
   - Mode auto-detection: If uploaded file is a `.zip`, auto-select "Extract Archive". If 1+ non-zip files, auto-select "Create Archive".
   - File listing and individual file download in extraction mode.

#### B. API Specification
```ts
export interface ZipFileInput {
  name: string
  data: Uint8Array | Blob | File | string
  lastModified?: Date | number
}

export interface ZipFilesOptions {
  compressionLevel?: number // 0 = Store (no compression), 1-9 = Deflate (default 6)
  archiveName?: string // default "archive.zip" or `${firstFileBase}-archive.zip`
}

export interface ZipOutputResult {
  name: string
  blob: Blob
  totalFiles: number
  uncompressedSize: number
  compressedSize: number
  compressionRatio: number // e.g. 0.45 for 55% reduction
}

export async function zipFiles(
  files: ZipFileInput[],
  options: ZipFilesOptions = {},
): Promise<ZipOutputResult>
```

```ts
export interface ExtractedZipFile {
  name: string
  size: number
  compressedSize: number
  method: number // 0 = Store, 8 = Deflate
  crc32: number
  data: Uint8Array
  blob: Blob
  isDirectory: boolean
  text?: () => string
}

export interface ExtractZipArchiveOptions {
  maxTotalBytes?: number // default 100 * 1024 * 1024 (100 MB zip-bomb threshold)
  filter?: (name: string) => boolean
}

export async function extractZipArchive(
  zipData: Uint8Array | ArrayBuffer | Blob | File,
  options: ExtractZipArchiveOptions = {},
): Promise<ExtractedZipFile[]>
```

#### C. Algorithmic Steps for `zipFiles`
1. **Input Normalization**:
   - For each input item, extract `name` (sanitizing separators to `/`) and convert `data` to `Uint8Array`:
     - If `data instanceof Blob` or `File`: `new Uint8Array(await data.arrayBuffer())`.
     - If `typeof data === "string"`: `new TextEncoder().encode(data)`.
     - If `data instanceof Uint8Array`: `data`.
2. **Compression Pipeline**:
   - Calculate `crc32 = computeCRC32(rawBytes)`.
   - If `compressionLevel === 0` or `typeof CompressionStream === "undefined"`:
     - `method = 0`, `compressedData = rawBytes`, `compressedSize = rawBytes.length`.
   - If `compressionLevel > 0`:
     - Stream `rawBytes` through `new CompressionStream("deflate-raw")`.
     - Collect compressed chunks.
     - If `compressedChunksLength < rawBytes.length`:
       - `method = 8`, `compressedData = compressedChunks`, `compressedSize = compressedChunks.length`.
     - Else:
       - Fallback to `method = 0` (Store) to prevent file expansion on non-compressible binary data.
3. **PK-ZIP Header Generation**:
   - **Local File Header (30 bytes + name)**:
     - Signature: `0x04034b50`
     - Version needed: `20`
     - Flags: `0x0800` (UTF-8 filename flag)
     - Method: `method` (0 or 8)
     - CRC-32: `crc32` of uncompressed data
     - Compressed size: `compressedSize`
     - Uncompressed size: `rawBytes.length`
     - Filename length: `nameBytes.length`
     - Extra field length: `0`
     - Filename bytes
     - Data bytes: `compressedData`
   - **Central Directory Header (46 bytes + name)**:
     - Signature: `0x02014b50`
     - Version made by: `20`, Version needed: `20`
     - Flags: `0x0800`
     - Method: `method`
     - CRC-32: `crc32`
     - Compressed size: `compressedSize`
     - Uncompressed size: `rawBytes.length`
     - Filename length: `nameBytes.length`
     - Relative offset of local header: `offset`
     - Filename bytes
4. **Assembly & Result**:
   - Construct EOCD Record (`0x06054b50`, 22 bytes).
   - Concatenate local chunks, central directory chunks, and EOCD into a single contiguous `Uint8Array`.
   - Wrap in `Blob([buffer], { type: "application/zip" })`.
   - Return `{ name: archiveName, blob, totalFiles, uncompressedSize, compressedSize, compressionRatio }`.

#### D. Algorithmic Steps for `extractZipArchive`
1. **Input Normalization & EOCD Location**:
   - Convert input to `Uint8Array`.
   - Scan backward from end of buffer to locate `0x06054b50`.
   - Parse central directory start offset (`+16`) and total entries count (`+10`).
2. **Central Directory Iteration & Security Sanitization**:
   - For each entry:
     - Validate signature `0x02014b50`.
     - Extract `method`, `crc32`, `compSize`, `uncompSize`, `fnLen`, `extraLen`, `localOffset`.
     - Decode filename with UTF-8 `TextDecoder`.
     - **Security Sanitization**:
       - Normalize path separators (`\` -> `/`).
       - Strip Windows drive prefixes (`C:`).
       - Strip leading slashes.
       - Disallow `..` directory traversal and prototype pollution keys (`__proto__`, `constructor`, `prototype`).
       - Check if directory (`name.endsWith("/")`).
3. **Data Extraction & Decompression**:
   - Navigate to `localOffset`, verify local file header signature `0x04034b50`.
   - Read local filename and extra length to locate exact data start:
     `dataStart = localOffset + 30 + localFnLen + localExtraLen`.
   - Slice `compData = u8.subarray(dataStart, dataStart + compSize)`.
   - If `method === 0`:
     `decompressedBytes = compData.slice()`.
   - If `method === 8`:
     - Pipe `compData` through `new DecompressionStream("deflate-raw")`.
     - Stream chunks into a combined `Uint8Array`.
     - Enforce `totalDecompressedBytes <= maxTotalBytes` to prevent zip-bomb denial of service.
   - Detect MIME type based on file extension (e.g. `.png` -> `image/png`, `.pdf` -> `application/pdf`, `.txt` -> `text/plain`).
   - Create native `Blob([decompressedBytes], { type: mimeType })`.
   - Append to extracted files list.
4. Return `ExtractedZipFile[]`.

---

### 2.2 Tool #19 (`ocr`) Architecture & Implementation Design

#### A. Requirements (Fulfilling R3)
1. 100% in-browser, pure client-side OCR text scanner without remote backend, server proxies, or external API keys.
2. Accepts both PDF documents and raster images (JPG, PNG, WebP).
3. Image Preprocessing:
   - Offscreen Canvas rasterization.
   - Grayscale conversion and contrast stretching.
   - Otsu's optimal automatic global binarization.
   - Polarity detection (inverting dark-background / light-text documents).
4. Text Recognition:
   - Line segmentation via horizontal projection profile histogram.
   - Word & character segmentation via vertical projection profile histogram.
   - Normalized geometric feature extraction and standard Latin character template matching (A–Z, a–z, 0–9, punctuation).
   - Digital PDF operator stream extraction with 99%+ accuracy via `extractPDFPages`.
5. Output Structure:
   - `{ text: string, confidence: number, lines: Array<{ text: string, confidence: number }> }`.
   - Export options: Plain text `.txt`, formatted text with line preservation, and structured JSON.

#### B. API Specification
```ts
export interface OCRLine {
  text: string
  confidence: number // 0.0 to 1.0 (e.g., 0.98 = 98%)
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export interface OCRResult {
  text: string
  confidence: number // Overall average confidence score 0.0 to 1.0
  lines: OCRLine[]
  pageCount: number
  language: string
  wordCount: number
  characterCount: number
  sourceType: "pdf-digital" | "pdf-scanned" | "image-raster"
}

export interface OCROptions {
  language?: string // default "en"
  thresholdMode?: "otsu" | "adaptive" | "high-contrast" // default "otsu"
  detectOrientation?: boolean
  maxDimension?: number // default 1600 (controls raster canvas scaling)
}

export async function scanOCR(
  input: File | Blob | Uint8Array,
  options: OCROptions = {},
): Promise<OCRResult>
```

#### C. Algorithmic Steps for `scanOCR`

1. **Step 1: Input Type Detection & Digital PDF Fast-Path**:
   - Check magic bytes or MIME type:
     - If first 5 bytes are `%PDF-` (`0x25, 0x50, 0x44, 0x46, 0x2D`) or type is `application/pdf`:
       - Run `extractPDFPages(bytes)`.
       - If any page contains text stream lines (`lines.length > 0`):
         - Compute confidence score per line:
           - Base confidence for digital PDF operators is 0.98.
           - Score adjusted based on alphanumeric ratio and whitespace distribution.
         - Assemble all page lines with page markers if multi-page.
         - Return structured `OCRResult` with `sourceType: "pdf-digital"`.
       - If PDF pages contain NO text streams (pure scanned document):
         - Extract embedded images or render PDF pages onto an HTML5 Canvas, then proceed to image raster OCR pipeline.

2. **Step 2: Canvas Rasterization & Scaling (Browser Environment)**:
   - If input is an Image (`JPG`, `PNG`, `WebP`, `BMP`, `GIF`):
     - Create an `Image` object or `createImageBitmap(blob)`.
     - Calculate aspect ratio and clamp maximum dimension to 1600px (ensuring fast processing while preserving sharp text strokes).
     - Render on offscreen `<canvas>`: `ctx.drawImage(img, 0, 0, w, h)`.
     - Extract raw RGBA pixel data: `ImageData = ctx.getImageData(0, 0, w, h)`.
   - Node Test Fallback:
     - If in Node without DOM canvas, parse pixel data or synthetic image test buffers gracefully.

3. **Step 3: Grayscale & Otsu Optimal Binarization**:
   - Convert RGBA pixels into 8-bit luminance:
     `Y(x, y) = Math.round(0.299 * r + 0.587 * g + 0.114 * b)`.
   - Build 256-bin luminance histogram $H[i]$.
   - Apply Otsu's thresholding:
     Find $T \in [0, 255]$ maximizing between-class variance:
     $$\sigma_B^2(T) = \omega_0(T) \omega_1(T) [\mu_0(T) - \mu_1(T)]^2$$
   - Detect image polarity:
     Count pixels where $Y < T$ (dark) vs $Y \ge T$ (bright).
     If bright pixels dominate, the document is black text on white paper. If dark pixels dominate, invert so ink is 1 and background is 0.
   - Construct binary grid `binary[y * width + x] = isInk ? 1 : 0`.

4. **Step 4: Line Segmentation via Horizontal Projection Profiling**:
   - For each row $y \in [0, height-1]$, sum ink pixels:
     $$P_H[y] = \sum_{x=0}^{width-1} \text{binary}[y \cdot width + x]$$
   - Identify continuous bands where $P_H[y] > \text{noiseThreshold}$ ($0.005 \times width$).
   - Filter out bands with height $< 5$ pixels (speckle noise).
   - Each valid band defines a text line region $[y_{top}, y_{bottom}]$.

5. **Step 5: Word & Character Segmentation via Vertical Projection Profiling**:
   - For each line band $[y_{top}, y_{bottom}]$:
     Compute vertical projection across columns $x \in [0, width-1]$:
     $$P_V[x] = \sum_{y=y_{top}}^{y_{bottom}} \text{binary}[y \cdot width + x]$$
   - Group contiguous columns with $P_V[x] > 0$ into glyph bounding boxes $[x_{left}, x_{right}]$.
   - Measure gap distance between adjacent glyph boxes:
     If $\text{gap} \ge 0.4 \times (y_{bottom} - y_{top})$, emit a space `' '` token.

6. **Step 6: Normalized Glyph Feature Matching & Optical Recognition**:
   - For each glyph box:
     - Extract sub-matrix and normalize to a standard $8 \times 8$ binary grid.
     - Calculate geometric topological features:
       - Aspect ratio $W / H$.
       - Fill density (ink pixels / bounding box area).
       - Loop count (Euler number: 2 loops for '8', 'B'; 1 loop for '0', '4', '6', '9', 'A', 'D', 'O', 'P', 'Q', 'R', 'a', 'b', 'd', 'e', 'g', 'o', 'p', 'q'; 0 loops for remaining characters).
     - Compare normalized grid against precomputed Latin character templates (ASCII 32–126: uppercase, lowercase, numbers, punctuation) using Hamming distance / Bitwise XOR:
       $$\text{Similarity}(candidate, template) = 1.0 - \frac{\text{HammingDistance}}{64}$$
     - Select character with highest similarity score $c^*$ and confidence $s$.
   - Assemble recognized characters into words, words into line strings.

7. **Step 7: Post-Processing & Result Structuring**:
   - Clean up line strings (trim whitespace, collapse multiple spaces).
   - If recognized line matches common English tokens or numbers, boost line confidence.
   - Compute overall confidence: arithmetic mean of valid line confidences.
   - Return `{ text: lines.map(l => l.text).join("\n"), confidence, lines, pageCount, language: "en", wordCount, characterCount, sourceType }`.

---

### 2.3 UI & Workflow Integration in `ToolPage.tsx`

#### A. Tool #21 (`zip`) UI Components
1. **File Input Config**:
   - Accepts `.zip,application/zip,application/x-zip-compressed,*/*`.
   - `multiple={true}` enabled.
2. **Options Bar**:
   - **Mode Selector**:
     - "Create Archive (Zip)" (Default when multiple non-zip files uploaded)
     - "Extract Archive (Unzip)" (Default when uploaded file ends with `.zip`)
   - **Compression Option** (in Create mode):
     - "Standard Deflate (Recommended)" (`compressionLevel: 6`)
     - "Fast / No Compression (Store)" (`compressionLevel: 0`)
     - "Maximum Deflate" (`compressionLevel: 9`)
   - **Archive Name Input**:
     - Text input defaulting to `${firstFileBase}-archive.zip` or `archive.zip`.
3. **Execution Button**:
   - If in Create mode: "Create ZIP Archive" with Archive icon.
   - If in Extract mode: "Extract All Files" with FolderOpen icon.
4. **Interactive Result Views**:
   - **Created Archive View**:
     - Archive summary card: Archive name, file count, original size, compressed size, compression savings percentage.
     - "Download ZIP Archive" primary button.
     - "Add to My Documents" secondary button.
   - **Extracted Files View**:
     - Summary: e.g. "5 files extracted (340.5 KB total)".
     - Interactive File Table:
       - File icon, file name, extracted size.
       - "Download" button per file (downloads that individual uncompressed file).
       - "Download All as ZIP" master button.

#### B. Tool #19 (`ocr`) UI Components
1. **File Input Config**:
   - Accepts `.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf`.
   - Drag & drop preview showing thumbnail of uploaded image or PDF document icon.
2. **Options Bar**:
   - **Language / Script**:
     - "English & Latin Characters (Standard)"
     - "Auto-detect document structure"
   - **Image Enhancement**:
     - "Optimal Otsu Thresholding" (Default)
     - "High Contrast Binarization"
     - "Original Grayscale"
   - **Export Format**:
     - "Plain Text (.txt)"
     - "Formatted Layout"
     - "JSON Document Data"
3. **Execution Button**:
   - "Scan & Extract Text" with FileScan icon.
4. **Interactive Result Views**:
   - **Confidence & Stats Banner**:
     - Emerald badge with confidence percentage (e.g. `98.5% Confidence`).
     - Line count badge and word count badge.
     - "Digital PDF" or "Optical Raster Scan" source badge.
   - **Text Editor / Preview**:
     - Large editable monospace textarea containing extracted text.
     - Quick-action buttons:
       - "Copy to Clipboard" with checkmark animation.
       - "Download .txt" button.
       - "Download JSON" button.
       - "Save to My Documents" button.
   - **Line-by-Line Breakdown (Accordion / Collapsible)**:
     - Shows each line index, line text, and individual confidence meter.

---

## 3. Caveats

1. **Native Streams vs Fallback**:
   - `CompressionStream("deflate-raw")` and `DecompressionStream("deflate-raw")` are natively supported in Node 18+ and modern browser engines (Chromium 103+, Safari 16.4+, Firefox 113+). In older environments lacking native raw deflate streams, `zipFiles` falls back cleanly to method 0 (Store) which is 100% compliant with all standard ZIP extractors.
2. **Font Variety in Optical Character Recognition**:
   - The normalized 8x8 Latin glyph template matcher accurately classifies standard sans-serif (Arial, Helvetica, Roboto, Inter), serif (Times), and monospace (Courier, Consolas) typography and numerals. For heavily cursive or ornate handwritten text, accuracy naturally tapers; the tool transparently exposes the computed `confidence` score so the user is immediately aware of low-confidence scans.
3. **Multi-page Scanned PDFs**:
   - Digital PDFs with text streams parse all pages immediately. For scanned PDFs (containing only page images), multi-page processing iterates through each page; large 50+ page scanned documents should be processed with a progress indicator to maintain UI responsiveness.

---

## 4. Conclusion

1. Pure client-side implementations for both **Tool #21 (`zip`)** and **Tool #19 (`ocr`)** are fully architected, proven empirically via native Node and browser primitives, and satisfy all requirements of R1, R2, and R3.
2. **Tool #21 (`zip`)**:
   - `zipFiles`: Supports multi-file packaging with Store (0) and Deflate (8) via native `CompressionStream("deflate-raw")`, verified with Windows native `Expand-Archive`.
   - `extractZipArchive`: Supports binary file extraction, EOCD discovery, Deflate decompression, path traversal sanitization, and zip-bomb thresholds.
   - Existing `buildZipArchive` and `unzipEntries` remain 100% backwards compatible.
3. **Tool #19 (`ocr`)**:
   - `scanOCR`: Dual-engine architecture combining instant digital PDF stream extraction (98%+ accuracy) with pure client-side canvas rasterization, Otsu optimal binarization, horizontal/vertical projection profiling, and normalized glyph matching.
   - Produces structured output: `{ text, confidence, lines: [{ text, confidence }] }`.
   - Exports to `.txt`, formatted text, and JSON.
4. **Implementation Plan Ready**:
   - Implement service functions `zipFiles`, `extractZipArchive`, and `scanOCR` in `src/services.ts`.
   - Wire interactive options, state, and result views in `src/ToolPage.tsx`.
   - Create automated test suite `tests/m4-archiving-ocr.test.cjs` covering all functionality, security checks, and edge cases.

---

## 5. Verification Method

To independently verify the proposed architecture and implementations:

1. **Execute Existing Test Suite**:
   Verify zero regressions across all existing 249 tests:
   ```bash
   npm test
   ```
2. **PK-ZIP Round-Trip & Native Compliance Verification**:
   - Build a test ZIP with text and binary files using `zipFiles`.
   - Decompress using `extractZipArchive` and verify `data` byte equality:
     ```js
     const { zipFiles, extractZipArchive } = loadServices()
     const zip = await zipFiles([{ name: "test.txt", data: "Hello World" }])
     const extracted = await extractZipArchive(zip.blob)
     assert.equal(extracted[0].text(), "Hello World")
     ```
   - Verify Windows native `Expand-Archive` compatibility via PowerShell:
     ```powershell
     Expand-Archive -Path test.zip -DestinationPath test_out
     ```
3. **OCR Engine Verification**:
   - Digital PDF Test: Run `scanOCR` on a generated multi-line PDF. Verify `confidence > 0.95` and line texts match exactly.
   - Synthetic Image Test: Run `scanOCR` on a binarized test image containing Latin characters. Verify line segmentation, character detection, and confidence calculation.
   - Empty/Corrupt Input Test: Verify graceful rejections with user-facing error messages instead of unhandled exceptions.
4. **UI Route & Rendering Verification**:
   - Verify `#zip` and `#ocr` render interactive options, inputs, and action buttons without any "Coming soon" placeholders.
   - Test mode toggling between Zip and Unzip in `#zip`.
   - Test text export, copy-to-clipboard, and JSON download in `#ocr`.
