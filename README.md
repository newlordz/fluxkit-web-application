# FluxKit

A responsive React 19 + Vite 8 + TypeScript workspace, styled with Tailwind CSS v4 and local design tokens.

## Run

Install with `pnpm install`, then run `pnpm dev` outside Figma Make. Inside Make the preview server is already supervised and hot-reloads changes.

## Working features

- Dashboard, searchable/filterable 25-tool catalog, hash-based navigation, mobile navigation, account menu and settings.
- Dedicated Audio tools category and navigation. The Audio to Text page remains explicitly backend-dependent.
- Premium sign-in, sign-up and reset-password forms at `#sign-in`, `#sign-up`, and `#reset-password`, available from the account menu. These are **frontend-only**: no credentials are sent or saved, and submitting reports that authentication is not connected.
- Dismissible screen-reader-friendly toast feedback, a skip-to-content link, a real not-found view for unknown hashes, and a render-error recovery page.
- Real PNG QR generation for URLs, text, WhatsApp, WPA/WPA2 Wi-Fi and email using `qrcode`.
- Real browser-side PDF merging with `pdf-lib`: drag/drop, PDF type and 25 MB per-file validation, ordering, removal, and download. Damaged/encrypted files report errors.
- Text-to-PDF with title, word wrapping, multiple pages and download. Standard Helvetica supports Latin text; unsupported glyphs report an error rather than producing a misleading success.
- Real session activity; empty until a tool succeeds. Session activity is in memory only.
- Theme, first name and sidebar preference stored locally. File contents and QR values are not persisted. No authentication is connected; the account is a local profile.
- Audio to Text upload interface: single-file selection/drop, size/type validation, remove/replace confirmation, capability-driven language/options, job status, real upload progress, retry, editable transcript, copy and TXT download. **Transcription requires a backend**; the default state does not upload or fabricate a transcript.

All remaining file, AI, document-storage and collaboration tools are explicitly marked **Coming soon**. No remote processing or storage is simulated.

## Structure

- `src/config.ts`: brand identity and typed catalog, categories, icons, route IDs and availability.
- Primary theme accents, page backgrounds, surfaces, and foreground colors are configured by `brand.colors` in `src/config.ts` and applied when themes change. Theme CSS contains complementary decorative shades; keep these coordinated when making a wholesale palette change.
- `src/index.css`: global theme tokens, appearance, responsive layouts and reduced-motion rules. Change `--accent`, `--color-brand` and related decorative accent values here for visual rebranding.
- `src/light-theme.css`: scoped light-mode palette and component colors, including hero artwork, navigation, category accents, forms and status feedback. The light-mode MVP uses a pale lavender hero rather than retaining a dark island; QR output stays dark-on-white for scanning. Dark mode, layouts and processing behavior are unchanged.
- `src/App.tsx`: application shell, dashboard, catalog, preferences and session activity.
- `src/ToolPage.tsx`: consistent tool form, PDF upload/list, validation, job feedback and result UI.
- `src/services.ts`: actual local processing, download helpers and typed remote-processing boundaries.
- `src/jobTypes.ts`: shared processing/transcription job, options, capabilities and result models.
- `src/AudioToText.tsx`, `src/audio.css`: audio input, connection state, job feedback and transcript editor in both themes.
- `src/transcriptionService.ts`: provider-neutral capability lookup, multipart upload and job-status polling.
- `src/AuthPage.tsx`, `src/auth.css`: responsive branded authentication layout, reusable labeled fields/password controls, validation, disabled/loading/error/success feedback.
- `src/authService.ts`: typed authentication adapter boundary; no provider is configured.
- `src/Notifications.tsx`, `src/ErrorBoundary.tsx`: transient notifications and render-failure recovery.

Lucide provides consistent icons; `qrcode` produces scannable codes; `pdf-lib` provides real PDF output without file uploads. DM Sans and Manrope are loaded from Google Fonts with system fallbacks.

## Checks

- Type-check: `pnpm exec tsc --noEmit`
- Regression tests: `pnpm test` (Node built-in test runner; typed source compiled in memory with existing TypeScript).
- Production build: `pnpm build`
- Format check: `pnpm exec oxfmt --check src README.md`
- Format: `pnpm format`

No lint framework is installed. `tests/workspace.test.cjs` checks the disconnected authentication boundary, catalog uniqueness/audio classification, and server-rendering smoke checks for 18 workspace/auth/unknown routes. These do not replace browser interaction, responsive visual, or real-provider integration tests. Do not interpret the build as an automated interaction test.

## Authentication integration (not connected)

The authentication forms are reachable without leaving the workspace and never create fake client sessions. Sign-up validates a name, email, 12-character minimum password and matching confirmation; sign-in/reset validate the corresponding fields. Password visibility controls and browser autocomplete work. Buttons are disabled until required input exists and while submitting. Reset requests never claim an email was sent without an adapter response. Guest access to local tools remains available.

Implement `AuthAdapter` in `src/authService.ts` against a real **server-side** auth provider, then replace the null adapter. A public API URL may be read from the existing `VITE_API_BASE_URL` if appropriate, but no environment variable alone enables authentication. Provider secrets, password handling, secure HttpOnly cookie sessions, CSRF protection, rate limiting, email verification, reset tokens, session expiry and authorization must be implemented by that backend. Add real session querying, signed-in navigation and route protection only after this integration exists. None is implemented or claimed today.

