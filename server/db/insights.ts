import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, readBody, transact } from "../_lib/db.ts"
import { requireAdmin } from "../_lib/auth.ts"
import { parseFeedbackPayload, parseFunnelPayload, type FunnelStage } from "../../shared/insights.ts"

const predecessor: Partial<Record<FunnelStage, FunnelStage>> = {
  file_added: "tool_opened",
  result_ready: "file_added",
  download_started: "result_ready",
}

function noStore(res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store")
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  noStore(res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  if (req.method === "GET") {
    const actor = await requireAdmin(req)
    if (!actor) return json(res, 403, { ok: false, error: "Administrator sign-in required" })

    const [toolRows, feedbackRows] = await Promise.all([
      transact(async (sql): Promise<Record<string, any>[]> =>
        sql(
          `select tool_id,
                  count(distinct visit_id) filter (where stage = 'tool_opened') as opened,
                  count(distinct visit_id) filter (where stage = 'file_added') as files_added,
                  count(distinct visit_id) filter (where stage = 'result_ready') as results,
                  count(distinct visit_id) filter (where stage = 'download_started') as downloads
             from funnel_events
            where created_at >= now() - interval '30 days'
            group by tool_id
            order by opened desc, tool_id`,
        ),
      ),
      transact(async (sql): Promise<Record<string, any>[]> =>
        sql(
          `select sentiment, count(*)::text as count
             from product_feedback
            where created_at >= now() - interval '30 days'
            group by sentiment`,
        ),
      ),
    ])

    const tools = toolRows.map((row) => {
      const opened = Number(row.opened)
      const results = Number(row.results)
      const downloads = Number(row.downloads)
      return {
        toolId: row.tool_id,
        opened,
        filesAdded: Number(row.files_added),
        results,
        downloads,
        resultRate: opened ? Math.round((results / opened) * 100) : 0,
        downloadRate: results ? Math.round((downloads / results) * 100) : 0,
      }
    })
    const totals = tools.reduce(
      (sum, row) => ({
        opened: sum.opened + row.opened,
        filesAdded: sum.filesAdded + row.filesAdded,
        results: sum.results + row.results,
        downloads: sum.downloads + row.downloads,
      }),
      { opened: 0, filesAdded: 0, results: 0, downloads: 0 },
    )
    const feedback = { "works-well": 0, "could-be-easier": 0, "found-a-problem": 0 }
    for (const row of feedbackRows) {
      if (row.sentiment in feedback) feedback[row.sentiment as keyof typeof feedback] = Number(row.count)
    }

    return json(res, 200, {
      ok: true,
      periodDays: 30,
      generatedAt: new Date().toISOString(),
      totals: {
        ...totals,
        resultRate: totals.opened ? Math.round((totals.results / totals.opened) * 100) : 0,
        downloadRate: totals.results ? Math.round((totals.downloads / totals.results) * 100) : 0,
      },
      tools,
      feedback,
    })
  }

  let body: unknown
  try {
    body = await readBody(req, 4096)
  } catch {
    return json(res, 400, { ok: false, error: "Payload too large" })
  }
  if (!body) return json(res, 400, { ok: false, error: "Invalid payload" })

  if (typeof body === "object" && !Array.isArray(body) && "stage" in body) {
    const payload = parseFunnelPayload(body)
    if (!payload) return json(res, 400, { ok: false, error: "Invalid funnel event" })

    try {
      await transact(async (sql) => {
        await sql(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [payload.visitId])
        const duplicate = await sql(
          `select 1 from funnel_events where visit_id = $1 and sequence = $2 limit 1`,
          [payload.visitId, payload.sequence],
        )
        if (duplicate.length) return

        const [usage] = (await sql(
          `select count(*)::text as count from funnel_events
            where visit_id = $1 and created_at >= now() - interval '1 day'`,
          [payload.visitId],
        )) as { count: string }[]
        if (Number(usage?.count || 0) >= 100) throw new Error("VISIT_LIMIT")

        const required = predecessor[payload.stage]
        if (required) {
          const prior = await sql(
            `select 1 from funnel_events
              where visit_id = $1 and tool_id = $2 and stage = $3
              limit 1`,
            [payload.visitId, payload.toolId, required],
          )
          if (!prior.length) throw new Error("OUT_OF_ORDER")
        }

        await sql(
          `insert into funnel_events (visit_id, tool_id, stage, sequence)
           values ($1, $2, $3, $4)`,
          [payload.visitId, payload.toolId, payload.stage, payload.sequence],
        )
      })
    } catch (error: any) {
      if (error?.message === "OUT_OF_ORDER") return json(res, 409, { ok: false, error: "Event stage is out of order" })
      if (error?.message === "VISIT_LIMIT") return json(res, 429, { ok: false, error: "Daily event limit reached" })
      if (error?.code === "23505") return json(res, 200, { ok: true })
      return json(res, 500, { ok: false, error: "Insights unavailable" })
    }
    return json(res, 200, { ok: true })
  }

  const payload = parseFeedbackPayload(body)
  if (!payload) return json(res, 400, { ok: false, error: "Invalid feedback" })

  try {
    await transact(async (sql) => {
      await sql(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [payload.visitId])
      const [usage] = (await sql(
        `select count(*)::text as count from product_feedback
          where visit_id = $1 and created_at >= now() - interval '1 day'`,
        [payload.visitId],
      )) as { count: string }[]
      if (Number(usage?.count || 0) >= 5) throw new Error("VISIT_LIMIT")
      await sql(
        `insert into product_feedback (visit_id, tool_id, sentiment)
         values ($1, $2, $3)`,
        [payload.visitId, payload.toolId, payload.sentiment],
      )
    })
  } catch (error: any) {
    if (error?.message === "VISIT_LIMIT") return json(res, 429, { ok: false, error: "Daily feedback limit reached" })
    return json(res, 500, { ok: false, error: "Feedback unavailable" })
  }
  return json(res, 200, { ok: true })
}
