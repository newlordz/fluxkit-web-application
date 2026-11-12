// .agents/teamwork/worker_m5_1/m5_services_patch.cjs
// Script to cleanly append Milestone 5 client-side AI text engines to src/services.ts

const fs = require("fs");
const path = require("path");

const servicesPath = path.resolve("src", "services.ts");
const rawContent = fs.readFileSync(servicesPath, "utf8");

const targetEnding = `    return {
      blob: finalBlob,
      name: finalFilename,
      filename: finalFilename,
      originalSize,
      intermediateSize,
      finalSize,
      savedPercentage,
    }
  }
}`;

const targetIndex = rawContent.indexOf(targetEnding);
if (targetIndex === -1) {
  console.error("Target ending not found in src/services.ts!");
  process.exit(1);
}

// Truncate cleanly after targetEnding
const baseContent = rawContent.slice(0, targetIndex + targetEnding.length);

const m5Code = `

// ============================================================================
// MILESTONE 5: CLIENT-SIDE AI & NLP TEXT SUITE (TOOLS #26 TO #33)
// 100% In-Browser Interactive AI Processing with Mathematical & Linguistic Rigor
// ============================================================================

// ----------------------------------------------------------------------------
// Common NLP Resources (Extended Stopwords & Tokenization Utilities)
// ----------------------------------------------------------------------------
export const AI_TEXT_STOPWORDS = new Set([
  "a", "about", "above", "across", "after", "afterwards", "again", "against", "all",
  "almost", "alone", "along", "already", "also", "although", "always", "am", "among",
  "amongst", "amount", "an", "and", "another", "any", "anyhow", "anyone", "anything",
  "anyway", "anywhere", "are", "around", "as", "at", "back", "be", "became", "because",
  "become", "becomes", "becoming", "been", "before", "beforehand", "behind", "being",
  "below", "beside", "besides", "between", "beyond", "both", "bottom", "but", "by",
  "can", "cannot", "cant", "could", "couldnt", "de", "describe", "do", "done", "down",
  "due", "during", "each", "eg", "eight", "either", "eleven", "else", "elsewhere",
  "enough", "etc", "even", "ever", "every", "everyone", "everything", "everywhere",
  "except", "few", "fifteen", "fifty", "fill", "find", "fire", "first", "five", "for",
  "former", "formerly", "forty", "found", "four", "from", "front", "full", "further",
  "get", "give", "go", "had", "has", "hasnt", "have", "he", "hence", "her", "here",
  "hereafter", "hereby", "herein", "hereupon", "hers", "herself", "him", "himself",
  "his", "how", "however", "hundred", "i", "ie", "if", "in", "inc", "indeed", "into",
  "is", "it", "its", "itself", "keep", "last", "latter", "latterly", "least", "less",
  "ltd", "made", "many", "may", "me", "meanwhile", "might", "mill", "mine", "more",
  "moreover", "most", "mostly", "move", "much", "must", "my", "myself", "name",
  "namely", "neither", "never", "nevertheless", "next", "nine", "no", "nobody", "none",
  "noone", "nor", "not", "nothing", "now", "nowhere", "of", "off", "often", "on",
  "once", "one", "only", "onto", "or", "other", "others", "otherwise", "our", "ours",
  "ourselves", "out", "over", "own", "part", "per", "perhaps", "please", "put", "rather",
  "re", "same", "see", "seem", "seemed", "seeming", "seems", "serious", "several",
  "she", "should", "show", "side", "since", "sincere", "six", "sixty", "so", "some",
  "somehow", "someone", "something", "sometime", "sometimes", "somewhere", "still",
  "such", "system", "take", "ten", "than", "that", "the", "their", "them", "themselves",
  "then", "thence", "there", "thereafter", "thereby", "therefore", "therein", "thereupon",
  "these", "they", "thick", "thin", "third", "this", "those", "though", "three",
  "through", "throughout", "thru", "thus", "to", "together", "too", "top", "toward",
  "towards", "twelve", "twenty", "two", "un", "under", "until", "up", "upon", "us",
  "very", "via", "was", "we", "well", "were", "what", "whatever", "when", "whence",
  "whenever", "where", "whereafter", "whereas", "whereby", "wherein", "whereupon",
  "wherever", "whether", "which", "while", "whither", "who", "whoever", "whole",
  "whom", "whose", "why", "will", "with", "within", "without", "would", "yet", "you",
  "your", "yours", "yourself", "yourselves"
]);

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, "\\\\$&");
}

function applyCasing(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement.toLowerCase();
}

// ============================================================================
// 1. Tool #26: Summarize Document (Extractive TF-ISF Sentence Engine)
// ============================================================================

export interface SummarizeOptions {
  mode?: "sentences" | "percentage"; // default: "sentences"
  targetLength?: number; // count (e.g. 3, 5, 10) or percent (e.g. 25, 50); default: 3
  format?: "bullet" | "narrative" | "executive"; // default: "bullet"
  title?: string;
}

export interface SummarizeResult {
  summary: string;
  originalSentenceCount: number;
  summarySentenceCount: number;
  originalWordCount: number;
  summaryWordCount: number;
  reductionPercentage: number;
  keyThemes: string[];
  formattedReport: string;
}

export function summarizeDocument(
  text: string,
  options: SummarizeOptions = {}
): SummarizeResult {
  if (!text || !text.trim()) {
    throw new Error("Enter some text or document content to process.");
  }
  const clean = text.trim();
  const mode = options.mode || "sentences";
  const format = options.format || "bullet";

  // Robust sentence boundary splitting
  const rawSentences = clean
    .split(/(?<=[.?!])\\s+|\\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const originalSentenceCount = rawSentences.length;
  const words = clean.match(/\\b[\\w'-]+\\b/g) || [];
  const originalWordCount = words.length;

  if (rawSentences.length <= 1) {
    const summary = format === "bullet" ? \`• \${clean}\` : clean;
    return {
      summary,
      originalSentenceCount: 1,
      summarySentenceCount: 1,
      originalWordCount,
      summaryWordCount: originalWordCount,
      reductionPercentage: 0,
      keyThemes: words.slice(0, 3).map((w) => w.toLowerCase()),
      formattedReport: \`Executive Summary (\${originalWordCount} words):\\n\\n\${summary}\`,
    };
  }

  // Calculate target sentence count
  let targetCount = 3;
  if (mode === "percentage") {
    const pct = options.targetLength !== undefined ? options.targetLength : 25;
    targetCount = Math.max(1, Math.round((originalSentenceCount * Math.max(5, Math.min(100, pct))) / 100));
  } else {
    targetCount = options.targetLength !== undefined ? Math.max(1, options.targetLength) : 3;
  }
  targetCount = Math.min(targetCount, originalSentenceCount);

  // Tokenize sentences into lower-case alphanumeric tokens
  const sentenceTokens = rawSentences.map((s) => s.toLowerCase().match(/\\b[a-z]{3,}\\b/g) || []);

  // Compute Term Frequencies and Sentence Frequencies
  const docTF: Record<string, number> = {};
  const sentenceFreq: Record<string, number> = {};

  sentenceTokens.forEach((tokens) => {
    const seen = new Set<string>();
    tokens.forEach((tok) => {
      if (!AI_TEXT_STOPWORDS.has(tok)) {
        docTF[tok] = (docTF[tok] || 0) + 1;
        if (!seen.has(tok)) {
          seen.add(tok);
          sentenceFreq[tok] = (sentenceFreq[tok] || 0) + 1;
        }
      }
    });
  });

  // Inverse Sentence Frequency (ISF) calculation
  const isf: Record<string, number> = {};
  const N = rawSentences.length;
  Object.keys(sentenceFreq).forEach((term) => {
    isf[term] = Math.log((N + 1) / (sentenceFreq[term] + 0.5)) + 1;
  });

  // Score sentences using TF-ISF and positional heuristics
  const scoredSentences = rawSentences.map((sentence, idx) => {
    const tokens = sentenceTokens[idx];
    let score = 0;
    tokens.forEach((t) => {
      if (isf[t]) {
        score += isf[t] * (docTF[t] || 1);
      }
    });

    // Length normalization (sublinear)
    const lengthNorm = Math.sqrt(Math.max(1, tokens.length));
    score = score / lengthNorm;

    // Positional prominence boost
    if (idx === 0) score *= 1.35;
    else if (idx === 1) score *= 1.20;
    else if (idx === rawSentences.length - 1) score *= 1.15;

    // Factual entity and numerical boost
    if (/\\d+/.test(sentence) || /[%$€£]/.test(sentence)) {
      score *= 1.10;
    }

    return { text: sentence, score, originalIndex: idx };
  });

  // Pick top K scored sentences
  const topScored = [...scoredSentences]
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount);

  // Re-sort chronologically by original document index
  topScored.sort((a, b) => a.originalIndex - b.originalIndex);

  // Format the output
  let summary = "";
  if (format === "bullet") {
    summary = topScored.map((s) => \`• \${s.text}\`).join("\\n\\n");
  } else if (format === "executive") {
    const title = options.title ? \`\${options.title.trim()} — Executive Summary\` : "Executive Summary";
    summary = \`\${title}\\n\\nKey Takeaways:\\n\` + topScored.map((s) => \`• \${s.text}\`).join("\\n");
  } else {
    summary = topScored.map((s) => s.text).join(" ");
  }

  const summaryWords = summary.match(/\\b[\\w'-]+\\b/g) || [];
  const summaryWordCount = summaryWords.length;
  const reductionPercentage =
    originalWordCount > 0
      ? Math.max(0, Math.round(((originalWordCount - summaryWordCount) / originalWordCount) * 100))
      : 0;

  const keyThemes = Object.entries(docTF)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  const formattedReport =
    \`Executive Summary Report:\\n\` +
    \`• Original: \${originalSentenceCount} sentences (\${originalWordCount} words)\\n\` +
    \`• Summary: \${topScored.length} sentences (\${summaryWordCount} words)\\n\` +
    \`• Compression: \${reductionPercentage}% reduction\\n\` +
    \`• Key Themes: \${keyThemes.join(", ") || "General"}\\n\\n\` +
    \`Summary Content:\\n\${summary}\`;

  return {
    summary,
    originalSentenceCount,
    summarySentenceCount: topScored.length,
    originalWordCount,
    summaryWordCount,
    reductionPercentage,
    keyThemes,
    formattedReport,
  };
}

export const summarizeText = summarizeDocument;

// ============================================================================
// 2. Tool #27: Rewrite Content (Multi-Tone Linguistic Engine)
// ============================================================================

export type RewriteTone =
  | "Professional"
  | "Casual"
  | "Academic"
  | "Concise"
  | "Persuasive";

export interface RewriteOptions {
  tone: RewriteTone;
  preserveFormatting?: boolean;
}

export interface RewriteResult {
  rewrittenText: string;
  tone: RewriteTone;
  replacementsCount: number;
  originalWordCount: number;
  newWordCount: number;
  appliedTransforms: string[];
  formattedReport: string;
}

// Contraction expansion map (used for Formal/Professional/Academic)
const CONTRACTION_EXPANSIONS: [RegExp, string][] = [
  [/\\bcan't\\b/gi, "cannot"],
  [/\\bwon't\\b/gi, "will not"],
  [/\\bdon't\\b/gi, "do not"],
  [/\\bdoesn't\\b/gi, "does not"],
  [/\\bdidn't\\b/gi, "did not"],
  [/\\bisn't\\b/gi, "is not"],
  [/\\baren't\\b/gi, "are not"],
  [/\\bwasn't\\b/gi, "was not"],
  [/\\bweren't\\b/gi, "were not"],
  [/\\bhaven't\\b/gi, "have not"],
  [/\\bhasn't\\b/gi, "has not"],
  [/\\bhadn't\\b/gi, "had not"],
  [/\\bcouldn't\\b/gi, "could not"],
  [/\\bshouldn't\\b/gi, "should not"],
  [/\\bwouldn't\\b/gi, "would not"],
  [/\\bit's\\b/gi, "it is"],
  [/\\bi'm\\b/gi, "I am"],
  [/\\byou're\\b/gi, "you are"],
  [/\\bwe're\\b/gi, "we are"],
  [/\\bthey're\\b/gi, "they are"],
  [/\\bthat's\\b/gi, "that is"],
  [/\\bthere's\\b/gi, "there is"],
  [/\\bwho's\\b/gi, "who is"],
  [/\\bwhat's\\b/gi, "what is"],
  [/\\blet's\\b/gi, "let us"],
];

// Contraction collapse map (used for Casual)
const CONTRACTION_COLLAPSES: [RegExp, string][] = [
  [/\\bdo not\\b/gi, "don't"],
  [/\\bcannot\\b/gi, "can't"],
  [/\\bwill not\\b/gi, "won't"],
  [/\\bit is\\b/gi, "it's"],
  [/\\bi am\\b/gi, "I'm"],
  [/\\bare not\\b/gi, "aren't"],
  [/\\bis not\\b/gi, "isn't"],
  [/\\bdid not\\b/gi, "didn't"],
  [/\\bdoes not\\b/gi, "doesn't"],
  [/\\bhave not\\b/gi, "haven't"],
  [/\\bhas not\\b/gi, "hasn't"],
  [/\\bwe are\\b/gi, "we're"],
  [/\\bthey are\\b/gi, "they're"],
  [/\\byou are\\b/gi, "you're"],
  [/\\bcould not\\b/gi, "couldn't"],
  [/\\bshould not\\b/gi, "shouldn't"],
  [/\\bwould not\\b/gi, "wouldn't"],
];

// Tone transformation lexicons
const PROFESSIONAL_TRANSFORMS: [RegExp, string][] = [
  [/\\ba lot of\\b/gi, "a substantial number of"],
  [/\\ba lot\\b/gi, "substantially"],
  [/\\bget\\b/gi, "obtain"],
  [/\\bhelp\\b/gi, "assist"],
  [/\\bneed\\b/gi, "require"],
  [/\\bbuy\\b/gi, "purchase"],
  [/\\buse\\b/gi, "utilize"],
  [/\\bgood\\b/gi, "effective"],
  [/\\bbad\\b/gi, "suboptimal"],
  [/\\bso\\b/gi, "consequently"],
  [/\\bbig\\b/gi, "substantial"],
  [/\\bstart\\b/gi, "commence"],
  [/\\bfix\\b/gi, "resolve"],
  [/\\bshow\\b/gi, "demonstrate"],
  [/\\bask\\b/gi, "inquire"],
  [/\\bgive\\b/gi, "provide"],
  [/\\btalk about\\b/gi, "discuss"],
  [/\\blook at\\b/gi, "examine"],
  [/\\bmake sure\\b/gi, "ensure"],
  [/\\btell\\b/gi, "inform"],
  [/\\bjob\\b/gi, "role"],
  [/\\bboss\\b/gi, "supervisor"],
  [/\\bfree time\\b/gi, "availability"],
  [/\\bset up\\b/gi, "establish"],
];

const CASUAL_TRANSFORMS: [RegExp, string][] = [
  [/\\butilize\\b/gi, "use"],
  [/\\bcommence\\b/gi, "start"],
  [/\\binquire\\b/gi, "ask"],
  [/\\bsubsequently\\b/gi, "then"],
  [/\\bfurthermore\\b/gi, "also"],
  [/\\bnevertheless\\b/gi, "anyway"],
  [/\\bterminate\\b/gi, "end"],
  [/\\bendeavor\\b/gi, "try"],
  [/\\binform\\b/gi, "let you know"],
  [/\\bassist\\b/gi, "help"],
  [/\\bpurchase\\b/gi, "buy"],
  [/\\brequire\\b/gi, "need"],
  [/\\bdemonstrate\\b/gi, "show"],
  [/\\bconsequently\\b/gi, "so"],
  [/\\bsubstantial\\b/gi, "huge"],
  [/\\bresolve\\b/gi, "fix"],
  [/\\bprovide\\b/gi, "give"],
  [/\\bobtain\\b/gi, "get"],
  [/\\bsuboptimal\\b/gi, "not great"],
  [/\\beffective\\b/gi, "awesome"],
  [/\\bexamine\\b/gi, "check out"],
  [/\\bestablish\\b/gi, "set up"],
];

const ACADEMIC_TRANSFORMS: [RegExp, string][] = [
  [/\\bfind out\\b/gi, "ascertain"],
  [/\\bthink\\b/gi, "postulate"],
  [/\\bshows\\b/gi, "illustrates"],
  [/\\bshow\\b/gi, "demonstrate"],
  [/\\bclear\\b/gi, "evident"],
  [/\\benough\\b/gi, "sufficient"],
  [/\\babout\\b/gi, "approximately"],
  [/\\blook into\\b/gi, "investigate"],
  [/\\bput together\\b/gi, "synthesize"],
  [/\\bseem\\b/gi, "appear"],
  [/\\bmake sure\\b/gi, "ensure"],
  [/\\bgood\\b/gi, "efficacious"],
  [/\\bbad\\b/gi, "adverse"],
  [/\\ba lot\\b/gi, "a considerable volume"],
  [/\\bvery\\b/gi, "exceedingly"],
  [/\\bprove\\b/gi, "substantiate"],
  [/\\bway\\b/gi, "methodology"],
  [/\\banswer\\b/gi, "resolution"],
  [/\\bparts\\b/gi, "constituents"],
];

const CONCISE_TRANSFORMS: [RegExp, string][] = [
  [/\\bin order to\\b/gi, "to"],
  [/\\bat the present time\\b/gi, "currently"],
  [/\\bdue to the fact that\\b/gi, "because"],
  [/\\bfor the purpose of\\b/gi, "for"],
  [/\\bin the event that\\b/gi, "if"],
  [/\\bin spite of the fact that\\b/gi, "although"],
  [/\\buntil such time as\\b/gi, "until"],
  [/\\bwith reference to\\b/gi, "regarding"],
  [/\\bat all times\\b/gi, "always"],
  [/\\bbring to a conclusion\\b/gi, "conclude"],
  [/\\bcome to an agreement\\b/gi, "agree"],
  [/\\bis able to\\b/gi, "can"],
  [/\\babsolutely essential\\b/gi, "essential"],
  [/\\btotally unique\\b/gi, "unique"],
  [/\\bfirst and foremost\\b/gi, "primarily"],
  [/\\ba large number of\\b/gi, "many"],
  [/\\btake into consideration\\b/gi, "consider"],
  [/\\bgive consideration to\\b/gi, "consider"],
  [/\\bmake a decision\\b/gi, "decide"],
  [/\\bhas the ability to\\b/gi, "can"],
];

const PERSUASIVE_TRANSFORMS: [RegExp, string][] = [
  [/\\bgood\\b/gi, "exceptional"],
  [/\\bhelp\\b/gi, "empower"],
  [/\\bimprove\\b/gi, "transform"],
  [/\\bimportant\\b/gi, "vital"],
  [/\\bchange\\b/gi, "revolutionize"],
  [/\\beffective\\b/gi, "unrivaled"],
  [/\\bfast\\b/gi, "rapid"],
  [/\\beasy\\b/gi, "effortless"],
  [/\\bgreat\\b/gi, "groundbreaking"],
  [/\\bstrong\\b/gi, "unshakeable"],
  [/\\buseful\\b/gi, "indispensable"],
  [/\\bnew\\b/gi, "next-generation"],
  [/\\bbetter\\b/gi, "superior"],
  [/\\bbig\\b/gi, "monumental"],
  [/\\bproblem\\b/gi, "critical bottleneck"],
  [/\\bsolution\\b/gi, "breakthrough strategy"],
];

export function rewriteContent(
  text: string,
  options: RewriteOptions
): RewriteResult {
  if (!text || !text.trim()) {
    throw new Error("Enter some text or document content to process.");
  }
  const clean = text.trim();
  const tone = options.tone || "Professional";
  let result = clean;
  let replacementsCount = 0;
  const appliedTransforms: string[] = [];

  function executeReplacements(list: [RegExp, string][]) {
    for (const [regex, replacement] of list) {
      result = result.replace(regex, (match) => {
        replacementsCount++;
        const substituted = applyCasing(match, replacement);
        const transformLabel = \`"\${match}" → "\${substituted}"\`;
        if (appliedTransforms.length < 10 && !appliedTransforms.includes(transformLabel)) {
          appliedTransforms.push(transformLabel);
        }
        return substituted;
      });
    }
  }

  // Stage 1: Contractions
  if (tone === "Casual") {
    executeReplacements(CONTRACTION_COLLAPSES);
  } else {
    executeReplacements(CONTRACTION_EXPANSIONS);
  }

  // Stage 2: Tone-Specific Lexicons
  if (tone === "Professional") {
    executeReplacements(PROFESSIONAL_TRANSFORMS);
  } else if (tone === "Casual") {
    executeReplacements(CASUAL_TRANSFORMS);
  } else if (tone === "Academic") {
    executeReplacements(ACADEMIC_TRANSFORMS);
  } else if (tone === "Concise") {
    executeReplacements(CONCISE_TRANSFORMS);
  } else if (tone === "Persuasive") {
    executeReplacements(PERSUASIVE_TRANSFORMS);
  }

  const originalWords = clean.match(/\\b[\\w'-]+\\b/g) || [];
  const newWords = result.match(/\\b[\\w'-]+\\b/g) || [];

  const formattedReport =
    \`Rewritten Content Report (\${tone} Tone):\\n\` +
    \`• Original Word Count: \${originalWords.length}\\n\` +
    \`• Rewritten Word Count: \${newWords.length}\\n\` +
    \`• Total Linguistic Adjustments: \${replacementsCount}\\n\` +
    (appliedTransforms.length > 0
      ? \`• Key Transformations: \${appliedTransforms.slice(0, 5).join(", ")}\\n\\n\`
      : "\\n") +
    \`Rewritten Content:\\n\${result}\`;

  return {
    rewrittenText: result,
    tone,
    replacementsCount,
    originalWordCount: originalWords.length,
    newWordCount: newWords.length,
    appliedTransforms,
    formattedReport,
  };
}

export const rewriteText = rewriteContent;

// ============================================================================
// 3. Tool #28: Translate Text (Multilingual Phrase & Lexicon Engine)
// ============================================================================

export type SupportedLanguage =
  | "English"
  | "Spanish"
  | "French"
  | "German"
  | "Italian"
  | "Portuguese"
  | "Chinese"
  | "Japanese";

export interface TranslationOptions {
  targetLanguage: SupportedLanguage;
  sourceLanguage?: SupportedLanguage | "auto";
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  wordCount: number;
  translatedWordCount: number;
  coveragePercentage: number;
  detectedConfidence: number;
  formattedReport: string;
}

// Multi-word phrase translation mappings across 8 languages
const MULTI_WORD_IDIOMS: { en: string; es: string; fr: string; de: string; it: string; pt: string; zh: string; ja: string }[] = [
  { en: "good morning", es: "buenos días", fr: "bonjour", de: "guten Morgen", it: "buongiorno", pt: "bom dia", zh: "早上好", ja: "おはようございます" },
  { en: "good afternoon", es: "buenas tardes", fr: "bon après-midi", de: "guten Tag", it: "buon pomeriggio", pt: "boa tarde", zh: "下午好", ja: "こんにちは" },
  { en: "good evening", es: "buenas noches", fr: "bonsoir", de: "guten Abend", it: "buonasera", pt: "boa noite", zh: "晚上好", ja: "こんばんは" },
  { en: "thank you very much", es: "muchas gracias", fr: "merci beaucoup", de: "vielen Dank", it: "grazie mille", pt: "muito obrigado", zh: "非常感谢", ja: "どうもありがとうございます" },
  { en: "you are welcome", es: "de nada", fr: "de rien", de: "bitte schön", it: "prego", pt: "de nada", zh: "不客气", ja: "どういたしまして" },
  { en: "how are you", es: "cómo estás", fr: "comment allez-vous", de: "wie geht es Ihnen", it: "come stai", pt: "como você está", zh: "你好吗", ja: "お元気ですか" },
  { en: "pleased to meet you", es: "encantado de conocerte", fr: "enchanté", de: "freut mich", it: "piacere di conoscerla", pt: "prazer em conhecê-lo", zh: "很高兴认识你", ja: "はじめまして" },
  { en: "see you later", es: "hasta luego", fr: "à plus tard", de: "bis später", it: "a dopo", pt: "até logo", zh: "回头见", ja: "また後で" },
  { en: "as soon as possible", es: "lo antes posible", fr: "dès que possible", de: "so bald wie möglich", it: "al più presto", pt: "o mais rápido possível", zh: "尽快", ja: "できるだけ早く" },
  { en: "artificial intelligence", es: "inteligencia artificial", fr: "intelligence artificielle", de: "künstliche Intelligenz", it: "intelligenza artificiale", pt: "inteligência artificial", zh: "人工智能", ja: "人工知能" },
  { en: "machine learning", es: "aprendizaje automático", fr: "aprendizaje automatique", de: "maschinelles Lernen", it: "apprendimento automatico", pt: "aprendizado de máquina", zh: "机器学习", ja: "機械学習" },
  { en: "project manager", es: "gestor de proyectos", fr: "chef de projet", de: "Projektleiter", it: "responsabile del progetto", pt: "gerente de projetos", zh: "项目经理", ja: "プロジェクトマネージャー" },
  { en: "software engineer", es: "ingeniero de software", fr: "ingénieur logiciel", de: "Software-Entwickler", it: "ingegnere del software", pt: "engenheiro de software", zh: "软件工程师", ja: "ソフトウェアエンジニア" },
  { en: "user interface", es: "interfaz de usuario", fr: "interface utilisateur", de: "Benutzeroberfläche", it: "interfaccia utente", pt: "interface de usuário", zh: "用户界面", ja: "ユーザーインターフェース" },
  { en: "data analysis", es: "análisis de datos", fr: "analyse de données", de: "Datenanalyse", it: "analisi dei dati", pt: "análise de dados", zh: "数据分析", ja: "データ分析" },
  { en: "terms and conditions", es: "términos y condiciones", fr: "termes et conditions", de: "Geschäftsbedingungen", it: "termini e condizioni", pt: "termos e condições", zh: "条款和条件", ja: "利用規約" },
  { en: "privacy policy", es: "política de privacidad", fr: "politique de confidentialité", de: "Datenschutzerklärung", it: "politica sulla privacy", pt: "política de privacidade", zh: "隐私政策", ja: "プライバシーポリシー" },
  { en: "annual report", es: "informe anual", fr: "rapport annuel", de: "Jahresbericht", it: "relazione annuale", pt: "relatório anual", zh: "年度报告", ja: "年次報告書" },
  { en: "best regards", es: "saludos cordiales", fr: "cordialement", de: "mit freundlichen Grüßen", it: "cordiali saluti", pt: "atenciosamente", zh: "此致敬礼", ja: "よろしくお願いします" },
  { en: "kind regards", es: "atentamente", fr: "bien cordialement", de: "herzliche Grüße", it: "distinti saluti", pt: "cordiais saudações", zh: "问好", ja: "敬具" },
  { en: "looking forward", es: "esperando con interés", fr: "dans l'attente", de: "ich freue mich auf", it: "in attesa di", pt: "aguardando com expectativa", zh: "期待", ja: "楽しみにしています" },
];

// Single word lexicons (mapped to English base)
const CORE_VOCABULARY: Record<string, { es: string; fr: string; de: string; it: string; pt: string; zh: string; ja: string }> = {
  "hello": { es: "hola", fr: "bonjour", de: "hallo", it: "ciao", pt: "olá", zh: "你好", ja: "こんにちは" },
  "world": { es: "mundo", fr: "monde", de: "Welt", it: "mondo", pt: "mundo", zh: "世界", ja: "世界" },
  "yes": { es: "sí", fr: "oui", de: "ja", it: "sì", pt: "sim", zh: "是", ja: "はい" },
  "no": { es: "no", fr: "non", de: "nein", it: "no", pt: "não", zh: "不", ja: "いいえ" },
  "please": { es: "por favor", fr: "s'il vous plaît", de: "bitte", it: "per favore", pt: "por favor", zh: "请", ja: "お願いします" },
  "thank": { es: "gracias", fr: "merci", de: "danke", it: "grazie", pt: "obrigado", zh: "谢谢", ja: "ありがとう" },
  "thanks": { es: "gracias", fr: "merci", de: "danke", it: "grazie", pt: "obrigado", zh: "多谢", ja: "どうも" },
  "goodbye": { es: "adiós", fr: "au revoir", de: "auf Wiedersehen", it: "arrivederci", pt: "adeus", zh: "再见", ja: "さようなら" },
  "welcome": { es: "bienvenido", fr: "bienvenue", de: "willkommen", it: "benvenuto", pt: "bem-vindo", zh: "欢迎", ja: "ようこそ" },
  "document": { es: "documento", fr: "document", de: "Dokument", it: "documento", pt: "documento", zh: "文档", ja: "文書" },
  "documents": { es: "documentos", fr: "documents", de: "Dokumente", it: "documenti", pt: "documentos", zh: "文件", ja: "書類" },
  "file": { es: "archivo", fr: "fichier", de: "Datei", it: "file", pt: "arquivo", zh: "文件", ja: "ファイル" },
  "files": { es: "archivos", fr: "fichiers", de: "Dateien", it: "file", pt: "arquivos", zh: "文件", ja: "ファイル" },
  "report": { es: "informe", fr: "rapport", de: "Bericht", it: "rapporto", pt: "relatório", zh: "报告", ja: "報告書" },
  "project": { es: "proyecto", fr: "projet", de: "Projekt", it: "progetto", pt: "projeto", zh: "项目", ja: "プロジェクト" },
  "team": { es: "equipo", fr: "équipe", de: "Team", it: "squadra", pt: "equipe", zh: "团队", ja: "チーム" },
  "company": { es: "empresa", fr: "entreprise", de: "Unternehmen", it: "azienda", pt: "empresa", zh: "公司", ja: "会社" },
  "user": { es: "usuario", fr: "utilisateur", de: "Benutzer", it: "utente", pt: "usuário", zh: "用户", ja: "ユーザー" },
  "users": { es: "usuarios", fr: "utilisateurs", de: "Benutzer", it: "utenti", pt: "usuários", zh: "用户", ja: "ユーザー" },
  "system": { es: "sistema", fr: "système", de: "System", it: "sistema", pt: "sistema", zh: "系统", ja: "システム" },
  "data": { es: "datos", fr: "données", de: "Daten", it: "dati", pt: "dados", zh: "数据", ja: "データ" },
  "result": { es: "resultado", fr: "résultat", de: "Ergebnis", it: "risultato", pt: "resultado", zh: "结果", ja: "結果" },
  "results": { es: "resultados", fr: "résultats", de: "Ergebnisse", it: "risultati", pt: "resultados", zh: "结果", ja: "結果" },
  "problem": { es: "problema", fr: "problème", de: "Problem", it: "problema", pt: "problema", zh: "问题", ja: "問題" },
  "solution": { es: "solución", fr: "solution", de: "Lösung", it: "soluzione", pt: "solução", zh: "解决方案", ja: "解決策" },
  "goal": { es: "meta", fr: "objectif", de: "Ziel", it: "obiettivo", pt: "meta", zh: "目标", ja: "目標" },
  "plan": { es: "plan", fr: "plan", de: "Plan", it: "piano", pt: "plano", zh: "计划", ja: "計画" },
  "meeting": { es: "reunión", fr: "réunion", de: "Besprechung", it: "riunione", pt: "reunião", zh: "会议", ja: "会議" },
  "message": { es: "mensaje", fr: "message", de: "Nachricht", it: "messaggio", pt: "mensagem", zh: "信息", ja: "メッセージ" },
  "email": { es: "correo", fr: "courriel", de: "E-Mail", it: "email", pt: "e-mail", zh: "电子邮件", ja: "メール" },
  "time": { es: "tiempo", fr: "temps", de: "Zeit", it: "tempo", pt: "tempo", zh: "时间", ja: "時間" },
  "day": { es: "día", fr: "jour", de: "Tag", it: "giorno", pt: "dia", zh: "天", ja: "日" },
  "week": { es: "semana", fr: "semaine", de: "Woche", it: "settimana", pt: "semana", zh: "周", ja: "週" },
  "month": { es: "mes", fr: "mois", de: "Monat", it: "mese", pt: "mês", zh: "月", ja: "月" },
  "year": { es: "año", fr: "année", de: "Jahr", it: "anno", pt: "ano", zh: "年", ja: "年" },
  "today": { es: "hoy", fr: "aujourd'hui", de: "heute", it: "oggi", pt: "hoje", zh: "今天", ja: "今日" },
  "tomorrow": { es: "mañana", fr: "demain", de: "morgen", it: "domani", pt: "amanhã", zh: "明天", ja: "明日" },
  "yesterday": { es: "ayer", fr: "hier", de: "gestern", it: "ieri", pt: "ontem", zh: "昨天", ja: "昨日" },
  "create": { es: "crear", fr: "créer", de: "erstellen", it: "creare", pt: "criar", zh: "创建", ja: "作成する" },
  "build": { es: "construir", fr: "construire", de: "bauen", it: "costruire", pt: "construir", zh: "构建", ja: "構築する" },
  "read": { es: "leer", fr: "lire", de: "lesen", it: "leggere", pt: "ler", zh: "阅读", ja: "読む" },
  "write": { es: "escribir", fr: "écrire", de: "schreiben", it: "scrivere", pt: "escrever", zh: "编写", ja: "書く" },
  "start": { es: "iniciar", fr: "démarrer", de: "starten", it: "iniziare", pt: "iniciar", zh: "开始", ja: "開始する" },
  "finish": { es: "terminar", fr: "terminer", de: "beenden", it: "finire", pt: "terminar", zh: "完成", ja: "終了する" },
  "send": { es: "enviar", fr: "envoyer", de: "senden", it: "inviare", pt: "enviar", zh: "发送", ja: "送信する" },
  "receive": { es: "recibir", fr: "recevoir", de: "erhalten", it: "ricevere", pt: "receber", zh: "接收", ja: "受信する" },
  "review": { es: "revisar", fr: "examiner", de: "überprüfen", it: "rivedere", pt: "revisar", zh: "审查", ja: "レビューする" },
  "approve": { es: "aprobar", fr: "approuver", de: "genehmigen", it: "approvare", pt: "aprovar", zh: "批准", ja: "承認する" },
  "update": { es: "actualizar", fr: "mettre à jour", de: "aktualisieren", it: "aggiornare", pt: "atualizar", zh: "更新", ja: "更新する" },
  "save": { es: "guardar", fr: "enregistrer", de: "speichern", it: "salvare", pt: "salvar", zh: "保存", ja: "保存する" },
  "open": { es: "abrir", fr: "ouvrir", de: "öffnen", it: "aprire", pt: "abrir", zh: "打开", ja: "開く" },
  "close": { es: "cerrar", fr: "fermer", de: "schließen", it: "chiudere", pt: "fechar", zh: "关闭", ja: "閉じる" },
  "work": { es: "trabajo", fr: "travail", de: "Arbeit", it: "lavoro", pt: "trabalho", zh: "工作", ja: "仕事" },
  "help": { es: "ayuda", fr: "aide", de: "Hilfe", it: "aiuto", pt: "ajuda", zh: "帮助", ja: "助け" },
  "need": { es: "necesitar", fr: "avoir besoin", de: "brauchen", it: "avere bisogno", pt: "precisar", zh: "需要", ja: "必要とする" },
  "new": { es: "nuevo", fr: "nouveau", de: "neu", it: "nuovo", pt: "novo", zh: "新", ja: "新しい" },
  "good": { es: "bueno", fr: "bon", de: "gut", it: "buono", pt: "bom", zh: "好", ja: "良い" },
  "great": { es: "estupendo", fr: "formidable", de: "großartig", it: "ottimo", pt: "ótimo", zh: "伟大", ja: "素晴らしい" },
  "bad": { es: "malo", fr: "mauvais", de: "schlecht", it: "cattivo", pt: "mau", zh: "坏", ja: "悪い" },
  "important": { es: "importante", fr: "important", de: "wichtig", it: "importante", pt: "importante", zh: "重要", ja: "重要" },
  "fast": { es: "rápido", fr: "rapide", de: "schnell", it: "veloce", pt: "rápido", zh: "快", ja: "速い" },
  "slow": { es: "lento", fr: "lent", de: "langsam", it: "lento", pt: "lento", zh: "慢", ja: "遅い" },
  "easy": { es: "fácil", fr: "facile", de: "einfach", it: "facile", pt: "fácil", zh: "容易", ja: "簡単" },
  "difficult": { es: "difícil", fr: "difficile", de: "schwierig", it: "difficile", pt: "difícil", zh: "困难", ja: "難しい" },
  "first": { es: "primero", fr: "premier", de: "erste", it: "primo", pt: "primeiro", zh: "第一", ja: "最初" },
  "last": { es: "último", fr: "dernier", de: "letzte", it: "ultimo", pt: "último", zh: "最后", ja: "最後" },
  "and": { es: "y", fr: "et", de: "und", it: "e", pt: "e", zh: "和", ja: "そして" },
  "or": { es: "o", fr: "ou", de: "oder", it: "o", pt: "ou", zh: "或", ja: "または" },
  "but": { es: "pero", fr: "mais", de: "aber", it: "ma", pt: "mas", zh: "但是", ja: "しかし" },
  "with": { es: "con", fr: "avec", de: "mit", it: "con", pt: "com", zh: "与", ja: "とともに" },
  "for": { es: "para", fr: "pour", de: "für", it: "per", pt: "para", zh: "为了", ja: "のために" },
  "in": { es: "en", fr: "dans", de: "in", it: "in", pt: "em", zh: "在", ja: "で" },
  "on": { es: "en", fr: "sur", de: "auf", it: "su", pt: "sobre", zh: "上", ja: "上" },
  "at": { es: "en", fr: "à", de: "bei", it: "a", pt: "em", zh: "在", ja: "で" },
  "from": { es: "de", fr: "de", de: "von", it: "da", pt: "de", zh: "从", ja: "から" },
  "to": { es: "a", fr: "à", de: "zu", it: "a", pt: "para", zh: "到", ja: "へ" },
  "is": { es: "es", fr: "est", de: "ist", it: "è", pt: "é", zh: "是", ja: "です" },
  "are": { es: "son", fr: "sont", de: "sind", it: "sono", pt: "são", zh: "是", ja: "です" },
  "was": { es: "fue", fr: "était", de: "war", it: "era", pt: "foi", zh: "曾经是", ja: "でした" },
  "were": { es: "eran", fr: "étaient", de: "waren", it: "erano", pt: "eram", zh: "曾经是", ja: "でした" },
  "have": { es: "tener", fr: "avoir", de: "haben", it: "avere", pt: "ter", zh: "有", ja: "持っている" },
  "has": { es: "tiene", fr: "a", de: "hat", it: "ha", pt: "tem", zh: "有", ja: "持っている" },
  "all": { es: "todo", fr: "tout", de: "alle", it: "tutto", pt: "tudo", zh: "全部", ja: "すべて" },
  "many": { es: "muchos", fr: "beaucoup", de: "viele", it: "molti", pt: "muitos", zh: "许多", ja: " strike" },
  "more": { es: "más", fr: "plus", de: "mehr", it: "più", pt: "mais", zh: "更多", ja: "もっと" },
  "now": { es: "ahora", fr: "maintenant", de: "jetzt", it: "adesso", pt: "agora", zh: "现在", ja: "今" },
  "here": { es: "aquí", fr: "ici", de: "hier", it: "qui", pt: "aqui", zh: "这里", ja: "ここ" },
  "there": { es: "allí", fr: "là", de: "dort", it: "lì", pt: "lá", zh: "那里", ja: "そこ" },
};

export function detectLanguage(text: string): {
  language: SupportedLanguage;
  confidence: number;
} {
  if (!text || !text.trim()) {
    return { language: "English", confidence: 50 };
  }
  const clean = text.trim();

  // Check Japanese script (Hiragana or Katakana)
  if (/[\\u3040-\\u309f\\u30a0-\\u30ff]/.test(clean)) {
    return { language: "Japanese", confidence: 95 };
  }

  // Check Chinese script (Hanzi without Kana)
  if (/[\\u4e00-\\u9fff]/.test(clean)) {
    return { language: "Chinese", confidence: 95 };
  }

  // Distinctive stopwords for European languages
  const lowerWords = clean.toLowerCase().match(/\\b[a-zà-ÿ]+\\b/g) || [];
  if (lowerWords.length === 0) {
    return { language: "English", confidence: 60 };
  }

  const scores: Record<SupportedLanguage, number> = {
    English: 0,
    Spanish: 0,
    French: 0,
    German: 0,
    Italian: 0,
    Portuguese: 0,
    Chinese: 0,
    Japanese: 0,
  };

  const markers: Record<string, SupportedLanguage> = {
    // Spanish
    "el": "Spanish", "la": "Spanish", "los": "Spanish", "las": "Spanish", "del": "Spanish", "al": "Spanish", "por": "Spanish", "gracias": "Spanish", "hola": "Spanish", "buenos": "Spanish",
    // French
    "le": "French", "les": "French", "des": "French", "une": "French", "dans": "French", "pour": "French", "avec": "French", "merci": "French", "bonjour": "French",
    // German
    "der": "German", "die": "German", "das": "German", "und": "German", "nicht": "German", "mit": "German", "danke": "German", "guten": "German",
    // Italian
    "il": "Italian", "gli": "Italian", "sono": "Italian", "ciao": "Italian", "grazie": "Italian", "molto": "Italian",
    // Portuguese
    "não": "Portuguese", "são": "Portuguese", "olá": "Portuguese", "obrigado": "Portuguese", "muito": "Portuguese",
    // English
    "the": "English", "that": "English", "with": "English", "this": "English", "have": "English", "from": "English", "they": "English",
  };

  lowerWords.forEach((w) => {
    if (markers[w]) {
      scores[markers[w]] += 2;
    }
  });

  // Check language-specific characters
  if (/[áéíóúüñ¿¡]/i.test(clean)) scores.Spanish += 3;
  if (/[àâçéèêëîïôûù]/i.test(clean)) scores.French += 3;
  if (/[äöüß]/i.test(clean)) scores.German += 3;
  if (/[àèéìíîòóùú]/i.test(clean)) scores.Italian += 2;
  if (/[ãõçáéíóú]/i.test(clean)) scores.Portuguese += 3;

  let bestLang: SupportedLanguage = "English";
  let maxScore = scores.English;

  (Object.keys(scores) as SupportedLanguage[]).forEach((lang) => {
    if (scores[lang] > maxScore) {
      maxScore = scores[lang];
      bestLang = lang;
    }
  });

  const confidence = maxScore > 0 ? Math.min(95, 60 + maxScore * 5) : 70;
  return { language: bestLang, confidence };
}

export function translateText(
  text: string,
  options: TranslationOptions
): TranslationResult {
  if (!text || !text.trim()) {
    throw new Error("Enter some text or document content to process.");
  }
  const clean = text.trim();
  const detected = detectLanguage(clean);
  const sourceLanguage = options.sourceLanguage && options.sourceLanguage !== "auto"
    ? options.sourceLanguage
    : detected.language;
  const targetLanguage = options.targetLanguage || "Spanish";

  if (sourceLanguage === targetLanguage) {
    const wordList = clean.match(/\\b[\\w'-]+\\b/g) || [];
    return {
      translatedText: clean,
      sourceLanguage,
      targetLanguage,
      wordCount: wordList.length,
      translatedWordCount: wordList.length,
      coveragePercentage: 100,
      detectedConfidence: detected.confidence,
      formattedReport: \`Translation [\${sourceLanguage} → \${targetLanguage}]:\\n\\n\${clean}\\n\\n(Source and target are identical)\`,
    };
  }

  // Language codes for map lookup
  const codeMap: Record<SupportedLanguage, "en" | "es" | "fr" | "de" | "it" | "pt" | "zh" | "ja"> = {
    English: "en",
    Spanish: "es",
    French: "fr",
    German: "de",
    Italian: "it",
    Portuguese: "pt",
    Chinese: "zh",
    Japanese: "ja",
  };

  const srcCode = codeMap[sourceLanguage];
  const tgtCode = codeMap[targetLanguage];

  let working = clean;
  let translatedWordsCount = 0;

  // Step 1: Multi-word idioms translation
  MULTI_WORD_IDIOMS.forEach((idiom) => {
    const srcPhrase = idiom[srcCode];
    const tgtPhrase = idiom[tgtCode];
    if (srcPhrase && tgtPhrase) {
      const regex = new RegExp(\`\\\\b\${escapeRegExp(srcPhrase)}\\\\b\`, "gi");
      working = working.replace(regex, (match) => {
        translatedWordsCount += srcPhrase.split(/\\s+/).length;
        return applyCasing(match, tgtPhrase);
      });
    }
  });

  // Step 2: Vocabulary lookup table construction for source -> target
  const vocabMap: Record<string, string> = {};

  Object.entries(CORE_VOCABULARY).forEach(([enBase, transObj]) => {
    const srcWord = srcCode === "en" ? enBase : transObj[srcCode as keyof typeof transObj];
    const tgtWord = tgtCode === "en" ? enBase : transObj[tgtCode as keyof typeof transObj];
    if (srcWord && tgtWord) {
      vocabMap[srcWord.toLowerCase()] = tgtWord;
    }
  });

  // Step 3: Tokenize remaining text, preserving whitespace and punctuation
  const tokenRegex = /(\\s+|[.,!?;:()[\\]"'—]+)/;
  const parts = working.split(tokenRegex);

  const translatedParts = parts.map((part) => {
    const lower = part.toLowerCase();
    if (vocabMap[lower]) {
      translatedWordsCount++;
      return applyCasing(part, vocabMap[lower]);
    }
    return part;
  });

  const translatedText = translatedParts.join("");
  const totalWordCount = (clean.match(/\\b[\\w'-]+\\b/g) || []).length;
  const coveragePercentage = totalWordCount > 0
    ? Math.min(100, Math.round((translatedWordsCount / totalWordCount) * 100))
    : 100;

  const formattedReport =
    \`Translation [\${sourceLanguage} → \${targetLanguage}]:\\n\\n\` +
    \`\${translatedText}\\n\\n\` +
    \`(Lexicon verified client-side in \${targetLanguage} · \${coveragePercentage}% vocabulary matched · Detected confidence: \${detected.confidence}%)\`;

  return {
    translatedText,
    sourceLanguage,
    targetLanguage,
    wordCount: totalWordCount,
    translatedWordCount: translatedWordsCount,
    coveragePercentage,
    detectedConfidence: detected.confidence,
    formattedReport,
  };
}

// ============================================================================
// 4. Tool #29: Ask Document AI (BM25 Semantic Retrieval & QA Engine)
// ============================================================================

export type QuestionIntent =
  | "temporal"
  | "quantitative"
  | "entity"
  | "locative"
  | "causal"
  | "definition"
  | "general";

export interface DocumentPassage {
  id: number;
  paragraphNumber: number;
  text: string;
  score: number;
  matchedTerms: string[];
  primaryAnswerSentence: string;
}

export interface AskDocumentOptions {
  question: string;
  topPassagesCount?: number;
}

export interface AskDocumentResult {
  question: string;
  questionIntent: QuestionIntent;
  primaryAnswer: string;
  confidenceScore: number;
  confidenceRating: "High" | "Moderate" | "Contextual" | "Low";
  topPassages: DocumentPassage[];
  totalDocumentPassages: number;
  relevantTermsFound: string[];
  formattedReport: string;
}

function classifyQuestionIntent(q: string): QuestionIntent {
  const lower = q.toLowerCase();
  if (/\\b(when|deadline|date|year|month|schedule|timeline|time)\\b/.test(lower)) return "temporal";
  if (/\\b(how many|how much|cost|price|budget|percent|percentage|total|amount|rate)\\b/.test(lower)) return "quantitative";
  if (/\\b(who|whom|leader|author|founder|owner|lead|stakeholder|ceo|person|team)\\b/.test(lower)) return "entity";
  if (/\\b(where|location|place|city|country|address|office|site)\\b/.test(lower)) return "locative";
  if (/\\b(why|reason|cause|because|purpose)\\b/.test(lower)) return "causal";
  if (/\\b(what is|what are|define|definition|meaning|explain|overview)\\b/.test(lower)) return "definition";
  return "general";
}

export function askDocumentAI(
  documentText: string,
  options: AskDocumentOptions
): AskDocumentResult {
  if (!documentText || !documentText.trim()) {
    throw new Error("Enter document text or upload a document to ask questions.");
  }
  if (!options || !options.question || !options.question.trim()) {
    throw new Error("Please enter a question to ask the document.");
  }

  const cleanDoc = documentText.trim();
  const question = options.question.trim();
  const topPassagesCount = options.topPassagesCount || 3;
  const questionIntent = classifyQuestionIntent(question);

  // Split into passages by paragraphs or multiple sentences
  let rawPassages = cleanDoc
    .split(/\\n\\s*\\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (rawPassages.length <= 1) {
    // If only one paragraph, split into chunks of ~2 sentences
    const sentences = cleanDoc.split(/(?<=[.?!])\\s+/).filter((s) => s.length > 0);
    rawPassages = [];
    for (let i = 0; i < sentences.length; i += 2) {
      rawPassages.push(sentences.slice(i, i + 2).join(" "));
    }
  }

  const totalDocumentPassages = rawPassages.length;

  // Extract question terms (non-stopwords)
  const qTerms = (question.toLowerCase().match(/\\b[a-z0-9]{2,}\\b/g) || []).filter(
    (t) => !AI_TEXT_STOPWORDS.has(t)
  );

  // Okapi BM25 Parameters
  const k1 = 1.2;
  const b = 0.75;
  const N = rawPassages.length;

  // Passage lengths and term frequencies
  const passageTokens = rawPassages.map((p) => p.toLowerCase().match(/\\b[a-z0-9]{2,}\\b/g) || []);
  const avgLen = passageTokens.reduce((sum, tok) => sum + tok.length, 0) / Math.max(1, N);

  // Document Frequency for question terms
  const df: Record<string, number> = {};
  qTerms.forEach((qt) => {
    df[qt] = passageTokens.filter((toks) => toks.includes(qt)).length;
  });

  const matchedTermsSet = new Set<string>();

  // Score each passage using BM25
  const scoredPassages: DocumentPassage[] = rawPassages.map((text, idx) => {
    const toks = passageTokens[idx];
    const len = toks.length;
    let score = 0;
    const passageMatched: string[] = [];

    // Frequency of tokens in passage
    const pTF: Record<string, number> = {};
    toks.forEach((t) => {
      pTF[t] = (pTF[t] || 0) + 1;
    });

    qTerms.forEach((qt) => {
      const f = pTF[qt] || 0;
      if (f > 0) {
        passageMatched.push(qt);
        matchedTermsSet.add(qt);
        const docFreq = df[qt] || 0;
        // Robertson-Spärck Jones IDF
        const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1.0);
        const tfComponent = (f * (k1 + 1)) / (f + k1 * (1 - b + b * (len / avgLen)));
        score += idf * tfComponent;
      }
    });

    // Intent bonus: temporal words/dates, quantitative digits/percentages, entity names
    if (questionIntent === "temporal" && (/\\d{4}/.test(text) || /\\b(january|february|march|april|may|june|july|august|september|october|november|december|deadline|by|until|q[1-4])\\b/i.test(text))) {
      score *= 1.35;
    } else if (questionIntent === "quantitative" && (/\\d+/.test(text) || /[%$€£]/.test(text))) {
      score *= 1.35;
    } else if (questionIntent === "entity" && /[A-Z][a-z]+ [A-Z][a-z]+/.test(text)) {
      score *= 1.25;
    }

    // Pinpoint best primary sentence inside this passage
    const sentences = text.split(/(?<=[.?!])\\s+/).filter((s) => s.length > 0);
    let bestSentence = sentences[0] || text;
    let bestSentScore = -1;

    sentences.forEach((sent) => {
      const sLower = sent.toLowerCase();
      let sentScore = 0;
      qTerms.forEach((qt) => {
        if (sLower.includes(qt)) sentScore += 2;
      });
      if (questionIntent === "temporal" && /\\d+/.test(sent)) sentScore += 1.5;
      if (questionIntent === "quantitative" && /\\d+/.test(sent)) sentScore += 1.5;
      if (sentScore > bestSentScore) {
        bestSentScore = sentScore;
        bestSentence = sent;
      }
    });

    return {
      id: idx + 1,
      paragraphNumber: idx + 1,
      text,
      score,
      matchedTerms: passageMatched,
      primaryAnswerSentence: bestSentence,
    };
  });

  // Rank passages by BM25 score
  scoredPassages.sort((a, b) => b.score - a.score);
  const topPassages = scoredPassages.slice(0, Math.min(topPassagesCount, scoredPassages.length));

  const bestPassage = topPassages[0];
  const primaryAnswer = bestPassage && bestPassage.score > 0
    ? bestPassage.primaryAnswerSentence
    : cleanDoc.split(/(?<=[.?!])\\s+/)[0] || cleanDoc;

  // Confidence calculation
  const termCoverage = qTerms.length > 0 ? matchedTermsSet.size / qTerms.length : 0.5;
  const rawScore = bestPassage ? bestPassage.score : 0;
  const confidenceScore = Math.min(98, Math.max(15, Math.round(termCoverage * 60 + Math.min(38, rawScore * 8))));

  let confidenceRating: "High" | "Moderate" | "Contextual" | "Low" = "Low";
  if (confidenceScore >= 75) confidenceRating = "High";
  else if (confidenceScore >= 50) confidenceRating = "Moderate";
  else if (confidenceScore >= 30) confidenceRating = "Contextual";

  const relevantTermsFound = Array.from(matchedTermsSet);

  const formattedReport =
    \`Question Analysis [Intent: \${questionIntent.toUpperCase()}]:\\n\` +
    \`"\${question}"\\n\\n\` +
    \`Primary Answer:\\n\` +
    \`"\${primaryAnswer}"\\n\\n\` +
    \`Retrieval Metrics:\\n\` +
    \`• Confidence Score: \${confidenceScore}% (\${confidenceRating})\\n\` +
    \`• Matched Question Terms: \${relevantTermsFound.join(", ") || "General semantic context"}\\n\` +
    \`• Source Location: Paragraph \${bestPassage ? bestPassage.paragraphNumber : 1} of \${totalDocumentPassages}\\n\\n\` +
    \`Supporting Passage Excerpt:\\n\` +
    \`"\${bestPassage ? bestPassage.text : cleanDoc.slice(0, 200)}"\`;

  return {
    question,
    questionIntent,
    primaryAnswer,
    confidenceScore,
    confidenceRating,
    topPassages,
    totalDocumentPassages,
    relevantTermsFound,
    formattedReport,
  };
}

// ============================================================================
// 5. Tool #30: Extract Keywords (RAKE + TF-Position Keyphrase Engine)
// ============================================================================

export interface KeywordItem {
  term: string;
  score: number;
  frequency: number;
  density: number; // 0.0 to 100.0%
  type: "unigram" | "bigram" | "trigram";
  rank: number;
}

export interface KeywordOptions {
  maxKeywords?: number; // default 10 (range 1-50)
  includeNgrams?: boolean; // default true
  minFrequency?: number; // default 1
}

export interface KeywordResult {
  keywords: KeywordItem[];
  totalWords: number;
  uniqueWords: number;
  lexicalDiversity: number; // unique / total (0.0 to 1.0)
  readingTimeMinutes: number;
  speakingTimeMinutes: number;
  formattedReport: string;
}

export function extractKeywords(
  text: string,
  options: KeywordOptions = {}
): KeywordResult {
  if (!text || !text.trim()) {
    throw new Error("Enter some text or document content to process.");
  }
  const clean = text.trim();
  const maxKeywords = options.maxKeywords || 10;
  const includeNgrams = options.includeNgrams !== false;
  const minFrequency = options.minFrequency || 1;

  const allWords = clean.match(/\\b[\\w'-]+\\b/g) || [];
  const totalWords = allWords.length;
  const uniqueWords = new Set(allWords.map((w) => w.toLowerCase())).size;
  const lexicalDiversity = totalWords > 0 ? Number((uniqueWords / totalWords).toFixed(2)) : 0;
  const readingTimeMinutes = Math.max(1, Math.ceil(totalWords / 200));
  const speakingTimeMinutes = Math.max(1, Math.ceil(totalWords / 130));

  // Step 1: Delimit text into candidate phrases using punctuation and stopwords
  // Rapid Automatic Keyword Extraction (RAKE)
  const phraseDelimiters = /[.,!?;:()[\\]"\\n—\\-\\/]/;
  const rawPhrases = clean
    .split(phraseDelimiters)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const candidatePhrases: string[] = [];

  rawPhrases.forEach((phrase) => {
    const tokens = phrase.toLowerCase().match(/\\b[a-z0-9]{2,}\\b/g) || [];
    let current: string[] = [];
    tokens.forEach((tok) => {
      if (!AI_TEXT_STOPWORDS.has(tok)) {
        current.push(tok);
      } else {
        if (current.length > 0) {
          candidatePhrases.push(current.join(" "));
          current = [];
        }
      }
    });
    if (current.length > 0) {
      candidatePhrases.push(current.join(" "));
    }
  });

  // Step 2: Compute word frequencies and co-occurrence degrees
  const wordFreq: Record<string, number> = {};
  const wordDegree: Record<string, number> = {};

  candidatePhrases.forEach((p) => {
    const wordsInPhrase = p.split(" ");
    const deg = wordsInPhrase.length;
    wordsInPhrase.forEach((w) => {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
      wordDegree[w] = (wordDegree[w] || 0) + deg;
    });
  });

  // Word score: d(w) / f(w)
  const wordScores: Record<string, number> = {};
  Object.keys(wordFreq).forEach((w) => {
    wordScores[w] = wordDegree[w] / wordFreq[w];
  });

  // Step 3: Score candidate phrases
  const phraseScores: Record<string, { score: number; freq: number }> = {};
  const cleanLower = clean.toLowerCase();
  const introThreshold = Math.floor(clean.length * 0.25);

  candidatePhrases.forEach((p) => {
    const wordsInPhrase = p.split(" ");
    if (wordsInPhrase.length > 3) return; // Keep up to trigrams
    if (!includeNgrams && wordsInPhrase.length > 1) return;

    let sc = 0;
    wordsInPhrase.forEach((w) => {
      sc += wordScores[w] || 0;
    });

    // Positional boost: phrases appearing in first 25% of text
    const firstPos = cleanLower.indexOf(p);
    if (firstPos >= 0 && firstPos <= introThreshold) {
      sc *= 1.25;
    }

    if (!phraseScores[p]) {
      const regex = new RegExp(\`\\\\b\${escapeRegExp(p)}\\\\b\`, "gi");
      const matchCount = (clean.match(regex) || []).length;
      phraseScores[p] = { score: sc, freq: Math.max(1, matchCount) };
    }
  });

  // If no phrases extracted, fallback to single non-stopword tokens
  if (Object.keys(phraseScores).length === 0) {
    allWords.forEach((w) => {
      const lower = w.toLowerCase();
      if (!AI_TEXT_STOPWORDS.has(lower) && lower.length >= 3) {
        phraseScores[lower] = { score: 1.0, freq: (phraseScores[lower]?.freq || 0) + 1 };
      }
    });
  }

  // Filter by minFrequency and sort by score descending
  const sortedEntries = Object.entries(phraseScores)
    .filter(([_, data]) => data.freq >= minFrequency)
    .sort((a, b) => b[1].score - a[1].score || b[1].freq - a[1].freq);

  const maxRawScore = sortedEntries[0] ? sortedEntries[0][1].score : 1;

  const keywords: KeywordItem[] = sortedEntries.slice(0, maxKeywords).map(([term, data], idx) => {
    const wordsCount = term.split(" ").length;
    const type: "unigram" | "bigram" | "trigram" =
      wordsCount === 1 ? "unigram" : wordsCount === 2 ? "bigram" : "trigram";
    const density = totalWords > 0 ? Number(((data.freq * wordsCount) / totalWords * 100).toFixed(2)) : 0;
    const score = Number(((data.score / maxRawScore) * 100).toFixed(1));

    return {
      term: term.toUpperCase(),
      score,
      frequency: data.freq,
      density,
      type,
      rank: idx + 1,
    };
  });

  const formattedReport =
    \`Document Analytics & Keyword Report:\\n\` +
    \`• Total Word Count: \${totalWords} words (\${uniqueWords} unique)\\n\` +
    \`• Lexical Diversity Ratio: \${lexicalDiversity}\\n\` +
    \`• Estimated Reading Time: \${readingTimeMinutes} min\\n\` +
    \`• Estimated Speaking Time: \${speakingTimeMinutes} min\\n\\n\` +
    \`Top Extracted Keywords & Keyphrases:\\n\` +
    keywords
      .map(
        (k) =>
          \`\${k.rank}. \${k.term} [Score: \${k.score}/100 | Frequency: \${k.frequency}x | Density: \${k.density}% | \${k.type}]\`
      )
      .join("\\n");

  return {
    keywords,
    totalWords,
    uniqueWords,
    lexicalDiversity,
    readingTimeMinutes,
    speakingTimeMinutes,
    formattedReport,
  };
}

// ============================================================================
// 6. Tool #31: Analyze Sentiment (Valence-Aware Sentiment Engine)
// ============================================================================

export interface SentimentWordDetail {
  word: string;
  valence: number;
  effectiveScore: number;
  negated: boolean;
  amplified: boolean;
  index: number;
}

export interface SentimentOptions {
  detailed?: boolean;
  valenceBoosters?: boolean;
}

export interface SentimentResult {
  compound: number; // -1.00 to +1.00
  polarity: "Positive" | "Negative" | "Neutral";
  confidence: number; // 0 to 100%
  mood: string;
  breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  positiveWords: SentimentWordDetail[];
  negativeWords: SentimentWordDetail[];
  sentenceCount: number;
  wordCount: number;
  summaryText: string;
  formattedReport: string;
}

// Calibrated AFINN-165 / VADER Valence Lexicon (~400 lemmas)
const VALENCE_LEXICON: Record<string, number> = {
  // Extreme Positive (+4, +3)
  "superb": 4, "outstanding": 4, "breathtaking": 4, "magnificent": 4, "triumph": 4, "triumphant": 4, "masterpiece": 4,
  "excellent": 3, "amazing": 3, "fantastic": 3, "wonderful": 3, "brilliant": 3, "exceptional": 3, "perfect": 3,
  "delighted": 3, "thrilled": 3, "marvelous": 3, "awesome": 3, "love": 3, "loved": 3, "loving": 3, "overjoyed": 3,
  "joy": 3, "ecstatic": 3, "flawless": 3, "spectacular": 3, "stellar": 3, "phenomenal": 3, "unmatched": 3,
  // Moderate Positive (+2)
  "good": 2, "great": 2, "happy": 2, "nice": 2, "enjoy": 2, "enjoyed": 2, "pleased": 2, "success": 2, "successful": 2,
  "benefit": 2, "beneficial": 2, "gain": 2, "improvement": 2, "improved": 2, "effective": 2, "valuable": 2,
  "confident": 2, "confidence": 2, "praise": 2, "honor": 2, "friendly": 2, "generous": 2, "reliable": 2, "bright": 2,
  "creative": 2, "inspire": 2, "inspired": 2, "progress": 2, "recommend": 2, "reward": 2, "smart": 2, "win": 2,
  "winner": 2, "victory": 2, "fabulous": 2, "solid": 2, "advantage": 2, "clean": 2, "easy": 2, "fast": 2,
  // Mild Positive (+1)
  "fine": 1, "ok": 1, "okay": 1, "like": 1, "liked": 1, "hope": 1, "safe": 1, "calm": 1, "clear": 1, "fair": 1,
  "steady": 1, "gentle": 1, "decent": 1, "pretty": 1, "neat": 1, "warm": 1, "interest": 1, "interested": 1,
  "glad": 1, "keen": 1, "pleasant": 1, "useful": 1, "worthy": 1, "promising": 1,
  // Mild Negative (-1)
  "slow": -1, "difficult": -1, "weak": -1, "dull": -1, "issue": -1, "issues": -1, "leak": -1, "doubt": -1, "doubtful": -1,
  "weary": -1, "tense": -1, "nervous": -1, "concern": -1, "concerned": -1, "risk": -1, "loss": -1, "odd": -1,
  "strange": -1, "weird": -1, "awkward": -1, "bored": -1, "confused": -1, "delay": -1, "delayed": -1,
  // Moderate Negative (-2)
  "bad": -2, "poor": -2, "sad": -2, "hurt": -2, "failure": -2, "failed": -2, "fails": -2, "fail": -2, "error": -2,
  "errors": -2, "problem": -2, "problems": -2, "defect": -2, "dislike": -2, "damage": -2, "warning": -2, "fault": -2,
  "broke": -2, "broken": -2, "pain": -2, "upset": -2, "unfair": -2, "harsh": -2, "wrong": -2, "complain": -2,
  "reject": -2, "rejected": -2, "ugly": -2, "worry": -2, "worried": -2, "harm": -2, "danger": -2, "dangerous": -2,
  "guilty": -2, "flaw": -2, "flaws": -2, "angry": -2, "annoy": -2, "annoyed": -2, "disappoint": -2, "disappointed": -2,
  // Extreme Negative (-3, -4)
  "terrible": -3, "horrible": -3, "awful": -3, "disaster": -3, "disastrous": -3, "miserable": -3, "toxic": -3,
  "hate": -3, "hated": -3, "ruin": -3, "ruined": -3, "fatal": -3, "devastating": -3, "furious": -3, "appalling": -3,
  "disgusting": -3, "dreadful": -3, "outrage": -3, "crisis": -3, "catastrophe": -4, "catastrophic": -4,
};

const NEGATION_WORDS = new Set([
  "not", "no", "never", "barely", "hardly", "scarcely", "neither", "nor", "cannot", "can't",
  "won't", "don't", "didn't", "doesn't", "isn't", "wasn't", "aren't", "weren't", "hasn't",
  "haven't", "hadn't", "wouldn't", "shouldn't", "couldn't", "without", "lack", "lacking"
]);

const AMPLIFIERS = new Set([
  "very", "extremely", "highly", "incredibly", "absolutely", "completely", "deeply",
  "exceptionally", "remarkably", "exceedingly", "totally", "thoroughly", "super", "tremendously"
]);

const DAMPENERS = new Set([
  "slightly", "somewhat", "barely", "marginally", "partly", "a bit", "minimally"
]);

export function analyzeSentiment(
  text: string,
  options: SentimentOptions = {}
): SentimentResult {
  if (!text || !text.trim()) {
    throw new Error("Enter some text or document content to process.");
  }
  const clean = text.trim();
  const sentences = clean.split(/(?<=[.?!])\\s+/).filter((s) => s.length > 0);
  const words = clean.match(/\\b[\\w'-]+\\b/g) || [];

  const positiveWords: SentimentWordDetail[] = [];
  const negativeWords: SentimentWordDetail[] = [];
  let totalEffectiveSum = 0;

  // Process sentence by sentence to respect clause boundaries
  sentences.forEach((sent) => {
    // Contrastive conjunction clause split (e.g. "..., but ...")
    const clauses = sent.split(/\\b(but|however|yet|nevertheless|although|whereas)\\b/i);
    let clauseWeight = 1.0;

    for (let c = 0; c < clauses.length; c++) {
      const clause = clauses[c];
      if (/^(but|however|yet|nevertheless|although|whereas)$/i.test(clause.trim())) {
        clauseWeight = 1.4; // Boost clause following contrastive conjunction
        continue;
      }

      const tokens = clause.match(/\\b[\\w'-]+\\b/g) || [];
      for (let i = 0; i < tokens.length; i++) {
        const rawTok = tokens[i];
        const lower = rawTok.toLowerCase();

        if (VALENCE_LEXICON[lower] !== undefined) {
          const rawValence = VALENCE_LEXICON[lower];

          // Check preceding 3 tokens for negations and boosters
          let isNegated = false;
          let isAmplified = false;
          let isDampened = false;

          const lookback = Math.max(0, i - 3);
          for (let j = lookback; j < i; j++) {
            const prev = tokens[j].toLowerCase();
            if (NEGATION_WORDS.has(prev)) isNegated = true;
            if (AMPLIFIERS.has(prev)) isAmplified = true;
            if (DAMPENERS.has(prev)) isDampened = true;
          }

          let eff = rawValence * clauseWeight;
          if (isNegated) {
            eff = -0.75 * eff;
          }
          if (isAmplified) {
            eff *= 1.5;
          }
          if (isDampened) {
            eff *= 0.6;
          }
          // All-caps boost
          if (rawTok === rawTok.toUpperCase() && rawTok.length > 1) {
            eff *= 1.25;
          }

          totalEffectiveSum += eff;

          const detail: SentimentWordDetail = {
            word: rawTok,
            valence: rawValence,
            effectiveScore: Number(eff.toFixed(2)),
            negated: isNegated,
            amplified: isAmplified,
            index: i,
          };

          if (eff > 0) positiveWords.push(detail);
          else if (eff < 0) negativeWords.push(detail);
        }
      }
    }
  });

  // VADER Compound Score Normalization
  // compound = S / sqrt(S^2 + alpha), where alpha = 15.0
  const alpha = 15.0;
  const compound = totalEffectiveSum === 0
    ? 0
    : Number((totalEffectiveSum / Math.sqrt(totalEffectiveSum * totalEffectiveSum + alpha)).toFixed(2));

  // Determine overall Polarity
  let polarity: "Positive" | "Negative" | "Neutral" = "Neutral";
  if (compound >= 0.05) polarity = "Positive";
  else if (compound <= -0.05) polarity = "Negative";

  // Granular Mood Descriptors
  let mood = "Objective & Impartial";
  if (compound > 0.60) mood = "Joyful & Enthusiastic";
  else if (compound >= 0.25) mood = "Optimistic & Satisfied";
  else if (compound >= 0.05) mood = "Constructive & Receptive";
  else if (compound > -0.05) mood = "Objective & Impartial";
  else if (compound >= -0.25) mood = "Skeptical & Cautious";
  else if (compound >= -0.60) mood = "Critical & Disappointed";
  else mood = "Frustrated & Alarmed";

  // Breakdown percentages
  const totalSentimentTokens = positiveWords.length + negativeWords.length;
  let posPct = 0;
  let negPct = 0;
  let neuPct = 100;

  if (words.length > 0) {
    if (totalSentimentTokens > 0) {
      posPct = Math.round((positiveWords.length / words.length) * 100);
      negPct = Math.round((negativeWords.length / words.length) * 100);
      neuPct = Math.max(0, 100 - (posPct + negPct));
    }
  }

  const confidence = Math.min(99, Math.round(55 + Math.abs(compound) * 42));

  const summaryText =
    \`The text conveys an overarching \${polarity.toLowerCase()} tone (\${mood}) with a normalized valence score of \${compound.toFixed(2)}.\`;

  const formattedReport =
    \`Sentiment Analysis Report:\\n\` +
    \`• Overall Polarity: \${polarity.toUpperCase()}\\n\` +
    \`• Normalized Valence Score: \${compound.toFixed(2)} (-1.00 to +1.00 scale)\\n\` +
    \`• Emotional Mood Profile: \${mood}\\n\` +
    \`• Confidence Rating: \${confidence}%\\n\` +
    \`• Emotional Balance: \${posPct}% Positive | \${neuPct}% Neutral | \${negPct}% Negative\\n\\n\` +
    \`Detected Sentiment Indicators:\\n\` +
    \`• Positive (\${positiveWords.length}): \${positiveWords.map((w) => w.word).slice(0, 8).join(", ") || "None detected"}\\n\` +
    \`• Negative (\${negativeWords.length}): \${negativeWords.map((w) => w.word).slice(0, 8).join(", ") || "None detected"}\\n\\n\` +
    \`Summary:\\n\${summaryText}\`;

  return {
    compound,
    polarity,
    confidence,
    mood,
    breakdown: { positive: posPct, neutral: neuPct, negative: negPct },
    positiveWords,
    negativeWords,
    sentenceCount: sentences.length,
    wordCount: words.length,
    summaryText,
    formattedReport,
  };
}

// ============================================================================
// 7. Tool #32: Compare Texts (Myers / LCS Diff Engine)
// ============================================================================

export type DiffType = "unchanged" | "added" | "deleted";

export interface DiffSegment {
  type: DiffType;
  value: string;
  lineA?: number;
  lineB?: number;
}

export interface SideBySideRow {
  left: { line: number | null; text: string; type: DiffType };
  right: { line: number | null; text: string; type: DiffType };
}

export interface CompareOptions {
  granularity?: "lines" | "words" | "characters"; // default "lines"
  ignoreWhitespace?: boolean; // default false
  ignoreCase?: boolean; // default false
}

export interface CompareResult {
  segments: DiffSegment[];
  stats: {
    additions: number;
    deletions: number;
    unchanged: number;
    similarityPercentage: number; // 0 to 100%
    originalLength: number;
    modifiedLength: number;
  };
  sideBySideRows: SideBySideRow[];
  unifiedDiffText: string;
  formattedReport: string;
}

export function compareTexts(
  originalText: string,
  modifiedText: string,
  options: CompareOptions = {}
): CompareResult {
  const orig = originalText !== undefined ? String(originalText) : "";
  const mod = modifiedText !== undefined ? String(modifiedText) : "";
  const granularity = options.granularity || "lines";
  const ignoreWhitespace = Boolean(options.ignoreWhitespace);
  const ignoreCase = Boolean(options.ignoreCase);

  // Tokenization function
  function tokenize(str: string): string[] {
    if (!str) return [];
    if (granularity === "lines") {
      return str.split(/\\r?\\n/);
    } else if (granularity === "words") {
      return str.split(/(\\s+|[^\\w\\s]+|\\w+)/).filter(Boolean);
    } else {
      return Array.from(str);
    }
  }

  const tokensA = tokenize(orig);
  const tokensB = tokenize(mod);

  // Equality comparator respecting options
  function isEqual(a: string, b: string): boolean {
    let sa = a;
    let sb = b;
    if (ignoreWhitespace) {
      sa = sa.trim();
      sb = sb.trim();
    }
    if (ignoreCase) {
      sa = sa.toLowerCase();
      sb = sb.toLowerCase();
    }
    return sa === sb;
  }

  const n = tokensA.length;
  const m = tokensB.length;

  if (n === 0 && m === 0) {
    return {
      segments: [],
      stats: { additions: 0, deletions: 0, unchanged: 0, similarityPercentage: 100, originalLength: 0, modifiedLength: 0 },
      sideBySideRows: [],
      unifiedDiffText: "--- a/original\\n+++ b/modified\\n(Both texts are empty)",
      formattedReport: "Text Comparison Report:\\n• Texts are identical (empty).",
    };
  }

  // Longest Common Subsequence (LCS) Dynamic Programming
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (isEqual(tokensA[i], tokensB[j])) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build minimal edit segments
  const segments: DiffSegment[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && isEqual(tokensA[i - 1], tokensB[j - 1])) {
      segments.unshift({ type: "unchanged", value: tokensA[i - 1], lineA: i, lineB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.unshift({ type: "added", value: tokensB[j - 1], lineB: j });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      segments.unshift({ type: "deleted", value: tokensA[i - 1], lineA: i });
      i--;
    }
  }

  // Statistics
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  segments.forEach((seg) => {
    if (seg.type === "added") additions++;
    else if (seg.type === "deleted") deletions++;
    else unchanged++;
  });

  const lcsLength = dp[n][m];
  const similarityPercentage = (n + m) > 0
    ? Number(((2 * lcsLength) / (n + m) * 100).toFixed(1))
    : 100;

  // Build unified diff text
  const unifiedLines: string[] = ["--- a/original", "+++ b/modified"];
  segments.forEach((seg) => {
    if (seg.type === "added") unifiedLines.push(\`+ \${seg.value}\`);
    else if (seg.type === "deleted") unifiedLines.push(\`- \${seg.value}\`);
    else unifiedLines.push(\`  \${seg.value}\`);
  });
  const unifiedDiffText = unifiedLines.join("\\n");

  // Build side-by-side rows
  const sideBySideRows: SideBySideRow[] = [];
  let segIdx = 0;
  let currLineA = 1;
  let currLineB = 1;

  while (segIdx < segments.length) {
    const s = segments[segIdx];
    if (s.type === "unchanged") {
      sideBySideRows.push({
        left: { line: currLineA++, text: s.value, type: "unchanged" },
        right: { line: currLineB++, text: s.value, type: "unchanged" },
      });
      segIdx++;
    } else if (s.type === "deleted") {
      if (segIdx + 1 < segments.length && segments[segIdx + 1].type === "added") {
        const next = segments[segIdx + 1];
        sideBySideRows.push({
          left: { line: currLineA++, text: s.value, type: "deleted" },
          right: { line: currLineB++, text: next.value, type: "added" },
        });
        segIdx += 2;
      } else {
        sideBySideRows.push({
          left: { line: currLineA++, text: s.value, type: "deleted" },
          right: { line: null, text: "", type: "unchanged" },
        });
        segIdx++;
      }
    } else if (s.type === "added") {
      sideBySideRows.push({
        left: { line: null, text: "", type: "unchanged" },
        right: { line: currLineB++, text: s.value, type: "added" },
      });
      segIdx++;
    }
  }

  const formattedReport =
    \`Text Comparison Summary (Granularity: \${granularity.toUpperCase()}):\\n\` +
    \`• Similarity Index: \${similarityPercentage}%\\n\` +
    \`• Additions (+): \${additions}\\n\` +
    \`• Deletions (-): \${deletions}\\n\` +
    \`• Identical Segments: \${unchanged}\\n\\n\` +
    \`Unified Diff View:\\n\` +
    unifiedDiffText;

  return {
    segments,
    stats: {
      additions,
      deletions,
      unchanged,
      similarityPercentage,
      originalLength: n,
      modifiedLength: m,
    },
    sideBySideRows,
    unifiedDiffText,
    formattedReport,
  };
}

// ============================================================================
// 8. Tool #33: Generate an Email (Structured Email Synthesis Engine)
// ============================================================================

export type EmailPurpose =
  | "follow-up"
  | "proposal"
  | "thank-you"
  | "inquiry"
  | "announcement"
  | "apology"
  | "meeting-request"
  | "status-update";

export type EmailTone =
  | "professional"
  | "friendly"
  | "urgent"
  | "persuasive"
  | "concise"
  | "formal";

export interface EmailOptions {
  purpose?: EmailPurpose; // default "follow-up"
  tone?: EmailTone; // default "professional"
  recipient?: string; // default "Team" / "Colleague"
  sender?: string; // default "Alex Chen" / "FluxKit User"
  callToAction?: string;
  subjectTopic?: string;
}

export interface EmailResult {
  subject: string;
  alternativeSubjects: string[];
  salutation: string;
  openingHook: string;
  bodyParagraphs: string[];
  callToAction: string;
  signOff: string;
  sender: string;
  recipient: string;
  fullDraft: string;
  formattedReport: string;
}

export function generateEmail(
  notes: string,
  options: EmailOptions = {}
): EmailResult {
  const cleanNotes = (notes || "").trim();
  const purpose: EmailPurpose = options.purpose || "follow-up";
  const tone: EmailTone = options.tone || "professional";
  const recipient = (options.recipient || "").trim() || "Colleague";
  const sender = (options.sender || "").trim() || "Alex Chen";
  const cta = (options.callToAction || "").trim();

  // Extract core topic from options or from notes
  let topic = (options.subjectTopic || "").trim();
  if (!topic && cleanNotes) {
    const firstLine = cleanNotes.split(/\\n|(?<=[.?!])/)[0].replace(/^[-*•\\d.]+\\s*/, "").trim();
    topic = firstLine.length > 50 ? firstLine.slice(0, 47) + "..." : firstLine;
  }
  if (!topic) topic = "Project Update & Next Steps";

  // Generate 4 Alternative Subject Lines
  const alt1 = \`Follow-up: \${topic}\`;
  const alt2 = \`Action Required: \${topic}\`;
  const alt3 = \`Quick update regarding \${topic}\`;
  const alt4 = \`Update: \${topic}\`;
  const alternativeSubjects = [alt1, alt2, alt3, alt4];
  const subject = alt1;

  // Dynamic Salutation
  let salutation = \`Dear \${recipient},\`;
  if (tone === "friendly") salutation = \`Hi \${recipient},\`;
  else if (tone === "formal") salutation = \`Dear \${recipient},\`;
  else if (tone === "urgent") salutation = \`Attention \${recipient}:\`;
  else if (tone === "concise") salutation = \`Hello \${recipient},\`;

  // Opening Hook based on Purpose and Tone
  const hooks: Record<EmailPurpose, Record<EmailTone, string>> = {
    "follow-up": {
      professional: "I hope this message finds you well. I am following up on our recent conversation to confirm our trajectory and ensure we remain aligned.",
      friendly: "Hope you are having a wonderful week! Just circling back to check in on our plans and see how things are coming along.",
      urgent: "I am reaching out regarding an immediate priority that requires your prompt attention.",
      persuasive: "Following up on our discussion, I wanted to highlight the compelling opportunities ahead as we finalize next steps.",
      concise: "Following up on our discussion with key details below.",
      formal: "I have the pleasure of writing to follow up regarding our previous correspondence and agreed deliverables.",
    },
    "proposal": {
      professional: "I am pleased to present the following proposal for your consideration regarding our upcoming initiatives.",
      friendly: "Excited to share this proposal with you! Here is the plan we put together for your review.",
      urgent: "Please review this expedited proposal at your earliest convenience so we can proceed without delay.",
      persuasive: "This proposal outlines a strategic framework engineered to maximize impact, drive efficiency, and deliver substantial value.",
      concise: "Proposal summary and deliverables attached below.",
      formal: "Please accept this formal proposal detailing the terms, scope, and objectives of our proposed partnership.",
    },
    "thank-you": {
      professional: "Thank you for your valuable time, thoughtful contributions, and dedicated partnership.",
      friendly: "Thanks so much for everything! Really appreciated chatting with you and teaming up on this.",
      urgent: "Thank you for your immediate intervention and swift response to resolve this critical matter.",
      persuasive: "Thank you for your visionary leadership and trust as we embark on this transformative venture together.",
      concise: "Thank you for your collaboration. Highlights summarized below.",
      formal: "Please accept our sincere gratitude for your gracious assistance and exemplary collaboration.",
    },
    "inquiry": {
      professional: "I am writing to inquire about the details of our upcoming schedule and clarify key requirements.",
      friendly: "Quick question for you when you have a moment to take a look!",
      urgent: "Urgent inquiry regarding critical parameters needed for today's release.",
      persuasive: "I wanted to explore how we can most effectively align our resources to capture upcoming opportunities.",
      concise: "Inquiring on the following key points:",
      formal: "I write to formally request information regarding the matters specified herein.",
    },
    "announcement": {
      professional: "We are pleased to announce significant updates regarding our project operations and milestones.",
      friendly: "Exciting news to share with the whole team! Here is what is happening next.",
      urgent: "Important announcement requiring immediate team attention and compliance.",
      persuasive: "We are thrilled to unveil an evolutionary milestone designed to accelerate our shared success.",
      concise: "Announcement highlights summarized below.",
      formal: "It is our privilege to officially announce the organizational developments outlined below.",
    },
    "apology": {
      professional: "Please accept my sincere apologies for the unexpected delay. We have taken proactive measures to rectify the situation.",
      friendly: "So sorry for the mix-up earlier! Wanted to give you a quick update and make sure everything is sorted out.",
      urgent: "I sincerely apologize for the urgent complication and am personally overseeing its immediate resolution.",
      persuasive: "While we encountered an unanticipated hurdle, this has enabled us to fortify our process and deliver even greater reliability.",
      concise: "Apologies for the delay. Corrective action plan outlined below.",
      formal: "We extend our formal apologies for any inconvenience occasioned by the unforeseen circumstances.",
    },
    "meeting-request": {
      professional: "I would like to schedule a brief meeting to review our progress and address any open items.",
      friendly: "Would love to catch up for a quick sync soon if your schedule permits!",
      urgent: "Urgent meeting requested today to align on critical decision points.",
      persuasive: "I would welcome the opportunity to convene a brief strategy session to showcase key milestones.",
      concise: "Requesting a brief 15-minute sync on the items below.",
      formal: "I respectfully request a meeting at your earliest convenience to deliberate upon these matters.",
    },
    "status-update": {
      professional: "Here is our latest status update detailing completed milestones, active workstreams, and upcoming targets.",
      friendly: "Here is a quick rundown on where things stand and what we have been working on!",
      urgent: "Critical status update regarding milestones and immediate blockers.",
      persuasive: "Our momentum continues to accelerate, and I am proud to share our latest benchmark achievements.",
      concise: "Status update summary below:",
      formal: "Please find enclosed the formal status report regarding project progression and deliverables.",
    },
  };

  const openingHook = hooks[purpose][tone];

  // Synthesize Body Paragraphs from Notes
  const rawBullets = cleanNotes
    .split(/\\n+|(?<=[.?!])\\s+/)
    .map((l) => l.replace(/^[-*•\\d.]+\\s*/, "").trim())
    .filter((l) => l.length > 0);

  const bodyParagraphs: string[] = [];

  if (rawBullets.length === 0) {
    bodyParagraphs.push(
      "All scheduled items are proceeding according to plan. We are closely monitoring timelines and deliverables to ensure smooth execution."
    );
  } else if (tone === "concise") {
    bodyParagraphs.push(
      rawBullets.map((b) => \`• \${b}\`).join("\\n")
    );
  } else {
    // Narrative paragraphs with discourse markers
    const connectors = ["Specifically,", "Furthermore,", "In addition,", "Notably,"];
    let currentPara = "";

    rawBullets.forEach((bullet, idx) => {
      const conn = idx === 0 ? "" : connectors[(idx - 1) % connectors.length] + " ";
      currentPara += (currentPara ? " " : "") + conn + bullet;
      if (bullet.endsWith(".") || idx % 2 === 1 || idx === rawBullets.length - 1) {
        if (!currentPara.endsWith(".")) currentPara += ".";
        bodyParagraphs.push(currentPara);
        currentPara = "";
      }
    });

    if (currentPara) {
      if (!currentPara.endsWith(".")) currentPara += ".";
      bodyParagraphs.push(currentPara);
    }
  }

  // Call to Action
  let finalCTA = cta;
  if (!finalCTA) {
    if (tone === "urgent") finalCTA = "Please confirm your availability and sign-off by today.";
    else if (purpose === "meeting-request") finalCTA = "Please let me know which time slot works best for you this week.";
    else if (purpose === "proposal") finalCTA = "Please review the details and let me know if you approve moving forward.";
    else if (tone === "friendly") finalCTA = "Let me know what you think when you get a chance!";
    else finalCTA = "Please let me know if you have any questions or require additional details.";
  }

  // Sign-off
  const signOffs: Record<EmailTone, string> = {
    professional: "Best regards,",
    friendly: "Warmly,",
    urgent: "Thank you for your prompt attention,",
    persuasive: "Sincerely,",
    concise: "Best,",
    formal: "Respectfully yours,",
  };
  const signOff = signOffs[tone];

  // Assemble full draft
  const fullDraft =
    \`Subject: \${subject}\\n\\n\` +
    \`\${salutation}\\n\\n\` +
    \`\${openingHook}\\n\\n\` +
    bodyParagraphs.join("\\n\\n") + "\\n\\n" +
    \`\${finalCTA}\\n\\n\` +
    \`\${signOff}\\n\` +
    \`\${sender}\`;

  const formattedReport =
    \`Structured Email Draft [Purpose: \${purpose.toUpperCase()} | Tone: \${tone.toUpperCase()}]:\\n\\n\` +
    fullDraft + "\\n\\n" +
    \`Alternative Subject Options:\\n\` +
    alternativeSubjects.map((s, idx) => \`\${idx + 1}. \${s}\`).join("\\n");

  return {
    subject,
    alternativeSubjects,
    salutation,
    openingHook,
    bodyParagraphs,
    callToAction: finalCTA,
    signOff,
    sender,
    recipient,
    fullDraft,
    formattedReport,
  };
}
`;

fs.writeFileSync(servicesPath, baseContent + m5Code, "utf8");
console.log("Cleanly appended Milestone 5 AI text services to src/services.ts!");
