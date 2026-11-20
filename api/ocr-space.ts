import { getOcrSpaceKey, parseRequestBody, setCorsHeaders } from "../src/server/cloudUtils"

export default async function handler(req: any, res: any) {
  setCorsHeaders(res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  const url = req.url || ""
  const action =
    req.query?.action ||
    (url.includes("/status") ? "status" : url.includes("/parse") ? "parse" : "")

  // 1. Status / Ping check
  if (action === "status" || req.method === "GET") {
    const payload = {
      ok: true,
      service: "OCR.space Free OCR API",
      status: "connected",
      configured: true,
      freeQuota: 25000,
    }
    res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
    return
  }

  // 2. Parse Image / Document
  if (req.method !== "POST") {
    res.status?.(405)?.json?.({ error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ error: "Method not allowed" }))
    return
  }

  try {
    const body = await parseRequestBody(req)
    const base64Image = body.base64Image
    const language = body.language || "eng"
    const apiKey = getOcrSpaceKey(body)

    if (!base64Image) {
      res.status?.(400)?.json?.({ error: "base64Image is required" }) ||
        res.end?.(JSON.stringify({ error: "base64Image is required" }))
      return
    }

    const formData = new FormData()
    formData.append("apikey", apiKey)
    formData.append("base64Image", base64Image)
    formData.append("language", language)
    formData.append("isOverlayRequired", "false")
    formData.append("scale", "true")
    formData.append("detectOrientation", "true")

    const ocrRes = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
    })
    const ocrData = (await ocrRes.json()) as any

    if (ocrData.IsErroredOnProcessing) {
      res.status?.(400)?.json?.({ error: ocrData.ErrorMessage || "OCR processing failed" }) ||
        res.end?.(JSON.stringify({ error: ocrData.ErrorMessage || "OCR processing failed" }))
      return
    }

    const parsedText =
      ocrData.ParsedResults?.map((r: any) => r.ParsedText).join("\n") || ""

    const payload = {
      ok: true,
      text: parsedText,
      exitCode: ocrData.OCRExitCode,
      processingTimeMs: ocrData.ProcessingTimeInMilliseconds,
      provider: "ocr-space",
    }

    res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  } catch (err: any) {
    res.status?.(500)?.json?.({ error: err.message }) ||
      res.end?.(JSON.stringify({ error: err.message }))
  }
}
