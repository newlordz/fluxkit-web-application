import type { ServerResponse } from "node:http"
import { cors, json, query, readBody, type ApiRequest } from "./_lib/db"
import { currentUser } from "./_lib/auth"

const MAX_PAYLOAD_SIZE = 4 * 1024 * 1024
const TTL_DAYS = 30

const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  try {
    if (req.method === "GET") {
      const id = new URL(req.url || "", "http://localhost").searchParams.get("id") || ""

      if (!ID_PATTERN.test(id)) {
        return json(res, 400, { success: false, error: "Missing or malformed 'id' parameter." })
      }

      const [row] = await query<{ payload: any }>(
        `select payload from showcases
          where id = $1 and published and created_at > now() - ($2 || ' days')::interval`,
        [id, TTL_DAYS],
      )

      if (!row) return json(res, 404, { success: false, error: "Showcase not found or expired." })

      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400")
      return json(res, 200, row.payload)
    }

    if (req.method === "POST") {
      const body = await readBody(req, MAX_PAYLOAD_SIZE)

      if (!body || !ID_PATTERN.test(String(body.id || "")) || !body.imageDataUrl) {
        return json(res, 400, {
          success: false,
          error: "Invalid showcase payload. A well-formed 'id' and 'imageDataUrl' are required.",
        })
      }

      const actor = await currentUser(req)

      await query(
        `insert into showcases (id, owner_user_id, title, published, payload, created_at, updated_at)
         values ($1, $2, $3, true, $4::jsonb, now(), now())
         on conflict (id) do update
            set payload = excluded.payload, title = excluded.title,
                owner_user_id = excluded.owner_user_id, updated_at = now()`,
        [
          String(body.id),
          actor?.id ?? null,
          String(body.title || "").slice(0, 120),
          JSON.stringify(body),
        ],
      )

      // Keep the table bounded; the oldest showcases go first.
      await query(
        `delete from showcases where id in (
           select id from showcases order by created_at desc offset 2000
         )`,
      )

      return json(res, 201, { success: true, id: body.id, message: "Showcase saved successfully." })
    }

    return json(res, 405, { error: "Method not allowed" })
  } catch (err: any) {
    return json(res, 500, { error: err?.message || "Internal server error" })
  }
}
