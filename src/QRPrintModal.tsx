import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Check,
  Download,
  Info,
  Printer,
  Ruler,
  Scissors,
  X,
} from "lucide-react"
import type { OutputResult } from "./jobTypes"

export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
const MM_TO_POINTS = 72 / 25.4

export interface QrPrintOptions {
  sizeMm: number
  caption: string
  cutGuides: boolean
}

export interface QrPrintLayout {
  x: number
  y: number
  size: number
  captionY: number | null
}

export function getQrPrintLayout(
  sizeMm: number,
  hasCaption: boolean,
): QrPrintLayout {
  const size = Math.min(150, Math.max(30, sizeMm))
  const centerY = A4_HEIGHT_MM / 2 + (hasCaption ? 7 : 0)
  const y = centerY - size / 2
  return {
    x: (A4_WIDTH_MM - size) / 2,
    y,
    size,
    captionY: hasCaption ? y - 10 : null,
  }
}

function printSafeCaption(caption: string): string {
  return caption
    .trim()
    .slice(0, 60)
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?")
}

export async function createQrA4Pdf(
  qrDataUrl: string,
  options: QrPrintOptions,
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([
    A4_WIDTH_MM * MM_TO_POINTS,
    A4_HEIGHT_MM * MM_TO_POINTS,
  ])
  const layout = getQrPrintLayout(options.sizeMm, !!options.caption.trim())
  const qrImage = await pdf.embedPng(qrDataUrl)
  const qrSize = layout.size * MM_TO_POINTS
  const qrX = layout.x * MM_TO_POINTS
  const qrY = layout.y * MM_TO_POINTS

  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  })

  const caption = printSafeCaption(options.caption)
  if (caption && layout.captionY !== null) {
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const fontSize = 14
    const textWidth = font.widthOfTextAtSize(caption, fontSize)
    page.drawText(caption, {
      x: (page.getWidth() - textWidth) / 2,
      y: layout.captionY * MM_TO_POINTS,
      size: fontSize,
      font,
      color: rgb(0.08, 0.12, 0.18),
    })
  }

  if (options.cutGuides) {
    const gap = 3 * MM_TO_POINTS
    const length = 6 * MM_TO_POINTS
    const left = qrX - gap
    const right = qrX + qrSize + gap
    const bottom = qrY - gap
    const top = qrY + qrSize + gap
    const color = rgb(0.55, 0.6, 0.65)
    const lines = [
      [left - length, bottom, left, bottom],
      [left - length, top, left, top],
      [right, bottom, right + length, bottom],
      [right, top, right + length, top],
      [left, bottom - length, left, bottom],
      [right, bottom - length, right, bottom],
      [left, top, left, top + length],
      [right, top, right, top + length],
    ]
    for (const [x1, y1, x2, y2] of lines) {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.45,
        color,
      })
    }
  }

  pdf.setTitle("MasterfilePro QR Code - A4 Print Sheet")
  pdf.setSubject(`QR code printed at ${layout.size} mm on A4`)
  const bytes = await pdf.save()
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
}

interface QRPrintModalProps {
  isOpen: boolean
  qrDataUrl: string
  onClose: () => void
  onDownload: (result: OutputResult) => void
}

