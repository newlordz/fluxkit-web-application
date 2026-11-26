import type { ServerResponse } from "node:http"
import { cors, json, queryAuthoritative, readBody, transact, type ApiRequest } from "../server/_lib/db.ts"
import { getGatewayConfig } from "../server/_lib/providers.ts"
import { requireActiveUser } from "../server/_lib/auth.ts"

async function paystackSecret(): Promise<string> {
  const { secretKey } = await getGatewayConfig("paystack", ["PAYSTACK_SECRET_KEY"])
  return secretKey
}

const CURRENCY_RATES = { USD: 1, GHS: 11.78, NGN: 1500 } as const
type PaystackCurrency = keyof typeof CURRENCY_RATES

type PaystackUser = {
  id: string
  email: string
  name: string
  role: "admin" | "sub-admin" | "user"
  subscription_tier: "standard" | "pro"
  pro_status: "none" | "pending" | "active"
  unlocked_tools: string[]
}

type VerificationOutcome =
  | { status: "already-processed" }
  | { status: "unavailable" }
  | { status: "success"; user?: PaystackUser }

// A checkout started for one price and confirmed for another is the whole difference
// between a subscription and a gift, so the number is read from the stored plan rather
// than from the request that asks to be charged.
async function storedPlanPrice(toolKey: string): Promise<number | null> {
  if (toolKey === "pro-monthly") return 19
  if (toolKey === "pro-yearly") return 190
  const rows = await queryAuthoritative<{ price: number | string }>(
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
  const actor = await requireActiveUser(req)
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
      const [payment] = await queryAuthoritative<{
        user_id: string | null
        email: string | null
        amount: number | string
        currency: string
        tool: string | null
        status: string
      }>(
        `select user_id, email, amount, currency, tool, status from payments
          where reference = $1 and (user_id = $2 or lower(email) = lower($3))
          limit 1`,
        [reference, actor.id, actor.email],
      )
      if (!payment || payment.user_id !== actor.id) {
        return json(res, 403, { status: false, message: "This payment does not belong to your account." })
      }
      if (payment.status === "success") {
        return json(res, 409, { status: false, message: "This payment has already been processed." })
      }

      const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      })
      const data = await response.json()
      const transaction = data?.data
      const paidAmount = Number(transaction?.amount)
      const expectedAmount = Math.round(Number(payment.amount) * 100)
      const matchesCharge =
        transaction?.status === "success" &&
        paidAmount === expectedAmount &&
        String(transaction?.currency || "").toUpperCase() === payment.currency.toUpperCase() &&
        String(transaction?.customer?.email || "").toLowerCase() === String(payment.email || actor.email).toLowerCase()

      if (!matchesCharge) {
        await queryAuthoritative(
          `update payments set status = $2, metadata = metadata || $3::jsonb, updated_at = now()
            where reference = $1 and user_id = $4 and status <> 'success'`,
          [reference, "failed", JSON.stringify({ verified: true }), actor.id],
        )
        return json(res, 402, { ok: false, status: false, message: "Payment is not verified for this purchase." })
      }

      const outcome = await transact(async (sql): Promise<VerificationOutcome> => {
        const [locked] = await sql<{ status: string }>(
          `select status from payments where reference = $1 and user_id = $2 for update`,
          [reference, actor.id],
        )
        if (!locked || locked.status === "success") return { status: "already-processed" }

        const tool = payment.tool || ""
        if (tool === "pro-monthly" || tool === "pro-yearly") {
          await sql(
            `update users set subscription_tier = 'pro', pro_status = 'active', updated_at = now() where id = $1`,
            [actor.id],
          )
        } else if (tool) {
          const [plan] = await sql<{ price: number | string }>(
            `select price from tools where key = $1 and price > 0 limit 1`,
            [tool],
          )
          if (!plan) return { status: "unavailable" }
          await sql(
            `update users
               set unlocked_tools = case when $2 = any(unlocked_tools) then unlocked_tools
                                        else array_append(unlocked_tools, $2) end,
                   updated_at = now()
             where id = $1`,
            [actor.id, tool],
          )
        } else {
          return { status: "unavailable" }
        }

        await sql(
          `update payments set status = 'success', amount = $2, metadata = metadata || $3::jsonb, updated_at = now()
            where reference = $1 and user_id = $4 and status <> 'success'`,
          [reference, Number(payment.amount), JSON.stringify({ verified: true }), actor.id],
        )
        const [user] = await sql<PaystackUser>(
          `select id, email, name, role, subscription_tier, pro_status, unlocked_tools from users where id = $1`,
          [actor.id],
        )
        return { status: "success", user }
      })

      if (outcome.status === "already-processed") {
        return json(res, 409, { status: false, message: "This payment has already been processed." })
      }
      if (outcome.status === "unavailable") {
        return json(res, 409, { ok: false, message: "The purchased plan is no longer available." })
      }

      return json(res, 200, {
        ok: true,
        status: "success",
        reference,
        tool: payment.tool || "",
        user: outcome.user
          ? {
              id: outcome.user.id,
              email: outcome.user.email,
              name: outcome.user.name,
              role: outcome.user.role,
              subscriptionTier: outcome.user.subscription_tier,
              proStatus: outcome.user.pro_status,
              unlockedTools: outcome.user.unlocked_tools,
            }
          : undefined,
      })
    } catch (err) {
      console.error("Paystack verification failed", err)
      return json(res, 502, { status: false, message: "Payment verification is temporarily unavailable. Please try again." })
    }
  }

  if (action === "initialize" || req.method === "POST") {
    const body = await readBody(req)
    const amount = Number(body?.amount)
    const toolKey = typeof body?.tool === "string" ? body.tool : ""
    const currency = String(body?.currency || "GHS").toUpperCase() as PaystackCurrency

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

    if (!(currency in CURRENCY_RATES)) {
      return json(res, 400, { ok: false, message: "Unsupported payment currency." })
    }
    const minimumAmount = Math.round(price * CURRENCY_RATES[currency] * 100)
    if (amount < minimumAmount) {
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
          currency,
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
          metadata: { userId: actor.id, tool: toolKey },
        }),
      })
      const data = await response.json()

      if (data?.status && data?.data?.reference) {
        await queryAuthoritative(
          `insert into payments (reference, user_id, email, amount, currency, gateway, tool, metadata)
           values ($1, $2, $3, $4, $5, 'paystack', $6, $7::jsonb)
           on conflict (reference) do nothing`,
          [
            data.data.reference,
            actor.id,
            actor.email,
            amount / 100,
            currency,
            toolKey,
            JSON.stringify({ plannedPriceUsd: price }),
          ],
        )
      } else {
        return json(res, 502, { ok: false, message: "Paystack did not return a transaction reference." })
      }

      return json(res, response.status, data)
    } catch (err) {
      console.error("Paystack initialization failed", err)
      return json(res, 502, { ok: false, message: "Payment could not be started. Please try again." })
    }
  }

  return json(res, 404, { ok: false, message: "Not found" })
}
