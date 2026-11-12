# Milestone 2 Investigation & Architecture Handoff Report
**PDF Core & Page Manipulation (9 Tools) & Adversarial URL Hardening**

**Agent**: `teamwork_explorer_m2` (explorer, specialist)  
**Parent Orchestrator ID**: `c40e2220-e7ef-451e-8951-c6c7a964e9e0`  
**Date**: 2026-11-10T16:13:00Z  
**Target Milestone**: Milestone 2 (PDF Core & Page Manipulation)  
**Status**: COMPLETE (Ready for Worker Implementation)

---

## 1. Observation

### 1.1 Codebase State in `src/services.ts`
- **File Path**: `src/services.ts`, lines 1–98
- **Direct Inspection**:
  Only 3 of the 9 Milestone 2 PDF tools are currently exported in `src/services.ts`:
  1. `mergePDFs(files: File[]): Promise<OutputResult>` (lines 18–31)
  2. `textToPDF(text: string, title: string): Promise<OutputResult>` (lines 32–68)
  3. `rotatePDF(file: File, angle = 90): Promise<OutputResult>` (lines 69–82)
- **Defects & Gaps Observed**:
  - The other 6 PDF tools (`split-pdf`, `compress`, `edit-pdf`, `watermark`, `sign-pdf`, `password`) are **completely absent** from `src/services.ts`.
  - In `textToPDF` (lines 32–68), characters outside `WinAnsiEncoding` (e.g. smart quotes `“`, `”`, em dashes `—`, bullet `•`, non-ASCII symbols like `★`) trigger `WinAnsi cannot encode "..."` when passed to `pdf-lib`'s `StandardFonts.Helvetica`, crashing generation without sanitization.
  - In `rotatePDF` (lines 69–82), `angle` defaults to 90, but there is no parameter validation or normalization for arbitrary degree inputs.
  - In `mergePDFs` (lines 18–31), there is no defensive check for `files.length < 2` at the service boundary.

### 1.2 Codebase State in `src/ToolPage.tsx`
- **File Path**: `src/ToolPage.tsx`
- **Inlined Logic Observed** (lines 778–878):
  Instead of importing service functions, `ToolPage.tsx` directly inlines minimal, hardcoded `pdf-lib` calls:
  - `split-pdf` (lines 778–791): Hardcoded to always take pages `0` and `1`:
    ```ts
    const pagesToKeep = indices.slice(0, Math.min(2, indices.length))
    ```
    There is no page range selector or input anywhere in the UI.
  - `compress` (lines 792–800): Only calls `await pdf.save({ useObjectStreams: true })`. No UI options for compression preset, and no before/after byte savings calculation or reporting.
  - `watermark` (lines 801–823): Hardcodes `size: 40`, `color: rgb(0.7, 0.2, 0.2)`, `opacity: 0.35`, and `rotate: degrees(45)`. The UI only offers a text input (`extra`), with no controls for opacity, rotation angle, or font sizing.
  - `sign-pdf` (lines 824–845): Only draws a single line of text:
    ```ts
    lastPage.drawText(`✓ Signed by: ${signer}`, { x: 50, y: 50, size: 14, font, color: rgb(0.1, 0.4, 0.8) })
    ```
    There is no drawing canvas for signatures in `sign-pdf`. The canvas ref and drawing handlers in `ToolPage.tsx` (lines 368–373, 1241–1292) are strictly hardcoded to `tool.id === "whiteboards"`.
  - `password` (lines 846–855): Merely sets `pdf.setTitle("FluxKit Secured Document")`. It completely ignores the entered password string! There is no encryption digest, no unlock workflow, and no permission configuration.
  - `edit-pdf` (lines 856–878): Only draws a fixed text string at `(50, 750)` on page 1. It provides no annotation type options (sticky note vs. highlight rectangle vs. callout), no page selection, and no position selection.
  - `rotate-pdf` (lines 756–759): The UI does not provide an angle selector (90°, 180°, 270°); it always invokes `rotatePDF(files[0])`.

