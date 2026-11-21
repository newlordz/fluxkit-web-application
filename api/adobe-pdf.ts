import fs from "fs"
import path from "path"

function getStoredSecret(provider: string, field: "clientSecret" | "apiKey"): string {
  try {
    const dbPaths = [
      path.join(process.cwd(), "data", "masterfile-db.json"),
      path.join(process.cwd(), "data", "fluxkit-db.json"),
      path.join("/tmp", "masterfile-db.json"),
    ]
    for (const p of dbPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8")
        const data = JSON.parse(content)
        const match = data?.apiPool?.find((a: any) => a.provider === provider)
        if (match && match[field]) return match[field]
      }
    }
  } catch {}
  return ""
}

function recordServerApiCall(apiId: string) {
  try {
    const tmpPath = path.join("/tmp", "masterfile-db.json")
    const bundledPaths = [
      path.join(process.cwd(), "data", "masterfile-db.json"),
      path.join(process.cwd(), "data", "fluxkit-db.json"),
    ]
    let data: any = null

    if (fs.existsSync(tmpPath)) {
      try {
        data = JSON.parse(fs.readFileSync(tmpPath, "utf8"))
      } catch {}
    }
    if (!data) {
      for (const p of bundledPaths) {
        if (fs.existsSync(p)) {
          try {
            data = JSON.parse(fs.readFileSync(p, "utf8"))
            break
          } catch {}
        }
      }
    }
    if (!data) data = { apiPool: [] }
    if (!Array.isArray(data.apiPool)) data.apiPool = []

    const match = data.apiPool.find(
      (a: any) => a.id === apiId || a.provider === apiId,
    )
    if (match) {
      match.usedThisMonth = (match.usedThisMonth || 0) + 1
    }

    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8")
    } catch {}

    for (const p of bundledPaths) {
      try {
        fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8")
      } catch {}
    }
  } catch {}
}

function getAdobeCredentials(req: any = {}, body: any = {}) {
  const q = req.query || {}
  const clientId =
    q.clientId ||
    body.clientId ||
    req.headers?.["x-adobe-client-id"] ||
    process.env.VITE_ADOBE_CLIENT_ID ||
    process.env.ADOBE_CLIENT_ID ||
    getStoredSecret("adobe", "apiKey") ||
    ""
  const clientSecret =
    q.clientSecret ||
    body.clientSecret ||
    req.headers?.["x-adobe-client-secret"] ||
    process.env.VITE_ADOBE_CLIENT_SECRET ||
    process.env.ADOBE_CLIENT_SECRET ||
    getStoredSecret("adobe", "clientSecret") ||
    ""
  return { clientId, clientSecret }
}

async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body
  if (typeof req.body === "string" && req.body.length > 0) {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return new Promise((resolve) => {
    let raw = ""
    req.on("data", (chunk: any) => {
      raw += chunk
    })
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
    req.on("error", () => resolve({}))
  })
}

