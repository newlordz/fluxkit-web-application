import { useState, type FormEvent, type ReactNode } from "react"

import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Eye,
  EyeOff,
  FileText,
  Info,
  LoaderCircle,
  LogOut,
  Moon,
  QrCode,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react"

import { brand } from "./config"

import MasterfileLogo from "./MasterfileLogo"

import {
  authConnected,
  isConnected,
  requestPasswordReset,
  completePasswordReset,
  signIn,
  signUp,
  signOut,
  type UserAccount,
} from "./authService"

import { useNotify } from "./Notifications"

import GoogleAuth from "./GoogleAuth"

export type AuthPageMode = "sign-in" | "sign-up" | "reset-password"

type Field = "name" | "email" | "password" | "confirm" | "code"

type Values = Record<Exclude<Field, "code">, string>

function AuthFormField({
  name,

  label,

  error,

  children,
}: {
  name: string

  label: string

  error?: string

  children: ReactNode
}) {
  return (
    <div className="auth-field">
      <label htmlFor={name}>{label}</label>
      {children}
      {error && (
        <p id={`${name}-error`} className="auth-field-error">
          {error}
        </p>
      )}
    </div>
  )
}

function PasswordInput({
  id,

  value,

  onChange,

  error,

  newPassword,
}: {
  id: string

  value: string

  onChange: (value: string) => void

  error?: string

  newPassword: boolean
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="auth-password">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={newPassword ? "new-password" : "current-password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : newPassword ? "password-guide" : undefined
        }
        required
        maxLength={256}
      />
      <button
        type="button"
        aria-label={`${visible ? "Hide" : "Show"} ${
          id === "confirm" ? "confirmation password" : "password"
        }`}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  )
}

