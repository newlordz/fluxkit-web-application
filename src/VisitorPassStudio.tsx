import React, { useState, useEffect, useRef } from "react"

import QRCode from "qrcode"

import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

import {
  IdCard,
  Printer,
  Download,
  QrCode,
  ShieldCheck,
  Building2,
  Calendar,
  Clock,
  UserCheck,
  Wifi,
  Car,
  FileBadge,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Camera,
  Upload,
  Scan,
  Copy,
  FileSpreadsheet,
  History,
  Smartphone,
  CreditCard,
  ChevronLeft,
  Search,
  X,
  RefreshCw,
  FileText,
  Trash2,
  Check,
  User,
} from "lucide-react"

import { useNotify } from "./Notifications"
import { getCurrentUser, type UserAccount } from "./authService"
import { getToolPaymentStatus } from "./adminService"
import { fetchVisitorLog, pushVisitorLogChanges } from "./visitorService"

export type BadgeFormat = "cr80" | "clip" | "mobile" | "a4"

export type AccessTier = "general" | "vip" | "contractor" | "interview" | "restricted"

export interface VisitorRecord {
  id: string

  fullName: string

  organization: string

  email: string

  phone: string

  vehiclePlate: string

  hostName: string

  hostDepartment: string

  location: string

  facilityLocation?: string

  tier: AccessTier

  visitDate: string

  timeIn: string

  timeOut: string

  actualCheckIn?: string

  actualCheckOut?: string

  wifiGranted: boolean

  wifiSsid: string

  wifiPassword: string

  ndaAccepted: boolean

  photoUrl: string

  status: "Checked-In" | "Expected" | "Checked-Out"

  createdAt: string

  securityToken: string
}

interface VisitorPassStudioProps {
  navigate?: (route: string) => void

  onComplete?: () => void

  currentUser?: UserAccount | null
}

const TIER_CONFIG: Record<AccessTier, {
  label: string
  color: string
  bg: string
  border: string
  text: string
}> = {
  general: {
    label: "GENERAL VISITOR",

    color: "#00C9B7",

    bg: "rgba(0, 201, 183, 0.12)",

    border: "#00C9B7",

    text: "#0f766e",
  },

  vip: {
    label: "VIP EXECUTIVE",

    color: "#8b5cf6",

    bg: "rgba(139, 92, 246, 0.14)",

    border: "#8b5cf6",

    text: "#7c3aed",
  },

  contractor: {
    label: "CONTRACTOR / VENDOR",

    color: "#f59e0b",

    bg: "rgba(245, 158, 11, 0.14)",

    border: "#f59e0b",

    text: "#b45309",
  },

  interview: {
    label: "CANDIDATE INTERVIEW",

    color: "#10b981",

    bg: "rgba(16, 185, 129, 0.14)",

    border: "#10b981",

    text: "#065f46",
  },

  restricted: {
    label: "ESCORT REQUIRED",

    color: "#ef4444",

    bg: "rgba(239, 68, 68, 0.14)",

    border: "#ef4444",

    text: "#991b1b",
  },
}

const BRAND_THEMES = [
  { id: "navy", name: "Corporate Navy", primary: "#0A2558", accent: "#00C9B7" },

  { id: "teal", name: "Emerald Teal", primary: "#064e3b", accent: "#10b981" },

  { id: "indigo", name: "Royal Indigo", primary: "#312e81", accent: "#6366f1" },

  {
    id: "crimson",
    name: "Executive Crimson",
    primary: "#881337",
    accent: "#f43f5e",
  },

  { id: "carbon", name: "Slate Carbon", primary: "#0f172a", accent: "#38bdf8" },
]

