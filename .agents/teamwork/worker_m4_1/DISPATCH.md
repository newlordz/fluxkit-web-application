# DISPATCH: Worker M4 (Milestone 4 Implementation)

## Objective
Implement authentic client-side processing, interactive UI options, and automated test coverage for Milestone 4 tools in the FluxKit web application:
1. Tool #21: `zip` (ZIP and Unzip)
2. Tool #19: `ocr` (OCR Scanner)
3. Tool #22: `convert` (Convert Formats)
4. Tool #23: `convert-compress` (Convert & Compress)
5. Tool #24: `merge-compress` (Merge & Compress)
6. Tool #25: `split-compress` (Split & Compress)

## Authoritative User Request
Read the authoritative user request at:
`c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\ORIGINAL_REQUEST.md`

## Architecture & Project Scope
Read the global project scope at:
`c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\orchestrator\PROJECT.md`

## Explorer Blueprints & Handoffs
Review and follow the complete architectures specified in:
1. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m4_1\handoff.md` (ZIP & OCR architecture, Web Streams Deflate/Inflate, Tesseract/Canvas fallback OCR)
2. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m4_2\handoff.md` (Chained Pipelines, Bare Blob safety, multi-stage progress, memory management)
3. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m4_3\handoff.md` (ToolPage.tsx UI integration, options panels, metrics badges, and test suite specifications)

## File Boundaries & Write Ownership
You exclusively own and may edit:
- `src/services.ts`
- `src/ToolPage.tsx`
- `tests/m4-pipelines.test.cjs`

Do NOT touch files owned by other milestones without explicit reason. Preserve backward compatibility for M1, M2, and M3 functions.

## Implementation Tasks
1. **Bare Blob .name Defense & Chaining Safety**:
   - In `extractBytes` in `src/services.ts`, provide fallback `safeName = (input as File).name || "document.pdf"`.
   - In `compressPDF`, `splitPDF`, and other service functions, handle `Blob` inputs without `.name` gracefully so filenames don't emit "undefined".
   - In `jpgToPDF`, support `Blob` items alongside `File` and byte objects.
2. **Implement Milestone 4 Services in `src/services.ts`**:
   - `zipFiles(files, options)`: Support multi-file packaging with compression level options (Deflate vs Store) producing valid PK-ZIP archives.
   - `extractZipArchive(zipData, options)`: Support extraction of binary & text files, providing file list with names, sizes, mime types, and blobs.
   - `ocrScan(input, options)`: Client-side OCR recognition for images and PDFs, extracting text and metadata.
   - `convertFormat(file, targetFormat, options)`: Universal format converter routing across PDF, Word, PowerPoint, Excel, CSV, Images, and Text.
   - `convertAndCompress(file, targetFormat, compressionOptions, onProgress)`: Chained conversion + compression.
   - `mergeAndCompress(files, compressionOptions, onProgress)`: Chained PDF merge + compression.
   - `splitAndCompress(file, splitOptions, compressionOptions, onProgress)`: Chained PDF split + compression.
3. **UI Integration in `src/ToolPage.tsx`**:
   - Update file acceptance and multi-file selection: allow multiple files for `merge-compress` in dropzone.
   - Add `merge-compress` and `split-compress` to `isStrictPdf`.
   - Dynamic options panels for all 6 M4 tools:
     - `zip`: Mode toggle (Create Archive vs Extract Archive), compression level selector.
     - `ocr`: Language selection, format output options (Text, JSON, Document).
     - `convert`: Dynamic target format choices based on detected input format.
     - `convert-compress`: Target format choice + compression level preset (low, medium, high).
     - `merge-compress`: Compression level selector, file re-ordering info.
     - `split-compress`: Split range mode (all pages vs custom range) + compression preset.
   - Connect execution branch in `handleProcess` to the new service functions.
   - Contextual action button labels and multi-stage progress indicators.
   - Pipeline compression stats badge (input size -> output size, savings percentage) for `convert-compress`, `merge-compress`, `split-compress`.
4. **Verification & Tests**:
   - Create `tests/m4-pipelines.test.cjs` covering all 6 M4 tools.
   - Run `npm test` (`node --test tests/*.test.cjs`) — all existing 249 tests + new M4 tests must pass with 0 failures.
   - Run `npm run build` — must succeed cleanly with 0 TypeScript/bundling errors.
5. **Handoff Report**:
   - Write your completion report in `.agents/teamwork/worker_m4_1/handoff.md`.
   - Update `.agents/teamwork/worker_m4_1/progress.md`.
   - Message parent upon completion with a summary of changes and test/build commands and results.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-11-10T21:10:29Z
Safety check at T+10m: Checking in on implementation progress for Milestone 4 tools. Update `progress.md` with current status and continue with implementation and testing.
