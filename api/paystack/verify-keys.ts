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

    let secretKey = (body.secretKey || "").trim()
    let publicKey = (body.publicKey || "").trim()

    const db = readDb()
    const gateways = Array.isArray(db.paymentGateways) ? db.paymentGateways : []
    const existingPaystack = gateways.find((g: any) => g.id === "paystack")

    // If secret key is masked (••••) or empty, retrieve real stored secret key
    if (!secretKey || secretKey.includes("••••")) {
      if (existingPaystack?.secretKey && !existingPaystack.secretKey.includes("••••")) {
        secretKey = existingPaystack.secretKey
      } else if (process.env.PAYSTACK_SECRET_KEY) {
        secretKey = process.env.PAYSTACK_SECRET_KEY
      } else {
        secretKey = "sk_test_96b831d571847ca59855678b5f671de0ad8a0632"
      }
    }

    if (!publicKey || publicKey.includes("••••")) {
      if (existingPaystack?.publicKey && !existingPaystack.publicKey.includes("••••")) {
        publicKey = existingPaystack.publicKey
      } else if (process.env.PAYSTACK_PUBLIC_KEY) {
        publicKey = process.env.PAYSTACK_PUBLIC_KEY
      } else {
        publicKey = "pk_test_87fb0c5a46528ef690abe24123c62476ea8d996e"
      }
    }

    if (!secretKey) {
      const payload = { ok: false, message: "Paystack Secret Key is required." }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
      const payload = {
        ok: false,
        message: "Invalid Paystack Secret Key format. Key must start with sk_test_ or sk_live_.",
      }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    // Live call to Paystack API to verify authorization
    const start = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
      const paystackRes = await fetch("https://api.paystack.co/integration/payment_session_timeout", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const latencyMs = Math.max(1, Date.now() - start)
      const paystackData: any = await paystackRes.json().catch(() => ({}))

      if (paystackRes.ok && paystackData.status) {
        const isTest = secretKey.startsWith("sk_test_")
        const mode = isTest ? "test" : "live"
        const successMessage = `Paystack API connected successfully (${latencyMs}ms). Authentication verified in ${mode.toUpperCase()} mode.`

        // Persist successful test status in database
        if (existingPaystack) {
          existingPaystack.testStatus = "success"
          existingPaystack.lastTestedAt = new Date().toISOString()
          existingPaystack.testMessage = successMessage
          if (!body.secretKey?.includes("••••") && body.secretKey) {
            existingPaystack.secretKey = secretKey
          }
          if (publicKey) existingPaystack.publicKey = publicKey
          db.paymentGateways = gateways.map((g: any) => (g.id === "paystack" ? existingPaystack : g))
          writeDb(db)
        }

        const payload = {
          ok: true,
          status: "active",
          mode,
          latencyMs,
          message: successMessage,
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      } else {
        const errorMessage = paystackData?.message || "Invalid Paystack Secret Key or unauthorized."
        
        // Persist failed test status in database
        if (existingPaystack) {
          existingPaystack.testStatus = "failed"
          existingPaystack.lastTestedAt = new Date().toISOString()
          existingPaystack.testMessage = errorMessage
          db.paymentGateways = gateways.map((g: any) => (g.id === "paystack" ? existingPaystack : g))
          writeDb(db)
        }

        const payload = {
          ok: false,
          status: "error",
          message: errorMessage,
        }
        res.status?.(paystackRes.status || 401)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      }
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      const payload = {
        ok: false,
        message: fetchErr.name === "AbortError"
          ? "Paystack API connection timed out after 8s."
          : `Network error reaching Paystack API: ${fetchErr.message || "Failed to fetch"}`,
      }
      res.status?.(504)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }
  } catch (err: any) {
    const payload = { ok: false, message: err?.message || "Server error verifying Paystack keys." }
    res.status?.(500)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  }
}
