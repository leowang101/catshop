"use strict";

const { PALETTE_ALL } = require("./palette");

const VALID_CODES = new Set(PALETTE_ALL.map(c => c.code.toUpperCase()));
const STEP = 10;
const MAX = 5000;

// ---------------------------------------------------------------------------
// Normalize
// ---------------------------------------------------------------------------

function normalizeTextInput(text) {
  if (!text || typeof text !== "string") return "";
  let s = text;
  // full-width ASCII → half-width
  s = s.replace(/[\uFF01-\uFF5E]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // Chinese punctuation → ASCII equivalents
  s = s.replace(/[，]/g, ",");
  s = s.replace(/[、]/g, ",");
  s = s.replace(/[；]/g, ";");
  s = s.replace(/[：]/g, ":");
  s = s.replace(/[＝]/g, "=");
  // multiplication signs (only × unconditionally; x/X only between digits)
  s = s.replace(/×/g, "*");
  s = s.replace(/(\d)\s*[xX]\s*(\d)/g, "$1*$2");
  // unit aliases → canonical tokens
  s = s.replace(/克/g, "g");
  s = s.replace(/[颗粒]/g, "b");  // b = beads
  // collapse inline whitespace (preserve newlines)
  s = s.replace(/[^\S\n]+/g, " ");
  // trim each line
  s = s.split("\n").map(l => l.trim()).join("\n");
  return s.trim();
}

// ---------------------------------------------------------------------------
// Quantity helpers
// ---------------------------------------------------------------------------

function parseQtyValue(raw) {
  if (!raw) return NaN;
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[1]) * parseFloat(m[2]);
  return parseFloat(raw);
}

function toGrams(value, unit) {
  if (unit === "g") return value;
  if (unit === "b") return value / 100;
  return value; // fallback: treat as grams
}

// ---------------------------------------------------------------------------
// Line-level parsing
// ---------------------------------------------------------------------------

const QTY_PAT = "\\d+(?:\\.\\d+)?(?:\\s*\\*\\s*\\d+(?:\\.\\d+)?)?";
const CODE_PAT = "[A-Za-z]\\d{1,2}";

// Pattern 1: codes 各/每 qty [unit]
const RE_EACH = new RegExp(
  `^(.+?)\\s*(?:各|每个?)\\s*(${QTY_PAT})\\s*([gGbB])?\\s*$`
);

// Pattern 2: code [sep] qty [unit]  — scanned globally
const RE_PAIR = new RegExp(
  `(${CODE_PAT})\\s*[:=\\-]?\\s*(${QTY_PAT})\\s*([gGbB])?`,
  "g"
);

function extractCodes(raw) {
  return raw
    .split(/[,\s\-;]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => new RegExp(`^${CODE_PAT}$`, "i").test(s));
}

/**
 * Parse a single normalized line.
 * Returns { entries, issues, consumed, detectedUnit }
 */
