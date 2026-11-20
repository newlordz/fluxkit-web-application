import fs from "node:fs"
import path from "node:path"

const DB_PATH_1 = path.join(process.cwd(), "data", "masterfile-db.json")
const DB_PATH_2 = path.join(process.cwd(), "data", "fluxkit-db.json")
const TMP_PATH = path.join("/tmp", "masterfile-db.json")

function readDb(): any {
  try {
    if (fs.existsSync(TMP_PATH)) {
      return JSON.parse(fs.readFileSync(TMP_PATH, "utf8"))
    }
  } catch {}

  for (const p of [DB_PATH_1, DB_PATH_2]) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8"))
      }
    } catch {}
  }
  return { apiPool: [] }
}

function writeDb(data: any): boolean {
  let ok = false
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), "utf8")
    ok = true
  } catch {}

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
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  try {
    const db = readDb()

    if (req.method === "GET") {
      const rawApis = Array.isArray(db.apiPool) ? db.apiPool : []
      const sanitizedApis = rawApis.map((api: any) => {
        const copy = { ...api }
        if (copy.clientSecret) {
          copy.clientSecret = "••••••••••••••••"
          copy.hasClientSecret = true
        }
        if (copy.apiKey && copy.apiKey.length > 8) {
          copy.apiKey = `${copy.apiKey.slice(0, 4)}••••••••${copy.apiKey.slice(-4)}`
          copy.hasApiKey = true
        }
        return copy
      })

      const payload = { ok: true, apis: sanitizedApis }
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
      writeDb(db)

      const payload = { ok: true, count: preservedApis.length }
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
