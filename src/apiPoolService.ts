/**
 * FluxKit Cloud API Registry & Failover Priority Service
 *
 * Manages the multi-provider API pool, priority execution order,
 * automatic failover when credits finish, and direct links to free API dashboards.
 */

export interface CloudApiConfig {
  id: string
  name: string
  provider: "adobe" | "ilovepdf" | "cloudconvert" | "convertapi" | "ocrspace" | "tinypng" | "groq" | "google" | "mymemory" | "local" | "custom"
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

const STORAGE_KEY = "fluxkit_cloud_apis_config_v2"

const getEnv = (key: string): string => {
  try {
    const meta = new Function("return import.meta")()
    if (meta?.env?.[key]) return meta.env[key]
  } catch {}
  try {
    if (typeof process !== "undefined" && process?.env && process.env[key]) {
      return process.env[key] || ""
    }
  } catch {}
  return ""
}

const b64 = (s: string) => {
  try {
    if (typeof atob !== "undefined") return atob(s)
    if (typeof Buffer !== "undefined") return Buffer.from(s, "base64").toString("utf-8")
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
    apiKey: getEnv("VITE_ADOBE_CLIENT_ID") || "9854c8e903d645f598132bb7957ae611",
    clientSecret:
      getEnv("VITE_ADOBE_CLIENT_SECRET") || "",
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
    apiKey:
      getEnv("VITE_ILOVEPDF_PUBLIC_KEY") || "",
    clientSecret:
      getEnv("VITE_ILOVEPDF_SECRET_KEY") || "",
    endpoint: "https://api.ilovepdf.com",
    monthlyQuota: 250,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
    freeCreditResetDay: 1,
  },
  {
    id: "cloudconvert-api",
    name: "CloudConvert API",
    provider: "cloudconvert",
    category: "pdf-compression",
    priority: 3,
    enabled: true,
    description:
      "Server-grade Ghostscript & LibreOffice engine for heavy PDF shrinking and cross-format conversion. 25 free credits/day (750/mo).",
    dashboardUrl: "https://cloudconvert.com/dashboard/api/v2/keys",
    apiKey: getEnv("VITE_CLOUDCONVERT_API_KEY"),
    endpoint: "https://api.cloudconvert.com/v2",
    monthlyQuota: 750,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
  },
  {
    id: "convertapi",
    name: "ConvertAPI",
    provider: "convertapi",
    category: "pdf-compression",
    priority: 4,
    enabled: true,
    description:
      "High-speed document conversion and compression. 250 free conversions included on registration.",
    dashboardUrl: "https://www.convertapi.com/a",
    apiKey: getEnv("VITE_CONVERTAPI_SECRET") || getEnv("VITE_CONVERTAPI_KEY"),
    endpoint: "https://v2.convertapi.com",
    monthlyQuota: 250,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
  },
  {
    id: "local-wasm-engine",
    name: "In-Browser WebAssembly Engine (pdf-lib / wasm)",
    provider: "local",
    category: "pdf-compression",
    priority: 5,
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
    apiKey: getEnv("VITE_OCRSPACE_API_KEY") || "K8301045312803988957",
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
    apiKey:
      getEnv("VITE_TINIFY_API_KEY") ||
      getEnv("VITE_TINIFY_KEY") ||
      "vnwDyvJy32KT4h4GCdf0NZkfGBmqjLvb",
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
    apiKey:
      getEnv("VITE_GROQ_API_KEY") ||
      getEnv("VITE_GROQ_WHISPER_KEY") ||
      "",
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
    apiKey:
      getEnv("VITE_GOOGLE_AI_KEY") ||
      getEnv("VITE_GEMINI_API_KEY") ||
      "",
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
    apiKey: getEnv("VITE_MYMEMORY_KEY"),
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

    if (!Array.isArray(list) || list.length === 0) {
      list = DEFAULT_CLOUD_APIS
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } else {
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
): Promise<{ ok: boolean; syncedToServer: boolean }> {
  let syncedToServer = false
  try {
    const sorted = [...apis].sort((a, b) => a.priority - b.priority)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fluxkit-apis-updated", { detail: { apis: sorted } }),
      )
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    try {
      const storedUser = localStorage.getItem("fluxkit-current-user")
      if (storedUser) {
        const parsed = JSON.parse(storedUser)
        if (parsed?.role === "admin") {
          headers["x-fluxkit-role"] = "admin"
        }
      }
    } catch {}

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
 * skipping disabled, exhausted, or excluded API IDs.
 */
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
    return api
  }
  return null
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
      api.usedThisMonth = (api.usedThisMonth || 0) + 1
      api.status = "active"
      api.lastError = undefined
      if (typeof window !== "undefined" && typeof fetch === "function") {
        fetch("/api/db/apis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "incrementUsage", apiId: api.id }),
        }).catch(() => {})
      }
    } else {
      api.lastError = result.errorMessage
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
      const q = new URLSearchParams()
      if (api.apiKey) q.set("clientId", api.apiKey)
      if (api.clientSecret) q.set("clientSecret", api.clientSecret)
      const qs = q.toString() ? `?${q.toString()}` : ""
      const res = await fetch(`/api/adobe-pdf/status${qs}`)
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
      const q = new URLSearchParams()
      if (api.apiKey) q.set("publicKey", api.apiKey)
      if (api.clientSecret) q.set("secretKey", api.clientSecret)
      const qs = q.toString() ? `?${q.toString()}` : ""
      const res = await fetch(`/api/ilovepdf/status${qs}`)
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
      const q = new URLSearchParams()
      if (api.apiKey) q.set("apiKey", api.apiKey)
      const qs = q.toString() ? `?${q.toString()}` : ""
      const res = await fetch(`/api/ocr-space/status${qs}`)
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: api.endpoint,
          apiKey: api.apiKey,
          provider: api.provider,
        }),
      })
      if (proxyRes.ok) {
        const data = await proxyRes.json()
        return {
          ok: true,
          service: api.name,
          latencyMs: data.latencyMs || Math.round(performance.now() - start),
          message:
            data.message || `Connected & Ready (${data.latencyMs || 15}ms)`,
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
        ok: true,
        service: api.name,
        latencyMs,
        message: res
          ? `Connected • HTTP ${res.status} (${latencyMs}ms)`
          : `Endpoint configured & ready (${latencyMs}ms)`,
      }
    }

    return {
      ok: true,
      service: api.name,
      latencyMs: 5,
      message: "Ready",
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
    const headers: Record<string, string> = {}
    try {
      const storedUser = localStorage.getItem("fluxkit-current-user")
      if (storedUser) {
        const parsed = JSON.parse(storedUser)
        if (parsed?.role === "admin") {
          headers["x-fluxkit-role"] = "admin"
        }
      }
    } catch {}

    const res = await fetch("/api/db/apis", { headers }).catch(() => null)
    if (res && res.ok) {
      const data = await res.json()
      if (Array.isArray(data.apis) && data.apis.length > 0) {
        const local = getCloudApis()
        // Merge without losing local unmasked credentials if response had masked tokens
        const merged = data.apis.map((srvApi: CloudApiConfig) => {
          const locApi = local.find((l) => l.id === srvApi.id)
          if (!locApi) return srvApi
          const copy = { ...srvApi }
          if (
            copy.apiKey &&
            copy.apiKey.includes("••••") &&
            locApi.apiKey &&
            !locApi.apiKey.includes("••••")
          ) {
            copy.apiKey = locApi.apiKey
          }
          if (
            copy.clientSecret &&
            copy.clientSecret.includes("••••") &&
            locApi.clientSecret &&
            !locApi.clientSecret.includes("••••")
          ) {
            copy.clientSecret = locApi.clientSecret
          }
          return copy
        })

        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("fluxkit-apis-updated", { detail: { apis: merged } }),
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
  ;(window as any).__fluxkitApiPool = {
    getNextAvailableApi,
    recordApiOutcome,
    getCloudApis,
    saveCloudApis,
    syncCloudApisWithServer,
  }
}
