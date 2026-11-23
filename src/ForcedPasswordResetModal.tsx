import React, { useState } from "react"
import { ShieldAlert, Key, Eye, EyeOff, CheckCircle2, AlertCircle, LogOut, Lock } from "lucide-react"
import type { UserAccount } from "./authService"
import { completeForcedPasswordReset } from "./authService"

export interface ForcedPasswordResetModalProps {
  user: UserAccount
  onPasswordResetComplete: (updatedUser: UserAccount) => void
  onSignOut: () => void
}

export default function ForcedPasswordResetModal({
  user,
  onPasswordResetComplete,
  onSignOut,
}: ForcedPasswordResetModalProps) {
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Password strength calculation
  const getStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: "Too short", color: "#6b7280" }
    let score = 0
    if (pwd.length >= 12) score++
    if (pwd.length >= 16) score++
    if (/[A-Z]/.test(pwd)) score++
    if (/[0-9]/.test(pwd)) score++
    if (/[^A-Za-z0-9]/.test(pwd)) score++

    if (score <= 1) return { score: 1, label: "Weak (min 12 chars needed)", color: "#ef4444" }
    if (score === 2) return { score: 2, label: "Fair", color: "#f59e0b" }
    if (score === 3 || score === 4) return { score: 3, label: "Strong", color: "#10b981" }
    return { score: 4, label: "Very Strong", color: "#00C9B7" }
  }

  const strength = getStrength(newPassword)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!newPassword || newPassword.length < 12) {
      setError("Your new password must be at least 12 characters long.")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("The confirmation password does not match.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await completeForcedPasswordReset(user.email, newPassword)
      onPasswordResetComplete(res.user)
    } catch (err: any) {
      setError(err?.message || "Failed to update password. Please try again.")
      setIsSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--surface, #1e1e24)",
          border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
          borderRadius: "16px",
          padding: "28px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          color: "var(--text, #f3f4f6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "rgba(245, 158, 11, 0.15)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={24} color="#f59e0b" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--text, #fff)" }}>
              Password Reset Required
            </h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--muted, #9ca3af)" }}>
              Security policy enforced by administrator
            </p>
          </div>
        </div>

        {/* User identification badge */}
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
            borderRadius: "10px",
            marginBottom: "18px",
            fontSize: "12px",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--text, #fff)" }}>{user.name}</div>
          <div style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>{user.email}</div>
        </div>

        <p
          style={{
            fontSize: "13px",
            lineHeight: 1.5,
            color: "var(--muted, #cbd5e1)",
            margin: "0 0 16px 0",
          }}
        >
          Your administrator has required that you update your password before accessing your workspace.
          Please choose a strong, unique password of at least 12 characters.
        </p>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "var(--danger-ink)",
              fontSize: "12.5px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "5px",
              }}
            >
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text, #fff)" }}>
                New Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: "11px",
                  color: "var(--muted, #9ca3af)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <input
                aria-label="New password"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 12 characters"
                required
                autoFocus
                autoComplete="new-password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  paddingRight: "36px",
                  borderRadius: "8px",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.15))",
                  background: "var(--bg, #111)",
                  color: "var(--text, #fff)",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <Key
                size={14}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted, #64748b)",
                  pointerEvents: "none",
                }}
              />
            </div>
            {/* Strength indicator */}
            {newPassword && (
              <div style={{ marginTop: "6px" }}>
                <div
                  style={{
                    height: "4px",
                    width: "100%",
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(strength.score / 4) * 100}%`,
                      background: strength.color,
                      transition: "width 0.2s, background 0.2s",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    marginTop: "3px",
                    color: strength.color,
                  }}
                >
                  <span>{strength.label}</span>
                  <span>{newPassword.length} / 12+ chars</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text, #fff)",
                marginBottom: "5px",
              }}
            >
              Confirm New Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                aria-label="Confirm new password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                autoComplete="new-password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  paddingRight: "36px",
                  borderRadius: "8px",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.15))",
                  background: "var(--bg, #111)",
                  color: "var(--text, #fff)",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <Lock
                size={14}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color:
                    confirmPassword && confirmPassword === newPassword
                      ? "#10b981"
                      : "var(--muted, #64748b)",
                  pointerEvents: "none",
                }}
              />
            </div>
            {confirmPassword && confirmPassword === newPassword && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--ok-ink)",
                  marginTop: "3px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <CheckCircle2 size={12} /> Passwords match
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "8px",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={onSignOut}
              style={{
                background: "transparent",
                border: "1px solid var(--border, rgba(255, 255, 255, 0.15))",
                borderRadius: "8px",
                padding: "9px 14px",
                fontSize: "12.5px",
                color: "var(--muted, #cbd5e1)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <LogOut size={14} /> Sign Out
            </button>
            <button
              type="submit"
              disabled={isSubmitting || newPassword.length < 12 || newPassword !== confirmPassword}
              style={{
                background: "var(--accent, #00C9B7)",
                color: "#051614",
                border: "none",
                borderRadius: "8px",
                padding: "10px 18px",
                fontSize: "13px",
                fontWeight: 600,
                cursor:
                  isSubmitting || newPassword.length < 12 || newPassword !== confirmPassword
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  isSubmitting || newPassword.length < 12 || newPassword !== confirmPassword ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isSubmitting ? "Updating..." : "Update Password & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
