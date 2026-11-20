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
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  if (req.method !== "GET") {
    res.status?.(405)?.json?.({ status: false, message: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ status: false, message: "Method not allowed" }))
    return
  }

  try {
    const reference = req.query?.reference || req.url?.split("/").pop()?.split("?")[0]
    if (!reference) {
      const payload = { status: false, message: "Transaction reference is required." }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    let secretKey = process.env.PAYSTACK_SECRET_KEY || ""
    if (!secretKey) {
      const db = readDb()
      const existingPaystack = (db.paymentGateways || []).find((g: any) => g.id === "paystack")
      if (existingPaystack?.secretKey && !existingPaystack.secretKey.includes("••••")) {
        secretKey = existingPaystack.secretKey
      } else {
        secretKey = "sk_test_96b831d571847ca59855678b5f671de0ad8a0632"
      }
    }

    if (!secretKey) {
      const payload = { status: false, message: "Paystack Secret Key is not configured." }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      },
    )

    const verifyData = await verifyRes.json().catch(() => ({}))
    res.status?.(verifyRes.status)?.json?.(verifyData) || res.end?.(JSON.stringify(verifyData))
  } catch (err: any) {
    const payload = { status: false, message: err?.message || "Failed to verify Paystack transaction." }
    res.status?.(500)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  }
}
