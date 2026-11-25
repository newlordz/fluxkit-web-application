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
  ExternalLink,
  Download,
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

  onFilesChange?: (files: File[]) => void

  onFileRemove?: (file: File, index: number, remainingFiles: File[]) => void
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

export function cleanReadableLines(lines: string[]): string[] {
  if (!lines || lines.length === 0) return []

  return lines

    .map((l) =>
      l.replace(
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD\uFFF0-\uFFFF\uE000-\uF8FF\u25A0-\u25FF]/g,

        "",
      )

        .trim(),
    )

    .filter((l) => {
      if (l.length < 2) return false

      const letters = l.match(/[\p{L}\p{N}]/gu) || []

      if (letters.length < 2) return false

      const printable = l.match(/[\p{L}\p{N}\p{P}\p{S}\p{Z}]/gu) || []

      return printable.length / l.length >= 0.7
    })
}

export async function getPdfJsLibrary(): Promise<any> {
  const mod = await import("./pdfEngine")
  return mod.getPdfJsLibrary()
}

export async function renderPdfPageToDataUrl(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  pageNumber: number = 1,
  scale: number = 1.2,
): Promise<string | null> {
  const mod = await import("./pdfEngine")
  return mod.renderPdfPageToDataUrl(fileOrBuffer, pageNumber, scale)
}

const fileKeyMap = new WeakMap<File, string>()
let fileKeyCounter = 0

