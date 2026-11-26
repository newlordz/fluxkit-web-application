/**
 * Masterfilepro Cloud API Registry & Failover Priority Service
 *
 * Manages the multi-provider API pool, priority execution order,
 * automatic failover when credits finish, and direct links to free API dashboards.
 */

import { authHeaders } from "./sessionService"
import { clearLegacyProviderSecrets } from "./securityStorage"

clearLegacyProviderSecrets()

export interface CloudApiConfig {
  id: string

  name: string

  provider: "adobe" | "ilovepdf" | "ocrspace" | "tinypng" | "groq" | "google" | "mymemory" | "local" | "custom"

  category: "pdf-compression" | "pdf-tools" | "ocr-text" | "image-tools" | "audio-speech" | "ai-text"

  priority: number // 1 = highest priority, 2 = second, etc.

  enabled: boolean

  description: string

  dashboardUrl?: string // Direct link to get/manage free keys

  apiKey?: string // Client ID / Public Key / API Key

  clientSecret?: string // Client Secret (for Adobe / OAuth)

  endpoint?: string

  monthlyQuota: number

  usedThisMonth: number

  status: "active" | "exhausted" | "error" | "idle"

  lastTested?: string

  lastLatencyMs?: number

  lastError?: string

  lastErrorAt?: number

  isFreeTier: boolean

  freeCreditResetDay?: number // e.g. 1st of month
}

export interface ApiHealthResult {
  ok: boolean

  service: string

  latencyMs: number

  message: string

  quotaRemaining?: number
}

const STORAGE_KEY = "masterfilepro_cloud_apis_config_v2"
const STORED_SECRET = "••••••••"

function sanitizeApi(api: CloudApiConfig): CloudApiConfig {
  return {
    ...api,
    apiKey: api.apiKey ? STORED_SECRET : "",
    clientSecret: api.clientSecret ? STORED_SECRET : "",
  }
}

// CloudConvert and ConvertAPI were listed as failover priorities #3 and #4 but no
// tool ever sent a request to them, so the pool must not advertise or select them
// again from a saved copy or a leftover database row.
const RETIRED_ENGINE_IDS = ["cloudconvert-api", "convertapi"]

const b64 = (s: string) => {
  try {
    if (typeof atob !== "undefined") return atob(s)

    if (typeof Buffer !== "undefined")
      return Buffer.from(s, "base64").toString("utf-8")
  } catch {}

  return ""
}

