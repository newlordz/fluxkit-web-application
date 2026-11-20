import type { IncomingMessage, ServerResponse } from "node:http"
import fs from "node:fs"
import path from "node:path"

const DB_PATH_1 = path.join(process.cwd(), "data", "masterfile-db.json")
const DB_PATH_2 = path.join(process.cwd(), "data", "fluxkit-db.json")
const TMP_PATH = path.join("/tmp", "masterfile-db.json")

const DEFAULT_GATEWAYS = [
  {
    id: "paystack",
    name: "Paystack",
    description: "Modern payments for Africa and global cards (Cards, Mobile Money, Bank Transfer, Apple Pay).",
    enabled: true,
    mode: "test",
    publicKey: "pk_test_87fb0c5a46528ef690abe24123c62476ea8d996e",
    secretKey: "sk_test_96b831d571847ca59855678b5f671de0ad8a0632",
    webhookSecret: "whsec_paystack_test_hook",
    currency: "GHS",
    notes: "Supports GHS (Ghana Cedis), NGN (Naira), USD, ZAR, KES.",
    testStatus: "untested",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Global credit card processing, Apple Pay, Google Pay, and recurring subscription checkouts.",
    enabled: false,
    mode: "test",
    publicKey: "",
    secretKey: "",
    webhookSecret: "",
    currency: "USD",
    notes: "Supports 135+ global currencies, 3D Secure, and Stripe Billing webhooks.",
    testStatus: "untested",
  },
  {
    id: "flutterwave",
    name: "Flutterwave",
    description: "Pan-African and international checkout gateway supporting cards, USSD, and MPesa.",
    enabled: false,
    mode: "test",
    publicKey: "",
    secretKey: "",
    webhookSecret: "",
    currency: "USD",
    notes: "Requires FLWPUBK and FLWSECK keys from Flutterwave Dashboard.",
    testStatus: "untested",
  },
  {
    id: "custom",
    name: "Custom Payment Webhook / API",
    description: "Connect your self-hosted backend, LemonSqueezy, Paddle, or custom billing API.",
    enabled: false,
    mode: "test",
    publicKey: "",
    secretKey: "",
    endpointUrl: "https://api.yourdomain.com/v1/payments/initialize",
    currency: "USD",
    notes: "Sends HMAC-signed JSON payload to your custom endpoint.",
    testStatus: "untested",
  },
]

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
  return { paymentGateways: DEFAULT_GATEWAYS }
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
      const rawGateways = Array.isArray(db.paymentGateways) && db.paymentGateways.length > 0
        ? db.paymentGateways
        : DEFAULT_GATEWAYS

      // Mask secret keys and webhook secrets to prevent secret leakage in client
      const sanitizedGateways = rawGateways.map((gw: any) => {
        const copy = { ...gw }
        if (copy.secretKey) {
          copy.hasSecretKey = true
          if (copy.secretKey.startsWith("sk_test_")) {
            copy.secretKey = `sk_test_••••••••${copy.secretKey.slice(-4)}`
          } else if (copy.secretKey.startsWith("sk_live_")) {
            copy.secretKey = `sk_live_••••••••${copy.secretKey.slice(-4)}`
          } else {
            copy.secretKey = "••••••••••••••••"
          }
        }
        if (copy.webhookSecret) {
          copy.hasWebhookSecret = true
          copy.webhookSecret = "••••••••••••••••"
        }
        return copy
      })

      const payload = { ok: true, gateways: sanitizedGateways }
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

      const incomingGateways = Array.isArray(body.gateways) ? body.gateways : []
      const existingGateways = Array.isArray(db.paymentGateways) ? db.paymentGateways : DEFAULT_GATEWAYS

      // Preserve stored secrets if incoming payload contains masked tokens
      const preservedGateways = incomingGateways.map((inGw: any) => {
        const existing = existingGateways.find((e: any) => e.id === inGw.id)
        const merged = { ...inGw }
        if (existing) {
          if (merged.secretKey && merged.secretKey.includes("••••")) {
            merged.secretKey = existing.secretKey
          }
          if (merged.webhookSecret && merged.webhookSecret.includes("••••")) {
            merged.webhookSecret = existing.webhookSecret
          }
        }
        return merged
      })

      db.paymentGateways = preservedGateways
      db.updatedAt = new Date().toISOString()
      writeDb(db)

      const payload = { ok: true, count: preservedGateways.length }
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
