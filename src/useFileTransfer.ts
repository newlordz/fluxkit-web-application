import { useCallback, useEffect, useRef, useState } from "react"
import type { DataConnection, Peer } from "peerjs"
import {
  ACK_INTERVAL,
  BUFFER_HIGH_WATER,
  CHUNK_SIZE,
  MAX_FILE_BYTES,
  MAX_FILES,
  MEMORY_FALLBACK_LIMIT,
  createRoomCode,
  decodeTransferChunk,
  encodeTransferChunk,
  formatBytes,
  getHostPeerId,
  getTransferIceServers,
  normalizeRoomCode,
  parseTransferMessage,
  serializeTransferMessage,
  validateFileOffer,
  validateFileSize,
  type FileOffer,
  type TransferIceResult,
  type TransferMessage,
  type TransferPath,
  type TransferRole,
} from "./fileTransfer"

export type TransferStatus =
  | "idle"
  | "preparing"
  | "hosting"
  | "joining"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"

export interface OutgoingTransfer extends FileOffer {
  file: File
  status: "queued" | "waiting" | "sending" | "complete" | "declined" | "error" | "cancelled"
  sent: number
  error?: string
}

export interface ActiveReceive {
  offer: FileOffer
  received: number
  status: "receiving" | "error"
  error?: string
}

export interface ReceivedTransfer extends FileOffer {
  url: string
  storage: "opfs" | "memory"
  handle?: FileSystemFileHandle
  directory?: FileSystemDirectoryHandle
  storageName?: string
}

interface ReceiverContext {
  offer: FileOffer
  generation: number
  mode: "opfs" | "memory"
  writable?: FileSystemWritableFileStream
  handle?: FileSystemFileHandle
  directory?: FileSystemDirectoryHandle
  storageName?: string
  chunks: ArrayBuffer[]
  received: number
  lastAck: number
  abortController: AbortController
}

interface ControlWaiter {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

function createTransferId(): string {
  return crypto.randomUUID()
}

function getDeviceName(): string {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  const kind = coarse && small ? "Phone" : coarse ? "Tablet" : "Computer"
  return `${kind} · ${crypto.randomUUID().slice(0, 4).toUpperCase()}`
}

interface CandidateStats {
  id: string
  candidateType?: string
}

async function getConnectionPath(connection: DataConnection): Promise<TransferPath | null> {
  const stats = await connection.peerConnection.getStats()
  let selectedPair: RTCIceCandidatePairStats | null = null
  const candidates = new Map<string, CandidateStats>()
  stats.forEach((report) => {
    if (report.type === "local-candidate" || report.type === "remote-candidate") {
      candidates.set(report.id, report as CandidateStats)
    }
    if (
      report.type === "candidate-pair" &&
      report.state === "succeeded" &&
      (report.nominated || report.selected)
    ) {
      selectedPair = report as RTCIceCandidatePairStats
    }
  })
  const pair = selectedPair as RTCIceCandidatePairStats | null
  if (!pair) return null
  const local = candidates.get(pair.localCandidateId)
  const remote = candidates.get(pair.remoteCandidateId)
  if (!local || !remote) return null
  if (local.candidateType === "relay" || remote.candidateType === "relay") return "relay"
  return local.candidateType === "host" && remote.candidateType === "host" ? "local" : "direct"
}

export default function useFileTransfer() {
  const [status, setStatus] = useState<TransferStatus>("idle")
  const [role, setRole] = useState<TransferRole | null>(null)
  const [roomCode, setRoomCode] = useState("")
  const [signalingReady, setSignalingReady] = useState(false)
  const [remoteDeviceName, setRemoteDeviceName] = useState("")
  const [path, setPath] = useState<TransferPath>("connecting")
  const [ice, setIce] = useState<TransferIceResult | null>(null)
  const [error, setError] = useState("")
  const [outbound, setOutbound] = useState<OutgoingTransfer[]>([])
  const [incomingOffer, setIncomingOffer] = useState<FileOffer | null>(null)
  const [activeReceive, setActiveReceive] = useState<ActiveReceive | null>(null)
  const [received, setReceived] = useState<ReceivedTransfer[]>([])

  const peerRef = useRef<Peer | null>(null)
  const connectionRef = useRef<DataConnection | null>(null)
  const roleRef = useRef<TransferRole | null>(null)
  const generationRef = useRef(0)
  const signalingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const queueRef = useRef<OutgoingTransfer[]>([])
  const sendingRef = useRef(false)
  const activeTransferRef = useRef<string | null>(null)
  const pendingOfferRef = useRef<FileOffer | null>(null)
  const receiverRef = useRef<ReceiverContext | null>(null)
  const discardTransferRef = useRef<string | null>(null)
  const dataHandlerRef = useRef<(data: unknown) => Promise<void>>(async () => {})
  const dataChainRef = useRef<Promise<void>>(Promise.resolve())
  const waitersRef = useRef(new Map<string, ControlWaiter>())

  const sendControl = useCallback((message: TransferMessage) => {
    const connection = connectionRef.current
    if (!connection || !connection.open) return false
    try {
      connection.send(serializeTransferMessage(message))
      return true
    } catch {
      return false
    }
  }, [])

  const rejectWaiters = useCallback((message: string) => {
    for (const waiter of waitersRef.current.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(message))
    }
    waitersRef.current.clear()
  }, [])

