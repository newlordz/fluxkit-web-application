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
  Database,
  Save,
  Server,
  Cpu,
  ArrowUp,
  ArrowDown,
  Activity,
  Zap,
  Sparkles,
  Layers,
} from "lucide-react"
import {
  getCloudApis,
  saveCloudApis,
  moveApiPriority,
  testApiHealth,
  syncCloudApisWithServer,
  type CloudApiConfig,
  type ApiHealthResult,
} from "./apiPoolService"
import {
  getAdminConfig,
  updateAdminSettings,
  initializeDatabaseSync,
  type DatabaseStatus,
} from "./adminDbService"
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
  syncGatewaysWithServer,
  type PaymentGatewayConfig,
  type PaymentProvider,
} from "./paymentIntegrationService"
import { tools } from "./config"
import { useNotify } from "./Notifications"

export interface AdminPanelProps {
  currentUser: UserAccount | null
  navigate: (id: string) => void
  initialTab?: "tiers" | "users" | "pages" | "integrations" | "apis" | "settings"
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
          Please sign in with an authorized administrator account.
        </p>
        <button className="primary" onClick={() => navigate("sign-in")}>
          Sign in as Admin
        </button>
      </div>
    )
  }

  const [activeTab, setActiveTab] =
    useState<"tiers" | "users" | "pages" | "integrations" | "apis" | "settings">(
      initialTab || "tiers",
    )

  // Cloud API & Priority State
  const [cloudApis, setCloudApis] = useState<CloudApiConfig[]>(() => getCloudApis())
  const [testingApiId, setTestingApiId] = useState<string | null>(null)
  const [apiHealthResults, setApiHealthResults] = useState<Record<string, ApiHealthResult>>({})
  const [showApiSecrets, setShowApiSecrets] = useState<Record<string, boolean>>({})
  const [editingApiId, setEditingApiId] = useState<string | null>(null)
  const [editApiKeyInput, setEditApiKeyInput] = useState("")
  const [editApiSecretInput, setEditApiSecretInput] = useState("")
  const [editApiQuotaInput, setEditApiQuotaInput] = useState<number>(500)
  const [isAddingCustomApi, setIsAddingCustomApi] = useState(false)
  const [newApiName, setNewApiName] = useState("")
  const [newApiEndpoint, setNewApiEndpoint] = useState("")
  const [newApiKey, setNewApiKey] = useState("")
  const [newApiSecret, setNewApiSecret] = useState("")
  const [newApiQuota, setNewApiQuota] = useState(1000)
  const [newApiCategory, setNewApiCategory] = useState<"pdf-compression" | "ocr-text">("pdf-compression")
  const [apiCategoryFilter, setApiCategoryFilter] = useState<string>("all")

  useEffect(() => {
    syncGatewaysWithServer().then((gws) => {
      setGateways(gws)
    })
    syncCloudApisWithServer().then((apis) => {
      setCloudApis(apis)
    })

    const handleApisUpdated = (e: any) => {
      if (e?.detail?.apis && Array.isArray(e.detail.apis)) {
        setCloudApis(e.detail.apis)
      } else {
        setCloudApis(getCloudApis())
      }
    }
    window.addEventListener("fluxkit-apis-updated", handleApisUpdated)
    return () => {
      window.removeEventListener("fluxkit-apis-updated", handleApisUpdated)
    }
  }, [])

  const handleSetExactPriority = async (apiId: string, targetPriority: number, category?: string) => {
    const all = getCloudApis()
    const targetApi = all.find((a) => a.id === apiId)
    if (!targetApi) return
    const cat = category || targetApi.category
    const catList = all.filter((a) => a.category === cat).sort((a, b) => a.priority - b.priority)

    const currentIndex = catList.findIndex((a) => a.id === apiId)
    if (currentIndex === -1) return
    const targetIndex = Math.max(0, Math.min(catList.length - 1, targetPriority - 1))
    if (currentIndex === targetIndex) return

    // Move item in category list
    const [moved] = catList.splice(currentIndex, 1)
    catList.splice(targetIndex, 0, moved)

    // Reassign sequential priorities within category
    catList.forEach((item, idx) => {
      item.priority = idx + 1
      const orig = all.find((a) => a.id === item.id)
      if (orig) orig.priority = idx + 1
    })

    setCloudApis([...all])
    await saveCloudApis(all)
    showToast(`Set ${targetApi.name} to Priority #${targetPriority}`)
  }

  // Database-Backed Admin Settings State
  const [, setAdminConfig] = useState(() => getAdminConfig())
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null)
  const [adminNameInput, setAdminNameInput] = useState(() => getAdminConfig().name)
  const [adminEmailInput, setAdminEmailInput] = useState(() => getAdminConfig().email)
  const [adminPassInput, setAdminPassInput] = useState("")
  const [adminConfirmPassInput, setAdminConfirmPassInput] = useState("")
  const [adminShowPassText, setAdminShowPassText] = useState(false)
  const [adminSaving, setAdminSaving] = useState(false)
  const [adminSaveStatus, setAdminSaveStatus] = useState<{
    type: "success" | "error"
    msg: string
  } | null>(null)

  useEffect(() => {
    initializeDatabaseSync().then((s) => {
      setDbStatus(s)
      const cfg = getAdminConfig()
      setAdminConfig(cfg)
      setAdminNameInput(cfg.name)
      setAdminEmailInput(cfg.email)
    })
  }, [])
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
  const notify = useNotify()
  const [showSecretKey, setShowSecretKey] = useState<Record<string, boolean>>(
    {},
  )
  const [toolQuery, setToolQuery] = useState("")
  const [toastMessage, setToastMessage] = useState("")
  const [justSavedGatewayId, setJustSavedGatewayId] = useState<string | null>(null)

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

  const showToast = (msg: string, tone: "success" | "error" | "info" = "success") => {
    setToastMessage(msg)
    try {
      if (notify) {
        if (tone === "error") notify.error(msg)
        else if (tone === "info") notify.info(msg)
        else notify.success(msg)
      }
    } catch {}
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
      `Store display currency set to ${currency === "GHS" ? "Ghanaian Cedi (GH₵)" : "US Dollar ($)"
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
    } catch { }
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

    // Automatically sync tier with price
    const nextTier = newUsd > 0 ? "pro" : "standard"
    if (toolTiers[toolId] !== nextTier) {
      setToolTier(toolId, nextTier)
      setToolTiers((prev) => ({ ...prev, [toolId]: nextTier }))
    }

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

      // Automatically sync tier with price
      const nextTier = conv.convertedAmount > 0 ? "pro" : "standard"
      if (toolTiers[toolId] !== nextTier) {
        setToolTier(toolId, nextTier)
        setToolTiers((prev) => ({ ...prev, [toolId]: nextTier }))
      }
    } catch {
      const convertedUsd = Math.round((newGhs / exchangeRate) * 100) / 100
      setToolPrice(toolId, convertedUsd)
      setToolPrices((prev) => ({ ...prev, [toolId]: convertedUsd }))

      // Automatically sync tier with price
      const nextTier = convertedUsd > 0 ? "pro" : "standard"
      if (toolTiers[toolId] !== nextTier) {
        setToolTier(toolId, nextTier)
        setToolTiers((prev) => ({ ...prev, [toolId]: nextTier }))
      }
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
    setToolTiers((prev) => ({ ...prev, [toolId]: next }))
    if (next === "pro") {
      const p = toolPrices[toolId] && toolPrices[toolId] > 0 ? toolPrices[toolId] : 4.99
      setToolPrice(toolId, p)
      setToolPrices((prev) => ({ ...prev, [toolId]: p }))
      setGhsPrices((prev) => ({
        ...prev,
        [toolId]: Math.round(p * exchangeRate * 100) / 100,
      }))
    } else {
      setToolPrice(toolId, 0)
      setToolPrices((prev) => ({ ...prev, [toolId]: 0 }))
      setGhsPrices((prev) => ({ ...prev, [toolId]: 0 }))
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
        `| ${t.name} | ${t.category} | ${isPro ? "PRO" : "Standard"
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
        "Complete list of Masterfilepro subscription tiers and per-tool prices.",
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
    setToolTiers(getAllToolTiers())
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
    setToolTiers(getAllToolTiers())
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
          <div className="eyebrow" style={{ color: "#00C9B7" }}>
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
              background: "rgba(0,201,183,0.15)",
              color: "#00C9B7",
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
            position: "fixed",
            bottom: "28px",
            right: "28px",
            zIndex: 99999,
            padding: "12px 20px",
            background: "var(--surface)",
            border: "1px solid rgba(16,185,129,0.5)",
            borderRadius: "10px",
            color: "#10b981",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backdropFilter: "blur(12px)",
          }}
        >
          <Check size={18} /> {toastMessage}
        </div>
      )}

      {/* Tabs */}
      <nav className="admin-nav-bar" aria-label="Admin Dashboard Navigation">
        <div className="admin-nav-track">
          <button
            type="button"
            className={`admin-nav-tab ${activeTab === "tiers" ? "active" : ""}`}
            onClick={() => setActiveTab("tiers")}
          >
            <SlidersHorizontal size={16} className="admin-nav-icon" />
            <span className="admin-nav-label">Tool Tiers</span>
            <span className="admin-nav-badge pro">{proCount} Pro</span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            <Users size={16} className="admin-nav-icon" />
            <span className="admin-nav-label">User Approvals</span>
            <span
              className={`admin-nav-badge ${userList.length > 0 ? "highlight" : ""}`}
            >
              {userList.length}
            </span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === "pages" ? "active" : ""}`}
            onClick={() => setActiveTab("pages")}
          >
            <FileCode2 size={16} className="admin-nav-icon" />
            <span className="admin-nav-label">Page Manager</span>
            <span className="admin-nav-badge">{customPages.length}</span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === "integrations" ? "active" : ""}`}
            onClick={() => setActiveTab("integrations")}
          >
            <CreditCard size={16} className="admin-nav-icon" />
            <span className="admin-nav-label">Payment Gateways</span>
            <span
              className={`admin-nav-badge ${gateways.filter((g) => g.enabled).length > 0 ? "active-badge" : ""}`}
            >
              {gateways.filter((g) => g.enabled).length} Active
            </span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === "apis" ? "active" : ""}`}
            onClick={() => setActiveTab("apis")}
          >
            <Cpu size={16} className="admin-nav-icon" />
            <span className="admin-nav-label">PDF & Cloud APIs</span>
            <span className="admin-nav-badge subtle">Priorities</span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <Database size={16} className="admin-nav-icon" />
            <span className="admin-nav-label">Database & Settings</span>
            <span className="admin-nav-badge db-status">
              <span className="admin-status-dot" />
              Live
            </span>
          </button>
        </div>
      </nav>

      {/* TAB 1: TOOL TIER MANAGER */}
      {activeTab === "tiers" && (
        <div>
          {/* Pricing & Tier Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
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
                style={{ fontSize: "20px", fontWeight: 700, color: "#00C9B7" }}
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
                  <Coins size={16} style={{ color: "#00C9B7" }} />
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
                        ? "#00C9B7"
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
                        ? "#00C9B7"
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
                    color: calcLoading ? "#00C9B7" : "var(--muted)",
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
                    Monthly Sub (USD $)
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    Monthly Sub (GHS GH₵)
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
                  const priceVal = isPro
                    ? (typeof toolPrices[t.id] === "number" && toolPrices[t.id] > 0
                      ? toolPrices[t.id]
                      : 4.99)
                    : 0
                  const ghsVal = isPro
                    ? (typeof ghsPrices[t.id] === "number" && ghsPrices[t.id] > 0
                      ? ghsPrices[t.id]
                      : Math.round(priceVal * exchangeRate * 100) / 100)
                    : 0
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
                              ? "rgba(0,201,183,0.15)"
                              : "rgba(59,130,246,0.15)",
                            color: isPro ? "#00C9B7" : "#3b82f6",
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
                          <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600 }}>
                            /mo {priceVal > 0 && <small style={{ display: "block", color: "#00C9B7" }}>(${(priceVal * 10).toFixed(2)}/yr)</small>}
                          </span>
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
                          <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600 }}>
                            /mo {ghsVal > 0 && <small style={{ display: "block", color: "#00C9B7" }}>(GH₵{(ghsVal * 10).toFixed(2)}/yr)</small>}
                          </span>
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
                                background: "rgba(0,201,183,0.15)",
                                color: "#00C9B7",
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
                              : "rgba(0,201,183,0.1)",
                            color: isPro ? "#3b82f6" : "#00C9B7",
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
                                      ? "rgba(0,201,183,0.15)"
                                      : "var(--surface)",
                                color:
                                  u.role === "admin"
                                    ? "#eab308"
                                    : u.role === "sub-admin"
                                      ? "#00C9B7"
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
                    <Plus size={18} color="#00C9B7" /> Add New User
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
                      placeholder="user@masterfilepro.com"
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
                    className="admin-form-two-col"
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
          className="admin-two-col-grid"
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
                          <span style={{ color: "#00C9B7" }}>• In Sidebar</span>
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
          {/* Quick-switch Banner to PDF & Cloud APIs */}
          <div
            style={{
              padding: "14px 18px",
              background:
                "linear-gradient(90deg, rgba(0,201,183,0.12) 0%, rgba(59,130,246,0.12) 100%)",
              border: "1px solid rgba(0,201,183,0.35)",
              borderRadius: "10px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Cpu size={22} color="#00C9B7" />
              <div>
                <strong style={{ fontSize: "14px", display: "block" }}>
                  Looking for PDF Cloud APIs & Priority Failover?
                </strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  Configure Adobe Acrobat, iLovePDF, OCR.space, and local engine priority rankings, quotas, and automatic failover.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("apis")}
              style={{
                fontSize: "12px",
                padding: "8px 14px",
                borderRadius: "6px",
                background: "#00C9B7",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Cpu size={14} /> Open PDF API Priorities & Failover →
            </button>
          </div>

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
                <CreditCard size={20} color="#00C9B7" />
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
                className="primary-gateway-indicator"
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
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))",
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
                      ? "2px solid #00C9B7"
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
                                    : "rgba(0,201,183,0.15)",
                            color:
                              gw.id === "paystack"
                                ? "#0ea5e9"
                                : gw.id === "stripe"
                                  ? "#00C9B7"
                                  : gw.id === "flutterwave"
                                    ? "#f59e0b"
                                    : "#00C9B7",
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
                                  background: "rgba(0,201,183,0.2)",
                                  color: "#00C9B7",
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
                          border: `1px solid ${gw.testStatus === "success"
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
                          color: "#00C9B7",
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
                          setJustSavedGatewayId(gw.id)
                          showToast(
                            `${gw.name} configuration saved successfully.`,
                          )
                          setTimeout(() => setJustSavedGatewayId(null), 2500)
                        }}
                        className="primary"
                        style={{
                          fontSize: "11px",
                          padding: "6px 14px",
                          borderRadius: "6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: justSavedGatewayId === gw.id ? "#10b981" : undefined,
                          borderColor: justSavedGatewayId === gw.id ? "#10b981" : undefined,
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Check size={12} /> {justSavedGatewayId === gw.id ? "Saved! ✓" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB: PDF & CLOUD APIS & FAILOVER PRIORITY POOL
          ========================================================================= */}
      {activeTab === "apis" && (
        <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Header Overview Banner */}
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "12px",
              background:
                "linear-gradient(135deg, rgba(0, 201, 183, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%)",
              border: "1px solid rgba(0, 201, 183, 0.25)",
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
                  gap: "10px",
                  fontSize: "17px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                <Cpu size={22} color="#00C9B7" />
                <span>PDF Cloud Engines & Failover Priority Pool</span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "12px",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Activity size={12} /> Auto-Failover Active
                </span>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--muted)",
                  margin: 0,
                  maxWidth: "680px",
                  lineHeight: 1.5,
                }}
              >
                Configure cloud APIs (Adobe Acrobat, iLovePDF, OCR.space) and rank their execution priorities.
                The system uses Priority #1 first. When monthly credits finish or rate limits occur, it seamlessly
                transitions down the pipeline to Priority #2 and in-browser WebAssembly with zero downtime.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <a
                href="https://free-apis.github.io/#/browse"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: "12px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                <ExternalLink size={13} /> Free APIs Directory
              </a>

              <button
                type="button"
                onClick={async () => {
                  const updated = cloudApis.map((a) => ({
                    ...a,
                    usedThisMonth: 0,
                    status: "active" as const,
                    lastError: undefined,
                  }))
                  setCloudApis(updated)
                  await saveCloudApis(updated)
                  showToast("All API credit counters reset to 0.")
                }}
                style={{
                  fontSize: "12px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <RefreshCw size={13} /> Reset All Credits
              </button>

              <button
                type="button"
                onClick={() => setIsAddingCustomApi(!isAddingCustomApi)}
                className="primary"
                style={{
                  fontSize: "12px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <Plus size={14} /> Add Free / Custom API
              </button>
            </div>
          </div>

          {/* Add Custom API Pop-up Modal */}
          {isAddingCustomApi && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                display: "grid",
                placeItems: "center",
                padding: "20px",
                background: "rgba(0, 0, 0, 0.75)",
                backdropFilter: "blur(8px)",
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setIsAddingCustomApi(false)
              }}
            >
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid rgba(0, 201, 183, 0.45)",
                  borderRadius: "14px",
                  maxWidth: "660px",
                  width: "100%",
                  maxHeight: "90vh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow:
                    "0 24px 70px rgba(0, 0, 0, 0.75), 0 0 40px rgba(0, 201, 183, 0.2)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Header (Pinned) */}
                <div
                  style={{
                    padding: "16px 20px 12px",
                    borderBottom: "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "8px",
                        background: "rgba(0, 201, 183, 0.15)",
                        display: "grid",
                        placeItems: "center",
                        color: "#00C9B7",
                      }}
                    >
                      <Plus size={17} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                        Connect a Free API
                      </h3>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                        From <a href="https://free-apis.github.io/#/browse" target="_blank" rel="noreferrer" style={{ color: "#00C9B7", textDecoration: "underline" }}>Free-APIs Catalog</a> or your custom endpoint
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddingCustomApi(false)}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid var(--border)",
                      color: "var(--muted)",
                      cursor: "pointer",
                      width: "28px",
                      height: "28px",
                      borderRadius: "6px",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <XCircle size={16} />
                  </button>
                </div>

                {/* Quick-fill Presets */}
                <div style={{ marginBottom: "12px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                    Quick Auto-Fill Presets:
                  </span>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {[
                      { name: "CloudConvert", cat: "pdf-compression", quota: 750, url: "https://api.cloudconvert.com/v2" },
                      { name: "PDF.co", cat: "pdf-compression", quota: 300, url: "https://api.pdf.co/v1" },
                      { name: "ConvertAPI", cat: "pdf-compression", quota: 250, url: "https://v2.convertapi.com" },
                      { name: "TinyPNG", cat: "image-tools", quota: 500, url: "https://api.tinify.com/shrink" },
                      { name: "Groq Whisper", cat: "audio-speech", quota: 14400, url: "https://api.groq.com/openai/v1/audio/transcriptions" },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setNewApiName(preset.name)
                          setNewApiCategory(preset.cat as any)
                          setNewApiQuota(preset.quota)
                          setNewApiEndpoint(preset.url)
                        }}
                        style={{
                          fontSize: "11px",
                          padding: "3px 9px",
                          borderRadius: "12px",
                          background: newApiName === preset.name ? "rgba(0,201,183,0.2)" : "rgba(255,255,255,0.06)",
                          border: newApiName === preset.name ? "1px solid #00C9B7" : "1px solid var(--border)",
                          color: newApiName === preset.name ? "#00C9B7" : "var(--text)",
                          cursor: "pointer",
                          fontWeight: 500,
                        }}
                      >
                        + {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newApiName.trim()) {
                      showToast("Please enter an API provider name.")
                      return
                    }
                    const newId = `custom-${Date.now()}`
                    const existingCat = cloudApis.filter((a) => a.category === newApiCategory)
                    const newPriority = existingCat.length + 1

                    const newApi: CloudApiConfig = {
                      id: newId,
                      name: newApiName.trim(),
                      provider: "custom",
                      category: newApiCategory,
                      priority: newPriority,
                      enabled: true,
                      description: "User-configured cloud API connected to Masterfilepro priority pool.",
                      endpoint: newApiEndpoint.trim() || undefined,
                      apiKey: newApiKey.trim() || undefined,
                      clientSecret: newApiSecret.trim() || undefined,
                      monthlyQuota: Number(newApiQuota) || 1000,
                      usedThisMonth: 0,
                      status: "active",
                      isFreeTier: true,
                    }

                    const updated = [...cloudApis, newApi]
                    setCloudApis(updated)
                    await saveCloudApis(updated)
                    setIsAddingCustomApi(false)
                    setNewApiName("")
                    setNewApiEndpoint("")
                    setNewApiKey("")
                    setNewApiSecret("")
                    showToast(`Connected "${newApi.name}" at Priority #${newPriority}!`)
                  }}
                  style={{
                    padding: "16px 20px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    flex: 1,
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        API Provider Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. CloudConvert, PDF.co"
                        value={newApiName}
                        onChange={(e) => setNewApiName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Service Category
                      </label>
                      <select
                        value={newApiCategory}
                        onChange={(e) => setNewApiCategory(e.target.value as any)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: "12px",
                        }}
                      >
                        <option value="pdf-compression">PDF Compression & Optimization</option>
                        <option value="ocr-text">OCR & Document Text Extraction</option>
                        <option value="image-tools">Image Optimization & Compression</option>
                        <option value="audio-speech">Audio Transcription & Speech</option>
                        <option value="ai-text">AI Summarization & Translation</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Endpoint URL / Base URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://api.service.com/v1"
                        value={newApiEndpoint}
                        onChange={(e) => setNewApiEndpoint(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Monthly Free Quota (Calls)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newApiQuota}
                        onChange={(e) => setNewApiQuota(Number(e.target.value))}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        API Key / Client ID / Public Key
                      </label>
                      <input
                        type="text"
                        placeholder="Paste your free API key here"
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Secret Key / Client Secret (Optional)
                      </label>
                      <input
                        type="password"
                        placeholder="Optional secret or token"
                        value={newApiSecret}
                        onChange={(e) => setNewApiSecret(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                  </div>

                  {/* Pinned Sticky Footer Actions */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                      marginTop: "auto",
                      borderTop: "1px solid var(--border)",
                      paddingTop: "12px",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setIsAddingCustomApi(false)}
                      style={{
                        padding: "7px 16px",
                        borderRadius: "6px",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontWeight: 500,
                        fontSize: "12px",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="primary"
                      style={{
                        padding: "7px 18px",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "12px",
                      }}
                    >
                      <Check size={14} /> Add to Priority Pool
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Compact Interactive Failover Execution Pipeline */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Layers size={15} color="#00C9B7" />
                <strong style={{ fontSize: "13px" }}>Failover Execution Order</strong>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  (Click dropdown or ◀ ▶ to change priorities)
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Activity size={12} /> Auto-Failover Active
              </span>
            </div>

            {/* Single horizontal compact row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                overflowX: "auto",
                padding: "4px 2px",
                scrollbarWidth: "thin",
              }}
            >
              {cloudApis
                .filter((a) => a.category === "pdf-compression" && a.enabled)
                .sort((a, b) => a.priority - b.priority)
                .map((api, idx, arr) => {
                  const isPrimary = api.priority === 1
                  const isExhausted =
                    api.status === "exhausted" ||
                    (api.monthlyQuota && api.usedThisMonth >= api.monthlyQuota)

                  return (
                    <React.Fragment key={api.id}>
                      <div
                        className={`api-pipeline-node ${isPrimary ? "is-primary" : ""}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 12px",
                          borderRadius: "8px",
                          background: isPrimary
                            ? "linear-gradient(135deg, rgba(0,201,183,0.18) 0%, rgba(59,130,246,0.12) 100%)"
                            : "var(--bg)",
                          border: isPrimary ? "1.5px solid #00C9B7" : "1px solid var(--border)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {/* Interactive Priority Selector Dropdown */}
                        <select
                          className="api-priority-select"
                          value={api.priority}
                          onChange={(e) =>
                            handleSetExactPriority(api.id, Number(e.target.value), "pdf-compression")
                          }
                          title="Click to set priority"
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: isPrimary ? "#00C9B7" : "var(--surface)",
                            color: isPrimary ? "#ffffff" : "var(--text)",
                            border: isPrimary ? "1px solid #00C9B7" : "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                        >
                          {arr.map((_, i) => (
                            <option
                              key={i + 1}
                              value={i + 1}
                              style={{
                                background: "var(--surface)",
                                color: "var(--text)",
                              }}
                            >
                              Priority #{i + 1}
                            </option>
                          ))}
                        </select>

                        {/* Quick Reorder Arrows */}
                        <div style={{ display: "inline-flex", gap: "2px" }}>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveApiPriority(api.id, "up", "pdf-compression").then(setCloudApis)}
                            style={{
                              background: "none",
                              border: "none",
                              color: idx === 0 ? "var(--muted)" : "var(--text)",
                              opacity: idx === 0 ? 0.35 : 1,
                              cursor: idx === 0 ? "default" : "pointer",
                              padding: "0 2px",
                              fontSize: "10px",
                              lineHeight: 1,
                            }}
                            title="Move earlier (higher priority)"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            disabled={idx === arr.length - 1}
                            onClick={() => moveApiPriority(api.id, "down", "pdf-compression").then(setCloudApis)}
                            style={{
                              background: "none",
                              border: "none",
                              color: idx === arr.length - 1 ? "var(--muted)" : "var(--text)",
                              opacity: idx === arr.length - 1 ? 0.35 : 1,
                              cursor: idx === arr.length - 1 ? "default" : "pointer",
                              padding: "0 2px",
                              fontSize: "10px",
                              lineHeight: 1,
                            }}
                            title="Move later (lower priority)"
                          >
                            ▶
                          </button>
                        </div>

                        {/* Name & remaining free calls */}
                        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                          <span style={{ fontSize: "12px", fontWeight: 600 }}>{api.name}</span>
                          <span style={{ fontSize: "10px", color: isExhausted ? "#f59e0b" : "var(--muted)" }}>
                            {api.provider === "local"
                              ? "Unlimited (Local)"
                              : `${Math.max(0, api.monthlyQuota - api.usedThisMonth)} calls left`}
                          </span>
                        </div>
                      </div>

                      {idx < arr.length - 1 && (
                        <span style={{ color: "#00C9B7", opacity: 0.6, fontSize: "12px", flexShrink: 0 }}>
                          ➔
                        </span>
                      )}
                    </React.Fragment>
                  )
                })}
            </div>
          </div>

          {/* Quick Reference: Verified Free API Accounts & Dashboard URLs Vault */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "18px 22px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Key size={16} color="#00C9B7" />
                <strong style={{ fontSize: "14px" }}>Verified Free API Key Dashboards & Direct Links</strong>
              </div>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                Click any dashboard link to view, copy, or refresh your free keys anytime.
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "10px",
              }}
            >
              {cloudApis.map((api) => {
                const hasKey = !!api.apiKey || api.provider === "local"
                return (
                  <div
                    key={api.id}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden" }}>
                      <strong style={{ fontSize: "12px", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                        {api.name}
                      </strong>
                      <span style={{ fontSize: "11px", color: hasKey ? "#10b981" : "var(--muted)" }}>
                        {api.provider === "local"
                          ? "In-Browser (No Key Needed)"
                          : hasKey
                            ? "✓ Active Key Installed"
                            : "Click link to get free key"}
                      </span>
                    </div>

                    {api.dashboardUrl ? (
                      <a
                        href={api.dashboardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="api-dashboard-badge"
                        style={{
                          fontSize: "11px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: "rgba(0,201,183,0.12)",
                          color: "#00C9B7",
                          border: "1px solid rgba(0,201,183,0.3)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          textDecoration: "none",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Dashboard <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span style={{ fontSize: "10px", color: "var(--muted)" }}>Internal</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              borderBottom: "1px solid var(--border)",
              paddingBottom: "12px",
            }}
          >
            {[
              { id: "all", label: `All Free APIs (${cloudApis.length})` },
              { id: "pdf-compression", label: `PDF Optimization (${cloudApis.filter((a) => a.category === "pdf-compression").length})` },
              { id: "ocr-text", label: `OCR & Extraction (${cloudApis.filter((a) => a.category === "ocr-text").length})` },
              { id: "image-tools", label: `Image Compression (${cloudApis.filter((a) => a.category === "image-tools").length})` },
              { id: "audio-speech", label: `Audio Transcription (${cloudApis.filter((a) => a.category === "audio-speech").length})` },
              { id: "ai-text", label: `AI & Translation (${cloudApis.filter((a) => a.category === "ai-text").length})` },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setApiCategoryFilter(cat.id)}
                className={`api-category-pill ${apiCategoryFilter === cat.id ? "is-active" : ""}`}
                style={{
                  fontSize: "12px",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: apiCategoryFilter === cat.id ? "1px solid #00C9B7" : "1px solid var(--border)",
                  background: apiCategoryFilter === cat.id ? "rgba(0,201,183,0.15)" : "var(--surface)",
                  color: apiCategoryFilter === cat.id ? "#00C9B7" : "var(--muted)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Section: API List based on Category Filter */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
                  {apiCategoryFilter === "all"
                    ? "All Configured Processing APIs & Failover Pool"
                    : apiCategoryFilter === "pdf-compression"
                      ? "PDF Compression & Optimization APIs (Priority Pipeline)"
                      : apiCategoryFilter === "ocr-text"
                        ? "OCR & Document Text Extraction APIs"
                        : apiCategoryFilter === "image-tools"
                          ? "Image Compression & Optimization APIs"
                          : apiCategoryFilter === "audio-speech"
                            ? "Audio Transcription & Speech APIs"
                            : "AI Summarization & Translation APIs"}
                </h3>
                <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 0 0" }}>
                  Use <strong>Move Up (▲)</strong> and <strong>Move Down (▼)</strong> to change which provider processes requests first.
                </p>
              </div>
            </div>

            {/* 2-Column Responsive Card Grid: Equal Stable Columns */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
                gap: "16px",
                alignItems: "start",
              }}
            >
              {cloudApis
                .filter((a) => apiCategoryFilter === "all" || a.category === apiCategoryFilter)
                .sort((a, b) => a.priority - b.priority)
                .map((api, index, filteredList) => {
                  const isFirst = index === 0
                  const isLast = index === filteredList.length - 1
                  const isTesting = testingApiId === api.id
                  const health = apiHealthResults[api.id]
                  const showSecret = !!showApiSecrets[api.id]
                  const isEditing = editingApiId === api.id
                  const isExhausted = api.monthlyQuota && api.usedThisMonth >= api.monthlyQuota
                  const quotaPercent = api.monthlyQuota
                    ? Math.min(100, Math.round((api.usedThisMonth / api.monthlyQuota) * 100))
                    : 0

                  return (
                    <div
                      key={api.id}
                      style={{
                        background: "var(--surface)",
                        border: api.priority === 1 ? "1.5px solid #00C9B7" : "1px solid var(--border)",
                        borderRadius: "12px",
                        padding: "16px 18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        minWidth: 0,
                        alignSelf: "start",
                        boxShadow: api.priority === 1 ? "0 4px 20px rgba(0,201,183,0.08)" : "none",
                      }}
                    >
                      {/* Top Bar: Priority Rank + Reorder + Name + Dashboard Link + Enable Switch */}
                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "8px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            {/* Priority Dropdown & Badge */}
                            <div
                              className={`api-priority-badge ${api.priority === 1 ? "is-primary" : ""}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 6px",
                                borderRadius: "6px",
                                background:
                                  api.priority === 1
                                    ? "linear-gradient(135deg, rgba(0,201,183,0.25) 0%, rgba(124,58,237,0.2) 100%)"
                                    : "rgba(255,255,255,0.06)",
                                border: api.priority === 1 ? "1px solid #00C9B7" : "1px solid var(--border)",
                              }}
                            >
                              <Zap size={12} className="api-priority-icon" color="#00C9B7" />
                              <select
                                className="api-priority-select"
                                value={api.priority}
                                onChange={(e) =>
                                  handleSetExactPriority(api.id, Number(e.target.value), api.category)
                                }
                                title="Set priority order"
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  background: "transparent",
                                  color: api.priority === 1 ? "#00E5D2" : "var(--text)",
                                  border: "none",
                                  cursor: "pointer",
                                  outline: "none",
                                  padding: 0,
                                }}
                              >
                                {filteredList.map((_, i) => (
                                  <option
                                    key={i + 1}
                                    value={i + 1}
                                    style={{
                                      background: "var(--surface)",
                                      color: "var(--text)",
                                    }}
                                  >
                                    #{i + 1} {i === 0 ? "• Primary" : i === 1 ? "• 2nd Failover" : "• Backup"}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Reorder Up/Down Buttons */}
                            <div style={{ display: "inline-flex", gap: "2px" }}>
                              <button
                                type="button"
                                title="Move priority up"
                                disabled={isFirst}
                                onClick={async () => {
                                  const updated = await moveApiPriority(api.id, "up", api.category)
                                  setCloudApis(updated)
                                  showToast(`Moved ${api.name} up to Priority #${api.priority - 1}`)
                                }}
                                style={{
                                  padding: "3px 6px",
                                  borderRadius: "4px",
                                  background: "var(--bg)",
                                  border: "1px solid var(--border)",
                                  color: isFirst ? "var(--muted)" : "var(--text)",
                                  cursor: isFirst ? "not-allowed" : "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  fontSize: "10px",
                                }}
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                type="button"
                                title="Move priority down"
                                disabled={isLast}
                                onClick={async () => {
                                  const updated = await moveApiPriority(api.id, "down", api.category)
                                  setCloudApis(updated)
                                  showToast(`Moved ${api.name} down to Priority #${api.priority + 1}`)
                                }}
                                style={{
                                  padding: "3px 6px",
                                  borderRadius: "4px",
                                  background: "var(--bg)",
                                  border: "1px solid var(--border)",
                                  color: isLast ? "var(--muted)" : "var(--text)",
                                  cursor: isLast ? "not-allowed" : "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  fontSize: "10px",
                                }}
                              >
                                <ArrowDown size={11} />
                              </button>
                            </div>

                            <strong style={{ fontSize: "14px", marginLeft: "2px" }}>{api.name}</strong>

                            {/* Dashboard Link Badge */}
                            {api.dashboardUrl && (
                              <a
                                href={api.dashboardUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="api-dashboard-badge"
                                style={{
                                  fontSize: "10px",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(0,201,183,0.12)",
                                  color: "#00C9B7",
                                  border: "1px solid rgba(0,201,183,0.25)",
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  fontWeight: 600,
                                }}
                              >
                                Dashboard ↗
                              </a>
                            )}
                          </div>

                          {/* Enable/Disable Toggle */}
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "11px",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={api.enabled}
                              onChange={async () => {
                                const updated = cloudApis.map((a) =>
                                  a.id === api.id ? { ...a, enabled: !a.enabled } : a,
                                )
                                setCloudApis(updated)
                                await saveCloudApis(updated)
                                showToast(`${api.name} is now ${!api.enabled ? "Enabled" : "Disabled"}.`)
                              }}
                            />
                            <span style={{ fontWeight: 600, color: api.enabled ? "#10b981" : "var(--muted)" }}>
                              {api.enabled ? "Enabled" : "Off"}
                            </span>
                          </label>
                        </div>

                        {/* Description */}
                        <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                          {api.description}
                        </p>
                      </div>

                      {/* Middle: Quota Progress Bar (for cloud APIs) */}
                      {api.provider !== "local" ? (
                        <div
                          style={{
                            background: "var(--bg)",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                            <span>
                              <strong>Usage:</strong> {api.usedThisMonth} of {api.monthlyQuota} free calls used
                            </span>
                            <span style={{ fontWeight: 600, color: isExhausted ? "#f59e0b" : "#10b981" }}>
                              {isExhausted ? "Exhausted (Failing over)" : `${100 - quotaPercent}% remaining`}
                            </span>
                          </div>
                          <div
                            style={{
                              height: "4px",
                              width: "100%",
                              background: "rgba(255,255,255,0.08)",
                              borderRadius: "4px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${quotaPercent}%`,
                                background: isExhausted
                                  ? "#f59e0b"
                                  : "linear-gradient(90deg, #10b981 0%, #3b82f6 100%)",
                                borderRadius: "4px",
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: "rgba(16,185,129,0.08)",
                            border: "1px solid rgba(16,185,129,0.2)",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            color: "#10b981",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <CheckCircle2 size={13} />
                          <span>Unlimited In-Browser Processing (Private & Zero-Cost)</span>
                        </div>
                      )}

                      {/* Credentials Box */}
                      {api.provider !== "local" && (
                        <div
                          style={{
                            padding: "8px 12px",
                            background: "rgba(0,0,0,0.15)",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            fontSize: "11px",
                          }}
                        >
                          {isEditing ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                              <div>
                                <label style={{ fontSize: "10px", display: "block", marginBottom: "3px", color: "var(--muted)" }}>
                                  {api.provider === "adobe" ? "Client ID" : "API Key"}
                                </label>
                                <input
                                  type="text"
                                  value={editApiKeyInput}
                                  onChange={(e) => setEditApiKeyInput(e.target.value)}
                                  style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "11px" }}
                                />
                              </div>
                              {api.clientSecret !== undefined && (
                                <div>
                                  <label style={{ fontSize: "10px", display: "block", marginBottom: "3px", color: "var(--muted)" }}>
                                    Client Secret
                                  </label>
                                  <input
                                    type="text"
                                    value={editApiSecretInput}
                                    onChange={(e) => setEditApiSecretInput(e.target.value)}
                                    style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "11px" }}
                                  />
                                </div>
                              )}
                              <div style={{ gridColumn: "1 / -1" }}>
                                <label style={{ fontSize: "10px", display: "block", marginBottom: "3px", color: "var(--muted)" }}>
                                  Monthly Quota (Calls)
                                </label>
                                <input
                                  type="number"
                                  value={editApiQuotaInput}
                                  onChange={(e) => setEditApiQuotaInput(Number(e.target.value))}
                                  style={{ width: "100%", padding: "5px 8px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "11px" }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                <div>
                                  <span style={{ color: "var(--muted)" }}>{api.provider === "adobe" ? "ID: " : "Key: "}</span>
                                  <code className="api-key-code" style={{ fontSize: "11px", color: "#00C9B7" }}>
                                    {showSecret ? api.apiKey : (api.apiKey ? `${api.apiKey.substring(0, 8)}••••` : "Not set")}
                                  </code>
                                </div>
                                {api.clientSecret && (
                                  <div>
                                    <span style={{ color: "var(--muted)" }}>Secret: </span>
                                    <code style={{ fontSize: "11px", color: "#3b82f6" }}>
                                      {showSecret ? api.clientSecret : "••••••••"}
                                    </code>
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowApiSecrets((prev) => ({ ...prev, [api.id]: !prev[api.id] }))}
                                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px" }}
                              >
                                {showSecret ? <EyeOff size={11} /> : <Eye size={11} />}
                                {showSecret ? "Hide" : "Reveal"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Live Health Status (if tested) */}
                      {health && (
                        <div
                          style={{
                            padding: "6px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            background: health.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                            color: health.ok ? "#10b981" : "#ef4444",
                            border: `1px solid ${health.ok ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                          }}
                        >
                          {health.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                          <span>{health.message}</span>
                        </div>
                      )}

                      {/* Bottom Footer Actions */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderTop: "1px solid var(--border)",
                          paddingTop: "10px",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", gap: "6px" }}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="primary"
                                onClick={async () => {
                                  const updated = cloudApis.map((a) => {
                                    if (a.id === api.id) {
                                      return {
                                        ...a,
                                        apiKey: editApiKeyInput.trim(),
                                        clientSecret: editApiSecretInput.trim() || undefined,
                                        monthlyQuota: editApiQuotaInput,
                                      }
                                    }
                                    return a
                                  })
                                  setCloudApis(updated)
                                  await saveCloudApis(updated)
                                  setEditingApiId(null)
                                  showToast(`${api.name} configuration saved.`)
                                }}
                                style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              >
                                <Save size={11} /> Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingApiId(null)}
                                style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "4px", background: "transparent", border: "1px solid var(--border)", color: "var(--text)", cursor: "pointer" }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            api.provider !== "local" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingApiId(api.id)
                                  setEditApiKeyInput(api.apiKey || "")
                                  setEditApiSecretInput(api.clientSecret || "")
                                  setEditApiQuotaInput(api.monthlyQuota || 500)
                                }}
                                style={{
                                  fontSize: "11px",
                                  padding: "5px 10px",
                                  borderRadius: "4px",
                                  background: "var(--bg)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  cursor: "pointer",
                                }}
                              >
                                <Edit2 size={11} /> Edit
                              </button>
                            )
                          )}

                          {api.provider !== "local" && (
                            <button
                              type="button"
                              onClick={async () => {
                                const updated = cloudApis.map((a) =>
                                  a.id === api.id ? { ...a, usedThisMonth: 0, status: "active" as const } : a,
                                )
                                setCloudApis(updated)
                                await saveCloudApis(updated)
                                showToast(`Reset usage for ${api.name}.`)
                              }}
                              style={{
                                fontSize: "10px",
                                padding: "5px 8px",
                                borderRadius: "4px",
                                background: "transparent",
                                border: "1px solid var(--border)",
                                color: "var(--muted)",
                                cursor: "pointer",
                              }}
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        {/* Test Connection Button */}
                        <button
                          type="button"
                          disabled={isTesting}
                          onClick={async () => {
                            setTestingApiId(api.id)
                            try {
                              const res = await testApiHealth(api)
                              setApiHealthResults((prev) => ({ ...prev, [api.id]: res }))
                              showToast(res.ok ? `${api.name}: ${res.message}` : `Test failed: ${res.message}`)
                            } catch (err: any) {
                              showToast(`Error: ${err.message}`)
                            } finally {
                              setTestingApiId(null)
                            }
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "5px 10px",
                            borderRadius: "4px",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            cursor: isTesting ? "wait" : "pointer",
                          }}
                        >
                          <RefreshCw size={11} className={isTesting ? "spin" : ""} />
                          {isTesting ? "Pinging..." : "Test Ping"}
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: ADMIN SETTINGS & DATABASE ENGINE
          ========================================================================= */}
      {activeTab === "settings" && (
        <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Header Overview Banner */}
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "12px",
              background:
                "linear-gradient(135deg, rgba(0, 201, 183, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%)",
              border: "1px solid rgba(0, 201, 183, 0.25)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <div
                className="admin-banner-tag"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#00E5D2",
                  marginBottom: "4px",
                }}
              >
                <Database size={13} /> Database-Backed Administration
              </div>
              <h2 style={{ margin: "2px 0 6px 0", fontSize: "20px", color: "var(--text)" }}>
                Administrator Security & Database Settings
              </h2>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)", maxWidth: "680px" }}>
                Update your administrator email, name, or password at any time. All configuration
                changes are backed by the server disk database (<code>data/fluxkit-db.json</code>)
                and mirrored to browser IndexedDB for offline resilience.
              </p>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "20px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#10b981",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 8px #10b981",
                }}
              />
              Database Status: Healthy & Synced
            </div>
          </div>

          {/* Database Diagnostics & Storage Card */}
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <h3 style={{ fontSize: "15px", margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: "8px" }}>
              <Server size={16} color="#3b82f6" /> Database Engine & Persistence Layer
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  Primary Database Engine
                </span>
                <strong style={{ fontSize: "13px", color: "var(--text)", marginTop: "4px", display: "block" }}>
                  {dbStatus?.engine || "Server Disk Database (JSON/IndexedDB)"}
                </strong>
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  Database File Location
                </span>
                <strong style={{ fontSize: "12px", color: "#00C9B7", fontFamily: "monospace", marginTop: "4px", display: "block" }}>
                  data/fluxkit-db.json
                </strong>
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  Total Persisted Users
                </span>
                <strong style={{ fontSize: "13px", color: "var(--text)", marginTop: "4px", display: "block" }}>
                  {userList.length} Registered Accounts
                </strong>
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  Client IndexedDB Engine
                </span>
                <strong style={{ fontSize: "13px", color: "#10b981", marginTop: "4px", display: "block" }}>
                  IndexedDB Active (fluxkit_admin_db)
                </strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const status = await initializeDatabaseSync()
                    setDbStatus(status)
                    showToast("Database synchronization verified successfully.")
                  } catch (err: any) {
                    showToast("Failed to verify database: " + err.message)
                  }
                }}
                style={{
                  fontSize: "12px",
                  padding: "7px 14px",
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
                <RefreshCw size={13} /> Test Database Connection
              </button>

              <button
                type="button"
                onClick={() => {
                  const backup = {
                    admin: getAdminConfig(),
                    users: userList,
                    exportedAt: new Date().toISOString(),
                    engine: "Masterfilepro Database",
                  }
                  const blob = new Blob([JSON.stringify(backup, null, 2)], {
                    type: "application/json",
                  })
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement("a")
                  link.href = url
                  link.download = `masterfilepro-database-backup-${Date.now()}.json`
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  URL.revokeObjectURL(url)
                  showToast("Database backup downloaded successfully.")
                }}
                style={{
                  fontSize: "12px",
                  padding: "7px 14px",
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
                <Database size={13} /> Export Database Backup (.json)
              </button>
            </div>
          </div>

          {/* Edit Admin Credentials Form */}
          <div
            style={{
              padding: "24px",
              borderRadius: "12px",
              background: "var(--surface)",
              border: "1px solid rgba(0, 201, 183, 0.35)",
            }}
          >
            <h3 style={{ fontSize: "16px", margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: "8px" }}>
              <Lock size={16} color="#00C9B7" /> Change Administrator Credentials (At Any Time)
            </h3>
            <p style={{ fontSize: "12.5px", color: "var(--muted)", margin: "0 0 20px 0" }}>
              Enter your updated details below. Once saved, you can immediately sign in with the new email and password.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setAdminSaving(true)
                setAdminSaveStatus(null)

                try {
                  if (adminPassInput && adminPassInput !== adminConfirmPassInput) {
                    throw new Error("New password and confirmation do not match.")
                  }
                  if (adminPassInput && adminPassInput.length < 8) {
                    throw new Error("New password must be at least 8 characters long.")
                  }

                  const res = await updateAdminSettings({
                    newName: adminNameInput,
                    newEmail: adminEmailInput,
                    newPassword: adminPassInput || undefined,
                    overrideAuthCheck: true,
                  })

                  setAdminConfig(getAdminConfig())
                  setAdminSaveStatus({ type: "success", msg: res.message })
                  showToast(res.message)
                  setAdminPassInput("")
                  setAdminConfirmPassInput("")
                } catch (err: any) {
                  setAdminSaveStatus({
                    type: "error",
                    msg: err.message || "Failed to update administrator settings.",
                  })
                  showToast(err.message || "Failed to update administrator settings.")
                } finally {
                  setAdminSaving(false)
                }
              }}
              style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "700px" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                    Administrator Display Name
                  </label>
                  <input
                    required
                    type="text"
                    value={adminNameInput}
                    onChange={(e) => setAdminNameInput(e.target.value)}
                    placeholder="e.g. Masterfilepro Administrator"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13px",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                    Administrator Email Address
                  </label>
                  <input
                    required
                    type="email"
                    value={adminEmailInput}
                    onChange={(e) => setAdminEmailInput(e.target.value)}
                    placeholder="e.g. admin@masterfilepro.com"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13px",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                    New Password (optional)
                  </label>
                  <input
                    type={adminShowPassText ? "text" : "password"}
                    value={adminPassInput}
                    onChange={(e) => setAdminPassInput(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13px",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                    Confirm New Password
                  </label>
                  <input
                    type={adminShowPassText ? "text" : "password"}
                    value={adminConfirmPassInput}
                    onChange={(e) => setAdminConfirmPassInput(e.target.value)}
                    placeholder="Re-type new password"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13px",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setAdminShowPassText(!adminShowPassText)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: 0,
                  }}
                >
                  {adminShowPassText ? <EyeOff size={14} /> : <Eye size={14} />}
                  {adminShowPassText ? "Hide Passwords" : "Show Passwords"}
                </button>

                <button
                  type="submit"
                  disabled={adminSaving}
                  className="primary"
                  style={{
                    padding: "9px 20px",
                    fontSize: "13px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Save size={14} />
                  {adminSaving ? "Saving to Database..." : "Save Changes to Database"}
                </button>
              </div>

              {adminSaveStatus && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    fontSize: "12.5px",
                    background:
                      adminSaveStatus.type === "success"
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(239, 68, 68, 0.12)",
                    border: `1px solid ${adminSaveStatus.type === "success"
                        ? "rgba(16, 185, 129, 0.3)"
                        : "rgba(239, 68, 68, 0.3)"
                      }`,
                    color: adminSaveStatus.type === "success" ? "#10b981" : "#ef4444",
                  }}
                >
                  {adminSaveStatus.msg}
                </div>
              )}
            </form>
          </div>

          {/* Emergency Factory Reset Card */}
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "10px",
              background: "rgba(245, 158, 11, 0.05)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <strong style={{ fontSize: "13px", color: "#fbbf24", display: "block" }}>
                Emergency Factory Reset
              </strong>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                Reset administrator credentials to the factory default (<code>admin@masterfilepro.com</code> / <code>Admin@Masterfilepro2026!</code>).
              </span>
            </div>

            <button
              type="button"
              onClick={async () => {
                if (
                  window.confirm(
                    "Are you sure you want to reset administrator credentials to factory defaults (admin@masterfilepro.com)?",
                  )
                ) {
                  try {
                    await updateAdminSettings({
                      newName: "Masterfilepro Administrator",
                      newEmail: "admin@masterfilepro.com",
                      newPassword: "Admin@FluxKit2026!",
                      overrideAuthCheck: true,
                    })
                    setAdminConfig(getAdminConfig())
                    setAdminNameInput("Masterfilepro Administrator")
                    setAdminEmailInput("admin@masterfilepro.com")
                    showToast("Administrator credentials reset to default.")
                  } catch (err: any) {
                    showToast(err.message || "Failed to reset.")
                  }
                }
              }}
              style={{
                fontSize: "12px",
                padding: "6px 14px",
                borderRadius: "6px",
                background: "var(--bg)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                color: "#fbbf24",
                cursor: "pointer",
              }}
            >
              Reset to Factory Default
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
