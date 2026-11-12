# Handoff Report: Explorer M3-3 (UI Controls & Test Specification)

## 1. Observation

1. **Baseline Test Harness**:
   - Command: `npm test`
   - Result: 155 tests passing, 0 failing, 0 skipped, duration ~7.7s.
   - Command runs: `node --test tests/*.test.cjs` as defined in `package.json` line 11.
2. **Current `src/ToolPage.tsx` State**:
   - **MIME Types**: In lines 437-460 (`getAcceptedFileTypes`), `jpg` and `image` are grouped together without distinguishing `pdf-to-jpg` (source PDF) from `jpg-to-pdf` (source image). Office formats (`.docx`, `.pptx`, `.xlsx`, `.csv`) lack dedicated accepted MIME filters.
   - **Strict PDF Filtering**: In lines 466-474 (`isStrictPdf`), only M2 tools are included. `pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, and `pdf-to-jpg` are missing from strict PDF validation.
   - **Multi-File Selection**: Line 1493 has `multiple={tool.id === "merge-pdf" || tool.id === "zip"}`. `jpg-to-pdf` lacks `multiple={true}`.
   - **Form Options**: Lines 1475-1947 render custom options for `rotate-pdf`, `split-pdf`, `compress`, `edit-pdf`, `watermark`, `sign-pdf`, and `password`. The 8 M3 conversion tools have zero custom options.
   - **Submit Execution**: Lines 870-899 contain a dummy fallback that simply wraps the original file buffer into an `application/octet-stream` Blob without real conversion.
   - **Submit Action Button**: Lines 1968-1989 default to `Run ${tool.name}` instead of tool-specific conversion copy.
3. **Tool Catalog (`src/config.ts`)**:
   - All 8 conversion tools (`pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, `word-to-pdf`, `ppt-to-pdf`, `excel-to-pdf`, `pdf-to-jpg`, `jpg-to-pdf`) are registered under `category: "File tools"` with `available: true`.

---

## 2. Logic Chain

1. **Step 1 (UI Interaction Parity)**:
   - Observation 2 demonstrates that the 8 conversion tools currently offer no configurable parameters to users in `src/ToolPage.tsx`.
   - By creating dedicated 2-column options panels utilizing existing component state (`optionA`, `optionB`, and `extra`), users can customize output format (e.g. `.docx` vs `.doc` vs `.txt`), layout preservation, slide aspect ratio (16:9 vs 4:3), table extraction mode (auto vs lines), page margins, typography, orientation, and image quality presets.
2. **Step 2 (Dropzone Usability & Validation)**:
   - For `jpg-to-pdf`, users routinely want to convert multiple photos into a single PDF document. Adding `tool.id === "jpg-to-pdf"` to the `multiple` attribute and adding `isStrictPdf` guards to `pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, and `pdf-to-jpg` ensures immediate feedback if an unsupported file is dropped.
3. **Step 3 (Action Button & Result Feedback)**:
   - Replacing generic `Run ${tool.name}` with specific action labels (`Convert to Word`, `Convert to PowerPoint`, `Convert to Excel`, `Convert to PDF`, `Convert to JPG`) brings consistency with M2 tools (`Merge PDFs`, `Compress PDF`, `Add Watermark`, etc.).
   - Hooking into `onComplete(tool.name)` ensures conversion activity is properly registered in the session activity feed.
4. **Step 4 (Automated Test Suite Design)**:
   - In `tests/m3-conversions.test.cjs`, creating 42 targeted tests across 11 suites using native `node:test` and `node:assert/strict` provides comprehensive coverage:
     - 8 conversion service unit suites (happy paths, options, error cases)
     - 1 round-trip / pipeline integrity suite
     - 1 UI mounting suite verifying every route's dropzone, options, and button copy
     - 1 error boundary / corrupt file rejection suite
   - Because `package.json` runs `node --test tests/*.test.cjs`, this file integrates automatically into `npm test` without extra configuration.

---

## 3. Caveats

1. **Backend Conversion Algorithm Implementation**:
   - The concrete implementation of internal conversion engines in `src/services.ts` (e.g. OpenXML ZIP builders, PDF text stream decoders, and canvas rasterization) is under the purview of Explorers M3-1 and M3-2. Explorer M3-3 has defined the exact interface contracts and signatures required by `ToolPage.tsx` and the test suite.
2. **Browser Canvas Emulation in Node Tests**:
   - In Node.js testing environments where HTML5 `<canvas>` is mocked, rasterization tests should verify data buffer transformations or mock canvas `toDataURL` / `toBlob` outputs without requiring native GPU bindings.

---

## 4. Conclusion

The UI controls in `src/ToolPage.tsx` and the test harness in `tests/m3-conversions.test.cjs` are fully designed and specified:
1. **`src/ToolPage.tsx` Specifications**: Complete JSX option panels, updated `getAcceptedFileTypes()`, strict PDF validation, multi-image support for `jpg-to-pdf`, explicit button copy, and service dispatch wiring.
2. **`tests/m3-conversions.test.cjs` Specifications**: 42 test cases across 11 test suites covering functional unit conversion, options parameterization, error boundaries, round-trip cycles, and route UI rendering.
3. **Artifacts Ready for Implementation**:
   - Detailed blueprint in `.agents/teamwork/explorer_m3_3/analysis.md`.

---

## 5. Verification Method

1. **Inspect Analysis Specification**:
   - Read `.agents/teamwork/explorer_m3_3/analysis.md` for complete JSX snippets and test suite details.
2. **Verify Baseline Tests**:
   - Command: `npm test`
   - Expected Output: All 155 tests pass with 0 failures.
3. **Post-Implementation Verification (by Worker)**:
   - Command: `npm test`
   - Expected Output: 197 tests pass (155 existing + 42 new M3 tests), 0 failures.
   - Command: `npm run build`
   - Expected Output: Vite build succeeds with 0 errors.
