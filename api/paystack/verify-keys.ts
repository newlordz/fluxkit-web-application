import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody } from "../../server/_lib/db.ts"
import { getGatewayConfig } from "../../server/_lib/providers.ts"
import { requireAdmin } from "../../server/_lib/auth.ts"

const isMasked = (value: string) => !value || value.includes("•")

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" })

  const actor = await requireAdmin(req)
  if (!actor) return json(res, 401, { ok: false, message: "Administrator sign-in required" })

  try {
    const body = await readBody(req)
    const stored = await getGatewayConfig("paystack", ["PAYSTACK_SECRET_KEY"])

    const submittedSecret = String(body?.secretKey || "").trim()
    const submittedPublic = String(body?.publicKey || "").trim()

    const secretKey = isMasked(submittedSecret) ? stored.secretKey : submittedSecret
    const publicKey = isMasked(submittedPublic) ? stored.publicKey : submittedPublic

    if (!/^sk_(test|live)_/.test(secretKey)) {
      return json(res, 400, {
        ok: false,
        message: "Invalid Paystack Secret Key format. Must start with sk_test_ or sk_live_.",
      })
    }

    const persist = async (status: "success" | "failed", message: string) => {
      await query(
        `insert into payment_gateways
            (id, name, test_status, test_message, last_tested_at, updated_at, secret_key, public_key)
          values ('paystack', 'Paystack', $1, $2, now(), now(), $3, $4)
          on conflict (id) do update set
            test_status = excluded.test_status,
            test_message = excluded.test_message,
            last_tested_at = now(),
            updated_at = now(),
            secret_key = coalesce(excluded.secret_key, payment_gateways.secret_key),
            public_key = coalesce(excluded.public_key, payment_gateways.public_key)`,
        [
          status,
          message,
          isMasked(submittedSecret) ? null : submittedSecret,
          isMasked(submittedPublic) ? null : submittedPublic,
        ],
      )
    }

    const startTime = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
      const paystackRes = await fetch("https://api.paystack.co/integration/payment_session_timeout", {
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
      })
      const latencyMs = Math.max(1, Date.now() - startTime)
      const paystackData: any = await paystackRes.json().catch(() => ({}))

      if (paystackRes.ok && paystackData.status) {
        const message = `Paystack API connected successfully (${latencyMs}ms). Authentication verified in ${
          secretKey.startsWith("sk_test_") ? "TEST" : "LIVE"
        } mode.`
        await persist("success", message)
        return json(res, 200, { ok: true, latencyMs, message })
      }

      const message = paystackData?.message || "Paystack authorization failed with provided keys."
      await persist("failed", message)
      return json(res, 401, { ok: false, message })
    } catch (fetchErr: any) {
      const message =
        fetchErr?.name === "AbortError"
          ? "Paystack API connection timed out after 8s."
          : `Failed to reach Paystack server: ${fetchErr?.message || "network error"}`
      return json(res, 504, { ok: false, message })
    } finally {
      clearTimeout(timeout)
    }
  } catch (err: any) {
    return json(res, 500, { ok: false, message: `Failed to reach Paystack server: ${err?.message}` })
  }
}
