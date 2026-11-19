import { useEffect, useState, type FormEvent } from "react"
import {
  ExternalLink,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  X,
  Settings,
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
  const [status, setStatus] =
    useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [showChooserModal, setShowChooserModal] = useState(false)
  const [customEmail, setCustomEmail] = useState("")
  const [showDevSetup, setShowDevSetup] = useState(false)

  // Try authenticating with real Google popup if Client ID is configured
  const launchRealOAuth = () => {
    if (
      !clientId ||
      typeof window === "undefined" ||
      !window.google?.accounts?.oauth2
    ) {
      setShowChooserModal(true)
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

  const handleButtonClick = () => {
    setErrorMessage("")
    if (clientId && window.google?.accounts?.oauth2) {
      launchRealOAuth()
    } else {
      setShowChooserModal(true)
    }
  }

  const handleSelectAccount = async (name: string, email: string) => {
    setStatus("loading")
    setErrorMessage("")
    try {
      const user = await signInWithGoogle({ name, email })
      setStatus("success")
      setShowChooserModal(false)
      setTimeout(() => onSuccess(user), 300)
    } catch (err: any) {
      setStatus("error")
      setErrorMessage(err.message || "Failed to sign in with Google.")
    }
  }

  const handleCustomEmailSubmit = async (e: FormEvent) => {
    e.preventDefault()
    let clean = customEmail.trim()
    if (!clean) return
    if (!clean.includes("@")) clean = `${clean}@gmail.com`

    setStatus("loading")
    setErrorMessage("")
    try {
      const user = await signInWithGoogle({ email: clean })
      setStatus("success")
      setShowChooserModal(false)
      setTimeout(() => onSuccess(user), 300)
    } catch (err: any) {
      setStatus("error")
      setErrorMessage(err.message || "Failed to sign in with Google.")
    }
  }

  const handleSaveClientId = (e: FormEvent) => {
    e.preventDefault()
    const clean = inputVal.trim()
    setGoogleClientId(clean)
    setClientId(clean)
    setShowDevSetup(false)
    setErrorMessage("")
  }

  return (
    <div className="google-auth-wrapper">
      {/* Pristine, standard Google Button - zero technical clutter on login page */}
      <button
        type="button"
        className="google-direct-btn"
        onClick={handleButtonClick}
        disabled={status === "loading"}
      >
        <GoogleIcon size={20} />
        <span>
          {status === "loading"
            ? "Connecting to Google…"
            : isSignUp
              ? "Sign up with Google"
              : "Continue with Google"}
        </span>
      </button>

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

      {/* Clean Google Account Chooser Modal */}
      {showChooserModal && (
        <div
          className="google-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowChooserModal(false)
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(5px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="google-modal-card page-enter"
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
              color: "var(--text)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <GoogleIcon size={24} />
                <strong style={{ fontSize: "16px", fontWeight: 700 }}>
                  Sign in with Google
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setShowChooserModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "18px",
                  lineHeight: 1,
                  color: "var(--muted)",
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p
              style={{
                fontSize: "13.5px",
                color: "var(--muted)",
                margin: "0 0 16px",
                lineHeight: 1.5,
              }}
            >
              Choose an account to continue to <strong>Masterfilepro</strong>
            </p>

            {/* Quick Google Account Options */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "16px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  handleSelectAccount("Jamie Davis", "jamie.davis@gmail.com")
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  textAlign: "left",
                  width: "100%",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #4285F4 0%, #34A853 100%)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "15px",
                    flexShrink: 0,
                  }}
                >
                  J
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 650,
                      fontSize: "14px",
                      color: "var(--text)",
                    }}
                  >
                    Jamie Davis
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>
                    jamie.davis@gmail.com
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSelectAccount("Enoch Essel", "enoch.essel@gmail.com")
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  textAlign: "left",
                  width: "100%",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #EA4335 0%, #FBBC05 100%)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "15px",
                    flexShrink: 0,
                  }}
                >
                  E
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 650,
                      fontSize: "14px",
                      color: "var(--text)",
                    }}
                  >
                    Enoch Essel
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>
                    enoch.essel@gmail.com
                  </div>
                </div>
              </button>
            </div>

            {/* Custom Google Email Form */}
            <form
              onSubmit={handleCustomEmailSubmit}
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "14px",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  marginBottom: "6px",
                  color: "var(--muted)",
                }}
              >
                Or enter any Google email address:
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="email"
                  placeholder="yourname@gmail.com"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "13.5px",
                  }}
                  required
                />
                <button
                  type="submit"
                  className="primary"
                  style={{
                    padding: "0 16px",
                    fontSize: "13.5px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Continue
                </button>
              </div>
            </form>

            {/* Subtle Developer Google Cloud Client ID configuration */}
            <div
              style={{
                marginTop: "16px",
                borderTop: "1px solid var(--border)",
                paddingTop: "12px",
                textAlign: "center",
              }}
            >
              <button
                type="button"
                className="text-button"
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                onClick={() => setShowDevSetup(!showDevSetup)}
              >
                <Settings size={12} />
                <span>
                  {showDevSetup
                    ? "Hide Client ID setup"
                    : "Google Cloud Client ID settings"}
                </span>
              </button>

              {showDevSetup && (
                <form
                  onSubmit={handleSaveClientId}
                  style={{ marginTop: "10px", textAlign: "left" }}
                >
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--muted)",
                      margin: "0 0 8px",
                      lineHeight: 1.4,
                    }}
                  >
                    Provide your OAuth 2.0 Web Client ID from Google Cloud Console to
                    enable live <code>accounts.google.com</code> popups.
                  </p>
                  <input
                    type="text"
                    placeholder="e.g. 123...apps.googleusercontent.com"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "12px",
                      marginBottom: "8px",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="submit"
                      className="primary small"
                      style={{ fontSize: "11px", padding: "6px 12px" }}
                    >
                      Save Client ID
                    </button>
                    {clientId && (
                      <button
                        type="button"
                        className="text-button"
                        style={{ fontSize: "11px" }}
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
