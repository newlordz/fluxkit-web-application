import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Cpu,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Grid2X2,
  HelpCircle,
  Layers,
  LayoutGrid,
  List,
  Lock,
  QrCode,
  RotateCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  Workflow,
  X,
  Zap,
} from "lucide-react"
import { tools, brand, type Tool, type Category } from "./config"
import ToolBadgeIcon from "./ToolBadgeIcon"
import { isToolPro, getFormattedToolPrice } from "./adminService"
import { getActiveCurrency } from "./currencyService"

interface ActivityItem {
  name: string
  time: string
}

interface OverviewProps {
  navigate: (id: string, initialFiles?: File[]) => void
  activity: ActivityItem[]
  initialStagedFile?: File
}

type TabCategory = "All" | "PDF Essentials" | "Convert & Export" | "AI & Writing" | "QR & Sharing" | "Favorites"

export default function Overview({
  navigate,
  activity,
  initialStagedFile,
}: OverviewProps) {
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<TabCategory>("All")
  const [viewMode, setViewMode] = useState<"grid" | "compact">("grid")
  const [isDragOver, setIsDragOver] = useState(false)
  const [stagedFile, setStagedFile] = useState<File | null>(
    () => initialStagedFile || null,
  )
  const [isModalOpen, setIsModalOpen] = useState(() =>
    Boolean(initialStagedFile),
  )
  const [modalCategory, setModalCategory] =
    useState<"all" | "convert" | "optimize" | "edit" | "ai">("all")
  const [mounted, setMounted] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("fluxkit-favorites")
      if (saved) return JSON.parse(saved)
    } catch {
      // Storage unavailable in private context
    }
    return ["merge-pdf", "pdf-to-word", "compress", "qr", "audio-text"]
  })

  const searchInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeCurrency, setActiveCurrency] = useState(getActiveCurrency)

  useEffect(() => {
    const handleCurr = (e: any) => {
      if (e.detail) setActiveCurrency(e.detail)
    }
    window.addEventListener("fluxkit-currency-changed", handleCurr)
    return () => window.removeEventListener("fluxkit-currency-changed", handleCurr)
  }, [])

  // Track client mount for safe portal rendering
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (!isModalOpen || !stagedFile) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false)
      }
    }
    window.addEventListener("keydown", handleEsc)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", handleEsc)
    }
  }, [isModalOpen, stagedFile])

  // Persist favorites
  const toggleFavorite = (toolId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavorites((prev) => {
      const updated = prev.includes(toolId)
        ? prev.filter((id) => id !== toolId)
        : [...prev, toolId]
      try {
        localStorage.setItem("fluxkit-favorites", JSON.stringify(updated))
      } catch {
        /* ignore */
      }
      return updated
    })
  }

  // Keyboard shortcut ⌘K / / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (
        e.key === "/" &&
        document.activeElement !== searchInputRef.current
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // File size formatter
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // File metadata classifier
  const getFileMeta = (file: File | null) => {
    if (!file)
      return { typeName: "File", iconClass: "is-other", shortExt: "FILE" }
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    if (ext === "pdf") {
      return { typeName: "PDF Document", iconClass: "is-pdf", shortExt: "PDF" }
    }
    if (["jpg", "jpeg", "png", "webp", "bmp", "svg"].includes(ext)) {
      return {
        typeName: "Image file",
        iconClass: "is-image",
        shortExt: ext.toUpperCase(),
      }
    }
    if (["doc", "docx"].includes(ext)) {
      return {
        typeName: "Word Document",
        iconClass: "is-word",
        shortExt: "DOC",
      }
    }
    if (["xls", "xlsx", "csv"].includes(ext)) {
      return {
        typeName: "Excel Spreadsheet",
        iconClass: "is-excel",
        shortExt: "XLS",
      }
    }
    if (["ppt", "pptx"].includes(ext)) {
      return {
        typeName: "PowerPoint Presentation",
        iconClass: "is-ppt",
        shortExt: "PPT",
      }
    }
    if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)) {
      return {
        typeName: "Audio Recording",
        iconClass: "is-audio",
        shortExt: "AUD",
      }
    }
    return {
      typeName: `${ext.toUpperCase()} File`,
      iconClass: "is-other",
      shortExt: ext.slice(0, 3).toUpperCase() || "FILE",
    }
  }

  // Get suggested conversion and quick actions for this specific file type
  const getSuggestedActions = (file: File | null) => {
    if (!file) return []
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    if (ext === "pdf") {
      return [
        {
          id: "pdf-to-word",
          name: "PDF to Word",
          desc: "Convert PDF pages to fully editable Word (.docx) document",
          category: "convert" as const,
          badge: "Convert",
        },
        {
          id: "pdf-to-excel",
          name: "PDF to Excel",
          desc: "Extract tables and structured data straight to Excel (.xlsx)",
          category: "convert" as const,
          badge: "Convert",
        },
        {
          id: "pdf-to-ppt",
          name: "PDF to PowerPoint",
          desc: "Turn PDF slides into editable presentation deck (.pptx)",
          category: "convert" as const,
          badge: "Convert",
        },
        {
          id: "pdf-to-jpg",
          name: "PDF to JPG",
          desc: "Extract every PDF page as high-resolution JPG images",
          category: "convert" as const,
          badge: "Export",
        },
        {
          id: "compress",
          name: "Compress PDF",
          desc: "Reduce file size up to 85% while preserving visual quality",
          category: "optimize" as const,
          badge: "Compress",
        },
        {
          id: "merge-pdf",
          name: "Merge PDF",
          desc: "Combine this PDF with additional documents in custom order",
          category: "optimize" as const,
          badge: "Organize",
        },
        {
          id: "split-pdf",
          name: "Split PDF",
          desc: "Extract specific pages or page ranges into separate files",
          category: "optimize" as const,
          badge: "Organize",
        },
        {
          id: "rotate-pdf",
          name: "Rotate PDF",
          desc: "Permanently rotate 90°, 180°, or 270° orientation",
          category: "optimize" as const,
          badge: "Rotate",
        },
        {
          id: "edit-pdf",
          name: "Edit PDF",
          desc: "Add annotations, shapes, text highlights and callouts",
          category: "edit" as const,
          badge: "Edit",
        },
        {
          id: "sign-pdf",
          name: "Sign PDF",
          desc: "Draw digital signature or add verified timestamp",
          category: "edit" as const,
          badge: "Sign",
        },
        {
          id: "watermark",
          name: "Watermark",
          desc: "Add customized text or confidentiality watermark stamp",
          category: "edit" as const,
          badge: "Protect",
        },
        {
          id: "password",
          name: "Protect / Unlock",
          desc: "Encrypt with 128-bit AES password protection",
          category: "edit" as const,
          badge: "Security",
        },
        {
          id: "summarize",
          name: "Summarize Document",
          desc: "Extract executive summary and bullet points using AI",
          category: "ai" as const,
          badge: "AI",
        },
        {
          id: "ask",
          name: "Ask Document AI",
          desc: "Ask questions and chat with the contents of this PDF",
          category: "ai" as const,
          badge: "AI",
        },
        {
          id: "ocr",
          name: "OCR Scanner",
          desc: "Optical character recognition to extract selectable text",
          category: "ai" as const,
          badge: "OCR",
        },
      ]
    }
    if (["jpg", "jpeg", "png", "webp", "bmp"].includes(ext)) {
      return [
        {
          id: "jpg-to-pdf",
          name: "JPG to PDF",
          desc: "Convert photo or graphic into standardized PDF",
          category: "convert" as const,
          badge: "Convert",
        },
        {
          id: "ocr",
          name: "OCR Scanner",
          desc: "Extract visible text and numbers from the image",
          category: "ai" as const,
          badge: "OCR",
        },
        {
          id: "convert-compress",
          name: "Convert & Compress",
          desc: "Convert image format and reduce file footprint",
          category: "optimize" as const,
          badge: "Optimize",
        },
        {
          id: "watermark",
          name: "Watermark Image",
          desc: "Stamp image with text watermark",
          category: "edit" as const,
          badge: "Watermark",
        },
      ]
    }
    if (["doc", "docx"].includes(ext)) {
      return [
        {
          id: "word-to-pdf",
          name: "Word to PDF",
          desc: "Transform Word document into standardized PDF file",
          category: "convert" as const,
          badge: "Convert",
        },
        {
          id: "summarize",
          name: "Summarize Document",
          desc: "Extract executive summary and key points with AI",
          category: "ai" as const,
          badge: "AI",
        },
        {
          id: "ask",
          name: "Ask Document AI",
          desc: "Chat and query document contents using AI",
          category: "ai" as const,
          badge: "AI",
        },
        {
          id: "convert",
          name: "Convert Formats",
          desc: "Convert document to TXT, HTML, or Markdown",
          category: "convert" as const,
          badge: "Convert",
        },
      ]
    }
    if (["xls", "xlsx", "csv"].includes(ext)) {
      return [
        {
          id: "excel-to-pdf",
          name: "Excel to PDF",
          desc: "Convert spreadsheets to formatted PDF tables",
          category: "convert" as const,
          badge: "Convert",
        },
        {
          id: "summarize",
          name: "Summarize Sheet",
          desc: "Summarize spreadsheet data and metrics with AI",
          category: "ai" as const,
          badge: "AI",
        },
        {
          id: "convert",
          name: "Convert Formats",
          desc: "Convert spreadsheet to TSV or JSON data",
          category: "convert" as const,
          badge: "Convert",
        },
      ]
    }
    if (["ppt", "pptx"].includes(ext)) {
      return [
        {
          id: "ppt-to-pdf",
          name: "PowerPoint to PDF",
          desc: "Convert presentation slides into high-res PDF handout",
          category: "convert" as const,
          badge: "Convert",
        },
        {
          id: "summarize",
          name: "Summarize Deck",
          desc: "Extract key takeaways and slide outlines with AI",
          category: "ai" as const,
          badge: "AI",
        },
      ]
    }
    if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)) {
      return [
        {
          id: "audio-text",
          name: "Transcribe Audio",
          desc: "Generate full speech-to-text transcript with timestamps",
          category: "ai" as const,
          badge: "Speech AI",
        },
        {
          id: "summarize",
          name: "Summarize Audio",
          desc: "Summarize audio notes into key takeaways with AI",
          category: "ai" as const,
          badge: "AI",
        },
      ]
    }
    return [
      {
        id: "convert",
        name: "Convert Formats",
        desc: "Detect and convert file to compatible format",
        category: "convert" as const,
        badge: "Convert",
      },
      {
        id: "zip",
        name: "ZIP Archive",
        desc: "Package and compress file into a ZIP archive",
        category: "optimize" as const,
        badge: "Archive",
      },
    ]
  }

  // Handle incoming file from drop or file dialog
  const handleFileReceived = (files: FileList | File[]) => {
    if (!files || files.length === 0) return
    const file = files[0]
    setStagedFile(file)
    setModalCategory("all")
    setIsModalOpen(true)
  }

  // File drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFiles = e.dataTransfer.files
    if (!droppedFiles || droppedFiles.length === 0) return
    handleFileReceived(droppedFiles)
  }

  // Filter logic
  const filteredTools = tools.filter((t) => {
    // Search query matching
    const matchesQuery =
      search.trim() === "" ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.formatBadge &&
        t.formatBadge.toLowerCase().includes(search.toLowerCase()))

    if (!matchesQuery) return false

    // Tab category matching
    if (activeTab === "Favorites") return favorites.includes(t.id)
    if (activeTab === "PDF Essentials") {
      return [
        "merge-pdf",
        "split-pdf",
        "compress",
        "rotate-pdf",
        "watermark",
        "edit-pdf",
        "sign-pdf",
        "password",
      ].includes(t.id)
    }
    if (activeTab === "Convert & Export") {
      return [
        "pdf-to-word",
        "word-to-pdf",
        "pdf-to-excel",
        "excel-to-pdf",
        "pdf-to-ppt",
        "ppt-to-pdf",
        "pdf-to-jpg",
        "jpg-to-pdf",
        "convert",
        "convert-compress",
      ].includes(t.id)
    }
    if (activeTab === "AI & Writing") {
      return (
        t.category === "AI text tools" ||
        ["text-pdf", "audio-text"].includes(t.id)
      )
    }
    if (activeTab === "QR & Sharing") {
      return (
        t.category === "QR tools" ||
        ["ocr", "zip", "merge-compress", "split-compress"].includes(t.id)
      )
    }

    return true // "All" tab
  })

  // Group tab counts
  const tabCounts: Record<TabCategory, number> = {
    All: tools.length,
    "PDF Essentials": tools.filter((t) =>
      [
        "merge-pdf",
        "split-pdf",
        "compress",
        "rotate-pdf",
        "watermark",
        "edit-pdf",
        "sign-pdf",
        "password",
      ].includes(t.id),
    ).length,
    "Convert & Export": tools.filter((t) =>
      [
        "pdf-to-word",
        "word-to-pdf",
        "pdf-to-excel",
        "excel-to-pdf",
        "pdf-to-ppt",
        "ppt-to-pdf",
        "pdf-to-jpg",
        "jpg-to-pdf",
        "convert",
        "convert-compress",
      ].includes(t.id),
    ).length,
    "AI & Writing": tools.filter(
      (t) =>
        t.category === "AI text tools" ||
        ["text-pdf", "audio-text"].includes(t.id),
    ).length,
    "QR & Sharing": tools.filter(
      (t) =>
        t.category === "QR tools" ||
        ["ocr", "zip", "merge-compress", "split-compress"].includes(t.id),
    ).length,
    Favorites: tools.filter((t) => favorites.includes(t.id)).length,
  }

  // Interactive 3D Card mouse movement handler
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    card.style.setProperty("--mouse-x", `${x}px`)
    card.style.setProperty("--mouse-y", `${y}px`)

    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateX = ((y - centerY) / centerY) * -6
    const rotateY = ((x - centerX) / centerX) * 6

    card.style.setProperty("--rotate-x", `${rotateX.toFixed(2)}deg`)
    card.style.setProperty("--rotate-y", `${rotateY.toFixed(2)}deg`)
  }

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    card.style.setProperty("--rotate-x", "0deg")
    card.style.setProperty("--rotate-y", "0deg")
    card.style.setProperty("--mouse-x", "-999px")
    card.style.setProperty("--mouse-y", "-999px")
  }

  const fileMeta = getFileMeta(stagedFile)
  const allSuggestedActions = getSuggestedActions(stagedFile)
  const modalActions =
    modalCategory === "all"
      ? allSuggestedActions
      : allSuggestedActions.filter((a) => a.category === modalCategory)

  return (
    <div className="overview-page page-enter">
      {/* --- HERO SECTION --- */}
      <section className="overview-hero">
        <div className="hero-ambient-mesh" aria-hidden="true">
          <div className="mesh-orb orb-1" />
          <div className="mesh-orb orb-2" />
          <div className="mesh-orb orb-3" />
        </div>

        <div className="hero-body">
          <div className="hero-kicker-pill">
            <span className="hero-pulse-dot" />
            <span>Universal File & Document Workspace</span>
          </div>

          <h1>
            Every tool for your files.{" "}
            <span className="hero-gradient-text">Zero friction.</span>
          </h1>

          <p className="hero-subtitle">
            Merge, split, compress, convert, sign, and enhance your documents
            with uncompromising privacy. 100% processed in your browser with
            zero server uploads.
          </p>

          {/* Value Props Matrix */}
          <div className="hero-value-matrix">
            <span className="value-pill">
              <ShieldCheck size={14} /> 100% Private & Client-Side
            </span>
            <span className="value-pill">
              <Zap size={14} /> Zero Upload Delay
            </span>
            <span className="value-pill">
              <FileCheck2 size={14} /> No File Size Caps
            </span>
            <span className="value-pill">
              <Sparkles size={14} /> AI-Assisted Output
            </span>
          </div>

          {/* Interactive Hero Search */}
          <div className="hero-search-wrapper">
            <div className="hero-search-bar">
              <Search className="hero-search-icon" size={19} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tools... (e.g. 'merge pdf', 'pdf to word', 'compress', 'qr code')"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tools"
              />
              {search && (
                <button
                  className="search-clear-btn"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
              <kbd className="hero-search-kbd">⌘ K</kbd>
            </div>

            {/* Quick Search Chips */}
            <div className="search-quick-tags">
              <span className="search-quick-label">POPULAR:</span>
              {[
                { name: "Merge PDF", query: "merge" },
                { name: "Compress PDF", query: "compress" },
                { name: "PDF to Word", query: "word" },
                { name: "QR Generator", query: "qr" },
                { name: "Rotate PDF", query: "rotate" },
                { name: "Audio to Text", query: "audio" },
              ].map((item) => (
                <button
                  key={item.name}
                  className="quick-filter-chip"
                  onClick={() => setSearch(item.query)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- SMART DRAG & DROP QUICK-LAUNCH BAR --- */}
      <div
        className={`overview-dropzone-bar ${isDragOver ? "is-dragover" : ""} ${
          stagedFile ? "has-file" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!stagedFile) {
            fileInputRef.current?.click()
          }
        }}
        title="Drop any PDF, document, or audio file to launch matching tool"
        style={{ cursor: stagedFile ? "default" : "pointer" }}
      >
        {!stagedFile ? (
          <>
            <div className="dropzone-left">
              <div className="dropzone-icon-ring">
                <Upload size={20} />
              </div>
              <div className="dropzone-texts">
                <strong>
                  Drop a document, photo, or audio file here to quick-launch
                </strong>
                <p>
                  Smart auto-detection routes PDFs to Merge/Compress, images to
                  JPG to PDF, and audio to transcription.
                </p>
              </div>
            </div>
            <div className="dropzone-action-pill">
              <span>Choose or drop file</span>
              <ArrowUpRight size={13} />
            </div>
          </>
        ) : (
          <div className="dropzone-recognized-bar">
            <div className="recognized-pill">
              <div className={`recognized-file-icon ${fileMeta.iconClass}`}>
                {fileMeta.shortExt}
              </div>
              <div className="recognized-meta">
                <strong>{stagedFile.name}</strong>
                <span>
                  {formatFileSize(stagedFile.size)}
                  <span className="recognized-status-tag">
                    <Check size={11} /> Recognized as {fileMeta.typeName}
                  </span>
                </span>
              </div>
            </div>
            <div className="recognized-actions">
              <button
                type="button"
                className="choose-conversion-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsModalOpen(true)
                }}
              >
                <span>Choose conversion or action</span>
                <ArrowRight size={14} />
              </button>
              <button
                type="button"
                className="remove-file-btn"
                title="Remove file"
                aria-label="Remove file"
                onClick={(e) => {
                  e.stopPropagation()
                  setStagedFile(null)
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Upload document to launch tool"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileReceived(e.target.files)
            }
          }}
        />
      </div>

      {/* --- QUICK ACTION & CONVERSION HUB MODAL --- */}
      {(() => {
        if (!isModalOpen || !stagedFile) return null
        const modalElement = (
          <div
            className="quick-action-modal-backdrop"
            onClick={() => setIsModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-action-title"
          >
            <div
              className="quick-action-modal"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="quick-action-modal-header">
                <div className="modal-header-top">
                  <span className="modal-badge">
                    <Sparkles size={12} />
                    <span>FluxKit Smart Hub</span>
                  </span>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setIsModalOpen(false)}
                    aria-label="Close dialog"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Recognized File Banner */}
                <div className="quick-action-file-badge">
                  <div className={`recognized-file-icon ${fileMeta.iconClass}`}>
                    {fileMeta.shortExt}
                  </div>
                  <div className="file-badge-texts">
                    <h4>{stagedFile.name}</h4>
                    <p>
                      <span>{formatFileSize(stagedFile.size)}</span>
                      <span>•</span>
                      <span className="recognized-status-tag">
                        <Check size={11} /> {fileMeta.typeName}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="file-badge-change-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change file
                  </button>
                </div>

                <div className="modal-title-area">
                  <h2 id="modal-action-title">
                    What would you like to do with this {fileMeta.typeName}?
                  </h2>
                  <p>
                    Choose a conversion, optimization, or AI action below. Your
                    file will open directly in the tool.
                  </p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="quick-action-tabs">
                {([
                  { id: "all", label: "All Actions" },
                  { id: "convert", label: "Convert to Format" },
                  { id: "optimize", label: "Optimize & Organize" },
                  { id: "edit", label: "Edit & Protect" },
                  { id: "ai", label: "AI & Intelligence" },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`qa-tab-btn ${
                      modalCategory === tab.id ? "is-active" : ""
                    }`}
                    onClick={() => setModalCategory(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Action Cards Grid */}
              <div className="quick-action-body">
                <div className="quick-action-grid">
                  {modalActions.map((action) => {
                    const toolItem = tools.find((t) => t.id === action.id)
                    return (
                      <div
                        key={action.id}
                        className="quick-action-card"
                        onClick={() => {
                          setIsModalOpen(false)
                          navigate(action.id, [stagedFile])
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setIsModalOpen(false)
                            navigate(action.id, [stagedFile])
                          }
                        }}
                      >
                        <div>
                          <div className="qa-card-top">
                            <div className="qa-card-icon-box">
                              <ToolBadgeIcon
                                type={toolItem?.badgeIconType}
                                fallbackIcon={toolItem?.icon}
                                color={toolItem?.badgeColor || "blue"}
                                size={28}
                              />
                            </div>
                            <span className="qa-card-badge">
                              {action.badge}
                            </span>
                          </div>
                          <div className="qa-card-title">{action.name}</div>
                          <div className="qa-card-desc">{action.desc}</div>
                        </div>
                        <div className="qa-card-footer">
                          <span>Launch with {fileMeta.shortExt}</span>
                          <ArrowRight size={13} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Modal Bottom Toolbar */}
              <div className="quick-action-modal-footer">
                <span>
                  🔒 100% Client-Side Privacy — files never leave your browser
                </span>
                <span>{modalActions.length} actions available</span>
              </div>
            </div>
          </div>
        )

        return mounted && typeof document !== "undefined" && document.body
          ? createPortal(modalElement, document.body)
          : modalElement
      })()}

      {/* --- FILTER & CATEGORY TOOLBAR --- */}
      <div className="overview-toolbar">
        <div className="overview-category-tabs" role="tablist">
          {([
            "All",
            "PDF Essentials",
            "Convert & Export",
            "AI & Writing",
            "QR & Sharing",
            "Favorites",
          ] as TabCategory[]).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={isActive}
                className={`category-tab-btn ${isActive ? "is-active" : ""}`}
                onClick={() => {
                  setActiveTab(tab)
                  setSearch("")
                }}
              >
                {tab === "Favorites" && (
                  <Star size={13} className={isActive ? "fill-current" : ""} />
                )}
                {tab === "All" && <Sparkles size={13} />}
                <span>{tab}</span>
                <span className="tab-count-badge">{tabCounts[tab]}</span>
              </button>
            )
          })}
        </div>

        <div className="toolbar-right-meta">
          <span>
            Showing <strong>{filteredTools.length}</strong>{" "}
            {filteredTools.length === 1 ? "tool" : "tools"}
          </span>
          <div
            style={{
              display: "flex",
              gap: "4px",
              background: "var(--surface)",
              padding: "3px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => setViewMode("grid")}
              className="icon-button"
              style={{
                color: viewMode === "grid" ? "var(--accent)" : "var(--muted)",
                padding: "4px",
              }}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("compact")}
              className="icon-button"
              style={{
                color:
                  viewMode === "compact" ? "var(--accent)" : "var(--muted)",
                padding: "4px",
              }}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* --- THE 5-COLUMN TOOL CARDS GRID --- */}
      {filteredTools.length > 0 ? (
        <div
          className={`overview-grid ${
            viewMode === "compact" ? "is-compact" : ""
          }`}
        >
          {filteredTools.map((t) => {
            const isFav = favorites.includes(t.id)
            const colorClass = t.badgeColor
              ? `theme-${t.badgeColor}`
              : "theme-blue"

            return (
              <div key={t.id} className="overview-card-wrapper">
                <div
                  className={`overview-card ${colorClass}`}
                  onClick={() => navigate(t.id)}
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      navigate(t.id)
                    }
                  }}
                  aria-label={`Open ${t.name}`}
                >
                  {/* Cursor-following spotlight glow */}
                  <div className="card-spotlight-layer" />

                  {/* Card Header */}
                  <div className="card-top-row">
                    <ToolBadgeIcon
                      type={t.badgeIconType}
                      fallbackIcon={t.icon}
                      color={t.badgeColor || "blue"}
                      size={44}
                    />

                    <div className="card-header-actions">
                      <span
                        className="card-format-tag"
                        style={
                          isToolPro(t.id)
                            ? {
                                background: "rgba(168,85,247,0.15)",
                                color: "#a855f7",
                                fontWeight: 700,
                              }
                            : {
                                background: "rgba(16,185,129,0.15)",
                                color: "#10b981",
                                fontWeight: 700,
                              }
                        }
                      >
                        {isToolPro(t.id)
                          ? `PRO · ${getFormattedToolPrice(t.id)}`
                          : "FREE"}
                      </span>
                      {t.formatBadge && (
                        <span className="card-format-tag">{t.formatBadge}</span>
                      )}
                      <button
                        className={`card-fav-btn ${isFav ? "is-fav" : ""}`}
                        onClick={(e) => toggleFavorite(t.id, e)}
                        aria-label={
                          isFav ? "Remove from favorites" : "Add to favorites"
                        }
                        title={isFav ? "Favorited" : "Favorite"}
                      >
                        <Star
                          size={15}
                          fill={isFav ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="overview-card-content">
                    <h3>{t.name}</h3>
                    <p>{t.description}</p>
                  </div>

                  {/* Card Footer */}
                  <div className="overview-card-bottom">
                    <span className="card-bottom-category">{t.category}</span>
                    <span className="card-bottom-action">
                      <span>{t.available ? "Launch" : "Open"}</span>
                      <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Empty Search or Favorites State */
        <div className="overview-empty-search">
          <div className="empty-search-icon">
            <Search size={26} />
          </div>
          <h3>No matching tools found</h3>
          <p>
            {activeTab === "Favorites"
              ? "You haven't starred any tools yet. Click the star icon on any tool card to pin it here!"
              : `We couldn't find any tool matching "${search}". Try searching for PDF, Word, Compress, or QR.`}
          </p>
          <button
            className="empty-reset-btn"
            onClick={() => {
              setSearch("")
              setActiveTab("All")
            }}
          >
            Clear filters and show all tools
          </button>
        </div>
      )}

      {/* --- CUSTOMER TRUST & PRIVACY CAPABILITY STRIP --- */}
      <section className="overview-trust-strip">
        <div className="trust-card">
          <div className="trust-card-icon">
            <Lock size={19} />
          </div>
          <div>
            <strong>100% Client-Side Architecture</strong>
            <p>
              Your sensitive documents never leave your browser memory. All
              processing runs through local WebAssembly and vector engines.
            </p>
          </div>
        </div>

        <div className="trust-card">
          <div className="trust-card-icon">
            <Cpu size={19} />
          </div>
          <div>
            <strong>Zero Queue Latency</strong>
            <p>
              No upload waits, server timeouts, or subscription speed gates.
              Your files process at native hardware speeds.
            </p>
          </div>
        </div>

        <div className="trust-card">
          <div className="trust-card-icon">
            <Sparkles size={19} />
          </div>
          <div>
            <strong>Integrated AI Workflows</strong>
            <p>
              Transcribe audio, summarize lengthy agreements, and generate
              formatted PDFs without juggling disparate software.
            </p>
          </div>
        </div>
      </section>

      {/* --- RECENT ACTIVITY SECTION --- */}
      <section className="panel activity-panel">
        <div className="section-heading">
          <div>
            <h2>Recent workspace activity</h2>
            <p>Completed jobs and generated files from your active session.</p>
          </div>
          <button className="text-button" onClick={() => navigate("activity")}>
            Full history <ArrowRight size={14} />
          </button>
        </div>

        {activity && activity.length > 0 ? (
          <div className="activity-list">
            {activity.slice(0, 4).map((item, i) => (
              <div key={i}>
                <span className="small-icon">
                  <FileText size={18} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>Processed locally · {item.time}</small>
                </span>
                <span className="live-badge">
                  <Check size={11} /> Completed
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="activity-empty">
            <div className="empty-icon">
              <Activity size={22} />
            </div>
            <div>
              <strong>No files processed in this session yet.</strong>
              <p>Pick any tool above or drag a file to get started.</p>
            </div>
            <button onClick={() => navigate("merge-pdf")}>
              Try Merge PDF <ArrowUpRight size={14} />
            </button>
          </div>
        )}
      </section>

      {/* --- FOOTER --- */}
      <footer>
        <span>
          <ShieldCheck size={14} /> Local-first productivity. Built for seamless
          workflow.
        </span>
        <span>
          {brand.tagline} <span className="footer-brand">{brand.name}.</span>
        </span>
      </footer>
    </div>
  )
}