  const updateOutgoing = useCallback((transferId: string, patch: Partial<OutgoingTransfer>) => {
    const queued = queueRef.current.find((item) => item.transferId === transferId)
    if (queued) Object.assign(queued, patch)
    setOutbound((items) => items.map((item) => item.transferId === transferId ? { ...item, ...patch } : item))
  }, [])

  const clearSignalingTimer = useCallback(() => {
    if (signalingTimerRef.current) clearTimeout(signalingTimerRef.current)
    signalingTimerRef.current = null
  }, [])

  const clearPathTimer = useCallback(() => {
    if (pathTimerRef.current) clearInterval(pathTimerRef.current)
    pathTimerRef.current = null
  }, [])

  const disposeReceiver = useCallback(async (receiver: ReceiverContext, removeFile = false) => {
    receiver.abortController.abort()
    if (receiver.writable) {
      try {
        await receiver.writable.abort()
      } catch {}
    }
    if (removeFile && receiver.directory && receiver.storageName) {
      try {
        await receiver.directory.removeEntry(receiver.storageName)
      } catch {}
    }
  }, [])

  const abandonReceiver = useCallback(async (removeFile = false) => {
    const receiver = receiverRef.current
    receiverRef.current = null
    if (receiver) await disposeReceiver(receiver, removeFile)
  }, [disposeReceiver])

  const leaveRoom = useCallback(() => {
    generationRef.current += 1
    dataChainRef.current = Promise.resolve()
    discardTransferRef.current = null
    clearSignalingTimer()
    clearPathTimer()
    rejectWaiters("The transfer session ended.")
    const connection = connectionRef.current
    if (connection?.open) sendControl({ v: 1, type: "session-end" })
    connection?.close()
    peerRef.current?.destroy()
    peerRef.current = null
    connectionRef.current = null
    roleRef.current = null
    sendingRef.current = false
    activeTransferRef.current = null
    queueRef.current = []
    pendingOfferRef.current = null
    void abandonReceiver(true)
    setReceived((items) => {
      for (const item of items) {
        URL.revokeObjectURL(item.url)
        if (item.directory && item.storageName) void item.directory.removeEntry(item.storageName).catch(() => {})
      }
      return []
    })
    setOutbound([])
    setIncomingOffer(null)
    setActiveReceive(null)
    setRemoteDeviceName("")
    setRoomCode("")
    setRole(null)
    setSignalingReady(false)
    setPath("connecting")
    setIce(null)
    setError("")
    setStatus("idle")
  }, [abandonReceiver, clearPathTimer, clearSignalingTimer, rejectWaiters, sendControl])

  useEffect(() => leaveRoom, [leaveRoom])