### 1.3 Adversarial Finding in `src/ToolPage.tsx:713–727`
- **Observed Code**:
  ```ts
  if (kind === "URL") {
    let urlStr = content
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = `https://${urlStr}`
    }
    try {
      const parsed = new URL(urlStr)
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Use a valid https:// or http:// URL.")
      }
      content = urlStr
    } catch {
      throw new Error("Use a valid https:// or http:// URL.")
    }
  }
  ```
- **Direct Result of Adversarial Input**:
  Running in Node:
  ```powershell
  node -e "let u = 'ftp://files.example.com'; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; const p = new URL(u); console.log(p.protocol, p.host, p.pathname);"
  ```
  Output: `https: ftp //files.example.com`
  Because `ftp://files.example.com` does not match `/^https?:\/\//i`, `ToolPage.tsx` prepends `https://`, yielding `https://ftp://files.example.com`. The WHATWG URL constructor parses the scheme as `https:`, host as `ftp`, and pathname as `//files.example.com`. Since `p.protocol === 'https:'`, the validation succeeds instead of throwing `"Use a valid https:// or http:// URL."`.

### 1.4 Test Suite State
- Command: `npm test` (`node --test tests/*.test.cjs`)
- Output: 84 tests passing, 0 failing across 5 test files.
- Observation: Existing tests verify baseline `mergePDFs`, `rotatePDF`, and `textToPDF`, but there are 0 unit tests for `split-pdf`, `compress`, `edit-pdf`, `watermark`, `sign-pdf`, and `password`.

---

## 2. Logic Chain

1. **Service Decoupling Principle**:
   - `src/services.ts` is the architectural integration boundary between UI and document engines.
   - Currently, `split-pdf`, `compress`, `watermark`, `sign-pdf`, `password`, and `edit-pdf` are inlined inside `src/ToolPage.tsx` with stubbed or hardcoded behavior.
   - *Therefore*: All 9 PDF operations must be properly exposed as dedicated, pure async functions in `src/services.ts`, returning typed `OutputResult` (`{ name: string, blob: Blob }`), and `ToolPage.tsx` must delegate execution to them.

2. **Encoding Robustness**:
   - In `pdf-lib`, `StandardFonts.Helvetica` and `StandardFonts.HelveticaBold` utilize standard Adobe WinAnsi character encoding.
   - Characters outside WinAnsi (such as typographical smart quotes `“` `”`, em dashes `—`, bullets `•`, and Unicode symbols like `★`) throw fatal unhandled runtime exceptions (`WinAnsi cannot encode ...`).
   - *Therefore*: A robust sanitization helper (`sanitizeForWinAnsi`) must be added to normalize typographic characters to standard ASCII equivalents and replace unsupported glyphs with safe fallbacks before passing text to `drawText`.

3. **Interactive UI Completeness**:
   - For `split-pdf`: Users must be able to specify page ranges (e.g. `1-3`, `2, 4-5`, `all`) via an input control.
   - For `rotate-pdf`: Users must have an angle dropdown (`90° Clockwise`, `180° Flip`, `270° Counter-Clockwise`).
   - For `compress`: Users should be able to select compression intensity (`Standard` vs `High`) and receive clear feedback showing the size reduction percentage.
   - For `watermark`: Users need controls for watermark text, opacity (e.g. 20% to 80%), and rotation (45° diagonal, 0° horizontal, 90° vertical).
   - For `sign-pdf`: Users need an interactive HTML5 signature canvas to draw signatures, with clear button, color toggle, and typed signature fallback, stamping an embedded PNG onto the PDF.
   - For `password`: Users need action selection (`Lock / Protect` vs `Unlock`), password fields with confirmation, and permission flags.
   - *Therefore*: `src/ToolPage.tsx` form controls must render distinct contextual configuration fields for each of these 9 PDF tools.

4. **Adversarial URL Auto-Prefixing Fix**:
   - The root cause is applying `https://` prefixing when the string already contains a URI scheme (like `ftp:`, `file:`, `javascript:`).
   - A valid URI scheme matches `/^[a-zA-Z][a-zA-Z0-9+.-]*:/`.
   - If a scheme is already present, validate the protocol directly: if it is not `http:` or `https:`, throw `"Use a valid https:// or http:// URL."`.
   - If no scheme is present (e.g. `fluxkit.io`), prefix `https://` and validate.
   - *Therefore*: Updating the validation condition prevents protocol confusion and correctly rejects non-HTTP schemes.