export default function VisitorPassStudio({
  navigate,
  onComplete,
  currentUser,
}: VisitorPassStudioProps) {
  const notify = useNotify()

  // Primary active studio tab

  const [activeTab, setActiveTab] = useState<"designer" | "log" | "verifier">(
    "designer",
  )

  // Selected badge format preset

  const [badgeFormat, setBadgeFormat] = useState<BadgeFormat>("cr80")

  // Company / Facility branding

  const [companyName, setCompanyName] = useState("Masterfile Enterprises Inc.")

  const [facilityLocation, setFacilityLocation] = useState(
    "Global Headquarters · Floor 14",
  )

  const [selectedTheme, setSelectedTheme] = useState(BRAND_THEMES[0])

  // Visitor fields (initialized blank for new entry)

  const [passId, setPassId] = useState(
    () => `VP-${Math.floor(1000 + Math.random() * 9000)}`,
  )

  const [fullName, setFullName] = useState("")

  const [organization, setOrganization] = useState("")

  const [email, setEmail] = useState("")

  const [phone, setPhone] = useState("")

  const [vehiclePlate, setVehiclePlate] = useState("")

  const [photoDataUrl, setPhotoDataUrl] = useState<string>("")

  // Host details (initialized blank for new entry)

  const [hostName, setHostName] = useState("")

  const [hostDepartment, setHostDepartment] = useState("")

  const [meetingRoom, setMeetingRoom] = useState("")

  // Access & Security

  const [accessTier, setAccessTier] = useState<AccessTier>("vip")

  const [visitDate, setVisitDate] = useState(
    () => new Date().toISOString().split("T")[0],
  )

  const [timeIn, setTimeIn] = useState("08:30")

  const [timeOut, setTimeOut] = useState("17:30")

  const [wifiGranted, setWifiGranted] = useState(true)

  const [wifiSsid, setWifiSsid] = useState("Masterfile-Guest")

  const [wifiPassword, setWifiPassword] = useState("Welcome@2026!")

  const [ndaAccepted, setNdaAccepted] = useState(true)

  // Pass initial arrival status: Checked-In vs Expected (pre-registration)
  const [passStatus, setPassStatus] = useState<"Checked-In" | "Expected">(
    "Checked-In",
  )

  // QR Code preview

  const [qrDataUrl, setQrDataUrl] = useState<string>("")

  const [isExporting, setIsExporting] = useState(false)

  const [copiedWifi, setCopiedWifi] = useState(false)

  // Visitor log state

  const [visitorLog, setVisitorLog] = useState<VisitorRecord[]>([])

  const [logSearchQuery, setLogSearchQuery] = useState("")

  const [statusFilter, setStatusFilter] = useState<string>("All")

  // Verifier state

  const [verifyInput, setVerifyInput] = useState("")

  const [verifiedRecord, setVerifiedRecord] = useState<VisitorRecord | null>(
    null,
  )

  const [verifyStatus, setVerifyStatus] =
    useState<"idle" | "valid" | "not_found">("idle")

  const fileInputRef = useRef<HTMLInputElement>(null)

  const badgeCardRef = useRef<HTMLDivElement>(null)

  // Generate unique pass ID

  const regeneratePassId = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000)

    setPassId(`VP-${randomNum}`)
  }

  // Clear all visitor and host fields so form is completely blank

  const handleClearForm = () => {
    setFullName("")

    setOrganization("")

    setEmail("")

    setPhone("")

    setVehiclePlate("")

    setPhotoDataUrl("")

    setHostName("")

    setHostDepartment("")

    setMeetingRoom("")

    setPassStatus("Checked-In")

    regeneratePassId()

    notify("Visitor form cleared.", "info")
  }

  // Load the shared facility log on mount, then keep localStorage as the offline copy

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const remote = await fetchVisitorLog()

      if (!cancelled && remote.ok) {
        // An empty answer from the server is still authoritative: it means the
        // cache is holding records that were deleted or issued on another device.
        setVisitorLog(remote.records)

        try {
          localStorage.setItem(
            "masterfilepro_visitor_log",
            JSON.stringify(remote.records),
          )
        } catch {
          /* ignore */
        }

        return
      }

      try {
        const stored = localStorage.getItem("masterfilepro_visitor_log")

        if (stored) {
          setVisitorLog(JSON.parse(stored))
        } else {
          // Seed default high-quality corporate records

          const initialLog: VisitorRecord[] = [
            {
              id: "VP-8492",

              fullName: "Dr. Sarah Jenkins",

              organization: "Apex Quantum Technologies",

              email: "sarah.jenkins@apexquantum.io",

              phone: "+1 (555) 382-9014",

              vehiclePlate: "7XYZ942",

              hostName: "David Vance",

              hostDepartment: "Strategic Architecture",

              location: "Executive Boardroom C",

              tier: "vip",

              visitDate: new Date().toISOString().split("T")[0],

              timeIn: "08:30",

              timeOut: "17:30",

              wifiGranted: true,

              wifiSsid: "Masterfile-Guest",

              wifiPassword: "Welcome@2026!",

              ndaAccepted: true,

              photoUrl: "",

              status: "Checked-In",

              createdAt: new Date().toISOString(),

              securityToken: "SEC-90218A",
            },

            {
              id: "VP-7319",

              fullName: "Marcus Holloway",

              organization: "Cisco Infrastructure Team",

              email: "mholloway@contractor.net",

              phone: "+1 (555) 831-2940",

              vehiclePlate: "9KLM831",

              hostName: "Elena Rostova",

              hostDepartment: "Network & Security",

              location: "Server Room B · Basement 1",

              tier: "contractor",

              visitDate: new Date().toISOString().split("T")[0],

              timeIn: "09:00",

              timeOut: "16:00",

              wifiGranted: true,

              wifiSsid: "Masterfile-Guest",

              wifiPassword: "Welcome@2026!",

              ndaAccepted: true,

              photoUrl: "",

              status: "Checked-In",

              createdAt: new Date().toISOString(),

              securityToken: "SEC-48194B",
            },

            {
              id: "VP-6204",

              fullName: "Chloe Zhang",

              organization: "Independent Candidate",

              email: "chloe.zhang@alumni.mit.edu",

              phone: "+1 (555) 193-4820",

              vehiclePlate: "",

              hostName: "Julian Barnes",

              hostDepartment: "People Operations",

              location: "Interview Room 4",

              tier: "interview",

              visitDate: new Date().toISOString().split("T")[0],

              timeIn: "11:00",

              timeOut: "13:00",

              wifiGranted: false,

              wifiSsid: "",

              wifiPassword: "",

              ndaAccepted: true,

              photoUrl: "",

              status: "Expected",

              createdAt: new Date().toISOString(),

              securityToken: "SEC-37189C",
            },
          ]

          setVisitorLog(initialLog)

          localStorage.setItem(
            "masterfilepro_visitor_log",
            JSON.stringify(initialLog),
          )
        }
      } catch {
        // Local storage fallback
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const writeLocalLog = (records: VisitorRecord[]) => {
    try {
      localStorage.setItem("masterfilepro_visitor_log", JSON.stringify(records))
    } catch {
      /* ignore */
    }
  }

  // Save log whenever updated

  const persistLog = (updated: VisitorRecord[]) => {
    const previous = visitorLog

    setVisitorLog(updated)

    writeLocalLog(updated)

    void pushVisitorLogChanges(previous, updated).then((synced) => {
      if (!synced)
        notify(
          "Visitor log saved locally. It will sync when you are signed in.",
          "info",
        )
    })
  }

  // Generate authentic QR code payload whenever details change

  useEffect(() => {
    const payload = JSON.stringify({
      protocol: "MASTERFILEPASS/1.0",

      id: passId,

      name: fullName,

      org: organization,

      host: hostName,

      dept: hostDepartment,

      tier: accessTier.toUpperCase(),

      date: visitDate,

      validUntil: timeOut,

      wifi: wifiGranted ? wifiSsid : null,

      sec: "AUTHENTIC-CRYPTO-SIGNATURE",
    })

    QRCode.toDataURL(payload, {
      width: 320,

      margin: 1,

      color: {
        dark: "#06204D",

        light: "#FFFFFF",
      },

      errorCorrectionLevel: "M",
    })

      .then((url) => setQrDataUrl(url))

      .catch((err) => console.error("QR Code Error:", err))
  }, [
    passId,
    fullName,
    organization,
    hostName,
    hostDepartment,
    accessTier,
    visitDate,
    timeOut,
    wifiGranted,
    wifiSsid,
  ])

  // Handle Photo File Upload

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith("image/")) {
      notify("Please select a valid image file (JPG, PNG, WebP).", "error")

      return
    }

    const reader = new FileReader()

    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        setPhotoDataUrl(event.target.result)

        notify("Visitor portrait updated successfully.", "success")
      }
    }

    reader.readAsDataURL(file)
  }

  // Issue Pass (Checked-In or Expected) and Save to Visitor Log
  const handleIssuePass = (statusOverride?: "Checked-In" | "Expected") => {
    const finalStatus = statusOverride || passStatus
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

    const newRecord: VisitorRecord = {
      id: passId,
      fullName: fullName.trim() || "Guest Visitor",
      organization: organization.trim() || "Independent",
      email: email.trim(),
      phone: phone.trim(),
      vehiclePlate: vehiclePlate.trim().toUpperCase(),
      hostName: hostName.trim() || "Reception Desk",
      hostDepartment: hostDepartment.trim() || "Front Lobby",
      location: meetingRoom.trim() || "Main Facility",
      facilityLocation: facilityLocation.trim(),
      tier: accessTier,
      visitDate,
      timeIn,
      timeOut,
      actualCheckIn: finalStatus === "Checked-In" ? currentTime : undefined,
      actualCheckOut: undefined,
      wifiGranted,
      wifiSsid,
      wifiPassword,
      ndaAccepted,
      photoUrl: photoDataUrl,
      status: finalStatus,
      createdAt: new Date().toISOString(),
      securityToken: `SEC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    }

    const existingIdx = visitorLog.findIndex((r) => r.id === passId)
    let updated: VisitorRecord[] = []
    if (existingIdx >= 0) {
      updated = [...visitorLog]
      updated[existingIdx] = newRecord
    } else {
      updated = [newRecord, ...visitorLog]
    }

    persistLog(updated)

    if (finalStatus === "Checked-In") {
      notify(`Pass ${passId} issued and checked in on premises!`, "success")
    } else {
      notify(
        `Pass ${passId} pre-registered as Expected for ${visitDate}.`,
        "success",
      )
    }

    if (onComplete) onComplete()
  }

  // Alias for backward compatibility
  const handleIssueAndCheckIn = () => handleIssuePass("Checked-In")

  // Load a record from log into the designer with 100% of its fields
  const handleViewBadge = (record: VisitorRecord) => {
    setPassId(record.id)
    setFullName(record.fullName || "")
    setOrganization(record.organization || "")
    setEmail(record.email || "")
    setPhone(record.phone || "")
    setVehiclePlate(record.vehiclePlate || "")
    setPhotoDataUrl(record.photoUrl || "")
    setHostName(record.hostName || "")
    setHostDepartment(record.hostDepartment || "")
    setMeetingRoom(record.location || "")
    if (record.facilityLocation) setFacilityLocation(record.facilityLocation)
    setAccessTier(record.tier || "general")
    setVisitDate(record.visitDate || new Date().toISOString().split("T")[0])
    setTimeIn(record.timeIn || "08:30")
    setTimeOut(record.timeOut || "17:30")
    setWifiGranted(Boolean(record.wifiGranted))
    setWifiSsid(record.wifiSsid || "Masterfile-Guest")
    setWifiPassword(record.wifiPassword || "")
    setNdaAccepted(Boolean(record.ndaAccepted))
    setPassStatus(record.status === "Expected" ? "Expected" : "Checked-In")
    setActiveTab("designer")
    notify(`Loaded pass ${record.id} for ${record.fullName}.`, "info")
  }

  // Direct check-in from log or verifier
  const handleCheckInRecord = (id: string) => {
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    const updated = visitorLog.map((r) =>
      r.id === id
        ? { ...r, status: "Checked-In" as const, actualCheckIn: currentTime }
        : r,
    )
    persistLog(updated)
    const target = visitorLog.find((r) => r.id === id)
    notify(
      `Visitor ${target?.fullName || id} checked in at ${currentTime}.`,
      "success",
    )
    if (verifiedRecord?.id === id) {
      setVerifiedRecord((prev) =>
        prev
          ? { ...prev, status: "Checked-In", actualCheckIn: currentTime }
          : null,
      )
    }
  }

  // Direct check-out from log or verifier
  const handleCheckOutRecord = (id: string) => {
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    const updated = visitorLog.map((r) =>
      r.id === id
        ? { ...r, status: "Checked-Out" as const, actualCheckOut: currentTime }
        : r,
    )
    persistLog(updated)
    const target = visitorLog.find((r) => r.id === id)
    notify(
      `Visitor ${target?.fullName || id} checked out at ${currentTime}.`,
      "info",
    )
    if (verifiedRecord?.id === id) {
      setVerifiedRecord((prev) =>
        prev
          ? { ...prev, status: "Checked-Out", actualCheckOut: currentTime }
          : null,
      )
    }
  }

  // Delete a single record from log
  const handleDeleteRecord = (id: string, name: string) => {
    if (window.confirm(`Delete visitor record for ${name} (${id})?`)) {
      const updated = visitorLog.filter((r) => r.id !== id)
      persistLog(updated)
      if (verifiedRecord?.id === id) {
        setVerifiedRecord(null)
        setVerifyStatus("idle")
      }
      notify(`Record ${id} removed.`, "info")
    }
  }

  // Clear checked-out records
  const handleClearCheckedOut = () => {
    const checkedOutCount = visitorLog.filter(
      (r) => r.status === "Checked-Out",
    ).length
    if (checkedOutCount === 0) {
      notify("No checked-out records to clear.", "info")
      return
    }
    if (
      window.confirm(
        `Remove ${checkedOutCount} completed/checked-out records from the log?`,
      )
    ) {
      const updated = visitorLog.filter((r) => r.status !== "Checked-Out")
      persistLog(updated)
      notify(`Cleared ${checkedOutCount} completed records.`, "success")
    }
  }

  // Print Badge directly

  const handlePrintBadge = () => {
    window.print()

    notify("Printing visitor pass...", "info")

    if (onComplete) onComplete()
  }

  // Export as High-Resolution Vector PDF via pdf-lib

  const handleExportPDF = async () => {
    try {
      setIsExporting(true)

      notify("Compiling vector PDF badge with security watermark...", "info")

      const pdfDoc = await PDFDocument.create()

      // Standard CR80 badge dimension: 85.6mm x 54mm portrait = 242.6pt x 385.5pt (or landscape 385.5pt x 242.6pt)

      // A4 Sheet: 595.28pt x 841.89pt

      let page

      if (badgeFormat === "a4") {
        page = pdfDoc.addPage([595.28, 841.89])
      } else if (badgeFormat === "clip") {
        // 4" x 3" Badge = 288pt x 216pt

        page = pdfDoc.addPage([288, 216])
      } else {
        // CR80 Portrait = 242.6pt x 385.5pt

        page = pdfDoc.addPage([242.6, 385.5])
      }

      const { width, height } = page.getSize()

      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)

      // Hex to rgb helper

      const hexToRgb = (hex: string) => {
        const cleaned = hex.replace("#", "")

        const num = parseInt(cleaned, 16)

        return rgb(
          ((num >> 16) & 255) / 255,
          ((num >> 8) & 255) / 255,
          (num & 255) / 255,
        )
      }

      const primaryColor = hexToRgb(selectedTheme.primary)

      const accentColor = hexToRgb(selectedTheme.accent)

      if (badgeFormat === "a4") {
        // Full A4 Security & Parking Pass

        page.drawRectangle({
          x: 0,

          y: height - 100,

          width: width,

          height: 100,

          color: primaryColor,
        })

        page.drawText(companyName.toUpperCase(), {
          x: 40,

          y: height - 45,

          size: 18,

          font: fontBold,

          color: rgb(1, 1, 1),
        })

        page.drawText(
          `OFFICIAL FACILITY VISITOR & PARKING PASS · ID: ${passId}`,
          {
            x: 40,

            y: height - 70,

            size: 11,

            font: fontRegular,

            color: accentColor,
          },
        )

        // Draw Badges section

        page.drawText("VISITOR PARTICULARS", {
          x: 40,

          y: height - 130,

          size: 12,

          font: fontBold,

          color: primaryColor,
        })

        const details = [
          `Visitor: ${fullName}`,

          `Organization: ${organization}`,

          `Host: ${hostName} (${hostDepartment})`,

          `Destination: ${meetingRoom}`,

          `Access Classification: ${TIER_CONFIG[accessTier].label}`,

          `Valid Date: ${visitDate} (${timeIn} - ${timeOut})`,

          `NDA Compliance: ${ndaAccepted ? "Verified & Signed" : "Pending"}`,
        ]

        let curY = height - 155

        for (const line of details) {
          page.drawText(line, {
            x: 40,

            y: curY,

            size: 10,

            font: fontRegular,

            color: rgb(0.1, 0.15, 0.25),
          })

          curY -= 18
        }

        // Embed QR Code

        if (qrDataUrl) {
          const qrImage = await pdfDoc.embedPng(qrDataUrl)

          page.drawImage(qrImage, {
            x: width - 180,

            y: height - 260,

            width: 140,

            height: 140,
          })

          page.drawText("SCAN TO VERIFY PASS", {
            x: width - 170,

            y: height - 275,

            size: 8,

            font: fontBold,

            color: primaryColor,
          })
        }

        // Parking Permit Box (Cut-out)

        page.drawRectangle({
          x: 40,

          y: 80,

          width: width - 80,

          height: 180,

          borderColor: primaryColor,

          borderWidth: 2,

          borderDashArray: [6, 4],

          color: rgb(0.97, 0.98, 1),
        })

        page.drawText("FOLD & PLACE ON VEHICLE DASHBOARD", {
          x: 60,

          y: 235,

          size: 12,

          font: fontBold,

          color: primaryColor,
        })

        page.drawText(
          `VEHICLE LICENSE PLATE: ${vehiclePlate || "NO REGISTERED VEHICLE"}`,
          {
            x: 60,

            y: 210,

            size: 16,

            font: fontBold,

            color: accentColor,
          },
        )

        page.drawText(
          `Authorized by ${companyName} Security Directorate · Valid on ${visitDate} only`,

          {
            x: 60,

            y: 185,

            size: 9,

            font: fontRegular,

            color: rgb(0.3, 0.35, 0.4),
          },
        )
      } else {
        // CR80 or Clip Badge

        const headerHeight = badgeFormat === "clip" ? 50 : 70

        page.drawRectangle({
          x: 0,

          y: height - headerHeight,

          width: width,

          height: headerHeight,

          color: primaryColor,
        })

        page.drawText(companyName.toUpperCase().slice(0, 30), {
          x: 16,

          y: height - 28,

          size: badgeFormat === "clip" ? 10 : 11,

          font: fontBold,

          color: rgb(1, 1, 1),
        })

        page.drawText(TIER_CONFIG[accessTier].label, {
          x: 16,

          y: height - (badgeFormat === "clip" ? 42 : 50),

          size: 9,

          font: fontBold,

          color: accentColor,
        })

        // Visitor Name

        page.drawText(fullName.slice(0, 26), {
          x: 16,

          y: height - (headerHeight + 25),

          size: 15,

          font: fontBold,

          color: primaryColor,
        })

        page.drawText(organization.slice(0, 32), {
          x: 16,

          y: height - (headerHeight + 40),

          size: 10,

          font: fontRegular,

          color: rgb(0.4, 0.45, 0.5),
        })

        // Host info

        page.drawText(`HOST: ${hostName}`, {
          x: 16,

          y: height - (headerHeight + 60),

          size: 9,

          font: fontBold,

          color: rgb(0.2, 0.25, 0.3),
        })

        page.drawText(`DATE: ${visitDate} · PASS ${passId}`, {
          x: 16,

          y: height - (headerHeight + 75),

          size: 8,

          font: fontRegular,

          color: rgb(0.4, 0.45, 0.5),
        })

        // Embed QR Code

        if (qrDataUrl) {
          const qrImage = await pdfDoc.embedPng(qrDataUrl)

          const qrSize = badgeFormat === "clip" ? 75 : 95

          page.drawImage(qrImage, {
            x: width - qrSize - 16,

            y: 16,

            width: qrSize,

            height: qrSize,
          })
        }
      }

      const pdfBytes = await pdfDoc.save()

      const blob = new Blob([pdfBytes as any], { type: "application/pdf" })

      const url = URL.createObjectURL(blob)

      const a = document.createElement("a")

      a.href = url

      a.download = `${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_Visitor_Pass_${passId}.pdf`

      a.click()

      URL.revokeObjectURL(url)

      notify(
        "Vector PDF badge generated and downloaded successfully!",
        "success",
      )

      if (onComplete) onComplete()
    } catch (err) {
      console.error(err)

      notify("Failed to generate PDF badge. Please try again.", "error")
    } finally {
      setIsExporting(false)
    }
  }

  // Export Visitor Log as CSV

  const handleExportCSV = () => {
    if (visitorLog.length === 0) {
      notify("Visitor log is currently empty.", "info")

      return
    }

    const headers = [
      "Pass ID",
      "Visitor Name",
      "Organization",
      "Email",
      "Phone",
      "License Plate",
      "Host Name",
      "Department",
      "Campus / Facility",
      "Destination Room",
      "Access Tier",
      "Visit Date",
      "Scheduled Time",
      "Actual Check-In",
      "Actual Check-Out",
      "Wi-Fi Granted",
      "NDA Accepted",
      "Status",
      "Security Token",
    ]

    const rows = visitorLog.map((r) => [
      `"${r.id}"`,
      `"${r.fullName.replace(/"/g, '""')}"`,
      `"${r.organization.replace(/"/g, '""')}"`,
      `"${r.email}"`,
      `"${r.phone}"`,
      `"${r.vehiclePlate}"`,
      `"${r.hostName.replace(/"/g, '""')}"`,
      `"${r.hostDepartment.replace(/"/g, '""')}"`,
      `"${(r.facilityLocation || "").replace(/"/g, '""')}"`,
      `"${r.location.replace(/"/g, '""')}"`,
      `"${TIER_CONFIG[r.tier]?.label || r.tier}"`,
      `"${r.visitDate}"`,
      `"${r.timeIn} - ${r.timeOut}"`,
      `"${r.actualCheckIn || ""}"`,
      `"${r.actualCheckOut || ""}"`,
      r.wifiGranted ? "YES" : "NO",
      r.ndaAccepted ? "YES" : "NO",
      `"${r.status}"`,
      `"${r.securityToken}"`,
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\r\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })

    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")

    a.href = url

    a.download = `MasterfilePro_Visitor_Roster_${new Date().toISOString().split("T")[0]}.csv`

    a.click()

    URL.revokeObjectURL(url)

    notify("Visitor log exported as CSV evacuation roll.", "success")
  }

  // Handle Verify Pass Lookup (Supports raw Pass ID, Token, or scanned QR JSON payload)
  const handleVerifyPass = (e: React.FormEvent) => {
    e.preventDefault()
    const raw = verifyInput.trim()
    if (!raw) return

    let searchId = raw
    let searchToken = ""
    let searchName = ""

    // Case 1: Raw QR Code JSON was scanned
    try {
      const parsed = JSON.parse(raw)
      if (parsed.id) searchId = parsed.id
      if (parsed.sec) searchToken = parsed.sec
      if (parsed.name) searchName = parsed.name
    } catch {
      // Case 2: Regex extraction if partial scan or formatted text
      const matchId = raw.match(/VP-\d+/i)
      if (matchId) searchId = matchId[0]
      const matchToken = raw.match(/SEC-[A-Z0-9]+/i)
      if (matchToken) searchToken = matchToken[0]
    }

    const cleanRawUpper = raw.toUpperCase()
    const cleanIdUpper = searchId.toUpperCase()
    const cleanTokenUpper = searchToken.toUpperCase()
    const cleanNameUpper = searchName.toUpperCase()

    const match = visitorLog.find(
      (r) =>
        r.id.toUpperCase() === cleanIdUpper ||
        (cleanTokenUpper &&
          r.securityToken.toUpperCase() === cleanTokenUpper) ||
        r.securityToken.toUpperCase() === cleanRawUpper ||
        (cleanNameUpper && r.fullName.toUpperCase().includes(cleanNameUpper)) ||
        r.fullName.toUpperCase().includes(cleanRawUpper) ||
        (r.vehiclePlate && r.vehiclePlate.toUpperCase() === cleanRawUpper) ||
        (r.phone &&
          r.phone.replace(/\D/g, "").length >= 4 &&
          r.phone
            .replace(/\D/g, "")
            .includes(cleanRawUpper.replace(/\D/g, ""))) ||
        (r.email && r.email.toUpperCase() === cleanRawUpper),
    )

    if (match) {
      setVerifiedRecord(match)
      setVerifyStatus("valid")
      notify(`Pass ${match.id} verified for ${match.fullName}.`, "success")
    } else {
      setVerifiedRecord(null)
      setVerifyStatus("not_found")
      notify("Pass not found or invalid security signature.", "error")
    }
  }

  // Filter visitor log records

  const filteredLog = visitorLog.filter((item) => {
    const matchesQuery =
      item.fullName.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      item.organization.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      item.hostName.toLowerCase().includes(logSearchQuery.toLowerCase())

    const matchesStatus = statusFilter === "All" || item.status === statusFilter

    return matchesQuery && matchesStatus
  })

  const tierMeta = TIER_CONFIG[accessTier]

  return (
    <div className="visitor-studio-container">
      {/* Top Header & Breadcrumbs */}
      <div className="visitor-header no-print">
        <div className="visitor-header-left">
          {navigate && (
            <button
              type="button"
              className="text-button"
              onClick={() => navigate("all")}
              aria-label="Back to tools directory"
            >
              <ChevronLeft size={16} /> All tools
            </button>
          )}
          <div
            className="eyebrow"
            style={{
              color: "var(--accent-text)",
              marginTop: "4px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span>ENTERPRISE WORKSPACE & SECURITY</span>
            {(() => {
              const user = currentUser || getCurrentUser()
              const payStatus = getToolPaymentStatus("visitor-pass", user)
              if (payStatus.badgeType === "paid") {
                return (
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      background: "rgba(16,185,129,0.15)",
                      color: "var(--ok-ink)",
                      border: "1px solid rgba(16,185,129,0.35)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <CheckCircle2 size={12} /> Paid · Active{" "}
                    {payStatus.plan ? payStatus.plan.toUpperCase() : "MONTHLY"}{" "}
                    Pass
                    {payStatus.expiresAt && (
                      <span
                        style={{
                          opacity: 0.8,
                          fontWeight: 400,
                          textTransform: "none",
                        }}
                      >
                        (renews{" "}
                        {new Date(payStatus.expiresAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                        )
                      </span>
                    )}
                  </span>
                )
              }
              if (payStatus.badgeType === "all-access") {
                return (
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      background: "rgba(168,85,247,0.15)",
                      color: "#c084fc",
                      border: "1px solid rgba(168,85,247,0.35)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <Sparkles size={12} /> All-Access Pro Unlocked
                  </span>
                )
              }
              if (payStatus.badgeType === "admin") {
                return (
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      background: "rgba(59,130,246,0.15)",
                      color: "#60a5fa",
                      border: "1px solid rgba(59,130,246,0.35)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <ShieldCheck size={12} /> Admin Access
                  </span>
                )
              }
              return null
            })()}
          </div>
          <h1 className="visitor-title">Visitor Pass & Badges</h1>
          <p className="visitor-subtitle">
            Generate branded visitor ID cards, adhesive badges, and digital
            mobile passes with scannable QR security and on-premises tracking.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="visitor-header-actions">
          {(fullName ||
            organization ||
            email ||
            phone ||
            vehiclePlate ||
            photoDataUrl ||
            hostName ||
            hostDepartment ||
            meetingRoom) && (
            <button
              type="button"
              className="text-button"
              onClick={handleClearForm}
              title="Clear all inputted fields"
              style={{
                fontSize: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <RefreshCw size={13} />
              <span>Clear Form</span>
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={handlePrintBadge}
            title="Print visitor badge or sheet"
          >
            <Printer size={15} />
            <span>Print Badge</span>
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleExportPDF}
            disabled={isExporting}
            title="Export high-resolution vector PDF"
          >
            <Download size={15} />
            <span>{isExporting ? "Generating..." : "Download PDF"}</span>
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => handleIssuePass("Expected")}
            title="Pre-register visitor for scheduled arrival"
          >
            <Clock size={15} />
            <span>Pre-Register (Expected)</span>
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => handleIssuePass("Checked-In")}
            title="Issue pass and log check-in immediately"
          >
            <CheckCircle2 size={15} />
            <span>Issue & Check In</span>
          </button>
        </div>
      </div>

      {/* Main Studio Navigation Tabs */}
      <div className="visitor-tabs no-print">
        <button
          type="button"
          className={`visitor-tab ${activeTab === "designer" ? "active" : ""}`}
          onClick={() => setActiveTab("designer")}
        >
          <IdCard size={16} />
          <span>Badge & Pass Designer</span>
        </button>
        <button
          type="button"
          className={`visitor-tab ${activeTab === "log" ? "active" : ""}`}
          onClick={() => setActiveTab("log")}
        >
          <History size={16} />
          <span>On-Premises Visitor Log ({visitorLog.length})</span>
        </button>
        <button
          type="button"
          className={`visitor-tab ${activeTab === "verifier" ? "active" : ""}`}
          onClick={() => setActiveTab("verifier")}
        >
          <ShieldCheck size={16} />
          <span>Security Pass Verifier</span>
        </button>
      </div>

      {/* TAB 1: BADGE DESIGNER */}
      {activeTab === "designer" && (
        <div className="visitor-designer-grid">
          {/* LEFT: Controls Form */}
          <div className="visitor-form-panel no-print">
            {/* Format Selector Pills */}
            <div className="visitor-section">
              <label className="visitor-section-title">
                Badge Format & Presets
              </label>
              <div className="badge-format-selector">
                <button
                  type="button"
                  className={`format-btn ${
                    badgeFormat === "cr80" ? "selected" : ""
                  }`}
                  onClick={() => setBadgeFormat("cr80")}
                >
                  <IdCard size={18} />
                  <div className="format-btn-info">
                    <strong>Lanyard ID (CR80)</strong>
                    <small>Standard 85.6 × 54mm PVC Card</small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`format-btn ${
                    badgeFormat === "clip" ? "selected" : ""
                  }`}
                  onClick={() => setBadgeFormat("clip")}
                >
                  <FileBadge size={18} />
                  <div className="format-btn-info">
                    <strong>Lobby Clip Badge</strong>
                    <small>Horizontal 4" × 3" Adhesive</small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`format-btn ${
                    badgeFormat === "mobile" ? "selected" : ""
                  }`}
                  onClick={() => setBadgeFormat("mobile")}
                >
                  <Smartphone size={18} />
                  <div className="format-btn-info">
                    <strong>Mobile Digital Pass</strong>
                    <small>Apple & Google Wallet Ready</small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`format-btn ${
                    badgeFormat === "a4" ? "selected" : ""
                  }`}
                  onClick={() => setBadgeFormat("a4")}
                >
                  <FileText size={18} />
                  <div className="format-btn-info">
                    <strong>A4 Security Sheet</strong>
                    <small>With Dashboard Parking Permit</small>
                  </div>
                </button>
              </div>
            </div>

            {/* Section 1: Visitor Information */}
            <div className="visitor-section">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <label className="visitor-section-title" style={{ margin: 0 }}>
                  Visitor Information
                </label>
                {(fullName ||
                  organization ||
                  email ||
                  phone ||
                  vehiclePlate ||
                  photoDataUrl ||
                  hostName ||
                  hostDepartment ||
                  meetingRoom) && (
                  <button
                    type="button"
                    className="text-button-sm"
                    onClick={handleClearForm}
                    style={{
                      fontSize: "11px",
                      color: "var(--muted)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <RefreshCw size={11} /> Clear fields
                  </button>
                )}
              </div>
              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="vis-fullname">Full Name *</label>
                  <input
                    aria-label="Full Name"
                    id="vis-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Dr. Sarah Jenkins"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="vis-org">Organization / Affiliation *</label>
                  <input
                    aria-label="Organization / Affiliation"
                    id="vis-org"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g. Apex Innovations"
                  />
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="vis-email">Email Address</label>
                  <input
                    aria-label="Email Address"
                    id="vis-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@example.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="vis-phone">Mobile Phone</label>
                  <input
                    aria-label="Mobile Phone"
                    id="vis-phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="vis-plate">
                    Vehicle License Plate (Parking)
                  </label>
                  <input
                    aria-label="Vehicle License Plate (Parking)"
                    id="vis-plate"
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="e.g. 7XYZ942"
                  />
                </div>
                <div className="form-group">
                  <label>Visitor Photo</label>
                  <div className="photo-upload-actions">
                    <input
                      aria-label="Visitor Photo"
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handlePhotoUpload}
                    />
                    <button
                      type="button"
                      className="secondary-sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} /> Upload Portrait
                    </button>
                    {photoDataUrl && (
                      <button
                        type="button"
                        className="text-button-sm text-danger"
                        onClick={() => setPhotoDataUrl("")}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Host & Security Classification */}
            <div className="visitor-section">
              <label className="visitor-section-title">
                Host & Facility Security
              </label>
              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="vis-host">Host Employee *</label>
                  <input
                    aria-label="Host Employee"
                    id="vis-host"
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="e.g. David Vance"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="vis-dept">Host Department</label>
                  <input
                    aria-label="Host Department"
                    id="vis-dept"
                    type="text"
                    value={hostDepartment}
                    onChange={(e) => setHostDepartment(e.target.value)}
                    placeholder="e.g. Strategic Architecture"
                  />
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="vis-loc">Facility Destination / Room</label>
                  <input
                    aria-label="Facility Destination / Room"
                    id="vis-loc"
                    type="text"
                    value={meetingRoom}
                    onChange={(e) => setMeetingRoom(e.target.value)}
                    placeholder="e.g. Boardroom C · 14th Floor"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="vis-tier">Access Classification Tier</label>
                  <select
                    aria-label="Access Classification Tier"
                    id="vis-tier"
                    value={accessTier}
                    onChange={(e) =>
                      setAccessTier(e.target.value as AccessTier)
                    }
                  >
                    <option value="general">General Visitor (Blue)</option>
                    <option value="vip">VIP Executive (Purple / Gold)</option>
                    <option value="contractor">
                      Contractor / Vendor (Amber)
                    </option>
                    <option value="interview">
                      Candidate Interview (Emerald)
                    </option>
                    <option value="restricted">
                      Escort Required (Red Alert)
                    </option>
                  </select>
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="vis-date">Visit Date</label>
                  <input
                    aria-label="Visit Date"
                    id="vis-date"
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                  />
                </div>
                <div className="form-group time-range-group">
                  <label>Authorized Time Window</label>
                  <div className="time-range-inputs">
                    <input
                      type="time"
                      value={timeIn}
                      onChange={(e) => setTimeIn(e.target.value)}
                      title="Entry time"
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={timeOut}
                      onChange={(e) => setTimeOut(e.target.value)}
                      title="Expiration time"
                    />
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "6px" }}>
                <label>Arrival / Log Status</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`status-select-btn ${
                      passStatus === "Checked-In" ? "active-in" : ""
                    }`}
                    onClick={() => setPassStatus("Checked-In")}
                  >
                    <CheckCircle2 size={13} /> Checked-In (Arrived Now)
                  </button>
                  <button
                    type="button"
                    className={`status-select-btn ${
                      passStatus === "Expected" ? "active-exp" : ""
                    }`}
                    onClick={() => setPassStatus("Expected")}
                  >
                    <Clock size={13} /> Expected (Pre-Register)
                  </button>
                </div>
              </div>
            </div>

            {/* Section 3: Wi-Fi & Facility Protocols */}
            <div className="visitor-section">
              <label className="visitor-section-title">
                Wi-Fi & Facility Protocols
              </label>
              <div className="checkbox-row">
                <label className="custom-checkbox">
                  <input
                    aria-label="Wi Fi & Facility Protocols"
                    type="checkbox"
                    checked={wifiGranted}
                    onChange={(e) => setWifiGranted(e.target.checked)}
                  />
                  <span>Provision Guest Wi-Fi Access</span>
                </label>
              </div>

              {wifiGranted && (
                <div className="form-row-grid" style={{ marginTop: "10px" }}>
                  <div className="form-group">
                    <label>Guest Wi-Fi SSID</label>
                    <input
                      aria-label="Guest Wi Fi SSID"
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Guest Password</label>
                    <input
                      aria-label="Guest Password"
                      type="text"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="checkbox-row" style={{ marginTop: "10px" }}>
                <label className="custom-checkbox">
                  <input
                    type="checkbox"
                    checked={ndaAccepted}
                    onChange={(e) => setNdaAccepted(e.target.checked)}
                  />
                  <span>
                    Safety Briefing & Non-Disclosure (NDA) Acknowledged
                  </span>
                </label>
              </div>
            </div>

            {/* Section 4: Corporate Branding */}
            <div className="visitor-section">
              <label className="visitor-section-title">
                Corporate Branding & Themes
              </label>
              <div className="form-group">
                <label htmlFor="vis-company">Organization Header</label>
                <input
                  aria-label="Organization Header"
                  id="vis-company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="vis-facility-loc">
                  Facility Campus / Building Location
                </label>
                <input
                  aria-label="Facility Campus / Building Location"
                  id="vis-facility-loc"
                  type="text"
                  value={facilityLocation}
                  onChange={(e) => setFacilityLocation(e.target.value)}
                  placeholder="e.g. Global Headquarters · Floor 14"
                />
              </div>

              <div className="theme-palette-picker">
                {BRAND_THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={`theme-chip ${
                      selectedTheme.id === th.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedTheme(th)}
                    title={th.name}
                  >
                    <span
                      className="chip-color"
                      style={{ background: th.primary }}
                    />
                    <span
                      className="chip-accent"
                      style={{ background: th.accent }}
                    />
                    <span className="chip-label">{th.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Live Interactive Badge Preview */}
          <div className="visitor-preview-panel">
            <div className="preview-panel-header no-print">
              <span className="preview-label">
                <EyeIcon /> Live Badge Preview · {badgeFormat.toUpperCase()}{" "}
                Mode
              </span>
              <button
                type="button"
                className="text-button-sm"
                onClick={regeneratePassId}
                title="Regenerate Pass ID"
              >
                <RefreshCw size={13} /> {passId}
              </button>
            </div>

            <div className="badge-canvas-wrapper" ref={badgeCardRef}>
              {/* FORMAT 1: CR80 LANYARD ID CARD */}
              {badgeFormat === "cr80" && (
                <div
                  className="cr80-badge-card"
                  style={{
                    borderColor: selectedTheme.accent,
                  }}
                >
                  {/* Lanyard punch hole slot */}
                  <div className="cr80-lanyard-slot" />

                  {/* Header band */}
                  <div
                    className="cr80-header-band"
                    style={{ background: selectedTheme.primary }}
                  >
                    <div className="cr80-company-title">{companyName}</div>
                    <div
                      className="cr80-tier-pill"
                      style={{
                        background: "#ffffff",

                        color: tierMeta.text,

                        borderColor: tierMeta.border,
                      }}
                    >
                      {tierMeta.label}
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="cr80-body">
                    {/* Hologram security shimmer strip */}
                    <div className="cr80-hologram-strip" />

                    <div className="cr80-photo-container">
                      {photoDataUrl ? (
                        <img
                          src={photoDataUrl}
                          alt="Visitor portrait"
                          className="cr80-photo-img"
                        />
                      ) : (
                        <div className="cr80-photo-placeholder">
                          <User size={36} color={selectedTheme.accent} />
                          <span>NO PHOTO</span>
                        </div>
                      )}
                    </div>

                    <div className="cr80-visitor-name">
                      {fullName || "Visitor Name"}
                    </div>
                    <div className="cr80-visitor-org">
                      {organization || "Organization / Affiliation"}
                    </div>

                    {/* Metadata table */}
                    <div className="cr80-meta-grid">
                      <div className="cr80-meta-cell">
                        <small>HOST</small>
                        <strong>{hostName || "Front Desk"}</strong>
                      </div>
                      <div className="cr80-meta-cell">
                        <small>DEPT</small>
                        <strong>{hostDepartment || "Lobby"}</strong>
                      </div>
                      <div className="cr80-meta-cell">
                        <small>DATE</small>
                        <strong>{visitDate}</strong>
                      </div>
                      <div className="cr80-meta-cell">
                        <small>EXPIRES</small>
                        {/* printed pass paper stays white in dark mode, so this ink is fixed */}
                        <strong style={{ color: "#b91c1c" }}>{timeOut}</strong>
                      </div>
                    </div>

                    {/* QR Code Bar */}
                    <div className="cr80-qr-section">
                      {qrDataUrl && (
                        <img
                          src={qrDataUrl}
                          alt="Scannable pass QR"
                          className="cr80-qr-img"
                        />
                      )}
                      <div className="cr80-qr-meta">
                        <span className="cr80-pass-id">PASS #{passId}</span>
                        <small>SCAN AT FRONT TURNSTILE</small>
                        {wifiGranted && (
                          <span className="cr80-wifi-tag">📶 WI-FI PASS</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom safety strip */}
                  <div className="cr80-footer-band">
                    <span>SECURITY DIRECTORY · NON-TRANSFERABLE</span>
                  </div>
                </div>
              )}

              {/* FORMAT 2: 4"x3" CLIP-ON LOBBY BADGE */}
              {badgeFormat === "clip" && (
                <div
                  className="clip-badge-card"
                  style={{ borderColor: selectedTheme.accent }}
                >
                  <div
                    className="clip-header-band"
                    style={{ background: selectedTheme.primary }}
                  >
                    <div className="clip-brand">{companyName}</div>
                    <div
                      className="clip-tier-flag"
                      style={{ color: selectedTheme.accent }}
                    >
                      {tierMeta.label}
                    </div>
                  </div>

                  <div className="clip-body-content">
                    <div className="clip-left-column">
                      <div className="clip-visitor-name">
                        {fullName || "Visitor Name"}
                      </div>
                      <div className="clip-visitor-org">
                        {organization || "Organization / Affiliation"}
                      </div>

                      <div className="clip-info-rows">
                        <div>
                          <span>HOST:</span>{" "}
                          <strong>
                            {hostName
                              ? `${hostName}${
                                  hostDepartment ? ` (${hostDepartment})` : ""
                                }`
                              : "Front Desk Staff"}
                          </strong>
                        </div>
                        <div>
                          <span>ROOM:</span>{" "}
                          <strong>{meetingRoom || "Main Lobby"}</strong>
                        </div>
                        <div>
                          <span>VALID:</span>{" "}
                          <strong>
                            {visitDate} ({timeIn} - {timeOut})
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="clip-right-column">
                      {qrDataUrl && (
                        <img
                          src={qrDataUrl}
                          alt="Badge QR"
                          className="clip-qr-img"
                        />
                      )}
                      <div className="clip-pass-number">ID: {passId}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* FORMAT 3: SMARTPHONE DIGITAL PASS */}
              {badgeFormat === "mobile" && (
                <div className="mobile-pass-shell">
                  <div className="mobile-speaker-grille" />
                  <div className="mobile-pass-card">
                    <div
                      className="mobile-pass-header"
                      style={{ background: selectedTheme.primary }}
                    >
                      <div className="mobile-header-top">
                        <span className="mobile-org-title">{companyName}</span>
                        <span className="mobile-status-live">
                          ● ACTIVE PASS
                        </span>
                      </div>
                      <div className="mobile-guest-name">
                        {fullName || "Visitor Name"}
                      </div>
                      <div className="mobile-guest-sub">
                        {organization || "Organization / Affiliation"}
                      </div>
                    </div>

                    <div className="mobile-pass-body">
                      <div className="mobile-qr-wrapper">
                        {qrDataUrl && (
                          <img
                            src={qrDataUrl}
                            alt="Wallet QR"
                            className="mobile-qr-img"
                          />
                        )}
                        <span className="mobile-scan-instruction">
                          Hold near security turnstile scanner
                        </span>
                      </div>

                      <div className="mobile-details-list">
                        <div className="mobile-detail-item">
                          <span>ACCESS TIER</span>
                          <strong style={{ color: tierMeta.text }}>
                            {tierMeta.label}
                          </strong>
                        </div>
                        <div className="mobile-detail-item">
                          <span>HOST SPONSOR</span>
                          <strong>{hostName}</strong>
                        </div>
                        <div className="mobile-detail-item">
                          <span>FACILITY ROOM</span>
                          <strong>{meetingRoom}</strong>
                        </div>
                        <div className="mobile-detail-item">
                          <span>EXPIRATION</span>
                          <strong>Today at {timeOut}</strong>
                        </div>
                      </div>

                      {wifiGranted && (
                        <div className="mobile-wifi-box">
                          <div className="mobile-wifi-header">
                            <Wifi size={14} color="#00C9B7" />
                            <strong>Guest Wi-Fi Credentials</strong>
                          </div>
                          <div className="mobile-wifi-body">
                            <div>
                              SSID: <code>{wifiSsid}</code>
                            </div>
                            <div>
                              Pass: <code>{wifiPassword}</code>
                            </div>
                            <button
                              type="button"
                              className="copy-wifi-btn"
                              onClick={() => {
                                navigator.clipboard.writeText(wifiPassword)

                                setCopiedWifi(true)

                                setTimeout(() => setCopiedWifi(false), 2000)
                              }}
                            >
                              {copiedWifi ? (
                                <Check size={12} />
                              ) : (
                                <Copy size={12} />
                              )}
                              <span>{copiedWifi ? "Copied" : "Copy Key"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mobile-pass-footer">
                      <span>SECURE MASTERFILEPASS PROTOCOL · #{passId}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* FORMAT 4: A4 SHEET PRINTABLE PACK */}
              {badgeFormat === "a4" && (
                <div className="a4-sheet-preview">
                  <div
                    className="a4-sheet-header"
                    style={{ background: selectedTheme.primary }}
                  >
                    <h2>{companyName}</h2>
                    <p>OFFICIAL VISITOR SECURITY CLEARANCE & PARKING PERMIT</p>
                  </div>

                  <div className="a4-sheet-content">
                    <div className="a4-top-section">
                      <div className="a4-badge-cutout">
                        <div className="cutout-guide">
                          ✂ Cut along dashed line for lanyard
                        </div>
                        <div
                          className="a4-mini-badge"
                          style={{ borderColor: selectedTheme.accent }}
                        >
                          <div
                            className="a4-mini-header"
                            style={{ background: selectedTheme.primary }}
                          >
                            <span>{companyName}</span>
                            <small>{tierMeta.label}</small>
                          </div>
                          <div className="a4-mini-body">
                            <h3>{fullName || "Visitor Name"}</h3>
                            <p>
                              {organization || "Organization / Affiliation"}
                            </p>
                            <small>
                              Host: {hostName || "Reception Desk"} (
                              {hostDepartment || "Front Lobby"})
                            </small>
                            {qrDataUrl && (
                              <img
                                src={qrDataUrl}
                                alt="A4 QR"
                                className="a4-mini-qr"
                              />
                            )}
                            <span className="a4-pass-code">{passId}</span>
                          </div>
                        </div>
                      </div>

                      <div className="a4-safety-protocols">
                        <h4>FACILITY RULES & EMERGENCY PROTOCOLS</h4>
                        <ul>
                          <li>
                            Badge must remain visible on outer garment at all
                            times.
                          </li>
                          <li>
                            Visitor must remain accompanied by designated host:{" "}
                            <strong>{hostName}</strong>.
                          </li>
                          <li>
                            Photography, unauthorized recordings, and hardware
                            interception are strictly prohibited.
                          </li>
                          <li>
                            In the event of building alarm, assemble at East
                            Lawn Quadrangle.
                          </li>
                          <li>
                            Return this badge to Front Desk reception upon
                            check-out.
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Parking Permit Tear-off */}
                    <div className="a4-parking-permit">
                      <div className="cutout-guide">
                        ✂ FOLD & PLACE ON VEHICLE DASHBOARD (FACE UP)
                      </div>
                      <div className="parking-box">
                        <div className="parking-header">
                          <Car size={20} />
                          <h3>OFFICIAL VISITOR PARKING PERMIT</h3>
                        </div>
                        <div className="parking-body">
                          <div className="parking-plate">
                            <small>AUTHORIZED VEHICLE PLATE</small>
                            <h1>{vehiclePlate || "VISITOR-GUEST"}</h1>
                          </div>
                          <div className="parking-meta">
                            <div>
                              DATE: <strong>{visitDate}</strong>
                            </div>
                            <div>
                              LOCATION: <strong>GUEST VISITOR LOT B</strong>
                            </div>
                            <div>
                              SECURITY TOKEN: <strong>{passId}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ON-PREMISES VISITOR LOG */}
      {activeTab === "log" && (
        <div className="visitor-log-container no-print">
          <div className="log-top-bar">
            <div className="log-search-bar">
              <Search size={16} />
              <input
                aria-label="Search visitor log"
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Search visitor by name, company, pass ID, or host..."
              />
              {logSearchQuery && (
                <button type="button" onClick={() => setLogSearchQuery("")}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="log-filters">
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Checked-In">Checked In</option>
                <option value="Expected">Expected</option>
                <option value="Checked-Out">Checked Out</option>
              </select>

              <button
                type="button"
                className="secondary"
                onClick={handleExportCSV}
              >
                <FileSpreadsheet size={15} /> Export Evacuation Roll (CSV)
              </button>

              {visitorLog.some((v) => v.status === "Checked-Out") && (
                <button
                  type="button"
                  className="secondary"
                  onClick={handleClearCheckedOut}
                  title="Remove all completed / checked-out visits"
                  style={{
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Trash2 size={13} /> Clear Past Check-Outs
                </button>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div className="log-stats-grid">
            <div className="log-stat-card">
              <small>TOTAL LOGGED</small>
              <strong>{visitorLog.length}</strong>
            </div>
            <div className="log-stat-card" style={{ borderColor: "#10b981" }}>
              <small>CURRENTLY ON PREMISES</small>
              <strong style={{ color: "var(--ok-ink)" }}>
                {visitorLog.filter((v) => v.status === "Checked-In").length}
              </strong>
            </div>
            <div className="log-stat-card">
              <small>EXPECTED</small>
              <strong style={{ color: "#3b82f6" }}>
                {visitorLog.filter((v) => v.status === "Expected").length}
              </strong>
            </div>
            <div className="log-stat-card">
              <small>CHECKED OUT</small>
              <strong style={{ color: "var(--muted)" }}>
                {visitorLog.filter((v) => v.status === "Checked-Out").length}
              </strong>
            </div>
          </div>

          {/* Roster Table */}
          <div className="log-table-wrapper">
            <table className="visitor-roster-table">
              <thead>
                <tr>
                  <th>Pass ID</th>
                  <th>Visitor Particulars</th>
                  <th>Host & Department</th>
                  <th>Access Tier</th>
                  <th>Time Window</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", padding: "32px" }}
                    >
                      No visitor records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredLog.map((record) => {
                    const recTier =
                      TIER_CONFIG[record.tier] || TIER_CONFIG.general

                    return (
                      <tr key={record.id}>
                        <td>
                          <span className="table-pass-id">{record.id}</span>
                        </td>
                        <td>
                          <strong>{record.fullName}</strong>
                          <div
                            style={{ fontSize: "12px", color: "var(--muted)" }}
                          >
                            {record.organization} ·{" "}
                            {record.phone || record.email}
                          </div>
                        </td>
                        <td>
                          <div>{record.hostName}</div>
                          <div
                            style={{ fontSize: "12px", color: "var(--muted)" }}
                          >
                            {record.hostDepartment}
                          </div>
                        </td>
                        <td>
                          <span
                            className="table-tier-badge"
                            style={{
                              background: recTier.bg,

                              color: recTier.color,

                              borderColor: recTier.border,
                            }}
                          >
                            {recTier.label}
                          </span>
                        </td>
                        <td>
                          <div>{record.visitDate}</div>
                          <small style={{ color: "var(--muted)" }}>
                            {record.timeIn} - {record.timeOut}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`status-chip ${
                              record.status === "Checked-In"
                                ? "status-green"
                                : record.status === "Expected"
                                  ? "status-blue"
                                  : "status-gray"
                            }`}
                          >
                            {record.status}
                          </span>
                        </td>
                        <td
                          style={{ textAlign: "right", whiteSpace: "nowrap" }}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              gap: "6px",
                              alignItems: "center",
                              justifyContent: "flex-end",
                            }}
                          >
                            {record.status === "Expected" && (
                              <button
                                type="button"
                                className="table-action-btn status-green-btn"
                                onClick={() => handleCheckInRecord(record.id)}
                                title="Check in this visitor upon arrival"
                              >
                                Check In
                              </button>
                            )}
                            {record.status === "Checked-In" && (
                              <button
                                type="button"
                                className="table-action-btn status-amber-btn"
                                onClick={() => handleCheckOutRecord(record.id)}
                                title="Process departure and check out"
                              >
                                Check Out
                              </button>
                            )}
                            {record.status === "Checked-Out" && (
                              <button
                                type="button"
                                className="table-action-btn secondary-btn"
                                onClick={() => handleCheckInRecord(record.id)}
                                title="Re-admit visitor onto premises"
                              >
                                Re-Admit
                              </button>
                            )}
                            <button
                              type="button"
                              className="table-action-btn icon-btn"
                              onClick={() => handleViewBadge(record)}
                              title="View and print badge in designer"
                            >
                              <IdCard size={12} /> View
                            </button>
                            <button
                              type="button"
                              className="table-action-btn danger-icon-btn"
                              onClick={() =>
                                handleDeleteRecord(record.id, record.fullName)
                              }
                              title="Delete record from log"
                            >
                              <Trash2 size={12} />
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

      {/* TAB 3: SECURITY PASS VERIFIER */}
      {activeTab === "verifier" && (
        <div className="verifier-container no-print">
          <div className="verifier-card">
            <div className="verifier-header">
              <ShieldCheck size={28} color="#00C9B7" />
              <div>
                <h2>Security Reception Pass Verifier</h2>
                <p>
                  Verify holographic pass validity, entry permissions, and time
                  stamps.
                </p>
              </div>
            </div>

            <form onSubmit={handleVerifyPass} className="verifier-form">
              <div className="verifier-input-group">
                <input
                  aria-label="Pass ID or token to verify"
                  type="text"
                  value={verifyInput}
                  onChange={(e) => setVerifyInput(e.target.value)}
                  placeholder="Scan pass barcode, enter Pass ID (e.g. VP-8492) or Token..."
                  autoFocus
                />
                <button type="submit" className="primary">
                  <Scan size={16} /> Verify Pass
                </button>
              </div>
            </form>

            {/* Verification Result Display */}
            {verifyStatus === "valid" && verifiedRecord && (
              <div className="verifier-result-box valid">
                <div className="result-header">
                  <CheckCircle2 size={32} color="#10b981" />
                  <div>
                    <h3>CLEARANCE GRANTED · VALID VISITOR PASS</h3>
                    <small>
                      Security signature verified and matched with on-premises
                      roster
                    </small>
                  </div>
                </div>

                <div className="result-details-grid">
                  <div className="result-item">
                    <span>Visitor Name</span>
                    <strong>{verifiedRecord.fullName}</strong>
                  </div>
                  <div className="result-item">
                    <span>Organization</span>
                    <strong>{verifiedRecord.organization}</strong>
                  </div>
                  <div className="result-item">
                    <span>Access Tier</span>
                    <strong
                      style={{ color: TIER_CONFIG[verifiedRecord.tier]?.color }}
                    >
                      {TIER_CONFIG[verifiedRecord.tier]?.label}
                    </strong>
                  </div>
                  <div className="result-item">
                    <span>Authorized Host</span>
                    <strong>
                      {verifiedRecord.hostName} ({verifiedRecord.hostDepartment}
                      )
                    </strong>
                  </div>
                  <div className="result-item">
                    <span>Facility Location</span>
                    <strong>
                      {verifiedRecord.facilityLocation
                        ? `${verifiedRecord.facilityLocation} · ${verifiedRecord.location}`
                        : verifiedRecord.location}
                    </strong>
                  </div>
                  <div className="result-item">
                    <span>Valid Today</span>
                    <strong>
                      {verifiedRecord.visitDate} ({verifiedRecord.timeIn} -{" "}
                      {verifiedRecord.timeOut})
                    </strong>
                  </div>
                  <div className="result-item">
                    <span>Current Status</span>
                    <strong>
                      <span
                        className={`status-chip ${
                          verifiedRecord.status === "Checked-In"
                            ? "status-green"
                            : verifiedRecord.status === "Expected"
                              ? "status-blue"
                              : "status-gray"
                        }`}
                      >
                        {verifiedRecord.status}
                      </span>
                    </strong>
                  </div>
                  <div className="result-item">
                    <span>Access Stamps</span>
                    <strong style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {verifiedRecord.actualCheckIn
                        ? `In: ${verifiedRecord.actualCheckIn}`
                        : "Not checked in"}
                      {verifiedRecord.actualCheckOut
                        ? ` · Out: ${verifiedRecord.actualCheckOut}`
                        : ""}
                    </strong>
                  </div>
                </div>

                <div
                  className="result-actions"
                  style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                >
                  {verifiedRecord.status === "Expected" && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleCheckInRecord(verifiedRecord.id)}
                    >
                      <CheckCircle2 size={15} /> Confirm Arrival & Check In
                    </button>
                  )}
                  {verifiedRecord.status === "Checked-In" && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleCheckOutRecord(verifiedRecord.id)}
                    >
                      Process Check-Out
                    </button>
                  )}
                  {verifiedRecord.status === "Checked-Out" && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleCheckInRecord(verifiedRecord.id)}
                    >
                      Re-Admit / Check In
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleViewBadge(verifiedRecord)}
                  >
                    <IdCard size={15} /> View & Print Badge
                  </button>
                </div>
              </div>
            )}

            {verifyStatus === "not_found" && (
              <div className="verifier-result-box invalid">
                <AlertCircle size={32} color="#ef4444" />
                <div>
                  <h3>ACCESS DENIED · PASS NOT FOUND</h3>
                  <p>
                    No matching visitor record or security token found. Please
                    redirect guest to Main Reception for security re-screening.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EyeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", marginRight: "4px" }}
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
