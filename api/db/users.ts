import type { IncomingMessage, ServerResponse } from "node:http"
import fs from "node:fs"
import path from "node:path"

const DB_PATH_1 = path.join(process.cwd(), "data", "masterfile-db.json")
const DB_PATH_2 = path.join(process.cwd(), "data", "fluxkit-db.json")
const TMP_PATH = path.join("/tmp", "masterfile-db.json")

export interface StoredUserAccount {
  id: string
  name: string
  email: string
  avatar?: string
  provider: "google" | "email"
  role: "admin" | "sub-admin" | "user"
  subscriptionTier: "standard" | "pro"
  proStatus: "none" | "pending" | "active"
  unlockedTools?: string[]
  createdAt: string
  lastLoginAt: string
  message?: string
}

function readDb(): any {
  // 1. Check temporary serverless storage
  try {
    if (fs.existsSync(TMP_PATH)) {
      const content = fs.readFileSync(TMP_PATH, "utf8")
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed.users)) {
        parsed.users = []
      }
      return parsed
    }
  } catch {}

  // 2. Check bundled database files
  for (const p of [DB_PATH_1, DB_PATH_2]) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8")
        const parsed = JSON.parse(content)
        if (!Array.isArray(parsed.users)) {
          parsed.users = []
        }
        return parsed
      }
    } catch {}
  }

  return { users: [] }
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
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST,PUT,DELETE")
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
    if (!Array.isArray(db.users)) {
      db.users = []
    }

    if (req.method === "GET") {
      const payload = { ok: true, users: db.users, count: db.users.length }
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

      // Handle single user upsert
      if (body.user && typeof body.user === "object") {
        const incoming = body.user as StoredUserAccount
        const idx = db.users.findIndex(
          (u: any) =>
            u.id === incoming.id ||
            u.email?.trim().toLowerCase() === incoming.email?.trim().toLowerCase(),
        )
        if (idx >= 0) {
          db.users[idx] = { ...db.users[idx], ...incoming }
        } else {
          db.users.push(incoming)
        }
      }

      // Handle multiple users upsert
      if (Array.isArray(body.users)) {
        for (const incoming of body.users) {
          if (!incoming || !incoming.email) continue
          const idx = db.users.findIndex(
            (u: any) =>
              u.id === incoming.id ||
              u.email?.trim().toLowerCase() === incoming.email?.trim().toLowerCase(),
          )
          if (idx >= 0) {
            db.users[idx] = { ...db.users[idx], ...incoming }
          } else {
            db.users.push(incoming)
          }
        }
      }

      // Handle user deletion
      if (body.action === "delete" && body.userId) {
        db.users = db.users.filter((u: any) => u.id !== body.userId)
      }

      db.updatedAt = new Date().toISOString()
      const saved = writeDb(db)

      const payload = {
        ok: true,
        users: db.users,
        count: db.users.length,
        persisted: saved,
      }
      res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    if (req.method === "DELETE") {
      let body: any = req.body
      if (!body) {
        const buffers: Buffer[] = []
        for await (const chunk of req) {
          buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
        }
        const str = Buffer.concat(buffers).toString("utf8")
        body = JSON.parse(str || "{}")
      }
      if (body?.userId) {
        db.users = db.users.filter((u: any) => u.id !== body.userId)
        writeDb(db)
      }
      const payload = { ok: true, users: db.users, count: db.users.length }
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
