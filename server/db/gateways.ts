import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody } from "../_lib/db.ts"
import { requireAdmin } from "../_lib/auth.ts"

interface GatewayRow {
  id: string
  name: string
  description: string | null
  enabled: boolean
  mode: string
  public_key: string | null
  secret_key: string | null
  webhook_secret: string | null
  currency: string
  notes: string | null
  endpoint_url: string | null
  test_status: string | null
  last_tested_at: string | null
  test_message: string | null
}

function maskSecret(value: string | null, prefix: string | null): string {
  if (!value) return ""
  const tail = value.slice(-4)
  if (prefix && value.startsWith(prefix)) return `${prefix}••••••••${tail}`
  return "••••••••••••••••"
}

function toClient(row: GatewayRow) {
  const out: Record<string, any> = {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    mode: row.mode,
    publicKey: row.public_key ?? "",
    secretKey: maskSecret(row.secret_key, row.mode === "live" ? "sk_live_" : "sk_test_"),
    hasSecretKey: !!row.secret_key,
    webhookSecret: maskSecret(row.webhook_secret, "whsec_"),
    hasWebhookSecret: !!row.webhook_secret,
    currency: row.currency,
    notes: row.notes,
    testStatus: row.test_status ?? "untested",
    lastTestedAt: row.last_tested_at,
    testMessage: row.test_message,
  }
  if (row.endpoint_url) out.endpointUrl = row.endpoint_url
  return out
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  try {
    if (req.method === "GET") {
      // Gateway mode, key presence and connection test results are operator-only data;
      // checkout itself goes through /api/paystack, which never reads this response.
      const actor = await requireAdmin(req)
      if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })

      const rows = await query<GatewayRow>(
        `select id, name, description, enabled, mode, public_key, secret_key, webhook_secret,
                currency, notes, endpoint_url, test_status, last_tested_at, test_message
           from payment_gateways order by id`,
      )
      return json(res, 200, { ok: true, gateways: rows.map(toClient) })
    }

    if (req.method === "POST" || req.method === "PUT") {
      // Writes previously accepted any caller's payload and could overwrite gateway keys.
      const actor = await requireAdmin(req)
      if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })

      const body = await readBody(req)
      const incoming = Array.isArray(body?.gateways) ? body.gateways : null
      if (!incoming) return json(res, 400, { ok: false, error: "Invalid payload: gateways array required" })

      for (const gw of incoming) {
        if (!gw?.id) continue
        // A masked value coming back from the UI means "unchanged".
        const keepSecret = typeof gw.secretKey === "string" && gw.secretKey.includes("••••")
        const keepWebhook = typeof gw.webhookSecret === "string" && gw.webhookSecret.includes("••••")
        await query(
          `insert into payment_gateways
             (id, name, description, enabled, mode, public_key, secret_key, webhook_secret,
              currency, notes, endpoint_url, test_status, last_tested_at, test_message, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
           on conflict (id) do update set
             name = excluded.name,
             description = excluded.description,
             enabled = excluded.enabled,
             mode = excluded.mode,
             public_key = excluded.public_key,
             secret_key = coalesce($15, payment_gateways.secret_key),
             webhook_secret = coalesce($16, payment_gateways.webhook_secret),
             currency = excluded.currency,
             notes = excluded.notes,
             endpoint_url = excluded.endpoint_url,
             test_status = excluded.test_status,
             last_tested_at = excluded.last_tested_at,
             test_message = excluded.test_message,
             updated_at = now()`,
          [
            String(gw.id),
            String(gw.name ?? gw.id),
            gw.description ?? null,
            gw.enabled === true,
            gw.mode === "live" ? "live" : "test",
            gw.publicKey ?? null,
            keepSecret ? null : (gw.secretKey ?? null),
            keepWebhook ? null : (gw.webhookSecret ?? null),
            gw.currency ?? "GHS",
            gw.notes ?? null,
            gw.endpointUrl ?? null,
            gw.testStatus ?? "untested",
            gw.lastTestedAt ?? null,
            gw.testMessage ?? null,
            keepSecret ? null : (gw.secretKey ?? null),
            keepWebhook ? null : (gw.webhookSecret ?? null),
          ],
        )
      }

      await query(`insert into audit_log (actor_user_id, action, target, metadata) values ($1, $2, $3, $4)`, [
        actor.id,
        "gateways.update",
        "payment_gateways",
        JSON.stringify({ count: incoming.length }),
      ])

      const rows = await query<GatewayRow>(
        `select id, name, description, enabled, mode, public_key, secret_key, webhook_secret,
                currency, notes, endpoint_url, test_status, last_tested_at, test_message
           from payment_gateways order by id`,
      )
      return json(res, 200, { ok: true, gateways: rows.map(toClient), message: "Gateways saved to Postgres." })
    }

    return json(res, 405, { ok: false, error: "Method not allowed" })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
