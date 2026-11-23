import React, { useState, useEffect } from "react"

import {
  Lock,
  Unlock,
  Sparkles,
  CreditCard,
  Send,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Coins,
  UserPlus,
  LogIn,
  UserCheck,
} from "lucide-react"

import TactilePadlock from "./TactilePadlock"

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

  const [isUnlocked, setIsUnlocked] = useState(false)

  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  )

  const [activeCurrency, setActiveCurrencyLocal] =
    useState<SupportedCurrency>(getActiveCurrency)

  const exchangeRate = getExchangeRate()

  const isYearly = billingCycle === "yearly"

  useEffect(() => {
    if (successMessage) {
      setIsUnlocked(true)
    }
  }, [successMessage])

  useEffect(() => {
    const onCurrChange = (e: any) => {
      if (e.detail) setActiveCurrencyLocal(e.detail)
    }

    window.addEventListener("masterfilepro-currency-changed", onCurrChange)

    return () =>
      window.removeEventListener("masterfilepro-currency-changed", onCurrChange)
  }, [])

  const isPending = currentUser?.proStatus === "pending"

  const activeGateway = getActiveGateway()

  // Single-Tool subscription prices

  const rawToolPrice = getToolPrice(tool.id)

  const singleToolUsd = isYearly ? rawToolPrice * 10 : rawToolPrice

  const singleToolLabel = getFormattedToolPrice(
    tool.id,

    activeCurrency,

    isYearly ? "year" : "month",
  )

  // All-Access Pro plan prices

  const allAccessUsd = isYearly ? 190 : 19

  const formattedFee =
    activeCurrency === "GHS"
      ? `GH₵ ${(allAccessUsd * exchangeRate).toFixed(2)} GHS / ${
          isYearly ? "year" : "month"
        }`
      : `$${allAccessUsd}.00 USD / ${isYearly ? "year" : "month"}`

  const handleRequireAuth = (actionName: string) => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("masterfilepro-post-auth-redirect", tool.id)
    }
    setErrorMessage(
      `Please create an account or sign in first so your ${actionName} is permanently bound to your account.`,
    )
    if (onNavigate) {
      onNavigate("sign-up")
    }
  }

  const handleBuySingleTool = () => {
    if (!currentUser) {
      handleRequireAuth(`subscription to ${tool.name}`)
      return
    }

    setLoading("payment")

    setErrorMessage("")

    setTimeout(() => {
      const updated = unlockSingleToolForUser(
        currentUser.id,
        tool.id,
        billingCycle,
      )

      setLoading(null)

      const renewsPeriod = isYearly ? "1 year" : "1 month"

      setSuccessMessage(
        `Success! You subscribed to ${tool.name} (${billingCycle.toUpperCase()} plan). Auto-renews in ${renewsPeriod}. Access is now active on your account!`,
      )

      if (onActivated) {
        onActivated(updated)
      }
    }, 600)
  }

  const handleBuySingleToolLive = () => {
    if (!currentUser) {
      handleRequireAuth(`subscription to ${tool.name}`)
      return
    }

    setErrorMessage("")

    if (activeGateway?.id === "paystack" && activeGateway.publicKey) {
      setLoading("payment")

      const userEmail = currentUser.email || "customer@masterfilepro.com"

      const subunits =
        activeGateway.currency === "GHS"
          ? Math.round(singleToolUsd * exchangeRate * 100)
          : activeGateway.currency === "NGN"
            ? Math.round(singleToolUsd * 1500 * 100)
            : Math.round(singleToolUsd * 100)

      triggerLivePaystackCheckout({
        publicKey: activeGateway.publicKey,

        email: userEmail,

        amountInSubunits: subunits,

        currency: activeGateway.currency,

        onSuccess: (ref) => {
          const updated = unlockSingleToolForUser(
            currentUser.id,
            tool.id,
            billingCycle,
          )

          setLoading(null)

          setSuccessMessage(
            `Live Paystack Payment Verified! (Ref: ${ref}). ${tool.name} ${billingCycle.toUpperCase()} subscription active on your account!`,
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

    handleBuySingleTool()
  }

  const handleSimulatedPayment = () => {
    if (!currentUser) {
      handleRequireAuth("All-Access Pro subscription")
      return
    }

    setLoading("payment")

    setErrorMessage("")

    setTimeout(() => {
      const updated = activateProSimulatedPayment(currentUser.id)

      setLoading(null)

      setSuccessMessage(
        `Payment verified via ${activeGateway?.name || "Paystack"} (${activeGateway?.mode?.toUpperCase() || "TEST"}). Pro subscription unlocked for your account.`,
      )

      if (onActivated) {
        onActivated(updated)
      }
    }, 600)
  }

  const handleLivePayment = () => {
    if (!currentUser) {
      handleRequireAuth("All-Access Pro subscription")
      return
    }

    setErrorMessage("")

    if (activeGateway?.id === "paystack" && activeGateway.publicKey) {
      setLoading("payment")

      const userEmail = currentUser.email || "customer@masterfilepro.com"

      const subunits =
        activeGateway.currency === "GHS"
          ? Math.round(allAccessUsd * exchangeRate * 100)
          : activeGateway.currency === "NGN"
            ? Math.round(allAccessUsd * 1500 * 100)
            : Math.round(allAccessUsd * 100)

      triggerLivePaystackCheckout({
        publicKey: activeGateway.publicKey,

        email: userEmail,

        amountInSubunits: subunits,

        currency: activeGateway.currency,

        onSuccess: (ref) => {
          const updated = activateProSimulatedPayment(currentUser.id)

          setLoading(null)

          setSuccessMessage(
            `Live Paystack Payment Verified! (Ref: ${ref}). Pro subscription unlocked for your account.`,
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
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("masterfilepro-post-auth-redirect", tool.id)
      }
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
      style={{
        maxWidth: "680px",

        margin: "8px auto 20px",

        padding: "20px 24px",

        position: "relative",
      }}
    >
      {/* Sleek Horizontal Header Bar - Zero Wasted Space */}
      <div className="paywall-header-bar">
        {/* Left: 3D Tactile Lock + Title + Pill + Subtitle */}
        <div className="paywall-header-left">
          <div
            className="paywall-lock-slot"
            style={{ position: "relative", flexShrink: 0 }}
          >
            <TactilePadlock unlocked={isUnlocked} size="sm" />
            {isUnlocked && (
              <div className="paywall-unlock-sparkles">
                <Sparkles
                  size={12}
                  color="#10b981"
                  style={{ position: "absolute", top: "-5px", right: "-5px" }}
                />
              </div>
            )}
          </div>

          <div className="paywall-title-block">
            <div className="paywall-title-row">
              <h1 className="paywall-title">
                {isUnlocked
                  ? `Welcome to ${tool.name}`
                  : `Unlock ${tool.name} with Pro`}
              </h1>
              <span
                className={`tactile-pro-pill ${
                  isUnlocked ? "is-unlocked" : ""
                }`}
              >
                {isUnlocked ? "✓ UNLOCKED" : "PRO FEATURE"}
              </span>
            </div>
            <p className="paywall-subtitle">
              {isUnlocked
                ? `Subscription active. Unlimited high-speed WebAssembly access enabled.`
                : `Activate your pass for unlimited high-speed WebAssembly access.`}
            </p>
          </div>
        </div>
      </div>

      {/* Row 2: Compact Centered Billing Cycle Toggle */}
      <div className="paywall-billing-bar">
        <div className="paywall-billing-pill-track">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`paywall-billing-tab ${!isYearly ? "active" : ""}`}
          >
            Monthly Plan
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`paywall-billing-tab ${isYearly ? "active" : ""}`}
          >
            <span>Annual Plan</span>
            <span className="paywall-save-tag">SAVE 17% · 2 MOS FREE</span>
          </button>
        </div>
      </div>

      {successMessage ? (
        <div
          style={{
            padding: "20px",

            background: "rgba(16,185,129,0.15)",

            border: "1px solid rgba(16,185,129,0.3)",

            borderRadius: "10px",

            textAlign: "center",

            color: "var(--ok-ink)",

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

                color: "var(--danger-ink)",

                fontSize: "12px",

                marginBottom: "20px",
              }}
            >
              {errorMessage}
            </div>
          )}

          {!currentUser ? (
            <div
              className="auth-required-callout"
              style={{
                margin: "0 0 20px 0",
                padding: "16px 18px",
                borderRadius: "12px",
                background:
                  "linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  <UserPlus size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "14px",
                      color: "var(--text, #1e293b)",
                      marginBottom: "3px",
                    }}
                  >
                    Account Required to Subscribe
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--muted, #64748b)",
                      lineHeight: 1.5,
                    }}
                  >
                    Please create an account or sign in first. This guarantees your
                    paid Pro subscription and tool unlocks stay permanently bound
                    to your account across all your devices and browsers.
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginLeft: "48px",
                }}
              >
                <button
                  type="button"
                  className="primary"
                  style={{
                    padding: "7px 16px",
                    fontSize: "12px",
                    background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                    borderColor: "transparent",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={() => {
                    if (typeof sessionStorage !== "undefined") {
                      sessionStorage.setItem(
                        "masterfilepro-post-auth-redirect",
                        tool.id,
                      )
                    }
                    if (onNavigate) onNavigate("sign-up")
                  }}
                >
                  <UserPlus size={14} /> Create Free Account
                </button>
                <button
                  type="button"
                  className="secondary"
                  style={{
                    padding: "7px 16px",
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={() => {
                    if (typeof sessionStorage !== "undefined") {
                      sessionStorage.setItem(
                        "masterfilepro-post-auth-redirect",
                        tool.id,
                      )
                    }
                    if (onNavigate) onNavigate("sign-in")
                  }}
                >
                  <LogIn size={14} /> Sign In
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                margin: "0 0 16px 0",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "var(--text)",
                }}
              >
                <UserCheck size={16} color="#10b981" />
                <span>
                  Subscribing as{" "}
                  <strong>{currentUser.email || currentUser.name}</strong>
                </span>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--ok-ink)",
                  fontWeight: 600,
                }}
              >
                Saved permanently to your account
              </span>
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
            {/* Option 1: Single-Tool Monthly/Yearly Subscription */}
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
                  <Sparkles size={18} /> {tool.name} Pass
                </div>
                <div
                  style={{
                    fontSize: "24px",

                    fontWeight: 800,

                    margin: "12px 0 6px",
                  }}
                >
                  {singleToolLabel}{" "}
                  <span
                    style={{
                      fontSize: "13px",

                      fontWeight: 400,

                      color: "var(--muted)",
                    }}
                  >
                    {isYearly ? "per year" : "per month"}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12px",

                    color: "var(--muted)",

                    lineHeight: 1.6,
                  }}
                >
                  Dedicated monthly subscription for{" "}
                  <strong>{tool.name}</strong>.
                  {isYearly
                    ? " Renews annually with 2 months free applied. Cancel anytime."
                    : " Renews automatically every month on this date. Cancel anytime."}
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
                  onClick={handleBuySingleToolLive}
                >
                  {loading === "payment"
                    ? "Processing checkout…"
                    : !currentUser
                      ? `Create Account to Subscribe (${singleToolLabel})`
                      : `Subscribe to ${tool.name} (${singleToolLabel})`}
                </button>
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

                    color: "#00C9B7",

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
                    {isYearly ? "per year" : "per month"}
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
                  {isYearly ? " Includes 2 months free." : ""}
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
                    : !currentUser
                      ? `Create Account & Unlock All-Access`
                      : `Unlock All-Access (${formattedFee})`}
                </button>
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