export default function QRPrintModal({
  isOpen,
  qrDataUrl,
  onClose,
  onDownload,
}: QRPrintModalProps) {
  const [sizeMm, setSizeMm] = useState(80)
  const [caption, setCaption] = useState("Scan to open")
  const [cutGuides, setCutGuides] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState("")
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const layout = useMemo(
    () => getQrPrintLayout(sizeMm, !!caption.trim()),
    [sizeMm, caption],
  )

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || typeof document === "undefined") return null

  const qrLeft = (layout.x / A4_WIDTH_MM) * 100
  const qrTop = ((A4_HEIGHT_MM - layout.y - layout.size) / A4_HEIGHT_MM) * 100
  const qrWidth = (layout.size / A4_WIDTH_MM) * 100
  const captionTop =
    layout.captionY === null
      ? null
      : ((A4_HEIGHT_MM - layout.captionY) / A4_HEIGHT_MM) * 100

  const buildPdf = async () => {
    setError("")
    setIsExporting(true)
    try {
      return await createQrA4Pdf(qrDataUrl, { sizeMm, caption, cutGuides })
    } catch (cause) {
      console.error("QR A4 export failed", cause)
      setError("The A4 PDF could not be prepared. Please try again.")
      return null
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownload = async () => {
    const blob = await buildPdf()
    if (!blob) return
    onDownload({ name: "masterfilepro-qr-a4.pdf", blob })
  }

  const handlePrint = async () => {
    const blob = await buildPdf()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const frame = document.createElement("iframe")
    frame.title = "A4 QR print preview"
    frame.style.position = "fixed"
    frame.style.width = "1px"
    frame.style.height = "1px"
    frame.style.right = "0"
    frame.style.bottom = "0"
    frame.style.border = "0"
    frame.style.opacity = "0"
    frame.style.pointerEvents = "none"
    document.body.appendChild(frame)
    frame.onload = () => {
      window.setTimeout(() => {
        try {
          frame.contentWindow?.focus()
          frame.contentWindow?.print()
        } catch {
          setError("Print preview was blocked. Download the PDF and print it instead.")
        }
      }, 120)
    }
    frame.src = url
    window.setTimeout(() => {
      frame.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
  }

  const guideGap = 3
  const guideLength = 6
  const left = layout.x - guideGap
  const right = layout.x + layout.size + guideGap
  const bottom = layout.y - guideGap
  const top = layout.y + layout.size + guideGap
  const guideLines = [
    [left - guideLength, bottom, left, bottom],
    [left - guideLength, top, left, top],
    [right, bottom, right + guideLength, bottom],
    [right, top, right + guideLength, top],
    [left, bottom - guideLength, left, bottom],
    [right, bottom - guideLength, right, bottom],
    [left, top, left, top + guideLength],
    [right, top, right, top + guideLength],
  ]

  return createPortal(
    <div
      className="qr-print-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-print-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="qr-print-card">
        <header className="qr-print-header">
          <div className="qr-print-heading">
            <span className="qr-print-heading-icon" aria-hidden="true">
              <Printer size={22} />
            </span>
            <div>
              <h2 id="qr-print-title">A4 Print Preview</h2>
              <p>Check the real paper size before you print.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="qr-print-close"
            onClick={onClose}
            aria-label="Close print preview"
          >
            <X size={19} />
          </button>
        </header>

        <div className="qr-print-body">
          <div className="qr-print-stage">
            <div className="qr-print-stage-label">
              <Ruler size={14} /> A4 · 210 × 297 mm
            </div>
            <div className="qr-print-paper" aria-label="A4 sheet preview">
              <img
                className="qr-print-image"
                src={qrDataUrl}
                alt="QR code positioned on an A4 sheet"
                draggable={false}
                style={{
                  left: `${qrLeft}%`,
                  top: `${qrTop}%`,
                  width: `${qrWidth}%`,
                }}
              />
              {caption.trim() && captionTop !== null && (
                <div
                  className="qr-print-caption"
                  style={{ top: `${captionTop}%` }}
                >
                  {caption.trim()}
                </div>
              )}
              {cutGuides && (
                <svg
                  className="qr-print-cut-guides"
                  viewBox={`0 0 ${A4_WIDTH_MM} ${A4_HEIGHT_MM}`}
                  aria-hidden="true"
                >
                  {guideLines.map(([x1, y1, x2, y2], index) => (
                    <line
                      key={index}
                      x1={x1}
                      y1={A4_HEIGHT_MM - y1}
                      x2={x2}
                      y2={A4_HEIGHT_MM - y2}
                    />
                  ))}
                </svg>
              )}
            </div>
            <p className="qr-print-scale-note">
              Screen scale is approximate. The PDF uses exact A4 dimensions.
            </p>
          </div>

          <aside className="qr-print-controls">
            <div className="qr-print-control-group">
              <div className="qr-print-control-title">
                <label htmlFor="qr-print-size">QR size on paper</label>
                <span>{sizeMm} mm</span>
              </div>
              <input
                id="qr-print-size"
                type="range"
                min="30"
                max="150"
                step="5"
                value={sizeMm}
                onChange={(event) => setSizeMm(Number(event.target.value))}
              />
              <div className="qr-print-size-presets" aria-label="QR size presets">
                {[50, 80, 100, 120].map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={sizeMm === size ? "is-selected" : ""}
                    onClick={() => setSizeMm(size)}
                  >
                    {size} mm
                  </button>
                ))}
              </div>
              <p className="qr-print-help">
                Use at least 30 mm for close scanning. Larger is better for posters.
              </p>
            </div>

            <div className="qr-print-control-group">
              <label htmlFor="qr-print-caption">Caption under QR</label>
              <input
                id="qr-print-caption"
                type="text"
                maxLength={60}
                value={caption}
                placeholder="e.g. Scan to visit our menu"
                onChange={(event) => setCaption(event.target.value)}
              />
            </div>

            <label className="qr-print-toggle">
              <input
                type="checkbox"
                checked={cutGuides}
                onChange={(event) => setCutGuides(event.target.checked)}
              />
              <span className="qr-print-toggle-mark" aria-hidden="true">
                {cutGuides && <Check size={13} />}
              </span>
              <span>
                <strong>Cut guides</strong>
                <small>Show trim marks around the QR.</small>
              </span>
              <Scissors size={17} aria-hidden="true" />
            </label>

            <div className="qr-print-tip">
              <Info size={17} aria-hidden="true" />
              <p>
                Print at <strong>100% / Actual size</strong> on A4. Keep the white
                quiet zone clear and test one printed copy before a full run.
              </p>
            </div>

            {error && <p className="qr-print-error" role="alert">{error}</p>}
          </aside>
        </div>

        <footer className="qr-print-footer">
          <p>Your design is placed on a single A4 page.</p>
          <div>
            <button
              type="button"
              className="secondary"
              onClick={handleDownload}
              disabled={isExporting}
            >
              <Download size={16} /> Download A4 PDF
            </button>
            <button
              type="button"
              className="primary"
              onClick={handlePrint}
              disabled={isExporting}
            >
              <Printer size={16} /> {isExporting ? "Preparing…" : "Print A4"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