export function getFileKey(file: File, index?: number): string {
  if (file && typeof file === "object") {
    let key = fileKeyMap.get(file)
    if (!key) {
      key = `file_${++fileKeyCounter}_${file.name}_${file.size}_${file.lastModified || 0}`
      fileKeyMap.set(file, key)
    }
    return key
  }
  return `file_${index || 0}`
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

      // Try rendering real canvas snapshot via PDF.js first in browser

      let imageUrl: string | undefined = undefined

      if (typeof window !== "undefined") {
        try {
          const rendered = await renderPdfPageToDataUrl(buf, 1, 1.2)

          if (rendered) {
            imageUrl = rendered
          }
        } catch {}
      }

      // Embedded images fallback

      if (!imageUrl) {
        try {
          const imgs = await extractEmbeddedImagesFromPdf(new Uint8Array(buf))

          if (imgs && imgs.length > 0) {
            imageUrl = imgs[0]
          }
        } catch {}
      }

      // Extracted text lines from page 1 (sanitized against corrupted font glyphs/tofu)

      let textLines: string[] = []

      let fullText: string = ""

      try {
        const pgs = await extractPDFPages(buf)

        if (pgs && pgs.length > 0) {
          textLines = cleanReadableLines(pgs[0].lines).slice(0, 8)

          fullText = textLines.join("\n")
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
      return { pageCount: 1, textLines: [] }
    }
  }

  // Word documents (.docx, .doc)
  const isDocx =
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name)

  if (isDocx) {
    try {
      const jszipMod = await import("jszip")
      const JSZip = (jszipMod.default || jszipMod) as any
      const buf = await file.arrayBuffer()
      const zip = await JSZip.loadAsync(buf)
      const docXmlFile = zip.file("word/document.xml")

      let textLines: string[] = []
      let fullText = ""

      if (docXmlFile) {
        const xml = await docXmlFile.async("text")
        const pMatches = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi) || []
        const paras: string[] = []
        for (const pXml of pMatches) {
          const tMatches = pXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi) || []
          const text = tMatches
            .map((t: string) => t.replace(/<[^>]+>/g, ""))
            .join("")
            .trim()
          if (text) paras.push(text)
        }
        textLines = cleanReadableLines(paras).slice(0, 10)
        fullText = paras.join("\n\n")
      }

      let imageUrl: string | undefined = undefined
      let pdfUrl: string | undefined = undefined
      let pageCount = 1

      try {
        const { wordToPDF } = await import("./services")
        const pdfRes = await wordToPDF(file)
        if (pdfRes?.blob) {
          const pdfBuf = await pdfRes.blob.arrayBuffer()
          const doc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true })
          pageCount = Math.max(1, doc.getPageCount())
          if (typeof window !== "undefined") {
            try {
              const rendered = await renderPdfPageToDataUrl(pdfBuf, 1, 1.2)
              if (rendered) imageUrl = rendered
            } catch {}
          }
          try {
            pdfUrl = URL.createObjectURL(pdfRes.blob)
          } catch {}
        }
      } catch (err) {
        // Fallback to text preview
      }

      if (!textLines.length) {
        textLines = [file.name.replace(/\.[^/.]+$/, "")]
      }

      return {
        pageCount,
        imageUrl,
        pdfUrl,
        textLines,
        fullText: fullText || textLines.join("\n"),
      }
    } catch {
      return {
        pageCount: 1,
        textLines: [file.name.replace(/\.[^/.]+$/, "")],
        fullText: file.name,
      }
    }
  }

  const isDoc = /\.doc$/i.test(file.name) || file.type === "application/msword"
  if (isDoc) {
    try {
      const { wordToPDF } = await import("./services")
      const pdfRes = await wordToPDF(file)
      if (pdfRes?.blob) {
        const pdfBuf = await pdfRes.blob.arrayBuffer()
        const doc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true })
        const pageCount = Math.max(1, doc.getPageCount())
        let imageUrl: string | undefined = undefined
        if (typeof window !== "undefined") {
          try {
            const rendered = await renderPdfPageToDataUrl(pdfBuf, 1, 1.2)
            if (rendered) imageUrl = rendered
          } catch {}
        }
        return {
          pageCount,
          imageUrl,
          pdfUrl: URL.createObjectURL(pdfRes.blob),
          textLines: [file.name.replace(/\.[^/.]+$/, "")],
          fullText: `Word Document: ${file.name}`,
        }
      }
    } catch {}
    return {
      pageCount: 1,
      textLines: [file.name.replace(/\.[^/.]+$/, "")],
      fullText: `Word Document: ${file.name}`,
    }
  }

  // Text or others
  try {
    const text = await file.text()

    // Binary file safety check - don't render zip/binary header garbage
    if (/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1000)) || text.startsWith("PK\x03\x04")) {
      return {
        pageCount: 1,
        textLines: [file.name.replace(/\.[^/.]+$/, "")],
        fullText: file.name,
      }
    }

    const lines = cleanReadableLines(text.split("\n")).slice(0, 8)

    return {
      pageCount: 1,

      textLines: lines,

      fullText: lines.join("\n"),
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

    MP3: "#00C9B7",

    WAV: "#00A899",

    DOC: "#3b82f6",

    DOCX: "#3b82f6",

    XLS: "#16a34a",

    XLSX: "#16a34a",

    ZIP: "#eab308",
  }

  return map[ext] ?? "#00C9B7"
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

  onDragEnter: (e: React.DragEvent, i: number) => void

  onDragOver: (e: React.DragEvent, i: number) => void

  onDragLeave: (e: React.DragEvent, i: number) => void

  onDrop: (e: React.DragEvent, i: number) => void

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

  onDragOver,

  onDragLeave,

  onDrop,

  onDragEnd,

  onRemove,

  onInspect,

  onMove,
}: FilePreviewCardProps) {
  const ext = fileExt(file)

  const color = extColor(ext)

  const [localImg, setLocalImg] = useState<string | null>(
    preview?.imageUrl || null,
  )

  useEffect(() => {
    if (preview?.imageUrl) {
      setLocalImg(preview.imageUrl)

      return
    }

    let active = true

    if (
      file &&
      (file.type === "application/pdf" || /\.pdf$/i.test(file.name))
    ) {
      renderPdfPageToDataUrl(file, 1, 1.2).then((img) => {
        if (active && img) setLocalImg(img)
      })
    }

    return () => {
      active = false
    }
  }, [file, preview?.imageUrl])

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
      onDragEnter={(e) => onDragEnter(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={(e) => onDragLeave(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {/* Card Header */}
      <div className="dpm-file-preview-card__header">
        <span className="dpm-file-preview-card__order">#{index + 1}</span>
        <div
          className="dpm-file-preview-card__grip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            color: "var(--muted)",
            cursor: "grab",
          }}
          title="Grab and move this card to set merge order"
        >
          <GripVertical size={16} style={{ pointerEvents: "none" }} />
        </div>
        <div className="dpm-file-preview-card__actions" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="dpm-icon-btn"
            disabled={index === 0}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onMove(index, index - 1)
            }}
            title="Move earlier in merge order"
            aria-label={`Move ${file.name} earlier`}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="dpm-icon-btn"
            disabled={index === total - 1}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onMove(index, index + 1)
            }}
            title="Move later in merge order"
            aria-label={`Move ${file.name} later`}
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            className="dpm-icon-btn dpm-icon-btn--danger"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRemove(index)
            }}
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
        onClick={(e) => {
          e.stopPropagation()
          onInspect(file, index)
        }}
        title="Click to inspect enlarged preview. Grab card to set merge order."
      >
        {localImg ? (
          <img
            src={localImg}
            alt={`Preview of ${file.name}`}
            className="dpm-file-preview-canvas__img"
            draggable={false}
            style={{ pointerEvents: "none", userSelect: "none" }}
          />
        ) : preview?.textLines && preview.textLines.length > 0 ? (
          <div className="dpm-file-preview-canvas__paper" style={{ pointerEvents: "none", userSelect: "none" }}>
            <div className="dpm-file-preview-canvas__line dpm-file-preview-canvas__line--title" />
            {preview.textLines.map((line, li) => (
              <div key={li} className="dpm-file-preview-canvas__text-flow">
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div className="dpm-file-preview-canvas__paper" style={{ pointerEvents: "none", userSelect: "none" }}>
            <div
              style={{
                display: "flex",

                flexDirection: "column",

                alignItems: "center",

                justifyContent: "center",

                height: "100%",

                gap: "8px",

                padding: "12px",

                textAlign: "center",

                pointerEvents: "none",

                userSelect: "none",
              }}
            >
              <FileText
                size={30}
                style={{ color: "var(--accent, #aa91ff)", opacity: 0.85 }}
              />
              <span
                style={{
                  fontSize: "11px",

                  fontWeight: 700,

                  color: "var(--text)",

                  maxWidth: "100%",

                  overflow: "hidden",

                  textOverflow: "ellipsis",

                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </span>
              <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                {fmtSize(file.size)}
              </span>
            </div>
          </div>
        )}

        {/* Page Count Badge */}
        <span className="dpm-file-preview-canvas__badge" style={{ pointerEvents: "none", userSelect: "none" }}>
          {preview?.pageCount ?? 1} page
          {(preview?.pageCount ?? 1) !== 1 ? "s" : ""}
        </span>

        {/* Drop target badge when dragged over */}
        {isDragOver && (
          <div className="dpm-drop-overlay">
            <span>Drop to move here</span>
          </div>
        )}

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

  onDragEnter: (e: React.DragEvent, i: number) => void

  onDragOver: (e: React.DragEvent, i: number) => void

  onDragLeave: (e: React.DragEvent, i: number) => void

  onDrop: (e: React.DragEvent, i: number) => void

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

  onDragOver,

  onDragLeave,

  onDrop,

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
      onDragEnter={(e) => onDragEnter(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={(e) => onDragLeave(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <div className="dpm-file-card__grip" title="Grab & move">
        <GripVertical size={16} style={{ pointerEvents: "none" }} />
      </div>

      {/* Mini Thumbnail Preview */}
      <div
        className="dpm-file-card__thumb"
        onClick={(e) => {
          e.stopPropagation()
          onInspect?.(file, index)
        }}
        title="Click to inspect preview"
      >
        {preview?.imageUrl ? (
          <img
            src={preview.imageUrl}
            alt={file.name}
            draggable={false}
            style={{ pointerEvents: "none", userSelect: "none" }}
          />
        ) : (
          <div className="dpm-file-card__thumb-lines" style={{ pointerEvents: "none", userSelect: "none" }}>
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
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(index)
        }}
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

  onDragEnter: (e: React.DragEvent, i: number) => void

  onDragOver: (e: React.DragEvent, i: number) => void

  onDragLeave: (e: React.DragEvent, i: number) => void

  onDrop: (e: React.DragEvent, i: number) => void

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

  onDragOver,

  onDragLeave,

  onDrop,

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
        onDragEnter={(e) => onDragEnter(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDragLeave={(e) => onDragLeave(e, index)}
        onDrop={(e) => onDrop(e, index)}
        onDragEnd={onDragEnd}
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
              draggable={false}
              style={{ pointerEvents: "none", userSelect: "none" }}
            />
          ) : hasText ? (
            <div className="dpm-page-thumb__text-flow" style={{ pointerEvents: "none", userSelect: "none" }}>
              {previewLines.map((line, li) => (
                <div key={li} className="dpm-page-thumb__text-line">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className="dpm-page-thumb__lines" style={{ pointerEvents: "none", userSelect: "none" }}>
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

  onFilesChange,

  onFileRemove,
}: DocumentPreviewModalProps) {
  // File reordering & preview state

  const [orderedFiles, setOrderedFiles] = useState<File[]>([...files])

  useEffect(() => {
    if (files) {
      setOrderedFiles([...files])
    }
  }, [files])

  const dragIndexRef = useRef<number | null>(null)

  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null)

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const [arrangeViewMode, setArrangeViewMode] = useState<"grid" | "list">(
    "grid",
  )

  const [filePreviews, setFilePreviews] =
    useState<Record<string, DocumentPreviewData>>({})

  const [inspectDocModal, setInspectDocModal] = useState<{
    file: File

    index: number
  } | null>(null)

  const [docInspectImg, setDocInspectImg] = useState<string | null>(null)

  const [isDocInspectLoading, setIsDocInspectLoading] = useState(false)

  useEffect(() => {
    if (!inspectDocModal) {
      setDocInspectImg(null)

      setIsDocInspectLoading(false)

      return
    }

    const key = getFileKey(inspectDocModal.file, inspectDocModal.index)

    const existing = filePreviews[key]?.imageUrl

    if (existing) {
      setDocInspectImg(existing)

      setIsDocInspectLoading(false)

      return
    }

    let active = true

    const isDocxOrDoc =
      inspectDocModal.file &&
      (inspectDocModal.file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        inspectDocModal.file.type === "application/msword" ||
        /\.(docx|doc)$/i.test(inspectDocModal.file.name))

    if (
      inspectDocModal.file &&
      (inspectDocModal.file.type === "application/pdf" ||
        /\.pdf$/i.test(inspectDocModal.file.name))
    ) {
      setIsDocInspectLoading(true)

      renderPdfPageToDataUrl(inspectDocModal.file, 1, 1.8)
        .then((img) => {
          if (active) {
            if (img) setDocInspectImg(img)

            setIsDocInspectLoading(false)
          }
        })
        .catch(() => {
          if (active) setIsDocInspectLoading(false)
        })
    } else if (isDocxOrDoc) {
      setIsDocInspectLoading(true)
      import("./services")
        .then((s) => s.wordToPDF(inspectDocModal.file))
        .then((res) => (res?.blob ? res.blob.arrayBuffer() : null))
        .then((buf) => (buf ? renderPdfPageToDataUrl(buf, 1, 1.8) : null))
        .then((img) => {
          if (active) {
            if (img) setDocInspectImg(img)
            setIsDocInspectLoading(false)
          }
        })
        .catch(() => {
          if (active) setIsDocInspectLoading(false)
        })
    } else {
      setIsDocInspectLoading(false)
    }

    return () => {
      active = false
    }
  }, [inspectDocModal, filePreviews])

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

  const [pageDragSourceIndex, setPageDragSourceIndex] = useState<number | null>(
    null,
  )

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

    if (mode === "merge" || mode === "arrange") {
      onConfirm({ orderedFiles })
    }

    setTimeout(onClose, 260)
  }, [onClose, inspectModal, mode, onConfirm, orderedFiles])

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

  // File Drag & Drop Handlers

  const handleFileDragStart = (e: React.DragEvent, i: number) => {
    dragIndexRef.current = i
    e.dataTransfer.effectAllowed = "move"
    try {
      e.dataTransfer.setData("text/plain", `${i}`)
      e.dataTransfer.setData("application/x-masterfilepro-file", `${i}`)
    } catch {
      // ignore
    }
    // Defer state update so Chromium/Safari does not cancel native drag on DOM re-render
    setTimeout(() => {
      setDragSourceIndex(i)
    }, 0)
  }

  const handleFileDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    if (dragOverIndex !== i) {
      setDragOverIndex(i)
    }
  }

  const handleFileDragEnter = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragOverIndex !== i) {
      setDragOverIndex(i)
    }
  }

  const handleFileDragLeave = (e: React.DragEvent, i: number) => {
    e.stopPropagation()
    if (e.currentTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
      return
    }
    if (dragOverIndex === i) {
      setDragOverIndex(null)
    }
  }

  const handleFileDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    e.stopPropagation()

    let source = dragIndexRef.current
    if (source === null) {
      const text =
        e.dataTransfer.getData("application/x-masterfilepro-file") ||
        e.dataTransfer.getData("text/plain")
      if (text) {
        const parsed = parseInt(text, 10)
        if (!isNaN(parsed)) source = parsed
      }
    }

    if (source !== null && source !== targetIndex) {
      setOrderedFiles((prev) => {
        const copy = [...prev]
        const [moved] = copy.splice(source!, 1)
        copy.splice(targetIndex, 0, moved)
        return copy
      })

      if (inspectDocModal && inspectDocModal.index === source) {
        setInspectDocModal({
          file: orderedFiles[targetIndex] || inspectDocModal.file,
          index: targetIndex,
        })
      }
    }

    dragIndexRef.current = null
    setDragSourceIndex(null)
    setDragOverIndex(null)
  }

  const handleFileDragEnd = () => {
    dragIndexRef.current = null
    setDragSourceIndex(null)
    setDragOverIndex(null)
  }

  const handleFileRemove = (i: number) => {
    const fileToRemove = orderedFiles[i]
    const updated = orderedFiles.filter((_, idx) => idx !== i)
    setOrderedFiles(updated)

    if (inspectDocModal && inspectDocModal.index === i) {
      setInspectDocModal(null)
    }

    onFilesChange?.(updated)
    if (fileToRemove) {
      onFileRemove?.(fileToRemove, i, updated)
    }

    if (updated.length === 0) {
      handleClose()
    }
  }

  // Page Drag & Drop Handlers (Moving pages within the document)

  const handlePageDragStart = (e: React.DragEvent, i: number) => {
    pageDragIndexRef.current = i
    setPageDragSourceIndex(i)
    e.dataTransfer.effectAllowed = "move"
    try {
      e.dataTransfer.setData("text/plain", `${i}`)
      e.dataTransfer.setData("application/x-masterfilepro-page", `${i}`)
    } catch {
      // ignore
    }
  }

  const handlePageDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (pageDragOverIndex !== i) {
      setPageDragOverIndex(i)
    }
  }

  const handlePageDragEnter = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    if (pageDragOverIndex !== i) {
      setPageDragOverIndex(i)
    }
  }

  const handlePageDragLeave = (e: React.DragEvent, i: number) => {
    if (e.currentTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
      return
    }
    if (pageDragOverIndex === i) {
      setPageDragOverIndex(null)
    }
  }

  const handlePageDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    e.stopPropagation()

    let source = pageDragIndexRef.current
    if (source === null) {
      const text =
        e.dataTransfer.getData("application/x-masterfilepro-page") ||
        e.dataTransfer.getData("text/plain")
      if (text) {
        const parsed = parseInt(text, 10)
        if (!isNaN(parsed)) source = parsed
      }
    }

    if (source !== null && source !== targetIndex) {
      setPageOrder((prev) => {
        const copy = [...prev]
        const [moved] = copy.splice(source!, 1)
        copy.splice(targetIndex, 0, moved)
        return copy
      })
    }

    pageDragIndexRef.current = null
    setPageDragSourceIndex(null)
    setPageDragOverIndex(null)
  }

  const handlePageDragEnd = () => {
    pageDragIndexRef.current = null
    setPageDragSourceIndex(null)
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

    let imgMatch = pageImages[num - 1]

    if (!imgMatch && files[0] && files[0].type === "application/pdf") {
      try {
        const rendered = await renderPdfPageToDataUrl(files[0], num, 1.8)

        if (rendered) {
          imgMatch = rendered
        }
      } catch {}

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
                        <strong>Grab &amp; move</strong> cards to set merge
                        sequence · Merges top/left &rarr; bottom/right
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
                            isDragSource={dragSourceIndex === i}
                            isDragOver={dragOverIndex === i}
                            onDragStart={handleFileDragStart}
                            onDragEnter={handleFileDragEnter}
                            onDragOver={handleFileDragOver}
                            onDragLeave={handleFileDragLeave}
                            onDrop={handleFileDrop}
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
                            isDragSource={dragSourceIndex === i}
                            isDragOver={dragOverIndex === i}
                            onDragStart={handleFileDragStart}
                            onDragEnter={handleFileDragEnter}
                            onDragOver={handleFileDragOver}
                            onDragLeave={handleFileDragLeave}
                            onDrop={handleFileDrop}
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
                      {orderedFiles
                        .map((f, i) => `#${i + 1} ${f.name}`)
                        .join(" → ")}
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
                      isDragSource={pageDragSourceIndex === idx}
                      isDragOver={pageDragOverIndex === idx}
                      onDragStart={handlePageDragStart}
                      onDragEnter={handlePageDragEnter}
                      onDragOver={handlePageDragOver}
                      onDragLeave={handlePageDragLeave}
                      onDrop={handlePageDrop}
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
              {inspectModal.pdfUrl && (
                <button
                  type="button"
                  className="secondary"
                  style={{
                    padding: "4px 10px",

                    fontSize: "11px",

                    borderRadius: "6px",

                    display: "inline-flex",

                    alignItems: "center",

                    gap: "4px",
                  }}
                  onClick={() => window.open(inspectModal.pdfUrl, "_blank")}
                  title="Open page in a dedicated browser tab"
                >
                  <ExternalLink size={13} /> View PDF in Tab
                </button>
              )}
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
              ) : inspectModal.text && inspectModal.text.trim() ? (
                <pre>{inspectModal.text}</pre>
              ) : (
                <div
                  style={{
                    padding: "40px",

                    textAlign: "center",

                    color: "var(--muted)",

                    width: "100%",

                    display: "flex",

                    flexDirection: "column",

                    alignItems: "center",

                    justifyContent: "center",

                    gap: "12px",
                  }}
                >
                  <FileText
                    size={48}
                    style={{ color: "var(--accent, #aa91ff)" }}
                  />
                  <p style={{ fontWeight: 600, color: "var(--text)" }}>
                    Page {inspectModal.num} Ready
                  </p>
                  {inspectModal.pdfUrl && (
                    <button
                      type="button"
                      className="primary"
                      style={{
                        padding: "6px 14px",

                        fontSize: "12px",

                        borderRadius: "8px",

                        display: "inline-flex",

                        alignItems: "center",

                        gap: "6px",
                      }}
                      onClick={() => window.open(inspectModal.pdfUrl, "_blank")}
                    >
                      <ExternalLink size={14} /> Open Page in Dedicated Tab
                    </button>
                  )}
                </div>
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
              {(() => {
                const key = getFileKey(
                  inspectDocModal.file,

                  inspectDocModal.index,
                )

                const pInfo = filePreviews[key]

                const docUrl =
                  pInfo?.pdfUrl || URL.createObjectURL(inspectDocModal.file)

                return (
                  <div
                    style={{
                      display: "flex",

                      alignItems: "center",

                      gap: "6px",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary"
                      style={{
                        padding: "4px 10px",

                        fontSize: "11px",

                        borderRadius: "6px",

                        display: "inline-flex",

                        alignItems: "center",

                        gap: "4px",
                      }}
                      onClick={() => window.open(docUrl, "_blank")}
                      title="Open document in a dedicated browser tab (bypasses browser iframe restrictions)"
                    >
                      <ExternalLink size={13} /> View Full PDF
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      style={{
                        padding: "4px 10px",

                        fontSize: "11px",

                        borderRadius: "6px",

                        display: "inline-flex",

                        alignItems: "center",

                        gap: "4px",
                      }}
                      onClick={() => {
                        const a = document.createElement("a")

                        a.href = docUrl

                        a.download = inspectDocModal.file.name

                        a.click()
                      }}
                      title="Download document"
                    >
                      <Download size={13} /> Download
                    </button>
                  </div>
                )
              })()}
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
                if (isDocInspectLoading) {
                  return (
                    <div
                      style={{
                        padding: "60px 20px",

                        textAlign: "center",

                        color: "var(--muted)",

                        width: "100%",

                        display: "flex",

                        flexDirection: "column",

                        alignItems: "center",

                        justifyContent: "center",

                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",

                          height: "32px",

                          borderRadius: "50%",

                          border: "3px solid rgba(170, 145, 255, 0.2)",

                          borderTopColor: "var(--accent, #aa91ff)",

                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>
                        Rendering visual document preview...
                      </span>
                    </div>
                  )
                }

                const key = getFileKey(
                  inspectDocModal.file,

                  inspectDocModal.index,
                )

                const pInfo = filePreviews[key]

                const finalImg = docInspectImg || pInfo?.imageUrl

                if (finalImg) {
                  return (
                    <div className="dpm-inspect-image-wrap">
                      <img
                        src={finalImg}
                        alt={`Preview of ${inspectDocModal.file.name}`}
                        className="dpm-inspect-image"
                      />
                    </div>
                  )
                }

                if (pInfo?.fullText && pInfo.fullText.trim()) {
                  return <pre>{pInfo.fullText}</pre>
                }

                const docUrl =
                  pInfo?.pdfUrl || URL.createObjectURL(inspectDocModal.file)

                return (
                  <div
                    style={{
                      padding: "40px 20px",

                      textAlign: "center",

                      color: "var(--muted)",

                      width: "100%",

                      display: "flex",

                      flexDirection: "column",

                      alignItems: "center",

                      justifyContent: "center",

                      gap: "14px",
                    }}
                  >
                    <FileText
                      size={54}
                      style={{ color: "var(--accent, #aa91ff)" }}
                    />
                    <div>
                      <p
                        style={{
                          fontWeight: 700,

                          fontSize: "15px",

                          color: "var(--text)",

                          marginBottom: "4px",
                        }}
                      >
                        {inspectDocModal.file.name}
                      </p>
                      <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {fmtSize(inspectDocModal.file.size)} ·{" "}
                        {pInfo?.pageCount ?? 1} page
                        {(pInfo?.pageCount ?? 1) !== 1 ? "s" : ""} · Position #
                        {inspectDocModal.index + 1}
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",

                        alignItems: "center",

                        gap: "10px",

                        flexWrap: "wrap",

                        justifyContent: "center",
                      }}
                    >
                      <button
                        type="button"
                        className="primary"
                        style={{
                          padding: "8px 16px",

                          fontSize: "12px",

                          borderRadius: "8px",

                          display: "inline-flex",

                          alignItems: "center",

                          gap: "6px",
                        }}
                        onClick={() => window.open(docUrl, "_blank")}
                      >
                        <ExternalLink size={14} /> Open in Dedicated Tab
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        style={{
                          padding: "8px 16px",

                          fontSize: "12px",

                          borderRadius: "8px",

                          display: "inline-flex",

                          alignItems: "center",

                          gap: "6px",
                        }}
                        onClick={() => {
                          const a = document.createElement("a")

                          a.href = docUrl

                          a.download = inspectDocModal.file.name

                          a.click()
                        }}
                      >
                        <Download size={14} /> Download Document
                      </button>
                    </div>
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
