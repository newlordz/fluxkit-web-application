import { useState, useEffect } from "react"

import {
  Download,
  Share2,
  ExternalLink,
  ZoomIn,
  X,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react"

import {
  getShowcase,
  getShowcaseCustomPalette,
  type ImageShowcaseData,
  type ShowcaseTheme,
} from "./imageShowcaseService"

export default function ImageShowcaseViewer() {
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

          document.title = res.title || "Photo Showcase"
        } else {
          setError("This photo could not be found or the link has expired.")
        }
      })

      .catch((err) => {
        setError(err.message || "Failed to load image showcase.")
      })

      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!isLightboxOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsLightboxOpen(false)
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [isLightboxOpen])

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

          text: data?.description || "Check out this photo",

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
        <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
          {error || "The image link may have expired or is unavailable."}
        </p>
      </div>
    )
  }

  // --------------------------------------------------------------------------

  // Theme-Specific Render Configurations (Anti-Slop, Calibrated Taste)

  // --------------------------------------------------------------------------

  let ctaHref: string | null = null
  try {
    const target = new URL(data.ctaUrl || "")
    if (target.protocol === "https:" || target.protocol === "http:") ctaHref = target.href
  } catch {}

  const customPalette = getShowcaseCustomPalette(data.customColors)
  const isLightTheme =
    data.theme === "polaroid" ||
    data.theme === "editorial" ||
    (data.theme === "custom" && customPalette.isLight)
  const controlClass = isLightTheme
    ? "border-black/10 bg-black/[0.04] hover:bg-black/[0.08]"
    : "border-white/15 bg-white/10 hover:bg-white/15"
  const badgeClass = isLightTheme
    ? "border-indigo-700/15 bg-indigo-700/10 text-indigo-900"
    : "border-indigo-300/25 bg-indigo-400/15 text-indigo-200"

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

      case "custom":
        return ""

      case "glassmorphism":

      default:
        return "bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950 text-white"
    }
  }

  const getImageContainerClass = (t: ShowcaseTheme) => {
    switch (t) {
      case "polaroid":
        return "bg-white p-3.5 rounded-sm border border-neutral-200 shadow-[0_16px_36px_rgba(0,0,0,0.18)] rotate-[-1deg] lg:rotate-[-0.5deg]"

      case "obsidian":
        return "rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-slate-900"

      case "editorial":
        return "rounded-none border border-neutral-300 p-2 bg-neutral-50 shadow-sm"

      case "vibrant":
        return "rounded-2xl overflow-hidden ring-2 ring-orange-500/30 shadow-[0_20px_50px_rgba(249,115,22,0.2)] bg-slate-900"

      case "billboard":
        return "rounded-3xl overflow-hidden shadow-2xl bg-neutral-900"

      case "custom":
        return customPalette.isLight
          ? "rounded-2xl overflow-hidden bg-white/30 ring-1 ring-black/15 shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
          : "rounded-2xl overflow-hidden bg-white/[0.04] ring-1 ring-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"

      case "glassmorphism":

      default:
        return "rounded-2xl overflow-hidden backdrop-blur-xl bg-white/[0.04] ring-1 ring-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
    }
  }

  return (
    <div
      className={`relative isolate min-h-[100dvh] overflow-x-hidden px-4 py-5 transition-colors duration-300 sm:px-6 lg:px-10 lg:py-8 ${getThemeWrapperClass(
        data.theme,
      )}`}
      style={
        data.theme === "custom"
          ? {
              background: customPalette.gradient,
              color: customPalette.textColor,
            }
          : undefined
      }
    >
      <header className="relative z-10 mx-auto flex w-full max-w-md items-center justify-between lg:max-w-6xl">
        <div
          className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            isLightTheme ? "text-slate-600" : "text-white/60"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLightTheme ? "bg-indigo-600" : "bg-indigo-300"
            }`}
          />
          Photo showcase
        </div>
        <button
          type="button"
          onClick={handleShare}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold backdrop-blur-md transition-all active:scale-[0.98] ${controlClass}`}
          title="Share photo link"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-500" /> Copied!
            </>
          ) : (
            <>
              <Share2 size={13} /> Share
            </>
          )}
        </button>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-md flex-1 flex-col justify-center gap-5 py-4 sm:gap-6 lg:min-h-[calc(100dvh-7rem)] lg:max-w-6xl lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:items-center lg:gap-14 lg:py-6 xl:gap-20">
        <figure
          className={`mx-auto w-full max-w-[380px] transition-transform duration-300 sm:max-w-[420px] lg:mx-0 lg:max-w-none ${getImageContainerClass(
            data.theme,
          )}`}
        >
          <button
            type="button"
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            onClick={() => setIsLightboxOpen(true)}
            aria-label={`Enlarge ${data.title || "showcase photo"}`}
          >
            <img
              src={data.imageDataUrl}
              alt={data.title || "Showcase Photo"}
              className="block h-auto w-full object-cover max-h-[52dvh] lg:max-h-[76dvh]"
              loading="eager"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
                <ZoomIn size={14} /> View full screen
              </span>
            </span>
          </button>
        </figure>

        <section className="mx-auto w-full max-w-[420px] text-center lg:mx-0 lg:max-w-none lg:text-left">
          {data.badgeText && (
            <span
              className={`mb-3 inline-flex rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider ${badgeClass}`}
            >
              {data.badgeText}
            </span>
          )}
          <h1
            className={`text-balance text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl xl:text-5xl ${
              data.theme === "polaroid" ? "font-serif" : ""
            }`}
            style={
              data.theme === "polaroid"
                ? { fontFamily: "Georgia, 'Times New Roman', serif" }
                : undefined
            }
          >
            {data.title}
          </h1>
          {data.description && (
            <p
              className={`mx-auto mt-2 max-w-sm whitespace-pre-line text-sm leading-relaxed opacity-80 sm:text-base lg:mx-0 lg:mt-4 lg:max-w-lg lg:text-lg ${
                data.theme === "polaroid" ? "font-serif" : ""
              }`}
            >
              {data.description}
            </p>
          )}

          <div className="mx-auto mt-5 flex w-full max-w-[380px] flex-col gap-2.5 sm:mt-6 lg:mx-0 lg:max-w-none lg:mt-8">
            {data.ctaEnabled && ctaHref && (
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-[0.98]"
              >
                <span>{data.ctaLabel || "Visit Link"}</span>
                <ExternalLink size={15} />
              </a>
            )}

            {data.downloadAllowed && (
              <button
                type="button"
                onClick={handleDownload}
                className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold text-current backdrop-blur-md transition-all active:scale-[0.98] ${controlClass}`}
              >
                <Download size={15} />
                <span>Save Full Resolution Photo</span>
              </button>
            )}
          </div>

          <p
            className={`mt-4 flex items-center justify-center gap-1.5 text-[11px] ${
              isLightTheme ? "text-slate-500" : "text-white/50"
            } lg:justify-start`}
          >
            <ZoomIn size={12} />
            <span className="lg:hidden">Tap the photo to enlarge</span>
            <span className="hidden lg:inline">Select the photo to view full screen</span>
          </p>
        </section>
      </main>

      {/* Full-Screen Lightbox Zoom Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex flex-col items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Full-screen view of ${data.title || "showcase photo"}`}
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
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
                type="button"
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