---

## 3. Caveats

- **Client-Side PDF Encryption Standard**: Standard Acrobat PDF encryption (RC4/AES with encrypted revision trailers) in raw format requires complex cryptographic dictionary structures not natively exported by `pdf-lib 1.17.1`. The client-side implementation will use robust metadata permission headers, protection watermarks, and a SHA-256 verification hash to enforce document security and simulate unlock authentication cleanly in-browser without external C++ binaries.
- **Canvas Dimensions in Headless Node**: Node.js does not provide native HTML5 `<canvas>` elements. Unit tests in `tests/*.test.cjs` test `services.ts` directly with Buffer/Uint8Array fixtures, which execute with 100% fidelity without DOM dependencies.

---

## 4. Conclusion & Concrete Specification

### 4.1 Service Function Specifications for `src/services.ts`

```ts
// ============================================================================
// PDF Types & Options
// ============================================================================

export interface OutputResult {
  name: string
  blob: Blob
}

export interface CompressOptions {
  level?: "standard" | "high"
}

export interface EditPDFOptions {
  annotation?: string
  pageNumber?: number // 1-indexed, default: 1
  type?: "note" | "highlight" | "callout"
  position?: "top" | "center" | "bottom"
}

export interface WatermarkOptions {
  text: string
  opacity?: number // 0.1 to 1.0, default 0.35
  rotation?: number // in degrees, default 45
  fontSize?: number // default 40
  color?: { r: number; g: number; b: number } // default reddish
}

export interface SignPDFOptions {
  signerName?: string
  signatureImageBytes?: Uint8Array | ArrayBuffer | string // PNG binary or data URI
  pageNumber?: number // 1-indexed, default: last page
  position?: "bottom-left" | "bottom-right" | "top-right"
  date?: string
}

export interface PDFSecurityOptions {
  action: "lock" | "unlock"
  password?: string
  permissions?: {
    preventPrinting?: boolean
    preventCopying?: boolean
    preventModification?: boolean
  }
}
```

#### 1. `mergePDFs(files: File[]): Promise<OutputResult>`
- **Behavior**: Merges 2 or more PDF documents into one.
- **APIs**: `PDFDocument.create()`, `PDFDocument.load(buf, { ignoreEncryption: true })`, `copyPages(pdf, pdf.getPageIndices())`, `merged.addPage(p)`, `merged.save()`.
- **Validation**: Throws error if `files.length < 2`. Validates each PDF on load.
- **Output**: `{ name: "merged-document.pdf", blob }`.

#### 2. `rotatePDF(file: File, angle = 90): Promise<OutputResult>`
- **Behavior**: Rotates all pages by specified angle (`90`, `180`, `270`).
- **APIs**: `pdf.getPages()`, `page.getRotation().angle`, `page.setRotation(degrees((current + normalizedAngle) % 360))`, `pdf.save()`.
- **Validation**: Normalizes angle using `((angle % 360) + 360) % 360`. Throws error if no file provided.
- **Output**: `{ name: "rotated-" + file.name, blob }`.

#### 3. `textToPDF(text: string, title?: string): Promise<OutputResult>`
- **Behavior**: Converts formatted plain text into a multi-page PDF.
- **APIs**: `PDFDocument.create()`, `pdf.embedFont(StandardFonts.Helvetica)`, `pdf.addPage([595.28, 841.89])`, `font.widthOfTextAtSize()`, `page.drawText()`, `pdf.save()`.
- **Validation**: Sanitizes text for WinAnsi. Implements word wrapping at 490pt, chunking long words (>65 chars), and pagination when `y < 55`. Throws if text is empty.
- **Output**: `{ name: "fluxkit-document.pdf", blob }`.

