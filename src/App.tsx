import { useEffect, useState, useRef } from "react"
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
  CreditCard,
  FileText,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  Plus,
  QrCode,
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
import { canUserAccessTool } from "./adminService"
import {
  getCustomPageBySlug,
  getPublishedCustomPages,
} from "./pageManagerService"
import AdminPanel from "./AdminPanel"
import ProActivationModal from "./ProActivationModal"
import { GoogleIcon } from "./GoogleAuth"

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
    if (initialUser?.role === "admin") {
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

  useEffect(() => {
    return onAuthStateChanged((user) => {
      setCurrentUser(user)
      if (user?.name) {
        setProfile(user.name.split(" ")[0])
      }
    })
  }, [])
  useEffect(() => {
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
    document.title = `${brand.name} — Your everyday, upgraded`
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

  // Continuously record scroll position of the active page
  useEffect(() => {
    if (typeof window === "undefined") return
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentY =
            window.scrollY || document.documentElement.scrollTop || 0
          pageScrollPositions.current.set(page, currentY)
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
      window.scrollTo({ top: 0, behavior: "instant" })
    } else {
      const savedY = pageScrollPositions.current.get(page)
      if (typeof savedY === "number" && savedY > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: savedY, behavior: "instant" })
          })
        })
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
  const filtered = tools.filter(
    (t) =>
      (category
        ? t.category === category
        : filter === "All tools" || t.category === filter) &&
      `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase()),
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
          if (user.role === "admin") {
            navigate("admin")
          } else {
            navigate("overview")
          }
        }}
      />
    )
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
        <button
          className="brand"
          onClick={() =>
            navigate(currentUser?.role === "admin" ? "admin" : "overview")
          }
        >
          <span className="brand-mark">
            <Zap size={23} fill="currentColor" />
          </span>
          <span>
            {brand.name}
            <span className="brand-period">.</span>
          </span>
          <span className="workspace-badge">
            {currentUser?.role === "admin" ? "ADMIN" : "WORKSPACE"}
          </span>
        </button>
        <button
          className="workspace-switch"
          onClick={() => {
            if (currentUser?.role === "admin") {
              navigate("admin")
            } else {
              navigate("settings")
            }
          }}
        >
          <span
            className="workspace-avatar"
            style={
              currentUser?.role === "admin"
                ? { background: "#a855f7", color: "#ffffff" }
                : undefined
            }
          >
            {currentUser ? currentUser.name.slice(0, 1).toUpperCase() : "J"}
          </span>
          <span>
            {currentUser
              ? `${currentUser.name.split(" ")[0]}'s workspace`
              : "Personal workspace"}
            <small>
              {currentUser?.role === "admin"
                ? "Administrator (Full Access)"
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
          {currentUser?.role === "admin" && (
            <>
              <div className="nav-label">ADMINISTRATION</div>
              <button
                key="admin"
                className={page === "admin" ? "active" : ""}
                onClick={() => navigate("admin")}
                style={{ color: "#a855f7", fontWeight: 600 }}
              >
                <ShieldCheck size={18} />
                <span>Admin Portal</span>
              </button>
              <button
                key="admin-integrations"
                className={page === "admin-integrations" ? "active" : ""}
                onClick={() => navigate("admin-integrations")}
                style={{ color: "#0ea5e9", fontWeight: 600 }}
              >
                <CreditCard size={18} />
                <span>Payment & APIs</span>
              </button>
              <div className="nav-divider" />
            </>
          )}

          <div className="nav-label">
            {currentUser?.role === "admin" ? "WORKSTATION" : "WORKSPACE"}
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
              {currentUser?.role === "admin"
                ? "Admin & Tools Ready."
                : "A little less busywork."}
            </h3>
            <p>
              {currentUser?.role === "admin"
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
              currentUser?.role === "admin"
                ? navigate("admin")
                : navigate("settings")
            }
          >
            <span
              className="avatar"
              style={
                currentUser?.role === "admin"
                  ? { background: "#a855f7", color: "#ffffff" }
                  : undefined
              }
            >
              {currentUser
                ? currentUser.name.slice(0, 1).toUpperCase()
                : `${profile.slice(0, 1).toUpperCase()}D`}
            </span>
            <span>
              {currentUser ? currentUser.name : `${profile} Davis`}
              <small>
                {currentUser ? currentUser.email : "Personal account"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
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
            {currentUser?.role === "admin" && (
              <button
                type="button"
                onClick={() => navigate("admin")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 12px",
                  borderRadius: "20px",
                  background: "rgba(168, 85, 247, 0.12)",
                  color: "#a855f7",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "1px solid rgba(168, 85, 247, 0.25)",
                  cursor: "pointer",
                }}
                title="Open Admin Dashboard"
              >
                <ShieldCheck size={14} />
                <span>Admin Console</span>
              </button>
            )}
            <div className="top-divider" />
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
                  ? currentUser.name.slice(0, 1).toUpperCase()
                  : `${profile.slice(0, 1).toUpperCase()}D`}
              </button>
              {menu && (
                <div className="popover popover-user">
                  <div className="popover-user-header">
                    <span className="avatar">
                      {currentUser
                        ? currentUser.name.slice(0, 1).toUpperCase()
                        : `${profile.slice(0, 1).toUpperCase()}D`}
                    </span>
                    <div className="popover-user-meta">
                      <strong>
                        {currentUser
                          ? currentUser.name
                          : `${profile}'s workspace`}
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
                            : "FluxKit Account Active"}
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
                  {currentUser?.role === "admin" ? (
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
        <main id="main-content" tabIndex={-1}>
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
                      <GoogleIcon size={16} /> Connected Google Account
                    </h3>
                    <div className="settings-account-row">
                      <span>Account Name</span>
                      <strong>{currentUser.name}</strong>
                    </div>
                    <div className="settings-account-row">
                      <span>Gmail Address</span>
                      <span className="settings-account-badge">
                        <ShieldCheck size={13} /> {currentUser.email}
                      </span>
                    </div>
                    <div className="settings-account-row">
                      <span>Account ID</span>
                      <code>{currentUser.id}</code>
                    </div>
                    <div className="settings-account-row">
                      <span>Status</span>
                      <span className="live-badge">Verified</span>
                    </div>
                    <button
                      type="button"
                      className="settings-signout-btn"
                      onClick={() => {
                        signOut()
                        setCurrentUser(null)
                        notify("Signed out of Google account.")
                      }}
                    >
                      Sign out of Google <LogOut size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="settings-account-card">
                    <h3>Guest Mode (Local Only)</h3>
                    <p>
                      Sign in with your Gmail account to create your personal
                      account, sync your preferences, and access your workspace
                      seamlessly.
                    </p>
                    <button
                      type="button"
                      className="google-direct-btn"
                      style={{ width: "fit-content", marginTop: "12px" }}
                      onClick={() => navigate("sign-in")}
                    >
                      <GoogleIcon size={18} />
                      <span>Sign in with Google</span>
                    </button>
                  </div>
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
          ) : page === "admin" || page === "admin-integrations" ? (
            <AdminPanel
              currentUser={currentUser}
              navigate={navigate}
              initialTab={
                page === "admin-integrations" ? "integrations" : "tiers"
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
