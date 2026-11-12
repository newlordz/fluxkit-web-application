import React from "react"
import type { LucideIcon } from "lucide-react"

export type BadgeIconType = "merge" | "split" | "compress" | "word" | "excel" | "powerpoint" | "word-pdf" | "excel-pdf" | "ppt-pdf" | "edit" | "pdf-jpg" | "jpg-pdf" | "sign" | "watermark" | "rotate" | "qr" | "audio" | "text" | "lock" | "scan" | "ai"

interface ToolBadgeIconProps {
  type?: BadgeIconType
  fallbackIcon?: LucideIcon
  color?: "red" | "emerald" | "blue" | "orange" | "purple" | "amber" | "teal"
  size?: number
}

export default function ToolBadgeIcon({
  type,
  fallbackIcon: FallbackIcon,
  color = "blue",
  size = 46,
}: ToolBadgeIconProps) {
  // Custom bespoke vector badges inspired by top document suites
  const renderIconSvg = () => {
    switch (type) {
      case "merge":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            {/* Two documents merging into one */}
            <rect
              x="5"
              y="4"
              width="12"
              height="16"
              rx="2"
              fill="currentColor"
              fillOpacity="0.25"
            />
            <path d="M12 7h5v4h-5z" fill="currentColor" fillOpacity="0.4" />
            <rect
              x="15"
              y="10"
              width="12"
              height="16"
              rx="2"
              fill="currentColor"
            />
            <path
              d="M18 15h6M18 18h6M18 21h4"
              stroke="#ffffff"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M10 23l3-3m0 0l-3-3m3 3H7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "split":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            {/* Document splitting into two with outward arrows */}
            <rect
              x="4"
              y="6"
              width="10"
              height="15"
              rx="2"
              fill="currentColor"
            />
            <rect
              x="18"
              y="11"
              width="10"
              height="15"
              rx="2"
              fill="currentColor"
              fillOpacity="0.4"
            />
            <path
              d="M7 10h4M7 13h4M7 16h3"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M14 18l3-3m0 0l-3-3m3 3h-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "compress":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            {/* Inward diagonal compression arrows on document */}
            <rect
              x="8"
              y="5"
              width="16"
              height="22"
              rx="2.5"
              fill="currentColor"
              fillOpacity="0.2"
            />
            <rect
              x="10"
              y="8"
              width="12"
              height="16"
              rx="1.8"
              fill="currentColor"
            />
            <path
              d="M5 5l6 6M11 7v4H7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M27 27l-6-6M21 25v-4h4"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "word":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            {/* Clean document with bold W */}
            <rect
              x="6"
              y="4"
              width="20"
              height="24"
              rx="3"
              fill="currentColor"
            />
            <path
              d="M10 11.5l2.6 9 2.4-6.5 2.4 6.5 2.6-9"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "excel":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            {/* Clean document with bold X */}
            <rect
              x="6"
              y="4"
              width="20"
              height="24"
              rx="3"
              fill="currentColor"
            />
            <path
              d="M11 11.5l10 9M21 11.5l-10 9"
              stroke="#ffffff"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        )

      case "powerpoint":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            {/* Clean document with bold P */}
            <rect
              x="6"
              y="4"
              width="20"
              height="24"
              rx="3"
              fill="currentColor"
            />
            <path d="M11 20.5v-9h5a4.5 4.5 0 0 1 0 9h-5z" fill="#ffffff" />
            <path
              d="M11 11.5h4.5a3.5 3.5 0 1 1 0 7H11v-7z"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "word-pdf":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect x="4" y="6" width="13" height="15" rx="2" fill="#2563eb" />
            <path
              d="M7 11.5l1.8 5 1.7-3.8 1.7 3.8 1.8-5"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18 19l4 4m0 0l4-4m-4 4v-8"
              stroke="#ef4444"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "excel-pdf":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect x="4" y="6" width="13" height="15" rx="2" fill="#16a34a" />
            <path
              d="M8 11.5l5 5M13 11.5l-5 5"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M18 19l4 4m0 0l4-4m-4 4v-8"
              stroke="#ef4444"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "ppt-pdf":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect x="4" y="6" width="13" height="15" rx="2" fill="#ea580c" />
            <path
              d="M8 17v-6h3a2.5 2.5 0 1 1 0 5H8"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18 19l4 4m0 0l4-4m-4 4v-8"
              stroke="#ef4444"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "edit":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect
              x="5"
              y="5"
              width="22"
              height="22"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeDasharray="3 3"
            />
            <path d="M11 21l8-8 3 3-8 8H11v-3z" fill="currentColor" />
            <path
              d="M17 11l3 3"
              stroke="#ffffff"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        )

      case "pdf-jpg":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect
              x="5"
              y="5"
              width="14"
              height="18"
              rx="2"
              fill="currentColor"
              fillOpacity="0.3"
            />
            <rect
              x="12"
              y="10"
              width="15"
              height="17"
              rx="2.5"
              fill="currentColor"
            />
            <circle cx="16" cy="15" r="1.8" fill="#ffffff" />
            <path
              d="M13 24l4-4 3 3 4-5 3 4"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "jpg-pdf":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect
              x="5"
              y="5"
              width="15"
              height="15"
              rx="2.5"
              fill="currentColor"
            />
            <circle cx="9.5" cy="9.5" r="1.5" fill="#ffffff" />
            <path
              d="M6 17l4-4 2 2 4-4 3 4"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M19 18l4 4m0 0l4-4m-4 4v-8"
              stroke="#ef4444"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )

      case "sign":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect
              x="6"
              y="4"
              width="20"
              height="24"
              rx="3"
              fill="currentColor"
              fillOpacity="0.15"
            />
            <path d="M16 6l7 7-9 9-4 1 1-4 8-8" fill="currentColor" />
            <circle cx="16" cy="13" r="1" fill="#ffffff" />
            <path
              d="M9 25c3-1 6 1 9 0"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )

      case "watermark":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            {/* Rubber stamp watermark icon */}
            <path
              d="M16 6a3 3 0 0 0-3 3c0 2 2 3.5 2 5h2c0-1.5 2-3 2-5a3 3 0 0 0-3-3z"
              fill="currentColor"
            />
            <rect
              x="8"
              y="16"
              width="16"
              height="4"
              rx="1.5"
              fill="currentColor"
            />
            <rect
              x="6"
              y="21"
              width="20"
              height="3"
              rx="1"
              fill="currentColor"
              fillOpacity="0.4"
            />
            <path
              d="M6 26h20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )

      case "rotate":
        return (
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="badge-svg"
            aria-hidden="true"
          >
            <path
              d="M16 7a9 9 0 1 1-8.1 5.1M8 6v6h6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect
              x="12"
              y="12"
              width="8"
              height="8"
              rx="1.5"
              fill="currentColor"
              fillOpacity="0.3"
            />
          </svg>
        )

      default:
        if (FallbackIcon) {
          return <FallbackIcon size={22} strokeWidth={2} />
        }
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="badge-svg"
            aria-hidden="true"
          >
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
          </svg>
        )
    }
  }

  return (
    <div
      className={`tool-badge-box color-${color}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      <div className="tool-badge-inner">{renderIconSvg()}</div>
    </div>
  )
}
