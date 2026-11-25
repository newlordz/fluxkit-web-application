export type PassportSizeUnit = "mm" | "in" | "px"

export interface PassportPhotoPreset {
  id: string
  country: string
  label: string
  widthMm: number
  heightMm: number
  note: string
}

export const PASSPORT_PHOTO_PRESETS: PassportPhotoPreset[] = [
  {
    id: "us",
    country: "United States",
    label: "United States",
    widthMm: 50.8,
    heightMm: 50.8,
    note: "2 × 2 in · 600 × 600 px at 300 DPI",
  },
  {
    id: "uk",
    country: "United Kingdom",
    label: "United Kingdom",
    widthMm: 35,
    heightMm: 45,
    note: "35 × 45 mm · verify current photo rules",
  },
  {
    id: "canada",
    country: "Canada",
    label: "Canada",
    widthMm: 50,
    heightMm: 70,
    note: "50 × 70 mm · verify current photo rules",
  },
  {
    id: "schengen",
    country: "Schengen / EU",
    label: "Schengen / EU",
    widthMm: 35,
    heightMm: 45,
    note: "35 × 45 mm · requirements vary by authority",
  },
  {
    id: "australia",
    country: "Australia",
    label: "Australia",
    widthMm: 35,
    heightMm: 45,
    note: "35 × 45 mm · verify current photo rules",
  },
  {
    id: "new-zealand",
    country: "New Zealand",
    label: "New Zealand",
    widthMm: 35,
    heightMm: 45,
    note: "35 × 45 mm · verify current photo rules",
  },
  {
    id: "south-africa",
    country: "South Africa",
    label: "South Africa",
    widthMm: 35,
    heightMm: 45,
    note: "35 × 45 mm · verify current photo rules",
  },
  {
    id: "nigeria",
    country: "Nigeria",
    label: "Nigeria",
    widthMm: 50.8,
    heightMm: 50.8,
    note: "2 × 2 in · verify current photo rules",
  },
  {
    id: "ghana",
    country: "Ghana",
    label: "Ghana",
    widthMm: 50.8,
    heightMm: 50.8,
    note: "2 × 2 in · verify current photo rules",
  },
  {
    id: "china",
    country: "China",
    label: "China",
    widthMm: 33,
    heightMm: 48,
    note: "33 × 48 mm · verify current photo rules",
  },
  {
    id: "japan",
    country: "Japan",
    label: "Japan",
    widthMm: 35,
    heightMm: 45,
    note: "35 × 45 mm · verify current photo rules",
  },
  {
    id: "singapore",
    country: "Singapore",
    label: "Singapore",
    widthMm: 35,
    heightMm: 45,
    note: "35 × 45 mm · verify current photo rules",
  },
]

export interface PassportCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface PassportRenderOptions {
  width: number
  height: number
  unit: PassportSizeUnit
  dpi: number
  zoom: number
  focusX: number
  focusY: number
  removeBackground: boolean
  backgroundColor: string
  backgroundTolerance: number
  format: "image/jpeg" | "image/png"
  quality: number
}

export interface PassportRenderResult {
  blob: Blob
  width: number
  height: number
  extension: "jpg" | "png"
}

const MAX_OUTPUT_DIMENSION = 4096
const MAX_OUTPUT_PIXELS = 16_000_000
const MAX_SOURCE_PIXELS = 40_000_000

export function getPassportPreset(id: string): PassportPhotoPreset | undefined {
  return PASSPORT_PHOTO_PRESETS.find((preset) => preset.id === id)
}

