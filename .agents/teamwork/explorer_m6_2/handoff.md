# Architectural Blueprint & Handoff Report: Collaboration Workspace Tools (Milestone 6)

**Agent**: Explorer M6-2 (Collaboration Workspace Explorer M6)  
**Target Milestone**: M6 (Audio Transcription & Collaboration Workspace)  
**Tools in Scope**:
1. Tool #34: `documents` (My Documents repository)
2. Tool #36: `meetings` (Video Meetings simulator)
3. Tool #37: `whiteboards` (Whiteboards canvas)

---

## 1. Observation

### 1.1 Baseline System State & Current Test Metrics
- **Build & Test Status**: Executed `npm test` against `tests/*.test.cjs`.
- **Pass Rate**: 495 tests passing, 0 failing, 0 skipped (`duration_ms: ~26675ms`).
- **Tool Catalog Status**: In `src/config.ts`, all 37 tools are registered with `available: true`. Tools #34, #36, and #37 are defined under the `"Workspace"` category:
  - `documents` (Tool #34, `FileArchive` icon, lines 494–502)
  - `meetings` (Tool #36, `Video` icon, lines 514–522)
  - `whiteboards` (Tool #37, `WandSparkles` icon, lines 524–532)

### 1.2 Direct Codebase Observations by Tool

#### Tool #34: `documents` (My Documents repository)
- **Routing & Mount**: In `src/App.tsx`, sidebar links `{ id: "documents", name: "My documents", icon: FileText }` (line 402) route to hash `#documents`. When navigated, `selected.available` is `true`, mounting `<ToolPage key={page} tool={selected} ... />` (lines 838–853).
- **Current State in `src/ToolPage.tsx`**:
  - Lines 496–509:
    ```tsx
    const [sessionDocs, setSessionDocs] = useState<Array<{
      name: string
      size: string
      time: string
      blob?: Blob
    }>>(() => {
      try {
        const stored = sessionStorage.getItem("fluxkit-session-docs")
        return stored ? JSON.parse(stored) : []
      } catch {
        return []
      }
    })
    ```
  - Lines 1233–1256: On form submit, newly dropped files are appended to `sessionDocs` and saved via `sessionStorage.setItem("fluxkit-session-docs", JSON.stringify(updated))`.
  - Lines 4342–4361: In the right-hand result panel, if `sessionDocs.length > 0`, it renders a bare list of filenames and sizes inside `.file-row`.
- **Critical Deficiencies Identified**:
  1. **No Dedicated Workspace Layout**: In `ToolPage.tsx`, `#documents` falls through to the generic converter layout (lines 1624–4376), presenting a file dropzone titled "Configure Workspace Tool" and a confusing "Upload / Process" button.
  2. **Blob Serialization Failure**: `JSON.stringify` does not serialize `Blob` objects. When reloaded from `sessionStorage`, `doc.blob` becomes undefined, breaking subsequent downloads.
  3. **Missing View Modes**: No Table View vs. Grid View switching.
  4. **Missing Metadata**: Missing category badges (PDF, Spreadsheet, Image, etc.), tool source provenance (e.g. "Direct Upload", "Merge PDF", "Convert", "PDF to Word"), and full timestamps.
  5. **Missing Interactive Actions**: No "Preview / View" modal/drawer, no "Download File" button per document, no "Copy Link / Details" clipboard action, and no "Delete Document" removal action.
  6. **Missing Filtering & Search**: No category filter dropdown, no tool source filter, and no real-time search input.
  7. **Empty State Experience**: If no files have been uploaded, the page renders an empty placeholder ("A little input. A great result.") with no pre-seeded default sample documents.

#### Tool #36: `meetings` (Video Meetings simulator)
- **Current State in `src/ToolPage.tsx`**:
  - Lines 490–494 & 511–518: Simple states for `inMeeting`, `micMuted`, `cameraOff`, and `meetingTimer`.
  - Lines 1278–1451: Special workspace branch:
    - Renders a static dark box (`#080c14`, height `240px`) with a static `Video` or `CameraOff` icon.
    - Two toggle buttons: "Mute Mic" and "Turn Off Camera".
    - Meeting Room Key input field (`value || "fluxkit-room-844"`).
    - "Start Meeting" / "Leave Meeting" primary button.
    - Right-hand result panel displays static text: Room, Status ("Active Call" / "Idle"), Encryption ("Peer-to-Peer Browser Tunnel"), Participants ("1 member (You)" / "0"), and "Copy Invite Link".
- **Critical Deficiencies Identified**:
  1. **No Live Video Element or Stream**: No `<video>` element and no call to `navigator.mediaDevices.getUserMedia`.
  2. **No Screen Share Simulation**: Missing a screen share toggle and visual presentation feed.
  3. **No Participants Sidebar List**: Missing interactive participant roster with status badges (Host, Camera status, Mic status, Presenting).
  4. **No Live Text Chat**: Missing chat panel with message log, text input, Send button, and simulated collaborative peer replies.
  5. **Headless / Node SSR Fragility**: In Node test runners or headless CI environments, `navigator.mediaDevices` is undefined or rejects. A direct un-guarded call would crash tests unless equipped with a defensive Animated Canvas Mock Video fallback.

#### Tool #37: `whiteboards` (Whiteboards canvas)
- **Current State in `src/ToolPage.tsx`**:
  - Lines 520–529: Minimal canvas context setup.
  - Lines 1452–1620: Special workspace branch:
    - Palette: Only 5 hardcoded colors (`#4f46e5`, `#059669`, `#dc2626`, `#d97706`, `#0f172a`). Requirement mandates 8+ colors.
    - Tools: Only `"pen"` and `"eraser"`. Requirement mandates Pen, Eraser, Line, Rectangle, Circle, and Text tool.
    - Brush Size: Simple select dropdown with only 3 options (2px, 5px, 12px). Requirement mandates a slider / granular thickness selector.
    - Undo / Redo: **Zero history stack**. No undo or redo functionality exists.
    - Export Actions: Only "Export PNG" and "Clear Canvas". Requirement mandates "Export as PNG", "Export as JPEG", and "Clear Board".
    - Event Handling: Only basic freehand pointer listeners; no live shape drag preview, no coordinate normalization for scaled displays, and no text placement.

---

## 2. Logic Chain

From the observations and project requirements, we deduce the following architectural blueprints for each tool.

```
                    ┌──────────────────────────────────────────────┐
                    │            Workspace Router (M6)             │
                    └──────┬───────────────┬───────────────┬───────┘
                           │               │               │
                           ▼               ▼               ▼
                 ┌──────────────────┐ ┌──────────┐ ┌──────────────┐
                 │ Tool #34         │ │ Tool #36 │ │ Tool #37     │
                 │ Documents Repo   │ │ Meetings │ │ Whiteboards  │
                 └──────────────────┘ └──────────┘ └──────────────┘
```

---

### 2.1 Tool #34: `documents` (My Documents Repository) Architecture

#### 2.1.1 Data Model & State Schema
```ts
export interface DocumentItem {
  id: string;                      // Unique ID: `doc-${Date.now()}-${random}`
  name: string;                    // e.g., "Project_Specification.pdf"
  size: number;                    // Size in bytes: e.g., 251658
  formattedSize: string;           // Formatted: e.g., "245.8 KB"
  type: string;                    // MIME type: e.g., "application/pdf"
  category: "PDF" | "Document" | "Spreadsheet" | "Presentation" | "Image" | "Archive" | "Text" | "Other";
  toolSource: string;              // e.g., "Direct Upload", "Merge PDF", "Convert", "PDF to Word", "Whiteboards"
  dateAdded: string;               // ISO 8601: e.g., "2026-11-11T02:00:00.000Z"
  formattedDate: string;           // Readable: e.g., "Nov 11, 2026"
  contentSnippet?: string;         // First 300 characters for preview
  blob?: Blob;                     // Transient in-memory Blob reference
}
```

#### 2.1.2 Pre-seeded Sample Documents (Instant Interactivity)
To ensure immediate usability upon first navigation, initialize the store with 4 representative documents if local storage is empty:
1. **`FluxKit_Quickstart_Guide.pdf`** (Category: "PDF", Source: "Workspace Guide", Size: 245.8 KB)
2. **`Quarterly_Financial_Summary.xlsx`** (Category: "Spreadsheet", Source: "Excel to PDF", Size: 84.2 KB)
3. **`Architecture_Design_Notes.docx`** (Category: "Document", Source: "PDF to Word", Size: 112.5 KB)
4. **`System_Architecture_Diagram.png`** (Category: "Image", Source: "Whiteboards", Size: 320.0 KB)

#### 2.1.3 Storage & Blob Management Strategy
- **Key**: `"fluxkit_workspace_documents"`
- **Persistence**: Save serializable metadata (`id`, `name`, `size`, `formattedSize`, `type`, `category`, `toolSource`, `dateAdded`, `formattedDate`, `contentSnippet`) into `localStorage` with a fallback to `sessionStorage` or in-memory state.
- **In-Memory Blob Cache**: Maintain a module-level or component-level `Map<string, Blob>` for uploaded and generated files so that direct byte-level download works seamlessly during the session without hitting `localStorage` 5MB quota constraints.
- **Automatic Ingestion from other Tools**: When any tool calls `onComplete(toolName, description, fileBlob)` or generates output, a document record is automatically appended to the library store.

#### 2.1.4 Interactive Features & UI Components
- **Toolbar**:
  - **Search Bar**: Real-time filtering by document name or tool source.
  - **Category Filter**: Dropdown with options: `"All Categories"`, `"PDF"`, `"Document"`, `"Spreadsheet"`, `"Presentation"`, `"Image"`, `"Archive"`, `"Text"`.
  - **Tool Source Filter**: Dropdown with options: `"All Tools"`, `"Direct Upload"`, `"Merge PDF"`, `"Convert"`, `"PDF to Word"`, `"Whiteboards"`, etc.
  - **View Mode Switcher**: Toggle between **Table View** (tabular rows with sortable headers) and **Grid View** (responsive card tiles).
  - **Direct Upload Button**: `<label>` wrapping `<input type="file" multiple />` allowing instant addition of any file into the repository with automated MIME/category detection.
- **Document Actions**:
  1. **Preview / View Modal**:
     - Displays document metadata (name, MIME badge, size, checksum simulation, date added, source tool).
     - Text/Snippet preview pane for text, CSV, and markdown files, or structured file card for binary documents.
     - "Download" and "Copy Link" buttons directly inside modal.
  2. **Download File**:
     - Uses `URL.createObjectURL(blob)` or generates a synthetic data file for sample items.
  3. **Copy Link / Details**:
     - Copies formatted summary: `Document: ${name} | Size: ${size} | Source: ${toolSource} | Added: ${dateAdded}`.
     - Displays confirmation toast notification.
  4. **Delete Document**:
     - Deletes the item from `sessionDocs` and updates `localStorage`.
  5. **Clear / Reset Library**:
     - Button to reset library back to standard sample items or clear all.

---

### 2.2 Tool #36: `meetings` (Video Meetings Simulator) Architecture

#### 2.2.1 Dual-State Meeting Lifecycle
1. **Lobby / Setup State**:
   - Camera & Microphone pre-call preview.
   - Room Key configuration (default: `"fluxkit-room-844"`).
   - Display Name configuration (default: user profile name or `"Jamie"`).
   - "Join Call" / "Start Meeting" primary trigger.
2. **Active Call State**:
   - Live video viewport (4:3 / 16:9 aspect ratio) with participant name tag and HD status indicator.
   - Call duration timer (`mm:ss`) with live recording/streaming pulse badge.
   - Comprehensive media control bar.
   - Collapsible tabbed sidebar: **Participants Roster** & **Live Text Chat**.

#### 2.2.2 MediaStream & Headless CI Fallback Engine
```
                                 ┌──────────────────────────────┐
                                 │ Turn on Camera / Join Room   │
                                 └──────────────┬───────────────┘
                                                │
                          Is navigator.mediaDevices available?
                                    │               │
                                   YES              NO
                                    ▼               ▼
                        getUserMedia({video, audio})  Canvas Mock Stream
                                    │               ▲
                        ┌───────────┴──────────┐    │
                     SUCCESS                 ERROR ─┘
                        │
                        ▼
               Attach to <video />
```
- **Defensive API Guard**:
  ```ts
  const hasMediaDevices = typeof navigator !== "undefined" && 
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
  ```
- **Automated Synthetic Video Stream Fallback**:
  - When running in Node tests, headless CI, or when the user has no physical camera or denies permission:
  - Generate an animated canvas stream or render an animated virtual studio directly in the video container:
    - Dark tech background with animated ambient radial gradient.
    - Centered host avatar initials with pulsating concentric rings.
    - Dynamic audio visualizer bars when microphone is unmuted.
    - Overlay text: `"FluxKit Virtual HD Camera · 1080p 30fps"`.
    - Real-time timestamp clock updating every second.
  - This ensures 0 runtime errors in automated tests while delivering a polished, high-end presentation in browser.

#### 2.2.3 Audio Equalizer & Mute Controls
- `micMuted`: boolean toggle.
- When unmuted: renders an animated 4-bar equalizer with keyframe oscillation indicating active voice transmission.
- When muted: renders red `MicOff` icon with `"Muted"` badge.

#### 2.2.4 Screen Share Simulation
- `isSharingScreen`: boolean state.
- When toggled on:
  - Primary viewport switches from camera feed to a simulated high-contrast desktop view ("FluxKit Workspace Canvas - Shared Tab").
  - Displays floating action pill: `"You are sharing your screen — [Stop Sharing]"`.
  - Host badge in sidebar updates to `(Presenting)`.

#### 2.2.5 Interactive Sidebar: Participants & Live Chat
- **Tab 1: Participants List**:
  - **You (Host)**: Displays dynamic badges for Camera (On/Off), Mic (Active/Muted), and Screen Share.
  - **Simulated Collaborative Peers**:
    - *Sarah Chen (Design Lead)*: Active, Camera On, Mic Unmuted.
    - *Marcus Vance (Engineer)*: Active, Camera Off, Mic Muted.
    - *Elena Rostova (Product Manager)*: Active, Camera On, Mic Unmuted.
  - Total participant counter (e.g., `"4 in room"`).
- **Tab 2: Live Text Chat**:
  - Pre-seeded conversation history:
    - *Marcus*: "Hey team! Ready to review the document conversions."
    - *Sarah*: "Whiteboard canvas looks great. Sharing the export link now."
  - Interactive message composer: text input + "Send" button + Enter key submission.
  - User messages appear instantly with timestamp.
  - Automated interactive response: Sending a message triggers an automated collaborative reply from Elena or Marcus after 1.2s: "Got it! Looking at it now."
- **Meeting Invite Copier**:
  - "Copy Invite Link" copies `https://fluxkit.app/#meetings?room=${roomKey}` and displays success notification.

---

### 2.3 Tool #37: `whiteboards` (Whiteboards Canvas) Architecture

#### 2.3.1 High-DPI Canvas & Coordinate Normalization
- **Coordinate Scaling**: Pointer events calculate coordinates using the ratio of native canvas dimensions (`1200 x 700`) to bounding client rect:
  ```ts
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  ```
- **Styling**: `touch-action: none; cursor: crosshair; background: #ffffff;` with high-resolution internal buffer.

#### 2.3.2 Complete Toolset
1. **`pen` (Freehand Brush)**: Continuous smooth stroke with round caps and joins.
2. **`eraser`**: Clears pixels using `#ffffff` stroke with expanded width.
3. **`line`**: Straight line with live drag preview.
4. **`rectangle`**: Bounding rectangle with live drag preview; supports outline or filled mode.
5. **`circle`**: Circle/ellipse calculated via `Math.hypot(currX - startX, currY - startY)` with live drag preview; supports outline or filled mode.
6. **`text`**: Click-to-place text annotation tool opening an input modal or prompt, stamped with active font size and color.

#### 2.3.3 Color Palette (10 Colors) & Brush Thickness
- **10 Curated Colors**:
  1. `#0f172a` (Slate Black - Default)
  2. `#4f46e5` (Indigo)
  3. `#059669` (Emerald Green)
  4. `#dc2626` (Ruby Red)
  5. `#d97706` (Amber Orange)
  6. `#0284c7` (Sky Blue)
  7. `#9333ea` (Purple)
  8. `#ec4899` (Hot Pink)
  9. `#64748b` (Cool Slate)
  10. `#ffffff` (White / Eraser)
- **Brush Thickness**:
  - Slider ranging from 1px to 32px with numeric display and visual diameter preview circle.
  - Quick preset buttons: `Fine (2px)`, `Medium (5px)`, `Bold (12px)`, `Marker (24px)`.

#### 2.3.4 Undo and Redo History Stack Engine
- **Stack Schema**:
  - `history: string[]` (Array of PNG Data URLs, capped at 30 states to conserve memory).
  - `historyIndex: number` (Pointer to current position in stack).
- **Commit Flow**:
  - On mount: fill canvas with white `#ffffff` and push initial state to `history[0]`, `historyIndex = 0`.
  - On completing any stroke, shape, text placement, or board clear:
    1. If `historyIndex < history.length - 1`, truncate future redo states (`history.slice(0, historyIndex + 1)`).
    2. Capture current state via `canvas.toDataURL("image/png")`.
    3. Push new state. If stack exceeds 30, shift earliest.
    4. Set `historyIndex = history.length - 1`.
- **Undo Operation**:
  - Guard: `historyIndex > 0`.
  - Decrement `historyIndex`.
  - Draw `history[historyIndex]` image onto the canvas context.
- **Redo Operation**:
  - Guard: `historyIndex < history.length - 1`.
  - Increment `historyIndex`.
  - Draw `history[historyIndex]` image onto the canvas context.
- **Keyboard Shortcuts**:
  - `Ctrl+Z` / `Cmd+Z` -> Undo
  - `Ctrl+Y` / `Cmd+Shift+Z` / `Cmd+Y` -> Redo

#### 2.3.5 Shape Live Preview Engine
- On `pointerDown`:
  - Record `startPos = { x, y }`.
  - Capture current canvas bitmap: `snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)`.
- On `pointerMove`:
  - If `isDrawing` and active tool is `line`, `rectangle`, or `circle`:
    - Restore saved snapshot: `ctx.putImageData(snapshot, 0, 0)`.
    - Draw transient shape from `startPos` to `currentPos`.
- On `pointerUp`:
  - Finalize shape onto canvas, reset snapshot, and push to Undo stack.

#### 2.3.6 Export Actions
1. **Export as PNG**:
   - Calls `canvas.toDataURL("image/png")`.
   - Triggers download of `fluxkit-whiteboard-${Date.now()}.png`.
   - Invokes `onComplete("Whiteboards")`.
2. **Export as JPEG**:
   - Creates a temporary background canvas filled with `#ffffff`, composites current whiteboard, and exports via `canvas.toDataURL("image/jpeg", 0.95)`.
   - Triggers download of `fluxkit-whiteboard-${Date.now()}.jpg`.
   - Invokes `onComplete("Whiteboards")`.
3. **Clear Board**:
   - Clears canvas and refills with `#ffffff`.
   - Pushes clear state to Undo stack.
   - Shows notification "Whiteboard canvas cleared."

---

## 3. Caveats

1. **Headless & Node.js Test Environment Constraints**:
   - In Node test environments (`node --test tests/*.test.cjs`), `navigator` is not natively defined in the VM context unless provided. Direct access to `navigator.mediaDevices` or `navigator.clipboard` without `typeof` guards will cause fatal unhandled exceptions (`ReferenceError: navigator is not defined`).
   - All browser APIs (`window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `HTMLCanvasElement`) must be defensively guarded with `typeof ... !== "undefined"`.
2. **Canvas Rendering in SSR / Static Markup**:
   - `renderToStaticMarkup` in Node renders `<canvas>` tags as static HTML elements without executing `canvas.getContext("2d")`. Interactive drawing logic runs inside `useEffect` and pointer handlers on the client side.
3. **Storage Quota (5MB LocalStorage Cap)**:
   - Storing large binary file contents in `localStorage` can throw `QuotaExceededError`. The design intentionally stores only metadata and lightweight text snippets in `localStorage`, maintaining active `Blob` references in an in-memory session map.
4. **Microphone & Camera Permissions in Production**:
   - Browsers require secure context (`https://` or `localhost`) for `getUserMedia`. In non-secure contexts or when blocked by browser permissions policy, the automated Virtual HD Camera fallback seamlessly guarantees flawless interactive presentation.

---

## 4. Conclusion

The architectural investigation reveals that Tools #34, #36, and #37 currently have rudimentary placeholders in `src/ToolPage.tsx` that lack the rich interactive depth required for the Milestone 6 Collaboration Workspace.

By implementing:
1. **Tool #34 (`documents`)**: A full-featured Document Repository with pre-seeded samples, searchable Table & Grid views, MIME category badges, preview modal, direct upload, download, and deletion.
2. **Tool #36 (`meetings`)**: An in-browser Meeting Room Simulator with resilient `getUserMedia` detection + animated Canvas mock video fallback, microphone equalizer, screen share toggle, participant roster with status badges, and live interactive text chat.
3. **Tool #37 (`whiteboards`)**: An HTML5 Canvas drawing suite with 10-color palette, brush thickness slider, 6 drawing tools (Pen, Eraser, Line, Rect, Circle, Text), 30-step Undo/Redo history stack, and PNG/JPEG/Clear export actions.

FluxKit will deliver an agency-grade, 100% client-side collaboration workspace that strictly passes all existing 495 tests while providing robust foundation for Milestone 6 verification.

---

## 5. Verification Method

To independently verify the implementation when built:

### 5.1 Automated Command Verification
1. **Build Verification**:
   ```powershell
   npm run build
   ```
   Must compile with 0 TypeScript compilation errors and 0 Vite bundle warnings.
2. **Format Verification**:
   ```powershell
   npm run format
   ```
   Must pass formatting with oxfmt without syntax violations.
3. **Regression Test Verification**:
   ```powershell
   npm test
   ```
   All 495 existing tests must continue to pass without a single regression.

### 5.2 Milestone 6 Dedicated Test Suite Architecture (`tests/m6-workspace.test.cjs`)
A comprehensive Node test suite should be created to verify:
- **Suite 1: Tool #34 (`documents`) Tests**:
  - Renders document repository with search bar, category filter, tool source filter, and view toggles.
  - Initializes with pre-seeded sample documents when storage is empty.
  - Adding a file via file input appends new item with calculated size, category, and date.
  - Switching between Table View and Grid View toggles appropriate DOM structures.
  - Filtering by category (e.g. "PDF", "Spreadsheet") correctly filters items.
  - Delete document removes item from state and updates storage.
- **Suite 2: Tool #36 (`meetings`) Tests**:
  - Renders meeting room simulator with camera preview, mic toggle, and room key input.
  - Toggling microphone switches state and reflects active audio equalizer indicator.
  - Toggling camera switches between active camera preview and disabled state without throwing.
  - Toggling screen share switches primary viewport to shared screen simulation.
  - Live chat panel accepts text message, appends to message log, and triggers automated peer response.
  - Participant roster displays You (Host) and peer participants with status badges.
- **Suite 3: Tool #37 (`whiteboards`) Tests**:
  - Renders canvas element with 10-color palette, tool selector, and brush size controls.
  - Switching tools (`pen`, `eraser`, `line`, `rectangle`, `circle`, `text`) updates active tool state.
  - Undo and Redo buttons are disabled on initial blank canvas and enable after drawing actions.
  - Export PNG and Export JPEG buttons trigger download and call `onComplete("Whiteboards")`.
  - Clear board resets canvas and records undo state.

### 5.3 Invalidation Conditions
- Any unhandled runtime exception when `navigator.mediaDevices` or `navigator.clipboard` is unavailable.
- Failure of any existing test in `tests/e2e-tools.test.cjs` or `tests/workspace.test.cjs`.
- Data loss or `QuotaExceededError` in document storage.
