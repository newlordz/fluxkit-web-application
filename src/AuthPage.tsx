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
import {
  authConnected,
  isConnected,
  requestPasswordReset,
  signIn,
  signUp,
  signOut,
  type UserAccount,
} from "./authService"
import { useNotify } from "./Notifications"
import GoogleAuth from "./GoogleAuth"

export type AuthPageMode = "sign-in" | "sign-up" | "reset-password"
type Field = "name" | "email" | "password" | "confirm"
type Values = Record<Field, string>

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
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
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
  const notify = useNotify()

  const registration = mode === "sign-up"
  const reset = mode === "reset-password"
  const title = reset
    ? "A fresh start."
    : registration
      ? "Make room for more."
      : "Back to your flow."

  const update = (field: Field, value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setFeedback("")
    setStatus("idle")
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const next: Partial<Record<Field, string>> = {}
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
      const result = await (reset
        ? requestPasswordReset(values.email.trim())
        : registration
          ? signUp({
              name: values.name.trim(),
              email: values.email.trim(),
              password: values.password,
            })
          : signIn({ email: values.email.trim(), password: values.password }))
      setStatus("success")
      const msg =
        result?.message ||
        (reset
          ? "Password reset instructions sent."
          : registration
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
          navigate("overview")
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
      navigate("overview")
    }
  }

  return (
    <div className="auth-layout page-enter">
      <aside className="auth-story">
        <a className="brand auth-brand" href="#overview">
          <span className="brand-mark">
            <Zap size={25} fill="currentColor" />
          </span>
          <span>
            {brand.name}
            <span className="brand-period">.</span>
          </span>
        </a>
        <div className="auth-story-content">
          <div className="eyebrow">
            <span className="status-dot" /> A LITTLE LESS FRICTION
          </div>
          <h1>
            One workspace.
            <br />A world of
            <br />
            <span>possibility.</span>
          </h1>
          <p>
            Your files, words, and ideas.
            <br />
            Beautifully brought together.
          </p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="auth-orbit" />
            <div className="auth-orbit inner" />
            <div className="auth-core">
              <Zap size={45} fill="currentColor" />
            </div>
            <div className="auth-float auth-doc">
              <FileText size={28} />
              <span>CREATE</span>
            </div>
            <div className="auth-float auth-qr">
              <QrCode size={30} />
            </div>
            <div className="auth-float auth-audio">
              <AudioLines size={28} />
              <span>TRANSCRIBE</span>
            </div>
            <Sparkles className="auth-spark" size={23} />
          </div>
        </div>
        <div className="auth-story-footer">
          <span>{brand.tagline}</span>
          <span>YOUR EVERYDAY, UPGRADED</span>
        </div>
      </aside>

      <section className="auth-form-side">
        <header className="auth-top">
          <a href="#overview">
            <ArrowLeft size={14} /> Back to workspace
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

          {/* Google Sign-In */}
          {!reset && (
            <div className="google-auth-section">
              <GoogleAuth
                onSuccess={handleGoogleSuccess}
                isSignUp={registration}
              />
              <div className="auth-separator">
                <span>or continue with email</span>
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

          <form noValidate onSubmit={submit}>
            <fieldset disabled={status === "loading"} className="auth-fieldset">
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
                    aria-describedby={errors.name ? "name-error" : undefined}
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
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  maxLength={254}
                  onChange={(e) => update("email", e.target.value)}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  placeholder="you@example.com"
                  required
                />
              </AuthFormField>
              {!reset && values.email.toLowerCase().includes("@gmail") && (
                <div className="auth-field-hint">
                  <span>💡 Tip:</span> Use <strong>Continue with Google</strong>{" "}
                  above to sign in with your Gmail account without entering a
                  password.
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
                    Use 12 or more characters. A unique passphrase works well.
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
                  !values.email.trim() ||
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
                      ? "Request reset link"
                      : registration
                        ? "Create account"
                        : "Sign in"}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </fieldset>
          </form>

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
              Explore the workspace <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <footer className="auth-form-footer">
          No account needed for the local QR and PDF tools.
        </footer>
      </section>

      {/* End form side */}
    </div>
  )
}

function ArrowUpRightSmall() {
  return <ArrowRight size={12} />
}
