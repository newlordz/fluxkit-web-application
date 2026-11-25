// A scanned page used to be the one job the site could not do at all: every page was
// uploaded to a billed OCR engine, however small the file. Tesseract compiled to
// WebAssembly reads those pages inside the visitor's own browser instead, so the
// engine behind this module is what keeps a credit unspent.
//
// The engine is served from this app's own /ocr files because the CSP in index.html
// only permits 'self' for scripts, workers and fetches. Together they are about 3.5 MB
// compressed on first use, after which the browser reuses both the files and the
// language model tesseract.js keeps in IndexedDB.

const ASSET_ROOT = "/ocr";

// Tesseract.js probes for relaxed-SIMD, SIMD and plain builds in turn. Only the SIMD
// build is shipped, so capable and incapable machines alike are handed the same file
// and a CPU that cannot run it simply fails through to the engine behind it.
const CORE_FILE = `${ASSET_ROOT}/tesseract-core-simd-lstm.wasm.js`;

// The "_fast" model is the integer-quantized LSTM: 4 MB rather than the 11 MB standard
// model, which is the difference between a page loading and a visitor leaving.
//
// It is stored uncompressed and gzip is turned off below on purpose. A ".traineddata.gz"
// file asks two layers to decompress the same bytes, and a static server that pre-empts
// the second one hands the engine an empty model, which then fails as "no languages"
// rather than as a missing file. The transfer is compressed by the host either way.
const LANGUAGE_DIR = `${ASSET_ROOT}/langs`;

const SUPPORTED_LANGUAGES = new Set(["en", "eng"]);

// A page of visual noise keeps the recognizer searching long after a useful answer
// stopped being possible, and the visitor should not wait that out. Past this point the
// page is abandoned, the worker is discarded, and the billed engine takes the job.
const PAGE_DEADLINE_MS = 15_000;

export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocalOcrWord {
  text: string;
  confidence: number;
  boundingBox?: OcrBoundingBox;
  baseline?: number;
}

export interface LocalOcrLine {
  text: string;
  confidence: number;
  boundingBox?: OcrBoundingBox;
  words?: LocalOcrWord[];
  baseline?: number;
}

export interface LocalOcrPage {
  text: string;
  confidence: number;
  lines: LocalOcrLine[];

  // Set when the engine ran on this page and could not finish it, which is a different
  // answer from the null this module returns when there is no engine to run at all: one
  // is a job the billed provider can still take, the other is not a job at all.
  failed?: boolean;
}

// Tesseract scores a page 0-100 while every other reader in this app reports 0-1, and
// the interface has no way to say which it is handing over. Converting here is the only
// place a second scale can be kept from leaking into a result the visitor reads as
// "9600% confidence".
function toAppScale(score: number): number {
  return Math.round(score || 0) / 100;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoundingBox(value: any): OcrBoundingBox | undefined {
  if (!value || typeof value !== "object") return undefined

  const x = finiteNumber(value.x0 ?? value.x)
  const y = finiteNumber(value.y0 ?? value.y)
  const x1 = finiteNumber(value.x1)
  const y1 = finiteNumber(value.y1)
  const width = finiteNumber(value.width) ?? (x1 !== null && x !== null ? x1 - x : null)
  const height = finiteNumber(value.height) ?? (y1 !== null && y !== null ? y1 - y : null)

  if (x === null || y === null || width === null || height === null) return undefined
  if (width <= 0 || height <= 0) return undefined

  return { x, y, width, height }
}

export function mapRecognizedPage(data: any): LocalOcrPage {
  const lines: LocalOcrLine[] = []

  for (const block of data?.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const text = (line.text || "").trim()
        if (!text) continue

        const words: LocalOcrWord[] = []
        for (const word of line.words || []) {
          const wordText = (word.text || "").trim()
          const boundingBox = readBoundingBox(word.bbox)
          if (!wordText || !boundingBox) continue
          words.push({
            text: wordText,
            confidence: toAppScale(
              typeof word.confidence === "number" ? word.confidence : data.confidence ?? 0,
            ),
            boundingBox,
            baseline: finiteNumber(word.baseline) ?? undefined,
          })
        }

        const boundingBox = readBoundingBox(line.bbox)
        const measuredBaselines = words
          .map((word) => word.baseline)
          .filter((value): value is number => typeof value === "number")
        const baseline =
          finiteNumber(line.baseline) ??
          (measuredBaselines.length > 0
            ? measuredBaselines.reduce((sum, value) => sum + value, 0) / measuredBaselines.length
            : boundingBox
              ? boundingBox.y + boundingBox.height * 0.85
              : undefined)

        lines.push({
          text,
          confidence: toAppScale(
            typeof line.confidence === "number" ? line.confidence : data.confidence ?? 0,
          ),
          boundingBox,
          words: words.length > 0 ? words : undefined,
          baseline,
        })
      }
    }
  }

  return {
    text: (data?.text || "").trim(),
    confidence: toAppScale(data?.confidence ?? 0),
    lines,
  }
}

