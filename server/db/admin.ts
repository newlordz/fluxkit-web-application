import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody, transact } from "../_lib/db"
import { requireAdmin } from "../_lib/auth"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  try {
    if (req.method === "GET") {
      // Tiers and prices are public product configuration; the admin record is not.
      const tools = await query<any>(`select key, tier, price from tools`)
      const toolTiers: Record<string, string> = {}
      const toolPrices: Record<string, number> = {}
      for (const t of tools) {
        toolTiers[t.key] = t.tier
        toolPrices[t.key] = Number(t.price)
      }

      const actor = await requireAdmin(req)
      let admin = null
      if (actor) {
        const [row] = await query<any>(
          `select id, name, email, role, subscription_tier, pro_status, must_reset_password
             from users where role = 'admin' order by updated_at desc limit 1`,
        )
        admin = row
          ? {
              id: row.id,
              name: row.name,
              email: row.email,
              role: row.role,
              subscriptionTier: row.subscription_tier,
              proStatus: row.pro_status,
              mustResetPassword: row.must_reset_password,
            }
          : null
      }

      return json(res, 200, {
        ok: true,
        admin,
        toolTiers,
        toolPrices,
        database: { engine: "supabase-postgres", syncedAt: new Date().toISOString() },
      })
    }

    if (req.method === "POST" || req.method === "PUT") {
      const actor = await requireAdmin(req)
      if (!actor) return json(res, 403, { ok: false, error: "Administrator sign-in required" })

      const body = await readBody(req)
      if (!body) return json(res, 400, { ok: false, error: "Invalid payload: request body required" })

      const now = new Date().toISOString()

      if (body.toolTiers && typeof body.toolTiers === "object") {
        await transact(async (sql) => {
          for (const [key, tier] of Object.entries(body.toolTiers as Record<string, string>)) {
            if (tier !== "standard" && tier !== "pro") continue
            await sql(
              `insert into tools (key, tier, updated_at) values ($1, $2, now())
               on conflict (key) do update set tier = excluded.tier, updated_at = now()`,
              [key, tier],
            )
          }
        })
      }

      if (body.toolPrices && typeof body.toolPrices === "object") {
        await transact(async (sql) => {
          for (const [key, price] of Object.entries(body.toolPrices as Record<string, number>)) {
            const value = Number(price)
            if (!Number.isFinite(value) || value < 0) continue
            await sql(
              `insert into tools (key, price, updated_at) values ($1, $2, now())
               on conflict (key) do update set price = excluded.price, updated_at = now()`,
              [key, value],
            )
          }
        })
      }

      // Credentials are never edited through this endpoint; salt/hash from the client is ignored.
      if (body.email || body.name) {
        await query(
          `update users
             set email = coalesce($2, email),
                 name = coalesce($3, name),
                 updated_at = now()
           where id = $1`,
          [actor.id, body.email ? String(body.email).trim().toLowerCase() : null, body.name ? String(body.name) : null],
        )
      }

      await query(`insert into audit_log (actor_user_id, action, target, metadata) values ($1, $2, $3, $4)`, [
        actor.id,
        "admin.settings.update",
        "tools",
        JSON.stringify({ toolTiers: body.toolTiers ?? null, toolPrices: body.toolPrices ?? null, at: now }),
      ])

      const tools = await query<any>(`select key, tier, price from tools`)
      const toolTiers: Record<string, string> = {}
      const toolPrices: Record<string, number> = {}
      for (const t of tools) {
        toolTiers[t.key] = t.tier
        toolPrices[t.key] = Number(t.price)
      }

      return json(res, 200, {
        ok: true,
        message: "Tool tiers and pricing saved to Postgres.",
        toolTiers,
        toolPrices,
      })
    }

    return json(res, 405, { ok: false, error: "Method not allowed" })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
