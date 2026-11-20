import type { IncomingMessage, ServerResponse } from "node:http"
import fs from "node:fs"
import path from "node:path"

const DB_PATH_1 = path.join(process.cwd(), "data", "masterfile-db.json")
const DB_PATH_2 = path.join(process.cwd(), "data", "fluxkit-db.json")
const TMP_PATH = path.join("/tmp", "masterfile-db.json")

// Default admin state matching database
const DEFAULT_ADMIN = {
  id: "usr_admin_default",
  name: "Masterfilepro Administrator",
  email: "admin@masterfilepro.com",
  salt: "salt_mwnoc4fj_x1mn5i",
  hash: "228b21ca7b585a77e974223be2279fea79785f132b3687f3c7655c548a3f5c85",
  role: "admin",
  subscriptionTier: "pro",
  proStatus: "active",
  updatedAt: "2026-11-19T14:57:23.342Z",
  lastPasswordChange: "2026-11-19T14:57:23.342Z",
}

// Default baseline tool monetization tiers and prices (active globally across all Vercel visitors)
export const DEFAULT_TOOL_TIERS: Record<string, "standard" | "pro"> = {
  ocr: "pro",
  "audio-text": "pro",
  "convert-compress": "pro",
  "merge-compress": "pro",
  "split-compress": "pro",
  "visitor-pass": "pro",
}

export const DEFAULT_TOOL_PRICES: Record<string, number> = {
  ocr: 4.99,
  "audio-text": 4.99,
  "convert-compress": 4.99,
  "merge-compress": 4.99,
  "split-compress": 4.99,
  "visitor-pass": 4.99,
}

function readDb(): any {
  // 1. Check temporary serverless storage
  try {
    if (fs.existsSync(TMP_PATH)) {
      const content = fs.readFileSync(TMP_PATH, "utf8")
      const parsed = JSON.parse(content)
      parsed.toolTiers = { ...DEFAULT_TOOL_TIERS, ...(parsed.toolTiers || {}) }
      parsed.toolPrices = { ...DEFAULT_TOOL_PRICES, ...(parsed.toolPrices || {}) }
      return parsed
    }
  } catch {}

  // 2. Check bundled database files
  for (const p of [DB_PATH_1, DB_PATH_2]) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8")
        const parsed = JSON.parse(content)
        parsed.toolTiers = { ...DEFAULT_TOOL_TIERS, ...(parsed.toolTiers || {}) }
        parsed.toolPrices = { ...DEFAULT_TOOL_PRICES, ...(parsed.toolPrices || {}) }
        return parsed
      }
    } catch {}
  }
  return {
    admin: DEFAULT_ADMIN,
    toolTiers: { ...DEFAULT_TOOL_TIERS },
    toolPrices: { ...DEFAULT_TOOL_PRICES },
  }
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
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  try {
    const db = readDb()

    if (req.method === "GET") {
      const admin = db.admin || DEFAULT_ADMIN
      const payload = {
        ok: true,
        admin: {
          id: admin.id || "usr_admin_default",
          name: admin.name || "Masterfilepro Administrator",
          email: admin.email || "admin@masterfilepro.com",
          salt: admin.salt || DEFAULT_ADMIN.salt,
          hash: admin.hash || DEFAULT_ADMIN.hash,
          role: "admin",
          subscriptionTier: "pro",
          proStatus: "active",
          updatedAt: admin.updatedAt || new Date().toISOString(),
        },
        toolTiers: db.toolTiers || {},
        toolPrices: db.toolPrices || {},
        database: {
          syncedAt: admin.updatedAt || new Date().toISOString(),
        },
      }
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
        const data = Buffer.concat(buffers).toString("utf-8")
        if (data) {
          try {
            body = JSON.parse(data)
          } catch {}
        }
      } else if (typeof body === "string") {
        try {
          body = JSON.parse(body)
        } catch {}
      }

      if (!body) {
        res.status?.(400)?.json?.({ ok: false, error: "Invalid payload: request body required" }) ||
          res.end?.(JSON.stringify({ ok: false, error: "Invalid payload: request body required" }))
        return
      }

      const now = new Date().toISOString()
      let updatedAdmin = false
      let updatedTiers = false

      // Handle Tool Tiers & Prices synchronization
      if (body.toolTiers && typeof body.toolTiers === "object") {
        db.toolTiers = { ...(db.toolTiers || {}), ...body.toolTiers }
        updatedTiers = true
      }
      if (body.toolPrices && typeof body.toolPrices === "object") {
        db.toolPrices = { ...(db.toolPrices || {}), ...body.toolPrices }
        updatedTiers = true
      }

      // Handle Admin credential synchronization - lock status, role, tier, name
      if (body.email) {
        db.admin = {
          ...(db.admin || DEFAULT_ADMIN),
          name: db.admin?.name || "Masterfilepro Administrator",
          email: body.email.trim().toLowerCase(),
          role: "admin",
          subscriptionTier: "pro",
          proStatus: "active",
          salt: body.salt || db.admin?.salt || DEFAULT_ADMIN.salt,
          hash: body.hash || db.admin?.hash || DEFAULT_ADMIN.hash,
          updatedAt: now,
          lastPasswordChange: body.newPassword ? now : db.admin?.lastPasswordChange,
        }
        updatedAdmin = true
      }

      if (!updatedAdmin && !updatedTiers) {
        res.status?.(400)?.json?.({ ok: false, error: "Invalid payload: email or tool tiers required" }) ||
          res.end?.(JSON.stringify({ ok: false, error: "Invalid payload: email or tool tiers required" }))
        return
      }

      writeDb(db)

      const responsePayload = {
        ok: true,
        message: updatedTiers
          ? "Tool tiers and pricing successfully synchronized with server database."
          : "Admin credentials successfully synchronized with server database.",
        admin: db.admin,
        toolTiers: db.toolTiers || {},
        toolPrices: db.toolPrices || {},
      }
      res.status?.(200)?.json?.(responsePayload) ||
        res.end?.(JSON.stringify(responsePayload))
      return
    }

    res.status?.(405)?.json?.({ ok: false, error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ ok: false, error: "Method not allowed" }))
  } catch (err: any) {
    res.status?.(500)?.json?.({ ok: false, error: err?.message || "Internal server error" }) ||
      res.end?.(JSON.stringify({ ok: false, error: err?.message || "Internal server error" }))
  }
}