/** Any other language stays on the engine that can spell it. */
export function isLocallySupported(language?: string): boolean {
  return SUPPORTED_LANGUAGES.has((language || "en").toLowerCase());
}

let workerPromise: Promise<any> | null = null;

async function createOcrWorker(): Promise<any> {
  // The test runner and any prerender have neither a Worker nor a DOM to decode into.
  if (typeof document === "undefined" || typeof Worker === "undefined") return null;

  if (typeof WebAssembly === "undefined") return null;

  const tesseract = await import("tesseract.js");

  return tesseract.createWorker("eng", 1, {
    workerPath: `${ASSET_ROOT}/worker.min.js`,
    corePath: CORE_FILE,
    langPath: LANGUAGE_DIR,
    gzip: false,
    legacyCore: false,
    // The default builds the worker out of a blob holding an importScripts call, and
    // script-src does not list blob:, so the worker script is loaded by URL.
    workerBlobURL: false,
    errorHandler: () => {},
  });
}

function getOcrWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = createOcrWorker()
      .then((worker: any) => {
        // An environment that cannot answer yet gets another chance on the next scan.
        if (!worker) workerPromise = null;

        return worker;
      })
      .catch((err: any) => {
        workerPromise = null;

        console.warn("In-browser OCR engine unavailable:", err);

        return null;
      });
  }

  return workerPromise;
}

async function discardWorker(): Promise<void> {
  const broken = workerPromise;

  workerPromise = null;

  try {
    const worker = await broken;

    await worker?.terminate?.();
  } catch {
    // A worker that will not die is not worth surfacing to the visitor.
  }
}

/**
 * Reads one page image. A null means there was no engine to ask, which the caller treats
 * as "nothing to report" rather than a failure; a page flagged as failed is one the
 * engine attempted and could not do, and that is the paid engine's business.
 */
export async function recognizePage(
  image: Blob,

  timeoutMs: number = PAGE_DEADLINE_MS,

  signal?: AbortSignal,
): Promise<LocalOcrPage | null> {
  signal?.throwIfAborted()

  const worker = await getOcrWorker();

  if (!worker) return null;

  signal?.throwIfAborted()

  let timer: ReturnType<typeof setTimeout> | null = null;
  let onAbort: (() => void) | undefined;

  try {
    // Confidence per line only exists in the block tree; the text-only default would
    // leave a single page average to be copied onto every line, which is a number the
    // engine never measured per line.
    const job = worker.recognize(image, {}, { text: true, blocks: true });

    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`In-browser OCR gave up after ${timeoutMs}ms on one page.`)),
        timeoutMs,
      );
    });
    const aborted = signal
      ? new Promise((_resolve, reject) => {
          onAbort = () => reject(new DOMException("OCR cancelled", "AbortError"));
          signal.addEventListener("abort", onAbort, { once: true });
        })
      : null;

    const { data } = await Promise.race([job, deadline, ...(aborted ? [aborted] : [])]);

    signal?.throwIfAborted()

    return mapRecognizedPage(data);
  } catch (err: any) {
    if (signal?.aborted) {
      await discardWorker();
      throw err;
    }

    console.warn("In-browser OCR pass failed:", err);

    // A page that threw, or ran out of time, may have left the WASM context busy or
    // unusable, so the worker is discarded rather than inherited by the next scan.
    await discardWorker();

    return { text: "", confidence: 0, lines: [], failed: true };
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}
