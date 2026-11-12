import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  ExternalLink,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react"
import {
  signInWithGoogle,
  getGoogleClientId,
  setGoogleClientId,
  type UserAccount,
} from "./authService"

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.94 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  )
}

function decodeJwt(token: string) {
  try {
    const base64Url = token.split(".")[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

interface GoogleAuthProps {
  onSuccess: (user: UserAccount) => void
  isSignUp?: boolean
}

export default function GoogleAuth({
  onSuccess,
  isSignUp = false,
}: GoogleAuthProps) {
  const [clientId, setClientId] = useState(() => getGoogleClientId())
  const [inputVal, setInputVal] = useState(() => getGoogleClientId())
  const [showSetup, setShowSetup] = useState(false)
  const [status, setStatus] =
    useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [showLocalDevModal, setShowLocalDevModal] = useState(false)
  const [demoEmail, setDemoEmail] = useState("")

  const googleBtnContainerRef = useRef<HTMLDivElement>(null)

  // Initialize official Google Identity Services button when clientId is set
  useEffect(() => {
    if (!clientId || typeof window === "undefined") return

    let isMounted = true

    const tryInitGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnContainerRef.current) {
        setTimeout(tryInitGoogle, 300)
        return
      }

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            if (!isMounted) return
            setStatus("loading")
            try {
              const payload = decodeJwt(response.credential)
              if (payload?.email) {
                const user = await signInWithGoogle({
                  email: payload.email,
                  name: payload.name,
                  avatar: payload.picture,
                })
                setStatus("success")
                setTimeout(() => onSuccess(user), 300)
              } else {
                throw new Error("Unable to read email from Google credential.")
              }
            } catch (err) {
              setStatus("error")
              setErrorMessage(
                err instanceof Error ? err.message : "Google sign-in failed.",
              )
            }
          },
        })

        googleBtnContainerRef.current.replaceChildren()
        window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: isSignUp ? "signup_with" : "continue_with",
          width: 360,
        })
      } catch (err) {
        console.error("Google button render error:", err)
      }
    }

    tryInitGoogle()

    return () => {
      isMounted = false
    }
  }, [clientId, isSignUp, onSuccess])

  const handleSaveClientId = (e: FormEvent) => {
    e.preventDefault()
    const clean = inputVal.trim()
    setGoogleClientId(clean)
    setClientId(clean)
    setShowSetup(false)
    setErrorMessage("")
  }

  const handleLaunchOAuthPopup = () => {
    if (
      !clientId ||
      typeof window === "undefined" ||
      !window.google?.accounts?.oauth2
    ) {
      setShowSetup(true)
      return
    }

    setStatus("loading")
    setErrorMessage("")

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope:
          "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            setStatus("idle")
            setErrorMessage(
              tokenResponse.error_description ||
                "Google sign-in was cancelled.",
            )
            return
          }
          try {
            const res = await fetch(
              "https://www.googleapis.com/oauth2/v3/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${tokenResponse.access_token}`,
                },
              },
            )
            const info = await res.json()
            const user = await signInWithGoogle({
              email: info.email,
              name: info.name,
              avatar: info.picture,
            })
            setStatus("success")
            setTimeout(() => onSuccess(user), 300)
          } catch (e) {
            setStatus("error")
            setErrorMessage("Failed to fetch Google profile.")
          }
        },
        error_callback: (err: any) => {
          setStatus("error")
          setErrorMessage(err?.message || "Google popup error.")
        },
      })
      tokenClient.requestAccessToken({ prompt: "consent" })
    } catch (err) {
      setStatus("error")
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to open Google popup.",
      )
    }
  }

  const handleLocalDemoSubmit = async (e: FormEvent) => {
    e.preventDefault()
    let clean = demoEmail.trim()
    if (!clean) return
    if (!clean.includes("@")) clean = `${clean}@gmail.com`
    setStatus("loading")
    try {
      const user = await signInWithGoogle({ email: clean })
      setStatus("success")
      setShowLocalDevModal(false)
      setTimeout(() => onSuccess(user), 300)
    } catch (err) {
      setStatus("error")
      setErrorMessage(
        err instanceof Error ? err.message : "Error creating demo account.",
      )
    }
  }

  return (
    <div className="google-auth-wrapper">
      {/* If Google Client ID is configured: Render official Google Button */}
      {clientId ? (
        <div className="google-official-btn-section">
          <div
            ref={googleBtnContainerRef}
            className="google-official-render-box"
          />

          <button
            type="button"
            className="google-direct-btn"
            style={{ marginTop: "10px" }}
            onClick={handleLaunchOAuthPopup}
          >
            <GoogleIcon size={18} />
            <span>Open Google accounts.google.com popup</span>
            <ExternalLink size={14} />
          </button>
        </div>
      ) : (
        /* If Client ID is NOT yet configured: Show clear setup guide (No fake Google screen!) */
        <div className="google-setup-prompt">
          <button
            type="button"
            className="google-direct-btn"
            onClick={() => setShowSetup(!showSetup)}
          >
            <GoogleIcon size={18} />
            <span>
              {isSignUp ? "Sign up with Google" : "Continue with Google"}
            </span>
            <span className="google-btn-badge">Requires Client ID</span>
          </button>

          <p className="google-setup-explanation">
            Real Google Sign-In connects directly to{" "}
            <code>accounts.google.com</code> using your Google Cloud Client ID.
          </p>

          <button
            type="button"
            className="text-button google-config-toggle"
            onClick={() => setShowSetup(!showSetup)}
          >
            <KeyRound size={13} />
            <span>
              {showSetup
                ? "Hide Google Setup"
                : "Connect your Google Cloud Client ID"}
            </span>
            {showSetup ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      )}

      {/* Expandable Setup Instructions */}
      {showSetup && (
        <div className="google-setup-card page-enter">
          <div className="google-setup-header">
            <strong>Connect Real Google Sign-In</strong>
            <p>
              To let users sign in with real Google accounts, create a free
              OAuth 2.0 Web Client ID in the{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Cloud Console <ExternalLink size={11} />
              </a>
              .
            </p>
          </div>

          <ol className="google-setup-steps">
            <li>
              Go to <strong>Google Cloud Console</strong> &rarr;{" "}
              <strong>APIs & Services</strong> &rarr;{" "}
              <strong>Credentials</strong>.
            </li>
            <li>
              Click <strong>Create Credentials</strong> &rarr;{" "}
              <strong>OAuth client ID</strong> &rarr;{" "}
              <strong>Web application</strong>.
            </li>
            <li>
              Under <strong>Authorized JavaScript origins</strong>, add this
              website's URL (e.g.{" "}
              <code>
                {typeof window !== "undefined"
                  ? window.location.origin
                  : "http://localhost:8443"}
              </code>
              ).
            </li>
            <li>Copy your Client ID and paste it below:</li>
          </ol>

          <form onSubmit={handleSaveClientId} className="google-client-id-form">
            <input
              type="text"
              placeholder="e.g. 1234567890-xyz.apps.googleusercontent.com"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              required
            />
            <div className="google-client-id-buttons">
              <button type="submit" className="primary small">
                Save & Enable Real Google Sign-In
              </button>
              {clientId && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setGoogleClientId("")
                    setClientId("")
                    setInputVal("")
                  }}
                >
                  Disconnect
                </button>
              )}
            </div>
          </form>

          {/* Explicit Local Development Option */}
          <div className="google-dev-notice">
            <AlertCircle size={14} />
            <div>
              <strong>
                Developing locally without a Google Cloud account?
              </strong>
              <p>
                You can run a local test to simulate workspace account creation
                without connecting to Google servers.
              </p>
              <button
                type="button"
                className="text-button"
                style={{ marginTop: "6px", color: "var(--accent)" }}
                onClick={() => setShowLocalDevModal(true)}
              >
                Test account creation (Local simulation only) &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Simulation Modal (Clearly labeled so nobody thinks it's from Google) */}
      {showLocalDevModal && (
        <div
          className="google-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLocalDevModal(false)
          }}
        >
          <div className="google-modal-card page-enter">
            <header className="google-modal-header">
              <strong>Local Development Simulation</strong>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowLocalDevModal(false)}
              >
                &times;
              </button>
            </header>
            <form
              onSubmit={handleLocalDemoSubmit}
              className="google-modal-body"
            >
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--muted)",
                  marginBottom: "14px",
                }}
              >
                This is a <strong>local preview test</strong> for developers. It
                does not contact Google servers. Enter any sample email to
                preview account creation:
              </p>
              <input
                type="text"
                placeholder="test.user@gmail.com"
                value={demoEmail}
                onChange={(e) => setDemoEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
                required
              />
              <button
                type="submit"
                className="primary"
                style={{ width: "100%", marginTop: "14px" }}
              >
                Create Test Account
              </button>
            </form>
          </div>
        </div>
      )}

      {status === "loading" && (
        <div className="google-status-banner">
          <LoaderCircle className="spin" size={16} />
          <span>Signing in with Google…</span>
        </div>
      )}

      {errorMessage && (
        <div className="google-error-alert" role="alert">
          {errorMessage}
        </div>
      )}

      {status === "success" && (
        <div className="google-success-alert" role="status">
          <CheckCircle2 size={16} />
          <span>Google Sign-In successful! Opening your workspace…</span>
        </div>
      )}
    </div>
  )
}
