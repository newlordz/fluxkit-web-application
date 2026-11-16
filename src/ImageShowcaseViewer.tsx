import React, { useState, useEffect } from "react"
import {
  Download,
  Share2,
  ExternalLink,
  ZoomIn,
  X,
  Sparkles,
  QrCode,
  ArrowLeft,
  Check,
  Eye,
  AlertCircle,
  Loader2,
} from "lucide-react"
import {
  getShowcase,
  type ImageShowcaseData,
  type ShowcaseTheme,
} from "./imageShowcaseService"

interface ImageShowcaseViewerProps {
  theme?: string
  toggleTheme?: () => void
  onNavigate?: (page: string) => void
}

export default function ImageShowcaseViewer({
  theme = "light",
  toggleTheme,
  onNavigate,
}: ImageShowcaseViewerProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ImageShowcaseData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  useEffect(() => {
    // Parse URL params from hash: #showcase?id=xyz&p=abc
    const hash = window.location.hash || ""
    const queryPart = hash.includes("?") ? hash.split("?")[1] : ""
    const params = new URLSearchParams(queryPart)
    const id = params.get("id") || ""
    const payload = params.get("p") || undefined

    if (!id && !payload) {
      setError("No showcase ID provided in the link.")
      setLoading(false)
      return
    }

    getShowcase(id, payload)
      .then((res) => {
        if (res) {
          setData(res)
          // Update page document title
          if (res.title) {
            document.title = `${res.title} — Masterfilepro Showcase`
          }
        } else {
          setError(
            "This image showcase could not be found or has expired. Create your own in Masterfilepro QR Studio!",
          )
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load image showcase.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const handleDownload = () => {
    if (!data?.imageDataUrl) return
    const a = document.createElement("a")
    a.href = data.imageDataUrl
    const safeTitle = (data.title || "showcase-photo")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
    a.download = `${safeTitle}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: data?.title || "Image Showcase",
          text: data?.description || "Check out this image on Masterfilepro",
          url,
        })
        return
      } catch {
        // Fallback to clipboard
      }
    }
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
        <p className="text-sm font-medium text-slate-400">Loading showcase…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle size={28} />
        </div>
        <h1 className="text-xl font-bold mb-2">Showcase Not Found</h1>
        <p className="text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
          {error || "The image link may have expired or is unavailable."}
        </p>
        <button
          onClick={() => (onNavigate ? onNavigate("qr") : (window.location.hash = "qr"))}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all active:scale-[0.98]"
        >
          <QrCode size={16} /> Create an Image QR Code
        </button>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Theme-Specific Render Configurations (Anti-Slop, Calibrated Taste)
  // --------------------------------------------------------------------------
  const getThemeWrapperClass = (t: ShowcaseTheme) => {
    switch (t) {
      case "polaroid":
        return "bg-[#eae6df] text-slate-900"
      case "obsidian":
        return "bg-slate-950 text-slate-100"
      case "editorial":
        return "bg-white text-neutral-900 border-neutral-200"
      case "vibrant":
        return "bg-gradient-to-br from-orange-950 via-slate-950 to-pink-950 text-white"
      case "billboard":
        return "bg-black text-white"
      case "glassmorphism":
      default:
        return "bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950 text-white"
    }
  }

  const getImageContainerClass = (t: ShowcaseTheme) => {
    switch (t) {
      case "polaroid":
        return "bg-white p-3.5 pb-8 rounded-sm shadow-[0_16px_36px_rgba(0,0,0,0.18)] rotate-[-1deg] border border-neutral-200"
      case "obsidian":
        return "rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-slate-900"
      case "editorial":
        return "rounded-none border border-neutral-300 p-2 bg-neutral-50 shadow-sm"
      case "vibrant":
        return "rounded-2xl overflow-hidden ring-2 ring-orange-500/30 shadow-[0_20px_50px_rgba(249,115,22,0.2)] bg-slate-900"
      case "billboard":
        return "rounded-3xl overflow-hidden shadow-2xl bg-neutral-900"
      case "glassmorphism":
      default:
        return "rounded-2xl overflow-hidden backdrop-blur-xl bg-white/[0.04] ring-1 ring-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
    }
  }

  return (
    <div
      className={`min-h-[100dvh] flex flex-col justify-between py-6 px-4 md:py-10 transition-colors duration-300 ${getThemeWrapperClass(
        data.theme,
      )}`}
    >
      {/* Top Header Bar */}
      <header className="max-w-md mx-auto w-full flex items-center justify-between pb-4">
        <button
          onClick={() => (onNavigate ? onNavigate("qr") : (window.location.hash = "qr"))}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-md transition-all active:scale-[0.98]"
        >
          <ArrowLeft size={13} /> Masterfilepro QR
        </button>

        <div className="flex items-center gap-2">
          {data.badgeText && (
            <span className="text-[10.5px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {data.badgeText}
            </span>
          )}
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-md transition-all active:scale-[0.98]"
            title="Share showcase link"
          >
            {copied ? (
              <>
                <Check size={13} className="text-emerald-400" /> Copied!
              </>
            ) : (
              <>
                <Share2 size={13} /> Share
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Showcase Presentation Body */}
      <main className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center items-center py-2">
        {/* The Framed Image Element */}
        <div className={`w-full max-w-[380px] transition-all duration-300 ${getImageContainerClass(data.theme)}`}>
          <div className="relative group cursor-pointer overflow-hidden rounded-lg" onClick={() => setIsLightboxOpen(true)}>
            <img
              src={data.imageDataUrl}
              alt={data.title || "Showcase Photo"}
              className="w-full h-auto object-cover max-h-[65dvh] block"
              loading="eager"
            />
            {/* Hover / Tap to Inspect Pill */}
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full bg-black/60 text-white backdrop-blur-md">
                <ZoomIn size={14} /> Tap to Enlarge
              </span>
            </div>
          </div>

          {/* Polaroid Handwritten Caption Area */}
          {data.theme === "polaroid" && (
            <div className="pt-4 px-1 text-center font-serif">
              <h2 className="text-lg font-bold tracking-tight text-slate-800">
                {data.title}
              </h2>
              {data.description && (
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                  {data.description}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Standard Content Info Area (Non-Polaroid) */}
        {data.theme !== "polaroid" && (
          <div className="w-full text-center mt-5 px-2">
            <h1 className="text-2xl font-bold tracking-tight mb-1.5">
              {data.title}
            </h1>
            {data.description && (
              <p className="text-sm opacity-80 max-w-sm mx-auto leading-relaxed whitespace-pre-line">
                {data.description}
              </p>
            )}
          </div>
        )}

        {/* Visitor Action Strip */}
        <div className="w-full max-w-[380px] flex flex-col gap-2.5 mt-6 px-1">
          {/* Custom Creator CTA Link */}
          {data.ctaEnabled && data.ctaUrl && (
            <a
              href={data.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20"
            >
              <span>{data.ctaLabel || "Visit Link"}</span>
              <ExternalLink size={15} />
            </a>
          )}

          {/* Download Photo Button */}
          {data.downloadAllowed && (
            <button
              onClick={handleDownload}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-current text-sm font-semibold border border-white/15 backdrop-blur-md transition-all active:scale-[0.98]"
            >
              <Download size={15} />
              <span>Save Full Resolution Photo</span>
            </button>
          )}
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="max-w-md mx-auto w-full pt-6 pb-2 text-center text-xs opacity-60 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1 font-medium">
          <Sparkles size={12} className="text-teal-400" />
          <span>Designed with Masterfilepro QR Studio</span>
        </div>
        <button
          onClick={() => (onNavigate ? onNavigate("qr") : (window.location.hash = "qr"))}
          className="underline hover:opacity-100 transition-opacity"
        >
          Create your own Image QR Code for free
        </button>
      </footer>

      {/* Full-Screen Lightbox Zoom Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex flex-col items-center justify-center p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            aria-label="Close enlarged preview"
          >
            <X size={20} />
          </button>
          <img
            src={data.imageDataUrl}
            alt={data.title}
            className="max-w-full max-h-[88dvh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-5 flex items-center gap-3">
            {data.downloadAllowed && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDownload()
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-slate-900 text-xs font-semibold shadow-lg hover:bg-slate-100 transition-all active:scale-[0.98]"
              >
                <Download size={14} /> Download Original
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
