export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export interface ImageExportOptions {
  width: number
  height: number
  format: "image/jpeg" | "image/png" | "image/webp"
  quality: number
  backgroundColor?: string
}

export interface ImageExportResult {
  blob: Blob
  width: number
  height: number
  extension: "jpg" | "png" | "webp"
}

const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_SOURCE_PIXELS = 40_000_000
const MAX_OUTPUT_DIMENSION = 8192
const MAX_OUTPUT_PIXELS = 40_000_000

export function isEditableImageFile(file: File): boolean {
  return file.type
    ? /^image\/(jpeg|png|webp|avif)$/i.test(file.type)
    : /\.(jpe?g|png|webp|avif)$/i.test(file.name)
}

export async function loadEditableImage(file: File): Promise<HTMLImageElement> {
  if (!isEditableImageFile(file)) {
    throw new Error("Choose a JPG, PNG, WebP, or AVIF image.")
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Choose an image smaller than 25 MB.")
  }

  const objectUrl = URL.createObjectURL(file)
  let keepObjectUrl = false
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("This image could not be read. Try another photo.")
    }
    if (image.naturalWidth * image.naturalHeight > MAX_SOURCE_PIXELS) {
      throw new Error("This image is too large. Choose an image below 40 megapixels.")
    }
    keepObjectUrl = true
    return image
  } catch (error) {
    if (error instanceof Error && /image|photo/i.test(error.message)) throw error
    throw new Error("This image could not be decoded. Try a JPG or PNG image.")
  } finally {
    if (!keepObjectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export function getCropAspect(value: string): number | null {
  if (value === "free" || value === "original") return null
  const [width, height] = value.split(":").map(Number)
  return width > 0 && height > 0 ? width / height : null
}

export function createInitialCrop(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number | null = null,
): CropRect {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("The image dimensions are invalid.")
  }
  const ratio = aspect || sourceWidth / sourceHeight
  let width = sourceWidth
  let height = width / ratio
  if (height > sourceHeight) {
    height = sourceHeight
    width = height * ratio
  }
  return {
    x: (sourceWidth - width) / 2,
    y: (sourceHeight - height) / 2,
    width,
    height,
  }
}

export function fitCropToAspect(
  crop: CropRect,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number | null,
): CropRect {
  const next = createInitialCrop(sourceWidth, sourceHeight, aspect)
  const centerX = crop.x + crop.width / 2
  const centerY = crop.y + crop.height / 2
  next.x = Math.min(sourceWidth - next.width, Math.max(0, centerX - next.width / 2))
  next.y = Math.min(sourceHeight - next.height, Math.max(0, centerY - next.height / 2))
  return next
}

export function normalizeCrop(
  crop: CropRect,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number | null = null,
): CropRect {
  if (
    ![crop.x, crop.y, crop.width, crop.height, sourceWidth, sourceHeight].every(Number.isFinite) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    throw new Error("The crop dimensions are invalid.")
  }
  let width = Math.min(sourceWidth, crop.width)
  let height = Math.min(sourceHeight, crop.height)
  if (aspect) {
    if (width / height > aspect) width = height * aspect
    else height = width / aspect
  }
  width = Math.max(1, width)
  height = Math.max(1, height)
  const x = Math.min(sourceWidth - width, Math.max(0, crop.x))
  const y = Math.min(sourceHeight - height, Math.max(0, crop.y))
  return { x, y, width, height }
}

export function moveCrop(
  crop: CropRect,
  deltaX: number,
  deltaY: number,
  sourceWidth: number,
  sourceHeight: number,
): CropRect {
  return normalizeCrop(
    {
      ...crop,
      x: Math.min(sourceWidth - crop.width, Math.max(0, crop.x + deltaX)),
      y: Math.min(sourceHeight - crop.height, Math.max(0, crop.y + deltaY)),
    },
    sourceWidth,
    sourceHeight,
  )
}

export function resizeCrop(
  crop: CropRect,
  handle: CropHandle,
  pointerX: number,
  pointerY: number,
  sourceWidth: number,
  sourceHeight: number,
  aspect: number | null = null,
): CropRect {
  const current = normalizeCrop(crop, sourceWidth, sourceHeight, aspect)
  const right = current.x + current.width
  const bottom = current.y + current.height
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2
  const minSize = Math.min(16, sourceWidth, sourceHeight)

  if (!aspect) {
    let left = current.x
    let top = current.y
    let nextRight = right
    let nextBottom = bottom
    if (handle.includes("w")) left = Math.min(pointerX, nextRight - minSize)
    if (handle.includes("e")) nextRight = Math.max(pointerX, left + minSize)
    if (handle.includes("n")) top = Math.min(pointerY, nextBottom - minSize)
    if (handle.includes("s")) nextBottom = Math.max(pointerY, top + minSize)
    left = Math.max(0, left)
    top = Math.max(0, top)
    nextRight = Math.min(sourceWidth, nextRight)
    nextBottom = Math.min(sourceHeight, nextBottom)
    return { x: left, y: top, width: nextRight - left, height: nextBottom - top }
  }

  if (handle === "n" || handle === "s") {
    const desiredHeight = Math.abs(pointerY - (handle === "n" ? bottom : current.y))
    const maxHeight = handle === "n" ? bottom : sourceHeight - current.y
    const maxWidth = 2 * Math.min(centerX, sourceWidth - centerX)
    const height = Math.max(minSize / aspect, Math.min(desiredHeight, maxHeight, maxWidth / aspect))
    const width = height * aspect
    return {
      x: centerX - width / 2,
      y: handle === "n" ? bottom - height : current.y,
      width,
      height,
    }
  }

  if (handle === "e" || handle === "w") {
    const desiredWidth = Math.abs(pointerX - (handle === "e" ? current.x : right))
    const maxWidth = handle === "e" ? sourceWidth - current.x : right
    const maxHeight = 2 * Math.min(centerY, sourceHeight - centerY)
    const width = Math.max(minSize, Math.min(desiredWidth, maxWidth, maxHeight * aspect))
    const height = width / aspect
    return {
      x: handle === "e" ? current.x : right - width,
      y: centerY - height / 2,
      width,
      height,
    }
  }

  const anchorX = handle.includes("w") ? right : current.x
  const anchorY = handle.includes("n") ? bottom : current.y
  const desiredWidth = Math.abs(pointerX - anchorX)
  const desiredHeight = Math.abs(pointerY - anchorY)
  const proposedWidth = desiredWidth / aspect > desiredHeight ? desiredWidth : desiredHeight * aspect
  const maxWidth = handle.includes("w") ? anchorX : sourceWidth - anchorX
  const maxHeight = handle.includes("n") ? anchorY : sourceHeight - anchorY
  const width = Math.max(minSize, Math.min(proposedWidth, maxWidth, maxHeight * aspect))
  const height = width / aspect
  return {
    x: handle.includes("w") ? anchorX - width : anchorX,
    y: handle.includes("n") ? anchorY - height : anchorY,
    width,
    height,
  }
}

export function validateOutputDimensions(width: number, height: number): void {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error("Enter a valid width and height greater than zero.")
  }
  const outputWidth = Math.round(width)
  const outputHeight = Math.round(height)
  if (outputWidth < 1 || outputHeight < 1 || outputWidth > MAX_OUTPUT_DIMENSION || outputHeight > MAX_OUTPUT_DIMENSION) {
    throw new Error("Output dimensions must be between 1 and 8192 pixels per side.")
  }
  if (outputWidth * outputHeight > MAX_OUTPUT_PIXELS) {
    throw new Error("This output is too large. Reduce the dimensions.")
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("The preview image could not be prepared."))
    reader.readAsDataURL(blob)
  })
}

export async function renderImageCrop(
  image: HTMLImageElement,
  crop: CropRect,
  options: ImageExportOptions,
): Promise<ImageExportResult> {
  validateOutputDimensions(options.width, options.height)
  const safeCrop = normalizeCrop(crop, image.naturalWidth, image.naturalHeight)
  const width = Math.round(options.width)
  const height = Math.round(options.height)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Your browser could not create the image canvas.")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  if (options.format === "image/jpeg" || options.backgroundColor) {
    context.fillStyle = options.backgroundColor || "#ffffff"
    context.fillRect(0, 0, width, height)
  }
  context.drawImage(
    image,
    safeCrop.x,
    safeCrop.y,
    safeCrop.width,
    safeCrop.height,
    0,
    0,
    width,
    height,
  )
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error("The image export failed. Try a smaller output size."))
      },
      options.format,
      options.quality,
    )
  })
  return {
    blob,
    width,
    height,
    extension: options.format === "image/jpeg" ? "jpg" : options.format === "image/webp" ? "webp" : "png",
  }
}
