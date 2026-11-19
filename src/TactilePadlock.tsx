import React from "react"

export interface TactilePadlockProps {
  unlocked?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
  style?: React.CSSProperties
  title?: string
}

/**
 * TactilePadlock - Luminous Radiant Padlock.
 * The solid orange box is completely removed; the white padlock outline remains
 * with a vibrant radiant amber glow indicating the locked state.
 */
export default function TactilePadlock({
  unlocked = false,
  size = "sm",
  className = "",
  style = {},
  title,
}: TactilePadlockProps) {
  const pixelSize = size === "sm" ? 34 : size === "lg" ? 48 : 38

  return (
    <div
      className={`tactile-padlock-container size-${size} ${
        unlocked ? "is-unlocked" : ""
      } ${className}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
        flexShrink: 0,
        ...style,
      }}
      title={title || (unlocked ? "Feature Unlocked" : "Pro Feature Protected")}
    >
      {/* Radiant ambient aura behind the white padlock */}
      <div
        className={`tactile-padlock-aura ${unlocked ? "is-unlocked" : ""}`}
        aria-hidden="true"
      />

      {/* Radiant White Padlock (No solid orange box) */}
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`tactile-padlock-svg ${unlocked ? "is-unlocked" : ""}`}
        style={{
          overflow: "visible",
          display: "block",
        }}
      >
        <defs>
          {/* Radiant Amber Glow Filter for Locked State */}
          <filter
            id="radiantLockGlow"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="1.2"
              floodColor="#D97706"
              floodOpacity="0.95"
            />
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="4"
              floodColor="#F59E0B"
              floodOpacity="0.8"
            />
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="7"
              floodColor="#EA580C"
              floodOpacity="0.55"
            />
          </filter>

          {/* Radiant Emerald Glow Filter for Unlocked State */}
          <filter
            id="radiantUnlockGlow"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="1.2"
              floodColor="#059669"
              floodOpacity="0.95"
            />
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="4"
              floodColor="#10B981"
              floodOpacity="0.8"
            />
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="7"
              floodColor="#047857"
              floodOpacity="0.55"
            />
          </filter>
        </defs>

        <g
          filter={
            unlocked ? "url(#radiantUnlockGlow)" : "url(#radiantLockGlow)"
          }
        >
          {/* Padlock Shackle */}
          <path
            className="tactile-padlock-shackle"
            d={
              unlocked
                ? "M 12 16 V 11 C 12 7.7 14.7 5 18 5 C 21.1 5 23.6 7.3 23.9 10.4"
                : "M 12 16 V 12 C 12 8.7 14.7 6 18 6 C 21.3 6 24 8.7 24 12 V 16"
            }
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Padlock Stadium Body */}
          <rect
            className="tactile-padlock-body"
            x="7"
            y="16"
            width="22"
            height="15"
            rx="5"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  )
}
