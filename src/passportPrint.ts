export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
const MM_TO_POINTS = 72 / 25.4
const MARGIN_MM = 10
const GAP_MM = 7

export interface PassportPrintLayout {
  columns: number
  rows: number
  copies: number
  widthMm: number
  heightMm: number
  startXMm: number
  startYMm: number
}

export interface PassportPrintPhoto {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export function getPassportPrintLayout(widthMm: number, heightMm: number): PassportPrintLayout {
  if (![widthMm, heightMm].every(Number.isFinite) || widthMm <= 0 || heightMm <= 0) {
    throw new Error("Enter a valid physical photo size.")
  }
  if (widthMm > A4_WIDTH_MM - MARGIN_MM * 2 || heightMm > A4_HEIGHT_MM - MARGIN_MM * 2) {
    throw new Error("The photo must fit inside an A4 sheet with a 10 mm margin.")
  }
  const columns = Math.max(1, Math.floor((A4_WIDTH_MM - MARGIN_MM * 2 + GAP_MM) / (widthMm + GAP_MM)))
  const rows = Math.max(1, Math.floor((A4_HEIGHT_MM - MARGIN_MM * 2 + GAP_MM) / (heightMm + GAP_MM)))
  const gridWidth = columns * widthMm + (columns - 1) * GAP_MM
  const gridHeight = rows * heightMm + (rows - 1) * GAP_MM
  return {
    columns,
    rows,
    copies: columns * rows,
    widthMm,
    heightMm,
    startXMm: (A4_WIDTH_MM - gridWidth) / 2,
    startYMm: (A4_HEIGHT_MM - gridHeight) / 2,
  }
}

export function getPassportPrintPhotos(layout: PassportPrintLayout): PassportPrintPhoto[] {
  return Array.from({ length: layout.copies }, (_, index) => {
    const column = index % layout.columns
    const row = Math.floor(index / layout.columns)
    return {
      xMm: layout.startXMm + column * (layout.widthMm + GAP_MM),
      yMm: layout.startYMm + row * (layout.heightMm + GAP_MM),
      widthMm: layout.widthMm,
      heightMm: layout.heightMm,
    }
  })
}

export async function createPassportA4Pdf(
  pngDataUrl: string,
  widthMm: number,
  heightMm: number,
): Promise<Blob> {
  const { PDFDocument, rgb } = await import("pdf-lib")
  const layout = getPassportPrintLayout(widthMm, heightMm)
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([A4_WIDTH_MM * MM_TO_POINTS, A4_HEIGHT_MM * MM_TO_POINTS])
  const image = await pdf.embedPng(pngDataUrl)
  const guideColor = rgb(0.58, 0.63, 0.69)
  const gap = 2 * MM_TO_POINTS
  const length = 4 * MM_TO_POINTS

  for (const photo of getPassportPrintPhotos(layout)) {
    const x = photo.xMm * MM_TO_POINTS
    const y = photo.yMm * MM_TO_POINTS
    const width = photo.widthMm * MM_TO_POINTS
    const height = photo.heightMm * MM_TO_POINTS
    page.drawImage(image, { x, y, width, height })
    const left = x - gap
    const right = x + width + gap
    const bottom = y - gap
    const top = y + height + gap
    const lines = [
      [left - length, bottom, left, bottom],
      [left - length, top, left, top],
      [right, bottom, right + length, bottom],
      [right, top, right + length, top],
      [left, bottom - length, left, bottom],
      [right, bottom - length, right, bottom],
      [left, top, left, top + length],
      [right, top, right, top + length],
    ]
    for (const [x1, y1, x2, y2] of lines) {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.4,
        color: guideColor,
      })
    }
  }

  pdf.setTitle("MasterfilePro Passport Photo - A4 Print Sheet")
  pdf.setSubject(`${layout.copies} photos at ${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm on A4`)
  const bytes = await pdf.save()
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
}
