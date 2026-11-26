import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  File as FileIcon,
  FileUp,
  FolderInput,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  Network,
  Plus,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  Wifi,
  X,
  Zap,
} from "lucide-react"
import TransferQrScanner from "./TransferQrScanner"
import useFileTransfer, { type OutgoingTransfer } from "./useFileTransfer"
import {
  MAX_FILES,
  buildPairingUrl,
  formatBytes,
  formatRoomCode,
  normalizeRoomCode,
  type TransferRole,
} from "./fileTransfer"
import { trackToolEvent } from "./privacyTelemetry"
import "./file-transfer.css"

interface FileTransferToolProps {
  initialRoom?: string
  onBack: () => void
}

const PATH_LABELS = {
  connecting: "Finding the fastest route",
  local: "Same network · direct",
  direct: "Different network · direct",
  relay: "TURN relay · encrypted",
}

const OUTGOING_LABELS: Record<OutgoingTransfer["status"], string> = {
  queued: "Waiting for a connection",
  waiting: "Waiting for approval",
  sending: "Transferring",
  complete: "Delivered",
  declined: "Declined",
  error: "Needs attention",
  cancelled: "Cancelled",
}

function TransferProgress({ value, size, label }: { value: number; size: number; label: string }) {
  const percent = size > 0 ? Math.min(100, Math.round((value / size) * 100)) : value >= size ? 100 : 0
  return (
    <div className="transfer-progress-block">
      <div className="transfer-progress-copy"><span>{label}</span><strong>{percent}%</strong></div>
      <div className="transfer-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{formatBytes(value)} of {formatBytes(size)}</small>
    </div>
  )
}

