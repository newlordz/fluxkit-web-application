import assert from "node:assert"
import {
  parseEDI,
  convertEDIToJSON,
  convertEDIToCSV,
  convertEDIToXML,
  convertEDIToReadableReport,
  convertDataToEDIX12,
  parseCSV,
  convertCSVToJSON,
  convertCSVToXML,
  convertCSVToSQL,
  convertCSVToMarkdown,
  reformatCSVDelimiter,
  analyzeBatchScript,
  convertBatchToPowerShell,
  convertBatchToBash,
  convertBatchToPython,
  generateBatchTemplate,
} from "../src/dataConversionService"

console.log("--> Testing EDI Parsing and Conversions...")
const sampleEDI = [
  "ISA*00*          *00*          *ZZ*FLUXKITSENDER  *ZZ*ACMEPARTNER    *260101*1200*U*00401*000000001*0*P*>~",
  "GS*PO*FLUXKIT*ACME*20260101*1200*1*X*004010~",
  "ST*850*0001~",
  "BEG*00*NE*PO-984321**20260101~",
  "CUR*BY*USD~",
  "N1*BY*ACME SUPPLY CORP*92*123456789~",
  "N3*1200 COMMERCE BLVD~",
  "N4*AUSTIN*TX*78701*US~",
  "PO1*1*50*EA*19.99*PE*CB*ITEM-409~",
  "PID*F****INDUSTRIAL LOGISTICS CONTAINER~",
  "CTT*1~",
  "SE*11*0001~",
  "GE*1*1~",
  "IEA*1*000000001~",
].join("\n")

const parsedEdi = parseEDI(sampleEDI)
assert.strictEqual(parsedEdi.standard, "X12")
assert.strictEqual(parsedEdi.elementDelimiter, "*")
assert.strictEqual(parsedEdi.segmentTerminator, "~")
assert.strictEqual(parsedEdi.totalSegments, 14)
assert.strictEqual(parsedEdi.transactionSets.length, 1)
assert.strictEqual(parsedEdi.transactionSets[0].type, "850")
console.log("  [✓] parseEDI correctly parsed X12 transaction 850 with 14 segments.")

const ediJson = convertEDIToJSON(sampleEDI)
assert(ediJson.includes('"transactionType": "850"'))
assert(ediJson.includes('"tag": "BEG"'))
console.log("  [✓] convertEDIToJSON generated structured JSON.")

const ediCsv = convertEDIToCSV(sampleEDI)
assert(ediCsv.includes("Line,Segment,Description"))
assert(ediCsv.includes("BEG"))
console.log("  [✓] convertEDIToCSV generated flat CSV.")

const ediXml = convertEDIToXML(sampleEDI)
assert(ediXml.includes('<EDIDocument standard="X12">'))
assert(ediXml.includes('<Segment tag="BEG"'))
console.log("  [✓] convertEDIToXML generated valid XML.")

const ediReport = convertEDIToReadableReport(sampleEDI)
assert(ediReport.includes("FLUXKIT EDI BUSINESS DOCUMENT REPORT"))
assert(ediReport.includes("PO Number      : PO-984321"))
assert(ediReport.includes("ITEM-409"))
console.log("  [✓] convertEDIToReadableReport produced human-readable PO report.")

const reverseEdi = convertDataToEDIX12(ediJson, "json")
assert(reverseEdi.includes("ST*850*0001~"))
console.log("  [✓] convertDataToEDIX12 generated reverse EDI syntax.")

console.log("\n--> Testing CSV Conversions...")
const sampleCsv = `ID,Product,Price,Quantity
101,FluxKit Pro,49.99,10
102,"Cables, High Speed",14.50,150
103,Optic Adapter,29.00,45`

const parsedCsv = parseCSV(sampleCsv)
assert.strictEqual(parsedCsv.headers.length, 4)
assert.strictEqual(parsedCsv.rows.length, 3)
assert.strictEqual(parsedCsv.rows[1][1], "Cables, High Speed")
console.log("  [✓] parseCSV parsed quoted comma fields correctly.")

const csvJson = convertCSVToJSON(sampleCsv)
assert(csvJson.includes('"Product": "Cables, High Speed"'))
assert(csvJson.includes('"Price": 49.99'))
console.log("  [✓] convertCSVToJSON created typed JSON records.")

const csvXml = convertCSVToXML(sampleCsv)
assert(csvXml.includes('<dataset totalRows="3">'))
assert(csvXml.includes("<Product>Optic Adapter</Product>"))
console.log("  [✓] convertCSVToXML created XML schema.")

const csvSql = convertCSVToSQL(sampleCsv, "products")
assert(csvSql.includes("CREATE TABLE products"))
assert(csvSql.includes("INSERT INTO products (ID, Product, Price, Quantity)"))
console.log("  [✓] convertCSVToSQL created SQL statements.")

const csvMd = convertCSVToMarkdown(sampleCsv)
assert(csvMd.includes("| ID | Product | Price | Quantity |"))
assert(csvMd.includes("| 101 | FluxKit Pro | 49.99 | 10 |"))
console.log("  [✓] convertCSVToMarkdown created markdown table.")

const semicolonCsv = reformatCSVDelimiter(sampleCsv, ";")
assert(semicolonCsv.includes("ID;Product;Price;Quantity"))
console.log("  [✓] reformatCSVDelimiter reformatted delimiter to semicolon.")

console.log("\n--> Testing Batch File Script Conversions & Studio...")
const sampleBat = `@echo off
set "APP_DIR=C:\\Program Files\\FluxKit"
echo Launching FluxKit from %APP_DIR%
if exist "%APP_DIR%" (
  echo Directory verified
)
mkdir "C:\\Logs\\FluxKit"
del /f "C:\\Logs\\old.log"
pause
exit /b 0`

const psCode = convertBatchToPowerShell(sampleBat)
assert(psCode.includes('$APP_DIR = "C:\\Program Files\\FluxKit"'))
assert(psCode.includes('Write-Host "Launching FluxKit from $APP_DIR"'))
assert(psCode.includes("Test-Path"))
assert(psCode.includes('New-Item -ItemType Directory -Path "C:\\Logs\\FluxKit"'))
assert(psCode.includes('Remove-Item -Path "C:\\Logs\\old.log"'))
console.log("  [✓] convertBatchToPowerShell transpiled Batch to PowerShell.")

const bashCode = convertBatchToBash(sampleBat)
assert(bashCode.includes("#!/usr/bin/env bash"))
assert(bashCode.includes('APP_DIR="C:/Program Files/FluxKit"'))
assert(bashCode.includes('mkdir -p "C:/Logs/FluxKit"'))
assert(bashCode.includes('rm -f "C:/Logs/old.log"'))
console.log("  [✓] convertBatchToBash transpiled Batch to Bash.")

const pyCode = convertBatchToPython(sampleBat)
assert(pyCode.includes("def main():"))
assert(pyCode.includes('APP_DIR = "C:\\Program Files\\FluxKit"'))
assert(pyCode.includes("sys.exit(0)"))
console.log("  [✓] convertBatchToPython transpiled Batch to Python.")

const audit = analyzeBatchScript(`del /s /q C:\\*.* \n format D: \n shutdown /s`)
assert.strictEqual(audit.dangerousCommands.length, 3)
assert(audit.warnings.length >= 3)
console.log("  [✓] analyzeBatchScript caught high-risk destructive commands.")

const backupTemplate = generateBatchTemplate("backup")
assert(backupTemplate.includes("robocopy"))
console.log("  [✓] generateBatchTemplate generated backup automation script.")

console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===")
