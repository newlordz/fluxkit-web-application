import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Crop,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  RotateCcw,
  Ruler,
} from "lucide-react"
import ImageCropEditor from "./ImageCropEditor"
import {
  blobToDataUrl,
  createInitialCrop,
  fitCropToAspect,
  getCropAspect,
  loadEditableImage,
  normalizeCrop,
  renderImageCrop,
  validateOutputDimensions,
  type CropRect,
  type ImageExportOptions,
} from "./imageEditing"

interface ImageEditorStudioProps {
  file: File
  mode: "crop" | "resize"
  onComplete: (name: string) => void
}

const ASPECT_OPTIONS = [
  { value: "original", label: "Original / free" },
  { value: "1:1", label: "Square · 1:1" },
  { value: "4:5", label: "Portrait · 4:5" },
  { value: "3:4", label: "Portrait · 3:4" },
  { value: "16:9", label: "Landscape · 16:9" },
  { value: "9:16", label: "Story / Reel · 9:16" },
  { value: "free", label: "Free crop" },
]

const SIZE_PRESETS = [
  { label: "Square post", width: 1080, height: 1080 },
  { label: "Portrait post", width: 1080, height: 1350 },
  { label: "Story / Reel", width: 1080, height: 1920 },
  { label: "YouTube banner", width: 1280, height: 720 },
  { label: "Full HD", width: 1920, height: 1080 },
]

function fileStem(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "image"
  )
}

function formatMm(width: number, height: number, dpi: number): string {
  return `${((width / dpi) * 25.4).toFixed(1)} × ${((height / dpi) * 25.4).toFixed(1)} mm`
}

function ratioLabel(width: number, height: number): string {
  const divisor = (a: number, b: number): number => (b === 0 ? a : divisor(b, a % b))
  const common = divisor(width, height)
  return `${width / common}:${height / common}`
}

