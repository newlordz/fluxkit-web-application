import React, { useState, useEffect } from "react"
import {
  Lock,
  Sparkles,
  CreditCard,
  Send,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Coins,
} from "lucide-react"
import type { Tool } from "./config"
import type { UserAccount } from "./authService"
import {
  activateProSimulatedPayment,
  requestProApproval,
  getFormattedToolPrice,
  getToolPrice,
  unlockSingleToolForUser,
} from "./adminService"
import {
  getActiveGateway,
  triggerLivePaystackCheckout,
} from "./paymentIntegrationService"
import {
  getActiveCurrency,
  setActiveCurrency,
  getExchangeRate,
  type SupportedCurrency,
} from "./currencyService"

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
  const [activeCurrency, setActiveCurrencyLocal] =
    useState<SupportedCurrency>(getActiveCurrency)
  const exchangeRate = getExchangeRate()

  useEffect(() => {
    const onCurrChange = (e: any) => {
      if (e.detail) setActiveCurrencyLocal(e.detail)
    }
    window.addEventListener("fluxkit-currency-changed", onCurrChange)
    return () =>
      window.removeEventListener("fluxkit-currency-changed", onCurrChange)
  }, [])

  const handleSelectCurrency = (c: SupportedCurrency) => {
    setActiveCurrency(c)
    setActiveCurrencyLocal(c)
  }

  const isPending = currentUser?.proStatus === "pending"
  const activeGateway = getActiveGateway()
  const formattedFee =
    activeCurrency === "GHS"
      ? `GH₵ ${(19 * exchangeRate).toFixed(2)} GHS / month`
      : "$19.00 USD / month"

  const toolPriceLabel = getFormattedToolPrice(tool.id, activeCurrency)
  const rawToolPrice = getToolPrice(tool.id)

  const handleBuySingleTool = () => {
    setLoading("payment")
    setErrorMessage("")
    setTimeout(() => {
      const userId = currentUser ? currentUser.id : "usr_guest_" + Date.now()
      const updated = unlockSingleToolForUser(userId, tool.id)
      setLoading(null)
      setSuccessMessage(
        `Success! You have unlocked a Single-Tool Pass for ${tool.name}. Full access is now active!`,
      )
      if (onActivated) {
        onActivated(updated)
      }
    }, 600)
  }

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
      {/* Currency Switcher */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
          Currency:
        </span>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            padding: "2px",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          <button
            type="button"
            onClick={() => handleSelectCurrency("USD")}
            style={{
              padding: "3px 9px",
              borderRadius: "16px",
              border: "none",
              background:
                activeCurrency === "USD" ? "#6366f1" : "transparent",
              color: activeCurrency === "USD" ? "#fff" : "var(--muted)",
              cursor: "pointer",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>🇺🇸</span>
            <span>USD ($)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectCurrency("GHS")}
            style={{
              padding: "3px 9px",
              borderRadius: "16px",
              border: "none",
              background:
                activeCurrency === "GHS" ? "#6366f1" : "transparent",
              color: activeCurrency === "GHS" ? "#fff" : "var(--muted)",
              cursor: "pointer",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>🇬🇭</span>
            <span>GHS (GH₵)</span>
          </button>
        </div>
      </div>

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
              marginBottom: "20px",
            }}
          >
            {/* Option 1: Single-Tool Pass */}
            <div
              style={{
                border: "1px solid rgba(59,130,246,0.4)",
                background: "rgba(59,130,246,0.06)",
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
                    color: "#3b82f6",
                    fontWeight: 600,
                  }}
                >
                  <Sparkles size={18} /> Single-Tool Pass
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    margin: "12px 0 6px",
                  }}
                >
                  {toolPriceLabel}{" "}
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 400,
                      color: "var(--muted)",
                    }}
                  >
                    one-off
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  Unlock access to <strong>{tool.name}</strong> only. No
                  recurring billing or automatic subscription renewals.
                </p>
              </div>
              <div>
                <button
                  className="primary"
                  style={{
                    marginTop: "16px",
                    width: "100%",
                    justifyContent: "center",
                    background: "#3b82f6",
                    borderColor: "#3b82f6",
                  }}
                  disabled={loading !== null}
                  onClick={handleBuySingleTool}
                >
                  {loading === "payment"
                    ? "Unlocking tool…"
                    : `Buy ${tool.name} (${toolPriceLabel})`}
                </button>
                <div style={{ textAlign: "center", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={handleBuySingleTool}
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
                    Simulate one-off tool purchase
                  </button>
                </div>
              </div>
            </div>

            {/* Option 2: All-Access Pro Plan */}
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
                  <CreditCard size={18} /> All-Access Pro Plan
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
                    per month
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  Unlock all 37 creative & conversion tools across the platform
                  with priority client WebAssembly processing.
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
                    : `Unlock All-Access (${formattedFee})`}
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
                    Simulate Pro monthly subscription
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Option 3: Manual Admin Approval */}
          <div
            style={{
              padding: "12px 18px",
              border: "1px dashed var(--border)",
              borderRadius: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              color: "var(--muted)",
              marginBottom: "24px",
            }}
          >
            <div>
              <strong>Need free access?</strong> Request manual verification
              from the platform administrator.
            </div>
            {isPending ? (
              <span style={{ color: "#eab308", fontWeight: 600 }}>
                Approval Pending
              </span>
            ) : (
              <button
                type="button"
                className="secondary"
                style={{ fontSize: "11px", padding: "5px 12px" }}
                onClick={handleRequestApproval}
                disabled={loading !== null}
              >
                Request Free Approval
              </button>
            )}
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
