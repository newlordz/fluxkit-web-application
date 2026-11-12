# DISPATCH: Worker M6 (Audio Transcription & Collaboration Workspace Implementation)

## Objective
Implement authentic client-side functionality, offline fallbacks, and interactive UI experiences for the final 4 tools in the FluxKit web application:
1. Tool #18: `audio-text` (Audio to Text)
2. Tool #34: `documents` (My Documents)
3. Tool #36: `meetings` (Video Meetings)
4. Tool #37: `whiteboards` (Whiteboards)

## Authoritative Reference Documents
- Authoritative User Request: `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\ORIGINAL_REQUEST.md`
- Global Project Scope: `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\orchestrator\PROJECT.md`
- Explorer Blueprints:
  1. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m6_1\handoff.md` (Audio to Text & Speech Fallback Architecture)
  2. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m6_2\handoff.md` (Documents, Meetings, Whiteboards Architecture)
  3. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m6_3\handoff.md` (UI Routing, Layout Wiring & Test Specifications)

## Exclusive Write Boundaries
- `src/AudioToText.tsx`
- `src/ToolPage.tsx`
- `src/services.ts`
- `src/App.tsx`
- `tests/m6-workspace.test.cjs`

Do NOT touch files owned by other modules without reason. Preserve all existing M1 through M5 services and tests.

## Key Invariants & Tasks
1. **Tool #18 (`audio-text`) in `src/AudioToText.tsx` & `src/services.ts`**:
   - **CRITICAL INVARIANT**: Keep `assert.match(html, /Backend not connected/)` verbatim on initial render for `tests/workspace.test.cjs:129` compliance while activating client-side speech and audio analysis fallback.
   - Client-side Web Speech API live microphone transcription (`SpeechRecognition` / `webkitSpeechRecognition`).
   - Pure in-browser audio file processing (`AudioContext` / `decodeAudioData` plus binary RIFF/WAV/MP3 header decoding fallback) computing audio duration, sample rate, channels, peak waveform, and voice activity detection (VAD).
   - Generates speech-timed transcript segments with timestamps and speaker labels.
   - Audio waveform player preview, transcript editor, "Copy Transcript" button, and "Download TXT" / "Download SRT" buttons.
2. **Tool #34 (`documents`) in `src/ToolPage.tsx`**:
   - Dedicated layout for `#documents`: local document repository syncing with `onComplete` processed files.
   - Document table/grid with file name, tool source, date, size, and category.
   - Interactive actions: "Preview / View", "Download", "Delete", "Upload New Document", search and filter pills.
3. **Tool #36 (`meetings`) in `src/ToolPage.tsx`**:
   - In-browser interactive meeting room simulator.
   - Camera toggle (`getUserMedia` with canvas/mock video stream fallback for headless/CI test environments), microphone mute toggle, screen share simulation toggle, participant list, live text chat panel, and meeting link copier.
4. **Tool #37 (`whiteboards`) in `src/ToolPage.tsx`**:
   - Interactive HTML5 canvas drawing board.
   - Tools: Freehand pen, Line, Rectangle, Circle, Eraser.
   - Color palette picker (8+ colors) and brush thickness slider.
   - Undo/Redo history stack, clear canvas, and "Export as PNG" / "Export as JPEG".
5. **Cross-Tool Wiring in `src/App.tsx`**:
   - Connect `onComplete` in `App.tsx` so completed outputs from all tools automatically register in the `documents` store.
6. **Automated Test Suite in `tests/m6-workspace.test.cjs`**:
   - Author comprehensive tests covering all 4 tools across unit behaviors, audio parsing, document store operations, meeting simulator transitions, whiteboard canvas drawing/history, and React route mounting assertions.
7. **Verification**:
   - Run `npx oxfmt --check src`
   - Run `npm run build` (must pass with 0 errors)
   - Run `node --test tests/m6-workspace.test.cjs` (must pass with 0 failures)
   - Run `npm test` (all 495 existing tests + M6 tests must pass with 0 regressions)
8. **Handoff Report**:
   - Write full handoff report in `.agents/teamwork/worker_m6_1/handoff.md` with verbatim terminal logs and signed authenticity attestation.
   - Update `.agents/teamwork/worker_m6_1/progress.md`.
   - Message parent upon completion.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
