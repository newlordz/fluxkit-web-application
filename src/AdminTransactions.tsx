import { useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Receipt,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import {
  AdminTransactionsError,
  exportAdminTransactionsCsv,
  getAdminTransactions,
  type AdminTransaction,
  type AdminTransactionFilters,
  type AdminTransactionsResponse,
} from "./adminTransactionsService"

const fieldStyle: React.CSSProperties = {
  minHeight: "38px",
  padding: "8px 11px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "12px",
}

const buttonStyle: React.CSSProperties = {
  minHeight: "38px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
  padding: "8px 12px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
}

function displayValue(value: string): string {
  const spaced = value.replace(/[-_]/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function displayDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

function statusColor(status: string): { background: string; color: string } {
  switch (status.toLowerCase()) {
    case "success":
      return { background: "rgba(16,185,129,0.14)", color: "#10b981" }
    case "failed":
      return { background: "rgba(239,68,68,0.14)", color: "#ef4444" }
    case "pending":
      return { background: "rgba(245,158,11,0.14)", color: "#f59e0b" }
    default:
      return { background: "var(--surface-hover)", color: "var(--muted)" }
  }
}

export default function AdminTransactions() {
  const [filters, setFilters] = useState<AdminTransactionFilters>({})
  const [search, setSearch] = useState("")
  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<string | null>>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [data, setData] = useState<AdminTransactionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AdminTransactionsError | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState("")
  const [exportError, setExportError] = useState("")
  const requestId = useRef(0)
  const exportController = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = search.trim()
      setFilters((current) => {
        if ((current.q || "") === q) return current
        return { ...current, q: q || undefined }
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    void getAdminTransactions(filters, cursor, controller.signal)
      .then((result) => {
        if (currentRequest !== requestId.current) return
        setData(result)
      })
      .catch((err: unknown) => {
        if (currentRequest !== requestId.current || (err as { name?: string })?.name === "AbortError") return
        setError(
          err instanceof AdminTransactionsError
            ? err
            : new AdminTransactionsError("Transactions could not be loaded."),
        )
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false)
      })
    return () => controller.abort()
  }, [filters, cursor, refreshKey])

  useEffect(() => () => exportController.current?.abort(), [])

  const resetPage = () => {
    setCursor(null)
    setHistory([])
  }

  const updateFilter = (key: keyof AdminTransactionFilters, value: string) => {
    resetPage()
    setFilters((current) => ({ ...current, [key]: value || undefined }))
  }

  const clearFilters = () => {
    setSearch("")
    resetPage()
    setFilters({})
    setExportMessage("")
    setExportError("")
  }

  const refresh = () => {
    const q = search.trim()
    setFilters((current) => ({ ...current, q: q || undefined }))
    resetPage()
    setRefreshKey((value) => value + 1)
  }

  const nextPage = () => {
    if (!data?.pagination.nextCursor) return
    setHistory((current) => [...current, cursor])
    setCursor(data.pagination.nextCursor)
  }

  const previousPage = () => {
    if (!history.length) return
    setCursor(history[history.length - 1])
    setHistory((current) => current.slice(0, -1))
  }

  const exportCsv = async () => {
    const controller = new AbortController()
    exportController.current = controller
    setExporting(true)
    setExportMessage("")
    setExportError("")
    try {
      const exportFilters = { ...filters, q: search.trim() || undefined }
      const { blob, fileName } = await exportAdminTransactionsCsv(exportFilters, controller.signal)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportMessage("CSV export downloaded.")
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return
      setExportError(
        err instanceof AdminTransactionsError ? err.message : "The CSV export could not be created.",
      )
    } finally {
      if (exportController.current === controller) {
        exportController.current = null
        setExporting(false)
      }
    }
  }

  const hasFilters = Boolean(filters.gateway || filters.status || filters.currency || filters.q)
  const facets = data?.facets || { gateways: [], statuses: [], currencies: [] }

  return (
    <div className="page-enter" aria-busy={loading}>
      <div
        className="panel"
        style={{ padding: "16px", marginBottom: "16px", display: "grid", gap: "14px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
              <Receipt size={17} style={{ color: "var(--accent)" }} />
              Payment ledger
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)" }}>
              Read-only records from every gateway stored in the payments ledger.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" style={buttonStyle} onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
              onClick={() => void exportCsv()}
              disabled={exporting || (loading && !data)}
            >
              <Download size={14} /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
            gap: "10px",
          }}
        >
          <label style={{ display: "grid", gap: "5px", fontSize: "11px", color: "var(--muted)" }}>
            Gateway
            <select style={fieldStyle} value={filters.gateway || ""} onChange={(event) => updateFilter("gateway", event.target.value)}>
              <option value="">All gateways</option>
              {facets.gateways.map((value) => <option key={value} value={value}>{displayValue(value)}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "5px", fontSize: "11px", color: "var(--muted)" }}>
            Status
            <select style={fieldStyle} value={filters.status || ""} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">All statuses</option>
              {facets.statuses.map((value) => <option key={value} value={value}>{displayValue(value)}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "5px", fontSize: "11px", color: "var(--muted)" }}>
            Currency
            <select style={fieldStyle} value={filters.currency || ""} onChange={(event) => updateFilter("currency", event.target.value)}>
              <option value="">All currencies</option>
              {facets.currencies.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "5px", fontSize: "11px", color: "var(--muted)" }}>
            Search
            <span style={{ position: "relative" }}>
              <Search size={14} aria-hidden="true" style={{ position: "absolute", left: "10px", top: "12px", color: "var(--muted)" }} />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPage()
                }}
                placeholder="Reference, email, user or tool"
                aria-label="Search transactions"
                style={{ ...fieldStyle, width: "100%", paddingLeft: "32px", paddingRight: "32px" }}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear transaction search"
                  onClick={() => {
                    setSearch("")
                    resetPage()
                  }}
                  style={{ position: "absolute", right: "7px", top: "8px", border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer" }}
                >
                  <X size={16} />
                </button>
              )}
            </span>
          </label>
        </div>

        {(hasFilters || exportMessage || exportError) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
              {exportMessage && <span role="status" style={{ color: "#10b981" }}>{exportMessage}</span>}
              {exportError && <span role="alert" style={{ color: "#ef4444" }}>{exportError}</span>}
            </div>
            {hasFilters && (
              <button type="button" style={{ ...buttonStyle, minHeight: "30px", padding: "5px 9px" }} onClick={clearFilters}>
                <X size={13} /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {data && data.totalsByCurrency.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          {data.totalsByCurrency.map((total) => (
            <div key={total.currency} className="panel" style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <strong style={{ fontSize: "13px" }}>{total.currency}</strong>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{total.transactionCount} recorded</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Recorded volume</div>
                  <div style={{ fontSize: "17px", fontWeight: 700, marginTop: "3px" }}>{total.currency} {total.grossAmount}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Successful</div>
                  <div style={{ fontSize: "17px", fontWeight: 700, marginTop: "3px", color: "#10b981" }}>{total.currency} {total.successfulAmount}</div>
                  <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "2px" }}>{total.successfulCount} payments</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !data && (
        <div className="panel" style={{ padding: "28px", textAlign: "center" }} role="alert">
          <AlertCircle size={26} style={{ color: "#ef4444", margin: "0 auto 10px" }} />
          <h2 style={{ fontSize: "16px", margin: "0 0 6px" }}>Transactions unavailable</h2>
          <p style={{ color: "var(--muted)", fontSize: "12px", margin: "0 auto 16px", maxWidth: "520px" }}>{error.message}</p>
          <button type="button" className="primary" onClick={refresh}>Try again</button>
        </div>
      )}

      {loading && !data && (
        <div className="panel" style={{ padding: "36px", textAlign: "center", color: "var(--muted)" }} role="status">
          <RefreshCw size={22} className="spin" style={{ margin: "0 auto 10px" }} />
          Loading transactions…
        </div>
      )}

      {error && data && (
        <div className="panel" style={{ padding: "10px 14px", marginBottom: "12px", color: "#ef4444", fontSize: "12px" }} role="alert">
          {error.message} Showing the last loaded results.
        </div>
      )}

      {data && !loading && data.transactions.length === 0 && (
        <div className="panel" style={{ padding: "36px", textAlign: "center" }}>
          <Receipt size={28} style={{ color: "var(--muted)", margin: "0 auto 10px" }} />
          <h2 style={{ fontSize: "16px", margin: "0 0 6px" }}>
            {hasFilters ? "No transactions match these filters" : "No recorded transactions"}
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "12px", margin: "0 0 14px" }}>
            {hasFilters ? "Clear the filters or try a different search." : "Completed and pending payment records will appear here."}
          </p>
          {hasFilters && <button type="button" className="secondary" onClick={clearFilters}>Clear filters</button>}
        </div>
      )}

      {data && data.transactions.length > 0 && (
        <div className="panel" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", fontSize: "12px" }}>
              <caption style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                Recorded payment transactions
              </caption>
              <thead>
                <tr style={{ background: "var(--surface-hover)", color: "var(--muted)", textAlign: "left" }}>
                  {["Created", "Reference / customer", "Gateway", "Tool", "Amount", "Status"].map((label) => (
                    <th key={label} scope="col" style={{ padding: "11px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((transaction: AdminTransaction) => {
                  const colors = statusColor(transaction.status)
                  return (
                    <tr key={transaction.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 14px", color: "var(--muted)", whiteSpace: "nowrap" }}>{displayDate(transaction.createdAt)}</td>
                      <td style={{ padding: "12px 14px", minWidth: "210px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }}>{transaction.reference}</div>
                        <div style={{ color: "var(--muted)", fontSize: "11px", marginTop: "3px", wordBreak: "break-all" }}>{transaction.email || transaction.userId || "No customer recorded"}</div>
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>{displayValue(transaction.gateway)}</td>
                      <td style={{ padding: "12px 14px", color: "var(--muted)" }}>{transaction.tool ? displayValue(transaction.tool) : "—"}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, whiteSpace: "nowrap" }}>{transaction.currency} {transaction.amount}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ ...colors, display: "inline-flex", padding: "4px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, textTransform: "capitalize" }}>
                          {displayValue(transaction.status)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              padding: "12px 14px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>{data.pagination.total} matching transactions</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button type="button" style={buttonStyle} onClick={previousPage} disabled={loading || !history.length}>
                <ChevronLeft size={14} /> Previous
              </button>
              <button type="button" style={buttonStyle} onClick={nextPage} disabled={loading || !data.pagination.hasMore}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
