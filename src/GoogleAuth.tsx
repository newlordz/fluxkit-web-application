import { useState } from "react"
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react"
import { getGoogleClientId, signInWithGoogle, type UserAccount } from "./authService"

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

interface GoogleAuthProps {
  onSuccess: (user: UserAccount) => void
  isSignUp?: boolean
}

export default function GoogleAuth({ onSuccess, isSignUp = false }: GoogleAuthProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const launchOAuth = () => {
    const clientId = getGoogleClientId()
    if (!clientId || typeof window === "undefined" || !window.google?.accounts?.oauth2) {
      setStatus("error")
      setErrorMessage("Google sign-in is not configured yet. Please use email sign-in.")
      return
    }

    setStatus("loading")
    setErrorMessage("")
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error || !tokenResponse.access_token) {
            setStatus("error")
            setErrorMessage(tokenResponse.error_description || "Google sign-in was cancelled.")
            return
          }
          try {
            const user = await signInWithGoogle(tokenResponse.access_token)
            setStatus("success")
            setTimeout(() => onSuccess(user), 300)
          } catch (error: any) {
            setStatus("error")
            setErrorMessage(error?.message || "Google sign-in could not be verified.")
          }
        },
        error_callback: (error: any) => {
          setStatus("error")
          setErrorMessage(error?.message || "Google sign-in was cancelled.")
        },
      })
      tokenClient.requestAccessToken({ prompt: "consent" })
    } catch (error: any) {
      setStatus("error")
      setErrorMessage(error?.message || "Unable to open Google sign-in.")
    }
  }

  return (
    <div className="google-auth-wrapper">
      <button
        type="button"
        className="google-direct-btn"
        onClick={launchOAuth}
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
          <AlertCircle size={16} />
          {errorMessage}
        </div>
      )}

      {status === "success" && (
        <div className="google-success-alert" role="status">
          <CheckCircle2 size={16} />
          <span>Google sign-in successful. Opening your workspace…</span>
        </div>
      )}
    </div>
  )
}
