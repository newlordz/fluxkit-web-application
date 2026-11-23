import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody, redactSecret, transact } from "../_lib/db.ts"
import { requireAdmin } from "../_lib/auth.ts"

interface PoolRow {
  id: string
  name: string
  provider: string
  category: string | null
  priority: number
  enabled: boolean
  description: string | null
  dashboard_url: string | null
  api_key_secret: string | null
  client_secret: string | null
  endpoint: string | null
  monthly_quota: number
  status: string
  is_free_tier: boolean
  free_credit_reset_day: number
  used_this_month: number | null
}

function toClientShape(row: PoolRow) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    category: row.category,
    priority: row.priority,
    enabled: row.enabled,
    description: row.description,
    dashboardUrl: row.dashboard_url,
    // Credentials stay server-side; the proxies resolve them by provider.
    apiKey: redactSecret(row.api_key_secret),
    clientSecret: redactSecret(row.client_secret),
    endpoint: row.endpoint,
    monthlyQuota: row.monthly_quota,
    usedThisMonth: row.used_this_month ?? 0,
    status: row.status,
    isFreeTier: row.is_free_tier,
    freeCreditResetDay: row.free_credit_reset_day,
  }
}

const SELECT_POOL = `
  select k.id, k.name, k.provider, k.category, k.priority, k.enabled, k.description,
         k.dashboard_url, k.api_key_secret, k.client_secret, k.endpoint, k.monthly_quota,
         k.status, k.is_free_tier, k.free_credit_reset_day,
         (select count(*)::int from api_usage u
           where u.api_key_id = k.id and u.created_at >= date_trunc('month', now())) as used_this_month
    from api_keys k`

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  try {
    if (req.method === "GET") {
      // Which providers are enabled, their quotas and burn-down is operator data.
      const actor = await requireAdmin(req)
      if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })

      const rows = await query<PoolRow>(`${SELECT_POOL} order by k.priority asc`)
      return json(res, 200, { ok: true, apis: rows.map(toClientShape), active: true })
    }

    if (req.method === "POST" || req.method === "PUT") {
      // Writes previously accepted any caller's payload; they need a real session now.
      const actor = await requireAdmin(req)
      if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })

      const body = await readBody(req)
      const incoming = Array.isArray(body?.apis) ? body.apis : null

      if (!incoming) {
        return json(res, 400, { ok: false, error: "Invalid payload: apis array required" })
      }

      await transact(async (sql) => {
        for (const api of incoming) {
          if (!api?.id || !api?.provider) continue
          const maskedIncoming = (value: unknown) =>
            typeof value === "string" && value.includes("••••")

          await sql(
            `insert into api_keys
               (id, name, provider, category, priority, enabled, description, dashboard_url,
                api_key_secret, client_secret, endpoint, monthly_quota, status, is_free_tier,
                free_credit_reset_day, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
             on conflict (id) do update set
               name = excluded.name,
               provider = excluded.provider,
               category = excluded.category,
               priority = excluded.priority,
               enabled = excluded.enabled,
               description = excluded.description,
               dashboard_url = excluded.dashboard_url,
               api_key_secret = coalesce($16, api_keys.api_key_secret),
               client_secret = coalesce($17, api_keys.client_secret),
               endpoint = excluded.endpoint,
               monthly_quota = excluded.monthly_quota,
               status = excluded.status,
               is_free_tier = excluded.is_free_tier,
               free_credit_reset_day = excluded.free_credit_reset_day,
               updated_at = now()`,
            [
              String(api.id),
              String(api.name ?? api.id),
              String(api.provider),
              api.category ?? null,
              Number(api.priority ?? 1),
              api.enabled !== false,
              api.description ?? null,
              api.dashboardUrl ?? null,
              maskedIncoming(api.apiKey) ? null : (api.apiKey ?? null),
              maskedIncoming(api.clientSecret) ? null : (api.clientSecret ?? null),
              api.endpoint ?? null,
              Number(api.monthlyQuota ?? 0),
              String(api.status ?? "active"),
              api.isFreeTier === true,
              Number(api.freeCreditResetDay ?? 1),
              maskedIncoming(api.apiKey) ? null : (api.apiKey ?? null),
              maskedIncoming(api.clientSecret) ? null : (api.clientSecret ?? null),
            ],
          )
        }
      })

      await query(
        `insert into audit_log (actor_user_id, action, target, metadata) values ($1, $2, $3, $4)`,
        [actor.id, "api_pool.update", "api_keys", JSON.stringify({ count: incoming.length })],
      )

      const rows = await query<PoolRow>(`${SELECT_POOL} order by k.priority asc`)
      return json(res, 200, {
        ok: true,
        count: rows.length,
        persisted: true,
        apis: rows.map(toClientShape),
        message: "API pool saved to Postgres.",
      })
    }

    return json(res, 405, { ok: false, error: "Method not allowed" })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
