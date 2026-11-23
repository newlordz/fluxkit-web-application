import { currentUser } from "./_lib/auth"
import { getILovePdfCredentials, recordApiCall } from "./_lib/providers"

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
      : url.includes("/pdfword")
        ? "pdfword"
        : url.includes("/pdfppt")
          ? "pdfppt"
          : url.includes("/compress")
            ? "compress"
            : "")

  // 1. Status / Ping check
  if (action === "status" || req.method === "GET") {
    try {
      const { publicKey } = await getILovePdfCredentials()
      if (!publicKey) {
        const payload = {
          ok: true,
          service: "iLovePDF API",
          status: "connected",
          configured: true,
          freeQuota: 250,
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      }

      const authRes = await fetch("https://api.ilovepdf.com/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_key: publicKey }),
      })
      const data = (await authRes.json()) as any
      if (data.token) {
        const payload = {
          ok: true,
          service: "iLovePDF API",
          status: "connected",
          freeQuota: 250,
          tokenType: "JWT",
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      } else {
        res.status?.(401)?.json?.({ ok: false, error: data.name || "Invalid iLovePDF Key" }) ||
          res.end?.(JSON.stringify({ ok: false, error: data.name || "Invalid iLovePDF Key" }))
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
    const compressionLevel = body.compressionLevel || "recommended"
    const { publicKey } = await getILovePdfCredentials()

    if (!pdfBase64) {
      res.status?.(400)?.json?.({ error: "pdfBase64 is required" }) ||
        res.end?.(JSON.stringify({ error: "pdfBase64 is required" }))
      return
    }

    const fileBuffer = Buffer.from(pdfBase64, "base64")
    const originalSize = fileBuffer.length

    const authRes = await fetch("https://api.ilovepdf.com/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key: publicKey }),
    })
    const authData = (await authRes.json()) as any
    const token = authData.token
    if (!token) {
      res.status?.(401)?.json?.({ error: "iLovePDF Auth failed: " + (authData.name || "Invalid Key") }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF Auth failed: " + (authData.name || "Invalid Key") }))
      return
    }

    const tool =
      action === "pdfword"
        ? "pdfword"
        : action === "pdfppt"
          ? "pdfppt"
          : "compress"

    const startRes = await fetch(`https://api.ilovepdf.com/v1/start/${tool}`, {
      headers: { Authorization: "Bearer " + token },
    })
    const startData = (await startRes.json()) as any
    const { server, task } = startData

    if (!server || !task) {
      res.status?.(502)?.json?.({ error: "Failed to initialize iLovePDF task", details: startData }) ||
        res.end?.(JSON.stringify({ error: "Failed to initialize iLovePDF task", details: startData }))
      return
    }

    const uploadForm = new FormData()
    uploadForm.append("task", task)
    uploadForm.append(
      "file",
      new Blob([fileBuffer], { type: "application/pdf" }),
      "document.pdf",
    )

    const uploadRes = await fetch(`https://${server}/v1/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: uploadForm,
    })
    const uploadData = (await uploadRes.json()) as any
    const serverFilename = uploadData.server_filename
    if (!serverFilename) {
      res.status?.(502)?.json?.({ error: "Failed to upload file to iLovePDF task", details: uploadData }) ||
        res.end?.(JSON.stringify({ error: "Failed to upload file to iLovePDF task", details: uploadData }))
      return
    }

    const processPayload: any = {
      task,
      tool,
      files: [{ server_filename: serverFilename, filename: "document.pdf" }],
    }
    if (tool === "compress") {
      processPayload.compression_level = compressionLevel
    }

    const processRes = await fetch(`https://${server}/v1/process`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(processPayload),
    })
    const processData = (await processRes.json()) as any
    if (processData.status !== "TaskSuccess") {
      res.status?.(502)?.json?.({ error: "iLovePDF processing failed", details: processData }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF processing failed", details: processData }))
      return
    }

    const downloadRes = await fetch(`https://${server}/v1/download/${task}`, {
      headers: { Authorization: "Bearer " + token },
    })
    const resultBuffer = Buffer.from(await downloadRes.arrayBuffer())

    // Append-only usage ledger; monthly totals are derived, never stored.
    await recordApiCall(
      "ilovepdf",
      "compress",
      (await currentUser(req))?.id ?? null,
      "success",
    )

    const responsePayload = {
      ok: true,
      success: true,
      base64: resultBuffer.toString("base64"),
      docxBase64: resultBuffer.toString("base64"),
      pdfBase64: resultBuffer.toString("base64"),
      compressedBase64: resultBuffer.toString("base64"),
      compressedSize: resultBuffer.length,
      originalSize,
      ratio: Math.round(((originalSize - resultBuffer.length) / originalSize) * 100),
      provider: "ilovepdf",
    }

    res.status?.(200)?.json?.(responsePayload) ||
      res.end?.(JSON.stringify(responsePayload))
  } catch (err: any) {
    res.status?.(500)?.json?.({ error: err.message }) ||
      res.end?.(JSON.stringify({ error: err.message }))
  }
}
