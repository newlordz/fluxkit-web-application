import { getILovePdfCredentials, parseRequestBody, setCorsHeaders } from "../_cloudUtils"

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
    const compressionLevel =
      body.compressionLevel === "extreme"
        ? "extreme"
        : body.compressionLevel === "low"
          ? "low"
          : "recommended"
    const { publicKey } = getILovePdfCredentials(body)

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
      res.status?.(401)?.json?.({ error: "iLovePDF Auth failed: " + JSON.stringify(authData) }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF Auth failed: " + JSON.stringify(authData) }))
      return
    }

    const startRes = await fetch("https://api.ilovepdf.com/v1/start/compress", {
      headers: { Authorization: "Bearer " + token },
    })
    const { server: apiServer, task } = (await startRes.json()) as any
    if (!apiServer || !task) {
      res.status?.(502)?.json?.({ error: "iLovePDF task creation failed" }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF task creation failed" }))
      return
    }

    const formData = new FormData()
    formData.append("task", task)
    formData.append(
      "file",
      new Blob([fileBuffer], { type: "application/pdf" }),
      "document.pdf",
    )

    const uploadRes = await fetch(`https://${apiServer}/v1/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    })
    const uploadData = (await uploadRes.json()) as any
    const serverFilename = uploadData.server_filename
    if (!serverFilename) {
      res.status?.(502)?.json?.({ error: "iLovePDF upload failed" }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF upload failed" }))
      return
    }

    const procRes = await fetch(`https://${apiServer}/v1/process`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task,
        tool: "compress",
        files: [{ server_filename: serverFilename, filename: "document.pdf" }],
        compression_level: compressionLevel,
      }),
    })
    const procData = (await procRes.json()) as any
    if (procData.status !== "TaskSuccess") {
      res.status?.(500)?.json?.({ error: "iLovePDF processing failed" }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF processing failed" }))
      return
    }

    const dlRes = await fetch(`https://${apiServer}/v1/download/${task}`, {
      headers: { Authorization: "Bearer " + token },
    })
    const outputBuffer = Buffer.from(await dlRes.arrayBuffer())
    const compressedSize = outputBuffer.length
    const savedBytes = Math.max(0, originalSize - compressedSize)
    const savedPercentage = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0

    const payload = {
      success: true,
      pdfBase64: outputBuffer.toString("base64"),
      originalSize,
      compressedSize,
      savedPercentage,
      engine: "iLovePDF Cloud",
    }
    res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  } catch (err: any) {
    res.status?.(500)?.json?.({ error: err.message || "Internal server error" }) ||
      res.end?.(JSON.stringify({ error: err.message || "Internal server error" }))
  }
}