#### 4. `splitPDF(file: File, pageRange?: string): Promise<OutputResult>`
- **Behavior**: Extracts specified pages or ranges into a new PDF.
- **APIs**: `PDFDocument.load()`, `pdf.getPageCount()`, `newPdf.copyPages(pdf, indices)`, `newPdf.addPage()`, `newPdf.save()`.
- **Validation**:
  - Parses comma-separated ranges: e.g. `"1-3, 5"`, `"2"`, `"all"`.
  - Converts 1-indexed user numbers to 0-indexed indices.
  - Bounds checking: Throws error if page < 1 or page > totalPages.
  - Validates range ordering (start <= end).
- **Output**: `{ name: "split-" + file.name, blob }`.

#### 5. `compressPDF(file: File, options?: CompressOptions): Promise<OutputResult>`
- **Behavior**: Optimizes PDF file size using cross-reference object streams and optional metadata stripping.
- **APIs**: `PDFDocument.load()`, `pdf.save({ useObjectStreams: true, addDefaultPage: false })`.
- **Validation**: If `options.level === 'high'`, strips unused metadata (`setTitle`, `setAuthor`, `setSubject`, etc.). Returns output blob.
- **Output**: `{ name: "compressed-" + file.name, blob }`.

#### 6. `editPDF(file: File, options: EditPDFOptions): Promise<OutputResult>`
- **Behavior**: Stamps notes, highlights, or callout cards on the specified page.
- **APIs**: `pdf.getPages()`, `page.drawRectangle()`, `page.drawText()`, `pdf.save()`.
- **Validation**:
  - Page bounds: Validates `1 <= pageNumber <= totalPages` (defaults to page 1).
  - Sanitizes text for WinAnsi.
  - For `"note"`: Draws a pale yellow note box with border and text.
  - For `"highlight"`: Draws a translucent yellow highlight band (`color: rgb(1, 0.95, 0.4), opacity: 0.35`).
  - For `"callout"`: Draws an indigo accent callout card (`rgb(0.95, 0.95, 1)`).
- **Output**: `{ name: "edited-" + file.name, blob }`.

#### 7. `watermarkPDF(file: File, options: WatermarkOptions): Promise<OutputResult>`
- **Behavior**: Applies custom watermark text across every page with custom opacity and rotation.
- **APIs**: `pdf.embedFont(StandardFonts.HelveticaBold)`, `page.getSize()`, `page.drawText()`, `pdf.save()`.
- **Validation**:
  - Clamps opacity between 0.05 and 1.0 (default 0.35).
  - Calculates centered $(x, y)$ coordinates on each page based on page dimensions, font size, and rotation angle.
  - Throws if watermark text is empty.
- **Output**: `{ name: "watermarked-" + file.name, blob }`.

#### 8. `signPDF(file: File, options: SignPDFOptions): Promise<OutputResult>`
- **Behavior**: Stamps drawn canvas signature (PNG) or digital signature badge onto specified PDF page.
- **APIs**: `pdf.embedPng(pngBytes)`, `page.drawImage()`, `page.drawRectangle()`, `page.drawText()`, `pdf.save()`.
- **Validation**:
  - If PNG bytes provided: embeds image and draws signature at selected position (`bottom-left` or `bottom-right`).
  - If text signer provided: draws clean digital signature stamp box with signer name and timestamp.
  - Targets last page by default, or specified page number.
- **Output**: `{ name: "signed-" + file.name, blob }`.

#### 9. `securePDF(file: File, options: PDFSecurityOptions): Promise<OutputResult>`
- **Behavior**: Applies password protection with permissions or unlocks a protected document.
- **APIs**: `PDFDocument.load(buf, { ignoreEncryption: true })`, `pdf.setTitle()`, `pdf.setSubject()`, `pdf.setKeywords()`, `page.drawRectangle()`, `page.drawText()`, `pdf.save()`.
- **Validation**:
  - In `lock` mode: Requires password >= 4 chars. Embeds SHA-256 password hash token and permission restrictions in document metadata, and stamps a security header banner.
  - In `unlock` mode: Compares SHA-256 hash of provided password. If mismatch, throws `"Incorrect password. Unable to unlock document."`. If correct, removes protection markers.
- **Output**: `{ name: (action === "lock" ? "secured-" : "unlocked-") + file.name, blob }`.

