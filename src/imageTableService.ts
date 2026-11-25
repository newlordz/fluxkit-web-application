import { recognizePage } from "./browserOcr"
import type { OutputResult } from "./jobTypes"
import {
  assessImageTable,
  createImageTableFromCloud,
  imageTableMergeRanges,
  parseFinancialAmount,
  reconstructImageTable,
  toSpreadsheetData,
  type ImageTable,
  type ImageTableAssessment,
} from "./imageTableReconstruction"
import { createXlsxBlob } from "./services"
import { authHeaders } from "./sessionService"

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
const MAX_OCR_SIDE = 2600
const MAX_CLOUD_SIDE = 2000
const MAX_CLOUD_IMAGE_BYTES = 14 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

export interface ImageTableRun {
  table: ImageTable
  assessment: ImageTableAssessment
  needsCloud: boolean
  source: "local" | "cloud"
}

export interface ImageTableExtractionOptions {
  signal?: AbortSignal
  onProgress?: (stage: string) => void
}

export class ImageTableCloudError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = "ImageTableCloudError"
    this.status = status
    this.code = code
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  throwIfAborted(signal)

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Image conversion cancelled", "AbortError"))
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

export function validateImageFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Choose one JPG, PNG, or WebP image.")
  }
  if (!file.size) {
    throw new Error("The selected image is empty.")
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("The image is larger than 25 MB. Choose a smaller photo.")
  }
}

function imageKind(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png"
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp"
  }
  return null
}

function readDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const kind = imageKind(bytes)

  if (kind === "png" && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  if (kind === "jpeg") {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) break
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) break
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) }
      }
      offset += length
    }
  }

  if (kind === "webp" && bytes.length >= 30) {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16))
    const little24 = (offset: number) =>
      bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536
    if (chunk === "VP8X") {
      return { width: little24(24) + 1, height: little24(27) + 1 }
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true)
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (
      chunk === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      }
    }
  }

  throw new Error("The image format could not be verified. Choose an original JPG, PNG, or WebP file.")
}

async function decodeImage(file: File, signal?: AbortSignal): Promise<{
  source: ImageBitmap | HTMLImageElement
  width: number
  height: number
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await abortable(
      createImageBitmap(file, { imageOrientation: "from-image" }),
      signal,
    )
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }

  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("This browser cannot decode the image locally.")
  }

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await abortable(
      new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error("The image could not be decoded."))
      }),
      signal,
    )
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height) throw new Error("The image has no readable dimensions.")
    return { source: image, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function renderImage(
  file: File,
  maxSide: number,
  mimeType: "image/png" | "image/jpeg",
  quality: number,
  signal?: AbortSignal,
): Promise<Blob> {
  validateImageFile(file)
  throwIfAborted(signal)

  const bytes = new Uint8Array(await abortable(file.arrayBuffer(), signal))
  const kind = imageKind(bytes)
  const expectedKind = file.type === "image/jpeg" ? "jpeg" : file.type === "image/png" ? "png" : "webp"
  if (kind !== expectedKind) {
    throw new Error("The file contents do not match its image type. Choose an original image file.")
  }

  const dimensions = readDimensions(bytes)
  if (!dimensions.width || !dimensions.height) {
    throw new Error("The image has no readable dimensions.")
  }
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    throw new Error("The image is too large to process safely. Resize it below 40 megapixels.")
  }

  const { source, width, height } = await decodeImage(file, signal)
  try {
    throwIfAborted(signal)
    if (width * height > MAX_IMAGE_PIXELS) {
      throw new Error("The image is too large to process safely. Resize it below 40 megapixels.")
    }

    const scale = Math.min(1, maxSide / width, maxSide / height)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext("2d", { alpha: false })
    if (!context) throw new Error("This browser cannot prepare the image for local OCR.")

    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    throwIfAborted(signal)

    const blob = await abortable(
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error("The prepared image could not be created.")),
          mimeType,
          quality,
        )
      }),
      signal,
    )
    throwIfAborted(signal)
    return blob
  } finally {
    if ("close" in source && typeof source.close === "function") source.close()
  }
}

export async function prepareImageForOcr(
  file: File,
  signal?: AbortSignal,
): Promise<Blob> {
  return renderImage(file, MAX_OCR_SIDE, "image/png", 1, signal)
}

export async function prepareImageForCloud(
  file: File,
  signal?: AbortSignal,
): Promise<Blob> {
  const image = await renderImage(file, MAX_CLOUD_SIDE, "image/jpeg", 0.9, signal)
  if (image.size > MAX_CLOUD_IMAGE_BYTES) {
    throw new Error("The prepared image is too large for cloud extraction. Choose a smaller photo.")
  }
  return image
}