export default function FileTransferTool({ initialRoom = "", onBack }: FileTransferToolProps) {
  const transfer = useFileTransfer()
  const joinRoom = transfer.joinRoom
  const [mode, setMode] = useState<TransferRole | null>(() => initialRoom ? "receive" : null)
  const [codeInput, setCodeInput] = useState(() => normalizeRoomCode(initialRoom))
  const [scannerOpen, setScannerOpen] = useState(false)
  const [qrImage, setQrImage] = useState("")
  const [localError, setLocalError] = useState("")
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const resultReadyRef = useRef(false)

  useEffect(() => {
    trackToolEvent("tool_opened", "transfer")
  }, [])

  useEffect(() => {
    if (!initialRoom) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void joinRoom(initialRoom)
    })
    return () => { cancelled = true }
  }, [initialRoom, joinRoom])

  useEffect(() => {
    if (!transfer.roomCode || mode !== "send") {
      setQrImage("")
      return
    }
    let cancelled = false
    void QRCode.toDataURL(buildPairingUrl(transfer.roomCode, window.location.origin), {
      width: 420,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#06204d", light: "#ffffff" },
    }).then((dataUrl) => {
      if (!cancelled) setQrImage(dataUrl)
    }).catch(() => {
      if (!cancelled) setLocalError("The pairing QR could not be created. Use the transfer code instead.")
    })
    return () => { cancelled = true }
  }, [mode, transfer.roomCode])

  useEffect(() => {
    if (resultReadyRef.current) return
    if (transfer.received.length > 0 || transfer.outbound.some((item) => item.status === "complete")) {
      resultReadyRef.current = true
      trackToolEvent("result_ready", "transfer")
    }
  }, [transfer.outbound, transfer.received.length])

  const closeScanner = useCallback(() => setScannerOpen(false), [])
  const handleScannedCode = useCallback((roomCode: string) => {
    setMode("receive")
    setCodeInput(roomCode)
    setScannerOpen(false)
    void joinRoom(roomCode)
  }, [joinRoom])

  const chooseMode = (nextMode: TransferRole) => {
    transfer.leaveRoom()
    setMode(nextMode)
    setLocalError("")
    setCopied(null)
    if (nextMode === "receive") setCodeInput("")
  }

  const leave = () => {
    transfer.leaveRoom()
    setMode(null)
    setLocalError("")
    setCopied(null)
  }

  const addFiles = (files: File[]) => {
    const rejection = transfer.enqueueFiles(files)
    setLocalError(rejection)
  }

  const copyValue = async (value: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      setLocalError("Clipboard access is unavailable. Select and copy the code manually.")
    }
  }

  const pairingUrl = useMemo(
    () => transfer.roomCode ? buildPairingUrl(transfer.roomCode, window.location.origin) : "",
    [transfer.roomCode],
  )
  const connected = transfer.status === "connected"
  const busy = transfer.status === "preparing" || transfer.status === "hosting" || transfer.status === "joining" || transfer.status === "connecting"
  const visibleError = localError || transfer.error || transfer.ice?.warning || ""

  return (
    <div className="transfer-page page-enter">
      <button type="button" className="transfer-back" onClick={onBack}><ArrowLeft size={16} /> Back</button>
      <header className="transfer-hero">
        <div className="transfer-hero-copy">
          <span className="transfer-kicker"><ArrowLeftRight size={14} /> DEVICE TO DEVICE</span>
          <h1>File Transfer</h1>
          <p>Move files between phones and computers with a pairing code or QR. No cables, no account, no file upload to MasterfilePro.</p>
          <div className="transfer-hero-badges">
            <span><LockKeyhole size={13} /> Encrypted in transit</span>
            <span><Zap size={13} /> Direct when possible</span>
            <span><Network size={13} /> TURN fallback</span>
          </div>
        </div>
        <div className="transfer-route-art" aria-hidden="true">
          <div className="transfer-endpoint"><Laptop size={27} /><span>Computer</span></div>
          <div className="transfer-route-line"><i /><ArrowLeftRight size={20} /></div>
          <div className="transfer-endpoint"><Smartphone size={27} /><span>Phone</span></div>
        </div>
      </header>

      <div className="transfer-limits" aria-label="Transfer limits">
        <div><strong>1 GB</strong><span>per file</span></div>
        <div><strong>{MAX_FILES}</strong><span>files per room</span></div>
        <div><strong>2 devices</strong><span>one secure session</span></div>
        <div><strong>Any network</strong><span>direct or relayed</span></div>
      </div>

      {!mode && transfer.status === "idle" && (
        <section className="transfer-choice-grid" aria-label="Choose transfer direction">
          <button className="transfer-choice transfer-choice-send" type="button" onClick={() => chooseMode("send")}>
            <span className="transfer-choice-icon"><FileUp size={30} /></span>
            <span className="transfer-kicker">I HAVE THE FILES</span>
            <h2>Send files</h2>
            <p>Create a room, show its QR code, and approve each file before it moves.</p>
            <span className="transfer-choice-action">Create a transfer room <ArrowRight size={17} /></span>
          </button>
          <button className="transfer-choice transfer-choice-receive" type="button" onClick={() => chooseMode("receive")}>
            <span className="transfer-choice-icon"><FolderInput size={30} /></span>
            <span className="transfer-kicker">I AM RECEIVING</span>
            <h2>Receive files</h2>
            <p>Scan the sender’s QR or type their code. You choose which files to save.</p>
            <span className="transfer-choice-action">Join with a code <ArrowRight size={17} /></span>
          </button>
        </section>
      )}

      {mode && (
        <div className="transfer-session-bar">
          <div className="transfer-session-identity">
            <span className={`transfer-session-icon ${connected ? "is-connected" : ""}`}>
              {busy ? <LoaderCircle className="transfer-spin" size={19} /> : connected ? <Check size={19} /> : mode === "send" ? <Upload size={19} /> : <ArrowDownToLine size={19} />}
            </span>
            <div>
              <strong>{mode === "send" ? "Sending room" : "Receiving room"}</strong>
              <span>{connected ? `${PATH_LABELS[transfer.path]}${transfer.remoteDeviceName ? ` · ${transfer.remoteDeviceName}` : ""}` : busy ? "Setting up a secure connection…" : transfer.status === "disconnected" ? "The other device disconnected" : "Waiting to connect"}</span>
            </div>
          </div>
          <button type="button" className="transfer-text-button" onClick={leave}><X size={15} /> Leave room</button>
        </div>
      )}

      {visibleError && mode && (
        <div className="transfer-error" role="alert">
          <span>{visibleError}</span>
          <button type="button" onClick={() => { setLocalError(""); transfer.clearError() }} aria-label="Dismiss message"><X size={16} /></button>
        </div>
      )}

      {mode === "send" && transfer.status === "idle" && (
        <section className="transfer-start-card">
          <span className="transfer-start-icon"><Wifi size={29} /></span>
          <h2>Create a private transfer room</h2>
          <p>You’ll get a fresh 10-character code and a QR code for the other device. Keep this page open during the transfer.</p>
          <button type="button" className="transfer-primary" onClick={() => void transfer.startHost()}><Plus size={18} /> Create transfer room</button>
        </section>
      )}

      {mode === "send" && transfer.roomCode && (
        <div className="transfer-workspace">
          <section className="transfer-panel transfer-pair-panel">
            <div className="transfer-panel-heading">
              <div><span className="transfer-kicker">PAIR THE OTHER DEVICE</span><h2>Scan this QR code</h2></div>
              <button type="button" className="transfer-icon-button" onClick={() => void transfer.startHost()} aria-label="Generate a new code" title="Generate a new code"><RefreshCw size={17} /></button>
            </div>
            <div className="transfer-qr-wrap">
              {qrImage ? <img src={qrImage} alt="Transfer room pairing QR code" width={230} height={230} /> : <div className="transfer-qr-loading"><LoaderCircle className="transfer-spin" size={25} /> Creating QR…</div>}
              {!transfer.signalingReady && <div className="transfer-qr-wait"><LoaderCircle className="transfer-spin" size={15} /> Room is connecting</div>}
            </div>
            <div className="transfer-code-label">OR ENTER THIS CODE</div>
            <button className="transfer-code" type="button" onClick={() => void copyValue(transfer.roomCode, "code")} aria-label="Copy transfer code">
              <strong>{formatRoomCode(transfer.roomCode)}</strong>
              {copied === "code" ? <Check size={18} /> : <Copy size={18} />}
            </button>
            <button type="button" className="transfer-secondary transfer-full" onClick={() => void copyValue(pairingUrl, "link")}>
              {copied === "link" ? <Check size={16} /> : <Copy size={16} />}{copied === "link" ? "Invite link copied" : "Copy invite link"}
            </button>
            <p className="transfer-small-note">The code changes when you create a new room. Anyone with it can request a connection; you still approve every file.</p>
          </section>

          <section className="transfer-panel transfer-file-panel">
            <div className="transfer-panel-heading">
              <div><span className="transfer-kicker">YOUR FILES</span><h2>Choose what to send</h2></div>
              <span className="transfer-count">{transfer.outbound.length}/{MAX_FILES}</span>
            </div>
            <button
              type="button"
              className="transfer-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                addFiles(Array.from(event.dataTransfer.files))
              }}
            >
              <span className="transfer-drop-icon"><FileUp size={27} /></span>
              <strong>Drop files here or browse</strong>
              <span>Up to 1 GB each · {MAX_FILES} files total</span>
            </button>
            <input
              ref={fileInputRef}
              className="transfer-hidden-input"
              type="file"
              multiple
              aria-label="Choose files to transfer"
              onChange={(event) => {
                addFiles(Array.from(event.target.files || []))
                event.target.value = ""
              }}
            />

            {transfer.outbound.length === 0 ? (
              <div className="transfer-empty-state"><FileIcon size={25} /><strong>No files selected yet</strong><p>Files wait here until the other device connects and accepts them.</p></div>
            ) : (
              <div className="transfer-file-list">
                {transfer.outbound.map((item) => (
                  <article className={`transfer-file-item is-${item.status}`} key={item.transferId}>
                    <div className="transfer-file-top">
                      <span className="transfer-file-icon"><FileIcon size={19} /></span>
                      <div className="transfer-file-name"><strong title={item.name}>{item.name}</strong><span>{formatBytes(item.size)} · {OUTGOING_LABELS[item.status]}</span></div>
                      {item.status === "sending" || item.status === "waiting" ? (
                        <button type="button" className="transfer-icon-button" onClick={() => transfer.cancelTransfer(item.transferId)} aria-label={`Cancel ${item.name}`}><X size={16} /></button>
                      ) : item.status === "complete" ? <CheckCircle2 className="transfer-complete-icon" size={20} /> : (
                        <button type="button" className="transfer-icon-button" onClick={() => transfer.removeOutgoing(item.transferId)} aria-label={`Remove ${item.name}`}><Trash2 size={16} /></button>
                      )}
                    </div>
                    {(item.status === "sending" || item.status === "waiting") && <TransferProgress value={item.sent} size={item.size} label={`Sending ${item.name}`} />}
                    {item.error && <p className="transfer-item-error">{item.error}</p>}
                  </article>
                ))}
              </div>
            )}
            {!connected && transfer.outbound.length > 0 && <p className="transfer-queue-note"><LoaderCircle className="transfer-spin" size={14} /> Files will start when the other device joins and accepts them.</p>}
          </section>
        </div>
      )}

      {mode === "receive" && transfer.status === "idle" && (
        <section className="transfer-start-card transfer-receive-start">
          <span className="transfer-start-icon"><ScanLine size={29} /></span>
          <h2>Join the sender’s room</h2>
          <p>Scan their QR code or enter the 10-character code shown on their screen.</p>
          <button type="button" className="transfer-primary" onClick={() => setScannerOpen(true)}><ScanLine size={18} /> Scan QR code</button>
          <div className="transfer-code-divider"><span>OR ENTER CODE</span></div>
          <form className="transfer-join-form" onSubmit={(event) => {
            event.preventDefault()
            void transfer.joinRoom(codeInput)
          }}>
            <label htmlFor="transfer-code-input">Transfer code</label>
            <div className="transfer-code-input-row">
              <input
                id="transfer-code-input"
                value={formatRoomCode(codeInput)}
                onChange={(event) => setCodeInput(normalizeRoomCode(event.target.value))}
                placeholder="ABCDE-FGHJK"
                autoComplete="off"
                spellCheck={false}
                maxLength={11}
              />
              <button className="transfer-primary" type="submit" disabled={codeInput.length !== 10}>Join room <ArrowRight size={17} /></button>
            </div>
          </form>
        </section>
      )}

      {mode === "receive" && transfer.status !== "idle" && (
        <div className="transfer-workspace transfer-receive-workspace">
          <section className="transfer-panel transfer-receive-main">
            {transfer.incomingOffer ? (
              <div className="transfer-incoming">
                <span className="transfer-incoming-icon"><ArrowDownToLine size={31} /></span>
                <span className="transfer-kicker">INCOMING FILE</span>
                <h2>{transfer.incomingOffer.name}</h2>
                <p className="transfer-incoming-size">{formatBytes(transfer.incomingOffer.size)} · from {transfer.remoteDeviceName || "the other device"}</p>
                <p>The sender is waiting for your approval. The file will be saved in this browser so you can download it.</p>
                <div className="transfer-incoming-actions">
                  <button type="button" className="transfer-primary" onClick={() => void transfer.respondToOffer(true)}><Check size={18} /> Accept file</button>
                  <button type="button" className="transfer-secondary" onClick={() => void transfer.respondToOffer(false)}><X size={18} /> Decline</button>
                </div>
              </div>
            ) : transfer.activeReceive ? (
              <div className="transfer-receiving">
                <span className="transfer-incoming-icon"><ArrowDownToLine size={31} /></span>
                <span className="transfer-kicker">{transfer.activeReceive.status === "error" ? "TRANSFER STOPPED" : "RECEIVING FILE"}</span>
                <h2>{transfer.activeReceive.offer.name}</h2>
                {transfer.activeReceive.status === "error" ? <p className="transfer-item-error">{transfer.activeReceive.error}</p> : (
                  <>
                    <TransferProgress value={transfer.activeReceive.received} size={transfer.activeReceive.offer.size} label={`Receiving ${transfer.activeReceive.offer.name}`} />
                    <p className="transfer-small-note">Keep this page open. Large files are written to browser storage in small chunks.</p>
                    <button type="button" className="transfer-secondary" onClick={() => transfer.cancelTransfer(transfer.activeReceive?.offer.transferId)}><X size={16} /> Cancel transfer</button>
                  </>
                )}
              </div>
            ) : (
              <div className="transfer-waiting">
                <div className="transfer-waiting-orbit"><Smartphone size={30} /><span /><Laptop size={30} /></div>
                <span className="transfer-kicker">CONNECTED SECURELY</span>
                <h2>{transfer.status === "disconnected" ? "The sender disconnected" : transfer.status === "error" ? "The room needs attention" : "Waiting for a file"}</h2>
                <p>{transfer.status === "connected" ? "The sender chooses a file, then you approve it here. Nothing arrives without your say-so." : "Leave this room and ask the sender for a fresh code if you need to reconnect."}</p>
                {connected && <span className="transfer-connected-pill"><ShieldCheck size={15} /> {PATH_LABELS[transfer.path]}</span>}
              </div>
            )}
          </section>

          <section className="transfer-panel transfer-received-panel">
            <div className="transfer-panel-heading"><div><span className="transfer-kicker">READY TO KEEP</span><h2>Received files</h2></div><span className="transfer-count">{transfer.received.length}</span></div>
            {transfer.received.length === 0 ? (
              <div className="transfer-empty-state"><ArrowDownToLine size={25} /><strong>Nothing received yet</strong><p>Accepted files appear here with a download button.</p></div>
            ) : (
              <div className="transfer-file-list">
                {transfer.received.map((item) => (
                  <article className="transfer-file-item is-complete" key={item.transferId}>
                    <div className="transfer-file-top">
                      <span className="transfer-file-icon"><FileIcon size={19} /></span>
                      <div className="transfer-file-name"><strong title={item.name}>{item.name}</strong><span>{formatBytes(item.size)} · {item.storage === "opfs" ? "Saved in browser storage" : "Held in this tab"}</span></div>
                      <button type="button" className="transfer-icon-button" onClick={() => transfer.removeReceived(item.transferId)} aria-label={`Remove ${item.name}`}><Trash2 size={16} /></button>
                    </div>
                    <button type="button" className="transfer-download-button" onClick={() => {
                      transfer.downloadReceived(item.transferId)
                      trackToolEvent("download_started", "transfer")
                    }}><ArrowDownToLine size={16} /> Download file</button>
                  </article>
                ))}
              </div>
            )}
            {transfer.received.length > 0 && <p className="transfer-small-note">Download files before leaving. Removing a received file also clears its browser copy.</p>}
          </section>
        </div>
      )}

      <section className="transfer-privacy">
        <div className="transfer-privacy-title"><ShieldCheck size={22} /><div><h2>Your files stay between your devices</h2><p>WebRTC encrypts the connection. MasterfilePro does not receive or store the transferred file contents.</p></div></div>
        <details>
          <summary>How pairing and TURN relay work</summary>
          <p>A keyless pairing service carries the room code and connection setup. STUN helps devices find a direct route; TURN is used only when a direct route is blocked. A relay carries encrypted packets and cannot read the files.</p>
          {transfer.ice?.relayMode === "community" && <p><strong>Community relay:</strong> this room uses Metered Open Relay as a no-configuration fallback. It is shared and has no availability guarantee. Direct same-network transfers do not use it.</p>}
          {!window.isSecureContext && <p><strong>HTTPS recommended:</strong> camera scanning and large-file browser storage are restricted outside a secure context.</p>}
        </details>
      </section>

      {scannerOpen && <TransferQrScanner onClose={closeScanner} onDetected={handleScannedCode} />}
    </div>
  )
}