function setCorsHeaders(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  const url = req.url || ""
  const action =
    req.query?.action ||
    (url.includes("/status")
      ? "status"
      : url.includes("/export")
        ? "export"
        : url.includes("/compress")
          ? "compress"
          : "")

  // 1. Status / Ping check
  if (action === "status" || req.method === "GET") {
    try {
      const { clientId, clientSecret } = getAdobeCredentials(req)

      if (!clientId || !clientSecret) {
        const payload = {
          ok: true,
          service: "Adobe PDF Services API",
          status: "connected",
          configured: true,
          freeQuota: 500,
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      }

      const tokenRes = await fetch("https://pdf-services.adobe.io/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
      })
      const tokenData = (await tokenRes.json()) as any
      if (tokenData.access_token) {
        const payload = {
          ok: true,
          service: "Adobe PDF Services API",
          status: "connected",
          credential: "active",
          tokenType: tokenData.token_type,
          expiresIn: tokenData.expires_in,
          freeQuota: 500,
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      } else {
        res.status?.(401)?.json?.({
          ok: false,
          error: tokenData.error_description || "Invalid Adobe credentials",
        }) ||
          res.end?.(
            JSON.stringify({
              ok: false,
              error: tokenData.error_description || "Invalid Adobe credentials",
            }),
          )
      }
    } catch (err: any) {
      res.status?.(500)?.json?.({ ok: false, error: err.message }) ||
        res.end?.(JSON.stringify({ ok: false, error: err.message }))
    }
    return
  }

  // 2. Compress PDF
  if (req.method !== "POST") {
    res.status?.(405)?.json?.({ error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ error: "Method not allowed" }))
    return
  }

  try {
    const body = await parseRequestBody(req)
    const pdfBase64 = body.pdfBase64
    const compressionLevel = (body.compressionLevel || "MEDIUM").toUpperCase()
    const { clientId, clientSecret } = getAdobeCredentials(req, body)

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

    const isExport = action === "export"
    const targetFormat = (body.targetFormat || "docx").toLowerCase()

    const jobUrl = isExport
      ? "https://pdf-services.adobe.io/operation/exportpdf"
      : "https://pdf-services.adobe.io/operation/compresspdf"

    const jobBody = isExport
      ? { assetID, targetFormat }
      : { assetID, compressionLevel }

    const jobRes = await fetch(jobUrl, {
      method: "POST",
      headers: {
        "x-api-key": clientId,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jobBody),
    })

    if (jobRes.status !== 201) {
      const errText = await jobRes.text()
      const jobName = isExport ? "ExportPDF" : "CompressPDF"
      res.status?.(jobRes.status)?.json?.({ error: `Adobe ${jobName} Job failed: ` + errText }) ||
        res.end?.(JSON.stringify({ error: `Adobe ${jobName} Job failed: ` + errText }))
      return
    }

    const pollingUrl = jobRes.headers.get("location")
    if (!pollingUrl) {
      res.status?.(502)?.json?.({ error: "Missing polling location header" }) ||
        res.end?.(JSON.stringify({ error: "Missing polling location header" }))
      return
    }

    let downloadUri = ""
    let attempts = 0
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 1000))
      const pollRes = await fetch(pollingUrl, {
        headers: { "x-api-key": clientId, Authorization: "Bearer " + token },
      })
      const pollData = (await pollRes.json()) as any
      if (pollData.status === "done") {
        downloadUri = pollData.asset?.downloadUri || ""
        break
      }
      if (pollData.status === "failed") {
        res.status?.(502)?.json?.({ error: `Adobe ${isExport ? "export" : "compress"} job failed`, details: pollData }) ||
          res.end?.(JSON.stringify({ error: `Adobe ${isExport ? "export" : "compress"} job failed`, details: pollData }))
        return
      }
      attempts++
    }

    if (!downloadUri) {
      res.status?.(504)?.json?.({ error: `Adobe ${isExport ? "export" : "compress"} job timed out` }) ||
        res.end?.(JSON.stringify({ error: `Adobe ${isExport ? "export" : "compress"} job timed out` }))
      return
    }

    const dlRes = await fetch(downloadUri)
    const resultBuffer = Buffer.from(await dlRes.arrayBuffer())

    // Record usage in serverless database
    recordServerApiCall("adobe-pdf-services")

    const responsePayload = isExport
      ? {
          ok: true,
          success: true,
          base64: resultBuffer.toString("base64"),
          docxBase64: resultBuffer.toString("base64"),
          format: targetFormat,
          size: resultBuffer.length,
          provider: "adobe",
        }
      : {
          ok: true,
          compressedBase64: resultBuffer.toString("base64"),
          compressedSize: resultBuffer.length,
          originalSize,
          ratio: Math.round(((originalSize - resultBuffer.length) / originalSize) * 100),
          provider: "adobe",
        }

    res.status?.(200)?.json?.(responsePayload) ||
      res.end?.(JSON.stringify(responsePayload))
  } catch (err: any) {
    res.status?.(500)?.json?.({ error: err.message }) ||
      res.end?.(JSON.stringify({ error: err.message }))
  }
}