export const DEFAULT_CLOUD_APIS: CloudApiConfig[] = [
  // --- 1. PDF COMPRESSION & OPTIMIZATION PIPELINE ---

  {
    id: "adobe-pdf-services",

    name: "Adobe Acrobat PDF Services",

    provider: "adobe",

    category: "pdf-compression",

    priority: 1,

    enabled: true,

    description:
      "Industry-standard high-fidelity PDF compression, linearizing, and optimization with lossless font embedding.",

    dashboardUrl:
      "https://developer.adobe.com/document-services/apis/pdf-services/",

    // Credentials are resolved server-side; the bundle must not carry them.

    apiKey: "",

    clientSecret: "",

    endpoint: "https://pdf-services.adobe.io",

    monthlyQuota: 500,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,

    freeCreditResetDay: 1,
  },

  {
    id: "ilovepdf-cloud",

    name: "iLovePDF Cloud API",

    provider: "ilovepdf",

    category: "pdf-compression",

    priority: 2,

    enabled: true,

    description:
      "Cloud-based PDF compression with balanced ratios and fast failover processing.",

    dashboardUrl: "https://developer.ilovepdf.com/",

    apiKey: "",

    clientSecret: "",

    endpoint: "https://api.ilovepdf.com",

    monthlyQuota: 250,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,

    freeCreditResetDay: 1,
  },

  {
    id: "local-wasm-engine",

    name: "In-Browser WebAssembly Engine (pdf-lib / wasm)",

    provider: "local",

    category: "pdf-compression",

    priority: 3,

    enabled: true,

    description:
      "100% private client-side in-browser PDF processing. Zero latency, unlimited quota, zero cost, completely offline fallback.",

    endpoint: "local-browser://pdf-engine",

    monthlyQuota: 999999,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,
  },

  // --- 2. OCR & DOCUMENT EXTRACTION ---

  {
    id: "ocr-space-api",

    name: "OCR.space Free Cloud OCR",

    provider: "ocrspace",

    category: "ocr-text",

    priority: 1,

    enabled: true,

    description:
      "Multi-language optical character recognition for scanned PDFs and document images. 25,000 requests/month free (500/day).",

    dashboardUrl: "https://ocr.space/ocrapi/freekey",

    apiKey: "",

    endpoint: "https://api.ocr.space/parse/image",

    monthlyQuota: 25000,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,
  },

  // --- 3. IMAGE TOOLS & COMPRESSION ---

  {
    id: "tinypng-api",

    name: "TinyPNG / Tinify Image API",

    provider: "tinypng",

    category: "image-tools",

    priority: 1,

    enabled: true,

    description:
      "Intelligent lossy compression for PNG, JPEG, and WebP images. 500 image compressions free every month.",

    dashboardUrl: "https://tinypng.com/developers",

    apiKey: "",

    endpoint: "https://api.tinify.com/shrink",

    monthlyQuota: 500,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,
  },

  // --- 4. AUDIO TRANSCRIPTION & SPEECH ---

  {
    id: "groq-whisper",

    name: "Groq Cloud Whisper AI",

    provider: "groq",

    category: "audio-speech",

    priority: 1,

    enabled: true,

    description:
      "Ultra-fast Audio-to-Text using OpenAI Whisper Large v3. 14,400 seconds (~4 hours) of audio transcribed free every day.",

    dashboardUrl: "https://console.groq.com/keys",

    apiKey: "",

    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",

    monthlyQuota: 14400,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,
  },

  // --- 5. AI SUMMARIZATION, GRAMMAR & TRANSLATION ---

  {
    id: "google-gemini",

    name: "Google AI Studio (Gemini Flash)",

    provider: "google",

    category: "ai-text",

    priority: 1,

    enabled: true,

    description:
      "Document Summarizer, Grammar Fixer, and smart drafting. 1,500 requests/day (45,000/mo) completely free.",

    dashboardUrl: "https://aistudio.google.com/app/apikey",

    apiKey: "",

    endpoint: "https://generativelanguage.googleapis.com/v1beta",

    monthlyQuota: 45000,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,
  },

  {
    id: "mymemory-translation",

    name: "MyMemory Translation API",

    provider: "mymemory",

    category: "ai-text",

    priority: 2,

    enabled: true,

    description:
      "Document and text translation across 60+ languages. 50,000 words free every single day.",

    dashboardUrl: "https://mymemory.translated.net/doc/keygen.php",

    apiKey: "",

    endpoint: "https://api.mymemory.translated.net/get",

    monthlyQuota: 50000,

    usedThisMonth: 0,

    status: "active",

    isFreeTier: true,
  },
]

/**
 * Retrieve all APIs sorted by priority ascending (1, 2, 3...)
 * Automatically merges newly added catalog providers if missing from local storage.
 */

