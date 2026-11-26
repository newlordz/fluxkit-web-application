import type { ServerResponse } from "node:http"
import { cors, json, queryAuthoritative, readBody, type ApiRequest } from "../server/_lib/db.ts"
import { requireActiveUser } from "../server/_lib/auth.ts"

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

      const [row] = await queryAuthoritative<{ payload: any }>(
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
      if (
        typeof body.imageDataUrl !== "string" ||
        !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(body.imageDataUrl) ||
        body.imageDataUrl.length > MAX_PAYLOAD_SIZE
      ) {
        return json(res, 400, { success: false, error: "Showcase image must be a PNG, JPEG, WebP, or GIF data URL." })
      }
      if (body.ctaEnabled && body.ctaUrl) {
        try {
          const cta = new URL(body.ctaUrl)
          if (!["http:", "https:"].includes(cta.protocol)) throw new Error("Unsafe URL")
        } catch {
          return json(res, 400, { success: false, error: "Showcase button link must use HTTP or HTTPS." })
        }
      }

      const actor = await requireActiveUser(req)
      if (!actor) return json(res, 401, { success: false, error: "Sign-in required to publish a showcase." })

      const saved = await queryAuthoritative<{ id: string }>(
        `insert into showcases (id, owner_user_id, title, published, payload, created_at, updated_at)
         values ($1, $2, $3, true, $4::jsonb, now(), now())
         on conflict (id) do update
            set payload = excluded.payload, title = excluded.title, updated_at = now()
            where showcases.owner_user_id = $2
         returning id`,
        [
          String(body.id),
          actor?.id ?? null,
          String(body.title || "").slice(0, 120),
          JSON.stringify(body),
        ],
      )
      if (!saved.length) {
        return json(res, 403, { success: false, error: "This showcase belongs to another account." })
      }

      await queryAuthoritative(
        `delete from showcases where owner_user_id = $1 and id in (
           select id from showcases
            where owner_user_id = $1
            order by created_at desc offset 2000
         )`,
        [actor.id],
      )

      return json(res, 201, { success: true, id: body.id, message: "Showcase saved successfully." })
    }

    return json(res, 405, { error: "Method not allowed" })
  } catch (err) {
    console.error("Showcase request failed", err)
    return json(res, 500, { error: "Showcase service is temporarily unavailable." })
  }
}
