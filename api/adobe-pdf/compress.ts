import { getAdobeCredentials, parseRequestBody, setCorsHeaders } from "../_cloudUtils"

export default async function handler(req: any, res: any) {
  setCorsHeaders(res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  if (req.method !== "POST") {
    res.status?.(405)?.json?.({ error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ error: "Method not allowed" }))
    return
  }

  try {
    const body = await parseRequestBody(req)
    const pdfBase64 = body.pdfBase64
    const compressionLevel = (body.compressionLevel || "MEDIUM").toUpperCase()
    const { clientId, clientSecret } = getAdobeCredentials(body)

    if (!pdfBase64) {
      res.status?.(400)?.json?.({ error: "pdfBase64 is required" }) ||
        res.end?.(JSON.stringify({ error: "pdfBase64 is required" }))
      return
    }

    const fileBuffer = Buffer.from(pdfBase64, "base64")
    const originalSize = fileBuffer.length

    const tokenRes = await fetch("https://pdf-services.adobe.io/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
    })
    const tokenData = (await tokenRes.json()) as any
    const token = tokenData.access_token
    if (!token) {
      res.status?.(401)?.json?.({
        error: "Adobe auth failed: " + (tokenData.error_description || JSON.stringify(tokenData)),
      }) ||
        res.end?.(
          JSON.stringify({
            error: "Adobe auth failed: " + (tokenData.error_description || JSON.stringify(tokenData)),
          }),
        )
      return
    }

    const assetRes = await fetch("https://pdf-services.adobe.io/assets", {
      method: "POST",
      headers: {
        "x-api-key": clientId,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mediaType: "application/pdf" }),
    })
    const assetData = (await assetRes.json()) as any
    const { uploadUri, assetID } = assetData
    if (!uploadUri || !assetID) {
      res.status?.(502)?.json?.({ error: "Failed to allocate Adobe asset URI" }) ||
        res.end?.(JSON.stringify({ error: "Failed to allocate Adobe asset URI" }))
      return
    }

    const uploadRes = await fetch(uploadUri, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: fileBuffer,
    })
    if (!uploadRes.ok) {
      res.status?.(502)?.json?.({ error: "Failed to upload PDF to Adobe asset store" }) ||
        res.end?.(JSON.stringify({ error: "Failed to upload PDF to Adobe asset store" }))
      return
    }

    const jobRes = await fetch("https://pdf-services.adobe.io/operation/compresspdf", {
      method: "POST",
      headers: {
        "x-api-key": clientId,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ assetID, compressionLevel }),
    })

    if (jobRes.status !== 201) {
      const errText = await jobRes.text()
      res.status?.(jobRes.status)?.json?.({ error: "Adobe CompressPDF Job failed: " + errText }) ||
        res.end?.(JSON.stringify({ error: "Adobe CompressPDF Job failed: " + errText }))
      return
    }

    const pollingUrl = jobRes.headers.get("location")
    if (!pollingUrl) {
      res.status?.(502)?.json?.({ error: "Missing polling location header" }) ||
        res.end?.(JSON.stringify({ error: "Missing polling location header" }))
      return
    }

    let downloadUri: string | null = null
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const pollRes = await fetch(pollingUrl, {
        headers: {
          "x-api-key": clientId,
          Authorization: "Bearer " + token,
        },
      })
      const pollData = (await pollRes.json()) as any
      if (pollData.status === "done" && pollData.asset?.downloadUri) {
        downloadUri = pollData.asset.downloadUri
        break
      }
      if (pollData.status === "failed") {
        res.status?.(500)?.json?.({ error: "Adobe optimization failed" }) ||
          res.end?.(JSON.stringify({ error: "Adobe optimization failed" }))
        return
      }
    }

    if (!downloadUri) {
      res.status?.(504)?.json?.({ error: "Adobe optimization timed out." }) ||
        res.end?.(JSON.stringify({ error: "Adobe optimization timed out." }))
      return
    }

    const resultRes = await fetch(downloadUri)
    const outputBuffer = Buffer.from(await resultRes.arrayBuffer())
    const compressedSize = outputBuffer.length
    const savedBytes = Math.max(0, originalSize - compressedSize)
    const savedPercentage = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0

    const payload = {
      success: true,
      pdfBase64: outputBuffer.toString("base64"),
      originalSize,
      compressedSize,
      savedPercentage,
      engine: "Adobe Acrobat PDF Services",
    }
    res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  } catch (err: any) {
    res.status?.(500)?.json?.({ error: err.message || "Internal server error" }) ||
      res.end?.(JSON.stringify({ error: err.message || "Internal server error" }))
  }
}
