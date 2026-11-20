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
  return {}
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  if (req.method !== "POST") {
    res.status?.(405)?.json?.({ ok: false, message: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ ok: false, message: "Method not allowed" }))
    return
  }

  try {
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

    const { email, amount, currency, callback_url, metadata } = body
    let secretKey = (body.secretKey || "").trim()

    if (!secretKey || secretKey.includes("••••")) {
      const db = readDb()
      const existingPaystack = (db.paymentGateways || []).find((g: any) => g.id === "paystack")
      if (existingPaystack?.secretKey && !existingPaystack.secretKey.includes("••••")) {
        secretKey = existingPaystack.secretKey
      } else if (process.env.PAYSTACK_SECRET_KEY) {
        secretKey = process.env.PAYSTACK_SECRET_KEY
      } else {
        secretKey = "sk_test_96b831d571847ca59855678b5f671de0ad8a0632"
      }
    }

    if (!secretKey) {
      const payload = { status: false, message: "Paystack Secret Key is not configured." }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount,
        currency: currency || "GHS",
        callback_url: callback_url || undefined,
        metadata: metadata || undefined,
      }),
    })

    const initData = await initRes.json().catch(() => ({}))
    res.status?.(initRes.status)?.json?.(initData) || res.end?.(JSON.stringify(initData))
  } catch (err: any) {
    const payload = { status: false, message: err?.message || "Failed to initialize Paystack transaction." }
    res.status?.(500)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  }
}
