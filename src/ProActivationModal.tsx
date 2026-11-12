import React, { useState } from "react"
import {
  Lock,
  Sparkles,
  CreditCard,
  Send,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react"
import type { Tool } from "./config"
import type { UserAccount } from "./authService"
import {
  activateProSimulatedPayment,
  requestProApproval,
  getFormattedToolPrice,
} from "./adminService"
import {
  getActiveGateway,
  triggerLivePaystackCheckout,
} from "./paymentIntegrationService"

export interface ProActivationModalProps {
  tool: Tool
  currentUser: UserAccount | null
  onActivated?: (user: UserAccount) => void
  onNavigate?: (id: string) => void
}

export default function ProActivationModal({
  tool,
  currentUser,
  onActivated,
  onNavigate,
}: ProActivationModalProps) {
  const [loading, setLoading] = useState<"payment" | "approval" | null>(null)
  const [successMessage, setSuccessMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const isPending = currentUser?.proStatus === "pending"
  const activeGateway = getActiveGateway()
  const formattedFee =
    activeGateway?.currency === "GHS"
      ? "₵250 GHS"
      : activeGateway?.currency === "NGN"
        ? "₦25,000 NGN"
        : activeGateway?.currency === "EUR"
          ? "€19 EUR"
          : activeGateway?.currency === "GBP"
            ? "£16 GBP"
            : "$19 USD"

  const toolPriceLabel = getFormattedToolPrice(
    tool.id,
    activeGateway?.currency || "USD",
  )

  const handleSimulatedPayment = () => {
    setLoading("payment")
    setErrorMessage("")
    setTimeout(() => {
      const userId = currentUser ? currentUser.id : "usr_guest_" + Date.now()
      const updated = activateProSimulatedPayment(userId)
      setLoading(null)
      setSuccessMessage(
        `Payment verified via ${activeGateway?.name || "Paystack"} (${activeGateway?.mode?.toUpperCase() || "TEST"}). Pro subscription unlocked.`,
      )
      if (onActivated) {
        onActivated(updated)
      }
    }, 600)
  }

  const handleLivePayment = () => {
    setErrorMessage("")
    if (activeGateway?.id === "paystack" && activeGateway.publicKey) {
      setLoading("payment")
      const userEmail = currentUser?.email || "customer@fluxkit.com"
      const subunits =
        activeGateway.currency === "GHS"
          ? 25000
          : activeGateway.currency === "NGN"
            ? 2500000
            : 1900

      triggerLivePaystackCheckout({
        publicKey: activeGateway.publicKey,
        email: userEmail,
        amountInSubunits: subunits,
        currency: activeGateway.currency,
        onSuccess: (ref) => {
          const userId = currentUser
            ? currentUser.id
            : "usr_guest_" + Date.now()
          const updated = activateProSimulatedPayment(userId)
          setLoading(null)
          setSuccessMessage(
            `Live Paystack Payment Verified! (Ref: ${ref}). Pro subscription unlocked.`,
          )
          if (onActivated) {
            onActivated(updated)
          }
        },
        onClose: () => {
          setLoading(null)
        },
        onError: (err) => {
          setLoading(null)
          setErrorMessage(
            err.message ||
              "Paystack checkout was closed or encountered an error.",
          )
        },
      })
      return
    }

    handleSimulatedPayment()
  }

  const handleRequestApproval = () => {
    if (!currentUser) {
      if (onNavigate) onNavigate("sign-in")
      return
    }
    setLoading("approval")
    setTimeout(() => {
      const updated = requestProApproval(currentUser.id)
      setLoading(null)
      setSuccessMessage(
        "Your activation request has been submitted to the administrator for approval.",
      )
      if (onActivated) {
        onActivated(updated)
      }
    }, 600)
  }

  return (
    <div
      className="panel pro-paywall-panel page-enter"
      style={{ maxWidth: "680px", margin: "40px auto", padding: "36px" }}
    >
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background:
              "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(99,102,241,0.2))",
            color: "#a855f7",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 16px",
            border: "1px solid rgba(168,85,247,0.3)",
          }}
        >
          <Lock size={28} />
        </div>
        <div
          className="eyebrow"
          style={{ color: "#a855f7", letterSpacing: "1px" }}
        >
          PRO SUBSCRIPTION TOOL
        </div>
        <h1 style={{ fontSize: "28px", marginTop: "8px" }}>
          Unlock {tool.name} with Pro
        </h1>
        <p
          className="page-subtitle"
          style={{ maxWidth: "480px", margin: "10px auto 0" }}
        >
          This advanced tool has been designated as a{" "}
          <strong>Pro Feature</strong> by the administrator. Activate your
          subscription to unlock unlimited access.
        </p>
      </div>

      {successMessage ? (
        <div
          style={{
            padding: "20px",
            background: "rgba(16,185,129,0.15)",
            border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: "10px",
            textAlign: "center",
            color: "#10b981",
            marginBottom: "24px",
          }}
        >
          <CheckCircle2 size={28} style={{ margin: "0 auto 8px" }} />
          <strong>{successMessage}</strong>
          <div style={{ marginTop: "14px" }}>
            <button
              className="primary"
              onClick={() => {
                if (onNavigate) onNavigate(tool.id)
              }}
            >
              Continue to {tool.name}
            </button>
          </div>
        </div>
      ) : (
        <>
          {errorMessage && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "8px",
                color: "#ef4444",
                fontSize: "12px",
                marginBottom: "20px",
              }}
            >
              {errorMessage}
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              marginBottom: "28px",
            }}
          >
            {/* Instant Card Payment option */}
            <div
              style={{
                border: "1px solid rgba(168,85,247,0.4)",
                background: "rgba(168,85,247,0.06)",
                borderRadius: "12px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#a855f7",
                    fontWeight: 600,
                  }}
                >
                  <CreditCard size={18} /> Instant Activation
                </div>
                <div style={{ marginTop: "6px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "rgba(168,85,247,0.15)",
                      color: "#a855f7",
                      fontWeight: 600,
                    }}
                  >
                    Tool Price: {toolPriceLabel}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    margin: "12px 0 6px",
                  }}
                >
                  {formattedFee}{" "}
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 400,
                      color: "var(--muted)",
                    }}
                  >
                    activation fee
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  Processed securely via{" "}
                  <strong>{activeGateway?.name || "Paystack"}</strong> (
                  {activeGateway?.mode?.toUpperCase() || "TEST"} MODE). Unlock
                  all designated Pro tools immediately.
                </p>
              </div>
              <div>
                <button
                  className="primary"
                  style={{
                    marginTop: "16px",
                    width: "100%",
                    justifyContent: "center",
                  }}
                  disabled={loading !== null}
                  onClick={handleLivePayment}
                >
                  {loading === "payment"
                    ? "Processing checkout…"
                    : `Pay ${formattedFee} with ${activeGateway?.name || "Card"}`}
                </button>
                <div style={{ textAlign: "center", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={handleSimulatedPayment}
                    disabled={loading !== null}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      fontSize: "11px",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    Or test with simulated payment
                  </button>
                </div>
              </div>
            </div>

            {/* Manual Admin Approval Option */}
            <div
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                borderRadius: "12px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "var(--text)",
                    fontWeight: 600,
                  }}
                >
                  <Send size={18} /> Request Admin Approval
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    margin: "12px 0 6px",
                  }}
                >
                  Free{" "}
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 400,
                      color: "var(--muted)",
                    }}
                  >
                    approval flow
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  Submit an activation request directly to the administrator
                  dashboard to be manually verified and activated.
                </p>
              </div>
              {isPending ? (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "10px",
                    background: "rgba(234,179,8,0.12)",
                    border: "1px solid rgba(234,179,8,0.3)",
                    borderRadius: "6px",
                    color: "#eab308",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  Pending Admin Approval
                </div>
              ) : (
                <button
                  className="secondary text-button"
                  style={{
                    marginTop: "16px",
                    width: "100%",
                    justifyContent: "center",
                    border: "1px solid var(--border)",
                    padding: "10px",
                    borderRadius: "6px",
                  }}
                  disabled={loading !== null}
                  onClick={handleRequestApproval}
                >
                  {loading === "approval"
                    ? "Submitting…"
                    : "Request Activation"}
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--border)",
              paddingTop: "20px",
            }}
          >
            <button
              className="text-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "var(--muted)",
                fontSize: "12px",
              }}
              onClick={() => {
                if (onNavigate) onNavigate("all")
              }}
            >
              <ArrowLeft size={14} /> Browse all standard tools
            </button>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              All standard tools remain 100% free with account creation.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