No OAuth buttons, remember-me behavior, fabricated legal/policy links, billing or fake consent records are added. The workspace name is only a local display preference, not an authenticated identity. My Documents remains a clearly labeled Coming soon page until real persistence and authorization exist. PDF file removal and activity clearing require browser-native confirmation. Audio cancellation stops the client request/status monitoring and explicitly does not claim remote job cancellation/deletion. Feedback delivery is not connected and the feedback button says so.

## Future service integration

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` when adding a backend. This is a public service URL, not a secret. The service layer defines metadata, job options, results and `idle`, `uploading`, `queued`, `processing`, `completed`, `failed` job states.

Real compression, format conversion, OCR, protected-PDF workflows, and AI tools require backend adapters. Implement authenticated upload/job/result endpoints, actual progress polling, retention/deletion policies, MIME/content checks, file size limits, rate limits and isolated processing workers. Provider credentials belong exclusively on that server. AI tools require a server-side model-provider integration; documents require authenticated object storage and a database; meetings and whiteboards require real-time collaboration infrastructure. Do not enable catalog availability until the corresponding implementation exists.

Local tools process selected content on the current device but impose no aggregate memory limit yet. Keep PDFs modest in size. Production hardening should add memory-budget checks, worker offloading, automated browser tests, monitoring, and font self-hosting if required.

## Audio to Text backend contract

The frontend is complete as an integration surface, **not a connected transcription service**. No provider SDK, secret, authentication, storage, or backend is added. Set the public `VITE_API_BASE_URL` (e.g. your own `/api` proxy) and implement the endpoints below in your backend. Changing the provider should only require changing its server-side adapter.

### Capabilities (required before uploading)

`GET {VITE_API_BASE_URL}/transcription/capabilities` must return the following shape, populated from the actual provider configuration. This is a contract example, **not a list of formats or languages currently supported by FluxKit**:

```json
{
  "formats": [{ "extension": ".wav", "mimeTypes": ["audio/wav", "audio/x-wav"] }],
  "maxFileBytes": 26214400,
  "maxDurationSeconds": 3600,
  "languages": [{ "code": "en", "name": "English" }],
  "autoDetect": false,
  "speakerLabels": false,
  "timestamps": false,
  "retention": "Replace with your actual, enforced upload/result retention policy.",
  "usageLimits": "Replace with actual quotas, billing conditions, and rate limits."
}
```

Formats, languages, byte limits, optional duration limits (`null` if none), capability flags, retention and usage-limit descriptions are runtime-validated. Auto-detect is shown only when `autoDetect` is true. Optional settings are hidden unless explicitly supported. An empty MIME list delegates type checking to extension locally; the server must always inspect actual content. No format, duration, language, retention or usage guarantees are claimed before this response succeeds.

Without a backend, the picker accepts browser-recognized `audio/*` for **local selection only**, with a conservative 25 MB preview limit, rejects zero-byte/non-audio/oversized files, and disables transcription. No mock transcript, upload progress or success event is generated.

### Upload and job lifecycle

- `POST …/transcription/jobs`: multipart `file` plus JSON-string `options` with `language` (provider code or `"auto"`), `speakerLabels`, and `timestamps`. Return a `TranscriptionJob` with a nonempty `id` and status `queued`, `processing`, `completed`, or `failed`. Upload bytes use real XMLHttpRequest progress, never a timer.
- `GET …/transcription/jobs/:id`: return that job, polled every two seconds. Processing is labeled “Transcribing” in the interface. Status monitoring stops after 15 minutes; retry checks a known job without uploading again. Upload timeout is two minutes. Capability lookup timeout is 15 seconds.
- On completion, return `result: { "text": "actual transcript", "language": "en" }`. Optional typed `segments` contain `text`, `startSeconds`, `endSeconds`, and optional `speaker`. The editor currently uses `result.text`; if requested, the adapter should render timestamps/speaker labels into that text. A missing/blank transcript is an error, never success.
- On failure, return `status: "failed"` and a human-readable, non-sensitive `error`. An actual failed job may be retried as a new upload; transient status-check failures preserve its ID. HTTP 413, 415 and 429 have useful client messages.
- To avoid duplicate provider charges after ambiguous network failures, the production backend should implement upload idempotency. The current client cannot recover a job ID if the initial upload response is lost.

### Privacy, persistence and deployment responsibilities

Selected audio, transcript edits and job IDs stay in component memory only, never local storage. Only pressing **Transcribe audio** sends content to the configured backend. Copy/download act on the edited text. Save to My Documents is intentionally absent because persistence is not implemented. Leaving the page aborts the client upload/polling but **does not guarantee remote cancellation or deletion**; removing a local selection does not delete a backend job.

The backend must keep provider credentials server-side, validate decoded audio and duration (including silent/no-speech recordings), enforce file limits and quotas, authorize job access, and configure private temporary storage with an enforced cleanup schedule. Return its actual retention/usage policy in capabilities; the frontend cannot enforce remote deletion. Use a same-origin authenticated proxy in production (requests use same-origin credentials); a separate service needs correctly scoped CORS and server-side authorization. Never put provider keys in `VITE_*`.
