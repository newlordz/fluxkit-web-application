import { authHeaders } from "./sessionService"

export type AdminTransactionFilters = {
  gateway?: string
  status?: string
  currency?: string
  q?: string
}

export type AdminTransaction = {
  id: string
  reference: string
  userId: string | null
  email: string | null
  amount: string
  currency: string
  status: string
  gateway: string
  tool: string | null
  createdAt: string
  updatedAt: string
}

export type AdminTransactionTotals = {
  currency: string
  transactionCount: string
  grossAmount: string
  successfulCount: string
  successfulAmount: string
}

export type AdminTransactionsResponse = {
  ok: true
  transactions: AdminTransaction[]
  totalsByCurrency: AdminTransactionTotals[]
  facets: {
    gateways: string[]
    statuses: string[]
    currencies: string[]
  }
  pagination: {
    limit: number
    total: string
    hasMore: boolean
    nextCursor: string | null
  }
}

export class AdminTransactionsError extends Error {
  status: number
  code?: string

  constructor(message: string, status = 0, code?: string) {
    super(message)
    this.name = "AdminTransactionsError"
    this.status = status
    this.code = code
  }
}

function buildQuery(filters: AdminTransactionFilters, cursor?: string | null): string {
  const params = new URLSearchParams()
  for (const key of ["gateway", "status", "currency", "q"] as const) {
    const value = filters[key]?.trim()
    if (value) params.set(key, value)
  }
  if (cursor) params.set("cursor", cursor)
  const query = params.toString()
  return query ? `?${query}` : ""
}

async function errorFromResponse(res: Response, fallback: string): Promise<AdminTransactionsError> {
  const data = await res.json().catch(() => null)
  const message =
    res.status === 401 || res.status === 403
      ? "Your administrator session has expired. Sign in again to view transactions."
      : data?.error || fallback
  return new AdminTransactionsError(message, res.status, data?.code)
}

export async function getAdminTransactions(
  filters: AdminTransactionFilters = {},
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<AdminTransactionsResponse> {
  let res: Response
  try {
    res = await fetch(`/api/db/transactions${buildQuery(filters, cursor)}`, {
      headers: authHeaders(),
      signal,
    })
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err
    throw new AdminTransactionsError("Could not reach the transactions service. Check your connection and try again.")
  }
  if (!res.ok) throw await errorFromResponse(res, "Transactions could not be loaded.")
  const data = await res.json().catch(() => null)
  if (!data?.ok) throw new AdminTransactionsError("Transactions could not be loaded.")
  return data as AdminTransactionsResponse
}

export async function exportAdminTransactionsCsv(
  filters: AdminTransactionFilters = {},
  signal?: AbortSignal,
): Promise<{ blob: Blob; fileName: string }> {
  let res: Response
  try {
    const query = buildQuery(filters)
    res = await fetch(`/api/db/transactions${query ? `${query}&` : "?"}format=csv`, {
      headers: authHeaders(),
      signal,
    })
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err
    throw new AdminTransactionsError("Could not reach the transactions service. Check your connection and try again.")
  }
  if (!res.ok) throw await errorFromResponse(res, "The CSV export could not be created.")
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") || ""
  const match = disposition.match(/filename="([^"]+)"/i)
  return { blob, fileName: match?.[1] || "masterfilepro-transactions.csv" }
}