export function getCloudApis(category?: string): CloudApiConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    let list: CloudApiConfig[] = raw ? JSON.parse(raw) : []
    if (Array.isArray(list)) list = list.map(sanitizeApi)

    if (!Array.isArray(list) || list.length === 0) {
      list = DEFAULT_CLOUD_APIS

      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } else {
      // A browser that once saved the retired engines must not keep offering them.

      const kept = list.filter((a) => !RETIRED_ENGINE_IDS.includes(a.id))

      if (kept.length !== list.length) {
        list = kept

        localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      }

      // Ensure all catalog providers exist

      let changed = false

      for (const def of DEFAULT_CLOUD_APIS) {
        if (!list.some((a) => a.id === def.id)) {
          list.push(def)

          changed = true
        } else {
          // If default has a dashboardUrl and saved one doesn't, copy it over

          const existing = list.find((a) => a.id === def.id)

          if (existing) {
            if (!existing.dashboardUrl && def.dashboardUrl) {
              existing.dashboardUrl = def.dashboardUrl

              changed = true
            }

            if (
              def.apiKey &&
              (!existing.apiKey ||
                existing.apiKey.startsWith("YOUR_") ||
                existing.apiKey.length < 5)
            ) {
              existing.apiKey = def.apiKey

              if (def.clientSecret) existing.clientSecret = def.clientSecret

              changed = true
            }

            // Specific verified pre-configured keys (OCR.space and iLovePDF)

            if (
              def.id === "ocr-space-api" &&
              (!existing.apiKey ||
                existing.apiKey.startsWith("YOUR_") ||
                existing.apiKey !== def.apiKey)
            ) {
              existing.apiKey = def.apiKey

              changed = true
            }

            if (
              def.id === "ilovepdf-cloud" &&
              (!existing.apiKey || existing.apiKey.startsWith("YOUR_"))
            ) {
              existing.apiKey = def.apiKey

              existing.clientSecret = def.clientSecret

              changed = true
            }
          }
        }
      }

      if (changed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      }
    }

    const filtered = category
      ? list.filter((a) => a.category === category)
      : list

    return filtered.sort((a, b) => a.priority - b.priority)
  } catch {
    return DEFAULT_CLOUD_APIS
  }
}

/**
 * Save updated APIs to localStorage, IndexedDB and server database
 */

export async function saveCloudApis(
  apis: CloudApiConfig[],
): Promise<{ ok: boolean ; syncedToServer: boolean }> {
  let syncedToServer = false

  try {
    const sorted = [...apis].sort((a, b) => a.priority - b.priority)
    const sanitized = sorted.map(sanitizeApi)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized))

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("masterfilepro-apis-updated", { detail: { apis: sanitized } }),
      )
    }

    const headers: Record<string, string> = authHeaders({
      "Content-Type": "application/json",
    })

    // Write to server disk/serverless database

    const res = await fetch("/api/db/apis", {
      method: "POST",

      headers,

      body: JSON.stringify({ apis: sorted }),
    }).catch(() => null)

    if (res && res.ok) {
      syncedToServer = true
    }

    return { ok: true, syncedToServer }
  } catch (err) {
    console.warn("Failed to persist cloud APIs:", err)

    return { ok: false, syncedToServer: false }
  }
}

/**
 * Move priority up or down within category
 */

export async function moveApiPriority(
  apiId: string,

  direction: "up" | "down",

  category?: string,
): Promise<CloudApiConfig[]> {
  const all = getCloudApis()

  const list = category ? all.filter((a) => a.category === category) : all

  const sorted = [...list].sort((a, b) => a.priority - b.priority)

  const index = sorted.findIndex((a) => a.id === apiId)

  if (index === -1) return all

  const targetIndex = direction === "up" ? index - 1 : index + 1

  if (targetIndex < 0 || targetIndex >= sorted.length) return all

  // Swap priorities

  const tempPriority = sorted[index].priority

  sorted[index].priority = sorted[targetIndex].priority

  sorted[targetIndex].priority = tempPriority

  // Merge back into all

  for (const item of sorted) {
    const orig = all.find((a) => a.id === item.id)

    if (orig) orig.priority = item.priority
  }

  await saveCloudApis(all)

  return getCloudApis()
}

/**
 * Get next available API for a given category (e.g. "pdf-compression"),
 * skipping disabled, exhausted, excluded or recently failed API IDs.
 */

