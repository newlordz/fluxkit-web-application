import { useState, useRef, useEffect, type FormEvent } from "react"
import DocumentPreviewModal from "./DocumentPreviewModal"
import QRCodeStudioModal from "./QRCodeStudioModal"
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Camera,
  CameraOff,
  Check,
  Circle,
  Copy,
  Database,
  Download,
  Eye,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Image,
  Languages,
  Layers,
  LayoutGrid,
  List,
  LoaderCircle,
  Mail,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  Monitor,
  PenLine,
  PenTool,
  Presentation,
  QrCode,
  Redo2,
  RefreshCw,
  RotateCw,
  Scissors,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Square,
  Stamp,
  Tags,
  Trash2,
  Type,
  Undo2,
  Upload,
  Users,
  Video,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react"
import type { Tool } from "./config"
import { useNotify } from "./Notifications"
import {
  download,
  generateQR,
  mergePDFs,
  rotatePDF,
  textToPDF,
  splitPDF,
  compressPDF,
  editPDF,
  watermarkPDF,
  signPDF,
  securePDF,
  pdfToWord,
  pdfToPPT,
  pdfToExcel,
  wordToPDF,
  pptToPDF,
  excelToPDF,
  pdfToJPG,
  jpgToPDF,
  zipFiles,
  extractZipArchive,
  scanOCR,
  universalConvert,
  convertAndCompress,
  mergeAndCompress,
  splitAndCompress,
  detectFileType,
  extractPDFPages,
  reorderPDFPages,
  summarizeDocument,
  rewriteContent,
  translateText,
  detectLanguage,
  askDocumentAI,
  extractKeywords,
  analyzeSentiment,
  compareTexts,
  generateEmail,
  type SummarizeResult,
  type RewriteResult,
  type TranslationResult,
  type AskDocumentResult,
  type KeywordResult,
  type SentimentResult,
  type CompareResult,
  type EmailResult,
  type SupportedLanguage,
  type RewriteTone,
  type EmailPurpose,
  type EmailTone,
  type JobStatus,
  type OutputResult,
  type ExtractedZipFile,
  type OCRResult,
  type PipelineMetricsResult,
  saveSessionDocument,
  getSessionDocuments,
  deleteSessionDocument,
  clearSessionDocuments,
  filterDocuments,
  getSampleDocuments,
  reloadSampleDocuments,
  isDatabaseSupported,
  isDatabaseInitialized,
  markDatabaseInitialized,
  dbSaveDocument,
  dbGetAllDocuments,
  dbGetDocument,
  dbDeleteDocument,
  dbClearAllDocuments,
  dbGetStorageStats,
  formatByteSize,
  type DatabaseStats,
  createMeetingState,
  sendChatMessage,
  createWhiteboardHistory,
  type SessionDocument,
  type MeetingState,
} from "./services"

const STOPWORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "me",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "with",
  "would",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
])

const POSITIVE_WORDS = new Set([
  "great",
  "good",
  "excellent",
  "positive",
  "best",
  "love",
  "amazing",
  "wonderful",
  "fantastic",
  "superb",
  "happy",
  "fast",
  "easy",
  "clean",
  "reliable",
  "efficient",
  "helpful",
  "delightful",
  "perfect",
  "innovative",
  "clear",
  "smooth",
  "strong",
  "benefit",
  "success",
  "achieve",
  "impressive",
  "outstanding",
  "valuable",
  "brilliant",
  "favorite",
  "secure",
  "intuitive",
])

const NEGATIVE_WORDS = new Set([
  "bad",
  "poor",
  "terrible",
  "awful",
  "negative",
  "worst",
  "hate",
  "slow",
  "hard",
  "difficult",
  "ugly",
  "buggy",
  "broken",
  "error",
  "fault",
  "problem",
  "fail",
  "failure",
  "issue",
  "risk",
  "danger",
  "warning",
  "trouble",
  "flaw",
  "defect",
  "annoying",
  "sad",
  "weak",
  "complicated",
  "confusing",
  "useless",
])

const TRANSLATION_MAPS: Record<string, Record<string, string>> = {
  Spanish: {
    hello: "hola",
    welcome: "bienvenido",
    document: "documento",
    file: "archivo",
    project: "proyecto",
    summary: "resumen",
    email: "correo electrónico",
    team: "equipo",
    work: "trabajo",
    meeting: "reunión",
    report: "informe",
    notes: "notas",
    results: "resultados",
    important: "importante",
    success: "éxito",
    future: "futuro",
    solution: "solución",
    today: "hoy",
    thank: "gracias",
    please: "por favor",
  },
  French: {
    hello: "bonjour",
    welcome: "bienvenue",
    document: "document",
    file: "fichier",
    project: "projet",
    summary: "résumé",
    email: "courriel",
    team: "équipe",
    work: "travail",
    meeting: "réunion",
    report: "rapport",
    notes: "notes",
    results: "résultats",
    important: "important",
    success: "succès",
    future: "avenir",
    solution: "solution",
    today: "aujourd'hui",
    thank: "merci",
    please: "s'il vous plaît",
  },
  German: {
    hello: "hallo",
    welcome: "willkommen",
    document: "Dokument",
    file: "Datei",
    project: "Projekt",
    summary: "Zusammenfassung",
    email: "E-Mail",
    team: "Team",
    work: "Arbeit",
    meeting: "Meeting",
    report: "Bericht",
    notes: "Notizen",
    results: "Ergebnisse",
    important: "wichtig",
    success: "Erfolg",
    future: "Zukunft",
    solution: "Lösung",
    today: "heute",
    thank: "danke",
    please: "bitte",
  },
  Japanese: {
    hello: "こんにちは",
    welcome: "ようこそ",
    document: "ドキュメント",
    file: "ファイル",
    project: "プロジェクト",
    summary: "要約",
    email: "メール",
    team: "チーム",
    work: "作業",
    meeting: "ミーティング",
    report: "レポート",
    notes: "メモ",
    results: "結果",
    important: "重要",
    success: "成功",
    future: "未来",
    solution: "解決策",
    today: "今日",
    thank: "ありがとう",
    please: "お願いします",
  },
}

