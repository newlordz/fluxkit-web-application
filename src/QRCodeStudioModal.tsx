import React, { useState, useEffect, useRef } from "react"
import QRCode from "qrcode"
import {
  X,
  Download,
  Copy,
  Check,
  Sparkles,
  Palette,
  Shapes,
  Image as ImageIcon,
  Sliders,
  RotateCcw,
  Upload,
  Trash2,
  Share2,
  FileCode,
  Link as LinkIcon,
  Wifi,
  Mail,
  MessageCircle,
  Star,
  Heart,
  Phone,
  MapPin,
  Globe,
  ShoppingCart,
  QrCode,
  CheckCircle2,
} from "lucide-react"

export interface QRCodeStudioModalProps {
  value: string
  isOpen: boolean
  onClose: () => void
  onApply: (dataUrl: string) => void
}

type DotStyle = "square" | "rounded" | "dots" | "classy"
type CornerStyle = "square" | "rounded" | "circle"
type FrameStyle = "none" | "banner-bottom" | "polaroid" | "minimal-pill"
type ColorMode = "solid" | "linear-gradient" | "radial-gradient"
type ErrorCorrectionLevel = "L" | "M" | "Q" | "H"

interface CustomLogo {
  src: string
  name: string
}

const COLOR_PRESETS = [
  { name: "Midnight Black", color: "#0f172a" },
  { name: "Electric Indigo", color: "#4f46e5" },
  { name: "Royal Blue", color: "#2563eb" },
  { name: "Emerald", color: "#059669" },
  { name: "Crimson Rose", color: "#e11d48" },
  { name: "Sunset Orange", color: "#ea580c" },
  { name: "Amethyst Violet", color: "#7c3aed" },
  { name: "Cyber Cyan", color: "#0891b2" },
]

const BG_PRESETS = [
  { name: "Pure White", color: "#ffffff" },
  { name: "Clean Off-White", color: "#f8fafc" },
  { name: "Dark Velvet", color: "#0f172a" },
  { name: "Subtle Cream", color: "#fefce8" },
]

const LOGO_PRESETS = [
  { id: "link", label: "Link", icon: LinkIcon },
  { id: "wifi", label: "Wi-Fi", icon: Wifi },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "email", label: "Email", icon: Mail },
  { id: "phone", label: "Phone", icon: Phone },
  { id: "globe", label: "Website", icon: Globe },
  { id: "location", label: "Location", icon: MapPin },
  { id: "star", label: "Star", icon: Star },
  { id: "heart", label: "Heart", icon: Heart },
  { id: "cart", label: "Shop", icon: ShoppingCart },
]

