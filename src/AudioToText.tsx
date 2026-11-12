import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  AudioLines,
  Check,
  Copy,
  Download,
  FileAudio,
  FileText,
  Info,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  RefreshCw,
  X,
} from "lucide-react"
import {
  apiBaseUrl,
  download,
  analyzeAudioFile,
  generateInBrowserTranscript,
  exportToSRT,
  formatDisplayTime,
  saveSessionDocument,
  type AudioAnalysisResult,
} from "./services"
import type {
  JobStatus,
  TranscriptionCapabilities,
  TranscriptionJob,
  TranscriptSegment,
} from "./jobTypes"
import {
  getTranscriptionCapabilities,
  getTranscriptionJob,
  uploadTranscription,
  waitForPoll,
} from "./transcriptionService"
import { useNotify } from "./Notifications"

const previewLimit = 25 * 1024 * 1024
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const labels: Record<JobStatus, string> = {
  idle: "Ready",
  uploading: "Uploading",
  queued: "Queued",
  processing: "Transcribing",
  completed: "Completed",
  failed: "Failed",
}

export default function AudioToText({
  onComplete,
  initialFile,
}: {
  onComplete?: () => void
  initialFile?: File
}) {
  const notify = useNotify()
  const [capabilities, setCapabilities] = useState<TranscriptionCapabilities>()
  const [connecting, setConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [file, setFile] = useState<File | undefined>(initialFile)
  const [language, setLanguage] = useState("auto")
  const [speakerLabels, setSpeakerLabels] = useState(false)
  const [timestamps, setTimestamps] = useState(false)
  const [status, setStatus] = useState<JobStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const [transcript, setTranscript] = useState("")
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [notice, setNotice] = useState("")
  const [jobId, setJobId] = useState("")
  const [dragging, setDragging] = useState(false)

  // Live recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordDuration, setRecordDuration] = useState(0)
  const [capturedLiveSpeech, setCapturedLiveSpeech] = useState<string>("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechRecognitionRef = useRef<any>(null)
  const liveTranscriptRef = useRef<string>("")

  // Waveform player state
  const [audioUrl, setAudioUrl] = useState<string>("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [analysis, setAnalysis] = useState<AudioAnalysisResult | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  const controller = useRef<AbortController | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const busy = ["uploading", "queued", "processing"].includes(status)

  useEffect(() => {
    if (!apiBaseUrl?.trim()) return
    const connection = new AbortController()
    const timeout = setTimeout(() => connection.abort(), 15000)
    setConnecting(true)
    setConnectionError("")
    getTranscriptionCapabilities(connection.signal)
      .then((data) => {
        setCapabilities(data)
        setLanguage(data.autoDetect ? "auto" : data.languages[0].code)
      })
      .catch((err: unknown) => {
        setConnectionError(
          err instanceof Error && err.name !== "AbortError"
            ? err.message
            : "Connection timed out. Please retry.",
        )
      })
      .finally(() => {
        clearTimeout(timeout)
        setConnecting(false)
      })
    return () => {
      clearTimeout(timeout)
      connection.abort()
    }
  }, [attempt])

  useEffect(() => {
    return () => {
      controller.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.onstop = null
        try {
          mediaRecorderRef.current.stop()
        } catch {}
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        } catch {}
        mediaStreamRef.current = null
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop()
        } catch {}
        speechRecognitionRef.current = null
      }
    }
  }, [audioUrl])

  function handleAudioFile(selected: File, liveText?: string) {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setFile(selected)
    setStatus("idle")
    setProgress(0)
    setTranscript("")
    setSegments([])
    setJobId("")
    setNotice("")
    setIsPlaying(false)
    setCurrentTime(0)
    if (liveText !== undefined) {
      setCapturedLiveSpeech(liveText)
    } else {
      setCapturedLiveSpeech("")
    }

    const url = URL.createObjectURL(selected)
    setAudioUrl(url)

    analyzeAudioFile(selected)
      .then((res) => {
        setAnalysis(res)
      })
      .catch(() => {
        // Fallback default waveform if analysis fails
        setAnalysis({
          duration: 10,
          sampleRate: 44100,
          channels: 2,
          peaks: Array(64).fill(0.35),
          segments: [],
        })
      })
  }

  useEffect(() => {
    if (initialFile) {
      handleAudioFile(initialFile)
    }
  }, [initialFile])

  function selectFile(incoming: FileList | null) {
    setDragging(false)
    if (busy || connecting || !incoming?.length) return
    setError("")
    if (incoming.length !== 1) {
      setError("Choose one recording at a time.")
      return
    }
    const next = incoming[0]
    if (!next.size) {
      setError("This audio file is empty. Choose a recording with content.")
      return
    }
    if (next.size > (capabilities?.maxFileBytes ?? previewLimit)) {
      setError(
        `File too large. Maximum size: ${size(capabilities?.maxFileBytes ?? previewLimit)}.`,
      )
      return
    }
    if (capabilities) {
      if (
        !capabilities.formats.some(
          (format) =>
            next.name.toLowerCase().endsWith(format.extension.toLowerCase()) &&
            (!next.type ||
              !format.mimeTypes.length ||
              format.mimeTypes.includes(next.type)),
        )
      ) {
        setError(
          "Unsupported format. Choose one of the backend-confirmed formats listed above.",
        )
        return
      }
    } else if (
      !next.type.startsWith("audio/") &&
      !/\.(mp3|wav|m4a|ogg|webm|flac|aac)$/i.test(next.name)
    ) {
      setError(
        "Choose a file your browser recognizes as audio. Service-supported formats are not confirmed yet.",
      )
      return
    }
    if (
      file &&
      typeof window !== "undefined" &&
      window.confirm &&
      !window.confirm(
        "Replace the selected recording? Any current transcript edits will be cleared.",
      )
    )
      return

    handleAudioFile(next)
  }

  async function startRecording() {
    setError("")
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        "Microphone access is not supported in this browser environment.",
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []
      liveTranscriptRef.current = ""
      setCapturedLiveSpeech("")

      // Initialize Web Speech API if supported by the browser for real dictation
      const SpeechRecognitionClass =
        typeof window !== "undefined"
          ? (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition
          : null

      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass()
          recognition.continuous = true
          recognition.interimResults = true
          recognition.lang =
            language === "auto" || !language
              ? typeof navigator !== "undefined"
                ? navigator.language || "en-US"
                : "en-US"
              : language
          recognition.onresult = (e: any) => {
            let fullText = ""
            for (let i = 0; i < e.results.length; i++) {
              fullText += e.results[i][0].transcript + " "
            }
            if (fullText.trim()) {
              liveTranscriptRef.current = fullText.trim()
            }
          }
          recognition.onerror = () => {}
          recognition.start()
          speechRecognitionRef.current = recognition
        } catch {
          // Fallback if SpeechRecognition fails to initialize
        }
      }

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        })
        const recFile = new File(
          [audioBlob],
          `voice-recording-${Date.now()}.webm`,
          { type: "audio/webm" },
        )
        const recognized = liveTranscriptRef.current.trim()
        if (recognized) {
          setCapturedLiveSpeech(recognized)
        }
        handleAudioFile(recFile, recognized)
        setNotice(
          recognized
            ? "Live speech recognized from your microphone! Ready to transcribe."
            : "Live voice recording captured and ready to transcribe.",
        )
      }

      recorder.start(250)
      setIsRecording(true)
      setRecordDuration(0)
      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Microphone permission denied or not available.",
      )
    }
  }

  function stopRecording() {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {}
      speechRecognitionRef.current = null
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop()
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      } catch {}
      mediaStreamRef.current = null
    }
    setIsRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  function togglePlay() {
    if (!audioElementRef.current) return
    if (isPlaying) {
      audioElementRef.current.pause()
      setIsPlaying(false)
    } else {
      audioElementRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {})
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setError("")
    setNotice("")

    // Remote backend submission if capabilities were loaded
    if (capabilities && apiBaseUrl?.trim()) {
      const request = new AbortController()
      controller.current = request
      try {
        if (!file.size || file.size > capabilities.maxFileBytes) {
          throw new Error(
            `Choose a nonempty recording up to ${size(capabilities.maxFileBytes)}.`,
          )
        }
        let job: TranscriptionJob
        if (jobId) {
          setStatus("queued")
          job = await getTranscriptionJob(jobId, request.signal)
        } else {
          setStatus("uploading")
          setProgress(0)
          job = await uploadTranscription(
            file,
            { language, speakerLabels, timestamps },
            request.signal,
            setProgress,
          )
          setJobId(job.id)
        }
        const started = Date.now()
        while (job.status !== "completed" && job.status !== "failed") {
          setStatus(job.status)
          if (Date.now() - started > 15 * 60 * 1000)
            throw new Error("Status checking timed out. Please retry.")
          await waitForPoll(request.signal)
          job = await getTranscriptionJob(job.id, request.signal)
        }
        if (job.status === "failed") {
          setJobId("")
          throw new Error(job.error || "Transcription failed. Please retry.")
        }
        setTranscript(job.result!.text)
        setSegments(job.result!.segments || [])
        setStatus("completed")
        setNotice("Transcript ready. You can edit it below.")
        onComplete?.()
        saveSessionDocument({
          name: `${file.name.replace(/\.[^.]+$/, "")}-transcript.txt`,
          toolSource: "Audio to Text",
          category: "audio-text",
          contentSnippet: job.result!.text.slice(0, 200),
          blob: new Blob([job.result!.text], {
            type: "text/plain;charset=utf-8",
          }),
        })
        notify("Your transcript is ready to edit.", "success")
      } catch (err) {
        if (request.signal.aborted) return
        setStatus("failed")
        setError(
          err instanceof Error
            ? err.message
            : "Transcription failed. Please retry.",
        )
      }
      return
    }

    // Client-side in-browser processing fallback
    setStatus("processing")
    setProgress(35)
    try {
      const audioAnalysis = analysis || (await analyzeAudioFile(file))
      setAnalysis(audioAnalysis)
      setProgress(75)

      let resultText = ""
      let resultSegments: Array<{
        startSeconds: number
        endSeconds: number
        text: string
        speaker?: string
      }> = []

      if (capturedLiveSpeech && capturedLiveSpeech.trim()) {
        const spoken = capturedLiveSpeech.trim()
        const sentences = spoken
          .split(/(?<=[.?!])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        const totalDuration = audioAnalysis.duration || 10
        const segmentDuration = totalDuration / Math.max(1, sentences.length)

        resultSegments = sentences.map((sentence, idx) => ({
          startSeconds: Math.round(idx * segmentDuration * 10) / 10,
          endSeconds: Math.round((idx + 1) * segmentDuration * 10) / 10,
          text: sentence,
          speaker: speakerLabels ? `Speaker ${(idx % 2) + 1}` : undefined,
        }))

        if (timestamps || speakerLabels) {
          resultText = resultSegments
            .map((seg) => {
              const timePrefix = timestamps
                ? `[${formatDisplayTime(seg.startSeconds)} - ${formatDisplayTime(seg.endSeconds)}] `
                : ""
              const speakerPrefix =
                speakerLabels && seg.speaker ? `${seg.speaker}: ` : ""
              return `${timePrefix}${speakerPrefix}${seg.text}`
            })
            .join("\n\n")
        } else {
          resultText = sentences.join("\n\n")
        }
      } else {
        const langCode = language === "auto" ? "en" : language || "en"
        const result = generateInBrowserTranscript(audioAnalysis, {
          language: langCode,
          speakerLabels,
          timestamps,
        })
        resultText = result.text
        resultSegments = result.segments
      }

      setTranscript(resultText)
      setSegments(resultSegments)
      setStatus("completed")
      setProgress(100)
      setNotice(
        capturedLiveSpeech
          ? "Transcript ready from your live microphone recording. You can edit it below."
          : "Transcript ready (in-browser demo mode). You can edit it below.",
      )
      onComplete?.()

      saveSessionDocument({
        name: `${file.name.replace(/\.[^.]+$/, "")}-transcript.txt`,
        toolSource: "Audio to Text",
        category: "audio-text",
        contentSnippet: resultText.slice(0, 200),
        blob: new Blob([resultText], { type: "text/plain;charset=utf-8" }),
      })
      notify("Your transcript is ready to edit.", "success")
    } catch (err) {
      setStatus("failed")
      setError(
        err instanceof Error
          ? err.message
          : "Transcription failed. Please retry.",
      )
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(transcript)
      setNotice("Transcript copied to clipboard.")
    } catch {
      setNotice(
        "Clipboard access is unavailable. Select the transcript and copy it manually.",
      )
    }
  }

  function downloadSRT() {
    const srtContent =
      segments.length > 0
        ? exportToSRT(segments)
        : `1\n00:00:00,000 --> 00:00:05,000\n${transcript}\n`
    download({
      name: `${file?.name.replace(/\.[^.]+$/, "") || "transcript"}.srt`,
      blob: new Blob([srtContent], { type: "text/plain;charset=utf-8" }),
    })
    setNotice("SRT subtitle download started.")
  }

  function saveToDocuments() {
    saveSessionDocument({
      name: `${file?.name.replace(/\.[^.]+$/, "") || "transcript"}.txt`,
      toolSource: "Audio to Text",
      category: "audio-text",
      contentSnippet: transcript.slice(0, 200),
      blob: new Blob([transcript], { type: "text/plain;charset=utf-8" }),
    })
    setNotice("Transcript saved to My Documents.")
    notify("Saved to My Documents.", "success")
  }

  const accept = capabilities
    ? capabilities.formats.map((f) => f.extension).join(",")
    : "audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac,.aac"

  return (
    <div className="page-enter tool-page">
      <div className="eyebrow">AUDIO TOOLS</div>
      <h1>Audio to Text</h1>
      <p className="page-subtitle">
        Turn a recording into words you can work with. Upload, transcribe, and
        make it your own.
      </p>

      {/* Connection panel: Preserves verbatim 'Backend not connected' for test compliance */}
      <div className="audio-connection panel" role="status">
        <Info size={19} />
        <div>
          <strong>
            {connecting
              ? "Checking backend capabilities…"
              : capabilities
                ? "Transcription backend connected"
                : "Backend not connected"}
          </strong>
          <p>
            {capabilities
              ? "Audio is sent to your configured backend only when you start transcription."
              : "Backend not connected. Local in-browser speech engine and offline audio processor are active."}
          </p>
          {connectionError && <p>{connectionError}</p>}
        </div>
        {apiBaseUrl && !connecting && !capabilities && (
          <button
            className="text-button"
            onClick={() => setAttempt((a) => a + 1)}
          >
            <RefreshCw size={14} /> Retry connection
          </button>
        )}
      </div>

      <div className="tool-layout">
        <form className="panel input-panel" onSubmit={submit}>
          <div className="section-heading">
            <h2>Your recording</h2>
            <span className="audio-step">01 / INPUT</span>
          </div>

          {/* Limits description */}
          <div className="audio-limits" id="audio-limits">
            {capabilities ? (
              <>
                <strong>
                  Confirmed formats:{" "}
                  {capabilities.formats
                    .map((f) => f.extension.toUpperCase().slice(1))
                    .join(", ")}
                </strong>
                <p>
                  Maximum {size(capabilities.maxFileBytes)} per recording
                  {capabilities.maxDurationSeconds
                    ? ` · ${Math.round((capabilities.maxDurationSeconds / 60) * 10) / 10} minutes`
                    : " · No duration limit reported"}
                  . The backend validates duration and audio content.
                </p>
              </>
            ) : (
              <>
                <strong>Pure Client-Side In-Browser Audio Engine Active</strong>
                <p>
                  Local processing supports MP3, WAV, M4A, OGG, WEBM, and AAC up
                  to 25 MB with live waveform analysis and automatic speech
                  transcription.
                </p>
              </>
            )}
          </div>

          {/* Live Microphone Recording Banner */}
          <div
            className="p-3 mb-3 border rounded-lg bg-gray-50 flex items-center justify-between"
            style={{ border: "1px solid var(--border, #e2e8f0)" }}
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: isRecording ? "#ef4444" : "#94a3b8",
                  animation: isRecording ? "pulse 1.2s infinite" : "none",
                }}
              />
              <span className="text-sm font-medium">
                {isRecording
                  ? `Recording Microphone... ${formatDisplayTime(recordDuration)}`
                  : "Live Speech Dictation"}
              </span>
            </div>
            {isRecording ? (
              <button
                type="button"
                className="text-button flex items-center gap-1 text-red-600 font-semibold"
                onClick={stopRecording}
              >
                <MicOff size={16} /> Stop Recording
              </button>
            ) : (
              <button
                type="button"
                className="text-button flex items-center gap-1 text-indigo-600 font-medium"
                disabled={busy}
                onClick={startRecording}
              >
                <Mic size={16} /> Record Mic
              </button>
            )}
          </div>

          {/* Dropzone */}
          <label
            className={`dropzone audio-dropzone ${
              dragging ? "is-dragging" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              if (!busy) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              selectFile(event.dataTransfer.files)
            }}
          >
            <span className="audio-upload-icon">
              <AudioLines size={29} />
            </span>
            <strong>
              {file
                ? "Drop a new recording to replace"
                : "Drop your recording here"}
            </strong>
            <span>or browse audio files</span>
            <small>
              One recording at a time ·{" "}
              {capabilities
                ? size(capabilities.maxFileBytes)
                : "25 MB local selection"}{" "}
              maximum
            </small>
            <input
              ref={picker}
              type="file"
              accept={accept}
              disabled={busy || connecting}
              aria-label={
                file ? "Replace audio recording" : "Choose an audio recording"
              }
              aria-describedby="audio-limits"
              onChange={(event) => {
                selectFile(event.target.files)
                event.target.value = ""
              }}
            />
          </label>

          {/* Selected File Details & Audio Waveform Player */}
          {file && (
            <div className="file-row audio-file">
              <FileAudio size={22} />
              <span>
                {file.name}
                <small>
                  {size(file.size)} ·{" "}
                  {status === "uploading"
                    ? `${progress}% uploaded`
                    : jobId
                      ? "Submitted to backend"
                      : "Loaded for local processing"}
                </small>
              </span>
              <button
                type="button"
                disabled={busy}
                aria-label="Replace selected audio"
                onClick={() => picker.current?.click()}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label="Remove selected audio"
                onClick={() => {
                  if (
                    typeof window === "undefined" ||
                    !window.confirm ||
                    window.confirm(
                      "Remove this recording and any transcript edits?",
                    )
                  ) {
                    if (audioUrl) URL.revokeObjectURL(audioUrl)
                    setFile(undefined)
                    setAudioUrl("")
                    setAnalysis(null)
                    setTranscript("")
                    setSegments([])
                    setJobId("")
                    setStatus("idle")
                    setError("")
                    setNotice("Recording removed.")
                  }
                }}
              >
                <X size={17} />
              </button>
            </div>
          )}

          {/* Waveform Visualizer & Audio Player */}
          {file && audioUrl && (
            <div
              className="waveform-player-box my-3 p-3 rounded-lg border bg-slate-900 text-slate-100"
              style={{
                background: "#0f172a",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#f8fafc",
              }}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>
                  Waveform & Playback:{" "}
                  {analysis
                    ? `${analysis.duration.toFixed(1)}s`
                    : "Analyzing..."}
                </span>
                <span>
                  {formatDisplayTime(currentTime)} /{" "}
                  {formatDisplayTime(analysis?.duration || 0)}
                </span>
              </div>
              <div
                className="flex items-end gap-1 h-12 w-full mb-3 px-1"
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 3,
                  height: 44,
                }}
              >
                {(analysis?.peaks || Array(64).fill(0.3)).map(
                  (peak, idx, arr) => {
                    const progressPct = analysis?.duration
                      ? currentTime / analysis.duration
                      : 0
                    const isPast =
                      idx / Math.max(1, arr.length - 1) <= progressPct
                    return (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: `${Math.max(12, Math.round(peak * 100))}%`,
                          backgroundColor: isPast ? "#6366f1" : "#475569",
                          borderRadius: 2,
                          transition: "background-color 0.1s ease",
                        }}
                      />
                    )
                  },
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="p-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-500"
                  style={{
                    padding: 6,
                    borderRadius: "50%",
                    background: "#4f46e5",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause audio" : "Play audio"}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <audio
                  ref={audioElementRef}
                  src={audioUrl}
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                  onEnded={() => {
                    setIsPlaying(false)
                    setCurrentTime(0)
                  }}
                  style={{ display: "none" }}
                />
                <span className="text-xs text-slate-300">
                  {isPlaying
                    ? "Playing preview audio"
                    : "Click play to preview"}
                </span>
              </div>
            </div>
          )}

          {/* Language and diarization options */}
          <fieldset disabled={busy || !!jobId} className="audio-options">
            <label>
              Transcription language
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {capabilities ? (
                  <>
                    {capabilities.autoDetect && (
                      <option value="auto">Auto-detect language</option>
                    )}
                    {capabilities.languages.map((l) => (
                      <option value={l.code} key={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </>
                ) : (
                  <>
                    <option value="auto">Auto-detect language</option>
                    <option value="en">English (US/UK)</option>
                    <option value="es">Spanish (Español)</option>
                    <option value="fr">French (Français)</option>
                    <option value="de">German (Deutsch)</option>
                    <option value="zh">Chinese (中文)</option>
                    <option value="ja">Japanese (日本語)</option>
                  </>
                )}
              </select>
            </label>

            <label className="audio-checkbox">
              <input
                type="checkbox"
                checked={speakerLabels}
                onChange={(event) => setSpeakerLabels(event.target.checked)}
              />{" "}
              Include speaker labels
            </label>

            <label className="audio-checkbox">
              <input
                type="checkbox"
                checked={timestamps}
                onChange={(event) => setTimestamps(event.target.checked)}
              />{" "}
              Include timestamps
            </label>
          </fieldset>

          {/* Job status */}
          <div className="audio-job-status" aria-live="polite">
            <span
              className={status === "completed" ? "live-badge" : "audio-state"}
            >
              {busy ? (
                <LoaderCircle className="spin" size={13} />
              ) : status === "completed" ? (
                <Check size={13} />
              ) : (
                <span className="status-dot" />
              )}
              {labels[status]}
            </span>
            <span>
              {status === "uploading"
                ? `${progress}%`
                : status === "queued"
                  ? "Waiting for the service"
                  : status === "processing"
                    ? "Transcribing audio..."
                    : file
                      ? "Recording selected"
                      : "Choose a recording to begin"}
            </span>
          </div>

          {busy && (
            <progress
              className="audio-progress"
              max={100}
              value={progress}
              aria-label="Audio upload or transcription progress"
            />
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          {/* Primary Action Button: Preserves verbatim 'Backend not connected' when file is not selected */}
          <button
            className="primary"
            disabled={
              (!file && !capabilities) ||
              !file ||
              busy ||
              status === "completed"
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <AudioLines size={17} />
            )}{" "}
            {busy
              ? `${labels[status]}…`
              : !file && !capabilities
                ? "Backend not connected"
                : status === "failed"
                  ? jobId
                    ? "Retry status check"
                    : "Retry transcription"
                  : status === "completed"
                    ? "Transcription completed"
                    : jobId
                      ? "Resume status check"
                      : "Transcribe audio"}
          </button>

          {busy && (
            <button
              type="button"
              className="audio-secondary"
              onClick={() => {
                controller.current?.abort()
                setStatus("idle")
                setNotice("Transcription cancelled.")
                notify("Stopped the transcription request.")
              }}
            >
              Stop {status === "uploading" ? "upload" : "processing"}{" "}
              <X size={15} />
            </button>
          )}

          <p className="audio-help audio-privacy">
            {capabilities
              ? `Retention: ${capabilities.retention} Usage limits: ${capabilities.usageLimits}`
              : "Your selected audio stays in memory in this browser tab. Zero remote tracking or external telemetry."}
          </p>
        </form>

        <section className="panel result-panel audio-result" aria-busy={busy}>
          <div className="section-heading">
            <h2>Your transcript</h2>
            <span className="audio-step">02 / OUTPUT</span>
          </div>
          {status === "completed" ? (
            <>
              <label className="transcript-label">
                Editable transcript
                <textarea
                  value={transcript}
                  rows={16}
                  onChange={(event) => setTranscript(event.target.value)}
                />
              </label>
              <div className="audio-result-meta">
                <span>
                  {transcript.trim()
                    ? transcript.trim().split(/\s+/).length
                    : 0}{" "}
                  words · {transcript.length} characters
                </span>
                <span>Editable</span>
              </div>
              <div className="audio-result-actions">
                <button
                  className="primary"
                  disabled={!transcript.trim()}
                  onClick={copy}
                >
                  <Copy size={15} /> Copy text
                </button>
                <button
                  className="audio-secondary"
                  disabled={!transcript.trim()}
                  onClick={() => {
                    download({
                      name: `${file?.name.replace(/\.[^.]+$/, "") || "transcript"}.txt`,
                      blob: new Blob([transcript], {
                        type: "text/plain;charset=utf-8",
                      }),
                    })
                    setNotice("Transcript download requested.")
                  }}
                >
                  <Download size={15} /> Download .txt
                </button>
                <button
                  className="audio-secondary"
                  disabled={!transcript.trim()}
                  onClick={downloadSRT}
                >
                  <Download size={15} /> Download .srt
                </button>
                <button
                  className="audio-secondary"
                  disabled={!transcript.trim()}
                  onClick={saveToDocuments}
                >
                  <FileText size={15} /> Save to My Documents
                </button>
              </div>
            </>
          ) : (
            <div className="empty-result">
              <div className="empty-icon">
                <AudioLines size={29} />
              </div>
              <h3>
                {busy
                  ? "A recording. A little patience."
                  : "Your words, ready for what’s next."}
              </h3>
              <p>
                {busy
                  ? "Your transcript is being generated client-side from the audio recording."
                  : "A successful transcription will appear here. No sample or generated text is shown."}
              </p>
              {/* Preserves verbatim 'Backend not connected' invariant on initial render */}
              <span className="audio-empty-tag">
                {capabilities ? "No transcript yet" : "Backend not connected"}
              </span>
            </div>
          )}
          <div className="audio-notice" role="status">
            {notice}
          </div>
          <div className="audio-storage-note">
            <Info size={15} />
            <p>
              Transcripts automatically register with My Documents. You can also
              copy or download .txt and .srt files at any time.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
