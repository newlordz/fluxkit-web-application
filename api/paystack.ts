import type { ServerResponse } from "node:http"
import { cors, json, query, readBody, type ApiRequest } from "../server/_lib/db.ts"
import { getGatewayConfig } from "../server/_lib/providers.ts"
import { currentUser } from "../server/_lib/auth.ts"

async function paystackSecret(): Promise<string> {
  const { secretKey } = await getGatewayConfig("paystack", ["PAYSTACK_SECRET_KEY"])
  return secretKey
}

// A checkout started for one price and confirmed for another is the whole difference
// between a subscription and a gift, so the number is read from the stored plan rather
// than from the request that asks to be charged.
async function storedPlanPrice(toolKey: string): Promise<number | null> {
  const rows = await query<{ price: number | string }>(
    `select price from tools where key = $1 limit 1`,
    [toolKey],
  )
  if (!rows.length) return null
  const price = Number(rows[0].price)
  return Number.isFinite(price) ? price : null
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  // Both actions move money or money's records, so both belong to a signed-in visitor.
  const actor = await currentUser(req)
  if (!actor) {
    return json(res, 401, {
      ok: false,
      status: false,
      message: "Sign in is required to start or check a payment.",
    })
  }

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

      // Only the person the charge was made for may settle its record: an outsider who
      // guesses a reference cannot turn their own row green, let alone someone else's.
      await query(
        `update payments set status = $2, amount = coalesce($3, amount), metadata = metadata || $4::jsonb,
                updated_at = now()
          where reference = $1 and (user_id = $5 or lower(email) = lower($6))`,
        [
          reference,
          status,
          data?.data?.amount ? Number(data.data.amount) / 100 : null,
          JSON.stringify({ verified: data?.data || {} }),
          actor.id,
          actor.email,
        ],
      )

      return json(res, response.status, data)
    } catch (err: any) {
      return json(res, 502, { status: false, message: err?.message })
    }
  }

  if (action === "initialize" || req.method === "POST") {
    const body = await readBody(req)
    const amount = Number(body?.amount)
    const toolKey = typeof body?.tool === "string" ? body.tool : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { ok: false, message: "A valid amount is required." })
    }

    if (!toolKey) {
      return json(res, 400, { ok: false, message: "Name the plan being paid for." })
    }

    const price = await storedPlanPrice(toolKey)
    if (price === null) {
      return json(res, 400, { ok: false, message: "That plan is not on the price list." })
    }
    if (price <= 0) {
      return json(res, 400, { ok: false, message: "That tool is included in your plan and needs no payment." })
    }

    // Amounts are sent in the gateway's own currency, and every currency the gateway
    // charges in is worth more than a dollar in subunits, so the dollar price is the
    // floor an underpayment cannot get past.
    if (amount < Math.round(price * 100)) {
      return json(res, 400, { ok: false, message: "The amount sent is below the listed price of this plan." })
    }

    // Paystack returns the browser here after the charge. A caller-chosen address is a
    // redirect served under this site's name, so only an address on this same host is
    // honoured; anything else falls back to the redirect configured on the Paystack
    // domain itself.
    let callbackUrl: string | undefined
    if (typeof body?.callback_url === "string" && body.callback_url) {
      let target: URL
      try {
        target = new URL(body.callback_url)
      } catch {
        return json(res, 400, { ok: false, message: "The return address is not a valid URL." })
      }
      if (target.host !== (req.headers.host || "")) {
        return json(res, 400, { ok: false, message: "Payments can only return to this site." })
      }
      callbackUrl = target.origin + target.pathname
    }

    try {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // The address is the account's own, so a payment cannot be booked against a
          // mailbox the visitor typed in.
          email: actor.email,
          amount,
          currency: body?.currency || "GHS",
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
          metadata: { userId: actor.id, tool: toolKey },
        }),
      })
      const data = await response.json()

      if (data?.status && data?.data?.reference) {
        await query(
          `insert into payments (reference, user_id, email, amount, currency, gateway, tool, metadata)
           values ($1, $2, $3, $4, $5, 'paystack', $6, $7::jsonb)
           on conflict (reference) do nothing`,
          [
            data.data.reference,
            actor.id,
            actor.email,
            amount / 100,
            body?.currency || "GHS",
            toolKey,
            JSON.stringify({ plannedPriceUsd: price }),
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
