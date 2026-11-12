import React, { useState, useEffect } from "react"
import {
  ShieldAlert,
  SlidersHorizontal,
  Users,
  FileCode2,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  Search,
  Lock,
  Unlock,
  Check,
  CreditCard,
  Key,
  Globe,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import type { UserAccount } from "./authService"
import {
  getAllToolTiers,
  setToolTier,
  getAllUsers,
  approveProSubscription,
  revokeProSubscription,
  updateUserRole,
} from "./adminService"
import {
  getCustomPages,
  createCustomPage,
  updateCustomPage,
  deleteCustomPage,
  type CustomPage,
} from "./pageManagerService"
import {
  getAllGateways,
  saveGateway,
  setActiveGateway,
  getActiveGateway,
  testGatewayConnection,
  type PaymentGatewayConfig,
  type PaymentProvider,
} from "./paymentIntegrationService"
import { tools } from "./config"

export interface AdminPanelProps {
  currentUser: UserAccount | null
  navigate: (id: string) => void
  initialTab?: "tiers" | "users" | "pages" | "integrations"
}

export default function AdminPanel({
  currentUser,
  navigate,
  initialTab,
}: AdminPanelProps) {
  // Check access: only users with role === 'admin' can access
  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div
        className="panel coming-soon page-enter"
        style={{
          maxWidth: "560px",
          margin: "60px auto",
          textAlign: "center",
          padding: "40px 24px",
        }}
      >
        <div
          style={{
            color: "#ef4444",
            marginBottom: "16px",
            display: "grid",
            placeItems: "center",
          }}
        >
          <ShieldAlert size={48} />
        </div>
        <div className="eyebrow" style={{ color: "#ef4444" }}>
          403 · RESTRICTED ACCESS
        </div>
        <h1 style={{ fontSize: "24px", margin: "10px 0" }}>Access Denied</h1>
        <p
          style={{
            color: "var(--muted)",
            fontSize: "13px",
            lineHeight: 1.6,
            maxWidth: "420px",
            margin: "0 auto 20px",
          }}
        >
          Administrator privileges are required to view the management console.
          Please sign in with an authorized administrator account
          (`admin@fluxkit.com`).
        </p>
        <button className="primary" onClick={() => navigate("sign-in")}>
          Sign in as Admin
        </button>
      </div>
    )
  }

  const [activeTab, setActiveTab] = useState<
    "tiers" | "users" | "pages" | "integrations"
  >(initialTab || "tiers")
  const [toolTiers, setToolTiers] =
    useState<Record<string, "standard" | "pro">>(getAllToolTiers)
  const [userList, setUserList] = useState<UserAccount[]>(getAllUsers)
  const [customPages, setCustomPages] = useState<CustomPage[]>(getCustomPages)
  const [gateways, setGateways] = useState<PaymentGatewayConfig[]>(getAllGateways)
  const [activeGatewayId, setActiveGatewayId] = useState<PaymentProvider>(
    () => getActiveGateway()?.id || "paystack",
  )
  const [testingGatewayId, setTestingGatewayId] = useState<string | null>(null)
  const [showSecretKey, setShowSecretKey] = useState<Record<string, boolean>>({})
  const [toolQuery, setToolQuery] = useState("")
  const [toastMessage, setToastMessage] = useState("")

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // Page Editor State
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [pageForm, setPageForm] = useState({
    slug: "",
    title: "",
    navTitle: "",
    description: "",
    content: "",
    showInNav: true,
    status: "published" as "published" | "draft",
  })
  const [pageError, setPageError] = useState("")

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(""), 3500)
  }

  const handleTierToggle = (toolId: string) => {
    const current = toolTiers[toolId] || "standard"
    const next = current === "pro" ? "standard" : "pro"
    setToolTier(toolId, next)
    setToolTiers({ ...toolTiers, [toolId]: next })
    showToast(`Tool '${toolId}' updated to ${next.toUpperCase()} tier.`)
  }

  const handleApprovePro = (userId: string) => {
    approveProSubscription(userId)
    setUserList(getAllUsers())
    showToast("User subscription successfully approved.")
  }

  const handleRevokePro = (userId: string) => {
    revokeProSubscription(userId)
    setUserList(getAllUsers())
    showToast("User subscription reverted to standard.")
  }

  const handleRoleToggle = (userId: string, currentRole: "admin" | "user") => {
    const nextRole = currentRole === "admin" ? "user" : "admin"
    updateUserRole(userId, nextRole)
    setUserList(getAllUsers())
    showToast(`User role updated to ${nextRole.toUpperCase()}.`)
  }

  // Payment Gateway Handlers
  const handleToggleGatewayEnabled = (id: PaymentProvider) => {
    const gw = gateways.find((g) => g.id === id)
    if (!gw) return
    const updated = { ...gw, enabled: !gw.enabled }
    saveGateway(updated)
    setGateways(getAllGateways())
    showToast(`${gw.name} is now ${updated.enabled ? "ACTIVE" : "DISABLED"}.`)
  }

  const handleToggleGatewayMode = (id: PaymentProvider) => {
    const gw = gateways.find((g) => g.id === id)
    if (!gw) return
    const nextMode: "test" | "live" = gw.mode === "test" ? "live" : "test"
    const updated = { ...gw, mode: nextMode }
    saveGateway(updated)
    setGateways(getAllGateways())
    showToast(`${gw.name} switched to ${nextMode.toUpperCase()} mode.`)
  }

  const handleUpdateGatewayField = (
    id: PaymentProvider,
    field: keyof PaymentGatewayConfig,
    value: any,
  ) => {
    const gw = gateways.find((g) => g.id === id)
    if (!gw) return
    const updated = { ...gw, [field]: value }
    saveGateway(updated)
    setGateways(getAllGateways())
  }

  const handleSetPrimaryGateway = (id: PaymentProvider) => {
    setActiveGateway(id)
    setActiveGatewayId(id)
    setGateways(getAllGateways())
    showToast(`Primary checkout gateway set to ${id.toUpperCase()}.`)
  }

  const handleTestGateway = async (id: PaymentProvider) => {
    setTestingGatewayId(id)
    try {
      const result = await testGatewayConnection(id)
      setGateways(getAllGateways())
      if (result.success) {
        showToast(result.message)
      } else {
        showToast(`Test failed: ${result.message}`)
      }
    } finally {
      setTestingGatewayId(null)
    }
  }

  // Page Manager Handlers
  const handleSavePage = (e: React.FormEvent) => {
    e.preventDefault()
    setPageError("")
    try {
      if (editingPageId) {
        updateCustomPage(editingPageId, pageForm)
        showToast("Page updated successfully.")
      } else {
        createCustomPage(pageForm)
        showToast("New page created and route registered.")
      }
      setCustomPages(getCustomPages())
      setEditingPageId(null)
      setPageForm({
        slug: "",
        title: "",
        navTitle: "",
        description: "",
        content: "",
        showInNav: true,
        status: "published",
      })
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to save page")
    }
  }

  const handleDeletePage = (id: string, slug: string) => {
    if (
      typeof window !== "undefined" &&
      window.confirm &&
      !window.confirm(`Delete page '/${slug}'?`)
    ) {
      return
    }
    deleteCustomPage(id)
    setCustomPages(getCustomPages())
    showToast(`Page '/${slug}' deleted.`)
  }

  const handleStartEdit = (page: CustomPage) => {
    setEditingPageId(page.id)
    setPageForm({
      slug: page.slug,
      title: page.title,
      navTitle: page.navTitle || page.title,
      description: page.description || "",
      content: page.content,
      showInNav: page.showInNav,
      status: page.status,
    })
  }

  const proCount = Object.values(toolTiers).filter((t) => t === "pro").length
  const filteredTools = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(toolQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(toolQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(toolQuery.toLowerCase()),
  )

  return (
    <div
      className="page-enter admin-console"
      style={{ maxWidth: "1080px", margin: "0 auto", paddingBottom: "60px" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
        }}
      >
        <div>
          <div className="eyebrow" style={{ color: "#a855f7" }}>
            CONTROL PANEL
          </div>
          <h1 style={{ fontSize: "28px", marginTop: "4px" }}>
            Administrator Dashboard
          </h1>
          <p className="page-subtitle">
            Manage tool subscription tiers, user Pro activations, and dynamic
            custom page routes.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontSize: "11px",
              padding: "4px 8px",
              borderRadius: "4px",
              background: "rgba(168,85,247,0.15)",
              color: "#a855f7",
              fontWeight: 600,
            }}
          >
            Admin: {currentUser.email}
          </span>
        </div>
      </div>

      {toastMessage && (
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(16,185,129,0.15)",
            border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: "8px",
            color: "#10b981",
            fontSize: "12px",
            fontWeight: 500,
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Check size={16} /> {toastMessage}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--border)",
          marginBottom: "24px",
        }}
      >
        <button
          className={activeTab === "tiers" ? "selected" : ""}
          style={{
            padding: "10px 16px",
            borderBottom: activeTab === "tiers" ? "2px solid #a855f7" : "none",
            color: activeTab === "tiers" ? "var(--text)" : "var(--muted)",
            fontWeight: 600,
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
          onClick={() => setActiveTab("tiers")}
        >
          <SlidersHorizontal size={16} /> Tool Tier Manager ({proCount} Pro)
        </button>
        <button
          className={activeTab === "users" ? "selected" : ""}
          style={{
            padding: "10px 16px",
            borderBottom: activeTab === "users" ? "2px solid #a855f7" : "none",
            color: activeTab === "users" ? "var(--text)" : "var(--muted)",
            fontWeight: 600,
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
          onClick={() => setActiveTab("users")}
        >
          <Users size={16} /> User Approvals ({userList.length})
        </button>
        <button
          className={activeTab === "pages" ? "selected" : ""}
          style={{
            padding: "10px 16px",
            borderBottom: activeTab === "pages" ? "2px solid #a855f7" : "none",
            color: activeTab === "pages" ? "var(--text)" : "var(--muted)",
            fontWeight: 600,
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
          onClick={() => setActiveTab("pages")}
        >
          <FileCode2 size={16} /> Page Manager ({customPages.length})
        </button>
        <button
          className={activeTab === "integrations" ? "selected" : ""}
          style={{
            padding: "10px 16px",
            borderBottom:
              activeTab === "integrations" ? "2px solid #a855f7" : "none",
            color:
              activeTab === "integrations" ? "var(--text)" : "var(--muted)",
            fontWeight: 600,
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
          onClick={() => setActiveTab("integrations")}
        >
          <CreditCard size={16} /> Payment & APIs (
          {gateways.filter((g) => g.enabled).length} Active)
        </button>
      </div>

      {/* TAB 1: TOOL TIER MANAGER */}
      {activeTab === "tiers" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <p style={{ fontSize: "12px", color: "var(--muted)" }}>
              Toggle any tool to <strong>PRO</strong> to place it behind the
              activation paywall, or leave as <strong>STANDARD</strong> for
              immediate free access.
            </p>
            <div style={{ position: "relative", width: "240px" }}>
              <input
                type="text"
                placeholder="Filter tools..."
                value={toolQuery}
                onChange={(e) => setToolQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 12px 6px 30px",
                  fontSize: "12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--text)",
                }}
              />
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "9px",
                  color: "var(--muted)",
                }}
              />
            </div>
          </div>

          <div className="panel" style={{ padding: "0", overflow: "hidden" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    Tool
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    Category
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    Current Tier
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                      textAlign: "right",
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTools.map((t) => {
                  const isPro = (toolTiers[t.id] || "standard") === "pro"
                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        transition: "background 0.15s",
                      }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <small style={{ color: "var(--muted)" }}>#{t.id}</small>
                      </td>
                      <td
                        style={{ padding: "12px 16px", color: "var(--muted)" }}
                      >
                        {t.category}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: isPro
                              ? "rgba(168,85,247,0.15)"
                              : "rgba(59,130,246,0.15)",
                            color: isPro ? "#a855f7" : "#3b82f6",
                          }}
                        >
                          {isPro ? <Lock size={12} /> : <Unlock size={12} />}
                          {isPro ? "PRO" : "STANDARD"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button
                          className="secondary"
                          style={{
                            padding: "5px 12px",
                            fontSize: "11px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            background: isPro
                              ? "rgba(59,130,246,0.1)"
                              : "rgba(168,85,247,0.1)",
                            color: isPro ? "#3b82f6" : "#a855f7",
                          }}
                          onClick={() => handleTierToggle(t.id)}
                        >
                          {isPro ? "Demote to Standard" : "Promote to Pro"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: USER APPROVALS */}
      {activeTab === "users" && (
        <div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Review registered accounts, grant/revoke Pro tier activations, and
            assign administrator roles.
          </p>
          <div className="panel" style={{ padding: "0", overflow: "hidden" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    User
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    Role
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    Pro Status
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                      textAlign: "right",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {userList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "24px",
                        textAlign: "center",
                        color: "var(--muted)",
                      }}
                    >
                      No registered user accounts found yet.
                    </td>
                  </tr>
                ) : (
                  userList.map((u) => {
                    const isProActive =
                      u.subscriptionTier === "pro" && u.proStatus === "active"
                    const isPending = u.proStatus === "pending"
                    return (
                      <tr
                        key={u.id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>
                          <small style={{ color: "var(--muted)" }}>
                            {u.email}
                          </small>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: 600,
                              background:
                                u.role === "admin"
                                  ? "rgba(234,179,8,0.15)"
                                  : "var(--surface)",
                              color:
                                u.role === "admin" ? "#eab308" : "var(--muted)",
                            }}
                          >
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background: isProActive
                                ? "rgba(16,185,129,0.15)"
                                : isPending
                                  ? "rgba(234,179,8,0.15)"
                                  : "var(--surface)",
                              color: isProActive
                                ? "#10b981"
                                : isPending
                                  ? "#eab308"
                                  : "var(--muted)",
                            }}
                          >
                            {isProActive
                              ? "ACTIVE PRO"
                              : isPending
                                ? "PENDING APPROVAL"
                                : "STANDARD"}
                          </span>
                        </td>
                        <td
                          style={{ padding: "12px 16px", textAlign: "right" }}
                        >
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            {isProActive ? (
                              <button
                                className="secondary"
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border)",
                                }}
                                onClick={() => handleRevokePro(u.id)}
                              >
                                Revoke Pro
                              </button>
                            ) : (
                              <button
                                className="primary"
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  borderRadius: "4px",
                                }}
                                onClick={() => handleApprovePro(u.id)}
                              >
                                Approve Pro
                              </button>
                            )}
                            <button
                              className="secondary"
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                border: "1px solid var(--border)",
                              }}
                              onClick={() => handleRoleToggle(u.id, u.role)}
                            >
                              {u.role === "admin" ? "Make User" : "Make Admin"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PAGE MANAGER */}
      {activeTab === "pages" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          {/* List of Custom Pages */}
          <div>
            <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>
              Custom Pages
            </h3>
            <div className="panel" style={{ padding: "0", overflow: "hidden" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                  fontWeight: 600,
                  fontSize: "12px",
                  color: "var(--muted)",
                }}
              >
                Published &amp; Draft Pages
              </div>
              {customPages.length === 0 ? (
                <div
                  style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: "12px",
                  }}
                >
                  No custom pages created yet. Use the editor to add your first
                  page.
                </div>
              ) : (
                customPages.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>
                        {p.title}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--muted)",
                          display: "flex",
                          gap: "8px",
                          marginTop: "2px",
                        }}
                      >
                        <span>/{p.slug}</span>
                        {p.showInNav && (
                          <span style={{ color: "#a855f7" }}>• In Sidebar</span>
                        )}
                        <span>• {p.status}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className="icon-button"
                        title="View page"
                        onClick={() => navigate(p.slug)}
                        style={{ padding: "6px" }}
                      >
                        <ExternalLink size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title="Edit page"
                        onClick={() => handleStartEdit(p)}
                        style={{ padding: "6px" }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title="Delete page"
                        onClick={() => handleDeletePage(p.id, p.slug)}
                        style={{ padding: "6px", color: "#ef4444" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Create / Edit Form */}
          <div>
            <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>
              {editingPageId ? "Edit Custom Page" : "Create New Custom Page"}
            </h3>
            <form
              className="panel"
              onSubmit={handleSavePage}
              style={{ padding: "20px" }}
            >
              {pageError && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: "6px",
                    color: "#ef4444",
                    fontSize: "12px",
                    marginBottom: "12px",
                  }}
                >
                  {pageError}
                </div>
              )}

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginBottom: "4px",
                  }}
                >
                  URL Route Slug (e.g. "developer-guide", "terms")
                </label>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span
                    style={{
                      padding: "8px 10px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRight: "none",
                      borderRadius: "6px 0 0 6px",
                      color: "var(--muted)",
                      fontSize: "12px",
                    }}
                  >
                    #
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="my-new-page"
                    value={pageForm.slug}
                    onChange={(e) =>
                      setPageForm({ ...pageForm, slug: e.target.value })
                    }
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "0 6px 6px 0",
                      color: "var(--text)",
                      fontSize: "12px",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginBottom: "4px",
                  }}
                >
                  Page Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="Platform Documentation"
                  value={pageForm.title}
                  onChange={(e) =>
                    setPageForm({ ...pageForm, title: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text)",
                    fontSize: "12px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginBottom: "4px",
                  }}
                >
                  Navigation Label (Sidebar)
                </label>
                <input
                  type="text"
                  placeholder="Docs"
                  value={pageForm.navTitle}
                  onChange={(e) =>
                    setPageForm({ ...pageForm, navTitle: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text)",
                    fontSize: "12px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginBottom: "4px",
                  }}
                >
                  Page Content (Markdown / Text)
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="# Welcome to our platform documentation..."
                  value={pageForm.content}
                  onChange={(e) =>
                    setPageForm({ ...pageForm, content: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text)",
                    fontSize: "12px",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              <div
                style={{ display: "flex", gap: "16px", marginBottom: "18px" }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={pageForm.showInNav}
                    onChange={(e) =>
                      setPageForm({ ...pageForm, showInNav: e.target.checked })
                    }
                  />
                  Show in Sidebar Navigation
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <select
                    value={pageForm.status}
                    onChange={(e) =>
                      setPageForm({
                        ...pageForm,
                        status: e.target.value as "published" | "draft",
                      })
                    }
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontSize: "11px",
                      padding: "3px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="submit"
                  className="primary"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {editingPageId ? "Update Page" : "Create Page"}
                </button>
                {editingPageId && (
                  <button
                    type="button"
                    className="secondary text-button"
                    onClick={() => {
                      setEditingPageId(null)
                      setPageForm({
                        slug: "",
                        title: "",
                        navTitle: "",
                        description: "",
                        content: "",
                        showInNav: true,
                        status: "published",
                      })
                    }}
                    style={{
                      border: "1px solid var(--border)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: PAYMENT & API INTEGRATIONS */}
      {activeTab === "integrations" && (
        <div className="page-enter">
          {/* Header Overview Banner */}
          <div
            style={{
              padding: "20px 24px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              marginBottom: "24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                <CreditCard size={20} color="#a855f7" />
                <span>Payment Gateways & API Integration</span>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--muted)",
                  margin: 0,
                  maxWidth: "580px",
                }}
              >
                Integrate Paystack, Stripe, Flutterwave, or custom payment webhooks.
                Active gateways automatically process and verify subscription activations for Pro tools.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "12px",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  background: "rgba(16,185,129,0.15)",
                  color: "#10b981",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <CheckCircle2 size={14} />
                Primary: {gateways.find((g) => g.id === activeGatewayId)?.name || "Paystack"}
              </span>
            </div>
          </div>

          {/* Gateway Cards Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
              gap: "20px",
            }}
          >
            {gateways.map((gw) => {
              const isPrimary = activeGatewayId === gw.id
              const isTesting = testingGatewayId === gw.id
              const showSecret = !!showSecretKey[gw.id]

              return (
                <div
                  key={gw.id}
                  style={{
                    background: "var(--surface)",
                    border: isPrimary
                      ? "2px solid #a855f7"
                      : "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    position: "relative",
                  }}
                >
                  <div>
                    {/* Top Row: Provider Title & Status */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "8px",
                            background:
                              gw.id === "paystack"
                                ? "rgba(14,165,233,0.15)"
                                : gw.id === "stripe"
                                  ? "rgba(99,102,241,0.15)"
                                  : gw.id === "flutterwave"
                                    ? "rgba(245,158,11,0.15)"
                                    : "rgba(168,85,247,0.15)",
                            color:
                              gw.id === "paystack"
                                ? "#0ea5e9"
                                : gw.id === "stripe"
                                  ? "#6366f1"
                                  : gw.id === "flutterwave"
                                    ? "#f59e0b"
                                    : "#a855f7",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <CreditCard size={20} />
                        </div>
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <h3
                              style={{
                                fontSize: "16px",
                                margin: 0,
                                fontWeight: 600,
                              }}
                            >
                              {gw.name}
                            </h3>
                            {isPrimary && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(168,85,247,0.2)",
                                  color: "#a855f7",
                                  fontWeight: 700,
                                }}
                              >
                                PRIMARY
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--muted)",
                            }}
                          >
                            {gw.currency} Settlement
                          </span>
                        </div>
                      </div>

                      {/* Enable / Disable switch */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleGatewayMode(gw.id)}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            border: "1px solid var(--border)",
                            background:
                              gw.mode === "live"
                                ? "rgba(16,185,129,0.15)"
                                : "rgba(245,158,11,0.15)",
                            color: gw.mode === "live" ? "#10b981" : "#f59e0b",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Click to toggle Test/Live mode"
                        >
                          {gw.mode.toUpperCase()}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleGatewayEnabled(gw.id)}
                          style={{
                            fontSize: "11px",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "none",
                            background: gw.enabled
                              ? "#10b981"
                              : "rgba(239,68,68,0.15)",
                            color: gw.enabled ? "#ffffff" : "#ef4444",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {gw.enabled ? "ACTIVE" : "OFF"}
                        </button>
                      </div>
                    </div>

                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--muted)",
                        marginBottom: "16px",
                        lineHeight: "1.4",
                      }}
                    >
                      {gw.description}
                    </p>

                    {/* Inputs */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        marginBottom: "16px",
                      }}
                    >
                      {gw.id === "custom" && (
                        <div>
                          <label
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            Webhook / API Endpoint URL
                          </label>
                          <input
                            type="text"
                            value={gw.endpointUrl || ""}
                            onChange={(e) =>
                              handleUpdateGatewayField(
                                gw.id,
                                "endpointUrl",
                                e.target.value,
                              )
                            }
                            placeholder="https://api.yourdomain.com/v1/payments"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              fontSize: "12px",
                              fontFamily: "monospace",
                              background: "var(--bg)",
                              color: "var(--text)",
                            }}
                          />
                        </div>
                      )}

                      <div>
                        <label
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "var(--muted)",
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          {gw.id === "stripe"
                            ? "Publishable Key"
                            : gw.id === "flutterwave"
                              ? "Public Key (FLWPUBK)"
                              : "Public Key / API Key"}
                        </label>
                        <input
                          type="text"
                          value={gw.publicKey}
                          onChange={(e) =>
                            handleUpdateGatewayField(
                              gw.id,
                              "publicKey",
                              e.target.value,
                            )
                          }
                          placeholder={
                            gw.id === "paystack"
                              ? "pk_test_... or pk_live_..."
                              : "pk_..."
                          }
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            fontSize: "12px",
                            fontFamily: "monospace",
                            background: "var(--bg)",
                            color: "var(--text)",
                          }}
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "4px",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--muted)",
                            }}
                          >
                            Secret Key / Private Token
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setShowSecretKey((prev) => ({
                                ...prev,
                                [gw.id]: !prev[gw.id],
                              }))
                            }
                            style={{
                              fontSize: "11px",
                              background: "transparent",
                              border: "none",
                              color: "var(--muted)",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            {showSecret ? (
                              <EyeOff size={12} />
                            ) : (
                              <Eye size={12} />
                            )}
                            {showSecret ? "Hide" : "Show"}
                          </button>
                        </div>
                        <input
                          type={showSecret ? "text" : "password"}
                          value={gw.secretKey}
                          onChange={(e) =>
                            handleUpdateGatewayField(
                              gw.id,
                              "secretKey",
                              e.target.value,
                            )
                          }
                          placeholder={
                            gw.id === "paystack"
                              ? "sk_test_... or sk_live_..."
                              : "sk_..."
                          }
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            fontSize: "12px",
                            fontFamily: "monospace",
                            background: "var(--bg)",
                            color: "var(--text)",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            Webhook Secret
                          </label>
                          <input
                            type="text"
                            value={gw.webhookSecret || ""}
                            onChange={(e) =>
                              handleUpdateGatewayField(
                                gw.id,
                                "webhookSecret",
                                e.target.value,
                              )
                            }
                            placeholder="whsec_..."
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              fontSize: "12px",
                              fontFamily: "monospace",
                              background: "var(--bg)",
                              color: "var(--text)",
                            }}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            Settlement Currency
                          </label>
                          <select
                            value={gw.currency}
                            onChange={(e) =>
                              handleUpdateGatewayField(
                                gw.id,
                                "currency",
                                e.target.value,
                              )
                            }
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              fontSize: "12px",
                              background: "var(--bg)",
                              color: "var(--text)",
                            }}
                          >
                            <option value="GHS">GHS (Ghana Cedis ₵)</option>
                            <option value="NGN">NGN (Nigerian Naira ₦)</option>
                            <option value="USD">USD (US Dollars $)</option>
                            <option value="EUR">EUR (Euros €)</option>
                            <option value="GBP">GBP (British Pounds £)</option>
                            <option value="KES">KES (Kenyan Shillings)</option>
                            <option value="ZAR">ZAR (South African Rand)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Test Status Banner */}
                    {gw.testStatus && gw.testStatus !== "untested" && (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          marginBottom: "16px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background:
                            gw.testStatus === "success"
                              ? "rgba(16,185,129,0.12)"
                              : "rgba(239,68,68,0.12)",
                          color:
                            gw.testStatus === "success" ? "#10b981" : "#ef4444",
                          border: `1px solid ${
                            gw.testStatus === "success"
                              ? "rgba(16,185,129,0.25)"
                              : "rgba(239,68,68,0.25)"
                          }`,
                        }}
                      >
                        {gw.testStatus === "success" ? (
                          <CheckCircle size={14} />
                        ) : (
                          <AlertCircle size={14} />
                        )}
                        <span>
                          {gw.testMessage ||
                            (gw.testStatus === "success"
                              ? "Valid credentials."
                              : "Connection failed.")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Bar */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {!isPrimary ? (
                      <button
                        type="button"
                        onClick={() => handleSetPrimaryGateway(gw.id)}
                        disabled={!gw.enabled}
                        style={{
                          fontSize: "11px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: gw.enabled ? "var(--text)" : "var(--muted)",
                          cursor: gw.enabled ? "pointer" : "not-allowed",
                        }}
                      >
                        Make Primary
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#a855f7",
                          fontWeight: 600,
                        }}
                      >
                        Primary Gateway
                      </span>
                    )}

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => handleTestGateway(gw.id)}
                        disabled={isTesting}
                        style={{
                          fontSize: "11px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          cursor: "pointer",
                        }}
                      >
                        <RefreshCw
                          size={12}
                          className={isTesting ? "spin" : ""}
                        />
                        {isTesting ? "Testing..." : "Test API"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveGateway(gw)
                          showToast(
                            `${gw.name} configuration saved successfully.`,
                          )
                        }}
                        className="primary"
                        style={{
                          fontSize: "11px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Check size={12} /> Save
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
