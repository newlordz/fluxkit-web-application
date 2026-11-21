import type { IncomingMessage, ServerResponse } from "node:http"
import fs from "node:fs"
import path from "node:path"

const DB_PATH_1 = path.join(process.cwd(), "data", "masterfile-db.json")
const DB_PATH_2 = path.join(process.cwd(), "data", "fluxkit-db.json")
const TMP_PATH = path.join("/tmp", "masterfile-db.json")

const DEFAULT_API_POOL = [
  {
    id: "adobe-pdf-services",
    name: "Adobe Acrobat PDF Services",
    provider: "adobe",
    category: "pdf-compression",
    priority: 1,
    enabled: true,
    description:
      "Industry-standard high-fidelity PDF compression, linearizing, and optimization with lossless font embedding.",
    dashboardUrl: "https://developer.adobe.com/document-services/apis/pdf-services/",
    apiKey:
      process.env.VITE_ADOBE_CLIENT_ID ||
      process.env.ADOBE_CLIENT_ID ||
      "9854c8e903d645f598132bb7957ae611",
    clientSecret:
      process.env.VITE_ADOBE_CLIENT_SECRET ||
      process.env.ADOBE_CLIENT_SECRET ||
      "",
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
      process.env.VITE_ILOVEPDF_PUBLIC_KEY ||
      process.env.ILOVEPDF_PUBLIC_KEY ||
      "",
    clientSecret:
      process.env.VITE_ILOVEPDF_SECRET_KEY ||
      process.env.ILOVEPDF_SECRET_KEY ||
      "",
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
    apiKey:
      process.env.VITE_OCRSPACE_API_KEY ||
      process.env.OCRSPACE_API_KEY ||
      "K8301045312803988957",
    endpoint: "https://api.ocr.space/parse/image",
    monthlyQuota: 25000,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
  },
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
    endpoint: "https://api.tinify.com/shrink",
    monthlyQuota: 500,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
    apiKey:
      process.env.VITE_TINIFY_API_KEY || "vnwDyvJy32KT4h4GCdf0NZkfGBmqjLvb",
  },
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
    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    monthlyQuota: 14400,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
    apiKey: process.env.VITE_GROQ_API_KEY || "",
  },
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
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    monthlyQuota: 45000,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
    apiKey: process.env.VITE_GOOGLE_AI_KEY || "",
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
    endpoint: "https://api.mymemory.translated.net/get",
    monthlyQuota: 50000,
    usedThisMonth: 0,
    status: "active",
    isFreeTier: true,
  },
]

function readDb(): any {
  // 1. Check temporary serverless storage
  try {
    if (fs.existsSync(TMP_PATH)) {
      const content = fs.readFileSync(TMP_PATH, "utf8")
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed.apiPool) && parsed.apiPool.length > 0) {
        return parsed
      }
    }
  } catch {}

  // 2. Check bundled database files
  for (const p of [DB_PATH_1, DB_PATH_2]) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8")
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed.apiPool) && parsed.apiPool.length > 0) {
          return parsed
        }
      }
    } catch {}
  }
  return { apiPool: DEFAULT_API_POOL }
}

function writeDb(data: any): boolean {
  let ok = false
  // 1. Write to /tmp on serverless environments
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), "utf8")
    ok = true
  } catch {}

  // 2. Write to project disk if writable (local dev)
  for (const p of [DB_PATH_1, DB_PATH_2]) {
    try {
      fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8")
      ok = true
    } catch {}
  }
  return ok
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST,PUT")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-fluxkit-role, X-Fluxkit-Role",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  try {
    const db = readDb()

    // Check if caller is authenticated admin
    const roleHeader =
      (req.headers?.["x-fluxkit-role"] || req.headers?.["X-Fluxkit-Role"] || "")
        .toString()
        .toLowerCase()
    const isAdmin = roleHeader === "admin"

    if (req.method === "GET") {
      const rawApis =
        Array.isArray(db.apiPool) && db.apiPool.length > 0
          ? db.apiPool
          : DEFAULT_API_POOL

      // Return active API pool so every user and visitor gets to use the PDF and cloud tools
      const payload = { ok: true, apis: rawApis, active: true }
      res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    if (req.method === "POST" || req.method === "PUT") {
      let body: any = req.body
      if (!body) {
        const buffers: Buffer[] = []
        for await (const chunk of req) {
          buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
        }
        const str = Buffer.concat(buffers).toString("utf8")
        body = JSON.parse(str || "{}")
      } else if (typeof body === "string") {
        body = JSON.parse(body || "{}")
      }

      if (body.action === "incrementUsage" && body.apiId) {
        const pool = Array.isArray(db.apiPool) ? db.apiPool : []
        const match = pool.find(
          (a: any) => a.id === body.apiId || a.provider === body.apiId,
        )
        if (match) {
          match.usedThisMonth = (match.usedThisMonth || 0) + 1
          db.updatedAt = new Date().toISOString()
          writeDb(db)
        }
        const payload = {
          ok: true,
          apiId: body.apiId,
          usedThisMonth: match?.usedThisMonth || 0,
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      }

      const incomingApis = Array.isArray(body.apis) ? body.apis : []
      const existingApis = Array.isArray(db.apiPool) ? db.apiPool : []

      // Preserve stored secrets if incoming payload contains masked tokens
      const preservedApis = incomingApis.map((inApi: any) => {
        const existing = existingApis.find((e: any) => e.id === inApi.id)
        const merged = { ...inApi }
        if (existing) {
          if (merged.clientSecret && merged.clientSecret.includes("••••")) {
            merged.clientSecret = existing.clientSecret
          }
          if (merged.apiKey && merged.apiKey.includes("••••")) {
            merged.apiKey = existing.apiKey
          }
        }
        return merged
      })

      db.apiPool = preservedApis
      db.updatedAt = new Date().toISOString()
      const saved = writeDb(db)

      const payload = {
        ok: true,
        count: preservedApis.length,
        persisted: saved,
        message: "API pool configuration successfully synchronized with server database.",
      }
      res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    res.status?.(405)?.json?.({ ok: false, message: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ ok: false, message: "Method not allowed" }))
  } catch (error: any) {
    const payload = { ok: false, error: error?.message || "Internal server error" }
    res.status?.(500)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  }
}
