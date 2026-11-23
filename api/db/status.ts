import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query } from "../_lib/db"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const rows = await query<{ tables: string; admin_email: string | null; updated: string | null }>(
      `select
         (select count(*)::text from information_schema.tables
           where table_schema = 'public') as tables,
         (select email from users where role = 'admin' order by updated_at desc limit 1) as admin_email,
         (select max(updated_at)::text from users) as updated`,
    )
    return json(res, 200, {
      ok: true,
      engine: "Supabase Postgres",
      tables: rows[0]?.tables ?? "0",
      adminEmail: rows[0]?.admin_email ?? null,
      updatedAt: rows[0]?.updated ?? new Date().toISOString(),
    })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Database unreachable" })
  }
}
