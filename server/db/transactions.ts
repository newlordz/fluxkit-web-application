import type { ServerResponse } from "node:http"
import { cors, json, queryAuthoritative, type ApiRequest } from "../_lib/db.ts"
import { requireAdmin } from "../_lib/auth.ts"

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_EXPORT_ROWS = 10_000
const MAX_FILTER_LENGTH = 100

type PaymentRow = {
  id: string | number
  reference: string
  user_id: string | null
  email: string | null
  amount: string | number
  currency: string
  status: string
  gateway: string
  tool: string | null
  created_at: string | Date
  updated_at: string | Date
}

type TotalRow = {
  currency: string
  transaction_count: string | number
  gross_amount: string | number
  successful_count: string | number
  successful_amount: string | number
}

type FacetRow = {
  gateways: string[]
  statuses: string[]
  currencies: string[]
}

type Cursor = { createdAt: string; id: string }

function requestParams(req: ApiRequest): URLSearchParams {
  const params = new URLSearchParams()
  const keys = new Set([
    "gateway",
    "status",
    "currency",
    "q",
    "limit",
    "cursor",
    "format",
  ])
  for (const key of keys) {
    const value = req.query?.[key] ?? new URL(req.url || "/", "http://localhost").searchParams.get(key) ?? ""
    if (value) params.set(key, value)
  }
  return params
}

function cleanFilter(value: string | null): string {
  return (value || "").trim()
}

function validFilter(value: string): boolean {
  return value.length <= MAX_FILTER_LENGTH && !value.includes("\0")
}

function parseCursor(value: string): Cursor {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error("Invalid cursor")
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
  } catch {
    throw new Error("Invalid cursor")
  }
  if (!decoded || typeof decoded !== "object") throw new Error("Invalid cursor")
  const cursor = decoded as Record<string, unknown>
  const createdAt = cursor.createdAt
  const id = cursor.id
  if (
    cursor.version !== 1 ||
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt)) ||
    typeof id !== "string" ||
    !/^[1-9]\d{0,18}$/.test(id) ||
    BigInt(id) > 9223372036854775807n
  ) {
    throw new Error("Invalid cursor")
  }
  return { createdAt, id }
}

function encodeCursor(row: PaymentRow): string {
  return Buffer.from(
    JSON.stringify({ version: 1, createdAt: toTimestamp(row.created_at), id: String(row.id) }),
    "utf8",
  ).toString("base64url")
}

function toTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toClient(row: PaymentRow) {
  return {
    id: String(row.id),
    reference: row.reference,
    userId: row.user_id,
    email: row.email,
    amount: String(row.amount),
    currency: row.currency,
    status: row.status,
    gateway: row.gateway,
    tool: row.tool,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}

function buildFilters(params: URLSearchParams, cursor: Cursor | null) {
  const conditions: string[] = []
  const values: Array<string | number> = []

  for (const key of ["gateway", "status", "currency"] as const) {
    const value = cleanFilter(params.get(key))
    if (!value) continue
    values.push(value)
    conditions.push(`${key} = $${values.length}`)
  }

  const search = cleanFilter(params.get("q"))
  if (search) {
    values.push(`%${escapeLike(search)}%`)
    const placeholder = `$${values.length}`
    conditions.push(
      `(reference ilike ${placeholder} escape '\\' or email ilike ${placeholder} escape '\\' or user_id ilike ${placeholder} escape '\\' or tool ilike ${placeholder} escape '\\')`,
    )
  }

  if (cursor) {
    values.push(cursor.createdAt, cursor.id)
    conditions.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::bigint)`)
  }

  return {
    where: conditions.length ? ` where ${conditions.join(" and ")}` : "",
    values,
  }
}

function csvCell(value: unknown, protectFormula = false): string {
  let text = value == null ? "" : String(value)
  if (protectFormula && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(rows: PaymentRow[]): string {
  const header = [
    "id",
    "reference",
    "user_id",
    "email",
    "amount",
    "currency",
    "status",
    "gateway",
    "tool",
    "created_at",
    "updated_at",
  ]
  const lines = rows.map((row) =>
    [
      csvCell(row.id),
      csvCell(row.reference, true),
      csvCell(row.user_id, true),
      csvCell(row.email, true),
      csvCell(row.amount),
      csvCell(row.currency, true),
      csvCell(row.status, true),
      csvCell(row.gateway, true),
      csvCell(row.tool, true),
      csvCell(toTimestamp(row.created_at)),
      csvCell(toTimestamp(row.updated_at)),
    ].join(","),
  )
  return [header.map((value) => csvCell(value)).join(","), ...lines].join("\r\n")
}

function sendCsv(res: ServerResponse, rows: PaymentRow[]) {
  const date = new Date().toISOString().slice(0, 10)
  res.statusCode = 200
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="masterfilepro-transactions-${date}.csv"`)
  res.setHeader("Cache-Control", "private, no-store")
  res.end(toCsv(rows))
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  res.setHeader("Cache-Control", "private, no-store")

  try {
    const actor = await requireAdmin(req)
    if (!actor) return json(res, 401, { ok: false, error: "Administrator sign-in required" })
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" })

    const params = requestParams(req)
    const format = cleanFilter(params.get("format")).toLowerCase()
    if (format && format !== "csv") return json(res, 400, { ok: false, error: "Invalid export format" })

    for (const key of ["gateway", "status", "currency", "q"] as const) {
      if (!validFilter(cleanFilter(params.get(key)))) {
        return json(res, 400, { ok: false, error: `Invalid ${key} filter` })
      }
    }

    if (format === "csv") {
      if (params.has("limit") || params.has("cursor")) {
        return json(res, 400, { ok: false, error: "CSV exports cannot be paginated" })
      }
      const filters = buildFilters(params, null)
      const rows = await queryAuthoritative<PaymentRow>(
        `select id, reference, user_id, email, amount, currency, status, gateway, tool, created_at, updated_at
           from payments${filters.where}
          order by created_at desc, id desc
          limit $${filters.values.length + 1}`,
        [...filters.values, MAX_EXPORT_ROWS + 1],
      )
      if (rows.length > MAX_EXPORT_ROWS) {
        return json(res, 413, {
          ok: false,
          code: "export_too_large",
          error: "Refine the filters to export 10,000 transactions or fewer.",
        })
      }
      return sendCsv(res, rows)
    }

    const rawLimit = params.get("limit") || String(DEFAULT_LIMIT)
    if (!/^\d+$/.test(rawLimit)) return json(res, 400, { ok: false, error: "Invalid page size" })
    const limit = Number(rawLimit)
    if (limit < 1 || limit > MAX_LIMIT) return json(res, 400, { ok: false, error: "Invalid page size" })

    let cursor: Cursor | null = null
    try {
      const rawCursor = params.get("cursor")
      cursor = rawCursor ? parseCursor(rawCursor) : null
    } catch {
      return json(res, 400, { ok: false, error: "Invalid cursor" })
    }

    const filters = buildFilters(params, cursor)
    const aggregateFilters = buildFilters(params, null)
    const [rows, countRows, totals, facets] = await Promise.all([
      queryAuthoritative<PaymentRow>(
        `select id, reference, user_id, email, amount, currency, status, gateway, tool, created_at, updated_at
           from payments${filters.where}
          order by created_at desc, id desc
          limit $${filters.values.length + 1}`,
        [...filters.values, limit + 1],
      ),
      queryAuthoritative<{ total: string | number }>(
        `select count(*)::text as total from payments${aggregateFilters.where}`,
        aggregateFilters.values,
      ),
      queryAuthoritative<TotalRow>(
        `select currency,
                count(*)::text as transaction_count,
                sum(amount)::text as gross_amount,
                count(*) filter (where status = 'success')::text as successful_count,
                coalesce(sum(amount) filter (where status = 'success'), 0)::text as successful_amount
           from payments${aggregateFilters.where}
          group by currency
          order by currency`,
        aggregateFilters.values,
      ),
      queryAuthoritative<FacetRow>(
        `select
           (select coalesce(json_agg(value), '[]'::json) from (select distinct gateway as value from payments order by value) g) as gateways,
           (select coalesce(json_agg(value), '[]'::json) from (select distinct status as value from payments order by value) s) as statuses,
           (select coalesce(json_agg(value), '[]'::json) from (select distinct currency as value from payments order by value) c) as currencies`,
      ),
    ])

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    return json(res, 200, {
      ok: true,
      transactions: page.map(toClient),
      totalsByCurrency: totals.map((row) => ({
        currency: row.currency,
        transactionCount: String(row.transaction_count),
        grossAmount: String(row.gross_amount),
        successfulCount: String(row.successful_count),
        successfulAmount: String(row.successful_amount),
      })),
      facets: {
        gateways: Array.isArray(facets[0]?.gateways) ? facets[0].gateways : [],
        statuses: Array.isArray(facets[0]?.statuses) ? facets[0].statuses : [],
        currencies: Array.isArray(facets[0]?.currencies) ? facets[0].currencies : [],
      },
      pagination: {
        limit,
        total: String(countRows[0]?.total ?? "0"),
        hasMore,
        nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
      },
    })
  } catch (err) {
    console.error("Admin transactions query failed", err)
    return json(res, 500, { ok: false, error: "Transactions are temporarily unavailable." })
  }
}