export default function AuthPage({
  mode,

  theme,

  toggleTheme,

  navigate,

  currentUser,

  onAuthSuccess,
}: {
  mode: AuthPageMode

  theme: string

  toggleTheme: () => void

  navigate: (id: string) => void

  currentUser?: UserAccount | null

  onAuthSuccess?: (user: UserAccount) => void
}) {
  const [values, setValues] = useState<Values>({
    name: "",

    email: "",

    password: "",

    confirm: "",
  })

  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})

  const [feedback, setFeedback] = useState("")

  const [status, setStatus] =
    useState<"idle" | "loading" | "success" | "failed">("idle")

  // Password reset step & state
  const [resetStep, setResetStep] = useState<1 | 2>(1)
  const [resetCode, setResetCode] = useState("")
  const [newResetPassword, setNewResetPassword] = useState("")
  const [confirmResetPassword, setConfirmResetPassword] = useState("")
  const [resetCodeHint, setResetCodeHint] = useState<string | null>(null)
  const [resetCompleted, setResetCompleted] = useState(false)

  const notify = useNotify()

  const registration = mode === "sign-up"

  const postAuthRedirect =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("masterfilepro-post-auth-redirect")
      : null

  const reset = mode === "reset-password"

  const title = reset
    ? resetCompleted
      ? "Password updated."
      : resetStep === 2
        ? "Set a new password."
        : "A fresh start."
    : registration
      ? "Make room for more."
      : "Back to your flow."

  const update = (field: Exclude<Field, "code">, value: string) => {
    setValues((v) => ({ ...v, [field]: value }))

    setErrors((e) => ({ ...e, [field]: undefined }))

    setFeedback("")

    setStatus("idle")
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    const next: Partial<Record<Field, string>> = {}

    // Special handling for Step 2 of password reset
    if (reset && resetStep === 2) {
      if (!resetCode.trim() || resetCode.trim().length !== 6) {
        next.code = "Please enter the 6-digit verification code."
      }

      if (!newResetPassword) {
        next.password = "Enter your new password."
      } else if (newResetPassword.length < 12) {
        next.password = "Use at least 12 characters for your password."
      }

      if (confirmResetPassword !== newResetPassword) {
        next.confirm = "Your passwords don’t match."
      }

      setErrors(next)

      if (Object.keys(next).length) {
        return
      }

      setStatus("loading")
      setFeedback("")

      try {
        const res = await completePasswordReset(
          values.email.trim(),
          resetCode.trim(),
          newResetPassword,
        )
        setStatus("success")
        setResetCompleted(true)
        const msg =
          res.message ||
          "Your password has been successfully reset. You can now sign in."
        setFeedback(msg)
        notify(msg, "success")
      } catch (error) {
        setStatus("failed")
        setFeedback(
          error instanceof Error
            ? error.message
            : "Failed to reset password. Please try again.",
        )
      }
      return
    }

    // Reset Step 1: Request code
    if (reset && resetStep === 1) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        next.email = "Enter a valid email address."
      }

      setErrors(next)

      if (Object.keys(next).length) {
        document.getElementById("email")?.focus()
        return
      }

      setStatus("loading")
      setFeedback("")

      try {
        const result = await requestPasswordReset(values.email.trim())
        setStatus("idle")
        if (result?.code) {
          setResetCodeHint(result.code)
          setResetCode(result.code)
        }
        setResetStep(2)
        const msg = result?.code
          ? `Reset code generated: ${result.code}`
          : result?.message || "Password reset code sent."
        notify(msg, "info")
      } catch (error) {
        setStatus("failed")
        setFeedback(
          error instanceof Error
            ? error.message
            : "Unable to process password reset. Please try again.",
        )
      }
      return
    }

    if (registration && !values.name.trim()) next.name = "Enter your name."

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      next.email = "Enter a valid email address."

    if (!reset && !values.password) next.password = "Enter your password."

    if (registration && values.password.length < 12)
      next.password = "Use at least 12 characters for your password."

    if (registration && values.confirm !== values.password)
      next.confirm = "Your passwords don’t match."

    setErrors(next)

    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0])?.focus()

      return
    }

    setStatus("loading")

    setFeedback("")

    try {
      const result = await (registration
        ? signUp({
            name: values.name.trim(),

            email: values.email.trim(),

            password: values.password,
          })
        : signIn({ email: values.email.trim(), password: values.password }))

      setStatus("success")

      const msg =
        result?.message ||
        (registration
          ? "Account created successfully."
          : "Successfully signed in.")

      setFeedback(msg)

      setValues((v) => ({ ...v, password: "", confirm: "" }))

      notify(msg, "success")

      if (!reset && result) {
        if (onAuthSuccess) {
          onAuthSuccess(result as UserAccount)
        }

        if ((result as UserAccount).role === "admin") {
          navigate("admin")
        } else {
          const redirect =
            typeof sessionStorage !== "undefined"
              ? sessionStorage.getItem("masterfilepro-post-auth-redirect")
              : null
          if (redirect) {
            sessionStorage.removeItem("masterfilepro-post-auth-redirect")
            navigate(redirect)
          } else {
            navigate("overview")
          }
        }
      }
    } catch (error) {
      setStatus("failed")

      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again.",
      )
    }
  }

  const handleGoogleSuccess = (user: UserAccount) => {
    if (onAuthSuccess) {
      onAuthSuccess(user)
    }

    notify(
      `Welcome, ${user.name}! Your account has been created with Google.`,

      "success",
    )

    if (user.role === "admin") {
      navigate("admin")
    } else {
      const redirect =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("masterfilepro-post-auth-redirect")
          : null
      if (redirect) {
        sessionStorage.removeItem("masterfilepro-post-auth-redirect")
        navigate(redirect)
      } else {
        navigate("overview")
      }
    }
  }

  return (
    <div className="auth-layout page-enter">
      <aside className="auth-story">
        <a
          className="brand auth-brand"
          href="#overview"
          style={{ textDecoration: "none" }}
        >
          <MasterfileLogo
            variant="full"
            size="xl"
            height={48}
            theme={theme === "light" ? "light" : "dark"}
          />
        </a>
        <div className="auth-story-content">
          <div className="eyebrow">
            <span className="status-dot" /> A LITTLE LESS FRICTION
          </div>
          <h1>
            One workspace. A world of <span>possibility.</span>
          </h1>
          <p>Your files, words, and ideas. Beautifully brought together.</p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="auth-illo-inner">
              <div className="auth-orbit" />
              <div className="auth-orbit inner" />
              <div className="auth-core">
                <Zap size={50} fill="currentColor" />
              </div>
              <div className="auth-float auth-doc">
                <FileText size={32} />
                <span>CREATE</span>
              </div>
              <div className="auth-float auth-qr">
                <QrCode size={34} />
              </div>
              <div className="auth-float auth-audio">
                <AudioLines size={32} />
                <span>TRANSCRIBE</span>
              </div>
              <Sparkles className="auth-spark" size={26} />
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>{brand.tagline}</span>
          <span>YOUR EVERYDAY, UPGRADED</span>
        </div>
      </aside>

      <main className="auth-form-side">
        <header className="auth-top">
          <a href="#overview">
            <ArrowLeft size={16} /> Back to workspace
          </a>
          <button
            className="icon-button"
            aria-label="Toggle color theme"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <div className="auth-form-container">
          <span className="auth-form-kicker">
            {reset
              ? "RESET YOUR PASSWORD"
              : registration
                ? "YOUR NEXT CHAPTER"
                : "WELCOME BACK"}
          </span>
          <h2>{title}</h2>
          <p className="auth-intro">
            {reset
              ? "Enter your email to request a password reset."
              : registration
                ? "A simpler everyday starts with a little space."
                : `Sign in to your ${brand.name} account to pick up where you left off.`}
          </p>

          {postAuthRedirect && !currentUser && (
            <div
              style={{
                margin: "0 0 20px 0",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "12px",
                color: "var(--text, #1e293b)",
              }}
            >
              <Sparkles size={16} color="#3b82f6" style={{ flexShrink: 0 }} />
              <span>
                <strong>Account required for Pro:</strong> Once you{" "}
                {registration ? "create your account" : "sign in"}, you will be
                returned straight back to your chosen tool so your access is saved.
              </span>
            </div>
          )}

          {/* If already signed in, show status */}
          {currentUser && (
            <div className="auth-already-signed-in">
              <div className="already-signed-in-header">
                <span className="avatar">
                  {currentUser.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>Signed in as {currentUser.name}</strong>
                  <p>{currentUser.email}</p>
                </div>
              </div>
              <div className="already-signed-in-actions">
                <button
                  type="button"
                  className="primary small"
                  onClick={() => navigate("overview")}
                >
                  Go to workspace <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    signOut()

                    notify("Signed out of Google account.")
                  }}
                >
                  Sign out / switch account <LogOut size={12} />
                </button>
              </div>
            </div>
          )}

          {!(authConnected || isConnected()) && (
            <div className="auth-integration-note">
              <Info size={16} />
              <div>
                <strong>Authentication not connected</strong>
                <p>
                  Explore the form, or use the workspace without an account. No
                  credentials are sent or saved.
                </p>
              </div>
            </div>
          )}

          {reset && resetCompleted ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div
                className="auth-success"
                role="status"
                style={{ marginBottom: "18px" }}
              >
                <strong>Password successfully reset!</strong>
                <p style={{ margin: "6px 0 0", fontSize: "13px" }}>
                  You can now sign in with your newly updated password.
                </p>
              </div>
              <a
                href="#sign-in"
                className="primary auth-submit"
                style={{
                  textDecoration: "none",
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                }}
              >
                Sign in to your account <ArrowRight size={18} />
              </a>
            </div>
          ) : (
            <form noValidate onSubmit={submit}>
              <fieldset
                disabled={status === "loading"}
                className="auth-fieldset"
              >
                {reset && resetStep === 2 ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "14px",
                        fontSize: "12px",
                        background: "var(--surface)",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span>
                        Resetting for: <strong>{values.email}</strong>
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        style={{
                          fontSize: "11px",
                          color: "var(--accent-text)",
                          cursor: "pointer",
                          border: "none",
                          background: "none",
                          padding: 0,
                        }}
                        onClick={() => {
                          setResetStep(1)
                          setFeedback("")
                        }}
                      >
                        Change email
                      </button>
                    </div>

                    {resetCodeHint && (
                      <div
                        className="auth-field-hint"
                        style={{
                          background: "rgba(var(--accent-rgb), 0.12)",
                          border: "1px solid rgba(var(--accent-rgb), 0.35)",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          marginBottom: "14px",
                        }}
                      >
                        <span>🔑 Reset Code:</span>{" "}
                        <strong
                          style={{ fontSize: "14px", letterSpacing: "1px" }}
                        >
                          {resetCodeHint}
                        </strong>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--muted)",
                            marginTop: "2px",
                          }}
                        >
                          Enter this 6-digit verification code below to set your
                          new password.
                        </div>
                      </div>
                    )}

                    <AuthFormField
                      name="reset-code"
                      label="6-digit reset code"
                      error={errors.code}
                    >
                      <input
                        id="reset-code"
                        value={resetCode}
                        maxLength={6}
                        onChange={(e) => {
                          setResetCode(
                            e.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                          setErrors((err) => ({ ...err, code: undefined }))
                        }}
                        placeholder="123456"
                        style={{
                          letterSpacing: "3px",
                          fontSize: "15px",
                          fontWeight: 600,
                        }}
                        required
                      />
                    </AuthFormField>

                    <AuthFormField
                      name="new-password"
                      label="New password"
                      error={errors.password}
                    >
                      <PasswordInput
                        id="new-password"
                        value={newResetPassword}
                        onChange={(v) => {
                          setNewResetPassword(v)
                          setErrors((err) => ({ ...err, password: undefined }))
                        }}
                        error={errors.password}
                        newPassword
                      />
                    </AuthFormField>
                    <p id="password-guide" className="auth-password-guide">
                      Use 12 or more characters. A unique passphrase works well.
                    </p>

                    <AuthFormField
                      name="confirm-password"
                      label="Confirm new password"
                      error={errors.confirm}
                    >
                      <PasswordInput
                        id="confirm-password"
                        value={confirmResetPassword}
                        onChange={(v) => {
                          setConfirmResetPassword(v)
                          setErrors((err) => ({ ...err, confirm: undefined }))
                        }}
                        error={errors.confirm}
                        newPassword
                      />
                    </AuthFormField>
                  </>
                ) : (
                  <>
                    {registration && (
                      <AuthFormField
                        name="name"
                        label="Your name"
                        error={errors.name}
                      >
                        <input
                          id="name"
                          autoComplete="name"
                          value={values.name}
                          maxLength={100}
                          onChange={(e) => update("name", e.target.value)}
                          aria-invalid={!!errors.name}
                          aria-describedby={
                            errors.name ? "name-error" : undefined
                          }
                          placeholder="Jamie Davis"
                          required
                        />
                      </AuthFormField>
                    )}
                    <AuthFormField
                      name="email"
                      label="Email address"
                      error={errors.email}
                    >
                      <input
                        aria-label="Email"
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={values.email}
                        maxLength={254}
                        onChange={(e) => update("email", e.target.value)}
                        aria-invalid={!!errors.email}
                        aria-describedby={
                          errors.email ? "email-error" : undefined
                        }
                        placeholder="you@example.com"
                        required
                      />
                    </AuthFormField>
                    {!reset && values.email.toLowerCase().includes("@gmail") && (
                      <div className="auth-field-hint">
                        <span>💡 Tip:</span> Use{" "}
                        <strong>Continue with Google</strong> below to sign in
                        with your Gmail account without entering a password.
                      </div>
                    )}
                    {!reset && (
                      <AuthFormField
                        name="password"
                        label="Password"
                        error={errors.password}
                      >
                        <PasswordInput
                          id="password"
                          value={values.password}
                          onChange={(v) => update("password", v)}
                          error={errors.password}
                          newPassword={registration}
                        />
                      </AuthFormField>
                    )}
                    {registration && (
                      <>
                        <p id="password-guide" className="auth-password-guide">
                          Use 12 or more characters. A unique passphrase works
                          well.
                        </p>
                        <AuthFormField
                          name="confirm"
                          label="Confirm password"
                          error={errors.confirm}
                        >
                          <PasswordInput
                            id="confirm"
                            value={values.confirm}
                            onChange={(v) => update("confirm", v)}
                            error={errors.confirm}
                            newPassword
                          />
                        </AuthFormField>
                      </>
                    )}
                    {!reset && !registration && (
                      <div className="auth-forgot">
                        <a href="#reset-password">Forgot password?</a>
                      </div>
                    )}
                  </>
                )}

                {feedback && (
                  <div
                    className={status === "failed" ? "error" : "auth-success"}
                    role={status === "failed" ? "alert" : "status"}
                  >
                    {feedback}
                  </div>
                )}
                <button
                  className="primary auth-submit"
                  disabled={
                    status === "loading" ||
                    (reset && resetStep === 1 && !values.email.trim()) ||
                    (reset &&
                      resetStep === 2 &&
                      (!resetCode.trim() ||
                        !newResetPassword ||
                        !confirmResetPassword)) ||
                    (!reset && !values.email.trim()) ||
                    (!reset && !values.password) ||
                    (registration && (!values.name.trim() || !values.confirm))
                  }
                >
                  {status === "loading" ? (
                    <>
                      <LoaderCircle className="spin" size={17} /> Connecting…
                    </>
                  ) : (
                    <>
                      {reset
                        ? resetStep === 1
                          ? "Send reset code"
                          : "Reset password"
                        : registration
                          ? "Create account"
                          : "Sign in"}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </fieldset>
            </form>
          )}

          {/* Google Sign-In below the submit button */}
          {!reset && (
            <div className="google-auth-section">
              <div className="auth-separator">
                <span>or continue with</span>
              </div>
              <GoogleAuth
                onSuccess={handleGoogleSuccess}
                isSignUp={registration}
              />
            </div>
          )}

          <p className="auth-switch">
            {reset
              ? "Remember your password?"
              : registration
                ? "Already have an account?"
                : "New to the workspace?"}{" "}
            <a href={registration || reset ? "#sign-in" : "#sign-up"}>
              {registration || reset ? "Sign in" : "Create an account"}
              <ArrowUpRightSmall />
            </a>
          </p>
          <div className="auth-guest">
            <span>JUST HERE FOR THE TOOLS?</span>
            <button onClick={() => navigate("overview")}>
              Explore the workspace <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <footer className="auth-form-footer">
          No account needed for the local QR and PDF tools.
        </footer>
      </main>

      {/* End form side */}
    </div>
  )
}

function ArrowUpRightSmall() {
  return <ArrowRight size={14} />
}
