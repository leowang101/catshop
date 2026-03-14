"use strict";

const assert = require("assert");
const { normalizeTextInput, parseStructuredText } = require("../src/utils/text-parser");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  ${e.message}`);
  }
}

function eq(a, b, msg) {
  assert.strictEqual(a, b, msg || `expected ${b}, got ${a}`);
}
function deepEq(a, b, msg) {
  assert.deepStrictEqual(a, b, msg);
}

// =========================================================================
// normalizeTextInput
// =========================================================================

test("normalize: full-width → half-width", () => {
  eq(normalizeTextInput("Ａ１ ５０ｇ"), "A1 50g");
});

test("normalize: Chinese punctuation", () => {
  eq(normalizeTextInput("Ａ１，Ａ２、Ａ３"), "A1,A2,A3");
});

test("normalize: unit aliases", () => {
  eq(normalizeTextInput("A1 50克"), "A1 50g");
  eq(normalizeTextInput("A1 1000颗"), "A1 1000b");
  eq(normalizeTextInput("A1 1000粒"), "A1 1000b");
});

test("normalize: multiplication signs", () => {
  eq(normalizeTextInput("A1 2×500"), "A1 2*500");
  eq(normalizeTextInput("A1 2x500"), "A1 2*500");
});

// =========================================================================
// parseStructuredText — basic patterns
// =========================================================================

test("parse: simple code + qty", () => {
  const r = parseStructuredText("A1 50g");
  eq(r.status, "ok");
  eq(r.items.length, 1);
  eq(r.items[0].code, "A1");
  eq(r.items[0].qty, 50);
});

test("parse: 各 syntax", () => {
  const r = parseStructuredText("A1、A2、A3 各20g");
  eq(r.status, "ok");
  eq(r.items.length, 3);
  eq(r.items[0].qty, 20);
  eq(r.items[1].qty, 20);
  eq(r.items[2].qty, 20);
});

test("parse: 每 syntax", () => {
  const r = parseStructuredText("B1,B2 每50g");
  eq(r.status, "ok");
  eq(r.items.length, 2);
  eq(r.items[0].qty, 50);
});

test("parse: colon separator", () => {
  const r = parseStructuredText("A1:50g");
  eq(r.status, "ok");
  eq(r.items[0].qty, 50);
});

test("parse: equals separator", () => {
  const r = parseStructuredText("A1=100g");
  eq(r.status, "ok");
  eq(r.items[0].qty, 100);
});

test("parse: multiple pairs per line", () => {
  const r = parseStructuredText("A1 10g C21 20g H3 40g");
  eq(r.status, "ok");
  eq(r.items.length, 3);
  deepEq(r.items.map(i => i.code), ["A1", "C21", "H3"]);
});

test("parse: beads unit", () => {
  const r = parseStructuredText("A1 1000颗");
  eq(r.status, "ok");
  eq(r.items[0].qty, 10); // 1000颗 = 10g
});

test("parse: multiplication", () => {
  const r = parseStructuredText("A1 2*500颗");
  eq(r.status, "ok");
  eq(r.items[0].qty, 10); // 2*500 = 1000颗 = 10g
});

// =========================================================================
// parseStructuredText — user's real example
// =========================================================================

test("parse: user's full example (59 codes, 5 specs)", () => {
  const input = `A1、A9、A10、A11、A12、A15、A23、B11、B13、B15、B16、B31、B32、C1、C2、C5、C11、C14、D1、D2、D4、D9、D10、D11、D12、D14、D16、D17、D19、E12、E15、F2、F5、F6、F7、F8、F9、F10、F11、G1、G2、G3、G4、G5、G7、G8、G10、G12、G15、G16、G17、H3、H4、H5、H8、H10、H13、M1、M10各50g
