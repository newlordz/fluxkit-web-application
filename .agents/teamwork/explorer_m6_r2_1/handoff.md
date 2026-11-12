# Handoff Report: Audio & Microphone Remediation Blueprint (M6 Iteration 2)

**Agent**: Explorer M6-R2-1 (`explorer_m6_r2_1`)  
**Role**: Audio & Microphone Remediation Explorer  
**Working Directory**: `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m6_r2_1\`  
**Recipient / Parent**: Orchestrator (`ad378d05-93af-44c8-ae5d-36eca3e4e3dc`)  
**Milestone**: Milestone 6 Iteration 2  
**Handoff Type**: Hard (Investigation complete, full 5-component report)  

---

## 1. Observation

### 1.1 Direct Source Code Observations

1. **Audio Waveform Peak Array and Divisor Mismatch (`src/AudioToText.tsx:691–695`)**:
   - File: `src/AudioToText.tsx`
   - Lines 691–695 verbatim:
     ```tsx
     {(analysis?.peaks || Array(48).fill(0.3)).map((peak, idx) => {
       const progressPct = analysis?.duration
         ? currentTime / analysis.duration
         : 0
       const isPast = idx / 48 <= progressPct
     ```
   - In `src/services.ts:8173, 8199, 8223, 8242`, `analyzeAudioFile` invokes `computeAudioPeaks(..., 64)`, consistently returning an array of 64 peak amplitudes.
   - In `src/AudioToText.tsx:161`, the fallback state also initializes 64 peaks: `peaks: Array(64).fill(0.35)`.
   - In `src/AudioToText.tsx:691–695`, the placeholder array is initialized to `Array(48)`, and the playback progress comparison hardcodes divisor `48` (`idx / 48 <= progressPct`).
   - For indices `idx = 48` through `63` (the last 16 bars), `idx / 48 >= 1.0`. Since `progressPct <= 1.0`, `isPast` evaluates to `false` at all times during audio playback. The last 16 bars never highlight.
   - For indices `idx = 0` through `47`, the bars reach 100% completion when `progressPct = 48/48 = 1.0` (or `idx/48`), but this occurs across only 75% of the visual waveform area (48/64 bins), causing visual desynchronization between audio playback and the waveform display.

2. **Dangling Microphone MediaStream and Active MediaRecorder on Unmount (`src/AudioToText.tsx:128–134, 235–270`)**:
   - File: `src/AudioToText.tsx`
   - Lines 235–239:
     ```typescript
     const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
     audioChunksRef.current = []
     const recorder = new MediaRecorder(stream)
     mediaRecorderRef.current = recorder
     ```
   - Lines 128–134 verbatim:
     ```typescript
     useEffect(() => {
       return () => {
         controller.current?.abort()
         if (timerRef.current) clearInterval(timerRef.current)
         if (audioUrl) URL.revokeObjectURL(audioUrl)
       }
     }, [audioUrl])
     ```
   - `stream` is scoped locally within `startRecording()` and is not retained in a React ref.
   - If a user starts live recording and then navigates to another route (e.g. `#documents`, `#overview`, `#meetings`), the component unmounts.
   - The unmount cleanup function does not stop `mediaRecorderRef.current`, does not stop media tracks (`stream.getTracks().forEach(t => t.stop())`), and does not clear `mediaRecorderRef.current.onstop`.
   - Consequently, the browser microphone hardware remains locked and streaming indefinitely in the background.

3. **Floating-Point Modulo Precision Loss in `formatSrtTime` (`src/services.ts:8256–8271`)**:
   - File: `src/services.ts`
   - Lines 8267–8270 verbatim:
     ```typescript
     const ms = Math.floor((safeSeconds % 1) * 1000)
       .toString()
       .padStart(3, "0")
     return `${h}:${m}:${s},${ms}`
     ```
   - In Node.js / JavaScript IEEE 754 arithmetic:
     - Input `7265.123` seconds:
     - `7265.123 % 1` evaluates to `0.12299999999959255`.
     - `(safeSeconds % 1) * 1000` evaluates to `122.99999999959255`.
     - `Math.floor(122.99999999959255)` evaluates to `122`.
     - Expected millisecond string is `"123"`, but actual output is `"122"`.
   - When computed via integer millisecond conversion:
     - `(Math.floor(safeSeconds * 1000) % 1000)`:
     - `7265.123 * 1000 = 7265123`.
     - `7265123 % 1000 = 123`.
     - `.toString().padStart(3, "0")` evaluates to `"123"`.

4. **Crucial Test File Dependency on the IEEE 754 Bug (`tests/challenger-m6-adversarial.test.cjs:286–288`)**:
   - File: `tests/challenger-m6-adversarial.test.cjs`
   - Lines 286–288 verbatim:
     ```javascript
     // Note: Due to IEEE 754 floating-point modulo in Math.floor((safeSeconds % 1) * 1000),
     // 7265.123 produces '02:01:05,122' due to (7265.123 % 1) = 0.12299999999959255
     assert.equal(formatSrtTime(7265.123), "02:01:05,122")
     ```
   - In Milestone 6 Iteration 1, `challenger_m6_1` recorded this test to assert `"02:01:05,122"` because the bug was active in `services.ts`.
   - If `src/services.ts:8267` is fixed to produce `"02:01:05,123"`, running `npm test` will fail at `tests/challenger-m6-adversarial.test.cjs:288` unless that assertion is also updated.

5. **Verbatim Invariant `/Backend not connected/` on Initial SSR Render**:
   - File: `tests/workspace.test.cjs:129`
     ```javascript
     if (route === "audio-text") assert.match(html, /Backend not connected/)
     ```
   - This invariant is checked across 6 distinct test suites:
     1. `tests/workspace.test.cjs:129`
     2. `tests/stress-m1.test.cjs:289, 436`
     3. `tests/m6-workspace.test.cjs:181`
     4. `tests/m6-challenger-stress.test.cjs:819`
     5. `tests/challenger-m6-adversarial.test.cjs:311`
     6. `tests/e2e-tools.test.cjs:195`
   - In `src/AudioToText.tsx`, this exact substring is rendered in 4 locations when `apiBaseUrl` / `capabilities` are not present:
     - Line 461: `capabilities ? "Transcription backend connected" : "Backend not connected"`
     - Line 466: `Backend not connected. Local in-browser speech engine and offline audio processor are active.`
     - Line 860: `!file && !capabilities ? "Backend not connected"`
     - Line 975: `{capabilities ? "No transcript yet" : "Backend not connected"}`

---

## 2. Logic Chain

1. **Waveform Synchronization**:
   - From Observation 1.1 item 1, `analyzeAudioFile` produces 64 bins (`peaks.length === 64`), and fallback state uses 64 bins.
   - If the JSX fallback array is changed from `Array(48)` to `Array(64)` and the progress test evaluates `idx / arr.length <= progressPct` (or `idx / (analysis?.peaks?.length || 64) <= progressPct`), then:
     - At `progressPct = 0`: 1 bar (idx 0) or 0 bars.
     - At `progressPct = 0.5`: 33 bars (idx 0..32) highlight out of 64.
     - At `progressPct = 1.0`: all 64 bars (idx 0..63) highlight, spanning the entire waveform without freezing or truncated tails.
   - This fixes Reviewer M6-2 Finding 3 and Gate 6 Item 2.

2. **Microphone Lifecycle Teardown**:
   - From Observation 1.1 item 2, `stream` is currently inaccessible outside `startRecording()`.
   - By creating `const mediaStreamRef = useRef<MediaStream | null>(null)`, referencing `stream` in `startRecording()`, and clearing it in `recorder.onstop` / `stopRecording()`:
   - On component unmount:
     ```typescript
     if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
       mediaRecorderRef.current.onstop = null
       try { mediaRecorderRef.current.stop() } catch {}
     }
     if (mediaStreamRef.current) {
       try { mediaStreamRef.current.getTracks().forEach((track) => track.stop()) } catch {}
       mediaStreamRef.current = null
     }
     ```
   - Setting `onstop = null` before stopping prevents unmounted state updates.
   - Stopping each media track turns off the browser microphone indicator immediately.
   - Under Node / SSR testing (`renderToStaticMarkup` in `workspace.test.cjs`), `navigator.mediaDevices` is undefined; refs remain null, so no unhandled exceptions occur.
   - This fixes Reviewer M6-2 Finding 4 and Gate 6 Item 3.

3. **SRT Millisecond Precision & Regression Immunity**:
   - From Observation 1.1 items 3 and 4, `formatSrtTime` line 8267 in `src/services.ts` fails on `7265.123` due to floating point modulo.
   - Replacing `Math.floor((safeSeconds % 1) * 1000)` with `(Math.floor(safeSeconds * 1000) % 1000)`:
     - `0.005` -> `5` (`"005"`)
     - `0.09` -> `90` (`"090"`)
     - `65.45` -> `450` (`"450"`)
     - `3661.125` -> `125` (`"125"`)
     - `7265.123` -> `123` (`"123"`)
   - To keep test suites green, `tests/challenger-m6-adversarial.test.cjs:288` must be updated to expect `"02:01:05,123"`.
   - This fixes Auditor M6 Finding 1 and Gate 6 Item 7.

4. **Invariant Protection**:
   - None of the proposed edits in `src/AudioToText.tsx` touch lines 452–475, 842–870, or 973–977.
   - The initial render output under `renderToStaticMarkup(React.createElement(App))` with `#audio-text` continues to render `"Backend not connected"` across status, button, and empty result areas.
   - All 6 test suites will continue to pass without regression.

---

## 3. Caveats

- **Scope Boundary**: This investigation focuses strictly on the 4 audio, microphone, and speech defects assigned to Explorer M6-R2-1. Other Milestone 6 findings (Whiteboard stroke drop on boundary exit, rapid undo/redo race condition, session documents null storage guard, and general `oxfmt` formatting of `ToolPage.tsx`) are assigned to other iteration 2 remediation roles.
- **Node Test Environment vs Real Browser Audio**: In the Node.js test environment (`workspace.test.cjs`), `navigator.mediaDevices` and Web Audio API are mocked or omitted. The cleanup logic is written defensively (`if (mediaRecorderRef.current) ...`, `if (mediaStreamRef.current) ...`) to function identically in Node tests and real browser execution.

---

## 4. Conclusion & Exact Modification Blueprints

The 4 defects are fully isolated and require minimal, surgical edits. Below are the exact code blueprints for the implementer:

### Blueprint 1: Waveform Progress Alignment (`src/AudioToText.tsx`)

**Target File**: `src/AudioToText.tsx`  
**Location**: Lines 691–695  

**Before**:
```tsx
              <div
                className="flex items-end gap-1 h-12 w-full mb-3 px-1"
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 3,
                  height: 44,
                }}
              >
                {(analysis?.peaks || Array(48).fill(0.3)).map((peak, idx) => {
                  const progressPct = analysis?.duration
                    ? currentTime / analysis.duration
                    : 0
                  const isPast = idx / 48 <= progressPct
                  return (
```

**After**:
```tsx
              <div
                className="flex items-end gap-1 h-12 w-full mb-3 px-1"
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 3,
                  height: 44,
                }}
              >
                {(analysis?.peaks || Array(64).fill(0.3)).map((peak, idx, arr) => {
                  const progressPct = analysis?.duration
                    ? currentTime / analysis.duration
                    : 0
                  const isPast = idx / arr.length <= progressPct
                  return (
```

---

### Blueprint 2: Microphone Stream Teardown & Unmount Cleanup (`src/AudioToText.tsx`)

**Target File**: `src/AudioToText.tsx`  
**Location 1**: Line 88 (State/Ref declarations)

**Before**:
```typescript
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
```

**After**:
```typescript
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
```

**Location 2**: Lines 128–134 (Unmount & URL cleanup effect)

**Before**:
```typescript
  useEffect(() => {
    return () => {
      controller.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])
```

**After**:
```typescript
  useEffect(() => {
    return () => {
      controller.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.onstop = null
        try {
          mediaRecorderRef.current.stop()
        } catch {}
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        } catch {}
        mediaStreamRef.current = null
      }
    }
  }, [audioUrl])
```

**Location 3**: Lines 235–257 (`startRecording`)

**Before**:
```typescript
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        })
```

**After**:
```typescript
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        })
```

**Location 4**: Lines 273–280 (`stopRecording`)

**Before**:
```typescript
  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }
```

**After**:
```typescript
  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setIsRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }
```

---

### Blueprint 3: SRT Millisecond Precision Fix (`src/services.ts`) & Test Update

**Target File**: `src/services.ts`  
**Location**: Line 8267  

**Before**:
```typescript
  const ms = Math.floor((safeSeconds % 1) * 1000)
    .toString()
    .padStart(3, "0")
```

**After**:
```typescript
  const ms = (Math.floor(safeSeconds * 1000) % 1000)
    .toString()
    .padStart(3, "0")
```

**Target Test File**: `tests/challenger-m6-adversarial.test.cjs`  
**Location**: Line 286–288  

**Before**:
```javascript
  // Note: Due to IEEE 754 floating-point modulo in Math.floor((safeSeconds % 1) * 1000),
  // 7265.123 produces '02:01:05,122' due to (7265.123 % 1) = 0.12299999999959255
  assert.equal(formatSrtTime(7265.123), "02:01:05,122")
```

**After**:
```javascript
  // Verified integer millisecond conversion Math.floor(safeSeconds * 1000) % 1000 resolves IEEE 754 rounding
  assert.equal(formatSrtTime(7265.123), "02:01:05,123")
```

---

### Blueprint 4: Preservation of Verbatim Invariant `/Backend not connected/`

**Target File**: `src/AudioToText.tsx`  
**Locations**:
- Line 461: `capabilities ? "Transcription backend connected" : "Backend not connected"`
- Line 466: `"Backend not connected. Local in-browser speech engine and offline audio processor are active."`
- Line 860: `!file && !capabilities ? "Backend not connected"`
- Line 975: `{capabilities ? "No transcript yet" : "Backend not connected"}`

**Directive**: Do **NOT** modify or remove these lines or change initial state defaults. This guarantees that `tests/workspace.test.cjs:129` and all other suites evaluating `/Backend not connected/` pass with zero regressions.

---

## 5. Verification Method

Once the implementer applies the blueprints:

1. **Verify Formatting**:
   ```powershell
   npx oxfmt src
   npx oxfmt --check src
   ```
   *Expected Result*: Exit code 0, all files formatted.

2. **Verify Milestone 6 Test Suite**:
   ```powershell
   node --test tests/m6-workspace.test.cjs
   ```
   *Expected Result*: 18/18 tests pass.

3. **Verify Adversarial Test Suite**:
   ```powershell
   node --test tests/challenger-m6-adversarial.test.cjs
   ```
   *Expected Result*: All tests pass, including `formatSrtTime(7265.123) === "02:01:05,123"`.

4. **Verify Route SSR Invariant Test**:
   ```powershell
   node --test tests/workspace.test.cjs
   ```
   *Expected Result*: Passes, specifically matching `/Backend not connected/` on line 129.

5. **Verify Full Regression Suite**:
   ```powershell
   npm test
   ```
   *Expected Result*: All 555+ tests pass with 0 failures, 0 regressions.

6. **Verify Production Build**:
   ```powershell
   npm run build
   ```
   *Expected Result*: Clean build with 0 TypeScript compilation or bundling errors.
