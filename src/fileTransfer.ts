export const MAX_FILE_BYTES = 1024 ** 3
export const MAX_FILES = 20
export const ROOM_CODE_LENGTH = 10
export const ROOM_PREFIX = "mpdrop-"
export const TRANSFER_VERSION = 1
export const CHUNK_SIZE = 128 * 1024
export const ACK_INTERVAL = 4 * 1024 * 1024
export const BUFFER_HIGH_WATER = 2 * 1024 * 1024
export const MEMORY_FALLBACK_LIMIT = 128 * 1024 * 1024

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
]

export type TransferRole = "send" | "receive"
export type TransferPath = "connecting" | "local" | "direct" | "relay"

export interface FileOffer {
  transferId: string
  name: string
  size: number
  mime: string
  lastModified: number
}

export type TransferMessage =
  | { v: 1; type: "session-hello"; role: TransferRole; deviceName: string }
  | { v: 1; type: "session-end" }
  | { v: 1; type: "file-offer"; offer: FileOffer }
  | { v: 1; type: "file-response"; transferId: string; accepted: boolean; reason?: string }
  | { v: 1; type: "chunk-ack"; transferId: string; bytes: number }
  | { v: 1; type: "file-end"; transferId: string }
  | { v: 1; type: "file-complete"; transferId: string }
  | { v: 1; type: "file-error"; transferId: string; message: string }
  | { v: 1; type: "transfer-cancel"; transferId?: string }

export interface TransferIceResult {
  servers: RTCIceServer[]
  relayMode: "private" | "community" | "none"
  warning?: string
}

export interface TransferIceOptions {
  credentialsUrl?: string
  urls?: string
  username?: string
  credential?: string
  fetchImpl?: typeof fetch
  now?: number
}

export function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte & 31]).join("")
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH)
}

export function formatRoomCode(value: string): string {
  const code = normalizeRoomCode(value)
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code
}

export function getHostPeerId(roomCode: string): string {
  return `${ROOM_PREFIX}${normalizeRoomCode(roomCode)}`
}

export function buildPairingUrl(roomCode: string, origin: string): string {
  return `${origin}/#transfer?room=${normalizeRoomCode(roomCode)}&receive=1`
}

export function parsePairingUrl(value: string, currentOrigin: string): string | null {
  try {
    const url = new URL(value, currentOrigin)
    if (url.origin !== currentOrigin) return null
    const [route, query = ""] = url.hash.slice(1).split("?")
    if (route !== "transfer") return null
    const roomCode = normalizeRoomCode(new URLSearchParams(query).get("room") || "")
    return roomCode.length === ROOM_CODE_LENGTH ? roomCode : null
  } catch {
    return null
  }
}

export function cleanFileName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "_").slice(0, 255) || "Untitled file"
}

export function validateFileSize(size: number): string | null {
  if (!Number.isSafeInteger(size) || size < 0) return "This file size is not valid."
  if (size > MAX_FILE_BYTES) return "Each file must be 1 GB or smaller."
  return null
}

export function validateFileOffer(value: unknown): FileOffer | null {
  if (!value || typeof value !== "object") return null
  const offer = value as Record<string, unknown>
  if (
    typeof offer.transferId !== "string" ||
    !offer.transferId ||
    offer.transferId.length > 80 ||
    typeof offer.name !== "string" ||
    !offer.name ||
    offer.name.length > 512 ||
    typeof offer.size !== "number" ||
    validateFileSize(offer.size) ||
    typeof offer.mime !== "string" ||
    offer.mime.length > 255 ||
    typeof offer.lastModified !== "number" ||
    !Number.isSafeInteger(offer.lastModified) ||
    offer.lastModified < 0
  ) {
    return null
  }
  return {
    transferId: offer.transferId,
    name: cleanFileName(offer.name),
    size: offer.size,
    mime: offer.mime,
    lastModified: offer.lastModified,
  }
}

export function serializeTransferMessage(message: TransferMessage): string {
  return JSON.stringify(message)
}

