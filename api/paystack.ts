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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  const url = req.url || ""
  const action =
    req.query?.action ||
    (url.includes("/initialize")
      ? "initialize"
      : url.includes("/verify")
        ? "verify"
        : "")

  // 1. Verify transaction
  if (action === "verify" || req.method === "GET") {
    try {
      let reference = req.query?.reference
      if (!reference) {
        const parts = url.split("?")[0].split("/")
        const lastPart = parts[parts.length - 1]
        if (lastPart && lastPart !== "verify" && lastPart !== "paystack") {
          reference = lastPart
        }
      }

      if (!reference) {
        const payload = { status: false, message: "Transaction reference is required." }
        res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      }

      let secretKey = process.env.PAYSTACK_SECRET_KEY || ""
      if (!secretKey || secretKey.includes("•")) {
        const db = readDb()
        const existingPaystack = (db.paymentGateways || []).find((g: any) => g.id === "paystack")
        if (existingPaystack?.secretKey && !existingPaystack.secretKey.includes("•")) {
          secretKey = existingPaystack.secretKey
        }
      }

      if (!secretKey || secretKey.includes("•")) {
        secretKey = "sk_test_mock_paystack_secret_key"
      }

      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()
      res.status?.(response.status)?.json?.(data) ||
        res.end?.(JSON.stringify(data))
    } catch (err: any) {
      res.status?.(500)?.json?.({ status: false, message: err.message }) ||
        res.end?.(JSON.stringify({ status: false, message: err.message }))
    }
    return
  }

  // 2. Initialize transaction
  if (action === "initialize" || req.method === "POST") {
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

      if (!email || !amount) {
        res.status?.(400)?.json?.({
          ok: false,
          message: "Email and amount are required to initialize Paystack transaction",
        }) ||
          res.end?.(
            JSON.stringify({
              ok: false,
              message: "Email and amount are required to initialize Paystack transaction",
            }),
          )
        return
      }

      let secretKey = process.env.PAYSTACK_SECRET_KEY || ""
      if (!secretKey || secretKey.includes("•")) {
        const db = readDb()
        const existingPaystack = (db.paymentGateways || []).find((g: any) => g.id === "paystack")
        if (existingPaystack?.secretKey && !existingPaystack.secretKey.includes("•")) {
          secretKey = existingPaystack.secretKey
        }
      }

      if (!secretKey || secretKey.includes("•")) {
        secretKey = "sk_test_mock_paystack_secret_key"
      }

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount,
          currency: currency || "GHS",
          callback_url,
          metadata,
        }),
      })

      const data = await response.json()
      res.status?.(response.status)?.json?.(data) ||
        res.end?.(JSON.stringify(data))
    } catch (err: any) {
      res.status?.(500)?.json?.({ ok: false, message: err.message }) ||
        res.end?.(JSON.stringify({ ok: false, message: err.message }))
    }
    return
  }

  res.status?.(404)?.json?.({ ok: false, message: "Not found" }) ||
    res.end?.(JSON.stringify({ ok: false, message: "Not found" }))
}