export default function QRCodeStudioModal({
  value,
  isOpen,
  onClose,
  onApply,
}: QRCodeStudioModalProps) {
  // Active configuration tabs
  const [activeTab, setActiveTab] =
    useState<"colors" | "shapes" | "logo" | "frame" | "settings">("colors")

  // Color options
  const [colorMode, setColorMode] = useState<ColorMode>("solid")
  const [fgColor, setFgColor] = useState("#0f172a")
  const [fgColor2, setFgColor2] = useState("#4f46e5")
  const [bgColor, setBgColor] = useState("#ffffff")
  const [isTransparent, setIsTransparent] = useState(false)
  const [customEyeColor, setCustomEyeColor] = useState(false)
  const [eyeColor, setEyeColor] = useState("#4f46e5")

  // Shapes & patterns
  const [dotStyle, setDotStyle] = useState<DotStyle>("rounded")
  const [cornerOuterStyle, setCornerOuterStyle] =
    useState<CornerStyle>("rounded")
  const [cornerInnerStyle, setCornerInnerStyle] =
    useState<CornerStyle>("circle")

  // Logo & Branding
  const [hasLogo, setHasLogo] = useState(false)
  const [selectedPresetLogo, setSelectedPresetLogo] = useState<string>("link")
  const [uploadedLogo, setUploadedLogo] = useState<CustomLogo | null>(null)
  const [logoShape, setLogoShape] = useState<"circle" | "rounded" | "square">(
    "circle",
  )
  const [logoSizePercent, setLogoSizePercent] = useState<number>(22) // percentage of QR width (15-28%)
  const [logoBgColor, setLogoBgColor] = useState("#ffffff")

  // Frame & Text
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("none")
  const [frameText, setFrameText] = useState("SCAN ME")
  const [frameColor, setFrameColor] = useState("#0f172a")
  const [frameTextColor, setFrameTextColor] = useState("#ffffff")

  // Settings
  const [ecl, setEcl] = useState<ErrorCorrectionLevel>("H")
  const [margin, setMargin] = useState(2)
  const [resolution, setResolution] = useState(1000)

  // Status & copy feedback
  const [copied, setCopied] = useState(false)
  const [currentDataUrl, setCurrentDataUrl] = useState<string>("")
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-switch to High error correction if logo is enabled to ensure 100% scan integrity
  useEffect(() => {
    if (hasLogo && (ecl === "L" || ecl === "M")) {
      setEcl("H")
    }
  }, [hasLogo, ecl])

  // Draw the custom QR code
  useEffect(() => {
    if (!isOpen || !value) return
    renderCustomQR()
  }, [
    isOpen,
    value,
    colorMode,
    fgColor,
    fgColor2,
    bgColor,
    isTransparent,
    customEyeColor,
    eyeColor,
    dotStyle,
    cornerOuterStyle,
    cornerInnerStyle,
    hasLogo,
    selectedPresetLogo,
    uploadedLogo,
    logoShape,
    logoSizePercent,
    logoBgColor,
    frameStyle,
    frameText,
    frameColor,
    frameTextColor,
    ecl,
    margin,
    resolution,
  ])

  // Helper: Round Rectangle path fallback
  function drawRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    if (typeof (ctx as any).roundRect === "function") {
      ;(ctx as any).roundRect(x, y, w, h, r)
    } else {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }
  }

  // Helper: Check if module belongs to one of the 3 corner finder patterns (7x7)
  function isCornerEye(row: number, col: number, size: number) {
    if (row < 7 && col < 7) return true
    if (row < 7 && col >= size - 7) return true
    if (row >= size - 7 && col < 7) return true
    return false
  }

  // Draw Corner Eye Frame & Dot with custom styles
  function drawCornerEye(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    eyeSizePx: number,
    outerStyle: CornerStyle,
    innerStyle: CornerStyle,
    fillColor: string | CanvasGradient,
  ) {
    const cellSize = eyeSizePx / 7
    ctx.save()
    ctx.fillStyle = fillColor

    // Outer Frame (7x7 with 5x5 hollow inner cutout)
    ctx.beginPath()
    const outerRadius =
      outerStyle === "circle"
        ? eyeSizePx / 2
        : outerStyle === "rounded"
          ? cellSize * 1.8
          : 0
    drawRoundRect(ctx, startX, startY, eyeSizePx, eyeSizePx, outerRadius)

    // Inner cutout (5x5 cutout starting at cell 1,1)
    const cutX = startX + cellSize
    const cutY = startY + cellSize
    const cutSize = cellSize * 5
    const cutRadius =
      outerStyle === "circle"
        ? cutSize / 2
        : outerStyle === "rounded"
          ? cellSize * 1.2
          : 0
    drawRoundRect(ctx, cutX, cutY, cutSize, cutSize, cutRadius)
    ctx.fill("evenodd")

    // Center Dot (3x3 starting at cell 2,2)
    ctx.beginPath()
    const dotX = startX + cellSize * 2
    const dotY = startY + cellSize * 2
    const dotSize = cellSize * 3
    const dotRadius =
      innerStyle === "circle"
        ? dotSize / 2
        : innerStyle === "rounded"
          ? cellSize * 1.2
          : 0
    drawRoundRect(ctx, dotX, dotY, dotSize, dotSize, dotRadius)
    ctx.fill()

    ctx.restore()
  }

  // Main Render Function
  async function renderCustomQR() {
    try {
      const qrData = QRCode.create(value, {
        errorCorrectionLevel: ecl,
      })

      const modules = qrData.modules
      const moduleCount = modules.size

      // Canvas dimensions
      const canvasSize = resolution
      const hasFrameBanner = frameStyle === "banner-bottom"
      const hasPolaroid = frameStyle === "polaroid"
      const hasMinimalPill = frameStyle === "minimal-pill"

      // Extra height needed for frames
      const bannerHeight = hasFrameBanner
        ? canvasSize * 0.18
        : hasPolaroid
          ? canvasSize * 0.24
          : hasMinimalPill
            ? canvasSize * 0.15
            : 0
      const totalWidth = canvasSize
      const totalHeight = canvasSize + bannerHeight

      const canvas = document.createElement("canvas")
      canvas.width = totalWidth
      canvas.height = totalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // Smooth rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      // 1. Draw Background
      if (!isTransparent) {
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, totalWidth, totalHeight)
      } else {
        ctx.clearRect(0, 0, totalWidth, totalHeight)
      }

      // Compute QR Drawing Area
      const qrPadding = margin * (canvasSize / (moduleCount + margin * 2))
      const qrDrawSize = canvasSize - qrPadding * 2
      const cellSize = qrDrawSize / moduleCount
      const offsetX = qrPadding
      const offsetY = qrPadding

      // 2. Prepare Foreground Fill (Solid or Gradient)
      let fgFill: string | CanvasGradient = fgColor
      if (colorMode === "linear-gradient") {
        const grad = ctx.createLinearGradient(
          offsetX,
          offsetY,
          offsetX + qrDrawSize,
          offsetY + qrDrawSize,
        )
        grad.addColorStop(0, fgColor)
        grad.addColorStop(1, fgColor2)
        fgFill = grad
      } else if (colorMode === "radial-gradient") {
        const cx = offsetX + qrDrawSize / 2
        const cy = offsetY + qrDrawSize / 2
        const grad = ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          qrDrawSize * 0.7,
        )
        grad.addColorStop(0, fgColor)
        grad.addColorStop(1, fgColor2)
        fgFill = grad
      }

      const eyeFill = customEyeColor ? eyeColor : fgFill

      // 3. Define Center Logo Exclusion Zone (if logo enabled)
      const centerModule = moduleCount / 2
      const logoModuleRadius = hasLogo
        ? Math.ceil((moduleCount * (logoSizePercent / 100)) / 2) + 0.5
        : 0

      // 4. Draw QR Body Modules (skipping finder patterns and logo zone)
      ctx.fillStyle = fgFill
      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (!modules.get(r, c)) continue

          // Skip finder patterns
          if (isCornerEye(r, c, moduleCount)) continue

          // Skip center logo zone
          if (hasLogo) {
            const distCenter = Math.max(
              Math.abs(r - centerModule),
              Math.abs(c - centerModule),
            )
            if (distCenter <= logoModuleRadius) continue
          }

          const cellX = offsetX + c * cellSize
          const cellY = offsetY + r * cellSize

          ctx.beginPath()
          if (dotStyle === "dots") {
            const radius = (cellSize / 2) * 0.92
            ctx.arc(
              cellX + cellSize / 2,
              cellY + cellSize / 2,
              radius,
              0,
              Math.PI * 2,
            )
            ctx.fill()
          } else if (dotStyle === "rounded") {
            const radius = cellSize * 0.36
            drawRoundRect(
              ctx,
              cellX + 0.5,
              cellY + 0.5,
              cellSize - 1,
              cellSize - 1,
              radius,
            )
            ctx.fill()
          } else if (dotStyle === "classy") {
            // Squircle / petal shape
            const radius = cellSize * 0.45
            drawRoundRect(
              ctx,
              cellX + 0.5,
              cellY + 0.5,
              cellSize - 1,
              cellSize - 1,
              radius,
            )
            ctx.fill()
          } else {
            // Standard crisp square
            ctx.fillRect(cellX, cellY, cellSize + 0.2, cellSize + 0.2)
          }
        }
      }

      // 5. Draw the 3 Corner Finder Eyes
      const eyeSizePx = cellSize * 7
      // Top-Left
      drawCornerEye(
        ctx,
        offsetX,
        offsetY,
        eyeSizePx,
        cornerOuterStyle,
        cornerInnerStyle,
        eyeFill,
      )
      // Top-Right
      drawCornerEye(
        ctx,
        offsetX + (moduleCount - 7) * cellSize,
        offsetY,
        eyeSizePx,
        cornerOuterStyle,
        cornerInnerStyle,
        eyeFill,
      )
      // Bottom-Left
      drawCornerEye(
        ctx,
        offsetX,
        offsetY + (moduleCount - 7) * cellSize,
        eyeSizePx,
        cornerOuterStyle,
        cornerInnerStyle,
        eyeFill,
      )

      // 6. Draw Center Logo (if enabled)
      if (hasLogo) {
        const logoSizePx = qrDrawSize * (logoSizePercent / 100)
        const logoX = offsetX + (qrDrawSize - logoSizePx) / 2
        const logoY = offsetY + (qrDrawSize - logoSizePx) / 2

        // Draw Logo Background Badge
        ctx.save()
        ctx.fillStyle = logoBgColor
        ctx.shadowColor = "rgba(0,0,0,0.14)"
        ctx.shadowBlur = canvasSize * 0.015
        ctx.shadowOffsetY = canvasSize * 0.005

        const badgePadding = logoSizePx * 0.16
        const badgeX = logoX - badgePadding / 2
        const badgeY = logoY - badgePadding / 2
        const badgeSize = logoSizePx + badgePadding

        ctx.beginPath()
        if (logoShape === "circle") {
          ctx.arc(
            badgeX + badgeSize / 2,
            badgeY + badgeSize / 2,
            badgeSize / 2,
            0,
            Math.PI * 2,
          )
        } else if (logoShape === "rounded") {
          drawRoundRect(
            ctx,
            badgeX,
            badgeY,
            badgeSize,
            badgeSize,
            badgeSize * 0.24,
          )
        } else {
          ctx.rect(badgeX, badgeY, badgeSize, badgeSize)
        }
        ctx.fill()
        ctx.restore()

        // Draw Image / Icon inside badge
        if (uploadedLogo && uploadedLogo.src) {
          await new Promise<void>((resolve) => {
            const img = new window.Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
              ctx.save()
              ctx.beginPath()
              if (logoShape === "circle") {
                ctx.arc(
                  logoX + logoSizePx / 2,
                  logoY + logoSizePx / 2,
                  logoSizePx / 2,
                  0,
                  Math.PI * 2,
                )
              } else if (logoShape === "rounded") {
                drawRoundRect(
                  ctx,
                  logoX,
                  logoY,
                  logoSizePx,
                  logoSizePx,
                  logoSizePx * 0.2,
                )
              } else {
                ctx.rect(logoX, logoY, logoSizePx, logoSizePx)
              }
              ctx.clip()
              ctx.drawImage(img, logoX, logoY, logoSizePx, logoSizePx)
              ctx.restore()
              resolve()
            }
            img.onerror = () => resolve()
            img.src = uploadedLogo.src
          })
        } else {
          // Draw Preset Vector Icon
          ctx.save()
          ctx.fillStyle = fgColor
          ctx.strokeStyle = fgColor
          ctx.lineWidth = logoSizePx * 0.08
          ctx.lineCap = "round"
          ctx.lineJoin = "round"

          const cx = logoX + logoSizePx / 2
          const cy = logoY + logoSizePx / 2
          const iconR = logoSizePx * 0.35

          // Simplified Crisp Shapes for Common Presets
          ctx.beginPath()
          if (selectedPresetLogo === "link" || selectedPresetLogo === "globe") {
            ctx.arc(cx, cy, iconR, 0, Math.PI * 2)
            ctx.stroke()
            ctx.beginPath()
            ctx.ellipse(cx, cy, iconR * 0.45, iconR, 0, 0, Math.PI * 2)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(cx - iconR, cy)
            ctx.lineTo(cx + iconR, cy)
            ctx.stroke()
          } else if (selectedPresetLogo === "star") {
            const spikes = 5
            const outerR = iconR
            const innerR = iconR * 0.45
            let rot = (Math.PI / 2) * 3
            let step = Math.PI / spikes
            ctx.beginPath()
            ctx.moveTo(cx, cy - outerR)
            for (let i = 0; i < spikes; i++) {
              ctx.lineTo(
                cx + Math.cos(rot) * outerR,
                cy + Math.sin(rot) * outerR,
              )
              rot += step
              ctx.lineTo(
                cx + Math.cos(rot) * innerR,
                cy + Math.sin(rot) * innerR,
              )
              rot += step
            }
            ctx.lineTo(cx, cy - outerR)
            ctx.closePath()
            ctx.fill()
          } else if (selectedPresetLogo === "heart") {
            ctx.beginPath()
            const topY = cy - iconR * 0.5
            ctx.moveTo(cx, topY + iconR * 0.8)
            ctx.bezierCurveTo(
              cx - iconR,
              topY,
              cx - iconR * 1.1,
              topY - iconR * 0.6,
              cx,
              topY - iconR * 0.2,
            )
            ctx.bezierCurveTo(
              cx + iconR * 1.1,
              topY - iconR * 0.6,
              cx + iconR,
              topY,
              cx,
              topY + iconR * 0.8,
            )
            ctx.fill()
          } else if (selectedPresetLogo === "wifi") {
            for (let i = 1; i <= 3; i++) {
              ctx.beginPath()
              ctx.arc(
                cx,
                cy + iconR * 0.5,
                iconR * (i * 0.38),
                Math.PI * 1.25,
                Math.PI * 1.75,
              )
              ctx.stroke()
            }
            ctx.beginPath()
            ctx.arc(cx, cy + iconR * 0.5, iconR * 0.16, 0, Math.PI * 2)
            ctx.fill()
          } else {
            // Default elegant QR Mark
            ctx.beginPath()
            ctx.arc(cx, cy, iconR * 0.75, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()
        }
      }

      // 7. Draw Frame & Banner Call-To-Action (if enabled)
      if (hasFrameBanner || hasPolaroid || hasMinimalPill) {
        ctx.save()
        const text = frameText.trim() || "SCAN ME"

        if (hasFrameBanner) {
          const bannerY = canvasSize - qrPadding * 0.5
          const bannerH = bannerHeight * 0.85
          const bannerW = canvasSize * 0.82
          const bannerX = (canvasSize - bannerW) / 2

          ctx.fillStyle = frameColor
          drawRoundRect(ctx, bannerX, bannerY, bannerW, bannerH, bannerH * 0.3)
          ctx.fill()

          ctx.fillStyle = frameTextColor
          ctx.font = `bold ${Math.round(bannerH * 0.42)}px 'Manrope', -apple-system, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(text, canvasSize / 2, bannerY + bannerH / 2)
        } else if (hasPolaroid) {
          ctx.fillStyle = frameColor
          ctx.font = `bold ${Math.round(bannerHeight * 0.35)}px 'Manrope', -apple-system, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(text, canvasSize / 2, canvasSize + bannerHeight * 0.45)
        } else if (hasMinimalPill) {
          const pillH = bannerHeight * 0.7
          const pillW = Math.min(
            canvasSize * 0.65,
            text.length * pillH * 0.6 + pillH * 1.5,
          )
          const pillX = (canvasSize - pillW) / 2
          const pillY = canvasSize

          ctx.fillStyle = frameColor
          drawRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
          ctx.fill()

          ctx.fillStyle = frameTextColor
          ctx.font = `bold ${Math.round(pillH * 0.45)}px 'Manrope', -apple-system, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(text, canvasSize / 2, pillY + pillH / 2)
        }
        ctx.restore()
      }

      // 8. Output DataURL and update state
      const url = canvas.toDataURL("image/png")
      setCurrentDataUrl(url)
    } catch (err) {
      console.error("Failed to render custom QR code", err)
    }
  }

  // Handle Logo Upload
  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setUploadedLogo({
        src: reader.result as string,
        name: file.name,
      })
      setHasLogo(true)
      setEcl("H")
    }
    reader.readAsDataURL(file)
  }

  // Download Handlers
  function handleDownloadPNG() {
    if (!currentDataUrl) return
    const a = document.createElement("a")
    a.href = currentDataUrl
    a.download = `fluxkit-qr-${Date.now()}.png`
    a.click()
  }

  function handleDownloadJPEG() {
    if (!currentDataUrl) return
    // Draw onto canvas with solid white bg for clean JPEG
    const canvas = document.createElement("canvas")
    const img = new Image()
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const jpegUrl = canvas.toDataURL("image/jpeg", 0.95)
      const a = document.createElement("a")
      a.href = jpegUrl
      a.download = `fluxkit-qr-${Date.now()}.jpg`
      a.click()
    }
    img.src = currentDataUrl
  }

  // Download Vector SVG
  async function handleDownloadSVG() {
    try {
      const qrData = QRCode.create(value, { errorCorrectionLevel: ecl })
      const modules = qrData.modules
      const size = modules.size
      const svgPadding = margin * 2
      const totalSize = size + svgPadding

      let paths = ""
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (modules.get(r, c)) {
            const x = c + margin
            const y = r + margin
            if (dotStyle === "dots") {
              paths += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.46" fill="${fgColor}" />`
            } else if (dotStyle === "rounded") {
              paths += `<rect x="${x}" y="${y}" width="0.96" height="0.96" rx="0.32" fill="${fgColor}" />`
            } else {
              paths += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fgColor}" />`
            }
          }
        }
      }

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="1000" height="1000">
  ${
    !isTransparent
      ? `<rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" />`
      : ""
  }
  ${paths}