export function resolveOutputDimensions(
  width: number,
  height: number,
  unit: PassportSizeUnit,
  dpi: number,
): { width: number; height: number } {
  if (![width, height, dpi].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error("Enter a valid width and height greater than zero.")
  }
  if (dpi < 72 || dpi > 1200) {
    throw new Error("Choose a resolution between 72 and 1200 DPI.")
  }

  const scale = unit === "mm" ? dpi / 25.4 : unit === "in" ? dpi : 1
  const outputWidth = Math.round(width * scale)
  const outputHeight = Math.round(height * scale)
  if (
    outputWidth < 1 ||
    outputHeight < 1 ||
    outputWidth > MAX_OUTPUT_DIMENSION ||
    outputHeight > MAX_OUTPUT_DIMENSION
  ) {
    throw new Error("Output dimensions must be between 1 and 4096 pixels per side.")
  }
  if (outputWidth * outputHeight > MAX_OUTPUT_PIXELS) {
    throw new Error("This output is too large. Reduce the dimensions or resolution.")
  }
  return { width: outputWidth, height: outputHeight }
}

export function getPassportCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  zoom: number,
  focusX: number,
  focusY: number,
): PassportCrop {
  if (
    ![sourceWidth, sourceHeight, targetWidth, targetHeight, zoom, focusX, focusY].every(
      Number.isFinite,
    ) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0 ||
    zoom < 1
  ) {
    throw new Error("The photo cannot be cropped with these settings.")
  }

  const sourceAspect = sourceWidth / sourceHeight
  const targetAspect = targetWidth / targetHeight
  const baseWidth = sourceAspect > targetAspect ? sourceHeight * targetAspect : sourceWidth
  const baseHeight = sourceAspect > targetAspect ? sourceHeight : sourceWidth / targetAspect
  const cropWidth = Math.min(sourceWidth, baseWidth / zoom)
  const cropHeight = Math.min(sourceHeight, baseHeight / zoom)
  const centerX = Math.min(
    sourceWidth - cropWidth / 2,
    Math.max(cropWidth / 2, focusX * sourceWidth),
  )
  const centerY = Math.min(
    sourceHeight - cropHeight / 2,
    Math.max(cropHeight / 2, focusY * sourceHeight),
  )

  return {
    x: centerX - cropWidth / 2,
    y: centerY - cropHeight / 2,
    width: cropWidth,
    height: cropHeight,
  }
}

export function isPassportImageFile(file: File): boolean {
  return file.type
    ? /^image\/(jpeg|png|webp|avif)$/i.test(file.type)
    : /\.(jpe?g|png|webp|avif)$/i.test(file.name)
}

export async function loadPassportImage(file: File): Promise<HTMLImageElement> {
  if (!isPassportImageFile(file)) {
    throw new Error("Choose a JPG, PNG, WebP, or AVIF photo.")
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Choose a photo smaller than 25 MB.")
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("This image could not be read. Try another photo.")
    }
    if (image.naturalWidth * image.naturalHeight > MAX_SOURCE_PIXELS) {
      throw new Error("This photo is too large. Choose an image below 40 megapixels.")
    }
    return image
  } catch (error) {
    if (error instanceof Error && error.message.includes("photo")) throw error
    throw new Error("This image could not be decoded. Try a JPG or PNG photo.")
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function colorDistance(
  red: number,
  green: number,
  blue: number,
  referenceRed: number,
  referenceGreen: number,
  referenceBlue: number,
): number {
  return Math.sqrt(
    (red - referenceRed) ** 2 +
      (green - referenceGreen) ** 2 +
      (blue - referenceBlue) ** 2,
  ) / Math.sqrt(3 * 255 ** 2)
}

function sampleBackground(imageData: ImageData, width: number, height: number) {
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 128))
  const pixels: number[][] = []
  const addPixel = (x: number, y: number) => {
    const index = (y * width + x) * 4
    if (imageData.data[index + 3] > 0) {
      pixels.push([imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]])
    }
  }

  for (let x = 0; x < width; x += stride) {
    addPixel(x, 0)
    addPixel(x, height - 1)
  }
  for (let y = 0; y < height; y += stride) {
    addPixel(0, y)
    addPixel(width - 1, y)
  }
  if (!pixels.length) throw new Error("No visible background was found in this photo.")

  const bins = new Map<string, { count: number; sum: number[] }>()
  for (const pixel of pixels) {
    const key = pixel.map((channel) => Math.floor(channel / 24)).join(",")
    const bin = bins.get(key) || { count: 0, sum: [0, 0, 0] }
    bin.count += 1
    for (let channel = 0; channel < 3; channel += 1) bin.sum[channel] += pixel[channel]
    bins.set(key, bin)
  }
  const dominant = Array.from(bins.values()).sort((a, b) => b.count - a.count)[0]
  const dominantAverage = dominant.sum.map((sum) => sum / dominant.count)
  const cluster = pixels.filter(
    (pixel) =>
      colorDistance(
        pixel[0],
        pixel[1],
        pixel[2],
        dominantAverage[0],
        dominantAverage[1],
        dominantAverage[2],
      ) <= 0.09,
  )
  if (cluster.length / pixels.length < 0.45) {
    throw new Error(
      "The background is too varied for automatic cleanup. Keep the original background or use an evenly lit, plain backdrop.",
    )
  }

  const average = [0, 1, 2].map(
    (channel) => cluster.reduce((sum, pixel) => sum + pixel[channel], 0) / cluster.length,
  )
  const variance =
    cluster.reduce(
      (sum, pixel) =>
        sum +
        colorDistance(pixel[0], pixel[1], pixel[2], average[0], average[1], average[2]) ** 2,
      0,
    ) / cluster.length
  if (variance > 0.012) {
    throw new Error(
      "The background is too varied for automatic cleanup. Keep the original background or use an evenly lit, plain backdrop.",
    )
  }
  return { average, variance }
}

function removePlainBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  tolerance: number,
): void {
  const imageData = context.getImageData(0, 0, width, height)
  const background = sampleBackground(imageData, width, height)
  const threshold = 0.03 + (Math.min(100, Math.max(0, tolerance)) / 100) * 0.07
  const feather = 0.025
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (imageData.data[index + 3] === 0) continue
    const distance = colorDistance(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2],
      background.average[0],
      background.average[1],
      background.average[2],
    )
    const alpha = Math.min(1, Math.max(0, (distance - threshold) / feather))
    imageData.data[index + 3] = Math.round(imageData.data[index + 3] * alpha)
  }
  context.putImageData(imageData, 0, 0)
}

export async function renderPassportPhoto(
  image: HTMLImageElement,
  options: PassportRenderOptions,
): Promise<PassportRenderResult> {
  const output = resolveOutputDimensions(options.width, options.height, options.unit, options.dpi)
  const crop = getPassportCrop(
    image.naturalWidth,
    image.naturalHeight,
    output.width,
    output.height,
    options.zoom,
    options.focusX,
    options.focusY,
  )

  const sourceCanvas = document.createElement("canvas")
  sourceCanvas.width = output.width
  sourceCanvas.height = output.height
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true })
  if (!sourceContext) throw new Error("Your browser could not create the photo canvas.")
  sourceContext.imageSmoothingEnabled = true
  sourceContext.imageSmoothingQuality = "high"
  sourceContext.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    output.width,
    output.height,
  )

  if (options.removeBackground) {
    removePlainBackground(
      sourceContext,
      output.width,
      output.height,
      options.backgroundTolerance,
    )
  }

  const outputCanvas = document.createElement("canvas")
  outputCanvas.width = output.width
  outputCanvas.height = output.height
  const outputContext = outputCanvas.getContext("2d")
  if (!outputContext) throw new Error("Your browser could not create the export canvas.")
  if (options.removeBackground || options.format === "image/jpeg") {
    outputContext.fillStyle = options.backgroundColor
    outputContext.fillRect(0, 0, output.width, output.height)
  }
  outputContext.drawImage(sourceCanvas, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error("The photo export failed. Try a smaller output size."))
      },
      options.format,
      options.quality,
    )
  })

  return {
    blob,
    width: output.width,
    height: output.height,
    extension: options.format === "image/png" ? "png" : "jpg",
  }
}

export function formatPassportSize(width: number, height: number, unit: PassportSizeUnit): string {
  const precision = unit === "px" ? 0 : unit === "in" ? 2 : 1
  return `${width.toFixed(precision)} × ${height.toFixed(precision)} ${unit}`
}
