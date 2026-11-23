import type { ServerResponse } from "node:http"
import { cors, json, query, readBody, type ApiRequest } from "../server/_lib/db"
import { currentUser, requireAdmin } from "../server/_lib/auth"

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
      const actor = await currentUser(req)
      if (!actor) return json(res, 401, { ok: false, error: "Sign-in required to read the visitor log." })

      const rows = await query<{ id: string; payload: any }>(
        `select id, payload from visitor_passes
          order by created_at desc
          limit 500`,
      )

      return json(res, 200, {
        ok: true,
        records: rows.map((row) => ({ ...row.payload, id: row.id })),
      })
    }

    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

    const actor = await currentUser(req)
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

      await query(`delete from visitor_passes where id = $1`, [id])
      await query(`insert into audit_log (actor_user_id, action, target) values ($1, 'visitor.pass.remove', $2)`, [
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

    const [previous] = await query<{ payload: any }>(`select payload from visitor_passes where id = $1`, [id])

    await query(
      `insert into visitor_passes (id, owner_user_id, event, payload, created_at)
       values ($1, $2, $3, $4::jsonb, coalesce($5::timestamptz, now()))
       on conflict (id) do update
          set payload = excluded.payload, event = excluded.event, owner_user_id = excluded.owner_user_id`,
      [
        id,
        actor.id,
        event,
        JSON.stringify({ ...record, id }),
        previous ? null : new Date(record.visitDate || Date.now()),
      ],
    )

    // The movement history is append-only: every status transition is its own row.
    const previousStatus = String(previous?.payload?.status || "")
    if (previousStatus !== status) {
      await query(
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

    await query(
      `delete from visitor_passes where id in (
         select id from visitor_passes order by created_at desc offset $1
       )`,
      [MAX_RECORDS],
    )

    return json(res, 200, { ok: true, id, status })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
