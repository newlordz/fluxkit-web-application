import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Printer,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
} from "lucide-react"
import ImageCropEditor from "./ImageCropEditor"
import { blobToDataUrl, fitCropToAspect } from "./imageEditing"
import {
  PASSPORT_PHOTO_PRESETS,
  formatPassportSize,
  getPassportCrop,
  getPassportPreset,
  loadPassportImage,
  renderPassportPhoto,
  resolveOutputDimensions,
  type PassportCrop,
  type PassportRenderOptions,
  type PassportSizeUnit,
} from "./passportPhoto"
import {
  createPassportA4Pdf,
  getPassportPrintLayout,
  getPassportPrintPhotos,
} from "./passportPrint"

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

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export default function PassportPhotoStudio({ file, onComplete }: PassportPhotoStudioProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<PassportCrop | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [presetId, setPresetId] = useState("us")
  const [customLabel, setCustomLabel] = useState("")
  const [unit, setUnit] = useState<PassportSizeUnit>("mm")
  const [width, setWidth] = useState(50.8)
  const [height, setHeight] = useState(50.8)
  const [dpi, setDpi] = useState(300)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState("#ffffff")
  const [backgroundTolerance, setBackgroundTolerance] = useState(28)
  const [format, setFormat] = useState<"image/jpeg" | "image/png">("image/jpeg")
  const [quality, setQuality] = useState(0.92)
  const [previewUrl, setPreviewUrl] = useState("")
  const [previewError, setPreviewError] = useState("")
  const [actualSize, setActualSize] = useState(false)
  const [showPrintSheet, setShowPrintSheet] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [printError, setPrintError] = useState("")
  const [exported, setExported] = useState<{ name: string; size: number } | null>(null)
  const cropAspectRef = useRef<number | null>(null)
  const imageUrlRef = useRef("")

  const selectedPreset = getPassportPreset(presetId)
  const { output, outputError } = useMemo(() => {
    try {
      return { output: resolveOutputDimensions(width, height, unit, dpi), outputError: "" }
    } catch (error) {
      return {
        output: null,
        outputError: error instanceof Error ? error.message : "Enter a valid width and height.",
      }
    }
  }, [width, height, unit, dpi])

  const physicalWidthMm = unit === "mm" ? width : unit === "in" ? width * 25.4 : output ? (output.width / dpi) * 25.4 : 0
  const physicalHeightMm = unit === "mm" ? height : unit === "in" ? height * 25.4 : output ? (output.height / dpi) * 25.4 : 0
  const printLayout = useMemo(() => {
    if (!output || physicalWidthMm <= 0 || physicalHeightMm <= 0) return null
    try {
      return getPassportPrintLayout(physicalWidthMm, physicalHeightMm)
    } catch {
      return null
    }
  }, [output, physicalWidthMm, physicalHeightMm])

  const renderOptions = useMemo<PassportRenderOptions>(
    () => ({
      width,
      height,
      unit,
      dpi,
      zoom: 1,
      focusX: 0.5,
      focusY: 0.5,
      crop: crop || undefined,
      removeBackground,
      backgroundColor,
      backgroundTolerance,
      format,
      quality,
    }),
    [width, height, unit, dpi, crop, removeBackground, backgroundColor, backgroundTolerance, format, quality],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError("")
    setImage(null)
    setCrop(null)
    setPreviewUrl("")
    setExported(null)
    cropAspectRef.current = null
    loadPassportImage(file)
      .then((loadedImage) => {
        if (!active) {
          URL.revokeObjectURL(loadedImage.src)
          return
        }
        imageUrlRef.current = loadedImage.src
        setImage(loadedImage)
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "The photo could not be opened.")
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

  useEffect(() => {
    if (!image || !output) return
    const nextAspect = output.width / output.height
    if (cropAspectRef.current === null) {
      cropAspectRef.current = nextAspect
      setCrop(getPassportCrop(image.naturalWidth, image.naturalHeight, output.width, output.height, 1, 0.5, 0.5))
      return
    }
    if (Math.abs(cropAspectRef.current - nextAspect) > 0.00001) {
      cropAspectRef.current = nextAspect
      setCrop((current) =>
        current
          ? fitCropToAspect(current, image.naturalWidth, image.naturalHeight, nextAspect)
          : getPassportCrop(image.naturalWidth, image.naturalHeight, output.width, output.height, 1, 0.5, 0.5),
      )
    }
  }, [image, output])

  useEffect(() => {
    if (!image || !output || !crop) return
    let active = true
    const timer = window.setTimeout(() => {
      const previewScale = actualSize ? 1 : Math.min(1, 640 / Math.max(output.width, output.height))
      const previewOptions: PassportRenderOptions = {
        ...renderOptions,
        unit: "px",
        width: Math.max(1, Math.round(output.width * previewScale)),
        height: Math.max(1, Math.round(output.height * previewScale)),
        dpi: 300,
      }
      setPreviewError("")
      renderPassportPhoto(image, previewOptions)
        .then((result) => blobToDataUrl(result.blob))
        .then((dataUrl) => {
          if (active) setPreviewUrl(dataUrl)
        })
        .catch((error) => {
          if (active) setPreviewError(error instanceof Error ? error.message : "The live preview could not be rendered.")
        })
    }, 100)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [image, output, crop, renderOptions, actualSize])

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
    if (!image || !output) return
    setCrop(getPassportCrop(image.naturalWidth, image.naturalHeight, output.width, output.height, 1, 0.5, 0.5))
    setExported(null)
  }

  function updateCrop(next: PassportCrop) {
    setCrop(next)
    setExported(null)
  }

  async function handleExport() {
    if (!image || !output || !crop) return
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
      downloadBlob(result.blob, name)
      setExported({ name, size: result.blob.size })
      onComplete(name)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The passport photo could not be exported.")
    } finally {
      setExporting(false)
    }
  }

  async function handlePrintSheet() {
    if (!image || !output || !crop || !printLayout) return
    setPrinting(true)
    setPrintError("")
    try {
      const rendered = await renderPassportPhoto(image, {
        ...renderOptions,
        format: "image/png",
        fillBackground: true,
      })
      const dataUrl = await blobToDataUrl(rendered.blob)
      const pdf = await createPassportA4Pdf(dataUrl, physicalWidthMm, physicalHeightMm)
      const name = `${fileStem(file.name)}-passport-a4-${physicalWidthMm.toFixed(1)}x${physicalHeightMm.toFixed(1)}mm.pdf`
      downloadBlob(pdf, name)
      setExported({ name, size: pdf.size })
      onComplete(name)
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : "The A4 print sheet could not be prepared.")
    } finally {
      setPrinting(false)
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

  if (loadError || !image || !crop) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>We could not prepare this photo.</strong>
            <p className="mt-1">{loadError || "Choose another photo if needed."}</p>
            <p className="mt-2 text-red-700">Use a JPG, PNG, WebP, or AVIF image.</p>
          </div>
        </div>
      </div>
    )
  }

  const displayOutput = output ?? {
    width: Math.max(1, Math.round(crop.width)),
    height: Math.max(1, Math.round(crop.height)),
  }
  const physicalSizeKnown = physicalWidthMm > 0 && physicalHeightMm > 0
  const printPhotos = printLayout ? getPassportPrintPhotos(printLayout) : []

  return (
    <section className="mt-6 overflow-clip rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Passport Photo Studio</h3>
          <p className="mt-1 text-sm text-slate-600">Crop directly on your photo, see the exact final size, and export a photo or A4 print sheet.</p>
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
              <h4 className="font-semibold text-slate-950">Crop your photo</h4>
              <p className="mt-1 text-xs text-slate-500">The white frame is the exact area included in the final photo.</p>
            </div>
            <button type="button" className="text-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50" onClick={resetCrop} disabled={!output}>
              <RotateCcw className="h-4 w-4" />
              Reset crop
            </button>
          </div>

          <ImageCropEditor
            image={image}
            crop={crop}
            aspect={displayOutput.width / displayOutput.height}
            onChange={updateCrop}
            label="Passport photo crop editor"
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-700">FINAL PIXEL SIZE</p>
              <p className="mt-1 text-sm font-bold text-blue-950">{output ? `${output.width} × ${output.height} px` : "Enter a valid size"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">PHYSICAL SIZE</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{physicalSizeKnown ? `${physicalWidthMm.toFixed(1)} × ${physicalHeightMm.toFixed(1)} mm` : "—"}</p>
              <p className="mt-1 text-xs text-slate-500">{physicalSizeKnown ? `${(physicalWidthMm / 25.4).toFixed(2)} × ${(physicalHeightMm / 25.4).toFixed(2)} in` : "Enter a width and height above zero."}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">SELECTED SOURCE AREA</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{Math.round(crop.width)} × {Math.round(crop.height)} px</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-950">Final result preview</h4>
                <p className="mt-1 text-xs text-slate-500">Same crop, same output ratio, same background as your download.</p>
              </div>
              <div className="flex rounded-lg border border-slate-200 p-1">
                <button type="button" onClick={() => setActualSize(false)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${!actualSize ? "bg-blue-600 text-white" : "text-slate-600"}`}>Fit to screen</button>
                <button type="button" onClick={() => setActualSize(true)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${actualSize ? "bg-blue-600 text-white" : "text-slate-600"}`}>1:1 pixels</button>
              </div>
            </div>
            <div className="mt-4 flex min-h-52 items-center justify-center overflow-auto rounded-xl bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:24px_24px] p-5">
              {output && previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Final passport photo preview"
                  className="select-none rounded-sm shadow-lg"
                  style={actualSize ? { width: displayOutput.width, height: displayOutput.height, maxWidth: "none" } : { maxHeight: 420, maxWidth: "100%" }}
                  draggable={false}
                />
              ) : output ? (
                <div className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Rendering preview…
                </div>
              ) : (
                <div className="rounded-lg bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                  Enter a valid width and height to render the preview.
                </div>
              )}
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
              <Maximize2 className="mt-0.5 h-4 w-4 shrink-0" />
              {actualSize
                ? "1:1 pixels means one image pixel equals one screen pixel. It is not a calibrated physical ruler; use the A4 PDF for exact print dimensions."
                : "This preview is scaled to fit your screen. The downloaded file keeps the exact pixel and physical dimensions shown above."}
            </p>
            {previewError && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div><strong>Preview needs attention.</strong><p className="mt-1">{previewError}</p></div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
            <strong>Check the receiving authority’s current rules.</strong> Photo dimensions, head size, expression, background, recency, and submission format vary by country and document type. This tool prepares the image; it does not guarantee acceptance.
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-700" />
              <h4 className="font-semibold text-slate-950">Country &amp; dimensions</h4>
            </div>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="passport-country">Country / photo preset</label>
            <select
              id="passport-country"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={presetId}
              onChange={(event) => applyPreset(event.target.value)}
            >
              {PASSPORT_PHOTO_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label} · {preset.widthMm} × {preset.heightMm} mm</option>
              ))}
              <option value="custom">Custom country / size</option>
            </select>
            {presetId === "custom" && (
              <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="passport-custom-label">
                Country / document label
                <input id="passport-custom-label" type="text" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="e.g. Kenya passport" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
            )}
            <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
              {selectedPreset
                ? `${selectedPreset.widthMm} × ${selectedPreset.heightMm} mm${output ? ` · ${output.width} × ${output.height} px at ${dpi} DPI` : ""}. Verify current authority rules.`
                : "Enter the exact physical or pixel dimensions required by your authority."}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <label className="text-xs font-semibold text-slate-700">
                Width
                <input type="number" min={unit === "px" ? 1 : 0.1} step={unit === "px" ? 1 : "any"} value={width} onChange={(event) => updateDimension(Number(event.target.value), "width")} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Height
                <input type="number" min={unit === "px" ? 1 : 0.1} step={unit === "px" ? 1 : "any"} value={height} onChange={(event) => updateDimension(Number(event.target.value), "height")} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Unit
                <select value={unit} onChange={(event) => updateUnit(event.target.value as PassportSizeUnit)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="mm">mm</option>
                  <option value="in">in</option>
                  <option value="px">px</option>
                </select>
              </label>
            </div>
            {!output && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950" role="alert">
                {outputError}
              </p>
            )}

            <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="passport-dpi">Print resolution</label>
            <select
              id="passport-dpi"
              value={dpi}
              onChange={(event) => { setDpi(Number(event.target.value)); setExported(null) }}
              disabled={unit === "px"}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value={150}>150 DPI · screen</option>
              <option value={300}>300 DPI · print</option>
              <option value={600}>600 DPI · high detail</option>
            </select>

            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="text-slate-600">Output pixels</span><strong className="text-slate-950">{output ? `${output.width} × ${output.height} px` : "Invalid size"}</strong></div>
              <div className="mt-1 flex items-center justify-between gap-3"><span className="text-slate-600">Entered size</span><span className="font-medium text-slate-900">{formatPassportSize(width, height, unit)}</span></div>
              <div className="mt-1 flex items-center justify-between gap-3"><span className="text-slate-600">Physical size</span><span className="font-medium text-slate-900">{physicalSizeKnown ? `${physicalWidthMm.toFixed(1)} × ${physicalHeightMm.toFixed(1)} mm` : "—"}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-blue-700" />
              <h4 className="font-semibold text-slate-950">Crop &amp; background</h4>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
              Drag inside the white frame on your photo to position your head and shoulders. Pull any handle to zoom or reframe. The frame stays locked to the final photo ratio.
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" checked={removeBackground} onChange={(event) => { setRemoveBackground(event.target.checked); setExported(null) }} className="mt-1 h-4 w-4 accent-blue-600" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Clean up a plain background</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Best for an evenly lit wall or studio backdrop. Complex backgrounds are rejected instead of erased.</span>
              </span>
            </label>
            {removeBackground && (
              <div className="mt-4 space-y-4">
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Replacement background</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BACKGROUND_COLORS.map((color) => (
                      <button key={color.value} type="button" onClick={() => setBackgroundColor(color.value)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${backgroundColor === color.value ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} aria-label={`Use ${color.label.toLowerCase()} background`}>
                        <span className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: color.value }} />
                        {color.label}
                      </button>
                    ))}
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Custom<input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" aria-label="Custom background color" /></label>
                  </div>
                </div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="passport-tolerance">Cleanup tolerance · {backgroundTolerance}%</label>
                <input id="passport-tolerance" type="range" min={0} max={100} value={backgroundTolerance} onChange={(event) => setBackgroundTolerance(Number(event.target.value))} className="w-full accent-blue-600" />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-4 font-semibold text-slate-950">Export photo</h4>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold ${format === "image/jpeg" ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setFormat("image/jpeg")}>JPG</button>
              <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold ${format === "image/png" ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setFormat("image/png")}>PNG</button>
            </div>
            {format === "image/jpeg" && (
              <>
                <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="passport-quality">JPG quality · {Math.round(quality * 100)}%</label>
                <input id="passport-quality" type="range" min={0.5} max={1} step={0.01} value={quality} onChange={(event) => setQuality(Number(event.target.value))} className="mt-3 w-full accent-blue-600" />
              </>
            )}
            {exportError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert">{exportError}</div>}
            <button type="button" className="primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" onClick={handleExport} disabled={exporting || !output}>
              {exporting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              {exporting ? "Preparing photo…" : `Download ${format === "image/png" ? "PNG" : "JPG"}`}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">No upload, account, watermark, or cloud processing.</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2"><Ruler className="h-5 w-5 text-blue-700" /><h4 className="font-semibold text-slate-950">Exact-size A4 print sheet</h4></div>
            <p className="text-xs leading-5 text-slate-600">
              {!output
                ? "Enter a valid size to calculate how many photos fit on A4."
                : printLayout
                  ? `${printLayout.copies} photos per A4 sheet, each ${physicalWidthMm.toFixed(1)} × ${physicalHeightMm.toFixed(1)} mm, with cut guides.`
                  : "This custom size does not fit an A4 sheet with a 10 mm margin. Reduce the physical dimensions to enable a print sheet."}
            </p>
            {printLayout && (
              <button type="button" onClick={() => setShowPrintSheet((current) => !current)} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Printer className="h-4 w-4" />
                {showPrintSheet ? "Hide sheet preview" : "Preview A4 sheet"}
              </button>
            )}
            {showPrintSheet && printLayout && (
              <div className="mt-4 rounded-lg bg-slate-100 p-3">
                <div className="relative mx-auto aspect-[210/297] w-full max-w-[280px] overflow-hidden bg-white shadow-md" aria-label={`A4 sheet with ${printLayout.copies} passport photos`}>
                  {printPhotos.map((photo, index) => (
                    <div
                      key={index}
                      className="absolute border border-dashed border-slate-400 bg-cover bg-center"
                      style={{
                        left: `${(photo.xMm / 210) * 100}%`,
                        top: `${((297 - photo.yMm - photo.heightMm) / 297) * 100}%`,
                        width: `${(photo.widthMm / 210) * 100}%`,
                        height: `${(photo.heightMm / 297) * 100}%`,
                        backgroundImage: previewUrl ? `url(${previewUrl})` : undefined,
                      }}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">Sheet preview is scaled down. The PDF contains exact physical dimensions.</p>
              </div>
            )}
            {printError && <p className="mt-3 text-xs leading-5 text-red-700" role="alert">{printError}</p>}
            <button type="button" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-600 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60" onClick={handlePrintSheet} disabled={printing || !printLayout}>
              {printing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
              {printing ? "Preparing A4 PDF…" : "Download A4 print sheet"}
            </button>
            <p className="mt-3 text-xs leading-5 text-slate-500">Open the PDF and print at <strong>Actual size / 100%</strong> on A4. Do not use “Fit to page.”</p>
          </div>

          {exported && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900" role="status">
              <div className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>File exported.</strong><p className="mt-1 break-all">{exported.name}</p><p>{(exported.size / 1024).toFixed(1)} KB</p></div></div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