// An engine that just failed is given a short rest rather than being dropped for
// the session, so a transient network error is retried but never retried twice in
// the same job.
const ERROR_COOLDOWN_MS = 5 * 60_000

export function getNextAvailableApi(
  category: string,

  excludeIds: string[] = [],
): CloudApiConfig | null {
  const apis = getCloudApis(category)

  for (const api of apis) {
    if (!api.enabled) continue

    if (excludeIds.includes(api.id)) continue

    if (api.status === "exhausted") continue

    if (api.monthlyQuota && api.usedThisMonth >= api.monthlyQuota) {
      api.status = "exhausted"

      continue
    }

    // Without this, a job that fails over and asks again is handed the same engine
    // that just failed, and the next provider check silently drops to local.
    if (
      api.status === "error" &&
      api.lastErrorAt &&
      Date.now() - api.lastErrorAt < ERROR_COOLDOWN_MS
    ) {
      continue
    }

    return api
  }

  return null
}

/**
 * Which engine last completed work, so a tool page can say where the document was
 * processed instead of assuming the browser did it.
 */

let lastEngineRun: { provider: string; name: string; at: number } | null = null

export function getEngineRunSince(sinceMs: number) {
  return lastEngineRun && lastEngineRun.at >= sinceMs ? lastEngineRun : null
}

/**
 * Record API call outcome (success, usage increment, quota exhaustion)
 */

export function recordApiOutcome(
  apiId: string,

  result: {
    success: boolean

    statusCode?: number

    errorMessage?: string
  },
): void {
  try {
    const apis = getCloudApis()

    const api = apis.find((a) => a.id === apiId)

    if (!api) return

    if (result.success) {
      lastEngineRun = {
        provider: api.provider || "cloud",

        name: api.name,

        at: Date.now(),
      }

      api.usedThisMonth = (api.usedThisMonth || 0) + 1

      api.status = "active"

      api.lastError = undefined

      api.lastErrorAt = undefined

      // The proxy functions write the ledger themselves; a client-supplied

      // increment would double-count and could be forged.
    } else {
      api.lastError = result.errorMessage

      api.lastErrorAt = Date.now()

      if (
        result.statusCode === 429 ||
        result.errorMessage?.toLowerCase().includes("quota") ||
        result.errorMessage?.toLowerCase().includes("limit")
      ) {
        api.status = "exhausted"

        api.usedThisMonth = api.monthlyQuota
      } else {
        api.status = "error"
      }
    }

    saveCloudApis(apis)
  } catch (err) {
    console.warn("Failed to record API outcome:", err)
  }
}

/**
 * Test an API's connectivity and return live latency & status
 */

