export const GEMINI_IMAGE_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"] as const

export interface CloudTablePayload {
  columns: Array<{ label: string; kind: string }>
  rows: Array<{ cells: Array<{ value: string; confidence: number }> }>
}

export class GeminiImageError extends Error {
  status: number
  code: string
  retryable: boolean
  retryDelay?: number

  constructor(message: string, status: number, code: string, retryable = false, retryDelay?: number) {
    super(message)
    this.name = "GeminiImageError"
    this.status = status
    this.code = code
    this.retryable = retryable
    this.retryDelay = retryDelay
  }
}

interface GeminiExtractionOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  retryDelayMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  health?: Map<string, number>
  onCall?: (status: "success" | "error") => void | Promise<void>
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    columns: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          kind: {
            type: "STRING",
            description: "One of: date, text, reference, amount, currency, unknown.",
          },
        },
        required: ["label", "kind"],
      },
    },
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          cells: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                value: { type: "STRING" },
                confidence: { type: "NUMBER" },
              },
              required: ["value", "confidence"],
            },
          },
        },
        required: ["cells"],
      },
    },
  },
  required: ["columns", "rows"],
}

const PROMPT = `Extract the main financial table from this image into rows and columns.
Return only the visible table, not page titles, account-holder metadata, signatures, or footer text.
Use the table headings as column labels. Preserve dates, references, leading zeroes, currency symbols, commas, and decimal places exactly as printed.
Keep blank cells as empty strings so every row stays aligned. Never infer or calculate missing values.
Keep multi-line cell text with newline characters. Return rows in visual order.
Use a confidence number from 0 to 1 for each cell based on how certain the text is.
Return between 2 and 12 columns and no more than 500 rows.`

const defaultHealth = new Map<string, number>()
const COLUMN_KINDS = new Set(["date", "text", "reference", "amount", "currency", "unknown"])

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeTable(value: unknown): CloudTablePayload {
  if (!value || typeof value !== "object") throw new Error("No table object")
  const raw = value as { columns?: unknown; rows?: unknown }
  if (!Array.isArray(raw.columns) || !Array.isArray(raw.rows)) {
    throw new Error("Missing columns or rows")
  }
  if (raw.columns.length < 2 || raw.columns.length > 12) {
    throw new Error("Unsupported column count")
  }
  if (raw.rows.length < 1 || raw.rows.length > 500) {
    throw new Error("Unsupported row count")
  }

  const columns = raw.columns.map((item, index) => {
    const column = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const label = typeof column.label === "string" ? column.label.trim().slice(0, 120) : ""
    const kind = typeof column.kind === "string" && COLUMN_KINDS.has(column.kind) ? column.kind : "unknown"
    return { label: label || `Column ${index + 1}`, kind }
  })

  const rows = raw.rows.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    if (!Array.isArray(row.cells) || row.cells.length > columns.length) {
      throw new Error("Row does not match columns")
    }
    const rawCells = Array.isArray(row.cells) ? row.cells : []
    const cells = columns.map((_column, index) => {
      const rawCell = rawCells[index]
      const cell = rawCell && typeof rawCell === "object" ? (rawCell as Record<string, unknown>) : {}
      const text = typeof cell.value === "string" ? cell.value.replace(/\u0000/g, "").slice(0, 32000) : ""
      const confidence = typeof cell.confidence === "number" && Number.isFinite(cell.confidence)
        ? clamp(cell.confidence, 0, 1)
        : 0.5
      return { value: text, confidence }
    })
    return { cells }
  })

  return { columns, rows }
}

function parseTableResponse(data: any): CloudTablePayload {
  const text = Array.isArray(data?.candidates?.[0]?.content?.parts)
    ? data.candidates[0].content.parts
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
    : ""
  if (!text.trim()) throw new Error("Empty model response")
  return normalizeTable(JSON.parse(text))
}

