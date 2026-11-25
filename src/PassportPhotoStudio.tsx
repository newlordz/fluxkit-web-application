import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react"
import {
  PASSPORT_PHOTO_PRESETS,
  formatPassportSize,
  getPassportPreset,
  loadPassportImage,
  renderPassportPhoto,
  resolveOutputDimensions,
  type PassportRenderOptions,
  type PassportRenderResult,
  type PassportSizeUnit,
} from "./passportPhoto"

interface PassportPhotoStudioProps {
  file: File
  onComplete: (name: string) => void
}

const BACKGROUND_COLORS = [
  { label: "White", value: "#ffffff" },
  { label: "Off-white", value: "#f8fafc" },
  { label: "Light blue", value: "#dbeafe" },
  { label: "Light gray", value: "#e5e7eb" },
]

function fileStem(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "passport-photo"
  )
}

export default function PassportPhotoStudio({ file, onComplete }: PassportPhotoStudioProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [presetId, setPresetId] = useState("us")
  const [customLabel, setCustomLabel] = useState("")
  const [unit, setUnit] = useState<PassportSizeUnit>("mm")
  const [width, setWidth] = useState(50.8)
  const [height, setHeight] = useState(50.8)
  const [dpi, setDpi] = useState(300)
  const [zoom, setZoom] = useState(1)
  const [focusX, setFocusX] = useState(0.5)
  const [focusY, setFocusY] = useState(0.5)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState("#ffffff")
  const [backgroundTolerance, setBackgroundTolerance] = useState(28)
  const [format, setFormat] = useState<"image/jpeg" | "image/png">("image/jpeg")
  const [quality, setQuality] = useState(0.92)
  const [previewUrl, setPreviewUrl] = useState("")
  const [previewError, setPreviewError] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [exported, setExported] = useState<{ name: string; size: number } | null>(null)
  const dragRef = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  const selectedPreset = getPassportPreset(presetId)
  const output = useMemo(() => {
    try {
      return resolveOutputDimensions(width, height, unit, dpi)
    } catch {
      return null
    }
  }, [width, height, unit, dpi])

  const renderOptions = useMemo<PassportRenderOptions>(
    () => ({
      width,
      height,
      unit,
      dpi,
      zoom,
      focusX,
      focusY,
      removeBackground,
      backgroundColor,
      backgroundTolerance,
      format,
      quality,
    }),
    [
      width,
      height,
      unit,
      dpi,
      zoom,
      focusX,
      focusY,
      removeBackground,
      backgroundColor,
      backgroundTolerance,
      format,
      quality,
    ],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError("")
    setPreviewUrl("")
    setExported(null)
    setZoom(1)
    setFocusX(0.5)
    setFocusY(0.5)
    loadPassportImage(file)
      .then((loadedImage) => {
        if (active) setImage(loadedImage)
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "The photo could not be opened.")
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [file])

  useEffect(() => {
    if (!image || !output) return
    let active = true
    let objectUrl = ""
    const timer = window.setTimeout(() => {
      const previewScale = Math.min(1, 520 / Math.max(output.width, output.height))
      const previewOptions: PassportRenderOptions = {
        ...renderOptions,
        unit: "px",
        width: Math.max(1, Math.round(output.width * previewScale)),
        height: Math.max(1, Math.round(output.height * previewScale)),
        dpi: 300,
      }
      setPreviewError("")
      renderPassportPhoto(image, previewOptions)
        .then((result) => {
          if (!active) return
          objectUrl = URL.createObjectURL(result.blob)
          setPreviewUrl(objectUrl)
        })
        .catch((error) => {
          if (active) {
            setPreviewError(
              error instanceof Error ? error.message : "The live preview could not be rendered.",
            )
          }
        })
    }, 100)
    return () => {
      active = false
      window.clearTimeout(timer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image, output, renderOptions])

  function applyPreset(id: string) {
    setPresetId(id)
    const preset = getPassportPreset(id)
    if (!preset) return
    setUnit("mm")
    setWidth(preset.widthMm)
    setHeight(preset.heightMm)
    setExported(null)
  }

  function updateDimension(value: number, dimension: "width" | "height") {
    if (dimension === "width") setWidth(value)
    else setHeight(value)
    setPresetId("custom")
    setExported(null)
  }

  function updateUnit(nextUnit: PassportSizeUnit) {
    if (nextUnit === unit) return
    const convertedWidth =
      nextUnit === "mm"
        ? unit === "px"
          ? (width / dpi) * 25.4
          : width * 25.4
        : nextUnit === "in"
          ? unit === "px"
            ? width / dpi
            : width / 25.4
          : width
    const convertedHeight =
      nextUnit === "mm"
        ? unit === "px"
          ? (height / dpi) * 25.4
          : height * 25.4
        : nextUnit === "in"
          ? unit === "px"
            ? height / dpi
            : height / 25.4
          : height
    if (nextUnit === "px" && output) {
      setWidth(output.width)
      setHeight(output.height)
    } else {
      setWidth(convertedWidth)
      setHeight(convertedHeight)
    }
    setUnit(nextUnit)
    setPresetId("custom")
    setExported(null)
  }

  function resetCrop() {
    setZoom(1)
    setFocusX(0.5)
    setFocusY(0.5)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!previewRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, focusX, focusY }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const bounds = previewRef.current?.getBoundingClientRect()
    if (!drag || !bounds) return
    const nextX = Math.min(1, Math.max(0, drag.focusX - ((event.clientX - drag.x) / bounds.width) * 1.4))
    const nextY = Math.min(1, Math.max(0, drag.focusY - ((event.clientY - drag.y) / bounds.height) * 1.4))
    setFocusX(nextX)
    setFocusY(nextY)
  }

  function handlePointerUp() {
    dragRef.current = null
  }

  async function handleExport() {
    if (!image || !output) return
    setExporting(true)
    setExportError("")
    setExported(null)
    try {
      const result = await renderPassportPhoto(image, renderOptions)
      const presetSuffix = selectedPreset
        ? `-${selectedPreset.id}`
        : customLabel.trim()
          ? `-${fileStem(customLabel)}`
          : ""
      const name = `${fileStem(file.name)}-passport${presetSuffix}-${result.width}x${result.height}.${result.extension}`
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = name
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      setExported({ name, size: result.blob.size })
      onComplete(name)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The passport photo could not be exported.")
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        Opening your photo locally…
      </div>
    )
  }

  if (loadError || !image) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>We could not open this photo.</strong>
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
          <h3 className="text-lg font-semibold text-slate-950">Passport Photo Studio</h3>
          <p className="mt-1 text-sm text-slate-600">
            Crop, size, clean up a plain background, and export a print-ready photo.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <LockKeyhole className="h-4 w-4" />
          Processed on your device
        </span>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-slate-950">Live photo preview</h4>
              <p className="mt-1 text-xs text-slate-500">Drag the photo to position your face, then adjust zoom.</p>
            </div>
            <button type="button" className="text-button inline-flex items-center gap-2" onClick={resetCrop}>
              <RotateCcw className="h-4 w-4" />
              Reset crop
            </button>
          </div>

          <div
            ref={previewRef}
            className="relative flex min-h-80 touch-none items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-6"
            style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Live passport photo crop preview"
                className="max-h-[520px] max-w-full select-none rounded-sm shadow-xl"
                draggable={false}
              />
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Rendering preview…
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-6 bottom-6 rounded-lg bg-slate-950/80 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-sm">
              Keep the full head and shoulders inside the frame. Do not crop off the chin or top of the head.
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
            <strong>Check the receiving authority’s current rules.</strong> Photo dimensions, head size, expression,
            background, recency, and submission format vary by country and document type. This tool prepares the image;
            it does not guarantee acceptance.
          </div>

          {previewError && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <strong>Preview needs attention.</strong>
                <p className="mt-1">{previewError}</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="sticky top-20 z-30 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur lg:hidden">
            <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  aria-hidden="true"
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              ) : (
                <LoaderCircle className="h-5 w-5 animate-spin text-slate-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">Live photo preview</p>
              <p className="mt-1 text-xs text-slate-500">
                {output ? `${output.width} × ${output.height} px · updates as you edit` : "Updates as you edit"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-700" />
              <h4 className="font-semibold text-slate-950">Country &amp; dimensions</h4>
            </div>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="passport-country">
              Country / photo preset
            </label>
            <select
              id="passport-country"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={presetId}
              onChange={(event) => applyPreset(event.target.value)}
            >
              {PASSPORT_PHOTO_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} · {preset.widthMm} × {preset.heightMm} mm
                </option>
              ))}
              <option value="custom">Custom country / size</option>
            </select>
            {presetId === "custom" && (
              <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="passport-custom-label">
                Country / document label
                <input
                  id="passport-custom-label"
                  type="text"
                  value={customLabel}
                  onChange={(event) => setCustomLabel(event.target.value)}
                  placeholder="e.g. Kenya passport"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            )}
            <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
              {selectedPreset?.note || "Enter the exact physical or pixel dimensions required by your authority."}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <label className="text-xs font-semibold text-slate-700">
                Width
                <input
                  type="number"
                  min={unit === "px" ? 1 : 0.1}
                  step={unit === "px" ? 1 : "any"}
                  value={width}
                  onChange={(event) => updateDimension(Number(event.target.value), "width")}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Height
                <input
                  type="number"
                  min={unit === "px" ? 1 : 0.1}
                  step={unit === "px" ? 1 : "any"}
                  value={height}
                  onChange={(event) => updateDimension(Number(event.target.value), "height")}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Unit
                <select
                  value={unit}
                  onChange={(event) => updateUnit(event.target.value as PassportSizeUnit)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="mm">mm</option>
                  <option value="in">in</option>
                  <option value="px">px</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="passport-dpi">
              Print resolution
            </label>
            <select
              id="passport-dpi"
              value={dpi}
              onChange={(event) => setDpi(Number(event.target.value))}
              disabled={unit === "px"}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value={150}>150 DPI · screen</option>
              <option value={300}>300 DPI · print</option>
              <option value={600}>600 DPI · high detail</option>
            </select>

            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">Output pixels</span>
                <strong className="text-slate-950">
                  {output ? `${output.width} × ${output.height} px` : "Invalid size"}
                </strong>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-slate-600">Physical size</span>
                <span className="font-medium text-slate-900">
                  {unit === "px" ? "Pixel-defined" : formatPassportSize(width, height, unit)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-blue-700" />
              <h4 className="font-semibold text-slate-950">Crop &amp; background</h4>
            </div>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="passport-zoom">
              Photo zoom · {zoom.toFixed(2)}×
            </label>
            <input
              id="passport-zoom"
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-3 w-full accent-blue-600"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-700" htmlFor="passport-focus-x">
                Horizontal position
                <input
                  id="passport-focus-x"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={focusX}
                  onChange={(event) => setFocusX(Number(event.target.value))}
                  className="mt-3 w-full accent-blue-600"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700" htmlFor="passport-focus-y">
                Vertical position
                <input
                  id="passport-focus-y"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={focusY}
                  onChange={(event) => setFocusY(Number(event.target.value))}
                  className="mt-3 w-full accent-blue-600"
                />
              </label>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={removeBackground}
                onChange={(event) => setRemoveBackground(event.target.checked)}
                className="mt-1 h-4 w-4 accent-blue-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Clean up a plain background</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Best for an evenly lit wall or studio backdrop. Complex backgrounds are left unchanged with a warning.
                </span>
              </span>
            </label>

            {removeBackground && (
              <div className="mt-4 space-y-4">
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Replacement background</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BACKGROUND_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setBackgroundColor(color.value)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                          backgroundColor === color.value
                            ? "border-blue-500 bg-blue-50 text-blue-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        aria-label={`Use ${color.label.toLowerCase()} background`}
                      >
                        <span
                          className="h-4 w-4 rounded-full border border-slate-300"
                          style={{ backgroundColor: color.value }}
                        />
                        {color.label}
                      </button>
                    ))}
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                      Custom
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(event) => setBackgroundColor(event.target.value)}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                        aria-label="Custom background color"
                      />
                    </label>
                  </div>
                </div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="passport-tolerance">
                  Cleanup tolerance · {backgroundTolerance}%
                </label>
                <input
                  id="passport-tolerance"
                  type="range"
                  min={0}
                  max={100}
                  value={backgroundTolerance}
                  onChange={(event) => setBackgroundTolerance(Number(event.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-4 font-semibold text-slate-950">Export</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  format === "image/jpeg"
                    ? "border-blue-500 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                onClick={() => setFormat("image/jpeg")}
              >
                JPG
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  format === "image/png"
                    ? "border-blue-500 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                onClick={() => setFormat("image/png")}
              >
                PNG
              </button>
            </div>
            {format === "image/jpeg" && (
              <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="passport-quality">
                JPG quality · {Math.round(quality * 100)}%
              </label>
            )}
            {format === "image/jpeg" && (
              <input
                id="passport-quality"
                type="range"
                min={0.5}
                max={1}
                step={0.01}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="mt-3 w-full accent-blue-600"
              />
            )}

            {exportError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert">
                {exportError}
              </div>
            )}
            {exported && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900" role="status">
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Photo exported.</strong>
                    <p className="mt-1 break-all">{exported.name}</p>
                    <p>{(exported.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleExport}
              disabled={exporting || !output}
            >
              {exporting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              {exporting ? "Preparing photo…" : `Download ${format === "image/png" ? "PNG" : "JPG"}`}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              No upload, account, watermark, or cloud processing.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
