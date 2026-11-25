import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Cloud,
  CloudUpload,
  Download,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import {
  addImageTableRow,
  removeImageTableRow,
  updateImageTableCell,
  updateImageTableColumn,
  type ImageTable,
  type ImageTableAssessment,
} from "./imageTableReconstruction"

interface ImageTablePreviewProps {
  table: ImageTable
  assessment: ImageTableAssessment
  sourceFile: File
  source: "local" | "cloud"
  needsCloud: boolean
  signedIn: boolean
  cloudBusy: boolean
  cloudError: string
  onChange: (table: ImageTable) => void
  onCloud: () => Promise<void>
  onSignIn?: () => void
  onExport: (table: ImageTable) => Promise<void>
  exporting?: boolean
}

export default function ImageTablePreview({
  table,
  assessment,
  sourceFile,
  source,
  needsCloud,
  signedIn,
  cloudBusy,
  cloudError,
  onChange,
  onCloud,
  onSignIn,
  onExport,
  exporting = false,
}: ImageTablePreviewProps) {
  const [sourceUrl, setSourceUrl] = useState("")
  const [consent, setConsent] = useState(false)
  const [exportError, setExportError] = useState("")
  const reviewCells = useMemo(
    () => table.rows.flatMap((row) => row.cells).filter((cell) => cell.needsReview).length,
    [table],
  )
  const messages = Array.from(
    new Set([
      ...table.warnings.map((warning) => warning.message),
      ...assessment.messages,
    ]),
  )
  const canExport = table.columns.length >= 2 && table.rows.length > 0

  useEffect(() => {
    const url = URL.createObjectURL(sourceFile)
    setSourceUrl(url)
    setConsent(false)
    return () => URL.revokeObjectURL(url)
  }, [sourceFile])

  async function handleExport() {
    setExportError("")
    try {
      await onExport(table)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The spreadsheet could not be exported.")
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Review extracted table</h3>
          <p className="mt-1 text-sm text-slate-600">
            Edit headings or cells before exporting. Empty cells are kept so columns stay aligned.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            source === "cloud"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {source === "cloud" ? <Cloud className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {source === "cloud" ? "Cloud-assisted" : "Processed locally"}
        </span>
      </div>

      <div className="grid gap-5 border-b border-slate-200 p-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div>
          {sourceUrl ? (
            <img
              src={sourceUrl}
              alt={`Source image: ${sourceFile.name}`}
              className="max-h-64 w-full rounded-xl border border-slate-200 object-contain"
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
              Loading source preview
            </div>
          )}
          <p className="mt-2 break-words text-xs text-slate-500">{sourceFile.name}</p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
              {table.rows.length} rows · {table.columns.length} columns
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
              {Math.round(table.confidence * 100)}% recognition confidence
            </span>
            {reviewCells > 0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-900">
                {reviewCells} cells to review
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-900">
                No cells flagged
              </span>
            )}
          </div>

          {messages.length > 0 && (
            <ul className="space-y-2">
              {messages.map((message) => (
                <li key={message} className="flex gap-2 text-sm text-slate-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{message}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <strong>Verify amounts and account numbers before use.</strong> OCR can confuse similar
            characters. References, dates, leading-zero values, and ambiguous amounts stay as text
            in Excel.
          </div>
          <p className="text-sm leading-6 text-slate-600">
            {source === "cloud"
              ? "This image was uploaded only for this conversion. MasterfilePro does not save the photo or extracted financial table to your vault."
              : "This image and table were not uploaded or saved to your vault. The spreadsheet is created only when you export it."}
          </p>
        </div>
      </div>

      {needsCloud && source === "local" && (
        <div className="border-b border-slate-200 bg-blue-50/60 px-5 py-5">
          <div className="max-w-3xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2 text-blue-700 shadow-sm">
                <CloudUpload className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-950">Local reading needs a second pass</h4>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Keep and edit the local result, or consent to upload a re-encoded copy of this photo
                  to Google Gemini for a more accurate table. Photo metadata is removed before upload.
                </p>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm leading-6 text-slate-800">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                I agree to upload this financial image to Google for this conversion. Google may use
                free-tier submissions to improve its products. I am permitted to share this document.
              </span>
            </label>

            {!signedIn && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2">
                  <LockKeyhole className="h-4 w-4 text-slate-500" />
                  Cloud help requires a free account so usage can be rate-limited.
                </span>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </button>
              </div>
            )}

            {cloudError && (
              <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
                {cloudError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onCloud}
                disabled={!consent || !signedIn || cloudBusy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cloudBusy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                {cloudBusy ? "Improving table…" : "Upload and improve table"}
              </button>
              <span className="text-xs text-slate-600" aria-live="polite">
                {cloudBusy
                  ? "The local table stays available while cloud extraction runs."
                  : "Nothing uploads until you check the box and press this button."}
              </span>
            </div>
          </div>
        </div>
      )}

      {canExport ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="sticky left-0 z-10 w-16 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-left font-semibold text-slate-600">
                  Row
                </th>
                {table.columns.map((column, columnIndex) => (
                  <th
                    key={column.id}
                    className="min-w-40 border-b border-r border-slate-200 px-3 py-2 text-left"
                  >
                    <label className="sr-only" htmlFor={`heading-${column.id}`}>
                      Column {columnIndex + 1} heading
                    </label>
                    <input
                      id={`heading-${column.id}`}
                      value={column.label}
                      onChange={(event) =>
                        onChange(updateImageTableColumn(table, columnIndex, event.target.value))
                      }
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                    />
                    <span className="block px-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {column.kind}
                    </span>
                  </th>
                ))}
                <th className="w-16 border-b border-slate-200 px-3 py-3 text-center font-semibold text-slate-600">
                  Remove
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={row.id} className="align-top">
                  <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-3 text-center font-medium text-slate-500">
                    {rowIndex + 1}
                  </th>
                  {row.cells.map((cell, columnIndex) => {
                    const covered = row.cells
                      .slice(0, columnIndex)
                      .some(
                        (previous, previousIndex) =>
                          columnIndex < previousIndex + (previous.colSpan || 1),
                      )
                    if (covered) return null
                    return (
                      <td
                        key={cell.id}
                        className="border-b border-r border-slate-200 p-2 align-top"
                        colSpan={cell.colSpan}
                      >
                        <label className="sr-only" htmlFor={cell.id}>
                          Row {rowIndex + 1}, {table.columns[columnIndex]?.label || `column ${columnIndex + 1}`}
                        </label>
                        <textarea
                          id={cell.id}
                          value={cell.value}
                          rows={cell.value.includes("\n") ? 3 : 2}
                          onChange={(event) =>
                            onChange(updateImageTableCell(table, row.id, columnIndex, event.target.value))
                          }
                          className={`min-h-16 w-full resize-y rounded-md border bg-white px-2 py-1.5 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 ${
                            cell.needsReview
                              ? "border-amber-400 bg-amber-50"
                              : cell.edited
                                ? "border-emerald-300"
                                : "border-slate-200"
                          } ${table.columns[columnIndex]?.kind === "amount" ? "text-right" : ""}`}
                        />
                        <div className="mt-1 flex min-h-4 items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
                          {cell.needsReview ? (
                            <span className="font-semibold text-amber-800">Review</span>
                          ) : cell.edited ? (
                            <span className="font-semibold text-emerald-800">Edited</span>
                          ) : (
                            <span>{Math.round(cell.confidence * 100)}%</span>
                          )}
                          {cell.value && (
                            <span>{Math.round(cell.assignmentConfidence * 100)}% aligned</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td className="border-b border-slate-200 px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => onChange(removeImageTableRow(table, row.id))}
                      disabled={table.rows.length === 1}
                      className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Remove row ${rowIndex + 1}`}
                      title={`Remove row ${rowIndex + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="font-semibold text-slate-900">No reliable local table yet</p>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-600">
            Use cloud help with consent above, or remove this image and retake it square-on with the
            full table visible and even lighting.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        {canExport ? (
          <button
            type="button"
            onClick={() => onChange(addImageTableRow(table))}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {exportError && <p className="text-sm font-medium text-red-700">{exportError}</p>}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !canExport}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? "Creating Excel file" : "Export Excel (.xlsx)"}
          </button>
        </div>
      </div>
    </section>
  )
}