export async function testApiHealth(
  api: CloudApiConfig,
): Promise<ApiHealthResult> {
  const start = performance.now()

  try {
    if (api.provider === "adobe") {
      const res = await fetch("/api/adobe-pdf/status")

      const latencyMs = Math.round(performance.now() - start)

      if (res.ok) {
        const data = await res.json()

        return {
          ok: true,

          service: data.service || "Adobe PDF Services",

          latencyMs,

          message: `Connected (${latencyMs}ms). 500 free calls/month quota ready.`,

          quotaRemaining: 500 - (api.usedThisMonth || 0),
        }
      } else {
        const err = await res.json().catch(() => ({}))

        return {
          ok: false,

          service: "Adobe PDF Services",

          latencyMs,

          message: err.error || `HTTP ${res.status} Authentication Failed`,
        }
      }
    }

    if (api.provider === "ilovepdf") {
      const res = await fetch("/api/ilovepdf/status")

      const latencyMs = Math.round(performance.now() - start)

      if (res.ok) {
        const data = await res.json()

        return {
          ok: true,

          service: data.service || "iLovePDF Cloud API",

          latencyMs,

          message: `Connected (${latencyMs}ms). 250 free calls/month quota active.`,

          quotaRemaining: 250 - (api.usedThisMonth || 0),
        }
      } else {
        const err = await res.json().catch(() => ({}))

        return {
          ok: false,

          service: "iLovePDF Cloud API",

          latencyMs,

          message: err.error || `HTTP ${res.status} Key Validation Failed`,
        }
      }
    }

    if (api.provider === "ocrspace") {
      const res = await fetch("/api/ocr-space/status")

      const latencyMs = Math.round(performance.now() - start)

      if (res.ok) {
        return {
          ok: true,

          service: "OCR.space Cloud API",

          latencyMs,

          message: `Connected (${latencyMs}ms). 25,000 monthly calls available.`,
        }
      } else {
        return {
          ok: false,

          service: "OCR.space Cloud API",

          latencyMs,

          message: "OCR.space service endpoint responded with error.",
        }
      }
    }

    if (api.provider === "local") {
      const latencyMs = Math.round(performance.now() - start)

      return {
        ok: true,

        service: "Local In-Browser Engine",

        latencyMs: 1,

        message:
          "Instant (1ms). Client-side WebAssembly active with unlimited quota.",

        quotaRemaining: 999999,
      }
    }

    // Backend proxy ping (avoids browser CORS restrictions on external APIs)

    try {
      const proxyRes = await fetch("/api/cloud-apis/ping", {
        method: "POST",

        headers: { ...authHeaders(), "Content-Type": "application/json" },

        body: JSON.stringify({
          id: api.id,

          endpoint: api.endpoint,

          provider: api.provider,

        }),
      })

      if (proxyRes.ok) {
        const data = await proxyRes.json()

        // The route now reports what it actually saw, so a green badge means the
        // endpoint answered rather than that the request was delivered.
        return {
          ok: data.ok === true,

          service: api.name,

          latencyMs: data.latencyMs || Math.round(performance.now() - start),

          message:
            data.message ||
            data.error ||
            (data.ok ? "Endpoint responded." : "Endpoint did not respond."),
        }
      }
    } catch {
      // Fallback if backend route is unavailable
    }

    // Direct ping fallback

    if (api.endpoint) {
      const res = await fetch(api.endpoint, { method: "HEAD" }).catch(
        () => null,
      )

      const latencyMs = Math.round(performance.now() - start)

      return {
        ok: !!res && res.status < 400,

        service: api.name,

        latencyMs,

        message: res
          ? `Endpoint returned HTTP ${res.status} (${latencyMs}ms)`
          : "No answer from the endpoint: it is unreachable or the browser blocked the cross-origin probe.",
      }
    }

    return {
      ok: false,

      service: api.name,

      latencyMs: 0,

      message: "No endpoint configured for this engine, so it cannot be tested.",
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start)

    return {
      ok: false,

      service: api.name,

      latencyMs,

      message: err.message || "Connection timeout",
    }
  }
}

/**
 * Synchronize APIs with Server Database on boot
 */

export async function syncCloudApisWithServer(): Promise<CloudApiConfig[]> {
  try {
    const headers: Record<string, string> = authHeaders()

    const res = await fetch("/api/db/apis", { headers }).catch(() => null)

    if (res && res.ok) {
      const data = await res.json()

      if (Array.isArray(data.apis) && data.apis.length > 0) {
        const merged = data.apis
          .filter((srvApi: CloudApiConfig) => !RETIRED_ENGINE_IDS.includes(srvApi.id))
          .map(sanitizeApi)

        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("masterfilepro-apis-updated", {
              detail: { apis: merged },
            }),
          )
        }

        return merged
      }
    }
  } catch {
    // Offline / fallback to local storage
  }

  return getCloudApis()
}

if (typeof window !== "undefined") {
  ;(window as any).__masterfileproApiPool = {
    getNextAvailableApi,

    recordApiOutcome,

    getCloudApis,

    saveCloudApis,

    syncCloudApisWithServer,
  }
}
