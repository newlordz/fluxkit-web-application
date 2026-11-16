import type { IncomingMessage, ServerResponse } from "node:http"

// In-memory cache across warm serverless container invocations
const showcaseStore = new Map<string, { data: any; createdAt: number }>()

// Maximum payload size: 4MB
const MAX_PAYLOAD_SIZE = 4 * 1024 * 1024

// TTL: 30 days
const TTL_MS = 30 * 24 * 60 * 60 * 1000

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT",
  )
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  const requestId = Math.random().toString(36).substring(2, 9)

  try {
    // ------------------------------------------------------------------------
    // GET: Retrieve showcase by ID
    // ------------------------------------------------------------------------
    if (req.method === "GET") {
      const url = new URL(
        req.url || "",
        `http://${req.headers?.host || "localhost"}`,
      )
      const id = url.searchParams.get("id")

      if (!id) {
        res.setHeader("Content-Type", "application/json")
        res.status?.(400)?.json?.({
          success: false,
          error: "Missing required 'id' parameter.",
        }) ||
          res.end?.(
            JSON.stringify({
              success: false,
              error: "Missing required 'id' parameter.",
            }),
          )
        return
      }

      const item = showcaseStore.get(id)
      if (!item) {
        res.setHeader("Content-Type", "application/json")
        res.status?.(404)?.json?.({
          success: false,
          error: "Showcase not found or expired.",
        }) ||
          res.end?.(
            JSON.stringify({
              success: false,
              error: "Showcase not found or expired.",
            }),
          )
        return
      }

      // Check TTL
      if (Date.now() - item.createdAt > TTL_MS) {
        showcaseStore.delete(id)
        res.setHeader("Content-Type", "application/json")
        res.status?.(404)?.json?.({
          success: false,
          error: "Showcase expired.",
        }) ||
          res.end?.(
            JSON.stringify({
              success: false,
              error: "Showcase expired.",
            }),
          )
        return
      }

      res.setHeader("Content-Type", "application/json")
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400")
      res.status?.(200)?.json?.(item.data) || res.end?.(JSON.stringify(item.data))
      return
    }

    // ------------------------------------------------------------------------
    // POST: Store showcase
    // ------------------------------------------------------------------------
    if (req.method === "POST") {
      let body: any = req.body
      if (!body) {
        const buffers: Buffer[] = []
        let totalSize = 0
        for await (const chunk of req) {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk
          totalSize += buf.length
          if (totalSize > MAX_PAYLOAD_SIZE) {
            res.setHeader("Content-Type", "application/json")
            res.status?.(413)?.json?.({
              success: false,
              error: "Payload exceeds 4MB size limit.",
            }) ||
              res.end?.(
                JSON.stringify({
                  success: false,
                  error: "Payload exceeds 4MB size limit.",
                }),
              )
            return
          }
          buffers.push(buf)
        }
        const raw = Buffer.concat(buffers).toString("utf-8")
        if (raw) {
          try {
            body = JSON.parse(raw)
          } catch {
            // parse error
          }
        }
      } else if (typeof body === "string") {
        try {
          body = JSON.parse(body)
        } catch {
          // parse error
        }
      }

      if (!body || !body.id || !body.imageDataUrl) {
        res.setHeader("Content-Type", "application/json")
        res.status?.(400)?.json?.({
          success: false,
          error: "Invalid showcase payload. Missing 'id' or 'imageDataUrl'.",
        }) ||
          res.end?.(
            JSON.stringify({
              success: false,
              error:
                "Invalid showcase payload. Missing 'id' or 'imageDataUrl'.",
            }),
          )
        return
      }

      // Store in memory cache
      showcaseStore.set(body.id, {
        data: body,
        createdAt: Date.now(),
      })

      // Clean up old items if store exceeds 200 items
      if (showcaseStore.size > 200) {
        const oldestKey = showcaseStore.keys().next().value
        if (oldestKey) showcaseStore.delete(oldestKey)
      }

      const resp = {
        success: true,
        id: body.id,
        message: "Showcase saved successfully.",
        requestId,
      }

      res.setHeader("Content-Type", "application/json")
      res.status?.(201)?.json?.(resp) || res.end?.(JSON.stringify(resp))
      return
    }

    res.setHeader("Content-Type", "application/json")
    res.status?.(405)?.json?.({ error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ error: "Method not allowed" }))
  } catch (err: any) {
    console.error(`[showcase][${requestId}] Unhandled error:`, err)
    res.setHeader("Content-Type", "application/json")
    res.status?.(500)?.json?.({ error: err?.message || "Internal server error" }) ||
      res.end?.(JSON.stringify({ error: err?.message || "Internal server error" }))
  }
}
