import type { ServerResponse } from "node:http"
import { cors, json, type ApiRequest } from "../server/_lib/db"
import admin from "../server/db/admin"
import apis from "../server/db/apis"
import gateways from "../server/db/gateways"
import status from "../server/db/status"
import users from "../server/db/users"

type DbHandler = (req: ApiRequest, res: ServerResponse) => Promise<unknown>

// The database routes share one entry point because Vercel Hobby caps a deployment
// at 12 functions; vercel.json rewrites map /api/db/<route> to ?action=<route>, so
// the public URLs stay unchanged.
const HANDLERS: Record<string, DbHandler> = { admin, apis, gateways, status, users }

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  const action =
    new URL(req.url || "/", "http://localhost").searchParams.get("action") || req.query?.action || ""
  const route = HANDLERS[action]
  if (!route) return json(res, 404, { ok: false, error: `Unknown database route "${action}"` })

  return route(req, res)
}
