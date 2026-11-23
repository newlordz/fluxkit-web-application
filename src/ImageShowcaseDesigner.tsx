import React, { useState, useRef, useEffect } from "react"

import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  ExternalLink,
  Download,
  Trash2,
  Check,
  Palette,
  Eye,
  Sliders,
  Type,
  Layout,
  Smartphone,
  Layers,
} from "lucide-react"

import {
  optimizeShowcaseImage,
  generateShowcaseId,
  saveShowcase,
  type ImageShowcaseData,
  type ShowcaseTheme,
} from "./imageShowcaseService"

export interface ShowcaseMobileMockupProps {
  theme?: ShowcaseTheme

  imageDataUrl?: string

  title?: string

  description?: string

  badgeText?: string

  ctaEnabled?: boolean

  ctaLabel?: string

  ctaUrl?: string

  downloadAllowed?: boolean
}

export function ShowcaseMobileMockup({
  theme = "glassmorphism",

  imageDataUrl = "",

  title = "",

  description = "",

  badgeText = "",

  ctaEnabled = false,

  ctaLabel = "Visit Website",

  downloadAllowed = true,
}: ShowcaseMobileMockupProps) {
  return (
    <div className="w-full max-w-[320px] aspect-[9/18.5] bg-slate-900 rounded-[44px] p-3 shadow-2xl ring-1 ring-white/10 relative overflow-hidden flex flex-col mx-auto select-none">
      {/* Phone Speaker & Camera Island */}
      <div className="w-24 h-4 bg-black rounded-full mx-auto mb-2 shrink-0 flex items-center justify-end px-2">
        <div className="w-2 h-2 rounded-full bg-slate-800" />
      </div>

      {/* Simulated Mobile Viewport */}
      <div
        className={`flex-1 rounded-[32px] overflow-y-auto overflow-x-hidden p-3 flex flex-col justify-between text-center select-none ${
          theme === "polaroid"
            ? "bg-[#eae6df] text-slate-900"
            : theme === "obsidian"
              ? "bg-slate-950 text-white"
              : theme === "editorial"
                ? "bg-white text-neutral-900"
                : theme === "vibrant"
                  ? "bg-gradient-to-br from-orange-950 via-slate-950 to-pink-950 text-white"
                  : theme === "billboard"
                    ? "bg-black text-white"
                    : "bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950 text-white"
        }`}
      >
        {/* Header inside phone */}
        <div className="flex items-center justify-between pt-1 pb-2">
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 font-bold tracking-tight">
            Masterfile<span className="text-teal-400">pro</span>
          </span>
          {badgeText && (
            <span className="text-[8px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {badgeText}
            </span>
          )}
        </div>

        {/* Main content inside phone */}
        <div className="flex-1 flex flex-col items-center justify-center my-1">
          {/* Framed Image */}
          <div
            className={`w-full max-w-[240px] transition-all ${
              theme === "polaroid"
                ? "bg-white p-2 pb-5 rounded-sm shadow-md rotate-[-1deg]"
                : theme === "obsidian"
                  ? "rounded-xl overflow-hidden ring-1 ring-white/10 shadow-lg bg-slate-900"
                  : theme === "editorial"
                    ? "rounded-none border border-neutral-300 p-1 bg-neutral-50 shadow-sm"
                    : theme === "vibrant"
                      ? "rounded-xl overflow-hidden ring-2 ring-orange-500/30 shadow-lg bg-slate-900"
                      : theme === "billboard"
                        ? "rounded-2xl overflow-hidden shadow-xl"
                        : "rounded-xl overflow-hidden backdrop-blur-md bg-white/[0.05] ring-1 ring-white/20 shadow-lg"
            }`}
          >
            {imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt="Preview"
                className="w-full h-auto max-h-[180px] object-cover block rounded-sm"
              />
            ) : (
              <div className="w-full h-36 bg-black/10 flex flex-col items-center justify-center text-xs opacity-50 p-3">
                <ImageIcon size={24} className="mb-1" />
                <span>Upload an image to see live preview</span>
              </div>
            )}

            {theme === "polaroid" && (
              <div className="pt-2 text-center font-serif">
                <p className="text-[11px] font-bold text-slate-800 truncate">
                  {title || "Photo Title"}
                </p>
                {description && (
                  <p className="text-[8.5px] text-slate-500 truncate mt-0.5">
                    {description}
                  </p>
                )}
              </div>
            )}
          </div>

          {theme !== "polaroid" && (
            <div className="mt-3 px-1">
              <p className="text-xs font-bold truncate">
                {title || "Your Showcase Title"}
              </p>
              {description && (
                <p className="text-[9.5px] opacity-75 line-clamp-2 mt-0.5 leading-snug">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Visitor Buttons inside Phone */}
          <div className="w-full flex flex-col gap-1.5 mt-3 px-1">
            {ctaEnabled && (
              <div className="w-full py-1.5 rounded-lg bg-indigo-600 text-white text-[9.5px] font-semibold flex items-center justify-center gap-1 shadow">
                <span>{ctaLabel || "Visit Link"}</span>
                <ExternalLink size={10} />
              </div>
            )}
            {downloadAllowed && (
              <div className="w-full py-1.5 rounded-lg bg-white/10 border border-white/10 text-[9.5px] font-semibold flex items-center justify-center gap-1">
                <Download size={10} />
                <span>Save Photo</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom simulated home bar */}
        <div className="w-16 h-1 bg-white/30 rounded-full mx-auto mt-2" />
      </div>
    </div>
  )
}

export interface ImageShowcaseDesignerProps {
  onGenerated: (result: {
    url: string

    showcase: ImageShowcaseData

    openCustomizer?: boolean
  }) => void

  onCancel?: () => void

  onPreviewChange?: (preview: ShowcaseMobileMockupProps) => void

  showInlinePreview?: boolean
}

const THEME_OPTIONS: Array<{
  id: ShowcaseTheme

  name: string

  desc: string

  bgPreview: string
}> = [
  {
    id: "glassmorphism",

    name: "Frosted Glass",

    desc: "Refined frosted card with subtle specular border & ambient blur",

    bgPreview: "linear-gradient(135deg, #1e293b, #0f172a)",
  },

  {
    id: "polaroid",

    name: "Classic Polaroid",

    desc: "Warm paper photo frame with tactile drop-shadow & caption",

    bgPreview: "#eae6df",
  },

  {
    id: "obsidian",

    name: "Luxury Obsidian",

    desc: "Deep slate aesthetic with violet rim illumination",

    bgPreview: "#090d16",
  },

  {
    id: "editorial",

    name: "Editorial Gallery",

    desc: "Museum-grade minimalist monochrome layout with crisp typography",

    bgPreview: "#ffffff",
  },

  {
    id: "vibrant",

    name: "Sunset Vibrant",

    desc: "Dynamic warm gradient backdrop for events, promos & flyers",

    bgPreview: "linear-gradient(135deg, #f97316, #ec4899)",
  },

  {
    id: "billboard",

    name: "Cinematic Poster",

    desc: "Full-bleed hero focus with sleek bottom metadata sheet",

    bgPreview: "#000000",
  },
]

export default function ImageShowcaseDesigner({
  onGenerated,

  onCancel,

  onPreviewChange,

  showInlinePreview = false,
}: ImageShowcaseDesignerProps) {
  const [imageFile, setImageFile] = useState<File | null>(null)

  const [imageDataUrl, setImageDataUrl] = useState<string>("")

  const [isOptimizing, setIsOptimizing] = useState(false)

  const [title, setTitle] = useState("")

  const [description, setDescription] = useState("")

  const [badgeText, setBadgeText] = useState("")

  const [theme, setTheme] = useState<ShowcaseTheme>("glassmorphism")

  const [downloadAllowed, setDownloadAllowed] = useState(true)

  const [ctaEnabled, setCtaEnabled] = useState(false)

  const [ctaLabel, setCtaLabel] = useState("Visit Website")

  const [ctaUrl, setCtaUrl] = useState("")

  const [isSaving, setIsSaving] = useState(false)

  const [error, setError] = useState("")

  const [previewTab, setPreviewTab] = useState<"desktop" | "mobile">("mobile")

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Broadcast preview state changes to parent layout (e.g. for right preview panel)

  useEffect(() => {
    onPreviewChange?.({
      theme,

      imageDataUrl,

      title,

      description,

      badgeText,

      ctaEnabled,

      ctaLabel,

      ctaUrl,

      downloadAllowed,
    })
  }, [
    theme,

    imageDataUrl,

    title,

    description,

    badgeText,

    ctaEnabled,

    ctaLabel,

    ctaUrl,

    downloadAllowed,

    onPreviewChange,
  ])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) return

    setError("")

    setIsOptimizing(true)

    try {
      const { dataUrl } = await optimizeShowcaseImage(file, 1400, 0.85)

      setImageFile(file)

      setImageDataUrl(dataUrl)

      if (!title) {
        const cleanName = file.name

          .replace(/\.[^/.]+$/, "")

          .replace(/[-_]/g, " ")

        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1))
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load image.")
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleGenerate = async (openCustomizer: boolean = false) => {
    if (!imageDataUrl) {
      setError("Please upload an image for the showcase.")

      return
    }

    if (!title.trim()) {
      setError("Please provide a title for your showcase.")

      return
    }

    setError("")

    setIsSaving(true)

    try {
      const showcaseData: ImageShowcaseData = {
        id: generateShowcaseId(),

        title: title.trim(),

        description: description.trim() || undefined,

        badgeText: badgeText.trim() || undefined,

        theme,

        imageDataUrl,

        downloadAllowed,

        ctaEnabled: ctaEnabled && Boolean(ctaUrl.trim()),

        ctaLabel: ctaLabel.trim() || "Visit Website",

        ctaUrl: ctaUrl.trim()
          ? /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ctaUrl.trim())
            ? ctaUrl.trim()
            : `https://${ctaUrl.trim()}`
          : undefined,

        createdAt: new Date().toISOString(),
      }

      const res = await saveShowcase(showcaseData)

      onGenerated({ url: res.url, showcase: showcaseData, openCustomizer })
    } catch (err: any) {
      setError(err?.message || "Failed to generate image showcase.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="image-showcase-designer w-full flex flex-col gap-5">
      {/* Controls Container (Full Width) */}
      <div className="w-full flex flex-col gap-5">
        {/* Step 1: Upload Image */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
              <ImageIcon size={14} /> 1. Upload Photo / Flyer / Menu
            </span>
            {imageDataUrl && (
              <button
                type="button"
                onClick={() => {
                  setImageFile(null)

                  setImageDataUrl("")
                }}
                className="text-xs text-rose-500 hover:underline flex items-center gap-1"
              >
                <Trash2 size={12} /> Replace Photo
              </button>
            )}
          </div>

          {!imageDataUrl ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-all bg-[var(--card-bg)] hover:bg-[var(--surface-hover)] text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                <Upload size={24} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">
                {isOptimizing
                  ? "Optimizing image for fast scanning..."
                  : "Click to upload an image"}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Supports JPG, PNG, WebP, GIF, SVG (Menus, posters, flyers, event
                invites)
              </p>
              <input
                aria-label="Image file to upload"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
              <img
                src={imageDataUrl}
                alt="Thumbnail"
                className="w-16 h-16 rounded-md object-cover border border-[var(--border)]"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-[var(--text)]">
                  {imageFile?.name || "Uploaded image"}
                </p>
                <p className="text-xs text-emerald-500 flex items-center gap-1 font-medium">
                  <Check size={12} /> Optimized & Ready for Scanners
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Information & Messaging */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
            <Type size={14} /> 2. Content & Details
          </span>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--text)]">
              Title / Headline *
            </label>
            <input
              aria-label="Title / Headline"
              type="text"
              placeholder="e.g. Summer Weekend Specials, Save The Date"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--text)]">
              Description / Instructions (Optional)
            </label>
            <textarea
              aria-label="Description / Instructions (Optional)"
              placeholder="e.g. Show this screen at the cashier for 15% off your order!"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={250}
              className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--text)]">
              Header Badge Tag (Optional)
            </label>
            <input
              aria-label="Header Badge Tag (Optional)"
              type="text"
              placeholder="e.g. SPECIAL OFFER, OFFICIAL MENU, VIP"
              value={badgeText}
              onChange={(e) => setBadgeText(e.target.value.toUpperCase())}
              maxLength={20}
              className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none uppercase font-mono tracking-wider text-xs"
            />
          </div>
        </div>

        {/* Step 3: Layout & Theme Preset */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
            <Palette size={14} /> 3. Page Theme & Framing
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = theme === opt.id

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all text-xs ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/20"
                      : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-hover)]"
                  }`}
                >
                  <div
                    className="w-full h-8 rounded-md mb-2 border border-black/10 shadow-inner flex items-center justify-center font-bold text-[10px]"
                    style={{
                      background: opt.bgPreview,

                      color:
                        opt.id === "editorial" || opt.id === "polaroid"
                          ? "#0f172a"
                          : "#ffffff",
                    }}
                  >
                    {opt.name.slice(0, 3)}
                  </div>
                  <span className="font-bold text-[var(--text)]">
                    {opt.name}
                  </span>
                  <span className="text-[10.5px] text-[var(--muted)] line-clamp-1 mt-0.5">
                    {opt.desc}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 4: Visitor Actions & Buttons */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
            <Sliders size={14} /> 4. Mobile Visitor Actions
          </span>

          <label className="flex items-center gap-2.5 text-xs text-[var(--text)] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={downloadAllowed}
              onChange={(e) => setDownloadAllowed(e.target.checked)}
              className="rounded accent-[var(--accent)]"
            />
            <span>Allow 1-tap "Save Full Resolution Photo" button</span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-[var(--text)] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={ctaEnabled}
              onChange={(e) => setCtaEnabled(e.target.checked)}
              className="rounded accent-[var(--accent)]"
            />
            <span>Add a Link Button (e.g. Visit Website, RSVP, Book)</span>
          </label>

          {ctaEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-6 pt-1">
              <input
                aria-label="Add a Link Button"
                type="text"
                placeholder="Button Label (e.g. Order Online)"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
              />
              <input
                aria-label="Link button URL"
                type="url"
                placeholder="Website URL (https://...)"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Action Trigger Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={!imageDataUrl || isSaving}
            onClick={() => handleGenerate(false)}
            className="w-full py-3.5 px-5 rounded-xl bg-[var(--accent)] hover:opacity-95 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles size={16} />
            <span>
              {isSaving ? "Packaging Showcase..." : "Generate Showcase QR Code"}
            </span>
          </button>

          <button
            type="button"
            disabled={!imageDataUrl || isSaving}
            onClick={() => handleGenerate(true)}
            className="w-full py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] hover:border-[var(--accent)] text-[var(--accent)] font-semibold text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            title="Design custom QR colors, embedded logo, and frames in QR Studio"
          >
            <Palette size={14} />
            <span>Customize QR Code Design (Colors, Logo, Frame)</span>
          </button>
        </div>
      </div>

      {showInlinePreview && (
        <div className="w-full flex flex-col items-center mt-4">
          <ShowcaseMobileMockup
            theme={theme}
            imageDataUrl={imageDataUrl}
            title={title}
            description={description}
            badgeText={badgeText}
            ctaEnabled={ctaEnabled}
            ctaLabel={ctaLabel}
            downloadAllowed={downloadAllowed}
          />
        </div>
      )}
    </div>
  )
}
