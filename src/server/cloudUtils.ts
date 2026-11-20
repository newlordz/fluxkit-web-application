export function getAdobeCredentials(body: any = {}) {
  const clientId =
    body.clientId ||
    process.env.VITE_ADOBE_CLIENT_ID ||
    process.env.ADOBE_CLIENT_ID ||
    ""
  const clientSecret =
    body.clientSecret ||
    process.env.VITE_ADOBE_CLIENT_SECRET ||
    process.env.ADOBE_CLIENT_SECRET ||
    ""
  return { clientId, clientSecret }
}

export function getILovePdfCredentials(body: any = {}) {
  const publicKey =
    body.publicKey ||
    process.env.VITE_ILOVEPDF_PUBLIC_KEY ||
    process.env.ILOVEPDF_PUBLIC_KEY ||
    ""
  const secretKey =
    body.secretKey ||
    process.env.VITE_ILOVEPDF_SECRET_KEY ||
    process.env.ILOVEPDF_SECRET_KEY ||
    ""
  return { publicKey, secretKey }
}

export function getOcrSpaceKey(body: any = {}) {
  return (
    body.apiKey ||
    process.env.VITE_OCRSPACE_API_KEY ||
    process.env.OCRSPACE_API_KEY ||
    ""
  )
}

export async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === "object") {
    return req.body
  }
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

export function setCorsHeaders(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}