function parseLine(line, ctxUnit) {
  const entries = [];
  const issues = [];
  let consumed = false;
  let detectedUnit = null;

  // --- try "各" pattern ---
  const eachM = line.match(RE_EACH);
  if (eachM) {
    const codes = extractCodes(eachM[1]);
    const rawNonCodes = eachM[1]
      .split(/[,\s\-;]+/)
      .map(s => s.trim())
      .filter(s => s && !new RegExp(`^${CODE_PAT}$`, "i").test(s));

    const qtyVal = parseQtyValue(eachM[2]);
    const unit = (eachM[3] || "").toLowerCase() || null;
    const effUnit = unit || ctxUnit;
    if (unit) detectedUnit = unit;

    for (const code of codes) {
      if (!VALID_CODES.has(code)) {
        issues.push({ type: "invalidCode", code, reason: "色号不支持" });
        continue;
      }
      if (isNaN(qtyVal) || qtyVal <= 0) {
        issues.push({ type: "invalidQty", code, reason: "数量无效" });
        continue;
      }
      if (effUnit) {
        entries.push({ code, grams: toGrams(qtyVal, effUnit), unit: effUnit });
      } else {
        entries.push({ code, grams: qtyVal, unit: "g", ambiguous: true });
        issues.push({ type: "ambiguousUnit", code, qty: qtyVal, reason: "无法确定单位" });
      }
    }

    for (const frag of rawNonCodes) {
      issues.push({ type: "unparsed", segments: [frag], reason: "部分内容无法识别" });
    }
    consumed = true;
    return { entries, issues, consumed, detectedUnit };
  }

  // --- try code-qty pair scanning ---
  let lastIdx = 0;
  const re = new RegExp(RE_PAIR.source, "g");
  let m;
  while ((m = re.exec(line)) !== null) {
    // gap before this match
    if (m.index > lastIdx) {
      const gap = line.slice(lastIdx, m.index).replace(/^[,;\s]+|[,;\s]+$/g, "");
      if (gap) {
        issues.push({ type: "unparsed", segments: [gap], reason: "部分内容无法识别" });
      }
    }

    const code = m[1].toUpperCase();
    const qtyVal = parseQtyValue(m[2]);
    const unit = (m[3] || "").toLowerCase() || null;
    const effUnit = unit || ctxUnit;
    if (unit) detectedUnit = unit;

    if (!VALID_CODES.has(code)) {
      issues.push({ type: "invalidCode", code, reason: "色号不支持" });
    } else if (isNaN(qtyVal) || qtyVal <= 0) {
      issues.push({ type: "invalidQty", code, reason: "数量无效" });
    } else if (effUnit) {
      entries.push({ code, grams: toGrams(qtyVal, effUnit), unit: effUnit });
    } else {
      entries.push({ code, grams: qtyVal, unit: "g", ambiguous: true });
      issues.push({ type: "ambiguousUnit", code, qty: qtyVal, reason: "无法确定单位" });
    }
    consumed = true;
    lastIdx = re.lastIndex;
  }

  // trailing
  if (lastIdx < line.length) {
    const tail = line.slice(lastIdx).replace(/^[,;\s]+|[,;\s]+$/g, "");
    if (tail) {
      issues.push({ type: "unparsed", segments: [tail], reason: "部分内容无法识别" });
    }
  }

  return { entries, issues, consumed, detectedUnit };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

function parseStructuredText(text, opts) {
  const validCodes = (opts && opts.validCodes) || VALID_CODES;

  const normalized = normalizeTextInput(text);
  if (!normalized) {
    return {
      items: [], issues: [], unparsedSegments: [], adjustments: [],
      parseMode: "rule", status: "needsReview", warning: "输入为空",
      suggestion: null,
    };
  }

  const lines = normalized.split("\n").filter(l => l.trim());
  const allEntries = [];
  const allIssues = [];
  let globalUnit = null;

  for (const line of lines) {
    const r = parseLine(line, globalUnit);
    if (r.detectedUnit && !globalUnit) globalUnit = r.detectedUnit;

    allEntries.push(...r.entries);
    allIssues.push(...r.issues);

    if (!r.consumed) {
      allIssues.push({ type: "unparsedLine", line, reason: "整行无法识别" });
    }
  }

  // second-pass: resolve ambiguous entries now that globalUnit is known
  if (globalUnit) {
    for (const e of allEntries) {
      if (e.ambiguous) {
        e.grams = toGrams(e.grams, globalUnit);
        e.unit = globalUnit;
        delete e.ambiguous;
      }
    }
    // remove resolved ambiguousUnit issues
    for (let i = allIssues.length - 1; i >= 0; i--) {
      if (allIssues[i].type === "ambiguousUnit") allIssues.splice(i, 1);
    }
  }

  // merge duplicate codes
  const merged = {};
  for (const e of allEntries) {
    if (!e.grams || e.grams <= 0) continue;
    merged[e.code] = (merged[e.code] || 0) + e.grams;
  }

  // round & cap
  const items = [];
  const adjustments = [];
  for (const code of Object.keys(merged).sort()) {
    let g = merged[code];
    if (g > MAX) {
      adjustments.push({ type: "cap", code, from: g, to: MAX });
      g = MAX;
    }
    const rounded = Math.ceil(g / STEP) * STEP;
    if (rounded !== g && g <= MAX) {
      adjustments.push({ type: "round", code, from: g, to: rounded });
    }
    const final = Math.min(rounded, MAX);
    if (final <= 0) continue;
    items.push({ code, qty: final });
  }

  // collect unparsed segments
  const unparsedSegments = [];
  for (const iss of allIssues) {
    if (iss.type === "unparsedLine") unparsedSegments.push(iss.line);
    if (iss.type === "unparsed" && iss.segments) unparsedSegments.push(...iss.segments);
  }

  // build warning string
  const warnParts = [];
  const invalidSet = [...new Set(
    allIssues.filter(i => i.type === "invalidCode").map(i => i.code)
  )];
  if (invalidSet.length)
    warnParts.push("以下色号已自动删除：" + invalidSet.join("、"));

  const ambiguous = allIssues.filter(i => i.type === "ambiguousUnit");
  if (ambiguous.length)
    warnParts.push("以下色号数量单位不明确，已默认按克处理，请检查：" +
      [...new Set(ambiguous.map(a => a.code))].join("、"));

  const roundAdj = adjustments.filter(a => a.type === "round");
  if (roundAdj.length)
    warnParts.push("以下色号数量不是10的倍数已自动调整：" +
      roundAdj.map(a => `【${a.code}:${a.to}g】`).join("、"));

  const capAdj = adjustments.filter(a => a.type === "cap");
  if (capAdj.length)
    warnParts.push("以下色号超出最大规格已自动修改数量：" +
      capAdj.map(a => `【${a.code}:${a.to}g】`).join("、"));

  if (unparsedSegments.length)
    warnParts.push("以下内容无法识别：" +
      unparsedSegments.map(s => `「${s}」`).join("、"));

  const warning = warnParts.join("；");

  // classify status
  const hasUnparsed = unparsedSegments.length > 0;
  const hasAmbiguous = ambiguous.length > 0;
  const hasInvalid = invalidSet.length > 0;

  let status = "ok";
  if (hasUnparsed || hasAmbiguous || hasInvalid) status = "needsReview";
  if (items.length === 0 && lines.length > 0) status = "needsReview";
  if (unparsedSegments.length > lines.length * 0.5 && lines.length >= 3)
    status = "manualRecommended";

  const suggestion = status === "manualRecommended"
    ? "内容较复杂，建议使用「模板导入」功能以获得更准确的结果"
    : null;

  return {
    items, issues: allIssues, unparsedSegments, adjustments,
    parseMode: "rule", status, warning, suggestion,
  };
}

module.exports = { normalizeTextInput, parseStructuredText };
