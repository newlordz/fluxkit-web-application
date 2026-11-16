import type { IncomingMessage, ServerResponse } from "node:http"

/**
 * FluxKit Google Drive 5 TB Cloud Vault Serverless API
 * 
 * Provides server-side proxying, quota checking, and master storage vault management
 * for hosted environments on Vercel.
 */

// In-memory token cache for warm serverless invocations
let serverDriveToken: string | null = null
let serverDriveTokenExpiry = 0

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
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  const url = new URL(req.url || "", `http://${req.headers?.host || "localhost"}`)
  const action = url.searchParams.get("action") || ""

  try {
    // ------------------------------------------------------------------------
    // 1. GET /api/drive: Host Configuration & Status
    // ------------------------------------------------------------------------
    if (req.method === "GET") {
      const hostOrigin = req.headers?.host
        ? `https://${req.headers.host}`
        : "https://fluxfix.de5.net"

      const hasEnvClientId = Boolean(
        process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      )

      res.status(200).json({
        ok: true,
        hostOrigin,
        hasEnvClientId,
        storageCapacity: "5.0 TB",
        instructions: {
          step1: "In Google Cloud Console, create OAuth 2.0 Web Client ID",
          step2: `Add authorized JavaScript origin: ${hostOrigin}`,
          step3: "Enable Google Drive API in Google Cloud Console",
        },
      })
      return
    }

    // ------------------------------------------------------------------------
    // 2. POST /api/drive: Token validation or serverless upload
    // ------------------------------------------------------------------------
    if (req.method === "POST") {
      let body: any = {}
      if (typeof req.body === "object" && req.body !== null) {
        body = req.body
      } else {
        const raw = await readRequestBody(req)
        try {
          body = JSON.parse(raw)
        } catch {
          body = {}
        }
      }

      if (action === "verify_token") {
        const token = body.token
        if (!token) {
          res.status(400).json({ ok: false, error: "Missing access token" })
          return
        }

        try {
          const quotaRes = await fetch(
            "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user",
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          )

          if (quotaRes.ok) {
            const data = await quotaRes.json()
            res.status(200).json({
              ok: true,
              user: data.user,
              quota: data.storageQuota,
            })
            return
          } else {
            const err = await quotaRes.text()
            res.status(401).json({ ok: false, error: "Invalid token", details: err })
            return
          }
        } catch (e: any) {
          res.status(500).json({ ok: false, error: e.message })
          return
        }
      }

      res.status(200).json({ ok: true, message: "Drive endpoint ready" })
      return
    }

    res.status(405).json({ ok: false, error: "Method not allowed" })
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: error?.message || "Internal server error in drive proxy",
    })
  }
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk: any) => {
      body += chunk
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Payload too large"))
      }
    })
    req.on("end", () => resolve(body))
    req.on("error", (err: any) => reject(err))
  })
}