</svg>`

      const blob = new Blob([svgContent], {
        type: "image/svg+xml;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `fluxkit-qr-${Date.now()}.svg`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      console.error("SVG generation error", err)
    }
  }

  // Copy to Clipboard
  async function handleCopyImage() {
    if (!currentDataUrl) return
    try {
      const res = await fetch(currentDataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
      setCopied(false)
    }
  }

  // Apply to Main Result Panel
  function handleApply() {
    if (currentDataUrl) {
      onApply(currentDataUrl)
      onClose()
    }
  }

  // Reset to Defaults
  function handleReset() {
    setColorMode("solid")
    setFgColor("#0f172a")
    setFgColor2("#4f46e5")
    setBgColor("#ffffff")
    setIsTransparent(false)
    setCustomEyeColor(false)
    setDotStyle("rounded")
    setCornerOuterStyle("rounded")
    setCornerInnerStyle("circle")
    setHasLogo(false)
    setUploadedLogo(null)
    setFrameStyle("none")
    setFrameText("SCAN ME")
    setEcl("H")
    setMargin(2)
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10, 12, 18, 0.78)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1080px",
          maxHeight: "92vh",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          boxShadow:
            "0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)",
              }}
            >
              <QrCode size={22} />
            </div>
            <div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <h2
                  style={{
                    fontSize: "19px",
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: "-0.02em",
                    color: "var(--text)",
                  }}
                >
                  QR Code Studio &amp; Customizer
                </h2>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "#a5b4fc",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Live Designer
                </span>
              </div>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "13px",
                  color: "var(--muted)",
                }}
              >
                Personalize colors, dot geometries, corner eyes, center logos,
                and stylish frames.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              className="text-button"
              onClick={handleReset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                padding: "7px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                color: "var(--muted)",
              }}
              title="Reset all settings to default"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--muted)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              aria-label="Close customizer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Main Body (2 Columns) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 420px) 1fr",
            flex: 1,
            overflow: "hidden",
          }}
        >
          {/* Left Column: Live Interactive Preview Card */}
          <div
            style={{
              padding: "26px",
              background: "var(--surface-hover)",
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              overflowY: "auto",
            }}
          >
            {/* Live Canvas Preview Frame */}
            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "280px",
                  height: "280px",
                  background: isTransparent
                    ? "repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 16px 16px"
                    : bgColor,
                  borderRadius: "18px",
                  boxShadow:
                    "0 16px 36px -8px rgba(0, 0, 0, 0.18), 0 0 0 1px var(--border)",
                  padding: "16px",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  transition: "background 0.25s ease",
                }}
              >
                {currentDataUrl ? (
                  <img
                    src={currentDataUrl}
                    alt="Custom QR Preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      imageRendering: "auto",
                    }}
                  />
                ) : (
                  <div style={{ color: "var(--muted)", fontSize: "13px" }}>
                    Rendering…
                  </div>
                )}
              </div>

              {/* Quality & Reliability Indicator Badges */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: "18px",
                  fontSize: "12px",
                  color: "var(--muted)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "3px 9px",
                    borderRadius: "9999px",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#10b981",
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={13} /> 100% Scannable
                </span>
                <span>•</span>
                <span>
                  ECL Level: <strong>{ecl}</strong>
                </span>
                <span>•</span>
                <span>HD Quality</span>
              </div>
            </div>

            {/* Quick Export Actions */}
            <div style={{ width: "100%", marginTop: "24px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "12px",
                }}
              >
                <button
                  type="button"
                  className="primary"
                  onClick={handleDownloadPNG}
                  style={{
                    padding: "11px 14px",
                    fontSize: "13.5px",
                    fontWeight: 600,
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <Download size={15} /> Download PNG
                </button>

                <button
                  type="button"
                  className="text-button"
                  onClick={handleDownloadSVG}
                  style={{
                    padding: "11px 14px",
                    fontSize: "13.5px",
                    fontWeight: 600,
                    borderRadius: "10px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                  title="Download scalable vector SVG for print or Adobe Illustrator"
                >
                  <FileCode size={15} /> Vector SVG
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="text-button"
                  onClick={handleCopyImage}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    fontSize: "12.5px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={14} color="#10b981" /> Copied Image!
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy to Clipboard
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="text-button"
                  onClick={handleDownloadJPEG}
                  style={{
                    padding: "9px 12px",
                    fontSize: "12.5px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                  }}
                  title="Download standard JPEG"
                >
                  JPG
                </button>
              </div>

              {/* Primary Apply Button */}
              <button
                type="button"
                className="primary"
                onClick={handleApply}
                style={{
                  width: "100%",
                  marginTop: "12px",
                  padding: "12px 18px",
                  fontSize: "14px",
                  fontWeight: 700,
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  borderColor: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 4px 16px rgba(16, 185, 129, 0.25)",
                }}
              >
                <Check size={16} /> Apply &amp; Update Main Result
              </button>
            </div>
          </div>

          {/* Right Column: Customization Controls with Tabs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {/* Studio Navigation Tabs */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg)",
                padding: "0 12px",
                gap: "6px",
                overflowX: "auto",
              }}
            >
              {[
                { id: "colors", label: "Colors", icon: Palette },
                { id: "shapes", label: "Shapes & Eyes", icon: Shapes },
                { id: "logo", label: "Logo & Icon", icon: ImageIcon },
                { id: "frame", label: "Frames & Text", icon: Sparkles },
                { id: "settings", label: "Export & Quality", icon: Sliders },
              ].map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "14px 16px",
                      fontSize: "13.5px",
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? "var(--accent)" : "var(--muted)",
                      border: "none",
                      borderBottom: isActive
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                      background: "transparent",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Tab Panels Container */}
            <div
              style={{
                flex: 1,
                padding: "24px",
                overflowY: "auto",
              }}
            >
              {/* TAB 1: COLORS */}
              {activeTab === "colors" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
                  }}
                >
                  {/* Color Mode Selection */}
                  <div>
                    <label
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Foreground Color Style
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {[
                        { id: "solid", label: "Solid Color" },
                        { id: "linear-gradient", label: "Linear Gradient" },
                        { id: "radial-gradient", label: "Radial Gradient" },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          className={
                            colorMode === mode.id ? "primary" : "text-button"
                          }
                          style={{
                            padding: "9px 12px",
                            fontSize: "12.5px",
                            borderRadius: "8px",
                            border:
                              colorMode === mode.id
                                ? "none"
                                : "1px solid var(--border)",
                          }}
                          onClick={() => setColorMode(mode.id as ColorMode)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Primary Foreground Color */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <label style={{ fontSize: "13.5px", fontWeight: 700 }}>
                        {colorMode === "solid"
                          ? "QR Color"
                          : "Start Gradient Color"}
                      </label>
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                          fontFamily: "monospace",
                        }}
                      >
                        {fgColor}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginBottom: "12px",
                      }}
                    >
                      <input
                        type="color"
                        value={fgColor}
                        onChange={(e) => setFgColor(e.target.value)}
                        style={{
                          width: "44px",
                          height: "40px",
                          padding: "2px",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                          background: "transparent",
                        }}
                      />
                      <input
                        type="text"
                        value={fgColor}
                        onChange={(e) => setFgColor(e.target.value)}
                        style={{
                          width: "120px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                          background: "var(--bg)",
                          color: "var(--text)",
                        }}
                      />
                    </div>

                    {/* Palette Presets */}
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                    >
                      {COLOR_PRESETS.map((p) => (
                        <button
                          key={p.color}
                          type="button"
                          onClick={() => setFgColor(p.color)}
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: p.color,
                            border:
                              fgColor === p.color
                                ? "2px solid #ffffff"
                                : "1px solid rgba(0,0,0,0.15)",
                            boxShadow:
                              fgColor === p.color
                                ? "0 0 0 2px var(--accent)"
                                : "none",
                            cursor: "pointer",
                            transition: "transform 0.15s ease",
                          }}
                          title={p.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Secondary Gradient Color (if gradient active) */}
                  {colorMode !== "solid" && (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                        }}
                      >
                        <label style={{ fontSize: "13.5px", fontWeight: 700 }}>
                          End Gradient Color
                        </label>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--muted)",
                            fontFamily: "monospace",
                          }}
                        >
                          {fgColor2}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "12px",
                        }}
                      >
                        <input
                          type="color"
                          value={fgColor2}
                          onChange={(e) => setFgColor2(e.target.value)}
                          style={{
                            width: "44px",
                            height: "40px",
                            padding: "2px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            cursor: "pointer",
                            background: "transparent",
                          }}
                        />
                        <input
                          type="text"
                          value={fgColor2}
                          onChange={(e) => setFgColor2(e.target.value)}
                          style={{
                            width: "120px",
                            padding: "8px 12px",
                            fontSize: "13px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text)",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {COLOR_PRESETS.map((p) => (
                          <button
                            key={p.color}
                            type="button"
                            onClick={() => setFgColor2(p.color)}
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "8px",
                              background: p.color,
                              border:
                                fgColor2 === p.color
                                  ? "2px solid #ffffff"
                                  : "1px solid rgba(0,0,0,0.15)",
                              boxShadow:
                                fgColor2 === p.color
                                  ? "0 0 0 2px var(--accent)"
                                  : "none",
                              cursor: "pointer",
                            }}
                            title={p.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Background Color & Transparency */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "18px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "10px",
                      }}
                    >
                      <label style={{ fontSize: "13.5px", fontWeight: 700 }}>
                        Background
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "13px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isTransparent}
                          onChange={(e) => setIsTransparent(e.target.checked)}
                        />
                        Transparent
                      </label>
                    </div>

                    {!isTransparent && (
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginBottom: "12px",
                          }}
                        >
                          <input
                            type="color"
                            value={bgColor}
                            onChange={(e) => setBgColor(e.target.value)}
                            style={{
                              width: "44px",
                              height: "40px",
                              padding: "2px",
                              borderRadius: "8px",
                              border: "1px solid var(--border)",
                              cursor: "pointer",
                              background: "transparent",
                            }}
                          />
                          <input
                            type="text"
                            value={bgColor}
                            onChange={(e) => setBgColor(e.target.value)}
                            style={{
                              width: "120px",
                              padding: "8px 12px",
                              fontSize: "13px",
                              borderRadius: "8px",
                              border: "1px solid var(--border)",
                              background: "var(--bg)",
                              color: "var(--text)",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                          }}
                        >
                          {BG_PRESETS.map((p) => (
                            <button
                              key={p.color}
                              type="button"
                              onClick={() => setBgColor(p.color)}
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: p.color,
                                border:
                                  bgColor === p.color
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--border)",
                                cursor: "pointer",
                              }}
                              title={p.name}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Custom Eye Accent Color */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "18px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "10px",
                      }}
                    >
                      <label style={{ fontSize: "13.5px", fontWeight: 700 }}>
                        Corner Eyes Accent Color
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "13px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={customEyeColor}
                          onChange={(e) => setCustomEyeColor(e.target.checked)}
                        />
                        Custom Eye Color
                      </label>
                    </div>

                    {customEyeColor && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <input
                          type="color"
                          value={eyeColor}
                          onChange={(e) => setEyeColor(e.target.value)}
                          style={{
                            width: "44px",
                            height: "40px",
                            padding: "2px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            cursor: "pointer",
                            background: "transparent",
                          }}
                        />
                        <input
                          type="text"
                          value={eyeColor}
                          onChange={(e) => setEyeColor(e.target.value)}
                          style={{
                            width: "120px",
                            padding: "8px 12px",
                            fontSize: "13px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: SHAPES & EYES */}
              {activeTab === "shapes" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
                  }}
                >
                  {/* Body Dots Geometry */}
                  <div>
                    <label
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Body Modules / Dots Geometry
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "10px",
                      }}
                    >
                      {[
                        {
                          id: "rounded",
                          label: "Rounded",
                          desc: "Soft & Modern",
                        },
                        { id: "dots", label: "Circles", desc: "Minimal Dots" },
                        {
                          id: "classy",
                          label: "Classy",
                          desc: "Smooth Squircle",
                        },
                        {
                          id: "square",
                          label: "Square",
                          desc: "Crisp Standard",
                        },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setDotStyle(item.id as DotStyle)}
                          style={{
                            padding: "14px 10px",
                            borderRadius: "10px",
                            border:
                              dotStyle === item.id
                                ? "2px solid var(--accent)"
                                : "1px solid var(--border)",
                            background:
                              dotStyle === item.id
                                ? "rgba(99, 102, 241, 0.08)"
                                : "var(--surface)",
                            cursor: "pointer",
                            textAlign: "center",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "13px",
                              color: "var(--text)",
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              marginTop: "4px",
                            }}
                          >
                            {item.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Corner Eyes Outer Frame */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "18px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Corner Eye Outer Frame
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "10px",
                      }}
                    >
                      {[
                        { id: "rounded", label: "Rounded Frame" },
                        { id: "circle", label: "Circular Ring" },
                        { id: "square", label: "Square Frame" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            setCornerOuterStyle(item.id as CornerStyle)
                          }
                          style={{
                            padding: "12px",
                            borderRadius: "10px",
                            border:
                              cornerOuterStyle === item.id
                                ? "2px solid var(--accent)"
                                : "1px solid var(--border)",
                            background:
                              cornerOuterStyle === item.id
                                ? "rgba(99, 102, 241, 0.08)"
                                : "var(--surface)",
                            fontWeight: 650,
                            fontSize: "13px",
                            color: "var(--text)",
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Corner Eyes Inner Dot */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "18px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Corner Eye Center Dot
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "10px",
                      }}
                    >
                      {[
                        { id: "circle", label: "Circular Dot" },
                        { id: "rounded", label: "Rounded Square" },
                        { id: "square", label: "Crisp Square" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            setCornerInnerStyle(item.id as CornerStyle)
                          }
                          style={{
                            padding: "12px",
                            borderRadius: "10px",
                            border:
                              cornerInnerStyle === item.id
                                ? "2px solid var(--accent)"
                                : "1px solid var(--border)",
                            background:
                              cornerInnerStyle === item.id
                                ? "rgba(99, 102, 241, 0.08)"
                                : "var(--surface)",
                            fontWeight: 650,
                            fontSize: "13px",
                            color: "var(--text)",
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: LOGO & BRANDING */}
              {activeTab === "logo" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "22px",
                  }}
                >
                  {/* Enable Logo Toggle */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      background: "var(--surface-hover)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "14px",
                          color: "var(--text)",
                        }}
                      >
                        Center Logo Badge
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                          marginTop: "2px",
                        }}
                      >
                        Embed your custom company logo or an elegant preset icon
                      </div>
                    </div>
                    <label
                      style={{
                        position: "relative",
                        display: "inline-block",
                        width: "44px",
                        height: "24px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={hasLogo}
                        onChange={(e) => setHasLogo(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          cursor: "pointer",
                          inset: 0,
                          borderRadius: "24px",
                          background: hasLogo
                            ? "var(--accent)"
                            : "var(--border)",
                          transition: "0.2s",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            content: "''",
                            height: "18px",
                            width: "18px",
                            left: hasLogo ? "23px" : "3px",
                            bottom: "3px",
                            backgroundColor: "white",
                            borderRadius: "50%",
                            transition: "0.2s",
                          }}
                        />
                      </span>
                    </label>
                  </div>

                  {hasLogo && (
                    <>
                      {/* Custom Upload */}
                      <div>
                        <label
                          style={{
                            fontSize: "13.5px",
                            fontWeight: 700,
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          Upload Custom Logo Image
                        </label>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleLogoUpload}
                          />
                          <button
                            type="button"
                            className="primary"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              padding: "9px 16px",
                              fontSize: "13px",
                              fontWeight: 600,
                              borderRadius: "8px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <Upload size={15} /> Upload Logo (PNG, SVG, JPG)
                          </button>

                          {uploadedLogo && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => setUploadedLogo(null)}
                              style={{
                                color: "#f87171",
                                fontSize: "12.5px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <Trash2 size={14} /> Remove Custom Logo
                            </button>
                          )}
                        </div>

                        {uploadedLogo && (
                          <div
                            style={{
                              marginTop: "8px",
                              fontSize: "12px",
                              color: "#10b981",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Check size={14} /> Active custom logo:{" "}
                            <strong>{uploadedLogo.name}</strong>
                          </div>
                        )}
                      </div>

                      {/* Preset Icons (if no custom uploaded logo) */}
                      {!uploadedLogo && (
                        <div>
                          <label
                            style={{
                              fontSize: "13.5px",
                              fontWeight: 700,
                              display: "block",
                              marginBottom: "8px",
                            }}
                          >
                            Or Pick a Preset Icon
                          </label>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(5, 1fr)",
                              gap: "8px",
                            }}
                          >
                            {LOGO_PRESETS.map((p) => {
                              const Icon = p.icon
                              const isSelected = selectedPresetLogo === p.id
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setSelectedPresetLogo(p.id)}
                                  style={{
                                    padding: "10px",
                                    borderRadius: "10px",
                                    border: isSelected
                                      ? "2px solid var(--accent)"
                                      : "1px solid var(--border)",
                                    background: isSelected
                                      ? "rgba(99, 102, 241, 0.12)"
                                      : "var(--surface)",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: "6px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Icon
                                    size={20}
                                    color={
                                      isSelected
                                        ? "var(--accent)"
                                        : "var(--text)"
                                    }
                                  />
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--muted)",
                                    }}
                                  >
                                    {p.label}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Logo Badge Shape & Size */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "16px",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            Badge Container Shape
                          </label>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {(["circle", "rounded", "square"] as const).map(
                              (shape) => (
                                <button
                                  key={shape}
                                  type="button"
                                  className={
                                    logoShape === shape
                                      ? "primary"
                                      : "text-button"
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "8px",
                                    fontSize: "12px",
                                    textTransform: "capitalize",
                                    borderRadius: "7px",
                                    border:
                                      logoShape === shape
                                        ? "none"
                                        : "1px solid var(--border)",
                                  }}
                                  onClick={() => setLogoShape(shape)}
                                >
                                  {shape}
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        <div>
                          <label
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            Logo Size ({logoSizePercent}%)
                          </label>
                          <input
                            type="range"
                            min={15}
                            max={28}
                            value={logoSizePercent}
                            onChange={(e) =>
                              setLogoSizePercent(Number(e.target.value))
                            }
                            style={{
                              width: "100%",
                              accentColor: "var(--accent)",
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 4: FRAMES & TEXT */}
              {activeTab === "frame" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "22px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Frame &amp; Call-To-Action Banner
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "10px",
                      }}
                    >
                      {[
                        {
                          id: "none",
                          label: "No Frame",
                          desc: "Clean & Borderless",
                        },
                        {
                          id: "banner-bottom",
                          label: "Bottom Banner",
                          desc: "High Conversion",
                        },
                        {
                          id: "polaroid",
                          label: "Polaroid",
                          desc: "Card Presentation",
                        },
                        {
                          id: "minimal-pill",
                          label: "Minimal Pill",
                          desc: "Restrained Badge",
                        },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setFrameStyle(item.id as FrameStyle)}
                          style={{
                            padding: "14px 10px",
                            borderRadius: "10px",
                            border:
                              frameStyle === item.id
                                ? "2px solid var(--accent)"
                                : "1px solid var(--border)",
                            background:
                              frameStyle === item.id
                                ? "rgba(99, 102, 241, 0.08)"
                                : "var(--surface)",
                            cursor: "pointer",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "13px",
                              color: "var(--text)",
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              marginTop: "4px",
                            }}
                          >
                            {item.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {frameStyle !== "none" && (
                    <>
                      <div>
                        <label
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            display: "block",
                            marginBottom: "6px",
                          }}
                        >
                          Banner Text (Call to action)
                        </label>
                        <input
                          type="text"
                          maxLength={32}
                          value={frameText}
                          onChange={(e) => setFrameText(e.target.value)}
                          placeholder="e.g. SCAN ME, VISIT US, CONNECT"
                          style={{
                            width: "100%",
                            padding: "10px 14px",
                            fontSize: "13.5px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text)",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "16px",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            Banner Background Color
                          </label>
                          <input
                            type="color"
                            value={frameColor}
                            onChange={(e) => setFrameColor(e.target.value)}
                            style={{
                              width: "100%",
                              height: "40px",
                              padding: "2px",
                              borderRadius: "8px",
                              border: "1px solid var(--border)",
                              cursor: "pointer",
                              background: "transparent",
                            }}
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            Text Color
                          </label>
                          <input
                            type="color"
                            value={frameTextColor}
                            onChange={(e) => setFrameTextColor(e.target.value)}
                            style={{
                              width: "100%",
                              height: "40px",
                              padding: "2px",
                              borderRadius: "8px",
                              border: "1px solid var(--border)",
                              cursor: "pointer",
                              background: "transparent",
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 5: EXPORT & QUALITY SETTINGS */}
              {activeTab === "settings" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "22px",
                  }}
                >
                  {/* Error Correction Level */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <label style={{ fontSize: "13.5px", fontWeight: 700 }}>
                        Error Correction Level (ECC)
                      </label>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {ecl === "H"
                          ? "High (30% Recovery - Recommended)"
                          : ecl === "Q"
                            ? "Quartile (25% Recovery)"
                            : ecl === "M"
                              ? "Medium (15%)"
                              : "Low (7%)"}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {[
                        { id: "L", label: "Low (7%)" },
                        { id: "M", label: "Medium (15%)" },
                        { id: "Q", label: "Quartile (25%)" },
                        { id: "H", label: "High (30%)" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            ecl === item.id ? "primary" : "text-button"
                          }
                          style={{
                            padding: "9px 12px",
                            fontSize: "12.5px",
                            borderRadius: "8px",
                            border:
                              ecl === item.id
                                ? "none"
                                : "1px solid var(--border)",
                          }}
                          onClick={() =>
                            setEcl(item.id as ErrorCorrectionLevel)
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quiet Zone Margin */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "18px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <label style={{ fontSize: "13.5px", fontWeight: 700 }}>
                        Margin / Quiet Zone ({margin} modules)
                      </label>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={margin}
                      onChange={(e) => setMargin(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>

                  {/* Resolution Size */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "18px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Export Resolution
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {[
                        { val: 600, label: "Standard (600px)" },
                        { val: 1200, label: "High Res (1200px)" },
                        { val: 2400, label: "Print Ultra (2400px)" },
                      ].map((res) => (
                        <button
                          key={res.val}
                          type="button"
                          className={
                            resolution === res.val ? "primary" : "text-button"
                          }
                          style={{
                            padding: "10px",
                            fontSize: "12.5px",
                            borderRadius: "8px",
                            border:
                              resolution === res.val
                                ? "none"
                                : "1px solid var(--border)",
                          }}
                          onClick={() => setResolution(res.val)}
                        >
                          {res.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