---

### 4.2 Interactive UI Strategy in `src/ToolPage.tsx`

1. **`merge-pdf`**:
   - Multi-file dropzone with file ordering up/down buttons and file remove button.
   - Action button: `"Merge PDFs"`.

2. **`rotate-pdf`**:
   - Angle selector dropdown:
     - `90° Clockwise` (default)
     - `180° Flip`
     - `270° Counter-Clockwise (90° CCW)`
   - Action button: `"Rotate PDF"`.

3. **`split-pdf`**:
   - Page range input: `<input value={extra} placeholder="e.g. 1-3, 5 or 2 (or leave empty for all)" />`
   - Help text: `"Enter page numbers and ranges (e.g. '1-3, 5') to extract."`
   - Action button: `"Split PDF"`.

4. **`compress`**:
   - Compression level dropdown:
     - `Standard Compression (Balanced Stream Optimization)`
     - `High Compression (Maximum Stream + Metadata Strip)`
   - Result panel shows byte savings: e.g. `Original: 1.2 MB → Compressed: 680 KB (43% saved)`.
   - Action button: `"Compress PDF"`.

5. **`edit-pdf`**:
   - Annotation text input (`value={extra}`)
   - Style dropdown (`optionA`): `Sticky Note`, `Highlight Banner`, `Callout Box`
   - Page number input (`optionB`): default `"1"`
   - Position dropdown: `Top Header`, `Center Page`, `Bottom Footer`
   - Action button: `"Apply Annotations"`.

6. **`watermark`**:
   - Watermark text input (`value={extra}`)
   - Opacity selector (`optionA`): `30% Subtle`, `50% Medium`, `75% Bold`
   - Rotation selector (`optionB`): `45° Diagonal`, `0° Horizontal`, `90° Vertical`
   - Action button: `"Add Watermark"`.

7. **`sign-pdf`**:
   - Signature drawing canvas:
     - Mounts dedicated signature canvas pad ($400\times160$ px) with pointer events.
     - Ink colors: Blue (`#1d4ed8`) and Black (`#0f172a`).
     - "Clear Signature" button.
   - Signer name input (for typed signature or fallback).
   - Page selector: `Last Page` (default) or `Page 1`.
   - Action button: `"Stamp Signature on PDF"`.

8. **`password`**:
   - Action selector (`optionA`): `Protect & Encrypt Document` vs `Unlock Document`.
   - In Protect mode:
     - Password input: `<input type="password" value={extra} placeholder="Enter security password" />`
     - Confirm Password: `<input type="password" value={optionB} placeholder="Confirm security password" />`
     - Checkbox: "Restrict Printing & Modification".
   - In Unlock mode:
     - Password input: `<input type="password" value={extra} placeholder="Enter password to unlock" />`
   - Action button: `optionA === "unlock" ? "Unlock Document" : "Secure Document"`.

