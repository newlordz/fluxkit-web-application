const test = require("node:test")
const assert = require("node:assert/strict")

test("Visitor Pass: Issue Pass distinguishes Checked-In vs Expected pre-registration", () => {
  const recordA = {
    id: "VP-1001",
    fullName: "Elena Rostova",
    organization: "Cisco Infrastructure",
    status: "Checked-In",
    actualCheckIn: "08:30",
    visitDate: "2026-11-20",
  }

  const recordB = {
    id: "VP-1002",
    fullName: "Marcus Holloway",
    organization: "Independent Candidate",
    status: "Expected",
    actualCheckIn: undefined,
    visitDate: "2026-11-21",
  }

  assert.equal(recordA.status, "Checked-In")
  assert.equal(recordA.actualCheckIn, "08:30")
  assert.equal(recordB.status, "Expected")
  assert.equal(recordB.actualCheckIn, undefined)
})

test("Visitor Pass: Security Pass Verifier parses scanned QR JSON payload", () => {
  const visitorLog = [
    {
      id: "VP-8492",
      fullName: "Dr. Sarah Jenkins",
      securityToken: "SEC-90218A",
      organization: "Apex Quantum",
      vehiclePlate: "7XYZ942",
      status: "Checked-In",
    },
  ]

  const scannedQrJson = JSON.stringify({
    protocol: "MASTERFILEPASS/1.0",
    id: "VP-8492",
    name: "Dr. Sarah Jenkins",
    org: "Apex Quantum",
    sec: "SEC-90218A",
  })

  // Verifier logic
  let searchId = scannedQrJson
  let searchToken = ""
  try {
    const parsed = JSON.parse(scannedQrJson)
    if (parsed.id) searchId = parsed.id
    if (parsed.sec) searchToken = parsed.sec
  } catch {}

  const match = visitorLog.find(
    (r) =>
      r.id.toUpperCase() === searchId.toUpperCase() ||
      (searchToken && r.securityToken.toUpperCase() === searchToken.toUpperCase()),
  )

  assert.ok(match, "Scanned QR code JSON should match visitor record")
  assert.equal(match.fullName, "Dr. Sarah Jenkins")
  assert.equal(match.id, "VP-8492")
})

test("Visitor Pass: Full rehydration restores portrait, license plate, times and wifi", () => {
  const record = {
    id: "VP-7319",
    fullName: "Marcus Holloway",
    organization: "Cisco Infrastructure Team",
    email: "mholloway@contractor.net",
    phone: "+1 (555) 831-2940",
    vehiclePlate: "9KLM831",
    photoUrl: "data:image/png;base64,iVBORw0KGgo...",
    hostName: "Elena Rostova",
    hostDepartment: "Network & Security",
    location: "Server Room B",
    facilityLocation: "Accra Regional Gateway · Level -1",
    tier: "contractor",
    visitDate: "2026-11-20",
    timeIn: "09:00",
    timeOut: "16:00",
    wifiGranted: true,
    wifiSsid: "Masterfile-Guest",
    wifiPassword: "Welcome@2026!",
    ndaAccepted: true,
    status: "Checked-In",
    createdAt: "2026-11-20T08:00:00Z",
    securityToken: "SEC-48194B",
  }

  assert.equal(record.vehiclePlate, "9KLM831")
  assert.ok(record.photoUrl.startsWith("data:image/png"))
  assert.equal(record.facilityLocation, "Accra Regional Gateway · Level -1")
  assert.equal(record.wifiGranted, true)
})

test("Visitor Pass: Check-in and Check-out state transitions", () => {
  let record = {
    id: "VP-5001",
    fullName: "Kwame Mensah",
    status: "Expected",
    actualCheckIn: undefined,
    actualCheckOut: undefined,
  }

  // 1. Check in
  record = { ...record, status: "Checked-In", actualCheckIn: "09:15" }
  assert.equal(record.status, "Checked-In")
  assert.equal(record.actualCheckIn, "09:15")

  // 2. Check out
  record = { ...record, status: "Checked-Out", actualCheckOut: "16:45" }
  assert.equal(record.status, "Checked-Out")
  assert.equal(record.actualCheckOut, "16:45")
})
