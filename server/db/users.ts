import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody } from "../_lib/db.ts"
import { currentUser, requireRole } from "../_lib/auth.ts"

interface UserRow {
  id: string
  email: string
  name: string
  avatar: string | null
  provider: string
  role: string
  subscription_tier: string
  pro_status: string
  unlocked_tools: string[]
  created_at: string
  last_login_at: string | null
}

const SELECT = `select id, email, name, avatar, provider, role, subscription_tier, pro_status,
                       unlocked_tools, created_at, last_login_at
                  from users`

function toClient(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar ?? undefined,
    provider: row.provider,
    role: row.role,
    subscriptionTier: row.subscription_tier,
    proStatus: row.pro_status,
    unlockedTools: row.unlocked_tools,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  try {
    // Previously any visitor could list every account and could set their own
    // role to "admin" by POSTing a profile. Both are gated now.
    if (req.method === "GET") {
      const actor = await requireRole(req, ["admin", "sub-admin"])
      if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })
      const rows = await query<UserRow>(`${SELECT} order by created_at desc`)
      return json(res, 200, { ok: true, users: rows.map(toClient), count: rows.length })
    }

    if (req.method === "POST" || req.method === "PUT") {
      const actor = await currentUser(req)
      if (!actor) return json(res, 401, { ok: false, error: "Sign-in required" })

      const body = await readBody(req)

      // Admin batch sync: the console pushes the whole registered-account list.
      if (Array.isArray(body?.users)) {
        const actor = await requireRole(req, ["admin", "sub-admin"])
        if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })

        let synced = 0
        for (const u of body.users) {
          if (!u?.id || !u?.email) continue
          try {
            await query(
              `insert into users
                 (id, email, name, avatar, provider, role, subscription_tier, pro_status, unlocked_tools, last_login_at)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               on conflict (id) do update set
                 name = excluded.name,
                 avatar = excluded.avatar,
                 provider = excluded.provider,
                 role = excluded.role,
                 subscription_tier = excluded.subscription_tier,
                 pro_status = excluded.pro_status,
                 unlocked_tools = excluded.unlocked_tools,
                 last_login_at = excluded.last_login_at,
                 updated_at = now()`,
              [
                String(u.id),
                String(u.email).trim().toLowerCase(),
                u.name ?? "",
                u.avatar ?? null,
                u.provider === "google" ? "google" : "email",
                ["admin", "sub-admin", "user"].includes(u.role) ? u.role : "user",
                u.subscriptionTier === "pro" ? "pro" : "standard",
                ["none", "pending", "active"].includes(u.proStatus) ? u.proStatus : "none",
                Array.isArray(u.unlockedTools) ? u.unlockedTools : [],
                u.lastLoginAt ?? null,
              ],
            )
            synced++
          } catch {
            // A duplicate email means two ids claim one account; skip rather than abort the batch.
          }
        }
        return json(res, 200, { ok: true, synced })
      }

      if (body?.action === "delete" && body?.userId) {
        const actor = await requireRole(req, ["admin"])
        if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })
        if (String(body.userId) === actor.id) {
          return json(res, 400, { ok: false, error: "You cannot delete your own account here" })
        }
        await query(`delete from users where id = $1`, [String(body.userId)])
        await query(
          `insert into audit_log (actor_user_id, action, target, metadata) values ($1, $2, $3, $4)`,
          [actor.id, "user.delete", String(body.userId), "{}"],
        )
        return json(res, 200, { ok: true })
      }

      const incoming = body?.user
      if (!incoming || typeof incoming !== "object") {
        return json(res, 400, { ok: false, error: "Invalid payload: user object required" })
      }

      const isAdmin = actor.role === "admin" || actor.role === "sub-admin"
      const targetId = String(incoming.id ?? actor.id)
      if (!isAdmin && targetId !== actor.id) {
        return json(res, 403, { ok: false, error: "You may only update your own profile" })
      }

      // Privileged columns are only writable by an administrator.
      if (isAdmin) {
        await query(
          `update users
             set name = coalesce($2, name),
                 avatar = coalesce($3, avatar),
                 role = coalesce($4, role),
                 subscription_tier = coalesce($5, subscription_tier),
                 pro_status = coalesce($6, pro_status),
                 unlocked_tools = coalesce($7, unlocked_tools),
                 updated_at = now()
           where id = $1`,
          [
            targetId,
            incoming.name ?? null,
            incoming.avatar ?? null,
            incoming.role ?? null,
            incoming.subscriptionTier ?? null,
            incoming.proStatus ?? null,
            Array.isArray(incoming.unlockedTools) ? incoming.unlockedTools : null,
          ],
        )
      } else {
        await query(`update users set name = coalesce($2, name), avatar = coalesce($3, avatar), updated_at = now() where id = $1`, [
          targetId,
          incoming.name ?? null,
          incoming.avatar ?? null,
        ])
      }

      const rows = await query<UserRow>(`${SELECT} where id = $1`, [targetId])
      if (!rows.length) return json(res, 404, { ok: false, error: "User not found" })

      await query(
        `insert into audit_log (actor_user_id, action, target, metadata) values ($1, $2, $3, $4)`,
        [actor.id, isAdmin ? "user.update.privileged" : "user.update.self", targetId, JSON.stringify({ name: incoming.name ?? null })],
      )

      return json(res, 200, { ok: true, user: toClient(rows[0]) })
    }

    if (req.method === "DELETE") {
      const actor = await requireRole(req, ["admin"])
      if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })
      const id = new URLSearchParams(req.url?.split("?")[1] || "").get("id")
      if (!id) return json(res, 400, { ok: false, error: "Query parameter id required" })
      if (id === actor.id) return json(res, 400, { ok: false, error: "You cannot delete your own account here" })
      await query(`delete from users where id = $1`, [id])
      return json(res, 200, { ok: true })
    }

    return json(res, 405, { ok: false, error: "Method not allowed" })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
