import { cors, json } from "../server/_lib/db.ts"
import { readPaidBody, requirePaidAccess } from "../server/_lib/gateway.ts"
import {
  countApiUsage,
  getProviderSecret,
  recordApiCall,
} from "../server/_lib/providers.ts"
import {
  extractImageTableWithGemini,
  GeminiImageError,
} from "../server/_lib/geminiImageTable.ts"

const MAX_IMAGE_BYTES = 14 * 1024 * 1024
const MAX_BASE64_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4
const DEFAULT_DAILY_REQUEST_LIMIT = 40
const DEFAULT_USER_DAILY_REQUEST_LIMIT = 9
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function configuredLimit(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function verifiedImageKind(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  return null
}

function decodeImage(body: any): { bytes: Buffer; mimeType: string } {
  if (body?.consent !== true) {
    throw new Error("Explicit consent is required before uploading a financial document.")
  }
  if (typeof body?.imageBase64 !== "string" || !body.imageBase64) {
    throw new Error("An image is required.")
  }
  if (body.imageBase64.length > MAX_BASE64_BYTES) {
    throw new Error("The image is too large for cloud extraction.")
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.imageBase64) || body.imageBase64.length % 4 !== 0) {
    throw new Error("The image data is invalid.")
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType : ""
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Choose a JPG, PNG, or WebP image.")
  }

  const bytes = Buffer.from(body.imageBase64, "base64")
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || verifiedImageKind(bytes) !== mimeType) {
    throw new Error("The image contents do not match the selected format.")
  }
  return { bytes, mimeType }
}

export default async function handler(req: any, res: any) {
  cors(req, res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  const action =
    req.query?.action ||
    ((req.url || "").includes("/extract") ? "extract" : "")
  if (action !== "extract" || req.method !== "POST") {
    json(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  const actor = await requirePaidAccess(req, res, "google", "image-to-excel")
  if (!actor) return

  try {
    const body = await readPaidBody(req, res)
    if (!body) return

    let image: { bytes: Buffer; mimeType: string }
    try {
      image = decodeImage(body)
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "The image could not be verified.",
        code: "invalid_image",
      })
      return
    }

    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const [userCalls, totalCalls] = await Promise.all([
      countApiUsage("google", {
        since: dayStart,
        tool: "image-to-excel",
        userId: actor.id,
      }),
      countApiUsage("google", { since: dayStart }),
    ])
    if (userCalls >= configuredLimit("GEMINI_USER_DAILY_REQUEST_LIMIT", DEFAULT_USER_DAILY_REQUEST_LIMIT)) {
      json(res, 429, {
        ok: false,
        code: "daily_user_limit",
        error: "Your daily cloud extraction allowance is used up. Local OCR is still available.",
      })
      return
    }
    if (totalCalls >= configuredLimit("GEMINI_DAILY_REQUEST_LIMIT", DEFAULT_DAILY_REQUEST_LIMIT)) {
      json(res, 429, {
        ok: false,
        code: "daily_service_limit",
        error: "Cloud extraction is at capacity right now. Local OCR is still available.",
      })
      return
    }

    const apiKey = await getProviderSecret("google", "apiKey", ["GEMINI_API_KEY"])
    if (!apiKey) {
      json(res, 503, {
        ok: false,
        code: "cloud_not_configured",
        error: "Cloud extraction is not configured. Your local result is still available.",
      })
      return
    }

    const result = await extractImageTableWithGemini(
      {
        imageBase64: body.imageBase64,
        mimeType: image.mimeType,
        apiKey,
      },
      {
        onCall: (status) => recordApiCall("google", "image-to-excel", actor.id, status),
      },
    )

    json(res, 200, { ok: true, provider: "cloud", table: result.table })
  } catch (error) {
    if (error instanceof GeminiImageError) {
      const status = error.status === 429 ? 429 : error.status === 504 ? 504 : error.status >= 500 ? 503 : 422
      json(res, status, {
        ok: false,
        code: error.code,
        error:
          status === 429
            ? "Cloud extraction is out of quota. Your local result is still available."
            : status === 503 || status === 504
              ? "Cloud extraction is temporarily unavailable. Your local result is still available."
              : "Cloud extraction could not read this image. Keep reviewing the local result or retake the photo.",
      })
      return
    }

    console.error("Image-to-Excel cloud route failed:", error instanceof Error ? error.message : "unknown error")
    json(res, 500, {
      ok: false,
      code: "cloud_failed",
      error: "Cloud extraction failed. Your local result is still available.",
    })
  }
}