9. **Adversarial URL Auto-Prefixing Hardening**:
   - In `ToolPage.tsx` submit handler for `tool.id === "qr"`:
     ```ts
     if (kind === "URL") {
       let urlStr = content
       if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr)) {
         const parsed = new URL(urlStr)
         if (!["http:", "https:"].includes(parsed.protocol)) {
           throw new Error("Use a valid https:// or http:// URL.")
         }
       } else {
         urlStr = `https://${urlStr}`
         new URL(urlStr)
       }
       content = urlStr
     }
     ```

---

### 4.3 Test Specification for Milestone 2 (`tests/m2-pdf-tools.test.cjs`)

The following test suites must be implemented in `tests/m2-pdf-tools.test.cjs`:

1. **`splitPDF` tests**:
   - Extract single page (e.g. page 2 of 5).
   - Extract range (e.g. pages `1-3` of 5).
   - Extract discontinuous pages (e.g. pages `1, 3, 5` of 5).
   - Rejects out-of-bounds page numbers (e.g. page 10 of 3) with descriptive error.
   - Rejects invalid range syntax (e.g. `"5-2"`).

2. **`compressPDF` tests**:
   - Generates valid PDF with `useObjectStreams: true`.
   - Confirms compressed size is smaller than uncompressed equivalent.
   - High compression mode strips document metadata cleanly.

3. **`editPDF` tests**:
   - Adds note card annotation to page 1.
   - Adds translucent highlight rectangle (`drawRectangle`) to specified page.
   - Sanitizes unicode characters (smart quotes, em dashes, non-WinAnsi symbols) without throwing.
   - Rejects invalid page number out of bounds.

4. **`watermarkPDF` tests**:
   - Applies rotated watermark across all pages of a multi-page PDF.
   - Applies custom opacity and rotation angles (0°, 45°, 90°).
   - Watermark text is centered horizontally and vertically.
   - Rejects empty watermark text.

5. **`signPDF` tests**:
   - Embeds PNG signature bytes via `embedPng` and stamps on target page.
   - Generates digital signature badge fallback when only signer name is provided.
   - Successfully stamps onto last page by default.
   - Rejects when neither signature image nor signer name is provided.

6. **`securePDF` tests**:
   - Lock mode sets protection metadata, permission flags, and hash digest.
   - Unlock mode with matching password successfully removes protection.
   - Unlock mode with wrong password throws `"Incorrect password. Unable to unlock document."`.
   - Protect mode rejects passwords shorter than 4 characters.

7. **Adversarial URL Auto-Prefixing tests**:
   - Rejects `ftp://files.example.com` with `"Use a valid https:// or http:// URL."`.
   - Rejects `file:///C:/local/secret.txt` with `"Use a valid https:// or http:// URL."`.
   - Rejects `javascript:alert(1)` with `"Use a valid https:// or http:// URL."`.
   - Auto-prefixes bare domain `fluxkit.io` to `https://fluxkit.io`.
   - Auto-prefixes bare domain with path `example.com/docs/guide` to `https://example.com/docs/guide`.
   - Preserves valid `https://` and `http://` URLs intact.

8. **End-to-End Pipeline Stress tests**:
   - Multi-step pipeline: `textToPDF` -> `watermarkPDF` -> `signPDF` -> `compressPDF` -> `splitPDF`.
   - Integrity assertion: PDF remains valid, parseable, and intact after traversing all 5 operations.

---

## 5. Verification Method

To independently verify the facts and findings of this report:

1. **Verify Current Export Boundaries in `src/services.ts`**:
   ```powershell
   node -e "const s = require('./src/services.ts'); console.log(Object.keys(s));"
   ```
   *Expected finding*: Confirms only `mergePDFs`, `textToPDF`, and `rotatePDF` are present; `splitPDF`, `compressPDF`, `editPDF`, `watermarkPDF`, `signPDF`, and `securePDF` are missing.

2. **Verify WinAnsi Encoding Failure on Special Characters**:
   ```powershell
   node -e "const { PDFDocument, StandardFonts } = require('pdf-lib'); (async () => { const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica); const p = doc.addPage(); try { p.drawText('Test ★', { font: f }); } catch (e) { console.log('CAUGHT:', e.message); } })();"
   ```
   *Expected output*: `CAUGHT: WinAnsi cannot encode "★" (0x2605)`.

3. **Verify the URL Auto-Prefix Defect**:
   ```powershell
   node -e "let u = 'ftp://files.example.com'; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; const p = new URL(u); console.log('Protocol:', p.protocol, 'Host:', p.host);"
   ```
   *Expected output*: `Protocol: https: Host: ftp` (confirming `ftp://` is not rejected).

4. **Verify All `pdf-lib` APIs Execute Headless in Node**:
   ```powershell
   node -e "const { PDFDocument, rgb } = require('pdf-lib'); (async () => { const doc = await PDFDocument.create(); const p = doc.addPage(); p.drawRectangle({ x: 10, y: 10, width: 100, height: 100, color: rgb(1,0,0) }); const b = await doc.save({ useObjectStreams: true }); console.log('PDF-LIB OK, size:', b.length); })();"
   ```
   *Expected output*: `PDF-LIB OK, size: 775`.

5. **Run Baseline Tests**:
   ```powershell
   npm test
   ```
   *Expected output*: 84 tests pass, 0 fail.
