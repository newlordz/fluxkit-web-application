import { useEffect, useRef, useState } from "react"
import { Camera, CameraOff, ScanLine, X } from "lucide-react"
import { parsePairingUrl } from "./fileTransfer"

interface TransferQrScannerProps {
  onClose: () => void
  onDetected: (roomCode: string) => void
}

export default function TransferQrScanner({ onClose, onDetected }: TransferQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectedRef = useRef(false)
  const [error, setError] = useState("")
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    let cancelled = false
    let frame = 0
    let lastScan = 0

    const stop = () => {
      cancelled = true
      cancelAnimationFrame(frame)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    const finish = (roomCode: string) => {
      if (detectedRef.current) return
      detectedRef.current = true
      stop()
      onDetected(roomCode)
    }

    const scanFallback = async (video: HTMLVideoElement) => {
      const maxWidth = 720
      const scale = Math.min(1, maxWidth / Math.max(video.videoWidth || 1, 1))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * scale))
      canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * scale))
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      const module = await import("jsqr")
      const jsQR = (module.default || module) as any
      const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" })
      handleResult(result?.data ? String(result.data) : "")
    }

    const handleResult = (raw: string) => {
      if (!raw || cancelled || detectedRef.current) return
      const roomCode = parsePairingUrl(raw, window.location.origin)
      if (roomCode) {
        finish(roomCode)
      } else {
        setError("That QR code is not a transfer invite from this MasterfilePro site.")
      }
    }

    const loop = async (time: number, detector: any | null, video: HTMLVideoElement) => {
      if (cancelled || detectedRef.current) return
      if (time - lastScan > 220 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        lastScan = time
        try {
          if (detector) {
            const results = await detector.detect(video)
            handleResult(results?.[0]?.rawValue ? String(results[0].rawValue) : "")
          } else {
            await scanFallback(video)
          }
        } catch {
          setError("The camera could not read a code. Try better lighting or enter the code manually.")
        }
      }
      if (!cancelled && !detectedRef.current) frame = requestAnimationFrame((nextTime) => void loop(nextTime, detector, video))
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning is not available in this browser.")
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        let detector: any | null = null
        if ("BarcodeDetector" in window) {
          try {
            const Detector = (window as any).BarcodeDetector
            detector = new Detector({ formats: ["qr_code"] })
          } catch {
            detector = null
          }
        }
        setScanning(false)
        frame = requestAnimationFrame((time) => void loop(time, detector, video))
      } catch (cameraError) {
        if (cancelled) return
        setError(cameraError instanceof Error ? cameraError.message : "The camera could not be started.")
        setScanning(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    void start()
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      stop()
    }
  }, [onClose, onDetected])

  return (
    <div className="transfer-scanner-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="transfer-scanner" role="dialog" aria-modal="true" aria-labelledby="transfer-scanner-title">
        <div className="transfer-scanner-head">
          <div>
            <span className="transfer-kicker">QR PAIRING</span>
            <h2 id="transfer-scanner-title">Scan a transfer invite</h2>
          </div>
          <button className="transfer-icon-button" type="button" onClick={onClose} aria-label="Close scanner">
            <X size={20} />
          </button>
        </div>
        <div className="transfer-camera">
          <video ref={videoRef} muted playsInline aria-label="QR code camera preview" />
          {scanning && <div className="transfer-camera-message"><Camera size={24} /> Starting camera…</div>}
          {!scanning && !error && <div className="transfer-scan-frame" aria-hidden="true"><ScanLine size={34} /></div>}
          {error && <div className="transfer-camera-message transfer-camera-error"><CameraOff size={24} /> {error}</div>}
        </div>
        <p className="transfer-scanner-help">Point the camera at the QR code on the other device. You can also type the 10-character code.</p>
        <button type="button" className="transfer-secondary transfer-full" onClick={onClose}>Enter code instead</button>
      </section>
    </div>
  )
}
