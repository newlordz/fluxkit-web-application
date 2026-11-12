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
  Coins,
  ArrowRightLeft,
  TrendingUp,
} from "lucide-react"
import type { UserAccount } from "./authService"
import {
  getAllToolTiers,
  setToolTier,
  getAllToolPrices,
  setToolPrice,
  getFormattedToolPrice,
  setBulkToolPrices,
  setCategoryPrice,
  getAllUsers,
  approveProSubscription,
  revokeProSubscription,
  updateUserRole,
  isRootAdmin,
  deleteUser,
  createUserByAdmin,
  changeUserPassword,
} from "./adminService"
import {
  getActiveCurrency,
  setActiveCurrency,
  getExchangeRate,
  setExchangeRate,
  convertCurrencyOnBackend,
  type SupportedCurrency,
} from "./currencyService"
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
  // Check access: users with role === 'admin' or 'sub-admin' can access
  if (
    !currentUser ||
    (currentUser.role !== "admin" && currentUser.role !== "sub-admin")
  ) {
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

  const [activeTab, setActiveTab] =
    useState<"tiers" | "users" | "pages" | "integrations">(
      initialTab || "tiers",
    )
  const [toolTiers, setToolTiers] =
    useState<Record<string, "standard" | "pro">>(getAllToolTiers)
  const [toolPrices, setToolPrices] =
    useState<Record<string, number>>(getAllToolPrices)
  const [activeCurrency, setActiveCurrencyState] =
    useState<SupportedCurrency>(getActiveCurrency)
  const [exchangeRate, setExchangeRateState] = useState<number>(getExchangeRate)
  const [rateInput, setRateInput] = useState<string>(() =>
    getExchangeRate().toString(),
  )
  const [isUpdatingRate, setIsUpdatingRate] = useState(false)
  const [rateSuccessMsg, setRateSuccessMsg] = useState("")

  // Real-time GHS prices cache for instantaneous inputs
  const [ghsPrices, setGhsPrices] = useState<Record<string, number>>(() => {
    const prices = getAllToolPrices()
    const rate = getExchangeRate()
    const mapped: Record<string, number> = {}
    tools.forEach((t) => {
      const isPro = (getAllToolTiers()[t.id] || "standard") === "pro"
      const usd = prices[t.id] ?? (isPro ? 4.99 : 0)
      mapped[t.id] = Math.round(usd * rate * 100) / 100
    })
    return mapped
  })

  // Quick Currency Converter Sandbox State
  const [calcUsd, setCalcUsd] = useState("10")
  const [calcGhs, setCalcGhs] = useState(() =>
    (10 * getExchangeRate()).toFixed(2),
  )
  const [calcLoading, setCalcLoading] = useState(false)

  // Listen to currency & rate change events across tabs/windows
  useEffect(() => {
    const handleCurrChange = (e: any) => {
      if (e.detail) setActiveCurrencyState(e.detail)
    }
    const handleRateChange = (e: any) => {
      if (typeof e.detail === "number") {
        setExchangeRateState(e.detail)
        setRateInput(e.detail.toString())
      }
    }
    window.addEventListener("fluxkit-currency-changed", handleCurrChange)
    window.addEventListener("fluxkit-rate-changed", handleRateChange)
    return () => {
      window.removeEventListener("fluxkit-currency-changed", handleCurrChange)
      window.removeEventListener("fluxkit-rate-changed", handleRateChange)
    }
  }, [])

  const [userList, setUserList] = useState<UserAccount[]>(getAllUsers)
  const [customPages, setCustomPages] = useState<CustomPage[]>(getCustomPages)
  const [gateways, setGateways] =
    useState<PaymentGatewayConfig[]>(getAllGateways)
  const [activeGatewayId, setActiveGatewayId] = useState<PaymentProvider>(
    () => getActiveGateway()?.id || "paystack",
  )
  const [testingGatewayId, setTestingGatewayId] = useState<string | null>(null)
  const [showSecretKey, setShowSecretKey] = useState<Record<string, boolean>>(
    {},
  )
  const [toolQuery, setToolQuery] = useState("")
  const [toastMessage, setToastMessage] = useState("")

  // User Management & Security States
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUserForm, setNewUserForm] = useState<{
    name: string
    email: string
    password: string
    role: "admin" | "sub-admin" | "user"
    subscriptionTier: "standard" | "pro"
  }>({
    name: "",
    email: "",
    password: "",
    role: "user",
    subscriptionTier: "standard",
  })
  const [newUserError, setNewUserError] = useState("")
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordTargetUser, setPasswordTargetUser] =
    useState<UserAccount | null>(null)
  const [newPasswordValue, setNewPasswordValue] = useState("")
  const [confirmPasswordValue, setConfirmPasswordValue] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [showPasswordText, setShowPasswordText] = useState(false)

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

  const handlePriceChange = (toolId: string, rawVal: string) => {
    handleUsdPriceChange(toolId, rawVal)
  }

  const handlePriceBlur = (toolId: string, toolName: string) => {
    const p = toolPrices[toolId] ?? (toolTiers[toolId] === "pro" ? 4.99 : 0)
    const ghs = ghsPrices[toolId] ?? Math.round(Number(p) * exchangeRate * 100) / 100
    showToast(
      `Price for '${toolName}' set to $${Number(p).toFixed(2)} USD (GH₵ ${ghs.toFixed(2)} GHS).`,
    )
  }

  // Change store-wide active currency
  const handleCurrencySelect = (currency: SupportedCurrency) => {
    setActiveCurrency(currency)
    setActiveCurrencyState(currency)
    showToast(
      `Store display currency set to ${
        currency === "GHS" ? "Ghanaian Cedi (GH₵)" : "US Dollar ($)"
      }.`,
    )
  }

  // Update backend exchange rate
  const handleUpdateBackendRate = async () => {
    const parsed = parseFloat(rateInput)
    if (isNaN(parsed) || parsed <= 0) {
      showToast("Please enter a valid positive exchange rate.")
      return
    }
    setIsUpdatingRate(true)
    try {
      await fetch("/api/currency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_rate", rate: parsed }),
      })
    } catch {}
    setExchangeRate(parsed)
    setExchangeRateState(parsed)

    // Recalculate all GHS equivalents with the new backend rate
    const updatedGhs: Record<string, number> = {}
    for (const [id, usd] of Object.entries(toolPrices)) {
      updatedGhs[id] = Math.round(usd * parsed * 100) / 100
    }
    setGhsPrices(updatedGhs)
    setCalcGhs((parseFloat(calcUsd || "0") * parsed).toFixed(2))
    setIsUpdatingRate(false)
    setRateSuccessMsg(
      `Backend rate synchronized: 1 USD = ${parsed.toFixed(2)} GHS`,
    )
    showToast(`Exchange rate updated: 1 USD = ${parsed.toFixed(2)} GHS`)
    setTimeout(() => setRateSuccessMsg(""), 3500)
  }

  // Real-time backend conversion when user edits USD price
  const handleUsdPriceChange = async (toolId: string, rawVal: string) => {
    const val = parseFloat(rawVal)
    const newUsd = isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100
    setToolPrice(toolId, newUsd)
    setToolPrices((prev) => ({ ...prev, [toolId]: newUsd }))

    // Trigger backend conversion from USD -> GHS
    try {
      const conv = await convertCurrencyOnBackend(
        newUsd,
        "USD",
        "GHS",
        exchangeRate,
      )
      setGhsPrices((prev) => ({ ...prev, [toolId]: conv.convertedAmount }))
    } catch {
      setGhsPrices((prev) => ({
        ...prev,
        [toolId]: Math.round(newUsd * exchangeRate * 100) / 100,
      }))
    }
  }

  // Real-time backend conversion when user edits GHS (Cedi) price
  const handleGhsPriceChange = async (toolId: string, rawVal: string) => {
    const val = parseFloat(rawVal)
    const newGhs = isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100
    setGhsPrices((prev) => ({ ...prev, [toolId]: newGhs }))

    // Trigger backend conversion from GHS -> USD
    try {
      const conv = await convertCurrencyOnBackend(
        newGhs,
        "GHS",
        "USD",
        exchangeRate,
      )
      setToolPrice(toolId, conv.convertedAmount)
      setToolPrices((prev) => ({ ...prev, [toolId]: conv.convertedAmount }))
    } catch {
      const convertedUsd = Math.round((newGhs / exchangeRate) * 100) / 100
      setToolPrice(toolId, convertedUsd)
      setToolPrices((prev) => ({ ...prev, [toolId]: convertedUsd }))
    }
  }

  // Interactive quick calculator converters
  const handleCalcUsdChange = async (val: string) => {
    setCalcUsd(val)
    const num = parseFloat(val) || 0
    setCalcLoading(true)
    try {
      const res = await convertCurrencyOnBackend(
        num,
        "USD",
        "GHS",
        exchangeRate,
      )
      setCalcGhs(res.convertedAmount.toFixed(2))
    } catch {
      setCalcGhs((num * exchangeRate).toFixed(2))
    } finally {
      setCalcLoading(false)
    }
  }

  const handleCalcGhsChange = async (val: string) => {
    setCalcGhs(val)
    const num = parseFloat(val) || 0
    setCalcLoading(true)
    try {
      const res = await convertCurrencyOnBackend(
        num,
        "GHS",
        "USD",
        exchangeRate,
      )
      setCalcUsd(res.convertedAmount.toFixed(2))
    } catch {
      setCalcUsd((num / exchangeRate).toFixed(2))
    } finally {
      setCalcLoading(false)
    }
  }

  const handleTierToggle = (toolId: string) => {
    const current = toolTiers[toolId] || "standard"
    const next = current === "pro" ? "standard" : "pro"
    setToolTier(toolId, next)
    setToolTiers({ ...toolTiers, [toolId]: next })
    if (next === "pro" && (!toolPrices[toolId] || toolPrices[toolId] === 0)) {
      setToolPrice(toolId, 4.99)
      setToolPrices((prev) => ({ ...prev, [toolId]: 4.99 }))
    }
    showToast(`Tool '${toolId}' updated to ${next.toUpperCase()} tier.`)
  }

  const handleLoadPricingPageTemplate = () => {
    const lines = [
      "# Plans & Tool Pricing",
      "",
      "Transparent, flexible pricing for all 37 creative, conversion, and intelligence tools. Run tools completely client-side in your browser with zero upload latency.",
      "",
      "## All-Access Pro Subscription",
      `- **Monthly Pro Plan:** $19.00 USD / month (or GH₵ ${(19 * exchangeRate).toFixed(2)} GHS / month via Mobile Money / Card)`,
      "- **Unlimited access** to all Pro PDF utilities, OCR scanners, AI workflows, and Studio workspaces.",
      "- Commercial-use rights and priority local client processing.",
      "",
      "## Individual Tool Tiers & Prices",
      "| Tool | Category | Tier | Price (USD / GHS) |",
      "| :--- | :--- | :--- | :--- |",
    ]
    tools.forEach((t) => {
      const isPro = (toolTiers[t.id] || "standard") === "pro"
      const price = toolPrices[t.id] ?? (isPro ? 4.99 : 0)
      const priceLabel =
        price === 0
          ? "Free"
          : `$${price.toFixed(2)} USD (GH₵ ${(price * exchangeRate).toFixed(2)} GHS)`
      lines.push(
        `| ${t.name} | ${t.category} | ${
          isPro ? "PRO" : "Standard"
        } | ${priceLabel} |`,
      )
    })
    lines.push(
      "",
      "### Need Custom Enterprise Volumes?",
      "Contact support or request approval directly from the workspace console.",
    )

    setEditingPageId(null)
    setPageForm({
      slug: "pricing",
      title: "Plans & Tool Pricing",
      navTitle: "Pricing",
      description:
        "Complete list of FluxKit subscription tiers and per-tool prices.",
      content: lines.join("\n"),
      showInNav: true,
      status: "published",
    })
    showToast("Loaded dynamic Pricing Page template into editor.")
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

  const handleRoleToggle = (
    userId: string,
    currentRole: "admin" | "sub-admin" | "user",
  ) => {
    if (isRootAdmin(userId)) {
      showToast("Root administrator account is locked and cannot be demoted.")
      return
    }
    const nextRole = currentRole === "admin" ? "user" : "admin"
    try {
      updateUserRole(userId, nextRole)
      setUserList(getAllUsers())
      showToast(`User role updated to ${nextRole.toUpperCase()}.`)
    } catch (e: any) {
      showToast(e.message || "Failed to update role.")
    }
  }

  const handleRoleChange = (
    userId: string,
    newRole: "admin" | "sub-admin" | "user",
  ) => {
    if (isRootAdmin(userId) && newRole !== "admin") {
      showToast("Root administrator account is locked and cannot be demoted.")
      return
    }
    try {
      updateUserRole(userId, newRole)
      setUserList(getAllUsers())
      showToast(`User role updated to ${newRole.toUpperCase()}.`)
    } catch (e: any) {
      showToast(e.message || "Failed to update role.")
    }
  }

  const handleDeleteUser = (userId: string, userName: string) => {
    if (isRootAdmin(userId)) {
      showToast("Root administrator account is locked and cannot be deleted.")
      return
    }
    if (
      typeof window !== "undefined" &&
      window.confirm &&
      !window.confirm(`Permanently remove account for "${userName}"?`)
    ) {
      return
    }
    try {
      deleteUser(userId)
      setUserList(getAllUsers())
      showToast(`User "${userName}" has been removed.`)
    } catch (e: any) {
      showToast(e.message || "Failed to delete user.")
    }
  }

  const handleOpenChangePassword = (u: UserAccount) => {
    setPasswordTargetUser(u)
    setNewPasswordValue("")
    setConfirmPasswordValue("")
    setPasswordError("")
    setShowPasswordText(false)
    setShowPasswordModal(true)
  }

  const handleSavePassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!passwordTargetUser) return
    if (!newPasswordValue || newPasswordValue.length < 8) {
      setPasswordError("Password must be at least 8 characters long.")
      return
    }
    if (newPasswordValue !== confirmPasswordValue) {
      setPasswordError("Passwords do not match.")
      return
    }
    try {
      changeUserPassword(passwordTargetUser.id, newPasswordValue)
      setShowPasswordModal(false)
      const targetName = passwordTargetUser.name
      setPasswordTargetUser(null)
      showToast(`Password successfully updated for ${targetName}.`)
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update password.")
    }
  }

  const handleCreateUser = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setNewUserError("")
    try {
      const created = createUserByAdmin(newUserForm)
      setUserList(getAllUsers())
      setShowAddUserModal(false)
      setNewUserForm({
        name: "",
        email: "",
        password: "",
        role: "user",
        subscriptionTier: "standard",
      })
      showToast(`User "${created.name}" created successfully.`)
    } catch (err: any) {
      setNewUserError(err.message || "Failed to create user.")
    }
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

  const [selectedCategory, setSelectedCategory] = useState("all")

  const handleBulkSetProPrice = (amount: number) => {
    const proIds = tools
      .filter((t) => (toolTiers[t.id] || "standard") === "pro")
      .map((t) => t.id)
    setBulkToolPrices(proIds, amount)
    setToolPrices(getAllToolPrices())
    showToast(
      `Updated all ${proIds.length} Pro tools to $${amount.toFixed(2)} USD.`,
    )
  }

  const handleBulkSetStandardFree = () => {
    const stdIds = tools
      .filter((t) => (toolTiers[t.id] || "standard") === "standard")
      .map((t) => t.id)
    setBulkToolPrices(stdIds, 0)
    setToolPrices(getAllToolPrices())
    showToast(`Reset all ${stdIds.length} Standard tools to FREE ($0.00).`)
  }

  const proCount = Object.values(toolTiers).filter((t) => t === "pro").length
  const filteredTools = tools.filter((t) => {
    const matchesQuery =
      t.name.toLowerCase().includes(toolQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(toolQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(toolQuery.toLowerCase())
    const matchesCategory =
      selectedCategory === "all" ||
      t.category.toLowerCase() === selectedCategory.toLowerCase()
    return matchesQuery && matchesCategory
  })

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
          {/* Pricing & Tier Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              className="panel"
              style={{
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                TOTAL PLATFORM TOOLS
              </span>
              <span style={{ fontSize: "20px", fontWeight: 700 }}>
                {tools.length}
              </span>
            </div>
            <div
              className="panel"
              style={{
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                PRO / PAID TOOLS
              </span>
              <span
                style={{ fontSize: "20px", fontWeight: 700, color: "#a855f7" }}
              >
                {proCount}
              </span>
            </div>
            <div
              className="panel"
              style={{
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                STANDARD / FREE TOOLS
              </span>
              <span
                style={{ fontSize: "20px", fontWeight: 700, color: "#10b981" }}
              >
                {tools.length - proCount}
              </span>
            </div>
            <div
              className="panel"
              style={{
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                PRO ACCESS PLAN
              </span>
              <span
                style={{ fontSize: "16px", fontWeight: 700, marginTop: "2px" }}
              >
                {activeCurrency === "GHS"
                  ? `GH₵ ${(19 * exchangeRate).toFixed(2)} GHS / mo`
                  : "$19 USD / mo"}
              </span>
            </div>
          </div>

          {/* Currency Control & Real-time Backend Conversion Station */}
          <div
            className="panel"
            style={{
              padding: "14px 18px",
              marginBottom: "16px",
              background:
                "linear-gradient(135deg, var(--surface) 0%, rgba(99, 102, 241, 0.05) 100%)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 700,
                    fontSize: "13px",
                    color: "var(--text)",
                  }}
                >
                  <Coins size={16} style={{ color: "#6366f1" }} />
                  <span>Currency &amp; Backend Conversion Station</span>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#10b981",
                      fontWeight: 700,
                    }}
                  >
                    ● Backend API Active (/api/currency)
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--muted)",
                    margin: "2px 0 0 0",
                  }}
                >
                  Change display currency between US Dollar ($) and Ghanaian
                  Cedi (GH₵). Changing values automatically recalculates both
                  currencies via the backend conversion engine.
                </p>
              </div>

              {/* Active Currency Selector Pill */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "20px",
                  padding: "3px",
                  gap: "2px",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleCurrencySelect("USD")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "16px",
                    border: "none",
                    background:
                      activeCurrency === "USD"
                        ? "#6366f1"
                        : "transparent",
                    color: activeCurrency === "USD" ? "#fff" : "var(--muted)",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span>🇺🇸</span>
                  <span>USD ($)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCurrencySelect("GHS")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "16px",
                    border: "none",
                    background:
                      activeCurrency === "GHS"
                        ? "#6366f1"
                        : "transparent",
                    color: activeCurrency === "GHS" ? "#fff" : "var(--muted)",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span>🇬🇭</span>
                  <span>GHS (GH₵)</span>
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "14px",
                paddingTop: "10px",
                borderTop: "1px solid var(--border)",
              }}
            >
              {/* Backend Exchange Rate Setting */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  Backend Rate:
                </span>
                <span style={{ color: "var(--muted)" }}>1 USD =</span>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    style={{
                      width: "80px",
                      padding: "4px 8px 4px 18px",
                      fontSize: "12px",
                      borderRadius: "5px",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                      fontWeight: 700,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: "6px",
                      top: "4px",
                      fontSize: "11px",
                      color: "var(--muted)",
                    }}
                  >
                    ₵
                  </span>
                </div>
                <span style={{ color: "var(--muted)" }}>GHS</span>
                <button
                  type="button"
                  className="secondary"
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "5px",
                  }}
                  disabled={isUpdatingRate}
                  onClick={handleUpdateBackendRate}
                >
                  {isUpdatingRate ? "Syncing..." : "Update Rate"}
                </button>
                {rateSuccessMsg && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#10b981",
                      fontWeight: 600,
                    }}
                  >
                    ✓ {rateSuccessMsg}
                  </span>
                )}
              </div>

              {/* Real-time Bidirectional Sandbox Calculator */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "11px",
                  background: "var(--surface)",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                  Live Test Converter:
                </span>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "3px" }}
                >
                  <span>$</span>
                  <input
                    type="number"
                    step="1"
                    value={calcUsd}
                    onChange={(e) => handleCalcUsdChange(e.target.value)}
                    style={{
                      width: "60px",
                      padding: "2px 4px",
                      fontSize: "11px",
                      borderRadius: "3px",
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontWeight: 600,
                    }}
                  />
                  <span style={{ color: "var(--muted)" }}>USD</span>
                </div>
                <ArrowRightLeft
                  size={12}
                  style={{
                    color: calcLoading ? "#6366f1" : "var(--muted)",
                  }}
                />
                <div
                  style={{ display: "flex", alignItems: "center", gap: "3px" }}
                >
                  <span>GH₵</span>
                  <input
                    type="number"
                    step="1"
                    value={calcGhs}
                    onChange={(e) => handleCalcGhsChange(e.target.value)}
                    style={{
                      width: "65px",
                      padding: "2px 4px",
                      fontSize: "11px",
                      borderRadius: "3px",
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontWeight: 600,
                    }}
                  />
                  <span style={{ color: "var(--muted)" }}>GHS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bulk Pricing Actions */}
          <div
            className="panel"
            style={{
              padding: "10px 16px",
              marginBottom: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                Bulk Price Adjust:
              </span>
              <button
                type="button"
                className="secondary"
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "5px",
                }}
                onClick={() => handleBulkSetProPrice(4.99)}
              >
                Set All Pro → $4.99
              </button>
              <button
                type="button"
                className="secondary"
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "5px",
                }}
                onClick={() => handleBulkSetProPrice(2.99)}
              >
                Set All Pro → $2.99
              </button>
              <button
                type="button"
                className="secondary"
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "5px",
                }}
                onClick={handleBulkSetStandardFree}
              >
                Reset Standard → Free ($0)
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              gap: "12px",
            }}
          >
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
              Adjust individual tool prices and toggle <strong>PRO</strong> or{" "}
              <strong>STANDARD</strong> tiers.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              >
                <option value="all">All Categories</option>
                <option value="File tools">File tools</option>
                <option value="AI text tools">AI text tools</option>
                <option value="Audio tools">Audio tools</option>
                <option value="QR tools">QR tools</option>
                <option value="Studio & Collaboration">
                  Studio & Collaboration
                </option>
              </select>
              <div style={{ position: "relative", width: "220px" }}>
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
                    }}
                  >
                    Price (USD $)
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    Price (GHS GH₵)
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
                  const priceVal = toolPrices[t.id] ?? (isPro ? 4.99 : 0)
                  const ghsVal =
                    ghsPrices[t.id] ??
                    (priceVal === 0
                      ? 0
                      : Math.round(priceVal * exchangeRate * 100) / 100)
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
                      {/* USD Column - Live Backend Conversion */}
                      <td style={{ padding: "12px 16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              color: "var(--muted)",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            $
                          </span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            placeholder={isPro ? "4.99" : "0.00"}
                            value={priceVal}
                            onChange={(e) =>
                              handleUsdPriceChange(t.id, e.target.value)
                            }
                            onBlur={() => handlePriceBlur(t.id, t.name)}
                            style={{
                              width: "72px",
                              padding: "4px 8px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--text)",
                              fontWeight: 600,
                            }}
                          />
                        </div>
                      </td>
                      {/* GHS Column - Live Backend Conversion */}
                      <td style={{ padding: "12px 16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              color: "var(--muted)",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            GH₵
                          </span>
                          <input
                            type="number"
                            step="5"
                            min="0"
                            placeholder={
                              isPro
                                ? (4.99 * exchangeRate).toFixed(2)
                                : "0.00"
                            }
                            value={ghsVal}
                            onChange={(e) =>
                              handleGhsPriceChange(t.id, e.target.value)
                            }
                            onBlur={() => handlePriceBlur(t.id, t.name)}
                            style={{
                              width: "78px",
                              padding: "4px 8px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--text)",
                              fontWeight: 600,
                            }}
                          />
                          {priceVal === 0 ? (
                            <span
                              style={{
                                fontSize: "10px",
                                padding: "2px 6px",
                                borderRadius: "3px",
                                background: "rgba(16,185,129,0.15)",
                                color: "#10b981",
                                fontWeight: 700,
                              }}
                            >
                              FREE
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "10px",
                                padding: "2px 6px",
                                borderRadius: "3px",
                                background: "rgba(168,85,247,0.15)",
                                color: "#a855f7",
                                fontWeight: 600,
                              }}
                            >
                              PAID
                            </span>
                          )}
                        </div>
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--muted)",
                  margin: 0,
                }}
              >
                Review registered accounts, promote users to Sub-Admin or Admin,
                manage Pro activations, and change account passwords.
              </p>
              <div
                style={{
                  fontSize: "11px",
                  color: "#eab308",
                  marginTop: "4px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Lock size={12} /> Root Administrator account is permanently
                locked from deletion and demotion.
              </div>
            </div>
            <button
              className="primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "8px",
              }}
              onClick={() => {
                setNewUserError("")
                setShowAddUserModal(true)
              }}
            >
              <Plus size={15} /> Add User
            </button>
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
                    const isRoot = isRootAdmin(u)
                    const isProActive =
                      u.subscriptionTier === "pro" && u.proStatus === "active"
                    const isPending = u.proStatus === "pending"
                    return (
                      <tr
                        key={u.id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {u.name}
                            {isRoot && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  padding: "1px 6px",
                                  borderRadius: "10px",
                                  background: "rgba(234, 179, 8, 0.2)",
                                  color: "#eab308",
                                  fontWeight: 700,
                                  border: "1px solid rgba(234, 179, 8, 0.4)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                <Lock size={10} /> Root
                              </span>
                            )}
                          </div>
                          <small style={{ color: "var(--muted)" }}>
                            {u.email}
                          </small>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {isRoot ? (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "rgba(234,179,8,0.2)",
                                color: "#eab308",
                                border: "1px solid rgba(234,179,8,0.4)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Lock size={11} /> ROOT ADMIN
                            </span>
                          ) : (
                            <select
                              value={u.role || "user"}
                              aria-label={`Change role for ${u.name}`}
                              onChange={(e) =>
                                handleRoleChange(
                                  u.id,
                                  e.target
                                    .value as "admin" | "sub-admin" | "user",
                                )
                              }
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                border: "1px solid var(--border)",
                                background:
                                  u.role === "admin"
                                    ? "rgba(234,179,8,0.15)"
                                    : u.role === "sub-admin"
                                      ? "rgba(168,85,247,0.15)"
                                      : "var(--surface)",
                                color:
                                  u.role === "admin"
                                    ? "#eab308"
                                    : u.role === "sub-admin"
                                      ? "#a855f7"
                                      : "var(--text)",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              <option value="user">User</option>
                              <option value="sub-admin">Sub-Admin</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {isRoot ? (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "rgba(16,185,129,0.2)",
                                color: "#10b981",
                                border: "1px solid rgba(16,185,129,0.4)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Lock size={11} /> PERMANENT PRO
                            </span>
                          ) : (
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
                          )}
                        </td>
                        <td
                          style={{ padding: "12px 16px", textAlign: "right" }}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              gap: "6px",
                              alignItems: "center",
                            }}
                          >
                            {/* Root Admin: ONLY Change Password */}
                            {isRoot ? (
                              <button
                                className="secondary"
                                style={{
                                  padding: "4px 10px",
                                  fontSize: "11px",
                                  borderRadius: "4px",
                                  border: "1px solid rgba(234,179,8,0.4)",
                                  color: "#eab308",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                                onClick={() => handleOpenChangePassword(u)}
                                title="Change root administrator password"
                              >
                                <Key size={12} /> Change Password
                              </button>
                            ) : (
                              <>
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
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                  onClick={() => handleOpenChangePassword(u)}
                                  title={`Change password for ${u.name}`}
                                >
                                  <Key size={12} /> Password
                                </button>
                                <button
                                  className="secondary"
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: "11px",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(239,68,68,0.3)",
                                    color: "#ef4444",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                  title={`Delete ${u.name}`}
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Add User Modal */}
          {showAddUserModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(4px)",
                display: "grid",
                placeItems: "center",
                zIndex: 999999,
                padding: "20px",
              }}
              onClick={() => setShowAddUserModal(false)}
            >
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "16px",
                  padding: "24px",
                  maxWidth: "460px",
                  width: "100%",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "16px",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Plus size={18} color="#a855f7" /> Add New User
                  </h3>
                  <button
                    onClick={() => setShowAddUserModal(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "18px",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {newUserError && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "6px",
                      color: "#ef4444",
                      fontSize: "12px",
                      marginBottom: "14px",
                    }}
                  >
                    {newUserError}
                  </div>
                )}

                <form onSubmit={handleCreateUser}>
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--muted)",
                        marginBottom: "4px",
                      }}
                    >
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Morgan"
                      value={newUserForm.name}
                      onChange={(e) =>
                        setNewUserForm({ ...newUserForm, name: e.target.value })
                      }
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--muted)",
                        marginBottom: "4px",
                      }}
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="user@fluxkit.com"
                      value={newUserForm.email}
                      onChange={(e) =>
                        setNewUserForm({
                          ...newUserForm,
                          email: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--muted)",
                        marginBottom: "4px",
                      }}
                    >
                      Initial Password (min 8 chars)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••••••"
                      value={newUserForm.password}
                      onChange={(e) =>
                        setNewUserForm({
                          ...newUserForm,
                          password: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginBottom: "18px",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--muted)",
                          marginBottom: "4px",
                        }}
                      >
                        Role
                      </label>
                      <select
                        value={newUserForm.role}
                        onChange={(e) =>
                          setNewUserForm({
                            ...newUserForm,
                            role: e.target.value as any,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--text)",
                          fontSize: "13px",
                        }}
                      >
                        <option value="user">Standard User</option>
                        <option value="sub-admin">Sub-Admin</option>
                        <option value="admin">Full Admin</option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--muted)",
                          marginBottom: "4px",
                        }}
                      >
                        Subscription Tier
                      </label>
                      <select
                        value={newUserForm.subscriptionTier}
                        onChange={(e) =>
                          setNewUserForm({
                            ...newUserForm,
                            subscriptionTier: e.target.value as any,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--text)",
                          fontSize: "13px",
                        }}
                      >
                        <option value="standard">Standard Tier</option>
                        <option value="pro">Pro (Active)</option>
                      </select>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setShowAddUserModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="primary">
                      Create User Account
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Change Password Modal */}
          {showPasswordModal && passwordTargetUser && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(4px)",
                display: "grid",
                placeItems: "center",
                zIndex: 999999,
                padding: "20px",
              }}
              onClick={() => setShowPasswordModal(false)}
            >
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "16px",
                  padding: "24px",
                  maxWidth: "440px",
                  width: "100%",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "14px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "16px",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Key size={18} color="#eab308" /> Change Password
                  </h3>
                  <button
                    onClick={() => setShowPasswordModal(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "18px",
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    marginBottom: "14px",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <strong>User:</strong> {passwordTargetUser.name}
                  </div>
                  <small style={{ color: "var(--muted)" }}>
                    {passwordTargetUser.email}
                  </small>
                </div>

                {passwordError && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "6px",
                      color: "#ef4444",
                      fontSize: "12px",
                      marginBottom: "14px",
                    }}
                  >
                    {passwordError}
                  </div>
                )}

                <form onSubmit={handleSavePassword}>
                  <div style={{ marginBottom: "12px" }}>
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
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--muted)",
                        }}
                      >
                        New Password (min 8 chars)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPasswordText(!showPasswordText)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          fontSize: "11px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {showPasswordText ? (
                          <EyeOff size={13} />
                        ) : (
                          <Eye size={13} />
                        )}
                        {showPasswordText ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showPasswordText ? "text" : "password"}
                      required
                      minLength={8}
                      placeholder="Enter new password"
                      value={newPasswordValue}
                      onChange={(e) => setNewPasswordValue(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "18px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--muted)",
                        marginBottom: "4px",
                      }}
                    >
                      Confirm New Password
                    </label>
                    <input
                      type={showPasswordText ? "text" : "password"}
                      required
                      minLength={8}
                      placeholder="Repeat new password"
                      value={confirmPasswordValue}
                      onChange={(e) => setConfirmPasswordValue(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setShowPasswordModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="primary">
                      Update Password
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h3 style={{ fontSize: "16px", margin: 0 }}>
                {editingPageId ? "Edit Custom Page" : "Create New Custom Page"}
              </h3>
              {!editingPageId && (
                <button
                  type="button"
                  className="secondary"
                  style={{
                    fontSize: "11px",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={handleLoadPricingPageTemplate}
                >
                  <FileCode2 size={13} /> Load Pricing Page Template
                </button>
              )}
            </div>
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
                Integrate Paystack, Stripe, Flutterwave, or custom payment
                webhooks. Active gateways automatically process and verify
                subscription activations for Pro tools.
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
                Primary:{" "}
                {gateways.find((g) => g.id === activeGatewayId)?.name ||
                  "Paystack"}
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
                            <option value="ZAR">
                              ZAR (South African Rand)
                            </option>
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