  const waitForControl = useCallback((key: string, timeout: number) => {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waitersRef.current.delete(key)
        reject(new Error("The other device stopped responding."))
      }, timeout)
      waitersRef.current.set(key, { resolve, reject, timer })
    })
  }, [])

  const waitForBuffer = useCallback(async (generation: number) => {
    while (generation === generationRef.current) {
      const connection = connectionRef.current
      if (!connection?.open) throw new Error("The connection closed.")
      const channel = connection.dataChannel
      const peerQueue = (connection as DataConnection & { bufferSize?: number }).bufferSize || 0
      if (channel.readyState === "open" && channel.bufferedAmount <= BUFFER_HIGH_WATER && peerQueue === 0) {
        return
      }
      await delay(20)
    }
    throw new Error("The transfer was cancelled.")
  }, [])

  const sendFile = useCallback(async (item: OutgoingTransfer, generation: number) => {
    const transferId = item.transferId
    activeTransferRef.current = transferId
    updateOutgoing(transferId, { status: "sending", sent: 0, error: undefined })
    let sent = 0
    let nextAck = ACK_INTERVAL
    let lastProgress = 0
    try {
      for (let offset = 0; offset < item.file.size; offset += CHUNK_SIZE) {
        if (generation !== generationRef.current || activeTransferRef.current !== transferId) {
          throw new Error("The transfer was cancelled.")
        }
        await waitForBuffer(generation)
        const chunk = new Uint8Array(await item.file.slice(offset, Math.min(offset + CHUNK_SIZE, item.file.size)).arrayBuffer())
        if (generation !== generationRef.current || activeTransferRef.current !== transferId) {
          throw new Error("The transfer was cancelled.")
        }
        const connection = connectionRef.current
        if (!connection?.open) throw new Error("The connection closed.")
        connection.send(encodeTransferChunk(chunk))
        sent += chunk.length
        if (sent >= nextAck) {
          await waitForControl(`${transferId}:ack`, 60_000)
          nextAck += ACK_INTERVAL
        }
        const now = performance.now()
        if (now - lastProgress > 100 || sent === item.file.size) {
          updateOutgoing(transferId, { sent })
          lastProgress = now
        }
      }
      if (!sendControl({ v: 1, type: "file-end", transferId })) throw new Error("The connection closed.")
      await waitForControl(`${transferId}:complete`, 120_000)
      if (generation !== generationRef.current) throw new Error("The transfer was cancelled.")
      updateOutgoing(transferId, { status: "complete", sent: item.file.size })
    } catch (transferError) {
      if (activeTransferRef.current !== transferId) return
      const message = transferError instanceof Error ? transferError.message : "The transfer failed."
      updateOutgoing(transferId, { status: "error", error: message })
      sendControl({ v: 1, type: "file-error", transferId, message: message.slice(0, 300) })
    } finally {
      if (activeTransferRef.current === transferId) {
        activeTransferRef.current = null
        sendingRef.current = false
      }
      queueMicrotask(() => pumpQueueRef.current(generation))
    }
  }, [sendControl, updateOutgoing, waitForBuffer, waitForControl])

  const pumpQueueRef = useRef<(generation: number) => void>(() => {})
  pumpQueueRef.current = (generation: number) => {
    if (sendingRef.current || generation !== generationRef.current || !connectionRef.current?.open) return
    const next = queueRef.current.find((item) => item.status === "queued")
    if (!next) return
    sendingRef.current = true
    activeTransferRef.current = next.transferId
    updateOutgoing(next.transferId, { status: "waiting", sent: 0, error: undefined })
    if (!sendControl({ v: 1, type: "file-offer", offer: {
      transferId: next.transferId,
      name: next.name,
      size: next.size,
      mime: next.mime,
      lastModified: next.lastModified,
    } })) {
      sendingRef.current = false
      activeTransferRef.current = null
      updateOutgoing(next.transferId, { status: "error", error: "The connection closed." })
      return
    }
  }

  const startPathMonitor = useCallback((connection: DataConnection, generation: number) => {
    clearPathTimer()
    let checking = false
    pathTimerRef.current = setInterval(() => {
      if (checking || generation !== generationRef.current || connection.dataChannel.readyState !== "open") return
      checking = true
      void getConnectionPath(connection).then((nextPath) => {
        if (nextPath && generation === generationRef.current) setPath(nextPath)
      }).catch(() => {}).finally(() => { checking = false })
    }, 1800)
  }, [clearPathTimer])

  const setupConnection = useCallback((connection: DataConnection, expectedRole: TransferRole, generation: number) => {
    if (connectionRef.current) {
      connection.close()
      return
    }
    connectionRef.current = connection
    setStatus("connecting")
    setPath("connecting")
    setError("")
    signalingTimerRef.current = setTimeout(() => {
      if (generation === generationRef.current && !connection.open) {
        leaveRoom()
        setStatus("error")
        setError("The devices could not connect within 45 seconds. Check the code and try again.")
      }
    }, 45_000)

    connection.on("open", () => {
      if (generation !== generationRef.current) return
      clearSignalingTimer()
      sendControl({ v: 1, type: "session-hello", role: roleRef.current || expectedRole, deviceName: getDeviceName() })
      startPathMonitor(connection, generation)
    })
    connection.on("data", (data) => {
      if (generation !== generationRef.current) return
      const dataGeneration = generation
      dataChainRef.current = dataChainRef.current
        .then(() => {
          if (dataGeneration !== generationRef.current) return
          return dataHandlerRef.current(data)
        })
        .catch((dataError) => {
          if (generation !== generationRef.current) return
          const message = dataError instanceof Error ? dataError.message : "The transfer could not be read."
          setError(message)
          sendControl({ v: 1, type: "session-end" })
          leaveRoom()
        })
    })
    connection.on("close", () => {
      if (generation !== generationRef.current) return
      clearSignalingTimer()
      clearPathTimer()
      rejectWaiters("The other device disconnected.")
      sendingRef.current = false
      activeTransferRef.current = null
      setOutbound((items) => items.map((item) =>
        item.status === "sending" || item.status === "waiting"
          ? { ...item, status: "error", error: "The other device disconnected." }
          : item,
      ))
      void abandonReceiver(true)
      setIncomingOffer(null)
      setActiveReceive(null)
      setRemoteDeviceName("")
      setStatus("disconnected")
    })
    connection.on("error", (connectionError) => {
      if (generation !== generationRef.current) return
      setError(connectionError.message || "The device connection failed.")
      setStatus("error")
    })
    void connection.peerConnection.getStats().catch(() => {})
  }, [abandonReceiver, clearPathTimer, clearSignalingTimer, leaveRoom, rejectWaiters, sendControl, startPathMonitor])

  const startHost = useCallback(async (requestedCode?: string) => {
    leaveRoom()
    const generation = generationRef.current
    const code = normalizeRoomCode(requestedCode || createRoomCode())
    if (code.length !== 10) {
      setError("Enter a 10-character transfer code.")
      return
    }
    roleRef.current = "send"
    setRole("send")
    setRoomCode(code)
    setStatus("preparing")
    setError("")
    try {
      const iceResult = await getTransferIceServers({
        credentialsUrl: import.meta.env.VITE_TURN_CREDENTIALS_URL,
        urls: import.meta.env.VITE_TURN_URLS,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      })
      if (generation !== generationRef.current) return
      setIce(iceResult)
      const { default: Peer } = await import("peerjs")
      if (generation !== generationRef.current) return
      const peer = new Peer(getHostPeerId(code), {
        host: import.meta.env.VITE_PEER_HOST || "0.peerjs.com",
        port: Number(import.meta.env.VITE_PEER_PORT || 443),
        path: import.meta.env.VITE_PEER_PATH || "/",
        secure: import.meta.env.VITE_PEER_SECURE !== "false",
        key: import.meta.env.VITE_PEER_KEY || "peerjs",
        debug: 1,
        config: { iceServers: iceResult.servers, iceCandidatePoolSize: 2 },
      })
      peerRef.current = peer
      setStatus("hosting")
      peer.on("open", () => {
        if (generation !== generationRef.current) return
        clearSignalingTimer()
        setSignalingReady(true)
      })
      peer.on("connection", (connection) => setupConnection(connection, "receive", generation))
      peer.on("error", (peerError) => {
        if (generation !== generationRef.current) return
        const message = peerError.type === "unavailable-id"
          ? "That transfer code is already in use. Generate a new code."
          : peerError.message || "The pairing service could not be reached."
        setError(message)
        setStatus("error")
        setSignalingReady(false)
        clearSignalingTimer()
      })
      peer.on("disconnected", () => {
        if (generation === generationRef.current && !peer.destroyed) {
          setError("The pairing service disconnected. Leave the room and try again.")
          setSignalingReady(false)
        }
      })
      signalingTimerRef.current = setTimeout(() => {
        if (generation === generationRef.current && !peer.open) {
          setError("The pairing service did not respond. Check your connection and try again.")
          setStatus("error")
        }
      }, 30_000)
    } catch (startError) {
      if (generation !== generationRef.current) return
      setError(startError instanceof Error ? startError.message : "The transfer room could not be created.")
      setStatus("error")
    }
  }, [clearSignalingTimer, leaveRoom, setupConnection])

  const joinRoom = useCallback(async (rawCode: string) => {
    const code = normalizeRoomCode(rawCode)
    if (code.length !== 10) {
      setError("Enter the 10-character code shown on the other device.")
      return
    }
    leaveRoom()
    const generation = generationRef.current
    roleRef.current = "receive"
    setRole("receive")
    setRoomCode(code)
    setStatus("preparing")
    setError("")
    try {
      const iceResult = await getTransferIceServers({
        credentialsUrl: import.meta.env.VITE_TURN_CREDENTIALS_URL,
        urls: import.meta.env.VITE_TURN_URLS,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      })
      if (generation !== generationRef.current) return
      setIce(iceResult)
      const { default: Peer } = await import("peerjs")
      if (generation !== generationRef.current) return
      const peer = new Peer({
        host: import.meta.env.VITE_PEER_HOST || "0.peerjs.com",
        port: Number(import.meta.env.VITE_PEER_PORT || 443),
        path: import.meta.env.VITE_PEER_PATH || "/",
        secure: import.meta.env.VITE_PEER_SECURE !== "false",
        key: import.meta.env.VITE_PEER_KEY || "peerjs",
        debug: 1,
        config: { iceServers: iceResult.servers, iceCandidatePoolSize: 2 },
      })
      peerRef.current = peer
      setStatus("joining")
      peer.on("open", () => {
        if (generation !== generationRef.current) return
        clearSignalingTimer()
        setSignalingReady(true)
        const connection = peer.connect(getHostPeerId(code), {
          reliable: true,
          serialization: "raw",
        })
        setupConnection(connection, "send", generation)
      })
      peer.on("error", (peerError) => {
        if (generation !== generationRef.current) return
        const message = peerError.type === "peer-unavailable"
          ? "No device is hosting that code. Ask the sender to keep their room open."
          : peerError.message || "The pairing service could not be reached."
        setError(message)
        setStatus("error")
        setSignalingReady(false)
        clearSignalingTimer()
      })
      peer.on("disconnected", () => {
        if (generation === generationRef.current && !peer.destroyed) {
          setError("The pairing service disconnected. Leave the room and try again.")
          setSignalingReady(false)
        }
      })
      signalingTimerRef.current = setTimeout(() => {
        if (generation === generationRef.current && !peer.open) {
          setError("The pairing service did not respond. Check your connection and try again.")
          setStatus("error")
        }
      }, 30_000)
    } catch (joinError) {
      if (generation !== generationRef.current) return
      setError(joinError instanceof Error ? joinError.message : "The transfer room could not be joined.")
      setStatus("error")
    }
  }, [clearSignalingTimer, leaveRoom, setupConnection])

  const enqueueFiles = useCallback((files: File[]) => {
    if (roleRef.current !== "send") return "Create a transfer room before choosing files."
    const additions: OutgoingTransfer[] = []
    let rejection = ""
    for (const file of files) {
      if (queueRef.current.length + additions.length >= MAX_FILES) {
        rejection = `Choose no more than ${MAX_FILES} files at a time.`
        break
      }
      const sizeError = validateFileSize(file.size)
      if (sizeError) {
        rejection = `${file.name}: ${sizeError}`
        break
      }
      additions.push({
        transferId: createTransferId(),
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        lastModified: file.lastModified,
        file,
        status: "queued",
        sent: 0,
      })
    }
    if (!additions.length) return rejection || "Choose at least one file."
    queueRef.current.push(...additions)
    setOutbound((items) => [...items, ...additions])
    setError("")
    pumpQueueRef.current(generationRef.current)
    return rejection
  }, [])

  const removeOutgoing = useCallback((transferId: string) => {
    if (activeTransferRef.current === transferId) return "Wait for the active transfer to finish or cancel it."
    queueRef.current = queueRef.current.filter((item) => item.transferId !== transferId)
    setOutbound((items) => items.filter((item) => item.transferId !== transferId))
    return ""
  }, [])

  const cancelTransfer = useCallback((transferId?: string) => {
    const id = transferId || activeTransferRef.current || receiverRef.current?.offer.transferId
    if (!id) return
    sendControl({ v: 1, type: "transfer-cancel", transferId: id })
    if (roleRef.current === "receive" && receiverRef.current?.offer.transferId === id) {
      discardTransferRef.current = id
      setActiveReceive(null)
      void abandonReceiver(true)
    }
    if (roleRef.current === "receive" && pendingOfferRef.current?.transferId === id) {
      discardTransferRef.current = id
      pendingOfferRef.current = null
      setIncomingOffer(null)
    }
    rejectWaiters("The transfer was cancelled.")
    queueRef.current = queueRef.current.filter((item) => item.transferId !== id)
    setOutbound((items) => items.map((item) => item.transferId === id
      ? { ...item, status: "cancelled", error: undefined }
      : item,
    ))
    if (activeTransferRef.current === id) {
      activeTransferRef.current = null
      sendingRef.current = false
      queueMicrotask(() => pumpQueueRef.current(generationRef.current))
    }
  }, [abandonReceiver, rejectWaiters, sendControl])

  const prepareReceiver = useCallback(async (offer: FileOffer, generation: number): Promise<ReceiverContext> => {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate()
      if (typeof estimate.quota === "number" && estimate.quota > 0) {
        const used = typeof estimate.usage === "number" ? estimate.usage : 0
        if (used + offer.size > estimate.quota) throw new Error("There is not enough browser storage for this file.")
      }
    }
    if (!window.isSecureContext || !navigator.storage?.getDirectory) {
      if (offer.size > MEMORY_FALLBACK_LIMIT) {
        throw new Error("This browser cannot save a file this large. Open MasterfilePro over HTTPS in a current browser.")
      }
      return { offer, generation, mode: "memory", chunks: [], received: 0, lastAck: 0, abortController: new AbortController() }
    }
    const root = await navigator.storage.getDirectory()
    const storageName = `mpdrop-${createTransferId()}`
    const handle = await root.getFileHandle(storageName, { create: true })
    const writable = await handle.createWritable()
    return { offer, generation, mode: "opfs", handle, directory: root, storageName, writable, chunks: [], received: 0, lastAck: 0, abortController: new AbortController() }
  }, [])

  const respondToOffer = useCallback(async (accepted: boolean) => {
    const offer = pendingOfferRef.current
    if (!offer) return
    const generation = generationRef.current
    pendingOfferRef.current = null
    setIncomingOffer(null)
    if (!accepted) {
      sendControl({ v: 1, type: "file-response", transferId: offer.transferId, accepted: false, reason: "Declined on this device." })
      return
    }
    try {
      const receiver = await prepareReceiver(offer, generation)
      if (generation !== generationRef.current || discardTransferRef.current === offer.transferId) {
        await disposeReceiver(receiver, true)
        if (generation === generationRef.current) discardTransferRef.current = null
        return
      }
      if (receiverRef.current) {
        await disposeReceiver(receiver, true)
        return
      }
      receiverRef.current = receiver
      setActiveReceive({ offer, received: 0, status: "receiving" })
      if (!sendControl({ v: 1, type: "file-response", transferId: offer.transferId, accepted: true })) {
        await abandonReceiver(true)
        setActiveReceive(null)
      }
    } catch (receiveError) {
      if (generation !== generationRef.current) return
      const message = receiveError instanceof Error ? receiveError.message : "The file could not be saved."
      sendControl({ v: 1, type: "file-response", transferId: offer.transferId, accepted: false, reason: message.slice(0, 300) })
      setError(message)
    }
  }, [abandonReceiver, disposeReceiver, prepareReceiver, sendControl])

  const failReceiver = useCallback(async (receiver: ReceiverContext, message: string) => {
    if (receiver.generation !== generationRef.current || receiverRef.current !== receiver) {
      await disposeReceiver(receiver, true)
      return
    }
    discardTransferRef.current = receiver.offer.transferId
    sendControl({ v: 1, type: "file-error", transferId: receiver.offer.transferId, message: message.slice(0, 300) })
    setActiveReceive({ offer: receiver.offer, received: receiver.received, status: "error", error: message })
    await abandonReceiver(true)
  }, [abandonReceiver, disposeReceiver, sendControl])

  const receiveChunk = useCallback(async (data: unknown) => {
    const receiver = receiverRef.current
    if (!(data instanceof ArrayBuffer)) return
    if (!receiver) {
      if (discardTransferRef.current) return
      sendControl({ v: 1, type: "session-end" })
      return
    }
    if (receiver.generation !== generationRef.current) {
      await disposeReceiver(receiver, true)
      return
    }
    const decoded = decodeTransferChunk(data)
    if (!decoded?.valid) {
      await failReceiver(receiver, "A file chunk failed its integrity check.")
      return
    }
    if (receiver.received + decoded.data.length > receiver.offer.size) {
      await failReceiver(receiver, "The sender sent more data than the file size allows.")
      return
    }
    if (receiver.received === 0 && decoded.data.length === 0) {
      await failReceiver(receiver, "The sender sent an invalid empty chunk.")
      return
    }
    try {
      if (receiver.writable) await receiver.writable.write(decoded.data.slice().buffer)
      else receiver.chunks.push(decoded.data.slice().buffer)
      if (receiver.generation !== generationRef.current || receiverRef.current !== receiver) {
        await disposeReceiver(receiver, true)
        return
      }
      receiver.received += decoded.data.length
      if (receiver.received - (receiver.lastAck || 0) >= ACK_INTERVAL) {
        sendControl({ v: 1, type: "chunk-ack", transferId: receiver.offer.transferId, bytes: receiver.received })
        receiver.lastAck = receiver.received
      }
      setActiveReceive({ offer: receiver.offer, received: receiver.received, status: "receiving" })
    } catch (writeError) {
      await failReceiver(receiver, writeError instanceof Error ? writeError.message : "The file could not be saved.")
    }
  }, [disposeReceiver, failReceiver, sendControl])

  const finishReceiver = useCallback(async (transferId: string) => {
    const receiver = receiverRef.current
    if (!receiver || receiver.offer.transferId !== transferId) return
    if (receiver.received !== receiver.offer.size) {
      await failReceiver(receiver, `The file ended early. Expected ${formatBytes(receiver.offer.size)}.`)
      return
    }
    try {
      let file: File
      if (receiver.mode === "opfs" && receiver.handle) {
        await receiver.writable?.close()
        const saved = await receiver.handle.getFile()
        file = new File([saved], receiver.offer.name, { type: receiver.offer.mime, lastModified: receiver.offer.lastModified })
      } else {
        file = new File(receiver.chunks, receiver.offer.name, { type: receiver.offer.mime, lastModified: receiver.offer.lastModified })
      }
      if (receiver.generation !== generationRef.current || receiverRef.current !== receiver) {
        await disposeReceiver(receiver, true)
        return
      }
      receiverRef.current = null
      const receivedFile: ReceivedTransfer = {
        ...receiver.offer,
        url: URL.createObjectURL(file),
        storage: receiver.mode,
        handle: receiver.handle,
        directory: receiver.directory,
        storageName: receiver.storageName,
      }
      setReceived((items) => [...items, receivedFile])
      setActiveReceive(null)
      sendControl({ v: 1, type: "file-complete", transferId })
    } catch (finishError) {
      await failReceiver(receiver, finishError instanceof Error ? finishError.message : "The received file could not be opened.")
    }
  }, [disposeReceiver, failReceiver, sendControl])

  dataHandlerRef.current = async (data: unknown) => {
    if (data instanceof ArrayBuffer) {
      await receiveChunk(data)
      return
    }
    if (typeof data !== "string") return
    const message = parseTransferMessage(data)
    if (!message) return
    const connection = connectionRef.current
    if (!connection?.open) return
    if (message.type === "session-hello") {
      const expected = roleRef.current === "send" ? "receive" : "send"
      if (message.role !== expected) {
        sendControl({ v: 1, type: "session-end" })
        leaveRoom()
        return
      }
      setRemoteDeviceName(message.deviceName)
      setStatus("connected")
      setSignalingReady(true)
      pumpQueueRef.current(generationRef.current)
      return
    }
    if (message.type === "session-end") {
      connection.close()
      return
    }
    if (message.type === "file-offer" && roleRef.current === "receive") {
      discardTransferRef.current = null
      if (pendingOfferRef.current || receiverRef.current) {
        sendControl({ v: 1, type: "file-response", transferId: message.offer.transferId, accepted: false, reason: "Another file is already pending." })
        return
      }
      const offer = validateFileOffer(message.offer)
      if (!offer) {
        sendControl({ v: 1, type: "file-response", transferId: message.offer.transferId, accepted: false, reason: "The file details were invalid." })
        return
      }
      pendingOfferRef.current = offer
      setIncomingOffer(offer)
      return
    }
    if (message.type === "file-response" && roleRef.current === "send") {
      const item = queueRef.current.find((entry) => entry.transferId === message.transferId)
      if (!item || activeTransferRef.current !== message.transferId) return
      sendingRef.current = false
      if (!message.accepted) {
        queueRef.current = queueRef.current.filter((entry) => entry.transferId !== message.transferId)
        updateOutgoing(message.transferId, { status: "declined", error: message.reason || "Declined on this device." })
        activeTransferRef.current = null
        queueMicrotask(() => pumpQueueRef.current(generationRef.current))
      } else {
        sendingRef.current = true
        void sendFile(item, generationRef.current)
      }
      return
    }
    if (message.type === "chunk-ack") {
      const waiter = waitersRef.current.get(`${message.transferId}:ack`)
      if (waiter && message.bytes >= ACK_INTERVAL) {
        clearTimeout(waiter.timer)
        waitersRef.current.delete(`${message.transferId}:ack`)
        waiter.resolve()
      }
      return
    }
    if (message.type === "file-end" && roleRef.current === "receive") {
      if (discardTransferRef.current === message.transferId) {
        discardTransferRef.current = null
        return
      }
      await finishReceiver(message.transferId)
      return
    }
    if (message.type === "file-complete") {
      const waiter = waitersRef.current.get(`${message.transferId}:complete`)
      if (waiter) {
        clearTimeout(waiter.timer)
        waitersRef.current.delete(`${message.transferId}:complete`)
        waiter.resolve()
      }
      return
    }
    if (message.type === "file-error" && roleRef.current === "send" && activeTransferRef.current === message.transferId) {
      rejectWaiters(message.message)
      updateOutgoing(message.transferId, { status: "error", error: message.message })
      queueRef.current = queueRef.current.filter((entry) => entry.transferId !== message.transferId)
      activeTransferRef.current = null
      sendingRef.current = false
      queueMicrotask(() => pumpQueueRef.current(generationRef.current))
      return
    }
    if (message.type === "transfer-cancel" && roleRef.current === "send") {
      const transferId = message.transferId || activeTransferRef.current
      if (!transferId || activeTransferRef.current !== transferId) return
      rejectWaiters("The transfer was cancelled.")
      queueRef.current = queueRef.current.filter((entry) => entry.transferId !== transferId)
      updateOutgoing(transferId, { status: "cancelled", error: undefined })
      activeTransferRef.current = null
      sendingRef.current = false
      queueMicrotask(() => pumpQueueRef.current(generationRef.current))
      return
    }
    if (message.type === "transfer-cancel" && roleRef.current === "receive") {
      if (message.transferId && receiverRef.current?.offer.transferId === message.transferId) {
        discardTransferRef.current = message.transferId
        setActiveReceive(null)
        await abandonReceiver(true)
      }
      if (message.transferId && pendingOfferRef.current?.transferId === message.transferId) {
        discardTransferRef.current = message.transferId
        pendingOfferRef.current = null
        setIncomingOffer(null)
      }
    }
  }

  const downloadReceived = useCallback((transferId: string) => {
    const item = received.find((entry) => entry.transferId === transferId)
    if (!item) return
    const anchor = document.createElement("a")
    anchor.href = item.url
    anchor.download = item.name
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }, [received])

  const removeReceived = useCallback((transferId: string) => {
    const item = received.find((entry) => entry.transferId === transferId)
    if (!item) return
    URL.revokeObjectURL(item.url)
    if (item.directory && item.storageName) void item.directory.removeEntry(item.storageName).catch(() => {})
    setReceived((items) => items.filter((entry) => entry.transferId !== transferId))
  }, [received])

  const clearError = useCallback(() => setError(""), [])

  return {
    status,
    role,
    roomCode,
    signalingReady,
    remoteDeviceName,
    path,
    ice,
    error,
    clearError,
    outbound,
    incomingOffer,
    activeReceive,
    received,
    startHost,
    joinRoom,
    leaveRoom,
    enqueueFiles,
    removeOutgoing,
    cancelTransfer,
    respondToOffer,
    downloadReceived,
    removeReceived,
    maxFileBytes: MAX_FILE_BYTES,
  }
}
