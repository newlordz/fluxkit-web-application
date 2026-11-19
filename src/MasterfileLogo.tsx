import React from "react"

export interface MasterfileLogoProps {
  variant?: "full" | "icon" | "wordmark" | "image"

  size?: "sm" | "md" | "lg" | "xl"

  height?: number

  className?: string

  theme?: "light" | "dark" | "auto"

  showBadge?: boolean

  badgeText?: string
}

/**
 * Masterfilepro Brand Logo & Icon Component
 * Faithfully reproduces the official Masterfilepro branding:
 * - 3-layer stacked document icon with folded dog-ear corner & stylized M emblem
 * - Deep navy (#06204D) & electric teal (#00C9B7) color palette
 * - Responsive sizing and light/dark theme adaptation
 */

export default function MasterfileLogo({
  variant = "full",

  size = "md",

  height,

  className = "",

  theme = "auto",

  showBadge = false,

  badgeText = "PRO",
}: MasterfileLogoProps) {
  // Height presets

  const resolvedHeight =
    height ||
    (size === "sm" ? 26 : size === "md" ? 34 : size === "lg" ? 44 : 56)

  // Color definitions from official Masterfilepro logo

  const navyColor =
    theme === "dark"
      ? "#FFFFFF"
      : theme === "light"
        ? "#06204D"
        : "var(--brand-navy, #06204D)"

  const tealColor = "#00C9B7"

  const folderNavy = "#06204D"

  // If raster image variant is requested

  if (variant === "image") {
    return (
      <div
        className={`masterfile-logo-container ${className}`}
        style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
      >
        <img
          src="/masterfilepro-logo.png"
          alt="Masterfilepro"
          style={{
            height: `${resolvedHeight}px`,

            width: "auto",

            objectFit: "contain",

            display: "block",
          }}
        />
        {showBadge && (
          <span
            style={{
              fontSize: "10px",

              fontWeight: 700,

              padding: "2px 6px",

              borderRadius: "4px",

              background: "rgba(0, 201, 183, 0.15)",

              color: "#00C9B7",

              border: "1px solid rgba(0, 201, 183, 0.35)",

              letterSpacing: "0.5px",
            }}
          >
            {badgeText}
          </span>
        )}
      </div>
    )
  }

  // Pixel-perfect SVG Icon Mark matching the logo: 3 stacked files, folded corner, white & teal stylized M

  const iconMark = (
    <svg
      width={Math.round(resolvedHeight * 1.05)}
      height={resolvedHeight}
      viewBox="0 0 100 95"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
      aria-label="Masterfilepro mark"
    >
      {/* Back document (Teal) */}
      <rect
        x="6"
        y="12"
        width="54"
        height="68"
        rx="10"
        fill="#00C9B7"
        opacity="0.95"
      />
      {/* Middle document (Teal) */}
      <rect
        x="16"
        y="12"
        width="54"
        height="68"
        rx="10"
        fill="#00D2C4"
        opacity="0.95"
      />

      {/* Front main document (Deep Midnight Navy) */}
      {/* Path with top-right folded dog-ear corner */}
      <path
        d="M26 22C26 16.4772 30.4772 12 36 12H68L84 28V80C84 85.5228 79.5228 90 74 90H36C30.4772 90 26 85.5228 26 80V22Z"
        fill={folderNavy}
      />

      {/* Folded corner triangle (White) */}
      <path
        d="M68 12V25C68 26.6569 69.3431 28 71 28H84L68 12Z"
        fill="#FFFFFF"
      />

      {/* Stylized 'M' inside the front folder:
          - Left leg + left diagonal: Crisp White
          - Center-right diagonal + right leg: Electric Teal */}
      <g id="emblem-m">
        {/* Left half of M (White) */}
        <path d="M36 70V44L47 55.5V64.5L41.5 59V70H36Z" fill="#FFFFFF" />
        {/* Left column outer upright (White) */}
        <path d="M36 44H41.5V70H36V44Z" fill="#FFFFFF" />
        {/* Left inner diagonal (White) */}
        <path d="M41.5 51L51 61.5L47 65.5L38.5 56.5L41.5 51Z" fill="#FFFFFF" />

        {/* Right half of M (Teal #00C9B7) */}
        <path d="M51 61.5L60.5 51L63.5 56.5L55 65.5L51 61.5Z" fill="#00C9B7" />
        {/* Right column outer upright (Teal #00C9B7) */}
        <path d="M60.5 44H66V70H60.5V44Z" fill="#00C9B7" />
        <path d="M60.5 59L55 64.5V55.5L66 44V70H60.5V59Z" fill="#00C9B7" />
      </g>
    </svg>
  )

  if (variant === "icon") {
    return (
      <div
        className={`masterfile-logo-icon ${className}`}
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        {iconMark}
      </div>
    )
  }

  // Wordmark: "Masterfile" in navy/white + "pro" in vibrant teal

  const fontSize = Math.round(resolvedHeight * 0.65)

  const wordmark = (
    <span
      style={{
        display: "inline-flex",

        alignItems: "baseline",

        fontFamily: "'Manrope', 'DM Sans', -apple-system, sans-serif",

        fontSize: `${fontSize}px`,

        fontWeight: 800,

        letterSpacing: "-0.04em",

        lineHeight: 1,

        whiteSpace: "nowrap",

        marginLeft: Math.round(resolvedHeight * 0.22) + "px",
      }}
    >
      <span style={{ color: navyColor, transition: "color 0.2s ease" }}>
        Masterfile
      </span>
      <span style={{ color: tealColor }}>pro</span>
    </span>
  )

  if (variant === "wordmark") {
    return (
      <div
        className={`masterfile-wordmark ${className}`}
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        {wordmark}
      </div>
    )
  }

  // Full logo (Icon + Wordmark)

  return (
    <div
      className={`masterfile-logo-full ${className}`}
      style={{
        display: "inline-flex",

        alignItems: "center",

        textDecoration: "none",

        userSelect: "none",
      }}
    >
      {iconMark}
      {wordmark}
      {showBadge && (
        <span
          style={{
            fontSize: `${Math.max(9, Math.round(fontSize * 0.4))}px`,

            fontWeight: 800,

            padding: "2px 6px",

            borderRadius: "4px",

            background: "rgba(0, 201, 183, 0.12)",

            color: "#00C9B7",

            border: "1px solid rgba(0, 201, 183, 0.3)",

            letterSpacing: "0.8px",

            marginLeft: "8px",

            alignSelf: "center",
          }}
        >
          {badgeText}
        </span>
      )}
    </div>
  )
}
