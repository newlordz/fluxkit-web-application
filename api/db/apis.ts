import type { IncomingMessage, ServerResponse } from "node:http"
import fs from "node:fs"
import path from "node:path"

const DB_PATH_1 = path.join(process.cwd(), "data", "masterfile-db.json")
const DB_PATH_2 = path.join(process.cwd(), "data", "fluxkit-db.json")
const TMP_PATH = path.join("/tmp", "masterfile-db.json")

function readDb(): any {
  // 1. Check temporary serverless storage
  try {
    if (fs.existsSync(TMP_PATH)) {
      const content = fs.readFileSync(TMP_PATH, "utf8")
      return JSON.parse(content)
    }
  } catch {}

  // 2. Check bundled database files
  for (const p of [DB_PATH_1, DB_PATH_2]) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8")
        return JSON.parse(content)
      }
    } catch {}
  }
  return { apiPool: [] }
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
      const rawApis = Array.isArray(db.apiPool) ? db.apiPool : []

      if (isAdmin) {
        // Authenticated admin receives full unmasked keys for management and sync
        const payload = { ok: true, apis: rawApis, isAdmin: true }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      }

      // Anonymous / public callers receive sanitized tokens to prevent secret leakage
      const sanitizedApis = rawApis.map((api: any) => {
        const copy = { ...api }
        if (copy.clientSecret) {
          copy.clientSecret = "••••••••••••••••"
          copy.hasClientSecret = true
        }
        if (copy.apiKey && copy.apiKey.length > 8) {
          copy.apiKey = `${copy.apiKey.slice(0, 4)}••••••••${copy.apiKey.slice(-4)}`
          copy.hasApiKey = true
        } else if (copy.apiKey) {
          copy.hasApiKey = true
        }
        return copy
      })

      const payload = { ok: true, apis: sanitizedApis, isAdmin: false }
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
