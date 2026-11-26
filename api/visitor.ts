import type { ServerResponse } from "node:http"
import { cors, json, queryAuthoritative, readBody, type ApiRequest } from "../server/_lib/db.ts"
import { requireActiveUser, requireAdmin } from "../server/_lib/auth.ts"

const PASS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/
const MAX_RECORDS = 2000
const MAX_PAYLOAD_SIZE = 6 * 1024 * 1024

const STATUS_PATTERN = /^(Checked-In|Checked-Out|Expected)$/

function recordIdOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  try {
    if (req.method === "GET") {
      const actor = await requireActiveUser(req)
      if (!actor) return json(res, 401, { ok: false, error: "Sign-in required to read the visitor log." })

      const isAdmin = actor.role === "admin" || actor.role === "sub-admin"
      const rows = await queryAuthoritative<{ id: string; payload: any }>(
        `select id, payload from visitor_passes
          ${isAdmin ? "" : "where owner_user_id = $1"}
          order by created_at desc
          limit 500`,
        isAdmin ? [] : [actor.id],
      )

      return json(res, 200, {
        ok: true,
        records: rows.map((row) => ({ ...row.payload, id: row.id })),
      })
    }

    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

    const actor = await requireActiveUser(req)
    if (!actor) return json(res, 401, { ok: false, error: "Sign-in required." })

    const body = await readBody(req, MAX_PAYLOAD_SIZE)
    const action = String(body?.action || "")
    const id = recordIdOf(body?.record?.id ?? body?.id)

    if (!PASS_ID_PATTERN.test(id)) {
      return json(res, 400, { ok: false, error: "Missing or malformed visitor pass id." })
    }

    if (action === "remove") {
      const admin = await requireAdmin(req)
      if (!admin) return json(res, 403, { ok: false, error: "Administrator sign-in required." })

      await queryAuthoritative(`delete from visitor_passes where id = $1`, [id])
      await queryAuthoritative(`insert into audit_log (actor_user_id, action, target) values ($1, 'visitor.pass.remove', $2)`, [
        admin.id,
        id,
      ])
      return json(res, 200, { ok: true, id })
    }

    if (action !== "save") return json(res, 400, { ok: false, error: "Unsupported visitor action." })

    const record = body.record
    const status = String(record?.status || "")
    if (!record || !STATUS_PATTERN.test(status)) {
      return json(res, 400, { ok: false, error: "A visitor record with a valid status is required." })
    }

    const fullName = String(record.fullName || "").slice(0, 120)
    const event = String(record.hostName || fullName || "visitor").slice(0, 120)

    const isAdmin = actor.role === "admin" || actor.role === "sub-admin"
    const [previous] = await queryAuthoritative<{ owner_user_id: string | null; payload: any }>(
      `select owner_user_id, payload from visitor_passes where id = $1`,
      [id],
    )
    if (previous && !isAdmin && previous.owner_user_id !== actor.id) {
      return json(res, 403, { ok: false, error: "This visitor pass belongs to another account." })
    }

    const saved = await queryAuthoritative<{ id: string }>(
      `insert into visitor_passes (id, owner_user_id, event, payload, created_at)
       values ($1, $2, $3, $4::jsonb, coalesce($5::timestamptz, now()))
       on conflict (id) do update
          set payload = excluded.payload, event = excluded.event
          where visitor_passes.owner_user_id = $2 or $6
       returning id`,
      [
        id,
        actor.id,
        event,
        JSON.stringify({ ...record, id }),
        previous ? null : new Date(record.visitDate || Date.now()),
        isAdmin,
      ],
    )
    if (!saved.length) {
      return json(res, 403, { ok: false, error: "This visitor pass belongs to another account." })
    }

    // The movement history is append-only: every status transition is its own row.
    const previousStatus = String(previous?.payload?.status || "")
    if (previousStatus !== status) {
      await queryAuthoritative(
        `insert into visitor_checkins (pass_id, checked_in_by, payload)
         values ($1, $2, $3::jsonb)`,
        [
          id,
          actor.id,
          JSON.stringify({
            status,
            visitor: fullName,
            actualCheckIn: record.actualCheckIn || null,
            actualCheckOut: record.actualCheckOut || null,
          }),
        ],
      )
    }

    await queryAuthoritative(
      `delete from visitor_passes where id in (
         select id from visitor_passes
          ${isAdmin ? "" : "where owner_user_id = $2"}
          order by created_at desc offset $1
       )`,
      isAdmin ? [MAX_RECORDS] : [MAX_RECORDS, actor.id],
    )

    return json(res, 200, { ok: true, id, status })
  } catch (err) {
    console.error("Visitor log request failed", err)
    return json(res, 500, { ok: false, error: "Visitor log is temporarily unavailable." })
  }
}
