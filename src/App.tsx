import { useEffect, useState, useRef, useMemo } from "react"

import {
  Activity,
  AudioLines,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronLeft,
  Command,
  Cpu,
  Database,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  Key,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  WandSparkles,
  X,
  Zap,
} from "lucide-react"

import { brand, categories, tools, type Category, type Tool } from "./config"

import MasterfileLogo from "./MasterfileLogo"

import ToolPage from "./ToolPage"

import AudioToText from "./AudioToText"

import AuthPage, { type AuthPageMode } from "./AuthPage"

import Overview from "./Overview"

import ToolBadgeIcon from "./ToolBadgeIcon"

import { useNotify } from "./Notifications"

import {
  getCurrentUser,
  signOut,
  onAuthStateChanged,
  type UserAccount,
} from "./authService"

import {
  canUserAccessTool,
  isToolPro,
  getFormattedToolPrice,
  syncToolTiersFromDatabase,
} from "./adminService"

import {
  getAdminConfig,
  updateAdminSettings,
  initializeDatabaseSync,
  type DatabaseStatus,
} from "./adminDbService"

import {
  getActiveCurrency,
  setActiveCurrency,
  syncLiveExchangeRate,
  type SupportedCurrency,
} from "./currencyService"

import {
  getCustomPageBySlug,
  getPublishedCustomPages,
} from "./pageManagerService"

import AdminPanel from "./AdminPanel"

import ProActivationModal from "./ProActivationModal"

import ImageShowcaseViewer from "./ImageShowcaseViewer"

import VisitorPassStudio from "./VisitorPassStudio"

import { GoogleIcon } from "./GoogleAuth"

import { syncCloudApisWithServer } from "./apiPoolService"

import { syncGatewaysWithServer } from "./paymentIntegrationService"

function stored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Storage may be unavailable in private browser contexts. */
  }
}

const navItems = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },

  { id: "all", name: "All tools", icon: Grid2X2 },

  { id: "files", name: "File tools", icon: FolderOpen },

  { id: "qr-tools", name: "QR tools", icon: QrCode },

  { id: "ai", name: "AI text tools", icon: Sparkles },

  { id: "audio", name: "Audio tools", icon: AudioLines },
]

type ActivityItem = {
  name: string

  time: string
}

function getToolThemeClass(tool: Tool) {
  if (tool.category === "File tools") return "theme-blue"

  if (tool.category === "QR tools") return "theme-teal"

  if (tool.category === "AI text tools") return "theme-violet"

  if (tool.category === "Audio tools") return "theme-amber"

  return "theme-blue"
}

function ToolCard({
  tool,

  navigate,
}: {
  tool: Tool

  navigate: (id: string) => void
}) {
  return (
    <button
      className={`tool-card ${getToolThemeClass(tool)}`}
      onClick={() => navigate(tool.id)}
    >
      <div className="tool-card-top">
        <ToolBadgeIcon
          type={tool.badgeIconType}
          fallbackIcon={tool.icon}
          color={tool.badgeColor || "blue"}
          size={38}
        />
        <ArrowUpRight className="card-arrow" size={19} />
      </div>
      <h3>{tool.name}</h3>
      <p>{tool.description}</p>
      <span className="tool-card-bottom">
        <span className="tool-card-category">{tool.category}</span>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <span
            style={{
              fontSize: "11px",

              padding: "2px 6px",

              borderRadius: "4px",

              fontWeight: 700,

              whiteSpace: "nowrap",

              flexShrink: 0,

              background: isToolPro(tool.id)
                ? "rgba(0,201,183,0.15)"
                : "rgba(16,185,129,0.15)",

              color: isToolPro(tool.id) ? "#00C9B7" : "#10b981",
            }}
          >
            {isToolPro(tool.id)
              ? `PRO · ${getFormattedToolPrice(tool.id, undefined, "month")}`
              : "FREE"}
          </span>
          <span
            className={`tool-badge ${
              tool.integrationRequired
                ? "badge-backend"
                : tool.available
                  ? "badge-live"
                  : "badge-soon"
            }`}
          >
            {tool.integrationRequired
              ? "Backend required"
              : tool.available
                ? "Open tool"
                : "Coming soon"}{" "}
            <ArrowRight size={12} />
          </span>
        </span>
      </span>
    </button>
  )
}