A5、A8、B1、B2、B4、B5、B12、B19、C9、C13、C15、C17、D5、D8、D18、D20、D21、E3、E5、E6、E7、E9、E14、F1、F12、F13、G11、H12、M2、M3、M4、M5、M6、M7、M8、M11、M13、M14、M15、A4、A6、A14、B3、C3、F4、M9、C6各20g
H6 各100g
E11、E16、H1 各200g
H2、H7 各300g`;
  const r = parseStructuredText(input);
  eq(r.status, "ok");
  // count expected unique codes
  const expectedCodes = new Set();
  // line 1: 59 codes at 50g
  "A1,A9,A10,A11,A12,A15,A23,B11,B13,B15,B16,B31,B32,C1,C2,C5,C11,C14,D1,D2,D4,D9,D10,D11,D12,D14,D16,D17,D19,E12,E15,F2,F5,F6,F7,F8,F9,F10,F11,G1,G2,G3,G4,G5,G7,G8,G10,G12,G15,G16,G17,H3,H4,H5,H8,H10,H13,M1,M10".split(",").forEach(c => expectedCodes.add(c));
  // line 2: 47 codes at 20g
  "A5,A8,B1,B2,B4,B5,B12,B19,C9,C13,C15,C17,D5,D8,D18,D20,D21,E3,E5,E6,E7,E9,E14,F1,F12,F13,G11,H12,M2,M3,M4,M5,M6,M7,M8,M11,M13,M14,M15,A4,A6,A14,B3,C3,F4,M9,C6".split(",").forEach(c => expectedCodes.add(c));
  // line 3-5
  "H6,E11,E16,H1,H2,H7".split(",").forEach(c => expectedCodes.add(c));

  eq(r.items.length, expectedCodes.size, `expected ${expectedCodes.size} items, got ${r.items.length}`);

  const resultMap = {};
  r.items.forEach(i => { resultMap[i.code] = i.qty; });
  eq(resultMap["A1"], 50);
  eq(resultMap["A5"], 20);
  eq(resultMap["H6"], 100);
  eq(resultMap["E11"], 200);
  eq(resultMap["H2"], 300);
  eq(r.warning, "");
});

// =========================================================================
// parseStructuredText — merging & rounding & capping
// =========================================================================

test("parse: merge duplicate codes", () => {
  const r = parseStructuredText("A1 30g\nA1 20g");
  eq(r.items.length, 1);
  eq(r.items[0].qty, 50);
});

test("parse: round up to 10g", () => {
  const r = parseStructuredText("A1 15g");
  eq(r.items[0].qty, 20);
  eq(r.status, "ok"); // rounding is a safe adjustment
});

test("parse: cap at 5000g", () => {
  const r = parseStructuredText("A1 6000g");
  eq(r.items[0].qty, 5000);
});

// =========================================================================
// parseStructuredText — validation & status
// =========================================================================

test("parse: invalid code → needsReview", () => {
  const r = parseStructuredText("X99 50g");
  eq(r.status, "needsReview");
  eq(r.items.length, 0);
  assert(r.warning.includes("X99"));
});

test("parse: mixed valid + invalid → needsReview", () => {
  const r = parseStructuredText("A1 50g\nX99 20g");
  eq(r.status, "needsReview");
  eq(r.items.length, 1);
  eq(r.items[0].code, "A1");
});

test("parse: unparsed text → needsReview", () => {
  const r = parseStructuredText("A1 50g\n跟上次一样多来点");
  eq(r.status, "needsReview");
  eq(r.items.length, 1);
  assert(r.unparsedSegments.length > 0);
});

test("parse: ambiguous unit (no context) → needsReview", () => {
  const r = parseStructuredText("A1 50");
  eq(r.status, "needsReview");
  eq(r.items.length, 1);
  // defaults to grams when ambiguous
  eq(r.items[0].qty, 50);
});

test("parse: ambiguous unit resolved by context", () => {
  const r = parseStructuredText("A1 50g\nA2 30");
  eq(r.status, "ok");
  eq(r.items.length, 2);
  eq(r.items[1].qty, 30); // inherited 'g' from A1
});

test("parse: manualRecommended when mostly unparsable", () => {
  const r = parseStructuredText("请帮我配一套\n常用色各来点\n红色多一点\n跟上次一样");
  eq(r.status, "manualRecommended");
});

test("parse: empty input → needsReview", () => {
  const r = parseStructuredText("");
  eq(r.status, "needsReview");
  eq(r.items.length, 0);
});

// =========================================================================
// parseStructuredText — full-width & OCR
// =========================================================================

test("parse: full-width input", () => {
  const r = parseStructuredText("Ａ１、Ａ２ 各５０ｇ");
  eq(r.status, "ok");
  eq(r.items.length, 2);
  eq(r.items[0].qty, 50);
});

test("parse: Chinese punctuation mix", () => {
  const r = parseStructuredText("A1：50g；A2＝30g");
  eq(r.status, "ok");
  eq(r.items.length, 2);
});

// =========================================================================
// parseStructuredText — result consistency
// =========================================================================

test("parse: same input always returns same result", () => {
  const input = "A1、A2、A3 各50g\nB1 20g";
  const r1 = parseStructuredText(input);
  const r2 = parseStructuredText(input);
  deepEq(r1.items, r2.items);
  eq(r1.status, r2.status);
  eq(r1.warning, r2.warning);
});

// =========================================================================
// Summary
// =========================================================================

console.log(`\nText parser tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
