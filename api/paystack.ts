import type { ServerResponse } from "node:http"
import { cors, json, query, readBody, type ApiRequest } from "./_lib/db"
import { getGatewayConfig } from "./_lib/providers"
import { currentUser } from "./_lib/auth"

async function paystackSecret(): Promise<string> {
  const { secretKey } = await getGatewayConfig("paystack", ["PAYSTACK_SECRET_KEY"])
  return secretKey
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  const url = req.url || ""
  const params = new URL(url || "/", "http://localhost").searchParams
  const action =
    params.get("action") ||
    req.query?.action ||
    (url.includes("/initialize") ? "initialize" : url.includes("/verify") ? "verify" : "")

  const secretKey = await paystackSecret()
  if (!secretKey) {
    return json(res, 503, {
      ok: false,
      message: "Payments are not configured. Add a Paystack secret key in the admin console.",
    })
  }

  if (action === "verify" || req.method === "GET") {
    let reference = params.get("reference") || req.query?.reference || ""
    if (!reference) {
      const lastPart = url.split("?")[0].split("/").pop()
      if (lastPart && lastPart !== "verify" && lastPart !== "paystack") reference = lastPart
    }
    if (!reference) return json(res, 400, { status: false, message: "Transaction reference is required." })

    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      })
      const data = await response.json()

      const status = data?.data?.status || "failed"
      await query(
        `update payments set status = $2, amount = coalesce($3, amount), metadata = metadata || $4::jsonb,
                updated_at = now()
          where reference = $1`,
        [reference, status, data?.data?.amount ? Number(data.data.amount) / 100 : null, JSON.stringify({ verified: data?.data || {} })],
      )

      return json(res, response.status, data)
    } catch (err: any) {
      return json(res, 502, { status: false, message: err?.message })
    }
  }

  if (action === "initialize" || req.method === "POST") {
    const body = await readBody(req)
    const email = typeof body?.email === "string" ? body.email : ""
    const amount = Number(body?.amount)

    if (!email || !Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { ok: false, message: "A valid email and amount are required." })
    }

    try {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          amount,
          currency: body?.currency || "GHS",
          callback_url: body?.callback_url,
          metadata: body?.metadata,
        }),
      })
      const data = await response.json()

      if (data?.status && data?.data?.reference) {
        const actor = await currentUser(req)
        await query(
          `insert into payments (reference, user_id, email, amount, currency, gateway, tool, metadata)
           values ($1, $2, $3, $4, $5, 'paystack', $6, $7::jsonb)
           on conflict (reference) do nothing`,
          [
            data.data.reference,
            actor?.id ?? null,
            email,
            amount / 100,
            body?.currency || "GHS",
            typeof body?.tool === "string" ? body.tool : null,
            JSON.stringify(body?.metadata ?? {}),
          ],
        ).catch(() => null)
      }

      return json(res, response.status, data)
    } catch (err: any) {
      return json(res, 502, { ok: false, message: err?.message })
    }
  }

  return json(res, 404, { ok: false, message: "Not found" })
}