export default function ImageEditorStudio({ file, mode, onComplete }: ImageEditorStudioProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [aspectValue, setAspectValue] = useState("original")
  const [outputWidth, setOutputWidth] = useState("")
  const [outputHeight, setOutputHeight] = useState("")
  const [lockAspect, setLockAspect] = useState(true)
  const [dpi, setDpi] = useState(300)
  const [format, setFormat] = useState<ImageExportOptions["format"]>("image/jpeg")
  const [quality, setQuality] = useState(0.92)
  const [backgroundColor, setBackgroundColor] = useState("#ffffff")
  const [previewUrl, setPreviewUrl] = useState("")
  const [previewError, setPreviewError] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [exported, setExported] = useState<{ name: string; size: number } | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const imageUrlRef = useRef("")

  const isCropMode = mode === "crop"
  const title = isCropMode ? "Image Cropper" : "Image Resizer"

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError("")
    setImage(null)
    setCrop(null)
    setPreviewUrl("")
    setExported(null)
    loadEditableImage(file)
      .then((loadedImage) => {
        if (!active) {
          URL.revokeObjectURL(loadedImage.src)
          return
        }
        imageUrlRef.current = loadedImage.src
        const initial = createInitialCrop(loadedImage.naturalWidth, loadedImage.naturalHeight)
        setImage(loadedImage)
        setCrop(initial)
        setOutputWidth(String(loadedImage.naturalWidth))
        setOutputHeight(String(loadedImage.naturalHeight))
        setAspectValue("original")
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "The image could not be opened.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = ""
      }
    }
  }, [file])

  const width = Number(outputWidth)
  const height = Number(outputHeight)
  const outputError = useMemo(() => {
    try {
      validateOutputDimensions(width, height)
      return ""
    } catch (error) {
      return error instanceof Error ? error.message : "Enter a valid output size."
    }
  }, [width, height])

  useEffect(() => {
    if (!image || !crop || outputError) return
    let active = true
    const timer = window.setTimeout(() => {
      const scale = Math.min(1, 640 / Math.max(width, height))
      const options: ImageExportOptions = {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        format,
        quality,
        backgroundColor: format === "image/jpeg" ? backgroundColor : undefined,
      }
      setPreviewError("")
      renderImageCrop(image, crop, options)
        .then((result) => blobToDataUrl(result.blob))
        .then((dataUrl) => {
          if (active) setPreviewUrl(dataUrl)
        })
        .catch((error) => {
          if (active) setPreviewError(error instanceof Error ? error.message : "The preview could not be rendered.")
        })
    }, 100)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [image, crop, width, height, format, quality, backgroundColor, outputError])

  function updateCrop(next: CropRect) {
    if (!image) return
    const safe = normalizeCrop(next, image.naturalWidth, image.naturalHeight, getCropAspect(aspectValue))
    setCrop(safe)
    setExported(null)
    if (isCropMode) {
      setOutputWidth(String(Math.max(1, Math.round(safe.width))))
      setOutputHeight(String(Math.max(1, Math.round(safe.height))))
    } else if (lockAspect) {
      const nextWidth = Number(outputWidth) > 0 ? Number(outputWidth) : safe.width
      setOutputWidth(String(Math.round(nextWidth)))
      setOutputHeight(String(Math.max(1, Math.round(nextWidth / (safe.width / safe.height)))))
    }
  }

  function updateAspect(value: string) {
    setAspectValue(value)
    setExported(null)
    if (!image || !crop) return
    const next = fitCropToAspect(crop, image.naturalWidth, image.naturalHeight, getCropAspect(value))
    setCrop(next)
    if (lockAspect || isCropMode) {
      const nextWidth = isCropMode ? Math.round(next.width) : Number(outputWidth) || Math.round(next.width)
      setOutputWidth(String(nextWidth))
      setOutputHeight(String(Math.max(1, Math.round(nextWidth / (next.width / next.height)))))
    }
  }

  function updateOutput(dimension: "width" | "height", value: string) {
    const numeric = Number(value)
    if (dimension === "width") {
      setOutputWidth(value)
      setOutputHeight(
        lockAspect && crop && numeric > 0
          ? String(Math.max(1, Math.round(numeric * (crop.height / crop.width))))
          : outputHeight,
      )
    } else {
      setOutputHeight(value)
      setOutputWidth(
        lockAspect && crop && numeric > 0
          ? String(Math.max(1, Math.round(numeric * (crop.width / crop.height))))
          : outputWidth,
      )
    }
    setExported(null)
  }

  function applySizePreset(preset: (typeof SIZE_PRESETS)[number]) {
    setOutputWidth(String(preset.width))
    setOutputHeight(String(preset.height))
    setExported(null)
    if (image && crop) {
      setAspectValue(ratioLabel(preset.width, preset.height))
      setCrop(fitCropToAspect(crop, image.naturalWidth, image.naturalHeight, preset.width / preset.height))
    }
  }

  function resetCrop() {
    if (!image) return
    const ratio = getCropAspect(aspectValue)
    const initial = createInitialCrop(image.naturalWidth, image.naturalHeight, ratio)
    setCrop(initial)
    setExported(null)
    if (isCropMode) {
      setOutputWidth(String(Math.round(initial.width)))
      setOutputHeight(String(Math.round(initial.height)))
    }
  }

  async function handleExport() {
    if (!image || !crop || outputError) return
    setExporting(true)
    setExportError("")
    setExported(null)
    try {
      const result = await renderImageCrop(image, crop, {
        width,
        height,
        format,
        quality,
        backgroundColor: format === "image/jpeg" ? backgroundColor : undefined,
      })
      const name = `${fileStem(file.name)}-${mode}-${result.width}x${result.height}.${result.extension}`
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = name
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      setExported({ name, size: result.blob.size })
      onComplete(name)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The image could not be exported.")
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        Opening your image locally…
      </div>
    )
  }

  if (loadError || !image || !crop) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>We could not open this image.</strong>
            <p className="mt-1">{loadError || "Choose another image to continue."}</p>
            <p className="mt-2 text-red-700">Remove the file and choose a JPG, PNG, WebP, or AVIF image.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="mt-6 overflow-clip rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {isCropMode
              ? "Frame exactly what you want to keep, then export at the selected size."
              : "Crop, choose an exact output size, and export without uploading your image."}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <LockKeyhole className="h-4 w-4" />
          Processed on your device
        </span>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-slate-950">Crop canvas</h4>
              <p className="mt-1 text-xs text-slate-500">
                Source: {image.naturalWidth} × {image.naturalHeight} px
              </p>
            </div>
            <button type="button" className="text-button inline-flex items-center gap-2" onClick={resetCrop}>
              <RotateCcw className="h-4 w-4" />
              Reset crop
            </button>
          </div>

          <ImageCropEditor image={image} crop={crop} aspect={getCropAspect(aspectValue)} onChange={updateCrop} />

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">SELECTED AREA</p>
              <p className="mt-1 text-sm font-bold text-slate-950">
                {Math.round(crop.width)} × {Math.round(crop.height)} px
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">FINAL FILE</p>
              <p className="mt-1 text-sm font-bold text-slate-950">
                {outputError ? "Invalid size" : `${Math.round(width)} × ${Math.round(height)} px`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">PRINT SIZE AT {dpi} DPI</p>
              <p className="mt-1 text-sm font-bold text-slate-950">
                {outputError ? "—" : formatMm(Math.round(width), Math.round(height), dpi)}
              </p>
            </div>
          </div>

          <div ref={resultRef} className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-950">Result preview</h4>
                <p className="mt-1 text-xs text-slate-500">This preview uses the exact crop and output ratio you will download.</p>
              </div>
              <Maximize2 className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 flex min-h-52 items-center justify-center overflow-auto rounded-xl bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:24px_24px] p-5">
              {previewUrl ? (
                <img src={previewUrl} alt="Final edited image preview" className="max-h-[420px] max-w-full rounded-sm shadow-lg" draggable={false} />
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Rendering preview…
                </div>
              )}
            </div>
            {previewError && <p className="mt-3 text-sm text-amber-800">{previewError}</p>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Crop className="h-5 w-5 text-blue-700" />
              <h4 className="font-semibold text-slate-950">Crop ratio</h4>
            </div>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="image-aspect">
              Aspect ratio
            </label>
            <select
              id="image-aspect"
              value={aspectValue}
              onChange={(event) => updateAspect(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {ASPECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Fixed ratios keep the crop proportional. Original / free starts with the full image and allows independent handle movement after you choose Free crop.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Maximize2 className="h-5 w-5 text-blue-700" />
              <h4 className="font-semibold text-slate-950">Output dimensions</h4>
            </div>
            {!isCropMode && (
              <div className="mb-4 flex flex-wrap gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applySizePreset(preset)}
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-700">
                Width (px)
                <input
                  type="number"
                  min={1}
                  max={8192}
                  value={outputWidth}
                  onChange={(event) => updateOutput("width", event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Height (px)
                <input
                  type="number"
                  min={1}
                  max={8192}
                  value={outputHeight}
                  onChange={(event) => updateOutput("height", event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={lockAspect} onChange={(event) => setLockAspect(event.target.checked)} className="h-4 w-4 accent-blue-600" />
              Lock proportions
            </label>
            <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="image-dpi">
              Print-size reference
            </label>
            <select
              id="image-dpi"
              value={dpi}
              onChange={(event) => setDpi(Number(event.target.value))}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value={96}>96 DPI · screen reference</option>
              <option value={150}>150 DPI</option>
              <option value={300}>300 DPI · print</option>
              <option value={600}>600 DPI · high detail</option>
            </select>
            {outputError && <p className="mt-3 text-xs leading-5 text-red-700" role="alert">{outputError}</p>}
            {!outputError && (
              <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
                <div className="flex items-start gap-2">
                  <Ruler className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Final file: <strong>{Math.round(width)} × {Math.round(height)} px</strong><br />
                    Physical size: <strong>{formatMm(Math.round(width), Math.round(height), dpi)}</strong>
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-700" />
              <h4 className="font-semibold text-slate-950">Export</h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["image/jpeg", "image/png", "image/webp"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${format === value ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  {value === "image/jpeg" ? "JPG" : value === "image/png" ? "PNG" : "WebP"}
                </button>
              ))}
            </div>
            {format !== "image/png" && (
              <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="image-quality">
                Quality · {Math.round(quality * 100)}%
              </label>
            )}
            {format !== "image/png" && (
              <input id="image-quality" type="range" min={0.5} max={1} step={0.01} value={quality} onChange={(event) => setQuality(Number(event.target.value))} className="mt-3 w-full accent-blue-600" />
            )}
            {format === "image/jpeg" && (
              <label className="mt-4 flex items-center gap-3 text-xs font-semibold text-slate-700">
                Background
                <input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1" />
              </label>
            )}
            {exportError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert">{exportError}</div>}
            {exported && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900" role="status">
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <div><strong>Image exported.</strong><p className="mt-1 break-all">{exported.name}</p><p>{(exported.size / 1024).toFixed(1)} KB</p></div>
                </div>
              </div>
            )}
            <button
              type="button"
              className="primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleExport}
              disabled={exporting || !!outputError}
            >
              {exporting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              {exporting ? "Preparing image…" : `Download ${format === "image/jpeg" ? "JPG" : format === "image/png" ? "PNG" : "WebP"}`}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">No upload, account, watermark, or cloud processing.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
