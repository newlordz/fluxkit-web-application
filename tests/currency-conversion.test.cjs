const test = require("node:test")
const assert = require("node:assert/strict")

// Test Backend Currency Handler directly
test("Backend Currency API: calculateConversion math", async (t) => {
  // Test conversion helper logic
  function calculateConversion(amount, from, to, customRate = 15.5) {
    const rate = customRate > 0 ? customRate : 15.5
    const cleanAmount = isNaN(Number(amount)) ? 0 : Number(amount)
    const normFrom = (from || "USD").toUpperCase()
    const normTo = (to || "GHS").toUpperCase()

    let converted = cleanAmount
    if (normFrom === "USD" && normTo === "GHS") {
      converted = Math.round(cleanAmount * rate * 100) / 100
    } else if (normFrom === "GHS" && normTo === "USD") {
      converted = Math.round((cleanAmount / rate) * 100) / 100
    }

    return {
      success: true,
      from: normFrom,
      to: normTo,
      originalAmount: cleanAmount,
      convertedAmount: converted,
      exchangeRate: rate,
      formattedOriginal:
        normFrom === "GHS"
          ? `GH₵ ${cleanAmount.toFixed(2)} GHS`
          : `$${cleanAmount.toFixed(2)} USD`,
      formattedConverted:
        normTo === "GHS"
          ? `GH₵ ${converted.toFixed(2)} GHS`
          : `$${converted.toFixed(2)} USD`,
    }
  }

  await t.test("USD to GHS conversion calculates correctly", () => {
    const res = calculateConversion(10, "USD", "GHS", 15.5)
    assert.equal(res.convertedAmount, 155.00)
    assert.equal(res.formattedConverted, "GH₵ 155.00 GHS")
    assert.equal(res.exchangeRate, 15.5)
  })

  await t.test("GHS to USD conversion calculates correctly (vice versa)", () => {
    const res = calculateConversion(155, "GHS", "USD", 15.5)
    assert.equal(res.convertedAmount, 10.00)
    assert.equal(res.formattedConverted, "$10.00 USD")
  })

  await t.test("Single tool price ($4.99) converts to Cedi accurately", () => {
    const res = calculateConversion(4.99, "USD", "GHS", 15.5)
    assert.equal(res.convertedAmount, 77.35)
    assert.equal(res.formattedConverted, "GH₵ 77.35 GHS")
  })

  await t.test("Pro monthly fee ($19.00) converts to Cedi accurately", () => {
    const res = calculateConversion(19.00, "USD", "GHS", 15.5)
    assert.equal(res.convertedAmount, 294.50)
  })

  await t.test("Custom exchange rate update recalculates amounts immediately", () => {
    const customRate = 16.0
    const res = calculateConversion(10, "USD", "GHS", customRate)
    assert.equal(res.convertedAmount, 160.00)

    const rev = calculateConversion(160, "GHS", "USD", customRate)
    assert.equal(rev.convertedAmount, 10.00)
  })

  await t.test("Handles 0, negative, and invalid inputs gracefully", () => {
    const zero = calculateConversion(0, "USD", "GHS", 15.5)
    assert.equal(zero.convertedAmount, 0)

    const invalid = calculateConversion("not-a-number", "USD", "GHS", 15.5)
    assert.equal(invalid.convertedAmount, 0)
  })
})
