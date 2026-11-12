import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  X,
  GripVertical,
  Scissors,
  Layers,
  RotateCw,
  ChevronRight,
  ChevronLeft,
  Check,
  Trash2,
  FileText,
  Eye,
  ArrowUpDown,
  Maximize2,
  ZoomIn,
  LayoutGrid,
  List,
} from "lucide-react"
import { PDFDocument } from "pdf-lib"
import {
  extractPDFPages,
  getSinglePagePdfUrl,
  extractEmbeddedImagesFromPdf,
  type ExtractedPage,
} from "./services"

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = "merge" | "split" | "rotate" | "arrange"

interface DocumentPreviewModalProps {
  mode: Mode
  files: File[]
  onConfirm: (result: {
    orderedFiles?: File[]
    pageRanges?: string
    rotations?: Record<number, number>
    orderedPages?: number[]
  }) => void
  onClose: () => void
}

export interface DocumentPreviewData {
  pageCount: number
  imageUrl?: string
  pdfUrl?: string
  textLines?: string[]
  fullText?: string
  width?: number
  height?: number
  isImage?: boolean
}

export function getFileKey(file: File, index?: number): string {
  return `${file.name}-${file.size}-${file.lastModified || index || 0}`
}

export async function loadFilePreview(
  file: File,
): Promise<DocumentPreviewData> {
  const isImg =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(file.name)
  if (isImg) {
    try {
      const url = URL.createObjectURL(file)
      return {
        pageCount: 1,
        imageUrl: url,
        isImage: true,
      }
    } catch {
      return { pageCount: 1, isImage: true }
    }
  }

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
  if (isPdf) {
    try {
      const buf = await file.arrayBuffer()
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
      const pageCount = doc.getPageCount()
      let width = 595
      let height = 842
      try {
        const p1 = doc.getPage(0)
        const size = p1.getSize()
        width = size.width
        height = size.height
      } catch {}

      // Embedded images
      let imageUrl: string | undefined = undefined
      try {
        const imgs = await extractEmbeddedImagesFromPdf(new Uint8Array(buf))
        if (imgs && imgs.length > 0) {
          imageUrl = imgs[0]
        }
      } catch {}

      // Extracted text lines from page 1
      let textLines: string[] = []
      let fullText: string = ""
      try {
        const pgs = await extractPDFPages(buf)
        if (pgs && pgs.length > 0) {
          textLines = pgs[0].lines.slice(0, 8)
          fullText = pgs[0].fullText
        }
      } catch {}

      // Single-page PDF URL for clean inspection
      let pdfUrl: string | undefined = undefined
      try {
        pdfUrl = await getSinglePagePdfUrl(file, 1)
      } catch {
        try {
          pdfUrl = URL.createObjectURL(file)
        } catch {}
      }

      return {
        pageCount,
        imageUrl,
        pdfUrl,
        textLines,
        fullText,
        width,
        height,
      }
    } catch {
      return { pageCount: 1, textLines: [file.name] }
    }
  }

  // Text or others
  try {
    const text = await file.text()
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 8)
    return {
      pageCount: 1,
      textLines: lines,
      fullText: text.slice(0, 500),
    }
  } catch {
    return { pageCount: 1 }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileExt(file: File) {
  return file.name.split(".").pop()?.toUpperCase() ?? "FILE"
}

function extColor(ext: string) {
  const map: Record<string, string> = {
    PDF: "#ef4444",
    JPG: "#f97316",
    JPEG: "#f97316",
    PNG: "#22c55e",
    WEBP: "#06b6d4",
    MP3: "#a855f7",
    WAV: "#a855f7",
    DOC: "#3b82f6",
    DOCX: "#3b82f6",
    XLS: "#16a34a",
    XLSX: "#16a34a",
    ZIP: "#eab308",
  }
  return map[ext] ?? "#6366f1"
}

function splitPointsToRanges(
  splitPoints: Set<number>,
  orderedPages: number[],
): string {
  if (orderedPages.length === 0) return ""
  if (splitPoints.size === 0) {
    return `${orderedPages[0]}-${orderedPages[orderedPages.length - 1]}`
  }

  const parts: string[] = []
  let currentGroup: number[] = []

  orderedPages.forEach((pageNum, idx) => {
    currentGroup.push(pageNum)
    if (splitPoints.has(pageNum) || idx === orderedPages.length - 1) {
      if (currentGroup.length === 1) {
        parts.push(`${currentGroup[0]}`)
      } else {
        parts.push(
          `${currentGroup[0]}-${currentGroup[currentGroup.length - 1]}`,
        )
      }
      currentGroup = []
    }
  })

  return parts.join(", ")
}

// ─── FilePreviewCard (visual grid mode) ──────────────────────────────────────

interface FilePreviewCardProps {
  file: File
  index: number
  total: number
  preview?: DocumentPreviewData
  isDragSource: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent, i: number) => void
  onDragEnter: (i: number) => void
  onDragEnd: () => void
  onRemove: (i: number) => void
  onInspect: (file: File, index: number) => void
  onMove: (from: number, to: number) => void
}