function shouldOfferCloud(table: ImageTable, assessment: ImageTableAssessment): boolean {
  const populatedCells = table.rows.flatMap((row) => row.cells).filter((cell) => cell.value).length
  return (
    !assessment.usable ||
    table.confidence < 0.78 ||
    table.structureConfidence < 0.7 ||
    assessment.reviewCellCount > Math.max(2, Math.ceil(populatedCells * 0.12))
  )
}

function unavailableLocalTable(message: string): ImageTable {
  const table = reconstructImageTable({ text: "", confidence: 0, lines: [] })
  table.warnings = [{ code: "local_unavailable", message, severity: "error" }]
  return table
}

export async function extractImageTable(
  file: File,
  options: ImageTableExtractionOptions = {},
): Promise<ImageTableRun> {
  options.onProgress?.("Preparing the image locally")
  const image = await prepareImageForOcr(file, options.signal)
  options.onProgress?.("Reading text and word positions locally")
  const page = await recognizePage(image, 30_000, options.signal)
  throwIfAborted(options.signal)

  let table: ImageTable
  if (!page) {
    table = unavailableLocalTable(
      "Local OCR is unavailable in this browser. Cloud extraction is available after sign-in and consent.",
    )
  } else if (page.failed) {
    table = unavailableLocalTable(
      "The local reader could not finish this page. Try a sharper photo or use cloud extraction with consent.",
    )
  } else {
    options.onProgress?.("Rebuilding table rows and columns")
    table = reconstructImageTable(page)
  }

  const assessment = assessImageTable(table)
  return {
    table,
    assessment,
    needsCloud: shouldOfferCloud(table, assessment),
    source: "local",
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("The image could not be prepared for upload."))
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

async function fetchCloudTable(
  imageBase64: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController()
  const relay = () => controller.abort()
  const timer = setTimeout(() => controller.abort(), 75_000)
  signal?.addEventListener("abort", relay, { once: true })

  try {
    const response = await fetch("/api/image-table/extract", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        imageBase64,
        mimeType: "image/jpeg",
        consent: true,
      }),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        data?.code === "AUTH_REQUIRED" || data?.code === "sign_in_required"
          ? "Sign in again to use cloud help. Your local table is still available."
          : data?.code === "daily_user_limit" || data?.code === "daily_service_limit"
            ? "Today’s cloud allowance is used up. Your local table is still available to edit and export."
            : data?.error || "Cloud extraction is unavailable. Your local result is still here."
      throw new ImageTableCloudError(
        message,
        response.status,
        typeof data?.code === "string" ? data.code : "cloud_failed",
      )
    }
    return data?.table
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof ImageTableCloudError) throw error
    if (controller.signal.aborted) {
      throw new ImageTableCloudError(
        "Cloud extraction took too long. Your local result is still available.",
        504,
        "provider_timeout",
      )
    }
    throw new ImageTableCloudError(
      "Cloud extraction could not be reached. Your local result is still available.",
      503,
      "cloud_unreachable",
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", relay)
  }
}

export async function extractImageTableWithCloud(
  file: File,
  options: ImageTableExtractionOptions = {},
): Promise<ImageTableRun> {
  throwIfAborted(options.signal)
  options.onProgress?.("Preparing a privacy-conscious cloud copy")
  const image = await prepareImageForCloud(file, options.signal)
  options.onProgress?.("Uploading with your consent")
  const imageBase64 = await blobToBase64(image)
  throwIfAborted(options.signal)
  const payload = await fetchCloudTable(imageBase64, options.signal)
  options.onProgress?.("Checking the extracted rows and columns")
  const table = createImageTableFromCloud(payload)
  const assessment = assessImageTable(table)
  if (!assessment.usable) {
    throw new ImageTableCloudError(
      "Cloud extraction could not rebuild a usable table. Keep reviewing the local result or retake the photo.",
      422,
      "invalid_table",
    )
  }

  return { table, assessment, needsCloud: false, source: "cloud" }
}

export async function exportImageTableToXlsx(
  table: ImageTable,
  fileName: string,
  signal?: AbortSignal,
): Promise<OutputResult> {
  throwIfAborted(signal)
  if (table.columns.length < 2 || table.columns.length > 12 || !table.rows.length) {
    throw new Error("Add at least one complete row before exporting.")
  }
  if (table.rows.length > 500) {
    throw new Error("Remove rows until the table contains no more than 500 rows.")
  }

  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-") || "payslip"
  const blob = createXlsxBlob(toSpreadsheetData(table), {
    sheetName: "Payslip",
    numericColumns: table.columns.map((column) => column.kind === "amount"),
    parseNumeric: parseFinancialAmount,
    mergeRanges: imageTableMergeRanges(table),
    signal,
  })

  return {
    name: `${baseName}-table.xlsx`,
    blob,
    format: "xlsx",
    provider: "local",
  }
}
