import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query } from "../_lib/db.ts"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const rows = await query<{ tables: string }>(
      `select count(*)::text as tables from information_schema.tables
        where table_schema = 'public'`,
    )
    return json(res, 200, {
      ok: true,
      engine: "Supabase Postgres",
      tables: rows[0]?.tables ?? "0",
    })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Database unreachable" })
  }
}