function formatDisplayTimer(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const m = Math.floor(safeSeconds / 60)
  const s = Math.floor(safeSeconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function safeFormatByteSize(bytes: number): string {
  if (typeof formatByteSize === "function") {
    try {
      return formatByteSize(bytes)
    } catch {}
  }
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ToolPage({
  tool,
  onComplete,
  initialFiles,
  navigate,
}: {
  tool: Tool
  onComplete: (name: string) => void
  initialFiles?: File[]
  navigate?: (id: string) => void
}) {
  const notify = useNotify()

  // State
  const [files, setFiles] = useState<File[]>(() => initialFiles || [])
  const [error, setError] = useState("")
  const [status, setStatus] = useState<JobStatus>("idle")
  const [result, setResultState] = useState<OutputResult>()
  const [qr, setQr] = useState("")
  const [showQRStudio, setShowQRStudio] = useState(false)
  const [rawQrPayload, setRawQrPayload] = useState("")
  const [kind, setKind] = useState("URL")
  const [value, setValue] = useState("")
  const [extra, setExtra] = useState("")
  const [title, setTitle] = useState("")
  const [textOutput, setTextOutput] = useState("")
  const [optionA, setOptionA] = useState("")
  const [optionB, setOptionB] = useState("")

  // Document Preview Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const fileDragIndexRef = useRef<number | null>(null)
  const previewModalMode = ((): "merge" | "split" | "rotate" | "arrange" => {
    if (tool.id === "split-pdf" || tool.id === "split-compress") return "split"
    if (tool.id === "rotate-pdf") return "rotate"
    return "merge"
  })()

  // Milestone 4 State
  const [zipMode, setZipMode] = useState<"create" | "extract">("create")
  const [extractedFiles, setExtractedFiles] = useState<ExtractedZipFile[]>([])
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [pipelineStep, setPipelineStep] = useState<{
    current: number
    total: number
    label: string
  } | null>(null)
  const [pipelineMetrics, setPipelineMetrics] =
    useState<PipelineMetricsResult | null>(null)
  const [ocrContrast, setOcrContrast] = useState(true)
  const [ocrInvert, setOcrInvert] = useState(false)
  const [ocrClean, setOcrClean] = useState(true)
  const [stripMeta, setStripMeta] = useState(true)
  const [copiedText, setCopiedText] = useState(false)

  // Milestone 5 AI Text Suite State
  const [summaryMode, setSummaryMode] = useState<"sentences" | "percentage">(
    "sentences",
  )
  const [summaryLength, setSummaryLength] = useState(3)
  const [summaryFormat, setSummaryFormat] =
    useState<"bullet" | "narrative" | "executive">("bullet")
  const [rewriteTone, setRewriteTone] = useState<RewriteTone>("Professional")
  const [transSourceLang, setTransSourceLang] =
    useState<SupportedLanguage | "auto">("auto")
  const [transTargetLang, setTransTargetLang] =
    useState<SupportedLanguage>("Spanish")
  const [askQuestion, setAskQuestion] = useState("")
  const [keywordMax, setKeywordMax] = useState(10)
  const [keywordNgrams, setKeywordNgrams] = useState(true)
  const [sentimentDetailed, setSentimentDetailed] = useState(false)
  const [compareGranularity, setCompareGranularity] =
    useState<"lines" | "words" | "characters">("lines")
  const [compareIgnoreWhitespace, setCompareIgnoreWhitespace] = useState(false)
  const [emailPurpose, setEmailPurpose] = useState<EmailPurpose>("follow-up")
  const [emailTone, setEmailTone] = useState<EmailTone>("professional")
  const [emailRecipient, setEmailRecipient] = useState("")
  const [emailSubject, setEmailSubject] = useState("")
  const [emailCTA, setEmailCTA] = useState("")
  const [loadedDocName, setLoadedDocName] = useState("")
  const [extractingPdf, setExtractingPdf] = useState(false)

  // Rich AI text results state
  const [aiSummarizeResult, setAiSummarizeResult] =
    useState<SummarizeResult | null>(null)
  const [aiRewriteResult, setAiRewriteResult] = useState<RewriteResult | null>(
    null,
  )
  const [aiTranslationResult, setAiTranslationResult] =
    useState<TranslationResult | null>(null)
  const [aiAskResult, setAiAskResult] = useState<AskDocumentResult | null>(null)
  const [aiKeywordResult, setAiKeywordResult] = useState<KeywordResult | null>(
    null,
  )
  const [aiSentimentResult, setAiSentimentResult] =
    useState<SentimentResult | null>(null)
  const [aiCompareResult, setAiCompareResult] = useState<CompareResult | null>(
    null,
  )
  const [aiEmailResult, setAiEmailResult] = useState<EmailResult | null>(null)

  // Interactive Whiteboard state
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const [brushColor, setBrushColor] = useState("#0f172a")
  const [brushSize, setBrushSize] = useState(5)
  const [activeShapeTool, setActiveShapeTool] =
    useState<"pen" | "eraser" | "line" | "rect" | "circle" | "text">("pen")
  const whiteboardHistoryRef = useRef<any>(
    typeof createWhiteboardHistory === "function"
      ? createWhiteboardHistory(30)
      : {
          push: () => {},
          undo: () => null,
          redo: () => null,
          canUndo: () => false,
          canRedo: () => false,
          clear: () => {},
          getDepth: () => 0,
        },
  )
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const snapshotRef = useRef<ImageData | null>(null)
  interface WhiteboardPoint {
    x: number
    y: number
  }
  const startPosRef = useRef<WhiteboardPoint | null>(null)
  const whiteboardRenderSeqRef = useRef<number>(0)

  // Interactive Signature Pad state for sign-pdf
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isSigDrawingRef = useRef(false)
  const [sigHasDrawn, setSigHasDrawn] = useState(false)
  const [sigInkColor, setSigInkColor] = useState("#0f172a")

  // Interactive Meetings state
  const [inMeeting, setInMeeting] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [meetingTimer, setMeetingTimer] = useState(0)
  const [meetingRoomKey, setMeetingRoomKey] = useState("fluxkit-room-844")
  const [sidebarTab, setSidebarTab] = useState<"chat" | "participants">("chat")
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string
    sender: string
    text: string
    time: string
  }>>(() => {
    if (typeof createMeetingState === "function") {
      try {
        return createMeetingState().chatMessages
      } catch {}
    }
    return [
      {
        id: "msg-1",
        sender: "System",
        text: "Room connected with peer-to-peer browser encryption.",
        time: "10:30 AM",
      },
      {
        id: "msg-2",
        sender: "Sarah Chen",
        text: "Hey team! Ready to review the document conversions and whiteboard.",
        time: "10:31 AM",
      },
      {
        id: "msg-3",
        sender: "Marcus Vance",
        text: "Audio transcription engine is running smoothly. Sharing notes shortly.",
        time: "10:32 AM",
      },
    ]
  })
  const [chatInput, setChatInput] = useState("")

  // Stored session documents for `documents`
  const [sessionDocs, setSessionDocs] = useState<SessionDocument[]>(() => {
    if (typeof getSessionDocuments === "function") {
      try {
        return getSessionDocuments()
      } catch {}
    }
    return [
      {
        id: "sample-doc-1",
        name: "FluxKit_Quickstart_Guide.pdf",
        size: "245.8 KB",
        rawSize: 251658,
        time: "10:00 AM",
        category: "pdf",
        toolSource: "Workspace Guide",
        contentSnippet:
          "Welcome to FluxKit Workspace. All 37 creative and conversion tools run completely client-side in your browser.",
      },
      {
        id: "sample-doc-2",
        name: "Quarterly_Financial_Summary.xlsx",
        size: "84.2 KB",
        rawSize: 86220,
        time: "10:15 AM",
        category: "sheets",
        toolSource: "Excel to PDF",
        contentSnippet:
          "Q4 Financial Overview: Revenue grew 28% QoQ with operational margin expansion across all digital product lines.",
      },
      {
        id: "sample-doc-3",
        name: "Architecture_Design_Notes.docx",
        size: "112.5 KB",
        rawSize: 115200,
        time: "10:30 AM",
        category: "docs",
        toolSource: "PDF to Word",
        contentSnippet:
          "System Architecture & Security: Zero external API requirements, instant in-browser WebAssembly and Web Worker pipelines.",
      },
      {
        id: "sample-doc-4",
        name: "System_Architecture_Diagram.png",
        size: "320.0 KB",
        rawSize: 327680,
        time: "10:45 AM",
        category: "images",
        toolSource: "Whiteboards",
        contentSnippet:
          "PNG graphic export of collaboration whiteboard architecture diagram with multi-tiered client-side data flows.",
      },
    ]
  })
  const [docSearch, setDocSearch] = useState("")
  const [docCategory, setDocCategory] = useState("all")
  const [docViewMode, setDocViewMode] = useState<"table" | "grid">("table")
  const [previewDoc, setPreviewDoc] = useState<SessionDocument | null>(null)
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null)
  const [deleteConfirmDoc, setDeleteConfirmDoc] =
    useState<SessionDocument | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Hydrate documents and storage stats from persistent IndexedDB database on mount
  useEffect(() => {
    if (
      tool.id === "documents" &&
      typeof window !== "undefined" &&
      typeof isDatabaseSupported === "function" &&
      isDatabaseSupported() &&
      typeof dbGetAllDocuments === "function"
    ) {
      dbGetAllDocuments()
        .then((docs) => {
          if (Array.isArray(docs)) {
            if (docs.length > 0) {
              setSessionDocs(docs)
            } else if (typeof isDatabaseInitialized === "function") {
              isDatabaseInitialized().then((init) => {
                if (init) {
                  setSessionDocs([])
                }
              })
            }
          }
        })
        .catch(() => {})

      if (typeof dbGetStorageStats === "function") {
        dbGetStorageStats()
          .then((stats) => {
            setDbStats(stats)
          })
          .catch(() => {})
      }
    }
  }, [tool.id])

  // Pre-load staged files from quick-launch or routing
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      const isFileTool = [
        "merge-pdf",
        "split-pdf",
        "compress",
        "rotate-pdf",
        "watermark",
        "password",
        "sign-pdf",
        "edit-pdf",
        "pdf-to-word",
        "pdf-to-ppt",
        "pdf-to-excel",
        "word-to-pdf",
        "ppt-to-pdf",
        "excel-to-pdf",
        "pdf-to-jpg",
        "jpg-to-pdf",
        "zip",
        "ocr",
        "convert",
        "convert-compress",
        "merge-compress",
        "split-compress",
        "documents",
      ].includes(tool.id)

      if (isFileTool) {
        setFiles(initialFiles)
      } else if (tool.category === "AI text tools") {
        const file = initialFiles[0]
        if (file) {
          setLoadedDocName(file.name)
          if (file.name.toLowerCase().endsWith(".pdf")) {
            setExtractingPdf(true)
            file
              .arrayBuffer()
              .then((buf) => extractPDFPages(buf))
              .then((pages) => {
                const fullText = pages
                  .map((p) => p.fullText)
                  .filter(Boolean)
                  .join("\n\n")
                if (fullText.trim()) setValue(fullText)
              })
              .catch(console.error)
              .finally(() => setExtractingPdf(false))
          } else if (
            file.type.startsWith("text/") ||
            file.name.endsWith(".txt") ||
            file.name.endsWith(".md")
          ) {
            file
              .text()
              .then((text) => setValue(text))
              .catch(console.error)
          }
        }
      }
    }
  }, [initialFiles, tool.id])

  // Timer for active meeting
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (inMeeting) {
      interval = setInterval(() => setMeetingTimer((t) => t + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [inMeeting])

  // Whiteboard canvas setup
  useEffect(() => {
    if (tool.id !== "whiteboards") return
    const canvas = canvasRef.current
    if (!canvas || typeof canvas.getContext !== "function") return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    if (whiteboardHistoryRef.current.getDepth() === 0) {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      try {
        whiteboardHistoryRef.current.push(canvas.toDataURL("image/png"))
      } catch {}
    }
  }, [tool.id])

  // Whiteboard keyboard shortcuts (Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    if (tool.id !== "whiteboards") return
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault()
        if (e.shiftKey) {
          handleWhiteboardRedo()
        } else {
          handleWhiteboardUndo()
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault()
        handleWhiteboardRedo()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [tool.id])

  function handleWhiteboardUndo() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const prev = whiteboardHistoryRef.current.undo()
    if (prev && typeof window !== "undefined" && window.Image) {
      const renderSeq = ++whiteboardRenderSeqRef.current
      const img = new window.Image()
      img.onload = () => {
        if (renderSeq !== whiteboardRenderSeqRef.current) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
      }
      img.src = prev
    }
    setCanUndo(whiteboardHistoryRef.current.canUndo())
    setCanRedo(whiteboardHistoryRef.current.canRedo())
  }

  function handleWhiteboardRedo() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const next = whiteboardHistoryRef.current.redo()
    if (next && typeof window !== "undefined" && window.Image) {
      const renderSeq = ++whiteboardRenderSeqRef.current
      const img = new window.Image()
      img.onload = () => {
        if (renderSeq !== whiteboardRenderSeqRef.current) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
      }
      img.src = next
    }
    setCanUndo(whiteboardHistoryRef.current.canUndo())
    setCanRedo(whiteboardHistoryRef.current.canRedo())
  }

  function handleSendMeetingChat(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      if (typeof sendChatMessage === "function") {
        const currentState: MeetingState = {
          roomKey: meetingRoomKey,
          inMeeting,
          micMuted,
          cameraOff,
          isScreenSharing,
          activeSidebarTab: sidebarTab,
          chatMessages,
          participants: [],
        }
        const updated = sendChatMessage(currentState, "You", trimmed)
        setChatMessages(updated.chatMessages)
        setChatInput("")

        setTimeout(() => {
          setChatMessages((prev) => {
            const replyState: MeetingState = {
              ...currentState,
              chatMessages: prev,
            }
            return sendChatMessage(
              replyState,
              "Sarah Chen",
              "Received! Looking over the document conversions right now.",
            ).chatMessages
          })
        }, 1000)
      } else {
        const userMsg = {
          id: `msg-${Date.now()}`,
          sender: "You",
          text: trimmed,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        }
        setChatMessages((prev) => [...prev, userMsg])
        setChatInput("")
        setTimeout(() => {
          const replyMsg = {
            id: `msg-${Date.now() + 1}`,
            sender: "Sarah Chen",
            text: "Received! Looking over the document conversions right now.",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          }
          setChatMessages((prev) => [...prev, replyMsg])
        }, 1000)
      }
    } catch {}
  }

  // Signature canvas setup
  useEffect(() => {
    if (tool.id !== "sign-pdf") return
    const canvas = sigCanvasRef.current
    if (!canvas || typeof canvas.getContext !== "function") return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }, [tool.id])

  function getAcceptedFileTypes(): string {
    const id = tool.id
    if (
      id === "pdf-to-word" ||
      id === "pdf-to-ppt" ||
      id === "pdf-to-excel" ||
      id === "pdf-to-jpg"
    ) {
      return ".pdf,application/pdf"
    }
    if (id === "word-to-pdf") {
      return ".docx,.doc,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
    }
    if (id === "ppt-to-pdf") {
      return ".pptx,.ppt,.txt,text/plain,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
    }
    if (id === "excel-to-pdf") {
      return ".xlsx,.xls,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
    }
    if (id === "jpg-to-pdf") {
      return ".jpg,.jpeg,.png,.webp,image/*"
    }
    if (id.includes("jpg") || id.includes("image")) {
      return ".jpg,.jpeg,.png,.webp,image/*,.pdf,application/pdf"
    }
    if (id.includes("word") || id.includes("doc")) {
      return ".docx,.doc,.pdf,application/*"
    }
    if (id.includes("ppt")) {
      return ".pptx,.ppt,.pdf,application/*"
    }
    if (id.includes("excel")) {
      return ".xlsx,.xls,.csv,.pdf,application/*"
    }
    if (id === "zip") {
      return zipMode === "extract"
        ? ".zip,application/zip,application/x-zip-compressed"
        : "*/*"
    }
    if (id === "ocr") {
      return ".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
    }
    if (id === "convert" || id === "convert-compress") {
      return ".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,image/*,application/*,text/*"
    }
    if (id === "merge-compress" || id === "split-compress") {
      return ".pdf,application/pdf"
    }
    if (id === "documents") {
      return "*/*"
    }
    return ".pdf,application/pdf"
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const accepted: File[] = []
    const errors: string[] = []
    const isStrictPdf = [
      "merge-pdf",
      "split-pdf",
      "rotate-pdf",
      "watermark",
      "password",
      "sign-pdf",
      "compress",
      "pdf-to-word",
      "pdf-to-ppt",
      "pdf-to-excel",
      "pdf-to-jpg",
      "merge-compress",
      "split-compress",
    ].includes(tool.id)

    for (const file of Array.from(incoming)) {
      if (
        isStrictPdf &&
        (!file.name.toLowerCase().endsWith(".pdf") ||
          (file.type && file.type !== "application/pdf"))
      ) {
        errors.push(`${file.name}: only PDF files are supported.`)
      } else if (file.size > 25 * 1024 * 1024) {
        errors.push(`${file.name}: maximum size is 25 MB.`)
      } else {
        accepted.push(file)
      }
    }

    if (tool.id === "zip" && accepted.length > 0) {
      const hasZip = accepted.some((f) => f.name.toLowerCase().endsWith(".zip"))
      if (hasZip && accepted.length === 1) {
        setZipMode("extract")
      }
    }

    setFiles((current) => [...current, ...accepted])
    setError(errors.join(" "))
    setResultState(undefined)
    setTextOutput("")
    setStatus("idle")
  }

  // --- Client-Side AI & NLP Engine ---
  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setExtractingPdf(true)
      setLoadedDocName(file.name)
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const pages = await extractPDFPages(await file.arrayBuffer())
        const fullText = pages
          .map((p) => p.fullText)
          .filter(Boolean)
          .join("\n\n")
        if (!fullText.trim()) {
          notify(
            "No embedded text found in PDF. Scanned PDFs require OCR Scanner (#ocr).",
            "warning",
          )
        } else {
          setValue(fullText)
          notify.success(
            `Extracted text from ${file.name} (${pages.length} pages).`,
          )
        }
      } else {
        const text = await file.text()
        setValue(text)
        notify.success(`Loaded text from ${file.name}.`)
      }
    } catch (err: any) {
      notify(err?.message || "Failed to extract document text.", "error")
    } finally {
      setExtractingPdf(false)
    }
  }

  function executeAIProcessing(text: string): string {
    const t = text.trim()
    if (!t) return ""

    if (tool.id === "summarize") {
      const res = summarizeDocument(t, {
        mode: summaryMode,
        targetLength: summaryLength,
        format: summaryFormat,
      })
      setAiSummarizeResult(res)
      return res.formattedReport
    }

    if (tool.id === "rewrite") {
      const toneToUse = optionA as RewriteTone || rewriteTone || "Professional"
      const res = rewriteContent(t, {
        tone: toneToUse,
      })
      setAiRewriteResult(res)
      return res.formattedReport
    }

    if (tool.id === "translate") {
      const targetLang =
        optionA as SupportedLanguage || transTargetLang || "Spanish"
      const res = translateText(t, {
        targetLanguage: targetLang,
        sourceLanguage: transSourceLang,
      })
      setAiTranslationResult(res)
      return res.formattedReport
    }

    if (tool.id === "ask") {
      const q = askQuestion.trim() || extra.trim()
      if (!q) throw new Error("Please enter a question to ask the document.")
      const res = askDocumentAI(t, { question: q })
      setAiAskResult(res)
      return res.formattedReport
    }

    if (tool.id === "keywords") {
      const res = extractKeywords(t, {
        maxKeywords: keywordMax,
        includeNgrams: keywordNgrams,
      })
      setAiKeywordResult(res)
      return res.formattedReport
    }

    if (tool.id === "sentiment") {
      const res = analyzeSentiment(t, {
        detailed: sentimentDetailed,
      })
      setAiSentimentResult(res)
      return res.formattedReport
    }

    if (tool.id === "compare") {
      const compText = extra !== undefined ? extra : ""
      const res = compareTexts(t, compText, {
        granularity: compareGranularity,
        ignoreWhitespace: compareIgnoreWhitespace,
      })
      setAiCompareResult(res)
      return res.formattedReport
    }

    if (tool.id === "email") {
      const res = generateEmail(t, {
        purpose: emailPurpose,
        tone: emailTone,
        recipient: emailRecipient || optionA || "Team",
        subjectTopic: emailSubject || extra,
        callToAction: emailCTA,
      })
      setAiEmailResult(res)
      return res.formattedReport
    }

    return t
  }

  // --- Interactive Form Submit ---
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setResultState(undefined)
    setTextOutput("")
    setQr("")
    setStatus("processing")

    let out: any = undefined
    const setResult = (res: OutputResult | undefined) => {
      out = res
      setResultState(res)
    }

    try {
      // 1. QR Code Studio
      if (tool.id === "qr") {
        let content = value.trim()
        if (!content) throw new Error("Enter content for your QR code.")

        if (kind === "URL") {
          let urlStr = content
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr)) {
            try {
              const parsed = new URL(urlStr)
              if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("Use a valid https:// or http:// URL.")
              }
              content = urlStr
            } catch {
              throw new Error("Use a valid https:// or http:// URL.")
            }
          } else {
            urlStr = `https://${urlStr}`
            try {
              const parsed = new URL(urlStr)
              if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("Use a valid https:// or http:// URL.")
              }
              content = urlStr
            } catch {
              throw new Error("Use a valid https:// or http:// URL.")
            }
          }
        }
        if (kind === "WhatsApp") {
          if (!/^\+?\d{7,15}$/.test(content)) {
            throw new Error(
              "Enter a phone number with country code (7–15 digits).",
            )
          }
          content = `https://wa.me/${content.replace("+", "")}?text=${encodeURIComponent(extra)}`
        }
        if (kind === "Wi-Fi") {
          const cleanSSID = content.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 64)
          const cleanPass = extra.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 128)
          const escape = (s: string) => s.replace(/([\\;,:"])/g, "\\$1")
          content = `WIFI:T:WPA;S:${escape(cleanSSID)};P:${escape(cleanPass)};;`
        }
        if (kind === "Email") {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content)) {
            throw new Error("Enter a valid email address.")
          }
          content = `mailto:${content}?subject=${encodeURIComponent(extra)}`
        }

        setRawQrPayload(content)
        if (typeof generateQR === "function") {
          setQr(await generateQR(content))
        }
      }
      // 2. Core PDF operations
      else if (tool.id === "merge-pdf") {
        if (files.length < 2)
          throw new Error("Choose at least two PDFs to merge.")
        setResult(await mergePDFs(files))
      } else if (tool.id === "rotate-pdf") {
        if (files.length < 1)
          throw new Error("Choose at least one PDF to rotate.")
        const angle = parseInt(optionA || "90", 10) || 90
        setResult(await rotatePDF(files[0], angle))
      } else if (tool.id === "text-pdf") {
        if (!value.trim())
          throw new Error("Add some text to create your document.")
        setResult(await textToPDF(value, title))
      } else if (tool.id === "split-pdf") {
        if (files.length < 1) throw new Error("Select a PDF to split.")
        setResult(await splitPDF(files[0], extra))
      } else if (tool.id === "compress") {
        if (files.length < 1) throw new Error("Select a PDF to compress.")
        const level = optionA as "standard" | "high" || "standard"
        setResult(await compressPDF(files[0], { level }))
      } else if (tool.id === "edit-pdf") {
        if (files.length < 1) throw new Error("Select a PDF to annotate.")
        const pageNum = parseInt(optionB || "1", 10) || 1
        const type = optionA as "note" | "highlight" | "callout" || "note"
        setResult(
          await editPDF(files[0], {
            annotation: extra,
            pageNumber: pageNum,
            type,
          }),
        )
      } else if (tool.id === "watermark") {
        if (files.length < 1) throw new Error("Select a PDF to watermark.")
        const opacity = parseFloat(optionA || "0.35") || 0.35
        const rotation = parseInt(optionB || "45", 10) ?? 45
        setResult(
          await watermarkPDF(files[0], {
            text: extra || "CONFIDENTIAL",
            opacity,
            rotation,
          }),
        )
      } else if (tool.id === "sign-pdf") {
        if (files.length < 1) throw new Error("Select a PDF to sign.")
        let signatureImageBytes: Uint8Array | undefined
        if (sigCanvasRef.current && sigHasDrawn) {
          const dataUrl = sigCanvasRef.current.toDataURL("image/png")
          const base64 = dataUrl.split(",")[1]
          if (base64) {
            const binary = atob(base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++)
              bytes[i] = binary.charCodeAt(i)
            signatureImageBytes = bytes
          }
        }
        const pageNum = optionA === "first" ? 1 : undefined
        setResult(
          await signPDF(files[0], {
            signerName: extra || "Digitally Signed",
            signatureImageBytes,
            pageNumber: pageNum,
          }),
        )
      } else if (tool.id === "password") {
        if (files.length < 1)
          throw new Error("Select a PDF to protect or unlock.")
        const action = optionA as "lock" | "unlock" || "lock"
        if (action === "lock") {
          if (!extra || extra.length < 4) {
            throw new Error("Security password must be at least 4 characters.")
          }
          if (optionB && extra !== optionB) {
            throw new Error("Passwords do not match.")
          }
        }
        setResult(await securePDF(files[0], { action, password: extra }))
      }
      // 2.5 Milestone 3 Document & Format Conversions
      else if (tool.id === "pdf-to-word") {
        if (files.length < 1)
          throw new Error("Select a PDF to convert to Word.")
        const format = optionA as "docx" | "doc" | "txt" || "docx"
        const layout = optionB as "standard" | "clean" | "compact" || "standard"
        setResult(await pdfToWord(files[0], { format, layout }))
      } else if (tool.id === "pdf-to-ppt") {
        if (files.length < 1)
          throw new Error("Select a PDF to convert to PowerPoint.")
        const aspectRatio = optionA as "16:9" | "4:3" || "16:9"
        const theme =
          optionB as "fluxkit-dark" | "minimal-white" | "corporate-blue" ||
          "fluxkit-dark"
        setResult(await pdfToPPT(files[0], { aspectRatio, theme }))
      } else if (tool.id === "pdf-to-excel") {
        if (files.length < 1)
          throw new Error("Select a PDF to extract into Excel.")
        const format = optionA as "xlsx" | "csv" | "tsv" || "xlsx"
        const strategy = optionB as "auto" | "whitespace" | "lines" || "auto"
        setResult(await pdfToExcel(files[0], { format, strategy }))
      } else if (tool.id === "word-to-pdf") {
        if (files.length < 1 && !value.trim()) {
          throw new Error(
            "Select a Word document or enter text to convert to PDF.",
          )
        }
        const margins =
          optionA as "standard" | "compact" | "spacious" || "standard"
        const font = optionB as "helvetica" | "times" | "courier" || "helvetica"
        if (files.length > 0) {
          setResult(await wordToPDF(files[0], { margins, font, title }))
        } else {
          setResult(await wordToPDF(value, { margins, font, title }))
        }
      } else if (tool.id === "ppt-to-pdf") {
        if (files.length < 1 && !value.trim()) {
          throw new Error(
            "Select a presentation file or enter outline text to convert to PDF.",
          )
        }
        const orientation =
          optionA as "landscape-16-9" | "landscape-4-3" | "portrait" ||
          "landscape-16-9"
        const slidesPerPage = parseInt(optionB || "1", 10) || 1
        setResult(
          await pptToPDF(files[0] || value, {
            orientation,
            slidesPerPage,
            title,
          }),
        )
      } else if (tool.id === "excel-to-pdf") {
        if (files.length < 1 && !value.trim()) {
          throw new Error("Select an Excel or CSV file to convert to PDF.")
        }
        const orientation = optionA as "landscape" | "portrait" || "landscape"
        const tableTheme =
          optionB as "grid-indigo" | "zebra" | "minimal" || "grid-indigo"
        setResult(
          await excelToPDF(files[0] || value, {
            orientation,
            theme: tableTheme,
            title,
          }),
        )
      } else if (tool.id === "pdf-to-jpg") {
        if (files.length < 1) throw new Error("Select a PDF to convert to JPG.")
        const quality = optionA as "high" | "standard" | "compact" || "high"
        const pageSelection = optionB as "first" | "all" | "custom" || "first"
        const pageNum = parseInt(extra || "1", 10) || 1
        setResult(
          await pdfToJPG(files[0], {
            quality,
            pageSelection,
            pageNumber: pageNum,
          }),
        )
      } else if (tool.id === "jpg-to-pdf") {
        if (files.length < 1)
          throw new Error("Select at least one image to convert to PDF.")
        const orientation =
          optionA as "auto" | "portrait" | "landscape" || "auto"
        const margins =
          optionB as "fit-margins" | "no-margins" | "center-original" ||
          "fit-margins"
        setResult(await jpgToPDF(files, { orientation, margins, title }))
      } else if (tool.id === "zip") {
        if (files.length < 1) {
          throw new Error(
            zipMode === "extract"
              ? "Select a ZIP archive to extract."
              : "Select at least one file to archive.",
          )
        }
        if (zipMode === "extract") {
          setPipelineStep({
            current: 1,
            total: 1,
            label: "Extracting archive...",
          })
          const extracted = await extractZipArchive(files[0])
          setExtractedFiles(extracted)
          setPipelineStep(null)
          notify.success(
            `Extracted ${extracted.length} files from ${files[0].name}.`,
          )
          onComplete(`${files[0].name} (Extracted)`)
          setStatus("completed")
          return
        } else {
          setPipelineStep({
            current: 1,
            total: 1,
            label: "Packaging ZIP archive...",
          })
          const compLevel =
            optionA === "store" ? 0 : optionA === "maximum" ? 9 : 6
          const archName = extra.trim()
            ? extra.endsWith(".zip")
              ? extra
              : `${extra}.zip`
            : undefined
          const zipRes = await zipFiles(
            files.map((f) => ({ name: f.name, data: f })),
            {
              compressionLevel: compLevel,
              archiveName: archName,
            },
          )
          setResult({ name: zipRes.name, blob: zipRes.blob })
          setPipelineMetrics({
            blob: zipRes.blob,
            name: zipRes.name,
            filename: zipRes.name,
            originalSize: zipRes.uncompressedSize,
            finalSize: zipRes.compressedSize,
            savedPercentage: Math.round(zipRes.compressionRatio * 100),
          })
          setPipelineStep(null)
          notify.success(`Created ZIP archive with ${zipRes.totalFiles} files.`)
          onComplete(zipRes.name)
          setStatus("completed")
          return
        }
      } else if (tool.id === "ocr") {
        if (files.length < 1) {
          throw new Error("Select an image or PDF document to scan.")
        }
        setPipelineStep({
          current: 1,
          total: 1,
          label: "Scanning document & recognizing text...",
        })
        const ocr = await scanOCR(files[0], {
          language: optionA || "en",
          enhanceContrast: ocrContrast,
          invertColors: ocrInvert,
          cleanBackground: ocrClean,
        })
        setOcrResult(ocr)
        setTextOutput(ocr.text)
        const baseName = files[0].name.replace(/\.[^/.]+$/, "")
        const txtBlob = new Blob([ocr.text], {
          type: "text/plain;charset=utf-8",
        })
        setResult({ name: `${baseName}-ocr.txt`, blob: txtBlob })
        setPipelineStep(null)
        notify.success(
          `OCR complete: ${ocr.wordCount} words recognized (${Math.round(ocr.confidence * 100)}% confidence).`,
        )
        onComplete(`${baseName}-ocr.txt`)
        setStatus("completed")
        return
      } else if (tool.id === "convert") {
        if (files.length < 1) {
          throw new Error("Select a file to convert.")
        }
        const targetFormat =
          optionA ||
          (files[0].name.toLowerCase().endsWith(".pdf") ? "docx" : "pdf")
        setPipelineStep({
          current: 1,
          total: 1,
          label: `Converting to ${targetFormat.toUpperCase()}...`,
        })
        const conv = await universalConvert(files[0], { targetFormat })
        setResult(conv)
        setPipelineStep(null)
        notify.success(
          `Converted ${files[0].name} to ${targetFormat.toUpperCase()}.`,
        )
        onComplete(conv.name)
        setStatus("completed")
        return
      } else if (tool.id === "convert-compress") {
        if (files.length < 1) {
          throw new Error("Select a file to convert and compress.")
        }
        const targetFormat = optionA || "pdf"
        const compressLevel =
          optionB as "standard" | "high" | "low" | "extreme" || "standard"
        const res = await convertAndCompress(files[0], {
          targetFormat,
          compressLevel,
          onProgress: (evt) => {
            const stepNum = evt.stage === "converting" ? 1 : 2
            setPipelineStep({
              current: stepNum,
              total: 2,
              label: evt.message || `Step ${stepNum}: ${evt.stage}...`,
            })
          },
        })
        setResult({ name: res.name, blob: res.blob })
        setPipelineMetrics(res)
        setPipelineStep(null)
        notify.success(`Converted & compressed: saved ${res.savedPercentage}%.`)
        onComplete(res.name)
        setStatus("completed")
        return
      } else if (tool.id === "merge-compress") {
        if (files.length < 2) {
          throw new Error("Choose at least two PDFs to merge and compress.")
        }
        const compressLevel =
          optionA as "standard" | "high" | "low" | "extreme" || "standard"
        const res = await mergeAndCompress(files, {
          compressLevel,
          stripMetadata: stripMeta,
          onProgress: (evt) => {
            const stepNum = evt.stage === "merging" ? 1 : 2
            setPipelineStep({
              current: stepNum,
              total: 2,
              label: evt.message || `Step ${stepNum}: ${evt.stage}...`,
            })
          },
        })
        setResult({ name: res.name, blob: res.blob })
        setPipelineMetrics(res)
        setPipelineStep(null)
        notify.success(
          `Merged & compressed ${files.length} PDFs: saved ${res.savedPercentage}%.`,
        )
        onComplete(res.name)
        setStatus("completed")
        return
      } else if (tool.id === "split-compress") {
        if (files.length < 1) {
          throw new Error("Select a PDF to split and compress.")
        }
        const splitMode =
          optionA as "ranges" | "range" | "all" | "all-pages" || "ranges"
        const compressLevel =
          optionB as "standard" | "high" | "low" | "extreme" || "standard"
        const res = await splitAndCompress(files[0], {
          splitMode,
          pageRange: extra,
          compressLevel,
          onProgress: (evt) => {
            const total =
              splitMode === "all" || splitMode === "all-pages" ? 3 : 2
            const stepNum =
              evt.stage === "splitting"
                ? 1
                : evt.stage === "compressing"
                  ? 2
                  : 3
            setPipelineStep({
              current: stepNum,
              total,
              label: evt.message || `Step ${stepNum}: ${evt.stage}...`,
            })
          },
        })
        setResult({ name: res.name, blob: res.blob })
        setPipelineMetrics(res)
        setPipelineStep(null)
        notify.success(`Split & compressed PDF: saved ${res.savedPercentage}%.`)
        onComplete(res.name)
        setStatus("completed")
        return
      }
      // 3. AI Text Tools
      else if (tool.category === "AI text tools") {
        if (!value.trim())
          throw new Error("Enter some text or document content to process.")
        const output = executeAIProcessing(value)
        setTextOutput(output)
        setStatus("completed")
        return
      }
      // 4. File Tools (client-side processing)
      else if (tool.category === "File tools") {
        if (files.length < 1 && !value.trim()) {
          throw new Error(`Select or drop a file to process with ${tool.name}.`)
        } else if (files.length > 0) {
          // General conversion / document packaging
          const original = files[0]
          const targetExt = tool.id.includes("word")
            ? "docx"
            : tool.id.includes("ppt")
              ? "pptx"
              : tool.id.includes("excel")
                ? "xlsx"
                : tool.id.includes("jpg")
                  ? "jpg"
                  : tool.id.includes("zip")
                    ? "zip"
                    : "pdf"
          const outputName = `${original.name.replace(/\.[^/.]+$/, "")}-converted.${targetExt}`
          const blob = new Blob([await original.arrayBuffer()], {
            type:
              targetExt === "pdf"
                ? "application/pdf"
                : "application/octet-stream",
          })
          setResult({ name: outputName, blob })
        } else {
          // Text-based fallback creation
          setResult(await textToPDF(value, title || tool.name))
        }
      }
      // 5. Workspace tools
      else if (tool.id === "documents") {
        if (files.length > 0) {
          files.forEach((f) => {
            saveSessionDocument({
              name: f.name,
              toolSource: "Direct Upload",
              blob: f,
              rawSize: f.size,
            })
          })
          setSessionDocs(getSessionDocuments())
          setFiles([])
        }
      }

      if (out) {
        saveSessionDocument({
          name: out.name,
          toolSource: tool.name,
          blob: out.blob,
        })
      }

      setStatus("completed")
      onComplete(tool.name)
      notify(`${tool.name} completed. Your result is ready.`, "success")
    } catch (err) {
      setStatus("failed")
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      )
    }
  }

  const handleUploadDocuments = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const fileList = e.target.files
    if (!fileList || !fileList.length) return
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      if (typeof saveSessionDocument === "function") {
        const saved = saveSessionDocument({
          name: file.name,
          toolSource: "Direct Upload",
          blob: file,
          rawSize: file.size,
        })
        if (
          saved &&
          typeof isDatabaseSupported === "function" &&
          isDatabaseSupported() &&
          typeof dbSaveDocument === "function"
        ) {
          await dbSaveDocument(saved)
        }
      }
    }
    if (
      typeof isDatabaseSupported === "function" &&
      isDatabaseSupported() &&
      typeof dbGetAllDocuments === "function"
    ) {
      const updated = await dbGetAllDocuments()
      setSessionDocs(updated)
      if (typeof dbGetStorageStats === "function") {
        const stats = await dbGetStorageStats()
        setDbStats(stats)
      }
    } else if (typeof getSessionDocuments === "function") {
      setSessionDocs(getSessionDocuments())
    }
    notify(
      `Saved ${fileList.length} document${
        fileList.length > 1 ? "s" : ""
      } to database.`,
      "success",
    )
    e.target.value = ""
  }

  const handleDeleteDocument = async (docToDelete: SessionDocument) => {
    if (typeof deleteSessionDocument === "function") {
      deleteSessionDocument(docToDelete.id)
    }
    if (
      typeof isDatabaseSupported === "function" &&
      isDatabaseSupported() &&
      typeof dbDeleteDocument === "function"
    ) {
      await dbDeleteDocument(docToDelete.id)
      if (typeof dbGetAllDocuments === "function") {
        const updated = await dbGetAllDocuments()
        setSessionDocs(updated)
      }
      if (typeof dbGetStorageStats === "function") {
        const stats = await dbGetStorageStats()
        setDbStats(stats)
      }
    } else if (typeof getSessionDocuments === "function") {
      setSessionDocs(getSessionDocuments())
    } else {
      setSessionDocs((prev) => prev.filter((d) => d.id !== docToDelete.id))
    }
    setDeleteConfirmDoc(null)
    if (previewDoc?.id === docToDelete.id) {
      setPreviewDoc(null)
    }
    notify(`Permanently deleted ${docToDelete.name} from database.`, "info")
  }

  const handleClearDatabase = async () => {
    if (typeof clearSessionDocuments === "function") {
      clearSessionDocuments()
    }
    if (
      typeof isDatabaseSupported === "function" &&
      isDatabaseSupported() &&
      typeof dbClearAllDocuments === "function"
    ) {
      await dbClearAllDocuments()
      if (typeof markDatabaseInitialized === "function") {
        await markDatabaseInitialized()
      }
    }
    setSessionDocs([])
    setDbStats({ count: 0, totalBytes: 0, formattedSize: "0 B" })
    setShowClearConfirm(false)
    notify("Database cleared. All files permanently deleted.", "info")
  }

  const handleRestoreSamples = async () => {
    if (typeof reloadSampleDocuments === "function") {
      const samples = await reloadSampleDocuments()
      setSessionDocs(samples)
      if (
        typeof isDatabaseSupported === "function" &&
        isDatabaseSupported() &&
        typeof dbGetStorageStats === "function"
      ) {
        const stats = await dbGetStorageStats()
        setDbStats(stats)
      }
    } else if (typeof getSampleDocuments === "function") {
      setSessionDocs(getSampleDocuments())
    }
    notify("Sample starter documents restored to database.", "success")
  }

  const handleDownloadDoc = async (doc: SessionDocument) => {
    let blob = doc.blob
    if (
      !blob &&
      typeof isDatabaseSupported === "function" &&
      isDatabaseSupported() &&
      typeof dbGetDocument === "function"
    ) {
      const dbDoc = await dbGetDocument(doc.id)
      if (dbDoc?.blob) blob = dbDoc.blob
    }
    if (!blob) {
      blob = new Blob(
        [
          doc.contentSnippet ||
            `FluxKit Saved Document: ${doc.name}\nSource: ${doc.toolSource}\nCategory: ${doc.category}`,
        ],
        { type: "application/octet-stream" },
      )
    }
    if (typeof download === "function") {
      download({ name: doc.name, blob })
    }
    notify(`Downloading ${doc.name}`, "success")
  }

  return (
    <div className="page-enter tool-page">
      {navigate && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back()
            } else {
              navigate("overview")
            }
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--muted)",
            fontSize: "12px",
            cursor: "pointer",
            marginBottom: "12px",
            padding: "4px 0",
            background: "none",
            border: "none",
          }}
          aria-label="Back to workspace"
        >
          <ArrowLeft size={14} /> Back to workspace
        </button>
      )}
      <div className="eyebrow">{tool.category}</div>
      <h1>{tool.name}</h1>
      <p className="page-subtitle">{tool.description}</p>

      {/* --- WORKSPACE SPECIAL VIEWS --- */}
      {tool.id === "meetings" ? (
        <div
          className="tool-layout"
          style={{ gridTemplateColumns: "1.3fr 1fr", gap: "20px" }}
        >
          <div className="panel input-panel">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2>Virtual Meeting Studio</h2>
                <p style={{ color: "var(--muted)", fontSize: "12px" }}>
                  In-browser simulated HD virtual meeting stage with mock
                  stream, animated equalizer &amp; live collaboration.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="live-badge">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: inMeeting ? "#10b981" : "#94a3b8",
                      display: "inline-block",
                      animation: inMeeting ? "pulse 1.2s infinite" : "none",
                    }}
                  />
                  {inMeeting
                    ? `LIVE · ${formatDisplayTimer(meetingTimer)}`
                    : "IDLE"}
                </span>
              </div>
            </div>

            {/* Video Viewport Stage */}
            <div
              style={{
                background: "#080c14",
                borderRadius: "10px",
                height: "280px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--border)",
                position: "relative",
                overflow: "hidden",
                color: "#e2e8f0",
              }}
            >
              {isScreenSharing ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "#0f172a",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "20px",
                    textAlign: "center",
                  }}
                >
                  <Monitor size={48} className="text-indigo-400 mb-2" />
                  <div className="font-semibold text-sm">
                    Sharing Screen: FluxKit Workspace Canvas
                  </div>
                  <small style={{ color: "var(--muted)", marginTop: 4 }}>
                    Live desktop presentation feed · 1080p 60fps
                  </small>
                  <button
                    type="button"
                    className="text-button"
                    style={{
                      marginTop: "12px",
                      background: "#ef444422",
                      color: "#f87171",
                      border: "1px solid #ef444455",
                      padding: "4px 10px",
                      borderRadius: "4px",
                    }}
                    onClick={() => {
                      setIsScreenSharing(false)
                      notify("Screen sharing stopped.")
                    }}
                  >
                    Stop Sharing
                  </button>
                </div>
              ) : cameraOff ? (
                <div style={{ textAlign: "center", color: "var(--muted)" }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: "#1e293b",
                      display: "grid",
                      placeItems: "center",
                      margin: "0 auto 10px",
                      border: "1px solid #334155",
                    }}
                  >
                    <CameraOff size={28} />
                  </div>
                  <div className="font-semibold text-sm">Camera Disabled</div>
                  <small>
                    Click 'Turn On Camera' to activate virtual studio feed
                  </small>
                </div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      "radial-gradient(ellipse at center, #1e1b4b 0%, #080c14 70%)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      background: "#312e81",
                      border: "2px solid #6366f1",
                      display: "grid",
                      placeItems: "center",
                      color: "#c7d2fe",
                      fontSize: "20px",
                      fontWeight: 700,
                      boxShadow: "0 0 25px rgba(99, 102, 241, 0.4)",
                      marginBottom: 10,
                    }}
                  >
                    YO
                  </div>
                  <div className="font-semibold text-sm text-indigo-200">
                    You (Host) · HD 1080p Virtual Feed
                  </div>
                  <small style={{ color: "#94a3b8", marginTop: 2 }}>
                    FluxKit Virtual Studio Feed · Simulated 30fps
                  </small>
                  {/* Active Equalizer animation when unmuted */}
                  {!micMuted && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 3,
                        height: 16,
                        marginTop: 10,
                      }}
                    >
                      {[12, 16, 8, 14, 10].map((h, i) => (
                        <div
                          key={i}
                          style={{
                            width: 3,
                            height: h,
                            backgroundColor: "#10b981",
                            borderRadius: 1,
                            animation: "pulse 0.8s infinite ease-in-out",
                            animationDelay: `${i * 0.15}s`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Live badge overlay in video viewport */}
              {inMeeting && (
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "12px",
                    background: "rgba(16, 185, 129, 0.25)",
                    border: "1px solid rgba(16, 185, 129, 0.5)",
                    color: "#10b981",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  REC · {formatDisplayTimer(meetingTimer)}
                </div>
              )}
            </div>

            {/* Media Controls Dock */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "14px",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="text-button"
                style={{
                  border: "1px solid var(--border)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => {
                  setMicMuted((m) => !m)
                  notify(micMuted ? "Microphone unmuted." : "Microphone muted.")
                }}
              >
                {micMuted ? (
                  <MicOff size={16} color="#ef4444" />
                ) : (
                  <Mic size={16} color="#10b981" />
                )}
                {micMuted ? "Unmute Mic" : "Mute Mic"}
              </button>

              <button
                type="button"
                className="text-button"
                style={{
                  border: "1px solid var(--border)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => {
                  setCameraOff((c) => !c)
                  notify(cameraOff ? "Camera turned on." : "Camera turned off.")
                }}
              >
                {cameraOff ? (
                  <CameraOff size={16} color="#ef4444" />
                ) : (
                  <Camera size={16} />
                )}
                {cameraOff ? "Turn On Camera" : "Turn Off Camera"}
              </button>

              <button
                type="button"
                className="text-button"
                style={{
                  border: "1px solid var(--border)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: isScreenSharing
                    ? "rgba(99, 102, 241, 0.15)"
                    : "transparent",
                  color: isScreenSharing ? "#818cf8" : "inherit",
                }}
                onClick={() => {
                  setIsScreenSharing((s) => !s)
                  notify(
                    !isScreenSharing
                      ? "Screen sharing started."
                      : "Screen sharing stopped.",
                  )
                }}
              >
                <Monitor size={16} />
                {isScreenSharing ? "Stop Sharing" : "Share Screen"}
              </button>
            </div>

            {/* Room Key Input */}
            <div style={{ marginTop: "14px" }}>
              <label>
                Meeting Room Key
                <input
                  value={meetingRoomKey}
                  onChange={(e) => setMeetingRoomKey(e.target.value)}
                  placeholder="Enter room name"
                />
              </label>
            </div>

            <button
              type="button"
              className="primary"
              style={{
                marginTop: "14px",
                width: "100%",
                background: inMeeting ? "#ef4444" : "#4f46e5",
                color: "#ffffff",
              }}
              onClick={() => {
                setInMeeting(!inMeeting)
                if (!inMeeting) {
                  onComplete("Video Meetings")
                  notify("Connected to video meeting room.", "success")
                } else {
                  notify("Left meeting room.")
                }
              }}
            >
              <Video size={17} />
              {inMeeting ? "Leave Meeting" : "Start Meeting"}
            </button>
          </div>

          {/* Right Column: Interactive Sidebar (Chat & Participants) */}
          <div
            className="panel result-panel flex flex-col"
            style={{ padding: "18px" }}
          >
            <div
              className="flex items-center justify-between border-b pb-3 mb-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  className={sidebarTab === "chat" ? "primary" : "text-button"}
                  style={{ padding: "5px 10px", fontSize: "11px" }}
                  onClick={() => setSidebarTab("chat")}
                >
                  <MessageSquare size={13} /> Chat ({chatMessages.length})
                </button>
                <button
                  type="button"
                  className={
                    sidebarTab === "participants" ? "primary" : "text-button"
                  }
                  style={{ padding: "5px 10px", fontSize: "11px" }}
                  onClick={() => setSidebarTab("participants")}
                >
                  <Users size={13} /> People (4)
                </button>
              </div>
              <button
                type="button"
                className="text-button"
                style={{ fontSize: "11px" }}
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(
                      `https://fluxkit.app/#meetings?room=${meetingRoomKey}`,
                    )
                  }
                  notify("Meeting link copied to clipboard!", "success")
                }}
              >
                <Share2 size={13} /> Copy Link
              </button>
            </div>

            {sidebarTab === "chat" ? (
              <div
                className="flex flex-col flex-1"
                style={{ minHeight: "320px" }}
              >
                <div
                  className="flex-1 overflow-y-auto mb-3 space-y-2"
                  style={{ maxHeight: "280px", paddingRight: "4px" }}
                >
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background:
                          msg.sender === "You"
                            ? "rgba(99, 102, 241, 0.15)"
                            : "var(--surface-hover)",
                        fontSize: "12px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <strong
                          style={{
                            color:
                              msg.sender === "You" ? "#a5b4fc" : "var(--text)",
                          }}
                        >
                          {msg.sender}
                        </strong>
                        <span style={{ fontSize: "10px" }}>{msg.time}</span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          color: "var(--text)",
                          lineHeight: "1.4",
                        }}
                      >
                        {msg.text}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-auto">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleSendMeetingChat(chatInput)
                      }
                    }}
                    placeholder="Type a message..."
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    type="button"
                    className="primary"
                    style={{ padding: "8px 12px", fontSize: "12px" }}
                    onClick={() => handleSendMeetingChat(chatInput)}
                  >
                    <Send size={14} /> Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  {
                    name: "You (Host)",
                    role: "Host",
                    mic: !micMuted,
                    cam: !cameraOff,
                  },
                  {
                    name: "Sarah Chen (Design Lead)",
                    role: "Collaborator",
                    mic: true,
                    cam: true,
                  },
                  {
                    name: "Marcus Vance (Engineer)",
                    role: "Collaborator",
                    mic: false,
                    cam: true,
                  },
                  {
                    name: "Elena Rostova (PM)",
                    role: "Collaborator",
                    mic: true,
                    cam: false,
                  },
                ].map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded border"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-hover)",
                    }}
                  >
                    <div>
                      <div className="font-medium text-xs text-white">
                        {p.name}
                      </div>
                      <small
                        style={{ color: "var(--muted)", fontSize: "10px" }}
                      >
                        {p.role}
                      </small>
                    </div>
                    <div className="flex gap-2 text-slate-400">
                      {p.mic ? (
                        <Mic size={14} color="#10b981" />
                      ) : (
                        <MicOff size={14} color="#ef4444" />
                      )}
                      {p.cam ? (
                        <Camera size={14} color="#60a5fa" />
                      ) : (
                        <CameraOff size={14} color="#ef4444" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tool.id === "whiteboards" ? (
        <div className="tool-layout" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel input-panel">
            {/* Whiteboard Toolbar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px",
                marginBottom: "14px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {/* Drawing Tools */}
              <div style={{ display: "flex", gap: "4px" }}>
                {[
                  { id: "pen", label: "Pen", icon: PenTool },
                  { id: "line", label: "Line", icon: Minus },
                  { id: "rect", label: "Rect", icon: Square },
                  { id: "circle", label: "Circle", icon: Circle },
                  { id: "eraser", label: "Eraser", icon: Trash2 },
                  { id: "text", label: "Text", icon: Type },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={
                      activeShapeTool === t.id ? "primary" : "text-button"
                    }
                    style={{
                      padding: "5px 9px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    onClick={() => setActiveShapeTool(t.id as any)}
                  >
                    <t.icon size={13} /> {t.label}
                  </button>
                ))}
              </div>

              {/* 10 Palette Color Swatches */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  marginLeft: "6px",
                }}
              >
                {[
                  "#0f172a",
                  "#4f46e5",
                  "#059669",
                  "#dc2626",
                  "#d97706",
                  "#0284c7",
                  "#9333ea",
                  "#ec4899",
                  "#64748b",
                  "#ffffff",
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: c,
                      border:
                        brushColor === c
                          ? "2px solid #ffffff"
                          : "1px solid #475569",
                      boxShadow:
                        brushColor === c ? "0 0 0 2px #6366f1" : "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onClick={() => {
                      setBrushColor(c)
                      if (activeShapeTool === "eraser")
                        setActiveShapeTool("pen")
                    }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>

              {/* Brush Thickness Slider */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginLeft: "8px",
                  fontSize: "11px",
                }}
              >
                <span>Size:</span>
                <input
                  type="range"
                  min={1}
                  max={32}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  style={{ width: "70px", accentColor: "#6366f1" }}
                />
                <span style={{ minWidth: "24px", color: "var(--muted)" }}>
                  {brushSize}px
                </span>
              </div>

              {/* Undo / Redo controls */}
              <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
                <button
                  type="button"
                  className="text-button"
                  disabled={!canUndo}
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                  onClick={handleWhiteboardUndo}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={14} /> Undo
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={!canRedo}
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                  onClick={handleWhiteboardRedo}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={14} /> Redo
                </button>
                <button
                  type="button"
                  className="text-button"
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                  onClick={() => {
                    whiteboardRenderSeqRef.current++
                    const canvas = canvasRef.current
                    if (canvas) {
                      const ctx = canvas.getContext("2d")
                      if (ctx) {
                        ctx.fillStyle = "#ffffff"
                        ctx.fillRect(0, 0, canvas.width, canvas.height)
                        whiteboardHistoryRef.current.push(
                          canvas.toDataURL("image/png"),
                        )
                        setCanUndo(whiteboardHistoryRef.current.canUndo())
                        setCanRedo(whiteboardHistoryRef.current.canRedo())
                      }
                    }
                    notify("Whiteboard canvas cleared.")
                  }}
                >
                  Clear Board
                </button>
              </div>

              {/* Export actions */}
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: "12px", padding: "6px 12px" }}
                  onClick={() => {
                    const canvas = canvasRef.current
                    if (canvas) {
                      const dataUrl = canvas.toDataURL("image/png")
                      const a = document.createElement("a")
                      a.href = dataUrl
                      a.download = `fluxkit-whiteboard-${Date.now()}.png`
                      a.click()
                      saveSessionDocument({
                        name: a.download,
                        toolSource: "Whiteboards",
                        category: "images",
                        dataUrl,
                      })
                      setSessionDocs(getSessionDocuments())
                      onComplete("Whiteboards")
                      notify(
                        "Whiteboard exported as PNG and saved to My Documents.",
                        "success",
                      )
                    }
                  }}
                >
                  <Download size={14} /> Export PNG
                </button>
                <button
                  type="button"
                  className="text-button"
                  style={{
                    fontSize: "12px",
                    padding: "6px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                  }}
                  onClick={() => {
                    const canvas = canvasRef.current
                    if (canvas) {
                      const offscreen = document.createElement("canvas")
                      offscreen.width = canvas.width
                      offscreen.height = canvas.height
                      const offCtx = offscreen.getContext("2d")
                      if (offCtx) {
                        offCtx.fillStyle = "#ffffff"
                        offCtx.fillRect(0, 0, offscreen.width, offscreen.height)
                        offCtx.drawImage(canvas, 0, 0)
                      }
                      const dataUrl = offscreen.toDataURL("image/jpeg", 0.95)
                      const a = document.createElement("a")
                      a.href = dataUrl
                      a.download = `fluxkit-whiteboard-${Date.now()}.jpg`
                      a.click()
                      saveSessionDocument({
                        name: a.download,
                        toolSource: "Whiteboards",
                        category: "images",
                        dataUrl,
                      })
                      setSessionDocs(getSessionDocuments())
                      onComplete("Whiteboards")
                      notify(
                        "Whiteboard exported as JPEG and saved to My Documents.",
                        "success",
                      )
                    }
                  }}
                >
                  <Download size={14} /> Export JPEG
                </button>
              </div>
            </div>

            {/* High-DPI Whiteboard Canvas */}
            <canvas
              ref={canvasRef}
              width={1200}
              height={650}
              style={{
                width: "100%",
                height: "auto",
                background: "#ffffff",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                cursor: activeShapeTool === "text" ? "text" : "crosshair",
                touchAction: "none",
              }}
              onPointerDown={(e) => {
                const canvas = canvasRef.current
                if (!canvas) return
                const ctx = canvas.getContext("2d")
                if (!ctx) return
                const rect = canvas.getBoundingClientRect()
                const scaleX = canvas.width / rect.width
                const scaleY = canvas.height / rect.height
                const x = (e.clientX - rect.left) * scaleX
                const y = (e.clientY - rect.top) * scaleY

                if (activeShapeTool === "text") {
                  const input = window.prompt(
                    "Enter text annotation to place on whiteboard:",
                    "Note: ",
                  )
                  if (input) {
                    ctx.font = `bold ${Math.max(16, brushSize * 3)}px 'DM Sans', sans-serif`
                    ctx.fillStyle = brushColor
                    ctx.fillText(input, x, y)
                    whiteboardHistoryRef.current.push(
                      canvas.toDataURL("image/png"),
                    )
                    setCanUndo(whiteboardHistoryRef.current.canUndo())
                    setCanRedo(whiteboardHistoryRef.current.canRedo())
                  }
                  return
                }

                isDrawingRef.current = true
                startPosRef.current = { x, y }
                snapshotRef.current = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                )

                ctx.lineWidth = brushSize
                ctx.strokeStyle =
                  activeShapeTool === "eraser" ? "#ffffff" : brushColor
                ctx.fillStyle = brushColor
                ctx.beginPath()
                ctx.moveTo(x, y)
              }}
              onPointerMove={(e) => {
                if (!isDrawingRef.current) return
                const canvas = canvasRef.current
                if (!canvas) return
                const ctx = canvas.getContext("2d")
                if (!ctx) return
                const rect = canvas.getBoundingClientRect()
                const scaleX = canvas.width / rect.width
                const scaleY = canvas.height / rect.height
                const currentX = (e.clientX - rect.left) * scaleX
                const currentY = (e.clientY - rect.top) * scaleY

                if (activeShapeTool === "pen" || activeShapeTool === "eraser") {
                  ctx.lineWidth =
                    activeShapeTool === "eraser" ? brushSize * 2 : brushSize
                  ctx.strokeStyle =
                    activeShapeTool === "eraser" ? "#ffffff" : brushColor
                  ctx.lineTo(currentX, currentY)
                  ctx.stroke()
                } else if (snapshotRef.current && startPosRef.current) {
                  ctx.putImageData(snapshotRef.current, 0, 0)
                  ctx.lineWidth = brushSize
                  ctx.strokeStyle = brushColor
                  const startX = startPosRef.current.x
                  const startY = startPosRef.current.y

                  if (activeShapeTool === "line") {
                    ctx.beginPath()
                    ctx.moveTo(startX, startY)
                    ctx.lineTo(currentX, currentY)
                    ctx.stroke()
                  } else if (activeShapeTool === "rect") {
                    const w = currentX - startX
                    const h = currentY - startY
                    ctx.strokeRect(startX, startY, w, h)
                  } else if (activeShapeTool === "circle") {
                    const radius = Math.hypot(
                      currentX - startX,
                      currentY - startY,
                    )
                    ctx.beginPath()
                    ctx.arc(startX, startY, radius, 0, 2 * Math.PI)
                    ctx.stroke()
                  }
                }
              }}
              onPointerUp={() => {
                if (!isDrawingRef.current) return
                isDrawingRef.current = false
                const canvas = canvasRef.current
                if (!canvas) return
                whiteboardHistoryRef.current.push(canvas.toDataURL("image/png"))
                setCanUndo(whiteboardHistoryRef.current.canUndo())
                setCanRedo(whiteboardHistoryRef.current.canRedo())
              }}
              onPointerLeave={() => {
                if (!isDrawingRef.current) return
                isDrawingRef.current = false
                const canvas = canvasRef.current
                if (!canvas) return
                whiteboardHistoryRef.current.push(canvas.toDataURL("image/png"))
                setCanUndo(whiteboardHistoryRef.current.canUndo())
                setCanRedo(whiteboardHistoryRef.current.canRedo())
              }}
            />
          </div>
        </div>
      ) : tool.id === "documents" ? (
        <div className="tool-layout" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel input-panel">
            {/* Top Stats Banner */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderRadius: "8px",
                background: "var(--surface-hover)",
                border: "1px solid var(--border)",
                marginBottom: "16px",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "20px",
                  fontSize: "13.5px",
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{ color: "var(--muted)" }}>
                    Total Documents:{" "}
                  </span>
                  <strong style={{ color: "var(--text)" }}>
                    {sessionDocs.length}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Active Filter: </span>
                  <strong
                    style={{ color: "#a5b4fc", textTransform: "uppercase" }}
                  >
                    {docCategory}
                  </strong>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span style={{ color: "var(--muted)" }}>Storage: </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      color: "#34d399",
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#10b981",
                        display: "inline-block",
                        boxShadow: "0 0 6px #10b981",
                      }}
                    />
                    IndexedDB Persistent Database
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Total Size: </span>
                  <strong style={{ color: "var(--text)" }}>
                    {dbStats?.formattedSize ||
                      safeFormatByteSize(
                        sessionDocs.reduce(
                          (acc, d) =>
                            acc +
                            (d.rawSize ||
                              (d.blob
                                ? d.blob.size
                                : d.contentSnippet?.length || 1024)),
                          0,
                        ),
                      )}
                  </strong>
                </div>
              </div>

              {/* Upload Document Action & Clear All */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <label
                  className="primary"
                  style={{
                    padding: "8px 14px",
                    fontSize: "13.5px",
                    cursor: "pointer",
                    margin: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Upload size={15} /> Upload Document
                  <input
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={handleUploadDocuments}
                  />
                </label>

                {sessionDocs.length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    style={{
                      padding: "7px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      fontSize: "12.5px",
                      color: "#f87171",
                    }}
                    onClick={() => setShowClearConfirm(true)}
                  >
                    <Trash2 size={14} /> Clear Library
                  </button>
                )}
              </div>
            </div>

            {/* Toolbar: Search & Category Filter Pills */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px",
                marginBottom: "16px",
              }}
            >
              {/* Search Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "7px",
                  padding: "8px 14px",
                  flex: "1 1 240px",
                }}
              >
                <Search size={16} color="var(--muted)" />
                <input
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Search documents by name or tool source..."
                  style={{
                    background: "none",
                    border: "none",
                    outline: "none",
                    color: "var(--text)",
                    fontSize: "13.5px",
                    width: "100%",
                  }}
                />
                {docSearch && (
                  <button
                    type="button"
                    onClick={() => setDocSearch("")}
                    style={{ color: "var(--muted)", padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Filter Pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                {[
                  { id: "all", label: "All" },
                  { id: "pdf", label: "PDFs" },
                  { id: "sheets", label: "Sheets" },
                  { id: "slides", label: "Slides" },
                  { id: "images", label: "Images" },
                  { id: "audio-text", label: "Audio / Text" },
                  { id: "docs", label: "Documents" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={
                      docCategory === cat.id ? "primary" : "text-button"
                    }
                    style={{
                      padding: "6px 12px",
                      fontSize: "12.5px",
                      borderRadius: "6px",
                      border:
                        docCategory === cat.id
                          ? "none"
                          : "1px solid var(--border)",
                    }}
                    onClick={() => setDocCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* View Mode Toggle */}
              <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
                <button
                  type="button"
                  className={
                    docViewMode === "table" ? "primary" : "text-button"
                  }
                  style={{ padding: "6px 11px", fontSize: "12.5px" }}
                  onClick={() => setDocViewMode("table")}
                  title="Table View"
                >
                  <List size={15} /> Table
                </button>
                <button
                  type="button"
                  className={docViewMode === "grid" ? "primary" : "text-button"}
                  style={{ padding: "6px 11px", fontSize: "12.5px" }}
                  onClick={() => setDocViewMode("grid")}
                  title="Grid Cards"
                >
                  <LayoutGrid size={15} /> Grid
                </button>
              </div>
            </div>

            {/* Document Listing Surface */}
            {(() => {
              const displayed =
                typeof filterDocuments === "function"
                  ? filterDocuments(docSearch, docCategory, sessionDocs)
                  : sessionDocs.filter(
                      (d) =>
                        (!docSearch ||
                          d.name
                            .toLowerCase()
                            .includes(docSearch.toLowerCase())) &&
                        (docCategory === "all" || d.category === docCategory),
                    )
              if (displayed.length === 0) {
                if (sessionDocs.length === 0) {
                  return (
                    <div
                      style={{
                        padding: "48px 24px",
                        textAlign: "center",
                        color: "var(--muted)",
                        border: "1px dashed var(--border)",
                        borderRadius: "8px",
                        marginTop: "16px",
                      }}
                    >
                      <Database
                        size={40}
                        style={{
                          margin: "0 auto 12px",
                          opacity: 0.6,
                          color: "var(--accent)",
                        }}
                      />
                      <h3
                        style={{
                          fontSize: "16px",
                          color: "var(--text)",
                          marginBottom: "6px",
                        }}
                      >
                        Database is empty
                      </h3>
                      <p
                        style={{
                          fontSize: "13px",
                          maxWidth: "440px",
                          margin: "0 auto 18px",
                          lineHeight: "1.5",
                        }}
                      >
                        All files and documents have been permanently deleted
                        from the database. Upload a document or complete a
                        conversion task to populate your library.
                      </p>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <label
                          className="primary"
                          style={{
                            padding: "8px 16px",
                            fontSize: "13px",
                            cursor: "pointer",
                            margin: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <Upload size={15} /> Upload Document
                          <input
                            type="file"
                            multiple
                            style={{ display: "none" }}
                            onChange={handleUploadDocuments}
                          />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "8px 16px",
                            fontSize: "13px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                          onClick={handleRestoreSamples}
                        >
                          <RefreshCw size={14} /> Restore Sample Documents
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    style={{
                      padding: "40px",
                      textAlign: "center",
                      color: "var(--muted)",
                      border: "1px dashed var(--border)",
                      borderRadius: "8px",
                      marginTop: "16px",
                    }}
                  >
                    <FileText
                      size={36}
                      style={{ margin: "0 auto 10px", opacity: 0.5 }}
                    />
                    <h3 style={{ fontSize: "14px", color: "var(--text)" }}>
                      No documents found
                    </h3>
                    <p style={{ fontSize: "11px", marginTop: "4px" }}>
                      {docSearch || docCategory !== "all"
                        ? "No files match your search criteria. Try resetting filters."
                        : "Upload a document or complete a conversion task to populate your library."}
                    </p>
                    {(docSearch || docCategory !== "all") && (
                      <button
                        type="button"
                        className="text-button"
                        style={{ marginTop: "12px", color: "var(--accent)" }}
                        onClick={() => {
                          setDocSearch("")
                          setDocCategory("all")
                        }}
                      >
                        Reset Search &amp; Filters
                      </button>
                    )}
                  </div>
                )
              }

              if (docViewMode === "table") {
                return (
                  <div style={{ overflowX: "auto", marginTop: "12px" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "13.5px",
                        textAlign: "left",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid var(--border)",
                            color: "var(--muted)",
                            fontSize: "12.5px",
                            fontWeight: 650,
                            letterSpacing: "0.02em",
                          }}
                        >
                          <th style={{ padding: "12px 14px" }}>
                            Document Name
                          </th>
                          <th style={{ padding: "12px 14px" }}>Tool Source</th>
                          <th style={{ padding: "12px 14px" }}>Category</th>
                          <th style={{ padding: "12px 14px" }}>Size</th>
                          <th style={{ padding: "12px 14px" }}>Added</th>
                          <th
                            style={{ padding: "12px 14px", textAlign: "right" }}
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayed.map((doc) => (
                          <tr
                            key={doc.id}
                            style={{
                              borderBottom: "1px solid var(--border)",
                              transition: "background 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--surface-hover)"
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent"
                            }}
                          >
                            <td
                              style={{
                                padding: "13px 14px",
                                fontWeight: 550,
                                color: "var(--text)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                }}
                              >
                                <FileText size={18} color="var(--accent)" />
                                <span>{doc.name}</span>
                              </div>
                            </td>
                            <td
                              style={{
                                padding: "13px 14px",
                                color: "var(--muted)",
                                fontSize: "13px",
                              }}
                            >
                              {doc.toolSource}
                            </td>
                            <td style={{ padding: "13px 14px" }}>
                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "3px 8px",
                                  borderRadius: "5px",
                                  background: "rgba(99, 102, 241, 0.15)",
                                  color: "#a5b4fc",
                                  textTransform: "uppercase",
                                  fontWeight: 650,
                                }}
                              >
                                {doc.category}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "13px 14px",
                                color: "var(--muted)",
                                fontSize: "13px",
                              }}
                            >
                              {doc.size}
                            </td>
                            <td
                              style={{
                                padding: "13px 14px",
                                color: "var(--muted)",
                                fontSize: "13px",
                              }}
                            >
                              {doc.time}
                            </td>
                            <td
                              style={{
                                padding: "13px 14px",
                                textAlign: "right",
                              }}
                            >
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: "8px",
                                }}
                              >
                                <button
                                  type="button"
                                  className="text-button"
                                  style={{
                                    padding: "5px 10px",
                                    fontSize: "12.5px",
                                  }}
                                  onClick={() => setPreviewDoc(doc)}
                                  title="Preview Document"
                                >
                                  <Eye size={14} /> View
                                </button>
                                <button
                                  type="button"
                                  className="text-button"
                                  style={{
                                    padding: "5px 10px",
                                    fontSize: "12.5px",
                                  }}
                                  onClick={() => handleDownloadDoc(doc)}
                                  title="Download Document"
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="text-button"
                                  style={{
                                    padding: "5px 10px",
                                    fontSize: "12.5px",
                                    color: "#f87171",
                                  }}
                                  onClick={() => setDeleteConfirmDoc(doc)}
                                  title="Delete Document"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }

              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: "14px",
                    marginTop: "14px",
                  }}
                >
                  {displayed.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        background: "var(--surface-hover)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "9px",
                          }}
                        >
                          <FileText size={20} color="var(--accent)" />
                          <strong
                            style={{
                              fontSize: "13.5px",
                              color: "var(--text)",
                              maxWidth: "160px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={doc.name}
                          >
                            {doc.name}
                          </strong>
                        </div>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "5px",
                            background: "rgba(99, 102, 241, 0.2)",
                            color: "#a5b4fc",
                            textTransform: "uppercase",
                            fontWeight: 650,
                          }}
                        >
                          {doc.category}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: "12.5px",
                          color: "var(--muted)",
                          lineHeight: "1.45",
                        }}
                      >
                        <p style={{ margin: "2px 0" }}>
                          Source: {doc.toolSource}
                        </p>
                        <p style={{ margin: "2px 0" }}>
                          Size: {doc.size} · Added: {doc.time}
                        </p>
                        {doc.contentSnippet && (
                          <p
                            style={{
                              margin: "6px 0 0",
                              fontSize: "11px",
                              color: "var(--text)",
                              fontStyle: "italic",
                              maxHeight: "36px",
                              overflow: "hidden",
                            }}
                          >
                            "{doc.contentSnippet.slice(0, 100)}..."
                          </p>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: "auto",
                          paddingTop: "10px",
                          borderTop: "1px solid var(--border)",
                        }}
                      >
                        <button
                          type="button"
                          className="text-button"
                          style={{ fontSize: "12px", padding: "5px 8px" }}
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <Eye size={13} /> Preview
                        </button>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="text-button"
                            style={{ fontSize: "12px", padding: "5px 8px" }}
                            onClick={() => handleDownloadDoc(doc)}
                            title="Download Document"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            style={{
                              fontSize: "11px",
                              padding: "4px 6px",
                              color: "#f87171",
                            }}
                            onClick={() => setDeleteConfirmDoc(doc)}
                            title="Delete Document"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Document Preview Modal */}
            {previewDoc && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.75)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 9999,
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    maxWidth: "600px",
                    width: "100%",
                    padding: "24px",
                    color: "var(--text)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "16px",
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <FileText size={20} color="var(--accent)" />
                      <h3 style={{ fontSize: "16px", margin: 0 }}>
                        {previewDoc.name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setPreviewDoc(null)}
                      style={{ padding: "4px" }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      marginBottom: "14px",
                    }}
                  >
                    <p style={{ margin: "4px 0" }}>
                      <strong>Source Tool:</strong> {previewDoc.toolSource}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      <strong>Category:</strong>{" "}
                      {previewDoc.category.toUpperCase()}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      <strong>File Size:</strong> {previewDoc.size}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      <strong>Date Added:</strong> {previewDoc.time}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      <strong>Storage:</strong> IndexedDB Persistent Database
                    </p>
                  </div>

                  {previewDoc.dataUrl ? (
                    <div
                      style={{
                        maxHeight: "240px",
                        overflow: "hidden",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        marginBottom: "16px",
                        textAlign: "center",
                      }}
                    >
                      <img
                        src={previewDoc.dataUrl}
                        alt={previewDoc.name}
                        style={{
                          maxWidth: "100%",
                          maxHeight: "240px",
                          objectFit: "contain",
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "16px",
                        background: "var(--bg)",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        fontSize: "12px",
                        lineHeight: "1.6",
                        maxHeight: "180px",
                        overflowY: "auto",
                        marginBottom: "16px",
                        color: "var(--text)",
                      }}
                    >
                      {previewDoc.contentSnippet ||
                        "Binary artifact document. Click download to access full content."}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <button
                      type="button"
                      className="text-button"
                      style={{ color: "#f87171" }}
                      onClick={() => setDeleteConfirmDoc(previewDoc)}
                    >
                      <Trash2 size={14} /> Delete from Database
                    </button>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          if (
                            typeof navigator !== "undefined" &&
                            navigator.clipboard
                          ) {
                            navigator.clipboard.writeText(
                              `Document: ${previewDoc.name} | Size: ${previewDoc.size} | Source: ${previewDoc.toolSource}`,
                            )
                          }
                          notify(
                            "Document info copied to clipboard!",
                            "success",
                          )
                        }}
                      >
                        <Copy size={14} /> Copy Details
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => handleDownloadDoc(previewDoc)}
                      >
                        <Download size={14} /> Download File
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Permanent Document Delete Confirmation Modal */}
            {deleteConfirmDoc && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.75)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10000,
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    maxWidth: "460px",
                    width: "100%",
                    padding: "24px",
                    color: "var(--text)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        background: "rgba(239, 68, 68, 0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ef4444",
                      }}
                    >
                      <Trash2 size={20} />
                    </div>
                    <div>
                      <h3
                        style={{
                          fontSize: "16px",
                          margin: 0,
                          fontWeight: 650,
                        }}
                      >
                        Permanently Delete Document?
                      </h3>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        IndexedDB Database Deletion
                      </span>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: "13.5px",
                      lineHeight: "1.5",
                      color: "var(--muted)",
                      marginBottom: "20px",
                    }}
                  >
                    Are you sure you want to permanently delete{" "}
                    <strong style={{ color: "var(--text)" }}>
                      {deleteConfirmDoc.name}
                    </strong>{" "}
                    from the database? This file and all its data will be
                    completely removed. This action cannot be undone.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                    }}
                  >
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setDeleteConfirmDoc(null)}
                      style={{ padding: "8px 16px", fontSize: "13px" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        background: "#ef4444",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onClick={() => handleDeleteDocument(deleteConfirmDoc)}
                    >
                      <Trash2 size={14} /> Permanently Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Clear Entire Database Confirmation Modal */}
            {showClearConfirm && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.75)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10000,
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    maxWidth: "460px",
                    width: "100%",
                    padding: "24px",
                    color: "var(--text)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        background: "rgba(239, 68, 68, 0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ef4444",
                      }}
                    >
                      <Trash2 size={20} />
                    </div>
                    <div>
                      <h3
                        style={{
                          fontSize: "16px",
                          margin: 0,
                          fontWeight: 650,
                        }}
                      >
                        Clear Entire Database?
                      </h3>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        Permanently delete all files
                      </span>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: "13.5px",
                      lineHeight: "1.5",
                      color: "var(--muted)",
                      marginBottom: "20px",
                    }}
                  >
                    This will permanently erase all{" "}
                    <strong style={{ color: "var(--text)" }}>
                      {sessionDocs.length}
                    </strong>{" "}
                    saved document{sessionDocs.length > 1 ? "s" : ""} from your
                    IndexedDB database. All binary files and previews will be
                    permanently removed. This cannot be undone.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                    }}
                  >
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setShowClearConfirm(false)}
                      style={{ padding: "8px 16px", fontSize: "13px" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        background: "#ef4444",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onClick={handleClearDatabase}
                    >
                      <Trash2 size={14} /> Clear All Documents
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* --- GENERAL TOOL WORKSPACE (FILE, AI, QR) --- */
        <div className="tool-layout">
          <form className="panel input-panel" onSubmit={submit}>
            <h2>
              {tool.id === "qr"
                ? "Configure QR Connection"
                : tool.category === "AI text tools"
                  ? "Input Content & Guidance"
                  : tool.category === "File tools"
                    ? "Add Source Documents"
                    : "Configure Workspace Tool"}
            </h2>

            {/* 1. QR Code Inputs */}
            {tool.id === "qr" ? (
              <>
                <label>
                  Content type
                  <select
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value)
                      setValue("")
                      setExtra("")
                      setQr("")
                    }}
                  >
                    {["URL", "Text", "WhatsApp", "Wi-Fi", "Email"].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {kind === "Wi-Fi"
                    ? "Network name (SSID)"
                    : kind === "WhatsApp"
                      ? "Phone number with country code"
                      : kind === "Email"
                        ? "Email address"
                        : kind === "URL"
                          ? "Website URL"
                          : "Your text"}
                  <textarea
                    required
                    maxLength={2000}
                    value={value}
                    placeholder={
                      kind === "URL"
                        ? "https://example.com"
                        : "Enter your content…"
                    }
                    onChange={(e) => setValue(e.target.value)}
                  />
                </label>
                {["WhatsApp", "Wi-Fi", "Email"].includes(kind) && (
                  <label>
                    {kind === "Wi-Fi"
                      ? "Wi-Fi password (WPA/WPA2)"
                      : kind === "Email"
                        ? "Subject (optional)"
                        : "Message (optional)"}
                    <input
                      type={kind === "Wi-Fi" ? "password" : "text"}
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                    />
                  </label>
                )}
              </>
            ) : tool.category === "AI text tools" ? (
              /* 2. AI Text Tools Inputs */
              <>
                {/* Document Upload Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--card-bg, rgba(255, 255, 255, 0.05))",
                    borderRadius: "8px",
                    border: "1px dashed var(--border)",
                    marginBottom: "12px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--primary, #3b82f6)",
                      margin: 0,
                    }}
                  >
                    <Upload size={15} />
                    <span>
                      {extractingPdf
                        ? "Extracting text from PDF..."
                        : "Load text from file (.txt, .md, .pdf)"}
                    </span>
                    <input
                      type="file"
                      accept=".txt,.text,.md,.csv,.pdf,application/pdf"
                      onChange={handleDocumentUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                  {loadedDocName && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: "var(--badge-bg, rgba(59, 130, 246, 0.15))",
                      }}
                    >
                      <FileText size={12} />
                      <span>{loadedDocName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLoadedDocName("")
                          setValue("")
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tool #26: Summarize Document Options */}
                {tool.id === "summarize" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <label>
                      Length Mode
                      <select
                        value={summaryMode}
                        onChange={(e) => {
                          const m = e.target.value as "sentences" | "percentage"
                          setSummaryMode(m)
                          if (m === "percentage" && summaryLength <= 10) {
                            setSummaryLength(25)
                          } else if (m === "sentences" && summaryLength > 10) {
                            setSummaryLength(3)
                          }
                        }}
                      >
                        <option value="sentences">Sentence Count</option>
                        <option value="percentage">Document Percentage</option>
                      </select>
                    </label>
                    <label>
                      {summaryMode === "percentage"
                        ? "Target Percentage"
                        : "Summary Length"}
                      <select
                        value={summaryLength}
                        onChange={(e) =>
                          setSummaryLength(Number(e.target.value))
                        }
                      >
                        {summaryMode === "percentage" ? (
                          <>
                            <option value={15}>Brief (~15% of doc)</option>
                            <option value={25}>Standard (~25% of doc)</option>
                            <option value={50}>Detailed (~50% of doc)</option>
                          </>
                        ) : (
                          <>
                            <option value={3}>Short (3 key sentences)</option>
                            <option value={5}>
                              Standard (5 key sentences)
                            </option>
                            <option value={10}>
                              Comprehensive (10 key sentences)
                            </option>
                          </>
                        )}
                      </select>
                    </label>
                    <label>
                      Output Format
                      <select
                        value={summaryFormat}
                        onChange={(e) =>
                          setSummaryFormat(e.target.value as any)
                        }
                      >
                        <option value="bullet">Bullet Points</option>
                        <option value="narrative">Executive Paragraph</option>
                        <option value="executive">Full Executive Report</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* Tool #27: Rewrite Content Options */}
                {tool.id === "rewrite" && (
                  <label>
                    Target Tone & Voice
                    <select
                      value={optionA || rewriteTone}
                      onChange={(e) => {
                        setOptionA(e.target.value)
                        setRewriteTone(e.target.value as RewriteTone)
                      }}
                    >
                      <option value="Professional">
                        Professional & Polished
                      </option>
                      <option value="Concise">Concise & Direct</option>
                      <option value="Casual">Casual & Conversational</option>
                      <option value="Academic">Academic & Scholarly</option>
                      <option value="Persuasive">Persuasive & Engaging</option>
                    </select>
                  </label>
                )}

                {/* Tool #28: Translate Text Options */}
                {tool.id === "translate" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr",
                      gap: "8px",
                      alignItems: "end",
                      marginBottom: "12px",
                    }}
                  >
                    <label>
                      Source Language
                      <select
                        value={transSourceLang}
                        onChange={(e) =>
                          setTransSourceLang(e.target.value as any)
                        }
                      >
                        <option value="auto">Auto-Detect</option>
                        <option value="English">English</option>
                        <option value="Spanish">Spanish (Español)</option>
                        <option value="French">French (Français)</option>
                        <option value="German">German (Deutsch)</option>
                        <option value="Italian">Italian (Italiano)</option>
                        <option value="Portuguese">
                          Portuguese (Português)
                        </option>
                        <option value="Chinese">Chinese (中文)</option>
                        <option value="Japanese">Japanese (日本語)</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      title="Swap Languages"
                      onClick={() => {
                        if (transSourceLang !== "auto") {
                          const prevSrc = transSourceLang
                          const prevTgt =
                            optionA as SupportedLanguage || transTargetLang
                          setTransSourceLang(prevTgt)
                          setTransTargetLang(prevSrc)
                          setOptionA(prevSrc)
                        }
                      }}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--card-bg)",
                        cursor: "pointer",
                        marginBottom: "2px",
                      }}
                    >
                      <ArrowLeftRight size={16} />
                    </button>
                    <label>
                      Target Language
                      <select
                        value={optionA || transTargetLang}
                        onChange={(e) => {
                          setOptionA(e.target.value)
                          setTransTargetLang(
                            e.target.value as SupportedLanguage,
                          )
                        }}
                      >
                        <option value="Spanish">Spanish (Español)</option>
                        <option value="French">French (Français)</option>
                        <option value="German">German (Deutsch)</option>
                        <option value="Italian">Italian (Italiano)</option>
                        <option value="Portuguese">
                          Portuguese (Português)
                        </option>
                        <option value="Chinese">Chinese (中文)</option>
                        <option value="Japanese">Japanese (日本語)</option>
                        <option value="English">English</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* Tool #29: Ask Document AI Options */}
                {tool.id === "ask" && (
                  <div style={{ marginBottom: "12px" }}>
                    <label>
                      Question to Ask Document
                      <input
                        required
                        placeholder="e.g. What is the project deadline and key deliverables?"
                        value={askQuestion || extra}
                        onChange={(e) => {
                          setAskQuestion(e.target.value)
                          setExtra(e.target.value)
                        }}
                      />
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                        marginTop: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--muted)",
                          alignSelf: "center",
                        }}
                      >
                        Suggested:
                      </span>
                      {[
                        "What is the main summary?",
                        "What are the deadlines?",
                        "Who leads the team?",
                        "What are the key metrics?",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => {
                            setAskQuestion(prompt)
                            setExtra(prompt)
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            border: "1px solid var(--border)",
                            background:
                              "var(--badge-bg, rgba(255,255,255,0.06))",
                            cursor: "pointer",
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tool #30: Extract Keywords Options */}
                {tool.id === "keywords" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <label>
                      Maximum Keywords
                      <select
                        value={keywordMax}
                        onChange={(e) => setKeywordMax(Number(e.target.value))}
                      >
                        <option value={5}>Top 5 Keywords</option>
                        <option value={10}>Top 10 Keywords (Standard)</option>
                        <option value={15}>Top 15 Keywords</option>
                        <option value={20}>Top 20 Keywords (Detailed)</option>
                      </select>
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "24px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={keywordNgrams}
                        onChange={(e) => setKeywordNgrams(e.target.checked)}
                      />
                      <span>Include 2-word collocations</span>
                    </label>
                  </div>
                )}

                {/* Tool #31: Analyze Sentiment Options */}
                {tool.id === "sentiment" && (
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={sentimentDetailed}
                        onChange={(e) => setSentimentDetailed(e.target.checked)}
                      />
                      <span>
                        Show detailed word-by-word valence ratings & context
                        breakdown
                      </span>
                    </label>
                  </div>
                )}

                {/* Tool #32: Compare Texts Options */}
                {tool.id === "compare" && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      <label>
                        Diff Granularity
                        <select
                          value={compareGranularity}
                          onChange={(e) =>
                            setCompareGranularity(e.target.value as any)
                          }
                        >
                          <option value="lines">
                            Line by Line (Recommended)
                          </option>
                          <option value="words">Word by Word (Detailed)</option>
                          <option value="characters">
                            Character by Character
                          </option>
                        </select>
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "24px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={compareIgnoreWhitespace}
                          onChange={(e) =>
                            setCompareIgnoreWhitespace(e.target.checked)
                          }
                        />
                        <span>Ignore Whitespace Differences</span>
                      </label>
                    </div>
                    <label>
                      Comparison Text (Version B)
                      <textarea
                        rows={5}
                        placeholder="Paste second version of text to compare…"
                        value={extra}
                        onChange={(e) => setExtra(e.target.value)}
                      />
                    </label>
                  </>
                )}

                {/* Tool #33: Generate Email Options */}
                {tool.id === "email" && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginBottom: "8px",
                      }}
                    >
                      <label>
                        Email Purpose
                        <select
                          value={emailPurpose}
                          onChange={(e) =>
                            setEmailPurpose(e.target.value as EmailPurpose)
                          }
                        >
                          <option value="follow-up">Follow-up</option>
                          <option value="proposal">Business Proposal</option>
                          <option value="thank-you">Thank You</option>
                          <option value="inquiry">Inquiry / Question</option>
                          <option value="announcement">Announcement</option>
                          <option value="meeting-request">
                            Meeting Request
                          </option>
                          <option value="status-update">
                            Project Status Update
                          </option>
                          <option value="apology">Formal Apology</option>
                        </select>
                      </label>
                      <label>
                        Tone & Style
                        <select
                          value={emailTone}
                          onChange={(e) =>
                            setEmailTone(e.target.value as EmailTone)
                          }
                        >
                          <option value="professional">
                            Professional & Balanced
                          </option>
                          <option value="friendly">Friendly & Warm</option>
                          <option value="urgent">Urgent & Direct</option>
                          <option value="persuasive">
                            Persuasive & Engaging
                          </option>
                          <option value="concise">Concise & Bulleted</option>
                          <option value="formal">Formal & Traditional</option>
                        </select>
                      </label>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginBottom: "8px",
                      }}
                    >
                      <label>
                        Recipient or Audience
                        <input
                          placeholder="e.g. Sarah Connor / Project Team"
                          value={emailRecipient || optionA}
                          onChange={(e) => {
                            setEmailRecipient(e.target.value)
                            setOptionA(e.target.value)
                          }}
                        />
                      </label>
                      <label>
                        Subject Topic
                        <input
                          placeholder="e.g. Q4 Deliverables & Next Steps"
                          value={emailSubject || extra}
                          onChange={(e) => {
                            setEmailSubject(e.target.value)
                            setExtra(e.target.value)
                          }}
                        />
                      </label>
                    </div>
                    <label style={{ marginBottom: "8px" }}>
                      Call to Action (Optional)
                      <input
                        placeholder="e.g. Please confirm your availability by Friday 5 PM"
                        value={emailCTA}
                        onChange={(e) => setEmailCTA(e.target.value)}
                      />
                    </label>
                  </>
                )}

                <label>
                  {tool.id === "compare"
                    ? "Base Text (Version A)"
                    : tool.id === "email"
                      ? "Key points or notes to include"
                      : "Source Text or Document Content"}
                  <textarea
                    required
                    rows={8}
                    maxLength={50000}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={
                      tool.id === "email"
                        ? "Enter notes or bullet points to synthesize into an email…"
                        : "Enter or paste text, or load a document from file above…"
                    }
                  />
                </label>
              </>
            ) : tool.id === "text-pdf" ? (
              /* 3. Text to PDF */
              <>
                <label>
                  Document title
                  <input
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Untitled document"
                  />
                </label>
                <label>
                  Your text
                  <textarea
                    required
                    rows={10}
                    maxLength={50000}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="A blank page. Endless possibilities."
                  />
                </label>
              </>
            ) : (
              /* 4. File Tools Dropzone & Options */
              <>
                <label
                  className="dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    addFiles(e.dataTransfer.files)
                  }}
                >
                  <Upload size={30} />
                  <strong>Drop your files here</strong>
                  <span>or click to browse files</span>
                  <small>
                    Up to 25 MB each · Private in-browser processing
                  </small>
                  <input
                    type="file"
                    multiple={
                      tool.id === "merge-pdf" ||
                      tool.id === "jpg-to-pdf" ||
                      tool.id === "merge-compress" ||
                      (tool.id === "zip" && zipMode === "create")
                    }
                    accept={getAcceptedFileTypes()}
                    onChange={(e) => {
                      addFiles(e.target.files)
                      e.target.value = ""
                    }}
                  />
                </label>

                {files.length > 0 && (
                  <div className="file-list">
                    {files.map((file, i) => (
                      <div
                        className="file-row"
                        key={`${file.name}-${i}`}
                        draggable={files.length > 1}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move"
                          e.dataTransfer.setData("text/plain", `${i}`)
                          fileDragIndexRef.current = i
                        }}
                        onDragEnter={() => {
                          if (
                            fileDragIndexRef.current === null ||
                            fileDragIndexRef.current === i
                          )
                            return
                          setFiles((prev) => {
                            const copy = [...prev]
                            const [moved] = copy.splice(
                              fileDragIndexRef.current!,
                              1,
                            )
                            copy.splice(i, 0, moved)
                            fileDragIndexRef.current = i
                            return copy
                          })
                        }}
                        onDragEnd={() => {
                          fileDragIndexRef.current = null
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        style={{ cursor: files.length > 1 ? "grab" : "default" }}
                      >
                        {files.length > 1 && (
                          <span
                            title="Grab and move to reorder file"
                            style={{
                              color: "var(--muted)",
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: "grab",
                            }}
                          >
                            <GripVertical size={15} />
                          </span>
                        )}
                        <FileText size={18} />
                        <span>
                          {file.name}
                          <small>{(file.size / 1024).toFixed(1)} KB</small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Preview ${file.name}`}
                          title={`Preview ${file.name}`}
                          onClick={() => setShowPreviewModal(true)}
                        >
                          <Eye size={15} />
                        </button>
                        {files.length > 1 && (
                          <>
                            <button
                              aria-label={`Move ${file.name} up`}
                              type="button"
                              disabled={i === 0}
                              onClick={() =>
                                setFiles((f) => {
                                  const copy = [...f]
                                  ;[copy[i - 1], copy[i]] = [
                                    copy[i],
                                    copy[i - 1],
                                  ]
                                  return copy
                                })
                              }
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              aria-label={`Move ${file.name} down`}
                              type="button"
                              disabled={i === files.length - 1}
                              onClick={() =>
                                setFiles((f) => {
                                  const copy = [...f]
                                  ;[copy[i + 1], copy[i]] = [
                                    copy[i],
                                    copy[i + 1],
                                  ]
                                  return copy
                                })
                              }
                            >
                              <ArrowDown size={15} />
                            </button>
                          </>
                        )}
                        <button
                          aria-label={`Remove ${file.name}`}
                          type="button"
                          onClick={() => {
                            setFiles((f) => f.filter((_, n) => n !== i))
                            setResultState(undefined)
                            setStatus("idle")
                            notify("File removed.")
                          }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Preview & Arrange button for merge/arrange tools */}
                {(tool.id === "merge-pdf" ||
                  tool.id === "jpg-to-pdf" ||
                  tool.id === "merge-compress") &&
                  files.length >= 1 && (
                    <button
                      type="button"
                      className="dpm-trigger-btn"
                      onClick={() => setShowPreviewModal(true)}
                    >
                      <Layers size={15} />
                      Preview &amp; Arrange Order
                      <span className="dpm-trigger-btn__badge">
                        {files.length} file{files.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                  )}

                {tool.id === "rotate-pdf" && (
                  <label style={{ marginTop: "12px" }}>
                    Rotation Angle
                    <select
                      value={optionA || "90"}
                      onChange={(e) => setOptionA(e.target.value)}
                    >
                      <option value="90">90° Clockwise</option>
                      <option value="180">180° Flip (Upside Down)</option>
                      <option value="270">
                        270° Counter-Clockwise (90° CCW)
                      </option>
                    </select>
                  </label>
                )}

                {/* Preview & Arrange button for rotate tool */}
                {tool.id === "rotate-pdf" && files.length >= 1 && (
                  <button
                    type="button"
                    className="dpm-trigger-btn"
                    onClick={() => setShowPreviewModal(true)}
                    style={{ marginTop: "8px" }}
                  >
                    <RotateCw size={15} />
                    Preview Page Rotations
                    <span className="dpm-trigger-btn__badge">
                      {files.length} file{files.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                )}

                {tool.id === "split-pdf" && (
                  <label style={{ marginTop: "12px" }}>
                    Page Range to Extract
                    <input
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                      placeholder="e.g. 1-3, 5 or 2 (or leave empty for all)"
                    />
                    <small
                      style={{
                        color: "var(--muted)",
                        display: "block",
                        marginTop: "4px",
                        fontSize: "11px",
                      }}
                    >
                      Enter comma-separated page numbers or ranges (e.g. "1-3,
                      5"). Leave empty to extract all pages.
                    </small>
                  </label>
                )}

                {/* Visual split points button for split-pdf */}
                {(tool.id === "split-pdf" || tool.id === "split-compress") &&
                  files.length >= 1 && (
                    <button
                      type="button"
                      className="dpm-trigger-btn"
                      onClick={() => setShowPreviewModal(true)}
                    >
                      <Scissors size={15} />
                      Set Split Points Visually
                      <span className="dpm-trigger-btn__badge">
                        {files.length} file{files.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                  )}

                {tool.id === "compress" && (
                  <label style={{ marginTop: "12px" }}>
                    Compression Preset
                    <select
                      value={optionA || "standard"}
                      onChange={(e) => setOptionA(e.target.value)}
                    >
                      <option value="standard">
                        Standard Compression (Balanced Stream Optimization)
                      </option>
                      <option value="high">
                        High Compression (Maximum Stream + Metadata Strip)
                      </option>
                    </select>
                  </label>
                )}

                {tool.id === "edit-pdf" && (
                  <>
                    <label style={{ marginTop: "12px" }}>
                      Annotation Text
                      <input
                        value={extra}
                        onChange={(e) => setExtra(e.target.value)}
                        placeholder="Enter annotation text to stamp on page"
                      />
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <label>
                        Annotation Style
                        <select
                          value={optionA || "note"}
                          onChange={(e) => setOptionA(e.target.value)}
                        >
                          <option value="note">
                            Sticky Note (Pale Yellow)
                          </option>
                          <option value="highlight">
                            Highlight Banner (Translucent)
                          </option>
                          <option value="callout">
                            Callout Box (Indigo Border)
                          </option>
                        </select>
                      </label>
                      <label>
                        Target Page Number
                        <input
                          type="number"
                          min={1}
                          value={optionB || "1"}
                          onChange={(e) => setOptionB(e.target.value)}
                          placeholder="1"
                        />
                      </label>
                    </div>
                  </>
                )}

                {tool.id === "watermark" && (
                  <>
                    <label style={{ marginTop: "12px" }}>
                      Watermark Text
                      <input
                        value={extra}
                        onChange={(e) => setExtra(e.target.value)}
                        placeholder="e.g. CONFIDENTIAL or DRAFT"
                      />
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <label>
                        Watermark Opacity
                        <select
                          value={optionA || "0.35"}
                          onChange={(e) => setOptionA(e.target.value)}
                        >
                          <option value="0.2">20% Subtle</option>
                          <option value="0.35">35% Standard</option>
                          <option value="0.5">50% Medium</option>
                          <option value="0.75">75% High Contrast</option>
                        </select>
                      </label>
                      <label>
                        Rotation Angle
                        <select
                          value={optionB || "45"}
                          onChange={(e) => setOptionB(e.target.value)}
                        >
                          <option value="45">45° Diagonal</option>
                          <option value="0">0° Horizontal</option>
                          <option value="90">90° Vertical</option>
                        </select>
                      </label>
                    </div>
                  </>
                )}

                {tool.id === "sign-pdf" && (
                  <div style={{ marginTop: "14px" }}>
                    <label style={{ marginBottom: "6px", display: "block" }}>
                      Draw Signature Canvas Pad
                    </label>
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "#ffffff",
                        padding: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{ fontSize: "11px", color: "var(--muted)" }}
                          >
                            Ink:
                          </span>
                          {["#0f172a", "#1d4ed8", "#4338ca"].map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`Ink color ${c}`}
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                background: c,
                                border:
                                  sigInkColor === c
                                    ? "2px solid #ffffff"
                                    : "2px solid transparent",
                                outline:
                                  sigInkColor === c
                                    ? "2px solid var(--accent)"
                                    : "none",
                                cursor: "pointer",
                              }}
                              onClick={() => setSigInkColor(c)}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          style={{ fontSize: "11px", padding: "2px 8px" }}
                          onClick={() => {
                            const canvas = sigCanvasRef.current
                            if (canvas) {
                              const ctx = canvas.getContext("2d")
                              ctx?.clearRect(0, 0, canvas.width, canvas.height)
                            }
                            setSigHasDrawn(false)
                            notify("Signature canvas cleared.")
                          }}
                        >
                          Clear Signature
                        </button>
                      </div>
                      <canvas
                        ref={sigCanvasRef}
                        width={360}
                        height={120}
                        style={{
                          width: "100%",
                          height: "120px",
                          background: "#f8fafc",
                          borderRadius: "6px",
                          border: "1px dashed var(--border)",
                          cursor: "crosshair",
                          touchAction: "none",
                        }}
                        onPointerDown={(e) => {
                          isSigDrawingRef.current = true
                          const canvas = sigCanvasRef.current
                          if (!canvas) return
                          const ctx = canvas.getContext("2d")
                          if (!ctx) return
                          const rect = canvas.getBoundingClientRect()
                          const scaleX = canvas.width / rect.width
                          const scaleY = canvas.height / rect.height
                          ctx.beginPath()
                          ctx.moveTo(
                            (e.clientX - rect.left) * scaleX,
                            (e.clientY - rect.top) * scaleY,
                          )
                        }}
                        onPointerMove={(e) => {
                          if (!isSigDrawingRef.current) return
                          const canvas = sigCanvasRef.current
                          if (!canvas) return
                          const ctx = canvas.getContext("2d")
                          if (!ctx) return
                          const rect = canvas.getBoundingClientRect()
                          const scaleX = canvas.width / rect.width
                          const scaleY = canvas.height / rect.height
                          ctx.strokeStyle = sigInkColor
                          ctx.lineWidth = 2.5
                          ctx.lineTo(
                            (e.clientX - rect.left) * scaleX,
                            (e.clientY - rect.top) * scaleY,
                          )
                          ctx.stroke()
                          if (!sigHasDrawn) setSigHasDrawn(true)
                        }}
                        onPointerUp={() => {
                          isSigDrawingRef.current = false
                        }}
                        onPointerLeave={() => {
                          isSigDrawingRef.current = false
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <label>
                        Signer Name (Badge / Typed)
                        <input
                          value={extra}
                          onChange={(e) => setExtra(e.target.value)}
                          placeholder="e.g. Jamie Davis"
                        />
                      </label>
                      <label>
                        Stamp Placement Page
                        <select
                          value={optionA || "last"}
                          onChange={(e) => setOptionA(e.target.value)}
                        >
                          <option value="last">Last Page (Standard)</option>
                          <option value="first">First Page (Cover)</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}

                {tool.id === "password" && (
                  <>
                    <label style={{ marginTop: "12px" }}>
                      Security Action
                      <select
                        value={optionA || "lock"}
                        onChange={(e) => {
                          setOptionA(e.target.value)
                          setExtra("")
                          setOptionB("")
                        }}
                      >
                        <option value="lock">Lock / Protect Document</option>
                        <option value="unlock">
                          Unlock Protected Document
                        </option>
                      </select>
                    </label>
                    {optionA === "unlock" ? (
                      <label style={{ marginTop: "12px" }}>
                        Document Password
                        <input
                          type="password"
                          value={extra}
                          onChange={(e) => setExtra(e.target.value)}
                          placeholder="Enter password to unlock"
                        />
                      </label>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "12px",
                          marginTop: "12px",
                        }}
                      >
                        <label>
                          Protection Password
                          <input
                            type="password"
                            value={extra}
                            onChange={(e) => setExtra(e.target.value)}
                            placeholder="Min 4 characters"
                          />
                        </label>
                        <label>
                          Confirm Password
                          <input
                            type="password"
                            value={optionB}
                            onChange={(e) => setOptionB(e.target.value)}
                            placeholder="Repeat password"
                          />
                        </label>
                      </div>
                    )}
                  </>
                )}

                {/* Milestone 3: Conversion Tool Options Panels */}
                {tool.id === "pdf-to-word" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <label>
                      Output Format
                      <select
                        value={optionA || "docx"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="docx">
                          Word Document (.docx - OpenXML)
                        </option>
                        <option value="doc">
                          Word 97-2003 (.doc - HTML Format)
                        </option>
                        <option value="txt">Plain Formatted Text (.txt)</option>
                      </select>
                    </label>
                    <label>
                      Layout Preservation
                      <select
                        value={optionB || "standard"}
                        onChange={(e) => setOptionB(e.target.value)}
                      >
                        <option value="standard">
                          Standard Flow (Headings & Paragraphs)
                        </option>
                        <option value="clean">
                          Clean Text (Stripped Formatting)
                        </option>
                        <option value="compact">
                          Compact Layout (Dense Spacing)
                        </option>
                      </select>
                    </label>
                  </div>
                )}

                {tool.id === "pdf-to-ppt" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <label>
                      Slide Aspect Ratio
                      <select
                        value={optionA || "16:9"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="16:9">
                          Widescreen 16:9 (Modern 1920×1080)
                        </option>
                        <option value="4:3">
                          Standard 4:3 (Classic 1024×768)
                        </option>
                      </select>
                    </label>
                    <label>
                      Slide Theme
                      <select
                        value={optionB || "fluxkit-dark"}
                        onChange={(e) => setOptionB(e.target.value)}
                      >
                        <option value="fluxkit-dark">
                          FluxKit Dark (#0b0f19)
                        </option>
                        <option value="minimal-white">
                          Minimal Clean White (#ffffff)
                        </option>
                        <option value="corporate-blue">
                          Corporate Slate & Indigo
                        </option>
                      </select>
                    </label>
                  </div>
                )}

                {tool.id === "pdf-to-excel" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <label>
                      Output Format
                      <select
                        value={optionA || "xlsx"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="xlsx">Excel Workbook (.xlsx)</option>
                        <option value="csv">
                          Comma-Separated Values (.csv)
                        </option>
                        <option value="tsv">Tab-Separated Values (.tsv)</option>
                      </select>
                    </label>
                    <label>
                      Table Detection Strategy
                      <select
                        value={optionB || "auto"}
                        onChange={(e) => setOptionB(e.target.value)}
                      >
                        <option value="auto">
                          Auto-detect Tables & Columns
                        </option>
                        <option value="whitespace">
                          Whitespace Column Alignment
                        </option>
                        <option value="lines">Line-by-Line Rows</option>
                      </select>
                    </label>
                  </div>
                )}

                {tool.id === "word-to-pdf" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <label>
                      Page Margins
                      <select
                        value={optionA || "standard"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="standard">
                          Standard Margins (1 inch / 72pt)
                        </option>
                        <option value="compact">
                          Narrow Margins (0.5 inch / 36pt)
                        </option>
                        <option value="spacious">
                          Wide Margins (1.5 inch / 108pt)
                        </option>
                      </select>
                    </label>
                    <label>
                      Font Family
                      <select
                        value={optionB || "helvetica"}
                        onChange={(e) => setOptionB(e.target.value)}
                      >
                        <option value="helvetica">
                          Helvetica (Modern Sans-Serif)
                        </option>
                        <option value="times">
                          Times Roman (Classic Serif)
                        </option>
                        <option value="courier">
                          Courier (Monospaced Technical)
                        </option>
                      </select>
                    </label>
                  </div>
                )}

                {tool.id === "ppt-to-pdf" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <label>
                      Slide Orientation
                      <select
                        value={optionA || "landscape-16-9"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="landscape-16-9">
                          Landscape 16:9 Widescreen (842 × 474 pt)
                        </option>
                        <option value="landscape-4-3">
                          Landscape 4:3 Standard (792 × 595 pt)
                        </option>
                        <option value="portrait">
                          Portrait Handout (595 × 842 pt)
                        </option>
                      </select>
                    </label>
                    <label>
                      Slides Per Page
                      <select
                        value={optionB || "1"}
                        onChange={(e) => setOptionB(e.target.value)}
                      >
                        <option value="1">1 Slide Per Page (Full Deck)</option>
                        <option value="2">
                          2 Slides Per Page (Handout View)
                        </option>
                        <option value="4">
                          4 Slides Per Page (Grid Overview)
                        </option>
                      </select>
                    </label>
                  </div>
                )}

                {tool.id === "excel-to-pdf" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <label>
                      Page Orientation
                      <select
                        value={optionA || "landscape"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="landscape">
                          Landscape (Recommended for tables)
                        </option>
                        <option value="portrait">
                          Portrait (Vertical layout)
                        </option>
                      </select>
                    </label>
                    <label>
                      Table Grid Styling
                      <select
                        value={optionB || "grid-indigo"}
                        onChange={(e) => setOptionB(e.target.value)}
                      >
                        <option value="grid-indigo">
                          Grid + Indigo Headers (#4f46e5)
                        </option>
                        <option value="zebra">Alternating Zebra Stripes</option>
                        <option value="minimal">
                          Clean Minimalist (Light Borders)
                        </option>
                      </select>
                    </label>
                  </div>
                )}

                {tool.id === "pdf-to-jpg" && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <label>
                        Image Quality & Resolution
                        <select
                          value={optionA || "high"}
                          onChange={(e) => setOptionA(e.target.value)}
                        >
                          <option value="high">
                            High Resolution (300 DPI - Print Quality)
                          </option>
                          <option value="standard">
                            Standard Web (150 DPI - Balanced Size)
                          </option>
                          <option value="compact">
                            Compact Preview (72 DPI - Fast Sharing)
                          </option>
                        </select>
                      </label>
                      <label>
                        Page Selection
                        <select
                          value={optionB || "first"}
                          onChange={(e) => setOptionB(e.target.value)}
                        >
                          <option value="first">
                            First Page Only (Single JPG)
                          </option>
                          <option value="all">All Pages (Bundled JPGs)</option>
                          <option value="custom">Custom Page Number</option>
                        </select>
                      </label>
                    </div>
                    {optionB === "custom" && (
                      <label style={{ marginTop: "12px" }}>
                        Target Page Number
                        <input
                          type="number"
                          min={1}
                          value={extra || "1"}
                          onChange={(e) => setExtra(e.target.value)}
                          placeholder="1"
                        />
                      </label>
                    )}
                  </>
                )}

                {tool.id === "jpg-to-pdf" && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <label>
                        Page Orientation
                        <select
                          value={optionA || "auto"}
                          onChange={(e) => setOptionA(e.target.value)}
                        >
                          <option value="auto">
                            Auto-detect (Match image ratio)
                          </option>
                          <option value="portrait">
                            Fit to Portrait (Standard Letter)
                          </option>
                          <option value="landscape">Fit to Landscape</option>
                        </select>
                      </label>
                      <label>
                        Margins & Scaling
                        <select
                          value={optionB || "fit-margins"}
                          onChange={(e) => setOptionB(e.target.value)}
                        >
                          <option value="fit-margins">
                            Fit to Page with 0.5 in Margins
                          </option>
                          <option value="no-margins">
                            Full Bleed (0 Margins - Exact Image)
                          </option>
                          <option value="center-original">
                            Center at 1:1 Scale
                          </option>
                        </select>
                      </label>
                    </div>
                    {files.length > 1 && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--muted)",
                          marginTop: "8px",
                        }}
                      >
                        Tip: Use the arrow buttons on each file to arrange page
                        order in your PDF.
                      </div>
                    )}
                  </>
                )}

                {tool.id === "zip" && (
                  <>
                    <div
                      style={{ display: "flex", gap: "8px", marginTop: "12px" }}
                    >
                      <button
                        type="button"
                        className={zipMode === "create" ? "primary" : ""}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          fontSize: "13px",
                        }}
                        onClick={() => setZipMode("create")}
                      >
                        Create Archive
                      </button>
                      <button
                        type="button"
                        className={zipMode === "extract" ? "primary" : ""}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          fontSize: "13px",
                        }}
                        onClick={() => setZipMode("extract")}
                      >
                        Extract Archive
                      </button>
                    </div>

                    {zipMode === "create" && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "12px",
                          marginTop: "12px",
                        }}
                      >
                        <label>
                          Archive Filename
                          <input
                            value={extra}
                            onChange={(e) => setExtra(e.target.value)}
                            placeholder="archive.zip"
                          />
                        </label>
                        <label>
                          Compression Level
                          <select
                            value={optionA || "standard"}
                            onChange={(e) => setOptionA(e.target.value)}
                          >
                            <option value="standard">
                              Standard (Deflate Level 6 - Balanced)
                            </option>
                            <option value="maximum">
                              Maximum (Deflate Level 9 - Best Compression)
                            </option>
                            <option value="store">
                              Store (No Compression - Instant Packaging)
                            </option>
                          </select>
                        </label>
                      </div>
                    )}
                  </>
                )}

                {tool.id === "ocr" && (
                  <>
                    <label style={{ marginTop: "12px" }}>
                      Recognition Language & Script
                      <select
                        value={optionA || "en"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="en">
                          English & Latin Characters (Standard)
                        </option>
                        <option value="es">Spanish (Español)</option>
                        <option value="fr">French (Français)</option>
                        <option value="de">German (Deutsch)</option>
                        <option value="zh">
                          Chinese (Simplified & Traditional)
                        </option>
                        <option value="ja">
                          Japanese (Hiragana, Katakana & Kanji)
                        </option>
                        <option value="auto">
                          Auto-detect document structure
                        </option>
                      </select>
                    </label>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        marginTop: "12px",
                        padding: "10px",
                        background: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "6px",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={ocrContrast}
                          onChange={(e) => setOcrContrast(e.target.checked)}
                        />
                        <span>
                          Auto Contrast Enhancement & Otsu Binarization
                        </span>
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={ocrInvert}
                          onChange={(e) => setOcrInvert(e.target.checked)}
                        />
                        <span>Invert Colors / Dark Mode Scan</span>
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={ocrClean}
                          onChange={(e) => setOcrClean(e.target.checked)}
                        />
                        <span>Clean Background Speckle & Noise</span>
                      </label>
                    </div>
                  </>
                )}

                {tool.id === "convert" && (
                  <>
                    {files[0] && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                          marginTop: "8px",
                        }}
                      >
                        Detected Source:{" "}
                        <strong style={{ color: "var(--text)" }}>
                          {detectFileType(files[0]).toUpperCase()}
                        </strong>
                      </div>
                    )}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <label>
                        Target Format
                        <select
                          value={
                            optionA ||
                            (files[0]?.name.toLowerCase().endsWith(".pdf")
                              ? "docx"
                              : "pdf")
                          }
                          onChange={(e) => setOptionA(e.target.value)}
                        >
                          {!files[0] ||
                          files[0].name.toLowerCase().endsWith(".pdf") ? (
                            <>
                              <option value="docx">Word (.docx)</option>
                              <option value="pptx">PowerPoint (.pptx)</option>
                              <option value="xlsx">Excel (.xlsx)</option>
                              <option value="jpg">JPEG (.jpg)</option>
                              <option value="txt">Plain Text (.txt)</option>
                            </>
                          ) : (
                            <option value="pdf">PDF Document (.pdf)</option>
                          )}
                        </select>
                      </label>
                      <label>
                        Conversion Quality
                        <select
                          value={optionB || "high"}
                          onChange={(e) => setOptionB(e.target.value)}
                        >
                          <option value="high">
                            High Quality (Preserve typography & layout)
                          </option>
                          <option value="balanced">
                            Balanced (Optimized for sharing)
                          </option>
                          <option value="compact">
                            Compact (Minimal file size)
                          </option>
                        </select>
                      </label>
                    </div>
                  </>
                )}

                {tool.id === "convert-compress" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <label>
                      Target Format
                      <select
                        value={optionA || "pdf"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="pdf">PDF Document (.pdf)</option>
                        <option value="docx">Word Document (.docx)</option>
                        <option value="jpg">High-Res JPEG (.jpg)</option>
                      </select>
                    </label>
                    <label>
                      Compression Profile
                      <select
                        value={optionB || "standard"}
                        onChange={(e) => setOptionB(e.target.value)}
                      >
                        <option value="standard">
                          Recommended (Balanced - up to 50% savings)
                        </option>
                        <option value="extreme">
                          Extreme (Maximum size reduction)
                        </option>
                        <option value="low">
                          Low (Lossless stream optimization)
                        </option>
                      </select>
                    </label>
                  </div>
                )}

                {tool.id === "merge-compress" && (
                  <div style={{ marginTop: "12px" }}>
                    <label>
                      Compression Profile
                      <select
                        value={optionA || "standard"}
                        onChange={(e) => setOptionA(e.target.value)}
                      >
                        <option value="standard">
                          Recommended (Balanced 50% reduction)
                        </option>
                        <option value="extreme">
                          Extreme (Aggressive stream optimization)
                        </option>
                        <option value="low">Low (Light optimization)</option>
                      </select>
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "12px",
                        marginTop: "10px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={stripMeta}
                        onChange={(e) => setStripMeta(e.target.checked)}
                      />
                      <span>
                        Strip PDF metadata (Author, Producer, Creation Date) for
                        extra compression & privacy
                      </span>
                    </label>
                    {files.length > 1 && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--muted)",
                          marginTop: "8px",
                        }}
                      >
                        Tip: Use the arrow buttons on each file above to arrange
                        merge order.
                      </div>
                    )}
                  </div>
                )}

                {tool.id === "split-compress" && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <label>
                        Extract Mode
                        <select
                          value={optionA || "ranges"}
                          onChange={(e) => setOptionA(e.target.value)}
                        >
                          <option value="ranges">Selected Page Ranges</option>
                          <option value="all">
                            Split All Pages into Compressed Archive
                          </option>
                        </select>
                      </label>
                      <label>
                        Compression Profile
                        <select
                          value={optionB || "standard"}
                          onChange={(e) => setOptionB(e.target.value)}
                        >
                          <option value="standard">
                            Recommended Compression
                          </option>
                          <option value="extreme">Extreme Compression</option>
                          <option value="low">Low Compression</option>
                        </select>
                      </label>
                    </div>

                    {optionA !== "all" && (
                      <label style={{ marginTop: "12px" }}>
                        Page Ranges
                        <input
                          value={extra}
                          onChange={(e) => setExtra(e.target.value)}
                          placeholder="e.g. 1-5, 8, 11-14"
                        />
                        <small
                          style={{
                            color: "var(--muted)",
                            fontSize: "11px",
                            display: "block",
                            marginTop: "4px",
                          }}
                        >
                          Specify individual pages (e.g. 1, 3) or ranges (e.g.
                          1-5).
                        </small>
                      </label>
                    )}
                  </>
                )}
              </>
            )}

            {error && (
              <div className="error" role="alert" style={{ marginTop: "12px" }}>
                {error}
              </div>
            )}

            <button
              className="primary"
              disabled={status === "processing"}
              style={{ marginTop: "18px", width: "100%" }}
            >
              {status === "processing" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <tool.icon size={17} />
              )}{" "}
              {status === "processing"
                ? pipelineStep
                  ? pipelineStep.label
                  : "Processing…"
                : tool.id === "qr"
                  ? "Generate QR Code"
                  : tool.id === "merge-pdf"
                    ? "Merge PDFs"
                    : tool.id === "rotate-pdf"
                      ? "Rotate PDF"
                      : tool.id === "split-pdf"
                        ? "Split PDF"
                        : tool.id === "compress"
                          ? "Compress PDF"
                          : tool.id === "edit-pdf"
                            ? "Apply Annotation"
                            : tool.id === "watermark"
                              ? "Add Watermark"
                              : tool.id === "sign-pdf"
                                ? "Stamp Signature on PDF"
                                : tool.id === "password"
                                  ? optionA === "unlock"
                                    ? "Unlock Document"
                                    : "Secure Document"
                                  : tool.id === "text-pdf"
                                    ? "Generate PDF"
                                    : tool.id === "pdf-to-word"
                                      ? "Convert to Word"
                                      : tool.id === "pdf-to-ppt"
                                        ? "Convert to PowerPoint"
                                        : tool.id === "pdf-to-excel"
                                          ? "Convert to Excel"
                                          : tool.id === "word-to-pdf" ||
                                              tool.id === "ppt-to-pdf" ||
                                              tool.id === "excel-to-pdf" ||
                                              tool.id === "jpg-to-pdf"
                                            ? "Convert to PDF"
                                            : tool.id === "pdf-to-jpg"
                                              ? "Convert to JPG"
                                              : tool.id === "zip"
                                                ? zipMode === "extract"
                                                  ? "Extract ZIP Files"
                                                  : "Create ZIP Archive"
                                                : tool.id === "ocr"
                                                  ? "Scan & Extract Text"
                                                  : tool.id === "convert"
                                                    ? "Convert File"
                                                    : tool.id ===
                                                        "convert-compress"
                                                      ? "Convert & Compress"
                                                      : tool.id ===
                                                          "merge-compress"
                                                        ? "Merge & Compress PDFs"
                                                        : tool.id ===
                                                            "split-compress"
                                                          ? "Split & Compress PDF"
                                                          : tool.id ===
                                                              "summarize"
                                                            ? "Summarize Document"
                                                            : tool.id ===
                                                                "rewrite"
                                                              ? "Rewrite Content"
                                                              : tool.id ===
                                                                  "translate"
                                                                ? "Translate Text"
                                                                : tool.id ===
                                                                    "ask"
                                                                  ? "Ask Document AI"
                                                                  : tool.id ===
                                                                      "keywords"
                                                                    ? "Extract Keywords"
                                                                    : tool.id ===
                                                                        "sentiment"
                                                                      ? "Analyze Sentiment"
                                                                      : tool.id ===
                                                                          "compare"
                                                                        ? "Compare Texts"
                                                                        : tool.id ===
                                                                            "email"
                                                                          ? "Generate Email"
                                                                          : `Run ${tool.name}`}
            </button>

            {tool.id === "qr" && (
              <button
                type="button"
                className="text-button"
                style={{
                  marginTop: "10px",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  fontSize: "13px",
                  padding: "9px 12px",
                  border: "1px dashed var(--border)",
                  borderRadius: "8px",
                  color: "var(--accent)",
                  background: "var(--surface-hover)",
                }}
                onClick={() => {
                  let content = value.trim() || "https://fluxkit.app"
                  if (
                    kind === "URL" &&
                    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(content)
                  ) {
                    content = `https://${content}`
                  }
                  setRawQrPayload(content)
                  setShowQRStudio(true)
                }}
              >
                <Sparkles size={15} /> Customize Design &amp; Colors (QR Studio)
              </button>
            )}

            <div className="local-note">
              <ShieldCheck size={14} /> Processed locally in your browser. No
              upload required.
            </div>
          </form>

          {/* --- RESULTS PANEL --- */}
          <section className="panel result-panel" aria-live="polite">
            <div className="section-heading">
              <h2>Your result</h2>
              {status === "completed" && (
                <span className="live-badge">
                  <Check size={12} /> Ready
                </span>
              )}
            </div>

            {textOutput ? (
              <div className="result-ready">
                {/* --- Tool-Specific Visual Cards --- */}
                {tool.id === "summarize" && aiSummarizeResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                        marginBottom: "6px",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#10b981",
                          fontWeight: 600,
                        }}
                      >
                        Reduced by {aiSummarizeResult.reductionPercentage}%
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                        {aiSummarizeResult.originalWordCount} →{" "}
                        {aiSummarizeResult.summaryWordCount} words (
                        {aiSummarizeResult.summarySentenceCount} sentences)
                      </span>
                    </div>
                    {aiSummarizeResult.keyThemes.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                          marginTop: "6px",
                        }}
                      >
                        <span
                          style={{ fontSize: "11px", color: "var(--muted)" }}
                        >
                          Themes:
                        </span>
                        {aiSummarizeResult.keyThemes.map((theme, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: "11px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background:
                                "var(--badge-bg, rgba(255,255,255,0.06))",
                            }}
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tool.id === "rewrite" && aiRewriteResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "12px",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      Tone: {aiRewriteResult.tone}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                      {aiRewriteResult.replacementsCount} adjustments ·{" "}
                      {aiRewriteResult.originalWordCount} →{" "}
                      {aiRewriteResult.newWordCount} words
                    </span>
                  </div>
                )}

                {tool.id === "translate" && aiTranslationResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "12px",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {aiTranslationResult.sourceLanguage} →{" "}
                      {aiTranslationResult.targetLanguage}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                      {aiTranslationResult.coveragePercentage}% matched ·{" "}
                      {aiTranslationResult.wordCount} words
                    </span>
                  </div>
                )}

                {tool.id === "sentiment" && aiSentimentResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background:
                            aiSentimentResult.polarity === "Positive"
                              ? "rgba(16, 185, 129, 0.2)"
                              : aiSentimentResult.polarity === "Negative"
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(107, 114, 128, 0.2)",
                          color:
                            aiSentimentResult.polarity === "Positive"
                              ? "#10b981"
                              : aiSentimentResult.polarity === "Negative"
                                ? "#ef4444"
                                : "#9ca3af",
                        }}
                      >
                        {aiSentimentResult.polarity.toUpperCase()} (
                        {aiSentimentResult.compound.toFixed(2)})
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {aiSentimentResult.mood}
                      </span>
                    </div>

                    {/* Horizontal Valence Gauge (-1.00 to +1.00) */}
                    <div
                      style={{
                        position: "relative",
                        height: "8px",
                        background:
                          "linear-gradient(to right, #ef4444, #9ca3af, #10b981)",
                        borderRadius: "4px",
                        margin: "14px 0 6px",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: "-4px",
                          left: `${Math.max(2, Math.min(98, ((aiSentimentResult.compound + 1) / 2) * 100))}%`,
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#fff",
                          border: "2px solid #0f172a",
                          transform: "translateX(-50%)",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "10px",
                        color: "var(--muted)",
                      }}
                    >
                      <span>-1.00 (Negative)</span>
                      <span>0.00 (Neutral)</span>
                      <span>+1.00 (Positive)</span>
                    </div>

                    {/* Breakdown Stats */}
                    {aiSentimentResult.breakdown && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "11px",
                          color: "var(--muted)",
                          marginTop: "8px",
                          paddingTop: "8px",
                          borderTop: "1px solid var(--border)",
                        }}
                      >
                        <span>
                          Positive: {aiSentimentResult.breakdown.positive}%
                        </span>
                        <span>
                          Neutral: {aiSentimentResult.breakdown.neutral}%
                        </span>
                        <span>
                          Negative: {aiSentimentResult.breakdown.negative}%
                        </span>
                        <span>Confidence: {aiSentimentResult.confidence}%</span>
                      </div>
                    )}
                  </div>
                )}

                {tool.id === "keywords" && aiKeywordResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        fontSize: "11px",
                        color: "var(--muted)",
                        marginBottom: "8px",
                      }}
                    >
                      <span>Words: {aiKeywordResult.totalWords}</span>
                      <span>•</span>
                      <span>
                        Reading Time: ~{aiKeywordResult.readingTimeMinutes} min
                      </span>
                      <span>•</span>
                      <span>Diversity: {aiKeywordResult.lexicalDiversity}</span>
                    </div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                    >
                      {aiKeywordResult.keywords.map((k) => (
                        <span
                          key={k.rank + k.term}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background:
                              "var(--badge-bg, rgba(59, 130, 246, 0.15))",
                            color: "var(--primary, #3b82f6)",
                            fontWeight: 500,
                          }}
                        >
                          #{k.rank} {k.term} ({k.frequency}x)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {tool.id === "ask" && aiAskResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(59, 130, 246, 0.08))",
                      border: "1px solid var(--primary, #3b82f6)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          color: "var(--primary, #3b82f6)",
                        }}
                      >
                        Direct Answer • Confidence:{" "}
                        {aiAskResult.confidenceScore}% (
                        {aiAskResult.confidenceRating})
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        lineHeight: "1.5",
                        marginBottom: "8px",
                      }}
                    >
                      "{aiAskResult.primaryAnswer}"
                    </div>
                    {aiAskResult.topPassages && aiAskResult.topPassages[0] && (
                      <div
                        style={{
                          marginTop: "8px",
                          paddingTop: "8px",
                          borderTop: "1px solid rgba(59, 130, 246, 0.2)",
                          fontSize: "11px",
                          color: "var(--muted)",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          Source Citation (Passage{" "}
                          {aiAskResult.topPassages[0].paragraphNumber}):{" "}
                        </span>
                        <span>"{aiAskResult.topPassages[0].text}"</span>
                        {aiAskResult.topPassages[0].matchedTerms.length > 0 && (
                          <div
                            style={{
                              marginTop: "4px",
                              display: "flex",
                              gap: "4px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={{ fontSize: "10px" }}>Key Terms:</span>
                            {aiAskResult.topPassages[0].matchedTerms.map(
                              (term, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: "10px",
                                    padding: "1px 5px",
                                    borderRadius: "4px",
                                    background: "rgba(59, 130, 246, 0.15)",
                                  }}
                                >
                                  {term}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {tool.id === "compare" && aiCompareResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background:
                            aiCompareResult.stats.similarityPercentage >= 80
                              ? "rgba(16, 185, 129, 0.15)"
                              : aiCompareResult.stats.similarityPercentage >= 40
                                ? "rgba(245, 158, 11, 0.15)"
                                : "rgba(239, 68, 68, 0.15)",
                          color:
                            aiCompareResult.stats.similarityPercentage >= 80
                              ? "#10b981"
                              : aiCompareResult.stats.similarityPercentage >= 40
                                ? "#f59e0b"
                                : "#ef4444",
                          fontWeight: 600,
                        }}
                      >
                        {aiCompareResult.stats.similarityPercentage}% Similarity
                      </span>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          fontSize: "11px",
                        }}
                      >
                        <span style={{ color: "#10b981", fontWeight: 600 }}>
                          +{aiCompareResult.stats.additions} Additions
                        </span>
                        <span style={{ color: "#ef4444", fontWeight: 600 }}>
                          -{aiCompareResult.stats.deletions} Deletions
                        </span>
                        <span style={{ color: "var(--muted)" }}>
                          ={aiCompareResult.stats.unchanged} Unchanged
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {tool.id === "email" && aiEmailResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--muted)" }}>
                        To: {aiEmailResult.recipient}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(aiEmailResult.subject)
                          notify("Subject copied to clipboard!", "success")
                        }}
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                          background: "var(--badge-bg)",
                          cursor: "pointer",
                        }}
                      >
                        Copy Subject
                      </button>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>
                      Subject: {aiEmailResult.subject}
                    </div>
                  </div>
                )}

                {/* Standard Full Formatted Output Block */}
                <div
                  style={{
                    textAlign: "left",
                    width: "100%",
                    maxHeight: "360px",
                    overflowY: "auto",
                    background: "var(--bg)",
                    padding: "16px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    lineHeight: "1.7",
                  }}
                >
                  {textOutput}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginTop: "14px",
                    width: "100%",
                  }}
                >
                  <button
                    type="button"
                    className="primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      navigator.clipboard?.writeText(textOutput)
                      notify("Copied to clipboard!", "success")
                    }}
                  >
                    <Copy size={16} /> Copy Text
                  </button>
                  <button
                    type="button"
                    className="primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const blob = new Blob([textOutput], {
                        type: "text/plain;charset=utf-8",
                      })
                      download({ name: `${tool.id}-output.txt`, blob })
                      notify("Downloaded text file.", "success")
                    }}
                  >
                    <Download size={16} /> Download
                  </button>
                </div>
              </div>
            ) : qr ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <img className="qr-result" src={qr} alt="Generated QR code" />
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    justifyContent: "center",
                    marginTop: "16px",
                    width: "100%",
                  }}
                >
                  <a className="primary" href={qr} download="fluxkit-qr.png">
                    <Download size={16} /> Download PNG
                  </a>
                  <button
                    type="button"
                    className="primary"
                    style={{
                      background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                      borderColor: "transparent",
                      boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      let content =
                        rawQrPayload || value.trim() || "https://fluxkit.app"
                      if (
                        kind === "URL" &&
                        !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(content)
                      ) {
                        content = `https://${content}`
                      }
                      setRawQrPayload(content)
                      setShowQRStudio(true)
                    }}
                  >
                    <Sparkles size={16} /> Customize QR Code
                  </button>
                </div>
              </div>
            ) : tool.id === "ocr" && (ocrResult || (result && textOutput)) ? (
              <div
                className="result-ready"
                style={{ width: "100%", textAlign: "left" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#10b981",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {Math.round((ocrResult?.confidence ?? 0.95) * 100)}%
                    Confidence · {ocrResult?.sourceType || "optical scan"}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                    {ocrResult?.wordCount ??
                      textOutput.split(/\s+/).filter(Boolean).length}{" "}
                    words · {ocrResult?.characterCount ?? textOutput.length}{" "}
                    characters
                  </span>
                </div>
                <textarea
                  rows={10}
                  style={{
                    width: "100%",
                    fontFamily: "monospace",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    padding: "10px",
                    borderRadius: "6px",
                    background: "rgba(0, 0, 0, 0.2)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    resize: "vertical",
                  }}
                  value={textOutput}
                  onChange={(e) => setTextOutput(e.target.value)}
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    type="button"
                    style={{ flex: 1, padding: "8px 12px", fontSize: "13px" }}
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(textOutput)
                        setCopiedText(true)
                        notify.success("OCR text copied to clipboard.")
                        setTimeout(() => setCopiedText(false), 2000)
                      }
                    }}
                  >
                    <Copy size={16} /> {copiedText ? "Copied!" : "Copy Text"}
                  </button>
                  {result && (
                    <button
                      type="button"
                      className="primary"
                      style={{ flex: 1, padding: "8px 12px", fontSize: "13px" }}
                      onClick={() => download(result)}
                    >
                      <Download size={16} /> Download TXT
                    </button>
                  )}
                </div>
              </div>
            ) : tool.id === "zip" &&
              zipMode === "extract" &&
              extractedFiles.length > 0 ? (
              <div className="result-ready" style={{ width: "100%" }}>
                <h3>Extracted Archive ({extractedFiles.length} files)</h3>
                <div
                  className="file-list"
                  style={{ width: "100%", marginTop: "12px" }}
                >
                  {extractedFiles.map((item, idx) => (
                    <div
                      className="file-row"
                      key={`${item.name}-${idx}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <FileText size={18} />
                        <span>
                          {item.name}
                          <small>{(item.size / 1024).toFixed(1)} KB</small>
                        </span>
                      </div>
                      <button
                        type="button"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() =>
                          download({
                            name: item.name.split("/").pop() || item.name,
                            blob: item.blob,
                          })
                        }
                      >
                        <Download size={12} /> Save
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : result ? (
              <div className="result-ready">
                <FileText size={48} />
                <h3>Your file is ready</h3>
                <p>{result.name}</p>

                {result.pieces && result.pieces.length > 1 && (
                  <div
                    style={{
                      width: "100%",
                      margin: "12px 0",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <strong style={{ fontSize: "13px" }}>
                        Split Parts ({result.pieces.length} files)
                      </strong>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--muted)",
                        }}
                      >
                        Download parts individually or as combined
                      </span>
                    </div>
                    <div
                      className="file-list"
                      style={{
                        maxHeight: "220px",
                        overflowY: "auto",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "4px 10px",
                        background: "var(--bg)",
                      }}
                    >
                      {result.pieces.map((piece, pIdx) => (
                        <div
                          className="file-row"
                          key={`${piece.name}-${pIdx}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              minWidth: 0,
                            }}
                          >
                            <FileText size={16} />
                            <span
                              style={{
                                fontSize: "12px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {piece.name}
                              <small
                                style={{
                                  display: "block",
                                  fontSize: "10px",
                                  color: "var(--muted)",
                                }}
                              >
                                {piece.label || `Part ${pIdx + 1}`} ·{" "}
                                {(piece.blob.size / 1024).toFixed(1)} KB
                              </small>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => download(piece)}
                            style={{
                              padding: "4px 8px",
                              fontSize: "11px",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              flexShrink: 0,
                            }}
                          >
                            <Download size={12} /> Save
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pipelineMetrics ? (
                  <div
                    className="pipeline-stats-badge"
                    style={{
                      marginBottom: "12px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      color: "var(--text)",
                      fontSize: "12px",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <strong style={{ color: "#10b981" }}>
                        Pipeline Complete
                      </strong>
                      <span style={{ fontWeight: 700, color: "#10b981" }}>
                        Saved {pipelineMetrics.savedPercentage}%
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        color: "var(--muted)",
                        fontSize: "11px",
                      }}
                    >
                      <span>
                        Original:{" "}
                        {(pipelineMetrics.originalSize / 1024).toFixed(1)} KB
                      </span>
                      {pipelineMetrics.intermediateSize && (
                        <>
                          <span>&rarr;</span>
                          <span>
                            Stage 1:{" "}
                            {(pipelineMetrics.intermediateSize / 1024).toFixed(
                              1,
                            )}{" "}
                            KB
                          </span>
                        </>
                      )}
                      <span>&rarr;</span>
                      <strong style={{ color: "var(--text)" }}>
                        Final: {(pipelineMetrics.finalSize / 1024).toFixed(1)}{" "}
                        KB
                      </strong>
                    </div>
                  </div>
                ) : tool.id === "compress" && files[0] ? (
                  <div
                    style={{
                      marginBottom: "12px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      fontSize: "12px",
                      color: "#10b981",
                      textAlign: "center",
                    }}
                  >
                    <strong>Optimization complete:</strong>{" "}
                    {(files[0].size / 1024).toFixed(1)} KB &rarr;{" "}
                    {(result.blob.size / 1024).toFixed(1)} KB (
                    {Math.max(
                      0,
                      Math.round((1 - result.blob.size / files[0].size) * 100),
                    )}
                    % space saved)
                  </div>
                ) : null}
                <button className="primary" onClick={() => download(result)}>
                  <Download size={16} /> Download File
                </button>
              </div>
            ) : tool.id === "documents" && sessionDocs.length > 0 ? (
              <div className="result-ready" style={{ width: "100%" }}>
                <h3>Session Documents ({sessionDocs.length})</h3>
                <div
                  className="file-list"
                  style={{ width: "100%", marginTop: "12px" }}
                >
                  {sessionDocs.map((doc, idx) => (
                    <div className="file-row" key={`${doc.name}-${idx}`}>
                      <FileText size={18} />
                      <span>
                        {doc.name}
                        <small>
                          {doc.size} · {doc.time}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-result">
                <div className="empty-icon">
                  <tool.icon size={28} />
                </div>
                <h3>A little input. A great result.</h3>
                <p>
                  Your {tool.id === "qr" ? "QR code" : "document"} will appear
                  here when it’s ready.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Document Preview & Arrange Modal */}
      {showPreviewModal && files.length > 0 && (
        <DocumentPreviewModal
          mode={previewModalMode}
          files={files}
          onClose={() => setShowPreviewModal(false)}
          onConfirm={async (modalResult) => {
            if (modalResult.orderedFiles) setFiles(modalResult.orderedFiles)
            if (modalResult.pageRanges) setExtra(modalResult.pageRanges)
            if (modalResult.rotations) {
              const degrees = Object.values(modalResult.rotations)
              if (degrees.length > 0) {
                const dominant = degrees[0]
                setOptionA(String(dominant))
              }
            }
            if (
              modalResult.orderedPages &&
              files[0] &&
              files[0].type === "application/pdf"
            ) {
              try {
                const reordered = await reorderPDFPages(
                  files[0],
                  modalResult.orderedPages,
                )
                setFiles([reordered])
                notify("Page arrangement applied to document.", "success")
              } catch {
                // Keep file as is if reorder fails
              }
            }
          }}
        />
      )}

      {/* QR Code Full Customization Studio Modal */}
      {showQRStudio && (
        <QRCodeStudioModal
          value={rawQrPayload || value.trim() || "https://fluxkit.app"}
          isOpen={showQRStudio}
          onClose={() => setShowQRStudio(false)}
          onApply={(newQrUrl) => {
            setQr(newQrUrl)
            notify("Customized QR code updated successfully!", "success")
          }}
        />
      )}
    </div>
  )
}