function FilePreviewCard({
  file,
  index,
  total,
  preview,
  isDragSource,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onRemove,
  onInspect,
  onMove,
}: FilePreviewCardProps) {
  const ext = fileExt(file)
  const color = extColor(ext)

  return (
    <div
      className={[
        "dpm-file-preview-card",
        isDragSource ? "dpm-file-preview-card--dragging" : "",
        isDragOver ? "dpm-file-preview-card--over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Card Header */}
      <div className="dpm-file-preview-card__header">
        <span className="dpm-file-preview-card__order">#{index + 1}</span>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            color: "var(--muted)",
          }}
          title="Grab and move this card to set merge order"
        >
          <GripVertical size={16} />
        </div>
        <div className="dpm-file-preview-card__actions">
          <button
            type="button"
            className="dpm-icon-btn"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            title="Move earlier in merge order"
            aria-label={`Move ${file.name} earlier`}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="dpm-icon-btn"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
            title="Move later in merge order"
            aria-label={`Move ${file.name} later`}
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            className="dpm-icon-btn dpm-icon-btn--danger"
            onClick={() => onRemove(index)}
            title={`Remove ${file.name}`}
            aria-label={`Remove ${file.name}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Card Preview Canvas */}
      <div
        className="dpm-file-preview-canvas"
        onClick={() => onInspect(file, index)}
        title="Click to inspect enlarged preview"
      >
        {preview?.imageUrl ? (
          <img
            src={preview.imageUrl}
            alt={`Preview of ${file.name}`}
            className="dpm-file-preview-canvas__img"
          />
        ) : preview?.textLines && preview.textLines.length > 0 ? (
          <div className="dpm-file-preview-canvas__paper">
            <div className="dpm-file-preview-canvas__line dpm-file-preview-canvas__line--title" />
            {preview.textLines.map((line, li) => (
              <div key={li} className="dpm-file-preview-canvas__text-flow">
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div className="dpm-file-preview-canvas__paper">
            <div className="dpm-file-preview-canvas__line dpm-file-preview-canvas__line--title" />
            <div className="dpm-file-preview-canvas__line" />
            <div className="dpm-file-preview-canvas__line" />
            <div className="dpm-file-preview-canvas__line" />
            <div
              className="dpm-file-preview-canvas__line"
              style={{ width: "60%" }}
            />
          </div>
        )}

        {/* Page Count Badge */}
        <span className="dpm-file-preview-canvas__badge">
          {preview?.pageCount ?? 1} page
          {(preview?.pageCount ?? 1) !== 1 ? "s" : ""}
        </span>

        {/* Hover Click to Preview */}
        <div className="dpm-file-preview-canvas__overlay">
          <ZoomIn size={20} />
          <span>Inspect Preview</span>
        </div>
      </div>

      {/* Card Footer */}
      <div className="dpm-file-preview-card__footer">
        <div className="dpm-file-preview-card__info">
          <span className="dpm-file-preview-card__title" title={file.name}>
            {file.name}
          </span>
          <span className="dpm-file-preview-card__meta">
            <span
              className="dpm-file-preview-card__tag"
              style={{ background: color }}
            >
              {ext}
            </span>
            <span>{fmtSize(file.size)}</span>
          </span>
        </div>
        <button
          type="button"
          className="dpm-icon-btn"
          onClick={() => onInspect(file, index)}
          title="Inspect preview"
        >
          <Eye size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── FileCard (merge mode - list view) ────────────────────────────────────────

interface FileCardProps {
  file: File
  index: number
  total: number
  preview?: DocumentPreviewData
  isDragSource: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent, i: number) => void
  onDragEnter: (i: number) => void
  onDragEnd: () => void
  onRemove: (i: number) => void
  onInspect?: (file: File, index: number) => void
  onMove?: (from: number, to: number) => void
}

function FileCard({
  file,
  index,
  total,
  preview,
  isDragSource,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onRemove,
  onInspect,
  onMove,
}: FileCardProps) {
  const ext = fileExt(file)
  const color = extColor(ext)

  return (
    <div
      className={[
        "dpm-file-card",
        isDragSource ? "dpm-file-card--dragging" : "",
        isDragOver ? "dpm-file-card--over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="dpm-file-card__grip" title="Grab & move">
        <GripVertical size={16} />
      </div>

      {/* Mini Thumbnail Preview */}
      <div
        className="dpm-file-card__thumb"
        onClick={() => onInspect?.(file, index)}
        title="Click to inspect preview"
      >
        {preview?.imageUrl ? (
          <img src={preview.imageUrl} alt={file.name} />
        ) : (
          <div className="dpm-file-card__thumb-lines">
            <div
              className="dpm-file-card__thumb-line"
              style={{ width: "80%" }}
            />
            <div className="dpm-file-card__thumb-line" />
            <div
              className="dpm-file-card__thumb-line"
              style={{ width: "60%" }}
            />
          </div>
        )}
      </div>

      <div className="dpm-file-card__badge" style={{ background: color }}>
        {ext}
      </div>

      <div className="dpm-file-card__info">
        <span className="dpm-file-card__name" title={file.name}>
          {file.name}
        </span>
        <span className="dpm-file-card__meta">
          {fmtSize(file.size)} · {preview?.pageCount ?? 1} page
          {(preview?.pageCount ?? 1) !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="dpm-file-card__order">#{index + 1}</div>

      {onMove && (
        <div style={{ display: "inline-flex", gap: "2px" }}>
          <button
            type="button"
            className="dpm-icon-btn"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            title="Move up"
          >
            <ChevronLeft size={14} style={{ transform: "rotate(90deg)" }} />
          </button>
          <button
            type="button"
            className="dpm-icon-btn"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
            title="Move down"
          >
            <ChevronRight size={14} style={{ transform: "rotate(90deg)" }} />
          </button>
        </div>
      )}

      {onInspect && (
        <button
          type="button"
          className="dpm-icon-btn"
          onClick={() => onInspect(file, index)}
          title="Inspect preview"
        >
          <Eye size={14} />
        </button>
      )}

      <button
        type="button"
        className="dpm-file-card__remove"
        aria-label={`Remove ${file.name}`}
        onClick={() => onRemove(index)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ─── Interactive Page Thumbnail (Content preview + Draggable Reorder) ───────

interface InteractivePageCardProps {
  pageNum: number
  index: number
  pageData?: ExtractedPage
  pageImage?: string
  isSplitAfter: boolean
  isLast: boolean
  isDragSource: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent, i: number) => void
  onDragEnter: (i: number) => void
  onDragEnd: () => void
  onToggleSplit: (pageNum: number) => void
  onInspect: (num: number, data?: ExtractedPage) => void
}

function InteractivePageCard({
  pageNum,
  index,
  pageData,
  pageImage,
  isSplitAfter,
  isLast,
  isDragSource,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onToggleSplit,
  onInspect,
}: InteractivePageCardProps) {
  const previewLines = pageData?.lines?.slice(0, 5) || []
  const hasText = previewLines.length > 0

  return (
    <div className="dpm-page-wrap">
      <div
        className={[
          "dpm-page-thumb",
          "dpm-page-thumb--interactive",
          isDragSource ? "dpm-page-thumb--dragging" : "",
          isDragOver ? "dpm-page-thumb--over" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragEnter={() => onDragEnter(index)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => onInspect(pageNum, pageData)}
        title="Click to view full preview & inspect text. Drag to rearrange."
      >
        {/* Real Content Preview with embedded image or text lines */}
        <div className="dpm-page-thumb__canvas">
          {pageImage ? (
            <img
              src={pageImage}
              alt={`Page ${pageNum}`}
              className="dpm-page-thumb__embedded-img"
            />
          ) : hasText ? (
            <div className="dpm-page-thumb__text-flow">
              {previewLines.map((line, li) => (
                <div key={li} className="dpm-page-thumb__text-line">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className="dpm-page-thumb__lines">
              <div className="dpm-page-thumb__line" />
              <div className="dpm-page-thumb__line" />
              <div className="dpm-page-thumb__line" />
              <div className="dpm-page-thumb__line" />
              <div className="dpm-page-thumb__line" />
            </div>
          )}
        </div>

        {/* Hover Click-to-Zoom Indicator */}
        <div className="dpm-page-thumb__hover-overlay">
          <ZoomIn size={18} />
          <span>Click to Preview</span>
        </div>

        {/* Header & Badges */}
        <div className="dpm-page-thumb__badge-header">
          <span className="dpm-page-thumb__num">Page {pageNum}</span>
          <button
            type="button"
            className="dpm-page-thumb__zoom-btn"
            onClick={(e) => {
              e.stopPropagation()
              onInspect(pageNum, pageData)
            }}
            title="Inspect full page"
          >
            <Maximize2 size={11} />
          </button>
        </div>

        {/* Grip Icon */}
        <div className="dpm-page-thumb__drag-grip" title="Drag to move">
          <GripVertical size={13} />
        </div>
      </div>

      {/* Scissors Split Point Button */}
      {!isLast && (
        <button
          type="button"
          className={[
            "dpm-split-btn",
            isSplitAfter ? "dpm-split-btn--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={
            isSplitAfter
              ? `Remove split after page ${pageNum}`
              : `Add split after page ${pageNum}`
          }
          onClick={(e) => {
            e.stopPropagation()
            onToggleSplit(pageNum)
          }}
          title={
            isSplitAfter ? "Click to remove split" : "Click ✂ to cut/split here"
          }
        >
          <Scissors size={13} />
        </button>
      )}
    </div>
  )
}

// ─── Rotate Page Thumbnail ───────────────────────────────────────────────────

interface RotatePageCardProps {
  pageNum: number
  deg: number
  pageData?: ExtractedPage
  onRotate: (page: number) => void
  onInspect: (num: number, data?: ExtractedPage) => void
}

function RotatePageCard({
  pageNum,
  deg,
  pageData,
  onRotate,
  onInspect,
}: RotatePageCardProps) {
  const previewLines = pageData?.lines?.slice(0, 5) || []

  return (
    <div className="dpm-page-wrap dpm-page-wrap--col">
      <div
        className="dpm-page-thumb dpm-page-thumb--rotatable"
        style={{ "--rot": `${deg}deg` } as React.CSSProperties}
        onClick={() => onInspect(pageNum, pageData)}
        title="Click to view full preview. Click Rotate to rotate."
      >
        <div
          className="dpm-page-thumb__canvas"
          style={{
            transform: `rotate(${deg}deg)`,
            transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          {previewLines.length > 0 ? (
            <div className="dpm-page-thumb__text-flow">
              {previewLines.map((line, li) => (
                <div key={li} className="dpm-page-thumb__text-line">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className="dpm-page-thumb__lines">
              <div className="dpm-page-thumb__line" />
              <div className="dpm-page-thumb__line" />
              <div className="dpm-page-thumb__line" />
              <div className="dpm-page-thumb__line" />
            </div>
          )}
        </div>
        <span className="dpm-page-thumb__num">{pageNum}</span>
        {deg !== 0 && <div className="dpm-page-thumb__rot-badge">{deg}°</div>}
      </div>
      <button
        type="button"
        className="dpm-rotate-btn"
        onClick={(e) => {
          e.stopPropagation()
          onRotate(pageNum)
        }}
        aria-label={`Rotate page ${pageNum} 90° clockwise`}
      >
        <RotateCw size={12} />
        <span>Rotate</span>
      </button>
    </div>
  )
}

// ─── Main DocumentPreviewModal Component ─────────────────────────────────────

export default function DocumentPreviewModal({
  mode,
  files,
  onConfirm,
  onClose,
}: DocumentPreviewModalProps) {
  // File reordering & preview state
  const [orderedFiles, setOrderedFiles] = useState<File[]>([...files])
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [arrangeViewMode, setArrangeViewMode] = useState<"grid" | "list">(
    "grid",
  )
  const [filePreviews, setFilePreviews] = useState<
    Record<string, DocumentPreviewData>
  >({})
  const [inspectDocModal, setInspectDocModal] = useState<{
    file: File
    index: number
  } | null>(null)

  // Real Page Content & Count extraction
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([])
  const [pageOrder, setPageOrder] = useState<number[]>([])
  const [splitPoints, setSplitPoints] = useState<Set<number>>(new Set())
  const [rotations, setRotations] = useState<Record<number, number>>({})
  const [pageImages, setPageImages] = useState<string[]>([])
  const [inspectModal, setInspectModal] = useState<{
    num: number
    text: string
    pdfUrl?: string
    imageUrl?: string
  } | null>(null)
  const [isLoadingPages, setIsLoadingPages] = useState(false)

  // Load real previews for all files in merge / arrange mode
  useEffect(() => {
    let active = true
    if (mode === "merge" || mode === "arrange") {
      orderedFiles.forEach(async (file, idx) => {
        const key = getFileKey(file, idx)
        if (filePreviews[key]) return
        try {
          const preview = await loadFilePreview(file)
          if (!active) return
          setFilePreviews((prev) => ({
            ...prev,
            [key]: preview,
          }))
        } catch {
          if (!active) return
          setFilePreviews((prev) => ({
            ...prev,
            [key]: { pageCount: 1, textLines: [file.name] },
          }))
        }
      })
    }
    return () => {
      active = false
    }
  }, [orderedFiles, mode])

  // Page Drag & Drop
  const pageDragIndexRef = useRef<number | null>(null)
  const [pageDragOverIndex, setPageDragOverIndex] = useState<number | null>(
    null,
  )

  // Load Real PDF Pages and Embedded Images on mount
  useEffect(() => {
    let active = true
    const targetFile = files[0]
    if (targetFile && targetFile.type === "application/pdf") {
      setIsLoadingPages(true)
      targetFile
        .arrayBuffer()
        .then(async (buf) => {
          const pgs = await extractPDFPages(buf)
          const imgs = await extractEmbeddedImagesFromPdf(new Uint8Array(buf))
          return { pgs, imgs }
        })
        .then(({ pgs, imgs }) => {
          if (!active) return
          if (imgs && imgs.length > 0) {
            setPageImages(imgs)
          }
          if (pgs && pgs.length > 0) {
            setExtractedPages(pgs)
            setPageOrder(pgs.map((p) => p.pageNumber))
          } else if (imgs && imgs.length > 0) {
            setPageOrder(Array.from({ length: imgs.length }, (_, i) => i + 1))
          } else {
            const count = Math.max(
              2,
              Math.min(16, Math.ceil(targetFile.size / 20480)),
            )
            setPageOrder(Array.from({ length: count }, (_, i) => i + 1))
          }
          setIsLoadingPages(false)
        })
        .catch(() => {
          if (!active) return
          const count = Math.max(
            2,
            Math.min(16, Math.ceil(targetFile.size / 20480)),
          )
          setPageOrder(Array.from({ length: count }, (_, i) => i + 1))
          setIsLoadingPages(false)
        })
    } else if (targetFile) {
      const count = Math.max(
        2,
        Math.min(12, Math.ceil(targetFile.size / 51200)),
      )
      setPageOrder(Array.from({ length: count }, (_, i) => i + 1))
    }
    return () => {
      active = false
    }
  }, [files])

  // Animation entry
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (inspectDocModal) {
          setInspectDocModal(null)
        } else if (inspectModal) {
          if (inspectModal.pdfUrl) URL.revokeObjectURL(inspectModal.pdfUrl)
          setInspectModal(null)
        } else {
          handleClose()
        }
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [inspectModal, inspectDocModal])

  const handleClose = useCallback(() => {
    if (inspectModal?.pdfUrl) {
      URL.revokeObjectURL(inspectModal.pdfUrl)
    }
    setInspectDocModal(null)
    setVisible(false)
    setTimeout(onClose, 260)
  }, [onClose, inspectModal])

  // File Move Handler
  const handleMoveFile = (from: number, to: number) => {
    if (to < 0 || to >= orderedFiles.length || from === to) return
    setOrderedFiles((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      return copy
    })
    if (inspectDocModal && inspectDocModal.index === from) {
      setInspectDocModal({
        file: orderedFiles[to] || inspectDocModal.file,
        index: to,
      })
    }
  }

  const handleInspectDoc = (file: File, index: number) => {
    setInspectDocModal({ file, index })
  }

  // File Drag Handlers
  const handleFileDragStart = (e: React.DragEvent, i: number) => {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", `${i}`)
    dragIndexRef.current = i
  }

  const handleFileDragEnter = (i: number) => {
    if (dragIndexRef.current === null || dragIndexRef.current === i) return
    setDragOverIndex(i)
    setOrderedFiles((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(dragIndexRef.current!, 1)
      copy.splice(i, 0, moved)
      dragIndexRef.current = i
      return copy
    })
  }

  const handleFileDragEnd = () => {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleFileRemove = (i: number) => {
    setOrderedFiles((prev) => prev.filter((_, idx) => idx !== i))
    if (inspectDocModal && inspectDocModal.index === i) {
      setInspectDocModal(null)
    }
  }

  // Page Drag Handlers (Moving pages within the document)
  const handlePageDragStart = (e: React.DragEvent, i: number) => {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", `${i}`)
    pageDragIndexRef.current = i
  }

  const handlePageDragEnter = (i: number) => {
    if (pageDragIndexRef.current === null || pageDragIndexRef.current === i)
      return
    setPageDragOverIndex(i)
    setPageOrder((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(pageDragIndexRef.current!, 1)
      copy.splice(i, 0, moved)
      pageDragIndexRef.current = i
      return copy
    })
  }

  const handlePageDragEnd = () => {
    pageDragIndexRef.current = null
    setPageDragOverIndex(null)
  }

  // Split points toggle
  const handleToggleSplit = (pageNum: number) => {
    setSplitPoints((prev) => {
      const next = new Set(prev)
      if (next.has(pageNum)) next.delete(pageNum)
      else next.add(pageNum)
      return next
    })
  }

  // Rotate pages
  const handleRotate = (page: number) => {
    setRotations((prev) => ({
      ...prev,
      [page]: ((prev[page] ?? 0) + 90) % 360,
    }))
  }

  // Inspect page modal open
  const handleInspectPage = async (num: number, data?: ExtractedPage) => {
    let pdfUrl: string | undefined = undefined
    const imgMatch = pageImages[num - 1]
    if (!imgMatch && files[0] && files[0].type === "application/pdf") {
      try {
        pdfUrl = await getSinglePagePdfUrl(files[0], num)
      } catch {
        // Fallback to text
      }
    }
    setInspectModal({
      num,
      text: data?.fullText || "No digital text stream in this page.",
      pdfUrl,
      imageUrl: imgMatch,
    })
  }

  // Confirm changes
  const handleConfirm = () => {
    if (mode === "split") {
      const pageRanges = splitPointsToRanges(splitPoints, pageOrder)
      onConfirm({ pageRanges, orderedPages: pageOrder })
    } else if (mode === "rotate") {
      onConfirm({ rotations })
    } else {
      onConfirm({ orderedFiles })
    }
    handleClose()
  }

  // Header configs
  const headerMap: Record<Mode, {
    icon: React.ReactNode
    title: string
    subtitle: string
  }> = {
    merge: {
      icon: <Layers size={22} />,
      title: "Arrange Files",
      subtitle: "Drag files up or down to set the merge order",
    },
    arrange: {
      icon: <Layers size={22} />,
      title: "Arrange Files",
      subtitle: "Drag files up or down to set the merge order",
    },
    split: {
      icon: <Scissors size={22} />,
      title: "Preview Content & Set Split Points",
      subtitle:
        "Click any page card to inspect full preview. Grab and move to rearrange pages.",
    },
    rotate: {
      icon: <RotateCw size={22} />,
      title: "Rotate Pages",
      subtitle: "Inspect pages and click Rotate to adjust orientation",
    },
  }

  const header = headerMap[mode]

  // Mount safety
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const calculatedRanges = splitPointsToRanges(splitPoints, pageOrder)
  const partsCount = splitPoints.size + 1

  return createPortal(
    <div
      className={["dpm-backdrop", visible ? "dpm-backdrop--visible" : ""]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={header.title}
    >
      <div
        className={["dpm-modal", visible ? "dpm-modal--visible" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        <div className="dpm-header">
          <div className="dpm-header__icon">{header.icon}</div>
          <div className="dpm-header__text">
            <h2 className="dpm-header__title">{header.title}</h2>
            <p className="dpm-header__sub">{header.subtitle}</p>
          </div>
          <button
            className="dpm-close-btn"
            type="button"
            onClick={handleClose}
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="dpm-body">
          {/* File Merge / Arrange Mode with Visual Previews and Grab & Move */}
          {(mode === "merge" || mode === "arrange") && (
            <>
              {orderedFiles.length === 0 ? (
                <div className="dpm-empty">
                  <Layers size={44} />
                  <p>No files to arrange</p>
                </div>
              ) : (
                <>
                  <div className="dpm-arrange-toolbar">
                    <div className="dpm-arrange-toolbar__hint">
                      <GripVertical size={14} />
                      <span>
                        <strong>Grab &amp; move</strong> cards to set merge sequence
                        · Merges top/left &rarr; bottom/right
                      </span>
                    </div>

                    <div className="dpm-view-toggle">
                      <button
                        type="button"
                        className={[
                          "dpm-view-toggle__btn",
                          arrangeViewMode === "grid"
                            ? "dpm-view-toggle__btn--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setArrangeViewMode("grid")}
                        title="Visual Cards Preview"
                      >
                        <LayoutGrid size={14} />
                        <span>Cards Preview</span>
                      </button>
                      <button
                        type="button"
                        className={[
                          "dpm-view-toggle__btn",
                          arrangeViewMode === "list"
                            ? "dpm-view-toggle__btn--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setArrangeViewMode("list")}
                        title="Detailed List View"
                      >
                        <List size={14} />
                        <span>List View</span>
                      </button>
                    </div>
                  </div>

                  {arrangeViewMode === "grid" ? (
                    <div className="dpm-file-grid">
                      {orderedFiles.map((file, i) => {
                        const key = getFileKey(file, i)
                        const preview = filePreviews[key]
                        return (
                          <FilePreviewCard
                            key={key}
                            file={file}
                            index={i}
                            total={orderedFiles.length}
                            preview={preview}
                            isDragSource={dragIndexRef.current === i}
                            isDragOver={dragOverIndex === i}
                            onDragStart={handleFileDragStart}
                            onDragEnter={handleFileDragEnter}
                            onDragEnd={handleFileDragEnd}
                            onRemove={handleFileRemove}
                            onInspect={handleInspectDoc}
                            onMove={handleMoveFile}
                          />
                        )
                      })}
                    </div>
                  ) : (
                    <div className="dpm-file-list">
                      {orderedFiles.map((file, i) => {
                        const key = getFileKey(file, i)
                        const preview = filePreviews[key]
                        return (
                          <FileCard
                            key={key}
                            file={file}
                            index={i}
                            total={orderedFiles.length}
                            preview={preview}
                            isDragSource={dragIndexRef.current === i}
                            isDragOver={dragOverIndex === i}
                            onDragStart={handleFileDragStart}
                            onDragEnter={handleFileDragEnter}
                            onDragEnd={handleFileDragEnd}
                            onRemove={handleFileRemove}
                            onInspect={handleInspectDoc}
                            onMove={handleMoveFile}
                          />
                        )
                      })}
                    </div>
                  )}

                  <div className="dpm-hint" style={{ marginTop: "14px" }}>
                    <GripVertical size={14} />
                    <span>
                      Drag any document card or row to reposition · Order:{" "}
                      {orderedFiles.map((f, i) => `#${i + 1} ${f.name}`).join(" → ")}
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {/* Split Mode: Large Interactive Content Preview + Drag Reorder + Split Points */}
          {mode === "split" && (
            <>
              <div className="dpm-split-info">
                <div className="dpm-split-info__file">
                  <span
                    className="dpm-split-info__badge"
                    style={{ background: extColor(fileExt(files[0])) }}
                  >
                    {fileExt(files[0])}
                  </span>
                  <span>{files[0]?.name}</span>
                </div>
                <div className="dpm-split-info__pages">
                  {isLoadingPages
                    ? "Reading document..."
                    : `${pageOrder.length} pages · ${fmtSize(files[0]?.size ?? 0)}`}
                </div>
              </div>

              {/* Pages Grid with Grab & Move and Scissors */}
              <div className="dpm-page-grid">
                {pageOrder.map((pageNum, idx) => {
                  const pData = extractedPages.find(
                    (p) => p.pageNumber === pageNum,
                  )
                  const pImg = pageImages[pageNum - 1]
                  return (
                    <InteractivePageCard
                      key={pageNum}
                      pageNum={pageNum}
                      index={idx}
                      pageData={pData}
                      pageImage={pImg}
                      isSplitAfter={splitPoints.has(pageNum)}
                      isLast={idx === pageOrder.length - 1}
                      isDragSource={pageDragIndexRef.current === idx}
                      isDragOver={pageDragOverIndex === idx}
                      onDragStart={handlePageDragStart}
                      onDragEnter={handlePageDragEnter}
                      onDragEnd={handlePageDragEnd}
                      onToggleSplit={handleToggleSplit}
                      onInspect={(num, data) => handleInspectPage(num, data)}
                    />
                  )
                })}
              </div>

              {/* Split Breakdown Chips */}
              {splitPoints.size > 0 && (
                <div className="dpm-split-preview">
                  <strong>Output Parts ({partsCount}):</strong>{" "}
                  {calculatedRanges.split(", ").map((r, i) => (
                    <span key={i} className="dpm-split-preview__chip">
                      Part {i + 1}: pages {r}
                    </span>
                  ))}
                </div>
              )}

              <div className="dpm-hint">
                <ArrowUpDown size={14} />
                <span>
                  <strong>Click any card</strong> to view enlarged page content.{" "}
                  <strong>Grab &amp; move</strong> to rearrange order. Click{" "}
                  <Scissors
                    size={12}
                    style={{ display: "inline", verticalAlign: "middle" }}
                  />{" "}
                  between pages to set cuts.
                </span>
              </div>
            </>
          )}

          {/* Rotate Mode */}
          {mode === "rotate" && (
            <>
              <div className="dpm-split-info">
                <div className="dpm-split-info__file">
                  <span
                    className="dpm-split-info__badge"
                    style={{ background: extColor(fileExt(files[0])) }}
                  >
                    {fileExt(files[0])}
                  </span>
                  <span>{files[0]?.name}</span>
                </div>
                <div className="dpm-split-info__pages">
                  {pageOrder.length} pages · {fmtSize(files[0]?.size ?? 0)}
                </div>
              </div>

              <div className="dpm-page-grid">
                {pageOrder.map((pageNum) => {
                  const pData = extractedPages.find(
                    (p) => p.pageNumber === pageNum,
                  )
                  return (
                    <RotatePageCard
                      key={pageNum}
                      pageNum={pageNum}
                      deg={rotations[pageNum] ?? 0}
                      pageData={pData}
                      onRotate={handleRotate}
                      onInspect={(num, data) => handleInspectPage(num, data)}
                    />
                  )
                })}
              </div>

              <div className="dpm-hint">
                <RotateCw size={14} />
                <span>
                  Click Rotate to cycle each page through 90&deg; orientations
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="dpm-footer">
          <button
            type="button"
            className="dpm-footer__cancel"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dpm-footer__confirm"
            onClick={handleConfirm}
            disabled={
              (mode === "merge" || mode === "arrange") &&
              orderedFiles.length === 0
            }
          >
            <Check size={16} />
            {mode === "split"
              ? `Apply Split (${partsCount} part${partsCount !== 1 ? "s" : ""})`
              : mode === "rotate"
                ? "Apply Rotations"
                : `Apply Order (${orderedFiles.length} file${
                    orderedFiles.length !== 1 ? "s" : ""
                  })`}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Enlarged Full Page Preview Modal */}
      {inspectModal && (
        <div
          className="dpm-inspect-backdrop"
          onClick={() => {
            if (inspectModal.pdfUrl) URL.revokeObjectURL(inspectModal.pdfUrl)
            setInspectModal(null)
          }}
        >
          <div
            className="dpm-inspect-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dpm-inspect-header">
              <FileText size={18} />
              <h3>Page {inspectModal.num} Preview</h3>
              <button
                type="button"
                className="dpm-close-btn"
                onClick={() => {
                  if (inspectModal.pdfUrl)
                    URL.revokeObjectURL(inspectModal.pdfUrl)
                  setInspectModal(null)
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="dpm-inspect-body">
              {inspectModal.imageUrl ? (
                <div className="dpm-inspect-image-wrap">
                  <img
                    src={inspectModal.imageUrl}
                    alt={`Page ${inspectModal.num} Preview`}
                    className="dpm-inspect-image"
                  />
                </div>
              ) : inspectModal.pdfUrl ? (
                <object
                  data={inspectModal.pdfUrl}
                  type="application/pdf"
                  className="dpm-inspect-iframe"
                >
                  <iframe
                    src={`${inspectModal.pdfUrl}#toolbar=0&navpanes=0`}
                    title={`Page ${inspectModal.num} PDF Preview`}
                    className="dpm-inspect-iframe"
                  />
                </object>
              ) : (
                <pre>{inspectModal.text}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Full Document Inspection Modal (Merge Mode) */}
      {inspectDocModal && (
        <div
          className="dpm-inspect-backdrop"
          onClick={() => setInspectDocModal(null)}
        >
          <div
            className="dpm-inspect-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "880px" }}
          >
            <div className="dpm-inspect-header">
              <FileText size={18} />
              <h3 style={{ fontSize: "14px", flex: 1 }}>
                Document #{inspectDocModal.index + 1} of {orderedFiles.length}:{" "}
                <span style={{ color: "var(--accent, #aa91ff)" }}>
                  {inspectDocModal.file.name}
                </span>
              </h3>
              <button
                type="button"
                className="dpm-close-btn"
                onClick={() => setInspectDocModal(null)}
                aria-label="Close document inspection"
              >
                <X size={16} />
              </button>
            </div>

            {/* Reorder control strip in inspector */}
            <div className="dpm-inspect-reorder-bar">
              <div className="dpm-inspect-reorder-bar__pos">
                <GripVertical size={14} />
                <span>
                  Current Merge Position:{" "}
                  <strong>#{inspectDocModal.index + 1}</strong>
                </span>
                <span style={{ color: "var(--muted)" }}>
                  ({fmtSize(inspectDocModal.file.size)} ·{" "}
                  {filePreviews[
                    getFileKey(inspectDocModal.file, inspectDocModal.index)
                  ]?.pageCount ?? 1}{" "}
                  page
                  {(filePreviews[
                    getFileKey(inspectDocModal.file, inspectDocModal.index)
                  ]?.pageCount ?? 1) !== 1
                    ? "s"
                    : ""}
                  )
                </span>
              </div>
              <div className="dpm-inspect-reorder-bar__btns">
                <button
                  type="button"
                  className="secondary"
                  disabled={inspectDocModal.index === 0}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={() =>
                    handleMoveFile(
                      inspectDocModal.index,
                      inspectDocModal.index - 1,
                    )
                  }
                >
                  <ChevronLeft size={13} /> Move Earlier
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={inspectDocModal.index === orderedFiles.length - 1}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={() =>
                    handleMoveFile(
                      inspectDocModal.index,
                      inspectDocModal.index + 1,
                    )
                  }
                >
                  Move Later <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <div className="dpm-inspect-body">
              {(() => {
                const key = getFileKey(
                  inspectDocModal.file,
                  inspectDocModal.index,
                )
                const pInfo = filePreviews[key]
                if (pInfo?.imageUrl) {
                  return (
                    <div className="dpm-inspect-image-wrap">
                      <img
                        src={pInfo.imageUrl}
                        alt={`Preview of ${inspectDocModal.file.name}`}
                        className="dpm-inspect-image"
                      />
                    </div>
                  )
                }
                if (pInfo?.pdfUrl) {
                  return (
                    <object
                      data={pInfo.pdfUrl}
                      type="application/pdf"
                      className="dpm-inspect-iframe"
                    >
                      <iframe
                        src={`${pInfo.pdfUrl}#toolbar=0&navpanes=0`}
                        title={`Preview ${inspectDocModal.file.name}`}
                        className="dpm-inspect-iframe"
                      />
                    </object>
                  )
                }
                if (pInfo?.fullText) {
                  return <pre>{pInfo.fullText}</pre>
                }
                return (
                  <div
                    style={{
                      padding: "40px",
                      textAlign: "center",
                      color: "var(--muted)",
                      width: "100%",
                    }}
                  >
                    <FileText size={48} style={{ margin: "0 auto 12px" }} />
                    <p style={{ fontWeight: 600, color: "var(--text)" }}>
                      {inspectDocModal.file.name}
                    </p>
                    <p style={{ fontSize: "12px" }}>
                      Ready to merge as #{inspectDocModal.index + 1}
                    </p>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