function retryDelaySeconds(data: any, response: Response): number | null {
  const header = response.headers?.get?.("retry-after")
  if (header && /^\d+$/.test(header)) return Number(header)
  for (const detail of data?.error?.details || []) {
    const match = typeof detail?.retryDelay === "string"
      ? detail.retryDelay.match(/^([\d.]+)s$/)
      : null
    if (match) return Number(match[1])
  }
  return null
}

async function requestModel(
  model: string,
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  options: Required<Pick<GeminiExtractionOptions, "fetchImpl" | "timeoutMs">>,
): Promise<CloudTablePayload> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new GeminiImageError("Cloud extraction timed out.", 504, "provider_timeout", true))
    }, options.timeoutMs)
  })

  let response: Response
  try {
    response = await Promise.race([
      options.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT },
                  { inline_data: { mime_type: mimeType, data: imageBase64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal: controller.signal,
        },
      ),
      deadline,
    ])
  } catch (error) {
    if (error instanceof GeminiImageError) throw error
    throw new GeminiImageError("Cloud extraction could not be reached.", 503, "network_error", true)
  } finally {
    if (timer) clearTimeout(timer)
  }

  const text = await response.text()
  if (text.length > 2_000_000) {
    throw new GeminiImageError("Cloud extraction returned too much data.", 502, "invalid_response", true)
  }
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (response.status === 200) {
    try {
      return parseTableResponse(data)
    } catch {
      throw new GeminiImageError("Cloud extraction returned an invalid table.", 502, "invalid_response", true)
    }
  }

  if (response.status === 429) {
    const delay = retryDelaySeconds(data, response)
    throw new GeminiImageError("Cloud extraction quota is exhausted.", 429, "provider_quota", false, delay ?? undefined)
  }
  if (response.status === 404) {
    throw new GeminiImageError("This cloud extraction model is unavailable.", 404, "model_unavailable")
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    throw new GeminiImageError("Cloud extraction is temporarily busy.", response.status, "provider_busy", true)
  }
  if (response.status >= 400 && response.status < 500) {
    throw new GeminiImageError("Cloud extraction rejected this image.", response.status, "provider_rejected")
  }
  throw new GeminiImageError("Cloud extraction failed.", response.status, "provider_error", true)
}

export async function extractImageTableWithGemini(
  input: { imageBase64: string; mimeType: string; apiKey: string },
  options: GeminiExtractionOptions = {},
): Promise<{ table: CloudTablePayload; model: string; attempts: number }> {
  const fetchImpl = options.fetchImpl || fetch
  const timeoutMs = options.timeoutMs || 22_000
  const retryDelayMs = options.retryDelayMs ?? 400
  const sleep = options.sleep || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const now = options.now || Date.now
  const health = options.health || defaultHealth
  let attempts = 0
  let lastError: GeminiImageError | null = null

  for (const model of GEMINI_IMAGE_MODELS) {
    if ((health.get(model) || 0) > now()) continue

    for (let attempt = 1; attempt <= 2; attempt++) {
      attempts++
      try {
        const table = await requestModel(model, input.imageBase64, input.mimeType, input.apiKey, {
          fetchImpl,
          timeoutMs,
        })
        await options.onCall?.("success")
        health.delete(model)
        return { table, model, attempts }
      } catch (error) {
        await options.onCall?.("error")
        const failure = error instanceof GeminiImageError
          ? error
          : new GeminiImageError("Cloud extraction failed.", 503, "provider_error", true)
        lastError = failure

        if (failure.code === "provider_quota") {
          const retryDelay = failure.retryDelay
          health.set(model, now() + clamp(retryDelay || 900, 60, 86_400) * 1000)
          break
        }
        if (failure.code === "model_unavailable") {
          health.set(model, now() + 6 * 60 * 60 * 1000)
          break
        }
        if (!failure.retryable) break
        if (attempt === 1) {
          await sleep(retryDelayMs)
          continue
        }

        health.set(model, now() + 60_000)
        break
      }
    }
  }

  if (!lastError) {
    throw new GeminiImageError("Cloud extraction is temporarily unavailable.", 503, "provider_unavailable")
  }
  throw lastError
}