export default function App() {
  const notify = useNotify()

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() =>
    getCurrentUser(),
  )

  const [page, setPage] = useState(() => {
    const initialUser = getCurrentUser()

    if (initialUser?.role === "admin" || initialUser?.role === "sub-admin") {
      return "admin"
    }

    return location.hash.slice(1) || "overview"
  })

  const [theme, setTheme] = useState(() => {
    const v2 = stored("fluxkit-theme-v2", "")

    if (v2) return v2

    return "light"
  })

  const [collapsed, setCollapsed] = useState(
    () => stored("fluxkit-sidebar", "false") === "true",
  )

  const [mobile, setMobile] = useState(false)

  const [query, setQuery] = useState("")

  const [filter, setFilter] = useState<Category | "All tools">("All tools")

  const [activity, setActivity] = useState<ActivityItem[]>([])

  const [menu, setMenu] = useState(false)

  const [notifications, setNotifications] = useState(false)

  const [profile, setProfile] = useState(() => stored("fluxkit-name", "Jamie"))

  const [saved, setSaved] = useState(false)

  const [activeCurrency, setActiveCurrencyState] =
    useState<SupportedCurrency>(getActiveCurrency)

  // Admin & Database Settings State

  const [, setAdminConfigState] = useState(() => getAdminConfig())

  const [, setDbStatusState] = useState<DatabaseStatus | null>(null)

  const [adminEditName, setAdminEditName] = useState(
    () => getAdminConfig().name,
  )

  const [adminEditEmail, setAdminEditEmail] = useState(
    () => getAdminConfig().email,
  )

  const [adminCurrentPassword, setAdminCurrentPassword] = useState("")

  const [adminNewPassword, setAdminNewPassword] = useState("")

  const [adminConfirmPassword, setAdminConfirmPassword] = useState("")

  const [adminShowPass, setAdminShowPass] = useState(false)

  const [adminSaveLoading, setAdminSaveLoading] = useState(false)

  const [adminSaveMessage, setAdminSaveMessage] = useState<{
    type: "success" | "error"

    text: string
  } | null>(null)

  useEffect(() => {
    initializeDatabaseSync().then((status) => {
      setDbStatusState(status)

      const cfg = getAdminConfig()

      setAdminConfigState(cfg)

      setAdminEditName(cfg.name)

      setAdminEditEmail(cfg.email)
    })

    syncCloudApisWithServer().catch(() => null)

    syncGatewaysWithServer().catch(() => null)
    syncLiveExchangeRate().catch(() => null)
    syncToolTiersFromDatabase().catch(() => null)
  }, [])

  useEffect(() => {
    const handleCurr = (e: any) => {
      if (e.detail) setActiveCurrencyState(e.detail)
    }

    window.addEventListener("fluxkit-currency-changed", handleCurr)

    return () =>
      window.removeEventListener("fluxkit-currency-changed", handleCurr)
  }, [])

  useEffect(() => {
    return onAuthStateChanged((user) => {
      setCurrentUser(user)

      if (user?.name) {
        setProfile(user.name.split(" ")[0])
      }
    })
  }, [])

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "scrollRestoration" in window.history
    ) {
      window.history.scrollRestoration = "manual"
    }

    const change = () => {
      setPage(location.hash.slice(1) || "overview")
    }

    window.addEventListener("hashchange", change)

    return () => window.removeEventListener("hashchange", change)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    const palette = brand.colors[theme === "light" ? "light" : "dark"]

    for (const [key, value] of Object.entries({
      "--accent": palette.accent,

      "--bg": palette.background,

      "--surface": palette.surface,

      "--text": palette.text,
    }))
      document.documentElement.style.setProperty(key, value)

    document.title = `${brand.name} — High-Performance File & Document Toolkit`

    persist("fluxkit-theme", theme)

    persist("fluxkit-theme-v2", theme)
  }, [theme])

  useEffect(() => {
    persist("fluxkit-sidebar", String(collapsed))
  }, [collapsed])

  useEffect(() => {
    if (!mobile) return

    const previousFocus = document.activeElement as HTMLElement | null

    const sidebar = document.querySelector<HTMLElement>(".sidebar")

    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href]",
        ) || [],
      ).filter((element) => element.getClientRects().length > 0)

    focusable()[0]?.focus()

    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return

      const items = focusable()

      const first = items[0]

      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()

        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()

        first?.focus()
      }
    }

    document.addEventListener("keydown", trap)

    return () => {
      document.removeEventListener("keydown", trap)

      previousFocus?.focus()
    }
  }, [mobile])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".popover-wrap")
      ) {
        setMenu(false)

        setNotifications(false)
      }
    }

    document.addEventListener("pointerdown", close)

    return () => document.removeEventListener("pointerdown", close)
  }, [])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()

        location.hash = "all"

        setPage("all")

        setTimeout(() => document.getElementById("catalog-search")?.focus(), 50)
      }

      if (event.key === "Escape") {
        setMenu(false)

        setNotifications(false)

        setMobile(false)
      }
    }

    window.addEventListener("keydown", shortcut)

    return () => window.removeEventListener("keydown", shortcut)
  }, [])

  const pageScrollPositions = useRef<Map<string, number>>(new Map())

  const isRestoringScroll = useRef(false)

  // Continuously record scroll position of the active page (unless currently restoring)

  useEffect(() => {
    if (typeof window === "undefined") return

    let ticking = false

    const handleScroll = () => {
      if (isRestoringScroll.current) return

      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!isRestoringScroll.current) {
            const currentY =
              window.scrollY || document.documentElement.scrollTop || 0

            pageScrollPositions.current.set(page, currentY)
          }

          ticking = false
        })

        ticking = true
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => window.removeEventListener("scroll", handleScroll)
  }, [page])

  // Restore scroll position whenever `page` changes

  useEffect(() => {
    if (typeof window === "undefined") return

    const isTool = tools.some((t) => t.id === page)

    if (isTool) {
      isRestoringScroll.current = false

      window.scrollTo({ top: 0, behavior: "instant" })
    } else {
      const savedY = pageScrollPositions.current.get(page)

      if (typeof savedY === "number" && savedY > 0) {
        isRestoringScroll.current = true

        let attempts = 0

        const maxAttempts = 8

        const restore = () => {
          window.scrollTo({ top: savedY, behavior: "instant" })

          const currentY =
            window.scrollY || document.documentElement.scrollTop || 0

          attempts++

          if (
            Math.abs(currentY - savedY) < 10 ||
            document.documentElement.scrollHeight >=
              savedY + window.innerHeight ||
            attempts >= maxAttempts
          ) {
            requestAnimationFrame(() => {
              isRestoringScroll.current = false
            })
          } else {
            requestAnimationFrame(restore)
          }
        }

        requestAnimationFrame(restore)
      } else {
        isRestoringScroll.current = false
      }
    }
  }, [page])

  const [stagedFiles, setStagedFiles] = useState<File[]>([])

  function navigate(id: string, initialFiles?: File[]) {
    if (typeof window !== "undefined") {
      const currentScroll =
        window.scrollY || document.documentElement.scrollTop || 0

      pageScrollPositions.current.set(page, currentScroll)
    }

    if (initialFiles && initialFiles.length > 0) {
      setStagedFiles(initialFiles)
    } else {
      setStagedFiles([])
    }

    location.hash = id

    setPage(id)

    setMobile(false)

    setMenu(false)

    setQuery("")

    setFilter("All tools")
  }

  const customPage = getCustomPageBySlug(page)

  const selected = tools.find((t) => t.id === page)

  const isPaywallActive =
    (page === "audio-text" && !canUserAccessTool("audio-text", currentUser)) ||
    (page === "visitor-pass" &&
      !canUserAccessTool("visitor-pass", currentUser)) ||
    Boolean(selected?.available && !canUserAccessTool(selected.id, currentUser))

  const heading =
    navItems.find((n) => n.id === page)?.name ||
    (page === "settings"
      ? "Settings"
      : page === "activity"
        ? "Activity"
        : page === "admin"
          ? "Admin Dashboard"
          : page === "admin-integrations"
            ? "Payment Gateways & APIs"
            : customPage?.title ||
              selected?.name ||
              (page === "help" ? "Help & resources" : "Page not found"))

  const category: Category | undefined =
    page === "files"
      ? "File tools"
      : page === "qr-tools"
        ? "QR tools"
        : page === "ai"
          ? "AI text tools"
          : page === "audio"
            ? "Audio tools"
            : undefined

  const filtered = useMemo(
    () =>
      tools.filter(
        (t) =>
          (category
            ? t.category === category
            : filter === "All tools" || t.category === filter) &&
          `${t.name} ${t.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),

    [category, filter, query],
  )

  const activityContent = (
    <section className="panel activity-panel">
      <div className="section-heading">
        <div>
          <h2>Recent activity</h2>
          <p>Your latest work, all in one place.</p>
        </div>
        {page !== "activity" && (
          <button className="text-button" onClick={() => navigate("activity")}>
            View activity <ArrowRight size={15} />
          </button>
        )}
      </div>
      {activity.length ? (
        <div className="activity-list">
          {activity.map((item, i) => (
            <div key={i}>
              <span className="small-icon">
                <FileText size={20} />
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>Completed this session · {item.time}</small>
              </span>
              <span className="live-badge">Completed</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="activity-empty">
          <div className="empty-icon">
            <Activity size={22} />
          </div>
          <div>
            <strong>A fresh start. Make something happen.</strong>
            <p>Tools you use in this session will show up here.</p>
          </div>
          <button onClick={() => navigate("all")}>
            Explore tools <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </section>
  )

  if (["sign-in", "sign-up", "reset-password"].includes(page))
    return (
      <AuthPage
        key={page}
        mode={page as AuthPageMode}
        theme={theme}
        toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        navigate={navigate}
        currentUser={currentUser}
        onAuthSuccess={(user) => {
          setCurrentUser(user)

          if (user.role === "admin" || user.role === "sub-admin") {
            navigate("admin")
          } else {
            navigate("overview")
          }
        }}
      />
    )

  if (page.startsWith("showcase") || page.startsWith("image-qr"))
    return (
      <ImageShowcaseViewer
        theme={theme}
        toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onNavigate={navigate}
      />
    )

  const isAdmin =
    currentUser?.role === "admin" || currentUser?.role === "sub-admin"

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()

          document.getElementById("main-content")?.focus()
        }}
      >
        Skip to content
      </a>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`sidebar ${mobile ? "mobile-open" : ""}`}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile || undefined}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-scroll">
          <button
            className="brand"
            onClick={() => navigate(isAdmin ? "admin" : "overview")}
            style={{
              display: "flex",

              alignItems: "center",

              width: "100%",

              textDecoration: "none",

              border: "none",

              background: "none",

              cursor: "pointer",
            }}
          >
            {collapsed ? (
              <MasterfileLogo variant="icon" size="sm" height={28} />
            ) : (
              <>
                <MasterfileLogo
                  variant="full"
                  size="md"
                  height={30}
                  theme={theme === "light" ? "light" : "dark"}
                />
                <span
                  className="workspace-badge"
                  style={{ marginLeft: "auto" }}
                >
                  {isAdmin
                    ? currentUser?.role === "sub-admin"
                      ? "SUB-ADMIN"
                      : "ADMIN"
                    : "WORKSPACE"}
                </span>
              </>
            )}
          </button>
          <button
            className="workspace-switch"
            onClick={() => {
              if (isAdmin) {
                navigate("admin")
              } else {
                navigate("settings")
              }
            }}
          >
            <span
              className="workspace-avatar"
              style={
                isAdmin
                  ? {
                      background:
                        "linear-gradient(135deg, #06204D 0%, #0A2558 100%)",

                      color: "#00C9B7",

                      border: "1.5px solid #00C9B7",

                      fontWeight: 800,
                    }
                  : undefined
              }
            >
              M
            </span>
            <span>
              Masterfile Pro Workspace
              <small>
                {isAdmin
                  ? currentUser?.role === "sub-admin"
                    ? "Sub-Administrator"
                    : "Administrator (Full Access)"
                  : currentUser?.subscriptionTier === "pro"
                    ? "Pro plan"
                    : currentUser
                      ? "Standard plan"
                      : "Free plan"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <nav>
            {isAdmin && (
              <>
                <div className="nav-label">ADMINISTRATION</div>
                <button
                  key="admin"
                  className={page === "admin" ? "active" : ""}
                  onClick={() => navigate("admin")}
                  style={{ color: "#00C9B7", fontWeight: 600 }}
                >
                  <ShieldCheck size={18} />
                  <span>Admin Portal</span>
                </button>
                <div className="nav-divider" />
              </>
            )}

            <div className="nav-label">
              {isAdmin ? "WORKSTATION" : "WORKSPACE"}
            </div>
            {navItems.map((n) => (
              <button
                title={collapsed ? n.name : undefined}
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} />
                <span>{n.name}</span>
                {n.id === "all" && <small>{tools.length}</small>}
                {n.id === "ai" && <span className="new-label">NEW</span>}
              </button>
            ))}
            <div className="nav-divider" />
            {[
              { id: "documents", name: "My documents", icon: FileText },

              { id: "activity", name: "Activity", icon: Activity },
            ].map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} />
                <span>{n.name}</span>
              </button>
            ))}
            {getPublishedCustomPages()

              .filter((p) => p.showInNav)

              .map((p) => (
                <button
                  key={p.slug}
                  className={page === p.slug ? "active" : ""}
                  onClick={() => navigate(p.slug)}
                >
                  <FileText size={18} />
                  <span>{p.navTitle || p.title}</span>
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="flow-card">
              <span className="small-spark">
                <Sparkles size={17} />
              </span>
              <h3>
                {isAdmin ? "Admin & Tools Ready." : "A little less busywork."}
              </h3>
              <p>
                {isAdmin
                  ? "All workstation tools & gateway integrations at your disposal."
                  : "A little more possibility. Find your next favorite tool."}
              </p>
              <button onClick={() => navigate("all")}>
                Explore the toolkit <ArrowUpRight size={15} />
              </button>
            </div>
            <button className="bottom-nav" onClick={() => navigate("settings")}>
              <Settings size={18} />
              <span>Settings</span>
            </button>
            <button className="bottom-nav" onClick={() => navigate("help")}>
              <HelpCircle size={18} />
              <span>Help & resources</span>
              <ArrowUpRight size={14} />
            </button>
            <button
              className="user-profile"
              onClick={() =>
                isAdmin ? navigate("admin") : navigate("settings")
              }
            >
              <span
                className="avatar"
                style={
                  isAdmin
                    ? {
                        background:
                          "linear-gradient(135deg, #06204D 0%, #0A2558 100%)",

                        color: "#00C9B7",

                        border: "1.5px solid #00C9B7",

                        fontWeight: 800,
                      }
                    : undefined
                }
              >
                {isAdmin ||
                currentUser?.name?.includes("FluxKit") ||
                currentUser?.name?.includes("Masterfilepro")
                  ? "M"
                  : currentUser
                    ? (currentUser.name || "M").slice(0, 1).toUpperCase()
                    : "M"}
              </span>
              <span>
                {isAdmin ||
                currentUser?.name?.includes("FluxKit") ||
                currentUser?.name?.includes("Masterfilepro") ||
                currentUser?.name?.includes("Masterfile Pro")
                  ? currentUser?.name &&
                    !currentUser.name.includes("FluxKit") &&
                    !currentUser.name.includes("Masterfilepro")
                    ? currentUser.name
                    : "Masterfile Pro Administrator"
                  : currentUser
                    ? currentUser.name
                    : "Masterfile Pro User"}
                <small>
                  {isAdmin
                    ? currentUser?.role === "sub-admin"
                      ? "Sub-Administrator"
                      : "Administrator"
                    : currentUser
                      ? currentUser.email
                      : "Personal account"}
                </small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </div>
        <button
          className="collapse-control"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeftClose size={15} />
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs" aria-label="Breadcrumb navigation">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <button
              type="button"
              className="breadcrumb-link breadcrumb-root"
              onClick={() => navigate("overview")}
              title="Return to Workspace Overview"
              aria-label="Return to Workspace Overview"
            >
              Workspace
            </button>
            <span className="breadcrumb-slash">/</span>
            <strong>{heading}</strong>
          </div>
          <div className="top-actions">
            <button
              className="top-search"
              onClick={() => {
                navigate("all")

                setTimeout(
                  () => document.getElementById("catalog-search")?.focus(),

                  50,
                )
              }}
            >
              <Search size={15} />
              <span>Find a tool</span>
              <kbd>⌘ K</kbd>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate("admin")}
                style={{
                  display: "inline-flex",

                  alignItems: "center",

                  gap: "6px",

                  padding: "5px 12px",

                  borderRadius: "20px",

                  background: "rgba(0, 201, 183, 0.12)",

                  color: "#00C9B7",

                  fontSize: "12px",

                  fontWeight: 600,

                  border: "1px solid rgba(0, 201, 183, 0.25)",

                  cursor: "pointer",
                }}
                title="Open Admin Dashboard"
              >
                <ShieldCheck size={14} />
                <span>Admin Console</span>
              </button>
            )}
            <div className="top-divider" />
            {/* Header Currency Switcher */}
            <div
              className="currency-header-switch"
              style={{
                display: "inline-flex",

                alignItems: "center",

                background: "var(--surface)",

                border: "1px solid var(--border)",

                borderRadius: "20px",

                padding: "2px",

                gap: "2px",
              }}
              title="Change platform currency (USD / Ghanaian Cedi)"
            >
              <button
                type="button"
                onClick={() => {
                  setActiveCurrency("USD")

                  setActiveCurrencyState("USD")
                }}
                style={{
                  padding: "3px 8px",

                  borderRadius: "16px",

                  border: "none",

                  background:
                    activeCurrency === "USD" ? "var(--accent)" : "transparent",

                  color: activeCurrency === "USD" ? "#fff" : "var(--muted)",

                  cursor: "pointer",

                  fontSize: "11px",

                  fontWeight: 700,

                  display: "flex",

                  alignItems: "center",

                  gap: "4px",
                }}
              >
                <span>🇺🇸</span>
                <span>$</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveCurrency("GHS")

                  setActiveCurrencyState("GHS")
                }}
                style={{
                  padding: "3px 8px",

                  borderRadius: "16px",

                  border: "none",

                  background:
                    activeCurrency === "GHS" ? "var(--accent)" : "transparent",

                  color: activeCurrency === "GHS" ? "#fff" : "var(--muted)",

                  cursor: "pointer",

                  fontSize: "11px",

                  fontWeight: 700,

                  display: "flex",

                  alignItems: "center",

                  gap: "4px",
                }}
              >
                <span>🇬🇭</span>
                <span>GH₵</span>
              </button>
            </div>
            <button
              className="icon-button"
              aria-label="Toggle color theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="popover-wrap">
              <button
                className="icon-button"
                aria-label="Notifications"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={18} />
              </button>
              {notifications && (
                <div className="popover">
                  <strong>You're all caught up</strong>
                  <p>No notifications right now.</p>
                </div>
              )}
            </div>
            <div className="popover-wrap">
              <button
                className="avatar top-avatar"
                aria-label="Account menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                {currentUser
                  ? (currentUser.name || "U").slice(0, 1).toUpperCase()
                  : `${profile.slice(0, 1).toUpperCase()}D`}
              </button>
              {menu && (
                <div className="popover popover-user">
                  <div className="popover-user-header">
                    <span className="avatar">
                      {currentUser
                        ? (currentUser.name || "U").slice(0, 1).toUpperCase()
                        : `${profile.slice(0, 1).toUpperCase()}D`}
                    </span>
                    <div className="popover-user-meta">
                      <strong>
                        {currentUser
                          ? currentUser.name
                          : profile
                            ? `${profile} (Local Profile)`
                            : "Masterfile Pro User"}
                      </strong>
                      <p className="popover-email">
                        {currentUser
                          ? currentUser.email
                          : "Local profile · Not signed in"}
                      </p>
                    </div>
                  </div>
                  {currentUser ? (
                    <div className="popover-badge">
                      {currentUser.provider === "google" && (
                        <GoogleIcon size={13} />
                      )}
                      <span>
                        {currentUser.role === "admin"
                          ? "Administrator Account"
                          : currentUser.provider === "google"
                            ? "Google Account Active"
                            : "Masterfile Pro Account Active"}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="popover-google-btn"
                      onClick={() => {
                        setMenu(false)

                        navigate("sign-in")
                      }}
                    >
                      <GoogleIcon size={14} />
                      <span>Sign in with Google</span>
                    </button>
                  )}
                  <div className="popover-divider" />
                  {!currentUser ? (
                    <>
                      <button onClick={() => navigate("sign-in")}>
                        Sign in with email <ArrowRight size={14} />
                      </button>
                      <button onClick={() => navigate("sign-up")}>
                        Create an account <ArrowUpRight size={14} />
                      </button>
                    </>
                  ) : null}
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        setMenu(false)

                        navigate("admin")
                      }}
                    >
                      Admin Portal <ShieldCheck size={14} />
                    </button>
                  ) : (
                    <>
                      <button onClick={() => navigate("settings")}>
                        Account settings <ArrowUpRight size={14} />
                      </button>
                      <button onClick={() => navigate("activity")}>
                        Session activity <Activity size={14} />
                      </button>
                    </>
                  )}
                  {currentUser && (
                    <>
                      <div className="popover-divider" />
                      <button
                        type="button"
                        className="popover-signout"
                        onClick={() => {
                          signOut()

                          setCurrentUser(null)

                          setMenu(false)

                          notify("Signed out of administrator account.", "info")

                          location.hash = "sign-in"

                          setPage("sign-in")
                        }}
                      >
                        Sign out <LogOut size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={isPaywallActive ? "paywall-active" : ""}
        >
          {page === "overview" ? (
            <Overview navigate={navigate} activity={activity} />
          ) : ["all", "files", "qr-tools", "ai", "audio"].includes(page) ? (
            <div className="page-enter">
              <div className="eyebrow">THE TOOLKIT</div>
              <h1>
                {page === "all" ? "A tool for every next step." : heading}
              </h1>
              <p className="page-subtitle">
                Find a little more possibility in your everyday.
              </p>
              <div className="directory-search">
                <Search size={20} />
                <input
                  id="catalog-search"
                  aria-label="Search the tool catalog"
                  placeholder="Search tools by name or description…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              {!category && (
                <div className="category-tabs">
                  {["All tools", ...categories].map((c) => {
                    const isSelected = filter === c

                    const tabColor = isSelected
                      ? c === "File tools"
                        ? "selected tab-blue"
                        : c === "QR tools"
                          ? "selected tab-teal"
                          : c === "AI text tools"
                            ? "selected tab-violet"
                            : c === "Audio tools"
                              ? "selected tab-amber"
                              : "selected tab-popular"
                      : ""

                    return (
                      <button
                        key={c}
                        className={tabColor}
                        onClick={() => setFilter(c as Category | "All tools")}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="directory-meta">
                {filtered.length} tools{" "}
                <span>Local tools + clearly labeled service integrations</span>
              </div>
              <div className="tool-grid">
                {filtered.map((t) => (
                  <ToolCard key={t.id} tool={t} navigate={navigate} />
                ))}
              </div>
              {!filtered.length && (
                <div className="panel coming-soon">
                  <Search size={32} />
                  <h2>No tools found</h2>
                  <p>Try another search or change your category.</p>
                  <button
                    className="primary"
                    onClick={() => {
                      setQuery("")

                      setFilter("All tools")
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          ) : page === "activity" ? (
            <>
              <div className="eyebrow">YOUR WORKSPACE</div>
              <h1>A little progress, in one place.</h1>
              <p className="page-subtitle">
                Real activity from your current session. Nothing made up.
              </p>
              {activityContent}
              {activity.length > 0 && (
                <button
                  className="text-button clear-activity"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Clear activity from this session? This cannot be undone.",
                      )
                    ) {
                      setActivity([])

                      notify("Session activity cleared.")
                    }
                  }}
                >
                  Clear session activity <X size={14} />
                </button>
              )}
            </>
          ) : page === "settings" ? (
            <div className="page-enter">
              <div className="eyebrow">MAKE IT YOURS</div>
              <h1>Workspace settings</h1>
              <p className="page-subtitle">
                A few small details. A space that feels like you.
              </p>
              <div className="panel settings-panel">
                <h2>Account & Authentication</h2>
                {currentUser ? (
                  <div className="settings-account-card">
                    <h3>
                      {currentUser.provider === "google" ? (
                        <>
                          <GoogleIcon size={16} /> Connected Google Account
                        </>
                      ) : isAdmin ? (
                        <>
                          <ShieldCheck size={16} color="#00C9B7" />{" "}
                          Administrator Account (Pro)
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={16} color="#3b82f6" /> Email
                          Account (
                          {currentUser.subscriptionTier === "pro"
                            ? "Pro"
                            : "Standard"}
                          )
                        </>
                      )}
                    </h3>
                    <div className="settings-account-row">
                      <span>Account Name</span>
                      <strong>{currentUser.name}</strong>
                    </div>
                    <div className="settings-account-row">
                      <span>Email Address</span>
                      <span className="settings-account-badge">
                        <ShieldCheck size={13} /> {currentUser.email}
                      </span>
                    </div>
                    <div className="settings-account-row">
                      <span>Role & Privileges</span>
                      <strong
                        style={{ color: isAdmin ? "#00C9B7" : "inherit" }}
                      >
                        {isAdmin
                          ? "Root Administrator"
                          : currentUser.role || "User"}
                      </strong>
                    </div>
                    <div className="settings-account-row">
                      <span>Status</span>
                      <span className="live-badge">Verified & Active</span>
                    </div>
                    <button
                      type="button"
                      className="settings-signout-btn"
                      onClick={() => {
                        signOut()

                        setCurrentUser(null)

                        notify("Signed out of session.")
                      }}
                    >
                      Sign out <LogOut size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="settings-account-card">
                    <h3>Guest Mode (Local Only)</h3>
                    <p>
                      Sign in with your email or Google account to access your
                      workspace, save your preferences, and access premium
                      tools.
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginTop: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        className="google-direct-btn"
                        style={{ width: "fit-content" }}
                        onClick={() => navigate("sign-in")}
                      >
                        <GoogleIcon size={18} />
                        <span>Sign in with Google</span>
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        style={{ fontSize: "13px", padding: "8px 14px" }}
                        onClick={() => navigate("sign-in")}
                      >
                        Sign in with Email
                      </button>
                    </div>
                  </div>
                )}

                {/* Database-Backed Administrator Security & Credentials Card (Admins Only) */}
                {isAdmin && (
                  <>
                    <div
                      className="settings-account-card"
                      style={{
                        marginTop: "20px",

                        border: "1px solid rgba(168, 85, 247, 0.35)",

                        background: "rgba(168, 85, 247, 0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",

                          justifyContent: "space-between",

                          alignItems: "flex-start",

                          flexWrap: "wrap",

                          gap: "10px",
                        }}
                      >
                        <div>
                          <h3
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              margin: 0,
                            }}
                          >
                            <Database size={17} color="#00C9B7" />
                            <span>Administrator Security & Database</span>
                          </h3>
                          <p
                            style={{
                              fontSize: "12px",
                              color: "var(--muted)",
                              margin: "4px 0 0 0",
                            }}
                          >
                            Modify root administrator email, name, or password
                            at any time. All updates are automatically saved to
                            the database.
                          </p>
                        </div>
                        <div
                          style={{
                            display: "inline-flex",

                            alignItems: "center",

                            gap: "6px",

                            padding: "4px 10px",

                            borderRadius: "12px",

                            fontSize: "11px",

                            fontWeight: 600,

                            background: "rgba(16, 185, 129, 0.12)",

                            color: "#10b981",

                            border: "1px solid rgba(16, 185, 129, 0.3)",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",

                              height: "6px",

                              borderRadius: "50%",

                              background: "#10b981",
                            }}
                          />
                          Database: Disk DB & IndexedDB
                        </div>
                      </div>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault()

                          setAdminSaveLoading(true)

                          setAdminSaveMessage(null)

                          try {
                            if (
                              adminNewPassword &&
                              adminNewPassword !== adminConfirmPassword
                            ) {
                              throw new Error(
                                "New password and confirmation do not match.",
                              )
                            }

                            if (
                              adminNewPassword &&
                              adminNewPassword.length < 8
                            ) {
                              throw new Error(
                                "New password must be at least 8 characters long.",
                              )
                            }

                            const result = await updateAdminSettings({
                              newName: adminEditName,

                              newEmail: adminEditEmail,

                              currentPassword: adminCurrentPassword,

                              newPassword: adminNewPassword || undefined,

                              overrideAuthCheck: isAdmin,
                            })

                            setAdminSaveMessage({
                              type: "success",
                              text: result.message,
                            })

                            notify(
                              "Admin credentials successfully saved to database!",
                              "success",
                            )

                            setAdminCurrentPassword("")

                            setAdminNewPassword("")

                            setAdminConfirmPassword("")
                          } catch (err: any) {
                            setAdminSaveMessage({
                              type: "error",

                              text:
                                err.message ||
                                "Failed to update admin credentials.",
                            })

                            notify(
                              err.message ||
                                "Failed to update admin credentials.",
                              "error",
                            )
                          } finally {
                            setAdminSaveLoading(false)
                          }
                        }}
                        style={{
                          marginTop: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <label
                              style={{
                                fontSize: "11.5px",

                                color: "var(--muted)",

                                display: "block",

                                marginBottom: "4px",
                              }}
                            >
                              Administrator Display Name
                            </label>
                            <input
                              required
                              type="text"
                              value={adminEditName}
                              onChange={(e) => setAdminEditName(e.target.value)}
                              placeholder="e.g. Masterfile Pro Administrator"
                              style={{
                                width: "100%",

                                padding: "8px 10px",

                                fontSize: "12.5px",

                                borderRadius: "6px",

                                background: "var(--bg)",

                                border: "1px solid var(--border)",

                                color: "var(--text)",
                              }}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: "11.5px",

                                color: "var(--muted)",

                                display: "block",

                                marginBottom: "4px",
                              }}
                            >
                              Administrator Email Address
                            </label>
                            <input
                              required
                              type="email"
                              value={adminEditEmail}
                              onChange={(e) =>
                                setAdminEditEmail(e.target.value)
                              }
                              placeholder="e.g. admin@masterfilepro.com"
                              style={{
                                width: "100%",

                                padding: "8px 10px",

                                fontSize: "12.5px",

                                borderRadius: "6px",

                                background: "var(--bg)",

                                border: "1px solid var(--border)",

                                color: "var(--text)",
                              }}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <label
                              style={{
                                fontSize: "11.5px",

                                color: "var(--muted)",

                                display: "block",

                                marginBottom: "4px",
                              }}
                            >
                              New Password (optional)
                            </label>
                            <input
                              type={adminShowPass ? "text" : "password"}
                              value={adminNewPassword}
                              onChange={(e) =>
                                setAdminNewPassword(e.target.value)
                              }
                              placeholder="Leave blank to keep current"
                              style={{
                                width: "100%",

                                padding: "8px 10px",

                                fontSize: "12.5px",

                                borderRadius: "6px",

                                background: "var(--bg)",

                                border: "1px solid var(--border)",

                                color: "var(--text)",
                              }}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: "11.5px",

                                color: "var(--muted)",

                                display: "block",

                                marginBottom: "4px",
                              }}
                            >
                              Confirm New Password
                            </label>
                            <input
                              type={adminShowPass ? "text" : "password"}
                              value={adminConfirmPassword}
                              onChange={(e) =>
                                setAdminConfirmPassword(e.target.value)
                              }
                              placeholder="Re-type new password"
                              style={{
                                width: "100%",

                                padding: "8px 10px",

                                fontSize: "12.5px",

                                borderRadius: "6px",

                                background: "var(--bg)",

                                border: "1px solid var(--border)",

                                color: "var(--text)",
                              }}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",

                            justifyContent: "space-between",

                            alignItems: "center",

                            marginTop: "4px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setAdminShowPass(!adminShowPass)}
                            style={{
                              background: "none",

                              border: "none",

                              color: "var(--muted)",

                              cursor: "pointer",

                              fontSize: "11.5px",

                              display: "inline-flex",

                              alignItems: "center",

                              gap: "4px",

                              padding: 0,
                            }}
                          >
                            {adminShowPass ? (
                              <EyeOff size={13} />
                            ) : (
                              <Eye size={13} />
                            )}
                            {adminShowPass
                              ? "Hide Passwords"
                              : "Show Passwords"}
                          </button>

                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="submit"
                              disabled={adminSaveLoading}
                              className="primary"
                              style={{
                                fontSize: "12px",

                                padding: "7px 16px",

                                borderRadius: "6px",

                                display: "inline-flex",

                                alignItems: "center",

                                gap: "6px",
                              }}
                            >
                              <Save size={13} />
                              {adminSaveLoading
                                ? "Saving to Database..."
                                : "Save Admin Credentials"}
                            </button>
                          </div>
                        </div>

                        {adminSaveMessage && (
                          <div
                            style={{
                              marginTop: "8px",

                              padding: "8px 12px",

                              borderRadius: "6px",

                              fontSize: "12px",

                              background:
                                adminSaveMessage.type === "success"
                                  ? "rgba(16, 185, 129, 0.12)"
                                  : "rgba(239, 68, 68, 0.12)",

                              border: `1px solid ${
                                adminSaveMessage.type === "success"
                                  ? "rgba(16, 185, 129, 0.3)"
                                  : "rgba(239, 68, 68, 0.3)"
                              }`,

                              color:
                                adminSaveMessage.type === "success"
                                  ? "#10b981"
                                  : "#ef4444",
                            }}
                          >
                            {adminSaveMessage.text}
                          </div>
                        )}
                      </form>
                    </div>

                    {/* PDF & Cloud APIs Priority Card */}
                    <div
                      style={{
                        background: "var(--surface)",

                        border: "1px solid var(--border)",

                        borderRadius: "12px",

                        padding: "20px 24px",

                        marginBottom: "24px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",

                          alignItems: "center",

                          justifyContent: "space-between",

                          marginBottom: "10px",

                          flexWrap: "wrap",

                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <Cpu size={18} color="#00C9B7" />
                          <h2 style={{ margin: 0, fontSize: "16px" }}>
                            PDF & Cloud APIs Failover Pipeline
                          </h2>
                        </div>
                        <span
                          style={{
                            fontSize: "11px",

                            padding: "3px 8px",

                            borderRadius: "12px",

                            background: "rgba(16, 185, 129, 0.15)",

                            color: "#10b981",

                            fontWeight: 600,
                          }}
                        >
                          Priority Failover Active
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                          margin: "0 0 14px 0",
                          lineHeight: 1.5,
                        }}
                      >
                        Masterfile Pro dynamically processes PDF compressions
                        and conversions through a multi-engine priority
                        pipeline: <strong>Priority #1 Adobe Acrobat</strong> ➔{" "}
                        <strong>Priority #2 iLovePDF</strong> ➔{" "}
                        <strong>Priority #3 Local WebAssembly Engine</strong>.
                        If monthly credits run out or an API error occurs,
                        requests fail over automatically with zero user
                        interruption.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate("admin-apis")}
                        style={{
                          fontSize: "12px",

                          padding: "8px 14px",

                          borderRadius: "6px",

                          background: "rgba(0, 201, 183, 0.15)",

                          color: "#00C9B7",

                          border: "1px solid rgba(0, 201, 183, 0.3)",

                          fontWeight: 600,

                          cursor: "pointer",

                          display: "inline-flex",

                          alignItems: "center",

                          gap: "6px",
                        }}
                      >
                        <Cpu size={14} /> Configure PDF API Priorities in Admin
                        Panel →
                      </button>
                    </div>
                  </>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault()

                    persist("fluxkit-name", profile.trim() || "Jamie")

                    setSaved(true)

                    notify("Preferences saved in this browser.", "success")
                  }}
                >
                  <h2>Personal profile</h2>
                  <label>
                    First name
                    <input
                      required
                      maxLength={40}
                      value={profile}
                      onChange={(e) => {
                        setProfile(e.target.value)

                        setSaved(false)
                      }}
                    />
                  </label>
                  <label>
                    Appearance
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </label>
                  <p>
                    Preferences stay in this browser. Files and document
                    contents are never saved to local storage.
                  </p>
                  <button className="primary">Save preferences</button>
                  {saved && (
                    <span className="save-confirmation" role="status">
                      Preferences saved.
                    </span>
                  )}
                </form>
              </div>
            </div>
          ) : page === "admin" ||
            page === "admin-integrations" ||
            page === "admin-apis" ? (
            <AdminPanel
              currentUser={currentUser}
              navigate={navigate}
              initialTab={
                page === "admin-apis"
                  ? "apis"
                  : page === "admin-integrations"
                    ? "integrations"
                    : "tiers"
              }
            />
          ) : customPage ? (
            <div
              className="page-enter custom-page-view"
              style={{ maxWidth: "800px", margin: "20px auto" }}
            >
              <div className="eyebrow">CUSTOM PAGE</div>
              <h1>{customPage.title}</h1>
              {customPage.description && (
                <p className="page-subtitle">{customPage.description}</p>
              )}
              <div
                className="panel"
                style={{
                  marginTop: "20px",

                  padding: "24px",

                  lineHeight: 1.8,

                  fontSize: "14px",

                  whiteSpace: "pre-wrap",
                }}
              >
                {customPage.content}
              </div>
            </div>
          ) : page === "audio-text" ? (
            !canUserAccessTool("audio-text", currentUser) ? (
              <ProActivationModal
                tool={tools.find((t) => t.id === "audio-text")!}
                currentUser={currentUser}
                onActivated={(upgraded) => {
                  setCurrentUser(upgraded)
                }}
                onNavigate={navigate}
              />
            ) : (
              <AudioToText
                key={`${page}-${stagedFiles[0]?.name || "empty"}`}
                initialFile={stagedFiles[0]}
                onComplete={() =>
                  setActivity((a) => [
                    {
                      name: "Audio to Text",

                      time: new Date().toLocaleTimeString([], {
                        hour: "2-digit",

                        minute: "2-digit",
                      }),
                    },

                    ...a,
                  ])
                }
              />
            )
          ) : page === "visitor-pass" ? (
            !canUserAccessTool("visitor-pass", currentUser) ? (
              <ProActivationModal
                tool={tools.find((t) => t.id === "visitor-pass")!}
                currentUser={currentUser}
                onActivated={(upgraded) => {
                  setCurrentUser(upgraded)
                }}
                onNavigate={navigate}
              />
            ) : (
              <VisitorPassStudio
                navigate={navigate}
                onComplete={() =>
                  setActivity((a) => [
                    {
                      name: "Visitor Pass & Badges",

                      time: new Date().toLocaleTimeString([], {
                        hour: "2-digit",

                        minute: "2-digit",
                      }),
                    },

                    ...a,
                  ])
                }
              />
            )
          ) : selected?.available ? (
            !canUserAccessTool(selected.id, currentUser) ? (
              <ProActivationModal
                tool={selected}
                currentUser={currentUser}
                onActivated={(upgraded) => {
                  setCurrentUser(upgraded)
                }}
                onNavigate={navigate}
              />
            ) : (
              <ToolPage
                key={`${page}-${stagedFiles.map((f) => f.name).join(",") || "empty"}`}
                tool={selected}
                initialFiles={stagedFiles}
                navigate={navigate}
                onComplete={(name) =>
                  setActivity((a) => [
                    {
                      name,

                      time: new Date().toLocaleTimeString([], {
                        hour: "2-digit",

                        minute: "2-digit",
                      }),
                    },

                    ...a,
                  ])
                }
              />
            )
          ) : page === "help" ? (
            <div className="page-enter">
              <button className="text-button" onClick={() => navigate("all")}>
                <ChevronLeft size={16} /> Back to tools
              </button>
              <section className="panel coming-soon">
                <span className="coming-icon">
                  <HelpCircle size={34} />
                </span>
                <span className="eyebrow">A LITTLE GUIDANCE</span>
                <h1>Help & resources</h1>
                <p>
                  QR generation, PDF merging, and text-to-PDF run in your
                  browser. Audio to Text requires a transcription backend. PDF
                  uploads are limited to 25 MB each; encrypted or damaged PDFs
                  may not be supported. Authentication and document storage are
                  not connected.
                </p>
                <button className="primary" onClick={() => navigate("all")}>
                  Explore tools <ArrowRight size={16} />
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    notify(
                      "Feedback delivery is not connected yet. No message has been sent.",
                    )
                  }
                >
                  Share feedback <HelpCircle size={15} />
                </button>
              </section>
            </div>
          ) : (
            <section className="panel coming-soon page-enter">
              <div className="eyebrow">404 · A SMALL DETOUR</div>
              <h1>This page isn’t in the toolkit.</h1>
              <p>
                The link may be outdated. Your next useful tool is still right
                here.
              </p>
              <button className="primary" onClick={() => navigate("overview")}>
                Back to workspace <ArrowRight size={16} />
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