export function parseTransferMessage(value: string): TransferMessage | null {
  if (!value || value.length > 16 * 1024) return null
  try {
    const message = JSON.parse(value) as Record<string, unknown>
    if (message.v !== TRANSFER_VERSION || typeof message.type !== "string") return null
    if (message.type === "session-hello") {
      if (
        (message.role !== "send" && message.role !== "receive") ||
        typeof message.deviceName !== "string" ||
        !message.deviceName ||
        message.deviceName.length > 120
      ) {
        return null
      }
      return { v: 1, type: "session-hello", role: message.role, deviceName: message.deviceName }
    }
    if (message.type === "session-end") return { v: 1, type: "session-end" }
    if (message.type === "file-offer") {
      const offer = validateFileOffer(message.offer)
      return offer ? { v: 1, type: "file-offer", offer } : null
    }
    if (message.type === "file-response") {
      if (
        typeof message.transferId !== "string" ||
        !message.transferId ||
        message.transferId.length > 80 ||
        typeof message.accepted !== "boolean" ||
        (message.reason !== undefined &&
          (typeof message.reason !== "string" || message.reason.length > 300))
      ) {
        return null
      }
      return {
        v: 1,
        type: "file-response",
        transferId: message.transferId,
        accepted: message.accepted,
        reason: message.reason,
      }
    }
    if (message.type === "chunk-ack") {
      if (
        typeof message.transferId !== "string" ||
        !message.transferId ||
        message.transferId.length > 80 ||
        typeof message.bytes !== "number" ||
        !Number.isSafeInteger(message.bytes) ||
        message.bytes < 0 ||
        message.bytes > MAX_FILE_BYTES
      ) {
        return null
      }
      return { v: 1, type: "chunk-ack", transferId: message.transferId, bytes: message.bytes }
    }
    if (
      message.type === "file-end" ||
      message.type === "file-complete" ||
      message.type === "file-error"
    ) {
      if (
        typeof message.transferId !== "string" ||
        !message.transferId ||
        message.transferId.length > 80 ||
        (message.type === "file-error" &&
          (typeof message.message !== "string" || !message.message || message.message.length > 300))
      ) {
        return null
      }
      return message.type === "file-error"
        ? { v: 1, type: "file-error", transferId: message.transferId, message: message.message as string }
        : { v: 1, type: message.type, transferId: message.transferId }
    }
    if (message.type === "transfer-cancel") {
      if (
        message.transferId !== undefined &&
        (typeof message.transferId !== "string" ||
          !message.transferId ||
          message.transferId.length > 80)
      ) {
        return null
      }
      return { v: 1, type: "transfer-cancel", transferId: message.transferId }
    }
    return null
  } catch {
    return null
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(value: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of value) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function encodeTransferChunk(value: Uint8Array): ArrayBuffer {
  const frame = new Uint8Array(value.length + 4)
  new DataView(frame.buffer).setUint32(0, crc32(value), false)
  frame.set(value, 4)
  return frame.buffer
}

export function decodeTransferChunk(value: ArrayBuffer | ArrayBufferView): {
  data: Uint8Array
  valid: boolean
} | null {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (bytes.length < 4 || bytes.length > CHUNK_SIZE + 4) return null
  const expected = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false)
  const data = bytes.subarray(4)
  return { data, valid: crc32(data) === expected }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

async function hmacSha1Base64(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

export async function createOpenRelayIceServers(now = Date.now()): Promise<RTCIceServer[]> {
  const username = String(Math.floor(now / 1000) + 3600)
  const credential = await hmacSha1Base64(username, "openrelayprojectsecret")
  return [
    {
      urls: [
        "turn:staticauth.openrelay.metered.ca:80?transport=udp",
        "turn:staticauth.openrelay.metered.ca:443?transport=udp",
        "turn:staticauth.openrelay.metered.ca:443?transport=tcp",
        "turns:staticauth.openrelay.metered.ca:443?transport=tcp",
      ],
      username,
      credential,
    },
  ]
}

function normalizeIceServers(value: unknown): RTCIceServer[] | null {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { iceServers?: unknown }).iceServers)
      ? (value as { iceServers: unknown[] }).iceServers
      : null
  if (!list || list.length === 0 || list.length > 20) return null
  const servers: RTCIceServer[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== "object") return null
    const server = entry as Record<string, unknown>
    const urls = typeof server.urls === "string"
      ? [server.urls]
      : Array.isArray(server.urls) && server.urls.every((url) => typeof url === "string")
        ? server.urls
        : null
    if (!urls || urls.length === 0 || urls.length > 12) return null
    if (urls.some((url) => url.length > 2048 || !/^(stun|stuns|turn|turns):/i.test(url))) return null
    if (
      (server.username !== undefined && (typeof server.username !== "string" || server.username.length > 255)) ||
      (server.credential !== undefined && (typeof server.credential !== "string" || server.credential.length > 1024))
    ) {
      return null
    }
    servers.push({
      urls: urls.length === 1 ? urls[0] : urls,
      username: server.username as string | undefined,
      credential: server.credential as string | undefined,
    })
  }
  return servers
}

export async function getTransferIceServers(
  options: TransferIceOptions = {},
): Promise<TransferIceResult> {
  if (options.credentialsUrl) {
    try {
      const url = new URL(options.credentialsUrl, window.location.origin)
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("TURN credential URLs must use HTTPS.")
      }
      const response = await (options.fetchImpl || fetch)(url, { signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error(`TURN credentials returned ${response.status}.`)
      const servers = normalizeIceServers(await response.json())
      if (!servers) throw new Error("TURN credentials returned an invalid server list.")
      return { servers: [...DEFAULT_STUN_SERVERS, ...servers], relayMode: "private" }
    } catch (error) {
      return {
        servers: DEFAULT_STUN_SERVERS,
        relayMode: "none",
        warning: `Private TURN is unavailable. Direct connections still work. ${error instanceof Error ? error.message : ""}`.trim(),
      }
    }
  }

  if (options.urls || options.username || options.credential) {
    if (!options.urls || !options.username || !options.credential) {
      return {
        servers: DEFAULT_STUN_SERVERS,
        relayMode: "none",
        warning: "TURN configuration is incomplete. Direct connections still work.",
      }
    }
    const urls = options.urls.split(",").map((url) => url.trim()).filter(Boolean)
    const servers = normalizeIceServers([{ urls, username: options.username, credential: options.credential }])
    if (!servers) {
      return {
        servers: DEFAULT_STUN_SERVERS,
        relayMode: "none",
        warning: "TURN configuration is invalid. Direct connections still work.",
      }
    }
    return { servers: [...DEFAULT_STUN_SERVERS, ...servers], relayMode: "private" }
  }

  return {
    servers: [...DEFAULT_STUN_SERVERS, ...(await createOpenRelayIceServers(options.now))],
    relayMode: "community",
  }
}
